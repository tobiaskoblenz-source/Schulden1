(function(){
'use strict';

const VERSION='v140';
const DEBT_KEY='godmode_debts';
const CREDITOR_KEY='schulden_creditors_v37';
const AUDIT_KEY='schulden_v131_audit';
const originalSetItem=Storage.prototype.setItem;
let internalWrite=false;

const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const text=v=>String(v??'').trim();

function parseArray(raw){try{const x=JSON.parse(raw||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
function debtsFromMemory(){
  try{if(typeof debts!=='undefined'&&Array.isArray(debts))return debts;}catch(e){}
  try{if(Array.isArray(window.debts))return window.debts;}catch(e){}
  return parseArray(localStorage.getItem(DEBT_KEY));
}
function creditorsFromStorage(){return parseArray(localStorage.getItem(CREDITOR_KEY));}
function debtCase(d){return text(d?.aktenzeichen??d?.caseNumber??d?.az??d?.reference??d?.referenz);}
function creditorCase(c){return text(c?.aktenzeichen??c?.caseNumber??c?.az??c?.reference);}
function debtCustomer(d){return text(d?.kundennummer??d?.customerNumber??d?.vertragsnummer??d?.contractNumber);}
function creditorCustomer(c){return text(c?.kundennummer??c?.customerNumber??c?.vertragsnummer??c?.contractNumber);}
function debtContact(d){
  const a=d&&typeof d.contactDetails==='object'?d.contactDetails:{};
  const b=d&&typeof d.contact==='object'?d.contact:{};
  return {
    representative:text(a.representative??a.name??a.vertreter??b.representative??b.name??b.vertreter??d?.ansprechpartner),
    address:text(a.address??a.anschrift??b.address??b.anschrift),
    email:text(a.email??a.mail??b.email??b.mail),
    phone:text(a.phone??a.telefon??a.telefonnummer??b.phone??b.telefon??b.telefonnummer)
  };
}
function creditorContact(c){return {
  representative:text(c?.representative??c?.contactPerson??c?.ansprechpartner??c?.vertreter),
  address:text(c?.address??c?.anschrift),
  email:text(c?.email??c?.mail),
  phone:text(c?.phone??c?.telefon??c?.telefonnummer)
};}
function matchCreditorIndex(d,cs){
  const id=text(d?.creditorId),name=norm(d?.name),az=norm(debtCase(d));
  return cs.findIndex(c=>c&&((id&&text(c.id)===id)||(name&&norm(c.name)===name)||(az&&norm(creditorCase(c))===az)));
}
function matchDebtIndex(c,ds){
  const id=text(c?.id),name=norm(c?.name),az=norm(creditorCase(c));
  return ds.findIndex(d=>d&&((id&&text(d.creditorId)===id)||(name&&norm(d.name)===name)||(az&&norm(debtCase(d))===az)));
}
function setDebtContact(d,c){
  const old=d&&typeof d.contactDetails==='object'?d.contactDetails:{};
  d.contactDetails={...old,representative:c.representative,address:c.address,email:c.email,phone:c.phone};
  d.contactPerson=[c.representative,c.address,c.email,c.phone].filter(Boolean).join(' | ');
}
function setCreditorContact(c,x){
  c.representative=x.representative;c.contactPerson=x.representative;c.ansprechpartner=x.representative;
  c.address=x.address;c.anschrift=x.address;c.email=x.email;c.mail=x.email;c.phone=x.phone;c.telefon=x.phone;
}
function applyCreditorToDebt(c,d,onlyFillMissing=false){
  if(!c||!d)return false;let changed=false;
  const caz=creditorCase(c),daz=debtCase(d),cc=creditorContact(c),dc=debtContact(d),cust=creditorCustomer(c),dcust=debtCustomer(d);
  const use=(from,to)=>from&&(!onlyFillMissing||!to);
  if(use(caz,daz)&&caz!==daz){d.aktenzeichen=caz;d.caseNumber=caz;changed=true;}
  if(use(cust,dcust)&&cust!==dcust){d.kundennummer=cust;d.customerNumber=cust;changed=true;}
  const merged={...dc};
  for(const k of ['representative','address','email','phone'])if(use(cc[k],dc[k])&&cc[k]!==dc[k]){merged[k]=cc[k];changed=true;}
  if(changed)setDebtContact(d,merged);
  if(c.id&&!d.creditorId){d.creditorId=c.id;changed=true;}
  return changed;
}
function applyDebtToCreditor(d,c,onlyFillMissing=false){
  if(!d||!c)return false;let changed=false;
  const daz=debtCase(d),caz=creditorCase(c),dc=debtContact(d),cc=creditorContact(c),cust=debtCustomer(d),ccust=creditorCustomer(c);
  const use=(from,to)=>from&&(!onlyFillMissing||!to);
  if(use(daz,caz)&&daz!==caz){c.aktenzeichen=daz;c.caseNumber=daz;changed=true;}
  if(use(cust,ccust)&&cust!==ccust){c.kundennummer=cust;c.customerNumber=cust;c.vertragsnummer=cust;changed=true;}
  const merged={...cc};
  for(const k of ['representative','address','email','phone'])if(use(dc[k],cc[k])&&dc[k]!==cc[k]){merged[k]=dc[k];changed=true;}
  if(changed)setCreditorContact(c,merged);
  return changed;
}
function writeRaw(key,value){internalWrite=true;try{originalSetItem.call(localStorage,key,value);}finally{internalWrite=false;}}
function audit(message){
  try{const a=parseArray(localStorage.getItem(AUDIT_KEY));a.push({at:new Date().toISOString(),type:'creditor-sync',text:message});writeRaw(AUDIT_KEY,JSON.stringify(a.slice(-1500)));}catch(e){}
}
function initialReconcile(){
  const ds=debtsFromMemory(),cs=creditorsFromStorage();if(!ds.length||!cs.length)return;
  let debtChanged=false,creditorChanged=false,matched=0;
  for(const d of ds){const i=matchCreditorIndex(d,cs);if(i<0)continue;matched++;const c=cs[i];
    // Bestehender Schuldendatensatz ist bei Konflikten die Hauptquelle. Fehlt dort etwas,
    // wird es zuerst aus der Gläubigerverwaltung ergänzt.
    if(applyCreditorToDebt(c,d,true))debtChanged=true;
    if(applyDebtToCreditor(d,c,false))creditorChanged=true;
  }
  if(debtChanged)writeRaw(DEBT_KEY,JSON.stringify(ds));
  if(creditorChanged)writeRaw(CREDITOR_KEY,JSON.stringify(cs));
  if(debtChanged||creditorChanged)audit(`Gläubigerdaten beim Start abgeglichen (${matched} Zuordnungen)`);
}
function syncFromCreditorWrite(raw){
  const cs=parseArray(raw),ds=debtsFromMemory();if(!cs.length||!ds.length)return;
  let changed=false;
  for(const c of cs){const i=matchDebtIndex(c,ds);if(i>=0&&applyCreditorToDebt(c,ds[i],false))changed=true;}
  if(changed){writeRaw(DEBT_KEY,JSON.stringify(ds));window.dispatchEvent(new CustomEvent('schulden:creditor-sync',{detail:{source:'creditors'}}));}
}
function syncFromDebtWrite(raw){
  const ds=parseArray(raw),cs=creditorsFromStorage();if(!ds.length||!cs.length)return;
  let changed=false;
  for(const d of ds){const i=matchCreditorIndex(d,cs);if(i>=0&&applyDebtToCreditor(d,cs[i],false))changed=true;}
  if(changed){writeRaw(CREDITOR_KEY,JSON.stringify(cs));window.dispatchEvent(new CustomEvent('schulden:creditor-sync',{detail:{source:'debts'}}));}
}

if(!Storage.prototype.setItem.__v140CreditorSync){
  const wrapped=function(key,value){
    const result=originalSetItem.call(this,key,value);
    if(this!==localStorage||internalWrite)return result;
    try{
      if(key===CREDITOR_KEY)syncFromCreditorWrite(value);
      else if(key===DEBT_KEY)syncFromDebtWrite(value);
    }catch(e){console.error('v140 sync',e);}
    return result;
  };
  wrapped.__v140CreditorSync=true;
  Storage.prototype.setItem=wrapped;
}

function relabel(){
  document.querySelectorAll('.v59MenuVersion').forEach(el=>{if(el.textContent!==VERSION)el.textContent=VERSION;});
  document.querySelectorAll('.v132Modal h2').forEach(el=>{const w='Insolvenz-Status '+VERSION;if(/Insolvenz-Status/i.test(el.textContent||'')&&el.textContent!==w)el.textContent=w;});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{setTimeout(initialReconcile,120);setTimeout(relabel,180);},{once:true});
else{setTimeout(initialReconcile,120);setTimeout(relabel,180);}
document.addEventListener('click',e=>{if(e.target?.closest?.('#v132Btn,[data-v132-meta],[data-v132-tab]'))setTimeout(relabel,30);},true);
window.v140ReconcileCreditorData=initialReconcile;
})();