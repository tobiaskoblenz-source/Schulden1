(function(){
'use strict';

const PAPERLESS_SETTINGS_KEY='schulden_paperless_settings_v79';
let currentObjectUrl='';

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
  alert(msg);
}
function cleanupUrl(){
  if(currentObjectUrl){try{URL.revokeObjectURL(currentObjectUrl);}catch(e){}currentObjectUrl='';}
}
function closeViewer(){
  cleanupUrl();
  const el=document.getElementById('v155PdfOverlay');if(el)el.remove();
}
function ensureStyle(){
  if(document.getElementById('v155PdfStyle'))return;
  const s=document.createElement('style');s.id='v155PdfStyle';s.textContent=`
  #v155PdfOverlay{position:fixed;inset:0;z-index:26000;background:rgba(2,6,18,.9);backdrop-filter:blur(10px);padding:12px;display:flex;align-items:stretch;justify-content:center}
  .v155PdfModal{width:min(1280px,100%);height:calc(100dvh - 24px);background:#0d1727;border:1px solid rgba(255,255,255,.12);border-radius:22px;overflow:hidden;display:grid;grid-template-rows:auto 1fr;box-shadow:0 28px 90px rgba(0,0,0,.5)}
  .v155PdfHead{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 14px;background:#101c2e;border-bottom:1px solid rgba(255,255,255,.08);color:#eaf2ff}
  .v155PdfHead strong{font-size:15px}.v155PdfHead small{display:block;color:#9fb0cc;margin-top:2px}.v155PdfClose{width:42px;height:42px;min-width:42px;padding:0;border-radius:13px!important}
  .v155PdfBody{position:relative;min-height:0;background:#20252c}.v155PdfFrame{width:100%;height:100%;border:0;background:white;display:none}.v155PdfLoading{position:absolute;inset:0;display:grid;place-items:center;color:#dbeafe;font:600 15px system-ui;padding:24px;text-align:center}
  @media(max-width:700px){#v155PdfOverlay{padding:0}.v155PdfModal{height:100dvh;border-radius:0}.v155PdfHead{padding:9px 10px}.v155PdfHead strong{font-size:14px}}
  `;document.head.appendChild(s);
}
function showShell(title,id){
  ensureStyle();closeViewer();
  const o=document.createElement('div');o.id='v155PdfOverlay';
  o.innerHTML=`<div class="v155PdfModal"><div class="v155PdfHead"><div><strong>📄 ${String(title||'Paperless-Dokument').replace(/[<>&]/g,'')}</strong><small>Paperless-ID ${String(id||'').replace(/[^0-9A-Za-z_-]/g,'')}</small></div><button class="secondary v155PdfClose" type="button" data-v155-pdf-close>✕</button></div><div class="v155PdfBody"><div class="v155PdfLoading" id="v155PdfLoading">PDF wird geladen …</div><iframe class="v155PdfFrame" id="v155PdfFrame" title="Paperless PDF"></iframe></div></div>`;
  document.body.appendChild(o);
}
async function openInline(id,title){
  if(!id)return;
  showShell(title,id);
  const loading=document.getElementById('v155PdfLoading'),frame=document.getElementById('v155PdfFrame');
  try{
    const r=await fetch('/api/paperless/document/'+encodeURIComponent(id),{method:'GET',headers:paperlessHeaders(),cache:'no-store'});
    if(!r.ok){
      let msg='HTTP '+r.status;
      try{const j=await r.json();msg=j?.error||j?.details||msg;}catch(e){try{msg=(await r.text())||msg;}catch(_){}}
      throw new Error(msg);
    }
    const blob=await r.blob();if(!blob.size)throw new Error('Leere Datei von Paperless erhalten');
    cleanupUrl();currentObjectUrl=URL.createObjectURL(blob);
    if(!document.getElementById('v155PdfOverlay')){cleanupUrl();return;}
    frame.src=currentObjectUrl;frame.style.display='block';loading.style.display='none';
  }catch(e){
    if(loading){loading.style.display='grid';loading.textContent='PDF konnte nicht geladen werden: '+String(e?.message||e);}
    toast('PDF konnte nicht geöffnet werden: '+String(e?.message||e));
  }
}
function titleFromButton(btn){
  const row=btn.closest('.v153InboxItem');return row?.querySelector('b')?.textContent||'Paperless-Dokument';
}
function idFromV153(btn){
  const row=btn.closest('.v153InboxItem');const small=row?.querySelector('small');const m=String(small?.textContent||'').match(/\bID\s+(\d+)/i);return m?m[1]:'';
}

// Capture auf window verhindert, dass die alte v153-Funktion ein neues Fenster öffnet.
window.addEventListener('click',function(e){
  const btn153=e.target?.closest?.('[data-v153-pl-preview]');
  const btn147=e.target?.closest?.('[data-v147-open]');
  if(!btn153&&!btn147)return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  const id=btn153?idFromV153(btn153):btn147.dataset.v147Open;
  const title=btn153?titleFromButton(btn153):(btn147.closest('label,div,tr')?.querySelector('b,strong')?.textContent||'Paperless-Dokument');
  openInline(id,title);
},true);

document.addEventListener('click',function(e){
  if(e.target?.closest?.('[data-v155-pdf-close]')||e.target?.id==='v155PdfOverlay'){e.preventDefault();closeViewer();}
},true);
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&document.getElementById('v155PdfOverlay')){e.preventDefault();closeViewer();}},true);
window.addEventListener('beforeunload',cleanupUrl);
window.v155OpenPaperlessPdf=openInline;
})();
