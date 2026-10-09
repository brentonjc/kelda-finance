// ══════════════════════════════════════════════════════════════
// AUTH CORE — crypto, verification, session, unlock/lock
//   UI (profile picker, PIN keypad, welcome/data-health) lives in login.js.
//   This file is DOM-agnostic except for unlock()/lockApp() app-shell wiring.
// ══════════════════════════════════════════════════════════════
let activeProfile='brenton',loggedIn=false;
let _sessionTimer=null;
const PIN_MAX_ATTEMPTS=5, PIN_LOCKOUT_SECS=30, SESSION_TIMEOUT_MS=15*60*1000;


// SHA-256 via Web Crypto API — returns hex string (new kelda: salt)
async function hashPin(pin) {
  const msgBuffer = new TextEncoder().encode('kelda:' + pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// Legacy hash (charnley: salt) — used only for one-time migration
async function hashPinLegacy(pin) {
  const msgBuffer = new TextEncoder().encode('charnley:' + pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// Migrate any plaintext PINs to hashed on first load
async function migratePlaintextPins() {
  let changed = false;
  for (const p of ['brenton','shelley']) {
    const stored = PINS[p];
    if (stored && stored.length !== 64) { // not a SHA-256 hex string
      PINS[p] = await hashPin(stored);
      changed = true;
    }
  }
  if (changed) try { save(K.pins, PINS); } catch(e) {}
}

// Does this profile still need to set a PIN? (joint never needs one)
function profileNeedsSetup(profile) {
  return profile !== 'joint' && !PINS[profile];
}

// Store a freshly chosen PIN (setup flow). Returns a Promise.
function setPin(profile, pin) {
  return hashPin(pin).then(function(hashed) {
    PINS[profile] = hashed;
    try { save(K.pins, PINS); } catch(e) {}
    try { localStorage.setItem('kelda_pin_salt', 'v2'); } catch(e) {}
    return true;
  });
}

// Verify an entered PIN against the stored hash. Reuses the new (kelda:) salt
// and transparently migrates a legacy (charnley:) hash on first correct match.
// Returns Promise<{ ok:boolean, migrated:boolean }>.
function verifyPin(profile, attempt) {
  const saltMigrated = localStorage.getItem('kelda_pin_salt') === 'v2';
  return hashPin(attempt).then(function(hashed) {
    if (hashed === PINS[profile]) return { ok:true, migrated:false };
    if (!saltMigrated) {
      return hashPinLegacy(attempt).then(function(legacyHashed) {
        if (legacyHashed === PINS[profile]) {
          // Match on old salt — rehash with the new salt and migrate.
          return hashPin(attempt).then(function(newHashed) {
            PINS[profile] = newHashed;
            try { save(K.pins, PINS); } catch(e) {}
            try { localStorage.setItem('kelda_pin_salt', 'v2'); } catch(e) {}
            return { ok:true, migrated:true };
          });
        }
        return { ok:false, migrated:false };
      });
    }
    return { ok:false, migrated:false };
  });
}

// Session timeout — auto-lock after 15 minutes of inactivity
function resetSessionTimer() {
  if (!loggedIn) return;
  clearTimeout(_sessionTimer);
  _sessionTimer = setTimeout(function() {
    if (loggedIn) { lockApp(); if (typeof loginNote === 'function') loginNote('Session expired — please re-enter your PIN'); }
  }, SESSION_TIMEOUT_MS);
}

function unlock(){
  loggedIn=true;
  // Record last-in time for this profile (drives the picker's "Last in …" meta)
  try { var _li = load(K.lastIn) || {}; _li[activeProfile] = Date.now(); save(K.lastIn, _li); } catch(e) {}
  // Reload data from localStorage (may have been scrubbed on lock)
  TX          = load(K.tx)           || [];
  BILLS       = load(K.bills)        || [];
  BILL_ALIASES    = load(K.billAliases)    || {};
  BILLS_DISMISSED = load(K.billsDismissed) || [];
  MORTGAGE    = load(K.mortgage)     || {};
  INS         = load(K.ins)          || [];
  SUPER       = load(K.superdata)    || {};
  GOALS       = load(K.goals)        || [];
  CT          = load(K.ct)           || {};
  LRECURRING  = load(K.recurring)    || [];
  TRANSFERS   = load(K.transfers)    || [];
  EQUITIES    = load(K.equities)     || [];
  LIABILITIES = load(K.liabilities)  || [];
  BUDGETS     = load(K.budgets)      || {};
  LBUDGETS    = load(K.lbudgets)     || {};
  LRULES      = load(K.rules)        || {};
  try { if (typeof migrateRulesToPattern === 'function') migrateRulesToPattern(); } catch(e) { console.warn('migrateRulesToPattern:', e); }
  try { if (typeof migrateTxFields === 'function') migrateTxFields(); } catch(e) { console.warn('migrateTxFields:', e); }
  try { if (typeof initAliasKeys === 'function') initAliasKeys(); } catch(e) { console.warn('initAliasKeys:', e); }
  try { if (typeof seedLRulesFromCSV === 'function') seedLRulesFromCSV(); } catch(e) { console.warn('seedLRulesFromCSV:', e); }
  // Monthly tracking grids
  SUPER_MONTHLY = load(K.superMonthly) || {};
  LIAB_MONTHLY  = load(K.liabMonthly)  || {};
  EQ_MONTHLY    = load(K.eqMonthly)    || {};
  // Hide login screen first — before anything that could throw
  document.getElementById('login-screen').classList.add('gone');
  // Now inside the app: apply the user's saved light/dark preference (the
  // landing screen forces dark; see applyThemeForContext in app.js).
  if (typeof applyThemeForContext === 'function') applyThemeForContext();
  var _tabBar=document.getElementById('bottom-tab-bar');
  var _fab=document.getElementById('fab');
  if(_tabBar)_tabBar.style.removeProperty('display');
  if(_fab)_fab.style.removeProperty('display');
  try { applyUserConfig(); } catch(e) { console.warn('applyUserConfig:', e); }
  resetSessionTimer();
  // Activity events restart the timeout
  ['click','keydown','touchstart'].forEach(function(ev) {
    document.addEventListener(ev, resetSessionTimer, { passive: true });
  });
  var _tu=document.getElementById('topbar-user');
  if(_tu)_tu.textContent=activeProfile==='joint'?'Joint':(typeof getUserName==='function'?getUserName(activeProfile):activeProfile);
  const mu=document.getElementById('mob-user');if(mu)mu.textContent=getUserIcon(activeProfile)+' '+getUserName(activeProfile);
  try{if(typeof renderNavUser==='function')renderNavUser();}catch(e){console.warn('renderNavUser:',e);}
  try{if(typeof updateNotifDot==='function')updateNotifDot();}catch(e){console.warn('updateNotifDot:',e);}
  try{if(typeof renderTopbarGreeting==='function')renderTopbarGreeting();}catch(e){console.warn('renderTopbarGreeting:',e);}
  var _txDate=document.getElementById('tx-date');if(_txDate)_txDate.value=today();
  try{if(typeof renderSnapshot==='function')renderSnapshot();}catch(e){console.warn('renderSnapshot:',e);}
  try{renderDashboard();}catch(e){console.warn('renderDashboard:',e);}
  try{renderTx();}catch(e){console.warn('renderTx:',e);}
  try{renderBills();}catch(e){console.warn('renderBills:',e);}
  try{renderMortgage();}catch(e){console.warn('renderMortgage:',e);}
  try{renderCashTracker();}catch(e){console.warn('renderCashTracker:',e);}
  try{renderInsurance();}catch(e){console.warn('renderInsurance:',e);}
  try{renderSuperPage();}catch(e){console.warn('renderSuperPage:',e);}
  try{renderAssets();}catch(e){console.warn('renderAssets:',e);}
  try{renderCategories();}catch(e){console.warn('renderCategories:',e);}
  try{populateTxCatSelect();}catch(e){console.warn('populateTxCatSelect:',e);}
  try{renderIconPicker();}catch(e){console.warn('renderIconPicker:',e);}
  try{autoDetectTransfers();}catch(e){console.warn('autoDetectTransfers:',e);}
  // First login after onboarding → open the Quick Start guide (one-shot).
  try {
    if (localStorage.getItem('kf_show_quickstart') === 'true') {
      localStorage.removeItem('kf_show_quickstart');
      setTimeout(function(){ try { if (typeof go === 'function') go('quickstart'); } catch(e){} }, 350);
    }
  } catch(e) {}
  // Deferred init: DOM-dependent work after render cycle completes
  setTimeout(() => {
    renderD293Section();
    syncOffsetToMortgage();
    renderRateSensitivity();
    // Pre-fill life insurance fields from super/mortgage data
    if (MORTGAGE.balance) {
      const half = MORTGAGE.balance / 2;
      ['li-b-mortgage','li-s-mortgage'].forEach(id => {
        const e = document.getElementById(id);
        if (e && !e.value) e.value = half;
      });
    }
    if (SUPER.b?.balance) { const e=document.getElementById('li-b-assets'); if(e&&!e.value) e.value=SUPER.b.balance; }
    if (SUPER.s?.balance) { const e=document.getElementById('li-s-assets'); if(e&&!e.value) e.value=SUPER.s.balance; }
    if (SUPER.b?.salary)  { const e=document.getElementById('li-b-income'); if(e&&!e.value) e.value=SUPER.b.salary; }
    if (SUPER.s?.salary)  { const e=document.getElementById('li-s-income'); if(e&&!e.value) e.value=SUPER.s.salary; }
    if (SUPER.b?.age)     { const e=document.getElementById('li-b-age'); if(e&&!e.value) e.value=SUPER.b.age; }
    if (SUPER.s?.age)     { const e=document.getElementById('li-s-age'); if(e&&!e.value) e.value=SUPER.s.age; }
    calcLifeNeeds();
  }, 300);
}

function lockApp(){
  loggedIn = false;
  clearTimeout(_sessionTimer); _sessionTimer = null;

  // Scrub financial data from memory — forces reload from localStorage on next unlock
  TX = []; BILLS = []; BILL_ALIASES = {}; BILLS_DISMISSED = []; MORTGAGE = {}; INS = []; SUPER = {};
  GOALS = []; CT = {}; LRECURRING = []; TRANSFERS = []; EQUITIES = [];
  LIABILITIES = []; BUDGETS = {}; LBUDGETS = {}; LRULES = {};
  SUPER_MONTHLY = {}; LIAB_MONTHLY = {}; EQ_MONTHLY = {};
  if (typeof resetRuleIndex === 'function') resetRuleIndex();

  // Reset all rendered content so data isn't visible in the DOM
  ['db-cashflow','db-spending','db-networth','db-accounts','db-cat-breakdown',
   'db-subcat-breakdown','tx-tbody','assets-stats','bva-tbody','page-tax'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  if (typeof taxOnLock === 'function') taxOnLock();
  document.getElementById('login-screen').classList.remove('gone');
  // Back on the landing screen — force dark regardless of saved preference.
  if (typeof applyThemeForContext === 'function') applyThemeForContext();
  var _tabBar=document.getElementById('bottom-tab-bar');
  var _fab=document.getElementById('fab');
  if(_tabBar)_tabBar.style.display='none';
  if(_fab)_fab.style.display='none';
  var _mo=document.getElementById('mob-menu-overlay'); if(_mo)_mo.style.display='none';
  var _mm=document.getElementById('mob-menu'); if(_mm)_mm.style.display='none';
  // Hand control back to the login controller (rebuilds picker/PIN from scratch)
  if (typeof loginInit === 'function') loginInit();
}
