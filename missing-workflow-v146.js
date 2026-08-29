(function(){
'use strict';

const META_KEY='schulden_v131_meta';
const CREDITOR_KEY='schulden_creditors_v37';
let activeFilter='all';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const money=v=>(Number(v)||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});

function debtsArr(){
  try{if(typeof debts!=='undefined'&&Array.isArray(debts))return debts;}catch(e){}
  try{if(Array.isArray(window.debts))return window.debts;}catch(e){}
  try{const x=JSON.parse(localStorage.getItem('godmode_debts')||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}
}
function creditors(){
  try{const x=JSON.parse(localStorage.getItem(CREDITOR_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}
}
function metaAll(){
  try{const x=JSON.parse(localStorage.getItem(META_KEY)||'{}');return x&&typeof x==='object'?x:{};}catch(e){return {};}
}
function caseRaw(d){return String(d?.aktenzeichen??d?.caseNumber??d?.az??d?.reference??d?.referenz??'').trim();}
function creditorFor(d){
  const raw=caseRaw(d);
  return creditors().find(c=>c&&(
    (d?.creditorId&&String(c.id)===String(d.creditorId))||
    (c.name&&d?.name&&norm(c.name)===norm(d.name))||
    (c.aktenzeichen&&raw&&norm(c.aktenzeichen)===norm(raw))
  ))||null;
}
function caseNo(d){const c=creditorFor(d);return caseRaw(d)||String(c?.aktenzeichen??c?.caseNumber??c?.az??'').trim();}
function contact(d){
  const a=d&&typeof d.contactDetails==='object'?d.contactDetails:{};
  const b=d&&typeof d.contact==='object'?d.contact:{};
  const c=creditorFor(d)||{};
  return {
    address:String(a.address??a.anschrift??b.address??b.anschrift??c.address??c.anschrift??'').trim()
  };
}
function docCount(d){
  const pools=[d?.paperlessLinks,d?.correspondence,d?.attachments,d?.documents,d?.files];
  let n=0;for(const p of pools)if(Array.isArray(p))n+=p.length;return n;
}
function keyFor(d,i){return String(d?.v131Uid||d?.chatgptImportId||d?.id||[norm(d?.name),caseNo(d),i].join('|'));}
function mFor(d,i){return metaAll()[keyFor(d,i)]||{};}
function overdue(m){
  if(!m?.dueDate)return false;
  const t=new Date(String(m.dueDate)+'T23:59:59').getTime();
  return Number.isFinite(t)&&t<Date.now();
}
function dueLabel(m){
  if(!m?.dueDate)return '–';
  const d=new Date(String(m.dueDate)+'T12:00:00');
  return Number.isNaN(d.getTime())?String(m.dueDate):d.toLocaleDateString('de-DE');
}
function info(d,i){
  const m=mFor(d,i),c=contact(d),miss=[];
  if(!caseNo(d))miss.push('Aktenzeichen');
  if(!c.address)miss.push('Anschrift');
  if(!m.currentClaim)miss.push('Forderungsstand');
  if(!docCount(d))miss.push('Dokument');
  if(!String(d?.name||'').trim())miss.push('Gläubiger');
  if(!(Number(d?.betrag)>0))miss.push('Forderungsbetrag');
  let task='Für Beratung vorbereitet';
  if(!caseNo(d))task='Aktenzeichen prüfen';
  else if(!c.address)task='Anschrift ergänzen';
  else if(!m.currentClaim)task='aktuellen Forderungsstand prüfen';
  else if(!docCount(d))task='Unterlagen / Nachweis zuordnen';
  else if(!m.contacted)task='Gläubiger / Beratung kontaktieren';
  else if(!m.reply)task='Antwort abwarten / nachfassen';
  return {d,i,m,miss,task,over:overdue(m)};
}
function matches(x){
  if(activeFilter==='all')return x.miss.length>0;
  if(activeFilter==='case')return x.miss.includes('Aktenzeichen');
  if(activeFilter==='address')return x.miss.includes('Anschrift');
  if(activeFilter==='claim')return x.miss.includes('Forderungsstand');
  if(activeFilter==='document')return x.miss.includes('Dokument');
  if(activeFilter==='overdue')return x.over;
  return true;
}
function priority(x){
  let p=x.over?-1000:0;
  if(x.miss.includes('Aktenzeichen'))p+=0;
  else if(x.miss.includes('Anschrift'))p+=100;
  else if(x.miss.includes('Forderungsstand'))p+=200;
  else if(x.miss.includes('Dokument'))p+=300;
  else p+=400;
  return p-x.miss.length;
}
function ensureStyle(){
  if(document.getElementById('v146MissingStyle'))return;
  const s=document.createElement('style');s.id='v146MissingStyle';s.textContent=`
  .v146Missing{margin-top:14px}.v146Top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}.v146Top h3{margin:0 0 5px;font-size:20px}.v146Top p{margin:0;color:#aebed8;font-size:12px}.v146Filters{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0 14px}.v146Filter{min-height:36px!important;padding:0 11px!important;border-radius:999px!important;background:rgba(255,255,255,.06)!important;color:#dce8fb!important;box-shadow:none!important;border:1px solid rgba(255,255,255,.08)!important;font-size:12px!important}.v146Filter.active{background:linear-gradient(135deg,#4f8cff,#9b8cff)!important;color:#fff!important;border-color:transparent!important}.v146Count{display:inline-flex;min-width:20px;height:20px;margin-left:6px;align-items:center;justify-content:center;border-radius:999px;background:rgba(255,255,255,.11);font-size:10px;font-weight:900}.v146Table td:last-child{white-space:nowrap}.v146Task{font-weight:700;color:#e8f1ff}.v146Due.over{color:#ff9aac;font-weight:800}.v146Empty{padding:24px;text-align:center;color:#aebed8;border:1px dashed rgba(255,255,255,.12);border-radius:16px}.v146Open{min-height:38px!important;padding:0 12px!important}.v146Az{font-size:11px;color:#95a9c8;margin-top:3px}
  @media(max-width:760px){.v146Table th:nth-child(2),.v146Table td:nth-child(2){display:none}.v146Top{display:block}.v146Filters{gap:5px}.v146Filter{padding:0 9px!important}}
  `;document.head.appendChild(s);
}
function render(){
  const host=document.getElementById('v132Content');
  if(!host||!document.querySelector('.v132Modal'))return;
  ensureStyle();
  const all=debtsArr().map((d,i)=>info(d,i));
  const open=all.filter(x=>x.miss.length>0);
  const counts={
    all:open.length,
    case:open.filter(x=>x.miss.includes('Aktenzeichen')).length,
    address:open.filter(x=>x.miss.includes('Anschrift')).length,
    claim:open.filter(x=>x.miss.includes('Forderungsstand')).length,
    document:open.filter(x=>x.miss.includes('Dokument')).length,
    overdue:all.filter(x=>x.over).length
  };
  const rows=all.filter(matches).sort((a,b)=>priority(a)-priority(b)||String(a.d?.name||'').localeCompare(String(b.d?.name||''),'de'));
  const filters=[['all','Alle offen'],['case','Aktenzeichen'],['address','Anschrift'],['claim','Forderungsstand'],['document','Dokument'],['overdue','Überfällig']];
  host.dataset.v146Missing='1';
  host.innerHTML=`<div class="v146Missing">
    <div class="v146Top"><div><h3>Unterlagen-Arbeitsliste</h3><p>Nach Dringlichkeit sortiert. „Vervollständigen“ öffnet direkt die Schnellbearbeitung des Gläubigers.</p></div><span class="v132Badge">${open.length} Einträge offen</span></div>
    <div class="v146Filters">${filters.map(([id,label])=>`<button class="v146Filter ${activeFilter===id?'active':''}" data-v146-filter="${id}">${label}<span class="v146Count">${counts[id]}</span></button>`).join('')}</div>
    ${rows.length?`<div class="v132TableWrap"><table class="v132Table v146Table"><thead><tr><th>Gläubiger</th><th>Betrag</th><th>Offen</th><th>Nächste Aufgabe</th><th>Frist</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr>
      <td><b>${esc(x.d?.name||'Ohne Name')}</b><div class="v146Az">AZ ${esc(caseNo(x.d)||'–')}</div></td>
      <td>${money(x.d?.betrag)}</td>
      <td>${x.miss.map(m=>`<span class="v132Badge">${esc(m)}</span>`).join('')||'–'}</td>
      <td><span class="v146Task">${esc(x.task)}</span></td>
      <td class="v146Due ${x.over?'over':''}">${esc(dueLabel(x.m))}${x.over?' · überfällig':''}</td>
      <td><button class="v146Open" data-v132-meta="${x.i}">Vervollständigen</button></td>
    </tr>`).join('')}</tbody></table></div>`:`<div class="v146Empty">Für diesen Filter gibt es aktuell keine offenen Einträge.</div>`}
  </div>`;
}
function scheduleRender(){setTimeout(render,0);setTimeout(render,80);}

document.addEventListener('click',function(e){
  const tab=e.target?.closest?.('[data-v132-tab="missing"]');
  if(tab){activeFilter='all';scheduleRender();return;}
  const f=e.target?.closest?.('[data-v146-filter]');
  if(f){e.preventDefault();e.stopPropagation();activeFilter=f.dataset.v146Filter||'all';render();}
},false);

const oldOpen=window.v132InsolvenzOpen;
if(typeof oldOpen==='function'&&!oldOpen.__v146MissingWorkflow){
  const wrapped=function(tab){
    const r=oldOpen.apply(this,arguments);
    if(tab==='missing')scheduleRender();
    return r;
  };
  wrapped.__v146MissingWorkflow=true;
  window.v132InsolvenzOpen=wrapped;
}

window.v146RenderMissingWorkflow=render;
})();
