(function(){
'use strict';

const VERSION='v152';
const $=id=>document.getElementById(id);
let toolsOpen=false;

function ensureStyle(){
  if($('v152DashboardStyle'))return;
  const s=document.createElement('style');
  s.id='v152DashboardStyle';
  s.textContent=`
    body.dark .heroDashboard{margin-bottom:14px!important}
    body.dark .dashboardHeader{padding-top:2px!important;align-items:center!important}
    body.dark .dashboardGreetingWrap .eyebrow{padding:5px 9px!important;font-size:11px!important;background:rgba(79,140,255,.10)!important;color:#9fc0ff!important;border-color:rgba(79,140,255,.16)!important}
    body.dark .dashboardHeader h1{font-size:clamp(28px,3vw,42px)!important;margin:7px 0 4px!important;line-height:1.05!important}
    body.dark .dashboardHeader p{font-size:14px!important;line-height:1.4!important;color:#91a6c3!important}
    body.dark .heroTopActions{align-items:center!important;gap:8px!important}
    body.dark .heroTopActions>button{min-height:44px!important;padding:0 13px!important;border-radius:14px!important;font-size:13px!important;box-shadow:none!important}
    #v152InsolvencyBtn{background:rgba(79,140,255,.13)!important;border:1px solid rgba(79,140,255,.24)!important;color:#dce9ff!important}
    #v152ToolsToggle{background:rgba(255,255,255,.055)!important;border:1px solid rgba(255,255,255,.09)!important;color:#dce8f8!important}
    #v152ToolsToggle.v152Open{background:rgba(79,140,255,.14)!important;border-color:rgba(79,140,255,.28)!important;color:#fff!important}

    body.dark #statsCard.dashboardStats{margin-bottom:12px!important;gap:9px!important;grid-template-columns:repeat(4,minmax(0,1fr))!important}
    body.dark #statsCard.dashboardStats .stat{min-height:104px!important;padding:15px 16px!important;border-radius:18px!important;box-shadow:none!important}
    body.dark #statsCard .statLabel{font-size:11px!important;text-transform:uppercase!important;letter-spacing:.05em!important;margin-bottom:8px!important}
    body.dark #statsCard .statValue{font-size:clamp(23px,2vw,31px)!important;line-height:1.05!important}
    body.dark #statsCard .stat em{font-size:11px!important;margin-top:7px!important;color:#8fa5c3!important}

    body.dark #v141DashboardCheck{margin:0 0 12px!important;padding:13px 14px!important;border-radius:18px!important;background:linear-gradient(180deg,rgba(10,20,34,.96),rgba(8,16,29,.96))!important}
    body.dark #v141DashboardCheck .v141Head{margin-bottom:9px!important}
    body.dark #v141DashboardCheck .v141Head b{font-size:13px!important}
    body.dark #v141DashboardCheck .v141Grid{gap:7px!important}
    body.dark #v141DashboardCheck .v141Item{min-height:54px!important;padding:8px 10px!important;border-radius:12px!important}
    body.dark #v141DashboardCheck .v141Item strong{font-size:18px!important}
    body.dark #v141DashboardCheck .v141Item small{font-size:10px!important;margin-top:4px!important}

    body.dark #newDebtSection.v152ToolsCard{display:none!important;margin:0 0 12px!important;padding:16px!important;border-radius:18px!important;background:linear-gradient(180deg,rgba(10,20,34,.98),rgba(7,15,27,.98))!important;box-shadow:none!important}
    body.dark #newDebtSection.v152ToolsCard.v152Open{display:block!important}
    #newDebtSection.v152ToolsCard .compactTitle{margin-bottom:10px!important}
    #newDebtSection.v152ToolsCard .compactTitle h2{font-size:18px!important}
    #newDebtSection.v152ToolsCard .compactTitle span{font-size:11px!important}
    #newDebtSection.v152ToolsCard .actionToolbarGrid{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:7px!important}
    #newDebtSection.v152ToolsCard .actionToolbarGrid button{min-height:42px!important;padding:7px 8px!important;border-radius:12px!important;font-size:11px!important;box-shadow:none!important}
    #newDebtSection.v152ToolsCard .driveToolbarGrid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important;margin-top:8px!important}
    #newDebtSection.v152ToolsCard .driveToolbarGrid button{min-height:44px!important;border-radius:12px!important;font-size:11px!important;box-shadow:none!important}
    #newDebtSection.v152ToolsCard .driveText{line-height:1.15!important}
    #newDebtSection.v152ToolsCard #backupStatus,
    #newDebtSection.v152ToolsCard #syncStatus,
    #newDebtSection.v152ToolsCard #driveStatus{min-height:0!important;padding:7px 9px!important;margin-top:7px!important;border-radius:10px!important;font-size:10px!important;font-weight:600!important}
    #newDebtSection.v152ToolsCard #installHint{display:none!important}
    .v152ToolExtras{display:flex;flex-wrap:wrap;gap:7px;margin:8px 0 2px}
    .v152ToolExtras .visibleViewSwitch{display:flex!important;gap:7px!important;margin:0!important;width:auto!important}
    .v152ToolExtras .visibleViewSwitch button,.v152ToolExtras>button{min-height:40px!important;padding:0 10px!important;border-radius:12px!important;font-size:11px!important;box-shadow:none!important}
    .v152DangerRow{display:flex;justify-content:flex-end;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06)}
    .v152DangerRow #btnClear{min-height:38px!important;padding:0 10px!important;border-radius:11px!important;font-size:10px!important;background:rgba(255,107,134,.10)!important;color:#ff9caf!important;border:1px solid rgba(255,107,134,.18)!important;box-shadow:none!important}

    body.dark #debtListSection{margin-bottom:14px!important}
    body.dark #debtListSection .boardHeader{margin-bottom:13px!important}
    body.dark #debtListSection .boardHeader h2{font-size:24px!important}
    body.dark #debtListSection .boardHeader>span{font-size:11px!important;color:#8fa4c1!important}
    body.dark #debtListSection .boardToolbar{margin-bottom:10px!important;gap:8px!important}
    body.dark #debtListSection .boardToolbar input,body.dark #debtListSection .boardToolbar select{min-height:42px!important;border-radius:13px!important;font-size:12px!important}

    #v132Btn,#chatgptImportBtn{display:none!important}

    @media(max-width:1180px){
      body.dark #statsCard.dashboardStats{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      #newDebtSection.v152ToolsCard .actionToolbarGrid{grid-template-columns:repeat(3,minmax(0,1fr))!important}
    }
    @media(max-width:768px){
      body.dark .dashboardHeader{display:block!important}
      body.dark .heroTopActions{display:grid!important;grid-template-columns:1fr 1fr!important;margin-top:10px!important}
      body.dark .heroTopActions>button{width:100%!important}
      body.dark #statsCard.dashboardStats{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      body.dark #statsCard.dashboardStats .stat{min-height:92px!important;padding:13px!important}
      body.dark #statsCard .statValue{font-size:22px!important}
      body.dark #v141DashboardCheck .v141Grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      #newDebtSection.v152ToolsCard .actionToolbarGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      #newDebtSection.v152ToolsCard .driveToolbarGrid{grid-template-columns:1fr!important}
      .v152ToolExtras{display:grid;grid-template-columns:1fr!important}
      .v152ToolExtras .visibleViewSwitch{display:grid!important;grid-template-columns:1fr 1fr!important;width:100%!important}
    }
    @media(max-width:430px){
      body.dark .heroTopActions{grid-template-columns:1fr!important}
      body.dark #statsCard.dashboardStats{grid-template-columns:1fr 1fr!important}
      #newDebtSection.v152ToolsCard .actionToolbarGrid{grid-template-columns:1fr 1fr!important}
    }
  `;
  document.head.appendChild(s);
}

function ensureHeader(){
  const header=document.querySelector('.dashboardHeader');
  const actions=document.querySelector('.heroTopActions');
  if(!header||!actions)return;
  const eyebrow=header.querySelector('.eyebrow');if(eyebrow)eyebrow.textContent='Schulden Manager';
  const h1=$('greetingTitle');if(h1)h1.textContent='Schuldenübersicht';
  const p=$('greetingText');if(p)p.textContent='Forderungen, offene Daten und nächste Schritte auf einen Blick.';

  const view=document.querySelector('.visibleViewSwitch');
  const install=$('btnInstall');
  let tools=$('v152ToolsToggle');
  if(!tools){tools=document.createElement('button');tools.id='v152ToolsToggle';tools.type='button';actions.appendChild(tools);}
  tools.textContent=toolsOpen?'⚙ Werkzeuge schließen':'⚙ Werkzeuge';
  tools.classList.toggle('v152Open',toolsOpen);

  let insolv=$('v152InsolvencyBtn');
  if(!insolv){insolv=document.createElement('button');insolv.id='v152InsolvencyBtn';insolv.type='button';insolv.textContent='🧭 Insolvenz';const add=$('btnOpenAdd');if(add&&add.nextSibling)actions.insertBefore(insolv,add.nextSibling);else actions.prepend(insolv);}

  const card=$('newDebtSection');if(!card)return;
  let extras=$('v152ToolExtras');
  if(!extras){extras=document.createElement('div');extras.id='v152ToolExtras';extras.className='v152ToolExtras';const grid=card.querySelector('.actionToolbarGrid');if(grid)grid.insertAdjacentElement('afterend',extras);else card.appendChild(extras);}
  if(view&&view.parentElement!==extras)extras.appendChild(view);
  if(install&&install.parentElement!==extras)extras.appendChild(install);
  if(!$('v152ChatgptTool')){const b=document.createElement('button');b.id='v152ChatgptTool';b.type='button';b.className='secondary';b.textContent='🤖 ChatGPT Import';extras.appendChild(b);}
}

function organizeTools(){
  const main=document.querySelector('.dashboardMainColumn');
  const stats=$('statsCard'),tools=$('newDebtSection'),debts=$('debtListSection');
  if(!main||!stats||!tools||!debts)return;
  tools.classList.add('v152ToolsCard');
  tools.classList.toggle('v152Open',toolsOpen);
  const title=tools.querySelector('.compactTitle h2');if(title)title.textContent='Werkzeuge';
  const sub=tools.querySelector('.compactTitle span');if(sub)sub.textContent='Backup, Export, Google Drive, Ansicht und Import';

  // Reihenfolge bewusst: Kennzahlen -> Aufgaben (v141 wird hinter stats eingefügt) -> Werkzeuge -> Schuldenliste.
  if(stats.parentElement===main)main.insertBefore(stats,main.firstElementChild);
  if(tools.parentElement===main)main.insertBefore(tools,debts);

  const clear=$('btnClear');
  let danger=$('v152DangerRow');
  if(!danger){danger=document.createElement('div');danger.id='v152DangerRow';danger.className='v152DangerRow';tools.appendChild(danger);}
  if(clear&&clear.parentElement!==danger){clear.textContent='⚠ Alle Schulden löschen';danger.appendChild(clear);}
}

function tidyTaskBox(){
  const box=$('v141DashboardCheck');if(!box)return;
  const b=box.querySelector('.v141Head b');if(b)b.textContent='Offene Aufgaben';
  const s=box.querySelector('.v141Head span');if(s)s.textContent='Klick öffnet den Insolvenz-Arbeitsbereich';
}

function tidyDebtBoard(){
  const board=$('debtListSection');if(!board)return;
  const sub=board.querySelector('.boardHeader>span');if(sub)sub.textContent='Suchen, filtern und Einträge bearbeiten';
}

function refresh(){ensureStyle();ensureHeader();organizeTools();tidyTaskBox();tidyDebtBoard();}
function refreshLater(){[0,80,220,650,1300].forEach(ms=>setTimeout(refresh,ms));}

function toggleTools(){toolsOpen=!toolsOpen;refresh();if(toolsOpen)setTimeout(()=>$('newDebtSection')?.scrollIntoView({behavior:'smooth',block:'nearest'}),40);}

document.addEventListener('click',e=>{
  if(e.target?.closest?.('#v152ToolsToggle')){e.preventDefault();e.stopPropagation();toggleTools();return;}
  if(e.target?.closest?.('#v152InsolvencyBtn')){e.preventDefault();if(typeof window.v132InsolvenzOpen==='function')window.v132InsolvenzOpen('status');else $('v132Btn')?.click();return;}
  if(e.target?.closest?.('#v152ChatgptTool')){e.preventDefault();if(typeof window.v150ChatgptImportOpen==='function')window.v150ChatgptImportOpen();else $('chatgptImportBtn')?.click();return;}
  if(e.target?.closest?.('button'))refreshLater();
},true);

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refreshLater,{once:true});else refreshLater();
window.v152DashboardRefresh=refreshLater;
})();
