// Unit tests for js/statement-pdf.js: turning the text positions of a statement
// PDF into transactions. Layouts are made up (tests/helpers/statements.js).
// Run: node --test "tests/**/*.test.js"
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('./helpers/statements');

const ROOT = path.join(__dirname, '..');

function load() {
  const ctx = { console, URL };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/pages/balancesync.js', 'js/statement-pdf.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}
const ctx = load();
const P = ctx.StatementPdf;
const parse = (layout) => JSON.parse(JSON.stringify(P.parseItems(S.toItems(layout), { today: '2026-11-15' })));
const brief = (res) => res.rows.map((r) => [r.Date, r.Description, r.Amount, r.Balance].filter((v) => v !== undefined));

test('debit/credit columns with dd/mm/yy dates; opening and closing balances are not transactions', () => {
  const res = parse(S.westpacStyle);
  assert.deepEqual([...res.headers], ['Date', 'Description', 'Amount', 'Balance']);
  assert.deepEqual(brief(res), [
    ['2026-10-02', 'EFTPOS PURCHASE MADEUP GROCER', '-45.20', '954.80'],
    ['2026-10-03', 'SALARY EXAMPLE EMPLOYER', '2500.00', '3454.80'],
    ['2026-10-05', 'DIRECT DEBIT FAKE ENERGY CO', '-180.00', '3274.80'],
  ]);
  assert.equal(res.meta.layout, 'debitcredit');
});

test('dd Mon dates take the period\'s year; two-line descriptions join; header repeats on page 2; DR balances are negative', () => {
  const res = parse(S.commbankStyle);
  assert.deepEqual(brief(res), [
    ['2026-10-04', 'Madeup Cafe Sydney Card xx0000 Value Date: 03/10/2026', '-6.50', '493.50'],
    ['2026-10-06', 'Transfer from Savings', '200.00', '693.50'],
    ['2026-10-07', 'Imaginary Hardware', '-1089.95', '-396.45'],
    ['2026-10-12', 'Pretend Pharmacy', '-23.10', '-419.55'],
  ]);
});

test('card statement: purchases are spending, CR lines are money in, and the year rolls over in January', () => {
  const res = parse(S.cardStyle);
  assert.deepEqual([...res.headers], ['Date', 'Description', 'Amount']);
  assert.deepEqual(brief(res), [
    ['2026-12-18', 'FAKE AIRLINE BOOKING', '-420.00'],
    ['2026-12-24', 'PAYMENT THANK YOU', '500.00'],
    ['2027-01-03', 'MADE UP BOOKS', '-32.99'],
  ]);
  assert.equal(res.meta.signFrom, 'marks');
  assert.equal(res.meta.signUnknown, false);
});

test('no column header: the running balance decides money in or out, starting from the opening balance', () => {
  const res = parse(S.noHeaderStyle);
  assert.deepEqual(brief(res), [
    ['2026-11-05', 'IMAGINARY SUPERMARKET', '-45.00', '955.00'],
    ['2026-11-06', 'REFUND FAKE STORE', '15.00', '970.00'],
    ['2026-11-09', 'MADEUP GYM', '-60.00', '910.00'],
  ]);
  assert.equal(res.meta.signFrom, 'balance');
});

test('withdrawals/deposits headings, years on each date, and amounts on the second line of a transaction', () => {
  const res = parse(S.anzStyle);
  assert.deepEqual(brief(res), [
    ['2026-10-02', 'VISA DEBIT PURCHASE CARD 0000 PRETEND PETROL STATION', '-88.40', '1911.60'],
    ['2026-10-03', 'PAY/SALARY FROM EXAMPLE CO', '1250.00', '3161.60'],
  ]);
});

test('unsigned amounts with no balance are left for the user to decide', () => {
  const layout = { pages: [[
    [740, [40, 'Date'], [100, 'Description'], [-540, 'Amount']],
    [725, [40, '01/10/2026'], [100, 'SHOP ONE'], [-540, '10.00']],
    [710, [40, '02/10/2026'], [100, 'SHOP TWO'], [-540, '20.00']],
  ]] };
  const res = parse(layout);
  assert.deepEqual(res.rows.map((r) => r.Amount), ['10.00', '20.00']);
  assert.equal(res.meta.signUnknown, true);
});

test('pieces of one line are grouped by height and joined into cells by gap', () => {
  const lines = P.groupLines([
    { page: 1, str: 'Madeup', x: 100, y: 700, w: 28, h: 9 },
    { page: 1, str: 'Cafe', x: 130.5, y: 700.6, w: 18, h: 9 },
    { page: 1, str: '6.50', x: 340, y: 700, w: 20, h: 9 },
    { page: 1, str: 'next line', x: 100, y: 688, w: 40, h: 9 },
  ]);
  assert.equal(lines.length, 2);
  assert.deepEqual([...lines[0].cells.map((c) => c.text)], ['Madeup Cafe', '6.50']);
});

test('amounts are peeled off the end of a cell, with CR/DR and $ kept', () => {
  const p = P.peelMoney({ x0: 0, x1: 200, text: 'EFTPOS COLES 0123 $12.50 CR' });
  assert.equal(p.text, 'EFTPOS COLES 0123');
  assert.deepEqual([...p.money.map((m) => m.str)], ['$12.50 CR']);
  // Card numbers and references aren't amounts: no cents
  assert.equal(P.peelMoney({ x0: 0, x1: 100, text: 'CARD 1234' }).money.length, 0);
});

test('dates at the start of a line', () => {
  const d = (s) => { const r = P.dateAtStart(s); return r && [r.d, r.m, r.y].map(String); };
  assert.deepEqual(d('02/10/26 SHOP'), ['02', '10', '2026']);
  assert.deepEqual(d('4 Oct SHOP'), ['4', '10', 'null']);
  assert.deepEqual(d('02 OCT 2026 SHOP'), ['02', '10', '2026']);
  assert.deepEqual(d('Oct 4, 2026 SHOP'), ['4', '10', '2026']);
  assert.equal(P.dateAtStart('1234 Example St'), null);
  assert.equal(P.dateAtStart('October update'), null);
});

test('the year for a yearless date comes from the statement period', () => {
  const period = { start: '2026-12-15', end: '2027-01-14' };
  assert.equal(P.withYear(12, 20, period), '2026-12-20');
  assert.equal(P.withYear(1, 5, period), '2027-01-05');
  // Only a statement date: the latest matching date on or before it
  assert.equal(P.withYear(11, 30, { start: null, end: '2026-11-15' }), '2025-11-30');
  assert.equal(P.withYear(11, 2, { start: null, end: '2026-11-15' }), '2026-11-02');
});

test('header cells', () => {
  assert.equal(P.headerKind('Transaction date'), 'date');
  assert.equal(P.headerKind('Transaction Details'), 'desc');
  assert.equal(P.headerKind('Withdrawals ($)'), 'debit');
  assert.equal(P.headerKind('Deposits ($)'), 'credit');
  assert.equal(P.headerKind('Balance ($)'), 'balance');
  assert.equal(P.headerKind('Amount (AUD)'), 'amount');
});

test('a description line starting with a street number isn\'t a date', () => {
  assert.equal(P.dateAtStart('2 MARKET ST SYDNEY'), null);
  assert.equal(P.dateAtStart('5 JUNCTION RD'), null);
  assert.ok(P.dateAtStart('4 March 2026 SHOP'));
  const res = parse({ pages: [[
    [740, [40, 'Date'], [100, 'Transaction'], [-360, 'Debit'], [-440, 'Credit'], [-540, 'Balance']],
    [725, [40, '01/10/2026'], [100, 'MADEUP BAKERY'], [-360, '9.00'], [-540, '91.00']],
    [714, [100, '2 MARKET ST SYDNEY']],
  ]] });
  assert.deepEqual(brief(res), [['2026-10-01', 'MADEUP BAKERY 2 MARKET ST SYDNEY', '-9.00', '91.00']]);
});

test('CR written straight after the amount ("500.00CR") still marks money in', () => {
  const res = parse({ pages: [[
    [785, [40, 'Statement period 15 Dec 2026 to 14 Jan 2027']],
    [740, [40, 'Date'], [100, 'Transaction details'], [-540, 'Amount']],
    [725, [40, '18 Dec'], [100, 'FAKE SHOP'], [-540, '20.00']],
    [710, [40, '24 Dec'], [100, 'PAYMENT THANK YOU'], [-540, '500.00CR']],
  ]] });
  assert.deepEqual(res.rows.map((r) => r.Amount), ['-20.00', '500.00']);
});

test('without a column header, a dated summary line doesn\'t take the next line\'s amount', () => {
  const res = parse({ pages: [[
    [800, [40, '01/10/2026 - 31/10/2026']],
    [785, [40, 'Interest earned'], [-540, '0.50']],
    [745, [40, '05 Oct'], [100, 'IMAGINARY SUPERMARKET'], [-440, '45.00'], [-540, '955.00']],
  ]] });
  assert.deepEqual(res.rows.map((r) => r.Description), ['IMAGINARY SUPERMARKET']);
});

test('a reference like "12-34" on a transaction line isn\'t the statement period', () => {
  const lines = P.groupLines(S.toItems({ pages: [[
    [725, [40, '01/10/2025 TRANSFER REF 12-34 value 02/10/2025']],
  ]] }));
  assert.equal(P.statementPeriod(lines, '2026-11-15').start, null);
});
