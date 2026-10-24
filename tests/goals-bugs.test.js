// Unit tests for the Goals page fixes (js/pages/goals.js): finished goals render green, the
// finish-date projection uses real average savings instead of a flat $500/month, and two goals
// linked to one Cash Tracker account count its balance once in Total Saved.
// Run: node --test "tests/**/*.test.js"
// Every goal, account and amount here is made up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Load storage.js (for esc) and goals.js as classic scripts sharing one global scope.
// CT, GOALS and TX normally come from data.js; ctAllMonths from cash.js.
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
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/storage.js'), 'utf8'), ctx, { filename: 'js/storage.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/pages/goals.js'), 'utf8'), ctx, { filename: 'js/pages/goals.js' });
  ctx.GOALS = goals;
  ctx.CT = ct;
  vm.runInContext('var GOALS = this.GOALS, CT = this.CT;', ctx);
  return { ctx, els };
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
  const { ctx } = loadGoals();
  const goals = [goal({ id: 1 }), goal({ id: 2 }), goal({ id: 3, currentAmount: 1000 })];
  assert.equal(ctx.goalMonthlyRate(goals, 1500), 750);
  assert.equal(ctx.goalMonthlyRate(goals, -200), 0);
  assert.equal(ctx.goalMonthlyRate([], 1500), 0);
});

test('projection uses the real rate and asks for a contribution when there is none', () => {
  const { ctx } = loadGoals();
  assert.equal(ctx.goalMonthsToTarget(1000, 250), 4);
  assert.equal(ctx.goalMonthsToTarget(1001, 250), 5);
  assert.equal(ctx.goalMonthsToTarget(1000, 0), null);
  assert.equal(ctx._goalProjection(goal(), 0, 1000, 0), 'Add a contribution to see a finish date');
  assert.match(ctx._goalProjection(goal(), 0, 1000, 250), /^On track for /);
  assert.match(ctx._goalProjection(goal({ targetDate: '2027-04-01' }), 0, 1000, 250), /^Target: Apr 2027$/);
});

test('two goals linked to one account count its balance once in Total Saved', () => {
  const ct = { sav1: { '2026-09': 4000 } };
  const goals = [
    goal({ id: 1, linkedAccount: 'sav1' }),
    goal({ id: 2, name: 'Car', linkedAccount: 'sav1' }),
    goal({ id: 3, currentAmount: 250 }),
  ];
  const { ctx } = loadGoals({ goals, ct });
  assert.equal(ctx.goalsTotalSaved(goals), 4250);
  const byAcct = ctx._goalsByAccount(goals);
  assert.deepEqual(Object.keys(byAcct), ['sav1']);
  assert.equal(byAcct.sav1.length, 2);
});

test('shared linked goals show the shared notice on each card', () => {
  const ct = { sav1: { '2026-09': 4000 } };
  const goals = [goal({ id: 1, name: 'Japan', linkedAccount: 'sav1' }), goal({ id: 2, name: 'Car', linkedAccount: 'sav1' })];
  const { ctx, els } = loadGoals({ goals, ct });
  els['goals-cards-list'] = fakeList();
  ctx.renderGoalCards();
  const html = els['goals-cards-list'].innerHTML;
  assert.match(html, /Shared with Car: progress shows the full Holiday Saver balance/);
  assert.match(html, /Shared with Japan:/);
});
