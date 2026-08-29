const http = require('http');

const previousCreateServer = http.createServer.bind(http);

function injectInsolvencyUpgrade(body){
  if(typeof body !== 'string') return body;
  const tags = [];
  if(!body.includes('/insolvency-upgrade-v132.js')) tags.push('<script src="/insolvency-upgrade-v132.js?v=132" defer></script>');
  if(!body.includes('/insolvency-pdf-v135.js')) tags.push('<script src="/insolvency-pdf-v135.js?v=135" defer></script>');
  if(!body.includes('/insolvency-quickedit-v136.js')) tags.push('<script src="/insolvency-quickedit-v136.js?v=136" defer></script>');
  if(!body.includes('/insolvency-taskflow-v137.js')) tags.push('<script src="/insolvency-taskflow-v137.js?v=137" defer></script>');
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
        const originalWrite = res.write.bind(res);
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
            try{ res.removeHeader('Content-Length'); }catch(e){}
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
