(function(){
'use strict';

const DEBT_KEY='godmode_debts';
const CREDITOR_KEY='schulden_creditors_v37';
const META_KEY='schulden_v131_meta';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const text=v=>String(v??'').trim();

function debtsArr(){
  try{if(typeof debts!=='undefined'&&Array.isArray(debts))return debts;}catch(e){}
  try{if(Array.isArray(window.debts))return window.debts;}catch(e){}
  try{const x=JSON.parse(localStorage.getItem(DEBT_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}
}
function creditors(){try{const x=JSON.parse(localStorage.getItem(CREDITOR_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
function metaAll(){try{const x=JSON.parse(localStorage.getItem(META_KEY)||'{}');return x&&typeof x==='object'?x:{};}catch(e){return {};}}
function creditorFor(d){
  const raw=text(d?.aktenzeichen??d?.caseNumber??d?.az),name=norm(d?.name),id=text(d?.creditorId);
  return creditors().find(c=>c&&((id&&String(c.id)===id)||(name&&norm(c.name)===name)||(raw&&norm(c.aktenzeichen||c.caseNumber||'')===norm(raw))))||null;
}
function caseNo(d){const c=creditorFor(d);return text(d?.aktenzeichen??d?.caseNumber??d?.az??c?.aktenzeichen??c?.caseNumber);}
function keyFor(d,i){return String(d?.v131Uid||d?.chatgptImportId||d?.id||[norm(d?.name),norm(caseNo(d)),i].join('|'));}
function fmtDate(v){if(!v)return'–';try{return new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('de-DE');}catch(e){return String(v)}}
function openStatus(d){return String(d?.status||'offen').toLowerCase()!=='bezahlt';}
function validDate(v){if(!v)return'';const s=String(v).slice(0,10),t=new Date(s+'T12:00:00').getTime();return Number.isFinite(t)?s:'';}

function collectRows(){
  const list=debtsArr(),all=metaAll(),rows=[];
  list.forEach((d,i)=>{
    if(!openStatus(d))return;
    const m=all[keyFor(d,i)]||{};
    const insolvencyDate=validDate(m.dueDate);
    const legacyDate=validDate(d?.datum);
    if(insolvencyDate){
      rows.push({d,i,date:insolvencyDate,source:'Insolvenz-Frist',task:text(m.nextTask)||'Frist / nächsten Schritt prüfen'});
    }
    if(legacyDate && legacyDate!==insolvencyDate){
      rows.push({d,i,date:legacyDate,source:'Bestehende Fälligkeit',task:'Fälligkeit des Schuldeneintrags prüfen'});
    }
  });
  const today=new Date();today.setHours(0,0,0,0);const nowMs=today.getTime();
  return rows.map(x=>{const t=new Date(x.date+'T12:00:00').getTime();return {...x,t,days:Math.ceil((t-nowMs)/864e5)};}).sort((a,b)=>a.t-b.t);
}
function badge(x){
  if(x.days<0)return `<span class="v153Pill red">${Math.abs(x.days)} Tag(e) überfällig</span>`;
  if(x.days===0)return '<span class="v153Pill yellow">heute</span>';
  if(x.days<=7)return `<span class="v153Pill yellow">in ${x.days} Tag(en)</span>`;
  return `<span class="v153Pill green">in ${x.days} Tag(en)</span>`;
}
function render(){
  const active=document.querySelector('.v153Tabs [data-v153-tab="deadlines"].active');
  const host=document.getElementById('v153Content');
  if(!active||!host)return false;
  const rows=collectRows();
  host.innerHTML=`<div class="v153Section"><h3>📅 Fristen-Zentrale</h3><div class="v153Note">Hier werden jetzt beide Datumsarten zusammengeführt: <b>Insolvenz-Frist</b> aus dem Arbeitsbereich und <b>Bestehende Fälligkeit</b> aus dem bisherigen Schuldeneintrag. Es wird nichts automatisch umgeschrieben.</div>${rows.length?`<div class="v153TableWrap" style="margin-top:10px"><table class="v153Table"><thead><tr><th>Datum</th><th>Gläubiger</th><th>Art</th><th>Status</th><th>Aufgabe</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(fmtDate(x.date))}</b></td><td>${esc(x.d?.name||'–')}</td><td><span class="v153Pill">${esc(x.source)}</span></td><td>${badge(x)}</td><td>${esc(x.task)}</td><td><button data-v153-edit="${x.i}">Bearbeiten</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="v153Note" style="margin-top:10px">Es wurden weder Insolvenz-Fristen noch bestehende Fälligkeiten gefunden.</div>'}</div>`;
  return true;
}
function schedule(){[0,40,120,300].forEach(ms=>setTimeout(render,ms));}

window.addEventListener('click',e=>{
  if(e.target?.closest?.('[data-v153-tab="deadlines"]'))schedule();
},true);

window.v160RenderDeadlines=render;
})();
