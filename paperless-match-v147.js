(function(){
'use strict';

const VERSION='v147';
const PAPERLESS_SETTINGS_KEY='schulden_paperless_settings_v79';
const CREDITOR_KEY='schulden_creditors_v37';
const AUDIT_KEY='schulden_v131_audit';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const compact=v=>norm(v).replace(/\s+/g,'');
const now=()=>new Date().toISOString();

function debtsArr(){
  try{if(typeof debts!=='undefined'&&Array.isArray(debts))return debts;}catch(e){}
  try{if(Array.isArray(window.debts))return window.debts;}catch(e){}
  try{const x=JSON.parse(localStorage.getItem('godmode_debts')||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}
}
function creditors(){try{const x=JSON.parse(localStorage.getItem(CREDITOR_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
function creditorFor(d){
  const name=norm(d?.name||''),az=compact(caseRaw(d));
  return creditors().find(c=>c&&((d?.creditorId&&String(c.id)===String(d.creditorId))||(name&&norm(c.name)===name)||(az&&compact(c.aktenzeichen||c.caseNumber||c.az)===az)))||null;
}
function caseRaw(d){return String(d?.aktenzeichen??d?.caseNumber??d?.az??d?.reference??d?.referenz??'').trim();}
function caseNo(d){const c=creditorFor(d)||{};return caseRaw(d)||String(c.aktenzeichen??c.caseNumber??c.az??'').trim();}
function customerNo(d){
  const c=creditorFor(d)||{};
  return String(d?.kundennummer??d?.customerNumber??d?.customerId??d?.vertragsnummer??d?.contractNumber??c.kundennummer??c.customerNumber??c.customerId??c.vertragsnummer??'').trim();
}
function paperlessHeaders(){
  const h={'Accept':'application/json'};
  try{
    const st=JSON.parse(localStorage.getItem(PAPERLESS_SETTINGS_KEY)||'{}');
    if(st.url)h['x-paperless-url']=String(st.url).trim().replace(/\/+$/,'');
    if(st.token)h['x-paperless-token']=String(st.token).trim();
    if(st.insecureTls)h['x-paperless-insecure-tls']='true';
    if(st.tag)h['x-paperless-tag']=String(st.tag);
  }catch(e){}
  return h;
}
function paperlessLinks(d){return Array.isArray(d?.paperlessLinks)?d.paperlessLinks:[];}
function callSave(){
  try{if(typeof save==='function')save();else localStorage.setItem('godmode_debts',JSON.stringify(debtsArr()));}
  catch(e){localStorage.setItem('godmode_debts',JSON.stringify(debtsArr()));}
  try{if(typeof render==='function')render();}catch(e){}
}
function toast(msg){try{if(typeof showToast==='function'){showToast(msg);return;}}catch(e){}console.log(msg);}
function auditEvent(evt){
  try{const a=JSON.parse(localStorage.getItem(AUDIT_KEY)||'[]');const arr=Array.isArray(a)?a:[];arr.push({at:now(),...evt});localStorage.setItem(AUDIT_KEY,JSON.stringify(arr.slice(-1500)));}catch(e){}
}
function keyFor(d,i){return String(d?.v131Uid||d?.chatgptImportId||d?.id||[norm(d?.name),caseNo(d),i].join('|'));}

function ensureStyle(){
  if($('v147PaperlessStyle'))return;
  const s=document.createElement('style');s.id='v147PaperlessStyle';s.textContent=`
  .v147Head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin:4px 0 14px}.v147Head h3{margin:0 0 4px;font-size:20px}.v147Head p{margin:0;color:#aebed8;font-size:12px}
  .v147Tools{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.v147Tools button{min-height:38px!important;padding:0 12px!important}.v147Status{padding:10px 12px;border-radius:12px;background:rgba(79,140,255,.08);border:1px solid rgba(79,140,255,.14);color:#c9d9f2;font-size:12px;margin:10px 0}
  .v147Table{width:100%;border-collapse:collapse}.v147Table th,.v147Table td{padding:11px 9px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left;vertical-align:top}.v147Table th{font-size:11px;color:#93a8c7;text-transform:uppercase;letter-spacing:.05em}
  .v147Ids{display:grid;gap:3px;color:#aebed8;font-size:11px}.v147Suggestions{display:grid;gap:8px}.v147Suggestion{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px 10px;border-radius:12px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07)}
  .v147Suggestion input{width:18px;height:18px;min-height:0;flex:none}.v147Suggestion strong{display:block;font-size:13px}.v147Suggestion small{display:block;color:#aebed8;margin-top:3px;line-height:1.35}.v147Preview{min-height:32px!important;padding:0 9px!important;font-size:11px!important}
  .v147Conf{display:inline-flex;padding:3px 7px;border-radius:999px;font-size:10px;font-weight:800;margin-right:5px}.v147Conf.sicher{background:rgba(34,197,94,.15);color:#a7f3c1}.v147Conf.wahrscheinlich{background:rgba(59,130,246,.16);color:#bfdbfe}.v147Conf.pruefen{background:rgba(245,158,11,.14);color:#fde1a3}
  .v147Linked{display:inline-flex;padding:5px 8px;border-radius:999px;background:rgba(34,197,94,.12);color:#baf2cb;font-size:11px}.v147Empty{color:#9fb0cc;font-size:12px}.v147LinkBtn{min-height:36px!important;padding:0 11px!important;white-space:nowrap}
  @media(max-width:850px){.v147Suggestion{grid-template-columns:auto minmax(0,1fr)}.v147Preview{grid-column:2}.v147Table th:nth-child(2),.v147Table td:nth-child(2){display:none}}
  `;document.head.appendChild(s);
}

function resultText(x){
  return [x?.title,x?.original_filename,x?.archive_filename,x?.content,x?.__match_reason,typeof x?.correspondent==='string'?x.correspondent:'',typeof x?.document_type==='string'?x.document_type:''].filter(Boolean).join(' ');
}
function meaningfulTokens(name){
  const stop=new Set(['gmbh','mbh','ag','kg','gbr','und','der','die','das','für','fuer','von','service']);
  return norm(name).split(' ').filter(t=>t.length>=3&&!stop.has(t));
}
function scoreCandidate(raw,d,sources){
  const hayNorm=norm(resultText(raw)),hayCompact=compact(resultText(raw));
  const titleNorm=norm([raw?.title,raw?.original_filename,raw?.archive_filename].filter(Boolean).join(' '));
  const az=compact(caseNo(d)),customer=compact(customerNo(d)),name=norm(d?.name||'');
  let score=Math.min(Math.max(Number(raw?.__match_score||0),0),40),identifier=false;
  const why=[];
  if(az&&az.length>=3&&hayCompact.includes(az)){score+=180;identifier=true;why.push('Aktenzeichen');}
  if(customer&&customer.length>=3&&hayCompact.includes(customer)){score+=160;identifier=true;why.push('Kunden-/Vertragsnummer');}
  if(name&&hayNorm.includes(name)){score+=65;why.push('Gläubigername');if(titleNorm.includes(name))score+=20;}
  let tokenHits=0;
  for(const t of meaningfulTokens(d?.name||'')){
    if(hayNorm.includes(t)){tokenHits++;why.push(t);}
  }
  score+=Math.min(tokenHits*14,56);
  if(sources.has('case'))score+=8;
  if(sources.has('customer'))score+=8;
  if(sources.has('name'))score+=5;
  const confidence=identifier||score>=145?'sicher':score>=72?'wahrscheinlich':'pruefen';
  return {
    id:String(raw?.id??''),
    title:String(raw?.title||raw?.original_filename||raw?.archive_filename||('Dokument #'+(raw?.id??'?'))),
    created:String(raw?.created||raw?.added||''),
    score:Math.round(score),confidence,
    why:[...new Set(why)].slice(0,6).join(', '),
    sources:[...sources]
  };
}
async function searchPaperless(q){
  if(!String(q||'').trim())return [];
  const r=await fetch('/api/paperless/search?q='+encodeURIComponent(String(q).trim())+'&page_size=10',{headers:paperlessHeaders(),cache:'no-store'});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j?.ok===false)throw new Error(j?.error||j?.hint||('Paperless Fehler '+r.status));
  return Array.isArray(j?.data?.results)?j.data.results:[];
}
async function suggestionsFor(d){
  const variants=[];
  const add=(type,value)=>{value=String(value||'').trim();if(value&&!variants.some(x=>norm(x.value)===norm(value)))variants.push({type,value});};
  add('case',caseNo(d));add('customer',customerNo(d));add('name',d?.name);
  const map=new Map();
  for(const v of variants){
    const rs=await searchPaperless(v.value);
    for(const raw of rs){
      const id=String(raw?.id??'');if(!id)continue;
      const prev=map.get(id)||{raw,sources:new Set()};prev.sources.add(v.type);if(!prev.raw)prev.raw=raw;map.set(id,prev);
    }
  }
  return [...map.values()].map(x=>scoreCandidate(x.raw,d,x.sources)).filter(x=>x.score>=18).sort((a,b)=>b.score-a.score).slice(0,4);
}

function formatDate(v){if(!v)return '';try{return new Date(v).toLocaleDateString('de-DE');}catch(e){return String(v);}}
function confLabel(c){return c==='sicher'?'Sicherer Treffer':c==='wahrscheinlich'?'Wahrscheinlich':'Prüfen';}
function renderSuggestion(d,i,s,k){
  return `<label class="v147Suggestion"><input type="radio" name="v147pl${i}" value="${k}" ${k===0?'checked':''}><span><strong>${esc(s.title)}</strong><small><span class="v147Conf ${esc(s.confidence)}">${esc(confLabel(s.confidence))}</span>Score ${esc(s.score)}${s.created?' · '+esc(formatDate(s.created)):''}${s.why?' · '+esc(s.why):''}</small></span><button class="secondary v147Preview" type="button" data-v147-open="${esc(s.id)}">PDF ansehen</button></label>`;
}
function renderPaperlessView(){
  ensureStyle();
  const host=$('v132Content');if(!host)return;
  const list=debtsArr();
  const missing=list.filter(d=>!paperlessLinks(d).length).length;
  const withSuggestions=list.filter(d=>!paperlessLinks(d).length&&Array.isArray(d.v147PaperlessSuggestions)&&d.v147PaperlessSuggestions.length).length;
  host.innerHTML=`<div class="v132Section"><div class="v147Head"><div><h3>Paperless-Zuordnung</h3><p>Treffer werden aus Gläubigername, Aktenzeichen/Kundennummer und Paperless-Volltext bewertet. Nichts wird ohne Bestätigung verknüpft.</p></div><span class="v132Badge">${missing} ohne Paperless-Dokument</span></div><div class="v147Tools"><button type="button" data-v147-scan>🔎 Fehlende Dokumente automatisch prüfen</button><button class="secondary" type="button" data-v147-clear>Vorschläge zurücksetzen</button></div><div id="v147ScanStatus" class="v147Status">${withSuggestions?withSuggestions+' Gläubiger haben gespeicherte Vorschläge.':'Noch keine v147-Prüfung durchgeführt.'}</div><div class="v132TableWrap"><table class="v147Table"><thead><tr><th>Gläubiger</th><th>Suchmerkmale</th><th>Paperless-Treffer</th><th></th></tr></thead><tbody>${list.map((d,i)=>{
    const links=paperlessLinks(d),sug=Array.isArray(d.v147PaperlessSuggestions)?d.v147PaperlessSuggestions:[];
    const ids=`<div class="v147Ids"><span>AZ: ${esc(caseNo(d)||'–')}</span><span>Kunde/Vertrag: ${esc(customerNo(d)||'–')}</span></div>`;
    let body='';
    if(links.length){body=`<span class="v147Linked">✓ ${links.length} Paperless-Dokument${links.length===1?'':'e'} verknüpft</span>`;}
    else if(sug.length){body=`<div class="v147Suggestions">${sug.map((s,k)=>renderSuggestion(d,i,s,k)).join('')}</div>`;}
    else if(d.v147PaperlessScannedAt){body='<span class="v147Empty">Bei der letzten Prüfung kein passender Treffer.</span>';}
    else{body='<span class="v147Empty">Noch nicht geprüft.</span>';}
    return `<tr><td><b>${esc(d.name||'Ohne Name')}</b><div class="v132Small">${esc((Number(d.betrag)||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'}))}</div></td><td>${ids}</td><td>${body}</td><td>${(!links.length&&sug.length)?`<button class="v147LinkBtn" type="button" data-v147-link="${i}">Auswahl verknüpfen</button>`:''}</td></tr>`;
  }).join('')}</tbody></table></div></div>`;
}

let scanning=false;
async function runScan(){
  if(scanning)return;scanning=true;
  const list=debtsArr(),box=$('v147ScanStatus');let processed=0,found=0,errors=0,firstError='';
  try{
    for(let i=0;i<list.length;i++){
      const d=list[i];if(paperlessLinks(d).length)continue;
      processed++;if(box)box.textContent=`Prüfe ${processed} / ${list.filter(x=>!paperlessLinks(x).length).length}: ${d.name||'Ohne Name'} …`;
      try{
        const sug=await suggestionsFor(d);d.v147PaperlessSuggestions=sug;d.v147PaperlessScannedAt=now();if(sug.length)found++;
      }catch(e){errors++;if(!firstError)firstError=String(e?.message||e);d.v147PaperlessSuggestions=[];d.v147PaperlessScannedAt=now();}
    }
    callSave();auditEvent({type:'paperless-v147-scan',text:'Paperless-Zuordnungsvorschläge v147 geprüft',newValue:`${found} Trefferlisten, ${errors} Fehler`});
    renderPaperlessView();
    const status=$('v147ScanStatus');if(status)status.textContent=errors?`${found} Gläubiger mit Vorschlägen. ${errors} Abfragen mit Fehler${firstError?' – '+firstError:''}.`:`Prüfung fertig: ${found} Gläubiger haben passende Vorschläge.`;
    toast(errors&&!found?'Paperless-Prüfung konnte nicht vollständig ausgeführt werden.':'Paperless-Prüfung abgeschlossen ✅');
  }finally{scanning=false;}
}
function clearSuggestions(){
  for(const d of debtsArr()){delete d.v147PaperlessSuggestions;delete d.v147PaperlessScannedAt;}
  callSave();renderPaperlessView();toast('Paperless-Vorschläge zurückgesetzt.');
}
function openDocument(id){if(!id)return;window.open('/api/paperless/document/'+encodeURIComponent(id),'_blank','noopener');}
function linkSelected(i){
  const d=debtsArr()[i],sug=Array.isArray(d?.v147PaperlessSuggestions)?d.v147PaperlessSuggestions:[];if(!d||!sug.length)return;
  const checked=document.querySelector(`input[name="v147pl${i}"]:checked`);if(!checked){toast('Bitte zuerst einen Vorschlag auswählen.');return;}
  const x=sug[Number(checked.value)];if(!x)return;
  if(!confirm(`Dokument „${x.title}“ wirklich mit „${d.name||'diesem Gläubiger'}“ verknüpfen?`))return;
  if(!Array.isArray(d.paperlessLinks))d.paperlessLinks=[];
  if(!d.paperlessLinks.some(y=>String(y?.id)===String(x.id))){d.paperlessLinks.push({id:String(x.id),title:x.title,meta:`v147 Zuordnung · ${confLabel(x.confidence)} · Score ${x.score}${x.why?' · '+x.why:''}`,linkedAt:now()});}
  d.v147PaperlessSuggestions=[];callSave();auditEvent({uid:keyFor(d,i),type:'paperless-link',text:'Paperless-Dokument nach v147 Vorschlag verknüpft',newValue:String(x.id)+' '+x.title});renderPaperlessView();toast('Dokument verknüpft ✅');
}

const oldOpen=window.v132InsolvenzOpen;
if(typeof oldOpen==='function'&&!oldOpen.__v147Paperless){
  const wrapped=function(tab){const r=oldOpen.apply(this,arguments);if(tab==='paperless')setTimeout(renderPaperlessView,30);return r;};wrapped.__v147Paperless=true;window.v132InsolvenzOpen=wrapped;
}
document.addEventListener('click',e=>{
  const tab=e.target?.closest?.('[data-v132-tab="paperless"]');if(tab){setTimeout(renderPaperlessView,30);return;}
  const scan=e.target?.closest?.('[data-v147-scan]');if(scan){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();runScan();return;}
  const clear=e.target?.closest?.('[data-v147-clear]');if(clear){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();if(confirm('Gespeicherte Paperless-Vorschläge wirklich zurücksetzen?'))clearSuggestions();return;}
  const open=e.target?.closest?.('[data-v147-open]');if(open){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openDocument(open.dataset.v147Open);return;}
  const link=e.target?.closest?.('[data-v147-link]');if(link){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();linkSelected(Number(link.dataset.v147Link));return;}
},true);

window.v147PaperlessView=renderPaperlessView;
window.v147PaperlessScan=runScan;
})();
