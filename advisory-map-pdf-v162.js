(function(){
'use strict';

const DEBT_KEY='godmode_debts';
const CREDITOR_KEY='schulden_creditors_v37';
const META_KEY='schulden_v131_meta';

const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const text=v=>String(v??'').trim();
const money=v=>(Number(v)||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
function debtsArr(){
  try{if(typeof debts!=='undefined'&&Array.isArray(debts))return debts;}catch(e){}
  try{if(Array.isArray(window.debts))return window.debts;}catch(e){}
  try{const x=JSON.parse(localStorage.getItem(DEBT_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}
}
function creditors(){try{const x=JSON.parse(localStorage.getItem(CREDITOR_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
function metaAll(){try{const x=JSON.parse(localStorage.getItem(META_KEY)||'{}');return x&&typeof x==='object'?x:{};}catch(e){return {};}}
function creditorFor(d){
  const raw=text(d?.aktenzeichen??d?.caseNumber??d?.az),name=norm(d?.name),id=text(d?.creditorId);
  return creditors().find(c=>c&&((id&&String(c.id)===id)||(name&&norm(c.name)===name)||(raw&&norm(c.aktenzeichen||c.caseNumber||'')===norm(raw))))||null;
}
function caseNo(d){const c=creditorFor(d);return text(d?.aktenzeichen??d?.caseNumber??d?.az??c?.aktenzeichen??c?.caseNumber);}
function keyFor(d,i){return String(d?.v131Uid||d?.chatgptImportId||d?.id||[norm(d?.name),norm(caseNo(d)),i].join('|'));}
function contact(d){
  const a=d&&typeof d.contactDetails==='object'?d.contactDetails:{};
  const b=d&&typeof d.contact==='object'?d.contact:{};
  const c=creditorFor(d)||{};
  return {address:text(a.address??a.anschrift??b.address??b.anschrift??c.address??c.anschrift)};
}
function documents(d){
  const out=[],seen=new Set();
  const pools=[['Paperless',d?.paperlessLinks],['Daten',d?.correspondence],['Anhang',d?.attachments],['Dokument',d?.documents],['Datei',d?.files]];
  for(const [source,pool] of pools){if(!Array.isArray(pool))continue;for(const x of pool){const id=String(x&&typeof x==='object'?(x.id??x.paperlessId??x.documentId??x.fileId??x.name??x.filename??x.title??JSON.stringify(x)):x);const k=source+'|'+id;if(seen.has(k))continue;seen.add(k);out.push({source,id});}}
  return out;
}
function validDate(v){if(!v)return'';const s=String(v).slice(0,10),t=new Date(s+'T12:00:00').getTime();return Number.isFinite(t)?s:'';}
function fmtDate(v){if(!v)return'–';try{return new Date(v+'T12:00:00').toLocaleDateString('de-DE');}catch(e){return String(v);}}
function deadlineFor(d,m){
  const insolvency=validDate(m?.dueDate);if(insolvency)return {date:insolvency,source:'Insolvenz-Frist'};
  const legacy=validDate(d?.datum);if(legacy)return {date:legacy,source:'Bestehende Fälligkeit'};
  return {date:'',source:''};
}
function missingItems(d,i,m){
  const c=contact(d),out=[];
  if(!text(d?.name))out.push('Gläubiger');
  if(!(Number(d?.betrag)>0))out.push('Forderungsbetrag');
  if(!caseNo(d))out.push('Aktenzeichen');
  if(!c.address)out.push('Anschrift');
  if(!m?.currentClaim)out.push('Forderungsstand prüfen');
  if(!documents(d).length)out.push('Dokument / Nachweis');
  return out;
}
function toast(msg){try{if(typeof showToast==='function'){showToast(msg);return;}}catch(e){}alert(msg);}
function exportPdf(){
  const list=debtsArr(),all=metaAll();
  try{
    const jsPDF=window.jspdf?.jsPDF;if(!jsPDF)throw new Error('PDF-Bibliothek nicht geladen');
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    doc.setFontSize(16);doc.text('Insolvenz- / Beratungsmappe',14,14);
    doc.setFontSize(9);doc.text('Stand: '+new Date().toLocaleString('de-DE')+'  |  Gesamtschulden: '+money(list.reduce((s,d)=>s+(Number(d?.betrag)||0),0)),14,20);
    const body=list.map((d,i)=>{
      const m=all[keyFor(d,i)]||{},c=contact(d),deadline=deadlineFor(d,m),miss=missingItems(d,i,m);
      return [d?.name||'',money(d?.betrag),caseNo(d)||'',c.address||'',fmtDate(deadline.date),String(documents(d).length),m.locked?'geprüft':'offen',miss.join(', ')||'–'];
    });
    if(typeof doc.autoTable==='function')doc.autoTable({startY:25,head:[['Gläubiger','Betrag','Aktenzeichen','Anschrift','Frist','Dok.','Status','Fehlt / offen']],body,styles:{fontSize:7,cellPadding:1.5},headStyles:{fontSize:7},columnStyles:{0:{cellWidth:35},1:{cellWidth:23},2:{cellWidth:30},3:{cellWidth:52},4:{cellWidth:22},5:{cellWidth:12},6:{cellWidth:18},7:{cellWidth:75}}});
    else{let y=28;doc.setFontSize(7);for(const row of body){const line=doc.splitTextToSize(row.join(' | '),265);if(y+line.length*4>195){doc.addPage();y=14;}doc.text(line,14,y);y+=line.length*4+2;}}
    let y=(doc.lastAutoTable?.finalY||25)+8;if(y>190){doc.addPage();y=14;}doc.setFontSize(7);doc.text('Hinweis: Frist = Insolvenz-Frist; falls nicht vorhanden, bestehende Fälligkeit des Schuldeneintrags. Organisatorische Arbeitsunterlage; keine rechtliche Prüfung.',14,y);
    doc.save('Insolvenz-Beratungsmappe.pdf');
  }catch(e){toast('Beratungsmappe konnte nicht erstellt werden: '+String(e?.message||e));}
}

// Vor dem v153-Bubble-Handler abfangen, damit nur die kompatible PDF erzeugt wird.
window.addEventListener('click',function(e){
  const btn=e.target?.closest?.('[data-v153-map-pdf]');if(!btn)return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  exportPdf();
},true);
window.v162ExportAdvisoryMapPdf=exportPdf;
})();
