const http = require('http');

const originalCreateServer = http.createServer.bind(http);

const LOADER = `\n;(()=>{try{if(!document.querySelector('script[data-paperless-cleanup]')){const s=document.createElement('script');s.src='/paperless-cleanup.js?v=1';s.defer=true;s.dataset.paperlessCleanup='1';document.head.appendChild(s)}}catch(e){}})();\n`;

http.createServer = function(listener){
  return originalCreateServer(function(req,res){
    try{
      const url = new URL(req.url,'http://localhost');
      if(req.method === 'GET' && url.pathname === '/paperless-import.js'){
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
            const body = Buffer.concat(chunks).toString('utf8') + LOADER;
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
