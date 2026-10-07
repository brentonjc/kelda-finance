// Unit tests for balance sync on CSV import (js/pages/balancesync.js): reading the running
// balance, ordering the chain, month-end closings, and reconciling against Kelda's data.
// Run: node --test "tests/**/*.test.js"
// Every fixture in tests/fixtures/balance-sync is made up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures', 'balance-sync');

// Load the scripts the way the browser does: classic scripts sharing one global scope.
function loadApp() {
  const store = {};
  const ctx = {
    console,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      key: (i) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    },
    document: { getElementById: () => null, querySelectorAll: () => [] },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const file of ['js/storage.js', 'js/pages/cash.js', 'js/pages/export.js', 'js/pages/balancesync.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  }
  vm.runInContext('var CT = {}; var CT_DATES = {};', ctx);
  return ctx;
}
const app = loadApp();
const BS = app.BalanceSync;
const plain = (x) => JSON.parse(JSON.stringify(x));

// Parse a fixture with the import's own CSV parser and the import's column guesses.
function fixture(name) {
  const { headers, rows } = app.csvParse(fs.readFileSync(path.join(FIX, name), 'utf8'));
  const map = {};
  headers.forEach((h) => { const g = app.csvGuess(h); if (g) map[g] = h; });
  return { headers, rows, map };
}
function chainOf(name) {
  const f = fixture(name);
  return BS.deriveChain(BS.buildRows(f.rows, f.map, app.csvDate));
}
// A Kelda transaction on the test account.
const tx = (date, cents, name, extra) => Object.assign({
  date, type: cents >= 0 ? 'income' : 'expense', amount: Math.abs(cents) / 100, name, account: 'sav1',
}, extra || {});
// Fixture 01 as already imported on sav1.
const F1_TX = [
  tx('2026-09-01', 250000, 'SALARY EXAMPLE CO'), tx('2026-09-03', -12050, 'GROCER ONE'),
  tx('2026-09-03', -450, 'CAFE TWO'), tx('2026-09-15', -21000, 'POWER CO'),
  tx('2026-09-30', 125, 'INTEREST'), tx('2026-10-02', -8000, 'GROCER ONE'),
];
// What a confirmed sync of fixture 01 records.
function f1Anchors() {
  const ch = chainOf('01-clean-oldest-first.csv');
  return BS.anchorsFor(ch, BS.monthClosings(ch), 'b1');
}

test('parseCents reads AU bank money formats in whole cents', () => {
  assert.equal(BS.parseCents('1,234.56'), 123456);
  assert.equal(BS.parseCents('$1,234.56'), 123456);
  assert.equal(BS.parseCents('(12.00)'), -1200);
  assert.equal(BS.parseCents('-0.10'), -10);
  assert.equal(BS.parseCents('55.00 DR'), -5500);
  assert.equal(BS.parseCents('1,750.00 CR'), 175000);
  assert.equal(BS.parseCents('0.1'), 10);
  assert.equal(BS.parseCents('19.99'), 1999); // no float drift
  assert.equal(BS.parseCents(''), null);
  assert.equal(BS.parseCents('n/a'), null);
});

test('balance headers are recognised; available balance is not', () => {
  assert.ok(BS.isBalanceHeader('Balance'));
  assert.ok(BS.isBalanceHeader('Running Balance'));
  assert.ok(BS.isBalanceHeader('Closing balance'));
  assert.ok(!BS.isBalanceHeader('Available Balance'));
  assert.ok(!BS.isBalanceHeader('Amount'));
  assert.equal(app.csvGuess('Balance'), 'balance');
  assert.equal(app.csvGuess('Amount'), 'amount');
});

test('fixture 01: clean, oldest-first, first sync', () => {
  const ch = chainOf('01-clean-oldest-first.csv');
  assert.equal(ch.chain, 'verified');
  assert.equal(ch.openingCents, 100000);
  assert.equal(ch.closingCents, 308625);
  assert.equal(ch.from, '2026-09-01');
  assert.equal(ch.to, '2026-10-02');
  const r = BS.reconcile({ acctId: 'sav1', chain: ch, anchors: [], tx: [] });
  assert.equal(r.firstSync, true);
  assert.equal(r.gapCents, null);
  assert.equal(r.status, 'clean');
  // Opening lands on 31 Aug, a month-end, so August is measured too
  assert.deepEqual(plain(r.ctWrites.map((w) => [w.month, w.date, w.cents, w.kind])), [
    ['2026-08', '2026-08-31', 100000, 'monthEnd'],
    ['2026-09', '2026-09-30', 316625, 'monthEnd'],
    ['2026-10', '2026-10-02', 308625, 'asOf'],
  ]);
});

test('fixture 02: newest-first gives the same chain', () => {
  const a = chainOf('01-clean-oldest-first.csv');
  const b = chainOf('02-clean-newest-first.csv');
  assert.equal(b.chain, 'verified');
  assert.equal(b.openingCents, a.openingCents);
  assert.equal(b.closingCents, a.closingCents);
  assert.deepEqual(plain(BS.monthClosings(b)), plain(BS.monthClosings(a)));
});

test('fixture 03: same-day rows out of order are reordered so the chain holds', () => {
  const ch = chainOf('03-same-day-scrambled.csv');
  assert.equal(ch.chain, 'verified');
  assert.deepEqual(plain(ch.order.map((r) => r.amountCents)), [250000, -12500, -2000, -450, -21000]);
  assert.equal(ch.openingCents, 100000);
  assert.equal(ch.closingCents, 314050);
});

test('fixture 04: a wrong balance breaks the chain at that row', () => {
  const ch = chainOf('04-broken-chain.csv');
  assert.equal(ch.chain, 'broken');
  assert.deepEqual(plain(ch.brokenLines), [5, 6]); // line 5 is wrong, so line 6 no longer follows
  const r = BS.reconcile({ acctId: 'sav1', chain: ch, anchors: [], tx: [] });
  assert.equal(r.status, 'review');
});

test('fixture 05: a transaction missing from Kelda before the file shows as an opening gap', () => {
  const ch = chainOf('05-opening-gap.csv');
  const anchors = [{ date: '2026-08-31', cents: 100000, batchId: 'b0', kind: 'monthEnd' }];
  // Bank also had a -$125 on 5 Sep that Kelda never got
  const r = BS.reconcile({ acctId: 'sav1', chain: ch, anchors, tx: [tx('2026-09-01', 250000, 'SALARY EXAMPLE CO')] });
  assert.equal(r.expectedOpeningCents, 350000);
  assert.equal(ch.openingCents, 337500);
  assert.equal(r.gapCents, -12500);
  assert.equal(r.rolled.length, 1);
  assert.equal(r.status, 'review');
});

test('fixture 06: a manual Kelda transaction not in the file is flagged', () => {
  const ch = chainOf('06-in-range-extra.csv');
  const manual = tx('2026-09-10', -5000, 'Cash withdrawal');
  const other = Object.assign(tx('2026-09-10', -9900, 'Other account'), { account: 'home' });
  const r = BS.reconcile({ acctId: 'sav1', chain: ch, anchors: [], tx: F1_TX.concat([manual, other]) });
  assert.equal(r.extras.length, 1);
  assert.equal(r.extras[0].name, 'Cash withdrawal');
  assert.equal(r.status, 'review');
});

test('fixture 07: transfer legs count as movements on their own account only', () => {
  const ch = chainOf('07-transfer-leg.csv');
  const legOut = tx('2026-09-05', -100000, 'TRANSFER TO OFFSET', { catId: 'transfers' });
  const legIn = Object.assign(tx('2026-09-05', 100000, 'TRANSFER FROM SAVINGS', { catId: 'transfers' }), { account: 'offset' });
  const notInFile = tx('2026-09-10', 30000, 'TRANSFER FROM OFFSET', { catId: 'transfers' });
  const r = BS.reconcile({
    acctId: 'sav1', chain: ch, anchors: [],
    tx: [tx('2026-09-01', 250000, 'SALARY EXAMPLE CO'), legOut, legIn, notInFile, tx('2026-09-15', -21000, 'POWER CO')],
  });
  assert.equal(ch.chain, 'verified');
  assert.equal(r.extras.length, 1); // matched leg isn't an extra; the other account's leg is ignored
  assert.equal(r.extras[0].name, 'TRANSFER FROM OFFSET');
  // Rolling forward also counts transfer legs (once), from TX only
  const later = BS.reconcile({
    acctId: 'sav1', chain: chainOf('05-opening-gap.csv'),
    anchors: [{ date: '2026-08-31', cents: 100000, kind: 'monthEnd' }],
    tx: [tx('2026-09-01', 250000, 'SALARY'), legOut, legIn],
  });
  assert.equal(later.expectedOpeningCents, 250000);
});

test('fixture 08: re-importing an already-synced file gives no false gap', () => {
  const ch = chainOf('08-already-imported.csv');
  const ct = { '2026-08': 1000, '2026-09': 3166.25, '2026-10': 3086.25 };
  const r = BS.reconcile({ acctId: 'sav1', chain: ch, anchors: f1Anchors(), tx: F1_TX, ct });
  assert.equal(r.firstSync, false);
  assert.equal(r.gapCents, 0);
  assert.equal(r.extras.length, 0);
  assert.equal(r.conflicts.length, 0);
  assert.equal(r.ctChanges.length, 0);
  assert.equal(r.status, 'clean');
});

test('fixture 09: an overlapping file that disagrees is a conflict, not an overwrite', () => {
  const ch = chainOf('09-overlap-disagrees.csv');
  const r = BS.reconcile({ acctId: 'sav1', chain: ch, anchors: f1Anchors(), tx: F1_TX });
  assert.equal(r.gapCents, 0);
  assert.deepEqual(plain(r.conflicts.map((c) => [c.date, c.previousCents, c.fileCents])), [
    ['2026-09-30', 316625, 316600],
    ['2026-10-02', 308625, 308600],
  ]);
  assert.equal(r.status, 'review');
});

test('fixture 10: overdrawn balances, thousands separators, split debit/credit, CR/DR', () => {
  const f = fixture('10-overdrawn-split-columns.csv');
  assert.equal(f.map.debit, 'Debit');
  assert.equal(f.map.credit, 'Credit');
  assert.equal(f.map.balance, 'Balance');
  const ch = BS.deriveChain(BS.buildRows(f.rows, f.map, app.csvDate));
  assert.equal(ch.chain, 'verified');
  assert.equal(ch.openingCents, 125000);
  assert.equal(ch.closingCents, -5500);
  assert.deepEqual(plain(ch.order.map((r) => r.balanceCents)), [-25000, 175000, 174500, -5500]);
});

test('fixture 11: no balance column means no balance sync', () => {
  const f = fixture('11-no-balance-column.csv');
  assert.equal(f.map.balance, undefined);
  assert.equal(app.bsPrepare(f.map, '11.csv'), true);
  assert.equal(app._bsCheck, null);
});

test('fixture 11: an import without balance sync stores rows exactly as before', () => {
  const ctx = loadApp();
  vm.runInContext(`
    var TX = []; var LCATS = []; var activeProfile = 'brenton';
    function today() { return '2026-10-05'; }
    _csvParsed = [{ date: '2026-09-01', type: 'income', category: 'Salary', catId: 'salary', subcat: '',
      name: 'SALARY EXAMPLE CO', account: '', description: '', amount: 2500 }];
  `, ctx);
  assert.equal(ctx.csvCommitRows(), 1);
  const row = vm.runInContext('TX[0]', ctx);
  assert.deepEqual(Object.keys(row), ['id', 'date', 'type', 'category', 'catId', 'subcat', 'name', 'account',
    'description', 'amount', 'person', '_imported']);
  assert.equal(row.account, '');
});

test('fixture 12: three months plus a part-month at the end', () => {
  const ch = chainOf('12-three-months-partial-end.csv');
  assert.equal(ch.chain, 'verified');
  assert.equal(ch.openingCents, 0);
  assert.deepEqual(plain(BS.monthClosings(ch).map((c) => [c.month, c.date, c.cents, c.kind])), [
    ['2026-07', '2026-07-31', 50050, 'monthEnd'],
    ['2026-08', '2026-08-31', 40050, 'monthEnd'],
    ['2026-09', '2026-09-30', 120050, 'monthEnd'],
    ['2026-10', '2026-10-02', 119500, 'asOf'],
  ]);
});

test('a newer manual Cash Tracker entry for the part-month is left alone', () => {
  const ch = chainOf('01-clean-oldest-first.csv');
  const r = BS.reconcile({ acctId: 'sav1', chain: ch, anchors: [], tx: [],
    ct: { '2026-10': 3000 }, ctDates: { '2026-10': '2026-10-04' } });
  assert.deepEqual(plain(r.ctWrites.map((w) => w.month)), ['2026-08', '2026-09']);
  assert.equal(r.ctSkips.length, 1);
});

test('a different manual Cash Tracker month-end needs review before it is replaced', () => {
  const ch = chainOf('01-clean-oldest-first.csv');
  const r = BS.reconcile({ acctId: 'sav1', chain: ch, anchors: [], tx: [], ct: { '2026-09': 3100 } });
  assert.deepEqual(plain(r.ctChanges.map((c) => [c.month, c.existingCents, c.fileCents])), [['2026-09', 310000, 316625]]);
  assert.equal(r.status, 'review');
});

test('mergeAnchors keeps one balance per date, newest sync winning', () => {
  const merged = BS.mergeAnchors(
    [{ date: '2026-08-31', cents: 1, batchId: 'a' }, { date: '2026-09-30', cents: 2, batchId: 'a' }],
    [{ date: '2026-09-30', cents: 3, batchId: 'b' }, { date: '2026-10-02', cents: 4, batchId: 'b' }]);
  assert.deepEqual(plain(merged.map((a) => [a.date, a.cents])), [['2026-08-31', 1], ['2026-09-30', 3], ['2026-10-02', 4]]);
});

test('ctBalanceAt carries an account\'s last balance into months it has no entry for', () => {
  const ct = { sav1: { '2026-08': 1000, '2026-09': 1200 }, home: { '2026-07': 50 } };
  assert.deepEqual(plain(app.ctBalanceAt('sav1', '2026-09', ct)), { value: 1200, carried: false, month: '2026-09' });
  assert.deepEqual(plain(app.ctBalanceAt('home', '2026-09', ct)), { value: 50, carried: true, month: '2026-07' });
  assert.deepEqual(plain(app.ctBalanceAt('home', '2026-06', ct)), { value: 0, carried: false, month: null });
  assert.deepEqual(plain(app.ctBalanceAt('none', '2026-09', ct)), { value: 0, carried: false, month: null });
});

test('a file ending today records no anchor for today, which may still change', () => {
  const ch = chainOf('01-clean-oldest-first.csv');
  const anchors = BS.anchorsFor(ch, BS.monthClosings(ch), 'b1', '2026-10-02');
  assert.deepEqual(plain(anchors.map((a) => a.date)), ['2026-08-31', '2026-09-30']);
});

test('a "Balance Date" column is not taken for a running balance', () => {
  assert.ok(!BS.isBalanceHeader('Balance Date'));
});

test('ctBankTotal sums every account, carrying each one\'s last balance', () => {
  vm.runInContext("CT = { a: { '2026-08': 100, '2026-10': 300 }, b: { '2026-09': 50 } };", app);
  assert.equal(app.ctBankTotal('2026-09', ['a', 'b']), 150);
  assert.equal(app.ctBankTotal('2026-10', ['a', 'b']), 350);
  assert.equal(app.ctBankTotal('2026-07', ['a', 'b']), 0);
  vm.runInContext('CT = {};', app);
});
