const http = require('http');

const originalCreateServer = http.createServer.bind(http);

function inject(body) {
  if (body.includes('/n8n-inbox-ui-v167.js')) return body;
  const tag = '<script src="/n8n-inbox-ui-v167.js?v=167" defer></script>';
  if (/<\/body>/i.test(body)) return body.replace(/<\/body>/i, tag + '\n</body>');
  return body + '\n' + tag;
}

http.createServer = function(listener) {
  return originalCreateServer(function(req, res) {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (_) { return listener(req, res); }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const originalWrite = res.write.bind(res);
      const originalEnd = res.end.bind(res);
      const chunks = [];

      res.write = function(chunk, enc, cb) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc));
        if (typeof cb === 'function') cb();
        return true;
      };

      res.end = function(chunk, enc, cb) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc));
        try {
          let body = Buffer.concat(chunks).toString('utf8');
          body = inject(body);
          try { res.removeHeader('Content-Length'); } catch (_) {}
          return originalEnd(body, 'utf8', cb);
        } catch (_) {
          return originalEnd(Buffer.concat(chunks), cb);
        }
      };
    }

    return listener(req, res);
  });
};
