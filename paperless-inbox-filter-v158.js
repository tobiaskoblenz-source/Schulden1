(function(){
'use strict';

const DEBT_KEY='godmode_debts';
const CREDITOR_KEY='schulden_creditors_v37';
const PAPERLESS_SETTINGS_KEY='schulden_paperless_settings_v79';
let docsById=new Map();
let runId=0;

const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const compact=v=>norm(v).replace(/\s+/g,'');
const text=v=>String(v??'').trim();
const GENERIC_SINGLE=new Set(['aok','bank','gmbh','service','inkasso','versicherung','kasse','finanzamt','amt','ag','kg']);

function debtsArr(){
  try{if(typeof debts!=='undefined'&&Array.isArray(debts))return debts;}catch(e){}
  try{if(Array.isArray(window.debts))return window.debts;}catch(e){}
  try{const x=JSON.parse(localStorage.getItem(DEBT_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}
}
function creditors(){try{const x=JSON.parse(localStorage.getItem(CREDITOR_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
function creditorFor(d){
  const raw=text(d?.aktenzeichen??d?.caseNumber??d?.az),name=norm(d?.name),id=text(d?.creditorId);
  return creditors().find(c=>c&&((id&&String(c.id)===id)||(name&&norm(c.name)===name)||(raw&&norm(c.aktenzeichen||c.caseNumber||'')===norm(raw))))||null;
}
function caseNo(d){const c=creditorFor(d);return text(d?.aktenzeichen??d?.caseNumber??d?.az??c?.aktenzeichen??c?.caseNumber);}
function customerNo(d){const c=creditorFor(d);return text(d?.kundennummer??d?.customerNumber??d?.vertragsnummer??d?.contractNumber??c?.kundennummer??c?.customerNumber??c?.vertragsnummer);}
function paperlessHeaders(){
  const h={'Accept':'application/json'};
  try{
    const st=JSON.parse(localStorage.getItem(PAPERLESS_SETTINGS_KEY)||'{}');
    if(st.url)h['x-paperless-url']=String(st.url).trim().replace(/\/+$/,'');
    if(st.token)h['x-paperless-token']=String(st.token).trim();
    if(st.insecureTls)h['x-paperless-insecure-tls']='true';
  }catch(e){}
  return h;
}
function paperlessTag(){try{const st=JSON.parse(localStorage.getItem(PAPERLESS_SETTINGS_KEY)||'{}');return text(st.tag)||'App';}catch(e){return'App';}}
function objText(v){if(!v)return'';if(typeof v==='string'||typeof v==='number')return String(v);if(typeof v==='object')return [v.name,v.title,v.label].filter(Boolean).join(' ');return'';}
function headerHay(doc){return norm([doc?.title,doc?.original_filename,doc?.original_file_name,doc?.archive_filename,doc?.archived_file_name,objText(doc?.correspondent)].filter(Boolean).join(' '));}
function identifierHay(doc){return compact([doc?.title,doc?.original_filename,doc?.original_file_name,doc?.archive_filename,doc?.archived_file_name,objText(doc?.correspondent),doc?.content].filter(Boolean).join(' '));}
function ocrStartHay(doc){return norm(String(doc?.content||'').slice(0,1200));}
function strictSuggestion(doc){
  const head=headerHay(doc),ids=identifierHay(doc),ocrStart=ocrStartHay(doc),candidates=[];
  debtsArr().forEach((d,i)=>{
    const az=compact(caseNo(d)),cust=compact(customerNo(d)),name=norm(d?.name),nameTokens=name.split(' ').filter(Boolean);
    let score=0,reason='';
    if(az&&az.length>=5&&ids.includes(az)){score=500;reason='Aktenzeichen';}
    if(cust&&cust.length>=5&&ids.includes(cust)&&score<450){score=450;reason='Kunden-/Vertragsnummer';}
    if(name&&name.length>=5&&head.includes(name)&&score<300){score=300;reason='voller Gläubigername im Dokumentkopf';}
    if(score<260&&nameTokens.length===1&&name.length>=6&&!GENERIC_SINGLE.has(name)&&ocrStart.split(' ').includes(name)){
      score=260;reason='eindeutiger Gläubigername am Dokumentanfang';
    }
    if(score)candidates.push({i,score,reason});
  });
  candidates.sort((a,b)=>b.score-a.score);
  if(!candidates.length)return null;
  const best=candidates[0],second=candidates[1];
  if(second&&best.score===second.score)return null;
  return best;
}
function docIdFromRow(row){const small=row.querySelector('small');const m=String(small?.textContent||'').match(/\bID\s+(\d+)/i);return m?m[1]:'';}
function legacySuggestion(row,sel,small){
  if(sel.dataset.v158LegacyIndex!==undefined){
    const i=Number(sel.dataset.v158LegacyIndex),score=Number(sel.dataset.v158LegacyScore||0);
    return Number.isInteger(i)&&debtsArr()[i]?{i,score,reason:'starker vorhandener Treffer'}:null;
  }
  const raw=String(small?.textContent||'');
  const m=raw.match(/Vorschlag:\s*(.*?)\s*\((\d+)\)\s*$/i);
  const i=Number(sel.value),score=m?Number(m[2]||0):0,d=debtsArr()[i],name=norm(d?.name),tokens=name.split(' ').filter(Boolean);
  let trusted=false;
  if(m&&Number.isInteger(i)&&d&&score>=60){
    if(score>=100)trusted=true;
    else if(tokens.length===1&&name.length>=6&&!GENERIC_SINGLE.has(name))trusted=true;
  }
  if(trusted){
    sel.dataset.v158LegacyIndex=String(i);sel.dataset.v158LegacyScore=String(score);
    return {i,score,reason:'starker vorhandener Treffer'};
  }
  sel.dataset.v158LegacyIndex='';sel.dataset.v158LegacyScore='0';
  return null;
}
function cleanMeta(s){return String(s||'').replace(/\s*·\s*Vorschlag:.*$/i,'').replace(/\s*·\s*Sicherer Vorschlag:.*$/i,'').replace(/\s*·\s*Kein sicherer Vorschlag.*$/i,'').trim();}
function apply(){
  const box=document.getElementById('v153PaperlessBox');if(!box)return false;
  const rows=[...box.querySelectorAll('.v153InboxItem')];if(!rows.length)return false;
  rows.forEach(row=>{
    const sel=row.querySelector('[data-v153-pl-select]'),small=row.querySelector('small');if(!sel||!small)return;
    const legacy=legacySuggestion(row,sel,small);
    const id=docIdFromRow(row),doc=docsById.get(String(id))||{title:row.querySelector('b')?.textContent||''};
    const suggestion=strictSuggestion(doc)||legacy,base=cleanMeta(small.textContent);
    if(suggestion){
      if(sel.dataset.v158Manual!=='1')sel.value=String(suggestion.i);
      const name=debtsArr()[suggestion.i]?.name||'Gläubiger';
      small.textContent=base+' · Sicherer Vorschlag: '+name+' ('+suggestion.reason+')';
      sel.dataset.v158Safe='1';
    }else{
      if(sel.dataset.v158Manual!=='1')sel.value='';
      small.textContent=base+' · Kein sicherer Vorschlag';
      sel.dataset.v158Safe='0';
    }
  });
  return true;
}
async function fetchDocs(){
  const r=await fetch('/api/paperless/search?q=&page_size=50&tag='+encodeURIComponent(paperlessTag()),{headers:paperlessHeaders(),cache:'no-store'});
  const j=await r.json();if(!r.ok||!j?.ok)throw new Error(j?.error||('HTTP '+r.status));
  docsById=new Map((Array.isArray(j?.data?.results)?j.data.results:[]).filter(x=>x?.id!=null).map(x=>[String(x.id),x]));
}
async function waitThenFilter(id,attempt=0){
  if(id!==runId)return;
  const box=document.getElementById('v153PaperlessBox'),rows=box?[...box.querySelectorAll('.v153InboxItem')]:[];
  if(!rows.length){if(attempt<12)setTimeout(()=>waitThenFilter(id,attempt+1),300);return;}
  // Erster Lauf sofort, damit der ursprüngliche starke v153-Treffer gespeichert wird.
  apply();
  try{await fetchDocs();}catch(e){}
  if(id!==runId)return;
  apply();
  setTimeout(()=>{if(id===runId)apply();},450);
  setTimeout(()=>{if(id===runId)apply();},1000);
}
function start(){const id=++runId;setTimeout(()=>waitThenFilter(id,0),180);}

window.addEventListener('change',e=>{const sel=e.target?.closest?.('[data-v153-pl-select]');if(sel)sel.dataset.v158Manual='1';},true);
window.addEventListener('click',e=>{
  if(e.target?.closest?.('[data-v153-pl-load]'))start();
  if(e.target?.closest?.('[data-v153-tab="paperless"]'))setTimeout(()=>{apply();},350);
},true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{if(document.querySelector('#v153PaperlessBox .v153InboxItem'))start();},500),{once:true});
else setTimeout(()=>{if(document.querySelector('#v153PaperlessBox .v153InboxItem'))start();},500);
window.v158PaperlessInboxFilter=apply;
})();
