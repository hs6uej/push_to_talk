// routes/channels.js — ช่อง (องค์กร/สาธารณะ), สมาชิก, ลิงก์เชิญ, แชท 1:1, ข้อความ, รูป
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, audit, createChannel, uniqueCode, AUDIO_DIR, FILES_DIR } = require('../db');
const A = require('../access');
const rt = require('../realtime');
const H = require('../http');

const router = express.Router();
const MEMBER_ROLES = ['owner', 'moderator', 'member', 'listener'];
const addMember = db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)');

// แชร์ลิงก์เชิญได้: ผู้ดูแลช่อง หรือสมาชิกของช่องสาธารณะ/ช่องเปิดขององค์กร
function canShareInvite(user, ch) {
  if (ch.type !== 'channel') return false;
  if (A.canManage(user, ch)) return true;
  return !!A.membership(ch.id, user.id) && (ch.org_id ? ch.visibility === 'org' : ch.visibility === 'public');
}

// ---------- ช่อง ----------
router.get('/channels', H.auth, (req, res) => res.json({ channels: rt.channelsForUser(req.user) }));

router.post('/channels', H.auth, (req, res) => {
  const b = req.body || {};
  const name = H.cleanText(b.name, 60);
  if (!name) return res.status(400).json({ error: 'กรุณาตั้งชื่อช่อง' });
  let orgId = null;
  let visibility;
  if (b.scope === 'org') {
    orgId = A.isSuper(req.user) && b.orgId ? Number(b.orgId) : A.activeOrgId(req.user);
    if (!orgId || !A.orgActive(orgId)) return res.status(403).json({ error: 'คุณยังไม่ได้เป็นสมาชิกองค์กรที่เปิดใช้งาน' });
    visibility = b.visibility === 'private' ? 'private' : 'org';
  } else {
    if (!A.hasExternal(req.user)) return res.status(403).json({ error: 'องค์กรของคุณไม่อนุญาตให้สร้างกลุ่มสาธารณะ' });
    visibility = b.visibility === 'private' ? 'private' : 'public';
  }
  const id = db.transaction(() => {
    const cid = createChannel({ name, description: H.cleanText(b.description, 300), visibility, orgId, createdBy: req.user.id });
    addMember.run(cid, req.user.id, 'owner', Date.now());
    return cid;
  })();
  audit(req.user, 'channel-create', { id, name, visibility, orgId }, req.ip, orgId);
  rt.scheduleChannels();
  res.json({ id });
});

router.get('/channels/:id', H.auth, (req, res) => {
  const ch = H.loadChannel(req, res);
  if (!ch) return;
  const online = rt.onlineMap();
  const members = db.prepare(`SELECT u.*, m.role AS member_role FROM channel_members m JOIN users u ON u.id = m.user_id
    WHERE m.channel_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 WHEN 'member' THEN 2 ELSE 3 END,
    COALESCE(u.display_name, u.username) COLLATE NOCASE`).all(ch.id);
  const canManage = A.canManage(req.user, ch);
  const org = A.getOrg(ch.org_id);
  const requests = canManage
    ? db.prepare(`SELECT u.*, r.id AS request_id, r.created_at AS requested_at FROM join_requests r JOIN users u ON u.id = r.user_id
        WHERE r.kind = 'channel' AND r.channel_id = ? AND r.status = 'pending' ORDER BY r.id`).all(ch.id)
        .map((r) => ({ id: r.request_id, createdAt: r.requested_at, user: A.publicUser(r) }))
    : [];
  res.json({
    channel: {
      id: ch.id, name: ch.name, description: ch.description, type: ch.type, visibility: ch.visibility, emergency: !!ch.emergency,
      createdAt: ch.created_at, avatar: A.avatarUrl(ch.avatar), orgId: ch.org_id, orgName: org ? org.name : null, isDefault: !!ch.is_default,
    },
    canManage,
    canTalk: A.canTalk(req.user, ch),
    isOrgAdmin: !!ch.org_id && A.isOrgAdmin(req.user, ch.org_id),
    inviteCode: canShareInvite(req.user, ch) ? ch.invite_code : null,
    requests,
    members: members.map((u) => ({ ...A.publicUser(u), memberRole: u.member_role, online: !!online[u.id] })),
  });
});

router.patch('/channels/:id', H.auth, (req, res) => {
  const ch = H.loadChannel(req, res);
  if (!ch) return;
  if (!A.canManage(req.user, ch)) return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขช่องนี้' });
  const b = req.body || {};
  const orgAdmin = ch.org_id ? A.isOrgAdmin(req.user, ch.org_id) : A.isSuper(req.user);
  if (b.name !== undefined) {
    const name = H.cleanText(b.name, 60);
    if (!name) return res.status(400).json({ error: 'กรุณาตั้งชื่อช่อง' });
    db.prepare('UPDATE channels SET name = ? WHERE id = ?').run(name, ch.id);
  }
  if (b.description !== undefined) db.prepare('UPDATE channels SET description = ? WHERE id = ?').run(H.cleanText(b.description, 300), ch.id);
  if (b.visibility !== undefined) {
    const v = b.visibility === 'private' ? 'private' : ch.org_id ? 'org' : 'public';
    db.prepare('UPDATE channels SET visibility = ? WHERE id = ?').run(v, ch.id);
  }
  if (b.emergency !== undefined || b.isDefault !== undefined) {
    if (!orgAdmin) return res.status(403).json({ error: ch.org_id ? 'เฉพาะแอดมินองค์กรตั้งค่านี้ได้' : 'เฉพาะ Super admin ตั้งค่านี้ได้' });
    if (b.emergency !== undefined) db.prepare('UPDATE channels SET emergency = ? WHERE id = ?').run(b.emergency ? 1 : 0, ch.id);
    if (b.isDefault !== undefined) {
      db.prepare('UPDATE channels SET is_default = ? WHERE id = ?').run(b.isDefault ? 1 : 0, ch.id);
      // ตั้งเป็นห้องรวม → เพิ่มสมาชิกองค์กรทุกคนเข้าไปเลย
      if (b.isDefault && ch.org_id) {
        for (const u of db.prepare("SELECT id FROM users WHERE org_id = ? AND org_status = 'active'").all(ch.org_id)) addMember.run(ch.id, u.id, 'member', Date.now());
      }
    }
  }
  audit(req.user, 'channel-update', { id: ch.id, ...b }, req.ip, ch.org_id);
  rt.scheduleChannels();
  res.json({ ok: true });
});

router.delete('/channels/:id', H.auth, (req, res) => {
  const ch = H.loadChannel(req, res);
  if (!ch) return;
  const m = A.membership(ch.id, req.user.id);
  const allowed = A.isSuper(req.user) || (ch.org_id && A.isOrgAdmin(req.user, ch.org_id)) || (m && m.role === 'owner');
  if (!allowed) return res.status(403).json({ error: 'เฉพาะเจ้าของช่องหรือผู้ดูแลลบได้' });
  const files = db.prepare('SELECT kind, file FROM messages WHERE channel_id = ? AND file IS NOT NULL').all(ch.id);
  db.prepare('DELETE FROM channels WHERE id = ?').run(ch.id);
  H.removeAvatar(ch.avatar);
  files.forEach((f) => fs.rm(path.join(f.kind === 'audio' ? AUDIO_DIR : FILES_DIR, f.file), { force: true }, () => {}));
  audit(req.user, 'channel-delete', { id: ch.id, name: ch.name }, req.ip, ch.org_id);
  rt.closeChannel(ch.id);
  res.json({ ok: true });
});

router.post('/channels/:id/invite/reset', H.auth, (req, res) => {
  const ch = H.loadChannel(req, res);
  if (!ch) return;
  if (!A.canManage(req.user, ch)) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
  const code = uniqueCode('channels', 'invite_code');
  db.prepare('UPDATE channels SET invite_code = ? WHERE id = ?').run(code, ch.id);
  audit(req.user, 'channel-invite-reset', { id: ch.id }, req.ip, ch.org_id);
  res.json({ inviteCode: code });
});

router.post('/channels/:id/avatar', H.auth, H.avatarBody, (req, res) => {
  const ch = H.loadChannel(req, res);
  if (!ch) return;
  if (!A.canManage(req.user, ch)) return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขช่องนี้' });
  const file = H.saveAvatar(req, res, `c${ch.id}`);
  if (!file) return;
  H.removeAvatar(ch.avatar);
  db.prepare('UPDATE channels SET avatar = ? WHERE id = ?').run(file, ch.id);
  rt.scheduleChannels();
  res.json({ ok: true });
});

router.delete('/channels/:id/avatar', H.auth, (req, res) => {
  const ch = H.loadChannel(req, res);
  if (!ch) return;
  if (!A.canManage(req.user, ch)) return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขช่องนี้' });
  H.removeAvatar(ch.avatar);
  db.prepare('UPDATE channels SET avatar = NULL WHERE id = ?').run(ch.id);
  rt.scheduleChannels();
  res.json({ ok: true });
});

router.post('/channels/:id/join', H.auth, (req, res) => {
  const ch = H.loadChannel(req, res);
  if (!ch) return;
  const mode = A.joinMode(req.user, ch, false);
  if (!mode) return res.status(403).json({ error: 'ช่องส่วนตัว ต้องใช้ลิงก์เชิญหรือให้ผู้ดูแลช่องเพิ่มให้' });
  if (mode === 'request') {
    H.createChannelRequest(ch, req.user, req.ip);
    return res.json({ status: 'pending' });
  }
  addMember.run(ch.id, req.user.id, 'member', Date.now());
  rt.scheduleChannels();
  res.json({ status: 'member' });
});

router.post('/channels/:id/leave', H.auth, (req, res) => {
  const ch = H.loadChannel(req, res);
  if (!ch) return;
  db.prepare('DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?').run(ch.id, req.user.id);
  rt.scheduleChannels();
  res.json({ ok: true });
});

router.post('/channels/:id/members', H.auth, (req, res) => {
  const ch = H.loadChannel(req, res);
  if (!ch) return;
  if (!A.canManage(req.user, ch)) return res.status(403).json({ error: 'ไม่มีสิทธิ์จัดการสมาชิก' });
  const target = db.prepare('SELECT * FROM users WHERE username = ? OR id = ?').get(String(req.body?.username || ''), Number(req.body?.userId) || -1);
  if (!target || target.disabled) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  if (ch.org_id ? A.activeOrgId(target) !== ch.org_id : !A.hasExternal(target) || !A.canSeeUser(req.user, target)) {
    return res.status(403).json({ error: ch.org_id ? 'เพิ่มได้เฉพาะสมาชิกขององค์กรนี้' : 'ผู้ใช้นี้เข้ากลุ่มสาธารณะไม่ได้' });
  }
  const role = MEMBER_ROLES.includes(req.body?.role) && req.body.role !== 'owner' ? req.body.role : 'member';
  addMember.run(ch.id, target.id, role, Date.now());
  db.prepare("UPDATE join_requests SET status = 'approved', decided_by = ?, decided_at = ? WHERE kind = 'channel' AND channel_id = ? AND user_id = ? AND status = 'pending'")
    .run(H.displayName(req.user), Date.now(), ch.id, target.id);
  audit(req.user, 'member-add', { channel: ch.id, user: target.username, role }, req.ip, ch.org_id);
  rt.scheduleChannels();
  res.json({ ok: true });
});

router.patch('/channels/:id/members/:uid', H.auth, (req, res) => {
  const ch = H.loadChannel(req, res);
  if (!ch) return;
  if (!A.canManage(req.user, ch)) return res.status(403).json({ error: 'ไม่มีสิทธิ์จัดการสมาชิก' });
  const role = req.body?.role;
  if (!MEMBER_ROLES.includes(role)) return res.status(400).json({ error: 'บทบาทไม่ถูกต้อง' });
  const target = A.membership(ch.id, Number(req.params.uid));
  if (!target) return res.status(404).json({ error: 'ไม่ใช่สมาชิกช่องนี้' });
  const mine = A.membership(ch.id, req.user.id);
  const elevated = A.isSuper(req.user) || (ch.org_id && A.isOrgAdmin(req.user, ch.org_id)) || (mine && mine.role === 'owner');
  if ((role === 'owner' || target.role === 'owner') && !elevated) return res.status(403).json({ error: 'เฉพาะเจ้าของช่องเปลี่ยนสิทธิ์เจ้าของได้' });
  db.prepare('UPDATE channel_members SET role = ? WHERE channel_id = ? AND user_id = ?').run(role, ch.id, target.user_id);
  audit(req.user, 'member-role', { channel: ch.id, user: target.user_id, role }, req.ip, ch.org_id);
  rt.scheduleChannels();
  res.json({ ok: true });
});

router.delete('/channels/:id/members/:uid', H.auth, (req, res) => {
  const ch = H.loadChannel(req, res);
  if (!ch) return;
  const uid = Number(req.params.uid);
  if (uid !== req.user.id && !A.canManage(req.user, ch)) return res.status(403).json({ error: 'ไม่มีสิทธิ์จัดการสมาชิก' });
  const target = A.membership(ch.id, uid);
  const elevated = A.isSuper(req.user) || (ch.org_id && A.isOrgAdmin(req.user, ch.org_id));
  if (target && target.role === 'owner' && !elevated && uid !== req.user.id) return res.status(403).json({ error: 'ลบเจ้าของช่องไม่ได้' });
  db.prepare('DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?').run(ch.id, uid);
  audit(req.user, 'member-remove', { channel: ch.id, user: uid }, req.ip, ch.org_id);
  rt.scheduleChannels();
  res.json({ ok: true });
});

router.post('/channels/:id/read', H.auth, (req, res) => {
  const lastId = Number(req.body?.lastId) || 0;
  db.prepare('UPDATE channel_members SET last_read_id = MAX(last_read_id, ?) WHERE channel_id = ? AND user_id = ?').run(lastId, Number(req.params.id), req.user.id);
  rt.scheduleChannels([req.user.id]);
  res.json({ ok: true });
});

// แชท 1:1 — คุยได้กับทุกคนที่มองเห็นได้ (ตามนโยบายองค์กร)
router.post('/direct/:userId', H.auth, (req, res) => {
  const other = A.getUser(Number(req.params.userId));
  if (!other || other.id === req.user.id || !A.canSeeUser(req.user, other)) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  const key = [req.user.id, other.id].sort((a, b) => a - b).join(':');
  let ch = db.prepare('SELECT * FROM channels WHERE direct_key = ?').get(key);
  if (!ch) {
    const now = Date.now();
    db.transaction(() => {
      const info = db.prepare("INSERT INTO channels (name, type, visibility, direct_key, created_by, created_at) VALUES ('', 'direct', 'private', ?, ?, ?)").run(key, req.user.id, now);
      addMember.run(info.lastInsertRowid, req.user.id, 'member', now);
      addMember.run(info.lastInsertRowid, other.id, 'member', now);
      ch = { id: info.lastInsertRowid };
    })();
    rt.scheduleChannels([req.user.id, other.id]);
  } else {
    // อีกฝ่ายอาจเคยถูกลบออก
    addMember.run(ch.id, req.user.id, 'member', Date.now());
    addMember.run(ch.id, other.id, 'member', Date.now());
  }
  res.json({ id: ch.id });
});

// ---------- ข้อความ ----------
router.get('/channels/:id/messages', H.auth, (req, res) => {
  const ch = H.loadChannel(req, res);
  if (!ch) return;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const from = A.historyFrom(req.user, ch);
  if (from === Infinity) return res.json({ messages: [], hasMore: false, historyFrom: -1 });
  const rows = db.prepare('SELECT * FROM messages WHERE channel_id = ? AND id < ? AND created_at >= ? ORDER BY id DESC LIMIT ?').all(ch.id, before, from, limit);
  res.json({ messages: rows.reverse().map(A.messageDto), hasMore: rows.length === limit, historyFrom: from });
});

router.post('/channels/:id/messages', H.auth, (req, res) => {
  const ch = H.loadChannel(req, res);
  if (!ch) return;
  if (!A.canTalk(req.user, ch)) return res.status(403).json({ error: 'ไม่มีสิทธิ์ส่งข้อความในช่องนี้' });
  const b = req.body || {};
  const base = { channel_id: ch.id, user_id: req.user.id, username: H.displayName(req.user) };
  if (b.kind === 'location') {
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return res.status(400).json({ error: 'พิกัดไม่ถูกต้อง' });
    return res.json({ message: rt.addMessage({ ...base, kind: 'location', lat, lng, text: H.cleanText(b.text, 200) || null }) });
  }
  const text = H.cleanText(b.text, 4000);
  if (!text) return res.status(400).json({ error: 'ข้อความว่าง' });
  res.json({ message: rt.addMessage({ ...base, kind: 'text', text }) });
});

router.post('/channels/:id/images', H.auth, express.raw({ type: Object.keys(H.IMAGE_TYPES), limit: H.MAX_IMAGE_BYTES }), (req, res) => {
  const ch = H.loadChannel(req, res);
  if (!ch) return;
  if (!A.canTalk(req.user, ch)) return res.status(403).json({ error: 'ไม่มีสิทธิ์ส่งรูปในช่องนี้' });
  const ext = H.IMAGE_TYPES[req.headers['content-type']];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'รองรับเฉพาะรูป JPG/PNG/WEBP/GIF ไม่เกิน 8MB' });
  const file = `${ch.id}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(FILES_DIR, file), req.body);
  const text = H.cleanText(req.query.caption, 500) || null;
  res.json({ message: rt.addMessage({ channel_id: ch.id, user_id: req.user.id, username: H.displayName(req.user), kind: 'image', file, text }) });
});

router.get('/messages/:id/file', H.auth, (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!m || !m.file || !A.canSeeMessage(req.user, m)) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=86400');
  if (req.query.download) res.attachment(m.file);
  res.sendFile(path.join(m.kind === 'audio' ? AUDIO_DIR : FILES_DIR, m.file));
});

// ล้างข้อความทั้งช่อง หรือเฉพาะที่เก่ากว่าเวลาที่กำหนด (superadmin / แอดมินองค์กร)
router.post('/channels/:id/purge', H.auth, (req, res) => {
  const ch = H.loadChannel(req, res);
  if (!ch) return;
  if (!A.canPurge(req.user, ch)) return res.status(403).json({ error: 'เฉพาะ Super admin หรือแอดมินองค์กรล้างข้อความได้' });
  const before = Number(req.body?.before) || Number.MAX_SAFE_INTEGER;
  const rows = db.prepare('SELECT id, channel_id, kind, file FROM messages WHERE channel_id = ? AND created_at < ?').all(ch.id, before);
  const n = H.deleteMessages(rows);
  if (req.body?.alerts && ch.emergency) db.prepare('DELETE FROM alerts WHERE channel_id = ? AND resolved_at IS NOT NULL AND created_at < ?').run(ch.id, before);
  audit(req.user, 'channel-purge', { channel: ch.id, name: ch.name, before: req.body?.before || null, deleted: n }, req.ip, ch.org_id);
  res.json({ deleted: n });
});

// ลบหลายข้อความที่เลือก — ลบได้เฉพาะรายการที่มีสิทธิ์ (ของตัวเอง/ผู้ดูแลช่อง/แอดมิน)
router.post('/messages/delete', H.auth, (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean).slice(0, 1000);
  if (!ids.length) return res.status(400).json({ error: 'ไม่ได้เลือกข้อความ' });
  const rows = db.prepare('SELECT * FROM messages WHERE id IN (SELECT value FROM json_each(?))').all(JSON.stringify(ids));
  const allowed = rows.filter((m) => {
    const ch = A.getChannel(m.channel_id);
    return A.canPurge(req.user, ch) || (A.canView(req.user, ch) && (m.user_id === req.user.id || A.canManage(req.user, ch)));
  });
  const n = H.deleteMessages(allowed);
  audit(req.user, 'message-bulk-delete', { requested: ids.length, deleted: n }, req.ip);
  res.json({ deleted: n, skipped: ids.length - n });
});

router.delete('/messages/:id', H.auth, (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'ไม่พบข้อความ' });
  const ch = A.getChannel(m.channel_id);
  if (!A.canView(req.user, ch)) return res.status(404).json({ error: 'ไม่พบข้อความ' });
  if (m.user_id !== req.user.id && !A.canManage(req.user, ch)) return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบข้อความนี้' });
  db.prepare('DELETE FROM messages WHERE id = ?').run(m.id);
  if (m.file) fs.rm(path.join(m.kind === 'audio' ? AUDIO_DIR : FILES_DIR, m.file), { force: true }, () => {});
  audit(req.user, 'message-delete', { id: m.id, channel: m.channel_id, kind: m.kind }, req.ip, ch.org_id);
  rt.sendToChannel(m.channel_id, { type: 'message-delete', channelId: m.channel_id, messageId: m.id });
  rt.scheduleChannels();
  res.json({ ok: true });
});

module.exports = { router };
