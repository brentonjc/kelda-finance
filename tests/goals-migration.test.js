// Unit tests for the goals v2 migration as it runs at startup (js/data.js migrateGoalsV2,
// using js/goals-calc.js): it upgrades stored goals once, keeps a one-time copy of the v1
// list, and upgrades an old backup again after a restore. The field mapping itself is
// tested in goals-calc.test.js.
// Run: node --test "tests/**/*.test.js"
// Every goal here is made up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function makeContext(store) {
  const ctx = {
    console: { log() {}, warn() {}, group() {}, groupEnd() {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      key: (i) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  return ctx;
}

// storage.js, goals-calc.js and data.js in the browser's order: one page load
function pageLoad(store) {
  const ctx = makeContext(store);
  for (const f of ['js/storage.js', 'js/goals-calc.js', 'js/data.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

const V1 = [
  { id: 1712345678901, name: 'Holiday', icon: 'plane', targetAmount: 8000, currentAmount: 2000, targetDate: '', linkedAccount: '', createdAt: '2026-03-04' },
  { id: 1712345678902, name: 'Old style', target: 1000, saved: 400 },
];

test('stored v1 goals are upgraded on page load and the v1 list is kept', () => {
  const store = { cff_goals: JSON.stringify(V1) };
  const ctx = pageLoad(store);
  const saved = JSON.parse(store.cff_goals);
  assert.equal(saved.length, 2);
  assert.ok(saved.every((g) => g.schemaVersion === 2));
  assert.equal(saved[0].id, 'g_1712345678901');
  assert.deepEqual(JSON.parse(store.cff_goals_v1_backup), V1);
  // the in-memory list is the upgraded one
  assert.equal(vm.runInContext('GOALS[0].id', ctx), 'g_1712345678901');
});

test('a second load changes nothing and never rewrites the v1 copy', () => {
  const store = { cff_goals: JSON.stringify(V1) };
  pageLoad(store);
  const goalsAfterFirst = store.cff_goals;
  const backupAfterFirst = store.cff_goals_v1_backup;
  pageLoad(store);
  assert.equal(store.cff_goals, goalsAfterFirst);
  assert.equal(store.cff_goals_v1_backup, backupAfterFirst);
});

test('restoring a pre-v2 backup upgrades it on the reload, keeping the first v1 copy', () => {
  const store = { cff_goals: JSON.stringify(V1) };
  pageLoad(store);
  const firstCopy = store.cff_goals_v1_backup;
  // A restore writes the backup's raw goals, then reloads the page
  const restored = [{ id: 99, name: 'From backup', targetAmount: 300, currentAmount: 120 }];
  store.cff_goals = JSON.stringify(restored);
  pageLoad(store);
  const saved = JSON.parse(store.cff_goals);
  assert.equal(saved[0].id, 'g_99');
  assert.equal(saved[0].schemaVersion, 2);
  assert.equal(saved[0].contributions[0].amount, 120);
  assert.equal(store.cff_goals_v1_backup, firstCopy);
});

test('startup migration reads Cash Tracker balances for linked goals', () => {
  const store = {
    cff_goals: JSON.stringify([{ id: 3, name: 'House', targetAmount: 50000, currentAmount: 0, linkedAccount: 'offset' }]),
    cff_ct: JSON.stringify({ offset: { '2026-08': 30000, '2026-09': 41000, '2026-10': null } }),
  };
  pageLoad(store);
  assert.deepEqual(JSON.parse(store.cff_goals)[0].milestonesHit, [25, 50, 75]);
});

test('migrateGoalsV2 can run again later (unlock reloads GOALS from storage)', () => {
  const store = {};
  const ctx = pageLoad(store);
  vm.runInContext('GOALS = ' + JSON.stringify(V1) + '; migrateGoalsV2();', ctx);
  assert.equal(vm.runInContext('GOALS[0].schemaVersion', ctx), 2);
  assert.equal(JSON.parse(store.cff_goals)[1].id, 'g_1712345678902');
});

test('no goals stored: nothing is written', () => {
  const store = {};
  pageLoad(store);
  assert.equal(store.cff_goals, undefined);
  assert.equal(store.cff_goals_v1_backup, undefined);
});
