(function(){
'use strict';

const VERSION='v153';
const DEBT_KEY='godmode_debts';
const CREDITOR_KEY='schulden_creditors_v37';
const META_KEY='schulden_v131_meta';
const HISTORY_KEY='schulden_v153_debt_history';
const SENDER_KEY='schulden_v153_sender';
const PAPERLESS_SETTINGS_KEY='schulden_paperless_settings_v79';
const DRIVE_BACKUP_KEY='schulden_v139_last_drive_backup';
const CHECKS=[
  ['claimStatement','Forderungsaufstellung'],
  ['titleCopy','Titel / Vollstreckungsbescheid'],
  ['contractInvoice','Vertrag / Rechnung'],
  ['lastLetter','Letztes Gläubigerschreiben'],
  ['paymentProof','Zahlungs- / Buchungsnachweis'],
  ['contactVerified','Anschrift / Vertreter geprüft']
];
let currentTab='today';
let paperlessInboxDocs=[];
let saveHooked=false;
const unlockedSession=new Set();

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const compact=v=>norm(v).replace(/\s+/g,'');
const text=v=>String(v??'').trim();
const now=()=>new Date().toISOString();
const money=v=>(Number(v)||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const fmtDate=v=>{if(!v)return'–';try{return new Date(v.length===10?v+'T12:00:00':v).toLocaleDateString('de-DE');}catch(e){return String(v)}};

function toast(msg){try{if(typeof showToast==='function'){showToast(msg);return;}}catch(e){}alert(msg);}
function debtsArr(){
  try{if(typeof debts!=='undefined'&&Array.isArray(debts))return debts;}catch(e){}
  try{if(Array.isArray(window.debts))return window.debts;}catch(e){}
  try{const x=JSON.parse(localStorage.getItem(DEBT_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}
}
function creditors(){try{const x=JSON.parse(localStorage.getItem(CREDITOR_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
function metaAll(){try{const x=JSON.parse(localStorage.getItem(META_KEY)||'{}');return x&&typeof x==='object'?x:{};}catch(e){return {};}}
function saveMetaAll(x){localStorage.setItem(META_KEY,JSON.stringify(x));}
function uid(){try{return crypto.randomUUID();}catch(e){return 'v153-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);}}
function caseRaw(d){return text(d?.aktenzeichen??d?.caseNumber??d?.az??d?.reference??d?.referenz);}
function creditorFor(d){
  const raw=caseRaw(d),name=norm(d?.name),id=text(d?.creditorId);
  return creditors().find(c=>c&&((id&&String(c.id)===id)||(name&&norm(c.name)===name)||(raw&&norm(c.aktenzeichen||c.caseNumber||'')===norm(raw))))||null;
}
function caseNo(d){const c=creditorFor(d);return caseRaw(d)||text(c?.aktenzeichen??c?.caseNumber??c?.az);}
function customerNo(d){const c=creditorFor(d);return text(d?.kundennummer??d?.customerNumber??d?.vertragsnummer??d?.contractNumber??c?.kundennummer??c?.customerNumber??c?.vertragsnummer);}
function contact(d){
  const a=d&&typeof d.contactDetails==='object'?d.contactDetails:{};
  const b=d&&typeof d.contact==='object'?d.contact:{};
  const c=creditorFor(d)||{};
  return {
    representative:text(a.representative??a.name??a.vertreter??b.representative??b.name??b.vertreter??d?.ansprechpartner??c.representative??c.contactPerson),
    address:text(a.address??a.anschrift??b.address??b.anschrift??c.address??c.anschrift),
    email:text(a.email??a.mail??b.email??b.mail??c.email??c.mail),
    phone:text(a.phone??a.telefon??a.telefonnummer??b.phone??b.telefon??c.phone??c.telefon)
  };
}
function ensureUid(d){if(!d.v131Uid)d.v131Uid=uid();return d.v131Uid;}
function keyFor(d,i){return String(d?.v131Uid||d?.chatgptImportId||d?.id||[norm(d?.name),norm(caseNo(d)),i].join('|'));}
function currentMeta(d,i){return metaAll()[keyFor(d,i)]||{};}
function setMeta(d,i,patch){const all=metaAll(),k=keyFor(d,i);all[k]={...(all[k]||{}),...patch,updatedAt:now()};saveMetaAll(all);return all[k];}
function documents(d){
  const out=[],seen=new Set();
  const pools=[['Paperless',d?.paperlessLinks],['Daten',d?.correspondence],['Anhang',d?.attachments],['Dokument',d?.documents],['Datei',d?.files]];
  for(const [source,pool] of pools){if(!Array.isArray(pool))continue;for(const x of pool){const id=String(x&&typeof x==='object'?(x.id??x.paperlessId??x.documentId??x.fileId??x.name??x.filename??x.title??JSON.stringify(x)):x);const k=source+'|'+id;if(seen.has(k))continue;seen.add(k);out.push({source,id,title:text(x?.title??x?.name??x?.filename??x)||id,raw:x});}}
  return out;
}
function linkedPaperlessIds(){const s=new Set();for(const d of debtsArr())for(const p of (Array.isArray(d?.paperlessLinks)?d.paperlessLinks:[])){const id=p&&typeof p==='object'?(p.id??p.paperlessId??p.documentId):p;if(id!=null)s.add(String(id));}return s;}
function missingItems(d,i){
  const m=currentMeta(d,i),c=contact(d),out=[];
  if(!text(d?.name))out.push('Gläubiger');
  if(!(Number(d?.betrag)>0))out.push('Forderungsbetrag');
  if(!caseNo(d))out.push('Aktenzeichen');
  if(!c.address)out.push('Anschrift');
  if(!m.currentClaim)out.push('Forderungsstand prüfen');
  if(!documents(d).length)out.push('Dokument / Nachweis');
  return out;
}
function autoTask(d,i){
  const m=currentMeta(d,i),c=contact(d);
  if(m.locked)return 'Geprüft / fertig';
  if(!caseNo(d))return 'Aktenzeichen prüfen';
  if(!c.address)return 'Anschrift ergänzen';
  if(!m.currentClaim)return 'aktuellen Forderungsstand prüfen';
  if(!documents(d).length)return 'Unterlagen / Nachweis zuordnen';
  if(!m.contacted)return 'Gläubiger / Beratung kontaktieren';
  if(!m.reply)return 'Antwort abwarten / nachfassen';
  return 'Für Beratung vorbereitet';
}
function dueTime(m){if(!m?.dueDate)return NaN;return new Date(String(m.dueDate)+'T23:59:59').getTime();}
function persist(){
  try{localStorage.setItem(DEBT_KEY,JSON.stringify(debtsArr()));}catch(e){}
  try{if(typeof window.save==='function')window.save();else if(typeof save==='function')save();}catch(e){}
  try{if(typeof window.v140ReconcileCreditorData==='function')window.v140ReconcileCreditorData();}catch(e){}
  try{if(typeof window.render==='function')window.render();else if(typeof render==='function')render();}catch(e){}
  setTimeout(()=>recordSnapshot('Änderung'),20);
}

function historyArr(){try{const x=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
function debtTotals(){
  const list=debtsArr();let total=0,open=0,paid=0;
  for(const d of list){const a=Number(d?.betrag)||0;total+=a;if(String(d?.status||'offen')==='bezahlt')paid+=a;else open+=a;}
  return {total,open,paid,count:list.length};
}
function recordSnapshot(source='Auto'){
  const t=debtTotals(),arr=historyArr(),last=arr[arr.length-1];
  if(last&&Number(last.total)===t.total&&Number(last.open)===t.open&&Number(last.paid)===t.paid&&Number(last.count)===t.count)return false;
  arr.push({at:now(),source,total:t.total,open:t.open,paid:t.paid,count:t.count});
  localStorage.setItem(HISTORY_KEY,JSON.stringify(arr.slice(-500)));return true;
}
function hookSave(){
  if(saveHooked)return;
  let original=null;try{original=window.save;}catch(e){}
  if(typeof original!=='function'||original.__v153History){saveHooked=true;return;}
  const wrapped=function(){const r=original.apply(this,arguments);try{recordSnapshot('App-Speichern');}catch(e){}return r;};
  wrapped.__v153History=true;window.save=wrapped;try{save=wrapped;}catch(e){}saveHooked=true;
}

function ensureStyle(){
  if($('v153Style'))return;
  const s=document.createElement('style');s.id='v153Style';s.textContent=`
  .v153Overlay{position:fixed;inset:0;z-index:18000;background:rgba(2,6,18,.86);backdrop-filter:blur(12px);padding:14px;overflow:auto}.v153Modal{max-width:1320px;margin:1.5vh auto;background:#0d1727;color:#eaf2ff;border:1px solid rgba(255,255,255,.12);border-radius:26px;padding:18px;box-shadow:0 30px 80px rgba(0,0,0,.35)}
  .v153Head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.v153Head h2{margin:0 0 5px}.v153Sub{color:#9fb0cc;font-size:12px}.v153Close{width:42px;height:42px;min-width:42px;padding:0}.v153Tabs{display:flex;gap:7px;flex-wrap:wrap;margin:14px 0}.v153Tabs button{min-height:38px!important;padding:0 11px!important;font-size:12px!important}.v153Tabs button.active{background:linear-gradient(135deg,#2563eb,#7c3aed)!important;color:white!important}
  .v153Grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.v153Card{padding:13px;border-radius:16px;background:#111e31;border:1px solid rgba(255,255,255,.08)}.v153Card b.big{display:block;font-size:22px;margin-top:5px}.v153Card small,.v153Muted{color:#9fb0cc;font-size:12px;line-height:1.45}.v153Section{margin-top:14px;padding:14px;border-radius:18px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07)}.v153Section h3{margin:0 0 10px;font-size:17px}.v153TableWrap{overflow:auto}.v153Table{width:100%;border-collapse:collapse}.v153Table th,.v153Table td{padding:9px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left;vertical-align:top}.v153Table th{color:#9fb0cc;font-size:11px;white-space:nowrap}.v153Actions{display:flex;gap:7px;flex-wrap:wrap}.v153Actions button{min-height:36px!important;padding:0 10px!important;font-size:12px!important}.v153Pill{display:inline-flex;padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.08);font-size:11px;margin:2px}.v153Pill.red{background:rgba(239,68,68,.16);color:#ffc3cc}.v153Pill.yellow{background:rgba(245,158,11,.16);color:#ffe0a3}.v153Pill.green{background:rgba(34,197,94,.15);color:#c9f8d9}.v153Form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.v153Form label{display:flex;flex-direction:column;gap:5px;color:#aebed8;font-size:12px}.v153Form .wide{grid-column:1/-1}.v153Input,.v153Select,.v153Text{width:100%;border-radius:11px!important;background:#101d30!important;color:#fff!important;border:1px solid rgba(255,255,255,.1)!important;box-shadow:none!important}.v153Input,.v153Select{min-height:43px!important;padding:0 10px!important}.v153Text{min-height:220px;padding:11px;resize:vertical;font:14px/1.5 system-ui}.v153Check{display:flex;align-items:center;gap:7px}.v153Check input{width:18px;height:18px;min-height:0}.v153Safety{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.v153SafetyItem{padding:13px;border-radius:15px;background:#101d30;border-left:4px solid #64748b}.v153SafetyItem.green{border-left-color:#22c55e}.v153SafetyItem.yellow{border-left-color:#f59e0b}.v153SafetyItem.red{border-left-color:#ef4444}.v153SafetyItem b{display:block}.v153SafetyItem small{display:block;color:#9fb0cc;margin-top:4px}.v153Spark{display:flex;align-items:flex-end;gap:4px;height:110px;padding:8px 0}.v153Bar{flex:1;min-width:5px;background:linear-gradient(180deg,#60a5fa,#4f46e5);border-radius:4px 4px 0 0;opacity:.85}.v153InboxItem{display:grid;grid-template-columns:minmax(220px,1.2fr) minmax(220px,1fr) auto;gap:10px;align-items:center;padding:10px;border-bottom:1px solid rgba(255,255,255,.07)}.v153InboxItem select{width:100%}.v153Danger{color:#ffb4c0}.v153TopActions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.v153TopActions button{min-height:38px!important;padding:0 12px!important}.v153Lock{font-size:18px}.v153Note{padding:10px 12px;border-radius:12px;background:rgba(59,130,246,.08);color:#cbdcf6;font-size:12px;line-height:1.5}
  @media(max-width:900px){.v153Grid,.v153Safety{grid-template-columns:repeat(2,minmax(0,1fr))}.v153Form{grid-template-columns:1fr}.v153Form .wide{grid-column:auto}.v153InboxItem{grid-template-columns:1fr}.v153Table{font-size:12px}}
  @media(max-width:560px){.v153Grid,.v153Safety{grid-template-columns:1fr}.v153Modal{padding:13px}.v153Tabs button{flex:1 1 130px}}
  `;document.head.appendChild(s);
}

function summaryHtml(){
  const list=debtsArr(),all=metaAll();let locked=0,over=0,noDocs=0,ready=0;
  list.forEach((d,i)=>{const m=all[keyFor(d,i)]||{};if(m.locked)locked++;if(Number.isFinite(dueTime(m))&&dueTime(m)<Date.now())over++;if(!documents(d).length)noDocs++;if(!missingItems(d,i).length)ready++;});
  return `<div class="v153Grid"><div class="v153Card"><small>Gläubiger</small><b class="big">${list.length}</b></div><div class="v153Card"><small>Gesamtschulden</small><b class="big">${money(debtTotals().total)}</b></div><div class="v153Card"><small>Organisatorisch vollständig</small><b class="big">${ready}</b></div><div class="v153Card"><small>Geprüft / gesperrt</small><b class="big">${locked}</b></div><div class="v153Card"><small>Fristen überfällig</small><b class="big">${over}</b></div><div class="v153Card"><small>Ohne Dokument</small><b class="big">${noDocs}</b></div></div>`;
}

function priorityItems(){
  const list=debtsArr(),all=metaAll(),today=Date.now();
  return list.map((d,i)=>{const m=all[keyFor(d,i)]||{},miss=missingItems(d,i);let score=0;const dt=dueTime(m);if(Number.isFinite(dt)&&dt<today)score+=120;else if(Number.isFinite(dt)&&dt-today<7*864e5)score+=80;if(!caseNo(d))score+=65;if(!contact(d).address)score+=55;if(!m.currentClaim)score+=50;if(!documents(d).length)score+=45;if(!m.contacted)score+=25;if(m.locked)score=-999;return {d,i,m,miss,score,task:text(m.nextTask)||autoTask(d,i)};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||Number(b.d.betrag||0)-Number(a.d.betrag||0));
}
function renderToday(){
  const items=priorityItems().slice(0,5);
  return `${summaryHtml()}<div class="v153Section"><h3>✅ Heute erledigen</h3><div class="v153Note">Die Liste priorisiert überfällige Fristen und fehlende Insolvenz-Angaben. Es werden höchstens fünf nächste Schritte gezeigt.</div>${items.length?`<div class="v153TableWrap"><table class="v153Table"><thead><tr><th>Gläubiger</th><th>Nächste Aufgabe</th><th>Frist</th><th>Offen</th><th></th></tr></thead><tbody>${items.map(x=>`<tr><td><b>${esc(x.d.name||'–')}</b><br><small>${money(x.d.betrag)}</small></td><td>${esc(x.task)}</td><td>${esc(fmtDate(x.m.dueDate))}</td><td>${x.miss.map(v=>`<span class="v153Pill yellow">${esc(v)}</span>`).join('')}</td><td><button data-v153-edit="${x.i}">Vervollständigen</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="v153Note" style="margin-top:10px">Aktuell gibt es keine automatisch priorisierten Aufgaben.</div>'}</div>`;
}
function renderDeadlines(){
  const list=debtsArr(),all=metaAll(),today=new Date();today.setHours(0,0,0,0);const nowMs=today.getTime();
  const rows=list.map((d,i)=>({d,i,m:all[keyFor(d,i)]||{}})).filter(x=>x.m.dueDate).map(x=>{const t=new Date(x.m.dueDate+'T12:00:00').getTime(),days=Math.ceil((t-nowMs)/864e5);return {...x,t,days};}).sort((a,b)=>a.t-b.t);
  const label=x=>x.days<0?`<span class="v153Pill red">${Math.abs(x.days)} Tag(e) überfällig</span>`:x.days<=7?`<span class="v153Pill yellow">in ${x.days} Tag(en)</span>`:`<span class="v153Pill green">in ${x.days} Tag(en)</span>`;
  return `<div class="v153Section"><h3>📅 Fristen-Zentrale</h3><div class="v153Note">Sortiert nach Fälligkeit: überfällig → nächste 7 Tage → später.</div>${rows.length?`<div class="v153TableWrap"><table class="v153Table"><thead><tr><th>Frist</th><th>Gläubiger</th><th>Status</th><th>Aufgabe</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(fmtDate(x.m.dueDate))}</b></td><td>${esc(x.d.name||'–')}</td><td>${label(x)}</td><td>${esc(text(x.m.nextTask)||autoTask(x.d,x.i))}</td><td><button data-v153-edit="${x.i}">Bearbeiten</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="v153Note" style="margin-top:10px">Noch keine Fristen erfasst.</div>'}</div>`;
}

function paperlessHeaders(pdf=false){
  const h={Accept:pdf?'application/pdf,application/octet-stream;q=0.9,*/*;q=0.5':'application/json'};
  try{const st=JSON.parse(localStorage.getItem(PAPERLESS_SETTINGS_KEY)||'{}');if(st.url)h['x-paperless-url']=text(st.url).replace(/\/+$/,'');if(st.token)h['x-paperless-token']=text(st.token);if(st.insecureTls)h['x-paperless-insecure-tls']='true';if(st.tag)h['x-paperless-tag']=text(st.tag);}catch(e){}
  return h;
}
async function openPaperlessPdf(id){
  let tab=null;try{tab=window.open('about:blank','_blank');if(tab)tab.document.body.textContent='Paperless-Dokument wird geladen …';}catch(e){}
  try{const r=await fetch('/api/paperless/document/'+encodeURIComponent(id),{headers:paperlessHeaders(true),cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const blob=await r.blob(),u=URL.createObjectURL(blob);if(tab&&!tab.closed)tab.location.replace(u);else window.open(u,'_blank');setTimeout(()=>URL.revokeObjectURL(u),300000);}catch(e){if(tab&&!tab.closed)tab.close();toast('PDF konnte nicht geöffnet werden: '+(e.message||e));}
}
function suggestionFor(doc){
  const hay=norm([doc.title,doc.original_filename,doc.archive_filename,doc.content,doc.__match_reason].filter(Boolean).join(' ')),hc=compact(hay);let best=null;
  debtsArr().forEach((d,i)=>{let score=0,reasons=[];const az=compact(caseNo(d)),cust=compact(customerNo(d)),name=norm(d.name),tokens=name.split(' ').filter(x=>x.length>=4);if(az&&hc.includes(az)){score+=140;reasons.push('Aktenzeichen');}if(cust&&hc.includes(cust)){score+=100;reasons.push('Kunden-/Vertragsnummer');}if(name&&hay.includes(name)){score+=65;reasons.push('Gläubigername');}for(const t of tokens)if(hay.includes(t))score+=12;if(!best||score>best.score)best={i,score,reasons};});
  return best&&best.score>=24?best:null;
}
function renderPaperless(){return `<div class="v153Section"><div class="v153TopActions"><button data-v153-pl-load>🔄 Paperless-Posteingang laden</button></div><h3>📥 Paperless-Posteingang</h3><div class="v153Note">Es werden Dokumente mit deinem Paperless-App-Tag geladen, die noch keinem Gläubiger in der Schulden-App zugeordnet sind. Die Zuordnung bleibt immer manuell.</div><div id="v153PaperlessBox" style="margin-top:10px">Noch nicht geladen.</div></div>`;}
async function loadPaperlessInbox(){
  const box=$('v153PaperlessBox');if(!box)return;box.innerHTML='<div class="v153Note">Paperless wird gelesen …</div>';
  try{
    let tag='App';try{const st=JSON.parse(localStorage.getItem(PAPERLESS_SETTINGS_KEY)||'{}');if(st.tag)tag=st.tag;}catch(e){}
    const r=await fetch('/api/paperless/search?q=&page_size=50&tag='+encodeURIComponent(tag),{headers:paperlessHeaders(false),cache:'no-store'}),j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||('HTTP '+r.status));
    const linked=linkedPaperlessIds(),all=Array.isArray(j?.data?.results)?j.data.results:[];paperlessInboxDocs=all.filter(d=>d?.id!=null&&!linked.has(String(d.id)));
    if(!paperlessInboxDocs.length){box.innerHTML='<div class="v153Note">Keine unzugeordneten Paperless-Dokumente gefunden.</div>';return;}
    box.innerHTML=`<div class="v153Muted">${paperlessInboxDocs.length} unzugeordnete Dokument(e)</div><div style="margin-top:8px">${paperlessInboxDocs.map((d,n)=>{const s=suggestionFor(d);return `<div class="v153InboxItem"><div><b>${esc(d.title||d.original_filename||('Dokument #'+d.id))}</b><br><small>${esc(fmtDate(d.created||d.added||''))} · ID ${esc(d.id)}${s?` · Vorschlag: ${esc((debtsArr()[s.i]?.name)||'')} (${s.score})`:''}</small></div><select class="v153Select" data-v153-pl-select="${n}"><option value="">Gläubiger wählen …</option>${debtsArr().map((x,i)=>`<option value="${i}" ${s&&s.i===i?'selected':''}>${esc(x.name||'Gläubiger')} · ${esc(caseNo(x)||'ohne AZ')}</option>`).join('')}</select><div class="v153Actions"><button class="secondary" data-v153-pl-preview="${n}">PDF ansehen</button><button data-v153-pl-link="${n}">Zuordnen</button></div></div>`;}).join('')}</div>`;
  }catch(e){box.innerHTML='<div class="v153Note v153Danger">Paperless konnte nicht geladen werden: '+esc(e.message||e)+'</div>';}
}
function linkPaperless(n){
  const doc=paperlessInboxDocs[n],sel=document.querySelector(`[data-v153-pl-select="${n}"]`),i=Number(sel?.value);if(!doc||!Number.isInteger(i)||!debtsArr()[i]){toast('Bitte zuerst einen Gläubiger auswählen.');return;}
  if(!allowLocked(i,'Paperless-Dokument zuordnen'))return;
  const d=debtsArr()[i];if(!Array.isArray(d.paperlessLinks))d.paperlessLinks=[];if(!d.paperlessLinks.some(x=>String(x?.id??x)===String(doc.id)))d.paperlessLinks.push({id:doc.id,title:doc.title||doc.original_filename||('Dokument #'+doc.id),meta:'Paperless-Posteingang v153',linkedAt:now()});
  persist();setMeta(d,i,{docChecklist:{...(currentMeta(d,i).docChecklist||{}),lastLetter:true}});toast('Paperless-Dokument zugeordnet ✅');loadPaperlessInbox();
}

function checklist(d,i){return currentMeta(d,i).docChecklist||{};}
function renderDocuments(){
  const list=debtsArr();return `<div class="v153Section"><h3>🧾 Dokumentprüfung</h3><div class="v153Note">Die Häkchen bedeuten nur: Dokument ist für deine Unterlagen vorhanden bzw. geprüft. Sie sind keine rechtliche Bewertung.</div><div class="v153TableWrap" style="margin-top:10px"><table class="v153Table"><thead><tr><th>Gläubiger</th><th>Dokumente</th>${CHECKS.map(x=>`<th>${esc(x[1])}</th>`).join('')}</tr></thead><tbody>${list.map((d,i)=>{const c=checklist(d,i);return `<tr><td><b>${esc(d.name||'–')}</b><br><small>${esc(caseNo(d)||'ohne AZ')}</small></td><td>${documents(d).length}</td>${CHECKS.map(([k])=>`<td><label class="v153Check"><input type="checkbox" data-v153-doc-check="${i}" data-v153-doc-key="${k}" ${c[k]?'checked':''}></label></td>`).join('')}</tr>`;}).join('')}</tbody></table></div></div>`;
}
function updateDocCheck(i,k,val){const d=debtsArr()[i];if(!d)return;if(!allowLocked(i,'Dokumentenstatus ändern')){renderContent();return;}const m=currentMeta(d,i),c={...(m.docChecklist||{}),[k]:Boolean(val)};setMeta(d,i,{docChecklist:c});}

function sender(){try{const x=JSON.parse(localStorage.getItem(SENDER_KEY)||'{}');return x&&typeof x==='object'?x:{};}catch(e){return {};}}
function saveSender(){const name=text($('v153SenderName')?.value),address=text($('v153SenderAddress')?.value);localStorage.setItem(SENDER_KEY,JSON.stringify({name,address}));return {name,address};}
function letterBody(type,d){
  const az=caseNo(d),cust=customerNo(d),ref=[az&&('Aktenzeichen: '+az),cust&&('Kunden-/Vertragsnummer: '+cust)].filter(Boolean).join(' · ');
  const intro=ref?`Bezug: ${ref}\n\n`:'';
  if(type==='claim')return intro+'bitte teilen Sie mir den aktuellen Stand der gegen mich geltend gemachten Forderung mit. Ich bitte um eine nachvollziehbare Forderungsaufstellung mit Hauptforderung, Zinsen, Kosten sowie – falls vorhanden – Angaben zu einem Titel und zum aktuellen titulierten Betrag.\n\nBitte senden Sie mir die Unterlagen bzw. die Aufstellung schriftlich zu.';
  if(type==='case')return intro+'für die geordnete Zusammenstellung meiner Unterlagen benötige ich das zu meinem Vorgang gehörende Aktenzeichen sowie – falls vorhanden – Kunden-, Vertrags- oder Forderungsnummern.\n\nBitte teilen Sie mir diese Angaben schriftlich mit.';
  if(type==='docs')return intro+'bitte übersenden Sie mir Kopien bzw. eine Aufstellung der Unterlagen, auf die Sie Ihre Forderung stützen, insbesondere Rechnung/Vertrag, Forderungsaufstellung und – sofern vorhanden – Titel oder Vollstreckungsbescheid.\n\nIch benötige die Unterlagen zur geordneten Prüfung und Vorbereitung meiner Schuldnerberatung.';
  return intro+'ich bereite derzeit meine Unterlagen für eine Schuldnerberatung bzw. Schuldenbereinigung vor. Bitte führen Sie die Kommunikation zu der oben genannten Forderung möglichst schriftlich und teilen Sie mir Änderungen des Forderungsstands sowie wichtige Fristen mit.';
}
function generateLetter(){
  const i=Number($('v153LetterCreditor')?.value),d=debtsArr()[i];if(!d){toast('Bitte Gläubiger auswählen.');return'';}const type=$('v153LetterType')?.value||'claim',s=saveSender(),c=contact(d),date=new Date().toLocaleDateString('de-DE');
  const subject={claim:'Aktuellen Forderungsstand / Forderungsaufstellung anfordern',case:'Aktenzeichen / Referenznummer anfordern',docs:'Unterlagen zur Forderung anfordern',contact:'Schriftliche Kommunikation / Schuldnerberatung'}[type];
  const parts=[];if(s.name||s.address)parts.push([s.name,s.address].filter(Boolean).join('\n'));parts.push([d.name,c.address].filter(Boolean).join('\n'));parts.push(date);parts.push('Betreff: '+subject);parts.push('Sehr geehrte Damen und Herren,');parts.push(letterBody(type,d));parts.push('Mit freundlichen Grüßen\n'+(s.name||''));const out=parts.filter(Boolean).join('\n\n');const ta=$('v153LetterText');if(ta)ta.value=out;return out;
}
function renderLetters(){
  const s=sender(),list=debtsArr();return `<div class="v153Section"><h3>✉️ Schreiben-Generator</h3><div class="v153Form"><label>Gläubiger<select id="v153LetterCreditor" class="v153Select">${list.map((d,i)=>`<option value="${i}">${esc(d.name||'Gläubiger')} · ${esc(caseNo(d)||'ohne AZ')}</option>`).join('')}</select></label><label>Vorlage<select id="v153LetterType" class="v153Select"><option value="claim">Aktuellen Forderungsstand anfordern</option><option value="case">Aktenzeichen / Referenz anfordern</option><option value="docs">Unterlagen anfordern</option><option value="contact">Schriftliche Kommunikation / Beratung</option></select></label><label>Absendername<input id="v153SenderName" class="v153Input" value="${esc(s.name||'')}"></label><label>Absenderanschrift<input id="v153SenderAddress" class="v153Input" value="${esc(s.address||'')}"></label><label class="wide">Schreiben<textarea id="v153LetterText" class="v153Text" placeholder="Mit „Text erzeugen“ wird das Schreiben erstellt."></textarea></label></div><div class="v153TopActions" style="margin-top:10px"><button data-v153-letter-generate>Text erzeugen</button><button class="secondary" data-v153-letter-copy>📋 Kopieren</button><button class="secondary" data-v153-letter-pdf>📄 Als PDF</button></div><div class="v153Note">Der Generator erstellt ein sachliches Organisationsschreiben. Inhalt vor dem Versand bitte prüfen.</div></div>`;
}
function exportLetterPdf(){const content=text($('v153LetterText')?.value)||generateLetter();if(!content)return;try{const jsPDF=window.jspdf?.jsPDF;if(!jsPDF)throw new Error('PDF-Bibliothek nicht geladen');const doc=new jsPDF({unit:'mm',format:'a4'});doc.setFontSize(11);const lines=doc.splitTextToSize(content,170);let y=20;for(const line of lines){if(y>280){doc.addPage();y=20;}doc.text(line,20,y);y+=5.4;}doc.save('Schreiben_'+new Date().toISOString().slice(0,10)+'.pdf');}catch(e){toast(e.message||'PDF konnte nicht erstellt werden');}}

function duplicatePairs(){
  const list=debtsArr(),out=[];for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const a=list[i],b=list[j],why=[];if(norm(a.name)&&norm(a.name)===norm(b.name))why.push('gleicher Gläubiger');const aa=compact(caseNo(a)),bb=compact(caseNo(b));if(aa&&bb&&aa===bb)why.push('gleiches Aktenzeichen');if(Number(a.betrag)>0&&Math.abs(Number(a.betrag)-Number(b.betrag))<0.01)why.push('gleicher Betrag');const ad=new Set((a.paperlessLinks||[]).map(x=>String(x?.id??x))),bd=new Set((b.paperlessLinks||[]).map(x=>String(x?.id??x)));if([...ad].some(x=>bd.has(x)))why.push('gleiches Paperless-Dokument');if(why.includes('gleiches Aktenzeichen')||why.includes('gleiches Paperless-Dokument')||why.length>=2)out.push({i,j,why});}return out;
}
function renderDuplicates(){const pairs=duplicatePairs();return `<div class="v153Section"><h3>🔀 Dubletten zusammenführen</h3><div class="v153Note">Zusammenführen ergänzt fehlende Daten und Dokumente im behaltenen Datensatz. Bei unterschiedlichen Beträgen bleibt der Betrag des behaltenen Datensatzes bestehen.</div>${pairs.length?`<div class="v153TableWrap" style="margin-top:10px"><table class="v153Table"><thead><tr><th>A</th><th>B</th><th>Warum erkannt?</th><th>Aktion</th></tr></thead><tbody>${pairs.map(p=>`<tr><td><b>${esc(debtsArr()[p.i]?.name)}</b><br>${money(debtsArr()[p.i]?.betrag)}<br><small>${esc(caseNo(debtsArr()[p.i])||'ohne AZ')}</small></td><td><b>${esc(debtsArr()[p.j]?.name)}</b><br>${money(debtsArr()[p.j]?.betrag)}<br><small>${esc(caseNo(debtsArr()[p.j])||'ohne AZ')}</small></td><td>${p.why.map(x=>`<span class="v153Pill yellow">${esc(x)}</span>`).join('')}</td><td><div class="v153Actions"><button data-v153-merge-keep="${p.i}" data-v153-merge-remove="${p.j}">A behalten</button><button class="secondary" data-v153-merge-keep="${p.j}" data-v153-merge-remove="${p.i}">B behalten</button></div></td></tr>`).join('')}</tbody></table></div>`:'<div class="v153Note" style="margin-top:10px">Keine starken Dubletten gefunden.</div>'}</div>`;}
function mergeArrayField(keep,remove,field){const a=Array.isArray(keep[field])?keep[field]:[],b=Array.isArray(remove[field])?remove[field]:[];const seen=new Set(a.map(x=>String(x?.id??x?.paperlessId??x?.name??x?.filename??JSON.stringify(x))));for(const x of b){const k=String(x?.id??x?.paperlessId??x?.name??x?.filename??JSON.stringify(x));if(!seen.has(k)){seen.add(k);a.push(x);}}keep[field]=a;}
function mergePair(keepIdx,removeIdx){
  const list=debtsArr(),keep=list[keepIdx],remove=list[removeIdx];if(!keep||!remove||keepIdx===removeIdx)return;if(!allowLocked(keepIdx,'Dubletten zusammenführen')||!allowLocked(removeIdx,'Dubletten zusammenführen'))return;
  if(!confirm(`„${keep.name}“ behalten und „${remove.name}“ hinein zusammenführen?\n\nDer zweite Datensatz wird danach gelöscht.`))return;
  ensureUid(keep);const keepKey=keyFor(keep,keepIdx),removeKey=keyFor(remove,removeIdx),all=metaAll();
  const fill=(k,v)=>{if((keep[k]==null||text(keep[k])==='')&&v!=null&&text(v)!=='')keep[k]=v;};for(const k of ['name','grund','reason','aktenzeichen','caseNumber','kundennummer','customerNumber','category','kategorie'])fill(k,remove[k]);
  if(!(Number(keep.betrag)>0)&&Number(remove.betrag)>0){keep.betrag=Number(remove.betrag);keep.amount=Number(remove.betrag);}
  const kc=contact(keep),rc=contact(remove);keep.contactDetails={representative:kc.representative||rc.representative,address:kc.address||rc.address,email:kc.email||rc.email,phone:kc.phone||rc.phone};keep.contactPerson=[keep.contactDetails.representative,keep.contactDetails.address,keep.contactDetails.email,keep.contactDetails.phone].filter(Boolean).join(' | ');
  for(const f of ['paperlessLinks','correspondence','attachments','documents','files','notesHistory','editHistory','payments'])mergeArrayField(keep,remove,f);
  const km=all[keepKey]||{},rm=all[removeKey]||{},kc2=km.docChecklist||{},rc2=rm.docChecklist||{};all[keepKey]={...rm,...km,currentClaim:Boolean(km.currentClaim||rm.currentClaim),titled:Boolean(km.titled||rm.titled),disputed:Boolean(km.disputed||rm.disputed),contacted:Boolean(km.contacted||rm.contacted),reply:Boolean(km.reply||rm.reply),locked:Boolean(km.locked||rm.locked),docChecklist:{...rc2,...kc2},updatedAt:now()};delete all[removeKey];saveMetaAll(all);
  list.splice(removeIdx,1);persist();toast('Dubletten zusammengeführt ✅');openSuite('duplicates');
}

function allowLocked(i,action){const d=debtsArr()[i];if(!d)return false;const m=currentMeta(d,i),k=keyFor(d,i);if(!m.locked||unlockedSession.has(k))return true;if(confirm(`„${d.name}“ ist als geprüft/fertig gesperrt.\n\n${action} trotzdem erlauben?`)){unlockedSession.add(k);return true;}return false;}
function renderLocks(){const list=debtsArr();return `<div class="v153Section"><h3>🔒 Geprüft / Fertig sperren</h3><div class="v153Note">Gesperrte Einträge können weiterhin geändert werden, aber die App zeigt vorher eine Warnung. Die Sperre ist kein rechtlicher Prüfvermerk.</div><div class="v153TableWrap" style="margin-top:10px"><table class="v153Table"><thead><tr><th>Gläubiger</th><th>Vollständigkeit</th><th>Status</th><th></th></tr></thead><tbody>${list.map((d,i)=>{const m=currentMeta(d,i),miss=missingItems(d,i);return `<tr><td><b>${esc(d.name||'–')}</b><br><small>${esc(caseNo(d)||'ohne AZ')}</small></td><td>${miss.length?miss.map(x=>`<span class="v153Pill yellow">${esc(x)}</span>`).join(''):'<span class="v153Pill green">vollständig</span>'}</td><td>${m.locked?'<span class="v153Pill green">🔒 geprüft / gesperrt</span>':'<span class="v153Pill">offen</span>'}</td><td><button class="${m.locked?'secondary':''}" data-v153-lock="${i}">${m.locked?'Sperre aufheben':'Als geprüft sperren'}</button></td></tr>`;}).join('')}</tbody></table></div></div>`;}
function toggleLock(i){const d=debtsArr()[i];if(!d)return;const m=currentMeta(d,i);if(!m.locked&&missingItems(d,i).length&&!confirm('Dieser Eintrag hat noch offene Punkte. Trotzdem als geprüft/fertig sperren?'))return;setMeta(d,i,{locked:!m.locked,lockedAt:!m.locked?now():'',lockedBy:'user'});unlockedSession.delete(keyFor(d,i));renderContent();}

function renderHistory(){
  const arr=historyArr(),last=arr.slice(-20),max=Math.max(1,...last.map(x=>Number(x.total)||0));return `<div class="v153Section"><div class="v153TopActions"><button data-v153-history-save>📌 Aktuellen Stand speichern</button></div><h3>📊 Verlauf des Schuldenstands</h3>${last.length?`<div class="v153Spark">${last.map(x=>`<div class="v153Bar" title="${esc(fmtDate(x.at))}: ${esc(money(x.total))}" style="height:${Math.max(4,Math.round((Number(x.total)||0)/max*100))}%"></div>`).join('')}</div><div class="v153TableWrap"><table class="v153Table"><thead><tr><th>Datum</th><th>Gesamt</th><th>Offen</th><th>Bezahlt</th><th>Gläubiger</th><th>Änderung</th></tr></thead><tbody>${last.slice().reverse().map((x)=>{const pos=arr.indexOf(x),prev=pos>0?arr[pos-1]:null,delta=prev?(Number(x.total)-Number(prev.total)):0;return `<tr><td>${esc(new Date(x.at).toLocaleString('de-DE'))}</td><td>${money(x.total)}</td><td>${money(x.open)}</td><td>${money(x.paid)}</td><td>${x.count}</td><td>${prev?(delta===0?'± 0 €':((delta>0?'+':'')+money(delta))):'Start'}</td></tr>`;}).join('')}</tbody></table></div>`:'<div class="v153Note">Noch kein Verlauf vorhanden. Der erste Stand wird beim Öffnen bzw. Speichern der App angelegt.</div>'}</div>`;
}

function readiness(){const list=debtsArr();let complete=0,locked=0,docComplete=0;list.forEach((d,i)=>{if(!missingItems(d,i).length)complete++;const m=currentMeta(d,i);if(m.locked)locked++;const c=m.docChecklist||{};if(CHECKS.every(([k])=>c[k]))docComplete++;});return {complete,locked,docComplete,total:list.length};}
function renderMap(){const r=readiness();return `<div class="v153Section"><h3>📦 Insolvenz- / Beratungsmappe</h3><div class="v153Grid"><div class="v153Card"><small>Gläubiger</small><b class="big">${r.total}</b></div><div class="v153Card"><small>Pflichtangaben vollständig</small><b class="big">${r.complete}</b></div><div class="v153Card"><small>Dokumenten-Check vollständig</small><b class="big">${r.docComplete}</b></div><div class="v153Card"><small>Geprüft / gesperrt</small><b class="big">${r.locked}</b></div></div><div class="v153TopActions" style="margin-top:14px"><button data-v153-map-pdf>📄 Beratungsmappe als PDF erzeugen</button></div><div class="v153Note">Das PDF enthält Gläubiger, Beträge, Aktenzeichen, Anschriften, Fristen, Dokumentanzahl und offene Punkte. Es ist eine Arbeitsunterlage, keine insolvenzrechtliche Prüfung.</div></div>`;}
function exportMapPdf(){
  const list=debtsArr();try{const jsPDF=window.jspdf?.jsPDF;if(!jsPDF)throw new Error('PDF-Bibliothek nicht geladen');const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});doc.setFontSize(16);doc.text('Insolvenz- / Beratungsmappe',14,14);doc.setFontSize(9);doc.text('Stand: '+new Date().toLocaleString('de-DE')+'  |  Gesamtschulden: '+money(debtTotals().total),14,20);
    const body=list.map((d,i)=>{const m=currentMeta(d,i),c=contact(d),miss=missingItems(d,i);return [d.name||'',money(d.betrag),caseNo(d)||'',c.address||'',fmtDate(m.dueDate),String(documents(d).length),m.locked?'geprüft':'offen',miss.join(', ')||'–'];});
    if(typeof doc.autoTable==='function')doc.autoTable({startY:25,head:[['Gläubiger','Betrag','Aktenzeichen','Anschrift','Frist','Dok.','Status','Fehlt / offen']],body,styles:{fontSize:7,cellPadding:1.5},headStyles:{fontSize:7},columnStyles:{0:{cellWidth:35},1:{cellWidth:23},2:{cellWidth:30},3:{cellWidth:52},4:{cellWidth:22},5:{cellWidth:12},6:{cellWidth:18},7:{cellWidth:75}}});
    else{let y=28;doc.setFontSize(7);for(const row of body){const line=doc.splitTextToSize(row.join(' | '),265);if(y+line.length*4>195){doc.addPage();y=14;}doc.text(line,14,y);y+=line.length*4+2;}}
    const y=(doc.lastAutoTable?.finalY||180)+8;if(y<195){doc.setFontSize(7);doc.text('Hinweis: organisatorische Arbeitsunterlage aus dem Schulden-Manager; keine rechtliche Prüfung.',14,y);}
    doc.save('Insolvenz_Beratungsmappe_'+new Date().toISOString().slice(0,10)+'.pdf');
  }catch(e){toast(e.message||'Beratungsmappe konnte nicht erstellt werden');}
}

function safetyCard(id,title){return `<div id="${id}" class="v153SafetyItem"><b>${esc(title)}</b><small>Prüfung läuft …</small></div>`;}
function renderSafety(){return `<div class="v153Section"><div class="v153TopActions"><button data-v153-safety-refresh>🔄 Sicherheitscheck neu starten</button></div><h3>💾 Sicherheitscheck</h3><div class="v153Safety">${safetyCard('v153SafeData','App-Daten')}${safetyCard('v153SafeServer','Railway / Server')}${safetyCard('v153SafePaperless','Paperless')}${safetyCard('v153SafeDrive','Google-Drive-Backup')}${safetyCard('v153SafeDocs','Dokument-Verknüpfungen')}${safetyCard('v153SafeImport','ChatGPT-Direktimport')}</div></div>`;}
function setSafety(id,cls,txt){const el=$(id);if(!el)return;el.className='v153SafetyItem '+cls;const sm=el.querySelector('small');if(sm)sm.textContent=txt;}
async function runSafety(){
  const list=debtsArr();setSafety('v153SafeData',list.length?'green':'red',list.length?`${list.length} Gläubiger im App-Datensatz`:'Kein Schuldendatensatz gefunden');
  const linked=linkedPaperlessIds().size;setSafety('v153SafeDocs',linked?'green':'yellow',linked?`${linked} Paperless-Dokument(e) verknüpft`:'Noch keine Paperless-Dokumente verknüpft');
  setSafety('v153SafeImport',(window.v151ChatgptImportOpen||$('chatgptImportBtn'))?'green':'yellow',(window.v151ChatgptImportOpen||$('chatgptImportBtn'))?'Direktimport ist geladen':'Direktimport nicht erkannt');
  try{const b=JSON.parse(localStorage.getItem(DRIVE_BACKUP_KEY)||'null');if(!b?.at)setSafety('v153SafeDrive','red','Noch kein bestätigtes Drive-Backup');else{const days=(Date.now()-new Date(b.at).getTime())/864e5;setSafety('v153SafeDrive',days<=7?'green':days<=30?'yellow':'red',`Letztes Backup: ${new Date(b.at).toLocaleString('de-DE')}`);}}catch(e){setSafety('v153SafeDrive','red','Backup-Status nicht lesbar');}
  try{const r=await fetch('/api/health',{cache:'no-store'}),j=await r.json();setSafety('v153SafeServer',r.ok&&j.ok?'green':'red',r.ok&&j.ok?'Server antwortet':'Serverprüfung fehlgeschlagen');}catch(e){setSafety('v153SafeServer','red','Server nicht erreichbar');}
  try{const r=await fetch('/api/paperless/status',{headers:paperlessHeaders(false),cache:'no-store'}),j=await r.json();setSafety('v153SafePaperless',r.ok&&j.ok?'green':'red',r.ok&&j.ok?'Paperless-Verbindung funktioniert':(j.error||'Paperless-Prüfung fehlgeschlagen'));}catch(e){setSafety('v153SafePaperless','red','Paperless nicht erreichbar');}
}

function renderContent(){
  const host=$('v153Content');if(!host)return;
  let html='';if(currentTab==='today')html=renderToday();else if(currentTab==='deadlines')html=renderDeadlines();else if(currentTab==='paperless')html=renderPaperless();else if(currentTab==='documents')html=renderDocuments();else if(currentTab==='letters')html=renderLetters();else if(currentTab==='duplicates')html=renderDuplicates();else if(currentTab==='locks')html=renderLocks();else if(currentTab==='history')html=renderHistory();else if(currentTab==='map')html=renderMap();else if(currentTab==='safety')html=renderSafety();host.innerHTML=html;
  document.querySelectorAll('.v153Tabs [data-v153-tab]').forEach(b=>b.classList.toggle('active',b.dataset.v153Tab===currentTab));
  if(currentTab==='paperless')loadPaperlessInbox();if(currentTab==='safety')runSafety();
}
function openSuite(tab='today'){
  ensureStyle();recordSnapshot('Arbeitszentrale');currentTab=tab;$('v153Overlay')?.remove();$('v132Overlay')?.remove();
  const o=document.createElement('div');o.id='v153Overlay';o.className='v153Overlay';o.innerHTML=`<div class="v153Modal"><div class="v153Head"><div><h2>Insolvenz-Arbeitszentrale ${VERSION}</h2><div class="v153Sub">Aufgaben, Fristen, Dokumente, Schreiben, Dubletten, Sperren, Verlauf, Beratungsmappe und Sicherheitscheck.</div></div><button class="v153Close" data-v153-close>×</button></div><div class="v153Tabs"><button data-v153-tab="today">✅ Heute</button><button data-v153-tab="deadlines">📅 Fristen</button><button data-v153-tab="paperless">📥 Paperless</button><button data-v153-tab="documents">🧾 Dokumente</button><button data-v153-tab="letters">✉️ Schreiben</button><button data-v153-tab="duplicates">🔀 Dubletten</button><button data-v153-tab="locks">🔒 Geprüft</button><button data-v153-tab="history">📊 Verlauf</button><button data-v153-tab="map">📦 Beratungsmappe</button><button data-v153-tab="safety">💾 Sicherheit</button></div><div class="v153TopActions"><button class="secondary" data-v153-back>← Insolvenz-Status</button></div><div id="v153Content"></div></div>`;document.body.appendChild(o);document.body.classList.add('modalOpen');
  o.addEventListener('click',async e=>{
    const tabBtn=e.target.closest('[data-v153-tab]');if(tabBtn){currentTab=tabBtn.dataset.v153Tab;renderContent();return;}
    if(e.target===o||e.target.closest('[data-v153-close]')){closeSuite();return;}
    if(e.target.closest('[data-v153-back]')){closeSuite();if(typeof window.v132InsolvenzOpen==='function')window.v132InsolvenzOpen('status');return;}
    const ed=e.target.closest('[data-v153-edit]');if(ed){openQuickEdit(Number(ed.dataset.v153Edit));return;}
    if(e.target.closest('[data-v153-pl-load]')){loadPaperlessInbox();return;}
    const pp=e.target.closest('[data-v153-pl-preview]');if(pp){const d=paperlessInboxDocs[Number(pp.dataset.v153PlPreview)];if(d)openPaperlessPdf(d.id);return;}
    const pl=e.target.closest('[data-v153-pl-link]');if(pl){linkPaperless(Number(pl.dataset.v153PlLink));return;}
    if(e.target.closest('[data-v153-letter-generate]')){generateLetter();return;}
    if(e.target.closest('[data-v153-letter-copy]')){let val=text($('v153LetterText')?.value);if(!val)val=generateLetter();if(val){try{await navigator.clipboard.writeText(val);toast('Schreiben kopiert ✅');}catch(_){$('v153LetterText')?.select();document.execCommand('copy');toast('Schreiben kopiert ✅');}}return;}
    if(e.target.closest('[data-v153-letter-pdf]')){exportLetterPdf();return;}
    const mg=e.target.closest('[data-v153-merge-keep]');if(mg){mergePair(Number(mg.dataset.v153MergeKeep),Number(mg.dataset.v153MergeRemove));return;}
    const lk=e.target.closest('[data-v153-lock]');if(lk){toggleLock(Number(lk.dataset.v153Lock));return;}
    if(e.target.closest('[data-v153-history-save]')){if(recordSnapshot('Manuell'))toast('Aktueller Stand gespeichert ✅');else toast('Stand ist unverändert.');renderContent();return;}
    if(e.target.closest('[data-v153-map-pdf]')){exportMapPdf();return;}
    if(e.target.closest('[data-v153-safety-refresh]')){runSafety();return;}
  });
  o.addEventListener('change',e=>{const c=e.target.closest('[data-v153-doc-check]');if(c)updateDocCheck(Number(c.dataset.v153DocCheck),c.dataset.v153DocKey,c.checked);});
  renderContent();
}
function closeSuite(){$('v153Overlay')?.remove();document.body.classList.remove('modalOpen');}
function openQuickEdit(i){if(!allowLocked(i,'Status bearbeiten'))return;closeSuite();if(typeof window.v132InsolvenzOpen==='function'){window.v132InsolvenzOpen('status');setTimeout(()=>document.querySelector(`[data-v132-meta="${i}"]`)?.click(),90);}}

function ensureButton(){
  const modal=document.querySelector('.v132Modal');if(!modal)return;let row=null;for(const r of modal.querySelectorAll('.v132Actions'))if(r.querySelector('[data-v132-backup]')){row=r;break;}if(!row)return;if(!$('v153SuiteBtn')){const b=document.createElement('button');b.id='v153SuiteBtn';b.type='button';b.textContent='🧰 Arbeitszentrale';b.onclick=e=>{e.preventDefault();e.stopPropagation();openSuite('today');};row.appendChild(b);}
}
function wrapInsolvencyOpen(){const old=window.v132InsolvenzOpen;if(typeof old!=='function'||old.__v153Suite)return;const w=function(){const r=old.apply(this,arguments);setTimeout(ensureButton,25);setTimeout(ensureButton,140);return r;};w.__v153Suite=true;window.v132InsolvenzOpen=w;}

document.addEventListener('click',e=>{
  const edit=e.target?.closest?.('[data-v132-meta]');if(edit){const i=Number(edit.dataset.v132Meta),d=debtsArr()[i];if(d&&currentMeta(d,i).locked&&!unlockedSession.has(keyFor(d,i))&&!confirm(`„${d.name}“ ist als geprüft/fertig gesperrt. Trotzdem bearbeiten?`)){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();return;}if(d&&currentMeta(d,i).locked)unlockedSession.add(keyFor(d,i));}
  const btn=e.target?.closest?.('button');if(!btn||edit)return;const bt=norm(btn.textContent);if(!bt.includes('bearbeiten'))return;const ctx=btn.closest('tr,.mobileCard');if(!ctx)return;const hay=norm(ctx.textContent);const matches=debtsArr().map((d,i)=>({d,i})).filter(x=>currentMeta(x.d,x.i).locked&&norm(x.d.name)&&hay.includes(norm(x.d.name)));if(matches.length===1&&!unlockedSession.has(keyFor(matches[0].d,matches[0].i))){if(!confirm(`„${matches[0].d.name}“ ist als geprüft/fertig gesperrt. Trotzdem bearbeiten?`)){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();}else unlockedSession.add(keyFor(matches[0].d,matches[0].i));}
},true);

document.addEventListener('click',e=>{if(e.target?.closest?.('#v132Btn,[data-v132-tab],[data-v136-cancel],[data-v136-save],[data-v136-save-next]')){setTimeout(ensureButton,40);setTimeout(()=>recordSnapshot('App-Aktion'),120);}},true);

function init(){ensureStyle();for(const d of debtsArr())ensureUid(d);try{localStorage.setItem(DEBT_KEY,JSON.stringify(debtsArr()));}catch(e){}recordSnapshot('Start');wrapInsolvencyOpen();setTimeout(hookSave,250);setTimeout(hookSave,1400);setTimeout(ensureButton,100);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true});else setTimeout(init,0);
window.v153InsolvencySuiteOpen=openSuite;
})();
