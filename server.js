// Badplaner VR – Server-Grundgerüst
// Läuft mit Node.js 22.13+ ohne zusätzliche Pakete (eingebautes SQLite, HTTP, Krypto).
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const ai = require('./ai');

// ---------- Einstellungen (über Umgebungsvariablen) ----------
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1'; // auf 1 setzen, sobald HTTPS läuft
const TRUST_PROXY = process.env.TRUST_PROXY === '1'; // 1 = hinter Caddy, echte Besucher-IP aus X-Forwarded-For
const SESSION_DAYS = 30;
const APP_VERSION = '2026-11-27.16';

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'badplaner.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  pw_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'berater' CHECK (role IN ('admin','berater')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  customer_name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  wishes_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'neu' CHECK (status IN ('neu','in_planung','angebot','auftrag','abgeschlossen')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  plan_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'manuell' CHECK (source IN ('manuell','ki')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_variants_project ON variants(project_id);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);
try { db.exec(`ALTER TABLE variants ADD COLUMN note TEXT NOT NULL DEFAULT ''`); } catch { /* Spalte existiert schon */ }
for (const col of [`kind TEXT NOT NULL DEFAULT 'foto'`, 'x REAL', 'z REAL', 'yaw REAL']) { try { db.exec('ALTER TABLE photos ADD COLUMN ' + col); } catch { /* existiert schon */ } }
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const getSetting = (k, d = '') => { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k); return r ? r.value : d; };
const setSetting = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);
const aiConfig = () => ({ key: getSetting('anthropic_key') || process.env.ANTHROPIC_API_KEY || '', model: getSetting('ai_model') || DEFAULT_MODEL, trends: getSetting('ai_trends'), webTrends: getSetting('web_trends'),
  openaiKey: getSetting('openai_key') || process.env.OPENAI_API_KEY || '', imageModel: getSetting('image_model'), imageQuality: getSetting('image_quality') || 'high',
  onModel: m => { setSetting('ai_model', m); console.log('KI-Modell automatisch gewechselt zu ' + m); } });
let trendsBusy = false;
async function runTrendRefresh() {
  if (trendsBusy) throw new ai.AiError(429, 'Die Trend-Recherche läuft gerade schon.');
  trendsBusy = true;
  try {
    const r = await ai.refreshTrends(aiConfig());
    setSetting('web_trends', r.text); setSetting('web_trends_sources', JSON.stringify(r.sources)); setSetting('web_trends_at', String(Date.now()));
    console.log(`Trends aktualisiert (${r.sources.length} Quellen)`);
    return r;
  } finally { trendsBusy = false; }
}
// Einmal pro Woche automatisch frische Trends holen (geprüft beim Start und alle 6 Stunden)
const trendCheck = () => {
  const c = aiConfig(), at = Number(getSetting('web_trends_at', '0'));
  if (c.key && Date.now() - at > 7 * 864e5) runTrendRefresh().catch(e => console.warn('Trend-Recherche fehlgeschlagen:', e.message));
};
setTimeout(trendCheck, 60000).unref();
setInterval(trendCheck, 6 * 36e5).unref();

// ---------- Passwörter & Sitzungen ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const want = Buffer.from(hashHex, 'hex');
  return want.length === hash.length && crypto.timingSafeEqual(hash, want);
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

// Erster Start: Admin aus Umgebungsvariablen anlegen
if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0) {
  const email = process.env.ADMIN_EMAIL, pw = process.env.ADMIN_PASSWORD;
  if (email && pw && pw.length >= 10) {
    db.prepare('INSERT INTO users (email, name, pw_hash, role) VALUES (?, ?, ?, ?)')
      .run(email, process.env.ADMIN_NAME || 'Admin', hashPassword(pw), 'admin');
    console.log(`Admin-Konto angelegt: ${email}`);
  } else {
    console.warn('Noch kein Benutzer vorhanden. Bitte ADMIN_EMAIL und ADMIN_PASSWORD (mind. 10 Zeichen) setzen und neu starten.');
  }
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha(token), userId, Date.now() + SESSION_DAYS * 864e5);
  return token;
}
function sessionUser(req) {
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const row = db.prepare(`SELECT u.id, u.email, u.name, u.role, s.expires_at FROM sessions s
    JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(sha(m[1]));
  if (!row || row.expires_at < Date.now()) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role, tokenHash: sha(m[1]) };
}
function cookie(token, maxAge) {
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${COOKIE_SECURE ? '; Secure' : ''}`;
}
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()), 36e5).unref();

// Einfacher Schutz gegen Passwort-Raten: max. 8 Versuche pro 10 Minuten und IP
const attempts = new Map();
function tooMany(ip) {
  const now = Date.now(), list = (attempts.get(ip) || []).filter(t => now - t < 6e5);
  attempts.set(ip, list);
  return list.length >= 8;
}

// ---------- Hilfsfunktionen ----------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
function send(res, status, data, headers = {}) {
  const body = data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function readJson(req, limit = 2e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new HttpError(413, 'Daten zu groß')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'Ungültiges JSON')); }
    });
    req.on('error', reject);
  });
}
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const STATUS = ['neu', 'in_planung', 'angebot', 'auftrag', 'abgeschlossen'];
function needUser(u) { if (!u) throw new HttpError(401, 'Bitte anmelden'); return u; }
function needAdmin(u) { needUser(u); if (u.role !== 'admin') throw new HttpError(403, 'Nur für Admins'); return u; }
function getProject(id) {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!p) throw new HttpError(404, 'Projekt nicht gefunden');
  return p;
}
function projectOut(p) {
  const { wishes_json, ...rest } = p;
  return { ...rest, wishes: JSON.parse(wishes_json || '{}') };
}
function variantOut(v, withPlan) {
  const { plan_json, ...rest } = v;
  return withPlan ? { ...rest, plan: JSON.parse(plan_json || '{}') } : rest;
}

// ---------- API-Routen ----------
const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>\\d+)') + '$'), fn });

route('GET', '/api/health', () => ({ ok: true, version: APP_VERSION }));

route('POST', '/api/login', async (req, res) => {
  const fwd = TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || req.socket.remoteAddress || '';
  if (tooMany(ip)) throw new HttpError(429, 'Zu viele Versuche. Bitte in 10 Minuten erneut probieren.');
  const { email, password } = await readJson(req);
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(str(email, 200));
  if (!u || !checkPassword(String(password || ''), u.pw_hash)) {
    attempts.get(ip).push(Date.now());
    throw new HttpError(401, 'E-Mail oder Passwort falsch');
  }
  const token = createSession(u.id);
  send(res, 200, { id: u.id, email: u.email, name: u.name, role: u.role, version: APP_VERSION }, { 'Set-Cookie': cookie(token, SESSION_DAYS * 86400) });
});
route('POST', '/api/logout', (req, res, u) => {
  if (u) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(u.tokenHash);
  send(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
});
route('GET', '/api/me', (req, res, u) => { needUser(u); const { tokenHash, ...me } = u; return { ...me, version: APP_VERSION }; });
route('POST', '/api/me/password', async (req, res, u) => {
  needUser(u);
  const { current, next } = await readJson(req);
  const row = db.prepare('SELECT pw_hash FROM users WHERE id = ?').get(u.id);
  if (!checkPassword(String(current || ''), row.pw_hash)) throw new HttpError(400, 'Aktuelles Passwort falsch');
  if (String(next || '').length < 10) throw new HttpError(400, 'Neues Passwort: mindestens 10 Zeichen');
  db.prepare('UPDATE users SET pw_hash = ? WHERE id = ?').run(hashPassword(next), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(u.id, u.tokenHash);
  return { ok: true };
});

// Team (nur Admin)
route('GET', '/api/users', (req, res, u) => { needAdmin(u); return db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY name').all(); });
route('POST', '/api/users', async (req, res, u) => {
  needAdmin(u);
  const b = await readJson(req), email = str(b.email, 200), name = str(b.name, 100), pw = String(b.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Ungültige E-Mail');
  if (!name) throw new HttpError(400, 'Name fehlt');
  if (pw.length < 10) throw new HttpError(400, 'Passwort: mindestens 10 Zeichen');
  const role = b.role === 'admin' ? 'admin' : 'berater';
  try {
    const r = db.prepare('INSERT INTO users (email, name, pw_hash, role) VALUES (?, ?, ?, ?)').run(email, name, hashPassword(pw), role);
    return { id: Number(r.lastInsertRowid), email, name, role };
  } catch { throw new HttpError(409, 'E-Mail ist schon vergeben'); }
});
route('DELETE', '/api/users/:id', (req, res, u, p) => {
  needAdmin(u);
  if (Number(p.id) === u.id) throw new HttpError(400, 'Du kannst dich nicht selbst löschen');
  db.prepare('DELETE FROM users WHERE id = ?').run(Number(p.id));
  return { ok: true };
});

// Kundenprojekte
route('GET', '/api/projects', (req, res, u) => {
  needUser(u);
  return db.prepare(`SELECT p.id, p.customer_name, p.address, p.status, p.updated_at,
      (SELECT COUNT(*) FROM variants v WHERE v.project_id = p.id) AS variant_count
    FROM projects p ORDER BY p.updated_at DESC`).all();
});
route('POST', '/api/projects', async (req, res, u) => {
  needUser(u);
  const b = await readJson(req), name = str(b.customer_name, 200);
  if (!name) throw new HttpError(400, 'Kundenname fehlt');
  const r = db.prepare(`INSERT INTO projects (customer_name, address, phone, email, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(name, str(b.address), str(b.phone, 60), str(b.email, 200), str(b.notes, 5000), u.id);
  const id = Number(r.lastInsertRowid);
  db.prepare('INSERT INTO variants (project_id, name) VALUES (?, ?)').run(id, 'Variante 1');
  return projectOut(getProject(id));
});
route('GET', '/api/projects/:id', (req, res, u, p) => {
  needUser(u);
  const proj = projectOut(getProject(Number(p.id)));
  proj.variants = db.prepare('SELECT * FROM variants WHERE project_id = ? ORDER BY id').all(proj.id).map(v => {
    let room = false; try { const pl = JSON.parse(v.plan_json || '{}'); room = Array.isArray(pl.pts) && pl.pts.length >= 3; } catch {}
    let plan = null; if (room) { try { plan = JSON.parse(v.plan_json); } catch {} }
    const ph = db.prepare(`SELECT id FROM photos WHERE variant_id = ? AND kind = 'foto' ORDER BY id DESC LIMIT 1`).get(v.id);
    const pc = db.prepare(`SELECT COUNT(*) AS n FROM photos WHERE variant_id = ? AND kind = 'pano'`).get(v.id).n;
    return { ...variantOut(v, false), has_room: room, plan, photo_id: ph ? ph.id : null, pano_count: pc };
  });
  return proj;
});
route('PUT', '/api/projects/:id', async (req, res, u, p) => {
  needUser(u);
  const cur = getProject(Number(p.id)), b = await readJson(req);
  const next = {
    customer_name: 'customer_name' in b ? str(b.customer_name, 200) || cur.customer_name : cur.customer_name,
    address: 'address' in b ? str(b.address) : cur.address,
    phone: 'phone' in b ? str(b.phone, 60) : cur.phone,
    email: 'email' in b ? str(b.email, 200) : cur.email,
    notes: 'notes' in b ? str(b.notes, 5000) : cur.notes,
    status: STATUS.includes(b.status) ? b.status : cur.status,
    wishes_json: b.wishes && typeof b.wishes === 'object' ? JSON.stringify(b.wishes) : cur.wishes_json,
  };
  db.prepare(`UPDATE projects SET customer_name=?, address=?, phone=?, email=?, notes=?, status=?, wishes_json=?, updated_at=datetime('now') WHERE id=?`)
    .run(next.customer_name, next.address, next.phone, next.email, next.notes, next.status, next.wishes_json, cur.id);
  return projectOut(getProject(cur.id));
});
route('DELETE', '/api/projects/:id', (req, res, u, p) => {
  needUser(u); getProject(Number(p.id));
  db.prepare('DELETE FROM projects WHERE id = ?').run(Number(p.id));
  return { ok: true };
});

// Varianten (Planungsstände)
function getVariant(id) {
  const v = db.prepare('SELECT * FROM variants WHERE id = ?').get(id);
  if (!v) throw new HttpError(404, 'Variante nicht gefunden');
  return v;
}
function touch(projectId) { db.prepare(`UPDATE projects SET updated_at = datetime('now') WHERE id = ?`).run(projectId); }
route('POST', '/api/projects/:id/variants', async (req, res, u, p) => {
  needUser(u);
  const proj = getProject(Number(p.id)), b = await readJson(req);
  let plan = b.plan && typeof b.plan === 'object' ? b.plan : {};
  if (b.copy_from) plan = JSON.parse(getVariant(Number(b.copy_from)).plan_json);
  const n = db.prepare('SELECT COUNT(*) AS n FROM variants WHERE project_id = ?').get(proj.id).n;
  const r = db.prepare('INSERT INTO variants (project_id, name, plan_json) VALUES (?, ?, ?)')
    .run(proj.id, str(b.name, 100) || `Variante ${n + 1}`, JSON.stringify(plan));
  touch(proj.id);
  return variantOut(getVariant(Number(r.lastInsertRowid)), false);
});
route('GET', '/api/variants/:id', (req, res, u, p) => {
  needUser(u);
  const v = getVariant(Number(p.id)), proj = getProject(v.project_id);
  return { ...variantOut(v, true), customer_name: proj.customer_name };
});
route('PUT', '/api/variants/:id', async (req, res, u, p) => {
  needUser(u);
  const v = getVariant(Number(p.id)), b = await readJson(req);
  const name = 'name' in b ? str(b.name, 100) || v.name : v.name;
  const plan = b.plan && typeof b.plan === 'object' ? JSON.stringify(b.plan) : v.plan_json;
  db.prepare(`UPDATE variants SET name=?, plan_json=?, updated_at=datetime('now') WHERE id=?`).run(name, plan, v.id);
  touch(v.project_id);
  return variantOut(getVariant(v.id), false);
});
route('DELETE', '/api/variants/:id', (req, res, u, p) => {
  needUser(u);
  const v = getVariant(Number(p.id));
  if (db.prepare('SELECT COUNT(*) AS n FROM variants WHERE project_id = ?').get(v.project_id).n <= 1) throw new HttpError(400, 'Die letzte Variante kann nicht gelöscht werden');
  db.prepare('DELETE FROM variants WHERE id = ?').run(v.id);
  touch(v.project_id);
  return { ok: true };
});

// Server-Status: Update-Prüfung (Datei vom Host, schreibgeschützt eingebunden)
route('GET', '/api/system', (req, res, u) => {
  needAdmin(u);
  const dir = process.env.STATUS_DIR || '/app/status';
  let status = null, log = '';
  try { status = JSON.parse(fs.readFileSync(path.join(dir, 'status.json'), 'utf8')); } catch {}
  try { log = fs.readFileSync(path.join(dir, 'update.log'), 'utf8').split('\n').slice(-40).join('\n'); } catch {}
  return { version: APP_VERSION, update: status, log };
});

// KI-Einstellungen (nur Admin)
route('GET', '/api/settings', (req, res, u) => {
  needAdmin(u);
  const c = aiConfig();
  let sources = []; try { sources = JSON.parse(getSetting('web_trends_sources', '[]')); } catch {}
  return { has_key: !!c.key, key_hint: c.key ? c.key.slice(0, 10) + '…' + c.key.slice(-4) : '', model: c.model, trends: c.trends,
    web_trends: c.webTrends, web_trends_sources: sources, web_trends_at: Number(getSetting('web_trends_at', '0')) || null,
    has_openai: !!c.openaiKey, openai_hint: c.openaiKey ? c.openaiKey.slice(0, 7) + '…' + c.openaiKey.slice(-4) : '', image_model: c.imageModel, image_quality: c.imageQuality };
});
route('PUT', '/api/settings', async (req, res, u) => {
  needAdmin(u);
  const b = await readJson(req);
  let moved = null;
  // OpenAI-Schlüssel versehentlich im Anthropic-Feld? Automatisch richtig zuordnen.
  if (typeof b.key === 'string' && /^sk-/.test(b.key.trim()) && !/^sk-ant-/.test(b.key.trim())) { if (!b.openai_key) b.openai_key = b.key; b.key = ''; moved = 'openai'; }
  if (typeof b.openai_key === 'string' && /^sk-ant-/.test(b.openai_key.trim())) { if (!b.key) b.key = b.openai_key; b.openai_key = ''; moved = 'anthropic'; }
  if (typeof b.key === 'string' && b.key.trim()) {
    const k = b.key.trim();
    if (!/^sk-ant-[A-Za-z0-9_\-]{20,}$/.test(k)) throw new HttpError(400, 'Der Schlüssel muss mit sk-ant- beginnen.');
    setSetting('anthropic_key', k);
    if (!getSetting('web_trends')) setTimeout(() => runTrendRefresh().catch(e => console.warn('Trend-Recherche fehlgeschlagen:', e.message)), 2000);
  }
  if (b.remove_key === true) setSetting('anthropic_key', '');
  if (typeof b.openai_key === 'string' && b.openai_key.trim()) {
    const k = b.openai_key.trim();
    if (!/^sk-[A-Za-z0-9_\-]{20,}$/.test(k)) throw new HttpError(400, 'Der OpenAI-Schlüssel sieht unvollständig aus. Er beginnt mit sk- und ist sehr lang. Bitte komplett kopieren.');
    setSetting('openai_key', k);
  }
  if (typeof b.image_model === 'string') setSetting('image_model', str(b.image_model, 80));
  if (['low', 'medium', 'high'].includes(b.image_quality)) setSetting('image_quality', b.image_quality);
  if (typeof b.model === 'string') setSetting('ai_model', str(b.model, 80) || DEFAULT_MODEL);
  if (typeof b.trends === 'string') setSetting('ai_trends', b.trends.slice(0, 6000));
  return { ok: true, moved };
});
route('POST', '/api/settings/trends', async (req, res, u) => {
  needAdmin(u);
  try { const r = await runTrendRefresh(); return { ok: true, sources: r.sources.length }; } catch (e) { throw new HttpError(e.status || 500, e.message); }
});
route('POST', '/api/settings/test-image', async (req, res, u) => {
  needAdmin(u);
  try { return await ai.testImage(aiConfig()); } catch (e) { throw new HttpError(e.status || 500, e.message); }
});
route('POST', '/api/settings/test', async (req, res, u) => {
  needAdmin(u);
  try { return await ai.test(aiConfig()); } catch (e) { throw new HttpError(e.status || 500, e.message); }
});

// KI-Planung: Entwürfe aus Kundenwünschen und Grundriss
let aiBusy = 0;
route('POST', '/api/projects/:id/ai-design', async (req, res, u, p) => {
  needUser(u);
  const proj = getProject(Number(p.id)), b = await readJson(req);
  const v = getVariant(Number(b.base_variant_id));
  if (v.project_id !== proj.id) throw new HttpError(400, 'Variante gehört nicht zu diesem Projekt');
  const base = JSON.parse(v.plan_json || '{}');
  if (aiBusy >= 3) throw new HttpError(429, 'Es laufen gerade schon mehrere KI-Planungen. Bitte kurz warten.');
  aiBusy++;
  let drafts;
  try { drafts = await ai.design(aiConfig(), base, JSON.parse(proj.wishes_json || '{}'), Math.min(Math.max(Number(b.count) || 3, 1), 5)); }
  catch (e) { throw new HttpError(e.status || 500, e.message || 'KI-Fehler'); }
  finally { aiBusy--; }
  const ins = db.prepare(`INSERT INTO variants (project_id, name, plan_json, source, note) VALUES (?, ?, ?, 'ki', ?)`);
  const created = drafts.map(d => Number(ins.run(proj.id, d.name, JSON.stringify(d.plan), d.note).lastInsertRowid));
  if (proj.status === 'neu') db.prepare(`UPDATE projects SET status = 'in_planung' WHERE id = ?`).run(proj.id);
  touch(proj.id);
  return { created, hinweise: drafts.map(d => d.hinweise) };
});
// KI-Fotos
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
fs.mkdirSync(PHOTO_DIR, { recursive: true });
let photoBusy = 0;
// Aufräumen: Fotodateien ohne Eintrag (z. B. nach gelöschten Projekten) entfernen
setTimeout(() => { try {
  const known = new Set(db.prepare('SELECT file FROM photos').all().map(r => r.file));
  fs.readdirSync(PHOTO_DIR).forEach(f => { if (!known.has(f)) fs.rm(path.join(PHOTO_DIR, f), () => {}); });
} catch (e) { console.warn('Foto-Aufräumen:', e.message); } }, 30000).unref();
async function makePhoto(req, u, p, kind) {
  needUser(u);
  const v = getVariant(Number(p.id)), b = await readJson(req, 12e6);
  if (photoBusy >= 2) throw new HttpError(429, 'Es werden gerade schon Fotos erstellt. Bitte kurz warten.');
  photoBusy++;
  let buf;
  try { buf = await ai.photo(aiConfig(), b.image, JSON.parse(v.plan_json || '{}'), kind); }
  catch (e) { throw new HttpError(e.status || 500, e.message || 'Fehler bei der Bild-KI'); }
  finally { photoBusy--; }
  const file = `v${v.id}-${kind}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
  fs.writeFileSync(path.join(PHOTO_DIR, file), buf);
  const num = x => (Number.isFinite(Number(x)) ? Number(x) : null);
  const id = Number(db.prepare('INSERT INTO photos (variant_id, file, kind, x, z, yaw) VALUES (?, ?, ?, ?, ?, ?)').run(v.id, file, kind, num(b.x), num(b.z), num(b.yaw)).lastInsertRowid);
  touch(v.project_id);
  return { id };
}
route('POST', '/api/variants/:id/photo', (req, res, u, p) => makePhoto(req, u, p, 'foto'));
route('POST', '/api/variants/:id/pano', (req, res, u, p) => makePhoto(req, u, p, 'pano'));
route('GET', '/api/variants/:id/photos', (req, res, u, p) => {
  needUser(u); getVariant(Number(p.id));
  return db.prepare('SELECT id, kind, x, z, yaw, created_at FROM photos WHERE variant_id = ? ORDER BY id DESC').all(Number(p.id));
});
route('GET', '/api/photos/:id', (req, res, u, p) => {
  needUser(u);
  const ph = db.prepare('SELECT * FROM photos WHERE id = ?').get(Number(p.id));
  if (!ph) throw new HttpError(404, 'Foto nicht gefunden');
  const f = path.join(PHOTO_DIR, path.basename(ph.file));
  if (!fs.existsSync(f)) throw new HttpError(404, 'Fotodatei fehlt');
  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' });
  fs.createReadStream(f).pipe(res);
});
route('DELETE', '/api/photos/:id', (req, res, u, p) => {
  needUser(u);
  const ph = db.prepare('SELECT * FROM photos WHERE id = ?').get(Number(p.id));
  if (!ph) throw new HttpError(404, 'Foto nicht gefunden');
  db.prepare('DELETE FROM photos WHERE id = ?').run(ph.id);
  fs.rm(path.join(PHOTO_DIR, path.basename(ph.file)), () => {});
  return { ok: true };
});

// ---------- Statische Dateien ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon' };
function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'xr-spatial-tracking=(self)');
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res);
  }
  // Schutz gegen fremde Webseiten (CSRF): schreibende Anfragen nur als JSON
  if (req.method !== 'GET' && !(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'Bitte JSON senden' });
  for (const r of routes) {
    const m = r.method === req.method && r.re.exec(url.pathname);
    if (!m) continue;
    try {
      const out = await r.fn(req, res, sessionUser(req), m.groups || {});
      if (!res.headersSent) send(res, 200, out);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      if (!res.headersSent) send(res, e.status || 500, { error: e instanceof HttpError ? e.message : 'Serverfehler' });
    }
    return;
  }
  send(res, 404, { error: 'Unbekannte Adresse' });
});
server.listen(PORT, () => console.log(`Badplaner läuft auf http://localhost:${PORT}`));
