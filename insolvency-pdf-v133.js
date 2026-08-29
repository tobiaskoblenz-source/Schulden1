(function(){
'use strict';

const VERSION='v133';
const CREDITOR_KEY='schulden_creditors_v37';
const META_KEY='schulden_v131_meta';

function debtsArr(){
  try{ if(typeof debts!=='undefined' && Array.isArray(debts)) return debts; }catch(e){}
  try{ if(Array.isArray(window.debts)) return window.debts; }catch(e){}
  try{ const x=JSON.parse(localStorage.getItem('godmode_debts')||'[]'); return Array.isArray(x)?x:[]; }catch(e){ return []; }
}
function creditors(){ try{ const x=JSON.parse(localStorage.getItem(CREDITOR_KEY)||'[]'); return Array.isArray(x)?x:[]; }catch(e){ return []; } }
function metas(){ try{ const x=JSON.parse(localStorage.getItem(META_KEY)||'{}'); return x&&typeof x==='object'?x:{}; }catch(e){ return {}; } }
function norm(v){ return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim(); }
function money(v){ return (Number(v)||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'}); }
function creditorFor(d){
  const rawCase=String(d?.aktenzeichen??d?.caseNumber??d?.az??d?.reference??'').trim();
  return creditors().find(c=>c&&((d?.creditorId&&c.id===d.creditorId)||(c.name&&d?.name&&norm(c.name)===norm(d.name))||(c.aktenzeichen&&rawCase&&norm(c.aktenzeichen)===norm(rawCase))))||null;
}
function caseNo(d){ const c=creditorFor(d); return String(d?.aktenzeichen??d?.caseNumber??d?.az??d?.reference??c?.aktenzeichen??c?.caseNumber??c?.az??'').trim(); }
function contact(d){
  const a=d&&typeof d.contactDetails==='object'?d.contactDetails:{};
  const b=d&&typeof d.contact==='object'?d.contact:{};
  const c=creditorFor(d)||{};
  return {
    representative:String(a.representative??a.name??a.vertreter??b.representative??b.name??b.vertreter??d?.contactPerson??d?.ansprechpartner??c.representative??c.contactPerson??'').trim(),
    address:String(a.address??a.anschrift??b.address??b.anschrift??c.address??c.anschrift??'').trim(),
    email:String(a.email??a.mail??b.email??b.mail??c.email??c.mail??'').trim(),
    phone:String(a.phone??a.telefon??a.telefonnummer??b.phone??b.telefon??b.telefonnummer??c.phone??c.telefon??'').trim()
  };
}
function documents(d){
  const pools=[d?.paperlessLinks,d?.correspondence,d?.attachments,d?.documents,d?.files];
  const out=[];
  for(const p of pools) if(Array.isArray(p)) for(const x of p) out.push(x);
  return out;
}
function keyFor(d,i){ return String(d?.v131Uid||d?.chatgptImportId||d?.id||[norm(d?.name),caseNo(d),i].join('|')); }
function state(d,i){
  const m=metas()[keyFor(d,i)]||{};
  const missing=[];
  if(!String(d?.name||'').trim()) missing.push('Gläubiger');
  if(!(Number(d?.betrag)>0)) missing.push('Forderungsbetrag');
  if(!caseNo(d)) missing.push('Aktenzeichen');
  if(!contact(d).address) missing.push('Anschrift');
  if(!documents(d).length) missing.push('Nachweis / Dokument');
  if(!m.currentClaim) missing.push('aktueller Forderungsstand geprüft');
  return {missing,level:missing.length===0?'Vollständig':missing.length<=2?'Teilweise':'Unvollständig',meta:m};
}
function creditorType(d){
  const stored=String(d?.category||d?.kategorie||'').trim();
  if(stored && !/^sonstiges$/i.test(stored)) return stored;
  const n=norm([d?.name,d?.grund,d?.reason].filter(Boolean).join(' '));
  if(/barmer|aok|kkh|krankenkasse|techniker| tk |dak|bkk|ikk|hkk/.test(' '+n+' ')) return 'Krankenversicherung';
  if(/finanzamt|steuer|hauptzollamt|landeskasse|stadtkasse|gemeinde|landkreis/.test(n)) return 'Steuern / Behörden';
  if(/berufsgenossenschaft|\bbgn\b|bg bau|bgw/.test(n)) return 'Berufsgenossenschaft';
  if(/inkasso|eos|riverty|coeo|intrum|creditreform|forderungseinzug/.test(n)) return 'Inkasso / Forderungseinzug';
  if(/bank|sparkasse|volksbank|kredit|darlehen|finanzierung|axoran/.test(n)) return 'Bank / Kredit';
  if(/vodafone|telekom|telefonica|o2|1und1|1 1|mobilfunk|telefon/.test(n)) return 'Telekommunikation';
  if(/stadtwerke|energie|strom|gas|eon|vattenfall|enbw/.test(n)) return 'Energie / Versorgung';
  if(/versicherung/.test(n)) return 'Versicherung';
  if(/leasing|autohaus|fahrzeug|kfz/.test(n)) return 'Fahrzeug / Leasing';
  return stored || 'Sonstiges';
}
function dueLabel(m){
  if(!m?.dueDate) return '–';
  const d=new Date(m.dueDate+'T12:00:00');
  return Number.isNaN(d.getTime())?String(m.dueDate):d.toLocaleDateString('de-DE');
}
function taskFor(d,i,s){
  const m=s.meta||{};
  if(m.nextTask) return m.nextTask;
  if(!documents(d).length) return 'Unterlagen / Nachweis zuordnen';
  if(!contact(d).address) return 'Anschrift ergänzen';
  if(!caseNo(d)) return 'Aktenzeichen prüfen';
  if(!m.currentClaim) return 'aktuellen Forderungsstand prüfen';
  if(!m.contacted) return 'Gläubiger / Beratung kontaktieren';
  if(!m.reply) return 'Antwort abwarten / nachfassen';
  return 'Für Beratung vorbereitet';
}
function addFooters(doc){
  const pages=doc.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    doc.setPage(i);
    const w=doc.internal.pageSize.getWidth(),h=doc.internal.pageSize.getHeight();
    doc.setDrawColor(220); doc.line(12,h-11,w-12,h-11);
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(95);
    doc.text('Schulden1 · Privatinsolvenz / Schuldnerberatung · '+new Date().toLocaleDateString('de-DE'),12,h-6);
    doc.text('Seite '+i+' / '+pages,w-12,h-6,{align:'right'});
  }
}
function exportBetterPDF(){
  const J=window.jspdf?.jsPDF;
  if(!J || !J.API?.autoTable){ alert('PDF-Bibliothek ist nicht geladen.'); return; }
  const list=debtsArr();
  if(!list.length){ alert('Keine Forderungen vorhanden.'); return; }
  const states=list.map(state);
  const total=list.reduce((s,d)=>s+(Number(d.betrag)||0),0);
  const complete=states.filter(s=>s.level==='Vollständig').length;
  const partial=states.filter(s=>s.level==='Teilweise').length;
  const incomplete=states.filter(s=>s.level==='Unvollständig').length;
  const docsMissing=list.filter(d=>!documents(d).length).length;
  const caseMissing=list.filter(d=>!caseNo(d)).length;
  const addressMissing=list.filter(d=>!contact(d).address).length;
  const currentMissing=states.filter(s=>!s.meta?.currentClaim).length;
  const doc=new J({orientation:'landscape',unit:'mm',format:'a4'});

  doc.setTextColor(25);
  doc.setFont('helvetica','bold'); doc.setFontSize(20); doc.text('Unterlagenübersicht Privatinsolvenz',14,16);
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text('Arbeitsunterlage für Schuldnerberatung / Insolvenzvorbereitung',14,23);
  doc.setFontSize(8); doc.setTextColor(90); doc.text('Stand: '+new Date().toLocaleString('de-DE'),14,29);

  doc.autoTable({
    startY:35,
    head:[['Forderungen','Gesamtsumme','Vollständig','Teilweise','Unvollständig']],
    body:[[String(list.length),money(total),String(complete),String(partial),String(incomplete)]],
    styles:{fontSize:10,cellPadding:3.2},headStyles:{fontStyle:'bold'},theme:'striped'
  });

  const types={};
  for(const d of list){ const t=creditorType(d); types[t]=(types[t]||0)+Number(d.betrag||0); }
  const typeRows=Object.entries(types).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,money(v),((v/total)*100).toLocaleString('de-DE',{maximumFractionDigits:1})+' %']);
  const largest=[...list].sort((a,b)=>Number(b.betrag||0)-Number(a.betrag||0)).slice(0,6).map(d=>[d.name||'–',creditorType(d),money(d.betrag)]);
  const y=(doc.lastAutoTable?.finalY||53)+7;
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(30); doc.text('Gläubigerarten',14,y);
  doc.autoTable({startY:y+3,margin:{left:14,right:154},head:[['Art','Summe','Anteil']],body:typeRows,styles:{fontSize:7.5,cellPadding:1.7},headStyles:{fontStyle:'bold'}});
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('Größte Forderungen',154,y);
  doc.autoTable({startY:y+3,margin:{left:154,right:14},head:[['Gläubiger','Art','Betrag']],body:largest,styles:{fontSize:7.5,cellPadding:1.7},headStyles:{fontStyle:'bold'}});

  const low=Math.max(doc.lastAutoTable?.finalY||95,115);
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('Noch zu vervollständigen',14,low);
  doc.autoTable({startY:low+3,head:[['Ohne Dokument','Ohne Aktenzeichen','Ohne Anschrift','Forderungsstand ungeprüft']],body:[[String(docsMissing),String(caseMissing),String(addressMissing),String(currentMissing)]],styles:{fontSize:9,cellPadding:2.4},headStyles:{fontStyle:'bold'}});
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(90);
  doc.text('Hinweis: Die Gläubigerart wird nur für diese PDF-Auswertung aus vorhandenen Kategorien bzw. Namen abgeleitet. Gespeicherte Kategorien werden nicht verändert.',14,(doc.lastAutoTable?.finalY||145)+6);
  doc.text('Die Vollständigkeitsanzeige ist eine organisatorische Prüfung der App und keine rechtliche Bewertung.',14,(doc.lastAutoTable?.finalY||145)+11);

  doc.addPage('a4','landscape');
  doc.setTextColor(25); doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.text('Gläubiger- und Forderungsübersicht',12,14);
  doc.autoTable({
    startY:20,
    head:[['Nr.','Gläubiger','Art','Betrag','Aktenzeichen','Anschrift','Ansprechpartner','Status','Bestritten','Tituliert','Dok.','Prüfung']],
    body:list.map((d,i)=>{const s=states[i],c=contact(d),m=s.meta||{};return [i+1,d.name||'',creditorType(d),money(d.betrag),caseNo(d)||'–',c.address||'–',c.representative||'–',d.status||'offen',m.disputed?'Ja':'Nein',m.titled?'Ja':'Nein',documents(d).length,s.level];}),
    styles:{fontSize:5.2,cellPadding:1.05,valign:'top'},headStyles:{fontStyle:'bold'},margin:{bottom:16}
  });

  doc.addPage('a4','landscape');
  doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.text('Fehlende Angaben und nächste Schritte',12,14);
  const missingRows=list.map((d,i)=>{const s=states[i];return [d.name||'',s.missing.join(', ')||'–',taskFor(d,i,s),dueLabel(s.meta),s.meta?.contacted?'Ja':'Nein',s.meta?.reply?'Ja':'Nein'];});
  doc.autoTable({startY:20,head:[['Gläubiger','Fehlt','Nächster Schritt','Frist','Kontakt','Antwort']],body:missingRows,styles:{fontSize:7,cellPadding:1.6,valign:'top'},margin:{bottom:16}});

  doc.addPage('a4','landscape');
  doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.text('Dokumentenliste',12,14);
  const docRows=[];
  list.forEach(d=>{
    const ds=documents(d);
    if(!ds.length) docRows.push([d.name||'','–','Kein Dokument verknüpft','']);
    else ds.forEach((x,idx)=>docRows.push([d.name||'',String(x?.id??x?.paperlessId??''),String(x?.title??x?.name??x?.filename??('Dokument '+(idx+1))),String(x?.meta??x?.linkedAt??x?.date??'')]));
  });
  doc.autoTable({startY:20,head:[['Gläubiger','Dokument-ID','Dokument','Info']],body:docRows,styles:{fontSize:7,cellPadding:1.6,valign:'top'},margin:{bottom:16}});

  addFooters(doc);
  doc.save('privatinsolvenz_unterlagen_v133.pdf');
}

function relabel(){
  document.querySelectorAll('.v59MenuVersion').forEach(el=>el.textContent=VERSION);
  document.querySelectorAll('.v132Modal h2').forEach(el=>{ if(/Insolvenz-Status/i.test(el.textContent||'')) el.textContent='Insolvenz-Status '+VERSION; });
}

document.addEventListener('click',function(e){
  const btn=e.target?.closest?.('[data-v132-pdf]');
  if(!btn) return;
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  exportBetterPDF();
},true);

new MutationObserver(relabel).observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',relabel,{once:true}); else relabel();
window.v133ExportInsolvencyPDF=exportBetterPDF;
})();
