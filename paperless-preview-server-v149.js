const http = require('http');
const https = require('https');

const previousCreateServer = http.createServer.bind(http);

function cleanBase(value){
  return String(value || '').trim().replace(/\/+$/,'').replace(/\/dashboard$/i,'').replace(/\/api$/i,'');
}

function config(req){
  return {
    baseUrl: cleanBase(process.env.PAPERLESS_URL || process.env.PAPERLESS_BASE_URL || req.headers['x-paperless-url'] || ''),
    token: String(process.env.PAPERLESS_TOKEN || process.env.PAPERLESS_API_TOKEN || req.headers['x-paperless-token'] || '').trim(),
    insecure: /^(1|true|yes|ja)$/i.test(String(process.env.PAPERLESS_ALLOW_SELF_SIGNED || process.env.PAPERLESS_INSECURE_TLS || req.headers['x-paperless-insecure-tls'] || ''))
  };
}

function sendJson(res,status,obj){
  if(res.headersSent) return;
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(obj));
}

function streamFile(url,cfg,res,id,redirects=0){
  let u;
  try{u=new URL(url);}catch(e){return sendJson(res,500,{ok:false,error:'Ungültige Paperless-Datei-URL'});}
  const lib=u.protocol==='https:'?https:http;
  const upstream=lib.request(u,{
    method:'GET',
    headers:{
      Authorization:'Token '+cfg.token,
      Accept:'application/pdf,application/octet-stream;q=0.9,*/*;q=0.5'
    },
    rejectUnauthorized:!cfg.insecure,
    timeout:Number(process.env.PAPERLESS_TIMEOUT_MS || 20000)
  },up=>{
    const code=Number(up.statusCode||0);
    if([301,302,303,307,308].includes(code)&&up.headers.location&&redirects<3){
      up.resume();
      const next=new URL(up.headers.location,u).toString();
      return streamFile(next,cfg,res,id,redirects+1);
    }
    if(code<200||code>=300){
      let body='';up.setEncoding('utf8');
      up.on('data',c=>{if(body.length<10000)body+=c;});
      up.on('end',()=>sendJson(res,code||502,{ok:false,error:'Paperless Datei konnte nicht geladen werden',details:body.slice(0,800)}));
      return;
    }
    const headers={
      'Content-Type':String(up.headers['content-type']||'application/pdf'),
      'Content-Disposition':`inline; filename="paperless-${id}.pdf"`,
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff'
    };
    if(up.headers['content-length'])headers['Content-Length']=String(up.headers['content-length']);
    res.writeHead(200,headers);
    up.pipe(res);
  });
  upstream.on('timeout',()=>upstream.destroy(new Error('Paperless Timeout')));
  upstream.on('error',err=>{
    if(!res.headersSent)sendJson(res,502,{ok:false,error:err.message||'Paperless Datei konnte nicht geladen werden'});
    else try{res.end();}catch(e){}
  });
  res.on('close',()=>{try{upstream.destroy();}catch(e){}});
  upstream.end();
}

function handlePreview(req,res,id){
  const cfg=config(req);
  if(!cfg.baseUrl||!cfg.token)return sendJson(res,400,{ok:false,error:'Paperless URL oder API-Token fehlt'});
  if(!/^https?:\/\//i.test(cfg.baseUrl))return sendJson(res,400,{ok:false,error:'Ungültige Paperless URL'});
  return streamFile(`${cfg.baseUrl}/api/documents/${id}/download/`,cfg,res,id,0);
}

http.createServer=function(listener){
  return previousCreateServer(function(req,res){
    try{
      const url=new URL(req.url,'http://localhost');
      const m=url.pathname.match(/^\/api\/paperless\/document\/(\d+)$/);
      if(m&&req.method==='GET')return handlePreview(req,res,m[1]);
      return listener(req,res);
    }catch(e){
      return listener(req,res);
    }
  });
};
