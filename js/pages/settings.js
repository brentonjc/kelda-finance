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
  html += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">';
  html += '<div class="section-label" style="margin:0">Accounts</div>';
  if (ACCOUNTS.length < 8) {
    html += '<button class="btn btn-ghost btn-sm" onclick="settAcctShowAdd()">+ Add Account</button>';
  }
  html += '</div>';

  // Privacy notice
  html += '<div class="sett-privacy-notice">'
    + '<div class="sett-privacy-icon">' + ICON('lock') + '</div>'
    + '<div>'
    + '<div class="sett-privacy-title">Privacy protected</div>'
    + '<div class="sett-privacy-body">Only account nicknames are stored — never BSBs, account numbers or bank names. All data stays on your device and is never transmitted.</div>'
    + '</div>'
    + '</div>';

  // Account list
  html += '<div id="sett-accts-list">' + _settAcctsList() + '</div>';

  // Add form placeholder
  html += '<div id="sett-acct-add-form" style="display:none">' + _settAcctAddForm() + '</div>';

  html += '</div>';

  // ════════════════════════════════════════════════════════════
  // 3D — APPEARANCE
  // ════════════════════════════════════════════════════════════
  html += '<div class="card mb">';
  html += '<div class="section-label" style="margin-bottom:14px">Appearance</div>';
  html += '<p style="font-size:.8rem;color:var(--muted);margin-bottom:14px">Choose a colour palette and switch between light and dark. Changes apply instantly.</p>';
  html += '<div class="field-row" style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end">';
  html += '  <label style="flex:1;min-width:180px">';
  html += '    <span style="display:block;font-size:.78rem;color:var(--muted);margin-bottom:6px">Palette</span>';
  html += '    <select class="input palette-select" onchange="setPalette(this.value)" aria-label="Colour palette">';
  html += '      <option value="kelda">Kelda</option>';
  html += '      <option value="fintech">Fintech</option>';
  html += '      <option value="emerald">Emerald</option>';
  html += '      <option value="slate">Slate</option>';
  html += '      <option value="harvest">Harvest</option>';
  html += '    </select>';
  html += '  </label>';
  html += '  <div>';
  html += '    <span style="display:block;font-size:.78rem;color:var(--muted);margin-bottom:6px">Mode</span>';
  html += '    <div class="mode-toggle" role="group" aria-label="Light or dark mode">';
  html += '      <button class="mode-toggle-btn" data-mode="light" onclick="setMode(\'light\')"><i class="ti ti-sun"></i> Light</button>';
  html += '      <button class="mode-toggle-btn" data-mode="dark" onclick="setMode(\'dark\')"><i class="ti ti-moon"></i> Dark</button>';
  html += '    </div>';
  html += '  </div>';
  html += '</div>';
  html += '</div>';

  // ════════════════════════════════════════════════════════════
  // 3E — SETUP WIZARD
  // ════════════════════════════════════════════════════════════
  html += '<div class="card mb">';
  html += '<div class="section-label" style="margin-bottom:10px">Setup Wizard</div>';
  html += '<p style="font-size:.8rem;color:var(--muted);margin-bottom:14px">Re-run the first-time setup to change your app name, profile names, PINs, and account labels.</p>';
  html += '<button class="btn btn-primary btn-sm" onclick="settingsRunWizard()">Re-run Setup Wizard</button>';
  html += '</div>';

  // ════════════════════════════════════════════════════════════
  // 3F — DANGER ZONE
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
  // Reflect the active palette/mode in the freshly-rendered controls.
  if(typeof syncThemeControls === 'function') syncThemeControls(getPalette(), getMode());
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
  html += '<span style="font-size:.76rem;color:' + pinColor + ';font-weight:600">' + ICON('lock') + ' ' + pinStatus + '</span>';
  html += '<button class="btn btn-ghost btn-sm" onclick="settingsResetPIN(\'' + profileId + '\', \'' + _settEsc(currentName) + '\')">' + pinBtnLabel + '</button>';
  html += '</div>';

  html += '</div>';
  return html;
}

// ── Dashboard layout (onboarding profile picker) ──────────────
// The dashboard tiles are tailored by the onboarding profile stored in
// kf_profile, plus (for the "full" profile) the asset categories in kf_assets.
// These functions let the user switch profile from App Controls › Dashboard
// Layout so a re-run of onboarding no longer strands them on the wrong layout.

var _SETT_DASH_PROFILES = [
  { id: 'starter',   icon: 'ti-wallet',    accent: 'var(--success)', headline: 'Track my spending',    subline: 'Budgets, bills and savings goals — nothing extra.',              pills: ['Spending', 'Budgets', 'Bills', 'Goals'] },
  { id: 'household', icon: 'ti-home',       accent: 'var(--primary)', headline: 'Budget smarter',        subline: 'Household planning, mortgage and cashflow forecasting.',          pills: ['Net worth', 'Mortgage', 'Forecast', 'Goals'] },
  { id: 'full',      icon: 'ti-chart-bar',  accent: 'var(--warn)',    headline: 'Full financial picture', subline: 'Investments, super, property and tax — the complete view.',      pills: ['Net worth', 'Investments', 'Super', 'Property'] }
];

var _SETT_DASH_ASSETS = [
  { key: 'property',            icon: 'ti-home',          label: 'Property' },
  { key: 'equities',           icon: 'ti-trending-up',    label: 'Investments' },
  { key: 'super',              icon: 'ti-building-bank',   label: 'Superannuation' },
  { key: 'liabilities',        icon: 'ti-credit-card',     label: 'Liabilities' },
  { key: 'investment-property', icon: 'ti-building',       label: 'Investment property' }
];

// Working state, seeded from storage each time the settings page renders.
var _settDashProfile = 'full';
var _settDashAssets  = [];

function _settDashLoadState() {
  try {
    var p = localStorage.getItem('kf_profile');
    _settDashProfile = (p === 'starter' || p === 'household' || p === 'full') ? p : 'full';
  } catch(e) { _settDashProfile = 'full'; }
  try {
    var a = JSON.parse(localStorage.getItem('kf_assets') || '[]');
    _settDashAssets = Array.isArray(a) ? a.slice() : [];
  } catch(e) { _settDashAssets = []; }
}

// Standalone page renderer — lives under App Controls › Dashboard Layout.
// Routed from go('dashboard-layout') into #dashboard-layout-content.
function renderDashboardLayout() {
  var el = document.getElementById('dashboard-layout-content');
  if (!el) return;
  _settDashLoadState();
  var html = '';
  html += '<div class="card mb">';
  html += '<p style="font-size:.8rem;color:var(--muted);margin-bottom:16px">Choose which set of tiles your dashboard shows. This is the same choice you made during setup — pick it here any time without re-running onboarding.</p>';
  html += '<div id="sett-dash-body">' + _settDashBody() + '</div>';
  html += '</div>';
  el.innerHTML = html;
}

function _settDashBody() {
  var html = '';

  // Profile cards
  html += '<div style="display:flex;flex-direction:column;gap:10px">';
  for (var i = 0; i < _SETT_DASH_PROFILES.length; i++) {
    var p = _SETT_DASH_PROFILES[i];
    var sel = (p.id === _settDashProfile);
    var border = sel ? p.accent : 'var(--border)';
    var bg = sel ? 'color-mix(in srgb,' + p.accent + ' 8%, var(--card2))' : 'var(--card2)';
    html += '<div role="radio" aria-checked="' + (sel ? 'true' : 'false') + '" tabindex="0"'
      + ' onclick="settDashSelectProfile(\'' + p.id + '\')"'
      + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();settDashSelectProfile(\'' + p.id + '\');}"'
      + ' style="cursor:pointer;border:1.5px solid ' + border + ';background:' + bg + ';border-radius:12px;padding:14px 16px;transition:border-color .15s,background .15s">';
    html += '<div style="display:flex;align-items:flex-start;gap:14px">';
    html += '<div style="width:40px;height:40px;flex-shrink:0;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;background:color-mix(in srgb,' + p.accent + ' 14%, transparent);color:' + p.accent + '"><i class="ti ' + p.icon + '"></i></div>';
    html += '<div style="flex:1;min-width:0">';
    html += '<div style="font-family:var(--font-head,inherit);font-weight:600;font-size:.95rem;color:var(--text);margin-bottom:2px">' + _settEsc(p.headline) + '</div>';
    html += '<div style="font-size:.78rem;color:var(--muted);line-height:1.45">' + _settEsc(p.subline) + '</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">';
    for (var j = 0; j < p.pills.length; j++) {
      html += '<span style="font-size:.68rem;color:var(--muted);background:var(--card3,var(--card2));border:1px solid var(--border);border-radius:6px;padding:2px 8px;font-weight:500">' + _settEsc(p.pills[j]) + '</span>';
    }
    html += '</div>';
    html += '</div>';
    html += '<div style="width:22px;height:22px;flex-shrink:0;border-radius:50%;border:1.5px solid ' + (sel ? p.accent : 'var(--border)') + ';background:' + (sel ? p.accent : 'transparent') + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:.72rem">' + (sel ? '<i class="ti ti-check"></i>' : '') + '</div>';
    html += '</div>';
    html += '</div>';
  }
  html += '</div>';

  // Asset picker — only relevant to the "full" profile
  if (_settDashProfile === 'full') {
    html += '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">';
    html += '<div style="font-size:.8rem;font-weight:600;color:var(--text);margin-bottom:4px">Assets to show</div>';
    html += '<p style="font-size:.74rem;color:var(--muted);margin-bottom:12px">Pick which asset types appear in your net-worth breakdown and Your assets tile.</p>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px">';
    for (var k = 0; k < _SETT_DASH_ASSETS.length; k++) {
      var a = _SETT_DASH_ASSETS[k];
      var on = (_settDashAssets.indexOf(a.key) > -1);
      var abrd = on ? 'var(--warn)' : 'var(--border)';
      var abg = on ? 'color-mix(in srgb,var(--warn) 12%, transparent)' : 'var(--card2)';
      var acol = on ? 'var(--text)' : 'var(--muted)';
      html += '<span role="checkbox" aria-checked="' + (on ? 'true' : 'false') + '" tabindex="0"'
        + ' onclick="settDashToggleAsset(\'' + a.key + '\')"'
        + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();settDashToggleAsset(\'' + a.key + '\');}"'
        + ' style="cursor:pointer;display:inline-flex;align-items:center;gap:7px;border:1.5px solid ' + abrd + ';background:' + abg + ';color:' + acol + ';border-radius:9px;padding:8px 12px;font-size:.78rem;font-weight:500;transition:border-color .15s,background .15s">'
        + '<i class="ti ' + a.icon + '"></i>' + _settEsc(a.label)
        + (on ? '<i class="ti ti-check" style="color:var(--warn)"></i>' : '')
        + '</span>';
    }
    html += '</div>';
    html += '</div>';
  } else if (_settDashProfile === 'household') {
    html += '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">';
    html += '<p style="font-size:.74rem;color:var(--muted);line-height:1.5"><i class="ti ti-info-circle"></i> This layout tracks your home equity and cashflow forecast. Add or edit your mortgage any time from <span style="color:var(--primary);cursor:pointer" onclick="go(\'mortgage\')">Mortgage</span>.</p>';
    html += '</div>';
  }

  // Save
  html += '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">';
  html += '<button class="btn btn-primary btn-sm" onclick="settDashSave()">Save Dashboard Layout</button>';
  html += '</div>';

  return html;
}

function _settDashRefresh() {
  var el = document.getElementById('sett-dash-body');
  if (el) el.innerHTML = _settDashBody();
}

function settDashSelectProfile(id) {
  if (id !== 'starter' && id !== 'household' && id !== 'full') return;
  _settDashProfile = id;
  _settDashRefresh();
}

function settDashToggleAsset(key) {
  var idx = _settDashAssets.indexOf(key);
  if (idx > -1) _settDashAssets.splice(idx, 1); else _settDashAssets.push(key);
  _settDashRefresh();
}

function settDashSave() {
  try { localStorage.setItem('kf_profile', _settDashProfile); } catch(e) {}
  // Only the "full" profile uses kf_assets; keep it accurate for the others too.
  var assets = (_settDashProfile === 'full') ? _settDashAssets : [];
  try { localStorage.setItem('kf_assets', JSON.stringify(assets)); } catch(e) {}
  _settDashAssets = assets.slice();
  // Repaint the dashboard so the change is visible immediately.
  if (typeof kdRenderDashboard === 'function') {
    try { kdRenderDashboard(); } catch(e) {}
  }
  var name = { starter: 'Track my spending', household: 'Budget smarter', full: 'Full financial picture' }[_settDashProfile] || _settDashProfile;
  toast('✅ Dashboard set to “' + name + '”');
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

// ── Account management helpers ───────────────────────────────
var _CURRENCIES = ['AUD','USD','GBP','EUR','NZD','SGD','HKD','JPY','CAD','CHF'];
var _LOCATIONS  = ['Australia','New Zealand','United States','United Kingdom','Europe','Asia','Singapore','Canada','Other'];
var _AU_BANKS   = [
  '','Commonwealth Bank (CBA)','Westpac','NAB','ANZ','Macquarie Bank',
  'St George Bank','Bank of Melbourne','BankSA','ING Australia',
  'Bendigo Bank','Suncorp Bank','Bank of Queensland (BOQ)',
  'HSBC Australia','Citibank Australia','ME Bank','AMP Bank',
  'Ubank','Up Bank','Revolut','Wise','Other'
];

function _settAcctCurrSel(cur) {
  var html = '<select id="sett-acct-cur">';
  for (var i = 0; i < _CURRENCIES.length; i++) {
    html += '<option value="' + _CURRENCIES[i] + '"' + (_CURRENCIES[i] === cur ? ' selected' : '') + '>' + _CURRENCIES[i] + '</option>';
  }
  html += '</select>';
  return html;
}
function _settAcctLocSel(loc) {
  var html = '<select id="sett-acct-loc">';
  for (var i = 0; i < _LOCATIONS.length; i++) {
    html += '<option value="' + _LOCATIONS[i] + '"' + (_LOCATIONS[i] === loc ? ' selected' : '') + '>' + _LOCATIONS[i] + '</option>';
  }
  html += '</select>';
  return html;
}
function _settAcctCurrSelFor(id, cur) {
  var html = '<select id="sett-acct-cur-' + id + '">';
  for (var i = 0; i < _CURRENCIES.length; i++) {
    html += '<option value="' + _CURRENCIES[i] + '"' + (_CURRENCIES[i] === cur ? ' selected' : '') + '>' + _CURRENCIES[i] + '</option>';
  }
  html += '</select>';
  return html;
}
function _settAcctLocSelFor(id, loc) {
  var html = '<select id="sett-acct-loc-' + id + '">';
  for (var i = 0; i < _LOCATIONS.length; i++) {
    html += '<option value="' + _LOCATIONS[i] + '"' + (_LOCATIONS[i] === loc ? ' selected' : '') + '>' + _LOCATIONS[i] + '</option>';
  }
  html += '</select>';
  return html;
}

function _settAcctBankSel(selId, bank) {
  var html = '<select id="' + selId + '" style="width:100%;box-sizing:border-box">';
  var labels = ['— No Bank —','Commonwealth Bank (CBA)','Westpac','NAB','ANZ','Macquarie Bank',
    'St George Bank','Bank of Melbourne','BankSA','ING Australia','Bendigo Bank',
    'Suncorp Bank','Bank of Queensland (BOQ)','HSBC Australia','Citibank Australia',
    'ME Bank','AMP Bank','Ubank','Up Bank','Revolut','Wise','Other'];
  var vals = ['','CBA','Westpac','NAB','ANZ','Macquarie','St George','Bank of Melbourne',
    'BankSA','ING','Bendigo','Suncorp','BOQ','HSBC','Citibank','ME Bank',
    'AMP','Ubank','Up Bank','Revolut','Wise','Other'];
  for (var i = 0; i < labels.length; i++) {
    html += '<option value="' + vals[i] + '"' + (vals[i] === bank ? ' selected' : '') + '>' + labels[i] + '</option>';
  }
  html += '</select>';
  return html;
}

function _settAcctsList() {
  if (!ACCOUNTS || !ACCOUNTS.length) return '<p style="color:var(--muted);font-size:.82rem">No accounts yet.</p>';
  var html = '';
  for (var i = 0; i < ACCOUNTS.length; i++) {
    var a = ACCOUNTS[i];
    var meta = (a.currency || 'AUD') + (a.bank ? ' &middot; ' + _settEsc(a.bank) : '') + (a.isCore ? '' : ' &middot; <span style="color:var(--muted);font-size:.68rem">Custom</span>');
    html += '<div class="sett-acct-row" id="sett-acct-row-' + _settEsc(a.id) + '">'
      + '<div class="sett-acct-icon">' + iconTag(a.icon || 'building-bank') + '</div>'
      + '<div class="sett-acct-info">'
      + '<div class="sett-acct-name">' + _settEsc(a.name) + '</div>'
      + '<div class="sett-acct-meta">' + meta + '</div>'
      + '</div>'
      + '<div class="sett-acct-actions">'
      + '<button class="btn btn-ghost btn-sm" onclick="settAcctEdit(\'' + _settEsc(a.id) + '\')">Edit</button>'
      + (!a.isCore ? '<button class="btn btn-sm" style="background:var(--danger-bg);color:var(--danger);border:1px solid var(--danger)" onclick="settAcctDelete(\'' + _settEsc(a.id) + '\')">Delete</button>' : '')
      + '</div>'
      + '</div>';
  }
  return html;
}

// Shared account icon picker (hidden input + preview swatch + Tabler icon grid),
// used by both the add-account and edit-account forms.
function _settIconPickerHtml(inputId, previewId, currentIcon) {
  currentIcon = currentIcon || 'building-bank';
  return '<input type="hidden" id="' + inputId + '" value="' + currentIcon + '"/>'
    + '<div id="' + previewId + '" style="width:44px;height:44px;border-radius:8px;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:var(--primary);cursor:default">' + iconTag(currentIcon) + '</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;max-width:220px">'
    + ICON_PICKER_SET.map(function(k) {
        return '<span style="cursor:pointer;font-size:1.05rem;padding:5px;border-radius:5px;background:var(--card2);color:var(--muted)" onclick="_settPickIcon(\'' + inputId + '\',\'' + previewId + '\',\'' + k + '\')">' + ICON(k) + '</span>';
      }).join('')
    + '</div>';
}
function _settPickIcon(inputId, previewId, key) {
  var input = document.getElementById(inputId);
  if (input) input.value = key;
  var prev = document.getElementById(previewId);
  if (prev) prev.innerHTML = iconTag(key);
}

function _settAcctAddForm() {
  return '<div class="sett-acct-form">'
    + '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--primary);margin-bottom:12px">New Account</div>'
    + '<div class="form-grid" style="grid-template-columns:56px 1fr">'
    + '<div><label class="lbl">Icon</label>' + _settIconPickerHtml('sett-acct-new-icon', 'sett-acct-new-icon-preview', 'building-bank') + '</div>'
    + '<div><label class="lbl">Nickname</label><input type="text" id="sett-acct-new-name" placeholder="e.g. US Investment Account" style="font-size:16px"/></div>'
    + '</div>'
    + '<div class="form-grid" style="margin-top:8px">'
    + '<div><label class="lbl">Bank</label>' + _settAcctBankSel('sett-acct-bank', '') + '</div>'
    + '<div><label class="lbl">Currency</label>' + _settAcctCurrSel('AUD') + '</div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;margin-top:4px">'
    + '<button class="btn btn-primary btn-sm" onclick="settAcctAdd()">Add Account</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="settAcctCancelAdd()">Cancel</button>'
    + '</div>'
    + '</div>';
}

function settAcctShowAdd() {
  var f = document.getElementById('sett-acct-add-form');
  if (f) { f.style.display = 'block'; f.scrollIntoView({ behavior:'smooth', block:'nearest' }); }
}
function settAcctCancelAdd() {
  var f = document.getElementById('sett-acct-add-form');
  if (f) f.style.display = 'none';
}

function settAcctAdd() {
  if (ACCOUNTS.length >= 8) { toast('Maximum 8 accounts reached'); return; }
  var name = (document.getElementById('sett-acct-new-name') || {}).value.trim();
  if (!name) { toast('Please enter an account nickname'); return; }
  var icon = (document.getElementById('sett-acct-new-icon') || {}).value.trim() || 'building-bank';
  var cur  = (document.getElementById('sett-acct-cur') || {}).value || 'AUD';
  var bank = (document.getElementById('sett-acct-bank') || {}).value || '';
  var newId = 'acct_' + Date.now().toString(36);
  ACCOUNTS.push({ id:newId, name:name, icon:icon, currency:cur, bank:bank, location:'Australia', color:'#818CF8', isCore:false });
  save(K.accounts, ACCOUNTS);
  _settAcctsRefresh();
  settAcctCancelAdd();
  CT_ACCTS = _buildCTAccts();
  toast('✅ Account added');
}

function settAcctEdit(id) {
  var a = ACCOUNTS.find(function(x){ return x.id === id; });
  if (!a) return;
  var row = document.getElementById('sett-acct-row-' + id);
  if (!row) return;
  row.innerHTML = '<div class="sett-acct-form" style="width:100%">'
    + '<div class="form-grid" style="grid-template-columns:56px 1fr">'
    + '<div><label class="lbl">Icon</label>' + _settIconPickerHtml('sett-edit-icon-' + _settEsc(id), 'sett-edit-icon-preview-' + _settEsc(id), a.icon || 'building-bank') + '</div>'
    + '<div><label class="lbl">Nickname</label><input type="text" id="sett-edit-name-' + _settEsc(id) + '" value="' + _settEsc(a.name) + '" placeholder="Account nickname" style="font-size:16px"/></div>'
    + '</div>'
    + '<div class="form-grid" style="margin-top:8px">'
    + '<div><label class="lbl">Bank</label>' + _settAcctBankSel('sett-acct-bank-' + _settEsc(id), a.bank||'') + '</div>'
    + '<div><label class="lbl">Currency</label>' + _settAcctCurrSelFor(id, a.currency||'AUD') + '</div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;margin-top:4px">'
    + '<button class="btn btn-primary btn-sm" onclick="settAcctSave(\'' + _settEsc(id) + '\')">Save</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="settAcctCancel()">Cancel</button>'
    + '</div>'
    + '</div>';
}

function settAcctSave(id) {
  var a = ACCOUNTS.find(function(x){ return x.id === id; });
  if (!a) return;
  var nameEl = document.getElementById('sett-edit-name-' + id);
  var iconEl = document.getElementById('sett-edit-icon-' + id);
  var curEl  = document.getElementById('sett-acct-cur-' + id);
  var bankEl = document.getElementById('sett-acct-bank-' + id);
  if (nameEl) a.name = nameEl.value.trim() || a.name;
  if (iconEl) a.icon = iconEl.value.trim() || a.icon || 'building-bank';
  if (curEl)  a.currency = curEl.value;
  if (bankEl) a.bank = bankEl.value;
  save(K.accounts, ACCOUNTS);
  // Keep USER_CONFIG in sync for core accounts
  if (a.isCore) {
    USER_CONFIG['acct_' + id] = a.name;
    saveUserConfig();
    applyUserConfig();
  }
  _settAcctsRefresh();
  CT_ACCTS = _buildCTAccts();
  if (typeof renderCashTracker === 'function') renderCashTracker();
  toast('✅ Account updated');
}

function settAcctCancel() {
  _settAcctsRefresh();
}

function settAcctDelete(id) {
  var a = ACCOUNTS.find(function(x){ return x.id === id; });
  if (!a || a.isCore) return;
  if (!confirm('Delete "' + a.name + '"?\n\nAny balance data for this account will also be removed.')) return;
  ACCOUNTS = ACCOUNTS.filter(function(x){ return x.id !== id; });
  // Clean up CT balance data
  if (typeof CT !== 'undefined' && CT) {
    delete CT[id];
    save(K.ct, CT);
  }
  save(K.accounts, ACCOUNTS);
  _settAcctsRefresh();
  CT_ACCTS = _buildCTAccts();
  if (typeof renderCashTracker === 'function') renderCashTracker();
  toast('✅ Account removed');
}

function _settAcctsRefresh() {
  var el = document.getElementById('sett-accts-list');
  if (el) el.innerHTML = _settAcctsList();
}

function settingsSaveAccounts() {
  // Legacy shim — kept for any external callers
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
  if (typeof _BUILT_IN_CATS === 'undefined') {
    toast('⚠️ Cannot reset — categories not loaded');
    return;
  }
  if (!confirm('Reset all categories to defaults?\n\nYour transactions will NOT be deleted, but any custom categories you created will be removed.')) {
    return;
  }
  try {
    LCATS = JSON.parse(JSON.stringify(_BUILT_IN_CATS));
    // Add Uncategorised if missing
    if (!LCATS.find(function(c) { return c.id === 'uncategorised'; })) {
      LCATS.push({ id:'uncategorised', name:'Uncategorised', icon:'help', color:'#8a8095', type:'both', subcats:[] });
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
  if (!confirm('ERASE ALL DATA?\n\nThis will permanently delete:\n• All transactions\n• All bills and budgets\n• Mortgage, super and assets data\n• All settings and PINs\n\nThis CANNOT be undone. Are you absolutely sure?')) {
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
    K.transfers, K.equities, K.billAliases, K.billsDismissed, K.billsHorizon,
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
  if (!confirm("Re-run the setup wizard?\n\nThis will lock the app and walk you through setup again. Your financial data will NOT be deleted.")) return;
  if (typeof obRelaunch === "function") obRelaunch();
  else if (typeof wzRestart === "function") wzRestart();
  else { toast('⚠️ Setup not available — reload the app'); }
}

// ══════════════════════════════════════════════════════════════
// CUSTOMISE VIEWS / ROLES  (App Controls › Customise Views)
//   Deviations from the source spec, for the current codebase:
//   - Depth changes are delegated to the existing "Dashboard Layout"
//     page (kf_profile) rather than a duplicate upgrade flow here.
//   - Pre-lens installs get a default config (both users 'full') so
//     nothing changes visually until a lens is chosen.
// ══════════════════════════════════════════════════════════════

// Ensure a lens config exists (older installs predate the lens system).
function _cvEnsureConfig() {
  var c = (typeof loadLensConfig === 'function') ? loadLensConfig() : null;
  if (c && c.users) return c;
  var mgr = 'brenton';
  try { var m = localStorage.getItem(K.managerProfile); if (m) mgr = m; } catch (e) {}
  c = {
    manager: mgr, partnerSetupDone: true, transferPending: false, transferTo: '',
    users: {
      brenton: { role: mgr === 'brenton' ? 'manager' : 'partner', depth: 'full', lens: 'full', q1: '', q2: '', q3: '' },
      shelley: { role: mgr === 'shelley' ? 'manager' : 'partner', depth: 'full', lens: 'full', q1: '', q2: '', q3: '' }
    }
  };
  if (typeof saveLensConfig === 'function') saveLensConfig(c);
  return c;
}

function _cvHasPartner() {
  try { return !!(USER_CONFIG && USER_CONFIG.p2enabled); } catch (e) { return true; }
}
function _cvName(key) {
  return (typeof getUserName === 'function' ? getUserName(key) : key) || (key === 'shelley' ? 'Partner' : 'Manager');
}
function _cvInitial(key) { return _cvName(key).charAt(0).toUpperCase() || '?'; }

var _CV_Q1 = { A: 'Getting on top of spending', B: 'Own or paying off a home', C: 'Property / investments / super' };
var _CV_Q2 = { A: 'Progress on goals', B: 'Where money goes', C: 'The full picture' };
var _CV_Q3 = { A: 'Daily — all the detail', B: 'Weekly/monthly — a snapshot', C: 'Only when something needs me' };

function renderCustomiseViews() {
  var host = document.getElementById('customise-views-content');
  if (!host) return;
  var c = _cvEnsureConfig();
  var me = (typeof getCurrentProfileKey === 'function') ? getCurrentProfileKey() : 'brenton';
  var managerKey = c.manager;
  var partnerKey = managerKey === 'brenton' ? 'shelley' : 'brenton';
  var iAmManager = (me === managerKey);
  var keys = _cvHasPartner() ? [managerKey, partnerKey] : [managerKey];

  var html = '';

  // If a transfer is pending TO the current (partner) user, prompt to accept.
  if (c.transferPending && c.transferTo === me && me !== managerKey) {
    html += '<div class="cv-card cv-notice cv-notice--amber">'
      + '<div>' + esc(_cvName(managerKey)) + ' wants to transfer the household manager role to you.</div>'
      + '<button class="btn btn-primary btn-sm" onclick="cvTransferAccept()">Accept and confirm</button>'
      + '</div>';
  }

  // ── Section 1 — Household roles ──
  html += '<div class="cv-card"><div class="cv-card-ttl">Household roles</div>';
  keys.forEach(function (k) {
    var role = (k === managerKey) ? 'manager' : 'partner';
    var badge = role === 'manager'
      ? '<span class="cv-badge cv-badge--mgr">Household manager</span>'
      : '<span class="cv-badge cv-badge--partner">Partner</span>';
    html += '<div class="cv-user-row">'
      + '<div class="cv-avatar ' + (role === 'manager' ? 'cv-avatar--mgr' : 'cv-avatar--partner') + '">' + esc(_cvInitial(k)) + '</div>'
      + '<div class="cv-user-name">' + esc(_cvName(k)) + '</div>' + badge + '</div>';
  });

  if (iAmManager && _cvHasPartner()) {
    html += '<div class="cv-divider"></div>';
    html += '<div class="cv-sub-ttl">Transfer household manager role</div>';
    html += '<div class="cv-hint">The manager has full access to all features and data. Transferring is permanent until transferred back. Both PINs are required to confirm.</div>';
    if (c.transferPending) {
      html += '<div class="cv-notice cv-notice--amber" style="margin-top:10px">⏳ Transfer to ' + esc(_cvName(c.transferTo)) + ' is pending. Ask them to log in and confirm here.</div>'
        + '<button class="btn btn-ghost btn-sm" onclick="cvTransferCancel()" style="margin-top:8px">Cancel transfer</button>';
    } else {
      html += '<button class="btn btn-ghost btn-sm" onclick="cvTransferStart()" style="margin-top:8px">Transfer to ' + esc(_cvName(partnerKey)) + ' →</button>';
    }
  }
  html += '</div>';

  // ── Section 2 — View settings per user ──
  keys.forEach(function (k) {
    var u = c.users[k] || {};
    var role = (k === managerKey) ? 'manager' : 'partner';
    var lens = u.lens || 'full';
    html += '<div class="cv-card"><div class="cv-card-ttl">' + esc(_cvName(k)) + "'s view "
      + (role === 'manager' ? '<span class="cv-badge cv-badge--mgr">Manager</span>' : '<span class="cv-badge cv-badge--partner">Partner</span>') + '</div>';

    html += '<div class="cv-row"><div class="cv-row-lbl">CURRENT VIEW</div>'
      + '<div class="cv-row-val">' + (typeof lensIcon === 'function' ? lensIcon(lens) : '') + ' ' + esc(typeof lensDisplayName === 'function' ? lensDisplayName(lens) : lens) + '</div>'
      + '<button class="btn btn-ghost btn-sm" onclick="cvToggleLensPicker(\'' + k + '\')">Change</button></div>';
    html += '<div class="cv-lens-picker" id="cv-lens-picker-' + k + '" style="display:none">' + _cvLensButtons(k, lens) + '</div>';

    if (u.q2) {
      html += '<div class="cv-row cv-row--stack"><div class="cv-row-lbl">SETUP ANSWERS</div><div class="cv-pills">'
        + (u.q1 ? '<span class="cv-pill">' + esc(_CV_Q1[u.q1] || u.q1) + '</span>' : '')
        + '<span class="cv-pill">' + esc(_CV_Q2[u.q2] || u.q2) + '</span>'
        + '<span class="cv-pill">' + esc(_CV_Q3[u.q3] || u.q3) + '</span></div></div>';
    } else if (role === 'partner') {
      html += '<div class="cv-row"><div class="cv-row-lbl">SETUP ANSWERS</div><div class="cv-row-val cv-muted">Set up when ' + esc(_cvName(k)) + ' first logs in</div></div>';
    }

    html += '<button class="btn btn-ghost btn-sm" onclick="cvRerun(\'' + k + '\')" style="margin-top:6px">Re-run personalisation questions</button>';

    if (role === 'manager') {
      html += '<div class="cv-row cv-row--stack" style="margin-top:10px"><div class="cv-row-lbl">ACCESS LEVEL</div>'
        + '<div class="cv-row-val" style="color:var(--success)">Full access — all modules always visible</div>'
        + '<div class="cv-muted">The manager always sees all of Kelda regardless of view setting.</div></div>';
    }
    html += '</div>';
  });

  // ── Section 3 — Depth profile (delegates to Dashboard Layout) ──
  var depth = 'full';
  try { depth = localStorage.getItem('kf_profile') || 'full'; } catch (e) {}
  var depthMap = {
    starter: '🌱 Getting started — Spending, budgets, bills, goals',
    household: '🏠 Household — Adds mortgage and forecasting',
    full: '📊 Full — Adds investments, super, property, tax'
  };
  html += '<div class="cv-card"><div class="cv-card-ttl">Household modules</div>'
    + '<div class="cv-hint">Controls which sections of Kelda are available. Set during onboarding based on your household situation.</div>'
    + '<div class="cv-depth-card">' + esc(depthMap[depth] || depthMap.full) + '</div>';
  if (iAmManager) {
    html += '<button class="btn btn-ghost btn-sm" onclick="go(\'dashboard-layout\')" style="margin-top:8px">Change household modules →</button>'
      + '<div class="cv-muted" style="margin-top:8px">To simplify your view, change your View Setting above rather than removing modules.</div>';
  } else {
    html += '<div class="cv-muted" style="margin-top:8px">Only the household manager can change household modules.</div>';
  }
  html += '</div>';

  host.innerHTML = html;
}

function _cvLensButtons(key, active) {
  var lenses = [['calm', '🧘', 'Calm'], ['clear', '📋', 'Clear'], ['full', '📊', 'Full'], ['goals', '🎯', 'Goals']];
  var out = '';
  for (var i = 0; i < lenses.length; i++) {
    var l = lenses[i];
    out += '<button class="kf-lens-btn' + (l[0] === active ? ' kf-lens-btn--active' : '') + '" data-lens="' + l[0] + '" onclick="cvSetUserLens(\'' + key + '\',\'' + l[0] + '\')">'
      + '<span aria-hidden="true">' + l[1] + '</span><span class="kf-lens-btn__label">' + l[2] + '</span></button>';
  }
  return '<div class="kf-lens-switcher" style="margin:6px 0 0">' + out + '</div>';
}
function cvToggleLensPicker(key) {
  var el = document.getElementById('cv-lens-picker-' + key);
  if (el) el.style.display = (el.style.display === 'none') ? '' : 'none';
}
function cvSetUserLens(key, lens) {
  var c = _cvEnsureConfig();
  if (!c.users[key]) c.users[key] = {};
  c.users[key].lens = lens;
  saveLensConfig(c);
  var me = (typeof getCurrentProfileKey === 'function') ? getCurrentProfileKey() : 'brenton';
  if (key === me && typeof applyLens === 'function') applyLens(me);
  try { toast('View updated'); } catch (e) {}
  renderCustomiseViews();
}

// ── Re-run personalisation questions ──
function cvRerun(key) {
  var c = _cvEnsureConfig();
  var u = c.users[key] || {};
  var isMgr = (key === c.manager);
  var body = '';
  if (isMgr) body += _cvQuestionBlock('q1', 'Which best describes your household?', _CV_Q1, u.q1);
  body += _cvQuestionBlock('q2', 'What would make Kelda most useful?', _CV_Q2, u.q2);
  body += _cvQuestionBlock('q3', 'How do you want to engage?', _CV_Q3, u.q3);
  body += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">'
    + '<button class="btn btn-ghost btn-sm" onclick="cvCloseModal()">Cancel</button>'
    + '<button class="btn btn-primary btn-sm" onclick="cvRerunSubmit(\'' + key + '\',' + (isMgr ? 'true' : 'false') + ')">Update view</button></div>';
  _cvModal("Re-run personalisation", body);
}
function _cvQuestionBlock(q, heading, map, current) {
  var out = '<div class="cv-q-block"><div class="cv-q-head">' + esc(heading) + '</div>';
  ['A', 'B', 'C'].forEach(function (opt) {
    var checked = current === opt ? ' checked' : '';
    out += '<label class="cv-q-opt"><input type="radio" name="cv-' + q + '" value="' + opt + '"' + checked + '> ' + esc(map[opt]) + '</label>';
  });
  return out + '</div>';
}
function _cvPicked(q) {
  var el = document.querySelector('input[name="cv-' + q + '"]:checked');
  return el ? el.value : '';
}
function cvRerunSubmit(key, isMgr) {
  var c = _cvEnsureConfig();
  if (!c.users[key]) c.users[key] = {};
  var q2 = _cvPicked('q2'), q3 = _cvPicked('q3');
  if (!q2 || !q3) { try { toast('⚠️ Pick an answer for each question'); } catch (e) {} return; }
  c.users[key].q2 = q2; c.users[key].q3 = q3;
  if (isMgr) { var q1 = _cvPicked('q1'); if (q1) { c.users[key].q1 = q1; c.users[key].depth = computeLens ? computeDepth(q1) : c.users[key].depth; } }
  c.users[key].lens = computeLens(q2, q3);
  saveLensConfig(c);
  cvCloseModal();
  var me = (typeof getCurrentProfileKey === 'function') ? getCurrentProfileKey() : 'brenton';
  if (key === me && typeof applyLens === 'function') applyLens(me);
  try { toast('View updated'); } catch (e) {}
  renderCustomiseViews();
}

// ── Role transfer (PIN-gated) ──
function cvTransferStart() {
  var c = _cvEnsureConfig();
  var partnerKey = c.manager === 'brenton' ? 'shelley' : 'brenton';
  var body = '<div class="cv-hint">This gives ' + esc(_cvName(partnerKey)) + ' full access to all household data and features. You\'ll become a partner with your current view settings.</div>'
    + '<label class="lbl" style="margin-top:12px">Enter your PIN to continue</label>'
    + '<input type="password" id="cv-pin" inputmode="numeric" maxlength="4" autocomplete="off" style="width:100%;box-sizing:border-box;letter-spacing:.3em;text-align:center">'
    + '<div id="cv-pin-err" style="color:var(--danger);font-size:.76rem;min-height:16px;margin-top:6px"></div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end">'
    + '<button class="btn btn-ghost btn-sm" onclick="cvCloseModal()">Cancel</button>'
    + '<button class="btn btn-primary btn-sm" onclick="cvTransferConfirm()">Confirm with PIN</button></div>';
  _cvModal('Transfer manager role to ' + _cvName(partnerKey) + '?', body);
}
function cvTransferConfirm() {
  var c = _cvEnsureConfig();
  var mgr = c.manager;
  var partnerKey = mgr === 'brenton' ? 'shelley' : 'brenton';
  var pin = (document.getElementById('cv-pin') || {}).value || '';
  verifyPin(mgr, pin).then(function (res) {
    if (!res || !res.ok) { var e = document.getElementById('cv-pin-err'); if (e) e.textContent = 'Incorrect PIN'; return; }
    c.transferPending = true; c.transferTo = partnerKey; saveLensConfig(c);
    cvCloseModal(); try { toast('Transfer pending — ' + _cvName(partnerKey) + ' must confirm'); } catch (e2) {}
    renderCustomiseViews();
  });
}
function cvTransferCancel() {
  var c = _cvEnsureConfig();
  c.transferPending = false; c.transferTo = ''; saveLensConfig(c);
  renderCustomiseViews();
}
function cvTransferAccept() {
  var c = _cvEnsureConfig();
  var me = (typeof getCurrentProfileKey === 'function') ? getCurrentProfileKey() : 'brenton';
  var body = '<div class="cv-hint">Enter your PIN to become the household manager.</div>'
    + '<input type="password" id="cv-pin" inputmode="numeric" maxlength="4" autocomplete="off" style="width:100%;box-sizing:border-box;letter-spacing:.3em;text-align:center">'
    + '<div id="cv-pin-err" style="color:var(--danger);font-size:.76rem;min-height:16px;margin-top:6px"></div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end">'
    + '<button class="btn btn-ghost btn-sm" onclick="cvCloseModal()">Cancel</button>'
    + '<button class="btn btn-primary btn-sm" onclick="cvTransferAcceptConfirm()">Confirm</button></div>';
  _cvModal('Become household manager?', body);
}
function cvTransferAcceptConfirm() {
  var c = _cvEnsureConfig();
  var me = (typeof getCurrentProfileKey === 'function') ? getCurrentProfileKey() : 'brenton';
  var pin = (document.getElementById('cv-pin') || {}).value || '';
  verifyPin(me, pin).then(function (res) {
    if (!res || !res.ok) { var e = document.getElementById('cv-pin-err'); if (e) e.textContent = 'Incorrect PIN'; return; }
    var oldMgr = c.manager;
    c.manager = me;
    if (c.users[me]) c.users[me].role = 'manager';
    if (c.users[oldMgr]) c.users[oldMgr].role = 'partner';
    c.transferPending = false; c.transferTo = '';
    saveLensConfig(c);
    cvCloseModal();
    if (typeof applyLens === 'function') applyLens(me);
    try { toast("Role transferred. You're now the household manager."); } catch (e2) {}
    renderCustomiseViews();
  });
}

// ── Tiny modal helper (self-contained overlay) ──
function _cvModal(title, innerHtml) {
  cvCloseModal();
  var ov = document.createElement('div');
  ov.className = 'modal-overlay open';
  ov.id = 'cv-modal';
  ov.onclick = function (e) { if (e.target === ov) cvCloseModal(); };
  ov.innerHTML = '<div class="modal-box" onclick="event.stopPropagation()" style="max-width:460px;width:100%">'
    + '<h3 style="margin-bottom:12px">' + esc(title) + '</h3>' + innerHtml + '</div>';
  document.body.appendChild(ov);
  var pin = document.getElementById('cv-pin'); if (pin) setTimeout(function () { pin.focus(); }, 50);
}
function cvCloseModal() {
  var m = document.getElementById('cv-modal'); if (m) m.remove();
}
