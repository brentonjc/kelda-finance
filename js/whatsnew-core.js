// ═══════════════════════════════════════════════════════════════
//  whatsnew-core.js — pure logic behind "What's new"
// ───────────────────────────────────────────────────────────────
//  No DOM and no storage: everything takes the changelog, a
//  profile's state and today's date, and returns plain values,
//  so tests/whatsnew.test.js can load it with node:vm.
//  js/pages/whatsnew.js owns storage and rendering.
//
//  Profile state (one per profile in cff_whatsnew):
//    { start: '2.10.1',             // version the record was created at
//      seen: '2.10.1',              // highest version acknowledged
//      cardShown: { '2.11.0': 'YYYY-MM-DD' }, // first day the card showed
//      visited: { goals: '2.10.0' } }         // badge cleared up to version
// ═══════════════════════════════════════════════════════════════

var WN_CARD_DAYS  = 14; // an untouched Dashboard card stops showing after this
var WN_BADGE_DAYS = 30; // a "New" nav badge clears itself after this
var WN_MAX_BADGES = 3;

// Numeric, segment by segment: 2.10.0 > 2.9.1. Missing segments count as 0.
function wnCompareVersions(a, b) {
  var pa = String(a || '0').split('.'), pb = String(b || '0').split('.');
  for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
    var x = parseInt(pa[i], 10) || 0, y = parseInt(pb[i], 10) || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

// Feature releases (X.Y.0) announce themselves unless the entry says otherwise.
function wnIsHighlighted(entry) {
  if (!entry) return false;
  if (typeof entry.highlight === 'boolean') return entry.highlight;
  var patch = String(entry.version || '').split('.')[2];
  return (parseInt(patch, 10) || 0) === 0;
}

// Headline and benefits, falling back to title and notes for older entries.
function wnHeadline(entry) { return (entry && (entry.headline || entry.title)) || ''; }
function wnBenefits(entry) {
  if (!entry) return [];
  if (Array.isArray(entry.benefits) && entry.benefits.length) return entry.benefits.slice(0, 3);
  return Array.isArray(entry.notes) ? entry.notes.slice(0, 3) : [];
}

// Entries newer than `seen`, newest first. A null `seen` means nothing is unseen.
function wnUnseen(log, seen) {
  if (!Array.isArray(log) || !seen) return [];
  return log.filter(function(e) { return wnCompareVersions(e.version, seen) > 0; })
    .sort(function(a, b) { return wnCompareVersions(b.version, a.version); });
}

function wnUnseenHighlights(log, seen) {
  return wnUnseen(log, seen).filter(wnIsHighlighted);
}

// Whole days from ISO date a to ISO date b (b − a).
function wnDaysBetween(a, b) {
  var da = Date.parse(a + 'T00:00:00Z'), db = Date.parse(b + 'T00:00:00Z');
  if (isNaN(da) || isNaN(db)) return 0;
  return Math.round((db - da) / 86400000);
}

// The release the Dashboard card should show, or null.
// It's the newest unseen highlighted release, unless its card first
// showed WN_CARD_DAYS or more days ago.
function wnCardRelease(log, state, today) {
  if (!state) return null;
  var top = wnUnseenHighlights(log, state.seen)[0];
  if (!top) return null;
  var shown = state.cardShown && state.cardShown[top.version];
  if (shown && wnDaysBetween(shown, today) >= WN_CARD_DAYS) return null;
  return top;
}

// Page ids that get a "New" badge: the link targets of highlighted releases
// from the last WN_BADGE_DAYS days that this profile hasn't visited since.
// Releases from before the record was created (a fresh install) never badge.
// Newest first, at most WN_MAX_BADGES, one per page.
function wnActiveBadges(log, state, today) {
  if (!Array.isArray(log) || !state) return [];
  var visited = state.visited || {}, out = [];
  log.slice().sort(function(a, b) { return wnCompareVersions(b.version, a.version); })
    .forEach(function(e) {
      if (out.length >= WN_MAX_BADGES) return;
      if (!wnIsHighlighted(e) || !e.link || !e.link.page) return;
      if (state.start && wnCompareVersions(e.version, state.start) <= 0) return;
      if (!e.date || wnDaysBetween(e.date, today) >= WN_BADGE_DAYS) return;
      if (wnDaysBetween(e.date, today) < 0) return;
      var page = e.link.page;
      if (out.indexOf(page) >= 0) return;
      if (visited[page] && wnCompareVersions(visited[page], e.version) >= 0) return;
      out.push(page);
    });
  return out;
}

// Where an existing user's "seen" starts. An upgrade (a previous version was
// recorded on this device) starts from that version so its news shows; a fresh
// install starts at the current version, so there's nothing to announce.
function wnInitialSeen(prevRunVersion, appVersion) {
  return prevRunVersion || appVersion;
}

// Fill in a record for every profile that lacks one. Returns a new object.
function wnEnsureProfiles(store, profileIds, seen) {
  var out = {};
  Object.keys(store || {}).forEach(function(k) { out[k] = store[k]; });
  (profileIds || []).forEach(function(id) {
    if (!out[id]) out[id] = { start: seen, seen: seen, cardShown: {}, visited: {} };
  });
  return out;
}

// State after the profile acknowledges everything up to `version`.
function wnMarkSeen(state, version) {
  var s = wnCopyState(state);
  if (!s.seen || wnCompareVersions(version, s.seen) > 0) s.seen = version;
  return s;
}

// State after the card for `version` is rendered on `today` (first time only).
function wnMarkCardShown(state, version, today) {
  var s = wnCopyState(state);
  if (!s.cardShown[version]) s.cardShown[version] = today;
  return s;
}

// State after the profile opens `page`: clears its badge up to `version`.
function wnMarkVisited(state, page, version) {
  var s = wnCopyState(state);
  if (!s.visited[page] || wnCompareVersions(version, s.visited[page]) > 0) s.visited[page] = version;
  return s;
}

function wnCopyState(state) {
  state = state || {};
  var cs = {}, vs = {};
  Object.keys(state.cardShown || {}).forEach(function(k) { cs[k] = state.cardShown[k]; });
  Object.keys(state.visited || {}).forEach(function(k) { vs[k] = state.visited[k]; });
  return { start: state.start || null, seen: state.seen || null, cardShown: cs, visited: vs };
}

// The What's new list: each highlighted release on its own, and each run of
// non-highlighted releases folded into one group. Newest first.
//   [{ type:'release', entry }, { type:'fixes', entries:[…] }, …]
function wnGroupForList(log) {
  var out = [], run = null;
  (Array.isArray(log) ? log : []).slice()
    .sort(function(a, b) { return wnCompareVersions(b.version, a.version); })
    .forEach(function(e) {
      if (wnIsHighlighted(e)) { run = null; out.push({ type: 'release', entry: e }); return; }
      if (!run) { run = { type: 'fixes', entries: [] }; out.push(run); }
      run.entries.push(e);
    });
  return out;
}

// Label for a folded run: "v2.5.9–v2.5.12" (oldest–newest) or "v2.5.9".
function wnFixesRange(entries) {
  if (!entries || !entries.length) return '';
  var newest = entries[0].version, oldest = entries[entries.length - 1].version;
  return newest === oldest ? 'v' + newest : 'v' + oldest + '–v' + newest;
}

// The beta site's release-notes.json, built from the same changelog.
function wnReleaseNotesJson(log) {
  return (Array.isArray(log) ? log : []).map(function(e) {
    return {
      version: e.version,
      date: e.date,
      headline: wnHeadline(e),
      benefits: wnBenefits(e),
      highlight: wnIsHighlighted(e)
    };
  });
}
