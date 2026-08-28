(function(){
  'use strict';

  const CRED_KEY='schulden_creditors_v37';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));

  function debtsArr(){
    try{ if(typeof debts!=='undefined' && Array.isArray(debts)) return debts; }catch(e){}
    return Array.isArray(window.debts)?window.debts:[];
  }
  function creditorsArr(){
    try{ const x=JSON.parse(localStorage.getItem(CRED_KEY)||'[]'); return Array.isArray(x)?x:[]; }catch(e){ return []; }
  }
  function toast(msg){ try{ if(typeof showToast==='function') return showToast(msg); }catch(e){} alert(msg); }
  function norm(v){ return String(v||'').trim().toLowerCase(); }
  function text(v){ return String(v??'').trim(); }
  function money(v){ return (Number(v)||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' EUR'; }
  function dateText(v){
    const s=text(v); if(!s) return '–';
    const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[3]}.${m[2]}.${m[1]}`:s;
  }
  function isOpen(d){
    const s=norm(d?.status);
    return !['bezahlt','erledigt','paid','closed','abgeschlossen'].includes(s);
  }
  function statusText(v){
    const s=norm(v);
    if(s==='bezahlt'||s==='erledigt'||s==='paid') return 'Erledigt';
    if(s==='ratenzahlung') return 'Ratenzahlung';
    if(s==='vergleich') return 'Vergleich';
    if(s==='teilzahlung') return 'Teilzahlung';
    if(s==='klaerung'||s==='klärung') return 'In Klärung';
    if(s==='insolvenz') return 'Insolvenz';
    return text(v)||'Offen';
  }
  function contactFor(d,c){
    const cd=d?.contactDetails||{};
    return {
      representative:text(cd.representative||d?.contactPerson||c?.representative||c?.contactPerson),
      address:text(cd.address||c?.address),
      email:text(cd.email||c?.email),
      phone:text(cd.phone||c?.phone)
    };
  }
  function findCreditor(d, all=creditorsArr()){
    return all.find(c=>c && ((d?.creditorId&&c.id===d.creditorId) || (c.name&&d?.name&&norm(c.name)===norm(d.name)) || (c.aktenzeichen&&d?.aktenzeichen&&text(c.aktenzeichen)===text(d.aktenzeichen)))) || null;
  }
  function customerNumber(d){ return text(d?.kundennummer||d?.customerNumber||d?.customerId); }
  function caseNumber(d,c){ return text(d?.aktenzeichen||d?.caseNumber||c?.aktenzeichen); }
  function requirePdf(){
    const jsPDF=window.jspdf&&window.jspdf.jsPDF;
    if(!jsPDF){ toast('PDF-Bibliothek nicht geladen.'); return null; }
    return jsPDF;
  }
  function addHeader(doc,title,subtitle,total,count){
    doc.setFontSize(18); doc.text(title,14,15);
    doc.setFontSize(9); doc.text(subtitle,14,22);
    doc.setFontSize(10); doc.text('Einträge: '+count,14,29); doc.text('Gesamtsumme: '+money(total),65,29);
    doc.setFontSize(8); doc.text('Stand: '+new Date().toLocaleString('de-DE'),14,35);
  }
  function addPageNumbers(doc){
    const pages=doc.getNumberOfPages();
    for(let p=1;p<=pages;p++){
      doc.setPage(p); doc.setFontSize(8);
      doc.text('Seite '+p+' / '+pages,doc.internal.pageSize.getWidth()-14,doc.internal.pageSize.getHeight()-8,{align:'right'});
    }
  }
  function saveDoc(doc,name){ addPageNumbers(doc); doc.save(name); closeModal(); }

  function exportDebts(onlyOpen){
    const jsPDF=requirePdf(); if(!jsPDF) return;
    const allCred=creditorsArr();
    const list=debtsArr().filter(d=>!onlyOpen||isOpen(d));
    if(!list.length){ toast('Keine passenden Schulden vorhanden.'); return; }
    const total=list.reduce((s,d)=>s+(Number(d.betrag)||0),0);
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    addHeader(doc,onlyOpen?'Offene Schulden':'Komplette Schuldenübersicht',onlyOpen?'Nur noch offene Forderungen':'Alle gespeicherten Forderungen',total,list.length);
    const rows=list.map(d=>{
      const c=findCreditor(d,allCred); const ct=contactFor(d,c);
      const ref=[caseNumber(d,c)&&('AZ: '+caseNumber(d,c)),customerNumber(d)&&('KdNr: '+customerNumber(d))].filter(Boolean).join(' / ')||'–';
      return [text(d.name)||'–',text(d.grund)||'–',money(d.betrag),ref,dateText(d.datum),statusText(d.status),ct.address||'–',ct.representative||'–',[ct.phone,ct.email].filter(Boolean).join('\n')||'–'];
    });
    doc.autoTable({
      head:[['Gläubiger','Grund','Betrag','Aktenzeichen / Kundennr.','Frist','Status','Anschrift','Ansprechpartner','Telefon / E-Mail']],
      body:rows,startY:40,margin:{left:8,right:8,bottom:14},
      styles:{fontSize:6.6,cellPadding:1.7,valign:'top',overflow:'linebreak'},
      headStyles:{fontSize:6.7},
      columnStyles:{0:{cellWidth:31},1:{cellWidth:30},2:{cellWidth:22,halign:'right'},3:{cellWidth:39},4:{cellWidth:19},5:{cellWidth:23},6:{cellWidth:42},7:{cellWidth:34},8:{cellWidth:39}}
    });
    saveDoc(doc,onlyOpen?'offene_schulden.pdf':'schulden_komplettuebersicht.pdf');
  }

  function creditorGroups(){
    const saved=creditorsArr();
    const groups=new Map();
    const ensure=(name,id)=>{
      const key=id?('id:'+id):('name:'+norm(name||'Unbekannt'));
      if(!groups.has(key)) groups.set(key,{name:text(name)||'Unbekannt',category:'',address:'',representative:'',email:'',phone:'',aktenzeichen:new Set(),kundennummer:new Set(),amount:0,debtCount:0,statuses:new Set()});
      return groups.get(key);
    };
    saved.forEach(c=>{
      const g=ensure(c.name,c.id); g.name=text(c.name)||g.name; g.category=text(c.category); g.address=text(c.address); g.representative=text(c.representative||c.contactPerson); g.email=text(c.email); g.phone=text(c.phone); if(c.aktenzeichen)g.aktenzeichen.add(text(c.aktenzeichen));
    });
    debtsArr().forEach(d=>{
      const c=findCreditor(d,saved); const g=ensure(d.name,c?.id||d.creditorId); const ct=contactFor(d,c);
      g.name=text(d.name)||g.name; g.category=g.category||text(c?.category); g.address=ct.address||g.address; g.representative=ct.representative||g.representative; g.email=ct.email||g.email; g.phone=ct.phone||g.phone;
      const az=caseNumber(d,c), kn=customerNumber(d); if(az)g.aktenzeichen.add(az); if(kn)g.kundennummer.add(kn);
      g.amount+=Number(d.betrag)||0; g.debtCount++; g.statuses.add(statusText(d.status));
    });
    return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'de'));
  }

  function exportCreditors(){
    const jsPDF=requirePdf(); if(!jsPDF) return;
    const list=creditorGroups(); if(!list.length){ toast('Keine Gläubiger vorhanden.'); return; }
    const total=list.reduce((s,x)=>s+x.amount,0);
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    addHeader(doc,'Gläubigerliste','Gläubiger mit Forderung, Referenzen und Kontaktdaten',total,list.length);
    const rows=list.map(g=>[
      g.name,g.category||'–',money(g.amount),[...g.aktenzeichen].join('\n')||'–',[...g.kundennummer].join('\n')||'–',g.address||'–',g.representative||'–',[g.phone,g.email].filter(Boolean).join('\n')||'–',g.debtCount?String(g.debtCount):'–'
    ]);
    doc.autoTable({
      head:[['Gläubiger','Kategorie','Forderung','Aktenzeichen','Kundennummer','Anschrift','Ansprechpartner','Telefon / E-Mail','Forderungen']],
      body:rows,startY:40,margin:{left:8,right:8,bottom:14},
      styles:{fontSize:6.8,cellPadding:1.8,valign:'top',overflow:'linebreak'},
      headStyles:{fontSize:6.9},
      columnStyles:{0:{cellWidth:39},1:{cellWidth:27},2:{cellWidth:23,halign:'right'},3:{cellWidth:36},4:{cellWidth:31},5:{cellWidth:46},6:{cellWidth:35},7:{cellWidth:41},8:{cellWidth:18,halign:'center'}}
    });
    saveDoc(doc,'glaeubigerliste.pdf');
  }

  function closeModal(){ $('pdfPlusOverlay')?.remove(); document.body.classList.remove('modalOpen'); }
  function openModal(){
    $('pdfPlusOverlay')?.remove();
    const all=debtsArr(), open=all.filter(isOpen), creditors=creditorGroups();
    const overlay=document.createElement('div'); overlay.id='pdfPlusOverlay'; overlay.className='pdfPlusOverlay';
    overlay.innerHTML=`<div class="pdfPlusModal" role="dialog" aria-modal="true"><div class="pdfPlusHead"><div><h3>🧾 PDF-Export</h3><p>Welche Liste möchtest du erstellen?</p></div><button type="button" data-pdfplus-close>×</button></div><div class="pdfPlusGrid"><button type="button" class="pdfPlusChoice" data-pdfplus="all"><strong>📋 Komplettübersicht</strong><span>${all.length} Forderungen · ${esc(money(all.reduce((s,d)=>s+(Number(d.betrag)||0),0)))}</span><small>Gläubiger, Betrag, Grund, Aktenzeichen, Kundennummer, Frist, Status und Kontakt.</small></button><button type="button" class="pdfPlusChoice" data-pdfplus="creditors"><strong>🏢 Gläubigerliste</strong><span>${creditors.length} Gläubiger</span><small>Gläubiger mit Gesamtsumme, Anschrift, Ansprechpartner und Referenzen.</small></button><button type="button" class="pdfPlusChoice" data-pdfplus="open"><strong>🔴 Nur offene Schulden</strong><span>${open.length} offene Forderungen · ${esc(money(open.reduce((s,d)=>s+(Number(d.betrag)||0),0)))}</span><small>Praktisch für Schuldnerberatung, Vergleich oder aktuellen Überblick.</small></button></div><div class="pdfPlusNote">Der Export liest nur deine vorhandenen Daten. An den Schuldendaten wird nichts verändert.</div></div>`;
    document.body.appendChild(overlay); document.body.classList.add('modalOpen');
    overlay.addEventListener('click',e=>{
      if(e.target===overlay||e.target.closest('[data-pdfplus-close]')) return closeModal();
      const b=e.target.closest('[data-pdfplus]'); if(!b)return;
      if(b.dataset.pdfplus==='all')exportDebts(false); else if(b.dataset.pdfplus==='creditors')exportCreditors(); else if(b.dataset.pdfplus==='open')exportDebts(true);
    });
  }

  function ensureStyle(){
    if($('pdfPlusStyle'))return;
    const s=document.createElement('style'); s.id='pdfPlusStyle'; s.textContent=`
      .pdfPlusOverlay{position:fixed;inset:0;z-index:14000;background:rgba(2,6,18,.80);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:18px}
      .pdfPlusModal{width:min(820px,96vw);max-height:92vh;overflow:auto;background:#111a2b;color:#eaf2ff;border:1px solid rgba(255,255,255,.12);border-radius:26px;padding:20px;box-shadow:0 30px 90px rgba(0,0,0,.55)}
      .pdfPlusHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px}.pdfPlusHead h3{margin:0;font-size:23px}.pdfPlusHead p{margin:5px 0 0;color:#9fb0cc}.pdfPlusHead button{width:42px;min-width:42px;height:42px;padding:0;border-radius:14px;font-size:23px}
      .pdfPlusGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.pdfPlusChoice{text-align:left;min-height:178px;padding:16px;border-radius:19px;background:rgba(255,255,255,.055)!important;border:1px solid rgba(255,255,255,.10)!important;color:#eaf2ff!important;box-shadow:none!important;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start}.pdfPlusChoice strong{font-size:16px;margin-bottom:10px}.pdfPlusChoice span{color:#caffdf;font-weight:800;margin-bottom:10px}.pdfPlusChoice small{color:#aebed8;line-height:1.5}.pdfPlusChoice:hover{background:rgba(255,255,255,.09)!important}.pdfPlusNote{margin-top:13px;color:#90a3c1;font-size:12px;line-height:1.5}
      @media(max-width:720px){.pdfPlusGrid{grid-template-columns:1fr}.pdfPlusChoice{min-height:0}}
    `; document.head.appendChild(s);
  }

  function install(){
    ensureStyle();
    const old=$('btnPDF'); if(!old)return;
    const fresh=old.cloneNode(true); fresh.innerHTML='🧾 PDF / Listen';
    old.replaceWith(fresh); fresh.addEventListener('click',e=>{e.preventDefault();openModal();});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,80),{once:true}); else setTimeout(install,80);
})();
