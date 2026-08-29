(function(){
'use strict';

const VERSION='v151';
const STORE_KEY='schulden_chatgpt_direct_v151';
const META_KEY='schulden_v131_meta';
const $=id=>document.getElementById(id);
const text=v=>String(v??'').trim();
const norm=v=>text(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const now=()=>new Date().toISOString();
let directRows=[];

function toast(msg){try{if(typeof showToast==='function')return showToast(msg);}catch(e){}alert(msg);}
function debtsArr(){try{if(typeof debts!=='undefined'&&Array.isArray(debts))return debts;}catch(e){}try{if(Array.isArray(window.debts))return window.debts;}catch(e){}try{const x=JSON.parse(localStorage.getItem('godmode_debts')||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
function parseMoney(v){if(typeof v==='number')return Number.isFinite(v)?v:0;let s=text(v).replace(/[^0-9,.-]/g,'');if(!s)return 0;const c=s.lastIndexOf(','),d=s.lastIndexOf('.');if(c>=0&&d>=0){if(c>d)s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');}else if(c>=0)s=s.replace(/\./g,'').replace(',','.');const n=Number(s);return Number.isFinite(n)?n:0;}
function normDate(v){const s=text(v);if(!s)return'';if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;let m=s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:s;}
function boolVal(v){if(typeof v==='boolean')return v;const s=norm(v);if(!s)return null;if(['ja','yes','true','1','x','j'].includes(s))return true;if(['nein','no','false','0','n'].includes(s))return false;return null;}
function uid(){try{return crypto.randomUUID();}catch(e){return 'direct-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);}}
function pick(o,...keys){for(const k of keys){if(o&&Object.prototype.hasOwnProperty.call(o,k)&&text(o[k])!=='')return o[k];}return'';}
function metaAll(){try{const x=JSON.parse(localStorage.getItem(META_KEY)||'{}');return x&&typeof x==='object'?x:{};}catch(e){return {};}}
function saveMeta(x){localStorage.setItem(META_KEY,JSON.stringify(x));}
function keyFor(d,i){return String(d?.v131Uid||d?.chatgptImportId||d?.id||[norm(d?.name),norm(d?.aktenzeichen||d?.caseNumber||''),i].join('|'));}
function ensureUid(d){if(!d.v131Uid)d.v131Uid=uid();return d.v131Uid;}

function normalizeObject(o,index){
  if(!o||typeof o!=='object'||Array.isArray(o))throw new Error('Ein Eintrag ist kein JSON-Objekt.');
  const contact=(o.contactDetails&&typeof o.contactDetails==='object'?o.contactDetails:(o.contact&&typeof o.contact==='object'?o.contact:{}));
  const insolv=(o.insolvenz&&typeof o.insolvenz==='object'?o.insolvenz:(o.insolvency&&typeof o.insolvency==='object'?o.insolvency:{}));
  const paperlessRaw=pick(o,'Paperless-Dokument-ID','Paperless ID','paperlessId','paperlessDocumentId');
  const paperlessObj=Array.isArray(o.paperlessLinks)&&o.paperlessLinks.length?o.paperlessLinks[0]:null;
  const pl=text(paperlessRaw||paperlessObj?.id||'');
  const id=text(pick(o,'Import-ID','importId','id'))||('direct-'+Date.now()+'-'+index+'-'+Math.random().toString(36).slice(2,7));
  return {
    _directId:id,
    'Import-ID':id,
    'Gläubiger':text(pick(o,'Gläubiger','Glaeubiger','gläubiger','glaeubiger','creditor','name')),
    'Betrag':pick(o,'Betrag','betrag','amount','Forderungsbetrag'),
    'Aktenzeichen':text(pick(o,'Aktenzeichen','aktenzeichen','caseNumber','reference','az')),
    'Kundennummer':text(pick(o,'Kundennummer','kundennummer','customerNumber','customerId','Kunden-/Vertragsnummer','Vertragsnummer','vertragsnummer','contractNumber')),
    'Frist':normDate(pick(o,'Frist','frist','dueDate','deadline','Datum','datum','date')),
    'Kategorie':text(pick(o,'Kategorie','kategorie','category'))||'Sonstiges',
    'Grund':text(pick(o,'Grund','grund','reason','Forderungsgrund'))||'Forderung',
    'Anschrift':text(pick(o,'Anschrift','Adresse','anschrift','adresse','address')||pick(contact,'address','anschrift')),
    'Ansprechpartner':text(pick(o,'Ansprechpartner','Vertreter','ansprechpartner','representative','contactPerson')||pick(contact,'representative','name','ansprechpartner')),
    'E-Mail':text(pick(o,'E-Mail','Email','email','mail')||pick(contact,'email','mail')),
    'Telefon':text(pick(o,'Telefon','telefon','phone')||pick(contact,'phone','telefon')),
    'Paperless-Dokument-ID':pl,
    'Notiz':text(pick(o,'Notiz','notiz','note','notes')),
    'Quelle':text(pick(o,'Quelle','quelle','source'))||'ChatGPT Direktimport',
    'Forderungsstand geprüft':pick(o,'Forderungsstand geprüft','Forderungsstand geprueft','currentClaim','claimChecked')||pick(insolv,'currentClaim','claimChecked'),
    'Tituliert':pick(o,'Tituliert','tituliert','titled')||pick(insolv,'titled'),
    'Bestritten':pick(o,'Bestritten','bestritten','disputed')||pick(insolv,'disputed'),
    'Kontaktiert':pick(o,'Kontaktiert','kontaktiert','contacted')||pick(insolv,'contacted'),
    'Antwort':pick(o,'Antwort','antwort','reply')||pick(insolv,'reply')
  };
}
function parsePayload(raw){
  let s=text(raw);if(!s)throw new Error('Kein JSON eingefügt.');
  s=s.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const j=JSON.parse(s);
  let arr=Array.isArray(j)?j:(Array.isArray(j?.forderungen)?j.forderungen:Array.isArray(j?.entries)?j.entries:Array.isArray(j?.debts)?j.debts:[j]);
  arr=arr.filter(Boolean);if(!arr.length)throw new Error('Keine Einträge im JSON gefunden.');
  return arr.map((o,i)=>normalizeObject(o,i));
}
function saveDirect(){localStorage.setItem(STORE_KEY,JSON.stringify(directRows));}
function loadDirect(){try{const x=JSON.parse(localStorage.getItem(STORE_KEY)||'[]');directRows=Array.isArray(x)?x:[];}catch(e){directRows=[];}}

function rowToItem(r,index){
  const amount=parseMoney(r['Betrag']),due=normDate(r['Frist']),representative=text(r['Ansprechpartner']),address=text(r['Anschrift']),email=text(r['E-Mail']),phone=text(r['Telefon']),pl=text(r['Paperless-Dokument-ID']),name=text(r['Gläubiger']);
  const debt={name,grund:text(r['Grund'])||'Forderung',reason:text(r['Grund'])||'Forderung',betrag:amount,amount,datum:due,date:due,aktenzeichen:text(r['Aktenzeichen']),caseNumber:text(r['Aktenzeichen']),kundennummer:text(r['Kundennummer']),customerNumber:text(r['Kundennummer']),category:text(r['Kategorie'])||'Sonstiges',kategorie:text(r['Kategorie'])||'Sonstiges',status:'offen',contactDetails:{representative,address,email,phone},contactPerson:[representative,address,email,phone].filter(Boolean).join(' | '),notesHistory:text(r['Notiz'])?[{at:now(),text:text(r['Notiz'])+(text(r['Quelle'])?' · Quelle: '+text(r['Quelle']):'')}]:[],payments:[],correspondence:[],paperlessLinks:pl?[{id:pl,title:'Paperless Dokument #'+pl,meta:'Aus ChatGPT Direktimport',linkedAt:now()}]:[],chatgptImportId:text(r['Import-ID'])||r._directId||uid(),chatgptImportSource:text(r['Quelle'])||'ChatGPT Direktimport',editHistory:[{at:now(),text:'Über ChatGPT-Direktimport verarbeitet'}]};
  const flags={currentClaim:boolVal(r['Forderungsstand geprüft']),titled:boolVal(r['Tituliert']),disputed:boolVal(r['Bestritten']),contacted:boolVal(r['Kontaktiert']),reply:boolVal(r['Antwort'])};
  return {row:r,debt,due,flags,index};
}
function existingMatch(d){
  const ds=debtsArr(),az=norm(d.aktenzeichen||d.caseNumber||''),name=norm(d.name),pl=(d.paperlessLinks||[]).map(x=>String(x.id));let idx=-1,reason='';
  if(az){idx=ds.findIndex(x=>norm(x?.aktenzeichen||x?.caseNumber||'')===az);if(idx>=0)reason='gleiches Aktenzeichen';}
  if(idx<0&&pl.length){idx=ds.findIndex(x=>{const ids=new Set((Array.isArray(x?.paperlessLinks)?x.paperlessLinks:[]).map(p=>String(p.id)));return pl.some(id=>ids.has(id));});if(idx>=0)reason='gleiches Paperless-Dokument';}
  if(idx<0&&name){idx=ds.findIndex(x=>norm(x?.name)===name);if(idx>=0)reason='gleicher Gläubigername';}
  return idx>=0?{index:idx,debt:ds[idx],reason,strong:reason!=='gleicher Gläubigername'}:null;
}
function conflicts(existing,incoming){const out=[];const check=(label,a,b)=>{if(text(a)&&text(b)&&norm(a)!==norm(b))out.push(`${label}: vorhanden „${a}“ / Import „${b}“`);};check('Betrag',Number(existing?.betrag||0)>0?String(existing.betrag):'',Number(incoming?.betrag||0)>0?String(incoming.betrag):'');check('Aktenzeichen',existing?.aktenzeichen||existing?.caseNumber,incoming?.aktenzeichen||incoming?.caseNumber);check('Kundennummer',existing?.kundennummer||existing?.customerNumber,incoming?.kundennummer||incoming?.customerNumber);const ec=existing?.contactDetails||{},ic=incoming?.contactDetails||{};check('Anschrift',ec.address,ic.address);check('Ansprechpartner',ec.representative,ic.representative);return out;}
function applyMeta(d,i,x){ensureUid(d);const all=metaAll(),k=keyFor(d,i),m={...(all[k]||{})};if(x.due)m.dueDate=x.due;for(const [key,val] of Object.entries(x.flags||{}))if(val!==null)m[key]=val;m.updatedAt=now();all[k]=m;saveMeta(all);}
function appendPaperless(target,incoming){const src=Array.isArray(incoming.paperlessLinks)?incoming.paperlessLinks:[];if(!src.length)return;if(!Array.isArray(target.paperlessLinks))target.paperlessLinks=[];for(const p of src)if(!target.paperlessLinks.some(x=>String(x?.id)===String(p?.id)))target.paperlessLinks.push({...p});}
function mergeExisting(target,incoming,strong){
  const tc=target.contactDetails&&typeof target.contactDetails==='object'?target.contactDetails:{},ic=incoming.contactDetails||{};const fill=(k,v)=>{if(text(v)&&!text(target[k]))target[k]=v;};
  fill('aktenzeichen',incoming.aktenzeichen);fill('caseNumber',incoming.caseNumber);fill('kundennummer',incoming.kundennummer);fill('customerNumber',incoming.customerNumber);fill('grund',incoming.grund);fill('reason',incoming.reason);fill('category',incoming.category);fill('kategorie',incoming.kategorie);
  if(strong&&Number(incoming.betrag)>0){target.betrag=Number(incoming.betrag);target.amount=Number(incoming.betrag);}else if(!(Number(target.betrag)>0)&&Number(incoming.betrag)>0){target.betrag=Number(incoming.betrag);target.amount=Number(incoming.betrag);}
  target.contactDetails={...tc,representative:text(tc.representative)||text(ic.representative),address:text(tc.address)||text(ic.address),email:text(tc.email)||text(ic.email),phone:text(tc.phone)||text(ic.phone)};target.contactPerson=[target.contactDetails.representative,target.contactDetails.address,target.contactDetails.email,target.contactDetails.phone].filter(Boolean).join(' | ');
  appendPaperless(target,incoming);if(Array.isArray(incoming.notesHistory)&&incoming.notesHistory.length){if(!Array.isArray(target.notesHistory))target.notesHistory=[];target.notesHistory.push(...incoming.notesHistory);}if(!Array.isArray(target.editHistory))target.editHistory=[];target.editHistory.push({at:now(),text:'Über ChatGPT-Direktimport ergänzt/aktualisiert'});
}
function persist(){try{if(typeof window.save==='function')window.save();else if(typeof save==='function')save();else localStorage.setItem('godmode_debts',JSON.stringify(debtsArr()));}catch(e){localStorage.setItem('godmode_debts',JSON.stringify(debtsArr()));}try{if(typeof window.v140ReconcileCreditorData==='function')window.v140ReconcileCreditorData();}catch(e){}try{if(typeof window.render==='function')window.render();else if(typeof render==='function')render();}catch(e){}}
function removeDirect(i){directRows.splice(i,1);saveDirect();renderDirect();}
function addNew(i,force=false){const x=rowToItem(directRows[i],i);if(!x.debt.name){toast('Gläubigername fehlt.');return;}if(!(x.debt.betrag>0)){toast('Für eine neue Schuld muss ein Betrag vorhanden sein.');return;}const match=existingMatch(x.debt);if(match&&!force){toast('Bestehender Eintrag erkannt. Bitte ergänzen/aktualisieren oder bewusst „Trotzdem neu“ wählen.');return;}ensureUid(x.debt);debtsArr().push(x.debt);applyMeta(x.debt,debtsArr().length-1,x);persist();removeDirect(i);toast('Neue Schuld übernommen ✅');}
function updateExisting(i){const x=rowToItem(directRows[i],i),match=existingMatch(x.debt);if(!match){toast('Kein bestehender Eintrag gefunden.');renderDirect();return;}mergeExisting(match.debt,x.debt,match.strong);applyMeta(match.debt,match.index,x);persist();removeDirect(i);toast(match.strong?'Bestehender Eintrag aktualisiert ✅':'Fehlende Daten ergänzt ✅');}

function ensureStyle(){if($('v151DirectStyle'))return;const s=document.createElement('style');s.id='v151DirectStyle';s.textContent=`.v151DirectBox{margin:12px 0;padding:12px;border:1px solid rgba(125,160,255,.25);background:rgba(65,105,225,.07);border-radius:16px}.v151DirectHead{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:9px}.v151DirectHead h4{margin:0}.v151DirectHelp{font-size:11px;color:#9fb0cc}.v151Paste{display:none;margin:10px 0}.v151Paste.show{display:block}.v151Paste textarea{width:100%;min-height:180px;background:#0d192b;color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px;font-family:ui-monospace,Consolas,monospace;font-size:12px}.v151Cards{display:grid;gap:9px}.v151Card{padding:12px;border-radius:14px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08)}.v151CardTop{display:flex;justify-content:space-between;gap:10px}.v151Grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 12px;color:#aebed8;font-size:12px;margin-top:7px}.v151Match{margin-top:8px;padding:7px 9px;border-radius:10px;background:rgba(59,130,246,.12);color:#cfe1ff}.v151Warn{margin-top:7px;padding:7px 9px;border-radius:10px;background:rgba(245,158,11,.12);color:#ffd98a}.v151Actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.v151Actions button{min-height:34px!important;padding:0 10px!important;font-size:12px!important}@media(max-width:650px){.v151Grid{grid-template-columns:1fr}}`;document.head.appendChild(s);}
function renderDirect(){
  const box=$('v151DirectCards'),count=$('v151DirectCount');if(count)count.textContent=String(directRows.length);if(!box)return;
  if(!directRows.length){box.innerHTML='<div class="cgiEmpty">Noch keine direkten JSON-Einträge geladen.</div>';return;}
  box.innerHTML=directRows.map((r,i)=>{const x=rowToItem(r,i),m=existingMatch(x.debt),cf=m?conflicts(m.debt,x.debt):[],c=x.debt.contactDetails||{};return `<div class="v151Card"><div class="v151CardTop"><strong>${esc(x.debt.name||'Ohne Gläubiger')}</strong><b>${x.debt.betrag?Number(x.debt.betrag).toLocaleString('de-DE',{style:'currency',currency:'EUR'}):'Betrag offen'}</b></div><div class="v151Grid"><span>AZ: ${esc(x.debt.aktenzeichen||'–')}</span><span>Kunde/Vertrag: ${esc(x.debt.kundennummer||'–')}</span><span>Frist: ${esc(x.due||'–')}</span><span>Kategorie: ${esc(x.debt.category||'–')}</span><span>Anschrift: ${esc(c.address||'–')}</span><span>Paperless-ID: ${esc(x.debt.paperlessLinks?.[0]?.id||'–')}</span></div>${m?`<div class="v151Match">🔗 Bestehender Eintrag: <b>${esc(m.debt.name||'Eintrag')}</b> · ${esc(m.reason)}${m.strong?' · sichere Zuordnung':' · bitte prüfen'}</div>`:''}${cf.length?`<div class="v151Warn">⚠️ Abweichungen:<br>${cf.map(esc).join('<br>')}</div>`:''}<div class="v151Actions">${m?`<button data-v151-update="${i}">${m.strong?'Bestehenden aktualisieren':'Bestehenden ergänzen'}</button><button class="secondary" data-v151-new="${i}">Trotzdem neu</button>`:`<button data-v151-add="${i}">Als neue Schuld übernehmen</button>`}<button class="secondary" data-v151-edit="${i}">Bearbeiten</button><button class="secondary" data-v151-remove="${i}">Entfernen</button></div></div>`;}).join('');
}
function editDirect(i){const r=directRows[i];if(!r)return;const payload={Gläubiger:r['Gläubiger'],Betrag:r['Betrag'],Aktenzeichen:r['Aktenzeichen'],Kundennummer:r['Kundennummer'],Frist:r['Frist'],Kategorie:r['Kategorie'],Grund:r['Grund'],Anschrift:r['Anschrift'],Ansprechpartner:r['Ansprechpartner'],'E-Mail':r['E-Mail'],Telefon:r['Telefon'],'Paperless-Dokument-ID':r['Paperless-Dokument-ID'],Notiz:r['Notiz'],Quelle:r['Quelle'],'Forderungsstand geprüft':r['Forderungsstand geprüft'],Tituliert:r['Tituliert'],Bestritten:r['Bestritten'],Kontaktiert:r['Kontaktiert'],Antwort:r['Antwort']};const area=$('v151JsonText');if(!area)return;area.value=JSON.stringify(payload,null,2);area.dataset.editIndex=String(i);$('v151PasteBox')?.classList.add('show');area.focus();}
function loadTextarea(){const area=$('v151JsonText');if(!area)return;try{const parsed=parsePayload(area.value),edit=Number(area.dataset.editIndex);if(Number.isInteger(edit)&&edit>=0&&parsed.length===1&&directRows[edit]){directRows[edit]={...parsed[0],_directId:directRows[edit]._directId,'Import-ID':directRows[edit]['Import-ID']};}else{directRows=parsed;}delete area.dataset.editIndex;saveDirect();renderDirect();area.value='';$('v151PasteBox')?.classList.remove('show');toast(`${parsed.length} JSON-Eintrag${parsed.length===1?'':'e'} geladen ✅`);}catch(e){toast('JSON konnte nicht geladen werden: '+(e.message||e));}}
function fileLoad(){const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';inp.onchange=async()=>{const f=inp.files?.[0];if(!f)return;try{directRows=parsePayload(await f.text());saveDirect();renderDirect();toast(`${directRows.length} Einträge aus ${f.name} geladen ✅`);}catch(e){toast('JSON-Datei ungültig: '+(e.message||e));}};inp.click();}
function ensureDirectUI(){
  ensureStyle();const modal=document.querySelector('.cgiModal'),toolbar=modal?.querySelector('.cgiToolbar'),list=$('cgiList');if(!modal||!toolbar||!list)return;
  modal.querySelector('.cgiHead h3')?.replaceChildren(document.createTextNode('🤖 ChatGPT Import v151'));
  if(!$('v151PasteBtn')){const b=document.createElement('button');b.id='v151PasteBtn';b.type='button';b.textContent='📋 JSON einfügen';b.dataset.v151Paste='1';toolbar.appendChild(b);const f=document.createElement('button');f.id='v151FileBtn';f.type='button';f.className='secondary';f.textContent='📂 JSON-Datei laden';f.dataset.v151File='1';toolbar.appendChild(f);}
  if(!$('v151DirectBox')){const wrap=document.createElement('div');wrap.id='v151DirectBox';wrap.className='v151DirectBox';wrap.innerHTML=`<div class="v151DirectHead"><div><h4>Direkt-Import <span class="v151DirectHelp">(<span id="v151DirectCount">0</span> Einträge)</span></h4><div class="v151DirectHelp">Objekt, Liste oder { "forderungen": [...] }. Nichts wird ohne Bestätigung gespeichert.</div></div><button type="button" class="secondary" data-v151-clear>Direktliste leeren</button></div><div id="v151PasteBox" class="v151Paste"><textarea id="v151JsonText" placeholder='JSON hier einfügen …'></textarea><div class="v151Actions"><button type="button" data-v151-load>Vorschau laden</button><button type="button" class="secondary" data-v151-cancel>Abbrechen</button></div></div><div id="v151DirectCards" class="v151Cards"></div>`;list.before(wrap);}
  loadDirect();renderDirect();
}

document.addEventListener('click',e=>{
  if(e.target?.closest?.('#chatgptImportBtn')){setTimeout(ensureDirectUI,30);setTimeout(ensureDirectUI,180);return;}
  const p=e.target?.closest?.('[data-v151-paste]');if(p){e.preventDefault();$('v151PasteBox')?.classList.toggle('show');$('v151JsonText')?.focus();return;}
  const f=e.target?.closest?.('[data-v151-file]');if(f){e.preventDefault();fileLoad();return;}
  if(e.target?.closest?.('[data-v151-load]')){e.preventDefault();loadTextarea();return;}
  if(e.target?.closest?.('[data-v151-cancel]')){e.preventDefault();const a=$('v151JsonText');if(a){a.value='';delete a.dataset.editIndex;}$('v151PasteBox')?.classList.remove('show');return;}
  if(e.target?.closest?.('[data-v151-clear]')){e.preventDefault();if(directRows.length&&confirm('Direkt-Import-Liste wirklich leeren?')){directRows=[];saveDirect();renderDirect();}return;}
  const add=e.target?.closest?.('[data-v151-add]');if(add){e.preventDefault();addNew(Number(add.dataset.v151Add));return;}
  const upd=e.target?.closest?.('[data-v151-update]');if(upd){e.preventDefault();updateExisting(Number(upd.dataset.v151Update));return;}
  const neu=e.target?.closest?.('[data-v151-new]');if(neu){e.preventDefault();addNew(Number(neu.dataset.v151New),true);return;}
  const edit=e.target?.closest?.('[data-v151-edit]');if(edit){e.preventDefault();editDirect(Number(edit.dataset.v151Edit));return;}
  const rem=e.target?.closest?.('[data-v151-remove]');if(rem){e.preventDefault();removeDirect(Number(rem.dataset.v151Remove));return;}
},true);

window.v151DirectImportOpen=function(){try{window.v150ChatgptImportOpen?.();}finally{setTimeout(ensureDirectUI,50);}};
})();
