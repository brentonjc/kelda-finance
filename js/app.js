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
const PAGES=['dashboard','transactions','bills','goals','mortgage','cash','insurance','super','tax','assets','bva','categories','export','forecast','transfers','equities','settings'];

function go(id){
  PAGES.forEach(p=>{
    var pg=document.getElementById('page-'+p);
    var nv=document.getElementById('n-'+p);
    if(pg) pg.classList.toggle('active',p===id);
    if(nv) nv.classList.toggle('active',p===id);
  });
  try{
    if(id==='dashboard')renderDashboard();
    else if(id==='transactions'){renderTx();populateTxCatSelect();}
    else if(id==='bills')renderBills();
    else if(id==='goals'){if(typeof renderGoalsPage==='function')renderGoalsPage();}
    else if(id==='mortgage')renderMortgage();
    else if(id==='cash')renderCashTracker();
    else if(id==='insurance')renderInsurance();
    else if(id==='super')renderSuperPage();
    else if(id==='assets')renderAssets();
    else if(id==='export')renderExportPage();
    else if(id==='tax')renderTax();
    else if(id==='bva')renderBVA();
    else if(id==='categories')renderCategories();
    else if(id==='transfers'){if(typeof renderTransfersPage==='function')renderTransfersPage();}
    else if(id==='forecast'){detectRecurring();renderForecast();}
    else if(id==='equities'){if(typeof renderEquitiesPage==='function')renderEquitiesPage();}
    else if(id==='settings'){if(typeof renderSettings==='function')renderSettings();}
  }catch(e){console.warn('render error for page',id,e);}
  window.scrollTo(0,0);
  // Sync mobile tab bar
  var tabs=['dashboard','bva','bills','transactions','cash'];
  tabs.forEach(function(t){
    var btn=document.getElementById('tb-'+t);
    if(btn)btn.classList.toggle('active',t===id);
  });
  var stPages=['categories','export','mortgage','cash','insurance','super','tax','assets','transfers','forecast'];
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
  var settingsPages = ['categories','export','mortgage','cash','insurance','super','tax','assets','transfers','forecast'];
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
  if (profileId === 'brenton') return USER_CONFIG.p1name || 'Brenton';
  if (profileId === 'shelley') return USER_CONFIG.p2name || 'Shelley';
  return profileId;
}
function getUserIcon(profileId) {
  if (profileId === 'brenton') return USER_CONFIG.p1icon || '👔';
  if (profileId === 'shelley') return USER_CONFIG.p2icon || '👩';
  return '👤';
}
function getAccountName(acctId) {
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
  USER_CONFIG.p1name = g('usc-p1name').trim() || 'Brenton';
  USER_CONFIG.p1icon = g('usc-p1icon').trim() || '👔';
  USER_CONFIG.p2name = g('usc-p2name').trim() || 'Shelley';
  USER_CONFIG.p2icon = g('usc-p2icon').trim() || '👩';
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
    if (typeof renderTax         === 'function') renderTax();
  }
  var panel = document.getElementById('user-settings-panel');
  if (panel) panel.style.display = 'none';
  toast('Settings saved');
}

// ── APP NAME ─────────────────────────────────────────────────
var APP_NAME_KEY = 'cff_app_name';
var APP_SUB_KEY  = 'cff_app_sub';

function getAppName() {
  try { return localStorage.getItem(APP_NAME_KEY) || 'Charnley Finance'; } catch(e) { return 'Charnley Finance'; }
}
function getAppSub() {
  try { return localStorage.getItem(APP_SUB_KEY) || 'Family Finance Tracker · AUD'; } catch(e) { return 'Family Finance Tracker · AUD'; }
}
function setAppName(name, sub) {
  try {
    localStorage.setItem(APP_NAME_KEY, name || 'Charnley Finance');
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
  USER_CONFIG.p1icon = g('usc-p1icon-d').trim() || '👔';
  USER_CONFIG.p1name = g('usc-p1name-d').trim() || 'Brenton';
  USER_CONFIG.p2icon = g('usc-p2icon-d').trim() || '👩';
  USER_CONFIG.p2name = g('usc-p2name-d').trim() || 'Shelley';
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
  var name = (document.getElementById('rename-app-name-d')?.value||'').trim()||'Charnley Finance';
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
  var name = (document.getElementById('rename-app-name')?.value || '').trim() || 'Charnley Finance';
  var sub  = (document.getElementById('rename-app-sub')?.value  || '').trim() || 'Family Finance Tracker · AUD';
  setAppName(name, sub);
  var panel = document.getElementById('rename-app-panel');
  if (panel) panel.style.display = 'none';
  toast('App name updated to "' + name + '"');
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
