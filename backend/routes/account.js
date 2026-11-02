// routes/account.js — สมัคร/เข้าสู่ระบบ, โปรไฟล์, สมุดรายชื่อ, เพื่อน, ลิงก์เชิญ/QR
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db, audit, createChannel, uniqueCode, AVATAR_DIR } = require('../db');
const A = require('../access');
const rt = require('../realtime');
const H = require('../http');

const router = express.Router();
const { getSettings, publicConfig } = require('../settings');

// จำกัดการเดารหัสผ่าน: 10 ครั้ง / 5 นาที / IP
const loginAttempts = new Map();
function loginLimited(ip) {
  const now = Date.now();
  const e = loginAttempts.get(ip) || { n: 0, reset: now + 5 * 60000 };
  if (now > e.reset) { e.n = 0; e.reset = now + 5 * 60000; }
  e.n++;
  loginAttempts.set(ip, e);
  return e.n > 10;
}

// ---------- องค์กร: ขอเข้า / ขอเปิด (ใช้ทั้งตอนสมัครและภายหลัง) ----------
function requestJoinOrg(user, code, ip) {
  const org = db.prepare('SELECT * FROM orgs WHERE code = ?').get(String(code || '').trim().toUpperCase());
  if (!org || org.status !== 'active') throw Object.assign(new Error('ไม่พบองค์กร หรือองค์กรยังไม่เปิดใช้งาน'), { status: 404 });
  if (user.org_id && user.org_id !== org.id && user.org_status === 'active') {
    throw Object.assign(new Error('คุณเป็นสมาชิกองค์กรอื่นอยู่แล้ว ต้องออกจากองค์กรเดิมก่อน'), { status: 409 });
  }
  if (user.org_id === org.id && user.org_status === 'active') return org;
  if (user.org_id && user.org_id !== org.id) H.detachFromOrg(user.id, user.org_id);
  db.prepare("UPDATE users SET org_id = ?, org_status = 'pending', org_role = 'member' WHERE id = ?").run(org.id, user.id);
  if (!db.prepare("SELECT 1 FROM join_requests WHERE kind = 'org' AND org_id = ? AND user_id = ? AND status = 'pending'").get(org.id, user.id)) {
    db.prepare("INSERT INTO join_requests (kind, org_id, user_id, created_at) VALUES ('org', ?, ?, ?)").run(org.id, user.id, Date.now());
  }
  audit(user, 'org-join-request', { org: org.id }, ip, org.id);
  rt.notifyRequests(org.id);
  return org;
}

function requestCreateOrg(user, name, ip) {
  if (!getSettings().allowCreateOrg) throw Object.assign(new Error('ปิดการขอเปิดองค์กรใหม่ชั่วคราว'), { status: 403 });
  const orgName = H.cleanText(name, 80);
  if (!orgName) throw Object.assign(new Error('กรุณาตั้งชื่อองค์กร'), { status: 400 });
  if (user.org_id && user.org_status === 'active') throw Object.assign(new Error('คุณเป็นสมาชิกองค์กรอื่นอยู่แล้ว'), { status: 409 });
  const orgId = db.transaction(() => {
    if (user.org_id) H.detachFromOrg(user.id, user.org_id);
    const info = db.prepare("INSERT INTO orgs (name, code, status, created_by, created_at) VALUES (?, ?, 'pending', ?, ?)")
      .run(orgName, uniqueCode('orgs', 'code'), user.id, Date.now());
    const id = info.lastInsertRowid;
    createChannel({ name: 'ห้องรวม', description: `ห้องรวมของ ${orgName}`, visibility: 'org', orgId: id, isDefault: 1, createdBy: user.id });
    createChannel({ name: 'ฉุกเฉิน', description: 'ช่องรับแจ้งเหตุ SOS ขององค์กร', visibility: 'org', orgId: id, emergency: 1, isDefault: 1, createdBy: user.id });
    db.prepare("UPDATE users SET org_id = ?, org_status = 'active', org_role = 'admin' WHERE id = ?").run(id, user.id);
    return id;
  })();
  audit(user, 'org-create-request', { org: orgId, name: orgName }, ip, orgId);
  rt.notifySuper({ type: 'org-request', orgId });
  return orgId;
}

// ---------- auth ----------
router.get('/config', (req, res) => {
  res.json(publicConfig());
});

router.post('/auth/register', (req, res) => {
  if (!getSettings().allowRegister) return res.status(403).json({ error: 'ปิดการสมัครสมาชิก กรุณาติดต่อผู้ดูแลระบบ' });
  const { username, password, displayName, mode = 'personal', orgCode, orgName } = req.body || {};
  if (!H.validUsername(username)) return res.status(400).json({ error: 'ชื่อผู้ใช้ต้องยาว 3-32 ตัว (ตัวอักษร ตัวเลข _ . -)' });
  if (!H.validPassword(password)) return res.status(400).json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัว' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });
  if (mode === 'join-org') {
    const org = db.prepare('SELECT * FROM orgs WHERE code = ?').get(String(orgCode || '').trim().toUpperCase());
    if (!org || org.status !== 'active') return res.status(404).json({ error: 'ไม่พบรหัสองค์กรนี้ หรือองค์กรยังไม่เปิดใช้งาน' });
  }
  if (mode === 'create-org' && !getSettings().allowCreateOrg) return res.status(403).json({ error: 'ปิดการขอเปิดองค์กรใหม่ชั่วคราว' });
  if (mode === 'create-org' && !H.cleanText(orgName, 80)) return res.status(400).json({ error: 'กรุณาตั้งชื่อองค์กร' });

  const info = db.prepare('INSERT INTO users (username, password_hash, display_name, role, friend_code, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(username, bcrypt.hashSync(password, 10), H.cleanText(displayName, 40) || null, 'user', uniqueCode('users', 'friend_code'), Date.now());
  let user = A.getUser(info.lastInsertRowid);
  audit(user, 'register', { mode }, req.ip, null);
  try {
    if (mode === 'join-org') requestJoinOrg(user, orgCode, req.ip);
    if (mode === 'create-org') requestCreateOrg(user, orgName, req.ip);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  user = A.getUser(user.id);
  H.joinDefaultChannels(user.id);
  res.json({ token: H.signToken(user), user: A.meDto(user) });
});

router.post('/auth/login', (req, res) => {
  if (loginLimited(req.ip)) return res.status(429).json({ error: 'ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่' });
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || ''));
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    audit(null, 'login-failed', { username: String(username || '').slice(0, 64) }, req.ip, user ? user.org_id : null);
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
  if (user.disabled) return res.status(403).json({ error: 'บัญชีนี้ถูกระงับ' });
  loginAttempts.delete(req.ip);
  audit(user, 'login', null, req.ip);
  res.json({ token: H.signToken(user), user: A.meDto(user) });
});

router.get('/me', H.auth, (req, res) => res.json({ user: A.meDto(req.user) }));

router.patch('/me', H.auth, (req, res) => {
  const { username, displayName: dn, currentPassword, newPassword } = req.body || {};
  if (username !== undefined && username !== req.user.username) {
    if (!H.validUsername(username)) return res.status(400).json({ error: 'ชื่อผู้ใช้ไม่ถูกต้อง' });
    if (db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.user.id)) {
      return res.status(409).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });
    }
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, req.user.id);
  }
  if (dn !== undefined) db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(H.cleanText(dn, 40) || null, req.user.id);
  if (newPassword !== undefined) {
    if (!bcrypt.compareSync(String(currentPassword || ''), req.user.password_hash)) {
      return res.status(400).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    }
    if (!H.validPassword(newPassword)) return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัว' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.user.id);
    audit(req.user, 'password-change', null, req.ip);
  }
  rt.refreshUser(req.user.id);
  rt.broadcastUser(req.user.id);
  rt.scheduleChannels();
  res.json({ user: A.meDto(A.getUser(req.user.id)) });
});

router.post('/me/friend-code/reset', H.auth, (req, res) => {
  db.prepare('UPDATE users SET friend_code = ? WHERE id = ?').run(uniqueCode('users', 'friend_code'), req.user.id);
  res.json({ user: A.meDto(A.getUser(req.user.id)) });
});

// องค์กรของฉัน: ขอเข้า / ขอเปิด / ยกเลิกคำขอ / ออก
router.post('/me/org/join', H.auth, (req, res) => {
  try {
    requestJoinOrg(req.user, req.body?.code, req.ip);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  rt.refreshUser(req.user.id);
  res.json({ user: A.meDto(A.getUser(req.user.id)) });
});

router.post('/me/org/create', H.auth, (req, res) => {
  try {
    requestCreateOrg(req.user, req.body?.name, req.ip);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  rt.refreshUser(req.user.id);
  rt.scheduleChannels([req.user.id]);
  res.json({ user: A.meDto(A.getUser(req.user.id)) });
});

router.post('/me/org/leave', H.auth, (req, res) => {
  const orgId = req.user.org_id;
  if (!orgId) return res.json({ user: A.meDto(req.user) });
  const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE org_id = ? AND org_status = 'active' AND org_role = 'admin' AND id != ?").get(orgId, req.user.id).n;
  if (req.user.org_role === 'admin' && req.user.org_status === 'active' && admins === 0) {
    return res.status(400).json({ error: 'คุณเป็นผู้ดูแลคนสุดท้าย ต้องแต่งตั้งผู้ดูแลคนอื่นก่อนออก' });
  }
  H.detachFromOrg(req.user.id, orgId);
  audit(req.user, 'org-leave', { org: orgId }, req.ip, orgId);
  rt.refreshUser(req.user.id);
  rt.broadcastUser(req.user.id);
  H.joinDefaultChannels(req.user.id);
  rt.scheduleChannels();
  res.json({ user: A.meDto(A.getUser(req.user.id)) });
});

// ---------- รูปโปรไฟล์ ----------
router.post('/me/avatar', H.auth, H.avatarBody, (req, res) => {
  const file = H.saveAvatar(req, res, `u${req.user.id}`);
  if (!file) return;
  H.removeAvatar(req.user.avatar);
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(file, req.user.id);
  rt.refreshUser(req.user.id);
  rt.broadcastUser(req.user.id);
  rt.scheduleChannels();
  res.json({ user: A.meDto(A.getUser(req.user.id)) });
});

router.delete('/me/avatar', H.auth, (req, res) => {
  H.removeAvatar(req.user.avatar);
  db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(req.user.id);
  rt.refreshUser(req.user.id);
  rt.broadcastUser(req.user.id);
  rt.scheduleChannels();
  res.json({ user: A.meDto(A.getUser(req.user.id)) });
});

router.get('/avatars/:file', (req, res) => {
  if (!/^[\w-]+\.(jpg|png|webp|gif)$/.test(req.params.file)) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(path.join(AVATAR_DIR, req.params.file), (err) => err && !res.headersSent && res.status(404).end());
});

// ---------- สมุดรายชื่อ ----------
function directoryDto(viewer, u, online, friends) {
  return {
    ...A.publicUser(u),
    online: !!online[u.id],
    lastSeen: u.last_seen,
    isFriend: friends.has(u.id),
    sameOrg: !!A.activeOrgId(viewer) && A.activeOrgId(viewer) === A.activeOrgId(u),
  };
}

// ไม่มี q: เพื่อน + คนในองค์กรเดียวกัน + คนที่อยู่ช่องเดียวกัน; มี q: ค้นหาทุกคนที่มองเห็นได้
router.get('/users', H.auth, (req, res) => {
  const me = req.user;
  const online = rt.onlineMap();
  const friends = new Set(db.prepare('SELECT friend_id FROM friendships WHERE user_id = ?').all(me.id).map((r) => r.friend_id));
  const q = H.cleanText(req.query.q, 40);
  let rows;
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    rows = db.prepare("SELECT * FROM users WHERE disabled = 0 AND (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\') LIMIT 200").all(like, like);
  } else if (A.isSuper(me)) {
    rows = db.prepare('SELECT * FROM users WHERE disabled = 0').all();
  } else {
    const orgId = A.activeOrgId(me);
    const ids = new Set([...friends, ...A.teammateIds(me.id)]);
    rows = db.prepare('SELECT * FROM users WHERE disabled = 0 AND (org_id = ? OR id IN (SELECT value FROM json_each(?)))')
      .all(orgId || -1, JSON.stringify([...ids]));
  }
  const users = rows.filter((u) => A.canSeeUser(me, u)).map((u) => directoryDto(me, u, online, friends));
  users.sort((a, b) => Number(b.online) - Number(a.online) || a.displayName.localeCompare(b.displayName));
  res.json({ users });
});

// ข้อมูลชื่อ/รูปของผู้ใช้หลายคน (ใช้แสดงผู้ส่งข้อความในกลุ่มสาธารณะ)
router.get('/users/lookup', H.auth, (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean).slice(0, 200);
  const rows = ids.length ? db.prepare('SELECT * FROM users WHERE id IN (SELECT value FROM json_each(?))').all(JSON.stringify(ids)) : [];
  const shares = db.prepare('SELECT 1 FROM channel_members a JOIN channel_members b ON a.channel_id = b.channel_id WHERE a.user_id = ? AND b.user_id = ? LIMIT 1');
  res.json({ users: rows.filter((u) => A.canSeeUser(req.user, u) || shares.get(req.user.id, u.id)).map(A.publicUser) });
});

// โปรไฟล์ผู้ใช้ (กดที่รูป): ชื่อ, องค์กร, สถานะ, รหัส QR สำหรับเพิ่มเพื่อน
router.get('/users/:id/profile', H.auth, (req, res) => {
  const u = A.getUser(Number(req.params.id));
  if (!u || !A.canSeeUser(req.user, u)) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  const online = rt.onlineMap();
  const isFriend = !!db.prepare('SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?').get(req.user.id, u.id);
  res.json({
    user: { ...A.publicUser(u), online: !!online[u.id], lastSeen: u.last_seen },
    isFriend,
    self: u.id === req.user.id,
    friendCode: u.friend_code,
    sameOrg: !!A.activeOrgId(u) && A.activeOrgId(u) === A.activeOrgId(req.user),
  });
});

// ---------- เพื่อน ----------
function befriend(a, b) {
  const now = Date.now();
  db.prepare('INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)').run(a, b, now);
  db.prepare('INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)').run(b, a, now);
}

router.post('/friends/:userId', H.auth, (req, res) => {
  const other = A.getUser(Number(req.params.userId));
  if (!other || other.id === req.user.id || !A.canSeeUser(req.user, other)) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  befriend(req.user.id, other.id);
  rt.sendToUser(other.id, { type: 'friends' });
  res.json({ ok: true });
});

router.delete('/friends/:userId', H.auth, (req, res) => {
  const id = Number(req.params.userId);
  db.prepare('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').run(req.user.id, id, id, req.user.id);
  rt.sendToUser(id, { type: 'friends' });
  res.json({ ok: true });
});

// ---------- ลิงก์เชิญ / QR: ผู้ใช้ (เพิ่มเพื่อน), ช่อง (เข้ากลุ่ม), องค์กร (ขอเข้า) ----------
function resolveCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(c)) return null;
  const user = db.prepare('SELECT * FROM users WHERE friend_code = ? AND disabled = 0').get(c);
  if (user) return { kind: 'user', user };
  const ch = db.prepare("SELECT * FROM channels WHERE invite_code = ? AND type = 'channel'").get(c);
  if (ch) return { kind: 'channel', ch };
  const org = db.prepare('SELECT * FROM orgs WHERE code = ?').get(c);
  if (org) return { kind: 'org', org };
  return null;
}

// ไม่ต้องล็อกอินก็ดูได้ (ใช้ในหน้าสมัครสมาชิก) แต่ส่งข้อมูลแค่พอแสดงผล
router.get('/invite/:code', (req, res) => {
  const viewer = H.userFromToken((req.headers.authorization || '').replace(/^Bearer /, ''));
  const r = resolveCode(req.params.code);
  if (!r) return res.status(404).json({ error: 'ลิงก์/QR นี้ไม่ถูกต้องหรือหมดอายุแล้ว' });
  if (r.kind === 'org') {
    const members = db.prepare("SELECT COUNT(*) AS n FROM users WHERE org_id = ? AND org_status = 'active'").get(r.org.id).n;
    return res.json({ kind: 'org', org: { id: r.org.id, name: r.org.name, avatar: A.avatarUrl(r.org.avatar), active: r.org.status === 'active', members } });
  }
  if (!viewer) return res.json({ kind: r.kind });
  if (r.kind === 'user') {
    const isFriend = !!db.prepare('SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?').get(viewer.id, r.user.id);
    return res.json({ kind: 'user', user: A.publicUser(r.user), isFriend, self: viewer.id === r.user.id, allowed: A.canSeeUser(viewer, r.user) });
  }
  const ch = r.ch;
  const org = A.getOrg(ch.org_id);
  return res.json({
    kind: 'channel',
    channel: {
      id: ch.id, name: ch.name, description: ch.description, avatar: A.avatarUrl(ch.avatar), orgName: org ? org.name : null,
      members: A.memberIds(ch.id).length,
    },
    isMember: !!A.membership(ch.id, viewer.id),
    joinMode: A.joinMode(viewer, ch, true),
  });
});

router.post('/invite/:code/accept', H.auth, (req, res) => {
  const r = resolveCode(req.params.code);
  if (!r) return res.status(404).json({ error: 'ลิงก์/QR นี้ไม่ถูกต้องหรือหมดอายุแล้ว' });
  const me = req.user;
  if (r.kind === 'user') {
    if (r.user.id === me.id) return res.status(400).json({ error: 'นี่คือ QR ของคุณเอง' });
    if (!A.canSeeUser(me, r.user)) return res.status(403).json({ error: 'ไม่สามารถเพิ่มผู้ใช้นี้ได้ (นโยบายองค์กร)' });
    befriend(me.id, r.user.id);
    rt.sendToUser(r.user.id, { type: 'friends' });
    audit(me, 'friend-add', { user: r.user.id }, req.ip);
    return res.json({ kind: 'user', userId: r.user.id });
  }
  if (r.kind === 'org') {
    try {
      requestJoinOrg(me, r.org.code, req.ip);
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }
    rt.refreshUser(me.id);
    return res.json({ kind: 'org', status: A.getUser(me.id).org_status });
  }
  const ch = r.ch;
  if (A.membership(ch.id, me.id)) return res.json({ kind: 'channel', channelId: ch.id, status: 'member' });
  const mode = A.joinMode(me, ch, true);
  if (!mode) {
    return res.status(403).json({ error: ch.org_id ? 'กลุ่มนี้เป็นขององค์กร ต้องเป็นสมาชิกองค์กรก่อน' : 'บัญชีของคุณใช้กลุ่มสาธารณะไม่ได้ (นโยบายองค์กร)' });
  }
  if (mode === 'request') {
    H.createChannelRequest(ch, me, req.ip);
    return res.json({ kind: 'channel', channelId: ch.id, status: 'pending' });
  }
  db.prepare("INSERT OR IGNORE INTO channel_members (channel_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(ch.id, me.id, Date.now());
  audit(me, 'channel-join', { channel: ch.id, via: 'invite' }, req.ip, ch.org_id);
  rt.scheduleChannels();
  res.json({ kind: 'channel', channelId: ch.id, status: 'member' });
});

module.exports = { router, befriend };
