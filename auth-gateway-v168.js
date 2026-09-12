const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
let UndiciAgent = null;
try { UndiciAgent = require('undici').Agent; } catch (_) { UndiciAgent = null; }

const originalCreateServer = http.createServer.bind(http);
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DATA_FILE = process.env.SCHULDEN_DATA_FILE || path.join(DATA_DIR, 'schulden-sync.json');
const COOKIE_NAME = 'schulden_auth';
const SESSION_HOURS = 12;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX = 8;
const attempts = new Map();

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendHtml(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  });
  res.end(body);
}

function sendFile(res, file, contentType) {
  const full = path.join(ROOT, file);
  fs.readFile(full, (err, data) => {
    if (err) return sendJson(res, 404, { ok: false, error: 'Datei nicht gefunden' });
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(data);
  });
}

function readBody(req, limit = 32 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Anfrage zu groß'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const key = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    if (key) out[key] = val;
  });
  return out;
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sessionSecret() {
  return String(process.env.AUTH_SESSION_SECRET || '').trim();
}

function signPayload(payload) {
  const secret = sessionSecret();
  if (!secret) return '';
  const data = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return data + '.' + sig;
}

function verifyToken(token) {
  try {
    const secret = sessionSecret();
    if (!secret || !token || !token.includes('.')) return null;
    const [data, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    const a = Buffer.from(sig || '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload || !payload.role || !payload.exp || Date.now() >= Number(payload.exp)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function currentSession(req) {
  return verifyToken(parseCookies(req)[COOKIE_NAME]);
}

function secureRequest(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return proto === 'https' || /\.railway\.app(?::\d+)?$/i.test(String(req.headers.host || ''));
}

function setSession(res, role, username, req) {
  const exp = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const token = signPayload({ role, user: username, exp });
  let cookie = `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}`;
  if (secureRequest(req)) cookie += '; Secure';
  res.setHeader('Set-Cookie', cookie);
}

function clearSession(res, req) {
  let cookie = `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  if (secureRequest(req)) cookie += '; Secure';
  res.setHeader('Set-Cookie', cookie);
}

function safeEqualText(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function creds(role) {
  if (role === 'admin') {
    return {
      username: String(process.env.ADMIN_USERNAME || 'admin'),
      password: String(process.env.ADMIN_PASSWORD || '')
    };
  }
  return {
    username: String(process.env.ADVISOR_USERNAME || 'berater'),
    password: String(process.env.ADVISOR_PASSWORD || '')
  };
}

function configured(role) {
  const c = creds(role);
  return Boolean(sessionSecret() && c.username && c.password);
}

function clientKey(req, role) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  return role + ':' + ip;
}

function rateLimited(req, role, success = false) {
  const key = clientKey(req, role);
  const now = Date.now();
  if (success) { attempts.delete(key); return false; }
  let row = attempts.get(key);
  if (!row || now - row.start > LOGIN_WINDOW_MS) row = { start: now, count: 0 };
  row.count += 1;
  attempts.set(key, row);
  return row.count > LOGIN_MAX;
}

function loginPage() {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Schulden Manager · Anmeldung</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 20% 10%,#143250 0,#091421 42%,#050b12 100%);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#eef7ff;padding:22px}.card{width:min(430px,100%);padding:30px;border:1px solid rgba(255,255,255,.11);border-radius:26px;background:linear-gradient(145deg,rgba(20,40,61,.82),rgba(8,18,29,.9));box-shadow:0 30px 80px rgba(0,0,0,.42);backdrop-filter:blur(24px)}.logo{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;font-weight:800;background:linear-gradient(145deg,#58b8ff,#205b9b);box-shadow:inset 0 1px rgba(255,255,255,.35),0 10px 30px rgba(39,130,205,.25)}h1{font-size:28px;margin:18px 0 5px}p{color:#9fb3c8;margin:0 0 22px}.field{display:grid;gap:7px;margin:14px 0}.field label{font-size:12px;color:#a9bdd0}.field input{width:100%;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:#0a1724;color:white;padding:13px 14px;outline:none}.field input:focus{border-color:#55b7ff;box-shadow:0 0 0 3px rgba(85,183,255,.12)}button{width:100%;margin-top:8px;border:0;border-radius:14px;padding:13px 16px;font-weight:750;color:#04111d;background:linear-gradient(135deg,#7fd4ff,#45aaff);cursor:pointer}.msg{min-height:21px;margin-top:12px;color:#ff9a9a;font-size:13px}.small{margin-top:22px;font-size:12px;color:#7790a8;text-align:center}a{color:#7fcfff;text-decoration:none}</style></head><body><main class="card"><div class="logo">SM</div><h1>Admin-Anmeldung</h1><p>Deine normale Schulden-App. Nach der Anmeldung bleibt die Oberfläche unverändert.</p><form id="f"><div class="field"><label>Benutzername</label><input id="u" autocomplete="username" required></div><div class="field"><label>Passwort</label><input id="p" type="password" autocomplete="current-password" required></div><button>Anmelden</button><div class="msg" id="m"></div></form><div class="small">Schuldnerberater? <a href="/berater">Zum Nur-Lesen-Bereich</a></div></main><script>
  const f=document.getElementById('f'),m=document.getElementById('m');f.addEventListener('submit',async e=>{e.preventDefault();m.textContent='Anmeldung wird geprüft…';const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('u').value,password:document.getElementById('p').value})});const d=await r.json().catch(()=>({}));if(!r.ok){m.textContent=d.error||'Anmeldung fehlgeschlagen';return}location.replace('/')});
</script></body></html>`;
}

function readSyncData() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      updatedAt: String(raw.updatedAt || ''),
      clientId: String(raw.clientId || ''),
      debts: Array.isArray(raw.debts) ? raw.debts : []
    };
  } catch (_) {
    return { updatedAt: '', clientId: '', debts: [] };
  }
}

function sanitize(value, depth = 0) {
  if (depth > 7) return null;
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (/^data:/i.test(value)) return null;
    return value.length > 20000 ? value.slice(0, 20000) : value;
  }
  if (Array.isArray(value)) return value.slice(0, 500).map(v => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (/(?:password|passwort|token|secret|api.?key|client.?secret)/i.test(key)) continue;
      out[key] = sanitize(val, depth + 1);
    }
    return out;
  }
  return null;
}

function paperlessId(link) {
  if (link == null) return '';
  if (typeof link === 'number' || /^\d+$/.test(String(link))) return String(link);
  if (typeof link !== 'object') return '';
  const direct = link.id ?? link.documentId ?? link.paperlessId ?? link.paperless_id ?? link.document_id;
  if (direct != null && /^\d+$/.test(String(direct))) return String(direct);
  const url = String(link.url || link.href || link.downloadUrl || '');
  const m = url.match(/documents\/(\d+)/i) || url.match(/\/(\d+)(?:\/|$)/);
  return m ? m[1] : '';
}

function allowedPaperlessIds() {
  const ids = new Set();
  const { debts } = readSyncData();
  for (const debt of debts) {
    for (const key of ['paperlessLinks', 'paperlessDocuments']) {
      const list = Array.isArray(debt && debt[key]) ? debt[key] : [];
      for (const link of list) {
        const id = paperlessId(link);
        if (id) ids.add(id);
      }
    }
  }
  return ids;
}

function cleanPaperlessBase(value) {
  let raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const u = new URL(raw);
    let p = (u.pathname || '').replace(/\/+$/, '');
    p = p.replace(/\/accounts\/login.*$/i, '').replace(/\/dashboard$/i, '').replace(/\/api(?:\/.*)?$/i, '');
    u.pathname = p || '/'; u.search = ''; u.hash = '';
    return u.toString().replace(/\/+$/, '');
  } catch (_) {
    return raw.replace(/\/dashboard$/i, '').replace(/\/api$/i, '').replace(/\/+$/, '');
  }
}

async function proxyPaperless(req, res, id) {
  if (!/^\d+$/.test(id || '')) return sendJson(res, 400, { ok: false, error: 'Ungültige Dokument-ID' });
  if (!allowedPaperlessIds().has(String(id))) return sendJson(res, 403, { ok: false, error: 'Dieses Dokument ist für den Beraterbereich nicht freigegeben.' });

  const base = cleanPaperlessBase(process.env.PAPERLESS_URL || process.env.PAPERLESS_BASE_URL || '');
  const token = String(process.env.PAPERLESS_TOKEN || process.env.PAPERLESS_API_TOKEN || '').trim();
  if (!base || !token) return sendJson(res, 503, { ok: false, error: 'Paperless ist nicht konfiguriert.' });

  const headers = { Authorization: 'Token ' + token, Accept: 'application/pdf,application/octet-stream' };
  if (req.headers.range) headers.Range = req.headers.range;
  const options = { method: 'GET', headers, redirect: 'follow' };
  const insecure = /^(1|true|yes|ja)$/i.test(String(process.env.PAPERLESS_ALLOW_SELF_SIGNED || process.env.PAPERLESS_INSECURE_TLS || ''));
  if (insecure && /^https:/i.test(base)) {
    if (UndiciAgent) options.dispatcher = new UndiciAgent({ connect: { rejectUnauthorized: false } });
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  let response;
  try {
    response = await fetch(base + '/api/documents/' + id + '/download/', options);
  } catch (err) {
    return sendJson(res, 502, { ok: false, error: 'Paperless nicht erreichbar', details: String(err && (err.cause?.code || err.message || err)).slice(0, 300) });
  }
  if (!response.ok && response.status !== 206) {
    const text = await response.text().catch(() => '');
    return sendJson(res, response.status, { ok: false, error: 'Paperless Fehler ' + response.status, details: text.slice(0, 300) });
  }

  const out = {
    'Content-Type': response.headers.get('content-type') || 'application/pdf',
    'Content-Disposition': response.headers.get('content-disposition') || `inline; filename="paperless-${id}.pdf"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  };
  for (const h of ['content-length', 'content-range', 'accept-ranges']) {
    const v = response.headers.get(h);
    if (v) out[h] = v;
  }
  res.writeHead(response.status, out);
  if (!response.body) return res.end();
  Readable.fromWeb(response.body).pipe(res);
}

async function handleLogin(req, res, role) {
  if (!configured(role)) return sendJson(res, 503, { ok: false, error: 'Login ist noch nicht vollständig konfiguriert.' });
  if (rateLimited(req, role)) return sendJson(res, 429, { ok: false, error: 'Zu viele Anmeldeversuche. Bitte später erneut versuchen.' });
  let payload = {};
  try { payload = JSON.parse(await readBody(req) || '{}'); } catch (_) { return sendJson(res, 400, { ok: false, error: 'Ungültige Anmeldung' }); }
  const c = creds(role);
  const ok = safeEqualText(payload.username, c.username) && safeEqualText(payload.password, c.password);
  if (!ok) return sendJson(res, 401, { ok: false, error: 'Benutzername oder Passwort ist falsch.' });
  rateLimited(req, role, true);
  setSession(res, role, c.username, req);
  return sendJson(res, 200, { ok: true, role, user: c.username });
}

function authRequired(res, role) {
  return sendJson(res, 401, { ok: false, error: role === 'advisor' ? 'Bitte im Schuldnerberater-Bereich anmelden.' : 'Bitte als Admin anmelden.' });
}

http.createServer = function(listener) {
  return originalCreateServer(async function(req, res) {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (_) { return listener(req, res); }
    const p = url.pathname;
    const session = currentSession(req);

    if (p === '/login' || p === '/login.html') {
      if (session && session.role === 'admin') {
        res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' });
        return res.end();
      }
      return sendHtml(res, 200, loginPage());
    }

    if (p === '/api/auth/login' && req.method === 'POST') return handleLogin(req, res, 'admin');
    if (p === '/api/advisor/login' && req.method === 'POST') return handleLogin(req, res, 'advisor');

    if ((p === '/api/auth/logout' || p === '/api/advisor/logout') && req.method === 'POST') {
      clearSession(res, req);
      return sendJson(res, 200, { ok: true });
    }

    if (p === '/api/auth/session' && req.method === 'GET') {
      return sendJson(res, 200, session ? { ok: true, role: session.role, user: session.user } : { ok: false });
    }
    if (p === '/api/advisor/session' && req.method === 'GET') {
      const ok = session && (session.role === 'advisor' || session.role === 'admin');
      return sendJson(res, 200, ok ? { ok: true, role: session.role, user: session.user } : { ok: false });
    }

    if ((p === '/berater' || p === '/berater/' || p === '/berater.html') && req.method === 'GET') return sendFile(res, 'berater-v168.html', 'text/html; charset=utf-8');
    if (p === '/berater-v168.css' && req.method === 'GET') return sendFile(res, 'berater-v168.css', 'text/css; charset=utf-8');
    if (p === '/berater-v168.js' && req.method === 'GET') return sendFile(res, 'berater-v168.js', 'application/javascript; charset=utf-8');

    if (p === '/api/advisor/data' && req.method === 'GET') {
      if (!session || !['advisor', 'admin'].includes(session.role)) return authRequired(res, 'advisor');
      const data = readSyncData();
      return sendJson(res, 200, {
        ok: true,
        updatedAt: data.updatedAt,
        debts: sanitize(data.debts),
        paperlessConfigured: Boolean(process.env.PAPERLESS_URL && process.env.PAPERLESS_TOKEN)
      });
    }

    if (p.startsWith('/api/advisor/paperless/document/') && req.method === 'GET') {
      if (!session || !['advisor', 'admin'].includes(session.role)) return authRequired(res, 'advisor');
      const id = p.split('/').pop();
      return proxyPaperless(req, res, id);
    }

    if (p.startsWith('/api/advisor/')) {
      if (!session || !['advisor', 'admin'].includes(session.role)) return authRequired(res, 'advisor');
      return sendJson(res, 405, { ok: false, error: 'Im Schuldnerberater-Bereich sind nur Lesezugriffe erlaubt.' });
    }

    if (p === '/api/health') return listener(req, res);

    if (!session || session.role !== 'admin') {
      if (p.startsWith('/api/')) return authRequired(res, 'admin');
      if (session && session.role === 'advisor') {
        res.writeHead(302, { Location: '/berater', 'Cache-Control': 'no-store' });
        return res.end();
      }
      const publicAssets = p === '/manifest.webmanifest' || p.startsWith('/assets/icons/');
      if (publicAssets) return listener(req, res);
      res.writeHead(302, { Location: '/login', 'Cache-Control': 'no-store' });
      return res.end();
    }

    return listener(req, res);
  });
};
