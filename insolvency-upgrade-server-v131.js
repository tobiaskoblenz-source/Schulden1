const http = require('http');

const previousCreateServer = http.createServer.bind(http);

function injectInsolvencyUpgrade(body){
  if(typeof body !== 'string') return body;
  const tags = [];
  if(!body.includes('/insolvency-upgrade-v132.js')) tags.push('<script src="/insolvency-upgrade-v132.js?v=132" defer></script>');
  if(!body.includes('/insolvency-pdf-v135.js')) tags.push('<script src="/insolvency-pdf-v135.js?v=135" defer></script>');
  if(!body.includes('/insolvency-quickedit-v136.js')) tags.push('<script src="/insolvency-quickedit-v136.js?v=138" defer></script>');
  if(!body.includes('/google-drive-backup-v139.js')) tags.push('<script src="/google-drive-backup-v139.js?v=139" defer></script>');
  if(!body.includes('/creditor-sync-v140.js')) tags.push('<script src="/creditor-sync-v140.js?v=140" defer></script>');
  if(!body.includes('/dashboard-check-v141.js')) tags.push('<script src="/dashboard-check-v141.js?v=141" defer></script>');

  if(!body.includes('id="v143-core-ui-fix"')){
    tags.push(`<style id="v143-version-style">
#stableVersionV79,#stableVersionV78,.v59MenuVersion,.v67CurrentVersion,.v70OnlyVersion,[id$="OnlyVersion"],[id$="CurrentVersion"]{display:none!important}
#appVersionV143{display:block!important;text-align:center;font-size:12px;font-weight:900;color:#eaf2ff;padding:7px 0 2px}
</style>
<script id="v143-core-ui-fix">
(function(){
'use strict';
const VERSION='v143';
function debtsArr(){
  try{if(typeof debts!=='undefined'&&Array.isArray(debts))return debts;}catch(e){}
  try{if(Array.isArray(window.debts))return window.debts;}catch(e){}
  try{const x=JSON.parse(localStorage.getItem('godmode_debts')||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}
}
function showVersion(){
  const bottom=document.querySelector('.sidebarBottom');
  if(bottom){
    let el=document.getElementById('appVersionV143');
    if(!el){el=document.createElement('div');el.id='appVersionV143';bottom.appendChild(el);}
    el.textContent=VERSION;
  }
  document.querySelectorAll('.v132Modal h2').forEach(el=>{
    if(/Insolvenz-Status/i.test(el.textContent||'')) el.textContent='Insolvenz-Status '+VERSION;
  });
}
function showDebtCount(){
  const el=document.getElementById('debtCount');
  if(el)el.textContent=String(debtsArr().length);
}
function refresh(){showVersion();showDebtCount();}
const oldRender=window.render;
if(typeof oldRender==='function'&&!oldRender.__v143UiFix){
  const wrapped=function(){const r=oldRender.apply(this,arguments);setTimeout(refresh,0);return r;};
  wrapped.__v143UiFix=true;window.render=wrapped;try{render=wrapped;}catch(e){}
}
document.addEventListener('click',()=>setTimeout(showVersion,30),true);
document.addEventListener('input',e=>{if(e.target&&e.target.id==='search')setTimeout(showDebtCount,30);},true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{setTimeout(refresh,20);setTimeout(refresh,700);},{once:true});
else{setTimeout(refresh,20);setTimeout(refresh,700);}
})();
</script>`);
  }

  if(!tags.length) return body;
  const block = tags.join('\n');
  if(/<\/body>/i.test(body)) return body.replace(/<\/body>/i, block + '\n</body>');
  return body + '\n' + block;
}

http.createServer = function(listener){
  return previousCreateServer(async function(req,res){
    try{
      const url = new URL(req.url,'http://localhost');
      if(req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')){
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
            let body = Buffer.concat(chunks).toString('utf8');
            body = injectInsolvencyUpgrade(body);
            try{res.removeHeader('Content-Length');}catch(e){}
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
