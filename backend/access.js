// access.js — กฎสิทธิ์ (superadmin / องค์กร / สาธารณะ) และแปลงข้อมูลเป็นรูปแบบที่ส่งให้ client
const { db } = require('./db');

const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const getChannel = (id) => db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
const getOrg = (id) => (id ? db.prepare('SELECT * FROM orgs WHERE id = ?').get(id) : null);
const membership = (channelId, userId) =>
  db.prepare('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?').get(channelId, userId);
const memberIds = (channelId) =>
  db.prepare('SELECT user_id FROM channel_members WHERE channel_id = ?').all(channelId).map((r) => r.user_id);

const isSuper = (u) => !!u && u.role === 'superadmin';

// องค์กรที่ผู้ใช้เป็นสมาชิกและใช้งานได้จริง (ได้รับอนุมัติ + องค์กรเปิดใช้งาน)
function activeOrgId(u) {
  if (!u || !u.org_id || u.org_status !== 'active') return null;
  const org = getOrg(u.org_id);
  return org && org.status === 'active' ? org.id : null;
}

const orgRoleOf = (u, orgId) => (orgId && activeOrgId(u) === orgId ? u.org_role : null);
const isOrgAdmin = (u, orgId) => isSuper(u) || orgRoleOf(u, orgId) === 'admin';
const isOrgStaff = (u, orgId) => isSuper(u) || ['admin', 'dispatcher'].includes(orgRoleOf(u, orgId));

// เป็นเจ้าหน้าที่ (ศูนย์สั่งการ/คลังข้อความ) ในขอบเขตใด: 'all' = superadmin, orgId, หรือ null
function staffScope(u) {
  if (isSuper(u)) return 'all';
  const orgId = activeOrgId(u);
  return orgId && ['admin', 'dispatcher'].includes(u.org_role) ? orgId : null;
}
const isStaff = (u) => staffScope(u) !== null;

// ใช้โลกสาธารณะได้ไหม (บุคคลทั่วไป หรือองค์กรที่อนุญาต)
function hasExternal(u) {
  if (isSuper(u)) return true;
  const orgId = activeOrgId(u);
  if (!orgId) return true;
  return !!getOrg(orgId).allow_external;
}

function orgActive(orgId) {
  const org = getOrg(orgId);
  return !!org && org.status === 'active';
}

function canView(user, ch) {
  if (!ch) return false;
  if (isSuper(user)) return true;
  if (ch.org_id) {
    if (!orgActive(ch.org_id) || activeOrgId(user) !== ch.org_id) return false;
    return ch.visibility === 'org' || isOrgStaff(user, ch.org_id) || !!membership(ch.id, user.id);
  }
  if (membership(ch.id, user.id)) return ch.type === 'direct' || hasExternal(user);
  return ch.type === 'channel' && ch.visibility === 'public' && hasExternal(user);
}

function canTalk(user, ch) {
  if (!canView(user, ch)) return false;
  const m = membership(ch.id, user.id);
  if (m) return m.role !== 'listener';
  return ch.type === 'channel' && (isSuper(user) || (ch.org_id && isOrgStaff(user, ch.org_id)));
}

// ช่องสาธารณะและช่องฉุกเฉิน: สมาชิกเห็นเฉพาะข้อความตั้งแต่เข้าร่วม (superadmin/เจ้าหน้าที่องค์กรเห็นทั้งหมด)
// คืนค่าเวลาเริ่มที่เห็นได้ (0 = เห็นทั้งหมด, Infinity = ไม่เห็นประวัติเลย)
function historyFrom(user, ch) {
  if (!ch || ch.type !== 'channel' || isSuper(user)) return 0;
  const restricted = !ch.org_id || !!ch.emergency;
  if (!restricted || (ch.org_id && isOrgStaff(user, ch.org_id))) return 0;
  const m = membership(ch.id, user.id);
  return m ? m.joined_at : Infinity;
}

function canSeeMessage(user, m) {
  const ch = getChannel(m.channel_id);
  return canView(user, ch) && m.created_at >= historyFrom(user, ch);
}

// ลบข้อความทั้งช่อง/ตามช่วงเวลา: superadmin, หรือแอดมินองค์กรสำหรับช่องขององค์กร
const canPurge = (user, ch) => !!ch && (isSuper(user) || (!!ch.org_id && isOrgAdmin(user, ch.org_id)));

function canManage(user, ch) {
  if (!ch || ch.type !== 'channel') return false;
  if (isSuper(user)) return true;
  if (ch.org_id && isOrgAdmin(user, ch.org_id)) return true;
  if (!canView(user, ch)) return false;
  const m = membership(ch.id, user.id);
  return !!m && (m.role === 'owner' || m.role === 'moderator');
}

// เข้าร่วมเองได้ทันทีไหม: 'join' | 'request' (ต้องรออนุมัติ) | null (ไม่ได้)
function joinMode(user, ch, viaInvite) {
  if (!ch || ch.type !== 'channel') return null;
  if (isSuper(user)) return 'join';
  if (ch.org_id) {
    if (activeOrgId(user) !== ch.org_id) return null;
    if (ch.visibility === 'org' || isOrgAdmin(user, ch.org_id)) return 'join';
    return 'request';
  }
  if (!hasExternal(user)) return null;
  return ch.visibility === 'public' || viaInvite ? 'join' : null;
}

// เห็น/คุย 1:1 กับผู้ใช้คนนี้ได้ไหม
function canSeeUser(viewer, target) {
  if (!target || target.disabled) return false;
  if (viewer.id === target.id || isSuper(viewer)) return true;
  const vo = activeOrgId(viewer);
  if (vo && vo === activeOrgId(target)) return true;
  return hasExternal(viewer) && hasExternal(target);
}

const avatarUrl = (file) => (file ? `/api/avatars/${file}` : null);

function orgName(orgId) {
  if (!orgId) return null;
  const org = getOrg(orgId);
  return org ? org.name : null;
}

const publicUser = (u) => {
  const orgId = activeOrgId(u);
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name || u.username,
    role: u.role,
    status: u.status,
    avatar: avatarUrl(u.avatar),
    orgId,
    orgName: orgName(orgId),
    orgRole: orgId ? u.org_role : null,
  };
};

// ข้อมูลของตัวเอง (มีรหัสเพื่อนและสถานะคำขอเข้าองค์กร)
function meDto(u) {
  const org = getOrg(u.org_id);
  return {
    ...publicUser(u),
    friendCode: u.friend_code,
    org: org ? {
      id: org.id, name: org.name, status: org.status, memberStatus: u.org_status, role: u.org_role,
      allowExternal: !!org.allow_external, avatar: avatarUrl(org.avatar),
    } : null,
    staffScope: staffScope(u),
    external: hasExternal(u),
  };
}

function messageDto(m) {
  return {
    id: m.id,
    channelId: m.channel_id,
    userId: m.user_id,
    username: m.username,
    kind: m.kind,
    text: m.text,
    transcript: m.transcript,
    hasFile: !!m.file,
    durationMs: m.duration_ms,
    lat: m.lat,
    lng: m.lng,
    createdAt: m.created_at,
  };
}

function locationDto(u) {
  if (u.loc_lat == null) return null;
  return {
    userId: u.id,
    username: u.username,
    displayName: u.display_name || u.username,
    avatar: avatarUrl(u.avatar),
    orgId: activeOrgId(u),
    lat: u.loc_lat,
    lng: u.loc_lng,
    acc: u.loc_acc,
    speed: u.loc_speed,
    heading: u.loc_heading,
    battery: u.loc_battery,
    charging: u.loc_charging == null ? null : !!u.loc_charging,
    at: u.loc_at,
  };
}

// ผู้ใช้ที่ "อยู่ทีมเดียวกัน" — ใช้กำหนดว่าใครเห็นตำแหน่งใคร
// นับเฉพาะช่ององค์กร, กลุ่มส่วนตัว, แชท 1:1 และเพื่อน (ไม่นับกลุ่มสาธารณะที่ใครก็เข้าได้)
function teammateIds(userId) {
  const viaChannels = db.prepare(`
    SELECT DISTINCT b.user_id FROM channel_members a
    JOIN channel_members b ON a.channel_id = b.channel_id
    JOIN channels c ON c.id = a.channel_id
    WHERE a.user_id = ? AND (c.org_id IS NOT NULL OR c.visibility = 'private')`).all(userId).map((r) => r.user_id);
  const friends = db.prepare('SELECT friend_id FROM friendships WHERE user_id = ?').all(userId).map((r) => r.friend_id);
  return [...new Set([...viaChannels, ...friends])];
}

function canSeeLocation(viewer, target) {
  if (!target) return false;
  if (viewer.id === target.id || isSuper(viewer)) return true;
  const to = activeOrgId(target);
  if (to && isOrgStaff(viewer, to)) return true;
  return teammateIds(viewer.id).includes(target.id);
}

module.exports = {
  getUser, getChannel, getOrg, membership, memberIds, isSuper, activeOrgId, isOrgAdmin, isOrgStaff, staffScope, isStaff,
  hasExternal, orgActive, canView, canTalk, canManage, historyFrom, canSeeMessage, canPurge, joinMode, canSeeUser, avatarUrl, publicUser, meDto, messageDto,
  locationDto, teammateIds, canSeeLocation,
};
