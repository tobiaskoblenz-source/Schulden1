(function () {
  "use strict";

  const BUTTON_ID = "pdfListsMenuV100";
  const OVERLAY_ID = "pdfListsOverlayV100";
  const STYLE_ID = "pdfListsStyleV100";
  const CREDITOR_KEY = "schulden_creditors_v37";
  const QUOTE_KEY = "schulden_pdf_compare_quote_v1";

  function getDebts() {
    try {
      if (typeof debts !== "undefined" && Array.isArray(debts)) return debts;
    } catch (e) {}
    return Array.isArray(window.debts) ? window.debts : [];
  }

  function getCreditors() {
    try {
      const value = JSON.parse(localStorage.getItem(CREDITOR_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (e) {
      return [];
    }
  }

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function norm(value) {
    return clean(value).toLowerCase();
  }

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function money(value) {
    return number(value).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " EUR";
  }

  function formatDate(value) {
    const s = clean(value);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[3] + "." + m[2] + "." + m[1] : (s || "-");
  }

  function statusLabel(value) {
    const s = norm(value);
    if (["bezahlt", "erledigt", "paid", "closed", "abgeschlossen"].includes(s)) return "Erledigt";
    if (s === "ratenzahlung") return "Ratenzahlung";
    if (s === "vergleich") return "Vergleich";
    if (s === "teilzahlung") return "Teilzahlung";
    if (s === "klaerung" || s === "klärung") return "In Klärung";
    if (s === "insolvenz") return "Insolvenz";
    return clean(value) || "Offen";
  }

  function isOpen(debt) {
    return !["bezahlt", "erledigt", "paid", "closed", "abgeschlossen"].includes(norm(debt && debt.status));
  }

  function findCreditor(debt, creditors) {
    return creditors.find(function (c) {
      if (!c) return false;
      if (debt && debt.creditorId && c.id === debt.creditorId) return true;
      if (c.name && debt && debt.name && norm(c.name) === norm(debt.name)) return true;
      if (c.aktenzeichen && debt && debt.aktenzeichen && clean(c.aktenzeichen) === clean(debt.aktenzeichen)) return true;
      return false;
    }) || null;
  }

  function contact(debt, creditor) {
    const d = debt && debt.contactDetails && typeof debt.contactDetails === "object" ? debt.contactDetails : {};
    const c = creditor || {};
    return {
      address: clean(d.address || d.anschrift || c.address),
      person: clean(d.representative || d.name || (debt && debt.contactPerson) || c.representative || c.contactPerson),
      phone: clean(d.phone || d.telefon || c.phone),
      email: clean(d.email || d.mail || c.email)
    };
  }

  function caseNumber(debt, creditor) {
    return clean((debt && (debt.aktenzeichen || debt.caseNumber)) || (creditor && creditor.aktenzeichen));
  }

  function customerNumber(debt) {
    return clean(debt && (debt.kundennummer || debt.customerNumber || debt.customerId));
  }

  function getPdf() {
    const J = window.jspdf && window.jspdf.jsPDF;
    if (!J) {
      alert("PDF-Bibliothek ist nicht geladen.");
      return null;
    }
    return J;
  }

  function makePdf(title, subtitle, cards) {
    const J = getPdf();
    if (!J) return null;
    const doc = new J({ orientation: "landscape", unit: "mm", format: "a4" });
    try {
      doc.setProperties({ title: title, subject: subtitle, creator: "Schulden Manager" });
    } catch (e) {}

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(title, 12, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(subtitle, 12, 20);
    doc.setFontSize(7.5);
    doc.text("Stand: " + new Date().toLocaleString("de-DE"), 285, 14, { align: "right" });

    const list = Array.isArray(cards) ? cards.slice(0, 4) : [];
    const gap = 4;
    const totalWidth = 273;
    const width = list.length ? (totalWidth - gap * (list.length - 1)) / list.length : totalWidth;
    list.forEach(function (card, index) {
      const x = 12 + index * (width + gap);
      doc.setDrawColor(205);
      doc.setFillColor(247, 248, 250);
      doc.roundedRect(x, 25, width, 16, 2, 2, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.3);
      doc.text(clean(card.label), x + 3, 30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(clean(card.value), x + 3, 37);
    });
    doc.setFont("helvetica", "normal");
    return doc;
  }

  function addPages(doc, shortTitle) {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      const h = doc.internal.pageSize.getHeight();
      const w = doc.internal.pageSize.getWidth();
      doc.setDrawColor(220);
      doc.line(12, h - 11, w - 12, h - 11);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text("Schulden Manager - " + shortTitle, 12, h - 6);
      doc.text("Seite " + i + " / " + pages, w - 12, h - 6, { align: "right" });
    }
  }

  function baseTableOptions() {
    return {
      startY: 46,
      margin: { left: 7, right: 7, bottom: 16 },
      styles: { fontSize: 6.5, cellPadding: 1.7, valign: "top", overflow: "linebreak", textColor: 35 },
      headStyles: { fillColor: [235, 238, 243], textColor: 30, fontStyle: "bold", lineColor: 210, lineWidth: 0.1 },
      alternateRowStyles: { fillColor: [249, 250, 252] },
      footStyles: { fillColor: [240, 243, 247], textColor: 20, fontStyle: "bold" },
      tableLineColor: 220,
      tableLineWidth: 0.1
    };
  }

  function totals(debtsList) {
    const list = debtsList || [];
    return {
      count: list.length,
      sum: list.reduce(function (s, d) { return s + number(d && d.betrag); }, 0),
      openCount: list.filter(isOpen).length,
      openSum: list.filter(isOpen).reduce(function (s, d) { return s + number(d && d.betrag); }, 0)
    };
  }

  function creditorGroups(openOnly) {
    const saved = getCreditors();
    const map = new Map();
    const source = getDebts().filter(function (d) { return !openOnly || isOpen(d); });

    source.forEach(function (d) {
      const c = findCreditor(d, saved);
      const displayName = clean(d && d.name) || clean(c && c.name) || "Unbekannt";
      const key = norm(displayName);
      if (!map.has(key)) {
        map.set(key, {
          name: displayName,
          sum: 0,
          az: new Set(),
          kn: new Set(),
          reasons: new Set(),
          statuses: new Set(),
          address: "",
          person: "",
          phone: "",
          email: "",
          count: 0
        });
      }
      const g = map.get(key);
      const ct = contact(d, c);
      g.sum += number(d && d.betrag);
      g.count += 1;
      g.address = ct.address || g.address;
      g.person = ct.person || g.person;
      g.phone = ct.phone || g.phone;
      g.email = ct.email || g.email;
      const az = caseNumber(d, c);
      const kn = customerNumber(d);
      if (az) g.az.add(az);
      if (kn) g.kn.add(kn);
      if (d && d.grund) g.reasons.add(clean(d.grund));
      g.statuses.add(statusLabel(d && d.status));
    });

    return Array.from(map.values()).sort(function (a, b) { return a.name.localeCompare(b.name, "de"); });
  }

  function exportDebts(openOnly) {
    const creditors = getCreditors();
    const list = getDebts().filter(function (d) { return !openOnly || isOpen(d); });
    if (!list.length) {
      alert("Keine passenden Schulden vorhanden.");
      return;
    }

    const t = totals(list);
    const title = openOnly ? "Offene Forderungen" : "Schuldenübersicht";
    const subtitle = openOnly ? "Aktueller Arbeitsstand - nur nicht erledigte Forderungen" : "Vollständige Übersicht der in der App gespeicherten Forderungen";
    const doc = makePdf(title, subtitle, [
      { label: "Forderungen", value: String(t.count) },
      { label: "Gläubiger", value: String(creditorGroups(openOnly).length) },
      { label: openOnly ? "Offene Summe" : "Gesamtsumme", value: money(t.sum) },
      { label: "Stand", value: new Date().toLocaleDateString("de-DE") }
    ]);
    if (!doc) return;

    const rows = list.map(function (d, index) {
      const c = findCreditor(d, creditors);
      const ct = contact(d, c);
      const ref = [caseNumber(d, c) && ("AZ: " + caseNumber(d, c)), customerNumber(d) && ("KdNr: " + customerNumber(d))].filter(Boolean).join("\n") || "-";
      const addressContact = [ct.address, ct.person && ("Ansprechp.: " + ct.person), ct.phone, ct.email].filter(Boolean).join("\n") || "-";
      return [
        String(index + 1),
        clean(d && d.name) || "-",
        clean(d && d.grund) || "-",
        money(d && d.betrag),
        ref,
        formatDate(d && d.datum),
        statusLabel(d && d.status),
        addressContact
      ];
    });

    const opts = baseTableOptions();
    opts.head = [["Nr.", "Gläubiger", "Grund", "Betrag", "Aktenzeichen / Kundennr.", "Frist", "Status", "Anschrift / Kontakt"]];
    opts.body = rows;
    opts.foot = [["", "SUMME", "", money(t.sum), "", "", "", ""]];
    opts.columnStyles = {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 39 },
      2: { cellWidth: 32 },
      3: { cellWidth: 25, halign: "right" },
      4: { cellWidth: 42 },
      5: { cellWidth: 20 },
      6: { cellWidth: 24 },
      7: { cellWidth: 75 }
    };
    doc.autoTable(opts);
    addPages(doc, title);
    doc.save(openOnly ? "offene_forderungen.pdf" : "schuldenuebersicht.pdf");
    closeModal();
  }

  function exportCreditors() {
    const list = creditorGroups(false);
    if (!list.length) {
      alert("Keine Gläubiger vorhanden.");
      return;
    }
    const total = list.reduce(function (s, g) { return s + g.sum; }, 0);
    const doc = makePdf("Gläubigerverzeichnis", "Gläubiger mit Gesamtforderung, Referenzen und Kontaktdaten", [
      { label: "Gläubiger", value: String(list.length) },
      { label: "Gesamtforderung", value: money(total) },
      { label: "Mit Aktenzeichen", value: String(list.filter(function (g) { return g.az.size > 0; }).length) },
      { label: "Stand", value: new Date().toLocaleDateString("de-DE") }
    ]);
    if (!doc) return;

    const rows = list.map(function (g, index) {
      const refs = [Array.from(g.az).map(function (x) { return "AZ: " + x; }).join("\n"), Array.from(g.kn).map(function (x) { return "KdNr: " + x; }).join("\n")].filter(Boolean).join("\n") || "-";
      const ct = [g.address, g.person && ("Ansprechp.: " + g.person), g.phone, g.email].filter(Boolean).join("\n") || "-";
      return [String(index + 1), g.name, money(g.sum), refs, ct, Array.from(g.statuses).join(" / ") || "-", String(g.count)];
    });

    const opts = baseTableOptions();
    opts.head = [["Nr.", "Gläubiger", "Gesamtforderung", "Aktenzeichen / Kundennr.", "Anschrift / Kontakt", "Status", "Forderungen"]];
    opts.body = rows;
    opts.foot = [["", "SUMME", money(total), "", "", "", String(list.reduce(function (s, g) { return s + g.count; }, 0))]];
    opts.columnStyles = {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 52 },
      2: { cellWidth: 31, halign: "right" },
      3: { cellWidth: 52 },
      4: { cellWidth: 83 },
      5: { cellWidth: 31 },
      6: { cellWidth: 24, halign: "center" }
    };
    doc.autoTable(opts);
    addPages(doc, "Gläubigerverzeichnis");
    doc.save("glaeubigerverzeichnis.pdf");
    closeModal();
  }

  function exportCounseling() {
    const list = creditorGroups(false);
    if (!list.length) {
      alert("Keine Gläubiger vorhanden.");
      return;
    }
    const all = getDebts();
    const t = totals(all);
    const doc = makePdf("Gläubiger- und Forderungsübersicht", "Arbeitsunterlage für Schuldnerberatung / Insolvenzvorbereitung", [
      { label: "Gläubiger", value: String(list.length) },
      { label: "Forderungen", value: String(t.count) },
      { label: "Gesamtsumme", value: money(t.sum) },
      { label: "Offen", value: money(t.openSum) }
    ]);
    if (!doc) return;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.text("Hinweis: Diese Übersicht basiert ausschließlich auf den aktuell in der Schulden-App gespeicherten Daten. Fehlende Angaben sind mit '-' gekennzeichnet.", 12, 44);

    const rows = list.map(function (g, index) {
      const refs = [Array.from(g.az).map(function (x) { return "AZ: " + x; }).join("\n"), Array.from(g.kn).map(function (x) { return "KdNr: " + x; }).join("\n")].filter(Boolean).join("\n") || "-";
      const ct = [g.address, g.person && ("Ansprechp.: " + g.person), g.phone, g.email].filter(Boolean).join("\n") || "-";
      const reason = Array.from(g.reasons).join(" / ") || "-";
      return [String(index + 1), g.name, reason, money(g.sum), refs, ct, Array.from(g.statuses).join(" / ") || "-"];
    });

    const opts = baseTableOptions();
    opts.startY = 49;
    opts.head = [["Nr.", "Gläubiger", "Forderungsgrund", "Forderung", "Aktenzeichen / Kundennr.", "Anschrift / Kontakt", "Status"]];
    opts.body = rows;
    opts.foot = [["", "GESAMT", "", money(t.sum), "", "", ""]];
    opts.columnStyles = {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 47 },
      2: { cellWidth: 39 },
      3: { cellWidth: 29, halign: "right" },
      4: { cellWidth: 51 },
      5: { cellWidth: 82 },
      6: { cellWidth: 30 }
    };
    doc.autoTable(opts);
    addPages(doc, "Beratung / Insolvenz");
    doc.save("schuldnerberatung_insolvenz_uebersicht.pdf");
    closeModal();
  }

  function normalizeQuote(value) {
    let q = Number(String(value).replace(",", "."));
    if (!Number.isFinite(q)) q = 5;
    q = Math.max(0.1, Math.min(100, q));
    return Math.round(q * 100) / 100;
  }

  function exportComparison(quote) {
    const q = normalizeQuote(quote);
    localStorage.setItem(QUOTE_KEY, String(q));
    const list = creditorGroups(true);
    if (!list.length) {
      alert("Keine offenen Forderungen vorhanden.");
      return;
    }
    const total = list.reduce(function (s, g) { return s + g.sum; }, 0);
    const offerTotal = total * q / 100;
    const savingTotal = total - offerTotal;
    const doc = makePdf("Vergleichsübersicht", "Rechnerische Übersicht für Vergleichsverhandlungen - kein verbindliches Angebot", [
      { label: "Offene Gläubiger", value: String(list.length) },
      { label: "Offene Forderung", value: money(total) },
      { label: "Quote", value: String(q).replace(".", ",") + " %" },
      { label: "Vergleichssumme", value: money(offerTotal) }
    ]);
    if (!doc) return;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.text("Die Quote wird rechnerisch gleichmäßig auf alle offenen Forderungen angewendet. Vor Versand eines Angebots sollten Forderungshöhen und Gläubigerdaten geprüft werden.", 12, 44);

    const rows = list.map(function (g, index) {
      const offer = g.sum * q / 100;
      const saving = g.sum - offer;
      const refs = [Array.from(g.az).join(" / "), Array.from(g.kn).join(" / ")].filter(Boolean).join("\n") || "-";
      return [String(index + 1), g.name, money(g.sum), String(q).replace(".", ",") + " %", money(offer), money(saving), refs];
    });

    const opts = baseTableOptions();
    opts.startY = 49;
    opts.head = [["Nr.", "Gläubiger", "Forderung", "Quote", "Vergleichsbetrag", "Differenz / Erlass", "Aktenzeichen / Kundennr."]];
    opts.body = rows;
    opts.foot = [["", "GESAMT", money(total), "", money(offerTotal), money(savingTotal), ""]];
    opts.columnStyles = {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 62 },
      2: { cellWidth: 34, halign: "right" },
      3: { cellWidth: 22, halign: "center" },
      4: { cellWidth: 37, halign: "right" },
      5: { cellWidth: 40, halign: "right" },
      6: { cellWidth: 77 }
    };
    doc.autoTable(opts);
    addPages(doc, "Vergleichsübersicht");
    doc.save("vergleichsuebersicht_" + String(q).replace(".", "-") + "_prozent.pdf");
    closeModal();
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = "#" + OVERLAY_ID + "{position:fixed;inset:0;z-index:16000;background:rgba(2,6,18,.84);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:18px}" +
      ".pdfListsModal{width:min(900px,96vw);max-height:92vh;overflow:auto;background:#111a2b;color:#eef4ff;border:1px solid rgba(255,255,255,.12);border-radius:26px;padding:20px;box-shadow:0 30px 90px rgba(0,0,0,.55)}" +
      ".pdfListsHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:15px}.pdfListsHead h2{margin:0}.pdfListsHead p{color:#9fb0cc;margin:5px 0 0}.pdfListsHead button{min-width:42px;width:42px;height:42px;padding:0}" +
      ".pdfListsGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pdfListsCard{min-height:124px;text-align:left;padding:15px;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;background:rgba(255,255,255,.055)!important;border:1px solid rgba(255,255,255,.10)!important;color:#eef4ff!important;box-shadow:none!important}.pdfListsCard b{font-size:15px}.pdfListsCard span{margin-top:7px;color:#bcd0ef;font-size:12px;line-height:1.45}.pdfListsCard small{margin-top:8px;color:#8ea4c4}" +
      ".pdfCompareRow{display:flex;gap:8px;align-items:center;margin-top:10px;width:100%}.pdfCompareRow label{font-size:12px;color:#aebed8}.pdfCompareRow input{min-height:36px!important;height:36px!important;min-width:0!important;width:95px!important;flex:0 0 95px!important;padding:0 9px!important;border-radius:10px!important}" +
      ".pdfListsNote{margin-top:12px;color:#8ea4c4;font-size:12px;line-height:1.5}" +
      "#" + BUTTON_ID + "{cursor:pointer}" +
      "@media(max-width:720px){.pdfListsGrid{grid-template-columns:1fr}.pdfListsCard{min-height:0}}";
    document.head.appendChild(style);
  }

  function closeModal() {
    const old = document.getElementById(OVERLAY_ID);
    if (old) old.remove();
  }

  function openModal() {
    closeModal();
    ensureStyle();
    const all = getDebts();
    const open = all.filter(isOpen);
    const creditors = creditorGroups(false);
    const savedQuote = normalizeQuote(localStorage.getItem(QUOTE_KEY) || "5");
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = '<div class="pdfListsModal"><div class="pdfListsHead"><div><h2>PDF / Listen</h2><p>Unterlagen für Überblick, Schuldnerberatung, Insolvenz und Vergleich.</p></div><button type="button" data-close-pdf>×</button></div>' +
      '<div class="pdfListsGrid">' +
      '<button type="button" class="pdfListsCard" data-pdf-action="all"><b>Komplette Schuldenübersicht</b><span>Alle Forderungen mit Betrag, Referenzen, Frist, Status und Kontakt.</span><small>' + all.length + ' Forderungen</small></button>' +
      '<button type="button" class="pdfListsCard" data-pdf-action="creditors"><b>Gläubigerverzeichnis</b><span>Jeden Gläubiger einmal mit Gesamtforderung und Kontaktdaten.</span><small>' + creditors.length + ' Gläubiger</small></button>' +
      '<button type="button" class="pdfListsCard" data-pdf-action="counseling"><b>Schuldnerberatung / Insolvenz</b><span>Saubere nummerierte Arbeitsunterlage mit Gläubiger, Grund, Forderung, Referenzen und Kontakt.</span><small>Für Beratung und Unterlagen</small></button>' +
      '<button type="button" class="pdfListsCard" data-pdf-action="open"><b>Nur offene Forderungen</b><span>Nur Forderungen, die noch nicht als erledigt oder bezahlt markiert sind.</span><small>' + open.length + ' offene Forderungen</small></button>' +
      '<button type="button" class="pdfListsCard" data-pdf-action="comparison"><b>Vergleichsübersicht</b><span>Berechnet je Gläubiger Vergleichsbetrag und Differenz anhand einer gemeinsamen Quote.</span><div class="pdfCompareRow"><label for="pdfCompareQuoteV100">Quote</label><input id="pdfCompareQuoteV100" type="number" min="0.1" max="100" step="0.1" value="' + savedQuote + '"><label>%</label></div></button>' +
      '</div><div class="pdfListsNote">Die PDFs lesen nur deine vorhandenen App-Daten. Es werden keine Schuldendaten verändert.</div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay || event.target.closest("[data-close-pdf]")) {
        closeModal();
        return;
      }
      const action = event.target.closest("[data-pdf-action]");
      if (!action) return;
      if (event.target && event.target.id === "pdfCompareQuoteV100") return;
      const type = action.dataset.pdfAction;
      if (type === "all") exportDebts(false);
      if (type === "open") exportDebts(true);
      if (type === "creditors") exportCreditors();
      if (type === "counseling") exportCounseling();
      if (type === "comparison") {
        const input = document.getElementById("pdfCompareQuoteV100");
        exportComparison(input ? input.value : savedQuote);
      }
    });
  }

  function findLeaf(text) {
    return Array.from(document.querySelectorAll("body *")).find(function (el) {
      return el.children.length === 0 && clean(el.textContent) === text;
    }) || null;
  }

  function installButton() {
    if (document.getElementById(BUTTON_ID)) return true;

    const paperLeaf = findLeaf("Papierkorb");
    const settingsLeaf = findLeaf("Einstellungen");
    const anchor = paperLeaf ? (paperLeaf.closest("a,button,[role='button']") || paperLeaf.parentElement) : null;
    const settings = settingsLeaf ? (settingsLeaf.closest("a,button,[role='button']") || settingsLeaf.parentElement) : null;
    const template = anchor || settings;

    if (template && template.parentElement) {
      const button = template.cloneNode(true);
      button.id = BUTTON_ID;
      button.removeAttribute("href");
      button.removeAttribute("onclick");
      button.querySelectorAll("[id]").forEach(function (el) { el.removeAttribute("id"); });
      button.textContent = "🧾  PDF / Listen";
      button.style.cursor = "pointer";
      button.setAttribute("role", "button");
      button.setAttribute("tabindex", "0");
      if (anchor) anchor.insertAdjacentElement("afterend", button);
      else settings.insertAdjacentElement("beforebegin", button);
      button.addEventListener("click", function (event) { event.preventDefault(); event.stopPropagation(); openModal(); });
      button.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openModal();
        }
      });
      return true;
    }

    const fallback = document.createElement("button");
    fallback.id = BUTTON_ID;
    fallback.type = "button";
    fallback.textContent = "🧾 PDF / Listen";
    fallback.style.cssText = "position:fixed;left:18px;bottom:120px;z-index:12000;min-height:44px;padding:0 14px;border-radius:14px;font-weight:800";
    fallback.addEventListener("click", openModal);
    document.body.appendChild(fallback);
    return false;
  }

  function boot() {
    ensureStyle();
    installButton();
    let tries = 0;
    const timer = setInterval(function () {
      if (installButton() || ++tries > 20) clearInterval(timer);
    }, 500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
