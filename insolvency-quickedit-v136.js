(function(){
'use strict';

const VERSION='v136';
const DEBT_KEY='godmode_debts';
const CREDITOR_KEY='schulden_creditors_v37';
const META_KEY='schulden_v131_meta';
const AUDIT_KEY='schulden_v131_audit';

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const now=()=>new Date().toISOString();

function debtsArr(){
  try{ if(typeof debts!=='undefined'&&Array.isArray(debts)) return debts; }catch(e){}
  try{ if(Array.isArray(window.debts)) return window.debts; }catch(e){}
  try{ const x=JSON.parse(localStorage.getItem(DEBT_KEY)||'[]'); return Array.isArray(x)?x:[]; }catch(e){ return []; }
}
function creditors(){
  try{ const x=JSON.parse(localStorage.getItem(CREDITOR_KEY)||'[]'); return Array.isArray(x)?x:[]; }catch(e){ return []; }
}
function metaAll(){
  try{ const x=JSON.parse(localStorage.getItem(META_KEY)||'{}'); return x&&typeof x==='object'?x:{}; }catch(e){ return {}; }
}
function auditAll(){
  try{ const x=JSON.parse(localStorage.getItem(AUDIT_KEY)||'[]'); return Array.isArray(x)?x:[]; }catch(e){ return []; }
}
function caseRaw(d){ return String(d?.aktenzeichen??d?.caseNumber??d?.az??d?.reference??d?.referenz??'').trim(); }
function creditorIndexFor(d){
  const cs=creditors(), raw=caseRaw(d);
  return cs.findIndex(c=>c&&((d?.creditorId&&String(c.id)===String(d.creditorId))||(c.name&&d?.name&&norm(c.name)===norm(d.name))||(c.aktenzeichen&&raw&&norm(c.aktenzeichen)===norm(raw))));
}
function creditorFor(d){ const cs=creditors(),i=creditorIndexFor(d); return i>=0?cs[i]:null; }
function caseNo(d){ const c=creditorFor(d); return caseRaw(d)||String(c?.aktenzeichen??c?.caseNumber??c?.az??'').trim(); }
function contact(d){
  const a=d&&typeof d.contactDetails==='object'?d.contactDetails:{};
  const b=d&&typeof d.contact==='object'?d.contact:{};
  const c=creditorFor(d)||{};
  return {
    representative:String(a.representative??a.name??a.vertreter??b.representative??b.name??b.vertreter??d?.contactPerson??d?.ansprechpartner??c.representative??c.contactPerson??'').trim(),
    address:String(a.address??a.anschrift??b.address??b.anschrift??c.address??c.anschrift??'').trim(),
    email:String(a.email??a.mail??b.email??b.mail??c.email??c.mail??'').trim(),
    phone:String(a.phone??a.telefon??a.telefonnummer??b.phone??b.telefon??b.telefonnummer??c.phone??c.telefon??c.telefonnummer??'').trim()
  };
}
function documents(d){
  const pools=[d?.paperlessLinks,d?.correspondence,d?.attachments,d?.documents,d?.files];
  let n=0; for(const p of pools) if(Array.isArray(p)) n+=p.length; return n;
}
function keyFor(d,i){ return String(d?.v131Uid||d?.chatgptImportId||d?.id||[norm(d?.name),caseNo(d),i].join('|')); }
function currentMeta(d,i){ return metaAll()[keyFor(d,i)]||{}; }
function missing(d,i){
  const c=contact(d),m=currentMeta(d,i),out=[];
  if(!String(d?.name||'').trim()) out.push('Gläubiger');
  if(!(Number(d?.betrag)>0)) out.push('Forderungsbetrag');
  if(!caseNo(d)) out.push('Aktenzeichen');
  if(!c.address) out.push('Anschrift');
  if(!documents(d)) out.push('Nachweis / Dokument');
  if(!m.currentClaim) out.push('Forderungsstand geprüft');
  return out;
}
function saveCore(){
  try{ if(typeof save==='function') save(); else localStorage.setItem(DEBT_KEY,JSON.stringify(debtsArr())); }
  catch(e){ localStorage.setItem(DEBT_KEY,JSON.stringify(debtsArr())); }
  try{ if(typeof render==='function') render(); }catch(e){}
}
function toast(msg){
  try{ if(typeof showToast==='function'){ showToast(msg); return; } }catch(e){}
  console.log(msg);
}
function auditEvent(evt){ const a=auditAll();a.push({at:now(),...evt});localStorage.setItem(AUDIT_KEY,JSON.stringify(a.slice(-1500))); }

function ensureStyle(){
  if($('v136Style')) return;
  const s=document.createElement('style');s.id='v136Style';s.textContent=`
  .v136Editor{margin-top:12px;padding:18px;border-radius:20px;background:#111d31;border:1px solid rgba(255,255,255,.1)}
  .v136EditorHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:15px}.v136EditorHead h3{margin:0 0 5px;font-size:21px}.v136Progress{font-size:12px;color:#aebed8}
  .v136Grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.v136Grid label{display:flex;flex-direction:column;gap:6px;color:#b9c9e0;font-size:12px;font-weight:700}.v136Grid .wide{grid-column:1/-1}
  .v136Input,.v136Textarea{width:100%;border-radius:12px!important;background:#0c1728!important;color:#fff!important;border:1px solid rgba(255,255,255,.1)!important;box-shadow:none!important}.v136Input{min-height:44px!important;padding:0 12px!important}.v136Textarea{min-height:90px;padding:10px 12px;font:inherit;resize:vertical}
  .v136Checks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:14px 0}.v136Check{display:flex!important;flex-direction:row!important;align-items:center;gap:9px;padding:10px 11px;border-radius:12px;background:rgba(255,255,255,.05);font-size:12px!important;color:#eaf2ff!important}.v136Check input{width:18px;height:18px;min-height:0;padding:0;flex:none}
  .v136Summary{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 14px}.v136Pill{display:inline-flex;padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.07);font-size:11px}.v136Pill.ok{background:rgba(34,197,94,.13);color:#c9f8d9}.v136Pill.warn{background:rgba(245,158,11,.13);color:#ffe1a4}
  .v136Actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:15px}.v136Actions button{min-height:42px!important;padding:0 14px!important}.v136DocInfo{padding:11px 12px;border-radius:12px;background:rgba(79,140,255,.08);border:1px solid rgba(79,140,255,.12);font-size:12px;color:#c9d9f2}
  @media(max-width:760px){.v136Grid{grid-template-columns:1fr}.v136Grid .wide{grid-column:auto}.v136Checks{grid-template-columns:1fr}.v136Editor{padding:14px}}
  `;document.head.appendChild(s);
}
function relabel(){
  document.querySelectorAll('.v59MenuVersion').forEach(el=>{if(el.textContent!==VERSION)el.textContent=VERSION;});
  document.querySelectorAll('.v132Modal h2').forEach(el=>{const w='Insolvenz-Status '+VERSION;if(/Insolvenz-Status/i.test(el.textContent||'')&&el.textContent!==w)el.textContent=w;});
  document.querySelectorAll('[data-v132-meta]').forEach(b=>{if(b.textContent!=='Vervollständigen')b.textContent='Vervollständigen';});
}
function displayTask(d,i){
  const m=currentMeta(d,i);if(m.nextTask)return m.nextTask;
  if(!documents(d))return 'Unterlagen / Nachweis zuordnen';if(!contact(d).address)return 'Anschrift ergänzen';if(!caseNo(d))return 'Aktenzeichen prüfen';if(!m.currentClaim)return 'aktuellen Forderungsstand prüfen';if(!m.contacted)return 'Gläubiger / Beratung kontaktieren';if(!m.reply)return 'Antwort abwarten / nachfassen';return 'Für Beratung vorbereitet';
}
function openEditor(i){
  ensureStyle();
  const list=debtsArr(),d=list[i],host=$('v132Content');if(!d||!host)return;
  const c=contact(d),m=currentMeta(d,i),miss=missing(d,i),docN=documents(d);
  host.innerHTML=`<div class="v136Editor">
    <div class="v136EditorHead"><div><h3>${esc(d.name||'Gläubiger')}</h3><div class="v136Progress">Eintrag ${i+1} von ${list.length} · direkt für die Insolvenzunterlagen vervollständigen</div></div><span class="v136Pill ${miss.length?'warn':'ok'}">${miss.length?miss.length+' Punkte offen':'vollständig'}</span></div>
    <div class="v136Summary">${miss.length?miss.map(x=>`<span class="v136Pill warn">Fehlt: ${esc(x)}</span>`).join(''):'<span class="v136Pill ok">Alle organisatorischen Pflichtangaben vorhanden</span>'}</div>
    <div class="v136Grid">
      <label>Gläubiger<input class="v136Input" value="${esc(d.name||'')}" disabled></label>
      <label>Aktueller Forderungsbetrag (€)<input id="v136Amount" class="v136Input" type="number" min="0" step="0.01" value="${esc(Number(d.betrag)||0)}"></label>
      <label>Aktenzeichen<input id="v136Case" class="v136Input" value="${esc(caseNo(d))}" placeholder="Aktenzeichen / Forderungsnummer"></label>
      <label>Kunden- / Vertragsnummer<input id="v136Customer" class="v136Input" value="${esc(d.kundennummer||d.customerNumber||d.vertragsnummer||'')}" placeholder="falls vorhanden"></label>
      <label class="wide">Anschrift<textarea id="v136Address" class="v136Textarea" placeholder="Straße, Hausnummer, PLZ Ort">${esc(c.address)}</textarea></label>
      <label>Name / Vertreter<input id="v136Rep" class="v136Input" value="${esc(c.representative)}"></label>
      <label>E-Mail<input id="v136Email" class="v136Input" type="email" value="${esc(c.email)}"></label>
      <label>Telefon<input id="v136Phone" class="v136Input" value="${esc(c.phone)}"></label>
      <label>Frist<input id="v136Due" class="v136Input" type="date" value="${esc(m.dueDate||'')}"></label>
      <label class="wide">Nächste Aufgabe<input id="v136Task" class="v136Input" value="${esc(m.nextTask||displayTask(d,i))}"></label>
    </div>
    <div class="v136Checks">
      <label class="v136Check"><input id="v136Claim" type="checkbox" ${m.currentClaim?'checked':''}>Forderungsstand geprüft</label>
      <label class="v136Check"><input id="v136Titled" type="checkbox" ${m.titled?'checked':''}>Forderung tituliert</label>
      <label class="v136Check"><input id="v136Disputed" type="checkbox" ${m.disputed?'checked':''}>Forderung bestritten</label>
      <label class="v136Check"><input id="v136Contacted" type="checkbox" ${m.contacted?'checked':''}>Gläubiger / Beratung kontaktiert</label>
      <label class="v136Check"><input id="v136Reply" type="checkbox" ${m.reply?'checked':''}>Antwort liegt vor</label>
    </div>
    <div class="v136DocInfo">📎 Vorhandene Dokumente: <b>${docN}</b>. Dokumente kannst du später über „Daten“ bzw. Paperless zuordnen; hier wird nur der aktuelle Stand angezeigt.</div>
    <div class="v136Actions"><button data-v136-save="${i}">💾 Speichern</button><button data-v136-save-next="${i}">💾 Speichern & nächster</button><button class="secondary" data-v136-cancel>Abbrechen</button></div>
  </div>`;
  host.scrollIntoView({block:'start',behavior:'smooth'});
}
function syncCreditor(d,oldCase,newCase,c){
  const cs=creditors();let idx=cs.findIndex(x=>x&&((d?.creditorId&&String(x.id)===String(d.creditorId))||(x.name&&d?.name&&norm(x.name)===norm(d.name))||(x.aktenzeichen&&oldCase&&norm(x.aktenzeichen)===norm(oldCase))));
  if(idx<0)return;
  const x={...cs[idx]};
  x.aktenzeichen=newCase;x.caseNumber=newCase;x.address=c.address;x.anschrift=c.address;x.representative=c.representative;x.contactPerson=c.representative;x.email=c.email;x.phone=c.phone;x.telefon=c.phone;cs[idx]=x;
  localStorage.setItem(CREDITOR_KEY,JSON.stringify(cs));
}
function readForm(){
  return {
    amount:Number(String($('v136Amount')?.value||'0').replace(',','.')),
    caseNo:String($('v136Case')?.value||'').trim(),customer:String($('v136Customer')?.value||'').trim(),
    contact:{address:String($('v136Address')?.value||'').trim(),representative:String($('v136Rep')?.value||'').trim(),email:String($('v136Email')?.value||'').trim(),phone:String($('v136Phone')?.value||'').trim()},
    dueDate:$('v136Due')?.value||'',nextTask:String($('v136Task')?.value||'').trim(),currentClaim:Boolean($('v136Claim')?.checked),titled:Boolean($('v136Titled')?.checked),disputed:Boolean($('v136Disputed')?.checked),contacted:Boolean($('v136Contacted')?.checked),reply:Boolean($('v136Reply')?.checked)
  };
}
function saveEditor(i,next){
  const list=debtsArr(),d=list[i];if(!d)return;
  const f=readForm();if(!Number.isFinite(f.amount)||f.amount<0){alert('Bitte einen gültigen Forderungsbetrag eingeben.');return;}
  const old={betrag:d.betrag,aktenzeichen:caseNo(d),kundennummer:d.kundennummer||d.customerNumber||'',contact:contact(d),meta:currentMeta(d,i)};
  const oldCase=caseNo(d);
  d.betrag=f.amount;d.aktenzeichen=f.caseNo;d.caseNumber=f.caseNo;d.kundennummer=f.customer;d.customerNumber=f.customer;
  d.contactDetails={...(d.contactDetails&&typeof d.contactDetails==='object'?d.contactDetails:{}),representative:f.contact.representative,address:f.contact.address,email:f.contact.email,phone:f.contact.phone};
  d.contactPerson=[f.contact.representative,f.contact.address,f.contact.email,f.contact.phone].filter(Boolean).join(' | ');
  syncCreditor(d,oldCase,f.caseNo,f.contact);
  const all=metaAll(),k=keyFor(d,i);all[k]={...(all[k]||{}),nextTask:f.nextTask,dueDate:f.dueDate,currentClaim:f.currentClaim,titled:f.titled,disputed:f.disputed,contacted:f.contacted,reply:f.reply,updatedAt:now()};localStorage.setItem(META_KEY,JSON.stringify(all));
  auditEvent({uid:k,type:'quickedit',text:'Insolvenz-Schnellbearbeitung gespeichert',oldValue:JSON.stringify(old),newValue:JSON.stringify({betrag:d.betrag,aktenzeichen:f.caseNo,kundennummer:f.customer,contact:f.contact,meta:all[k]})});
  saveCore();toast('Insolvenz-Daten gespeichert ✅');
  if(next){
    let ni=-1;for(let step=1;step<=list.length;step++){const x=(i+step)%list.length;if(missing(list[x],x).length){ni=x;break;}}
    if(typeof window.v132InsolvenzOpen==='function')window.v132InsolvenzOpen('status');
    setTimeout(()=>{relabel();if(ni>=0&&ni!==i)openEditor(ni);},20);
  }else{
    if(typeof window.v132InsolvenzOpen==='function')window.v132InsolvenzOpen('status');
    setTimeout(relabel,20);
  }
}

ensureStyle();
document.addEventListener('click',function(e){
  const edit=e.target?.closest?.('[data-v132-meta]');
  if(edit){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openEditor(Number(edit.dataset.v132Meta));return;}
  const save=e.target?.closest?.('[data-v136-save]');
  if(save){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();saveEditor(Number(save.dataset.v136Save),false);return;}
  const saveNext=e.target?.closest?.('[data-v136-save-next]');
  if(saveNext){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();saveEditor(Number(saveNext.dataset.v136SaveNext),true);return;}
  if(e.target?.closest?.('[data-v136-cancel]')){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();if(typeof window.v132InsolvenzOpen==='function')window.v132InsolvenzOpen('status');setTimeout(relabel,20);return;}
  if(e.target?.closest?.('#v132Btn,[data-v132-tab]'))setTimeout(relabel,20);
},true);

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(relabel,30),{once:true});else setTimeout(relabel,30);
window.v136InsolvenzQuickEdit=openEditor;
})();