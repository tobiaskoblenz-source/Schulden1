(function(){
'use strict';

const VERSION='v141';
const DEBT_KEY='godmode_debts';
const CREDITOR_KEY='schulden_creditors_v37';
const META_KEY='schulden_v131_meta';

const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

function debtsArr(){
  try{if(typeof debts!=='undefined'&&Array.isArray(debts))return debts;}catch(e){}
  try{if(Array.isArray(window.debts))return window.debts;}catch(e){}
  try{const x=JSON.parse(localStorage.getItem(DEBT_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}
}
function creditors(){
  try{const x=JSON.parse(localStorage.getItem(CREDITOR_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}
}
function metaAll(){
  try{const x=JSON.parse(localStorage.getItem(META_KEY)||'{}');return x&&typeof x==='object'?x:{};}catch(e){return {};}
}
function creditorFor(d){
  const raw=String(d?.aktenzeichen??d?.caseNumber??'').trim();
  return creditors().find(c=>c&&(
    (d?.creditorId&&String(c.id)===String(d.creditorId)) ||
    (c.name&&d?.name&&norm(c.name)===norm(d.name)) ||
    (raw&&c.aktenzeichen&&norm(raw)===norm(c.aktenzeichen))
  ))||null;
}
function caseNo(d){const c=creditorFor(d);return String(d?.aktenzeichen??d?.caseNumber??d?.az??c?.aktenzeichen??c?.caseNumber??'').trim();}
function address(d){
  const a=d&&typeof d.contactDetails==='object'?d.contactDetails:{};
  const b=d&&typeof d.contact==='object'?d.contact:{};
  const c=creditorFor(d)||{};
  return String(a.address??a.anschrift??b.address??b.anschrift??c.address??c.anschrift??'').trim();
}
function keyFor(d,i){return String(d?.v131Uid||d?.chatgptImportId||d?.id||[norm(d?.name),caseNo(d),i].join('|'));}
function stats(){
  const list=debtsArr(),meta=metaAll();
  let noCase=0,noAddress=0,claimOpen=0,overdue=0;
  const today=new Date();today.setHours(0,0,0,0);
  list.forEach((d,i)=>{
    if(!caseNo(d))noCase++;
    if(!address(d))noAddress++;
    const m=meta[keyFor(d,i)]||{};
    if(!m.currentClaim)claimOpen++;
    if(m.dueDate){
      const due=new Date(String(m.dueDate)+'T00:00:00');
      if(Number.isFinite(due.getTime())&&due<today&&String(m.nextTask||'')!=='Für Beratung vorbereitet')overdue++;
    }
  });
  return {total:list.length,noCase,noAddress,claimOpen,overdue};
}
function ensureStyle(){
  if(document.getElementById('v141Style'))return;
  const s=document.createElement('style');s.id='v141Style';s.textContent=`
    #v141DashboardCheck{margin:0 0 20px;padding:14px 16px;border:1px solid rgba(255,255,255,.08);border-radius:20px;background:rgba(8,20,38,.72)}
    .v141Head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.v141Head b{font-size:14px}.v141Head span{font-size:11px;color:#93a7c4}
    .v141Grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.v141Item{appearance:none;min-height:62px!important;padding:10px 12px!important;border-radius:14px!important;background:#101e33!important;border:1px solid rgba(255,255,255,.07)!important;color:#eef5ff!important;text-align:left!important;box-shadow:none!important}.v141Item:hover{background:#152641!important}.v141Item strong{display:block;font-size:20px;line-height:1.05}.v141Item small{display:block;margin-top:5px;color:#9fb1cb;font-size:11px}.v141Item.warn strong{color:#ffd073}.v141Item.danger strong{color:#ff8d9e}.v141Item.ok strong{color:#72e8a9}
    @media(max-width:850px){.v141Grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;document.head.appendChild(s);
}
function findAnchor(){return document.querySelector('.stats')||document.querySelector('.stat')?.parentElement||null;}
function render(){
  ensureStyle();
  const a=findAnchor();if(!a)return;
  const x=stats();let box=document.getElementById('v141DashboardCheck');
  if(!box){box=document.createElement('section');box.id='v141DashboardCheck';a.insertAdjacentElement('afterend',box);}
  const cls=n=>n===0?'ok':(n>=Math.max(3,Math.ceil(x.total/2))?'danger':'warn');
  box.innerHTML=`<div class="v141Head"><b>Insolvenz-Datenprüfung</b><span>Klick öffnet den Insolvenz-Status</span></div><div class="v141Grid">
    <button class="v141Item ${cls(x.noCase)}" data-v141-open><strong>${x.noCase}</strong><small>Aktenzeichen fehlen</small></button>
    <button class="v141Item ${cls(x.noAddress)}" data-v141-open><strong>${x.noAddress}</strong><small>Anschriften fehlen</small></button>
    <button class="v141Item ${cls(x.claimOpen)}" data-v141-open><strong>${x.claimOpen}</strong><small>Forderungsstände ungeprüft</small></button>
    <button class="v141Item ${x.overdue?'danger':'ok'}" data-v141-open><strong>${x.overdue}</strong><small>Fristen überfällig</small></button>
  </div>`;
  document.querySelectorAll('.v59MenuVersion').forEach(el=>{if(el.textContent!==VERSION)el.textContent=VERSION;});
}

document.addEventListener('click',e=>{
  if(e.target?.closest?.('[data-v141-open]')){
    if(typeof window.v132InsolvenzOpen==='function')window.v132InsolvenzOpen('status');
    return;
  }
  if(e.target?.closest?.('button')){setTimeout(render,250);setTimeout(render,900);}
},true);

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{setTimeout(render,250);setTimeout(render,1200);},{once:true});
else{setTimeout(render,250);setTimeout(render,1200);}

window.v141RefreshDashboardCheck=render;
})();
