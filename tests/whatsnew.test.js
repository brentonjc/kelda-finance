// Unit tests for js/whatsnew-core.js (What's new card, list, badges and
// per-profile state) and the upgrade detection in js/version.js.
// Run: node --test "tests/**/*.test.js"
// Changelog entries here are made up, apart from the real-changelog checks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadCore() {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/whatsnew-core.js'), 'utf8'), ctx, { filename: 'js/whatsnew-core.js' });
  return ctx;
}

// version.js with a stubbed localStorage holding `stored` as cff_app_version.
function loadVersion(stored) {
  const mem = stored == null ? {} : { cff_app_version: stored };
  const localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
  };
  const ctx = { console, localStorage };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/version.js'), 'utf8'), ctx, { filename: 'js/version.js' });
  return { ctx, mem };
}

const W = loadCore();
const plain = (v) => JSON.parse(JSON.stringify(v));

const rel = (version, over = {}) => Object.assign({ version, date: '2026-10-01', title: 'T ' + version, notes: ['n1 ' + version, 'n2', 'n3', 'n4'] }, over);
const LOG = [
  rel('2.11.0', { date: '2026-10-20', headline: 'H 2.11', benefits: ['b1', 'b2'], link: { page: 'goals', label: 'Open Goals' } }),
  rel('2.10.2', { date: '2026-10-18' }),
  rel('2.10.1', { date: '2026-10-15' }),
  rel('2.10.0', { date: '2026-10-10', link: { page: 'tax', label: 'Open Tax' } }),
  rel('2.9.3', { date: '2026-10-05', highlight: true, link: { page: 'upload', label: 'Import' } }),
  rel('2.9.0', { date: '2026-09-01', link: { page: 'cash', label: 'Cash' } }),
];
const state = (over = {}) => Object.assign({ start: '2.8.0', seen: '2.8.0', cardShown: {}, visited: {} }, over);

// ── Versions ───────────────────────────────────────────────────

test('compareVersions orders numerically, so 2.10.0 is above 2.9.1', () => {
  assert.equal(W.wnCompareVersions('2.10.0', '2.9.1'), 1);
  assert.equal(W.wnCompareVersions('2.9.1', '2.10.0'), -1);
  assert.equal(W.wnCompareVersions('2.5.13', '2.5.9'), 1);
  assert.equal(W.wnCompareVersions('2.10', '2.10.0'), 0);
});

test('X.Y.0 releases are highlighted; patches are not', () => {
  assert.equal(W.wnIsHighlighted(rel('2.11.0')), true);
  assert.equal(W.wnIsHighlighted(rel('3.0.0')), true);
  assert.equal(W.wnIsHighlighted(rel('2.10.1')), false);
});

test('an explicit highlight overrides the version rule both ways', () => {
  assert.equal(W.wnIsHighlighted(rel('2.5.13', { highlight: true })), true);
  assert.equal(W.wnIsHighlighted(rel('2.12.0', { highlight: false })), false);
});

// ── Copy fallbacks (AC15) ──────────────────────────────────────

test('entries without headline or benefits fall back to title and the first 3 notes', () => {
  const old = rel('2.4.0');
  assert.equal(W.wnHeadline(old), 'T 2.4.0');
  assert.deepEqual(plain(W.wnBenefits(old)), ['n1 2.4.0', 'n2', 'n3']);
  const nu = LOG[0];
  assert.equal(W.wnHeadline(nu), 'H 2.11');
  assert.deepEqual(plain(W.wnBenefits(nu)), ['b1', 'b2']);
});

// ── Card (AC1, AC6–AC8, AC10a) ─────────────────────────────────

test('the card shows the newest unseen highlighted release', () => {
  assert.equal(W.wnCardRelease(LOG, state({ seen: '2.10.2' }), '2026-10-25').version, '2.11.0');
  assert.equal(W.wnCardRelease(LOG, state({ seen: '2.9.3' }), '2026-10-25').version, '2.11.0');
});

test('an upgrade with only plain patches shows no card (AC6)', () => {
  const log = [rel('2.10.2'), rel('2.10.1'), rel('2.10.0')];
  assert.equal(W.wnCardRelease(log, state({ seen: '2.10.0' }), '2026-10-25'), null);
  assert.equal(W.wnUnseenHighlights(log, '2.10.0').length, 0);
  assert.equal(W.wnUnseen(log, '2.10.0').length, 2);
});

test('a patch with highlight: true does show the card (AC7)', () => {
  const log = [rel('2.10.2', { highlight: true }), rel('2.10.0')];
  assert.equal(W.wnCardRelease(log, state({ seen: '2.10.0' }), '2026-10-25').version, '2.10.2');
});

test('several unseen releases: card shows the newest, and seeing it clears them all (AC8)', () => {
  const s = state({ seen: '2.10.0' });
  assert.equal(W.wnUnseen(LOG, s.seen).length, 3);
  assert.equal(W.wnCardRelease(LOG, s, '2026-10-25').version, '2.11.0');
  const after = W.wnMarkSeen(s, '2.11.0');
  assert.equal(W.wnUnseen(LOG, after.seen).length, 0);
  assert.equal(W.wnCardRelease(LOG, after, '2026-10-25'), null);
});

test('a card nobody acts on stops after 14 days but stays unread (AC10a)', () => {
  const s = W.wnMarkCardShown(state({ seen: '2.10.2' }), '2.11.0', '2026-10-20');
  assert.equal(W.wnCardRelease(LOG, s, '2026-11-02').version, '2.11.0'); // day 13
  assert.equal(W.wnCardRelease(LOG, s, '2026-11-03'), null);             // day 14
  assert.equal(W.wnUnseenHighlights(LOG, s.seen).length, 1);
});

test('the first-shown date is kept, not moved on later renders', () => {
  let s = W.wnMarkCardShown(state(), '2.11.0', '2026-10-20');
  s = W.wnMarkCardShown(s, '2.11.0', '2026-10-25');
  assert.equal(s.cardShown['2.11.0'], '2026-10-20');
});

test('markSeen never moves seen backwards', () => {
  assert.equal(W.wnMarkSeen(state({ seen: '2.11.0' }), '2.10.0').seen, '2.11.0');
});

test('state helpers return copies and leave the input alone', () => {
  const s = state();
  W.wnMarkSeen(s, '2.11.0');
  W.wnMarkCardShown(s, '2.11.0', '2026-10-20');
  W.wnMarkVisited(s, 'goals', '2.11.0');
  assert.deepEqual(s, state());
});

// ── Profiles and fresh installs (AC4, AC5, AC10) ───────────────

test('a fresh install starts at the current version, so nothing is unseen (AC5)', () => {
  const seen = W.wnInitialSeen(null, '2.11.0');
  assert.equal(seen, '2.11.0');
  assert.equal(W.wnCardRelease(LOG, { seen, start: seen }, '2026-10-25'), null);
  assert.equal(W.wnActiveBadges(LOG, { start: seen, seen, visited: {} }, '2026-10-25').length, 0);
});

test('an upgrade starts at the previous version, so its news shows', () => {
  assert.equal(W.wnInitialSeen('2.10.2', '2.11.0'), '2.10.2');
});

test('every profile, Joint included, is set up at once and kept separate (AC4, AC10)', () => {
  let store = W.wnEnsureProfiles({}, ['brenton', 'shelley', 'joint'], '2.10.2');
  assert.deepEqual(Object.keys(store).sort(), ['brenton', 'joint', 'shelley']);
  store.brenton = W.wnMarkSeen(store.brenton, '2.11.0');
  // Shelley unlocks a week later, after cff_app_version has moved on:
  store = W.wnEnsureProfiles(store, ['brenton', 'shelley', 'joint'], '2.11.0');
  assert.equal(store.brenton.seen, '2.11.0');
  assert.equal(store.shelley.seen, '2.10.2');
  assert.equal(W.wnCardRelease(LOG, store.shelley, '2026-10-27').version, '2.11.0');
  assert.equal(W.wnCardRelease(LOG, store.joint, '2026-10-27').version, '2.11.0');
});

// ── Badges (AC17–AC19) ─────────────────────────────────────────

test('highlighted releases with a link badge their page until visited', () => {
  const s = state();
  assert.deepEqual(plain(W.wnActiveBadges(LOG, s, '2026-10-25')), ['goals', 'tax', 'upload']);
  const after = W.wnMarkVisited(s, 'goals', '2.11.0');
  assert.deepEqual(plain(W.wnActiveBadges(LOG, after, '2026-10-25')), ['tax', 'upload']);
});

test('badges clear 30 days after the release date (AC18)', () => {
  // 2026-11-04: goals is day 15, tax day 25, upload (2.9.3, 5 Oct) day 30
  assert.deepEqual(plain(W.wnActiveBadges(LOG, state(), '2026-11-04')), ['goals', 'tax']);
  assert.ok(!W.wnActiveBadges(LOG, state(), '2026-11-09').includes('tax')); // day 30 for 2.10.0
  assert.deepEqual(plain(W.wnActiveBadges(LOG, state(), '2026-11-19')), []);
});

test('no more than 3 badges show at once (AC19)', () => {
  const log = ['2.14.0', '2.13.0', '2.12.0', '2.11.0'].map((v, i) =>
    rel(v, { date: '2026-10-2' + i, link: { page: 'p' + i, label: 'x' } }));
  assert.equal(W.wnActiveBadges(log, state(), '2026-10-25').length, 3);
});

test('releases from before the profile record was created never badge', () => {
  assert.deepEqual(plain(W.wnActiveBadges(LOG, state({ start: '2.10.0' }), '2026-10-25')), ['goals']);
});

test('a page visited for an older release badges again for a newer one', () => {
  const log = [rel('2.12.0', { date: '2026-10-24', link: { page: 'goals', label: 'x' } }), LOG[0]];
  const s = W.wnMarkVisited(state(), 'goals', '2.11.0');
  assert.deepEqual(plain(W.wnActiveBadges(log, s, '2026-10-25')), ['goals']);
});

// ── List grouping (AC12) ───────────────────────────────────────

test('runs of non-highlighted releases fold into one fixes group', () => {
  const g = W.wnGroupForList(LOG);
  assert.deepEqual(plain(g.map((x) => x.type)), ['release', 'fixes', 'release', 'release', 'release']);
  assert.deepEqual(plain(g[1].entries.map((e) => e.version)), ['2.10.2', '2.10.1']);
  assert.equal(W.wnFixesRange(g[1].entries), 'v2.10.1–v2.10.2');
  assert.equal(W.wnFixesRange([rel('2.5.9')]), 'v2.5.9');
});

// ── Upgrade detection in version.js ────────────────────────────

test('version.js keeps the previous version before stamping the new one', () => {
  const { ctx, mem } = loadVersion('2.10.1');
  assert.equal(ctx.PREV_RUN_VERSION, '2.10.1');
  assert.equal(ctx.isFreshUpgrade(), true);
  assert.equal(mem.cff_app_version, ctx.APP_VERSION);
});

test('a fresh install has no previous version and is not an upgrade', () => {
  const { ctx } = loadVersion(null);
  assert.equal(ctx.PREV_RUN_VERSION, null);
  assert.equal(ctx.isFreshUpgrade(), false);
});

// ── The real changelog ─────────────────────────────────────────

test('APP_VERSION is the newest changelog entry and entries are newest first', () => {
  const { ctx } = loadVersion(null);
  const log = ctx.APP_CHANGELOG;
  assert.equal(log[0].version, ctx.APP_VERSION);
  for (let i = 1; i < log.length; i++) {
    assert.ok(W.wnCompareVersions(log[i - 1].version, log[i].version) > 0, log[i - 1].version + ' should be above ' + log[i].version);
  }
});

test('changelog copy keeps to the writing limits', () => {
  const { ctx } = loadVersion(null);
  ctx.APP_CHANGELOG.forEach((e) => {
    if (e.headline) assert.ok(e.headline.length <= 70, e.version + ' headline is ' + e.headline.length + ' chars');
    (e.benefits || []).forEach((b) => assert.ok(b.length <= 110, e.version + ' benefit is ' + b.length + ' chars: ' + b));
    assert.ok(!e.benefits || e.benefits.length <= 3, e.version + ' has more than 3 benefits');
    if (e.link) assert.ok(e.link.page && e.link.label, e.version + ' link needs page and label');
  });
});

test('release-notes.json rows carry only the public fields (AC25)', () => {
  const rows = plain(W.wnReleaseNotesJson(LOG));
  assert.equal(rows.length, LOG.length);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['benefits', 'date', 'headline', 'highlight', 'version']);
  assert.equal(rows[1].highlight, false);
});

// ── Markup the badges rely on ──────────────────────────────────

test('every More menu tile has a matching data-page and a valid onclick', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const tiles = html.match(/<button class="mob-menu-item[^>]*goMob[^>]*>/g) || [];
  assert.ok(tiles.length > 10, 'expected the More menu tiles');
  tiles.forEach((tile) => {
    const call = tile.match(/onclick="goMob\('([a-z-]+)'\)"/);
    assert.ok(call, "onclick should be goMob('page'): " + tile);
    assert.ok(tile.includes('data-page="' + call[1] + '"'), 'data-page should match: ' + tile);
  });
});
