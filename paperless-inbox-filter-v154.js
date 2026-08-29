(function(){
'use strict';

const VERSION='v154';
const DEBT_KEY='godmode_debts';
const CREDITOR_KEY='schulden_creditors_v37';
const PAPERLESS_SETTINGS_KEY='schulden_paperless_settings_v79';
let docsById=new Map();
let refreshToken=0;

const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const compact=v=>norm(v).replace(/\s+/g,'');
const text=v=>String(v??'').trim();

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
function docHay(doc){
  const vals=[doc?.title,doc?.original_filename,doc?.archive_filename,doc?.archived_file_name,doc?.content,doc?.__match_reason];
  if(doc?.correspondent&&typeof doc.correspondent==='object')vals.push(doc.correspondent.name,doc.correspondent.title);
  if(doc?.document_type&&typeof doc.document_type==='object')vals.push(doc.document_type.name,doc.document_type.title);
  return norm(vals.filter(Boolean).join(' '));
}
const GENERIC=new Set(['aok','nord','sachsen','anhalt','bank','gmbh','ag','kg','mbh','service','services','deutschland','deutsche','inkasso','forderung','forderungen','versicherung','kasse']);
function strictSuggestion(doc){
  const hay=docHay(doc),hc=compact(hay),list=debtsArr();
  let candidates=[];
  list.forEach((d,i)=>{
    const name=norm(d?.name),nameTokens=name.split(' ').filter(Boolean),az=compact(caseNo(d)),cust=compact(customerNo(d));
    let score=0,reason='';
    if(az&&az.length>=4&&hc.includes(az)){score=320;reason='Aktenzeichen';}
    if(cust&&cust.length>=4&&hc.includes(cust)&&score<280){score=280;reason='Kunden-/Vertragsnummer';}
    if(name&&hay.includes(name)&&score<200){score=nameTokens.length===1?170:210;reason='voller Gläubigername';}
    if(score<120){
      const distinctive=nameTokens.filter(t=>t.length>=4&&!GENERIC.has(t));
      const hits=distinctive.filter(t=>hay.includes(t));
      if(nameTokens.length===1&&distinctive.length===1&&hits.length===1){score=150;reason='eindeutiger Gläubigername';}
      else if(distinctive.length>=2&&hits.length>=2){score=130+Math.min(40,(hits.length-2)*10);reason='mehrere eindeutige Namensbestandteile';}
    }
    if(score>=120)candidates.push({i,score,reason});
  });
  candidates.sort((a,b)=>b.score-a.score);
  if(!candidates.length)return null;
  const best=candidates[0],second=candidates[1];
  if(second&&best.score<280&&(best.score-second.score)<35)return null;
  return best;
}
function docIdFromRow(row){const small=row.querySelector('small');const m=String(small?.textContent||'').match(/\bID\s+(\d+)/i);return m?m[1]:'';}
function baseMetaText(s){return String(s||'').replace(/\s*·\s*Vorschlag:.*$/i,'').replace(/\s*·\s*Sicherer Vorschlag:.*$/i,'').replace(/\s*·\s*Kein sicherer Vorschlag.*$/i,'').trim();}
function applyStrictSuggestions(){
  const box=document.getElementById('v153PaperlessBox');if(!box)return;
  const rows=[...box.querySelectorAll('.v153InboxItem')];if(!rows.length)return;
  rows.forEach(row=>{
    const sel=row.querySelector('[data-v153-pl-select]'),small=row.querySelector('small');if(!sel||!small)return;
    const id=docIdFromRow(row),doc=docsById.get(String(id))||{title:row.querySelector('b')?.textContent||''};
    const s=strictSuggestion(doc),base=baseMetaText(small.textContent);
    if(s){
      if(sel.dataset.v154Manual!=='1')sel.value=String(s.i);
      sel.dataset.v154Safe='1';sel.dataset.v154Auto=sel.dataset.v154Manual==='1'?'0':'1';
      const name=debtsArr()[s.i]?.name||'Gläubiger';
      small.textContent=base+' · Sicherer Vorschlag: '+name+' ('+s.reason+')';
    }else{
      if(sel.dataset.v154Manual!=='1')sel.value='';
      sel.dataset.v154Safe='0';sel.dataset.v154Auto='0';
      small.textContent=base+' · Kein sicherer Vorschlag';
    }
  });
}
async function loadDocsAndFilter(){
  const my=++refreshToken;
  try{
    const r=await fetch('/api/paperless/search?q=&page_size=50&tag='+encodeURIComponent(paperlessTag()),{headers:paperlessHeaders(),cache:'no-store'});
    const j=await r.json();if(my!==refreshToken)return;
    if(r.ok&&j?.ok){docsById=new Map((Array.isArray(j?.data?.results)?j.data.results:[]).filter(x=>x?.id!=null).map(x=>[String(x.id),x]));}
  }catch(e){}
  if(my!==refreshToken)return;
  applyStrictSuggestions();
  setTimeout(()=>{if(my===refreshToken)applyStrictSuggestions();},350);
}
function scheduleFilter(){[120,450,900,1600].forEach(ms=>setTimeout(()=>loadDocsAndFilter(),ms));}

document.addEventListener('change',e=>{
  const sel=e.target?.closest?.('[data-v153-pl-select]');if(sel)sel.dataset.v154Manual='1';
},true);
document.addEventListener('click',e=>{
  if(e.target?.closest?.('[data-v153-pl-load]'))scheduleFilter();
  if(e.target?.closest?.('[data-v153-tab="paperless"]'))setTimeout(applyStrictSuggestions,250);
},true);

window.v154PaperlessInboxFilter=applyStrictSuggestions;
})();
