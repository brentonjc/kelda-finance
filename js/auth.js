// ══════════════════════════════════════════════════════════════
// LOGIN / PIN
// ══════════════════════════════════════════════════════════════
let curPin='',pendingPin='',activeProfile='brenton',isSetup=false,loggedIn=false;
let pinFailCount=0,pinLockedUntil=0;
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

// Session timeout — auto-lock after 15 minutes of inactivity
function resetSessionTimer() {
  if (!loggedIn) return;
  clearTimeout(_sessionTimer);
  _sessionTimer = setTimeout(function() {
    if (loggedIn) { lockApp(); showPinErr('Session expired — please re-enter your PIN'); }
  }, SESSION_TIMEOUT_MS);
}

function selProfile(p){
  activeProfile=p;curPin='';pendingPin='';
  document.getElementById('pb-brenton').classList.toggle('sel',p==='brenton');
  document.getElementById('pb-shelley').classList.toggle('sel',p==='shelley');
  const jb=document.getElementById('pb-joint');
  if(jb)jb.classList.toggle('sel',p==='joint');
  pinFailCount = 0;

  // Joint profile: no PIN required — enters directly
  if(p==='joint'){
    document.getElementById('pin-hint').textContent='Tap below to enter combined view';
    document.getElementById('setup-banner').style.display='none';
    document.getElementById('pin-err').textContent='';
    // Show a single "Enter" button instead of keypad
    document.getElementById('pin-dots').style.display='none';
    document.querySelector('.pin-pad').style.display='none';
    let enterBtn=document.getElementById('joint-enter-btn');
    if(!enterBtn){
      enterBtn=document.createElement('button');
      enterBtn.id='joint-enter-btn';
      enterBtn.className='btn btn-primary';
      enterBtn.style.cssText='width:100%;margin-top:8px';
      enterBtn.textContent='Enter Joint View';
      enterBtn.onclick=function(){unlock();};
      document.querySelector('.login-card').appendChild(enterBtn);
    }
    enterBtn.style.display='';
    return;
  }

  // Restore keypad for Brenton/Shelley
  document.getElementById('pin-dots').style.display='';
  document.querySelector('.pin-pad').style.display='';
  const eb=document.getElementById('joint-enter-btn');
  if(eb)eb.style.display='none';

  isSetup=!PINS[p];
  document.getElementById('pin-hint').textContent=isSetup?'Set a new 4-digit PIN':'Enter your PIN';
  document.getElementById('setup-banner').style.display=isSetup?'block':'none';
  document.getElementById('pin-err').textContent='';
  updateDots();
}

function pk(d){
  if(pinLockedUntil > Date.now()) {
    const s = Math.ceil((pinLockedUntil - Date.now()) / 1000);
    showPinErr('Locked — wait ' + s + 's'); return;
  }
  if(curPin.length>=4)return;
  curPin+=d;updateDots();
  if(curPin.length===4)setTimeout(handlePin,120);
}
function pd(){curPin=curPin.slice(0,-1);updateDots();document.getElementById('pin-err').textContent='';}
function updateDots(){for(let i=0;i<4;i++)document.getElementById('d'+i).classList.toggle('on',i<curPin.length);}

function forgotPin(){
  const name = typeof getUserName === 'function' ? getUserName(activeProfile) : activeProfile;
  if(!confirm('Reset PIN for '+name+'?\n\nYour financial data will NOT be deleted — only the PIN is removed. You\'ll set a new one now.')){return;}
  delete PINS[activeProfile];
  try { save(K.pins, PINS); } catch(e) {}
  location.reload();
}


function showPinScreen() {
  var ws = document.getElementById('welcome-screen');
  var ps = document.getElementById('pin-screen');
  if (ws) ws.style.display = 'none';
  if (ps) ps.style.display = 'flex';
}
function hidePinScreen() {
  var ws = document.getElementById('welcome-screen');
  var ps = document.getElementById('pin-screen');
  if (ws) ws.style.display = 'flex';
  if (ps) ps.style.display = 'none';
}

function showPinErr(msg) {
  const errEl = document.getElementById('pin-err');
  if (errEl) errEl.textContent = msg;
}

function shakePinCard() {
  const card = document.querySelector('.login-card');
  if (!card) return;
  card.style.animation = 'none';
  void card.offsetHeight;
  card.style.animation = 'shake .35s ease';
}

function handlePin() {
  // Check lockout first
  const now = Date.now();
  if (pinLockedUntil > now) {
    const secsLeft = Math.ceil((pinLockedUntil - now) / 1000);
    showPinErr('Too many attempts — wait ' + secsLeft + 's');
    curPin = ''; updateDots(); return;
  }

  if (isSetup) {
    if (!pendingPin) {
      pendingPin = curPin; curPin = ''; updateDots();
      document.getElementById('pin-hint').textContent = 'Confirm your PIN';
      return;
    }
    if (curPin === pendingPin) {
      // Hash before storing
      hashPin(curPin).then(function(hashed) {
        PINS[activeProfile] = hashed;
        try { save(K.pins, PINS); } catch(e) {}
        curPin = ''; pendingPin = '';
        unlock();
      });
    } else {
      showPinErr("PINs don't match — try again");
      curPin = ''; pendingPin = ''; updateDots();
      document.getElementById('pin-hint').textContent = 'Set a new 4-digit PIN';
      shakePinCard();
    }
    return;
  }

  // Verify — hash input and compare to stored hash.
  // If kelda_pin_salt flag is absent, also try legacy charnley: salt
  // and transparently migrate on first successful match.
  const attempt = curPin;
  curPin = ''; updateDots();
  const saltMigrated = localStorage.getItem('kelda_pin_salt') === 'v2';
  hashPin(attempt).then(function(hashed) {
    if (hashed === PINS[activeProfile]) {
      pinFailCount = 0;
      unlock();
    } else if (!saltMigrated) {
      // Try legacy salt
      return hashPinLegacy(attempt).then(function(legacyHashed) {
        if (legacyHashed === PINS[activeProfile]) {
          // Match on old salt — rehash with new salt and migrate
          pinFailCount = 0;
          return hashPin(attempt).then(function(newHashed) {
            PINS[activeProfile] = newHashed;
            try { save(K.pins, PINS); } catch(e) {}
            try { localStorage.setItem('kelda_pin_salt', 'v2'); } catch(e) {}
            unlock();
            setTimeout(function() { toast('🔒 Security updated'); }, 600);
          });
        } else {
          _pinFail();
        }
      });
    } else {
      _pinFail();
    }
  });

  function _pinFail() {
    pinFailCount++;
    const remaining = PIN_MAX_ATTEMPTS - pinFailCount;
    if (pinFailCount >= PIN_MAX_ATTEMPTS) {
      pinLockedUntil = Date.now() + PIN_LOCKOUT_SECS * 1000;
      pinFailCount = 0;
      showPinErr('Too many attempts — locked for ' + PIN_LOCKOUT_SECS + 's');
      const iv = setInterval(function() {
        const sLeft = Math.ceil((pinLockedUntil - Date.now()) / 1000);
        if (sLeft <= 0) { clearInterval(iv); showPinErr(''); }
        else { showPinErr('Too many attempts — wait ' + sLeft + 's'); }
      }, 1000);
    } else {
      showPinErr('Incorrect PIN — ' + remaining + ' attempt' + (remaining !== 1 ? 's' : '') + ' remaining');
    }
    shakePinCard();
  }
}

function unlock(){
  loggedIn=true;
  // Reload data from localStorage (may have been scrubbed on lock)
  TX         = load(K.tx)        || [];
  BILLS      = load(K.bills)     || [];
  MORTGAGE   = load(K.mortgage)  || {};
  INS        = load(K.ins)       || [];
  SUPER      = load(K.superdata) || {};
  GOALS      = load(K.goals)     || [];
  CT         = load(K.ct)        || {};
  LRECURRING = load(K.recurring) || [];
  TRANSFERS  = load(K.transfers) || [];
  EQUITIES   = load(K.equities)  || [];
  BUDGETS    = load(K.budgets)   || {};
  LBUDGETS   = load(K.lbudgets)  || {};
  LRULES     = load(K.rules)     || {};
  // Hide login screen first — before anything that could throw
  document.getElementById('login-screen').classList.add('gone');
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
  try{detectRecurring();}catch(e){console.warn('detectRecurring:',e);}
  try{autoDetectTransfers();}catch(e){console.warn('autoDetectTransfers:',e);}
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
  curPin = ''; pendingPin = '';
  clearTimeout(_sessionTimer); _sessionTimer = null;

  // Scrub financial data from memory — forces reload from localStorage on next unlock
  TX = []; BILLS = []; MORTGAGE = {}; INS = []; SUPER = {};
  GOALS = []; CT = {}; LRECURRING = []; TRANSFERS = []; EQUITIES = [];
  BUDGETS = {}; LBUDGETS = {}; LRULES = {};

  // Reset all rendered content so data isn't visible in the DOM
  ['db-cashflow','db-spending','db-networth','db-accounts','db-cat-breakdown',
   'db-subcat-breakdown','tx-tbody','assets-stats','bva-tbody'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  document.getElementById('login-screen').classList.remove('gone');
  hidePinScreen();
  var _tabBar=document.getElementById('bottom-tab-bar');
  var _fab=document.getElementById('fab');
  if(_tabBar)_tabBar.style.display='none';
  if(_fab)_fab.style.display='none';
  document.getElementById('mob-menu-overlay').style.display='none';
  document.getElementById('mob-menu').style.display='none';
  updateDots();
  showPinErr('');
  pinFailCount = 0;
  selProfile(activeProfile);
}

document.addEventListener('keydown',e=>{
  if(document.getElementById('login-screen').classList.contains('gone'))return;
  if(e.key>='0'&&e.key<='9')pk(e.key);
  if(e.key==='Backspace')pd();
});
