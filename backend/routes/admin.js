// routes/admin.js — Message Vault (ตามขอบเขตองค์กร) และคอนโซล Super admin
const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { db, audit, uniqueCode, AUDIO_DIR, FILES_DIR } = require('../db');
const A = require('../access');
const rt = require('../realtime');
const H = require('../http');
const { orgDto } = require('./orgs');
const { getSettings, updateSettings, setLogo, publicConfig } = require('../settings');

const router = express.Router();

// ---------- Message Vault ----------
// superadmin: ทุกอย่าง (กรอง orgId ได้, 0 = โลกสาธารณะ); เจ้าหน้าที่องค์กร: ช่องขององค์กร + แชท 1:1 ระหว่างคนในองค์กร
function vaultQuery(user, q) {
  const where = [];
  const args = [];
  const scope = A.staffScope(user);
  const orgFilter = scope === 'all' ? (q.orgId !== undefined && q.orgId !== '' ? Number(q.orgId) : null) : scope;
  if (orgFilter === 0) {
    where.push("c.org_id IS NULL AND c.type = 'channel'");
  } else if (orgFilter) {
    where.push(`(c.org_id = ? OR (c.type = 'direct' AND NOT EXISTS (
      SELECT 1 FROM channel_members cm JOIN users u ON u.id = cm.user_id
      WHERE cm.channel_id = c.id AND (u.org_id IS NOT ? OR u.org_status IS NOT 'active'))))`);
    args.push(orgFilter, orgFilter);
  }
  if (q.q) {
    where.push("(m.text LIKE ? ESCAPE '\\' OR m.transcript LIKE ? ESCAPE '\\' OR m.username LIKE ? ESCAPE '\\')");
    const like = `%${String(q.q).replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    args.push(like, like, like);
  }
  if (q.channelId) { where.push('m.channel_id = ?'); args.push(Number(q.channelId)); }
  if (q.userId) { where.push('m.user_id = ?'); args.push(Number(q.userId)); }
  if (q.kind) { where.push('m.kind = ?'); args.push(String(q.kind)); }
  if (q.from) { where.push('m.created_at >= ?'); args.push(Number(q.from)); }
  if (q.to) { where.push('m.created_at <= ?'); args.push(Number(q.to)); }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', args, orgId: typeof orgFilter === 'number' && orgFilter ? orgFilter : null };
}

const channelLabel = (r) => (r.channel_type === 'direct' ? 'แชทส่วนตัว' : r.org_name ? `${r.channel_name} · ${r.org_name}` : r.channel_name);
const VAULT_SELECT = `SELECT m.*, c.name AS channel_name, c.type AS channel_type, o.name AS org_name FROM messages m
  JOIN channels c ON c.id = m.channel_id LEFT JOIN orgs o ON o.id = c.org_id`;

router.get('/vault', H.auth, H.staffOnly, (req, res) => {
  const { sql, args } = vaultQuery(req.user, req.query);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const total = db.prepare(`SELECT COUNT(*) AS n FROM messages m JOIN channels c ON c.id = m.channel_id ${sql}`).get(...args).n;
  const rows = db.prepare(`${VAULT_SELECT} ${sql} ORDER BY m.id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  res.json({ total, messages: rows.map((r) => ({ ...A.messageDto(r), channelName: channelLabel(r) })) });
});

router.get('/vault/export.csv', H.auth, H.staffOnly, (req, res) => {
  const { sql, args, orgId } = vaultQuery(req.user, req.query);
  const rows = db.prepare(`${VAULT_SELECT} ${sql} ORDER BY m.id LIMIT 100000`).all(...args);
  const esc = (v) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`);
  const lines = ['id,time,organization,channel,user,kind,text,transcript,duration_sec,lat,lng'];
  for (const r of rows) {
    lines.push([r.id, new Date(r.created_at).toISOString(), r.org_name || '', r.channel_type === 'direct' ? 'direct' : r.channel_name, r.username, r.kind,
      r.text, r.transcript, r.duration_ms ? (r.duration_ms / 1000).toFixed(1) : '', r.lat, r.lng].map(esc).join(','));
  }
  audit(req.user, 'vault-export', { ...req.query, rows: rows.length }, req.ip, orgId || A.activeOrgId(req.user));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.attachment(`ptt-messages-${new Date().toISOString().slice(0, 10)}.csv`);
  res.send('﻿' + lines.join('\r\n'));
});

// ลบทุกข้อความที่ตรงกับตัวกรอง (เฉพาะ superadmin)
router.post('/vault/purge', H.auth, H.superOnly, (req, res) => {
  const filters = req.body || {};
  if (!filters.confirm) return res.status(400).json({ error: 'ต้องยืนยันก่อนลบ' });
  const { sql, args } = vaultQuery(req.user, filters);
  const rows = db.prepare(`SELECT m.id, m.channel_id, m.kind, m.file FROM messages m JOIN channels c ON c.id = m.channel_id ${sql}`).all(...args);
  const n = H.deleteMessages(rows);
  audit(req.user, 'vault-purge', { ...filters, deleted: n }, req.ip, null);
  res.json({ deleted: n });
});

// ---------- Super admin: ค่าตั้งของแอป ----------
router.get('/admin/settings', H.auth, H.superOnly, (req, res) => res.json({ settings: { ...getSettings(), logo: publicConfig().logo } }));

router.patch('/admin/settings', H.auth, H.superOnly, (req, res) => {
  const err = updateSettings(req.body);
  if (err) return res.status(400).json({ error: err });
  audit(req.user, 'app-settings', req.body, req.ip, null);
  rt.broadcastConfig(publicConfig());
  res.json({ settings: { ...getSettings(), logo: publicConfig().logo } });
});

router.post('/admin/settings/logo', H.auth, H.superOnly, H.avatarBody, (req, res) => {
  const file = H.saveAvatar(req, res, 'app');
  if (!file) return;
  H.removeAvatar(getSettings().logo);
  setLogo(file);
  audit(req.user, 'app-settings', { logo: true }, req.ip, null);
  rt.broadcastConfig(publicConfig());
  res.json({ settings: { ...getSettings(), logo: publicConfig().logo } });
});

router.delete('/admin/settings/logo', H.auth, H.superOnly, (req, res) => {
  H.removeAvatar(getSettings().logo);
  setLogo(null);
  rt.broadcastConfig(publicConfig());
  res.json({ settings: { ...getSettings(), logo: null } });
});

// ---------- Super admin: องค์กร ----------
router.get('/admin/orgs', H.auth, H.superOnly, (req, res) => {
  const orgs = db.prepare("SELECT * FROM orgs ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, id DESC").all();
  res.json({
    orgs: orgs.map((o) => {
      const creator = o.created_by && A.getUser(o.created_by);
      return { ...orgDto(o, true), createdBy: creator ? A.publicUser(creator) : null };
    }),
  });
});

router.patch('/admin/orgs/:id', H.auth, H.superOnly, (req, res) => {
  const org = A.getOrg(Number(req.params.id));
  if (!org) return res.status(404).json({ error: 'ไม่พบองค์กร' });
  const b = req.body || {};
  if (b.status !== undefined) {
    if (!['active', 'suspended', 'rejected', 'pending'].includes(b.status)) return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
    db.prepare('UPDATE orgs SET status = ?, approved_at = COALESCE(approved_at, CASE WHEN ? = \'active\' THEN ? END) WHERE id = ?').run(b.status, b.status, Date.now(), org.id);
  }
  if (b.name !== undefined && H.cleanText(b.name, 80)) db.prepare('UPDATE orgs SET name = ? WHERE id = ?').run(H.cleanText(b.name, 80), org.id);
  if (b.allowExternal !== undefined) db.prepare('UPDATE orgs SET allow_external = ? WHERE id = ?').run(b.allowExternal ? 1 : 0, org.id);
  audit(req.user, 'org-admin-update', { org: org.id, ...b }, req.ip, org.id);
  for (const u of db.prepare('SELECT id FROM users WHERE org_id = ?').all(org.id)) {
    if (b.status === 'active') H.joinDefaultChannels(u.id);
    rt.refreshUser(u.id);
    rt.broadcastUser(u.id);
  }
  rt.scheduleChannels();
  res.json({ ok: true });
});

router.delete('/admin/orgs/:id', H.auth, H.superOnly, (req, res) => {
  const org = A.getOrg(Number(req.params.id));
  if (!org) return res.status(404).json({ error: 'ไม่พบองค์กร' });
  const users = db.prepare('SELECT id FROM users WHERE org_id = ?').all(org.id).map((r) => r.id);
  const channels = db.prepare('SELECT id FROM channels WHERE org_id = ?').all(org.id).map((r) => r.id);
  const files = db.prepare('SELECT m.kind, m.file FROM messages m JOIN channels c ON c.id = m.channel_id WHERE c.org_id = ? AND m.file IS NOT NULL').all(org.id);
  const avatars = db.prepare('SELECT avatar FROM channels WHERE org_id = ? AND avatar IS NOT NULL').all(org.id);
  db.transaction(() => {
    db.prepare("UPDATE users SET org_id = NULL, org_status = NULL, org_role = 'member' WHERE org_id = ?").run(org.id);
    db.prepare('DELETE FROM orgs WHERE id = ?').run(org.id);
  })();
  H.removeAvatar(org.avatar);
  avatars.forEach((c) => H.removeAvatar(c.avatar));
  files.forEach((f) => fs.rm(path.join(f.kind === 'audio' ? AUDIO_DIR : FILES_DIR, f.file), { force: true }, () => {}));
  channels.forEach((id) => rt.closeChannel(id));
  audit(req.user, 'org-delete', { org: org.id, name: org.name }, req.ip, null);
  users.forEach((id) => { H.joinDefaultChannels(id); rt.refreshUser(id); rt.broadcastUser(id); });
  rt.scheduleChannels();
  res.json({ ok: true });
});

// ---------- Super admin: ผู้ใช้ทั้งหมด ----------
router.get('/admin/users', H.auth, H.superOnly, (req, res) => {
  const online = rt.onlineMap();
  const users = db.prepare('SELECT u.*, o.name AS org_name FROM users u LEFT JOIN orgs o ON o.id = u.org_id ORDER BY u.id').all();
  res.json({
    users: users.map((u) => ({
      ...A.publicUser(u), disabled: !!u.disabled, createdAt: u.created_at, lastSeen: u.last_seen, online: !!online[u.id],
      org: u.org_id ? { id: u.org_id, name: u.org_name, status: u.org_status, role: u.org_role } : null,
    })),
  });
});

router.post('/admin/users', H.auth, H.superOnly, (req, res) => {
  const { username, password, role, orgId, orgRole } = req.body || {};
  if (!H.validUsername(username)) return res.status(400).json({ error: 'ชื่อผู้ใช้ต้องยาว 3-32 ตัว' });
  if (!H.validPassword(password)) return res.status(400).json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัว' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });
  const org = orgId ? A.getOrg(Number(orgId)) : null;
  const info = db.prepare('INSERT INTO users (username, password_hash, role, friend_code, org_id, org_status, org_role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(username, bcrypt.hashSync(password, 10), role === 'superadmin' ? 'superadmin' : 'user', uniqueCode('users', 'friend_code'),
      org ? org.id : null, org ? 'active' : null, ['admin', 'dispatcher', 'member'].includes(orgRole) ? orgRole : 'member', Date.now());
  H.joinDefaultChannels(info.lastInsertRowid);
  audit(req.user, 'user-create', { id: info.lastInsertRowid, username, org: org && org.id }, req.ip, org ? org.id : null);
  res.json({ user: A.publicUser(A.getUser(info.lastInsertRowid)) });
});

router.patch('/admin/users/:id', H.auth, H.superOnly, (req, res) => {
  const id = Number(req.params.id);
  const target = A.getUser(id);
  if (!target) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  const b = req.body || {};
  if (id === req.user.id && (b.role !== undefined || b.disabled !== undefined)) return res.status(400).json({ error: 'เปลี่ยนสิทธิ์หรือระงับบัญชีตัวเองไม่ได้' });
  if (b.role !== undefined) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(b.role === 'superadmin' ? 'superadmin' : 'user', id);
  if (b.disabled !== undefined) db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(b.disabled ? 1 : 0, id);
  if (b.password !== undefined) {
    if (!H.validPassword(b.password)) return res.status(400).json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัว' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(b.password, 10), id);
  }
  // ย้าย/กำหนดองค์กร (null = ถอดออกจากองค์กร)
  const sameOrg = b.orgId && Number(b.orgId) === target.org_id && target.org_status === 'active';
  if (b.orgId !== undefined && !sameOrg) {
    if (target.org_id) H.detachFromOrg(id, target.org_id);
    if (b.orgId) {
      const org = A.getOrg(Number(b.orgId));
      if (!org) return res.status(404).json({ error: 'ไม่พบองค์กร' });
      db.prepare("UPDATE users SET org_id = ?, org_status = 'active', org_role = ? WHERE id = ?")
        .run(org.id, ['admin', 'dispatcher', 'member'].includes(b.orgRole) ? b.orgRole : 'member', id);
    }
    H.joinDefaultChannels(id);
  } else if (b.orgRole !== undefined && ['admin', 'dispatcher', 'member'].includes(b.orgRole) && target.org_id) {
    db.prepare('UPDATE users SET org_role = ? WHERE id = ?').run(b.orgRole, id);
  }
  audit(req.user, 'user-update', { id, role: b.role, disabled: b.disabled, orgId: b.orgId, orgRole: b.orgRole, passwordReset: b.password !== undefined }, req.ip, target.org_id);
  rt.refreshUser(id);
  rt.broadcastUser(id);
  rt.scheduleChannels();
  res.json({ ok: true });
});

router.delete('/admin/users/:id', H.auth, H.superOnly, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'ลบบัญชีตัวเองไม่ได้' });
  const target = A.getUser(id);
  if (!target) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  rt.kickUser(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  // แชท 1:1 ที่เหลือคนเดียวและไม่มีข้อความ → ลบทิ้ง
  db.prepare("DELETE FROM channels WHERE type = 'direct' AND (SELECT COUNT(*) FROM channel_members WHERE channel_id = channels.id) < 2 AND NOT EXISTS (SELECT 1 FROM messages WHERE channel_id = channels.id)").run();
  H.removeAvatar(target.avatar);
  audit(req.user, 'user-delete', { id, username: target.username }, req.ip, target.org_id);
  rt.scheduleChannels();
  res.json({ ok: true });
});

router.get('/admin/audit', H.auth, H.superOnly, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const orgId = req.query.orgId !== undefined && req.query.orgId !== '' ? Number(req.query.orgId) : undefined;
  const rows = orgId === undefined
    ? db.prepare('SELECT a.*, o.name AS org_name FROM audit_log a LEFT JOIN orgs o ON o.id = a.org_id ORDER BY a.id DESC LIMIT ?').all(limit)
    : db.prepare('SELECT a.*, o.name AS org_name FROM audit_log a LEFT JOIN orgs o ON o.id = a.org_id WHERE a.org_id IS ? ORDER BY a.id DESC LIMIT ?').all(orgId || null, limit);
  res.json({ entries: rows.map((r) => ({ id: r.id, username: r.username, action: r.action, detail: r.detail, ip: r.ip, orgName: r.org_name, createdAt: r.created_at })) });
});

router.get('/admin/stats', H.auth, H.superOnly, (req, res) => {
  const dayAgo = Date.now() - 86400000;
  res.json({
    users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    online: Object.keys(rt.onlineMap()).length,
    orgs: db.prepare("SELECT COUNT(*) AS n FROM orgs WHERE status = 'active'").get().n,
    pendingOrgs: db.prepare("SELECT COUNT(*) AS n FROM orgs WHERE status = 'pending'").get().n,
    channels: db.prepare("SELECT COUNT(*) AS n FROM channels WHERE type = 'channel'").get().n,
    messages24h: db.prepare('SELECT COUNT(*) AS n FROM messages WHERE created_at >= ?').get(dayAgo).n,
    openAlerts: db.prepare('SELECT COUNT(*) AS n FROM alerts WHERE resolved_at IS NULL').get().n,
  });
});

module.exports = { router };
