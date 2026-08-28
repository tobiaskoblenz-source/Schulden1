const http=require('http');
const originalCreateServer=http.createServer.bind(http);
function inject(body){
  const tags=[];
  if(!body.includes('/chatgpt-import.js')) tags.push('<script src="/chatgpt-import.js?v=1" defer></script>');
  if(!body.includes('/pdf-export-plus.js')) tags.push('<script src="/pdf-export-plus.js?v=1" defer></script>');
  if(!body.includes('/pdf-menu-v99.js')) tags.push('<script src="/pdf-menu-v99.js?v=1" defer></script>');
  if(!tags.length) return body;
  const block=tags.join('\n');
  return /<\/body>/i.test(body)?body.replace(/<\/body>/i,block+'\n</body>'):body+'\n'+block;
}
http.createServer=function(listener){
  return originalCreateServer(function(req,res){
    try{
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){
        const oe=res.end.bind(res), chunks=[];
        res.write=function(chunk,enc,cb){if(chunk)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,enc));if(typeof cb==='function')cb();return true;};
        res.end=function(chunk,enc,cb){if(chunk)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,enc));try{let body=Buffer.concat(chunks).toString('utf8');body=inject(body);try{res.removeHeader('Content-Length');}catch(e){} oe(body,'utf8',cb);}catch(e){oe(Buffer.concat(chunks),cb);}};
      }
      return listener(req,res);
    }catch(e){return listener(req,res);}
  });
};
