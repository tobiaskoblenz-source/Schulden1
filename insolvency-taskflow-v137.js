(function(){
'use strict';

const VERSION='v137';
const AUTO_TASKS=new Set([
  '',
  'Aktenzeichen prüfen',
  'Anschrift ergänzen',
  'aktuellen Forderungsstand prüfen',
  'Unterlagen / Nachweis zuordnen',
  'Gläubiger / Beratung kontaktieren',
  'Gläubiger / Schuldnerberatung kontaktieren',
  'Antwort abwarten / nachfassen',
  'Für Beratung vorbereitet'
]);

function $(id){return document.getElementById(id);}

function documentCount(){
  const box=document.querySelector('.v136DocInfo');
  if(!box)return 0;
  const bold=box.querySelector('b');
  const n=Number(String(bold?.textContent||'0').replace(/[^0-9]/g,''));
  return Number.isFinite(n)?n:0;
}

function calculatedTask(){
  const az=String($('v136Case')?.value||'').trim();
  const address=String($('v136Address')?.value||'').trim();
  const claim=Boolean($('v136Claim')?.checked);
  const contacted=Boolean($('v136Contacted')?.checked);
  const reply=Boolean($('v136Reply')?.checked);

  // Organisatorische Reihenfolge für die Insolvenzvorbereitung:
  // 1. Aktenzeichen, 2. Anschrift, 3. Forderungsstand,
  // 4. Dokumente, 5. Kontakt / Antwort.
  if(!az)return 'Aktenzeichen prüfen';
  if(!address)return 'Anschrift ergänzen';
  if(!claim)return 'aktuellen Forderungsstand prüfen';
  if(documentCount()===0)return 'Unterlagen / Nachweis zuordnen';
  if(!contacted)return 'Gläubiger / Beratung kontaktieren';
  if(!reply)return 'Antwort abwarten / nachfassen';
  return 'Für Beratung vorbereitet';
}

function refreshTask(force){
  const field=$('v136Task');
  if(!field)return;
  const current=String(field.value||'').trim();
  const manual=field.dataset.v137Manual==='1';
  if(force || (!manual && AUTO_TASKS.has(current))){
    field.value=calculatedTask();
    field.dataset.v137Auto='1';
  }
}

function relabel(){
  document.querySelectorAll('.v59MenuVersion').forEach(el=>{if(el.textContent!==VERSION)el.textContent=VERSION;});
  document.querySelectorAll('.v132Modal h2').forEach(el=>{
    const wanted='Insolvenz-Status '+VERSION;
    if(/Insolvenz-Status/i.test(el.textContent||'')&&el.textContent!==wanted)el.textContent=wanted;
  });
}

// Wenn der Editor geöffnet wurde, den alten automatischen Vorschlag auf die neue
// Reihenfolge umstellen. Ein bewusst manuell eingetragener Text bleibt erhalten.
document.addEventListener('click',function(e){
  if(e.target?.closest?.('[data-v132-meta]')){
    setTimeout(()=>{refreshTask(false);relabel();},30);
    setTimeout(()=>refreshTask(false),150);
    return;
  }

  // Unmittelbar vor dem Speichern erneut berechnen, damit z. B. ein gerade
  // eingetragenes Aktenzeichen sofort zur nächsten sinnvollen Aufgabe führt.
  if(e.target?.closest?.('[data-v136-save],[data-v136-save-next]')){
    refreshTask(false);
  }
},true);

// Bei Änderungen an Pflichtfeldern wird die automatische Aufgabe live weitergeschaltet.
document.addEventListener('input',function(e){
  if(e.target?.id==='v136Task'){
    if(e.isTrusted)e.target.dataset.v137Manual='1';
    return;
  }
  if(['v136Case','v136Address'].includes(e.target?.id))refreshTask(false);
},true);

document.addEventListener('change',function(e){
  if(['v136Claim','v136Contacted','v136Reply'].includes(e.target?.id))refreshTask(false);
},true);

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',relabel,{once:true});else relabel();
window.v137RefreshInsolvencyTask=function(){refreshTask(false);};
})();
