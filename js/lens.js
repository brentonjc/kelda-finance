// ══════════════════════════════════════════════════════════════
// LENS + ROLE ENGINE
//   Per-user dashboard/nav tailoring. One user is the household
//   "manager" (always full module access); the other is a "partner"
//   whose lens controls what they see.
//
// ADAPTED TO THIS CODEBASE (deviations from the source spec):
//   - Active profile is the auth.js global `activeProfile` (NOT
//     window.ACTIVE_PROFILE, which does not exist here).
//   - Nav is flyout-based (.nav-fly-item / .nav-group), so data-lens-hide
//     is placed on flyout items and whole category groups.
//   - The dashboard computes alarm colours inline, so the calm lens
//     softens by HIDING alarming sections (data-lens-show) rather than
//     recolouring non-existent .prog-fill--danger classes.
//   - Uses the global esc() from storage.js.
// ══════════════════════════════════════════════════════════════

function loadLensConfig() {
  try { return load(K.lensConfig); } catch (e) { return null; }
}
function saveLensConfig(config) {
  try { save(K.lensConfig, config); } catch (e) {}
  try { if (config && config.manager) localStorage.setItem(K.managerProfile, config.manager); } catch (e) {}
}

// ── Pure routing ──────────────────────────────────────────────
function computeLens(q2, q3) {
  if (q3 === 'C') return 'calm';
  if (q2 === 'A') return 'goals';
  if (q2 === 'B') return 'clear';
  return 'full';
}
function computeDepth(q1) {
  if (q1 === 'A') return 'starter';
  if (q1 === 'B') return 'household';
  return 'full';
}

// ── Role / lens reads ─────────────────────────────────────────
function isManager(profileKey) {
  var c = loadLensConfig();
  if (!c) return true;            // fail open — no config yet means solo/manager
  return c.manager === profileKey;
}
function getLens(profileKey) {
  var c = loadLensConfig();
  if (!c || !c.users || !c.users[profileKey]) return 'full';
  return c.users[profileKey].lens || 'full';
}
function getDepth(profileKey) {
  var c = loadLensConfig();
  if (!c || !c.users || !c.users[profileKey]) return 'full';
  if (isManager(profileKey)) return 'full';   // manager always gets full depth
  return c.users[profileKey].depth || 'starter';
}
function setLens(profileKey, lens) {
  var c = loadLensConfig();
  if (!c || !c.users) return;
  if (!c.users[profileKey]) c.users[profileKey] = {};
  c.users[profileKey].lens = lens;
  saveLensConfig(c);
}

// Active profile key — auth.js keeps it in the module-global `activeProfile`.
function getCurrentProfileKey() {
  try { if (typeof activeProfile !== 'undefined' && activeProfile) return activeProfile; } catch (e) {}
  return 'brenton';
}

// ── Application ───────────────────────────────────────────────
function applyLens(profileKey) {
  var lens = getLens(profileKey);
  var manager = isManager(profileKey);
  try { document.body.setAttribute('data-lens', lens); } catch (e) {}
  applyNavVisibility(profileKey, lens, manager);
  applyDashboardSections(lens);
  applyCalmOverrides(lens);
  var manageLink = document.getElementById('kf-manage-link');
  if (manageLink) manageLink.style.display = (manager && lens === 'calm') ? 'block' : 'none';
  updateLensSwitcherUI(lens);
  updateLensPillUI(lens);
}

// Nav items/groups carry data-lens-hide="calm,goals". Manager sees everything.
function applyNavVisibility(profileKey, lens, manager) {
  var items = document.querySelectorAll('[data-lens-hide]');
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (manager) { item.style.display = ''; continue; }
    var hideFor = item.getAttribute('data-lens-hide') || '';
    item.style.display = (hideFor.indexOf(lens) > -1) ? 'none' : '';
  }
}

// Dashboard sections carry data-lens-show="full,clear,goals" (whitelist).
function applyDashboardSections(lens) {
  var sections = document.querySelectorAll('[data-lens-show]');
  for (var i = 0; i < sections.length; i++) {
    var showFor = sections[i].getAttribute('data-lens-show') || '';
    sections[i].style.display = (showFor.indexOf(lens) > -1) ? '' : 'none';
  }
}

// Forward-compatible soft-touch pass. The primary calm effect is section
// hiding above; this only relabels alarm badges that use stable classes.
function applyCalmOverrides(lens) {
  var calm = lens === 'calm';
  var badges = document.querySelectorAll('.badge--overdue, .kd-overdue-badge');
  for (var i = 0; i < badges.length; i++) {
    if (calm) {
      badges[i].dataset.calmOrig = badges[i].dataset.calmOrig || badges[i].textContent;
      badges[i].textContent = 'Needs attention';
    } else if (badges[i].dataset.calmOrig) {
      badges[i].textContent = badges[i].dataset.calmOrig;
    }
  }
}

// Called at the end of the dashboard render so freshly-built tiles get lensed.
function applyLensToDashboard() {
  var lens = getLens(getCurrentProfileKey());
  injectCalmHero(lens);
  applyDashboardSections(lens);
  applyCalmOverrides(lens);
}

// Calm hero — a single reassuring card shown only on the calm lens.
function injectCalmHero(lens) {
  var host = document.querySelector('#page-dashboard .kd-bodywrap') || document.getElementById('page-dashboard');
  if (!host) return;
  var hero = document.getElementById('kf-calm-hero');
  if (lens !== 'calm') { if (hero) hero.style.display = 'none'; return; }

  var status = calmStatus();
  if (!hero) {
    hero = document.createElement('div');
    hero.id = 'kf-calm-hero';
    hero.setAttribute('data-lens-show', 'calm');
    hero.className = 'kf-calm-hero';
    host.insertBefore(hero, host.firstChild);
  } else if (hero.parentNode !== host) {
    host.insertBefore(hero, host.firstChild);
  }
  hero.style.display = '';
  hero.innerHTML =
    '<div class="kf-calm-emoji">' + status.emoji + '</div>' +
    '<div class="kf-calm-status">' + esc(status.title) + '</div>' +
    '<div class="kf-calm-sub">' + esc(status.sub) + '</div>';
}

// Reassuring status line — reads only what is cheaply available.
function calmStatus() {
  var name = '';
  try {
    var key = getCurrentProfileKey();
    if (typeof getUserName === 'function') name = getUserName(key) || '';
  } catch (e) {}
  var overdue = 0, exceeded = 0, netPositive = true;
  try { if (typeof kfCalmSignals === 'function') { var s = kfCalmSignals(); overdue = s.overdue; exceeded = s.exceeded; netPositive = s.netPositive; } } catch (e) {}
  if (overdue > 0) return { emoji: '📮', title: 'A bill needs your attention', sub: 'Everything else is ticking along.' };
  if (exceeded >= 2) return { emoji: '👀', title: 'Heads up — a few things to review', sub: 'A couple of budgets ran over this month.' };
  var hi = name ? ("You're on track, " + name) : "You're on track this month";
  return { emoji: '👋', title: hi, sub: 'Balance is healthy. No action needed right now.' };
}

// ── Lens switcher UI ──────────────────────────────────────────
function switchLensUI(newLens) {
  var key = getCurrentProfileKey();
  setLens(key, newLens);
  var page = _lensCurrentPage();
  if (typeof go === 'function') go(page);   // re-render, then lens the fresh DOM
  applyLens(key);
  try { if (typeof toast === 'function') toast('View updated to ' + lensDisplayName(newLens)); } catch (e) {}
}
function lensDisplayName(lens) {
  var names = { calm: 'Calm', clear: 'Clear', full: 'Full', goals: 'Goals' };
  return names[lens] || lens;
}
function lensIcon(lens) {
  var icons = { calm: '🧘', clear: '📋', full: '📊', goals: '🎯' };
  return icons[lens] || '📊';
}
function updateLensSwitcherUI(activeLens) {
  var btns = document.querySelectorAll('.kf-lens-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('kf-lens-btn--active', btns[i].getAttribute('data-lens') === activeLens);
  }
}
function updateLensPillUI(activeLens) {
  var ic = document.getElementById('kf-lens-pill-icon');
  var lb = document.getElementById('kf-lens-pill-label');
  if (ic) ic.textContent = lensIcon(activeLens);
  if (lb) lb.textContent = lensDisplayName(activeLens);
}
function _lensCurrentPage() {
  var el = document.querySelector('.page.active');
  return el ? (el.id || 'page-dashboard').replace('page-', '') : 'dashboard';
}

// ── Partner first-login gate ──────────────────────────────────
function shouldShowPartnerFirstLogin(profileKey) {
  var c = loadLensConfig();
  if (!c) return false;
  if (c.partnerSetupDone) return false;
  if (c.manager === profileKey) return false;
  if (c.users && c.users[profileKey] && c.users[profileKey].q2 && c.users[profileKey].q2 !== '') return false;
  return true;
}
