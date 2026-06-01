// ══════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════
const fmt=n=>'$'+Number(n||0).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2});
const today=()=>new Date().toISOString().split('T')[0];
const thisMonth=()=>new Date().toISOString().slice(0,7);


// Safe Chart.js wrapper — handles CDN load failure gracefully
function safeChart(canvas, config) {
  if (typeof Chart === 'undefined') {
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#8a8095';
      ctx.font = '13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Charts unavailable — check internet connection', canvas.width / 2, canvas.height / 2);
    }
    return null;
  }
  try { return new Chart(canvas, config); }
  catch(e) { console.error('Chart error:', e); return null; }
}

function toast(msg,dur=2400){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),dur);
}

// ══════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════
const PAGES=['dashboard','insights','transactions','bills','goals','mortgage','liabilities','cash','insurance','super','assets','bva','categories','export','forecast','transfers','equities','settings','health'];

function go(id){
  PAGES.forEach(p=>{
    var pg=document.getElementById('page-'+p);
    var nv=document.getElementById('n-'+p);
    if(pg) pg.classList.toggle('active',p===id);
    if(nv) nv.classList.toggle('active',p===id);
  });
  // Inject how-to guide once per page (idempotent)
  if (typeof renderHowTo === 'function') {
    var _htEl = document.getElementById('how-to-' + id);
    if (_htEl && !_htEl.dataset.filled) { _htEl.innerHTML = renderHowTo(id); _htEl.dataset.filled = '1'; }
  }
  try{
    if(id==='dashboard')renderDashboard();
    else if(id==='insights'){if(typeof renderInsights==='function')renderInsights();}
    else if(id==='transactions'){renderTx();populateTxCatSelect();}
    else if(id==='bills')renderBills();
    else if(id==='goals'){if(typeof renderGoalsPage==='function')renderGoalsPage();}
    else if(id==='mortgage')renderMortgage();
    else if(id==='liabilities'){if(typeof liabRenderPage==='function')liabRenderPage();}
    else if(id==='cash')renderCashTracker();
    else if(id==='insurance')renderInsurance();
    else if(id==='super')renderSuperPage();
    else if(id==='assets')renderAssets();
    else if(id==='export')renderExportPage();
    else if(id==='bva')renderBVA();
    else if(id==='categories')renderCategories();
    else if(id==='transfers'){if(typeof renderTransfersPage==='function')renderTransfersPage();}
    else if(id==='forecast'){detectRecurring();renderForecast();if(typeof fc2SyncBalance==='function')fc2SyncBalance();}
    else if(id==='equities'){if(typeof renderEquitiesPage==='function')renderEquitiesPage();}
    else if(id==='settings'){if(typeof renderSettings==='function')renderSettings();}
    else if(id==='health'){if(typeof renderHealthPage==='function')renderHealthPage();}
  }catch(e){console.warn('render error for page',id,e);}
  window.scrollTo(0,0);
  // Sync mobile tab bar
  var tabs=['dashboard','bva','bills','transactions','cash'];
  tabs.forEach(function(t){
    var btn=document.getElementById('tb-'+t);
    if(btn)btn.classList.toggle('active',t===id);
  });
  var stPages=['dashboard','insights','categories','export','mortgage','liabilities','cash','insurance','super','assets','transfers','forecast'];
  var stBtn=document.getElementById('tb-settings');
  if(stBtn)stBtn.classList.toggle('active',stPages.indexOf(id)>=0);
}


// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
function isTransfer(t){return TRANSFERS.some(tr=>tr.txIdA===t.id||tr.txIdB===t.id);}
function activeTX(){
  const base=TX.filter(t=>!isTransfer(t));
  // Joint view shows all transactions from both profiles
  if(activeProfile==='joint')return base;
  return base.filter(t=>!t.person||t.person===activeProfile||t.person==='joint');
}
function getMonthInc(ym=thisMonth()){return activeTX().filter(t=>t.type==='income'&&t.date.startsWith(ym)).reduce((s,t)=>s+Number(t.amount),0);}
function getMonthExp(ym=thisMonth()){return activeTX().filter(t=>t.type==='expense'&&t.date.startsWith(ym)).reduce((s,t)=>s+Number(t.amount),0);}
function getCatSpend(cat,ym=thisMonth()){return activeTX().filter(t=>t.type==='expense'&&t.category===cat&&t.date.startsWith(ym)).reduce((s,t)=>s+Number(t.amount),0);}
function getTotalBal(){return activeTX().reduce((s,t)=>t.type==='income'?s+Number(t.amount):s-Number(t.amount),0);}

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
// ── DASHBOARD STATE ───────────────────────────────────────────

function goMob(pageId) {
  closeMobMenu();
  go(pageId);
  // Update tab bar active state
  var tabs = ['dashboard','bills','transactions','cash'];
  tabs.forEach(function(t) {
    var btn = document.getElementById('tb-' + t);
    if (btn) btn.classList.toggle('active', t === pageId);
  });
  // Settings btn active if settings-related page
  var settingsPages = ['categories','export','mortgage','cash','insurance','super','assets','transfers','forecast'];
  var settBtn = document.getElementById('tb-settings');
  if (settBtn) settBtn.classList.toggle('active', settingsPages.indexOf(pageId) >= 0);
}

function openMobMenu() {
  var overlay = document.getElementById('mob-menu-overlay');
  var menu    = document.getElementById('mob-menu');
  if (overlay) overlay.style.display = 'block';
  if (menu) {
    menu.style.display = 'block';
    setTimeout(function() { menu.classList.add('open'); }, 10);
  }
}

function closeMobMenu() {
  var overlay = document.getElementById('mob-menu-overlay');
  var menu    = document.getElementById('mob-menu');
  if (menu) {
    menu.classList.remove('open');
    setTimeout(function() { if (!menu.classList.contains('open')) menu.style.display = 'none'; }, 310);
  }
  if (overlay) overlay.style.display = 'none';
}



// ── USER & ACCOUNT CONFIG ─────────────────────────────────────
function getUserName(profileId) {
  if (profileId === 'brenton') return USER_CONFIG.p1name || 'Profile 1';
  if (profileId === 'shelley') return USER_CONFIG.p2name || 'Profile 2';
  return profileId;
}
function getUserIcon(profileId) {
  if (profileId === 'brenton') return USER_CONFIG.p1icon || '👤';
  if (profileId === 'shelley') return USER_CONFIG.p2icon || '👤';
  return '👤';
}
function getAccountName(acctId) {
  // Check ACCOUNTS first (covers custom + renamed core accounts)
  if (typeof ACCOUNTS !== 'undefined' && ACCOUNTS) {
    var acct = ACCOUNTS.find(function(a){ return a.id === acctId; });
    if (acct && acct.name) return acct.name;
  }
  var defaults = {offset:'Offset Account',home:'Home Transaction',sav1:'Savings Account 1',sav2:'Savings Account 2'};
  return USER_CONFIG['acct_' + acctId] || CTCFG[acctId + 'Lbl'] || defaults[acctId] || acctId;
}
function saveUserConfig() {
  try { localStorage.setItem('cff_userconfig', JSON.stringify(USER_CONFIG)); } catch(e) {}
}
function applyUserConfig() {
  // Profile buttons in login
  var pb1 = document.getElementById('pb-brenton');
  var pb2 = document.getElementById('pb-shelley');
  if (pb1) {
    var pi1 = pb1.querySelector('.pi');
    var pn1 = pb1.querySelector('.pn');
    if (pi1) pi1.textContent = getUserIcon('brenton');
    if (pn1) pn1.textContent = getUserName('brenton');
  }
  if (pb2) {
    var pi2 = pb2.querySelector('.pi');
    var pn2 = pb2.querySelector('.pn');
    if (pi2) pi2.textContent = getUserIcon('shelley');
    if (pn2) pn2.textContent = getUserName('shelley');
  }
  // Topbar + mob-user (if logged in)
  if (loggedIn) {
    var tu = document.getElementById('topbar-user');
    if (tu) tu.textContent = getUserName(activeProfile);
    var mu = document.getElementById('mob-user');
    if (mu) mu.textContent = getUserIcon(activeProfile) + ' ' + getUserName(activeProfile);
  }
  // Update account labels in CT_ACCTS live labels
  CT_ACCTS.forEach(function(a) {
    var customName = getAccountName(a.id);
    // Update CTCFG so ctLabel() picks it up
    if (a.id === 'offset') CTCFG.offsetLbl = USER_CONFIG.acct_offset || a.def;
    if (a.id === 'home')   CTCFG.homeLbl   = USER_CONFIG.acct_home   || a.def;
    if (a.id === 'sav1')   CTCFG.sav1Lbl   = USER_CONFIG.acct_sav1   || a.def;
    if (a.id === 'sav2')   CTCFG.sav2Lbl   = USER_CONFIG.acct_sav2   || a.def;
  });
  try { save(K.ctcfg, CTCFG); } catch(e) {}
  // Update [data-profile-label] elements
  document.querySelectorAll('[data-profile-label]').forEach(function(el) {
    var p = el.getAttribute('data-profile-label');
    var text = el.textContent;
    // Only carry a suffix if the text contains ' — ' (e.g. "Brenton — Tax Position")
    // If the text is just a plain name with no dash, suffix is empty.
    var replaced = text.replace(/^.*? — /, '');
    var suffix = (replaced !== text) ? (' — ' + replaced) : '';
    el.textContent = getUserName(p) + suffix;
  });
  // Update <option data-profile-name> elements (person/account selects)
  document.querySelectorAll('option[data-profile-name]').forEach(function(opt) {
    var p = opt.getAttribute('data-profile-name');
    var suffix = opt.getAttribute('data-label-suffix') || '';
    opt.textContent = getUserName(p) + suffix;
  });
  // Show/hide profile 2 and joint buttons based on wizard config
  if (typeof applyLoginProfileVis === 'function') applyLoginProfileVis();
}
function openUserSettings() {
  var panel = document.getElementById('user-settings-panel');
  if (!panel) return;
  // Pre-fill with current values
  var fields = {
    'usc-p1name': getUserName('brenton'),
    'usc-p1icon': getUserIcon('brenton'),
    'usc-p2name': getUserName('shelley'),
    'usc-p2icon': getUserIcon('shelley'),
    'usc-acct-offset': getAccountName('offset'),
    'usc-acct-home':   getAccountName('home'),
    'usc-acct-sav1':   getAccountName('sav1'),
    'usc-acct-sav2':   getAccountName('sav2'),
  };
  Object.keys(fields).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = fields[id];
  });
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}
function saveUserSettings() {
  var g = function(id) { return (document.getElementById(id) || {}).value || ''; };
  USER_CONFIG.p1name = g('usc-p1name').trim() || 'Profile 1';
  USER_CONFIG.p1icon = g('usc-p1icon').trim() || '👤';
  USER_CONFIG.p2name = g('usc-p2name').trim() || 'Profile 2';
  USER_CONFIG.p2icon = g('usc-p2icon').trim() || '👤';
  USER_CONFIG.acct_offset = g('usc-acct-offset').trim() || 'Offset Account';
  USER_CONFIG.acct_home   = g('usc-acct-home').trim()   || 'Home Transaction';
  USER_CONFIG.acct_sav1   = g('usc-acct-sav1').trim()   || 'Savings Account 1';
  USER_CONFIG.acct_sav2   = g('usc-acct-sav2').trim()   || 'Savings Account 2';
  saveUserConfig();
  applyUserConfig();
  // Re-render any live views
  if (loggedIn) {
    if (typeof renderCashTracker === 'function') renderCashTracker();
    if (typeof renderDashboard   === 'function') renderDashboard();
    if (typeof renderInsurance   === 'function') renderInsurance();
    if (typeof renderSuperPage   === 'function') renderSuperPage();
  }
  var panel = document.getElementById('user-settings-panel');
  if (panel) panel.style.display = 'none';
  toast('Settings saved');
}

// ── APP NAME ─────────────────────────────────────────────────
var APP_NAME_KEY = 'cff_app_name';
var APP_SUB_KEY  = 'cff_app_sub';

function getAppName() {
  try { return localStorage.getItem(APP_NAME_KEY) || 'Kelda Finance'; } catch(e) { return 'Kelda Finance'; }
}
function getAppSub() {
  try { return localStorage.getItem(APP_SUB_KEY) || 'Family Finance Tracker · AUD'; } catch(e) { return 'Family Finance Tracker · AUD'; }
}
function setAppName(name, sub) {
  try {
    localStorage.setItem(APP_NAME_KEY, name || 'Kelda Finance');
    localStorage.setItem(APP_SUB_KEY,  sub  || 'Family Finance Tracker · AUD');
  } catch(e) {}
  applyAppName();
}
function applyAppName() {
  var name = getAppName();
  var sub  = getAppSub();
  // Update all app name display elements
  document.querySelectorAll('[data-app-name]').forEach(function(el) { el.textContent = name; });
  document.querySelectorAll('[data-app-sub]').forEach(function(el)  { el.textContent = sub;  });
  document.title = name;
}



function openUserSettingsDesktop() {
  var panel = document.getElementById('user-settings-desktop');
  if (!panel) return;
  var fill = function(deskId, val) { var e=document.getElementById(deskId); if(e) e.value=val; };
  fill('usc-p1icon-d', getUserIcon('brenton'));
  fill('usc-p1name-d', getUserName('brenton'));
  fill('usc-p2icon-d', getUserIcon('shelley'));
  fill('usc-p2name-d', getUserName('shelley'));
  fill('usc-acct-offset-d', getAccountName('offset'));
  fill('usc-acct-home-d',   getAccountName('home'));
  fill('usc-acct-sav1-d',   getAccountName('sav1'));
  fill('usc-acct-sav2-d',   getAccountName('sav2'));
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}
function saveDesktopUserSettings() {
  var g = function(id) { return (document.getElementById(id)||{}).value||''; };
  USER_CONFIG.p1icon = g('usc-p1icon-d').trim() || '👤';
  USER_CONFIG.p1name = g('usc-p1name-d').trim() || 'Profile 1';
  USER_CONFIG.p2icon = g('usc-p2icon-d').trim() || '👤';
  USER_CONFIG.p2name = g('usc-p2name-d').trim() || 'Profile 2';
  USER_CONFIG.acct_offset = g('usc-acct-offset-d').trim() || 'Offset Account';
  USER_CONFIG.acct_home   = g('usc-acct-home-d').trim()   || 'Home Transaction';
  USER_CONFIG.acct_sav1   = g('usc-acct-sav1-d').trim()   || 'Savings Account 1';
  USER_CONFIG.acct_sav2   = g('usc-acct-sav2-d').trim()   || 'Savings Account 2';
  saveUserConfig();
  applyUserConfig();
  if (loggedIn) {
    if (typeof renderCashTracker==='function') renderCashTracker();
    if (typeof renderDashboard==='function') renderDashboard();
  }
  document.getElementById('user-settings-desktop').style.display='none';
  toast('Settings saved');
}

function openDesktopRenameApp() {
  var panel = document.getElementById('rename-app-panel-desktop');
  if (!panel) return;
  document.getElementById('rename-app-name-d').value = getAppName();
  document.getElementById('rename-app-sub-d').value  = getAppSub();
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}
function saveDesktopAppName() {
  var name = (document.getElementById('rename-app-name-d')?.value||'').trim()||'Kelda Finance';
  var sub  = (document.getElementById('rename-app-sub-d')?.value||'').trim()||'Family Finance Tracker · AUD';
  setAppName(name, sub);
  document.getElementById('rename-app-panel-desktop').style.display='none';
  toast('App renamed to "'+name+'"');
}

function openRenameApp() {
  var name = getAppName();
  var sub  = getAppSub();
  var nameEl = document.getElementById('rename-app-name');
  var subEl  = document.getElementById('rename-app-sub');
  if (nameEl) nameEl.value = name;
  if (subEl)  subEl.value  = sub;
  var panel = document.getElementById('rename-app-panel');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function saveAppName() {
  var name = (document.getElementById('rename-app-name')?.value || '').trim() || 'Kelda Finance';
  var sub  = (document.getElementById('rename-app-sub')?.value  || '').trim() || 'Family Finance Tracker · AUD';
  setAppName(name, sub);
  var panel = document.getElementById('rename-app-panel');
  if (panel) panel.style.display = 'none';
  toast('App name updated to "' + name + '"');
}


// ── HOW-TO GUIDE ─────────────────────────────────────────────
var _HOW_TO = {
  transactions: { title:'Recording Transactions', items:[
    {icon:'➕', h:'Adding a transaction', b:'Fill in the date, type (income or expense), name, amount and category then tap Add. The name field auto-suggests a category based on the merchant name.'},
    {icon:'📂', h:'Categories & subcategories', b:'Assign every transaction a category so the Budget vs Actuals and Insights pages can analyse your spending accurately.'},
    {icon:'🔍', h:'Filtering & searching', b:'Use the month filter and search box to narrow down transactions. Bulk-select rows to reassign categories in one go.'},
    {icon:'📤', h:'Importing from CSV', b:'Use the Export tab to import a bank CSV. Columns are mapped to the app fields and auto-categorisation rules are applied.'}
  ]},
  bills: { title:'Managing Bills', items:[
    {icon:'➕', h:'Adding a bill', b:'Enter the name, amount, next due date and frequency. The due day-of-month is extracted from the date you pick and used for recurring tracking.'},
    {icon:'✔️', h:'Marking paid', b:'Tap "Paid" on a bill once you\'ve paid it. This clears it from upcoming alerts on the Dashboard. Reset at month start with "Undo".'},
    {icon:'💡', h:'Auto-detect', b:'The app scans your transactions for recurring insurance, utility, phone and childcare payments and suggests them as bills to add.'},
    {icon:'📅', h:'Frequency', b:'Set the correct frequency (monthly, fortnightly, yearly etc.) so the summary totals correctly reflect your actual commitments.'}
  ]},
  goals: { title:'Savings Goals', items:[
    {icon:'🎯', h:'Creating a goal', b:'Enter a name, target amount and optional target date. Tap an emoji icon from the preset row or type your own.'},
    {icon:'🔗', h:'Linking to Cash Tracker', b:'Link a goal to one of your savings accounts — the goal progress will automatically reflect the live balance from your Cash Tracker.'},
    {icon:'✏️', h:'Editing a goal', b:'Tap "✏️ Edit" on any goal card to update the name, icon, target amount, current amount, date or linked account.'},
    {icon:'📊', h:'Projection', b:'The goal card shows an estimated completion date based on the gap between current and target, or the target date if you set one.'}
  ]},
  bva: { title:'Budget vs Actuals', items:[
    {icon:'💰', h:'Setting budgets', b:'Enter a monthly limit for each spending category. Budgets persist month to month — you only need to set them once.'},
    {icon:'📊', h:'Reading the report', b:'Green = under budget. Amber = 70–99% used. Red = exceeded. The "Used" column shows actual spending from your transactions.'},
    {icon:'📅', h:'Month navigation', b:'Use the arrows to review past months. The budget limits are fixed; actual spending is pulled from your transaction history.'},
    {icon:'⚠️', h:'Budget alerts', b:'Alerts appear on the Dashboard for any category at 70%+ of its limit. Smart Insights on the dashboard also reference the top overrun.'}
  ]},
  forecast: { title:'Cash Flow Forecast', items:[
    {icon:'🔄', h:'How it works', b:'The forecast auto-detects recurring income and expense patterns from your last 90 days of transactions and projects them forward.'},
    {icon:'⟳', h:'Syncing', b:'The balance sync runs automatically when you open this tab, pulling the latest combined balance from your Cash Tracker as the starting point.'},
    {icon:'✏️', h:'Adjusting entries', b:'Tap the adjustment icon on any forecast row to add a one-off override — useful for planned expenses or income that differ from the pattern.'},
    {icon:'📈', h:'Cumulative view', b:'Toggle between monthly and cumulative chart views to see the overall trajectory of your cash position over time.'}
  ]},
  assets: { title:'Net Assets', items:[
    {icon:'🏦', h:'What is shown', b:'Net Assets = Gross Assets (bank + super + property + equities) minus Total Liabilities (mortgage + other debts). This is your true financial position.'},
    {icon:'🏡', h:'Property value', b:'The full home value is included in gross assets. The mortgage balance sits in liabilities — so net property equity flows through correctly.'},
    {icon:'📊', h:'Donuts', b:'The Assets Breakdown donut shows allocation by class. The Liabilities donut shows debt breakdown. Tap any segment to navigate to that page.'},
    {icon:'📈', h:'Debt ratio', b:'Liabilities ÷ Gross Assets. Below 30% is strong. Above 60% is high. Use this alongside the Health Score for a full picture.'}
  ]},
  super: { title:'Superannuation Projections', items:[
    {icon:'💼', h:'Entering your details', b:'Enter your current balance, age, retirement age and salary. The SGC rate defaults to 11.5% (current legal minimum). Add extra contributions if you salary sacrifice.'},
    {icon:'📈', h:'Growth scenarios', b:'Choose a scenario (Conservative / Balanced / Growth / High Growth) based on ASFA standard return assumptions. The return rate and fees fields auto-fill — you can override them.'},
    {icon:'💡', h:'Inflation adjustment', b:'The projection shows both nominal (raw) and real (inflation-adjusted) values. The real figure reflects actual purchasing power at retirement.'},
    {icon:'⚠️', h:'Estimates only', b:'These projections are illustrative only and not financial advice. Speak with a licensed financial adviser for personalised super planning.'}
  ]},
  insights: { title:'Insights & Analytics', items:[
    {icon:'📅', h:'Period navigation', b:'Switch between Monthly and Yearly views using the toggle. Navigate with the arrows or tap "Today" to return to the current period.'},
    {icon:'📈', h:'Net worth chart', b:'Shows your recorded net worth over time from the Cash Tracker history. Each point is a monthly snapshot — update your Cash Tracker regularly for accurate trend data.'},
    {icon:'💸', h:'Income flow (Sankey)', b:'The Sankey diagram shows how your income splits across spending categories. Hover or tap any flow to see the exact amount and percentage.'},
    {icon:'🔎', h:'Category drilldown', b:'The category and subcategory charts let you drill into exactly where money is going. Use the subcategory chart to find high-spend areas.'}
  ]},
  transfers: { title:'Transfers & Reconciliation', items:[
    {icon:'🔄', h:'What are transfers', b:'Transfers are movements between your own accounts (e.g. offset → savings). They are excluded from income/expense analysis to avoid double-counting.'},
    {icon:'✅', h:'Auto-detected pairs', b:'The app auto-matches same-amount income/expense pairs on the same or adjacent days. Confirm to tag them as transfers, or Dismiss to keep them in analysis.'},
    {icon:'🔗', h:'Manual linking', b:'If auto-detection missed a pair, use the manual link panel. Search for the two transactions, select both checkboxes, then tap "Link Selected".'},
    {icon:'↩️', h:'Unlinking', b:'Confirmed transfers can be unlinked at any time. Both transactions return to the "Other" category and reappear in your analysis.'}
  ]}
};

function renderHowTo(pageId) {
  var cfg = _HOW_TO[pageId];
  if (!cfg) return '';
  var itemsHtml = cfg.items.map(function(it) {
    return '<div class="how-to-item">'
      + '<div class="how-to-icon">' + it.icon + '</div>'
      + '<div><div class="how-to-title">' + it.h + '</div>'
      + '<div class="how-to-text">' + it.b + '</div></div>'
      + '</div>';
  }).join('');
  return '<div class="card how-to-card mb">'
    + '<div class="how-to-hd" onclick="this.parentNode.querySelector(\'.how-to-body\').style.display=this.parentNode.querySelector(\'.how-to-body\').style.display===\'none\'?\'grid\':\'none\';this.querySelector(\'.how-to-chev\').style.transform=this.parentNode.querySelector(\'.how-to-body\').style.display===\'none\'?\'\':\' rotate(180deg)\'">'
    + '<div style="display:flex;align-items:center;gap:10px"><span style="font-size:1.1rem">📖</span>'
    + '<div><div style="font-weight:700;font-size:.88rem;color:var(--text)">How to use — ' + cfg.title + '</div>'
    + '<div style="font-size:.72rem;color:var(--muted)">Tap to expand guide</div></div></div>'
    + '<span class="how-to-chev" style="font-size:.9rem;color:var(--muted);transition:transform .2s">▼</span>'
    + '</div>'
    + '<div class="how-to-body" style="display:none;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">'
    + itemsHtml
    + '</div>'
    + '</div>';
}

// ── FAB RADIAL MENU ──────────────────────────────────────────
function toggleFabMenu() {
  var menu = document.getElementById('fab-menu');
  var isOpen = menu && menu.classList.contains('open');
  if (isOpen) { closeFabMenu(); } else { openFabMenu(); }
}
function openFabMenu() {
  var menu    = document.getElementById('fab-menu');
  var fab     = document.getElementById('fab');
  var overlay = document.getElementById('fab-overlay');
  if (menu)    { menu.style.display = 'block'; setTimeout(function(){ menu.classList.add('open'); }, 10); }
  if (fab)     fab.classList.add('open');
  if (overlay) overlay.style.display = 'block';
}
function closeFabMenu() {
  var menu    = document.getElementById('fab-menu');
  var fab     = document.getElementById('fab');
  var overlay = document.getElementById('fab-overlay');
  if (menu)    { menu.classList.remove('open'); setTimeout(function(){ if (!menu.classList.contains('open')) menu.style.display = 'none'; }, 260); }
  if (fab)     fab.classList.remove('open');
  if (overlay) overlay.style.display = 'none';
}
function fabAction(action) {
  closeFabMenu();
  if (action === 'transaction') {
    goMob('transactions');
    setTimeout(function() {
      var addBtn = document.getElementById('tx-add-toggle');
      if (addBtn) addBtn.click();
    }, 300);
  } else if (action === 'import') {
    goMob('transactions');
    setTimeout(function() {
      var importSection = document.getElementById('import-section') || document.getElementById('csv-import-section');
      if (importSection) importSection.scrollIntoView({behavior:'smooth'});
    }, 300);
  } else if (action === 'bill') {
    goMob('bills');
  } else if (action === 'cash') {
    goMob('cash');
  } else if (action === 'transfer') {
    goMob('transfers');
  }
}

// ── THEME MANAGEMENT ──────────────────────────────────────────
function setTheme(name) {
  // 'system' means follow prefers-color-scheme (no data-theme attr)
  if(name==='system'){
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', name);
  }
  try { localStorage.setItem('cff_theme', name); } catch(e) {}
  document.querySelectorAll('.theme-btn').forEach(function(b) {
    b.classList.toggle('active', b.classList.contains('t-' + name));
  });
}

function loadTheme() {
  var saved;
  try { saved = localStorage.getItem('cff_theme'); } catch(e) {}
  // Default to dark — the designed-for theme
  if(!saved) saved = 'dark';
  setTheme(saved);
  // Listen for system theme changes and update if in system mode
  if(window.matchMedia){
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(){
      try { if((localStorage.getItem('cff_theme')||'system')==='system') setTheme('system'); } catch(e){}
    });
  }
}

// ══════════════════════════════════════════════════════════════
// MOBILE NAV
// ══════════════════════════════════════════════════════════════
function toggleNav(){
  const nav=document.getElementById('nav');
  const ov=document.getElementById('nav-overlay');
  const hb=document.getElementById('hamburger');
  const open=nav.classList.toggle('open');
  ov.classList.toggle('show',open);
  hb.classList.toggle('open',open);
}
function closeNav(){
  document.getElementById('nav').classList.remove('open');
  document.getElementById('nav-overlay').classList.remove('show');
  document.getElementById('hamburger').classList.remove('open');
}
// Auto-close nav on link tap (mobile)
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('#nav ul li a').forEach(a=>{
    a.addEventListener('click',()=>{if(window.innerWidth<=680)closeNav();});
  });
});

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
selProfile('brenton');
