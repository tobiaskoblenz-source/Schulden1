(function () {
  "use strict";

  const BUTTON_ID = "pdfListsMenuV100";
  const OVERLAY_ID = "pdfListsOverlayV100";
  const CREDITOR_KEY = "schulden_creditors_v37";

  function getDebts() {
    try {
      if (typeof debts !== "undefined" && Array.isArray(debts)) return debts;
    } catch (e) {}
    if (Array.isArray(window.debts)) return window.debts;
    return [];
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

  function money(value) {
    return (Number(value) || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " EUR";
  }

  function formatDate(value) {
    const s = clean(value);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[3] + "." + m[2] + "." + m[1] : (s || "-");
  }

  function isOpen(debt) {
    return !["bezahlt", "erledigt", "paid", "closed", "abgeschlossen"].includes(norm(debt && debt.status));
  }

  function findCreditor(debt, creditors) {
    return creditors.find(function (c) {
      if (!c) return false;
      if (debt && debt.creditorId && c.id === debt.creditorId) return true;
      if (c.name && debt && debt.name && norm(c.name) === norm(debt.name)) return true;
      return false;
    }) || null;
  }

  function contact(debt, creditor) {
    const d = debt && debt.contactDetails && typeof debt.contactDetails === "object" ? debt.contactDetails : {};
    const c = creditor || {};
    return {
      address: clean(d.address || d.anschrift || c.address),
      person: clean(d.representative || d.name || debt.contactPerson || c.representative || c.contactPerson),
      phone: clean(d.phone || d.telefon || c.phone),
      email: clean(d.email || d.mail || c.email)
    };
  }

  function getPdf() {
    const J = window.jspdf && window.jspdf.jsPDF;
    if (!J) {
      alert("PDF-Bibliothek ist nicht geladen.");
      return null;
    }
    return J;
  }

  function addHeader(doc, title, count, total) {
    doc.setFontSize(18);
    doc.text(title, 12, 14);
    doc.setFontSize(9);
    doc.text("Einträge: " + count + "    Gesamtsumme: " + money(total), 12, 22);
    doc.text("Stand: " + new Date().toLocaleString("de-DE"), 12, 28);
  }

  function addPages(doc) {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text("Seite " + i + " / " + pages, doc.internal.pageSize.getWidth() - 12, doc.internal.pageSize.getHeight() - 7, { align: "right" });
    }
  }

  function exportDebts(openOnly) {
    const J = getPdf();
    if (!J) return;
    const creditors = getCreditors();
    const list = getDebts().filter(function (d) { return !openOnly || isOpen(d); });
    if (!list.length) {
      alert("Keine passenden Schulden vorhanden.");
      return;
    }

    const total = list.reduce(function (sum, d) { return sum + (Number(d.betrag) || 0); }, 0);
    const doc = new J({ orientation: "landscape", unit: "mm", format: "a4" });
    addHeader(doc, openOnly ? "Offene Schulden" : "Komplette Schuldenübersicht", list.length, total);

    const rows = list.map(function (d) {
      const c = findCreditor(d, creditors);
      const ct = contact(d, c);
      const az = clean(d.aktenzeichen || d.caseNumber || (c && c.aktenzeichen));
      const kn = clean(d.kundennummer || d.customerNumber || d.customerId);
      return [
        clean(d.name) || "-",
        clean(d.grund) || "-",
        money(d.betrag),
        az || "-",
        kn || "-",
        formatDate(d.datum),
        clean(d.status) || "Offen",
        ct.address || "-",
        ct.person || "-",
        [ct.phone, ct.email].filter(Boolean).join(" / ") || "-"
      ];
    });

    doc.autoTable({
      head: [["Gläubiger", "Grund", "Betrag", "Aktenzeichen", "Kundennr.", "Frist", "Status", "Anschrift", "Ansprechpartner", "Telefon / E-Mail"]],
      body: rows,
      startY: 34,
      margin: { left: 7, right: 7, bottom: 13 },
      styles: { fontSize: 6.2, cellPadding: 1.4, valign: "top", overflow: "linebreak" }
    });

    addPages(doc);
    doc.save(openOnly ? "offene_schulden.pdf" : "schulden_komplettuebersicht.pdf");
    closeModal();
  }

  function creditorGroups() {
    const saved = getCreditors();
    const map = new Map();

    function ensure(name) {
      const key = norm(name || "Unbekannt");
      if (!map.has(key)) {
        map.set(key, { name: clean(name) || "Unbekannt", sum: 0, az: new Set(), kn: new Set(), address: "", person: "", phone: "", email: "", count: 0 });
      }
      return map.get(key);
    }

    saved.forEach(function (c) {
      const g = ensure(c.name);
      g.address = clean(c.address) || g.address;
      g.person = clean(c.representative || c.contactPerson) || g.person;
      g.phone = clean(c.phone) || g.phone;
      g.email = clean(c.email) || g.email;
      if (c.aktenzeichen) g.az.add(clean(c.aktenzeichen));
    });

    getDebts().forEach(function (d) {
      const c = findCreditor(d, saved);
      const g = ensure(d.name || (c && c.name));
      const ct = contact(d, c);
      g.sum += Number(d.betrag) || 0;
      g.count += 1;
      g.address = ct.address || g.address;
      g.person = ct.person || g.person;
      g.phone = ct.phone || g.phone;
      g.email = ct.email || g.email;
      const az = clean(d.aktenzeichen || d.caseNumber || (c && c.aktenzeichen));
      const kn = clean(d.kundennummer || d.customerNumber || d.customerId);
      if (az) g.az.add(az);
      if (kn) g.kn.add(kn);
    });

    return Array.from(map.values()).sort(function (a, b) { return a.name.localeCompare(b.name, "de"); });
  }

  function exportCreditors() {
    const J = getPdf();
    if (!J) return;
    const list = creditorGroups();
    if (!list.length) {
      alert("Keine Gläubiger vorhanden.");
      return;
    }

    const total = list.reduce(function (sum, g) { return sum + g.sum; }, 0);
    const doc = new J({ orientation: "landscape", unit: "mm", format: "a4" });
    addHeader(doc, "Gläubigerliste", list.length, total);

    const rows = list.map(function (g) {
      return [
        g.name,
        money(g.sum),
        Array.from(g.az).join(" / ") || "-",
        Array.from(g.kn).join(" / ") || "-",
        g.address || "-",
        g.person || "-",
        [g.phone, g.email].filter(Boolean).join(" / ") || "-",
        String(g.count || 0)
      ];
    });

    doc.autoTable({
      head: [["Gläubiger", "Gesamtforderung", "Aktenzeichen", "Kundennummer", "Anschrift", "Ansprechpartner", "Telefon / E-Mail", "Anzahl"]],
      body: rows,
      startY: 34,
      margin: { left: 7, right: 7, bottom: 13 },
      styles: { fontSize: 6.5, cellPadding: 1.5, valign: "top", overflow: "linebreak" }
    });

    addPages(doc);
    doc.save("glaeubigerliste.pdf");
    closeModal();
  }

  function closeModal() {
    const old = document.getElementById(OVERLAY_ID);
    if (old) old.remove();
  }

  function openModal() {
    closeModal();
    const all = getDebts();
    const open = all.filter(isOpen);
    const creditors = creditorGroups();
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = "position:fixed;inset:0;z-index:16000;background:rgba(2,6,18,.82);display:flex;align-items:center;justify-content:center;padding:18px";
    overlay.innerHTML = `<div style="width:min(780px,96vw);background:#111a2b;color:#eef4ff;border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:20px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><h2 style="margin:0">PDF / Listen</h2><p style="color:#9fb0cc">Welche Liste möchtest du erstellen?</p></div><button type="button" data-close-pdf style="min-width:42px;height:42px">×</button></div><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px"><button type="button" data-pdf-action="all" style="min-height:120px">Komplettübersicht<br><small>${all.length} Forderungen</small></button><button type="button" data-pdf-action="creditors" style="min-height:120px">Gläubigerliste<br><small>${creditors.length} Gläubiger</small></button><button type="button" data-pdf-action="open" style="min-height:120px">Nur offene Schulden<br><small>${open.length} Forderungen</small></button></div></div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay || event.target.closest("[data-close-pdf]")) {
        closeModal();
        return;
      }
      const action = event.target.closest("[data-pdf-action]");
      if (!action) return;
      if (action.dataset.pdfAction === "all") exportDebts(false);
      if (action.dataset.pdfAction === "open") exportDebts(true);
      if (action.dataset.pdfAction === "creditors") exportCreditors();
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
      button.addEventListener("keydown", function (event) { if (event.key === "Enter" || event.key === " ") openModal(); });
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
    installButton();
    let tries = 0;
    const timer = setInterval(function () {
      if (installButton() || ++tries > 20) clearInterval(timer);
    }, 500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
