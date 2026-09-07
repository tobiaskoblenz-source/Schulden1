const http=require('http');
const previous=http.createServer.bind(http);
function inject(body){
  if(typeof body!=='string')return body;
  const tags=[];
  if(!body.includes('/insolvency-upgrade-v132.js'))tags.push('<script src="/insolvency-upgrade-v132.js?v=166" defer></script>');
  if(!body.includes('/chatgpt-import-v150.js'))tags.push('<script src="/chatgpt-import-v150.js?v=166" defer></script>');
  if(!body.includes('/chatgpt-direct-import-v151.js'))tags.push('<script src="/chatgpt-direct-import-v151.js?v=166" defer></script>');
  if(!body.includes('/app-v166-extra.js'))tags.push('<script src="/app-v166-extra.js?v=166" defer></script>');
  if(!body.includes('/app-v172-detail.js'))tags.push('<script src="/app-v172-detail.js?v=172" defer></script>');
  if(!tags.length)return body;
  const block=tags.join('\n');
  return /<\/body>/i.test(body)?body.replace(/<\/body>/i,block+'\n</body>'):body+'\n'+block;
}
http.createServer=function(listener){
  return previous(function(req,res){
    try{
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){
        const end=res.end.bind(res),chunks=[];
        res.write=function(chunk,enc,cb){if(chunk)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,enc));if(typeof cb==='function')cb();return true};
        res.end=function(chunk,enc,cb){if(chunk)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,enc));try{let body=Buffer.concat(chunks).toString('utf8');body=inject(body);try{res.removeHeader('Content-Length')}catch(e){}return end(body,'utf8',cb)}catch(e){return end(Buffer.concat(chunks),cb)}};
      }
      return listener(req,res);
    }catch(e){return listener(req,res)}
  });
};
