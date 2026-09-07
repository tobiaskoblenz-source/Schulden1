(function(){
'use strict';
function renameLegacyButton(){
  document.querySelectorAll('[data-legacy]').forEach(btn=>{
    btn.textContent='Dokumente';
    btn.setAttribute('aria-label','Dokumente öffnen');
  });
}
const target=document.getElementById('drawerContent')||document.body;
new MutationObserver(renameLegacyButton).observe(target,{childList:true,subtree:true});
renameLegacyButton();
document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-legacy]');
  if(!btn)return;
  e.preventDefault();
  e.stopPropagation();
  try{closeDrawer()}catch(_){}
  try{showPage('documents')}catch(_){}
},true);
})();
