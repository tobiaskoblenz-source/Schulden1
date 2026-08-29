(function(){
'use strict';

const VERSION='v135';

function debtsArr(){
  try{ if(typeof debts!=='undefined' && Array.isArray(debts)) return debts; }catch(e){}
  try{ if(Array.isArray(window.debts)) return window.debts; }catch(e){}
  try{ const x=JSON.parse(localStorage.getItem('godmode_debts')||'[]'); return Array.isArray(x)?x:[]; }catch(e){ return []; }
}
function norm(v){
  return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function normalizedType(d){
  const stored=norm(d?.category||d?.kategorie||'');
  const text=norm([d?.name,d?.grund,d?.reason].filter(Boolean).join(' '));

  if(stored==='krankenkasse' || stored==='krankenversicherung') return 'Krankenversicherung';
  if(/\bmetro\b|edeka foodservice|foodservice|selgros|chefs culinar|grosshandel|lieferant/.test(text)) return 'Lieferanten / Warenbezug';
  return '';
}
function exportNormalized(){
  const fn=window.v134ExportInsolvencyPDF;
  if(typeof fn!=='function'){
    alert('PDF-Export ist noch nicht vollständig geladen. Bitte die Seite einmal neu laden.');
    return;
  }

  const list=debtsArr();
  const originals=list.map(d=>({
    d,
    hasCategory:Object.prototype.hasOwnProperty.call(d,'category'),
    category:d.category
  }));

  try{
    for(const d of list){
      const t=normalizedType(d);
      if(t) d.category=t;
    }
    fn();
  }finally{
    for(const x of originals){
      if(x.hasCategory) x.d.category=x.category;
      else delete x.d.category;
    }
  }
}
function relabel(){
  document.querySelectorAll('.v59MenuVersion').forEach(el=>{ if(el.textContent!==VERSION) el.textContent=VERSION; });
  document.querySelectorAll('.v132Modal h2').forEach(el=>{
    const wanted='Insolvenz-Status '+VERSION;
    if(/Insolvenz-Status/i.test(el.textContent||'') && el.textContent!==wanted) el.textContent=wanted;
  });
}

document.addEventListener('click',function(e){
  const pdfBtn=e.target?.closest?.('[data-v132-pdf]');
  if(pdfBtn){
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    exportNormalized();
    setTimeout(relabel,30);
    return;
  }
  if(e.target?.closest?.('#v132Btn,[data-v132-tab]')) setTimeout(relabel,30);
},true);

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(relabel,30),{once:true});
else setTimeout(relabel,30);

window.v135ExportInsolvencyPDF=exportNormalized;
})();
