const http = require('http');

const previousCreateServer = http.createServer.bind(http);

function injectInsolvencyUpgrade(body){
  if(typeof body !== 'string') return body;
  const tags = [];
  if(!body.includes('/insolvency-upgrade-v132.js')) tags.push('<script src="/insolvency-upgrade-v132.js?v=132" defer></script>');
  if(!body.includes('/insolvency-pdf-v135.js')) tags.push('<script src="/insolvency-pdf-v135.js?v=135" defer></script>');
  if(!body.includes('/insolvency-quickedit-v136.js')) tags.push('<script src="/insolvency-quickedit-v136.js?v=138" defer></script>');
  if(!body.includes('/google-drive-backup-v139.js')) tags.push('<script src="/google-drive-backup-v139.js?v=139" defer></script>');
  if(!body.includes('/creditor-sync-v140.js')) tags.push('<script src="/creditor-sync-v140.js?v=140" defer></script>');
  if(!body.includes('/dashboard-check-v141.js')) tags.push('<script src="/dashboard-check-v141.js?v=141" defer></script>');
  if(!body.includes('/missing-workflow-v146.js')) tags.push('<script src="/missing-workflow-v146.js?v=146" defer></script>');
  if(!body.includes('/paperless-match-v147.js')) tags.push('<script src="/paperless-match-v147.js?v=147" defer></script>');
  if(!body.includes('/paperless-filter-v148.js')) tags.push('<script src="/paperless-filter-v148.js?v=148" defer></script>');
  if(!body.includes('/paperless-preview-v149.js')) tags.push('<script src="/paperless-preview-v149.js?v=149" defer></script>');
  if(!body.includes('/chatgpt-direct-import-v151.js')) tags.push('<script src="/chatgpt-direct-import-v151.js?v=151" defer></script>');
  if(!body.includes('/dashboard-cleanup-v152.js')) tags.push('<script src="/dashboard-cleanup-v152.js?v=152" defer></script>');
  if(!body.includes('/ui-fix-v152.js')) tags.push('<script src="/ui-fix-v152.js?v=152" defer></script>');
  if(!tags.length) return body;
  const block = tags.join('\n');
  if(/<\/body>/i.test(body)) return body.replace(/<\/body>/i, block + '\n</body>');
  return body + '\n' + block;
}

http.createServer = function(listener){
  return previousCreateServer(async function(req,res){
    try{
      const url = new URL(req.url,'http://localhost');
      if(req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')){
        const originalEnd = res.end.bind(res);
        const chunks = [];
        res.write = function(chunk,enc,cb){
          if(chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk,enc));
          if(typeof cb === 'function') cb();
          return true;
        };
        res.end = function(chunk,enc,cb){
          if(chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk,enc));
          try{
            let body = Buffer.concat(chunks).toString('utf8');
            body = injectInsolvencyUpgrade(body);
            try{res.removeHeader('Content-Length');}catch(e){}
            return originalEnd(body,'utf8',cb);
          }catch(e){
            return originalEnd(Buffer.concat(chunks),cb);
          }
        };
        return listener(req,res);
      }
      return listener(req,res);
    }catch(e){
      return listener(req,res);
    }
  });
};
