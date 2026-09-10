const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const originalCreateServer = http.createServer.bind(http);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const INBOX_FILE = process.env.N8N_INBOX_FILE || path.join(DATA_DIR, 'n8n-inbox.json');
const MAX_BODY = 1024 * 1024;
const MAX_ITEMS = 1000;

// n8n may send many document POSTs at the same time. Serialize file updates so
// every request reads the result of the previous write instead of overwriting it.
let inboxWriteQueue = Promise.resolve();

function sendJson(res, status, obj) {
  if (res.headersSent) return;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (!aa.length || aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function authorized(req) {
  const expected = String(process.env.N8N_BRIDGE_TOKEN || '').trim();
  if (!expected) return false;
  const headerToken = String(req.headers['x-n8n-token'] || '').trim();
  const auth = String(req.headers.authorization || '').trim();
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  return safeEqual(headerToken, expected) || safeEqual(bearer, expected);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function ensureInbox() {
  fs.mkdirSync(path.dirname(INBOX_FILE), { recursive: true });
  if (!fs.existsSync(INBOX_FILE)) {
    fs.writeFileSync(INBOX_FILE, JSON.stringify({ updatedAt: '', items: [] }, null, 2));
  }
}

function readInbox() {
  ensureInbox();
  try {
    const raw = JSON.parse(fs.readFileSync(INBOX_FILE, 'utf8'));
    return {
      updatedAt: String(raw.updatedAt || ''),
      items: Array.isArray(raw.items) ? raw.items : [],
    };
  } catch (_) {
    return { updatedAt: '', items: [] };
  }
}

function writeInbox(data) {
  ensureInbox();
  const tmp = INBOX_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, INBOX_FILE);
}

function cleanText(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function normalizePayload(payload) {
  const paperlessId = Number(payload.paperlessId ?? payload.id ?? payload.documentId);
  if (!Number.isFinite(paperlessId) || paperlessId <= 0) {
    const err = new Error('paperlessId fehlt oder ist ungültig');
    err.status = 400;
    throw err;
  }
  return {
    paperlessId,
    title: cleanText(payload.title, 500),
    created: cleanText(payload.created, 100),
    correspondent: cleanText(payload.correspondent ?? payload.correspondentName, 300),
    documentType: cleanText(payload.documentType ?? payload.documentTypeName, 300),
    asn: payload.asn == null ? null : cleanText(payload.asn, 100),
    source: 'n8n-paperless',
    receivedAt: new Date().toISOString(),
  };
}

function saveInboxItem(item) {
  const operation = inboxWriteQueue.then(() => {
    const inbox = readInbox();
    const withoutSame = inbox.items.filter(x => Number(x && x.paperlessId) !== item.paperlessId);
    const items = [item, ...withoutSame].slice(0, MAX_ITEMS);
    const updatedAt = new Date().toISOString();
    writeInbox({ updatedAt, items });
    return {
      ok: true,
      saved: true,
      paperlessId: item.paperlessId,
      inboxCount: items.length,
      updatedAt,
    };
  });

  // Keep the queue alive even if one operation fails, while still returning the
  // original rejection to the request that caused it.
  inboxWriteQueue = operation.catch(() => undefined);
  return operation;
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/n8n/ping') {
    if (!authorized(req)) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method not allowed' });
    return sendJson(res, 200, { ok: true, bridge: 'n8n', version: 3 });
  }

  if (url.pathname === '/api/n8n/inbox') {
    if (!authorized(req)) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    if (req.method === 'GET') {
      try {
        // Wait for any currently queued writes so this count is definitive.
        await inboxWriteQueue;
        const inbox = readInbox();
        return sendJson(res, 200, {
          ok: true,
          inboxCount: inbox.items.length,
          updatedAt: inbox.updatedAt,
          paperlessIds: inbox.items.map(x => x && x.paperlessId).filter(Number.isFinite),
        });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message || 'n8n inbox status error' });
      }
    }

    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' });

    try {
      const raw = await readBody(req);
      let payload;
      try { payload = raw ? JSON.parse(raw) : {}; }
      catch (_) { return sendJson(res, 400, { ok: false, error: 'invalid json' }); }

      const item = normalizePayload(payload);
      const result = await saveInboxItem(item);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, err.status || 500, { ok: false, error: err.message || 'n8n bridge error' });
    }
  }

  return false;
}

http.createServer = function(listener) {
  return originalCreateServer(async function(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/n8n/ping' || url.pathname === '/api/n8n/inbox') {
        return handle(req, res);
      }
    } catch (_) {}
    return listener(req, res);
  });
};
