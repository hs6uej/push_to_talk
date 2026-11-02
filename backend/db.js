// db.js — SQLite schema, migrations และ helper ด้านสิทธิ์
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const AUDIO_DIR = path.join(DATA_DIR, 'audio');
const FILES_DIR = path.join(DATA_DIR, 'files');
const AVATAR_DIR = path.join(DATA_DIR, 'avatars');
fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(FILES_DIR, { recursive: true });
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'ptt.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const tableExists = (name) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
const columnExists = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
const ensureColumn = (table, col, def) => {
  if (!columnExists(table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
};

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL
  );
`);
ensureColumn('users', 'display_name', 'TEXT');
ensureColumn('users', 'disabled', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'status', "TEXT NOT NULL DEFAULT 'available'");
ensureColumn('users', 'last_seen', 'INTEGER');
ensureColumn('users', 'loc_lat', 'REAL');
ensureColumn('users', 'loc_lng', 'REAL');
ensureColumn('users', 'loc_acc', 'REAL');
ensureColumn('users', 'loc_speed', 'REAL');
ensureColumn('users', 'loc_heading', 'REAL');
ensureColumn('users', 'loc_battery', 'REAL');
ensureColumn('users', 'loc_charging', 'INTEGER');
ensureColumn('users', 'loc_at', 'INTEGER');
ensureColumn('users', 'avatar', 'TEXT');

db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'channel',          -- channel | direct
    visibility TEXT NOT NULL DEFAULT 'public',     -- public | private
    emergency INTEGER NOT NULL DEFAULT 0,          -- ช่องรับ SOS
    direct_key TEXT UNIQUE,                        -- "minId:maxId" สำหรับแชท 1:1
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS channel_members (
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',           -- owner | moderator | member | listener
    last_read_id INTEGER NOT NULL DEFAULT 0,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (channel_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_members_user ON channel_members(user_id);
`);

// ย้ายข้อมูลจาก schema เดิม (rooms + messages.room_id)
if (tableExists('rooms')) {
  db.transaction(() => {
    db.exec(`INSERT OR IGNORE INTO channels (id, name, created_by, created_at)
             SELECT id, name, created_by, created_at FROM rooms`);
    if (tableExists('messages') && columnExists('messages', 'room_id')) {
      db.exec('ALTER TABLE messages RENAME TO messages_old');
    }
  })();
}

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    kind TEXT NOT NULL,                            -- audio | text | image | location | sos | system
    text TEXT,
    transcript TEXT,
    file TEXT,
    duration_ms INTEGER,
    lat REAL,
    lng REAL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, id);
  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    acc REAL,
    speed REAL,
    battery REAL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_locations_user ON locations(user_id, created_at);

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
    lat REAL,
    lng REAL,
    note TEXT,
    created_at INTEGER NOT NULL,
    acked_by TEXT,
    acked_at INTEGER,
    resolved_by TEXT,
    resolved_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    detail TEXT,
    ip TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
`);

if (tableExists('messages_old')) {
  db.transaction(() => {
    db.exec(`INSERT INTO messages (channel_id, user_id, username, kind, transcript, file, duration_ms, created_at)
             SELECT room_id, user_id, username, 'audio', transcript, audio_file, duration_ms, created_at FROM messages_old`);
    db.exec('DROP TABLE messages_old');
  })();
}
if (tableExists('rooms')) db.exec('DROP TABLE rooms');

// ---------- องค์กร (multi-tenant) ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS orgs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    code TEXT NOT NULL UNIQUE,                     -- รหัส/QR สำหรับขอเข้าองค์กร
    status TEXT NOT NULL DEFAULT 'pending',        -- pending | active | suspended | rejected
    allow_external INTEGER NOT NULL DEFAULT 1,     -- สมาชิกเข้ากลุ่มสาธารณะ/คุยกับคนนอกได้
    avatar TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    approved_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS friendships (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, friend_id)
  );
  CREATE TABLE IF NOT EXISTS join_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,                            -- org | channel
    org_id INTEGER REFERENCES orgs(id) ON DELETE CASCADE,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',        -- pending | approved | rejected
    created_at INTEGER NOT NULL,
    decided_by TEXT,
    decided_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_requests_org ON join_requests(org_id, status);
`);
ensureColumn('users', 'org_id', 'INTEGER REFERENCES orgs(id) ON DELETE SET NULL');
ensureColumn('users', 'org_role', "TEXT NOT NULL DEFAULT 'member'");   // admin | dispatcher | member
ensureColumn('users', 'org_status', 'TEXT');                             // pending | active
ensureColumn('users', 'friend_code', 'TEXT');
ensureColumn('channels', 'avatar', 'TEXT');
ensureColumn('channels', 'org_id', 'INTEGER REFERENCES orgs(id) ON DELETE CASCADE');
ensureColumn('channels', 'invite_code', 'TEXT');
ensureColumn('channels', 'is_default', 'INTEGER NOT NULL DEFAULT 0');  // เข้าร่วมอัตโนมัติ (ห้องรวม/ฉุกเฉิน)
ensureColumn('audit_log', 'org_id', 'INTEGER');
ensureColumn('alerts', 'org_id', 'INTEGER');
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_friend_code ON users(friend_code);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_invite ON channels(invite_code);
  CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
  CREATE INDEX IF NOT EXISTS idx_channels_org ON channels(org_id);
`);

// รหัสสุ่มอ่านง่าย (ไม่มี 0/O/1/I)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(len = 8) {
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}
function uniqueCode(table, col, len = 8) {
  for (;;) {
    const c = randomCode(len);
    if (!db.prepare(`SELECT 1 FROM ${table} WHERE ${col} = ?`).get(c)) return c;
  }
}

// ข้อมูลเดิม: admin → superadmin, dispatcher → ผู้ใช้ทั่วไป, ทุกคนได้รหัสเพื่อน, ทุกช่องได้รหัสเชิญ
db.transaction(() => {
  db.prepare("UPDATE users SET role = 'superadmin' WHERE role = 'admin'").run();
  db.prepare("UPDATE users SET role = 'user' WHERE role NOT IN ('superadmin', 'user')").run();
  for (const u of db.prepare('SELECT id FROM users WHERE friend_code IS NULL').all()) {
    db.prepare('UPDATE users SET friend_code = ? WHERE id = ?').run(uniqueCode('users', 'friend_code'), u.id);
  }
  for (const c of db.prepare("SELECT id FROM channels WHERE invite_code IS NULL AND type = 'channel'").all()) {
    db.prepare('UPDATE channels SET invite_code = ? WHERE id = ?').run(uniqueCode('channels', 'invite_code'), c.id);
  }
})();

function audit(user, action, detail, ip, orgId) {
  db.prepare('INSERT INTO audit_log (user_id, username, action, detail, ip, org_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(user ? user.id : null, user ? user.username : null, action,
      detail == null ? null : typeof detail === 'string' ? detail : JSON.stringify(detail), ip || null,
      orgId !== undefined ? orgId : user ? user.org_id || null : null, Date.now());
}

// สร้างช่องพร้อมรหัสเชิญ
function createChannel({ name, description = '', visibility = 'public', orgId = null, emergency = 0, isDefault = 0, createdBy = null }) {
  const info = db.prepare(`INSERT INTO channels (name, description, visibility, org_id, emergency, is_default, invite_code, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(name, description, visibility, orgId, emergency ? 1 : 0, isDefault ? 1 : 0, uniqueCode('channels', 'invite_code'), createdBy, Date.now());
  return info.lastInsertRowid;
}

// สร้างบัญชี superadmin และช่องสาธารณะเริ่มต้นครั้งแรก
function seed() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin1234';
  if (!db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    db.prepare('INSERT INTO users (username, password_hash, role, friend_code, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(username, bcrypt.hashSync(password, 10), 'superadmin', uniqueCode('users', 'friend_code'), Date.now());
    console.log(`Created superadmin user "${username}"`);
  }
  if (!db.prepare("SELECT id FROM channels WHERE type = 'channel' AND org_id IS NULL AND emergency = 0 LIMIT 1").get()) {
    createChannel({ name: 'ห้องรวม', description: 'ช่องสาธารณะสำหรับทุกคน', isDefault: 1 });
  }
  if (!db.prepare('SELECT id FROM channels WHERE emergency = 1 AND org_id IS NULL').get()) {
    createChannel({ name: 'ฉุกเฉิน', description: 'ช่องรับแจ้งเหตุ SOS', emergency: 1, isDefault: 1 });
  }
  // ทำครั้งเดียวตอนอัปเกรด: ช่องสาธารณะเดิมเป็นช่องเข้าร่วมอัตโนมัติ (หลังจากนั้น Super admin เป็นคนเลือกเอง)
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
  if (!db.prepare("SELECT 1 FROM meta WHERE key = 'public_defaults_migrated'").get()) {
    db.prepare("UPDATE channels SET is_default = 1 WHERE org_id IS NULL AND type = 'channel' AND id = (SELECT MIN(id) FROM channels WHERE org_id IS NULL AND type = 'channel' AND emergency = 0)").run();
    db.prepare("UPDATE channels SET is_default = 1 WHERE org_id IS NULL AND emergency = 1").run();
    db.prepare("INSERT INTO meta (key, value) VALUES ('public_defaults_migrated', '1')").run();
  }
}
seed();

module.exports = { db, audit, createChannel, uniqueCode, AUDIO_DIR, FILES_DIR, AVATAR_DIR, DATA_DIR };
