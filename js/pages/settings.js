// ══════════════════════════════════════════════════════════════
// SETTINGS PAGE
// Personalise app name, profiles, accounts. Danger zone.
// Rules: string concatenation only (no template literal expressions),
//        all localStorage wrapped in try/catch.
// ══════════════════════════════════════════════════════════════

// ── Helpers ──────────────────────────────────────────────────

function _settEsc(str) {
  // Escape a string for safe use inside an HTML attribute value (double-quoted).
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _settHasPIN(profileId) {
  // Returns true when a PIN hash is stored for this profile.
  try { return !!(PINS && PINS[profileId]); } catch(e) { return false; }
}

// ── Main render ───────────────────────────────────────────────

function renderSettings() {
  var el = document.getElementById('settings-content');
  if (!el) return;

  var html = '';

  // ════════════════════════════════════════════════════════════
  // 3A — APP IDENTITY
  // ════════════════════════════════════════════════════════════
  html += '<div class="card mb">';
  html += '<div class="section-label" style="margin-bottom:18px">App Identity</div>';

  html += '<div class="settings-row">';
  html += '<label class="lbl">App Name</label>';
  html += '<input type="text" id="s-app-name" value="' + _settEsc(getAppName()) + '" placeholder="Kelda Finance" style="font-size:16px"/>';
  html += '</div>';

  html += '<div class="settings-row" style="margin-top:10px">';
  html += '<label class="lbl">Subtitle</label>';
  html += '<input type="text" id="s-app-sub" value="' + _settEsc(getAppSub()) + '" placeholder="Family Finance Tracker \xb7 AUD" style="font-size:16px"/>';
  html += '</div>';

  html += '<button class="btn btn-primary btn-sm" onclick="settingsSaveAppIdentity()" style="margin-top:14px">Save App Identity</button>';
  html += '</div>';

  // ════════════════════════════════════════════════════════════
  // 3B — PROFILES
  // ════════════════════════════════════════════════════════════
  html += '<div class="card mb">';
  html += '<div class="section-label" style="margin-bottom:18px">Profiles</div>';

  html += _settProfileCard('brenton', '👔', 'Brenton');
  html += '<div style="height:12px"></div>';
  html += _settProfileCard('shelley', '👩', 'Shelley');

  html += '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">';
  html += '<button class="btn btn-primary btn-sm" onclick="settingsSaveProfiles()">Save Profile Names</button>';
  html += '</div>';
  html += '</div>';

  // ════════════════════════════════════════════════════════════
  // 3C — ACCOUNTS
  // ════════════════════════════════════════════════════════════
  html += '<div class="card mb">';
  html += '<div class="section-label" style="margin-bottom:18px">Accounts</div>';
  html += '<p style="font-size:.8rem;color:var(--muted);margin-bottom:14px">These names appear across Cash Tracker, Dashboard and reports.</p>';

  var _accts = [
    { id:'offset', icon:'🏦', label:'Offset / Main Account',          def:'Offset Account'    },
    { id:'home',   icon:'🏠', label:'Joint Transaction Account',       def:'Home Transaction'  },
    { id:'sav1',   icon:'💰', label:'Savings Account 1 (Profile 1)',   def:'Savings Account 1' },
    { id:'sav2',   icon:'💎', label:'Savings Account 2 (Profile 2)',   def:'Savings Account 2' }
  ];
  for (var _ai = 0; _ai < _accts.length; _ai++) {
    var _a = _accts[_ai];
    html += '<div class="settings-row"' + (_ai > 0 ? ' style="margin-top:10px"' : '') + '>';
    html += '<label class="lbl">' + _a.icon + ' ' + _a.label + '</label>';
    html += '<input type="text" id="s-acct-' + _a.id + '" value="' + _settEsc(getAccountName(_a.id)) + '" placeholder="' + _settEsc(_a.def) + '" style="font-size:16px"/>';
    html += '</div>';
  }

  html += '<button class="btn btn-primary btn-sm" onclick="settingsSaveAccounts()" style="margin-top:14px">Save Accounts</button>';
  html += '</div>';

  // ════════════════════════════════════════════════════════════
  // 3D — SETUP WIZARD
  // ════════════════════════════════════════════════════════════
  html += '<div class="card mb">';
  html += '<div class="section-label" style="margin-bottom:10px">Setup Wizard</div>';
  html += '<p style="font-size:.8rem;color:var(--muted);margin-bottom:14px">Re-run the first-time setup to change your app name, profile names, PINs, and account labels.</p>';
  html += '<button class="btn btn-primary btn-sm" onclick="settingsRunWizard()">Re-run Setup Wizard</button>';
  html += '</div>';

  // ════════════════════════════════════════════════════════════
  // 3E — DANGER ZONE
  // ════════════════════════════════════════════════════════════
  html += '<div class="card mb" style="border:1px solid rgba(239,68,68,.35)">';
  html += '<div class="section-label" style="margin-bottom:12px;color:var(--danger)">Danger Zone</div>';
  html += '<p style="font-size:.8rem;color:var(--muted);margin-bottom:16px">These actions cannot be undone. Proceed with caution.</p>';

  html += '<div style="display:flex;flex-direction:column;gap:10px">';

  // Reset categories
  html += '<div class="settings-danger-row">';
  html += '<div>';
  html += '<div style="font-weight:600;font-size:.88rem;margin-bottom:2px">Reset Categories to Defaults</div>';
  html += '<div style="font-size:.74rem;color:var(--muted)">Restores the built-in category list. Your transactions are not deleted.</div>';
  html += '</div>';
  html += '<button class="btn btn-sm" style="background:var(--warn);color:#000;flex-shrink:0;white-space:nowrap" onclick="settingsResetCategories()">Reset</button>';
  html += '</div>';

  // Erase all data
  html += '<div class="settings-danger-row">';
  html += '<div>';
  html += '<div style="font-weight:600;font-size:.88rem;margin-bottom:2px">Erase All Data</div>';
  html += '<div style="font-size:.74rem;color:var(--muted)">Permanently deletes all transactions, bills, settings and profiles. The app will reload.</div>';
  html += '</div>';
  html += '<button class="btn btn-sm" style="background:var(--danger);flex-shrink:0;white-space:nowrap" onclick="settingsEraseAll()">Erase All</button>';
  html += '</div>';

  html += '</div>';
  html += '</div>';

  el.innerHTML = html;
}

// ── Profile card helper ───────────────────────────────────────

function _settProfileCard(profileId, defaultIcon, defaultName) {
  var currentName = getUserName(profileId);
  var currentIcon = getUserIcon(profileId);
  var hasPIN      = _settHasPIN(profileId);
  var pinStatus   = hasPIN ? 'PIN set' : 'No PIN';
  var pinColor    = hasPIN ? 'var(--success)' : 'var(--warn)';
  var pinBtnLabel = hasPIN ? 'Reset PIN' : 'Set PIN';

  var html = '';
  html += '<div style="background:var(--card2);border-radius:12px;padding:14px 16px">';
  html += '<div style="display:grid;grid-template-columns:56px 1fr;gap:10px;align-items:start">';

  // Icon input
  html += '<div>';
  html += '<label class="lbl" style="font-size:.68rem;margin-bottom:4px">Icon</label>';
  html += '<input type="text" id="s-' + profileId + '-icon" value="' + _settEsc(currentIcon) + '"';
  html += ' placeholder="' + _settEsc(defaultIcon) + '" style="font-size:1.4rem;text-align:center;padding:8px 4px;width:100%"/>';
  html += '</div>';

  // Name input
  html += '<div>';
  html += '<label class="lbl" style="font-size:.68rem;margin-bottom:4px">Name</label>';
  html += '<input type="text" id="s-' + profileId + '-name" value="' + _settEsc(currentName) + '"';
  html += ' placeholder="' + _settEsc(defaultName) + '" style="font-size:16px;width:100%"/>';
  html += '</div>';

  html += '</div>';

  // PIN status row
  html += '<div style="display:flex;align-items:center;gap:10px;margin-top:12px">';
  html += '<span style="font-size:.76rem;color:' + pinColor + ';font-weight:600">🔒 ' + pinStatus + '</span>';
  html += '<button class="btn btn-ghost btn-sm" onclick="settingsResetPIN(\'' + profileId + '\', \'' + _settEsc(currentName) + '\')">' + pinBtnLabel + '</button>';
  html += '</div>';

  html += '</div>';
  return html;
}

// ── Action functions ──────────────────────────────────────────

function settingsSaveAppIdentity() {
  var nameEl = document.getElementById('s-app-name');
  var subEl  = document.getElementById('s-app-sub');
  var name = nameEl ? (nameEl.value.trim() || 'Kelda Finance') : 'Kelda Finance';
  var sub  = subEl  ? (subEl.value.trim()  || 'Family Finance Tracker \xb7 AUD') : 'Family Finance Tracker \xb7 AUD';
  setAppName(name, sub);
  toast('✅ App name saved');
}

function settingsSaveProfiles() {
  var g = function(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };
  USER_CONFIG.p1icon = g('s-brenton-icon') || '👤';
  USER_CONFIG.p1name = g('s-brenton-name') || 'Profile 1';
  USER_CONFIG.p2icon = g('s-shelley-icon') || '👤';
  USER_CONFIG.p2name = g('s-shelley-name') || 'Profile 2';
  saveUserConfig();
  applyUserConfig();
  // Sync any open mob-menu panel inputs
  var sync = {
    'usc-p1name': USER_CONFIG.p1name,
    'usc-p1icon': USER_CONFIG.p1icon,
    'usc-p2name': USER_CONFIG.p2name,
    'usc-p2icon': USER_CONFIG.p2icon
  };
  Object.keys(sync).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = sync[id];
  });
  toast('✅ Profile names saved');
  // Re-render to show updated names in the profile cards
  renderSettings();
}

function settingsSaveAccounts() {
  var g = function(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };
  USER_CONFIG.acct_offset = g('s-acct-offset') || 'Offset Account';
  USER_CONFIG.acct_home   = g('s-acct-home')   || 'Home Transaction';
  USER_CONFIG.acct_sav1   = g('s-acct-sav1')   || 'Savings Account 1';
  USER_CONFIG.acct_sav2   = g('s-acct-sav2')   || 'Savings Account 2';
  saveUserConfig();
  applyUserConfig();
  // Sync mob-menu panel inputs too
  var sync2 = {
    'usc-acct-offset': USER_CONFIG.acct_offset,
    'usc-acct-home':   USER_CONFIG.acct_home,
    'usc-acct-sav1':   USER_CONFIG.acct_sav1,
    'usc-acct-sav2':   USER_CONFIG.acct_sav2
  };
  Object.keys(sync2).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = sync2[id];
  });
  if (typeof renderCashTracker === 'function') renderCashTracker();
  toast('✅ Accounts saved');
}

function settingsResetPIN(profileId, displayName) {
  var label = displayName || profileId;
  if (!confirm('Reset PIN for ' + label + '?\n\nYour financial data will NOT be deleted — only the PIN is cleared. You will set a new one on next login.')) {
    return;
  }
  try {
    delete PINS[profileId];
    save(K.pins, PINS);
  } catch(e) {}
  toast('🔓 PIN cleared for ' + label + ' — reload to set a new one');
  // Re-render to update PIN status badge
  renderSettings();
}

function settingsResetCategories() {
  if (!confirm('Reset all categories to defaults?\n\nYour transactions will NOT be deleted, but any custom categories you created will be removed.')) {
    return;
  }
  try {
    LCATS = JSON.parse(JSON.stringify(_BUILT_IN_CATS));
    // Add Uncategorised if missing
    if (!LCATS.find(function(c) { return c.id === 'uncategorised'; })) {
      LCATS.push({ id:'uncategorised', name:'Uncategorised', icon:'❓', color:'#8a8095', type:'both', subcats:[] });
    }
    save(K.categories, LCATS);
    // Bump version so future load picks up new defaults
    var newVer = (CAT_VERSION || 7) + 1;
    try { localStorage.setItem('cff_cat_version', String(newVer)); } catch(ev) {}
  } catch(e) {}
  toast('✅ Categories reset to defaults');
  if (typeof renderCategories === 'function') renderCategories();
}

function settingsEraseAll() {
  if (!confirm('ERASE ALL DATA?\n\nThis will permanently delete:\n• All transactions\n• All bills and budgets\n• Mortgage, super, tax data\n• All settings and PINs\n\nThis CANNOT be undone. Are you absolutely sure?')) {
    return;
  }
  if (!confirm('Last chance.\n\nAll your financial data will be permanently deleted. Tap OK to confirm.')) {
    return;
  }
  // Clear every known key
  var allKeys = [
    K.tx, K.budgets, K.goals, K.bills, K.mortgage,
    K.ct, K.ctcfg, K.ins, K.superdata, K.pins,
    K.categories, K.lbudgets, K.rules, K.recurring,
    K.transfers, K.tax, K.equities,
    'cff_userconfig', 'cff_app_name', 'cff_app_sub',
    'cff_cat_version', 'cff_settings', 'learnedMappings',
    'kelda_wizard_complete', 'kelda_pin_salt'
  ];
  allKeys.forEach(function(key) {
    try { localStorage.removeItem(key); } catch(e) {}
  });
  location.reload();
}

function settingsRunWizard() {
  if (!confirm("Re-run the setup wizard?

This will lock the app and walk you through setup again. Your financial data will NOT be deleted.")) return;
  if (typeof wzRestart === "function") wzRestart();
  else location.reload();
}
