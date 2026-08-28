(function(){
  "use strict";

  const CREDITOR_KEY = "schulden_creditors_v37";

  function clean(v){ return String(v == null ? "" : v).trim(); }
  function norm(v){ return clean(v).toLowerCase(); }
  function num(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function money(v){ return num(v).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2}) + " EUR"; }
  function clip(v,max){ const s=clean(v); return s.length>max ? s.slice(0,max-1)+"…" : s; }

  function getDebts(){
    try{ if(typeof debts !== "undefined" && Array.isArray(debts)) return debts; }catch(e){}
    return Array.isArray(window.debts) ? window.debts : [];
  }

  function getCreditors(){
    try{
      const x = JSON.parse(localStorage.getItem(CREDITOR_KEY) || "[]");
      return Array.isArray(x) ? x : [];
    }catch(e){ return []; }
  }

  function statusLabel(v){
    const s = norm(v);
    if(["bezahlt","erledigt","paid","closed","abgeschlossen"].includes(s)) return "Erledigt";
    if(s === "ratenzahlung") return "Ratenzahlung";
    if(s === "vergleich") return "Vergleich";
    if(s === "teilzahlung") return "Teilzahlung";
    if(s === "klaerung" || s === "klärung") return "In Klärung";
    if(s === "insolvenz") return "Insolvenz";
    return clean(v) || "Offen";
  }

  function isOpen(d){
    return !["bezahlt","erledigt","paid","closed","abgeschlossen"].includes(norm(d && d.status));
  }

  function findCreditor(d, creditors){
    return creditors.find(function(c){
      if(!c) return false;
      if(d && d.creditorId && c.id === d.creditorId) return true;
      if(c.name && d && d.name && norm(c.name) === norm(d.name)) return true;
      if(c.aktenzeichen && d && d.aktenzeichen && clean(c.aktenzeichen) === clean(d.aktenzeichen)) return true;
      return false;
    }) || null;
  }

  function contact(d,c){
    const x = d && d.contactDetails && typeof d.contactDetails === "object" ? d.contactDetails : {};
    const z = d && d.contact && typeof d.contact === "object" ? d.contact : {};
    const y = c || {};
    return {
      address: clean(x.address || x.anschrift || z.address || z.anschrift || y.address),
      person: clean(x.representative || x.name || (d && d.contactPerson) || z.representative || z.name || y.representative || y.contactPerson),
      phone: clean(x.phone || x.telefon || z.phone || z.telefon || y.phone),
      email: clean(x.email || x.mail || z.email || z.mail || y.email)
    };
  }

  function caseNumber(d,c){ return clean((d && (d.aktenzeichen || d.caseNumber)) || (c && c.aktenzeichen)); }
  function customerNumber(d){ return clean(d && (d.kundennummer || d.customerNumber || d.customerId)); }

  function documentsComplete(d,c){
    const raw = d && (
      d.unterlagenVollstaendig !== undefined ? d.unterlagenVollstaendig :
      d.unterlagen_vollstaendig !== undefined ? d.unterlagen_vollstaendig :
      d.documentsComplete !== undefined ? d.documentsComplete :
      d.documents_complete !== undefined ? d.documents_complete :
      d.docsComplete !== undefined ? d.docsComplete : undefined
    );
    const fallback = raw !== undefined ? raw : (c && (
      c.unterlagenVollstaendig !== undefined ? c.unterlagenVollstaendig :
      c.documentsComplete !== undefined ? c.documentsComplete : undefined
    ));
    if(fallback === true || fallback === 1) return "Ja";
    if(fallback === false || fallback === 0) return "Nein";
    const s = norm(fallback);
    if(["ja","yes","true","vollständig","vollstaendig","komplett"].includes(s)) return "Ja";
    if(["nein","no","false","unvollständig","unvollstaendig","fehlt","fehlend"].includes(s)) return "Nein";
    return clean(fallback) || "Offen";
  }

  function remark(d,c){
    const explicit = clean((d && (d.bemerkung || d.remarks || d.remark || d.comment)) || (c && (c.bemerkung || c.remarks || c.remark || c.comment)));
    if(explicit) return clip(explicit,180);
    if(d && typeof d.notes === "string" && clean(d.notes)) return clip(d.notes,180);
    if(d && Array.isArray(d.notesHistory)){
      const notes = d.notesHistory.map(function(n){
        if(typeof n === "string") return clean(n);
        if(n && typeof n === "object") return clean(n.text || n.note || n.value);
        return "";
      }).filter(Boolean);
      if(notes.length) return clip(notes[notes.length-1],180);
    }
    return "";
  }

  function groups(){
    const creditors = getCreditors();
    const map = new Map();
    getDebts().forEach(function(d){
      const c = findCreditor(d,creditors);
      const name = clean(d && d.name) || clean(c && c.name) || "Unbekannt";
      const key = norm(name);
      if(!map.has(key)){
        map.set(key,{name:name,sum:0,az:new Set(),kn:new Set(),reasons:new Set(),statuses:new Set(),address:"",person:"",phone:"",email:"",documents:new Set(),remarks:new Set(),count:0});
      }
      const g = map.get(key);
      const ct = contact(d,c);
      g.sum += num(d && d.betrag);
      g.count += 1;
      g.address = ct.address || g.address;
      g.person = ct.person || g.person;
      g.phone = ct.phone || g.phone;
      g.email = ct.email || g.email;
      const az = caseNumber(d,c), kn = customerNumber(d);
      if(az) g.az.add(az);
      if(kn) g.kn.add(kn);
      if(d && d.grund) g.reasons.add(clean(d.grund));
      g.statuses.add(statusLabel(d && d.status));
      const dc = documentsComplete(d,c);
      if(dc && dc !== "Offen") g.documents.add(dc);
      const note = remark(d,c);
      if(note) g.remarks.add(note);
    });
    return Array.from(map.values()).sort(function(a,b){ return a.name.localeCompare(b.name,"de"); });
  }

  function addPages(doc){
    const pages = doc.getNumberOfPages();
    for(let i=1;i<=pages;i+=1){
      doc.setPage(i);
      const h = doc.internal.pageSize.getHeight();
      const w = doc.internal.pageSize.getWidth();
      doc.setDrawColor(220);
      doc.line(12,h-11,w-12,h-11);
      doc.setFont("helvetica","normal");
      doc.setFontSize(7);
      doc.text("Schulden Manager - Beratung / Insolvenz",12,h-6);
      doc.text("Seite " + i + " / " + pages,w-12,h-6,{align:"right"});
    }
  }

  function exportCounseling(){
    const J = window.jspdf && window.jspdf.jsPDF;
    if(!J){ alert("PDF-Bibliothek ist nicht geladen."); return; }
    const list = groups();
    if(!list.length){ alert("Keine Gläubiger vorhanden."); return; }

    const all = getDebts();
    const total = all.reduce(function(s,d){ return s + num(d && d.betrag); },0);
    const openTotal = all.filter(isOpen).reduce(function(s,d){ return s + num(d && d.betrag); },0);
    const doc = new J({orientation:"landscape",unit:"mm",format:"a4"});

    doc.setFont("helvetica","bold");
    doc.setFontSize(18);
    doc.text("Gläubiger- und Forderungsübersicht",12,14);
    doc.setFont("helvetica","normal");
    doc.setFontSize(8.5);
    doc.text("Arbeitsunterlage für Schuldnerberatung / Insolvenzvorbereitung",12,20);
    doc.setFontSize(7.5);
    doc.text("Stand: " + new Date().toLocaleString("de-DE"),285,14,{align:"right"});

    const cards = [["Gläubiger",String(list.length)],["Forderungen",String(all.length)],["Gesamtsumme",money(total)],["Offen",money(openTotal)]];
    const gap = 4, width = (273 - gap*3)/4;
    cards.forEach(function(card,i){
      const x = 12 + i*(width+gap);
      doc.setDrawColor(205); doc.setFillColor(247,248,250);
      doc.roundedRect(x,25,width,16,2,2,"FD");
      doc.setFont("helvetica","normal"); doc.setFontSize(7.3); doc.text(card[0],x+3,30);
      doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.text(card[1],x+3,37);
    });

    doc.setFont("helvetica","normal");
    doc.setFontSize(7.2);
    doc.text("Hinweis: 'Unterlagen vollständig' wird nur aus vorhandenen Angaben übernommen. Ohne Angabe steht dort 'Offen'.",12,44);

    const rows = list.map(function(g,index){
      const refs = [Array.from(g.az).map(function(x){ return "AZ: " + x; }).join("\n"),Array.from(g.kn).map(function(x){ return "KdNr: " + x; }).join("\n")].filter(Boolean).join("\n") || "-";
      const phoneMail = [g.phone,g.email].filter(Boolean).join("\n") || "-";
      const documents = g.documents.size ? Array.from(g.documents).join(" / ") : "Offen";
      const remarks = g.remarks.size ? Array.from(g.remarks).join(" | ") : "-";
      return [String(index+1),g.name,Array.from(g.reasons).join(" / ") || "-",money(g.sum),refs,g.address || "-",g.person || "-",phoneMail,documents,remarks,Array.from(g.statuses).join(" / ") || "-"];
    });

    doc.autoTable({
      startY:49,
      margin:{left:7,right:7,bottom:16},
      head:[["Nr.","Gläubiger","Grund","Forderung","Aktenzeichen / Kundennr.","Anschrift","Ansprechpartner","Telefon / E-Mail","Unterlagen vollständig","Bemerkung","Status"]],
      body:rows,
      foot:[["","GESAMT","",money(total),"","","","","","",""]],
      styles:{fontSize:5.1,cellPadding:1.2,valign:"top",overflow:"linebreak",textColor:35},
      headStyles:{fillColor:[235,238,243],textColor:30,fontStyle:"bold",lineColor:210,lineWidth:0.1,fontSize:5.0},
      alternateRowStyles:{fillColor:[249,250,252]},
      footStyles:{fillColor:[240,243,247],textColor:20,fontStyle:"bold"},
      tableLineColor:220,
      tableLineWidth:0.1,
      columnStyles:{0:{cellWidth:7,halign:"center"},1:{cellWidth:29},2:{cellWidth:23},3:{cellWidth:20,halign:"right"},4:{cellWidth:31},5:{cellWidth:35},6:{cellWidth:24},7:{cellWidth:30},8:{cellWidth:20},9:{cellWidth:38},10:{cellWidth:20}}
    });

    addPages(doc);
    doc.save("schuldnerberatung_insolvenz_uebersicht.pdf");
    const overlay = document.getElementById("pdfListsOverlayV100");
    if(overlay) overlay.remove();
  }

  document.addEventListener("click",function(event){
    const target = event.target && event.target.closest ? event.target.closest('[data-pdf-action="counseling"]') : null;
    if(!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    exportCounseling();
  },true);
})();
