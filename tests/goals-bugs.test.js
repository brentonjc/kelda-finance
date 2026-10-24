// Unit tests for the Goals page fixes (js/pages/goals.js): finished goals render green, the
// finish-date projection uses real savings instead of a flat $500/month, and two goals
// linked to one Cash Tracker account count its balance once in Total Saved.
// Fixtures are written in the old (v1) shape and upgraded by the v2 migration first,
// the way they reach the page in the browser.
// Run: node --test "tests/**/*.test.js"
// Every goal, account and amount here is made up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Load storage.js (for esc), goals-calc.js and goals.js as classic scripts sharing one
// global scope. CT, GOALS and TX normally come from data.js; ctAllMonths from cash.js.
function loadGoals({ goals = [], ct = {}, tx = [] } = {}) {
  const els = {};
  const ctx = {
    console: { log() {}, warn() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
    document: {
      getElementById: (id) => els[id] || null,
    },
    ICON: (k) => `<i class="ti ti-${k}"></i>`,
    iconTag: (k) => `<i class="ti ti-${k}"></i>`,
    ICON_PICKER_SET: [],
    getAccountName: (id) => ({ sav1: 'Holiday Saver' }[id] || id),
    activeTX: () => tx,
    ctAllMonths: () => Object.keys(Object.values(ct)[0] || {}).sort(),
    // Exact-month version of cash.js ctBalanceAt (these fixtures never need carry-forward)
    ctBalanceAt: (id, mo) => {
      const v = (ct[id] || {})[mo];
      return v == null ? { value: 0, carried: false, month: null } : { value: Number(v), carried: false, month: mo };
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/storage.js', 'js/goals-calc.js', 'js/pages/goals.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  ctx.GOALS = ctx.goalsMigrateV2(goals, '2026-10-18').goals;
  ctx.CT = ct;
  vm.runInContext('var GOALS = this.GOALS, CT = this.CT;', ctx);
  return { ctx, els, goals: ctx.GOALS };
}

function fakeList() {
  return { innerHTML: '', querySelectorAll: () => [] };
}

const goal = (over) => ({ id: 1, name: 'Test goal', icon: 'target', targetAmount: 1000, currentAmount: 0, targetDate: '', linkedAccount: '', ...over });

test('a finished goal renders a plain (green) bar and a success note, never warn/over', () => {
  const { ctx, els } = loadGoals({ goals: [goal({ currentAmount: 1000 }), goal({ id: 2, currentAmount: 800 })] });
  els['goals-cards-list'] = fakeList();
  ctx.renderGoalCards();
  const html = els['goals-cards-list'].innerHTML;
  assert.doesNotMatch(html, /prog-fill (warn|over|danger)/);
  assert.match(html, /goal-foot-note--done/);
  assert.match(html, /data-pct="100\.0"/);
  assert.doesNotMatch(html, /style="/);
});

test('goal percentage never rounds up to 100 before the target is met', () => {
  const { ctx, els } = loadGoals({ goals: [goal({ currentAmount: 996 })] });
  els['goals-cards-list'] = fakeList();
  ctx.renderGoalCards();
  assert.match(els['goals-cards-list'].innerHTML, /goal-pct">99%/);
});

test('goal ids are quoted in the delete handler', () => {
  const { ctx, els } = loadGoals({ goals: [goal({ id: 1712345678901 })] });
  els['goals-cards-list'] = fakeList();
  ctx.renderGoalCards();
  assert.match(els['goals-cards-list'].innerHTML, /onclick="delGoalItem\('g_1712345678901'\)"/);
});

test('average monthly savings uses the last 3 full months with activity', () => {
  const { ctx } = loadGoals();
  const tx = [
    { type: 'income', amount: 5000, date: '2026-09-15' }, { type: 'expense', amount: 3000, date: '2026-09-20' },
    { type: 'income', amount: 5000, date: '2026-08-15' }, { type: 'expense', amount: 4000, date: '2026-08-20' },
    // July has no activity, so it is skipped rather than counted as $0
    { type: 'income', amount: 9999, date: '2026-10-02' }, // current month is ignored
  ];
  assert.equal(ctx.goalAvgMonthlySavings(tx, new Date(2026, 9, 18)), 1500);
});

test('monthly rate is split evenly across unfinished goals only', () => {
  const { ctx, goals } = loadGoals({ goals: [goal({ id: 1 }), goal({ id: 2 }), goal({ id: 3, currentAmount: 1000 })] });
  const gctx = ctx.goalCtx();
  assert.equal(ctx.goalMonthlyRate(goals, 1500, gctx), 750);
  assert.equal(ctx.goalMonthlyRate(goals, -200, gctx), 0);
  assert.equal(ctx.goalMonthlyRate([], 1500, gctx), 0);
});

test('projection uses real savings and asks for a contribution when there is none', () => {
  const lastMonths = (amt) => [
    { type: 'income', amount: amt, date: '2026-09-15' },
    { type: 'income', amount: amt, date: '2026-08-15' },
    { type: 'income', amount: amt, date: '2026-07-15' },
  ];
  // no savings at all → no finish date
  let { ctx, goals } = loadGoals({ goals: [goal()] });
  assert.equal(ctx._goalProjection(goals[0], ctx.goalCtx()), 'Add a contribution to see a finish date');
  // household savings of $250/month for one undated goal → a real finish date
  ({ ctx, goals } = loadGoals({ goals: [goal()], tx: lastMonths(250) }));
  assert.match(ctx._goalProjection(goals[0], ctx.goalCtx()), /^On track for /);
  // a dated goal shows its date
  ({ ctx, goals } = loadGoals({ goals: [goal({ targetDate: '2027-04-01' })], tx: lastMonths(250) }));
  assert.match(ctx._goalProjection(goals[0], ctx.goalCtx()), /^Target: Apr 2027$/);
});

test('two goals linked to one account count its balance once in Total Saved', () => {
  const ct = { sav1: { '2026-09': 4000 } };
  // Linked one at a time through the edit form, so both read the whole account
  const { ctx, goals } = loadGoals({ goals: [goal({ id: 1 }), goal({ id: 2, name: 'Car' }), goal({ id: 3, currentAmount: 250 })], ct });
  const gctx = ctx.goalCtx();
  ctx.goalSetAccount(goals[0], 'sav1', gctx);
  ctx.goalSetAccount(goals[1], 'sav1', gctx);
  assert.equal(ctx.goalsTotalSaved(goals), 4250);
  const byAcct = ctx._goalsByAccount(goals);
  assert.deepEqual(Object.keys(byAcct), ['sav1']);
  assert.equal(byAcct.sav1.length, 2);
});

test('shared linked goals show the shared notice on each card', () => {
  const ct = { sav1: { '2026-09': 4000 } };
  const { ctx, els, goals } = loadGoals({ goals: [goal({ id: 1, name: 'Japan' }), goal({ id: 2, name: 'Car' })], ct });
  const gctx = ctx.goalCtx();
  goals.forEach((g) => ctx.goalSetAccount(g, 'sav1', gctx));
  els['goals-cards-list'] = fakeList();
  ctx.renderGoalCards();
  const html = els['goals-cards-list'].innerHTML;
  assert.match(html, /Shared with Car: progress shows the full Holiday Saver balance/);
  assert.match(html, /Shared with Japan:/);
});

test('goals migrated from a shared account are buckets and add up to the balance once', () => {
  const ct = { sav1: { '2026-09': 4000 } };
  const { ctx, goals } = loadGoals({ goals: [goal({ id: 1, linkedAccount: 'sav1', currentAmount: 1500 }), goal({ id: 2, linkedAccount: 'sav1', currentAmount: 1000 })], ct });
  assert.equal(goals[0].source.kind, 'bucket');
  assert.equal(ctx.goalsTotalSaved(goals), 2500);
});
