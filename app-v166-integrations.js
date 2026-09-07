(function(){
'use strict';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.file';
const DRIVE_ALLOWED='schulden_google_drive_allowed_v36';
const DRIVE_META='schulden_google_drive_meta_v26';
const PAPERLESS_KEY='schulden_paperless_v166';
let accessToken='';
let googleTokenClient=null;
let googleInitPromise=null;
let pendingGoogle=null;
const get=id=>document.getElementById(id);
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const readJson=(k,d)=>{try{const x=JSON.parse(localStorage.getItem(k)||'null');return x??d}catch(e){return d}};
const writeJson=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
function note(msg){try{toast(msg)}catch(e){alert(msg)}}
function hideLegacyFloaters(){for(const id of ['v132Btn','chatgptImportBtn']){const el=get(id);if(el)el.style.setProperty('display','none','important')}}
new MutationObserver(hideLegacyFloaters).observe(document.documentElement,{childList:true,subtree:true});
hideLegacyFloaters();

function bridgeOldModules(){
  try{window.debts=state.debts}catch(e){}
  window.render=function(){try{renderAll()}catch(e){}};
  window.save=function(){try{window.debts=state.debts;localStorage.setItem(LOCAL_KEY,JSON.stringify(state.debts));syncSave();renderAll()}catch(e){}};
}
setTimeout(bridgeOldModules,0);setTimeout(bridgeOldModules,1200);

async function config(){
  if(state.config?.googleClientId)return state.config;
  const r=await fetch('/api/config',{cache:'no-store'});const j=await r.json();state.config={...(state.config||{}),...j};return state.config;
}
function waitForGoogle(){return new Promise((resolve,reject)=>{let tries=0;const t=setInterval(()=>{if(window.google?.accounts?.oauth2){clearInterval(t);resolve()}else if(++tries>100){clearInterval(t);reject(new Error('Google-Anmeldung konnte nicht geladen werden'))}},80)})}
async function prepareGoogle(){
  if(googleTokenClient)return googleTokenClient;
  if(googleInitPromise)return googleInitPromise;
  googleInitPromise=(async()=>{
    const cfg=await config();if(!cfg.googleClientId)throw new Error('GOOGLE_CLIENT_ID fehlt');
    await waitForGoogle();
    googleTokenClient=google.accounts.oauth2.initTokenClient({
      client_id:cfg.googleClientId,
      scope:DRIVE_SCOPE,
      callback:r=>{
        const p=pendingGoogle;pendingGoogle=null;
        if(r?.access_token){accessToken=r.access_token;localStorage.setItem(DRIVE_ALLOWED,'1');p?.resolve(accessToken);updateDriveLabels(true)}
        else p?.reject(new Error(r?.error||'Google-Anmeldung abgebrochen'));
      },
      error_callback:e=>{
        const p=pendingGoogle;pendingGoogle=null;
        const type=String(e?.type||e?.message||'Google-Popup konnte nicht geöffnet werden');
        p?.reject(new Error(type==='popup_failed_to_open'?'Google-Popup wurde vom Browser blockiert':type==='popup_closed'?'Google-Anmeldung wurde geschlossen':type));
      }
    });
    return googleTokenClient;
  })();
  try{return await googleInitPromise}catch(e){googleInitPromise=null;throw e}
}
function requestGoogleFromClick(force=true){
  if(!googleTokenClient)return Promise.reject(new Error('Google wird noch geladen – bitte kurz erneut tippen'));
  return new Promise((resolve,reject)=>{
    pendingGoogle={resolve,reject};
    try{googleTokenClient.requestAccessToken({prompt:force?'consent':''})}catch(e){pendingGoogle=null;reject(e)}
  });
}
function updateDriveLabels(connected){
  const text=connected?'verbunden':'nicht verbunden';
  if(get('driveQuick'))get('driveQuick').textContent=text;
  if(get('driveSettingText'))get('driveSettingText').textContent=connected?'Google Drive verbunden':'nicht verbunden';
}
async function driveFetch(url,options={}){
  if(!accessToken)throw new Error('Bitte zuerst auf „Verbinden“ tippen');
  const h=new Headers(options.headers||{});h.set('Authorization','Bearer '+accessToken);
  const r=await fetch(url,{...options,headers:h});
  if(r.status===401){accessToken='';updateDriveLabels(false);throw new Error('Google-Anmeldung ist abgelaufen – bitte neu verbinden')}
  if(!r.ok){const tx=await r.text().catch(()=> '');throw new Error('Google Drive Fehler '+r.status+(tx?' · '+tx.slice(0,120):''))}
  return r;
}
async function listDrive(q){const r=await driveFetch('https://www.googleapis.com/drive/v3/files?spaces=drive&fields=files(id,name,mimeType,modifiedTime)&q='+encodeURIComponent(q));return (await r.json()).files||[]}
async function findDrive(name,parent,mime){let q=`name='${String(name).replaceAll("'","\\'")}' and trashed=false`;if(parent)q+=` and '${parent}' in parents`;if(mime)q+=` and mimeType='${mime}'`;return (await listDrive(q))[0]||null}
async function makeFolder(name,parent){const old=await findDrive(name,parent,'application/vnd.google-apps.folder');if(old)return old;const body={name,mimeType:'application/vnd.google-apps.folder'};if(parent)body.parents=[parent];const r=await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id,name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json()}
async function driveRoot(){const m=readJson(DRIVE_META,{})||{};if(m.rootFolderId)return{id:m.rootFolderId};const f=await makeFolder('Schulden-App');m.rootFolderId=f.id;writeJson(DRIVE_META,m);return f}
async function saveToDrive(){
  const root=await driveRoot(),m=readJson(DRIVE_META,{})||{};let id=m.syncFileId;if(!id)id=(await findDrive('schulden-sync.json',root.id,'application/json'))?.id;
  const blob=new Blob([JSON.stringify({version:166,savedAt:new Date().toISOString(),debts:state.debts},null,2)],{type:'application/json'});
  if(!id){const r=await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'schulden-sync.json',mimeType:'application/json',parents:[root.id]})});id=(await r.json()).id}
  await driveFetch('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(id)+'?uploadType=media',{method:'PATCH',headers:{'Content-Type':'application/json'},body:blob});
  m.syncFileId=id;m.lastDriveSave=new Date().toISOString();writeJson(DRIVE_META,m);note('In Google Drive gespeichert ✓')
}
async function loadFromDrive(){
  if(!confirm('Daten aus Google Drive laden? Der aktuelle Stand wird ersetzt.'))return;
  const root=await driveRoot(),m=readJson(DRIVE_META,{})||{};let id=m.syncFileId;if(!id)id=(await findDrive('schulden-sync.json',root.id,'application/json'))?.id;if(!id)throw new Error('Keine schulden-sync.json gefunden');
  const r=await driveFetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?alt=media'),j=await r.json(),arr=Array.isArray(j)?j:j.debts;if(!Array.isArray(arr))throw new Error('Ungültige Drive-Datei');
  state.debts=arr;window.debts=state.debts;await commit('Daten aus Google Drive geladen');closeModal();
}
function openDrive(){
  modal(`<div class="modalHead"><div><h2>Google Drive</h2><p>Direkt in der neuen App – auch auf dem Handy.</p></div><button class="closeBtn" data-close-modal>×</button></div><div class="settingRows"><div class="settingRow"><div class="left"><strong>Google anmelden</strong><span id="v166DriveStatus">Google wird vorbereitet…</span></div><button class="btn primary" id="v166DriveConnect" disabled>Verbinden</button></div><div class="settingRow"><div class="left"><strong>In Drive speichern</strong><span>Aktuellen Schuldenstand sichern</span></div><button class="btn" id="v166DriveSave">Speichern</button></div><div class="settingRow"><div class="left"><strong>Aus Drive laden</strong><span>Gesicherten Stand übernehmen</span></div><button class="btn" id="v166DriveLoad">Laden</button></div></div><p class="small" style="margin-top:12px">Auf Mobilgeräten öffnet Google die Anmeldung als eigenes Fenster. Falls dein Browser Pop-ups grundsätzlich blockiert, erlaube sie für diese Seite.</p>`);
  const c=get('v166DriveConnect'),s=get('v166DriveStatus');
  prepareGoogle().then(()=>{c.disabled=false;s.textContent=accessToken?'verbunden ✓':(localStorage.getItem(DRIVE_ALLOWED)==='1'?'Freigabe vorhanden · bitte verbinden':'bereit für Anmeldung')}).catch(e=>{s.textContent=e.message});
  c.onclick=()=>{s.textContent='Google-Anmeldung wird geöffnet…';requestGoogleFromClick(true).then(()=>{s.textContent='verbunden ✓';c.textContent='Neu verbinden';note('Google Drive verbunden ✓')}).catch(e=>{s.textContent=e.message;note(e.message)})};
  get('v166DriveSave').onclick=()=>saveToDrive().catch(e=>note(e.message));
  get('v166DriveLoad').onclick=()=>loadFromDrive().catch(e=>note(e.message));
}

function paperlessSettings(){const c=state.config||{},l=readJson(PAPERLESS_KEY,{})||{};return{url:l.url||c.paperlessUrl||'',token:l.token||'',tag:l.tag||c.paperlessTag||'App',insecure:typeof l.insecure==='boolean'?l.insecure:!!c.paperlessInsecureTls,env:!!c.paperlessConfigured}}
function paperlessHeaders(){const s=paperlessSettings(),h={'Accept':'application/json','x-paperless-tag':s.tag};if(!s.env){if(s.url)h['x-paperless-url']=s.url;if(s.token)h['x-paperless-token']=s.token}if(s.insecure)h['x-paperless-insecure-tls']='true';return h}
async function paperlessJson(url){const r=await fetch(url,{headers:paperlessHeaders(),cache:'no-store'}),j=await r.json().catch(()=>({}));if(!r.ok||j.ok===false)throw new Error(j.error||j.hint||('HTTP '+r.status));return j}
function debtOpts(){return state.debts.map((d,i)=>`<option value="${i}">${safe(nameOf(d))} · ${safe(caseOf(d))}</option>`).join('')}
function openPaperless(){
  const s=paperlessSettings();
  modal(`<div class="modalHead"><div><h2>Paperless</h2><p>Verbindung, Test und Dokument-Suche.</p></div><button class="closeBtn" data-close-modal>×</button></div><div class="formGrid"><label>URL<input class="field" id="v166Pu" value="${safe(s.url)}" ${s.env?'disabled':''}></label><label>API Token<input class="field" id="v166Pt" type="password" ${s.env?'disabled':''} placeholder="${s.env?'über Railway gespeichert':'Token'}"></label><label>Tag<input class="field" id="v166Pg" value="${safe(s.tag)}"></label><label style="display:flex;gap:8px;align-items:center;margin-top:22px"><input id="v166Pi" type="checkbox" ${s.insecure?'checked':''}> privates Zertifikat erlauben</label><label class="span2">Schuld<select id="v166Pd">${debtOpts()}</select></label><label class="span2">Suche<input class="field" id="v166Pq" placeholder="Gläubiger / Aktenzeichen"></label></div><div class="modalActions" style="justify-content:flex-start"><button class="btn" id="v166Ptest">Testen</button><button class="btn" id="v166Pfill">Schuld übernehmen</button><button class="btn primary" id="v166Psearch">Suchen</button></div><div id="v166Pr" style="display:grid;gap:8px;margin-top:10px"></div>`);
  const save=()=>{const x={url:s.env?s.url:String(get('v166Pu').value||'').trim(),token:s.env?s.token:String(get('v166Pt').value||'').trim(),tag:String(get('v166Pg').value||'App').trim()||'App',insecure:get('v166Pi').checked};writeJson(PAPERLESS_KEY,x);return x};
  get('v166Ptest').onclick=async()=>{save();try{await paperlessJson('/api/paperless/status');note('Paperless-Verbindung funktioniert ✓')}catch(e){note('Paperless: '+e.message)}};
  get('v166Pfill').onclick=()=>{const d=state.debts[+get('v166Pd').value];if(d)get('v166Pq').value=[nameOf(d),caseOf(d),reasonOf(d)].filter(x=>x&&x!=='–').join(' ')};
  get('v166Psearch').onclick=async()=>{save();const box=get('v166Pr');box.innerHTML='<div class="small">Suche…</div>';try{const x=await paperlessJson('/api/paperless/search?q='+encodeURIComponent(get('v166Pq').value||'')+'&tag='+encodeURIComponent(paperlessSettings().tag)+'&page_size=30'),a=x?.data?.results||[];box.innerHTML=a.length?a.map(d=>{const n=d.title||('Dokument #'+d.id),m=d.created?new Date(d.created).toLocaleDateString('de-DE'):'Paperless';return`<div class="settingRow"><div class="left"><strong>${safe(n)}</strong><span>${safe(m)}</span></div><button class="btn primary" data-v166-plink="${safe(d.id)}" data-title="${safe(n)}" data-meta="${safe(m)}">Verknüpfen</button></div>`}).join(''):'<div class="small">Keine Treffer.</div>'}catch(e){box.innerHTML='<div class="small">Fehler: '+safe(e.message)+'</div>'}};
  get('v166Pr').onclick=async e=>{const b=e.target.closest('[data-v166-plink]');if(!b)return;const d=state.debts[+get('v166Pd').value];if(!d)return;if(!Array.isArray(d.paperlessLinks))d.paperlessLinks=[];if(!d.paperlessLinks.some(x=>String(x.id)===String(b.dataset.v166Plink))){d.paperlessLinks.push({id:b.dataset.v166Plink,title:b.dataset.title,meta:b.dataset.meta,linkedAt:new Date().toISOString()});await commit('Paperless-Dokument verknüpft');b.textContent='Verknüpft ✓';b.disabled=true}}
}
function openPdf(){const rows=state.debts.map(d=>`<tr><td>${safe(nameOf(d))}</td><td>${safe(reasonOf(d))}</td><td>${safe(caseOf(d))}</td><td>${safe(statusOf(d))}</td><td>${safe(eur.format(amount(d)))}</td></tr>`).join(''),w=window.open('','_blank');if(!w){note('PDF-Fenster wurde blockiert');return}w.document.write(`<meta charset="utf-8"><title>Schuldenbericht</title><style>body{font:14px Arial;margin:18mm}table{width:100%;border-collapse:collapse}th,td{padding:7px;border-bottom:1px solid #ddd;text-align:left}th{background:#eee}</style><h1>Schulden Manager</h1><p>${new Date().toLocaleDateString('de-DE')}</p><table><tr><th>Gläubiger</th><th>Grund</th><th>Aktenzeichen</th><th>Status</th><th>Betrag</th></tr>${rows}</table>`);w.document.close();setTimeout(()=>w.print(),200)}
function openOldFeature(fn,label){hideLegacyFloaters();if(typeof window[fn]==='function'){bridgeOldModules();window[fn]();setTimeout(hideLegacyFloaters,80)}else note(label+' wird noch geladen – bitte kurz erneut tippen')}
function bind(){
  get('driveManageBtn')?.addEventListener('click',openDrive);get('driveManageBtn2')?.addEventListener('click',openDrive);
  get('paperlessManageBtn')?.addEventListener('click',openPaperless);get('paperlessManageBtn2')?.addEventListener('click',openPaperless);
  get('pdfNewBtn')?.addEventListener('click',openPdf);
  get('insolvencyStatusNewBtn')?.addEventListener('click',()=>openOldFeature('v132InsolvenzOpen','Insolvenz-Status'));
  get('chatgptImportNewBtn')?.addEventListener('click',()=>openOldFeature('v151DirectImportOpen','ChatGPT Import'));
  prepareGoogle().catch(()=>{});hideLegacyFloaters();bridgeOldModules();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
