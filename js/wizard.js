// ══════════════════════════════════════════════════════════════
// SETUP WIZARD — js/wizard.js
// First-run experience for Kelda Finance.
//
// New users  → see wizard (no kelda_wizard_complete + no PINs)
// Old users  → wizard silently skipped; PIN salt migrated on
//              next login entry (charnley: → kelda:)
// Re-run     → call wzRestart() from Settings
// ══════════════════════════════════════════════════════════════

var WIZARD_KEY   = 'kelda_wizard_complete';
var PIN_SALT_KEY = 'kelda_pin_salt';
var PIN_SALT_V2  = 'v2';

// ── Working state — collected during wizard, committed at end ─
var _wz = {
  appName : '', appSub  : '',
  p1Name  : '', p1Icon  : '👔',
  p1Input : '', p1First : '', p1Step : 0, p1Done : false,
  p2On    : true,
  p2Name  : '', p2Icon  : '👩',
  p2Input : '', p2First : '', p2Step : 0, p2Done : false,
  acctOffset : '', acctHome : '', acctSav1 : '', acctSav2 : ''
};

// Emoji palette for profile picker
var WZ_ICONS = ['👔','👩','🧑','👨','💼','👤','🧑‍💻','👩‍💼','🧔','👱'];

// ── SHA-256 with new kelda: salt ──────────────────────────────
async function wzHashPin(pin) {
  var buf  = new TextEncoder().encode('kelda:' + pin);
  var hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
}

// ── SHA-256 with legacy charnley: salt (migration only) ───────
async function wzHashPinLegacy(pin) {
  var buf  = new TextEncoder().encode('charnley:' + pin);
  var hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
}

// ══════════════════════════════════════════════════════════════
// FIRST-RUN DETECTION — called from DOMContentLoaded
// ══════════════════════════════════════════════════════════════
function checkFirstRun() {
  var done    = localStorage.getItem(WIZARD_KEY) === 'true';
  var hasPins = !!(PINS && (PINS.brenton || PINS.shelley));

  if (!done && !hasPins) {
    // Pure first run → mutate welcome screen for wizard mode
    _wzAdaptWelcome();
    return true;
  }

  if (!done && hasPins) {
    // Existing user predating wizard → mark done silently.
    // PIN salt migration runs transparently on next PIN entry.
    localStorage.setItem(WIZARD_KEY, 'true');
  }

  // Apply profile button visibility for returning users
  applyLoginProfileVis();
  return false;
}

// ── Modify welcome screen CTA for new users ───────────────────
function _wzAdaptWelcome() {
  var btn = document.querySelector('#welcome-screen .lw-signin-btn');
  if (btn) {
    btn.textContent = 'Get Started →';
    btn.onclick = wzStart;
  }
  var disc = document.querySelector('#welcome-screen .lw-disclaimer');
  if (disc) {
    var alt = document.createElement('button');
    alt.className = 'lw-signin-alt';
    alt.textContent = 'Already set up?  Sign In';
    alt.onclick = showPinScreen;
    disc.parentNode.insertBefore(alt, disc.nextSibling);
  }
  // Hide the "Forgot PIN?" button — irrelevant for new users
  document.querySelectorAll('#welcome-screen button').forEach(function(b) {
    if (b.textContent && b.textContent.indexOf('Forgot PIN') !== -1) b.style.display = 'none';
  });
}

// ══════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════
function wzStart() {
  document.getElementById('login-screen').style.display = 'none';
  var ws = document.getElementById('wizard-screen');
  if (ws) ws.style.display = 'flex';
  wzGo(1);
}

function wzGo(step) {
  var ws = document.getElementById('wizard-screen');
  if (!ws) return;

  var html = '';
  if      (step === 1) html = _wzHtml1();
  else if (step === 2) html = _wzHtml2();
  else if (step === 3) html = _wzHtml3();
  else if (step === 4) html = _wzHtml4();
  else if (step === 5) html = _wzHtml5();
  else return;

  ws.innerHTML = '<div class="wz-card" id="wz-card">' + html + '</div>';

  // Slide-up entrance animation
  var card = document.getElementById('wz-card');
  if (card) {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        card.style.transition = 'opacity .24s ease, transform .24s ease';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      });
    });
  }

  _wzAfterRender(step);
}

function wzBack(to) { wzGo(to); }

function wzBack0() {
  // Return to welcome screen
  var ws = document.getElementById('wizard-screen');
  if (ws) ws.style.display = 'none';
  document.getElementById('login-screen').style.display = '';
}

// ── Re-run wizard from Settings ───────────────────────────────
function wzRestart() {
  // Reset working state
  _wz = {
    appName : localStorage.getItem('cff_app_name') || '',
    appSub  : localStorage.getItem('cff_app_sub')  || '',
    p1Name  : USER_CONFIG.p1name || '',
    p1Icon  : USER_CONFIG.p1icon || '👔',
    p1Input : '', p1First : '', p1Step : 0, p1Done : false,
    p2On    : USER_CONFIG.p2enabled !== false,
    p2Name  : USER_CONFIG.p2name || '',
    p2Icon  : USER_CONFIG.p2icon || '👩',
    p2Input : '', p2First : '', p2Step : 0, p2Done : false,
    acctOffset : USER_CONFIG.acct_offset || '',
    acctHome   : USER_CONFIG.acct_home   || '',
    acctSav1   : USER_CONFIG.acct_sav1   || '',
    acctSav2   : USER_CONFIG.acct_sav2   || ''
  };
  // Clear wizard-complete so commit re-sets it
  try { localStorage.removeItem(WIZARD_KEY); } catch(e) {}

  // Hide app, show wizard
  if (typeof lockApp === 'function') lockApp();
  setTimeout(function() {
    wzStart();
  }, 100);
}

// ══════════════════════════════════════════════════════════════
// STEP HELPERS
// ══════════════════════════════════════════════════════════════
function _wzProg(n) {
  return '<div class="wz-progress">Step ' + n + ' of 4</div>';
}

function _wzEsc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ══════════════════════════════════════════════════════════════
// STEP 1 — Household / App Name
// ══════════════════════════════════════════════════════════════
function _wzHtml1() {
  return (
    '<button class="wz-back" onclick="wzBack0()">← Back</button>' +
    _wzProg(1) +
    '<h2 class="wz-heading">What should we call<br>your tracker?</h2>' +
    '<p class="wz-sub">Shown at the top of the app and on your home screen.</p>' +
    '<label class="wz-label">App Name</label>' +
    '<input id="wz-app-name" type="text" class="wz-input" placeholder="Family Finance"' +
    ' value="' + _wzEsc(_wz.appName) + '" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="40"/>' +
    '<label class="wz-label wz-mt14">Subtitle <span class="wz-optional">(optional)</span></label>' +
    '<input id="wz-app-sub" type="text" class="wz-input" placeholder="AUD · Private"' +
    ' value="' + _wzEsc(_wz.appSub) + '" autocomplete="off" maxlength="60"/>' +
    '<button class="wz-next-btn" onclick="wzStep1Next()">Next →</button>'
  );
}

function wzStep1Next() {
  var n = (document.getElementById('wz-app-name').value || '').trim();
  var s = (document.getElementById('wz-app-sub').value  || '').trim();
  _wz.appName = n || 'Family Finance';
  _wz.appSub  = s || 'Family Finance Tracker · AUD';
  // Persist immediately in case wizard is interrupted
  try {
    localStorage.setItem('cff_app_name', _wz.appName);
    localStorage.setItem('cff_app_sub',  _wz.appSub);
  } catch(e) {}
  wzGo(2);
}

// ══════════════════════════════════════════════════════════════
// STEP 2 — Profile 1 (name + emoji + PIN)
// ══════════════════════════════════════════════════════════════
function _wzHtml2() {
  var nextDis = _wzP1Ready() ? '' : ' disabled';
  return (
    '<button class="wz-back" onclick="wzBack(1)">← Back</button>' +
    _wzProg(2) +
    '<h2 class="wz-heading">Who\'s the first person<br>using this tracker?</h2>' +
    '<div class="wz-emoji-grid" id="wz-eg1">' + _wzEmojiGrid(1, _wz.p1Icon) + '</div>' +
    '<label class="wz-label wz-mt18">Name</label>' +
    '<input id="wz-p1name" type="text" class="wz-input" placeholder="Your name"' +
    ' value="' + _wzEsc(_wz.p1Name) + '"' +
    ' autocomplete="given-name" autocorrect="off" maxlength="24" oninput="wzCheckP1Next()"/>' +
    '<label class="wz-label wz-mt22">PIN for this profile</label>' +
    '<div class="wz-pin-dots pin-dots" id="wz-dots1">' + _wzDotHtml('p1') + '</div>' +
    '<div class="wz-pin-hint pin-hint" id="wz-phint1">' + _wzP1HintText() + '</div>' +
    '<div class="wz-pin-err pin-err" id="wz-perr1"></div>' +
    '<div class="pin-pad wz-keypad">' + _wzKeypad(1) + '</div>' +
    '<p class="wz-trust"><i class="ti ti-lock"></i> Your PIN never leaves this device.</p>' +
    '<button class="wz-next-btn" id="wz-next2" onclick="wzStep2Next()"' + nextDis + '>Next →</button>'
  );
}

function _wzP1HintText() {
  if (_wz.p1Done) return '<i class="ti ti-check"></i> PIN set';
  if (_wz.p1Step === 1) return 'Confirm your PIN';
  return 'Enter a 4-digit PIN';
}

function _wzP1Ready() {
  return _wz.p1Name.trim().length > 0 && _wz.p1Done;
}

function wzCheckP1Next() {
  var nameEl = document.getElementById('wz-p1name');
  if (nameEl) _wz.p1Name = nameEl.value;
  var btn = document.getElementById('wz-next2');
  if (btn) btn.disabled = !_wzP1Ready();
}

function wzStep2Next() {
  var nameEl = document.getElementById('wz-p1name');
  var name = nameEl ? nameEl.value.trim() : '';
  if (!name) {
    if (nameEl) { nameEl.focus(); nameEl.style.borderColor = 'var(--danger)'; }
    return;
  }
  _wz.p1Name = name;
  wzGo(3);
}

// ══════════════════════════════════════════════════════════════
// STEP 3 — Profile 2 (optional)
// ══════════════════════════════════════════════════════════════
function _wzHtml3() {
  return (
    '<button class="wz-back" onclick="wzBack(2)">← Back</button>' +
    _wzProg(3) +
    '<h2 class="wz-heading">Is there a second person<br>sharing this tracker?</h2>' +
    '<p class="wz-sub">You can always add them later in Settings.</p>' +
    '<div id="wz-p2-area">' + _wzP2ChoiceHtml() + '</div>'
  );
}

function _wzP2ChoiceHtml() {
  return (
    '<button class="wz-choice-btn" onclick="wzShowP2Form()">' +
      '<span class="wz-choice-icon"><i class="ti ti-users"></i></span>' +
      '<span>Yes, add a second profile</span>' +
    '</button>' +
    '<button class="wz-choice-btn wz-choice-ghost" onclick="wzSkipP2()">' +
      '<span class="wz-choice-icon"><i class="ti ti-user"></i></span>' +
      '<span>Just me — skip this step</span>' +
    '</button>'
  );
}

function wzShowP2Form() {
  _wz.p2On = true;
  var area = document.getElementById('wz-p2-area');
  if (!area) return;
  var nextDis = _wzP2Ready() ? '' : ' disabled';
  area.innerHTML = (
    '<div class="wz-emoji-grid" id="wz-eg2">' + _wzEmojiGrid(2, _wz.p2Icon) + '</div>' +
    '<label class="wz-label wz-mt18">Name</label>' +
    '<input id="wz-p2name" type="text" class="wz-input" placeholder="Their name"' +
    ' value="' + _wzEsc(_wz.p2Name) + '"' +
    ' autocomplete="given-name" autocorrect="off" maxlength="24" oninput="wzCheckP2Next()"/>' +
    '<label class="wz-label wz-mt22">PIN for this profile</label>' +
    '<div class="wz-pin-dots pin-dots" id="wz-dots2">' + _wzDotHtml('p2') + '</div>' +
    '<div class="wz-pin-hint pin-hint" id="wz-phint2">' + (_wz.p2Done ? '<i class="ti ti-check"></i> PIN set' : 'Enter a 4-digit PIN') + '</div>' +
    '<div class="wz-pin-err pin-err" id="wz-perr2"></div>' +
    '<div class="pin-pad wz-keypad">' + _wzKeypad(2) + '</div>' +
    '<p class="wz-trust"><i class="ti ti-lock"></i> Their PIN never leaves this device.</p>' +
    '<button class="wz-next-btn" id="wz-next3" onclick="wzStep3Next()"' + nextDis + '>Next →</button>' +
    '<button class="wz-back-link" onclick="wzResetP2Choice()">← Go back to choice</button>'
  );
  setTimeout(function() {
    var el = document.getElementById('wz-p2name');
    if (el) el.focus();
  }, 60);
}

function wzResetP2Choice() {
  _wz.p2On = false;
  _wz.p2Name = ''; _wz.p2Icon = '👩';
  _wz.p2Input = ''; _wz.p2First = ''; _wz.p2Step = 0; _wz.p2Done = false;
  var area = document.getElementById('wz-p2-area');
  if (area) area.innerHTML = _wzP2ChoiceHtml();
}

function wzSkipP2() {
  _wz.p2On   = false;
  _wz.p2Name = '';
  _wz.p2Done = false;
  wzGo(4);
}

function _wzP2Ready() {
  return _wz.p2Name.trim().length > 0 && _wz.p2Done;
}

function wzCheckP2Next() {
  var nameEl = document.getElementById('wz-p2name');
  if (nameEl) _wz.p2Name = nameEl.value;
  var btn = document.getElementById('wz-next3');
  if (btn) btn.disabled = !_wzP2Ready();
}

function wzStep3Next() {
  var nameEl = document.getElementById('wz-p2name');
  var name = nameEl ? nameEl.value.trim() : '';
  if (!name) {
    if (nameEl) { nameEl.focus(); nameEl.style.borderColor = 'var(--danger)'; }
    return;
  }
  _wz.p2Name = name;
  wzGo(4);
}

// ══════════════════════════════════════════════════════════════
// STEP 4 — Account Names
// ══════════════════════════════════════════════════════════════
function _wzHtml4() {
  var p1n = _wzEsc(_wz.p1Name || 'Profile 1');
  var p2n = _wzEsc(_wz.p2Name || 'Profile 2');
  return (
    '<button class="wz-back" onclick="wzBack(3)">← Back</button>' +
    _wzProg(4) +
    '<h2 class="wz-heading">Name your accounts</h2>' +
    '<p class="wz-sub">You can change these any time in Settings.</p>' +
    '<label class="wz-label"><i class="ti ti-building-bank"></i> Main / Offset Account</label>' +
    '<input id="wz-acct-offset" type="text" class="wz-input" placeholder="Offset Account"' +
    ' value="' + _wzEsc(_wz.acctOffset) + '" autocorrect="off"/>' +
    '<label class="wz-label wz-mt14"><i class="ti ti-home"></i> Joint / Everyday Account</label>' +
    '<input id="wz-acct-home" type="text" class="wz-input" placeholder="Everyday Account"' +
    ' value="' + _wzEsc(_wz.acctHome) + '" autocorrect="off"/>' +
    '<label class="wz-label wz-mt14"><i class="ti ti-coin"></i> ' + p1n + '\'s Savings</label>' +
    '<input id="wz-acct-sav1" type="text" class="wz-input" placeholder="Savings"' +
    ' value="' + _wzEsc(_wz.acctSav1) + '" autocorrect="off"/>' +
    (_wz.p2On
      ? '<label class="wz-label wz-mt14"><i class="ti ti-diamond"></i> ' + p2n + '\'s Savings</label>' +
        '<input id="wz-acct-sav2" type="text" class="wz-input" placeholder="Savings"' +
        ' value="' + _wzEsc(_wz.acctSav2) + '" autocorrect="off"/>'
      : '') +
    '<button class="wz-next-btn" onclick="wzStep4Next()">Done →</button>' +
    '<button class="wz-skip-link" onclick="wzStep4Skip()">Skip — use defaults</button>'
  );
}

function wzStep4Next() {
  _wz.acctOffset = ((document.getElementById('wz-acct-offset') || {}).value || '').trim();
  _wz.acctHome   = ((document.getElementById('wz-acct-home')   || {}).value || '').trim();
  _wz.acctSav1   = ((document.getElementById('wz-acct-sav1')   || {}).value || '').trim();
  _wz.acctSav2   = _wz.p2On ? (((document.getElementById('wz-acct-sav2') || {}).value || '').trim()) : '';
  wzCommit();
}

function wzStep4Skip() { wzCommit(); }

// ══════════════════════════════════════════════════════════════
// COMMIT — persist all wizard data
// ══════════════════════════════════════════════════════════════
async function wzCommit() {
  // 1. App identity
  try {
    localStorage.setItem('cff_app_name', _wz.appName || 'Family Finance');
    localStorage.setItem('cff_app_sub',  _wz.appSub  || 'Family Finance Tracker · AUD');
  } catch(e) {}

  // 2. User config
  USER_CONFIG.p1name    = _wz.p1Name;
  USER_CONFIG.p1icon    = _wz.p1Icon;
  USER_CONFIG.p2enabled = _wz.p2On;
  USER_CONFIG.p2name    = _wz.p2On ? _wz.p2Name : '';
  USER_CONFIG.p2icon    = _wz.p2Icon;
  if (_wz.acctOffset) USER_CONFIG.acct_offset = _wz.acctOffset;
  if (_wz.acctHome)   USER_CONFIG.acct_home   = _wz.acctHome;
  if (_wz.acctSav1)   USER_CONFIG.acct_sav1   = _wz.acctSav1;
  if (_wz.acctSav2)   USER_CONFIG.acct_sav2   = _wz.acctSav2;
  saveUserConfig();

  // 3. PINs — hash with new kelda: salt
  if (_wz.p1First.length === 4) {
    PINS.brenton = await wzHashPin(_wz.p1First);
  }
  if (_wz.p2On && _wz.p2First.length === 4) {
    PINS.shelley = await wzHashPin(_wz.p2First);
  }
  try { save(K.pins, PINS); } catch(e) {}
  try { localStorage.setItem(PIN_SALT_KEY, PIN_SALT_V2); } catch(e) {}

  // 4. Mark wizard complete
  try { localStorage.setItem(WIZARD_KEY, 'true'); } catch(e) {}

  wzGo(5);
}

// ══════════════════════════════════════════════════════════════
// STEP 5 — All Set
// ══════════════════════════════════════════════════════════════
function _wzHtml5() {
  var appName = _wzEsc(_wz.appName || 'Family Finance');
  var p1n     = _wzEsc(_wz.p1Name  || 'Profile 1');
  var chip2   = _wz.p2On ? '<i class="ti ti-check"></i> 2 profiles' : '<i class="ti ti-check"></i> 1 profile';
  var chipA   = (_wz.acctOffset || _wz.acctHome) ? '<i class="ti ti-check"></i> Accounts named' : '<i class="ti ti-check"></i> Default accounts';
  return (
    '<div class="wz-done-wrap">' +
      '<div class="wz-done-icon" id="wz-check-icon"><i class="ti ti-check"></i></div>' +
      '<h2 class="wz-heading wz-mt20">' + appName + ' is ready,<br>' + p1n + '.</h2>' +
      '<div class="wz-chips">' +
        '<div class="wz-chip">' + chip2 + '</div>' +
        '<div class="wz-chip">' + chipA + '</div>' +
      '</div>' +
      '<button class="wz-next-btn" onclick="wzFinish()">Go to Dashboard →</button>' +
    '</div>'
  );
}

function wzFinish() {
  var ws = document.getElementById('wizard-screen');
  if (ws) ws.style.display = 'none';

  // Apply config to live UI
  if (typeof applyAppName    === 'function') applyAppName();
  if (typeof applyUserConfig === 'function') applyUserConfig();
  applyLoginProfileVis();

  // Skip welcome — go straight to PIN login
  document.getElementById('login-screen').style.display = '';
  if (typeof showPinScreen === 'function') showPinScreen();
  if (typeof selProfile    === 'function') selProfile('brenton');
}

// ══════════════════════════════════════════════════════════════
// PROFILE BUTTON VISIBILITY
// ══════════════════════════════════════════════════════════════
function applyLoginProfileVis() {
  var p2ok = USER_CONFIG.p2enabled !== false;
  var pb2  = document.getElementById('pb-shelley');
  var pbj  = document.getElementById('pb-joint');
  if (pb2) pb2.style.display = p2ok ? '' : 'none';
  if (pbj) pbj.style.display = p2ok ? '' : 'none';
}

// ══════════════════════════════════════════════════════════════
// EMOJI PICKER
// ══════════════════════════════════════════════════════════════
function _wzEmojiGrid(profile, selected) {
  var html = '<div class="wz-emoji-inner">';
  for (var i = 0; i < WZ_ICONS.length; i++) {
    var em  = WZ_ICONS[i];
    var sel = em === selected ? ' wz-em-sel' : '';
    // Pass emoji index rather than the emoji itself to avoid encoding issues in onclick
    html += '<button class="wz-em-btn' + sel + '" onclick="wzPickIcon(' + profile + ',' + i + ')" aria-label="' + em + '">' + em + '</button>';
  }
  html += '</div>';
  return html;
}

function wzPickIcon(profile, iconIndex) {
  var emoji = WZ_ICONS[iconIndex] || WZ_ICONS[0];
  if (profile === 1) _wz.p1Icon = emoji;
  else               _wz.p2Icon = emoji;
  var grid = document.getElementById('wz-eg' + profile);
  if (grid) grid.innerHTML = _wzEmojiGrid(profile, emoji);
}

// ══════════════════════════════════════════════════════════════
// PIN KEYPAD
// ══════════════════════════════════════════════════════════════
function _wzDotHtml(pid) {
  var done  = pid === 'p1' ? _wz.p1Done : _wz.p2Done;
  var input = pid === 'p1' ? _wz.p1Input : _wz.p2Input;
  var len   = done ? 4 : input.length;
  var html  = '';
  for (var i = 0; i < 4; i++) {
    html += '<div class="pin-dot' + (i < len ? ' on' : '') + '" id="wz-d-' + pid + '-' + i + '"></div>';
  }
  return html;
}

function _wzKeypad(profile) {
  var html = '';
  for (var i = 1; i <= 9; i++) {
    html += '<button class="pin-key" onclick="wzPk(' + profile + ',' + i + ')">' + i + '</button>';
  }
  html += '<button class="pin-key pk-del" onclick="wzPd(' + profile + ')">⌫</button>';
  html += '<button class="pin-key pk-0" onclick="wzPk(' + profile + ',0)">0</button>';
  return html;
}

function wzPk(profile, digit) {
  var d = String(digit);
  if (profile === 1) {
    if (_wz.p1Done) {
      // User restarting PIN entry — reset
      _wz.p1Done = false; _wz.p1First = ''; _wz.p1Input = ''; _wz.p1Step = 0;
      var h = document.getElementById('wz-phint1');
      if (h) { h.textContent = 'Enter a 4-digit PIN'; h.style.color = ''; }
      var e = document.getElementById('wz-perr1');
      if (e) e.textContent = '';
      wzCheckP1Next();
    }
    if (_wz.p1Input.length >= 4) return;
    _wz.p1Input += d;
    _wzRefDots('p1', _wz.p1Input);
    if (_wz.p1Input.length === 4) setTimeout(function(){ _wzPinEntry(1); }, 120);
  } else {
    if (_wz.p2Done) {
      _wz.p2Done = false; _wz.p2First = ''; _wz.p2Input = ''; _wz.p2Step = 0;
      var h2 = document.getElementById('wz-phint2');
      if (h2) { h2.textContent = 'Enter a 4-digit PIN'; h2.style.color = ''; }
      var e2 = document.getElementById('wz-perr2');
      if (e2) e2.textContent = '';
      wzCheckP2Next();
    }
    if (_wz.p2Input.length >= 4) return;
    _wz.p2Input += d;
    _wzRefDots('p2', _wz.p2Input);
    if (_wz.p2Input.length === 4) setTimeout(function(){ _wzPinEntry(2); }, 120);
  }
}

function wzPd(profile) {
  if (profile === 1) {
    if (_wz.p1Done) return;
    _wz.p1Input = _wz.p1Input.slice(0, -1);
    _wzRefDots('p1', _wz.p1Input);
    var e = document.getElementById('wz-perr1'); if (e) e.textContent = '';
  } else {
    if (_wz.p2Done) return;
    _wz.p2Input = _wz.p2Input.slice(0, -1);
    _wzRefDots('p2', _wz.p2Input);
    var e2 = document.getElementById('wz-perr2'); if (e2) e2.textContent = '';
  }
}

function _wzRefDots(pid, pin) {
  for (var i = 0; i < 4; i++) {
    var el = document.getElementById('wz-d-' + pid + '-' + i);
    if (el) el.classList.toggle('on', i < pin.length);
  }
}

function _wzPinEntry(profile) {
  var pid    = profile === 1 ? 'p1' : 'p2';
  var step   = profile === 1 ? _wz.p1Step   : _wz.p2Step;
  var input  = profile === 1 ? _wz.p1Input  : _wz.p2Input;
  var first  = profile === 1 ? _wz.p1First  : _wz.p2First;
  var errEl  = document.getElementById('wz-perr'  + profile);
  var hintEl = document.getElementById('wz-phint' + profile);
  var dotsEl = document.getElementById('wz-dots'  + profile);

  if (step === 0) {
    // First entry — prompt to confirm
    if (profile === 1) { _wz.p1First = input; _wz.p1Input = ''; _wz.p1Step = 1; }
    else               { _wz.p2First = input; _wz.p2Input = ''; _wz.p2Step = 1; }
    if (hintEl) hintEl.textContent = 'Confirm your PIN';
    _wzRefDots(pid, '');

  } else {
    // Confirm entry
    if (input === first) {
      // Match — PIN confirmed
      if (profile === 1) { _wz.p1Done = true; _wz.p1Input = ''; }
      else               { _wz.p2Done = true; _wz.p2Input = ''; }
      if (hintEl) { hintEl.textContent = '✓ PIN set'; hintEl.style.color = 'var(--success)'; }
      if (errEl)  errEl.textContent = '';
      // Flash all 4 dots green
      for (var i = 0; i < 4; i++) {
        var dot = document.getElementById('wz-d-' + pid + '-' + i);
        if (dot) dot.classList.add('on');
      }
      if (profile === 1) wzCheckP1Next();
      else               wzCheckP2Next();

    } else {
      // Mismatch — reset
      if (profile === 1) { _wz.p1First = ''; _wz.p1Input = ''; _wz.p1Step = 0; }
      else               { _wz.p2First = ''; _wz.p2Input = ''; _wz.p2Step = 0; }
      if (errEl)  errEl.textContent = "PINs don’t match — try again";
      if (hintEl) { hintEl.textContent = 'Enter a 4-digit PIN'; hintEl.style.color = ''; }
      _wzRefDots(pid, '');
      if (dotsEl) {
        dotsEl.classList.remove('wz-shake');
        void dotsEl.offsetHeight;
        dotsEl.classList.add('wz-shake');
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
// POST-RENDER HOOKS
// ══════════════════════════════════════════════════════════════
function _wzAfterRender(step) {
  // Auto-focus first text input (not on choice or done screens)
  if (step !== 3 && step !== 5) {
    setTimeout(function() {
      var el = document.querySelector('#wizard-screen .wz-input');
      if (el) el.focus();
    }, 80);
  }
  // Animate checkmark on step 5
  if (step === 5) {
    setTimeout(function() {
      var el = document.getElementById('wz-check-icon');
      if (el) el.classList.add('wz-check-pop');
    }, 60);
  }
}
