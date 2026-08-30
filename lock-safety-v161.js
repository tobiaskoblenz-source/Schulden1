(function(){
'use strict';

const DEBT_KEY='godmode_debts';
const CREDITOR_KEY='schulden_creditors_v37';
const META_KEY='schulden_v131_meta';

const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const text=v=>String(v??'').trim();
const now=()=>new Date().toISOString();

function debtsArr(){
  try{if(typeof debts!=='undefined'&&Array.isArray(debts))return debts;}catch(e){}
  try{if(Array.isArray(window.debts))return window.debts;}catch(e){}
  try{const x=JSON.parse(localStorage.getItem(DEBT_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}
}
function creditors(){try{const x=JSON.parse(localStorage.getItem(CREDITOR_KEY)||'[]');return Array.isArray(x)?x:[];}catch(e){return [];}}
function metaAll(){try{const x=JSON.parse(localStorage.getItem(META_KEY)||'{}');return x&&typeof x==='object'?x:{};}catch(e){return {};}}
function caseRaw(d){return text(d?.aktenzeichen??d?.caseNumber??d?.az??d?.reference??d?.referenz);}
function creditorFor(d){
  const raw=caseRaw(d),name=norm(d?.name),id=text(d?.creditorId);
  return creditors().find(c=>c&&((id&&String(c.id)===id)||(name&&norm(c.name)===name)||(raw&&norm(c.aktenzeichen||c.caseNumber||'')===norm(raw))))||null;
}
function caseNo(d){const c=creditorFor(d);return caseRaw(d)||text(c?.aktenzeichen??c?.caseNumber??c?.az);}
function keyFor(d,i){return String(d?.v131Uid||d?.chatgptImportId||d?.id||[norm(d?.name),norm(caseNo(d)),i].join('|'));}
function currentMeta(d,i){return metaAll()[keyFor(d,i)]||{};}
function saveMeta(d,i,patch){
  const all=metaAll(),k=keyFor(d,i);
  all[k]={...(all[k]||{}),...patch,updatedAt:now()};
  localStorage.setItem(META_KEY,JSON.stringify(all));
}
function toast(msg){try{if(typeof showToast==='function'){showToast(msg);return;}}catch(e){}alert(msg);}

function ensureStyle(){
  if(document.getElementById('v161LockStyle'))return;
  const s=document.createElement('style');s.id='v161LockStyle';s.textContent=`
    .v161LockActions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
    .v161Blocked{opacity:.58!important;cursor:not-allowed!important;background:#243044!important;color:#b8c6da!important;box-shadow:none!important}
    .v161Force{min-height:34px!important;padding:0 9px!important;font-size:11px!important;background:rgba(245,158,11,.12)!important;color:#ffd58a!important;border:1px solid rgba(245,158,11,.25)!important;box-shadow:none!important}
  `;document.head.appendChild(s);
}

function missingFromRow(row){return [...row.querySelectorAll('.v153Pill.yellow')].map(x=>String(x.textContent||'').trim()).filter(Boolean);}
function applySafety(){
  ensureStyle();
  const host=document.getElementById('v153Content');if(!host)return;
  const heading=[...host.querySelectorAll('h3')].find(x=>/Geprüft\s*\/\s*Fertig sperren/i.test(x.textContent||''));if(!heading)return;
  const table=heading.closest('.v153Section')?.querySelector('table');if(!table)return;
  table.querySelectorAll('tbody tr').forEach(row=>{
    const btn=row.querySelector('[data-v153-lock]');if(!btn)return;
    const i=Number(btn.dataset.v153Lock),d=debtsArr()[i];if(!d)return;
    const m=currentMeta(d,i),missing=missingFromRow(row);
    const cell=btn.closest('td');if(!cell)return;
    let wrap=cell.querySelector('.v161LockActions');
    if(!wrap){wrap=document.createElement('div');wrap.className='v161LockActions';cell.insertBefore(wrap,btn);wrap.appendChild(btn);}
    wrap.querySelectorAll('[data-v161-force]').forEach(x=>x.remove());
    btn.classList.remove('v161Blocked');delete btn.dataset.v161Blocked;
    if(m.locked){btn.textContent='Sperre aufheben';return;}
    if(missing.length){
      btn.textContent='Erst vervollständigen';btn.classList.add('v161Blocked');btn.dataset.v161Blocked='1';
      const force=document.createElement('button');force.type='button';force.className='secondary v161Force';force.dataset.v161Force=String(i);force.textContent='⚠ Trotzdem sperren';force.title='Nur für bewusst geprüfte Ausnahmefälle';wrap.appendChild(force);
    }else{
      btn.textContent='Als geprüft sperren';
    }
  });
}
function schedule(){[30,100,260].forEach(ms=>setTimeout(applySafety,ms));}

window.addEventListener('click',e=>{
  const blocked=e.target?.closest?.('[data-v153-lock][data-v161-blocked="1"]');
  if(blocked){
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    const row=blocked.closest('tr'),missing=missingFromRow(row||document.createElement('tr'));
    toast('Noch nicht vollständig: '+(missing.join(', ')||'offene Pflichtpunkte vorhanden')+'.');
    return;
  }
  const force=e.target?.closest?.('[data-v161-force]');
  if(force){
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    const i=Number(force.dataset.v161Force),d=debtsArr()[i];if(!d)return;
    const row=force.closest('tr'),missing=missingFromRow(row||document.createElement('tr'));
    const msg='„'+(d.name||'Dieser Eintrag')+'“ ist noch unvollständig.\n\nOffen: '+(missing.join(', ')||'Pflichtpunkte')+'\n\nTrotzdem ausdrücklich als geprüft/fertig sperren?';
    if(!confirm(msg))return;
    saveMeta(d,i,{locked:true,lockedAt:now(),lockedBy:'user-override',lockOverride:true,lockOverrideMissing:missing});
    toast('Als Ausnahme gesperrt. Offene Punkte bleiben sichtbar.');
    const tab=document.querySelector('[data-v153-tab="locks"]');if(tab)tab.click();else schedule();
    return;
  }
  if(e.target?.closest?.('[data-v153-tab="locks"]'))schedule();
  if(e.target?.closest?.('[data-v153-lock]'))schedule();
},true);

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
window.v161RefreshLockSafety=applySafety;
})();
