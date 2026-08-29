(function(){
'use strict';

const VERSION='v145';

function hideLegacyVersions(){
  const bottom=document.querySelector('.sidebarBottom');
  if(!bottom) return;

  // Alte Versionsfelder bleiben fuer Legacy-Skripte im DOM, werden aber sicher unsichtbar.
  bottom.querySelectorAll('*').forEach(el=>{
    if(el.id==='appVersionV145') return;
    const txt=String(el.textContent||'').trim();
    if(el.children.length===0 && /^v\d+$/i.test(txt)){
      el.style.setProperty('display','none','important');
      el.style.setProperty('visibility','hidden','important');
      el.style.setProperty('height','0','important');
      el.style.setProperty('min-height','0','important');
      el.style.setProperty('margin','0','important');
      el.style.setProperty('padding','0','important');
      el.style.setProperty('overflow','hidden','important');
    }
  });

  let current=document.getElementById('appVersionV145');
  if(!current){
    current=document.createElement('div');
    current.id='appVersionV145';
    bottom.appendChild(current);
  }
  current.textContent=VERSION;
  current.style.setProperty('display','block','important');
  current.style.setProperty('visibility','visible','important');
  current.style.setProperty('height','auto','important');
  current.style.setProperty('margin','10px 8px 0','important');
  current.style.setProperty('padding','6px 0 0','important');
  current.style.setProperty('text-align','center','important');
  current.style.setProperty('color','#eaf2ff','important');
  current.style.setProperty('font-size','12px','important');
  current.style.setProperty('font-weight','900','important');
}

function renderedDebtCount(){
  const tbody=document.getElementById('tbody');
  if(tbody){
    const rows=[...tbody.querySelectorAll(':scope > tr')].filter(row=>{
      const text=String(row.textContent||'').toLowerCase();
      if(row.classList.contains('v58EmptyRow')) return false;
      if(text.includes('keine passenden schulden')||text.includes('keine schulden')) return false;
      const style=getComputedStyle(row);
      return style.display!=='none' && style.visibility!=='hidden';
    });
    if(rows.length) return rows.length;
  }

  const mobile=document.getElementById('mobileList');
  if(mobile){
    const cards=[...mobile.children].filter(card=>{
      const text=String(card.textContent||'').toLowerCase();
      if(text.includes('keine passenden schulden')||text.includes('keine schulden')) return false;
      const style=getComputedStyle(card);
      return style.display!=='none' && style.visibility!=='hidden';
    });
    if(cards.length) return cards.length;
  }

  try{
    if(typeof debts!=='undefined' && Array.isArray(debts)) return debts.length;
  }catch(e){}
  try{
    if(Array.isArray(window.debts)) return window.debts.length;
  }catch(e){}
  try{
    const data=JSON.parse(localStorage.getItem('godmode_debts')||'[]');
    if(Array.isArray(data)) return data.length;
  }catch(e){}
  return 0;
}

function ensureVisibleDebtTitle(){
  const board=document.querySelector('#debtListSection .boardHeader');
  if(!board) return;
  const original=board.querySelector('h2:not(#v145DebtTitle)');
  if(original){
    // Original samt #debtCount bleibt fuer alte Renderfunktionen vorhanden.
    original.style.setProperty('display','none','important');
  }

  let title=document.getElementById('v145DebtTitle');
  if(!title){
    title=document.createElement('h2');
    title.id='v145DebtTitle';
    if(original) board.insertBefore(title,original);
    else board.prepend(title);
  }
  title.textContent='Schulden ('+renderedDebtCount()+')';
}

function updateModalTitle(){
  document.querySelectorAll('.v132Modal h2').forEach(el=>{
    if(/Insolvenz-Status/i.test(el.textContent||'')){
      el.textContent='Insolvenz-Status '+VERSION;
    }
  });
}

function refresh(){
  hideLegacyVersions();
  ensureVisibleDebtTitle();
  updateModalTitle();
}

function refreshLater(){
  [0,60,160,350,800].forEach(ms=>setTimeout(refresh,ms));
}

const oldRender=window.render;
if(typeof oldRender==='function'&&!oldRender.__v145UiFix){
  const wrapped=function(){
    const result=oldRender.apply(this,arguments);
    refreshLater();
    return result;
  };
  wrapped.__v145UiFix=true;
  window.render=wrapped;
  try{render=wrapped;}catch(e){}
}

const oldOpen=window.v132InsolvenzOpen;
if(typeof oldOpen==='function'&&!oldOpen.__v145UiFix){
  const wrappedOpen=function(){
    const result=oldOpen.apply(this,arguments);
    refreshLater();
    return result;
  };
  wrappedOpen.__v145UiFix=true;
  window.v132InsolvenzOpen=wrappedOpen;
}

document.addEventListener('click',refreshLater,true);
document.addEventListener('input',e=>{if(e.target&&e.target.id==='search')refreshLater();},true);
document.addEventListener('change',e=>{if(e.target&&e.target.closest&&e.target.closest('#debtListSection'))refreshLater();},true);

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>{
    refreshLater();
    setTimeout(refresh,1500);
    setTimeout(refresh,3200);
  },{once:true});
}else{
  refreshLater();
  setTimeout(refresh,1500);
  setTimeout(refresh,3200);
}

})();
