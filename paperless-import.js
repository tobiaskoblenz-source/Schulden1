(function(){
  'use strict';

  const SETTINGS_KEY = 'schulden_paperless_settings_v79';
  let selectedIndex = 0;
  let serverConfig = {paperlessConfigured:false, paperlessUrl:'', paperlessTag:'App'};

  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c])); }
  function toast(msg){ try{ if(typeof showToast === 'function') return showToast(msg); }catch(e){} alert(msg); }
  function getDebts(){ try{ return Array.isArray(debts) ? debts : []; }catch(e){ return []; } }
  function currentDebt(){ return getDebts()[selectedIndex] || null; }
  function settings(){ try{ return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); }catch(e){ return {}; } }
  function headers(){
    const st = settings();
    const h = {'Accept':'application/json'};
    if(!serverConfig.paperlessConfigured){
      if(st.url) h['x-paperless-url'] = String(st.url).trim().replace(/\/+$/,'');
      if(st.token) h['x-paperless-token'] = String(st.token).trim();
    }
    if(st.insecureTls) h['x-paperless-insecure-tls'] = 'true';
    h['x-paperless-tag'] = String(st.tag || serverConfig.paperlessTag || 'App').trim() || 'App';
    return h;
  }

  async function loadConfig(){
    try{
      const r = await fetch('/api/config',{cache:'no-store'});
      if(r.ok) serverConfig = {...serverConfig, ...(await r.json())};
    }catch(e){}
  }

  function normalizeName(v){
    return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');
  }

  function fieldByAliases(fields, aliases){
    const wanted = aliases.map(normalizeName);
    return (fields || []).find(f => wanted.includes(normalizeName(f.name))) || null;
  }

  function parseMoney(value){
    if(typeof value === 'number' && Number.isFinite(value)) return value;
    if(value && typeof value === 'object'){
      if(Number.isFinite(Number(value.amount))) return Number(value.amount);
      if('value' in value) return parseMoney(value.value);
    }
    let s = String(value ?? '').trim();
    if(!s) return null;
    s = s.replace(/[^0-9,.-]/g,'');
    if(!s) return null;
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if(lastComma >= 0 && lastDot >= 0){
      if(lastComma > lastDot) s = s.replace(/\./g,'').replace(',','.');
      else s = s.replace(/,/g,'');
    }else if(lastComma >= 0){
      s = s.replace(/\./g,'').replace(',','.');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeDate(value){
    const s = String(value ?? '').trim();
    if(!s) return '';
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if(m) return `${m[1]}-${m[2]}-${m[3]}`;
    return s;
  }

  function formatMoney(v){
    const n = Number(v);
    if(!Number.isFinite(n)) return String(v ?? '–');
    return n.toLocaleString('de-DE',{style:'currency',currency:'EUR'});
  }

  function buildImportCandidates(payload){
    const d = currentDebt();
    const fields = Array.isArray(payload.customFields) ? payload.customFields : [];
    const out = [];

    const az = fieldByAliases(fields,['Aktenzeichen','Akten-Zeichen','Vorgangsnummer','Vorgangs-Nr','Referenznummer']);
    const kn = fieldByAliases(fields,['Kundennummer','Kunden-Nr','Kundennr','Kunden Nummer']);
    const amount = fieldByAliases(fields,['Forderungsbetrag','Forderung','Gesamtforderung']);
    const due = fieldByAliases(fields,['Frist','Zahlungsfrist','Fälligkeitsdatum','Faelligkeitsdatum','Fällig am','Faellig am']);
    const status = fieldByAliases(fields,['Status']);

    if(az && az.value !== null && az.value !== '') out.push({key:'aktenzeichen',label:'Aktenzeichen',current:d?.aktenzeichen || d?.caseNumber || '',value:String(az.displayValue ?? az.value),checked:true});
    if(kn && kn.value !== null && kn.value !== '') out.push({key:'kundennummer',label:'Kundennummer',current:d?.kundennummer || d?.customerNumber || d?.customerId || '',value:String(kn.displayValue ?? kn.value),checked:true});
    if(amount && amount.value !== null && amount.value !== ''){
      const n = parseMoney(amount.value);
      if(n !== null) out.push({key:'betrag',label:'Forderungsbetrag',current:Number(d?.betrag)||0,value:n,checked:true,money:true});
    }
    if(due && due.value !== null && due.value !== '') out.push({key:'datum',label:'Frist / Fällig am',current:d?.datum || '',value:normalizeDate(due.value),checked:true});
    if(status && status.value !== null && status.value !== '') out.push({key:'paperlessStatus',label:'Paperless-Status',current:d?.paperlessStatus || '',value:String(status.displayValue ?? status.value),checked:false,infoOnly:true});

    if(payload.correspondentName){
      out.push({key:'name',label:'Gläubiger / Korrespondent',current:d?.name || '',value:String(payload.correspondentName),checked:!String(d?.name||'').trim()});
    }
    if(payload.documentTypeName){
      out.push({key:'grund',label:'Grund / Dokumenttyp',current:d?.grund || '',value:String(payload.documentTypeName),checked:!String(d?.grund||'').trim()});
    }
    return out;
  }

  function ensureLinkedDocument(d, payload){
    if(!d) return;
    if(!Array.isArray(d.paperlessLinks)) d.paperlessLinks = [];
    const id = String(payload.id || '');
    if(!id) return;
    if(!d.paperlessLinks.some(x => String(x.id) === id)){
      d.paperlessLinks.push({
        id,
        title:String(payload.title || ('Dokument #'+id)),
        meta:[payload.created,payload.correspondentName,payload.documentTypeName].filter(Boolean).join(' · ') || 'Paperless',
        linkedAt:new Date().toISOString()
      });
    }
  }

  function ensureStyle(){
    if($('paperlessImportStyle')) return;
    const st = document.createElement('style');
    st.id = 'paperlessImportStyle';
    st.textContent = `
      .plImportBtn{min-height:34px!important;border-radius:11px!important;padding:0 10px!important;font-size:12px!important;font-weight:900!important;border:1px solid rgba(77,210,151,.34)!important;background:rgba(48,211,126,.14)!important;color:#caffdf!important;}
      .plImportOverlay{position:fixed;inset:0;z-index:12050;background:rgba(2,6,18,.78);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:18px;}
      .plImportModal{width:min(760px,96vw);max-height:90vh;overflow:auto;background:#111a2b;color:#eaf2ff;border:1px solid rgba(255,255,255,.12);border-radius:26px;box-shadow:0 30px 90px rgba(0,0,0,.55);padding:20px;}
      .plImportHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}.plImportHead h3{margin:0;font-size:22px}.plImportHead p{margin:5px 0 0;color:#9fb0cc;font-size:13px}.plImportClose{width:42px;height:42px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#fff;font-size:24px;cursor:pointer}
      .plImportList{display:grid;gap:9px}.plImportRow{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;padding:12px;border-radius:17px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}.plImportRow input{width:18px;height:18px;margin:3px 0 0}.plImportRow strong{display:block;font-size:14px}.plImportCompare{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;margin-top:6px;font-size:12px}.plImportOld,.plImportNew{padding:8px;border-radius:10px;background:rgba(255,255,255,.045);overflow-wrap:anywhere}.plImportOld{color:#9fb0cc}.plImportNew{color:#caffdf}.plImportArrow{color:#6f85a8}.plImportActions{display:flex;justify-content:flex-end;gap:9px;margin-top:16px;flex-wrap:wrap}.plImportActions button{min-height:42px;border-radius:13px;padding:0 15px;font-weight:900}.plImportSecondary{background:rgba(255,255,255,.07)!important;color:#eaf2ff!important;border:1px solid rgba(255,255,255,.12)!important}.plImportEmpty{padding:14px;border-radius:14px;background:rgba(255,255,255,.04);color:#b8c8e6;line-height:1.5}.plImportRaw{margin-top:12px;padding:12px;border-radius:14px;background:rgba(255,255,255,.035);color:#9fb0cc;font-size:12px;line-height:1.5}.plImportRaw b{color:#dbe8ff}
      @media(max-width:620px){.plImportCompare{grid-template-columns:1fr}.plImportArrow{display:none}}
    `;
    document.head.appendChild(st);
  }

  function closeImport(){ $('plImportOverlay')?.remove(); document.body.classList.remove('modalOpen'); }

  function showImportModal(payload){
    ensureStyle();
    $('plImportOverlay')?.remove();
    const d = currentDebt();
    if(!d){ toast('Keine Schuld ausgewählt.'); return; }
    const candidates = buildImportCandidates(payload);
    const overlay = document.createElement('div');
    overlay.id = 'plImportOverlay';
    overlay.className = 'plImportOverlay';
    const rawFields = (payload.customFields || []).map(f => `<div><b>${esc(f.name || ('Feld #'+f.id))}:</b> ${esc(f.displayValue ?? f.value ?? '–')}</div>`).join('');
    const rows = candidates.map((c,i)=>{
      const oldVal = c.money ? formatMoney(c.current) : String(c.current || '–');
      const newVal = c.money ? formatMoney(c.value) : String(c.value || '–');
      return `<label class="plImportRow"><input type="checkbox" data-pl-import-check="${i}" ${c.checked?'checked':''}><span><strong>${esc(c.label)}${c.infoOnly?' · nur als Zusatzinfo':''}</strong><span class="plImportCompare"><span class="plImportOld">Bisher: ${esc(oldVal)}</span><span class="plImportArrow">→</span><span class="plImportNew">Neu: ${esc(newVal)}</span></span></span></label>`;
    }).join('');
    overlay.innerHTML = `<div class="plImportModal" role="dialog" aria-modal="true"><div class="plImportHead"><div><h3>Daten aus Paperless übernehmen</h3><p>${esc(payload.title || ('Dokument #'+payload.id))}</p></div><button type="button" class="plImportClose" data-pl-import-close>×</button></div>${rows ? `<div class="plImportList">${rows}</div>` : '<div class="plImportEmpty">In diesem Dokument wurden keine direkt zuordenbaren Felder gefunden. Unten siehst du die vorhandenen Paperless-Zusatzfelder.</div>'}<div class="plImportRaw"><b>Paperless-Felder:</b>${rawFields || '<div>Keine Zusatzfelder am Dokument.</div>'}</div><div class="plImportActions"><button type="button" class="plImportSecondary" data-pl-import-close>Abbrechen</button><button type="button" data-pl-import-apply ${candidates.length?'':'disabled'}>Ausgewählte übernehmen</button></div></div>`;
    document.body.appendChild(overlay);
    document.body.classList.add('modalOpen');
    overlay.addEventListener('click', e=>{ if(e.target === overlay || e.target.closest('[data-pl-import-close]')) closeImport(); });
    overlay.querySelector('[data-pl-import-apply]')?.addEventListener('click', ()=>{
      const debt = currentDebt();
      if(!debt) return;
      candidates.forEach((c,i)=>{
        const checked = overlay.querySelector(`[data-pl-import-check="${i}"]`)?.checked;
        if(!checked) return;
        if(c.key === 'betrag') debt.betrag = Number(c.value) || 0;
        else debt[c.key] = c.value;
        if(c.key === 'kundennummer') debt.customerNumber = c.value;
      });
      ensureLinkedDocument(debt,payload);
      try{ if(typeof save === 'function') save(); }catch(e){}
      try{ if(typeof render === 'function') render(); }catch(e){}
      closeImport();
      toast('Paperless-Daten übernommen ✅');
      setTimeout(()=>{ try{ if(typeof window.showInfo === 'function') window.showInfo(selectedIndex); }catch(e){} },80);
    });
  }

  async function importDocument(id){
    if(!/^\d+$/.test(String(id || ''))){ toast('Ungültige Paperless-Dokument-ID.'); return; }
    try{
      const res = await fetch('/api/paperless/document-data/'+encodeURIComponent(id),{headers:headers(),cache:'no-store'});
      const data = await res.json().catch(()=>({ok:false,error:'Keine JSON-Antwort'}));
      if(!res.ok || data.ok === false) throw new Error(data.error || data.hint || ('HTTP '+res.status));
      showImportModal(data.document || data.data || data);
    }catch(err){
      toast('Paperless-Daten konnten nicht geladen werden: '+(err.message || err));
    }
  }

  function enhanceButtons(root=document){
    root.querySelectorAll?.('.paperlessResultActions, .paperlessDocActions').forEach(box=>{
      if(box.querySelector('[data-pl-import]')) return;
      const idSource = box.querySelector('[data-pl-link], [data-pl-open]');
      const id = idSource?.getAttribute('data-pl-link') || idSource?.getAttribute('data-pl-open');
      if(!id) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'plImportBtn';
      btn.setAttribute('data-pl-import',id);
      btn.textContent = '📥 Daten übernehmen';
      box.appendChild(btn);
    });
  }

  function hookSelection(){
    const prevInfo = window.showInfo;
    if(typeof prevInfo === 'function' && !prevInfo.__paperlessImportHook){
      const wrapped = function(i){ if(Number.isInteger(Number(i))) selectedIndex = Number(i); return prevInfo.apply(this,arguments); };
      wrapped.__paperlessImportHook = true;
      window.showInfo = wrapped;
    }
    const prevCorr = window.showCorrespondence;
    if(typeof prevCorr === 'function' && !prevCorr.__paperlessImportHook){
      const wrapped = function(i){ if(Number.isInteger(Number(i))) selectedIndex = Number(i); return prevCorr.apply(this,arguments); };
      wrapped.__paperlessImportHook = true;
      window.showCorrespondence = wrapped;
    }
  }

  document.addEventListener('click', e=>{
    const btn = e.target.closest('[data-pl-import]');
    if(!btn) return;
    e.preventDefault();
    e.stopPropagation();
    importDocument(btn.getAttribute('data-pl-import'));
  },true);

  const observer = new MutationObserver(m=>{
    for(const item of m){
      for(const n of item.addedNodes){ if(n.nodeType === 1) enhanceButtons(n); }
    }
  });

  async function init(){
    await loadConfig();
    hookSelection();
    enhanceButtons(document);
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setInterval(()=>{ hookSelection(); enhanceButtons(document); },1200);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
