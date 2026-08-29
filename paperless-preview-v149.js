(function(){
'use strict';

const PAPERLESS_SETTINGS_KEY='schulden_paperless_settings_v79';

function paperlessHeaders(){
  const h={'Accept':'application/pdf,application/octet-stream;q=0.9,*/*;q=0.5'};
  try{
    const st=JSON.parse(localStorage.getItem(PAPERLESS_SETTINGS_KEY)||'{}');
    if(st.url)h['x-paperless-url']=String(st.url).trim().replace(/\/+$/,'');
    if(st.token)h['x-paperless-token']=String(st.token).trim();
    if(st.insecureTls)h['x-paperless-insecure-tls']='true';
  }catch(e){}
  return h;
}

function toast(msg){
  try{if(typeof showToast==='function'){showToast(msg);return;}}catch(e){}
  console.log(msg);
}

async function openPdf(id){
  if(!id)return;
  let tab=null;
  try{
    tab=window.open('about:blank','_blank');
    if(tab){
      tab.document.title='Paperless PDF';
      tab.document.body.style.cssText='margin:0;background:#0b1320;color:#eaf2ff;font:16px system-ui;display:grid;place-items:center;min-height:100vh';
      tab.document.body.textContent='Paperless-Dokument wird geladen …';
    }
  }catch(e){}

  try{
    const r=await fetch('/api/paperless/document/'+encodeURIComponent(id),{
      method:'GET',headers:paperlessHeaders(),cache:'no-store'
    });
    if(!r.ok){
      let message='HTTP '+r.status;
      try{const j=await r.json();message=j?.error||j?.details||message;}catch(e){try{message=(await r.text())||message;}catch(_){}}
      throw new Error(message);
    }
    const blob=await r.blob();
    if(!blob.size)throw new Error('Leere Datei von Paperless erhalten');
    const objectUrl=URL.createObjectURL(blob);
    if(tab&&!tab.closed){tab.location.replace(objectUrl);}
    else{
      const a=document.createElement('a');a.href=objectUrl;a.target='_blank';a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
    }
    setTimeout(()=>URL.revokeObjectURL(objectUrl),300000);
  }catch(e){
    const msg='PDF konnte nicht geöffnet werden: '+String(e?.message||e);
    if(tab&&!tab.closed){
      try{tab.document.body.style.cssText='margin:0;background:#0b1320;color:#ffd0d8;font:16px system-ui;padding:32px';tab.document.body.textContent=msg;}catch(_){try{tab.close();}catch(__){}}
    }
    toast(msg);
  }
}

// Auf window in Capture-Phase: läuft vor dem alten document-Handler aus v147.
window.addEventListener('click',function(e){
  const btn=e.target?.closest?.('[data-v147-open]');
  if(!btn)return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  openPdf(btn.dataset.v147Open);
},true);

})();
