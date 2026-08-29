(function(){
'use strict';

const VERSION='v148';
const PAPERLESS_SETTINGS_KEY='schulden_paperless_settings_v79';
const CREDITOR_KEY='schulden_creditors_v37';
const AUDIT_KEY='schulden_v131_audit';
const $=id=>document.getElementById(id);
const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const compact=v=>norm(v).replace(/\s+/g,'');
const now=()=>new Date().toISOString();

function debtsArr(){
  try{if(typeof debts!=='undefined'&&Array.isArray(debts))return debts;}catch(e){}
  try{if(Array.isArray(window.debts))return window.debts;}catch(e){}
  try{const x=JSON.parse(localStorage.getItem('godmode_debts')||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}
}
function creditors(){try{const x=JSON.parse(localStorage.getItem(CREDITOR_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
function caseRaw(d){return String(d?.aktenzeichen??d?.caseNumber??d?.az??d?.reference??d?.referenz??'').trim();}
function creditorFor(d){
  const name=norm(d?.name||''),az=compact(caseRaw(d));
  return creditors().find(c=>c&&((d?.creditorId&&String(c.id)===String(d.creditorId))||(name&&norm(c.name)===name)||(az&&compact(c.aktenzeichen||c.caseNumber||c.az)===az)))||null;
}
function caseNo(d){const c=creditorFor(d)||{};return caseRaw(d)||String(c.aktenzeichen??c.caseNumber??c.az??'').trim();}
function customerNo(d){
  const c=creditorFor(d)||{};
  return String(d?.kundennummer??d?.customerNumber??d?.customerId??d?.vertragsnummer??d?.contractNumber??c.kundennummer??c.customerNumber??c.customerId??c.vertragsnummer??'').trim();
}
function paperlessLinks(d){return Array.isArray(d?.paperlessLinks)?d.paperlessLinks:[];}
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
function save(){
  try{if(typeof window.save==='function')window.save();else if(typeof save==='function')save();else localStorage.setItem('godmode_debts',JSON.stringify(debtsArr()));}
  catch(e){try{localStorage.setItem('godmode_debts',JSON.stringify(debtsArr()));}catch(_){} }
}
function audit(text,value){
  try{const a=JSON.parse(localStorage.getItem(AUDIT_KEY)||'[]');const arr=Array.isArray(a)?a:[];arr.push({at:now(),type:'paperless-v148-scan',text,newValue:value});localStorage.setItem(AUDIT_KEY,JSON.stringify(arr.slice(-1500)));}catch(e){}
}
function resultText(x){
  return [x?.title,x?.original_filename,x?.archive_filename,x?.content,x?.__match_reason,typeof x?.correspondent==='string'?x.correspondent:'',typeof x?.document_type==='string'?x.document_type:''].filter(Boolean).join(' ');
}
function titleText(x){return [x?.title,x?.original_filename,x?.archive_filename].filter(Boolean).join(' ');}
function phrasePresent(hay,phrase){
  hay=' '+norm(hay)+' ';phrase=norm(phrase);
  return !!phrase&&hay.includes(' '+phrase+' ');
}
function genericTokens(){return new Set([
  'gmbh','mbh','ag','kg','gbr','ev','e','v','und','der','die','das','fuer','für','von','zu','zur','zum','service',
  'aok','krankenkasse','krankenversicherung','versicherung','bank','sparkasse','nord','sued','sud','ost','west','sachsen','anhalt',
  'deutschland','deutsche','bund','bundes','amt','behoerde','behorde','finanzamt','inkasso','forderung','forderungen'
]);}
function nameTokens(name){return norm(name).split(' ').filter(t=>t.length>=3);}
function strongTokens(name){const stop=genericTokens();return nameTokens(name).filter(t=>!stop.has(t));}
function tokenPresent(hay,t){return (' '+norm(hay)+' ').includes(' '+t+' ');}
function scoreCandidate(raw,d,sources){
  const all=resultText(raw),title=titleText(raw),hayCompact=compact(all);
  const name=norm(d?.name||''),az=compact(caseNo(d)),customer=compact(customerNo(d));
  const allNameTokens=nameTokens(name),strong=strongTokens(name);
  let score=Math.min(Math.max(Number(raw?.__match_score||0),0),15);
  const why=[];let identifier=false;

  const azHit=az&&az.length>=4&&hayCompact.includes(az);
  const customerHit=customer&&customer.length>=4&&hayCompact.includes(customer);
  if(azHit){score+=230;identifier=true;why.push('Aktenzeichen');}
  if(customerHit){score+=210;identifier=true;why.push('Kunden-/Vertragsnummer');}

  const exactName=name.length>=4&&phrasePresent(all,name);
  const titleExact=name.length>=4&&phrasePresent(title,name);
  if(exactName){score+=80;why.push('voller Gläubigername');}
  if(titleExact){score+=25;why.push('Name im Titel');}

  const strongHits=strong.filter(t=>tokenPresent(all,t));
  if(strongHits.length){score+=Math.min(strongHits.length*22,66);why.push(...strongHits.slice(0,3));}

  const genericHits=allNameTokens.filter(t=>!strong.includes(t)&&tokenPresent(all,t));
  if(exactName&&genericHits.length)score+=Math.min(genericHits.length*4,12);

  if(sources.has('case')&&azHit)score+=10;
  if(sources.has('customer')&&customerHit)score+=10;

  const oneStrongCreditor=strong.length===1&&strong[0].length>=6;
  const strongEnough=strongHits.length>=2||(oneStrongCreditor&&strongHits.length===1);
  const keep=identifier||exactName||(strongEnough&&score>=65);
  if(!keep)return null;

  let confidence='pruefen';
  if(identifier)confidence='sicher';
  else if(exactName&&(titleExact||score>=100))confidence='wahrscheinlich';
  else if(strongHits.length>=2&&score>=90)confidence='wahrscheinlich';

  return {
    id:String(raw?.id??''),
    title:String(raw?.title||raw?.original_filename||raw?.archive_filename||('Dokument #'+(raw?.id??'?'))),
    created:String(raw?.created||raw?.added||''),
    score:Math.round(score),
    confidence,
    why:[...new Set(why)].slice(0,6).join(', '),
    sources:[...sources],
    v148:true
  };
}
async function searchPaperless(q){
  q=String(q||'').trim();if(!q)return [];
  const r=await fetch('/api/paperless/search?q='+encodeURIComponent(q)+'&page_size=12',{headers:paperlessHeaders(),cache:'no-store'});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j?.ok===false)throw new Error(j?.error||j?.hint||('Paperless Fehler '+r.status));
  return Array.isArray(j?.data?.results)?j.data.results:[];
}
async function suggestionsFor(d){
  const variants=[];
  const add=(type,value)=>{value=String(value||'').trim();if(value&&!variants.some(x=>type===x.type&&norm(x.value)===norm(value)))variants.push({type,value});};
  add('case',caseNo(d));add('customer',customerNo(d));add('name',d?.name);
  const map=new Map();
  for(const v of variants){
    const rs=await searchPaperless(v.value);
    for(const raw of rs){
      const id=String(raw?.id??'');if(!id)continue;
      const prev=map.get(id)||{raw,sources:new Set()};prev.sources.add(v.type);map.set(id,prev);
    }
  }
  return [...map.values()].map(x=>scoreCandidate(x.raw,d,x.sources)).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,4);
}

let running=false;
async function strictScan(){
  if(running)return;running=true;
  const list=debtsArr(),targets=list.filter(d=>!paperlessLinks(d).length),box=$('v147ScanStatus');
  let found=0,errors=0,firstError='';
  try{
    for(let n=0;n<targets.length;n++){
      const d=targets[n];if(box)box.textContent=`v148 prüft ${n+1} / ${targets.length}: ${d.name||'Ohne Name'} …`;
      try{
        const s=await suggestionsFor(d);
        d.v147PaperlessSuggestions=s;
        d.v147PaperlessScannedAt=now();
        d.v148PaperlessScannedAt=now();
        if(s.length)found++;
      }catch(e){
        errors++;if(!firstError)firstError=String(e?.message||e);
        d.v147PaperlessSuggestions=[];d.v147PaperlessScannedAt=now();d.v148PaperlessScannedAt=now();
      }
    }
    save();
    audit('Paperless-Zuordnungsvorschläge v148 streng geprüft',`${found} Trefferlisten, ${errors} Fehler`);
    if(typeof window.v147PaperlessView==='function')window.v147PaperlessView();
    const status=$('v147ScanStatus');
    if(status)status.textContent=errors?`${found} Gläubiger mit plausiblen Vorschlägen. ${errors} Fehler. ${firstError}`:`Prüfung fertig: ${found} von ${targets.length} Gläubigern haben plausible Vorschläge.`;
  }finally{running=false;}
}

// v147 hört auf document/capture. window/capture liegt davor und kann den alten Scan sicher abfangen.
window.addEventListener('click',function(e){
  const btn=e.target?.closest?.('[data-v147-scan]');
  if(!btn)return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  strictScan();
},true);

window.v148PaperlessScan=strictScan;
})();
