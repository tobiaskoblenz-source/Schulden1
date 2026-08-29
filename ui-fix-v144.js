(function(){
'use strict';

const VERSION='v144';

function ensureStyle(){
  if(document.getElementById('v144UiStyle')) return;
  const s=document.createElement('style');
  s.id='v144UiStyle';
  s.textContent=`
    #stableVersionV79,#stableVersionV78,.v59MenuVersion,.v67CurrentVersion,.v70OnlyVersion,[id$="OnlyVersion"],[id$="CurrentVersion"],#v142CurrentVersion,#appVersionV143{display:none!important}
    #appVersionV144{display:block!important;text-align:center;font-size:12px;font-weight:900;color:#eaf2ff;padding:7px 0 2px}
  `;
  document.head.appendChild(s);
}

function updateFooterVersion(){
  ensureStyle();
  const bottom=document.querySelector('.sidebarBottom');
  if(!bottom) return;
  let el=document.getElementById('appVersionV144');
  if(!el){
    el=document.createElement('div');
    el.id='appVersionV144';
    bottom.appendChild(el);
  }
  if(el.textContent!==VERSION) el.textContent=VERSION;
}

function updateModalTitle(){
  document.querySelectorAll('.v132Modal h2').forEach(el=>{
    if(/Insolvenz-Status/i.test(el.textContent||'')){
      const wanted='Insolvenz-Status '+VERSION;
      if(el.textContent!==wanted) el.textContent=wanted;
    }
  });
}

function tableDebtCount(){
  const tbody=document.getElementById('tbody');
  if(tbody){
    const rows=[...tbody.children].filter(row=>{
      if(row.tagName!=='TR') return false;
      if(row.classList.contains('v58EmptyRow')) return false;
      const text=(row.textContent||'').toLowerCase();
      if(text.includes('keine passenden schulden')||text.includes('keine schulden')) return false;
      const cs=getComputedStyle(row);
      return cs.display!=='none' && cs.visibility!=='hidden';
    });
    if(rows.length) return rows.length;
    if(tbody.querySelector('.v58EmptyRow')||/keine passenden schulden|keine schulden/i.test(tbody.textContent||'')) return 0;
  }

  const mobile=document.getElementById('mobileList');
  if(mobile){
    const cards=[...mobile.children].filter(card=>{
      const text=(card.textContent||'').toLowerCase();
      if(text.includes('keine passenden schulden')||text.includes('keine schulden')) return false;
      const cs=getComputedStyle(card);
      return cs.display!=='none' && cs.visibility!=='hidden';
    });
    if(cards.length) return cards.length;
  }

  return null;
}

function updateDebtCount(){
  const el=document.getElementById('debtCount');
  if(!el) return;
  const n=tableDebtCount();
  if(n!==null) el.textContent=String(n);
}

function refresh(){
  updateFooterVersion();
  updateModalTitle();
  updateDebtCount();
}

function refreshLater(){
  setTimeout(refresh,60);
  setTimeout(refresh,180);
  setTimeout(refresh,450);
}

const oldRender=window.render;
if(typeof oldRender==='function'&&!oldRender.__v144UiFix){
  const wrapped=function(){
    const r=oldRender.apply(this,arguments);
    refreshLater();
    return r;
  };
  wrapped.__v144UiFix=true;
  window.render=wrapped;
  try{render=wrapped;}catch(e){}
}

document.addEventListener('click',refreshLater,true);
document.addEventListener('input',e=>{if(e.target&&e.target.id==='search') refreshLater();},true);
document.addEventListener('change',e=>{if(e.target&&e.target.closest&&e.target.closest('#debtListSection')) refreshLater();},true);

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>{
    refreshLater();
    setTimeout(refresh,1000);
    setTimeout(refresh,2200);
  },{once:true});
}else{
  refreshLater();
  setTimeout(refresh,1000);
  setTimeout(refresh,2200);
}

})();
