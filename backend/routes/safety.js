// routes/safety.js — ตำแหน่ง/เส้นทาง และ SOS (แยกตามองค์กร)
const express = require('express');
const { db, audit } = require('../db');
const A = require('../access');
const rt = require('../realtime');
const H = require('../http');

const router = express.Router();

router.get('/locations', H.auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM users WHERE loc_lat IS NOT NULL AND disabled = 0').all();
  res.json({ locations: rows.filter((u) => A.canSeeLocation(req.user, u)).map(A.locationDto) });
});

router.get('/users/:id/track', H.auth, (req, res) => {
  const target = A.getUser(Number(req.params.id));
  if (!A.canSeeLocation(req.user, target)) return res.status(403).json({ error: 'ไม่มีสิทธิ์ดูเส้นทางของผู้ใช้นี้' });
  const since = Number(req.query.since) || Date.now() - 24 * 3600 * 1000;
  const points = db.prepare('SELECT lat, lng, speed, battery, created_at AS at FROM locations WHERE user_id = ? AND created_at >= ? ORDER BY created_at LIMIT 5000').all(target.id, since);
  res.json({ points });
});

const alertDto = (a) => ({
  id: a.id, userId: a.user_id, username: a.username, channelId: a.channel_id, orgId: a.org_id, lat: a.lat, lng: a.lng, note: a.note,
  createdAt: a.created_at, ackedBy: a.acked_by, ackedAt: a.acked_at, resolvedBy: a.resolved_by, resolvedAt: a.resolved_at,
});

function canSeeAlert(user, a) {
  if (A.isSuper(user) || a.user_id === user.id) return true;
  if (a.org_id && A.isOrgStaff(user, a.org_id)) return true;
  // สมาชิกช่องฉุกเฉินเห็นเฉพาะเหตุที่เกิดหลังเข้าร่วม
  const m = a.channel_id && A.membership(a.channel_id, user.id);
  return !!m && a.created_at >= m.joined_at;
}

// SOS → ช่องฉุกเฉินขององค์กร (ถ้าเป็นสมาชิกที่ใช้งานอยู่) ไม่เช่นนั้นช่องฉุกเฉินสาธารณะ
router.post('/sos', H.auth, (req, res) => {
  const b = req.body || {};
  const lat = b.lat != null && Math.abs(Number(b.lat)) <= 90 ? Number(b.lat) : null;
  const lng = b.lng != null && Math.abs(Number(b.lng)) <= 180 ? Number(b.lng) : null;
  const note = H.cleanText(b.note, 300) || null;
  const orgId = A.activeOrgId(req.user);
  const ch = orgId
    ? db.prepare('SELECT * FROM channels WHERE emergency = 1 AND org_id = ? ORDER BY id LIMIT 1').get(orgId)
    : db.prepare('SELECT * FROM channels WHERE emergency = 1 AND org_id IS NULL ORDER BY id LIMIT 1').get();
  const now = Date.now();
  if (ch) {
    // ผู้แจ้งต้องพูดในช่องฉุกเฉินได้
    db.prepare("INSERT OR IGNORE INTO channel_members (channel_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(ch.id, req.user.id, now);
    db.prepare("UPDATE channel_members SET role = 'member' WHERE channel_id = ? AND user_id = ? AND role = 'listener'").run(ch.id, req.user.id);
  }
  const info = db.prepare('INSERT INTO alerts (user_id, username, channel_id, org_id, lat, lng, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, H.displayName(req.user), ch ? ch.id : null, orgId, lat, lng, note, now);
  const alert = alertDto(db.prepare('SELECT * FROM alerts WHERE id = ?').get(info.lastInsertRowid));
  if (ch) rt.addMessage({ channel_id: ch.id, user_id: req.user.id, username: H.displayName(req.user), kind: 'sos', text: note, lat, lng });
  audit(req.user, 'sos', { alert: alert.id, lat, lng }, req.ip, orgId);
  rt.broadcastAlert(alert, ch && ch.id);
  res.json({ alert, channelId: ch ? ch.id : null });
});

router.get('/alerts', H.auth, (req, res) => {
  const open = req.query.open === '1';
  const rows = db.prepare(`SELECT * FROM alerts ${open ? 'WHERE resolved_at IS NULL' : ''} ORDER BY id DESC LIMIT 500`).all();
  res.json({ alerts: rows.filter((a) => canSeeAlert(req.user, a)).slice(0, 200).map(alertDto) });
});

router.post('/alerts/:id/:action(ack|resolve)', H.auth, (req, res) => {
  const a = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
  if (!a || !canSeeAlert(req.user, a)) return res.status(404).json({ error: 'ไม่พบการแจ้งเหตุ' });
  const now = Date.now();
  const who = H.displayName(req.user);
  if (req.params.action === 'ack') {
    db.prepare('UPDATE alerts SET acked_by = COALESCE(acked_by, ?), acked_at = COALESCE(acked_at, ?) WHERE id = ?').run(who, now, a.id);
  } else {
    db.prepare('UPDATE alerts SET acked_by = COALESCE(acked_by, ?), acked_at = COALESCE(acked_at, ?), resolved_by = ?, resolved_at = ? WHERE id = ?').run(who, now, who, now, a.id);
  }
  audit(req.user, `sos-${req.params.action}`, { alert: a.id }, req.ip, a.org_id);
  const alert = alertDto(db.prepare('SELECT * FROM alerts WHERE id = ?').get(a.id));
  rt.broadcastAlert(alert, a.channel_id);
  res.json({ alert });
});

module.exports = { router };
