const http = require('http');

const originalCreateServer = http.createServer.bind(http);
const COOKIE_NAME = 'schulden_auth';

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

function roleFromSessionToken(token) {
  try {
    if (!token || !token.includes('.')) return '';
    const data = token.split('.')[0];
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    return String(payload && payload.role || '');
  } catch (_) {
    return '';
  }
}

function clearCookieHeader(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const host = String(req.headers.host || '');
  const secure = proto === 'https' || /\.railway\.app(?::\d+)?$/i.test(host);
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

http.createServer = function(listener) {
  return originalCreateServer(function(req, res) {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (_) { return listener(req, res); }

    const pathname = url.pathname;
    const role = roleFromSessionToken(parseCookies(req)[COOKIE_NAME]);

    // /admin is an explicit role switch: always leave any current session first.
    if (pathname === '/admin' || pathname === '/admin/') {
      res.writeHead(302, {
        'Set-Cookie': clearCookieHeader(req),
        'Location': '/login?admin=1',
        'Cache-Control': 'no-store'
      });
      return res.end();
    }

    // The root URL is reserved for the owner/admin app. If the browser still
    // carries an advisor cookie, clear it instead of redirecting back to /berater.
    if ((pathname === '/' || pathname === '/index.html') && role === 'advisor') {
      res.writeHead(302, {
        'Set-Cookie': clearCookieHeader(req),
        'Location': '/login?admin=1',
        'Cache-Control': 'no-store'
      });
      return res.end();
    }

    return listener(req, res);
  });
};
