// http.js — middleware และ helper ที่ทุก route ใช้ร่วมกัน
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { db, AVATAR_DIR } = require('./db');
const A = require('./access');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET not set — using a random secret, users will be logged out on restart');
}

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const signToken = (u) => jwt.sign({ sub: u.id }, JWT_SECRET, { expiresIn: '30d' });

function userFromToken(token) {
  try {
    const { sub } = jwt.verify(token, JWT_SECRET);
    const u = A.getUser(sub);
    return u && !u.disabled ? u : null;
  } catch {
    return null;
  }
}

function auth(req, res, next) {
  const user = userFromToken((req.headers.authorization || '').replace(/^Bearer /, ''));
  if (!user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  req.user = user;
  next();
}

const superOnly = (req, res, next) => (A.isSuper(req.user) ? next() : res.status(403).json({ error: 'สำหรับ Super admin เท่านั้น' }));
const staffOnly = (req, res, next) => (A.isStaff(req.user) ? next() : res.status(403).json({ error: 'สำหรับผู้ดูแล/ศูนย์สั่งการเท่านั้น' }));

const validUsername = (s) => typeof s === 'string' && /^[\p{L}\p{N}_.-]{3,32}$/u.test(s);
const validPassword = (s) => typeof s === 'string' && s.length >= 6 && s.length <= 128;
const cleanText = (s, max) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
const displayName = (u) => u.display_name || u.username;

function loadChannel(req, res) {
  const ch = A.getChannel(Number(req.params.id));
  if (!ch || !A.canView(req.user, ch)) {
    res.status(404).json({ error: 'ไม่พบช่อง' });
    return null;
  }
  return ch;
}

// รูปโปรไฟล์/รูปช่อง/รูปองค์กร — ชื่อไฟล์สุ่มเดาไม่ได้ เพื่อให้ <img> โหลดได้โดยไม่ต้องแนบ token
const avatarBody = express.raw({ type: Object.keys(IMAGE_TYPES), limit: MAX_AVATAR_BYTES });
function saveAvatar(req, res, prefix) {
  const ext = IMAGE_TYPES[req.headers['content-type']];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) {
    res.status(400).json({ error: 'รองรับเฉพาะรูป JPG/PNG/WEBP/GIF ไม่เกิน 2MB' });
    return null;
  }
  const file = `${prefix}-${crypto.randomBytes(12).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(AVATAR_DIR, file), req.body);
  return file;
}
const removeAvatar = (file) => file && fs.rm(path.join(AVATAR_DIR, file), { force: true }, () => {});

// เข้าร่วมช่องอัตโนมัติ: ช่องสาธารณะเริ่มต้น (ถ้าใช้โลกสาธารณะได้) + ช่องเริ่มต้นขององค์กร
function joinDefaultChannels(userId) {
  const u = A.getUser(userId);
  const add = db.prepare("INSERT OR IGNORE INTO channel_members (channel_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)");
  const orgId = A.activeOrgId(u);
  const rows = db.prepare('SELECT id, org_id FROM channels WHERE is_default = 1 AND (org_id IS NULL OR org_id = ?)').all(orgId || -1);
  for (const c of rows) {
    if (!c.org_id && !A.hasExternal(u)) continue;
    add.run(c.id, userId, Date.now());
  }
}

// ออกจากองค์กร: ลบสมาชิกภาพในช่องขององค์กรทั้งหมด
function detachFromOrg(userId, orgId) {
  db.prepare('DELETE FROM channel_members WHERE user_id = ? AND channel_id IN (SELECT id FROM channels WHERE org_id = ?)').run(userId, orgId);
  db.prepare("UPDATE join_requests SET status = 'rejected', decided_at = ? WHERE user_id = ? AND org_id = ? AND status = 'pending'").run(Date.now(), userId, orgId);
  db.prepare("UPDATE users SET org_id = NULL, org_status = NULL, org_role = 'member' WHERE id = ?").run(userId);
}

// คำขอเข้าช่องส่วนตัวขององค์กร (ผู้ดูแลช่อง/แอดมินองค์กรกดรับ)
function createChannelRequest(ch, user, ip) {
  const { audit } = require('./db');
  const rt = require('./realtime');
  if (!db.prepare("SELECT 1 FROM join_requests WHERE kind = 'channel' AND channel_id = ? AND user_id = ? AND status = 'pending'").get(ch.id, user.id)) {
    db.prepare("INSERT INTO join_requests (kind, org_id, channel_id, user_id, created_at) VALUES ('channel', ?, ?, ?, ?)").run(ch.org_id, ch.id, user.id, Date.now());
    audit(user, 'channel-join-request', { channel: ch.id }, ip, ch.org_id);
  }
  rt.notifyRequests(ch.org_id, ch.id);
  rt.scheduleChannels();
}

// ลบข้อความหลายรายการ (พร้อมไฟล์) แล้วแจ้งทุกคนในช่องที่เกี่ยวข้อง
function deleteMessages(rows) {
  const { AUDIO_DIR, FILES_DIR } = require('./db');
  const rt = require('./realtime');
  if (!rows.length) return 0;
  const del = db.prepare('DELETE FROM messages WHERE id = ?');
  db.transaction(() => rows.forEach((m) => del.run(m.id)))();
  rows.forEach((m) => m.file && fs.rm(path.join(m.kind === 'audio' ? AUDIO_DIR : FILES_DIR, m.file), { force: true }, () => {}));
  const byChannel = new Map();
  rows.forEach((m) => byChannel.set(m.channel_id, [...(byChannel.get(m.channel_id) || []), m.id]));
  for (const [channelId, ids] of byChannel) rt.sendToChannel(channelId, { type: 'messages-delete', channelId, ids });
  rt.scheduleChannels();
  return rows.length;
}

module.exports = {
  deleteMessages,
  createChannelRequest,
  IMAGE_TYPES, MAX_IMAGE_BYTES, signToken, userFromToken, auth, superOnly, staffOnly, validUsername, validPassword,
  cleanText, displayName, loadChannel, avatarBody, saveAvatar, removeAvatar, joinDefaultChannels, detachFromOrg,
};
