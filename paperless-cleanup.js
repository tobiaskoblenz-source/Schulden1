(function(){
  'use strict';

  function $(id){ return document.getElementById(id); }

  function ensureStyle(){
    if($('paperlessCleanupStyle')) return;
    const st=document.createElement('style');
    st.id='paperlessCleanupStyle';
    st.textContent=`
      .paperlessModal{width:min(860px,96vw)!important;padding:22px!important;}
      .paperlessHead{margin-bottom:18px!important;}
      .paperlessHead h3{font-size:26px!important;letter-spacing:-.02em;}
      .paperlessHead p{font-size:13px!important;max-width:620px;line-height:1.45;}
      .paperlessGrid{display:block!important;margin-bottom:12px!important;}
      .paperlessBox{margin-bottom:12px!important;padding:14px!important;border-radius:18px!important;}
      .paperlessBox h4{font-size:14px!important;margin-bottom:8px!important;}
      .plCompactSettings{margin-bottom:12px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.035);overflow:hidden;}
      .plCompactSettings>summary,.plAdvancedTools>summary{list-style:none;cursor:pointer;padding:12px 14px;font-weight:900;color:#dce9ff;display:flex;align-items:center;gap:8px;user-select:none;}
      .plCompactSettings>summary::-webkit-details-marker,.plAdvancedTools>summary::-webkit-details-marker{display:none;}
      .plCompactSettings>summary:after,.plAdvancedTools>summary:after{content:'›';margin-left:auto;font-size:20px;color:#8194b3;transition:transform .15s ease;}
      .plCompactSettings[open]>summary:after,.plAdvancedTools[open]>summary:after{transform:rotate(90deg);}
      .plCompactSettingsBody{padding:0 12px 12px;}
      .plAdvancedTools{margin-top:10px;border-top:1px solid rgba(255,255,255,.07);}
      .plAdvancedTools>summary{padding:10px 4px 4px;color:#91a5c5;font-size:12px;}
      .plAdvancedButtons{display:flex;flex-wrap:wrap;gap:7px;padding:7px 0 2px;}
      .plAdvancedButtons button{min-height:34px!important;padding:0 10px!important;font-size:11px!important;background:rgba(255,255,255,.055)!important;color:#b9c9e2!important;box-shadow:none!important;}
      .paperlessSearchLine.plSimpleSearch{display:grid!important;grid-template-columns:minmax(0,1fr) auto auto!important;gap:8px!important;margin:8px 0 0!important;}
      .paperlessSearchLine.plSimpleSearch input{min-width:0!important;}
      .paperlessSearchLine.plSimpleSearch button{white-space:nowrap;}
      #paperlessSearch{background:linear-gradient(135deg,#4f8cff,#7c71ff)!important;color:#fff!important;}
      #paperlessAutoSearch{background:rgba(79,140,255,.14)!important;color:#dce9ff!important;border:1px solid rgba(79,140,255,.26)!important;}
      .paperlessResultList{margin-top:10px!important;gap:8px!important;}
      .paperlessResultItem{padding:11px 12px!important;border-radius:15px!important;}
      .paperlessResultActions{gap:6px!important;}
      .paperlessResultActions button,.paperlessResultActions a{min-height:32px!important;padding:0 9px!important;font-size:11px!important;}
      .paperlessLinkedHint,.paperlessHint{line-height:1.45;}
      .plCurrentDebtBox{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;}
      .plCurrentDebtBox h4{margin:0!important;}
      .plCurrentDebtBox .paperlessHint{margin:0!important;text-align:right;}
      .plHideMain{display:none!important;}
      @media(max-width:700px){
        .paperlessModal{padding:15px!important;border-radius:22px!important;}
        .paperlessSearchLine.plSimpleSearch{grid-template-columns:1fr 1fr!important;}
        .paperlessSearchLine.plSimpleSearch input{grid-column:1/-1;}
        .plCurrentDebtBox{grid-template-columns:1fr;}
        .plCurrentDebtBox .paperlessHint{text-align:left;}
      }
    `;
    document.head.appendChild(st);
  }

  function moveButton(id,target,label){
    const btn=$(id);
    if(!btn || !target) return;
    if(label) btn.textContent=label;
    target.appendChild(btn);
  }

  function simplifyModal(){
    const modal=document.querySelector('.paperlessModal');
    if(!modal || modal.dataset.cleanupDone==='1') return;
    modal.dataset.cleanupDone='1';
    ensureStyle();

    const title=$('paperlessTitle');
    const sub=$('paperlessSub');
    if(title) title.textContent='Paperless';
    if(sub) sub.textContent='Dokumente zur ausgewählten Schuld suchen, öffnen, verknüpfen oder Daten übernehmen.';

    const boxes=[...modal.querySelectorAll('.paperlessBox')];
    const connectionBox=boxes.find(b=>b.querySelector('#paperlessUrl'));
    const currentBox=boxes.find(b=>b.querySelector('#paperlessDebtInfo'));
    const searchBox=boxes.find(b=>b.querySelector('#paperlessQuery'));

    if(connectionBox && !connectionBox.querySelector('.plCompactSettings')){
      const heading=connectionBox.querySelector('h4');
      if(heading) heading.remove();
      const form=connectionBox.querySelector('.paperlessForm');
      const details=document.createElement('details');
      details.className='plCompactSettings';
      details.innerHTML='<summary>⚙️ Verbindung & Einstellungen</summary><div class="plCompactSettingsBody"></div>';
      connectionBox.replaceWith(details);
      const body=details.querySelector('.plCompactSettingsBody');
      if(form) body.appendChild(form);

      const row=body.querySelector('.paperlessBtnRow');
      if(row){
        const save=$('paperlessSaveSettings');
        const test=$('paperlessTest');
        if(save) save.textContent='Speichern';
        if(test) test.textContent='Verbindung testen';

        const advanced=document.createElement('details');
        advanced.className='plAdvancedTools';
        advanced.innerHTML='<summary>Erweiterte Werkzeuge</summary><div class="plAdvancedButtons"></div>';
        body.appendChild(advanced);
        const adv=advanced.querySelector('.plAdvancedButtons');
        moveButton('paperlessLoadTags',adv,'Tags anzeigen');
        moveButton('paperlessDebug',adv,'Diagnose');
        moveButton('paperlessRawDebug',adv,'Roh-Test');
      }
    }

    if(currentBox){
      currentBox.classList.add('plCurrentDebtBox');
      const h=currentBox.querySelector('h4');
      if(h) h.textContent='Aktuelle Schuld';
    }

    if(searchBox){
      const h=searchBox.querySelector('h4');
      if(h) h.textContent='Dokumente suchen';
      const line=searchBox.querySelector('.paperlessSearchLine');
      if(line){
        line.classList.add('plSimpleSearch');
        const q=$('paperlessQuery');
        if(q) q.placeholder='Gläubiger, Aktenzeichen oder Suchbegriff';
        const search=$('paperlessSearch');
        if(search) search.textContent='🔍 Suchen';
        const auto=$('paperlessAutoSearch');
        if(auto) auto.textContent='✨ Akte suchen';

        const advanced=document.createElement('details');
        advanced.className='plAdvancedTools';
        advanced.innerHTML='<summary>Weitere Suchoptionen</summary><div class="plAdvancedButtons"></div>';
        searchBox.insertBefore(advanced,$('paperlessResults'));
        const adv=advanced.querySelector('.plAdvancedButtons');
        moveButton('paperlessAutoQuery',adv,'Suchtext aus Akte');
        moveButton('paperlessOnlyTag',adv,'Nur Tag');
        moveButton('paperlessAllDocs',adv,'Alle Dokumente');
        moveButton('paperlessTextApp',adv,'Volltext „App“');
      }
    }

    const linked=modal.querySelector('.paperlessModalLinkedBox h4');
    if(linked) linked.textContent='📎 Verknüpfte Dokumente';
  }

  function watch(){
    simplifyModal();
    const obs=new MutationObserver(()=>simplifyModal());
    obs.observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener('click',()=>setTimeout(simplifyModal,20),true);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',watch,{once:true});
  else watch();
})();
