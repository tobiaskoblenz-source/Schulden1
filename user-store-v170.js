const fs=require('fs');const path=require('path');const crypto=require('crypto');
const DATA_DIR=process.env.DATA_DIR||path.join(__dirname,'data');const FILE=path.join(DATA_DIR,'schulden-users-v170.json');
const READ_KEYS=['overview','creditors','details','notes','documents','paperless','compare','download'];
const WRITE_KEYS=['createDebts','editDebts','writeNotes','deleteDebts'];
const KEYS=[...READ_KEYS,...WRITE_KEYS];const ALL=Object.fromEntries(KEYS.map(k=>[k,true]));const DEF={...Object.fromEntries(READ_KEYS.map(k=>[k,true])),...Object.fromEntries(WRITE_KEYS.map(k=>[k,false]))};
function ensure(){fs.mkdirSync(DATA_DIR,{recursive:true});if(!fs.existsSync(FILE))fs.writeFileSync(FILE,JSON.stringify({version:170,users:[]},null,2))}
function read(){ensure();try{const d=JSON.parse(fs.readFileSync(FILE,'utf8'));return Array.isArray(d.users)?d.users:[]}catch(_){return[]}}
function write(users){ensure();const t=FILE+'.tmp';fs.writeFileSync(t,JSON.stringify({version:171,updatedAt:new Date().toISOString(),users},null,2));fs.renameSync(t,FILE)}
function perms(role,p){if(role==='admin')return{...ALL};const o={...DEF};if(p&&typeof p==='object')for(const k of KEYS)if(Object.prototype.hasOwnProperty.call(p,k))o[k]=!!p[k];return o}
function pub(u){return{id:u.id,username:u.username,name:u.name||'',role:u.role,active:u.active!==false,permissions:perms(u.role,u.permissions),createdAt:u.createdAt||'',updatedAt:u.updatedAt||''}}
function username(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'').slice(0,40)}function name(v){return String(v||'').trim().slice(0,80)}function role(v){return String(v||'').toLowerCase()==='admin'?'admin':'advisor'}
function hash(password,salt=crypto.randomBytes(16).toString('hex')){return{salt,hash:crypto.scryptSync(String(password),salt,64).toString('hex')}}
function verify(password,r){try{if(!r||!r.salt||!r.hash)return false;const a=Buffer.from(crypto.scryptSync(String(password),r.salt,64).toString('hex')),b=Buffer.from(String(r.hash));return a.length===b.length&&crypto.timingSafeEqual(a,b)}catch(_){return false}}
module.exports={DATA_DIR,FILE,READ_KEYS,WRITE_KEYS,KEYS,ALL,DEF,read,write,perms,pub,username,name,role,hash,verify};
