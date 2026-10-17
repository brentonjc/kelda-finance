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

// ── Liabilities ──────────────────────────────────────────────

test('fixture 13: a card file showing the amount owed as positive is read in Kelda\'s sign', () => {
  const ch = chainOf('13-card-owed-positive.csv');
  assert.equal(ch.balanceFlipped, true);
  assert.equal(ch.chain, 'verified');
  assert.equal(ch.openingCents, -40000);
  assert.equal(ch.closingCents, -18710);
  assert.deepEqual(plain(BS.monthClosings(ch).map((c) => [c.month, c.cents, c.kind])),
    [['2026-09', -12710, 'monthEnd'], ['2026-10', -18710, 'asOf']]);
});

test('fixture 14: a loan file with DR balances and split columns needs no flip', () => {
  const ch = chainOf('14-loan-dr-split.csv');
  assert.equal(ch.balanceFlipped, false);
  assert.equal(ch.chain, 'verified');
  assert.equal(ch.openingCents, -25000000);
  assert.equal(ch.closingCents, -24961750);
});

test('a cash file never flips when its balances already chain', () => {
  assert.equal(chainOf('01-clean-oldest-first.csv').balanceFlipped, false);
  assert.equal(chainOf('10-overdrawn-split-columns.csv').balanceFlipped, false);
});

test('buildRows flips a single Amount column when positive amounts are spending', () => {
  const map = { date: 'Date', amount: 'Amount', balance: 'Balance' };
  const rows = [{ Date: '02/09/2026', Amount: '120.50', Balance: '520.50' }];
  assert.equal(BS.buildRows(rows, map, app.csvDate)[0].amountCents, 12050);
  assert.equal(BS.buildRows(rows, map, app.csvDate, { posSpend: true })[0].amountCents, -12050);
  const split = { date: 'Date', debit: 'Debit', credit: 'Credit', balance: 'Balance' };
  assert.equal(BS.buildRows([{ Date: '02/09/2026', Debit: '5', Credit: '', Balance: '1' }], split, app.csvDate, { posSpend: true })[0].amountCents, -500);
});

// The import wizard with a liability picked, using stubs for the page around it.
function liabApp(pick, setup) {
  const ctx = loadApp();
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/pages/liabilities.js'), 'utf8'), ctx, { filename: 'js/pages/liabilities.js' });
  const el = () => ({ value: '', checked: false, hidden: false, disabled: false, innerHTML: '', style: {}, focus() {} });
  const els = { 'csv-bal-acct': Object.assign(el(), { value: pick }) };
  ctx.document = { getElementById: (id) => els[id] || (els[id] = el()), querySelectorAll: () => [] };
  vm.runInContext(`
    var ACCOUNTS = [{ id: 'home', name: 'Joint' }, { id: 'visa', name: 'Old Visa', acctType: 'Credit Card' }];
    var LIABILITIES = [{ id: 'liab_1', type: 'credit_card', lender: 'Example Card', balance: 300 }];
    var LIAB_MONTHLY = {}; var MORTGAGE = {}; var TX = []; var LCATS = []; var activeProfile = 'brenton';
    var lastGo = null, undoFn = null;
    function fmt(n) { return '$' + Number(n).toFixed(2); }
    function esc(s) { return String(s); }
    function txFmtDate(d) { return d; }
    function toast() {}
    function ICON() { return ''; }
    function today() { return '2026-10-18'; }
    function csvReset() {}
    function closeCsvModal() {}
    function renderDashboard() {}
    function go(p) { lastGo = p; }
    function showUndoToast(m, ms, fn) { undoFn = fn; }
    ${setup || ''}
  `, ctx);
  return ctx;
}
function prepare(ctx, name) {
  const f = fixture(name);
  ctx._csvRaw = f.rows;
  vm.runInContext('_csvRaw = this._csvRaw;', ctx);
  assert.equal(ctx.bsPrepare(f.map, name), true);
  return vm.runInContext('_bsCheck', ctx);
}

test('the picker lists liabilities after cash accounts', () => {
  const ctx = liabApp('');
  vm.runInContext("document.querySelectorAll = () => [{ value: 'balance' }];", ctx);
  ctx.csvBalToggle();
  const html = ctx.document.getElementById('csv-bal-acct').innerHTML;
  assert.match(html, /<optgroup label="Cash accounts">.*Joint.*<\/optgroup><optgroup label="Liabilities"><option value="liab:liab_1">Example Card/);
});

test('a Cash Tracker card account is still not synced', () => {
  const c = prepare(liabApp('visa'), '13-card-owed-positive.csv');
  assert.equal(c.reason, 'card');
});

test('syncing balances only into a card: monthly owed, card balance, dated history, undo', () => {
  const ctx = liabApp('liab:liab_1');
  const c = prepare(ctx, '13-card-owed-positive.csv');
  assert.equal(c.rec.status, 'clean');
  assert.deepEqual(plain(c.card), { owed: 300, asOf: null, newOwedCents: 18710, apply: true });
  ctx.bsCommit(true, true);
  const got = plain(vm.runInContext('({ tx: TX.length, lm: LIAB_MONTHLY, l: LIABILITIES[0], go: lastGo })', ctx));
  assert.equal(got.tx, 0);
  assert.deepEqual(got.lm, { liab_1: { '2026-09': 127.1, '2026-10': 187.1 } });
  assert.equal(got.l.balance, 187.1);
  assert.equal(got.l.balanceAsOf, '2026-10-03');
  assert.equal(got.go, 'liabilities');
  const store = plain(vm.runInContext('load(K.balanceSync)', ctx));
  assert.deepEqual(store.anchors['liab:liab_1'].map((a) => [a.date, a.cents, a.kind]),
    [['2026-09-01', -40000, 'open'], ['2026-09-30', -12710, 'monthEnd'], ['2026-10-03', -18710, 'close']]);
  assert.deepEqual(store.liabDates, { liab_1: {
    '2026-09': { date: '2026-09-30', cents: 12710 }, '2026-10': { date: '2026-10-03', cents: 18710 } } });
  assert.equal(ctx.bsLiabDate('liab_1', '2026-10'), '2026-10-03');
  const hist = ctx.bsHistoryHtml('liab:liab_1', true);
  assert.match(hist, /Balances from bank files \(3\)/);
  assert.match(hist, /2026-10-03<\/span> <span class="bs-li-name">Closing · 13-card-owed-positive.csv<\/span> <span class="bs-amt">\$187\.10/);

  vm.runInContext('undoFn()', ctx);
  const back = plain(vm.runInContext('({ lm: LIAB_MONTHLY, l: LIABILITIES[0] })', ctx));
  assert.deepEqual(back.lm, {});
  assert.equal(back.l.balance, 300);
  assert.equal(ctx.bsHistoryHtml('liab:liab_1', true), '');
});

test('import & sync into a card stamps rows with the liability key', () => {
  const ctx = liabApp('liab:liab_1');
  prepare(ctx, '13-card-owed-positive.csv');
  vm.runInContext(`_csvParsed = [{ date: '2026-09-02', type: 'expense', category: 'Food', catId: 'food', subcat: '',
    name: 'GROCER ONE', account: '', description: '', amount: 120.5 }];`, ctx);
  ctx.csvFinishImport = () => {};
  vm.runInContext('csvFinishImport = this.csvFinishImport;', ctx);
  ctx.bsCommit(true);
  assert.equal(vm.runInContext('TX[0].account', ctx), 'liab:liab_1');
});

test('a file older than the card\'s last synced balance leaves the card balance alone', () => {
  const ctx = liabApp('liab:liab_1', "LIABILITIES[0].balanceAsOf = '2026-11-01';");
  const c = prepare(ctx, '13-card-owed-positive.csv');
  assert.equal(c.card.apply, false);
  ctx.bsCommit(true, true);
  assert.equal(vm.runInContext('LIABILITIES[0].balance', ctx), 300);
  assert.deepEqual(plain(vm.runInContext('LIAB_MONTHLY.liab_1', ctx)), { '2026-09': 127.1, '2026-10': 187.1 });
});

test('a mortgage syncs into the Mortgage tab balance and its monthly history', () => {
  const ctx = liabApp('liab:mortgage_primary', "MORTGAGE = { properties: [{ id: 7, name: 'Example Home', balance: 260000, rate: 6, years: 25 }] };");
  const c = prepare(ctx, '14-loan-dr-split.csv');
  assert.equal(c.name, 'Example Home');
  ctx.bsCommit(true, true);
  const got = plain(vm.runInContext('({ m: MORTGAGE.properties[0], lm: LIAB_MONTHLY })', ctx));
  assert.equal(got.m.balance, 249617.5);
  assert.equal(got.m.balanceAsOf, '2026-10-01');
  assert.deepEqual(got.lm, { mortgage_primary: { '2026-08': 250000, '2026-09': 248812.4, '2026-10': 249617.5 } });
});

test('a mortgage linked to a Liabilities entry moves with it', () => {
  const ctx = liabApp('liab:liab_1', `
    LIABILITIES[0] = { id: 'liab_1', type: 'mortgage', lender: 'Example Loan', balance: 260000 };
    MORTGAGE = { properties: [{ id: 7, name: 'Example Home', balance: 260000, linkedLiabilityId: 'liab_1' }] };`);
  prepare(ctx, '14-loan-dr-split.csv');
  ctx.bsCommit(true, true);
  assert.equal(vm.runInContext('LIABILITIES[0].balance', ctx), 249617.5);
  assert.equal(vm.runInContext('MORTGAGE.properties[0].balance', ctx), 249617.5);
});

test('a second card file that starts where the first ended reconciles clean', () => {
  const ctx = liabApp('liab:liab_1');
  prepare(ctx, '13-card-owed-positive.csv');
  ctx.bsCommit(true, true);
  const next = 'Date,Description,Amount,Balance\n10/10/2026,GROCER ONE,-12.90,200.00\n';
  const { headers, rows } = app.csvParse(next);
  const map = {}; headers.forEach((h) => { const g = app.csvGuess(h); if (g) map[g] = h; });
  ctx._csvRaw = rows; vm.runInContext('_csvRaw = this._csvRaw;', ctx);
  ctx.bsPrepare(map, 'next.csv');
  const c = vm.runInContext('_bsCheck', ctx);
  assert.equal(c.rec.gapCents, 0);
  assert.equal(c.rec.status, 'review'); // October already holds the earlier as-of balance, which this replaces
  assert.deepEqual(plain(c.rec.ctChanges.map((x) => [x.month, x.existingCents, x.fileCents])), [['2026-10', -18710, -20000]]);
});

test('a liability month edited by hand loses its file date', () => {
  const ctx = liabApp('liab:liab_1');
  prepare(ctx, '13-card-owed-positive.csv');
  ctx.bsCommit(true, true);
  assert.equal(ctx.bsLiabDate('liab_1', '2026-10'), '2026-10-03');
  vm.runInContext("LIAB_MONTHLY.liab_1['2026-10'] = 150;", ctx);
  assert.equal(ctx.bsLiabDate('liab_1', '2026-10'), null);
  assert.equal(ctx.bsLiabDate('liab_1', '2026-09'), '2026-09-30');
});

test('a one-row liability file reads a plain positive balance as owed, but not one marked CR', () => {
  const map = { date: 'Date', amount: 'Amount', balance: 'Balance' };
  const one = (bal) => BS.deriveChain(BS.buildRows([{ Date: '10/10/2026', Amount: '-12.90', Balance: bal }], map, app.csvDate), { owed: true });
  assert.equal(one('200.00').closingCents, -20000);
  assert.equal(one('50.00 CR').closingCents, 5000);
  assert.equal(one('-200.00').closingCents, -20000);
  const cash = BS.deriveChain(BS.buildRows([{ Date: '10/10/2026', Amount: '-12.90', Balance: '200.00' }], map, app.csvDate));
  assert.equal(cash.closingCents, 20000);
});
