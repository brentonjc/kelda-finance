// ══════════════════════════════════════════════════════════════
// LOGIN UI — 3-screen entry flow (picker → PIN → data-health welcome)
//   Verification/crypto/unlock live in auth.js; this file owns the DOM.
//   Built to kelda-login-wireframe.html (WCAG 2.1 AA + Nielsen audited).
//   House style: string concatenation, no template literals; try/catch
//   around every localStorage touch.
// ══════════════════════════════════════════════════════════════

var _lgProfiles = [];
var _lgActive   = null;   // profile object currently entering a PIN for
var _lgPin      = '';     // current PIN buffer
var _lgSetup    = null;   // null | 'set' | 'confirm'  (first-time PIN setup)
var _lgPending  = '';     // first entry while confirming a new PIN
var _lgFail     = 0;      // consecutive wrong attempts
var _lgLockTimer = null;
var _lgNote     = '';     // one-shot message to show on next PIN screen (e.g. session expired)
var _LG_LOCK_KEY = 'kf_pin_lock_until';  // sessionStorage — survives reload, not PWA close

var PIN_LEN = 4;

// ── Profile model ─────────────────────────────────────────────
function _lgBuildProfiles() {
  var li = {}; try { li = load(K.lastIn) || {}; } catch(e) {}
  var p2 = (typeof USER_CONFIG !== 'undefined') && USER_CONFIG.p2enabled !== false;
  var defs = [{ id:'brenton', grad:'a1' }];
  if (p2) {
    defs.push({ id:'shelley', grad:'a2' });
    defs.push({ id:'joint',   grad:'a3', joint:true });
  }
  return defs.map(function(p) {
    var name = p.joint ? 'Joint'
             : (typeof getUserName === 'function' ? getUserName(p.id) : p.id);
    var init = (String(name).trim().charAt(0) || '?').toUpperCase();
    return { id:p.id, joint:!!p.joint, grad:p.grad, name:name, initials:init, lastIn: li[p.id] || 0 };
  });
}

// ── Screen switching ──────────────────────────────────────────
function _lgShow(which) {
  ['profiles','pin','welcome'].forEach(function(s) {
    var el = document.getElementById('kl-screen-' + s);
    if (el) el.style.display = (s === which) ? 'block' : 'none';
  });
}

// External entry point — boot, lock, and "Sign in" all funnel here.
function loginInit() {
  if (loggedIn) return;
  _lgProfiles = _lgBuildProfiles();
  _lgPin = ''; _lgSetup = null; _lgPending = '';
  _lgRenderPicker();
  // Single-profile household → skip the picker entirely.
  if (_lgProfiles.length === 1) {
    _lgSelectProfile(_lgProfiles[0].id, true);
  } else {
    _lgShow('profiles');
  }
}

// ── Screen 1: profile picker ──────────────────────────────────
function _lgRenderPicker() {
  var list = document.getElementById('kl-profile-list');
  if (!list) return;
  list.innerHTML = '';
  _lgProfiles.forEach(function(p) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kl-profile';
    btn.setAttribute('aria-label', 'Sign in as ' + p.name);
    var meta = p.joint ? 'Combined view'
             : (p.lastIn ? 'Last in ' + relTime(p.lastIn) : 'Tap to sign in');
    btn.innerHTML =
      '<span class="kl-avatar ' + p.grad + '" aria-hidden="true">' + esc(p.initials) + '</span>' +
      '<span class="kl-profile-name">' + esc(p.name) + '</span>' +
      '<span class="kl-profile-meta">' + esc(meta) + '</span>';
    btn.addEventListener('click', function() { _lgSelectProfile(p.id, false); });
    list.appendChild(btn);
  });
  // "Add profile" tile
  var add = document.createElement('button');
  add.type = 'button';
  add.className = 'kl-add-profile';
  add.setAttribute('aria-label', 'Add a profile');
  add.innerHTML = '<span class="kl-plus" aria-hidden="true">+</span><span>Add profile</span>';
  add.addEventListener('click', _lgAddProfile);
  list.appendChild(add);
}

function _lgAddProfile() {
  // Route into the existing onboarding/wizard add-profile flow if present.
  if (typeof wzStart === 'function') { wzStart(); return; }
  if (typeof go === 'function' && !loggedIn) { /* fall through */ }
  loginNote('Add a second profile from Settings → Profiles after signing in.');
  if (_lgActive) _lgRenderPinNote();
}

// ── Screen 2: PIN entry ───────────────────────────────────────
function _lgSelectProfile(id, fromSkip) {
  _lgActive = _lgProfiles.filter(function(p){ return p.id === id; })[0] || null;
  if (!_lgActive) return;
  activeProfile = id;
  _lgPin = ''; _lgPending = '';
  _lgSetup = null;

  // Joint view has no PIN — go straight to the welcome/data-health screen.
  if (_lgActive.joint) { loginShowWelcome(); return; }

  // Determine setup vs verify mode.
  if (typeof profileNeedsSetup === 'function' && profileNeedsSetup(id)) _lgSetup = 'set';

  // Populate the "who" header
  var av = document.getElementById('kl-pin-avatar');
  if (av) { av.textContent = _lgActive.initials; av.className = 'kl-avatar ' + _lgActive.grad; }
  var nm = document.getElementById('kl-pin-name'); if (nm) nm.textContent = _lgActive.name;

  // "Not you?" back-link + quick-switch chips only make sense with 2+ profiles.
  var back = document.getElementById('kl-back');
  if (back) back.style.display = (_lgProfiles.length > 1 && !fromSkip) ? 'flex' : 'none';
  _lgRenderSwitchStrip();
  _lgCloseForgot();
  _lgRenderDots();
  _lgSetLabel();
  _lgRenderPinNote();
  _lgApplyLockState();
  _lgShow('pin');
}

function _lgSetLabel() {
  var lbl = document.getElementById('kl-pin-label');
  if (!lbl) return;
  if (_lgSetup === 'set')      lbl.textContent = 'Set a 4-digit PIN';
  else if (_lgSetup === 'confirm') lbl.textContent = 'Confirm your PIN';
  else                         lbl.textContent = 'Enter your PIN';
  var banner = document.getElementById('kl-setup-banner');
  if (banner) banner.style.display = _lgSetup ? 'block' : 'none';
}

function _lgRenderPinNote() {
  var err = document.getElementById('kl-error');
  if (!err) return;
  if (_lgNote) { err.textContent = _lgNote; err.classList.add('show'); _lgNote = ''; }
  else { err.textContent = ''; err.classList.remove('show'); }
}

function _lgRenderSwitchStrip() {
  var strip = document.getElementById('kl-switch');
  if (!strip) return;
  strip.innerHTML = '';
  if (_lgProfiles.length < 2) return;
  _lgProfiles.forEach(function(p) {
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'kl-chip' + (_lgActive && _lgActive.id === p.id ? ' active' : '');
    chip.textContent = p.name;
    chip.setAttribute('aria-label', 'Switch to ' + p.name);
    if (_lgActive && _lgActive.id === p.id) chip.setAttribute('aria-current', 'true');
    chip.addEventListener('click', function() { _lgSelectProfile(p.id, false); });
    strip.appendChild(chip);
  });
}

function _lgRenderDots(state) {
  var wrap = document.getElementById('kl-dots');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (var i = 0; i < PIN_LEN; i++) {
    var d = document.createElement('span');
    d.className = 'kl-dot' + (i < _lgPin.length ? ' filled' : '') + (state === 'error' ? ' error' : '');
    wrap.appendChild(d);
  }
  wrap.setAttribute('aria-label', _lgPin.length + ' of ' + PIN_LEN + ' digits entered');
}

// ── Keypad input ──────────────────────────────────────────────
function _lgLockedUntil() {
  try { return parseInt(sessionStorage.getItem(_LG_LOCK_KEY) || '0', 10) || 0; } catch(e) { return 0; }
}
function _lgIsLocked() { return _lgLockedUntil() > Date.now(); }

function _lgKey(d) {
  if (_lgIsLocked()) return;
  if (_lgPin.length >= PIN_LEN) return;
  _lgPin += d;
  _lgRenderDots();
  var err = document.getElementById('kl-error'); if (err) { err.textContent = ''; err.classList.remove('show'); }
  if (_lgPin.length === PIN_LEN) setTimeout(_lgSubmit, 140);
}

function _lgDel() {
  if (_lgIsLocked()) return;
  _lgPin = _lgPin.slice(0, -1);
  _lgRenderDots();
}

function _lgSubmit() {
  // Setup flow: capture, then confirm.
  if (_lgSetup === 'set') {
    _lgPending = _lgPin; _lgPin = ''; _lgSetup = 'confirm';
    _lgSetLabel(); _lgRenderDots();
    return;
  }
  if (_lgSetup === 'confirm') {
    if (_lgPin === _lgPending) {
      var toStore = _lgPin; _lgPin = '';
      setPin(_lgActive.id, toStore).then(function() { _lgFail = 0; loginShowWelcome(); });
    } else {
      _lgPending = ''; _lgPin = ''; _lgSetup = 'set';
      _lgSetLabel();
      _lgFlashError("PINs don't match — try again");
    }
    return;
  }

  // Verify flow.
  var attempt = _lgPin; _lgPin = '';
  verifyPin(_lgActive.id, attempt).then(function(res) {
    if (res.ok) {
      _lgFail = 0;
      try { sessionStorage.removeItem(_LG_LOCK_KEY); } catch(e) {}
      if (res.migrated) setTimeout(function(){ if (typeof toast === 'function') toast('🔒 Security updated'); }, 700);
      loginShowWelcome();
    } else {
      _lgFail++;
      if (_lgFail >= PIN_MAX_ATTEMPTS) { _lgStartLockout(); }
      else {
        var remaining = PIN_MAX_ATTEMPTS - _lgFail;
        _lgFlashError('Incorrect PIN — ' + remaining + ' attempt' + (remaining !== 1 ? 's' : '') + ' remaining');
      }
    }
  });
}

function _lgFlashError(msg) {
  _lgRenderDots('error');
  var err = document.getElementById('kl-error');
  if (err) { err.textContent = msg; err.classList.add('show'); }
  setTimeout(function() { _lgRenderDots(); }, 500);
}

// ── Lockout (survives reload via sessionStorage, resets on PWA close) ──
function _lgStartLockout() {
  var until = Date.now() + PIN_LOCKOUT_SECS * 1000;
  try { sessionStorage.setItem(_LG_LOCK_KEY, String(until)); } catch(e) {}
  _lgFail = 0;
  _lgApplyLockState();
}

function _lgApplyLockState() {
  var until = _lgLockedUntil();
  var banner = document.getElementById('kl-lockout');
  var keypad = document.getElementById('kl-keypad');
  clearInterval(_lgLockTimer);
  if (until <= Date.now()) {
    if (banner) { banner.classList.remove('show'); banner.textContent = ''; }
    if (keypad) keypad.querySelectorAll('button').forEach(function(b){ if (!b.classList.contains('kl-key-disabled-perm')) b.disabled = false; });
    return;
  }
  // Locked — disable keypad, show countdown.
  if (keypad) keypad.querySelectorAll('button').forEach(function(b){ b.disabled = true; });
  var tick = function() {
    var remaining = Math.ceil((_lgLockedUntil() - Date.now()) / 1000);
    if (remaining <= 0) {
      clearInterval(_lgLockTimer);
      try { sessionStorage.removeItem(_LG_LOCK_KEY); } catch(e) {}
      if (banner) { banner.classList.remove('show'); banner.textContent = ''; }
      if (keypad) keypad.querySelectorAll('button').forEach(function(b){ if (!b.classList.contains('kl-key-disabled-perm')) b.disabled = false; });
    } else if (banner) {
      banner.textContent = 'Too many attempts. Try again in ' + remaining + 's.';
      banner.classList.add('show');
    }
  };
  tick();
  _lgLockTimer = setInterval(tick, 1000);
}

// ── Back / forgot ─────────────────────────────────────────────
function _lgBack() {
  if (_lgProfiles.length <= 1) return;
  _lgPin = ''; _lgSetup = null; _lgPending = '';
  _lgProfiles = _lgBuildProfiles();
  _lgRenderPicker();
  _lgShow('profiles');
}

function _lgToggleForgot() {
  var panel = document.getElementById('kl-forgot-panel');
  var btn = document.getElementById('kl-forgot');
  if (!panel) return;
  var show = !panel.classList.contains('show');
  if (show) _lgRenderForgot();
  panel.classList.toggle('show', show);
  if (btn) btn.setAttribute('aria-expanded', String(show));
}
function _lgCloseForgot() {
  var panel = document.getElementById('kl-forgot-panel');
  var btn = document.getElementById('kl-forgot');
  if (panel) panel.classList.remove('show');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
function _lgRenderForgot() {
  var head = document.getElementById('kl-forgot-head');
  var body = document.getElementById('kl-forgot-body');
  if (!body) return;
  var others = _lgProfiles.filter(function(p){ return !p.joint && (!_lgActive || p.id !== _lgActive.id); });
  if (others.length > 0) {
    var names = others.map(function(o){ return o.name; }).join(' or ');
    if (head) head.textContent = 'No cloud account means no email reset.';
    body.textContent = 'Ask ' + names + ' to unlock their profile, then go to Settings → Profiles → '
      + 'Reset PIN to set you a new one. No PIN is recoverable on its own — only another unlocked '
      + 'profile on this device can reset it.';
  } else {
    if (head) head.textContent = 'This is the only profile on this device.';
    body.textContent = 'There is no one else who can reset your PIN. Your only recovery is a recent '
      + 'full export (Settings → Export Data), which you can re-import after re-onboarding. Without a '
      + 'backup, a forgotten PIN means starting fresh — that is the real cost of local-only encryption, '
      + 'worth weighing against a periodic export habit.';
  }
}

// ── Screen 3: post-unlock welcome / data health ───────────────
function loginShowWelcome() {
  var health;
  try { health = getDataHealth(); } catch(e) { health = { backup:{days:null,severity:'danger'}, csvImport:{days:null,severity:'danger'} }; }

  var title = document.getElementById('kl-welcome-title');
  if (title) title.textContent = 'Welcome back, ' + (_lgActive ? _lgActive.name : 'there') + ' 👋';

  _lgPaintInsight('backup', health.backup, 'never backed up');
  _lgPaintInsight('csv', health.csvImport, 'no imports yet');
  _lgShow('welcome');
  var cont = document.getElementById('kl-continue');
  if (cont) cont.focus();
}

function _lgPaintInsight(key, info, neverLabel) {
  var icon = document.getElementById('kl-' + key + '-icon');
  var meta = document.getElementById('kl-' + key + '-meta');
  var action = document.getElementById('kl-' + key + '-action');
  var sev = info.severity;
  var label;
  if (info.days === null) label = neverLabel.charAt(0).toUpperCase() + neverLabel.slice(1);
  else if (sev === 'danger') label = 'Overdue — ' + info.days + ' day' + (info.days !== 1 ? 's' : '') + ' ago';
  else if (sev === 'warn')   label = 'Due soon — ' + info.days + ' day' + (info.days !== 1 ? 's' : '') + ' ago';
  else                       label = 'Up to date — ' + info.days + ' day' + (info.days !== 1 ? 's' : '') + ' ago';
  if (icon) icon.className = 'kl-insight-icon ' + sev;
  if (meta) { meta.className = 'kl-insight-meta ' + sev; meta.textContent = label; }
  // Ghost by default; only emphasise when there's something to do.
  if (action) action.classList.toggle('kl-emph', sev !== 'ok');
}

// Enter the app, then optionally route/act once the shell is up.
function _lgEnter(page, after) {
  if (typeof unlock === 'function') unlock();
  try { if (typeof go === 'function') go(page || 'dashboard'); } catch(e) {}
  if (after) setTimeout(after, 400);
}

// Called by auth.js when the session times out, before the PIN screen is shown.
function loginNote(msg) { _lgNote = msg; }

// ── Physical keyboard support (0–9, Backspace, Escape) ────────
document.addEventListener('keydown', function(e) {
  var ls = document.getElementById('login-screen');
  if (!ls || ls.classList.contains('gone')) return;
  var pin = document.getElementById('kl-screen-pin');
  if (!pin || pin.style.display === 'none') return;
  if (e.key >= '0' && e.key <= '9') { e.preventDefault(); _lgKey(e.key); }
  else if (e.key === 'Backspace') { e.preventDefault(); _lgDel(); }
  else if (e.key === 'Escape' && _lgProfiles.length > 1) { e.preventDefault(); _lgBack(); }
});

// ── Wiring (delegated; static keypad in index.html) ───────────
document.addEventListener('DOMContentLoaded', function() {
  var keypad = document.getElementById('kl-keypad');
  if (keypad) keypad.addEventListener('click', function(e) {
    var btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.dataset.k !== undefined) _lgKey(btn.dataset.k);
    else if (btn.id === 'kl-del') _lgDel();
  });
  var back = document.getElementById('kl-back');       if (back) back.addEventListener('click', _lgBack);
  var forgot = document.getElementById('kl-forgot');   if (forgot) forgot.addEventListener('click', _lgToggleForgot);
  var cont = document.getElementById('kl-continue');   if (cont) cont.addEventListener('click', function(){ _lgEnter('dashboard'); });
  var ba = document.getElementById('kl-backup-action'); if (ba) ba.addEventListener('click', function(){ _lgEnter('export'); });
  var ca = document.getElementById('kl-csv-action');    if (ca) ca.addEventListener('click', function(){ _lgEnter('transactions', function(){ if (typeof openCsvModal === 'function') openCsvModal(); }); });
});

// ── Compatibility shims for existing callers ──────────────────
// (wizard.js, onboarding, and boot all reference these names.)
function selProfile(p) { loginInit(); }
function showPinScreen() { loginInit(); }
function applyLoginProfileVis() { if (!loggedIn && typeof loginInit === 'function') loginInit(); }
