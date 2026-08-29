(function(){
'use strict';
const VERSION='v142';

function debtsArr(){
  try{if(typeof debts!=='undefined'&&Array.isArray(debts))return debts;}catch(e){}
  try{if(Array.isArray(window.debts))return window.debts;}catch(e){}
  try{const x=JSON.parse(localStorage.getItem('godmode_debts')||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}
}

function ensureVersion(){
  let style=document.getElementById('v142VersionStyle');
  if(!style){
    style=document.createElement('style');
    style.id='v142VersionStyle';
    style.textContent='#stableVersionV79,#stableVersionV78,.v59MenuVersion,.v67CurrentVersion,.v70OnlyVersion,[id$="OnlyVersion"],[id$="CurrentVersion"]{display:none!important}#v142CurrentVersion{display:block!important;text-align:center;font-size:12px;font-weight:900;color:#eaf2ff;padding:7px 0 2px}';
    document.head.appendChild(style);
  }
  const bottom=document.querySelector('.sidebarBottom');
  if(!bottom)return;
  let el=document.getElementById('v142CurrentVersion');
  if(!el){el=document.createElement('div');el.id='v142CurrentVersion';bottom.appendChild(el);}
  el.textContent=VERSION;
}

function visibleDebtCount(){
  const tbody=document.getElementById('tbody');
  if(tbody){
    const rows=[...tbody.querySelectorAll(':scope > tr')].filter(r=>{
      if(r.classList.contains('v58EmptyRow'))return false;
      if(/keine passenden schulden|keine schulden/i.test(r.textContent||''))return false;
      return r.style.display!=='none';
    });
    if(rows.length)return rows.length;
    if(tbody.querySelector('.v58EmptyRow')||/keine passenden schulden|keine schulden/i.test(tbody.textContent||''))return 0;
  }
  const mobile=document.getElementById('mobileList');
  if(mobile){
    const cards=[...mobile.children].filter(x=>x.style.display!=='none'&&!/keine passenden schulden|keine schulden/i.test(x.textContent||''));
    if(cards.length)return cards.length;
  }
  return debtsArr().length;
}

function updateDebtCount(){
  const el=document.getElementById('debtCount');
  if(el)el.textContent=String(visibleDebtCount());
}

function refresh(){ensureVersion();updateDebtCount();}

const oldRender=window.render;
if(typeof oldRender==='function'&&!oldRender.__v142UiFix){
  const wrapped=function(){const r=oldRender.apply(this,arguments);setTimeout(refresh,0);setTimeout(updateDebtCount,120);return r;};
  wrapped.__v142UiFix=true;
  window.render=wrapped;
  try{render=wrapped;}catch(e){}
}

document.addEventListener('input',e=>{if(e.target?.id==='search')setTimeout(updateDebtCount,120);},true);
document.addEventListener('change',e=>{if(e.target?.closest?.('#debtListSection'))setTimeout(updateDebtCount,120);},true);
document.addEventListener('click',()=>setTimeout(refresh,120),true);

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{setTimeout(refresh,50);setTimeout(refresh,700);},{once:true});
else{setTimeout(refresh,50);setTimeout(refresh,700);}
})();
