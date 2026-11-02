// settings.js — ค่าตั้งของแอปที่ Super admin ปรับได้ (ค่าเริ่มต้นมาจาก env)
const { db } = require('./db');
const A = require('./access');

db.exec('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

const COLORS = ['emerald', 'teal', 'sky', 'blue', 'indigo', 'violet', 'rose', 'orange', 'amber'];

// ชนิดและขอบเขตของแต่ละค่า
const SCHEMA = {
  appName: { type: 'text', max: 40, def: () => process.env.APP_NAME || 'PTT วิทยุสื่อสาร' },
  shortName: { type: 'text', max: 12, def: () => 'PTT' },
  tagline: { type: 'text', max: 120, def: () => 'กดพูดแบบวิทยุสื่อสารผ่านอินเทอร์เน็ต' },
  primaryColor: { type: 'enum', values: COLORS, def: () => 'emerald' },
  themeMode: { type: 'enum', values: ['system', 'light', 'dark'], def: () => 'system' },
  navStyle: { type: 'enum', values: ['dark', 'brand', 'light'], def: () => 'dark' },
  logo: { type: 'file', def: () => null },
  allowRegister: { type: 'bool', def: () => process.env.ALLOW_REGISTER !== 'false' },
  allowCreateOrg: { type: 'bool', def: () => true },
  maxTalkSeconds: { type: 'int', min: 5, max: 300, def: () => Number(process.env.MAX_TALK_SECONDS) || 60 },
  sosTalkSeconds: { type: 'int', min: 0, max: 60, def: () => 15 },
  retentionDays: { type: 'int', min: 0, max: 3650, def: () => Number(process.env.RETENTION_DAYS) || 0 },
  supportContact: { type: 'text', max: 120, def: () => '' },
};

let cache = null;
function getSettings() {
  if (cache) return cache;
  const rows = Object.fromEntries(db.prepare('SELECT key, value FROM app_settings').all().map((r) => [r.key, JSON.parse(r.value)]));
  cache = Object.fromEntries(Object.entries(SCHEMA).map(([k, s]) => [k, k in rows ? rows[k] : s.def()]));
  return cache;
}

// ตรวจและบันทึกค่าที่ส่งมา คืนค่า error (ถ้ามี)
function updateSettings(patch) {
  const clean = {};
  for (const [k, v] of Object.entries(patch || {})) {
    const s = SCHEMA[k];
    if (!s || s.type === 'file') continue;
    if (s.type === 'text') {
      if (typeof v !== 'string') return `${k} ต้องเป็นข้อความ`;
      const t = v.trim().slice(0, s.max);
      if (!t && (k === 'appName' || k === 'shortName')) return 'ชื่อแอปห้ามว่าง';
      clean[k] = t;
    } else if (s.type === 'enum') {
      if (!s.values.includes(v)) return `${k} ไม่ถูกต้อง`;
      clean[k] = v;
    } else if (s.type === 'bool') {
      clean[k] = !!v;
    } else if (s.type === 'int') {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < s.min || n > s.max) return `${k} ต้องอยู่ระหว่าง ${s.min}-${s.max}`;
      clean[k] = n;
    }
  }
  const put = db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  db.transaction(() => Object.entries(clean).forEach(([k, v]) => put.run(k, JSON.stringify(v))))();
  cache = null;
  return null;
}

function setLogo(file) {
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('logo', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(file));
  cache = null;
}

// ค่าที่ส่งให้ทุกคน (รวมหน้าเข้าสู่ระบบ)
function publicConfig() {
  const s = getSettings();
  return {
    appName: s.appName,
    shortName: s.shortName,
    tagline: s.tagline,
    primaryColor: s.primaryColor,
    themeMode: s.themeMode,
    navStyle: s.navStyle,
    logo: A.avatarUrl(s.logo),
    allowRegister: s.allowRegister,
    allowCreateOrg: s.allowCreateOrg,
    maxTalkSeconds: s.maxTalkSeconds,
    sosTalkSeconds: s.sosTalkSeconds,
    supportContact: s.supportContact,
  };
}

module.exports = { getSettings, updateSettings, setLogo, publicConfig, COLORS };
