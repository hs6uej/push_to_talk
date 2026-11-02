// server.js — ประกอบ REST API + WebSocket + static frontend สำหรับ PTT (แนว Zello, หลายองค์กร)
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { db, AUDIO_DIR, FILES_DIR } = require('./db');
const rt = require('./realtime');
const H = require('./http');

const PORT = process.env.PORT || 8080;
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, 'public');
const { getSettings, publicConfig } = require('./settings');

const app = express();
app.set('trust proxy', 'loopback, uniquelocal');
app.use(express.json({ limit: '64kb' }));
const server = http.createServer(app);

app.use('/api', require('./routes/account').router);
app.use('/api', require('./routes/channels').router);
app.use('/api', require('./routes/orgs').router);
app.use('/api', require('./routes/safety').router);
app.use('/api', require('./routes/admin').router);
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

// ---------- static frontend ----------
// manifest + index.html ใช้ชื่อแอป/โลโก้/สีจากค่าตั้งของ Super admin
const THEME_HEX = { emerald: '#059669', teal: '#0d9488', sky: '#0284c7', blue: '#2563eb', indigo: '#4f46e5', violet: '#7c3aed', rose: '#e11d48', orange: '#ea580c', amber: '#d97706' };
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

app.get('/manifest.webmanifest', (req, res) => {
  const c = publicConfig();
  const icon = c.logo ? { src: c.logo, sizes: '320x320', type: 'image/jpeg', purpose: 'any' } : { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' };
  res.set('Cache-Control', 'no-cache');
  res.type('application/manifest+json').send(JSON.stringify({
    name: c.appName, short_name: c.shortName, description: c.tagline, start_url: '/', display: 'standalone', orientation: 'portrait',
    background_color: '#0f172a', theme_color: THEME_HEX[c.primaryColor] || '#0f172a', icons: [icon],
  }));
});

app.use(express.static(STATIC_DIR, { index: false, maxAge: '1h' }));
app.get(/^\/(?!api\/|ws).*/, (req, res, next) => {
  const index = path.join(STATIC_DIR, 'index.html');
  if (!fs.existsSync(index)) return next();
  const c = publicConfig();
  let html = fs.readFileSync(index, 'utf8')
    .replace(/<title>[^<]*<\/title>/, `<title>${escHtml(c.appName)}</title>`)
    .replace(/<meta name="theme-color" content="[^"]*"/, `<meta name="theme-color" content="${THEME_HEX[c.primaryColor] || '#0f172a'}"`);
  if (c.logo) html = html.replace(/href="\/icon\.svg"/g, `href="${c.logo}"`);
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(html);
});

// ---------- เก็บข้อมูลตามระยะเวลา (RETENTION_DAYS) ----------
function purgeOld() {
  const RETENTION_DAYS = getSettings().retentionDays;
  if (!RETENTION_DAYS) return;
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  const files = db.prepare('SELECT kind, file FROM messages WHERE created_at < ? AND file IS NOT NULL').all(cutoff);
  db.prepare('DELETE FROM messages WHERE created_at < ?').run(cutoff);
  db.prepare('DELETE FROM locations WHERE created_at < ?').run(cutoff);
  files.forEach((f) => fs.rm(path.join(f.kind === 'audio' ? AUDIO_DIR : FILES_DIR, f.file), { force: true }, () => {}));
  if (files.length) console.log(`Retention: removed ${files.length} files older than ${RETENTION_DAYS} days`);
}
purgeOld();
setInterval(purgeOld, 6 * 3600 * 1000);

rt.init(server, H.userFromToken);
server.listen(PORT, () => console.log(`PTT server listening on port ${PORT}`));
