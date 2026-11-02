// routes/orgs.js — คอนโซลแอดมินองค์กร (superadmin ใช้กับองค์กรใดก็ได้ผ่าน ?orgId=) และการอนุมัติคำขอ
const express = require('express');
const { db, audit, uniqueCode } = require('../db');
const A = require('../access');
const rt = require('../realtime');
const H = require('../http');

const router = express.Router();
const ORG_ROLES = ['admin', 'dispatcher', 'member'];

// องค์กรที่กำลังจัดการ: superadmin เลือกผ่าน orgId, แอดมินองค์กรได้เฉพาะของตัวเอง
function orgFor(req, res, { staff = false } = {}) {
  const wanted = Number(req.query.orgId || req.body?.orgId) || null;
  const orgId = A.isSuper(req.user) ? wanted || A.activeOrgId(req.user) : A.activeOrgId(req.user);
  const ok = orgId && (staff ? A.isOrgStaff(req.user, orgId) : A.isOrgAdmin(req.user, orgId));
  if (!ok) {
    res.status(403).json({ error: 'สำหรับแอดมินองค์กรเท่านั้น' });
    return null;
  }
  return A.getOrg(orgId);
}

function orgDto(org, withCode) {
  const count = (sql) => db.prepare(sql).get(org.id).n;
  return {
    id: org.id,
    name: org.name,
    description: org.description,
    status: org.status,
    allowExternal: !!org.allow_external,
    avatar: A.avatarUrl(org.avatar),
    code: withCode ? org.code : undefined,
    createdAt: org.created_at,
    members: count("SELECT COUNT(*) AS n FROM users WHERE org_id = ? AND org_status = 'active'"),
    pending: count("SELECT COUNT(*) AS n FROM join_requests WHERE org_id = ? AND status = 'pending'"),
    channels: count("SELECT COUNT(*) AS n FROM channels WHERE org_id = ? AND type = 'channel'"),
  };
}

function refreshMember(userId) {
  rt.refreshUser(userId);
  rt.broadcastUser(userId);
  rt.scheduleChannels();
}

router.get('/org', H.auth, (req, res) => {
  const org = orgFor(req, res, { staff: true });
  if (!org) return;
  res.json({ org: orgDto(org, A.isOrgAdmin(req.user, org.id)) });
});

router.patch('/org', H.auth, (req, res) => {
  const org = orgFor(req, res);
  if (!org) return;
  const b = req.body || {};
  if (b.name !== undefined) {
    const name = H.cleanText(b.name, 80);
    if (!name) return res.status(400).json({ error: 'กรุณาตั้งชื่อองค์กร' });
    db.prepare('UPDATE orgs SET name = ? WHERE id = ?').run(name, org.id);
  }
  if (b.description !== undefined) db.prepare('UPDATE orgs SET description = ? WHERE id = ?').run(H.cleanText(b.description, 300), org.id);
  if (b.allowExternal !== undefined) {
    db.prepare('UPDATE orgs SET allow_external = ? WHERE id = ?').run(b.allowExternal ? 1 : 0, org.id);
    // ปิดการใช้โลกภายนอก → นำสมาชิกออกจากช่องสาธารณะ (คงแชท 1:1 กับเพื่อนร่วมองค์กร)
    if (!b.allowExternal) {
      db.prepare(`DELETE FROM channel_members WHERE user_id IN (SELECT id FROM users WHERE org_id = ? AND org_status = 'active' AND role != 'superadmin')
        AND channel_id IN (SELECT id FROM channels WHERE org_id IS NULL AND type = 'channel')`).run(org.id);
    } else {
      for (const u of db.prepare("SELECT id FROM users WHERE org_id = ? AND org_status = 'active'").all(org.id)) H.joinDefaultChannels(u.id);
    }
  }
  audit(req.user, 'org-update', { org: org.id, ...b }, req.ip, org.id);
  for (const u of db.prepare('SELECT id FROM users WHERE org_id = ?').all(org.id)) refreshMember(u.id);
  res.json({ org: orgDto(A.getOrg(org.id), true) });
});

router.post('/org/code/reset', H.auth, (req, res) => {
  const org = orgFor(req, res);
  if (!org) return;
  db.prepare('UPDATE orgs SET code = ? WHERE id = ?').run(uniqueCode('orgs', 'code'), org.id);
  audit(req.user, 'org-code-reset', { org: org.id }, req.ip, org.id);
  res.json({ org: orgDto(A.getOrg(org.id), true) });
});

router.post('/org/avatar', H.auth, H.avatarBody, (req, res) => {
  const org = orgFor(req, res);
  if (!org) return;
  const file = H.saveAvatar(req, res, `o${org.id}`);
  if (!file) return;
  H.removeAvatar(org.avatar);
  db.prepare('UPDATE orgs SET avatar = ? WHERE id = ?').run(file, org.id);
  for (const u of db.prepare('SELECT id FROM users WHERE org_id = ?').all(org.id)) rt.broadcastUser(u.id);
  res.json({ org: orgDto(A.getOrg(org.id), true) });
});

router.delete('/org/avatar', H.auth, (req, res) => {
  const org = orgFor(req, res);
  if (!org) return;
  H.removeAvatar(org.avatar);
  db.prepare('UPDATE orgs SET avatar = NULL WHERE id = ?').run(org.id);
  res.json({ org: orgDto(A.getOrg(org.id), true) });
});

// ---------- สมาชิกองค์กร ----------
router.get('/org/members', H.auth, (req, res) => {
  const org = orgFor(req, res, { staff: true });
  if (!org) return;
  const online = rt.onlineMap();
  const rows = db.prepare("SELECT * FROM users WHERE org_id = ? AND org_status = 'active' ORDER BY CASE org_role WHEN 'admin' THEN 0 WHEN 'dispatcher' THEN 1 ELSE 2 END, COALESCE(display_name, username) COLLATE NOCASE").all(org.id);
  res.json({
    members: rows.map((u) => ({ ...A.publicUser(u), orgRole: u.org_role, disabled: !!u.disabled, online: !!online[u.id], lastSeen: u.last_seen, createdAt: u.created_at })),
  });
});

// แอดมินเพิ่มสมาชิกเองได้ (ผู้ใช้ต้องยังไม่สังกัดองค์กรอื่น)
router.post('/org/members', H.auth, (req, res) => {
  const org = orgFor(req, res);
  if (!org) return;
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.body?.username || ''));
  if (!target || target.disabled) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  if (target.org_id && target.org_id !== org.id && target.org_status === 'active') return res.status(409).json({ error: 'ผู้ใช้นี้สังกัดองค์กรอื่นอยู่แล้ว' });
  const role = ORG_ROLES.includes(req.body?.orgRole) ? req.body.orgRole : 'member';
  if (target.org_id && target.org_id !== org.id) H.detachFromOrg(target.id, target.org_id);
  db.prepare("UPDATE users SET org_id = ?, org_status = 'active', org_role = ? WHERE id = ?").run(org.id, role, target.id);
  db.prepare("UPDATE join_requests SET status = 'approved', decided_by = ?, decided_at = ? WHERE kind = 'org' AND org_id = ? AND user_id = ? AND status = 'pending'")
    .run(H.displayName(req.user), Date.now(), org.id, target.id);
  H.joinDefaultChannels(target.id);
  audit(req.user, 'org-member-add', { org: org.id, user: target.username, role }, req.ip, org.id);
  refreshMember(target.id);
  res.json({ ok: true });
});

router.patch('/org/members/:uid', H.auth, (req, res) => {
  const org = orgFor(req, res);
  if (!org) return;
  const target = A.getUser(Number(req.params.uid));
  if (!target || target.org_id !== org.id) return res.status(404).json({ error: 'ไม่ใช่สมาชิกองค์กรนี้' });
  const b = req.body || {};
  if (b.orgRole !== undefined) {
    if (!ORG_ROLES.includes(b.orgRole)) return res.status(400).json({ error: 'บทบาทไม่ถูกต้อง' });
    if (target.id === req.user.id && b.orgRole !== 'admin' && !A.isSuper(req.user)) return res.status(400).json({ error: 'ลดสิทธิ์ตัวเองไม่ได้' });
    db.prepare('UPDATE users SET org_role = ? WHERE id = ?').run(b.orgRole, target.id);
  }
  if (b.disabled !== undefined) {
    if (target.id === req.user.id) return res.status(400).json({ error: 'ระงับบัญชีตัวเองไม่ได้' });
    db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(b.disabled ? 1 : 0, target.id);
  }
  audit(req.user, 'org-member-update', { org: org.id, user: target.id, ...b }, req.ip, org.id);
  refreshMember(target.id);
  res.json({ ok: true });
});

router.delete('/org/members/:uid', H.auth, (req, res) => {
  const org = orgFor(req, res);
  if (!org) return;
  const target = A.getUser(Number(req.params.uid));
  if (!target || target.org_id !== org.id) return res.status(404).json({ error: 'ไม่ใช่สมาชิกองค์กรนี้' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'ใช้เมนู "ออกจากองค์กร" ในหน้าตั้งค่าแทน' });
  H.detachFromOrg(target.id, org.id);
  H.joinDefaultChannels(target.id);
  audit(req.user, 'org-member-remove', { org: org.id, user: target.username }, req.ip, org.id);
  refreshMember(target.id);
  res.json({ ok: true });
});

// ---------- คำขอเข้าองค์กร / เข้าช่องส่วนตัวขององค์กร ----------
function requestRows(where, args) {
  return db.prepare(`SELECT u.*, r.id AS request_id, r.kind AS request_kind, r.org_id AS request_org, r.channel_id AS request_channel,
      r.created_at AS requested_at, c.name AS channel_name, o.name AS org_name
    FROM join_requests r JOIN users u ON u.id = r.user_id
    LEFT JOIN channels c ON c.id = r.channel_id LEFT JOIN orgs o ON o.id = r.org_id
    WHERE r.status = 'pending' AND ${where} ORDER BY r.id`).all(...args)
    .map((r) => ({
      id: r.request_id, kind: r.request_kind, orgId: r.request_org, orgName: r.org_name, channelId: r.request_channel,
      channelName: r.channel_name, createdAt: r.requested_at, user: A.publicUser(r), username: r.username,
    }));
}

// คำขอที่ฉันตัดสินได้
router.get('/requests', H.auth, (req, res) => {
  if (A.isSuper(req.user)) return res.json({ requests: requestRows('1 = 1', []) });
  const orgId = A.activeOrgId(req.user);
  const managed = db.prepare("SELECT channel_id FROM channel_members WHERE user_id = ? AND role IN ('owner', 'moderator')").all(req.user.id).map((r) => r.channel_id);
  const rows = A.isOrgAdmin(req.user, orgId)
    ? requestRows('r.org_id = ?', [orgId])
    : requestRows("r.kind = 'channel' AND r.channel_id IN (SELECT value FROM json_each(?))", [JSON.stringify(managed)]);
  res.json({ requests: rows });
});

router.post('/requests/:id/:action(approve|reject)', H.auth, (req, res) => {
  const r = db.prepare("SELECT * FROM join_requests WHERE id = ? AND status = 'pending'").get(req.params.id);
  if (!r) return res.status(404).json({ error: 'ไม่พบคำขอ หรือมีคนตัดสินไปแล้ว' });
  const approve = req.params.action === 'approve';
  const target = A.getUser(r.user_id);
  if (r.kind === 'org') {
    if (!A.isOrgAdmin(req.user, r.org_id)) return res.status(403).json({ error: 'เฉพาะแอดมินองค์กร' });
    if (approve && target.org_id === r.org_id) {
      db.prepare("UPDATE users SET org_status = 'active', org_role = 'member' WHERE id = ?").run(target.id);
      H.joinDefaultChannels(target.id);
    } else if (!approve && target.org_id === r.org_id && target.org_status === 'pending') {
      db.prepare("UPDATE users SET org_id = NULL, org_status = NULL WHERE id = ?").run(target.id);
    }
  } else {
    const ch = A.getChannel(r.channel_id);
    if (!ch || !A.canManage(req.user, ch)) return res.status(403).json({ error: 'เฉพาะผู้ดูแลช่องหรือแอดมินองค์กร' });
    if (approve) {
      if (ch.org_id && A.activeOrgId(target) !== ch.org_id) return res.status(409).json({ error: 'ผู้ใช้ไม่ได้อยู่ในองค์กรนี้แล้ว' });
      db.prepare("INSERT OR IGNORE INTO channel_members (channel_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(ch.id, target.id, Date.now());
    }
  }
  db.prepare('UPDATE join_requests SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?')
    .run(approve ? 'approved' : 'rejected', H.displayName(req.user), Date.now(), r.id);
  audit(req.user, `request-${req.params.action}`, { request: r.id, kind: r.kind, user: target.username, channel: r.channel_id }, req.ip, r.org_id);
  refreshMember(target.id);
  rt.sendToUser(target.id, { type: 'request-decided', kind: r.kind, approved: approve, channelId: r.channel_id });
  rt.notifyRequests(r.org_id, r.channel_id);
  res.json({ ok: true });
});

// ---------- สรุป / audit ขององค์กร ----------
router.get('/org/stats', H.auth, (req, res) => {
  const org = orgFor(req, res, { staff: true });
  if (!org) return;
  const online = rt.onlineMap();
  const ids = db.prepare("SELECT id FROM users WHERE org_id = ? AND org_status = 'active'").all(org.id).map((r) => r.id);
  res.json({
    members: ids.length,
    online: ids.filter((id) => online[id]).length,
    channels: db.prepare("SELECT COUNT(*) AS n FROM channels WHERE org_id = ? AND type = 'channel'").get(org.id).n,
    messages24h: db.prepare('SELECT COUNT(*) AS n FROM messages m JOIN channels c ON c.id = m.channel_id WHERE c.org_id = ? AND m.created_at >= ?').get(org.id, Date.now() - 86400000).n,
    openAlerts: db.prepare('SELECT COUNT(*) AS n FROM alerts WHERE org_id = ? AND resolved_at IS NULL').get(org.id).n,
    pending: db.prepare("SELECT COUNT(*) AS n FROM join_requests WHERE org_id = ? AND status = 'pending'").get(org.id).n,
  });
});

router.get('/org/audit', H.auth, (req, res) => {
  const org = orgFor(req, res);
  if (!org) return;
  const rows = db.prepare('SELECT * FROM audit_log WHERE org_id = ? ORDER BY id DESC LIMIT ?').all(org.id, Math.min(Number(req.query.limit) || 200, 500));
  res.json({ entries: rows.map((r) => ({ id: r.id, username: r.username, action: r.action, detail: r.detail, ip: r.ip, createdAt: r.created_at })) });
});

module.exports = { router, orgDto };
