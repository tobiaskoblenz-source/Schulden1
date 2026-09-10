(function(){
'use strict';

const PANEL_ID='n8nInboxSection';
const CONTENT_ID='n8nInboxContent';
let currentItems=[];

const safe=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));

function ensureStyles(){
  if(document.getElementById('n8nInboxStyles'))return;
  const style=document.createElement('style');
  style.id='n8nInboxStyles';
  style.textContent=`
    #${PANEL_ID}{margin-top:14px}
    .n8nInboxHeadRight{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .n8nInboxBadge{display:inline-flex;align-items:center;justify-content:center;min-width:32px;padding:5px 9px;border-radius:999px;background:rgba(43,213,118,.12);border:1px solid rgba(43,213,118,.28);font-size:12px;font-weight:800}
    .n8nInboxList{display:grid;gap:9px}
    .n8nInboxItem{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,390px);gap:14px;align-items:center;padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.025)}
    .n8nInboxTitle{font-weight:800;line-height:1.3;overflow-wrap:anywhere}
    .n8nInboxMeta{display:flex;gap:7px;flex-wrap:wrap;margin-top:5px;color:var(--muted,#8ea0b7);font-size:11px}
    .n8nInboxActions{display:flex;gap:8px;align-items:center}
    .n8nInboxActions select{min-width:0;flex:1}
    .n8nInboxEmpty{padding:18px;text-align:center;color:var(--muted,#8ea0b7)}
    @media(max-width:820px){
      .n8nInboxItem{grid-template-columns:1fr}
      .n8nInboxActions{align-items:stretch;flex-direction:column}
      .n8nInboxActions .btn{width:100%}
    }
  `;
  document.head.appendChild(style);
}

function ensurePanel(){
  ensureStyles();
  const page=document.getElementById('page-documents');
  if(!page)return null;
  let section=document.getElementById(PANEL_ID);
  if(section)return section;
  section=document.createElement('div');
  section.id=PANEL_ID;
  section.className='section glass';
  section.innerHTML=`
    <div class="sectionHead">
      <div>
        <h3>Automatischer Dokument-Eingang</h3>
        <p>Von n8n aus Paperless übernommen und noch keiner Schuld-Akte zugeordnet.</p>
      </div>
      <div class="n8nInboxHeadRight">
        <span class="n8nInboxBadge" id="n8nInboxBadge">–</span>
        <button class="btn" id="n8nInboxRefresh" type="button">Aktualisieren</button>
      </div>
    </div>
    <div id="${CONTENT_ID}" class="n8nInboxList"><div class="n8nInboxEmpty">Eingang wird geladen…</div></div>
  `;
  const stats=page.querySelector('.stats');
  if(stats)stats.insertAdjacentElement('afterend',section);
  else page.prepend(section);
  document.getElementById('n8nInboxRefresh')?.addEventListener('click',()=>loadInbox(true));
  return section;
}

function linkedIds(){
  const ids=new Set();
  try{
    for(const debt of state.debts||[]){
      for(const link of Array.isArray(debt.paperlessLinks)?debt.paperlessLinks:[]){
        if(link && link.id!=null)ids.add(String(link.id));
      }
    }
  }catch(_){}
  return ids;
}

function debtOptions(){
  let html='<option value="">Gläubiger / Schuld auswählen…</option>';
  try{
    html+=(state.debts||[]).map((debt,index)=>{
      const label=[nameOf(debt),caseOf(debt)].filter(x=>x&&x!=='–').join(' · ');
      return `<option value="${index}">${safe(label||('Schuld '+(index+1)))}</option>`;
    }).join('');
  }catch(_){}
  return html;
}

function dateText(value){
  if(!value)return '';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('de-DE');
}

function settingRow(label){
  return [...document.querySelectorAll('.settingRow')].find(row=>{
    const strong=row.querySelector('.left strong');
    return strong && strong.textContent.trim()===label;
  })||null;
}

function updateSettings(ok,total,pending){
  const row=settingRow('n8n Automatisierung');
  if(row){
    const text=row.querySelector('.left span');
    const dot=row.querySelector('.statusDot');
    if(text)text.textContent=ok?`Aktiv · ${pending} noch nicht zugeordnet · ${total} im Eingang`:'Status nicht erreichbar';
    if(dot){
      dot.textContent=ok?'aktiv':'prüfen';
      dot.classList.toggle('ok',!!ok);
      dot.classList.toggle('warn',!ok);
    }
  }
  const auto=settingRow('Dokumente automatisch zuordnen');
  if(auto){
    const text=auto.querySelector('.left span');
    if(text)text.textContent=ok?'n8n Eingang aktiv · Zuordnung derzeit manuell':'n8n Eingang nicht erreichbar';
  }
  const systemCard=[...document.querySelectorAll('.settingRow')].find(row=>row.querySelector('.left strong')?.textContent.trim()==='App-Version');
  if(systemCard){
    const version=systemCard.querySelector(':scope > strong');
    if(version)version.textContent='v167';
  }
}

function renderInbox(items){
  ensurePanel();
  currentItems=Array.isArray(items)?items:[];
  const linked=linkedIds();
  const pending=currentItems.filter(item=>!linked.has(String(item.paperlessId)));
  const badge=document.getElementById('n8nInboxBadge');
  const box=document.getElementById(CONTENT_ID);
  if(badge)badge.textContent=pending.length+' offen';
  if(!box)return pending.length;
  if(!pending.length){
    box.innerHTML='<div class="n8nInboxEmpty">Keine nicht zugeordneten Dokumente. ✓</div>';
    return 0;
  }
  const options=debtOptions();
  box.innerHTML=pending.slice(0,100).map(item=>{
    const meta=[
      'Paperless #'+item.paperlessId,
      dateText(item.created),
      item.correspondent,
      item.documentType,
      item.asn?'ASN '+item.asn:''
    ].filter(Boolean);
    return `
      <div class="n8nInboxItem" data-n8n-item="${safe(item.paperlessId)}">
        <div>
          <div class="n8nInboxTitle">${safe(item.title||('Dokument #'+item.paperlessId))}</div>
          <div class="n8nInboxMeta">${meta.map(x=>`<span>${safe(x)}</span>`).join('<span>·</span>')}</div>
        </div>
        <div class="n8nInboxActions">
          <select class="field" data-n8n-debt="${safe(item.paperlessId)}">${options}</select>
          <button class="btn primary" type="button" data-n8n-assign="${safe(item.paperlessId)}">Zuordnen</button>
        </div>
      </div>
    `;
  }).join('');
  return pending.length;
}

async function loadInbox(showMessage=false){
  ensurePanel();
  const box=document.getElementById(CONTENT_ID);
  try{
    const response=await fetch('/api/n8n/inbox-view',{cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false)throw new Error(data.error||('HTTP '+response.status));
    const pending=renderInbox(data.items||[]);
    updateSettings(true,Number(data.inboxCount)||0,pending);
    if(showMessage)toast(`n8n Eingang aktualisiert · ${pending} offen`);
  }catch(error){
    if(box)box.innerHTML='<div class="n8nInboxEmpty">n8n Eingang konnte nicht geladen werden.</div>';
    const badge=document.getElementById('n8nInboxBadge');
    if(badge)badge.textContent='Fehler';
    updateSettings(false,0,0);
    if(showMessage)toast('n8n Eingang: '+error.message);
  }
}

async function assignItem(paperlessId,button){
  const select=document.querySelector(`[data-n8n-debt="${CSS.escape(String(paperlessId))}"]`);
  const index=Number(select?.value);
  if(!select || select.value==='' || !Number.isInteger(index) || !state.debts[index]){
    toast('Bitte zuerst einen Gläubiger / eine Schuld auswählen.');
    return;
  }
  const item=currentItems.find(x=>String(x.paperlessId)===String(paperlessId));
  if(!item){
    toast('Dokument wurde im Eingang nicht gefunden.');
    return;
  }
  const debt=state.debts[index];
  if(!Array.isArray(debt.paperlessLinks))debt.paperlessLinks=[];
  if(!debt.paperlessLinks.some(link=>String(link?.id)===String(item.paperlessId))){
    debt.paperlessLinks.push({
      id:String(item.paperlessId),
      title:item.title||('Dokument #'+item.paperlessId),
      meta:[dateText(item.created),item.correspondent].filter(Boolean).join(' · '),
      linkedAt:new Date().toISOString(),
      source:'n8n'
    });
  }
  button.disabled=true;
  button.textContent='Speichere…';
  await commit('Dokument zugeordnet');
  await loadInbox(false);
}

document.addEventListener('click',event=>{
  const assign=event.target.closest('[data-n8n-assign]');
  if(assign){
    event.preventDefault();
    assignItem(assign.dataset.n8nAssign,assign).catch(error=>toast('Zuordnung fehlgeschlagen: '+error.message));
    return;
  }
  const pageButton=event.target.closest('[data-page="documents"],[data-page-go="documents"]');
  if(pageButton)setTimeout(()=>loadInbox(false),80);
});

ensurePanel();
setTimeout(()=>loadInbox(false),700);
setInterval(()=>{
  const page=document.getElementById('page-documents');
  if(page?.classList.contains('active'))loadInbox(false);
},60000);

})();
