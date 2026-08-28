const http = require('http');
const https = require('https');

const originalCreateServer = http.createServer.bind(http);

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

function requestJson(url, token, insecure){
  return new Promise((resolve,reject)=>{
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : require('http');
    const req = lib.request(u,{
      method:'GET',
      headers:{Authorization:'Token '+token,Accept:'application/json; version='+(process.env.PAPERLESS_API_VERSION || '9')},
      rejectUnauthorized: !insecure,
      timeout:Number(process.env.PAPERLESS_TIMEOUT_MS || 12000)
    },res=>{
      let body='';
      res.setEncoding('utf8');
      res.on('data',c=>{ body+=c; if(body.length>5_000_000) req.destroy(new Error('Paperless response too large')); });
      res.on('end',()=>{
        let data=null;
        try{ data=body ? JSON.parse(body) : {}; }catch(e){ return reject(Object.assign(new Error('Paperless liefert kein JSON'),{status:502,details:body.slice(0,500)})); }
        if(res.statusCode < 200 || res.statusCode >= 300){
          return reject(Object.assign(new Error('Paperless Fehler '+res.statusCode),{status:res.statusCode,details:body.slice(0,800)}));
        }
        resolve(data);
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Paperless Timeout')));
    req.on('error',reject);
    req.end();
  });
}

function sendJson(res,status,obj){
  if(res.headersSent) return;
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(obj));
}

function valueDisplay(value){
  if(value == null) return '';
  if(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if(Array.isArray(value)) return value.map(valueDisplay).filter(Boolean).join(', ');
  if(typeof value === 'object') return String(value.name ?? value.label ?? value.value ?? value.amount ?? value.id ?? JSON.stringify(value));
  return String(value);
}

async function getNamedObject(cfg, type, raw){
  if(raw == null || raw === '') return {id:null,name:''};
  if(typeof raw === 'object') return {id:raw.id ?? null,name:String(raw.name || raw.label || raw.title || '')};
  const id = Number(raw);
  if(!Number.isFinite(id)) return {id:null,name:String(raw)};
  try{
    const item = await requestJson(`${cfg.baseUrl}/api/${type}/${id}/`,cfg.token,cfg.insecure);
    return {id,name:String(item.name || item.label || item.title || '')};
  }catch(e){ return {id,name:''}; }
}

async function normalizeCustomFields(cfg, doc){
  const rows = Array.isArray(doc.custom_fields) ? doc.custom_fields : [];
  const cache = new Map();
  const out=[];
  for(const row of rows){
    if(!row) continue;
    let field = row.field ?? row.custom_field ?? row.id;
    let id=null, name='';
    if(field && typeof field === 'object'){
      id = field.id ?? null;
      name = String(field.name || field.label || '');
    }else if(field != null){ id = Number(field); }
    if(!name && Number.isFinite(id)){
      if(!cache.has(id)){
        try{ cache.set(id,await requestJson(`${cfg.baseUrl}/api/custom_fields/${id}/`,cfg.token,cfg.insecure)); }
        catch(e){ cache.set(id,{id,name:'Feld #'+id}); }
      }
      const meta=cache.get(id) || {};
      name=String(meta.name || meta.label || ('Feld #'+id));
    }
    const value = Object.prototype.hasOwnProperty.call(row,'value') ? row.value : (row.data ?? row);
    out.push({id:Number.isFinite(id)?id:null,name:name || (Number.isFinite(id)?'Feld #'+id:'Zusatzfeld'),value,displayValue:valueDisplay(value)});
  }
  return out;
}

async function handleDocumentData(req,res,id){
  const cfg=config(req);
  if(!cfg.baseUrl || !cfg.token) return sendJson(res,400,{ok:false,error:'Paperless URL oder API-Token fehlt'});
  if(!/^https?:\/\//i.test(cfg.baseUrl)) return sendJson(res,400,{ok:false,error:'Ungültige Paperless URL'});
  try{
    const doc=await requestJson(`${cfg.baseUrl}/api/documents/${id}/`,cfg.token,cfg.insecure);
    const [corr,type,customFields]=await Promise.all([
      getNamedObject(cfg,'correspondents',doc.correspondent),
      getNamedObject(cfg,'document_types',doc.document_type),
      normalizeCustomFields(cfg,doc)
    ]);
    return sendJson(res,200,{ok:true,document:{
      id:doc.id,
      title:doc.title || doc.original_filename || doc.archive_filename || ('Dokument #'+doc.id),
      created:doc.created || doc.created_date || '',
      correspondentId:corr.id,
      correspondentName:corr.name,
      documentTypeId:type.id,
      documentTypeName:type.name,
      asn:doc.asn ?? doc.archive_serial_number ?? null,
      customFields
    }});
  }catch(err){
    return sendJson(res,err.status || 502,{ok:false,error:err.message || 'Paperless-Daten konnten nicht geladen werden',details:err.details || ''});
  }
}

function injectImportScript(body){
  if(body.includes('/paperless-import.js')) return body;
  const tag='<script src="/paperless-import.js?v=1" defer></script>';
  if(/<\/body>/i.test(body)) return body.replace(/<\/body>/i,tag+'\n</body>');
  return body+'\n'+tag;
}

http.createServer = function(listener){
  return originalCreateServer(async function(req,res){
    try{
      const url=new URL(req.url,'http://localhost');
      const m=url.pathname.match(/^\/api\/paperless\/document-data\/(\d+)$/);
      if(m && req.method==='GET') return handleDocumentData(req,res,m[1]);

      if(req.method==='GET' && (url.pathname==='/' || url.pathname==='/index.html')){
        const originalWrite=res.write.bind(res);
        const originalEnd=res.end.bind(res);
        const chunks=[];
        res.write=function(chunk,enc,cb){ if(chunk) chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,enc)); if(typeof cb==='function') cb(); return true; };
        res.end=function(chunk,enc,cb){
          if(chunk) chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,enc));
          try{
            let body=Buffer.concat(chunks).toString('utf8');
            body=injectImportScript(body);
            try{ res.removeHeader('Content-Length'); }catch(e){}
            originalEnd(body,'utf8',cb);
          }catch(e){ originalEnd(Buffer.concat(chunks),cb); }
        };
        return listener(req,res);
      }
      return listener(req,res);
    }catch(e){ return listener(req,res); }
  });
};
