const http=require('http');
const originalCreateServer=http.createServer.bind(http);
function inject(body){
  if(body.includes('/chatgpt-import.js')) return body;
  const tag='<script src="/chatgpt-import.js?v=1" defer></script>';
  return /<\/body>/i.test(body)?body.replace(/<\/body>/i,tag+'\n</body>'):body+'\n'+tag;
}
http.createServer=function(listener){
  return originalCreateServer(function(req,res){
    try{
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){
        const ow=res.write.bind(res), oe=res.end.bind(res), chunks=[];
        res.write=function(chunk,enc,cb){if(chunk)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,enc));if(typeof cb==='function')cb();return true;};
        res.end=function(chunk,enc,cb){if(chunk)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,enc));try{let body=Buffer.concat(chunks).toString('utf8');body=inject(body);try{res.removeHeader('Content-Length');}catch(e){} oe(body,'utf8',cb);}catch(e){oe(Buffer.concat(chunks),cb);}};
      }
      return listener(req,res);
    }catch(e){return listener(req,res);}
  });
};
