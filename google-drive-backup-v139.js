(function(){
'use strict';

const VERSION='v139';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.file';
const ROOT_FOLDER='Schulden-App';
const BACKUP_FOLDER='Backups';
const CLIENT_KEY='schulden_google_client_id_v26';
const ALLOWED_KEY='schulden_google_drive_allowed_v36';
const PRE_RESTORE_KEY='schulden_v139_pre_drive_restore_backup';
const BACKUP_PREFIX='schulden1-backup-';
let accessToken='';
let tokenClient=null;
let configLoaded=false;

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

function debtsArr(){
  try{if(typeof debts!=='undefined'&&Array.isArray(debts))return debts;}catch(e){}
  try{if(Array.isArray(window.debts))return window.debts;}catch(e){}
  try{const x=JSON.parse(localStorage.getItem('godmode_debts')||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}
}
function toast(msg){
  try{if(typeof showToast==='function'){showToast(msg);return;}}catch(e){}
  alert(msg);
}
function callSave(){
  try{if(typeof save==='function')save();else localStorage.setItem('godmode_debts',JSON.stringify(debtsArr()));}
  catch(e){localStorage.setItem('godmode_debts',JSON.stringify(debtsArr()));}
  try{if(typeof render==='function')render();}catch(e){}
}
function collectBackup(){
  const store={},excluded=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(!k||(!k.startsWith('schulden_')&&!k.startsWith('godmode_')))continue;
    if(/token|password|secret|access.?token/i.test(k)){excluded.push(k);continue;}
    store[k]=localStorage.getItem(k);
  }
  return {
    format:'Schulden1-GoogleDrive-Backup-v139',
    version:139,
    createdAt:new Date().toISOString(),
    app:'Schulden Manager',
    debts:debtsArr(),
    localStorage:store,
    excludedSecrets:excluded,
    note:'Paperless-Dokumentdateien selbst sind nicht enthalten; App-Zuordnungen und Metadaten sind Bestandteil der Schuldendaten.'
  };
}
function safeStamp(){
  const d=new Date();
  const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
async function getClientId(){
  if(!configLoaded){
    configLoaded=true;
    try{
      const r=await fetch('/api/config',{cache:'no-store'});
      if(r.ok){const j=await r.json();if(j.googleClientId)localStorage.setItem(CLIENT_KEY,String(j.googleClientId));}
    }catch(e){}
  }
  return localStorage.getItem(CLIENT_KEY)||'';
}
function waitForGIS(){
  return new Promise((resolve,reject)=>{
    let tries=0;
    const t=setInterval(()=>{
      tries++;
      if(window.google&&google.accounts&&google.accounts.oauth2){clearInterval(t);resolve();return;}
      if(tries>100){clearInterval(t);reject(new Error('Google-Anmeldung konnte nicht geladen werden'));}
    },100);
  });
}
async function ensureToken(){
  if(accessToken)return accessToken;
  const clientId=await getClientId();
  if(!clientId)throw new Error('Keine Google Client ID konfiguriert');
  await waitForGIS();
  return await new Promise((resolve,reject)=>{
    tokenClient=google.accounts.oauth2.initTokenClient({
      client_id:clientId,
      scope:DRIVE_SCOPE,
      callback:resp=>{
        if(resp&&resp.access_token){accessToken=resp.access_token;localStorage.setItem(ALLOWED_KEY,'1');resolve(accessToken);}
        else reject(new Error(resp?.error||'Google Drive Freigabe fehlgeschlagen'));
      }
    });
    const allowed=localStorage.getItem(ALLOWED_KEY)==='1';
    tokenClient.requestAccessToken({prompt:allowed?'':'consent'});
  });
}
async function driveFetch(url,opt={}){
  const token=await ensureToken();
  const headers=new Headers(opt.headers||{});headers.set('Authorization','Bearer '+token);
  const res=await fetch(url,{...opt,headers});
  if(res.status===401){accessToken='';throw new Error('Google-Anmeldung abgelaufen. Bitte erneut versuchen.');}
  if(!res.ok){const text=await res.text().catch(()=> '');throw new Error('Google Drive Fehler '+res.status+(text?' – '+text.slice(0,180):''));}
  return res;
}
function qEsc(s){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");}
async function listFiles(q,extra=''){
  const url='https://www.googleapis.com/drive/v3/files?spaces=drive&fields=files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink)&q='+encodeURIComponent(q)+(extra?('&'+extra):'');
  const r=await driveFetch(url);const j=await r.json();return j.files||[];
}
async function findChild(name,parentId,mimeType){
  let q=`name='${qEsc(name)}' and trashed=false`;
  if(parentId)q+=` and '${qEsc(parentId)}' in parents`;
  if(mimeType)q+=` and mimeType='${qEsc(mimeType)}'`;
  return (await listFiles(q))[0]||null;
}
async function createFolder(name,parentId){
  const found=await findChild(name,parentId,'application/vnd.google-apps.folder');
  if(found)return found;
  const meta={name,mimeType:'application/vnd.google-apps.folder'};if(parentId)meta.parents=[parentId];
  const r=await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(meta)});
  return await r.json();
}
async function rootFolder(){
  const found=await findChild(ROOT_FOLDER,'root','application/vnd.google-apps.folder');
  return found||await createFolder(ROOT_FOLDER,'root');
}
async function backupFolder(){
  const root=await rootFolder();
  return await createFolder(BACKUP_FOLDER,root.id);
}
async function uploadJson(folderId,name,obj){
  const boundary='schulden1_'+Math.random().toString(36).slice(2);
  const meta={name,mimeType:'application/json',parents:[folderId]};
  const json=JSON.stringify(obj,null,2);
  const body=new Blob([
    '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(meta),
    '\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n',
    json,
    '\r\n--'+boundary+'--'
  ],{type:'multipart/related; boundary='+boundary});
  const r=await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,modifiedTime,webViewLink',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
  return await r.json();
}
async function createDriveBackup(){
  const btn=$('v139DriveBackup');if(btn){btn.disabled=true;btn.textContent='☁️ Sichert…';}
  try{
    const folder=await backupFolder();
    const payload=collectBackup();
    const name=BACKUP_PREFIX+safeStamp()+'.json';
    const file=await uploadJson(folder.id,name,payload);
    localStorage.setItem('schulden_v139_last_drive_backup',JSON.stringify({id:file.id,name:file.name,at:payload.createdAt}));
    toast('Google-Drive-Backup erstellt ✅');
  }catch(e){console.error(e);toast(e.message||'Google-Drive-Backup fehlgeschlagen');}
  finally{if(btn){btn.disabled=false;btn.textContent='☁️ Backup auf Google Drive';}}
}
async function listBackups(){
  const folder=await backupFolder();
  const q=`'${qEsc(folder.id)}' in parents and trashed=false and mimeType='application/json' and name contains '${BACKUP_PREFIX}'`;
  const files=await listFiles(q,'orderBy=createdTime%20desc&pageSize=50');
  return files.sort((a,b)=>String(b.createdTime||b.modifiedTime||'').localeCompare(String(a.createdTime||a.modifiedTime||'')));
}
function formatDate(v){try{return new Date(v).toLocaleString('de-DE');}catch(e){return String(v||'');}}
function ensureStyle(){
  if($('v139Style'))return;
  const s=document.createElement('style');s.id='v139Style';s.textContent=`
  .v139Panel{margin-top:14px;padding:15px;border-radius:16px;background:#0c1728;border:1px solid rgba(255,255,255,.1)}
  .v139Head{display:flex;justify-content:space-between;align-items:center;gap:12px}.v139Head h3{margin:0}
  .v139List{display:grid;gap:8px;margin-top:12px}.v139Item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:11px 12px;border-radius:12px;background:rgba(255,255,255,.05)}
  .v139Item small{display:block;color:#aebed8;margin-top:3px}.v139Item button{min-height:36px!important;padding:0 11px!important}.v139Info{font-size:12px;color:#aebed8;margin-top:8px}
  @media(max-width:700px){.v139Item{grid-template-columns:1fr}.v139Item button{width:100%}}
  `;document.head.appendChild(s);
}
async function openBackupList(){
  ensureStyle();
  const host=$('v132Content');if(!host)return;
  host.innerHTML='<div class="v139Panel"><div class="v139Head"><h3>Google-Drive-Backups</h3><button class="secondary" data-v139-back>Zurück</button></div><div class="v139Info">Backups liegen in Google Drive unter „Schulden-App / Backups“.</div><div id="v139BackupList" class="v139List"><div class="v139Item">Backups werden geladen…</div></div></div>';
  try{
    const files=await listBackups();
    const box=$('v139BackupList');if(!box)return;
    box.innerHTML=files.length?files.map(f=>`<div class="v139Item"><div><b>${esc(f.name)}</b><small>${esc(formatDate(f.createdTime||f.modifiedTime))}${f.size?' · '+esc((Number(f.size)/1024).toFixed(1))+' KB':''}</small></div><button data-v139-restore="${esc(f.id)}" data-v139-name="${esc(f.name)}">Wiederherstellen</button></div>`).join(''):'<div class="v139Item">Noch keine Google-Drive-Backups vorhanden.</div>';
  }catch(e){const box=$('v139BackupList');if(box)box.innerHTML='<div class="v139Item">Fehler: '+esc(e.message)+'</div>';}
}
async function restoreDriveBackup(id,name){
  if(!confirm('Backup „'+name+'“ wirklich wiederherstellen? Der aktuelle App-Stand wird vorher intern gesichert.'))return;
  try{
    localStorage.setItem(PRE_RESTORE_KEY,JSON.stringify(collectBackup()));
    const r=await driveFetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?alt=media');
    const j=await r.json();
    if(!j||!Array.isArray(j.debts)||!j.localStorage||typeof j.localStorage!=='object')throw new Error('Dieses Backup hat kein gültiges Schulden1-Format.');
    const arr=debtsArr();arr.splice(0,arr.length,...j.debts);
    for(const [k,v] of Object.entries(j.localStorage)){
      if(/token|password|secret|access.?token/i.test(k))continue;
      localStorage.setItem(k,String(v));
    }
    localStorage.setItem('godmode_debts',JSON.stringify(arr));
    callSave();
    toast('Google-Drive-Backup wiederhergestellt ✅');
    if(typeof window.v132InsolvenzOpen==='function')window.v132InsolvenzOpen('status');
    setTimeout(ensureButtons,50);
  }catch(e){console.error(e);toast(e.message||'Wiederherstellung fehlgeschlagen');}
}
function ensureButtons(){
  ensureStyle();
  document.querySelectorAll('.v59MenuVersion').forEach(el=>{if(el.textContent!==VERSION)el.textContent=VERSION;});
  document.querySelectorAll('.v132Modal h2').forEach(el=>{const w='Insolvenz-Status '+VERSION;if(/Insolvenz-Status/i.test(el.textContent||'')&&el.textContent!==w)el.textContent=w;});
  const actionRows=document.querySelectorAll('.v132Modal > .v132Actions, .v132Modal .v132Actions');
  let target=null;
  for(const row of actionRows){if(row.querySelector('[data-v132-backup]')){target=row;break;}}
  if(!target)return;
  if(!$('v139DriveBackup')){const b=document.createElement('button');b.id='v139DriveBackup';b.type='button';b.textContent='☁️ Backup auf Google Drive';target.appendChild(b);}
  if(!$('v139DriveList')){const b=document.createElement('button');b.id='v139DriveList';b.type='button';b.className='secondary';b.textContent='☁️ Drive-Backups';target.appendChild(b);}
}

document.addEventListener('click',function(e){
  if(e.target?.closest?.('#v139DriveBackup')){e.preventDefault();e.stopPropagation();createDriveBackup();return;}
  if(e.target?.closest?.('#v139DriveList')){e.preventDefault();e.stopPropagation();openBackupList();return;}
  const r=e.target?.closest?.('[data-v139-restore]');if(r){e.preventDefault();e.stopPropagation();restoreDriveBackup(r.dataset.v139Restore,r.dataset.v139Name||'Backup');return;}
  if(e.target?.closest?.('[data-v139-back]')){e.preventDefault();e.stopPropagation();if(typeof window.v132InsolvenzOpen==='function')window.v132InsolvenzOpen('status');setTimeout(ensureButtons,30);return;}
  if(e.target?.closest?.('#v132Btn,[data-v132-tab],[data-v136-cancel],[data-v136-save],[data-v136-save-next]'))setTimeout(ensureButtons,40);
},true);

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(ensureButtons,100),{once:true});else setTimeout(ensureButtons,100);
window.v139CreateDriveBackup=createDriveBackup;
window.v139OpenDriveBackups=openBackupList;
})();
