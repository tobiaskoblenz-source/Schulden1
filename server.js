
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DATA_FILE = process.env.SCHULDEN_DATA_FILE || path.join(DATA_DIR, "schulden-sync.json");

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
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res)=>{
  try{
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if(url.pathname === "/api/health"){
      return sendJson(res, 200, {ok:true, service:"schulden-manager", version:"v21"});
    }

    if(url.pathname === "/api/config"){
      return sendJson(res, 200, {
        googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_DRIVE_CLIENT_ID || ""
      });
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
