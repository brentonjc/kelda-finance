// ═══════════════════════════════════════════════════════════════
//  whatsnew.js — "What's new": Dashboard card, page, sign-in sheet,
//  bell section, unread dots and "New" nav badges.
// ───────────────────────────────────────────────────────────────
//  Content comes from APP_CHANGELOG (js/version.js); the rules live
//  in js/whatsnew-core.js. State is per profile in cff_whatsnew.
//  Spec: docs/specs/whats-new.md
// ═══════════════════════════════════════════════════════════════

var WN_PROFILE_IDS = ['brenton', 'shelley', 'joint'];

// Beta flags a release's Try it link can depend on (entry.requires).
var WN_BETA_CHECKS = {
  tax: function() { return typeof taxEnabled === 'function' && taxEnabled(); }
};

function wnLog() {
  return (typeof APP_CHANGELOG !== 'undefined' && Array.isArray(APP_CHANGELOG)) ? APP_CHANGELOG : [];
}
function wnToday() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function wnFmtDate(iso) {
  var d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? '' : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function wnFind(version) {
  var log = wnLog();
  for (var i = 0; i < log.length; i++) if (log[i].version === version) return log[i];
  return null;
}
// Only a signed-in profile reads or changes its own state.
function wnProfile() {
  if (typeof loggedIn === 'undefined' || !loggedIn) return null;
  return (typeof activeProfile === 'string' && activeProfile) ? activeProfile : null;
}

// ── State ─────────────────────────────────────────────────────
// Every profile is set up together the first time, from the version
// this device ran before (an upgrade) or the current one (a fresh install).
function wnStore() {
  var store = load(K.whatsnew);
  var ids = WN_PROFILE_IDS.slice();
  var missing = !store || ids.some(function(id) { return !store[id]; });
  if (missing) {
    var prev = (typeof PREV_RUN_VERSION !== 'undefined') ? PREV_RUN_VERSION : null;
    // A record created after the first run means a profile was added later:
    // it starts at the current version.
    var seen = store ? APP_VERSION : wnInitialSeen(prev, APP_VERSION);
    store = wnEnsureProfiles(store || {}, ids, seen);
    save(K.whatsnew, store);
  }
  return store;
}
function wnState() {
  var p = wnProfile();
  return p ? wnStore()[p] : null;
}
function wnSetState(next) {
  var p = wnProfile();
  if (!p) return;
  var store = wnStore();
  store[p] = next;
  save(K.whatsnew, store);
}

// Unseen highlighted releases for the signed-in profile (drives the dots).
function wnUnreadCount() {
  var s = wnState();
  return s ? wnUnseenHighlights(wnLog(), s.seen).length : 0;
}
function wnMarkAllSeen() {
  var s = wnState();
  if (s) wnSetState(wnMarkSeen(s, APP_VERSION));
}

// ── Try it ────────────────────────────────────────────────────
// Where a release's button goes. A link to a beta page that's switched
// off goes to Settings, where the beta is turned on.
function wnLinkTarget(entry) {
  if (!entry || !entry.link || !entry.link.page) return null;
  var check = entry.requires && WN_BETA_CHECKS[entry.requires];
  if (check && !check()) return { page: 'settings', label: 'Turn on ' + (entry.requires === 'tax' ? 'Tax (Beta)' : 'the beta') };
  return { page: entry.link.page, label: entry.link.label || 'Try it' };
}
function wnTryIt(version) {
  var t = wnLinkTarget(wnFind(version));
  wnMarkAllSeen();
  wnCloseSheet();
  if (typeof closeNotifModal === 'function') closeNotifModal();
  if (t) go(t.page); else go('whatsnew');
}

// ── Dashboard card ────────────────────────────────────────────
// Returns the card's HTML (or ''), and records the first day it showed.
function whatsNewCardHtml() {
  var s = wnState();
  if (!s) return '';
  var log = wnLog(), today = wnToday();
  var entry = wnCardRelease(log, s, today);
  if (!entry) return '';
  if (!s.cardShown[entry.version]) wnSetState(wnMarkCardShown(s, entry.version, today));

  var more = wnUnseen(log, s.seen).length - 1;
  var t = wnLinkTarget(entry);
  var h = '<section class="wn-card" id="wn-card" role="region" aria-label="What’s new in Kelda">'
    + '<div class="wn-card__hd">'
    + '<span class="wn-card__kicker"><i class="ti ti-sparkles" aria-hidden="true"></i> New in v' + esc(entry.version) + '</span>'
    + '<button class="wn-card__close" onclick="wnDismissCard()" aria-label="Dismiss what’s new"><i class="ti ti-x"></i></button>'
    + '</div>'
    + '<h2 class="wn-card__title">' + esc(wnHeadline(entry)) + '</h2>'
    + wnBenefitsHtml(entry, 'wn-card__list')
    + '<div class="wn-card__actions">'
    + (t ? '<button class="btn btn-primary btn-sm wn-card__try" onclick="wnTryIt(\'' + esc(entry.version) + '\')">' + esc(t.label) + '</button>' : '')
    + '<button class="wn-card__all" onclick="wnOpenPage()">See all updates <i class="ti ti-arrow-right" aria-hidden="true"></i></button>'
    + '</div>'
    + (more > 0 ? '<button class="wn-card__more" onclick="wnOpenPage()">+ ' + more + ' more update' + (more === 1 ? '' : 's') + ' since you last looked</button>' : '')
    + '</section>';
  return h;
}
function wnDismissCard() {
  wnMarkAllSeen();
  var c = document.getElementById('wn-card');
  if (c) c.remove();
  wnRefreshChrome();
  if (typeof updateNotifDot === 'function') updateNotifDot();
}
function wnOpenPage() {
  wnCloseSheet();
  if (typeof closeNotifModal === 'function') closeNotifModal();
  go('whatsnew');
}

// ── List (page + sign-in sheet) ───────────────────────────────
function wnBenefitsHtml(entry, cls) {
  var b = wnBenefits(entry);
  if (!b.length) return '';
  return '<ul class="' + cls + '">' + b.map(function(x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
}

// `unseenFrom` marks releases newer than it with a New dot; `interactive`
// adds Try it buttons (off on the sign-in sheet, where nothing can open).
function wnListHtml(unseenFrom, interactive) {
  var groups = wnGroupForList(wnLog());
  if (!groups.length) return '<p class="wn-empty">No updates recorded yet.</p>';
  var isNew = function(e) { return !!unseenFrom && wnCompareVersions(e.version, unseenFrom) > 0; };
  return '<ol class="wn-list">' + groups.map(function(g) {
    if (g.type === 'release') {
      var e = g.entry, t = interactive ? wnLinkTarget(e) : null;
      return '<li class="wn-rel">'
        + '<div class="wn-rel__meta">'
        + (isNew(e) ? '<span class="wn-new-dot" role="img" aria-label="New"></span>' : '')
        + '<span class="wn-rel__ver">v' + esc(e.version) + '</span>'
        + (e.date ? '<span class="wn-rel__date">' + esc(wnFmtDate(e.date)) + '</span>' : '')
        + '</div>'
        + '<h3 class="wn-rel__title">' + esc(wnHeadline(e)) + '</h3>'
        + wnBenefitsHtml(e, 'wn-rel__list')
        + (t ? '<button class="btn btn-ghost btn-sm wn-rel__try" onclick="wnTryIt(\'' + esc(e.version) + '\')">' + esc(t.label) + ' <i class="ti ti-arrow-right" aria-hidden="true"></i></button>' : '')
        + '</li>';
    }
    var anyNew = g.entries.some(isNew);
    return '<li class="wn-rel wn-rel--fixes"><details>'
      + '<summary class="wn-fixes__sum">'
      + (anyNew ? '<span class="wn-new-dot" role="img" aria-label="New"></span>' : '')
      + '<span class="wn-fixes__ttl">Fixes and improvements</span>'
      + '<span class="wn-rel__ver">' + esc(wnFixesRange(g.entries)) + '</span>'
      + '<i class="ti ti-chevron-down wn-fixes__chev" aria-hidden="true"></i>'
      + '</summary>'
      + '<ul class="wn-fixes__list">' + g.entries.map(function(e) {
        return '<li><span class="wn-rel__ver">v' + esc(e.version) + '</span> ' + esc(wnHeadline(e)) + '</li>';
      }).join('') + '</ul>'
      + '</details></li>';
  }).join('') + '</ol>';
}

function renderWhatsNewPage() {
  var el = document.getElementById('page-whatsnew');
  if (!el) return;
  var s = wnState();
  var unseenFrom = s ? s.seen : null;
  el.innerHTML = '<div class="page-title">What’s new</div>'
    + '<div class="page-sub">Recent updates to Kelda, newest first</div>'
    + '<div class="wn-page">' + wnListHtml(unseenFrom, true)
    + '<p class="wn-foot">Full technical history in <a href="#" onclick="go(\'settings\');return false;">Settings › About</a></p>'
    + '</div>';
  // Opening the page counts as having read everything.
  wnMarkAllSeen();
  wnRefreshChrome();
}

// Read-only sheet from the sign-in screen's version link. No profile is
// signed in, so nothing is marked as seen.
function wnOpenSheet() {
  var body = document.getElementById('wn-sheet-body');
  if (body) body.innerHTML = wnListHtml(null, false);
  var m = document.getElementById('wn-sheet');
  if (m) m.classList.add('open');
}
function wnCloseSheet() {
  var m = document.getElementById('wn-sheet');
  if (m) m.classList.remove('open');
}

// ── Bell section ──────────────────────────────────────────────
// { lead, tail }: an unread release leads the modal; otherwise a
// "See all updates" link sits at the end.
function wnNotifParts() {
  var s = wnState();
  if (!s) return { lead: '', tail: '' };
  var top = wnUnseenHighlights(wnLog(), s.seen)[0];
  if (!top) return { lead: '', tail: '<button class="wn-notif-all" onclick="wnOpenPage()"><i class="ti ti-sparkles" aria-hidden="true"></i> See all updates</button>' };
  return { tail: '', lead: '<div class="notif-section-lbl">What’s new</div>'
    + '<button class="wn-notif" onclick="wnOpenPage()">'
    + '<span class="wn-notif__ic"><i class="ti ti-sparkles" aria-hidden="true"></i></span>'
    + '<span class="wn-notif__body"><span class="wn-notif__lbl">What’s new in v' + esc(top.version) + '</span>'
    + '<span class="wn-notif__ttl">' + esc(wnHeadline(top)) + '</span></span>'
    + '<i class="ti ti-chevron-right" aria-hidden="true"></i>'
    + '</button>' };
}

// ── Nav dots and "New" badges ─────────────────────────────────
// Called on every route change (app.js go()). Clears the badge for the
// page just opened, then redraws dots and badges for the signed-in profile.
function wnOnNavigate(page) {
  var s = wnState();
  if (s && page) {
    var log = wnLog();
    for (var i = 0; i < log.length; i++) {
      var e = log[i];
      if (e.link && e.link.page === page && wnIsHighlighted(e)) {
        var next = wnMarkVisited(s, page, e.version);
        if (next.visited[page] !== s.visited[page]) wnSetState(next);
        break; // newest first: the first match is the latest release for this page
      }
    }
  }
  wnRefreshChrome();
}

function wnRefreshChrome() {
  document.querySelectorAll('.wn-badge, .wn-dot').forEach(function(n) { n.remove(); });
  var s = wnState();
  if (!s) return;
  var unread = wnUnseenHighlights(wnLog(), s.seen).length > 0;
  // A release whose beta is off links to Settings, so it badges nothing.
  var badges = wnActiveBadges(wnLog().filter(function(e) {
    var check = e.requires && WN_BETA_CHECKS[e.requires];
    return !check || check();
  }), s, wnToday());
  var inMore = unread;

  function add(el, cls, text) {
    if (!el) return;
    var span = document.createElement('span');
    span.className = cls;
    if (text) span.textContent = text; else span.setAttribute('aria-hidden', 'true');
    el.appendChild(span);
  }
  if (unread) {
    add(document.getElementById('n-whatsnew'), 'wn-dot');
    add(document.querySelector('.mob-menu-item[data-page="whatsnew"]'), 'wn-dot');
  }
  badges.forEach(function(page) {
    var nav = document.getElementById('n-' + page);
    add(nav, 'wn-badge', 'New');
    var cat = nav && nav.closest('.nav-group') && nav.closest('.nav-group').querySelector('.nav-cat');
    if (cat && !cat.querySelector('.wn-badge')) add(cat, 'wn-badge', 'New');
    var tab = document.getElementById('tb-' + page);
    if (tab) add(tab, 'wn-badge wn-badge--tab', 'New');
    var tile = document.querySelector('.mob-menu-item[data-page="' + page + '"]');
    if (tile) { add(tile, 'wn-badge wn-badge--tile', 'New'); inMore = true; }
  });
  // The More tab carries a dot when something inside the menu is new.
  if (inMore) add(document.getElementById('tb-settings'), 'wn-dot wn-dot--tab');
}

// Set up the per-profile records on load, while PREV_RUN_VERSION still
// describes this upgrade, so closing the app before signing in can't
// swallow the news.
try { wnStore(); } catch (e) { console.warn('whatsnew init', e); }
