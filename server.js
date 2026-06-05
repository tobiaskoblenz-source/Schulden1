
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
  let raw = String(value || "").trim();
  if(!raw) return "";
  raw = raw.replace(/\/+$/, "");
  try{
    const u = new URL(raw);
    let path = u.pathname || "";
    // Paperless-ngx API is served at /api/ on the Paperless base URL.
    // Users sometimes paste /dashboard, /api, or a login redirect URL.
    path = path.replace(/\/+$/, "");
    path = path.replace(/\/accounts\/login.*$/i, "");
    path = path.replace(/\/dashboard$/i, "");
    path = path.replace(/\/api$/i, "");
    path = path.replace(/\/api\/.*$/i, "");
    u.pathname = path || "/";
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/+$/, "");
  }catch(e){
    return raw.replace(/\/dashboard$/i, "").replace(/\/api$/i, "").replace(/\/+$/, "");
  }
}

function paperlessJsonAccept(){
  const v = String(process.env.PAPERLESS_API_VERSION || "9").trim();
  return v ? ("application/json; version=" + v) : "application/json";
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
    "Accept": options.accept || paperlessJsonAccept()
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
    if(response.status === 404) hint = "Paperless API-Pfad wurde nicht gefunden. Prüfe, ob PAPERLESS_URL nur die Basisadresse enthält, ohne /dashboard und ohne /api. Beispiel: https://deine-paperless-domain.de";
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
      headers: {"Authorization":"Token " + cfg.token, "Accept": options.accept || paperlessJsonAccept()},
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
    if(response.status === 404) hint = "Paperless API-Pfad wurde nicht gefunden. Prüfe, ob PAPERLESS_URL nur die Basisadresse enthält, ohne /dashboard und ohne /api. Beispiel: https://deine-paperless-domain.de";
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
  const seen = new Set();
  const variants = [
    page => "/api/tags/?page_size=200&ordering=name&page=" + page,
    page => "/api/tags/?page_size=200&page=" + page,
    page => "/api/tags/?format=json&page_size=200&page=" + page
  ];
  for(const makePath of variants){
    let page = 1;
    for(let guard = 0; guard < 10; guard++){
      const result = await paperlessRawJson(req, makePath(page));
      const arr = paperlessResultArray(result.data);
      for(const t of arr){
        const key = String(t && (t.id ?? t.name ?? JSON.stringify(t)));
        if(!seen.has(key)){ seen.add(key); collected.push(t); }
      }
      if(!result.data || !result.data.next || !arr.length) break;
      page += 1;
    }
    if(collected.length) break;
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

function uniquePaperlessDocs(list){
  const seen = new Set();
  const out = [];
  for(const d of list || []){
    const id = String(d && d.id);
    if(id && !seen.has(id)){ seen.add(id); out.push(d); }
  }
  return out;
}

async function paperlessSearchByTagText(req, tagName, query, pageSize){
  const tag = String(tagName || "").trim();
  const q = String(query || "").trim();
  const searches = [];
  function add(x){ x=String(x||"").trim(); if(x && !searches.includes(x)) searches.push(x); }
  if(tag){
    // Paperless akzeptiert je nach Version/Frontend entweder query= oder search=.
    // Außerdem kann bei verschachtelten Tags nur der letzte Teil oder der volle Pfad funktionieren.
    const tagParts = [tag];
    if(tag.includes('/')) tagParts.push(tag.split('/').pop());
    for(const t of tagParts){
      add((q ? q + " " : "") + "tag:" + t);
      add((q ? q + " " : "") + 'tag:"' + t + '"');
      add((q ? q + " " : "") + "tags:" + t);
      add((q ? q + " " : "") + 'tags:"' + t + '"');
    }
    // Letzter Notfall: einfacher Volltext. Das ist nicht perfekt, aber besser als leer,
    // wenn die Tag-Endpunkte keine Rechte liefern.
    add((q ? q + " " : "") + tag);
  }else if(q){
    add(q);
  }
  const results = [];
  const modes = [];
  let last = null;
  for(const search of searches){
    for(const paramName of ["query", "search"]){
      const params = new URLSearchParams();
      params.set("page_size", String(pageSize));
      params.set("ordering", "-created");
      params.set(paramName, search);
      try{
        const r = await paperlessDocumentQuery(req, params);
        last = r;
        const arr = paperlessResultArray(r.data);
        if(arr.length){ results.push(...arr); modes.push(paramName + '=' + search); }
      }catch(e){ /* try next syntax */ }
      if(results.length >= pageSize) break;
    }
    if(results.length >= pageSize) break;
  }
  const merged = uniquePaperlessDocs(results).slice(0, pageSize);
  return {ok:true, data:{count:merged.length,next:null,previous:null,results:merged}, usingEnv:last?.usingEnv, baseUrl:last?.baseUrl, insecureTls:last?.insecureTls, modes};
}

async function paperlessLatestDocuments(req, query, pageSize){
  const q = String(query || "").trim();
  const attempts = [];
  const p0 = new URLSearchParams(); p0.set("page_size", String(pageSize)); p0.set("ordering", "-created"); if(q) p0.set("query", q); attempts.push({mode:"latest_query", params:p0});
  const p1 = new URLSearchParams(); p1.set("page_size", String(pageSize)); if(q) p1.set("query", q); attempts.push({mode:"latest_no_order", params:p1});
  if(q){ const p2 = new URLSearchParams(); p2.set("page_size", String(pageSize)); p2.set("search", q); attempts.push({mode:"latest_search_param", params:p2}); }
  let firstError = null;
  let last = null;
  for(const a of attempts){
    try{
      const r = await paperlessDocumentQuery(req, a.params);
      last = r; r._mode = a.mode;
      const arr = paperlessResultArray(r.data);
      if(arr.length || a === attempts[attempts.length-1]) return r;
    }catch(e){ if(!firstError) firstError=e; }
  }
  if(firstError) throw firstError;
  return {ok:true, data:{count:0,results:[]}, _mode:"latest_empty", usingEnv:last?.usingEnv, baseUrl:last?.baseUrl, insecureTls:last?.insecureTls};
}

function paperlessDocTagIds(doc){
  const out = [];
  const tags = doc && doc.tags;
  if(Array.isArray(tags)){
    for(const t of tags){
      if(t == null) continue;
      if(typeof t === "number" || typeof t === "string") out.push(String(t));
      else if(typeof t === "object" && t.id != null) out.push(String(t.id));
    }
  }
  return out;
}

function paperlessDocHasTag(doc, tag){
  if(!tag || tag.id == null) return true;
  const wanted = String(tag.id);
  return paperlessDocTagIds(doc).includes(wanted);
}

function textFromPaperlessValue(value){
  if(value == null) return "";
  if(typeof value === "string" || typeof value === "number") return String(value);
  if(typeof value === "object") return [value.name, value.title, value.slug, value.id].filter(Boolean).join(" ");
  return "";
}

function normalizePaperlessText(value){
  return String(value || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9äöüß]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function paperlessDocHaystack(doc){
  return [
    doc.title, doc.archive_filename, doc.archived_file_name, doc.original_filename, doc.original_file_name, doc.content,
    textFromPaperlessValue(doc.correspondent), textFromPaperlessValue(doc.document_type),
    textFromPaperlessValue(doc.storage_path), doc.created, doc.created_date, doc.added, doc.asn, doc.archive_serial_number
  ].filter(Boolean).join(" ");
}

function importantPaperlessTokens(query){
  const stop = new Set(["und","oder","der","die","das","ein","eine","einer","mit","ohne","von","vom","zur","zum","den","dem","des","fur","fuer","bei","in","im","am","an","nr","nummer","aktenzeichen","az","kundennummer"]);
  return normalizePaperlessText(query).split(/\s+/).filter(t => t && t.length >= 3 && !stop.has(t));
}

function paperlessDocMatchScore(doc, query){
  const qRaw = String(query || "").trim();
  if(!qRaw) return {score:0, matches:[], tokenCount:0, hay:""};
  const hayRaw = paperlessDocHaystack(doc);
  const hay = normalizePaperlessText(hayRaw);
  const q = normalizePaperlessText(qRaw);
  const tokens = importantPaperlessTokens(qRaw);
  let score = 0;
  const matches = [];
  if(q && hay.includes(q)){ score += 80; matches.push("ganzer Suchtext"); }
  for(const token of tokens){
    if(hay.includes(token)){
      score += token.length >= 6 ? 18 : 10;
      matches.push(token);
    }
  }
  // Zahlen wie Aktenzeichen, Kundennummern oder Jahreszahlen sind besonders wichtig.
  const numberTokens = normalizePaperlessText(qRaw).split(/\s+/).filter(t => /\d{3,}/.test(t));
  for(const n of numberTokens){
    if(hay.includes(n)){ score += 35; if(!matches.includes(n)) matches.push(n); }
  }
  return {score, matches:[...new Set(matches)].slice(0,8), tokenCount:tokens.length, hay};
}

function paperlessDocMatchesQuery(doc, query){
  const q = String(query || "").trim();
  if(!q) return true;
  const m = paperlessDocMatchScore(doc, q);
  if(m.tokenCount <= 1) return m.score > 0;
  return m.score >= 18;
}

async function localPaperlessTagScan(req, tag, query, pageSize){
  const maxPages = Math.min(Math.max(parseInt(process.env.PAPERLESS_LOCAL_SCAN_PAGES || "20", 10) || 20, 1), 100);
  const perPage = Math.min(Math.max(parseInt(process.env.PAPERLESS_LOCAL_SCAN_PAGE_SIZE || "100", 10) || 100, 20), 200);
  const found = [];
  let scanned = 0;
  let tagged = 0;
  let lastResult = null;
  const hasQuery = Boolean(String(query || "").trim());
  for(let page = 1; page <= maxPages; page++){
    const params = new URLSearchParams();
    params.set("page_size", String(perPage));
    params.set("ordering", "-created");
    params.set("page", String(page));
    const r = await paperlessDocumentQuery(req, params);
    lastResult = r;
    const arr = paperlessResultArray(r.data);
    scanned += arr.length;
    for(const d of arr){
      if(!paperlessDocHasTag(d, tag)) continue;
      tagged++;
      if(!hasQuery){ found.push(d); continue; }
      const m = paperlessDocMatchScore(d, query);
      if(m.score > 0){
        found.push({...d, __match_score:m.score, __match_reason:m.matches.join(", ")});
      }
    }
    if(!r.data || !r.data.next || !arr.length) break;
  }
  if(hasQuery){
    found.sort((a,b)=>(Number(b.__match_score||0)-Number(a.__match_score||0)) || String(b.created||b.added||"").localeCompare(String(a.created||a.added||"")));
  }
  const limited = found.slice(0, pageSize);
  return {ok:true, data:{count:found.length,next:null,previous:null,results:limited}, scanned, tagged, pages:maxPages, usingEnv:lastResult?.usingEnv, baseUrl:lastResult?.baseUrl, insecureTls:lastResult?.insecureTls};
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


async function paperlessRawDetailed(req, targetPath, authMode){
  const cfg = paperlessConfig(req);
  if(!cfg.baseUrl || !cfg.token) return {ok:false, error:"Paperless URL oder API-Token fehlt"};
  const controller = new AbortController();
  const timeoutMs = Number(process.env.PAPERLESS_TIMEOUT_MS || 12000);
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  try{
    const headers = {"Accept": paperlessJsonAccept()};
    if(authMode === "bearer") headers.Authorization = "Bearer " + cfg.token;
    else if(authMode === "none") {}
    else headers.Authorization = "Token " + cfg.token;
    const fetchOptions = {method:"GET", headers, redirect:"follow", signal:controller.signal};
    if(cfg.insecureTls && /^https:/i.test(cfg.baseUrl)){
      if(UndiciAgent) fetchOptions.dispatcher = new UndiciAgent({ connect: { rejectUnauthorized: false } });
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    const response = await fetch(cfg.baseUrl + targetPath, fetchOptions);
    const contentType = response.headers.get("content-type") || "";
    const finalUrl = response.url || "";
    const text = await response.text().catch(()=>"");
    let json = null;
    try{ json = text ? JSON.parse(text) : null; }catch(e){ json = null; }
    const arr = paperlessResultArray(json);
    const looksHtml = /<html|<!doctype html|<title|<form/i.test(text.slice(0,1000));
    const looksLogin = /login|csrf|password|username|sign in|anmelden/i.test(text.slice(0,2000));
    return {
      ok: response.ok,
      httpStatus: response.status,
      contentType,
      finalUrl,
      authMode: authMode || "token",
      isJson: Boolean(json),
      jsonTopKeys: json && typeof json === "object" ? Object.keys(json).slice(0,30) : [],
      count: json && typeof json.count !== "undefined" ? json.count : (Array.isArray(json) ? json.length : undefined),
      resultsLength: arr.length,
      sample: arr.slice(0,3).map(x=>({
        id:x && x.id,
        name:x && x.name,
        title:x && x.title,
        created:x && x.created,
        tags:x && x.tags,
        correspondent:x && x.correspondent,
        document_type:x && x.document_type,
        keys:x ? Object.keys(x).slice(0,30) : []
      })),
      rawPreview: json ? "" : text.slice(0,700),
      looksHtml,
      looksLogin,
      hint: (!json && looksHtml) ? "Paperless/Reverse Proxy liefert HTML statt JSON. Meist ist das die Login-Seite oder der Authorization-Header kommt nicht bei Paperless an." : ""
    };
  }catch(e){
    return {ok:false, authMode:authMode||"token", error:String(e && (e.cause?.code || e.code || e.message || e)).slice(0,500)};
  }finally{
    clearTimeout(timer);
  }
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
      return sendJson(res, 200, {ok:true, service:"schulden-manager", version:"v95", paperless:Boolean(process.env.PAPERLESS_URL || process.env.PAPERLESS_BASE_URL)});
    }

    if(url.pathname === "/api/config"){
      return sendJson(res, 200, {
        googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_DRIVE_CLIENT_ID || "",
        paperlessConfigured: Boolean((process.env.PAPERLESS_URL || process.env.PAPERLESS_BASE_URL) && (process.env.PAPERLESS_TOKEN || process.env.PAPERLESS_API_TOKEN)),
        paperlessUrl: cleanPaperlessBase(process.env.PAPERLESS_URL || process.env.PAPERLESS_BASE_URL || ""),
        paperlessInsecureTls: /^(1|true|yes|ja)$/i.test(String(process.env.PAPERLESS_ALLOW_SELF_SIGNED || process.env.PAPERLESS_INSECURE_TLS || "")),
        paperlessTag: String(process.env.PAPERLESS_TAG || process.env.PAPERLESS_REQUIRED_TAG || "App").trim() || "App",
        paperlessApiVersion: String(process.env.PAPERLESS_API_VERSION || "9")
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
            // Manche Paperless-/Proxy-Setups liefern /api/tags/ leer oder ohne Rechte,
            // obwohl die Dokument-Suche funktioniert. Dann nutzen wir Paperless' Volltext-Suche
            // mit tag:Name als Fallback.
            const byText = await paperlessSearchByTagText(req, requiredTag, query, pageSize);
            const arr = paperlessResultArray(byText.data);
            if(arr.length){
              return sendJson(res, 200, {
                ok:true, usingEnv:byText.usingEnv, baseUrl:byText.baseUrl, insecureTls:byText.insecureTls,
                paperlessTag: requiredTag, paperlessTagId:null, paperlessTagDocumentCount:null,
                paperlessTagMissing:true, searchMode:"query_tag_text_fallback", tagQueryModes:byText.modes,
                hint:'Paperless hat keine Tag-Liste geliefert. v95 nutzt deshalb die Paperless-Suche mit tag:' + requiredTag + '.',
                data:byText.data
              });
            }
            const availableTags = await listPaperlessTags(req).catch(()=>[]);
            const latest = await paperlessLatestDocuments(req, query, pageSize).catch(()=>null);
            const latestArr = latest ? paperlessResultArray(latest.data) : [];
            return sendJson(res, 200, {
              ok:true,
              usingEnv: latest?.usingEnv,
              baseUrl: latest?.baseUrl,
              insecureTls: latest?.insecureTls,
              paperlessTag: requiredTag,
              paperlessTagMissing: true,
              availableTags: availableTags.slice(0,80).map(t=>({id:t.id,name:t.name,document_count:t.document_count})),
              searchMode: latest ? (latest._mode || 'latest_without_tag_after_missing_tag') : 'missing_tag_no_latest',
              relaxedSearch: latestArr.length > 0,
              hint: 'Paperless hat den Tag "' + requiredTag + '" nicht über die API geliefert. v95 zeigt deshalb testweise neueste Dokumente ohne Tag-Filter. Wenn hier Dokumente erscheinen, liegt es an Tag-Rechten/Tag-Syntax; wenn nicht, hat der API-Token keinen Dokumentzugriff.',
              data: latest ? {count:latestArr.length,next:null,previous:null,results:latestArr} : {count:0,next:null,previous:null,results:[]}
            });
          }
        }catch(err){
          return sendJson(res, err.status || 500, err.payload || {ok:false, error:err.message || "Paperless Tag-Filter Fehler"});
        }
      }
      try{
        if(tag){
          // v95: Paperless liefert Dokumente mit Tags als IDs (z.B. App = ID 9).
          // Darum filtern wir zuerst lokal über die Tag-ID. Das ist robuster als serverseitige
          // Filterparameter, die je nach Paperless-Version/Proxy abweichen können.
          const localStrict = await localPaperlessTagScan(req, tag, query, pageSize);
          let localArr = paperlessResultArray(localStrict.data);
          if(localArr.length){
            return sendJson(res, 200, {
              ok:true,
              usingEnv: localStrict.usingEnv,
              baseUrl: localStrict.baseUrl,
              insecureTls: localStrict.insecureTls,
              paperlessTag: requiredTag || tag.name || '',
              paperlessTagId: tag.id,
              paperlessTagDocumentCount: tag.document_count,
              searchMode: 'v95_local_tag_id_first',
              localScan: {scanned:localStrict.scanned, maxPages:localStrict.pages},
              relaxedSearch:false,
              hint: 'v95 filtert lokal über die Paperless-Tag-ID '+tag.id+' ('+(tag.name||requiredTag)+').',
              data:{count: localArr.length, next:null, previous:null, results: localArr}
            });
          }
          if(String(query||'').trim()){
            const localAll = await localPaperlessTagScan(req, tag, '', pageSize);
            localArr = paperlessResultArray(localAll.data);
            if(localArr.length){
              return sendJson(res, 200, {
                ok:true,
                usingEnv: localAll.usingEnv,
                baseUrl: localAll.baseUrl,
                insecureTls: localAll.insecureTls,
                paperlessTag: requiredTag || tag.name || '',
                paperlessTagId: tag.id,
                paperlessTagDocumentCount: tag.document_count,
                searchMode: 'v95_local_tag_id_relaxed',
                localScan: {scanned:localAll.scanned, maxPages:localAll.pages},
                relaxedSearch:true,
                hint: 'Mit dem Akten-Suchbegriff wurde nichts gefunden. v95 zeigt deshalb alle Dokumente mit dem Tag '+(tag.name||requiredTag)+' (ID '+tag.id+').',
                data:{count: localArr.length, next:null, previous:null, results: localArr}
              });
            }
          }
        }
        const attempts = [];
        const base = () => { const p = new URLSearchParams(); p.set("page_size", String(pageSize)); p.set("ordering", "-created"); return p; };
        if(tag){
          const p1 = base(); if(query.trim()) p1.set("query", query.trim()); p1.set("tags__id__all", String(tag.id)); attempts.push({mode:"server_tags__id__all", params:p1});
          const p2 = base(); if(query.trim()) p2.set("query", query.trim()); p2.set("tags__id__in", String(tag.id)); attempts.push({mode:"server_tags__id__in", params:p2});
          const p3 = base(); if(query.trim()) p3.set("query", query.trim()); p3.set("tags", String(tag.id)); attempts.push({mode:"server_tags", params:p3});
          const p4 = base(); if(query.trim()) p4.set("query", query.trim()); attempts.push({mode:"server_query_then_local_tag", params:p4, localFilter:true});
          const p5 = base(); p5.set("tags__id__all", String(tag.id)); attempts.push({mode:"server_tag_only", params:p5, relaxed:true});
        }else{
          const p = base(); if(query.trim()) p.set("query", query.trim()); attempts.push({mode:"no_tag", params:p});
        }
        const successful = [];
        let firstError = null;
        for(const attempt of attempts){
          try{
            const r = await paperlessDocumentQuery(req, attempt.params);
            let arr = paperlessResultArray(r.data);
            if(attempt.localFilter && tag){
              arr = arr.filter(d => paperlessDocHasTag(d, tag));
              r.data = {...(r.data||{}), count:arr.length, results:arr};
            }
            r._mode = attempt.mode; r._relaxed = Boolean(attempt.relaxed);
            successful.push(r);
            if(arr.length) break;
          }catch(e){ if(!firstError) firstError = e; }
        }
        if(!successful.length && firstError) throw firstError;
        let merged = dedupePaperlessDocuments(successful);
        let used = successful[successful.length-1] || {data:{}};
        let localScan = null;
        if(tag && merged.length === 0){
          // Wichtigster Fallback: Paperless-Filter können je nach Version abweichen.
          // Darum lesen wir die neuesten Dokumente und filtern den Tag lokal über die Dokument-Metadaten.
          localScan = await localPaperlessTagScan(req, tag, query, pageSize);
          merged = paperlessResultArray(localScan.data);
          used = {...localScan, _mode:"local_scan_tag_ids", _relaxed:true};
        }
        if(requiredTag && merged.length === 0){
          const byText = await paperlessSearchByTagText(req, requiredTag, query, pageSize);
          const arr = paperlessResultArray(byText.data);
          if(arr.length){
            merged = arr;
            used = {...byText, _mode:"query_tag_text_fallback", _relaxed:true};
          }
        }
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
          localScan: localScan ? {scanned:localScan.scanned, maxPages:localScan.pages} : null,
          relaxedSearch: relaxed,
          hint: used._mode === "local_scan_tag_ids" ? 'Server-Tagfilter lieferte nichts. v95 hat deshalb lokal nach Dokumenten mit Tag "' + requiredTag + '" gesucht.' : (relaxed ? 'Mit dem Akten-Suchbegriff wurde nichts gefunden. Es werden deshalb alle Dokumente mit dem Tag "' + requiredTag + '" angezeigt.' : ''),
          data:{count: merged.length, next:null, previous:null, results: merged}
        });
      }catch(err){
        return sendJson(res, err.status || 500, err.payload || {ok:false, error:err.message || "Paperless Suche Fehler"});
      }
    }

    if(url.pathname === "/api/paperless/debug" && req.method === "GET"){
      const requiredTag = String(url.searchParams.get("tag") || paperlessTagName(req) || "App").trim();
      try{
        const tags = await listPaperlessTags(req);
        const tag = requiredTag ? (tags.find(t => String(t.name||"").trim().toLowerCase() === requiredTag.toLowerCase()) || null) : null;
        const params = new URLSearchParams();
        params.set("page_size", "10");
        params.set("ordering", "-created");
        const docsResult = await paperlessDocumentQuery(req, params);
        const docs = paperlessResultArray(docsResult.data);
        const matching = tag ? docs.filter(d => paperlessDocHasTag(d, tag)) : docs;
        return sendJson(res, 200, {
          ok:true,
          paperlessTag:requiredTag,
          matchedTag: tag ? {id:tag.id,name:tag.name,document_count:tag.document_count} : null,
          tags:tags.slice(0,80).map(t=>({id:t.id,name:t.name,document_count:t.document_count})),
          latestDocuments:docs.map(d=>({id:d.id,title:d.title,created:d.created,tagIds:paperlessDocTagIds(d),tags:d.tags})),
          latestMatchingTag:matching.map(d=>({id:d.id,title:d.title,created:d.created,tagIds:paperlessDocTagIds(d)})),
          hint: tag ? 'Tag wurde gefunden. Wenn latestMatchingTag leer ist, haben die neuesten Dokumente diesen Tag nicht oder Paperless liefert Tag-Metadaten anders.' : 'Tag wurde nicht gefunden.'
        });
      }catch(err){
        return sendJson(res, err.status || 500, err.payload || {ok:false, error:err.message || "Paperless Diagnose Fehler"});
      }
    }


    if(url.pathname === "/api/paperless/rawtest" && req.method === "GET"){
      try{
        const tests = {
          documents: await paperlessRawDetailed(req, "/api/documents/?page_size=10&ordering=-created", "token"),
          documentsNoOrdering: await paperlessRawDetailed(req, "/api/documents/?page_size=10", "token"),
          documentsSearchApp: await paperlessRawDetailed(req, "/api/documents/?page_size=10&query=" + encodeURIComponent("App"), "token"),
          tags: await paperlessRawDetailed(req, "/api/tags/?page_size=50", "token"),
          correspondents: await paperlessRawDetailed(req, "/api/correspondents/?page_size=20", "token"),
          documentTypes: await paperlessRawDetailed(req, "/api/document_types/?page_size=20", "token"),
          tokenAuthCheck: await paperlessRawDetailed(req, "/api/documents/?page_size=1", "token"),
          bearerAuthCheck: await paperlessRawDetailed(req, "/api/documents/?page_size=1", "bearer"),
          noAuthCheck: await paperlessRawDetailed(req, "/api/documents/?page_size=1", "none")
        };
        let globalHint = "";
        const vals = Object.values(tests);
        if(vals.some(x=>x && x.looksHtml)){
          globalHint = "Paperless liefert HTML statt JSON. Das ist fast immer Login-Seite/Reverse-Proxy/Auth-Header. In Synology Reverse Proxy muss der Authorization-Header an Paperless weitergereicht werden; alternativ Paperless-URL direkt ohne vorgeschaltete Login-Seite verwenden.";
        }else if(tests.documents && tests.documents.isJson && Number(tests.documents.count||0) === 0 && tests.tags && tests.tags.isJson && Number(tests.tags.count||0) === 0){
          globalHint = "Die API liefert echtes JSON, aber Dokumente/Tags/Korrespondenten sind leer. Dann nutzt du sehr wahrscheinlich einen Paperless-Benutzer/Token, der keine Dokumente sieht, oder du bist mit der App mit einer leeren Paperless-Instanz verbunden.";
        }else if(tests.documents && tests.documents.isJson && tests.documents.resultsLength > 0){
          globalHint = "Dokumentzugriff funktioniert. Wenn der Tag App nicht gefunden wird, liegt es nur am Tag-Namen/Tag-Filter.";
        }
        return sendJson(res, 200, {ok:true, version:"v95", hint:globalHint, tests});
      }catch(err){
        return sendJson(res, err.status || 500, err.payload || {ok:false, error:err.message || "Paperless Rohdiagnose Fehler"});
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
