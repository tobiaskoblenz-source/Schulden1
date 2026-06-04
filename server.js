
const http = require("http");
const fs = require("fs");
const path = require("path");
let UndiciAgent = null;
try { UndiciAgent = require("undici").Agent; } catch(e) { UndiciAgent = null; }

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DATA_FILE = process.env.SCHULDEN_DATA_FILE || path.join(DATA_DIR, "schulden-sync.json");

function cleanPaperlessBase(value){
  return String(value || "").trim().replace(/\/+$/, "");
}

function paperlessConfig(req){
  const envUrl = cleanPaperlessBase(process.env.PAPERLESS_URL || process.env.PAPERLESS_BASE_URL || "");
  const envToken = String(process.env.PAPERLESS_TOKEN || process.env.PAPERLESS_API_TOKEN || "").trim();
  const headerUrl = cleanPaperlessBase(req.headers["x-paperless-url"] || "");
  const headerToken = String(req.headers["x-paperless-token"] || "").trim();
  const envInsecure = /^(1|true|yes|ja)$/i.test(String(process.env.PAPERLESS_ALLOW_SELF_SIGNED || process.env.PAPERLESS_INSECURE_TLS || ""));
  const headerInsecure = /^(1|true|yes|ja)$/i.test(String(req.headers["x-paperless-insecure-tls"] || ""));
  return {
    baseUrl: envUrl || headerUrl,
    token: envToken || headerToken,
    usingEnv: Boolean(envUrl && envToken),
    insecureTls: envInsecure || headerInsecure
  };
}

function paperlessReachabilityHint(baseUrl, err){
  const target = String(baseUrl || "");
  const isLocal = /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(target) || /^https?:\/\/[^.\/:]+(:\d+)?$/i.test(target);
  const code = err && (err.code || err.cause?.code || err.name || "");
  if(isLocal){
    return "Paperless-Adresse sieht lokal aus. Wenn die Schulden-App auf Railway läuft, kann Railway deine Synology/LAN-Adresse nicht erreichen. Nutze eine erreichbare HTTPS-Adresse oder betreibe die App im selben Netzwerk.";
  }
  if(String(code).includes("ENOTFOUND")){
    return "Domain wurde nicht gefunden. Prüfe PAPERLESS_URL bzw. die eingegebene Paperless-Adresse.";
  }
  if(String(code).includes("ECONNREFUSED")){
    return "Verbindung wurde abgelehnt. Prüfe Port, Reverse Proxy und ob Paperless läuft.";
  }
  if(String(code).includes("AbortError") || String(code).includes("TimeoutError")){
    return "Paperless antwortet nicht rechtzeitig. Prüfe, ob die Adresse von Railway aus erreichbar ist.";
  }
  if(String(code).includes("UNABLE_TO_VERIFY_LEAF_SIGNATURE") || String(code).includes("SELF_SIGNED_CERT") || String(code).includes("CERT_HAS_EXPIRED") || String(code).includes("DEPTH_ZERO_SELF_SIGNED_CERT")){
    return "HTTPS-Zertifikat wird nicht vertraut. Am besten im Reverse Proxy ein gültiges Let's-Encrypt-Zertifikat mit vollständiger fullchain nutzen. Für private Synology/Paperless kannst du vorübergehend PAPERLESS_ALLOW_SELF_SIGNED=true setzen oder in der App den Haken für private Zertifikate aktivieren.";
  }
  return "Schulden-App konnte Paperless nicht erreichen. Prüfe URL, Token, Reverse Proxy und HTTPS.";
}

async function paperlessFetch(req, res, targetPath, options = {}){
  const cfg = paperlessConfig(req);
  if(!cfg.baseUrl || !cfg.token){
    return sendJson(res, 400, {ok:false, error:"Paperless URL oder API-Token fehlt"});
  }

  if(!/^https?:\/\//i.test(cfg.baseUrl)){
    return sendJson(res, 400, {ok:false, error:"Paperless URL muss mit http:// oder https:// beginnen", hint:"Beispiel: https://paperless.deine-domain.de"});
  }

  const url = cfg.baseUrl + targetPath;
  const headers = {
    "Authorization": "Token " + cfg.token,
    "Accept": options.accept || "application/json"
  };

  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || process.env.PAPERLESS_TIMEOUT_MS || 12000);
  const timer = setTimeout(()=>controller.abort(), timeoutMs);

  let response;
  try{
    const fetchOptions = {method: options.method || "GET", headers, redirect:"follow", signal:controller.signal};
    if(cfg.insecureTls && /^https:/i.test(cfg.baseUrl)){
      if(UndiciAgent){
        fetchOptions.dispatcher = new UndiciAgent({ connect: { rejectUnauthorized: false } });
      }else{
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      }
    }
    response = await fetch(url, fetchOptions);
  }catch(err){
    clearTimeout(timer);
    console.error("Paperless fetch failed", {baseUrl:cfg.baseUrl, path:targetPath, error:err && (err.stack || err.message || err)});
    return sendJson(res, 502, {
      ok:false,
      error:"Paperless nicht erreichbar",
      status:502,
      details:String(err && (err.cause?.code || err.code || err.message || err)).slice(0,500),
      hint:paperlessReachabilityHint(cfg.baseUrl, err),
      baseUrl:cfg.baseUrl,
      usingEnv:cfg.usingEnv,
      insecureTls:cfg.insecureTls
    });
  }finally{
    clearTimeout(timer);
  }

  if(!response.ok){
    const text = await response.text().catch(()=>"");
    let hint = "";
    if(response.status === 401 || response.status === 403) hint = "API-Token ist falsch, abgelaufen oder hat keinen Zugriff.";
    if(response.status === 404) hint = "Paperless API-Pfad wurde nicht gefunden. Prüfe, ob PAPERLESS_URL nur die Basisadresse enthält, ohne /api.";
    if(response.status >= 500) hint = "Paperless selbst oder der Reverse Proxy meldet einen Serverfehler.";
    return sendJson(res, response.status, {ok:false, error:"Paperless Fehler " + response.status, status:response.status, details:text.slice(0,800), hint, baseUrl:cfg.baseUrl, usingEnv:cfg.usingEnv, insecureTls:cfg.insecureTls});
  }

  if(options.stream){
    res.writeHead(200, {
      "Content-Type": response.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": response.headers.get("content-disposition") || "inline"
    });
    if(response.body && response.body.pipeTo){
      const { Writable } = require("stream");
      await response.body.pipeTo(Writable.toWeb(res));
    }else{
      const buffer = Buffer.from(await response.arrayBuffer());
      res.end(buffer);
    }
    return;
  }

  const data = await response.json().catch(async()=>({raw:(await response.text().catch(()=>"")).slice(0,800)}));
  return sendJson(res, 200, {ok:true, usingEnv:cfg.usingEnv, baseUrl:cfg.baseUrl, insecureTls:cfg.insecureTls, data});
}


function paperlessTagName(req){
  const headerTag = String(req.headers["x-paperless-tag"] || "").trim();
  const envTag = String(process.env.PAPERLESS_TAG || process.env.PAPERLESS_REQUIRED_TAG || "App").trim();
  return headerTag || envTag || "App";
}

async function paperlessRawJson(req, targetPath, options = {}){
  const cfg = paperlessConfig(req);
  if(!cfg.baseUrl || !cfg.token){
    const err = new Error("Paperless URL oder API-Token fehlt"); err.status = 400; err.payload = {ok:false, error:err.message}; throw err;
  }
  if(!/^https?:\/\//i.test(cfg.baseUrl)){
    const err = new Error("Paperless URL muss mit http:// oder https:// beginnen"); err.status = 400; err.payload = {ok:false, error:err.message, hint:"Beispiel: https://paperless.deine-domain.de"}; throw err;
  }

  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || process.env.PAPERLESS_TIMEOUT_MS || 12000);
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  let response;
  try{
    const fetchOptions = {
      method: options.method || "GET",
      headers: {"Authorization":"Token " + cfg.token, "Accept": options.accept || "application/json"},
      redirect:"follow",
      signal:controller.signal
    };
    if(cfg.insecureTls && /^https:/i.test(cfg.baseUrl)){
      if(UndiciAgent) fetchOptions.dispatcher = new UndiciAgent({ connect: { rejectUnauthorized: false } });
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    response = await fetch(cfg.baseUrl + targetPath, fetchOptions);
  }catch(err){
    clearTimeout(timer);
    const e = new Error("Paperless nicht erreichbar");
    e.status = 502;
    e.payload = {
      ok:false,
      error:"Paperless nicht erreichbar",
      status:502,
      details:String(err && (err.cause?.code || err.code || err.message || err)).slice(0,500),
      hint:paperlessReachabilityHint(cfg.baseUrl, err),
      baseUrl:cfg.baseUrl,
      usingEnv:cfg.usingEnv,
      insecureTls:cfg.insecureTls
    };
    throw e;
  }finally{
    clearTimeout(timer);
  }

  if(!response.ok){
    const text = await response.text().catch(()=>"");
    let hint = "";
    if(response.status === 401 || response.status === 403) hint = "API-Token ist falsch, abgelaufen oder hat keinen Zugriff.";
    if(response.status === 404) hint = "Paperless API-Pfad wurde nicht gefunden. Prüfe, ob PAPERLESS_URL nur die Basisadresse enthält, ohne /api.";
    if(response.status >= 500) hint = "Paperless selbst oder der Reverse Proxy meldet einen Serverfehler.";
    const e = new Error("Paperless Fehler " + response.status);
    e.status = response.status;
    e.payload = {ok:false, error:e.message, status:response.status, details:text.slice(0,800), hint, baseUrl:cfg.baseUrl, usingEnv:cfg.usingEnv, insecureTls:cfg.insecureTls};
    throw e;
  }

  const data = await response.json().catch(async()=>({raw:(await response.text().catch(()=>"")).slice(0,800)}));
  return {ok:true, usingEnv:cfg.usingEnv, baseUrl:cfg.baseUrl, insecureTls:cfg.insecureTls, data};
}

function paperlessResultArray(data){
  if(Array.isArray(data)) return data;
  if(data && Array.isArray(data.results)) return data.results;
  return [];
}

async function listPaperlessTags(req){
  const collected = [];
  let page = 1;
  for(let guard = 0; guard < 10; guard++){
    const result = await paperlessRawJson(req, "/api/tags/?page_size=200&ordering=name&page=" + page);
    const arr = paperlessResultArray(result.data);
    collected.push(...arr);
    if(!result.data || !result.data.next || !arr.length) break;
    page += 1;
  }
  return collected;
}

async function resolvePaperlessTag(req, tagName){
  const wantedRaw = String(tagName || "").trim();
  const wanted = wantedRaw.toLowerCase();
  if(!wanted || wanted === "*" || wanted === "all") return null;

  // 1) Schnellversuch mit Suchparameter, 2) Fallback mit kompletter Tag-Liste.
  let tags = [];
  try{
    const params = new URLSearchParams();
    params.set("page_size", "200");
    params.set("ordering", "name");
    params.set("name__icontains", wantedRaw);
    const result = await paperlessRawJson(req, "/api/tags/?" + params.toString());
    tags = paperlessResultArray(result.data);
  }catch(e){ tags = []; }
  if(!tags.length) tags = await listPaperlessTags(req);
  else {
    const all = await listPaperlessTags(req).catch(()=>[]);
    const ids = new Set(tags.map(t=>String(t.id)));
    for(const t of all){ if(!ids.has(String(t.id))) tags.push(t); }
  }
  let found = tags.find(t => String(t.name || "").trim().toLowerCase() === wanted);
  if(!found){
    // Falls Paperless bei verschachtelten Tags Namen wie "Schulden/App" liefert.
    found = tags.find(t => String(t.name || "").trim().split('/').pop().toLowerCase() === wanted);
  }
  return found || null;
}

async function paperlessDocumentQuery(req, params){
  return await paperlessRawJson(req, "/api/documents/?" + params.toString());
}

function dedupePaperlessDocuments(results){
  const seen = new Set();
  const out = [];
  for(const r of results){
    const arr = paperlessResultArray(r.data);
    for(const d of arr){
      const id = String(d && d.id);
      if(id && !seen.has(id)){ seen.add(id); out.push(d); }
    }
  }
  return out;
}


const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function ensureDataFile(){
  fs.mkdirSync(path.dirname(DATA_FILE), {recursive:true});
  if(!fs.existsSync(DATA_FILE)){
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      updatedAt: "",
      clientId: "",
      debts: []
    }, null, 2));
  }
}

function readSync(){
  ensureDataFile();
  try{
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      updatedAt: String(data.updatedAt || ""),
      clientId: String(data.clientId || ""),
      debts: Array.isArray(data.debts) ? data.debts : []
    };
  }catch(err){
    return {updatedAt:"", clientId:"", debts:[]};
  }
}

function writeSync(payload){
  ensureDataFile();
  const data = {
    updatedAt: String(payload.updatedAt || new Date().toISOString()),
    clientId: String(payload.clientId || ""),
    debts: Array.isArray(payload.debts) ? payload.debts : []
  };
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
  return data;
}

function sendJson(res, code, obj){
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readBody(req){
  return new Promise((resolve, reject)=>{
    let body = "";
    req.on("data", chunk=>{
      body += chunk;
      if(body.length > 5_000_000){
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", ()=>resolve(body));
    req.on("error", reject);
  });
}

function serveStatic(req, res){
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(url.pathname);
  if(pathname === "/") pathname = "/index.html";

  const filePath = path.normalize(path.join(ROOT, pathname));
  if(!filePath.startsWith(ROOT)){
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.stat(filePath, (err, stat)=>{
    if(err || !stat.isFile()){
      const fallback = path.join(ROOT, "index.html");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      });
      return fs.createReadStream(fallback).pipe(res);
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": [".html", ".js", ".css", ".webmanifest"].includes(ext) || path.basename(filePath) === "sw.js" ? "no-store" : "public, max-age=3600"
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res)=>{
  try{
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if(url.pathname === "/api/health"){
      return sendJson(res, 200, {ok:true, service:"schulden-manager", version:"v84", paperless:Boolean(process.env.PAPERLESS_URL || process.env.PAPERLESS_BASE_URL)});
    }

    if(url.pathname === "/api/config"){
      return sendJson(res, 200, {
        googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_DRIVE_CLIENT_ID || "",
        paperlessConfigured: Boolean((process.env.PAPERLESS_URL || process.env.PAPERLESS_BASE_URL) && (process.env.PAPERLESS_TOKEN || process.env.PAPERLESS_API_TOKEN)),
        paperlessUrl: cleanPaperlessBase(process.env.PAPERLESS_URL || process.env.PAPERLESS_BASE_URL || ""),
        paperlessInsecureTls: /^(1|true|yes|ja)$/i.test(String(process.env.PAPERLESS_ALLOW_SELF_SIGNED || process.env.PAPERLESS_INSECURE_TLS || "")),
        paperlessTag: String(process.env.PAPERLESS_TAG || process.env.PAPERLESS_REQUIRED_TAG || "App").trim() || "App"
      });
    }

    if(url.pathname === "/api/paperless/status" && req.method === "GET"){
      return paperlessFetch(req, res, "/api/statistics/");
    }


    if(url.pathname === "/api/paperless/tags" && req.method === "GET"){
      try{
        const tags = await listPaperlessTags(req);
        return sendJson(res, 200, {ok:true, paperlessTag:paperlessTagName(req), data:{count:tags.length, results:tags.map(t=>({id:t.id,name:t.name,document_count:t.document_count}))}});
      }catch(err){
        return sendJson(res, err.status || 500, err.payload || {ok:false, error:err.message || "Paperless Tags Fehler"});
      }
    }
    if(url.pathname === "/api/paperless/search" && req.method === "GET"){
      const query = url.searchParams.get("q") || "";
      const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("page_size") || "20", 10) || 20, 1), 50);
      const requiredTag = String(url.searchParams.get("tag") || paperlessTagName(req) || "App").trim();
      let tag = null;
      if(requiredTag && requiredTag !== "*" && requiredTag.toLowerCase() !== "all"){
        try{
          tag = await resolvePaperlessTag(req, requiredTag);
          if(!tag){
            const availableTags = await listPaperlessTags(req).catch(()=>[]);
            return sendJson(res, 200, {
              ok:true,
              paperlessTag: requiredTag,
              paperlessTagMissing: true,
              availableTags: availableTags.slice(0,50).map(t=>({id:t.id,name:t.name,document_count:t.document_count})),
              hint: 'In Paperless wurde kein Tag mit dem Namen "' + requiredTag + '" gefunden. Bitte Schreibweise prüfen. Gefundene Tags werden zur Diagnose mitgeliefert.',
              data:{count:0,next:null,previous:null,results:[]}
            });
          }
        }catch(err){
          return sendJson(res, err.status || 500, err.payload || {ok:false, error:err.message || "Paperless Tag-Filter Fehler"});
        }
      }
      try{
        const attempts = [];
        const base = () => { const p = new URLSearchParams(); p.set("page_size", String(pageSize)); p.set("ordering", "-created"); return p; };
        if(tag){
          // Paperless-Versionen unterscheiden sich bei den Filter-Parametern. Darum testen wir mehrere sichere Varianten.
          const p1 = base(); if(query.trim()) p1.set("query", query.trim()); p1.set("tags__id__all", String(tag.id)); attempts.push({mode:"tags__id__all", params:p1});
          const p2 = base(); if(query.trim()) p2.set("query", query.trim()); p2.set("tags__id__in", String(tag.id)); attempts.push({mode:"tags__id__in", params:p2});
          const p3 = base(); p3.set("query", (query.trim() ? query.trim() + " " : "") + 'tag:"' + String(tag.name).replace(/"/g,'') + '"'); attempts.push({mode:"query_tag_quoted", params:p3});
          const p4 = base(); p4.set("query", (query.trim() ? query.trim() + " " : "") + 'tag:' + String(tag.name).replace(/\s+/g,'\ ')); attempts.push({mode:"query_tag", params:p4});
          // Wenn die Akten-Suche zu eng ist, wenigstens alle App-Dokumente zeigen.
          const p5 = base(); p5.set("tags__id__all", String(tag.id)); attempts.push({mode:"tag_only", params:p5, relaxed:true});
        }else{
          const p = base(); if(query.trim()) p.set("query", query.trim()); attempts.push({mode:"no_tag", params:p});
        }
        const successful = [];
        let firstError = null;
        for(const attempt of attempts){
          try{
            const r = await paperlessDocumentQuery(req, attempt.params);
            r._mode = attempt.mode; r._relaxed = Boolean(attempt.relaxed);
            successful.push(r);
            const arr = paperlessResultArray(r.data);
            if(arr.length && !attempt.relaxed) break;
            if(arr.length && attempt.relaxed) break;
          }catch(e){ if(!firstError) firstError = e; }
        }
        if(!successful.length && firstError) throw firstError;
        const merged = dedupePaperlessDocuments(successful);
        const used = successful[successful.length-1] || {data:{}};
        const relaxed = Boolean(used._relaxed) && merged.length > 0;
        return sendJson(res, 200, {
          ok:true,
          usingEnv: used.usingEnv,
          baseUrl: used.baseUrl,
          insecureTls: used.insecureTls,
          paperlessTag: requiredTag || "",
          paperlessTagId: tag ? tag.id : null,
          paperlessTagDocumentCount: tag ? tag.document_count : null,
          searchMode: used._mode || "unknown",
          relaxedSearch: relaxed,
          hint: relaxed ? 'Mit dem Akten-Suchbegriff wurde nichts gefunden. Es werden deshalb alle Dokumente mit dem Tag "' + requiredTag + '" angezeigt.' : '',
          data:{count: merged.length, next:null, previous:null, results: merged}
        });
      }catch(err){
        return sendJson(res, err.status || 500, err.payload || {ok:false, error:err.message || "Paperless Suche Fehler"});
      }
    }

    if(url.pathname.startsWith("/api/paperless/document/") && req.method === "GET"){
      const parts = url.pathname.split("/");
      const id = parts[4];
      if(!/^\d+$/.test(String(id || ""))) return sendJson(res, 400, {ok:false, error:"Ungültige Dokument-ID"});
      return paperlessFetch(req, res, "/api/documents/" + id + "/download/", {accept:"application/pdf,application/octet-stream", stream:true});
    }

    if(url.pathname === "/api/sync" && req.method === "GET"){
      return sendJson(res, 200, readSync());
    }

    if(url.pathname === "/api/sync" && req.method === "POST"){
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      if(!Array.isArray(payload.debts)){
        return sendJson(res, 400, {ok:false, error:"debts must be an array"});
      }
      const saved = writeSync(payload);
      return sendJson(res, 200, {ok:true, ...saved});
    }

    if(req.method === "GET" || req.method === "HEAD"){
      return serveStatic(req, res);
    }

    res.writeHead(405, {"Content-Type":"text/plain; charset=utf-8"});
    res.end("Method Not Allowed");
  }catch(err){
    console.error(err);
    sendJson(res, 500, {ok:false, error:"server error"});
  }
});

server.listen(PORT, ()=>{
  ensureDataFile();
  console.log(`Schulden Manager läuft auf Port ${PORT}`);
  console.log(`Sync-Datei: ${DATA_FILE}`);
});
