// realtime.js — WebSocket hub: presence, จองช่องพูด, relay เสียง, ตำแหน่ง, กระจายเหตุการณ์
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');
const { db, AUDIO_DIR } = require('./db');
const A = require('./access');

const SAMPLE_RATE = 16000; // PCM16LE mono 16 kHz
const BYTES_PER_MS = (SAMPLE_RATE * 2) / 1000;
// เวลาพูดสูงสุด อ่านจากค่าตั้งของแอปทุกครั้ง (Super admin ปรับได้)
const maxTalkMs = () => require('./settings').getSettings().maxTalkSeconds * 1000;
const LOCATION_HISTORY_EVERY_MS = 15000;

let wss;
const byUser = new Map(); // userId -> Set<ws>
const speakers = new Map(); // channelId -> { ws, user, chunks, bytes, startedAt, timer, sos }
const lastTrackAt = new Map(); // userId -> ts ของจุดเส้นทางล่าสุดที่บันทึก

const send = (ws, msg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));

function socketsOf(userId) {
  return byUser.get(userId) || new Set();
}

function sendToUser(userId, msg) {
  for (const ws of socketsOf(userId)) send(ws, msg);
}

// เจ้าหน้าที่ที่ดูแลองค์กรนี้ (orgId = null คือโลกสาธารณะ → เฉพาะ superadmin)
function staffSockets(orgId) {
  const out = [];
  for (const ws of wss.clients) {
    if (!ws.user) continue;
    const scope = A.staffScope(ws.user);
    if (scope === 'all' || (orgId && scope === orgId)) out.push(ws);
  }
  return out;
}

const staffCovers = (user, orgId) => {
  const scope = A.staffScope(user);
  return scope === 'all' || (!!orgId && scope === orgId);
};

// คนที่ควรได้รับเหตุการณ์ของช่อง: สมาชิก + คนที่เปิดดูช่องนั้นอยู่ + dispatcher ที่เฝ้าทุกช่อง
function channelAudience(channelId) {
  const set = new Set();
  const ch = A.getChannel(channelId);
  for (const uid of A.memberIds(channelId)) for (const ws of socketsOf(uid)) set.add(ws);
  for (const ws of wss.clients) {
    if (!ws.user) continue;
    if (ws.watching === channelId || (ws.monitorAll && ch && ch.type === 'channel' && staffCovers(ws.user, ch.org_id))) set.add(ws);
  }
  return set;
}

function sendToChannel(channelId, msg, except) {
  const data = JSON.stringify(msg);
  for (const ws of channelAudience(channelId)) {
    if (ws !== except && ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

function onlineMap() {
  const out = {};
  for (const [uid, set] of byUser) {
    if (set.size) out[uid] = [...set][0].user.status;
  }
  return out;
}

function broadcastPresence() {
  const msg = { type: 'presence', online: onlineMap() };
  for (const ws of wss.clients) if (ws.user) send(ws, msg);
}

// ---------- รายการช่องของผู้ใช้ ----------
function channelsForUser(user) {
  // superadmin เห็นทุกช่องกลุ่ม; คนอื่นเห็นช่องที่เป็นสมาชิก + ช่องสาธารณะ + ช่องขององค์กรตัวเอง แล้วกรองด้วย canView
  const orgId = A.activeOrgId(user);
  const rows = (A.isSuper(user)
    ? db.prepare(`SELECT c.*, m.role AS my_role, m.last_read_id FROM channels c
        LEFT JOIN channel_members m ON m.channel_id = c.id AND m.user_id = ?
        WHERE c.type = 'channel' OR m.user_id IS NOT NULL`).all(user.id)
    : db.prepare(`SELECT c.*, m.role AS my_role, m.last_read_id FROM channels c
        LEFT JOIN channel_members m ON m.channel_id = c.id AND m.user_id = ?
        WHERE m.user_id IS NOT NULL
           OR (c.type = 'channel' AND c.org_id IS NULL AND c.visibility = 'public')
           OR (c.type = 'channel' AND c.org_id = ?)`).all(user.id, orgId || -1)
  ).filter((c) => A.canView(user, c));
  const pendingReq = db.prepare("SELECT COUNT(*) AS n FROM join_requests WHERE kind = 'channel' AND channel_id = ? AND status = 'pending'");

  const lastMsg = db.prepare('SELECT * FROM messages WHERE channel_id = ? AND created_at >= ? ORDER BY id DESC LIMIT 1');
  const unread = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE channel_id = ? AND id > ? AND created_at >= ? AND (user_id IS NULL OR user_id != ?)');
  const members = db.prepare('SELECT user_id FROM channel_members WHERE channel_id = ?');
  const online = onlineMap();

  return rows.map((c) => {
    const ids = members.all(c.id).map((r) => r.user_id);
    const from = A.historyFrom(user, c);
    const since = Number.isFinite(from) ? from : Number.MAX_SAFE_INTEGER;
    const last = lastMsg.get(c.id, since);
    const sp = speakers.get(c.id);
    let peer = null;
    if (c.type === 'direct') {
      const pid = ids.find((id) => id !== user.id);
      const p = pid && A.getUser(pid);
      if (p) peer = A.publicUser(p);
    }
    return {
      id: c.id,
      name: c.type === 'direct' ? (peer ? peer.displayName : 'ผู้ใช้ที่ถูกลบ') : c.name,
      description: c.description,
      type: c.type,
      visibility: c.visibility,
      emergency: !!c.emergency,
      orgId: c.org_id,
      orgName: c.org_id ? (A.getOrg(c.org_id) || {}).name || null : null,
      isDefault: !!c.is_default,
      joinMode: c.my_role ? null : A.joinMode(user, c, false),
      requests: c.type === 'channel' && c.org_id && A.canManage(user, c) ? pendingReq.get(c.id).n : 0,
      avatar: c.type === 'direct' ? (peer ? peer.avatar : null) : A.avatarUrl(c.avatar),
      role: c.my_role || null,
      members: ids.length,
      online: ids.filter((id) => online[id]).length,
      unread: c.my_role ? unread.get(c.id, c.last_read_id || 0, since, user.id).n : 0,
      historyFrom: from === Infinity ? -1 : from,
      lastMessage: last ? A.messageDto(last) : null,
      speaker: sp ? A.publicUser(sp.user) : null,
      peer,
    };
  });
}

// รวบการส่งรายการช่องให้ส่งครั้งเดียวต่อรอบ
let channelsTimer = null;
const pendingUsers = new Set();
let pendingAll = false;
function scheduleChannels(userIds) {
  if (!userIds) pendingAll = true;
  else userIds.forEach((id) => pendingUsers.add(id));
  if (channelsTimer) return;
  channelsTimer = setTimeout(() => {
    channelsTimer = null;
    const all = pendingAll;
    const ids = new Set(pendingUsers);
    pendingAll = false;
    pendingUsers.clear();
    for (const [uid, set] of byUser) {
      if (!all && !ids.has(uid)) continue;
      const user = set.size && [...set][0].user;
      if (!user) continue;
      const msg = { type: 'channels', channels: channelsForUser(user) };
      for (const ws of set) send(ws, msg);
    }
  }, 120);
}

function refreshUser(userId) {
  const u = A.getUser(userId);
  for (const ws of socketsOf(userId)) {
    if (!u || u.disabled) { ws.close(4001, 'disabled'); continue; }
    ws.user = u;
  }
}

function kickUser(userId) {
  for (const ws of socketsOf(userId)) ws.close(4001, 'removed');
}

// ---------- ข้อความ ----------
function addMessage(fields) {
  const info = db.prepare(`INSERT INTO messages
    (channel_id, user_id, username, kind, text, transcript, file, duration_ms, lat, lng, created_at)
    VALUES (@channel_id, @user_id, @username, @kind, @text, @transcript, @file, @duration_ms, @lat, @lng, @created_at)`)
    .run({ text: null, transcript: null, file: null, duration_ms: null, lat: null, lng: null, created_at: Date.now(), ...fields });
  const message = A.messageDto(db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid));
  // ข้อความของตัวเองถือว่าอ่านแล้ว
  if (fields.user_id) {
    db.prepare('UPDATE channel_members SET last_read_id = ? WHERE channel_id = ? AND user_id = ?')
      .run(message.id, fields.channel_id, fields.user_id);
  }
  sendToChannel(fields.channel_id, { type: 'message', message });
  scheduleChannels();
  return message;
}

// ---------- การพูด ----------
function wavHeader(dataBytes) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(dataBytes, 40);
  return h;
}

function endTalk(channelId) {
  const sp = speakers.get(channelId);
  if (!sp) return;
  clearTimeout(sp.timer);
  speakers.delete(channelId);
  sp.ws.talkChannel = null;

  const durationMs = Math.round(sp.bytes / BYTES_PER_MS);
  let message = null;
  if (durationMs >= 300 && A.getChannel(channelId)) {
    const file = `${channelId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.wav`;
    fs.writeFileSync(path.join(AUDIO_DIR, file), Buffer.concat([wavHeader(sp.bytes), ...sp.chunks]));
    message = addMessage({
      channel_id: channelId, user_id: sp.user.id, username: sp.user.display_name || sp.user.username,
      kind: 'audio', file, duration_ms: durationMs, created_at: sp.startedAt,
    });
  }
  send(sp.ws, { type: 'talk-saved', channelId, messageId: message ? message.id : null });
  sendToChannel(channelId, { type: 'talk-end', channelId, userId: sp.user.id });
  scheduleChannels();
}

function startTalk(ws, channelId, sos) {
  const ch = A.getChannel(channelId);
  if (!A.canTalk(ws.user, ch)) return send(ws, { type: 'talk-denied', channelId, reason: 'ไม่มีสิทธิ์พูดในช่องนี้' });
  const current = speakers.get(channelId);
  if (current && current.ws !== ws) {
    if (!sos) {
      return send(ws, { type: 'talk-denied', channelId, reason: `${current.user.display_name || current.user.username} กำลังพูดอยู่` });
    }
    endTalk(channelId); // SOS แทรกได้ทันที
  }
  if (ws.talkChannel != null) endTalk(ws.talkChannel);
  ws.talkChannel = channelId;
  speakers.set(channelId, {
    ws, user: ws.user, chunks: [], bytes: 0, startedAt: Date.now(), sos: !!sos,
    timer: setTimeout(() => endTalk(channelId), maxTalkMs()),
  });
  send(ws, { type: 'talk-granted', channelId, maxMs: maxTalkMs() });
  sendToChannel(channelId, { type: 'talk-start', channelId, user: A.publicUser(ws.user), sos: !!sos }, ws);
  scheduleChannels();
}

// ---------- ตำแหน่ง ----------
const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

function updateLocation(ws, msg) {
  const lat = num(msg.lat, -90, 90);
  const lng = num(msg.lng, -180, 180);
  if (lat == null || lng == null) return;
  const now = Date.now();
  const loc = {
    acc: num(msg.acc, 0, 1e6), speed: num(msg.speed, 0, 500), heading: num(msg.heading, 0, 360),
    battery: num(msg.battery, 0, 1), charging: typeof msg.charging === 'boolean' ? (msg.charging ? 1 : 0) : null,
  };
  db.prepare(`UPDATE users SET loc_lat=?, loc_lng=?, loc_acc=?, loc_speed=?, loc_heading=?, loc_battery=?, loc_charging=?, loc_at=? WHERE id=?`)
    .run(lat, lng, loc.acc, loc.speed, loc.heading, loc.battery, loc.charging, now, ws.user.id);
  if (now - (lastTrackAt.get(ws.user.id) || 0) >= LOCATION_HISTORY_EVERY_MS) {
    lastTrackAt.set(ws.user.id, now);
    db.prepare('INSERT INTO locations (user_id, lat, lng, acc, speed, battery, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(ws.user.id, lat, lng, loc.acc, loc.speed, loc.battery, now);
  }
  const dto = A.locationDto(A.getUser(ws.user.id));
  const targets = new Set(A.teammateIds(ws.user.id));
  for (const s of staffSockets(A.activeOrgId(ws.user))) targets.add(s.user.id);
  targets.add(ws.user.id);
  for (const uid of targets) sendToUser(uid, { type: 'location', location: dto });
}

function broadcastAlert(alert, channelId) {
  const msg = { type: alert.ackedAt || alert.resolvedAt ? 'alert-update' : 'sos', alert };
  const targets = new Set(channelId ? channelAudience(channelId) : []);
  staffSockets(alert.orgId).forEach((s) => targets.add(s));
  socketsOf(alert.userId).forEach((s) => targets.add(s));
  for (const ws of targets) send(ws, msg);
}

// ---------- WebSocket ----------
function init(server, userFromToken) {
  wss = new WebSocket.Server({ server, path: '/ws', maxPayload: 64 * 1024 });

  wss.on('connection', (ws, req) => {
    const token = new URL(req.url, 'http://x').searchParams.get('token');
    const user = userFromToken(token);
    if (!user) return ws.close(4001, 'unauthorized');
    ws.user = user;
    ws.isAlive = true;
    ws.talkChannel = null;
    ws.watching = null;
    ws.monitorAll = false;
    ws.on('pong', () => { ws.isAlive = true; });

    if (!byUser.has(user.id)) byUser.set(user.id, new Set());
    const wasOnline = byUser.get(user.id).size > 0;
    byUser.get(user.id).add(ws);

    send(ws, { type: 'hello', user: A.meDto(user), channels: channelsForUser(user), online: onlineMap() });
    if (!wasOnline) {
      broadcastPresence();
      scheduleChannels();
    }

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const sp = ws.talkChannel != null && speakers.get(ws.talkChannel);
        if (!sp || sp.ws !== ws) return;
        const pcm = Buffer.from(data);
        sp.chunks.push(pcm);
        sp.bytes += pcm.length;
        // header 4 ไบต์ = channelId เพื่อให้ผู้ฟังรู้ว่าเสียงมาจากช่องไหน
        const frame = Buffer.allocUnsafe(4 + pcm.length);
        frame.writeUInt32LE(ws.talkChannel, 0);
        pcm.copy(frame, 4);
        for (const c of channelAudience(ws.talkChannel)) {
          if (c !== ws && c.readyState === WebSocket.OPEN) c.send(frame, { binary: true });
        }
        return;
      }

      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      switch (msg.type) {
        case 'watch': {
          const ch = A.getChannel(Number(msg.channelId));
          ws.watching = ch && A.canView(ws.user, ch) ? ch.id : null;
          break;
        }
        case 'monitor':
          ws.monitorAll = !!msg.on && A.isStaff(ws.user);
          scheduleChannels([ws.user.id]);
          break;
        case 'talk-start':
          startTalk(ws, Number(msg.channelId), msg.sos === true);
          break;
        case 'talk-stop':
          if (ws.talkChannel != null) endTalk(ws.talkChannel);
          break;
        case 'transcript': {
          const text = String(msg.text || '').trim().slice(0, 4000);
          const m = db.prepare('SELECT * FROM messages WHERE id = ? AND user_id = ?').get(msg.messageId, ws.user.id);
          if (!m || !text) return;
          db.prepare('UPDATE messages SET transcript = ? WHERE id = ?').run(text, m.id);
          sendToChannel(m.channel_id, { type: 'message-update', message: A.messageDto({ ...m, transcript: text }) });
          break;
        }
        case 'status': {
          if (!['available', 'busy'].includes(msg.status)) return;
          db.prepare('UPDATE users SET status = ? WHERE id = ?').run(msg.status, ws.user.id);
          refreshUser(ws.user.id);
          broadcastPresence();
          break;
        }
        case 'location':
          updateLocation(ws, msg);
          break;
      }
    });

    ws.on('close', () => {
      if (ws.talkChannel != null) endTalk(ws.talkChannel);
      const set = byUser.get(user.id);
      set.delete(ws);
      if (set.size === 0) {
        byUser.delete(user.id);
        db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), user.id);
        broadcastPresence();
        scheduleChannels();
      }
    });
  });

  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);
}

function closeChannel(channelId) {
  const sp = speakers.get(channelId);
  if (sp) {
    clearTimeout(sp.timer);
    sp.ws.talkChannel = null;
    speakers.delete(channelId);
  }
  for (const ws of wss.clients) {
    if (ws.user) send(ws, { type: 'channel-removed', channelId });
    if (ws.watching === channelId) ws.watching = null;
  }
  scheduleChannels();
}

// มีคำขอเข้าองค์กร/ช่องใหม่ → แจ้งแอดมินองค์กร, ผู้ดูแลช่อง และ superadmin ให้โหลดรายการใหม่
function notifyRequests(orgId, channelId) {
  const managers = new Set(channelId
    ? db.prepare("SELECT user_id FROM channel_members WHERE channel_id = ? AND role IN ('owner', 'moderator')").all(channelId).map((r) => r.user_id)
    : []);
  for (const ws of wss.clients) {
    if (!ws.user) continue;
    if (A.isSuper(ws.user) || (orgId && A.isOrgAdmin(ws.user, orgId)) || managers.has(ws.user.id)) send(ws, { type: 'requests' });
  }
}

function notifySuper(msg) {
  for (const ws of wss.clients) if (ws.user && A.isSuper(ws.user)) send(ws, msg);
}

// แจ้งทุกคนเมื่อโปรไฟล์ผู้ใช้เปลี่ยน (ชื่อ/รูป)
function broadcastUser(userId) {
  const u = A.getUser(userId);
  if (!u) return;
  const msg = { type: 'user', user: A.publicUser(u) };
  for (const ws of wss.clients) if (ws.user && A.canSeeUser(ws.user, u)) send(ws, msg);
  // ตัวเองได้ข้อมูลเต็ม (สถานะองค์กร/บทบาท)
  for (const ws of socketsOf(u.id)) send(ws, { type: 'me', user: A.meDto(u) });
}

// ค่าตั้งของแอปเปลี่ยน → ทุกหน้าจอปรับชื่อ/ธีมทันที
function broadcastConfig(config) {
  for (const ws of wss.clients) if (ws.user) send(ws, { type: 'config', config });
}

module.exports = {
  broadcastUser, broadcastConfig, notifyRequests, notifySuper,
  init, sendToUser, sendToChannel, scheduleChannels, channelsForUser, addMessage,
  refreshUser, kickUser, closeChannel, broadcastAlert, onlineMap, broadcastPresence,
};
