// Unit tests for js/goals-calc.js: the v2 goal record, the v1 → v2 migration
// and every calculation the Goals page and dashboard read.
// Run: node --test "tests/**/*.test.js"
// Every goal, account and amount here is made up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadCalc() {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/goals-calc.js'), 'utf8'), ctx, { filename: 'js/goals-calc.js' });
  return ctx;
}
const C = loadCalc();
// Plain copies, so deepEqual doesn't trip over the vm realm's prototypes
const plain = (v) => JSON.parse(JSON.stringify(v));

// A context with Cash Tracker balances as { acct: { 'YYYY-MM': value } }
function ctxFor({ today = '2026-10-25', ct = {}, goals = [], fallbackRate = 0 } = {}) {
  return {
    today, goals, fallbackRate,
    balanceOf: (id) => {
      const months = Object.keys(ct[id] || {}).sort();
      return months.length ? ct[id][months[months.length - 1]] : null;
    },
    balanceHistory: (id) => Object.keys(ct[id] || {}).sort().map((m) => ({ month: m, value: ct[id][m] })),
  };
}
const v2 = (over = {}) => Object.assign(C.makeGoal({ name: 'Japan 2027', target: 10000, createdAt: '2026-01-10' }), over);
const contrib = (date, amount, note) => (note ? { id: 'c' + date, date, amount, person: 'brenton', note } : { id: 'c' + date, date, amount, person: 'brenton' });

// ── Records ────────────────────────────────────────────────────

test('makeGoal writes the v2 shape and none of the old fields', () => {
  const g = C.makeGoal({ name: 'Car', target: '5000', accountId: 'sav2', createdAt: '2026-10-25' });
  assert.equal(g.schemaVersion, 2);
  assert.match(g.id, /^g_/);
  assert.equal(g.target, 5000);
  assert.deepEqual(plain(g.source), { kind: 'account', accountId: 'sav2' });
  assert.equal(g.type, 'save');
  assert.equal(g.owner, 'joint');
  assert.deepEqual(plain(g.contributions), []);
  for (const old of ['targetAmount', 'currentAmount', 'saved', 'linkedAccount']) assert.equal(g[old], undefined);
  assert.deepEqual(plain(C.makeGoal({ name: 'x' }).source), { kind: 'manual' });
});

// ── Migration ──────────────────────────────────────────────────

const v1Goals = () => [
  { id: 1712345678901, name: 'Holiday', icon: 'plane', targetAmount: 8000, currentAmount: 2000, targetDate: '2027-06-01', linkedAccount: '', createdAt: '2026-03-04' },
  { id: 1712345678902, name: 'Old style', target: 1000, saved: 400 },
  { id: 1712345678903, name: 'House', targetAmount: 50000, currentAmount: 0, linkedAccount: 'offset', createdAt: '2026-02-01' },
  { id: 1712345678904, name: 'Car', targetAmount: 6000, currentAmount: 3000, linkedAccount: 'sav1', createdAt: '2026-05-01' },
  { id: 1712345678905, name: 'Bike', targetAmount: 2000, currentAmount: 500, linkedAccount: 'sav1', createdAt: '2026-06-01' },
  { id: 1712345678906, name: 'Done', targetAmount: 500, currentAmount: 650, createdAt: '2026-01-01' },
  { id: 1712345678907, name: 'Annual Bills Buffer', icon: 'target', targetAmount: 1800, currentAmount: 0, targetDate: '2027-01-15', linkedAccount: '', createdAt: '2026-09-01', _source: 'bills_buffer' },
];

test('migration is idempotent: running it twice equals running it once', () => {
  const once = C.goalsMigrateV2(v1Goals(), '2026-10-25');
  assert.equal(once.changed, true);
  const twice = C.goalsMigrateV2(plain(once.goals), '2026-10-25');
  assert.equal(twice.changed, false);
  assert.deepEqual(plain(twice.goals), plain(once.goals));
});

test('every old shape maps as in the spec table', () => {
  const [hol, old, house, car, bike, done, buffer] = C.goalsMigrateV2(v1Goals(), '2026-10-25').goals;
  // currentAmount/targetAmount, unlinked → manual with an opening balance
  assert.equal(hol.id, 'g_1712345678901');
  assert.equal(hol.target, 8000);
  assert.deepEqual(plain(hol.source), { kind: 'manual' });
  assert.equal(hol.contributions.length, 1);
  assert.equal(hol.contributions[0].amount, 2000);
  assert.equal(hol.contributions[0].date, '2026-03-04');
  assert.equal(hol.contributions[0].note, 'opening balance');
  assert.equal(hol.type, 'save');
  assert.equal(hol.owner, 'joint');
  assert.equal(hol.icon, 'plane');
  // saved/target, no createdAt → opening balance dated today
  assert.equal(old.target, 1000);
  assert.equal(old.createdAt, '2026-10-25');
  assert.equal(old.contributions[0].amount, 400);
  // linked to an account no other goal uses → account, no opening entry at $0
  assert.deepEqual(plain(house.source), { kind: 'account', accountId: 'offset' });
  assert.deepEqual(plain(house.contributions), []);
  // two goals on one account → buckets, each opening with its old amount
  assert.deepEqual(plain(car.source), { kind: 'bucket', accountId: 'sav1' });
  assert.deepEqual(plain(bike.source), { kind: 'bucket', accountId: 'sav1' });
  assert.equal(car.contributions[0].amount, 3000);
  assert.equal(bike.contributions[0].amount, 500);
  // finished goal: achieved, every milestone recorded so nothing celebrates later
  assert.equal(done.status, 'achieved');
  assert.deepEqual(plain(done.milestonesHit), [25, 50, 75, 100]);
  // milestones already passed are recorded, later ones are not
  assert.deepEqual(plain(car.milestonesHit), [25, 50]);
  assert.deepEqual(plain(hol.milestonesHit), [25]);
  // bills buffer keeps its marker so Bills can find it again
  assert.equal(buffer._source, 'bills_buffer');
  assert.equal(buffer.target, 1800);
  assert.equal(buffer.targetDate, '2027-01-15');
});

test('migration keeps the old fields for a rollback', () => {
  const [hol] = C.goalsMigrateV2(v1Goals(), '2026-10-25').goals;
  assert.equal(hol.targetAmount, 8000);
  assert.equal(hol.currentAmount, 2000);
  assert.equal(hol.linkedAccount, '');
});

test('migrated amounts are unchanged', () => {
  const ct = { offset: { '2026-09': 21000 }, sav1: { '2026-09': 10000 } };
  const migrated = C.goalsMigrateV2(v1Goals(), '2026-10-25').goals;
  const ctx = ctxFor({ ct, goals: migrated });
  const amounts = migrated.map((g) => C.goalCurrent(g, ctx));
  assert.deepEqual(amounts, [2000, 400, 21000, 3000, 500, 650, 0]);
});

test('shared-account buckets never add up to more than the account balance', () => {
  const ct = { sav1: { '2026-09': 2500 } }; // less than the 3,500 the two goals held
  const migrated = C.goalsMigrateV2(v1Goals(), '2026-10-25').goals;
  const ctx = ctxFor({ ct, goals: migrated });
  const car = migrated[3], bike = migrated[4];
  const sum = C.goalCurrent(car, ctx) + C.goalCurrent(bike, ctx);
  assert.ok(Math.abs(sum - 2500) < 1e-9, 'buckets add up to the balance, got ' + sum);
  assert.ok(Math.abs(C.goalCurrent(car, ctx) / C.goalCurrent(bike, ctx) - 6) < 1e-9, 'scaled in proportion');
  // a $0 balance leaves nothing in any bucket
  const empty = ctxFor({ ct: { sav1: { '2026-09': 0 } }, goals: migrated });
  assert.equal(C.goalCurrent(car, empty), 0);
});

test('with live balances: linked goals take milestones from the balance, buckets are capped oldest first', () => {
  const ct = { offset: { '2026-09': 41000 }, sav1: { '2026-09': 3200 } };
  const balanceOf = (id) => ctxFor({ ct }).balanceOf(id);
  const [, , house, car, bike] = C.goalsMigrateV2(v1Goals(), '2026-10-25', balanceOf).goals;
  // House showed 41,000 of 50,000 (82%) before the upgrade, though currentAmount was 0
  assert.deepEqual(plain(house.milestonesHit), [25, 50, 75]);
  // Car (May) keeps its 3,000; Bike (June) gets the 200 left of the 3,200 balance
  assert.equal(car.contributions[0].amount, 3000);
  assert.equal(bike.contributions[0].amount, 200);
  // an achieved linked goal is marked achieved
  const done = C.goalsMigrateV2([{ id: 5, name: 'Full', targetAmount: 1000, currentAmount: 0, linkedAccount: 'sav2' }], '2026-10-25', () => 1200).goals[0];
  assert.equal(done.status, 'achieved');
});

test('a record that is already v2 is left alone, numeric ids become strings', () => {
  const g = v2();
  const out = C.goalsMigrateV2([g, { id: 7, name: 'x', targetAmount: 1 }], '2026-10-25').goals;
  assert.equal(out[0], g);
  assert.equal(out[1].id, 'g_7');
  assert.equal(typeof out[1].id, 'string');
});

// ── Amounts ────────────────────────────────────────────────────

test('goalCurrent per source kind, never below 0', () => {
  const ctx = ctxFor({ ct: { sav2: { '2026-08': 900, '2026-09': 1200 } } });
  assert.equal(C.goalCurrent(v2({ contributions: [contrib('2026-02-01', 300), contrib('2026-03-01', -50)] }), ctx), 250);
  assert.equal(C.goalCurrent(v2({ contributions: [contrib('2026-02-01', -50)] }), ctx), 0);
  assert.equal(C.goalCurrent(v2({ source: { kind: 'account', accountId: 'sav2' } }), ctx), 1200);
  // an account with no Cash Tracker balance falls back to what's logged
  assert.equal(C.goalCurrent(v2({ source: { kind: 'account', accountId: 'nope' }, contributions: [contrib('2026-02-01', 75, 'opening balance')] }), ctx), 75);
});

test('goalPct is a whole number and only 100 once the target is met', () => {
  const ctx = ctxFor();
  const at = (amt) => C.goalPct(v2({ contributions: [contrib('2026-02-01', amt)] }), ctx);
  assert.equal(at(9960), 99);
  assert.equal(at(9999.99), 99);
  assert.equal(at(10000), 100);
  assert.equal(at(12000), 100);
  assert.equal(at(2550), 25);
  assert.equal(C.goalPct(v2({ target: 0 }), ctx), 0);
});

test('total saved counts a shared dedicated account once', () => {
  const ct = { sav1: { '2026-09': 4000 } };
  const goals = [
    v2({ id: 'g_a', source: { kind: 'account', accountId: 'sav1' } }),
    v2({ id: 'g_b', source: { kind: 'account', accountId: 'sav1' } }),
    v2({ id: 'g_c', contributions: [contrib('2026-02-01', 250)] }),
  ];
  assert.equal(C.goalsTotalCurrent(goals, ctxFor({ ct, goals })), 4250);
});

test('total saved never counts buckets on top of a whole-account goal for the same account', () => {
  const ct = { sav1: { '2026-09': 10000 } };
  const goals = [
    v2({ id: 'g_a', source: { kind: 'bucket', accountId: 'sav1' }, contributions: [contrib('2026-02-01', 3000)] }),
    v2({ id: 'g_b', source: { kind: 'bucket', accountId: 'sav1' }, contributions: [contrib('2026-02-01', 500)] }),
  ];
  const ctx = ctxFor({ ct, goals });
  assert.equal(C.goalsTotalCurrent(goals, ctx), 3500);
  goals.push(v2({ id: 'g_c', source: { kind: 'account', accountId: 'sav1' } }));
  assert.equal(C.goalsTotalCurrent(goals, ctxFor({ ct, goals })), 10000);
});

// ── Pace ───────────────────────────────────────────────────────

test('pace averages the last 3 full months and ignores opening balances', () => {
  const g = v2({ contributions: [
    contrib('2026-01-10', 5000, 'opening balance'),
    contrib('2026-07-05', 900), // outside the window
    contrib('2026-08-05', 300), contrib('2026-09-05', 600), contrib('2026-09-20', -100),
    contrib('2026-10-02', 2000), // this month: not a full month yet
  ] });
  // Jul–Sep window = Jul 900 + Aug 300 + Sep 500 → 1700 / 3
  assert.ok(Math.abs(C.goalPace(g, ctxFor()) - 1700 / 3) < 1e-9);
});

test('a young goal averages over the full months it has existed', () => {
  const g = v2({ createdAt: '2026-08-14', contributions: [contrib('2026-08-20', 400), contrib('2026-09-20', 200)] });
  assert.equal(C.goalPace(g, ctxFor()), 300); // 2 full months: Aug + Sep
  const brandNew = v2({ createdAt: '2026-10-03', contributions: [contrib('2026-10-04', 150)] });
  assert.equal(C.goalPace(brandNew, ctxFor()), 150);
});

test('money added this month counts when the full months net to nothing', () => {
  const g = v2({ contributions: [contrib('2026-01-15', 2000, 'opening balance'), contrib('2026-10-20', 300)] });
  assert.equal(C.goalPace(g, ctxFor()), 300);
  assert.equal(C.goalEta(g, ctxFor()), 26); // 7,700 to go at 300/month
  // with a real 3-month history, this month waits until it's complete
  g.contributions.push(contrib('2026-09-05', 600));
  assert.equal(C.goalPace(g, ctxFor()), 200);
});

test('a goal with nothing logged uses the fallback rate', () => {
  const g = v2({ contributions: [contrib('2026-01-10', 5000, 'opening balance')] });
  assert.equal(C.goalPace(g, ctxFor({ fallbackRate: 420 })), 420);
  assert.equal(C.goalPace(g, ctxFor({ fallbackRate: -10 })), 0);
});

test('a dedicated account earns pace from its month-on-month balance changes', () => {
  const ct = { sav2: { '2025-12': 1000, '2026-07': 1500, '2026-08': 1800, '2026-09': 1700, '2026-10': 2500 } };
  const g = v2({ source: { kind: 'account', accountId: 'sav2' }, createdAt: '2026-01-10' });
  const sync = C.goalSyncContributions(g, ctxFor({ ct }));
  assert.deepEqual(plain(sync.map((c) => [c.date, c.amount])), [['2026-07-01', 500], ['2026-08-01', 300], ['2026-09-01', -100], ['2026-10-01', 800]]);
  assert.ok(sync.every((c) => c.note === 'balance sync' && c.person === 'joint'));
  // Jul 500 + Aug 300 + Sep −100 → 700 / 3
  assert.ok(Math.abs(C.goalPace(g, ctxFor({ ct })) - 700 / 3) < 1e-9);
  // nothing is stored on the goal
  assert.deepEqual(plain(g.contributions), []);
});

test('balance changes before the goal began are not counted', () => {
  const ct = { sav2: { '2026-07': 1000, '2026-08': 4000, '2026-09': 4500 } };
  const g = v2({ source: { kind: 'account', accountId: 'sav2' }, createdAt: '2026-09-02' });
  assert.deepEqual(plain(C.goalSyncContributions(g, ctxFor({ ct })).map((c) => c.amount)), [500]);
});

// ── Needed, status, finish date, streak ────────────────────────

test('needed per month and per fortnight to hit a target date', () => {
  const g = v2({ targetDate: '2027-04-01', contributions: [contrib('2026-02-01', 4000)] });
  const need = C.goalNeeded(g, ctxFor());
  assert.equal(need.monthsLeft, 6);
  assert.equal(need.perMonth, 1000);
  assert.ok(Math.abs(need.perFortnight - 1000 * 12 / 26) < 1e-9);
  assert.equal(C.goalNeeded(v2(), ctxFor()), null);
  // a date this month or past still divides by at least one month
  assert.equal(C.goalNeeded(v2({ targetDate: '2026-10-30' }), ctxFor()).monthsLeft, 1);
});

test('status: ahead, on track, behind, no date and achieved', () => {
  // needs 1000/month for 6 months
  const withPace = (perMonth) => v2({ targetDate: '2027-04-01', contributions: [
    contrib('2026-01-15', 4000 - 3 * perMonth, 'opening balance'),
    contrib('2026-07-05', perMonth), contrib('2026-08-05', perMonth), contrib('2026-09-05', perMonth),
  ] });
  assert.equal(C.goalStatus(withPace(1100), ctxFor()), 'ahead');
  assert.equal(C.goalStatus(withPace(1000), ctxFor()), 'on-track');
  assert.equal(C.goalStatus(withPace(900), ctxFor()), 'on-track');
  assert.equal(C.goalStatus(withPace(890), ctxFor()), 'behind');
  assert.equal(C.goalStatus(v2(), ctxFor()), 'no-date');
  assert.equal(C.goalStatus(v2({ contributions: [contrib('2026-02-01', 10000)] }), ctxFor()), 'achieved');
});

test('finish date is remaining / pace, or null without pace', () => {
  const g = v2({ contributions: [contrib('2026-01-15', 4000, 'opening balance'), contrib('2026-09-05', 1500)] });
  // pace 500/month, 4,500 to go → 9 months
  assert.equal(C.goalEta(g, ctxFor()), 9);
  assert.equal(C.goalEta(v2(), ctxFor()), null);
  assert.equal(C.goalEta(v2({ contributions: [contrib('2026-02-01', 10000)] }), ctxFor()), 0);
});

test('streak counts months with net new money; an empty current month is not a break', () => {
  const g = v2({ contributions: [
    contrib('2026-01-10', 999, 'opening balance'),
    contrib('2026-06-05', 100), contrib('2026-07-05', 100), contrib('2026-08-05', 100), contrib('2026-09-05', 100),
  ] });
  assert.equal(C.goalStreak(g, ctxFor()), 4); // Jun–Sep, October still open
  g.contributions.push(contrib('2026-10-05', 50));
  assert.equal(C.goalStreak(g, ctxFor()), 5);
  // a month that nets to zero or less ends the run
  const broken = v2({ contributions: [contrib('2026-07-05', 100), contrib('2026-08-05', 100), contrib('2026-08-20', -100), contrib('2026-09-05', 100)] });
  assert.equal(C.goalStreak(broken, ctxFor()), 1);
});

// ── Edits ──────────────────────────────────────────────────────

test('setting the amount logs the difference as a contribution', () => {
  const g = v2({ contributions: [contrib('2026-01-15', 1000, 'opening balance')] });
  assert.equal(C.goalSetCurrent(g, 1250, ctxFor(), { person: 'shelley' }), true);
  const last = g.contributions[g.contributions.length - 1];
  assert.equal(last.amount, 250);
  assert.equal(last.person, 'shelley');
  assert.equal(last.date, '2026-10-25');
  assert.equal(C.goalCurrent(g, ctxFor()), 1250);
  assert.equal(C.goalSetCurrent(g, 1250, ctxFor()), false, 'no change, nothing logged');
  // a live account balance can't be overridden
  const acct = v2({ source: { kind: 'account', accountId: 'sav2' } });
  assert.equal(C.goalSetCurrent(acct, 50, ctxFor({ ct: { sav2: { '2026-09': 900 } } })), false);
});

test('unlinking or deleting an account keeps the amount saved', () => {
  const ct = { sav2: { '2026-09': 1800 } };
  const g = v2({ source: { kind: 'account', accountId: 'sav2' }, contributions: [contrib('2026-01-15', 300, 'opening balance')] });
  const bucket = v2({ id: 'g_b', source: { kind: 'bucket', accountId: 'sav2' }, contributions: [contrib('2026-01-15', 200, 'opening balance')] });
  const goals = [g, bucket];
  const ctx = ctxFor({ ct, goals });
  assert.equal(C.goalsDetachAccount(goals, 'sav2', ctx), 2);
  const after = ctxFor({ goals }); // the account and its balances are gone
  assert.equal(C.goalCurrent(g, after), 1800);
  assert.equal(C.goalCurrent(bucket, after), 200);
  assert.deepEqual(plain(g.source), { kind: 'manual' });
  assert.equal(g.contributions[1].note, 'carried over');
  // the carried balance is not new money
  assert.equal(C.goalPace(g, ctxFor({ goals, fallbackRate: 0 })), 0);
});
