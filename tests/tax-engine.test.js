// Unit tests for the Tax (Beta) rules and engine: js/tax/rules.js + js/tax/engine.js.
// Vectors come from section 10 of the Tax (Beta) spec v4, plus the ATO 31 March agent
// band found in Phase 0.5. All people and amounts here are made up.
// Run: node --test "tests/**/*.test.js"
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadEngine() {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const file of ['js/tax/rules.js', 'js/tax/engine.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  }
  return ctx;
}
const T = loadEngine();
const plain = (x) => JSON.parse(JSON.stringify(x));

// Lodgement config helper: one person's records keyed by FY
const cfg = (person, recs) => ({ perPerson: { [person]: { lodgement: recs } } });

// ── Tax scales ──────────────────────────────────────────────────
test('2025–26 resident scale', () => {
  assert.equal(T.calcResidentTax(18200, 'FY2026'), 0);
  assert.equal(T.calcResidentTax(45000, 'FY2026'), 4288);
  assert.equal(T.calcResidentTax(135000, 'FY2026'), 31288);
  assert.equal(T.calcResidentTax(190000, 'FY2026'), 51638);
});

test('2026–27 resident scale (15% second bracket)', () => {
  assert.equal(T.calcResidentTax(45000, 'FY2027'), 4020);
  assert.equal(T.calcResidentTax(135000, 'FY2027'), 31020);
  assert.equal(T.calcResidentTax(190000, 'FY2027'), 51370);
});

test('unknown FY returns null rather than guessing', () => {
  assert.equal(T.calcResidentTax(100000, 'FY2030'), null);
  assert.equal(T.calcMedicare(100000, 'FY2030'), null);
});

test('standard deduction only from 2026–27', () => {
  assert.equal(T.TAX_RULES.FY2026.standardDeduction, 0);
  assert.equal(T.TAX_RULES.FY2027.standardDeduction, 1000);
});

// ── ESS ─────────────────────────────────────────────────────────
test('Q12 label B', () => {
  assert.equal(T.essTaxableAmount({ D: 0, E: 0, F: 151900 }).B, 151900);
  assert.equal(T.essTaxableAmount({ D: 3000, incomeTest: 180000 }).B, 2000);
  assert.equal(T.essTaxableAmount({ D: 3000, incomeTest: 180001 }).B, 3000);
  assert.equal(T.essTaxableAmount({ D: 800, F: 10000, incomeTest: 90000 }).B, 10000);
});

test('vest value and cost base', () => {
  assert.deepEqual(plain(T.essVestValue(100, 500, 1.55)), { taxable: 77500, costBasePerUnit: 775 });
});

test('30-day rule: sale within 30 days moves the taxing point', () => {
  const r = T.applyThirtyDayRule('2025-08-15', '2025-09-10');
  assert.equal(r.taxingPoint, '2025-09-10');
  assert.equal(r.shifted, true);
  assert.equal(r.fy, 'FY2026');
  assert.equal(r.movedFy, false);
});

test('30-day rule: shift across 30 June moves the vest into the next FY', () => {
  const r = T.applyThirtyDayRule('2026-06-15', '2026-07-05');
  assert.equal(r.taxingPoint, '2026-07-05');
  assert.equal(r.fy, 'FY2027');
  assert.equal(r.movedFy, true);
});

test('30-day rule: 31 days does not apply, and is flagged as a boundary case', () => {
  const r = T.applyThirtyDayRule('2025-08-15', '2025-09-15');
  assert.equal(r.daysToSale, 31);
  assert.equal(r.taxingPoint, '2025-08-15');
  assert.equal(r.shifted, false);
  assert.equal(r.boundary, true);
});

test('30-day rule: exactly 30 days is treated as inside but flagged (pending verification)', () => {
  const r = T.applyThirtyDayRule('2025-08-15', '2025-09-14');
  assert.equal(r.daysToSale, 30);
  assert.equal(r.shifted, true);
  assert.equal(r.boundary, true);
});

test('30-day rule: no sale leaves the vest date', () => {
  const r = T.applyThirtyDayRule('2025-08-15', '');
  assert.equal(r.taxingPoint, '2025-08-15');
  assert.equal(r.shifted, false);
});

test('vest tax estimate', () => {
  assert.deepEqual(plain(T.estimateVestTax(212400, 77500, 'FY2026')),
    { taxDiff: 34875, medicare: 1550, total: 36425 });
});

// ── Lodgement dates ─────────────────────────────────────────────
test('self-lodge FY2025–26: 31 Oct (Saturday), payment estimate 21 days later', () => {
  const d = T.lodgementDates('FY2026', 'self');
  assert.equal(d.lodgmentDue, '2026-10-31');
  assert.equal(d.paymentDue, '2026-11-21');
  assert.equal(d.paymentIsEstimate, true);
  assert.deepEqual(plain(T.taxWeekendNote('2026-10-31')), { day: 'Saturday', nextBusinessDay: '2026-11-02' });
});

test('agent, planned lodge 12 Feb 2027 → due 15 May, pay 21 Mar', () => {
  const d = T.lodgementDates('FY2026', 'agent', { plannedLodgeDate: '2027-02-12' });
  assert.equal(d.lodgmentDue, '2027-05-15');
  assert.equal(d.concessionDue, '2027-06-05');
  assert.equal(d.paymentDue, '2027-03-21');
});

test('agent, planned lodge 20 Feb 2027 → pay 21 Apr (ATO band verified)', () => {
  assert.equal(T.lodgementDates('FY2026', 'agent', { plannedLodgeDate: '2027-02-20' }).paymentDue, '2027-04-21');
  assert.equal(T.lodgementDates('FY2026', 'agent', { plannedLodgeDate: '2027-03-12' }).paymentDue, '2027-04-21');
});

test('agent, planned lodge 15 Mar 2027 → pay 5 Jun', () => {
  assert.equal(T.lodgementDates('FY2026', 'agent', { plannedLodgeDate: '2027-03-15' }).paymentDue, '2027-06-05');
});

test('agent, prior-year liability $20,000+ → due 31 Mar 2027, pay 21 Apr', () => {
  const d = T.lodgementDates('FY2026', 'agent', { priorLiabilityHigh: true, plannedLodgeDate: '2027-02-01' });
  assert.equal(d.lodgmentDue, '2027-03-31');
  assert.equal(d.paymentDue, '2027-04-21');
});

test('agent dates not yet published for 2026–27 come back empty, not guessed', () => {
  const d = T.lodgementDates('FY2027', 'agent');
  assert.equal(d.available, false);
  assert.equal(d.lodgmentDue, null);
  assert.equal(T.lodgementDates('FY2027', 'self').lodgmentDue, '2027-10-31');
});

test('agent after the cutoff, not engaged → warning', () => {
  const res = T.resolveLodgement(cfg('brenton', { FY2026: { lodgeMethod: 'agent' } }), 'brenton', 'FY2026');
  assert.equal(T.lodgementWarnings(res, '2026-11-01').filter((w) => w.kind === 'warn').length, 1);
  assert.equal(T.lodgementWarnings(res, '2026-10-31').filter((w) => w.kind === 'warn').length, 0);
  const engaged = T.resolveLodgement(cfg('brenton', { FY2026: { lodgeMethod: 'agent', engagedBeforeCutoff: true } }), 'brenton', 'FY2026');
  assert.equal(T.lodgementWarnings(engaged, '2026-11-01').filter((w) => w.kind === 'warn').length, 0);
});

test('toggle on then off: dates revert to self-lodge defaults unless edited', () => {
  const off = T.resolveLodgement(cfg('brenton', { FY2026: { lodgeMethod: 'self', plannedLodgeDate: '2027-02-12' } }), 'brenton', 'FY2026');
  assert.equal(off.lodgmentDue, '2026-10-31');
  const edited = T.resolveLodgement(cfg('brenton', { FY2026: {
    lodgeMethod: 'self', paymentDue: '2026-12-01', editedFields: ['paymentDue'] } }), 'brenton', 'FY2026');
  assert.equal(edited.paymentDue, '2026-12-01');
  assert.equal(edited.paymentEdited, true);
  assert.equal(edited.lodgmentDue, '2026-10-31');
});

test('no record at all → unsure', () => {
  const res = T.resolveLodgement({}, 'shelley', 'FY2026');
  assert.equal(res.lodgeMethod, 'unsure');
  assert.equal(res.lodgmentDue, '2026-10-31');
});

test('Brenton agent, Shelley self: each resolves separately', () => {
  const c = { perPerson: {
    brenton: { lodgement: { FY2026: { lodgeMethod: 'agent' } } },
    shelley: { lodgement: { FY2026: { lodgeMethod: 'self' } } } } };
  assert.equal(T.resolveLodgement(c, 'brenton', 'FY2026').lodgmentDue, '2027-05-15');
  assert.equal(T.resolveLodgement(c, 'shelley', 'FY2026').lodgmentDue, '2026-10-31');
});

test('unsure banner: 28 days before the cutoff on 3 Oct 2026', () => {
  const res = T.resolveLodgement(cfg('brenton', { FY2026: { lodgeMethod: 'unsure' } }), 'brenton', 'FY2026');
  assert.deepEqual(plain(T.unsureBanner(res, '2026-10-03')), { kind: 'pre', days: 28, cutoff: '2026-10-31' });
});

test('unsure banner: post-cutoff wording from 1 Nov 2026', () => {
  const res = T.resolveLodgement(cfg('brenton', { FY2026: { lodgeMethod: 'unsure' } }), 'brenton', 'FY2026');
  assert.equal(T.unsureBanner(res, '2026-11-01').kind, 'post');
});

test('unsure banner: dismissed stays hidden, but returns within 14 days of the self-lodge date', () => {
  const res = T.resolveLodgement(cfg('brenton', { FY2026: { lodgeMethod: 'unsure', bannerDismissed: true } }), 'brenton', 'FY2026');
  assert.equal(T.unsureBanner(res, '2026-10-03'), null);
  assert.equal(T.unsureBanner(res, '2026-10-20').kind, 'pre');
});

test('unsure banner: none for a FY whose agent cutoff is not published', () => {
  const res = T.resolveLodgement(cfg('brenton', { FY2027: { lodgeMethod: 'unsure' } }), 'brenton', 'FY2027');
  assert.equal(T.unsureBanner(res, '2026-10-04'), null);
});

test('carry forward: agent in 2025–26 → 2026–27 starts as agent with its own dates', () => {
  const c = cfg('brenton', { FY2026: { lodgeMethod: 'agent' } });
  const r = T.resolveLodgement(c, 'brenton', 'FY2027');
  assert.equal(r.lodgeMethod, 'agent');
  assert.equal(r.inherited, true);
  assert.equal(r.defaults.fy, 'FY2027');
});

test('carry forward: an edited payment date does not carry into the next FY', () => {
  const c = cfg('brenton', { FY2026: { lodgeMethod: 'self', paymentDue: '2026-12-01', editedFields: ['paymentDue'] } });
  const r = T.resolveLodgement(c, 'brenton', 'FY2027');
  assert.equal(r.paymentDue, '2027-11-21');
  assert.equal(r.paymentEdited, false);
});

// ── Instalments ─────────────────────────────────────────────────
test('2026–27 quarter due dates and weekend notes', () => {
  const q = plain(T.quarterDueDates('FY2027'));
  assert.deepEqual(q.map((x) => x.due), ['2026-10-28', '2027-02-28', '2027-04-28', '2027-07-28']);
  assert.equal(T.taxDayName('2026-10-28'), 'Wednesday');
  assert.equal(q[0].weekend, null);
  assert.deepEqual(q[1].weekend, { day: 'Sunday', nextBusinessDay: '2027-03-01' });
  assert.equal(T.taxDayName('2027-04-28'), 'Wednesday');
  assert.equal(T.taxDayName('2027-07-28'), 'Wednesday');
});

test('instalment statuses', () => {
  assert.equal(T.instalmentStatus('2026-10-28', 0, 6250, '2026-10-04'), 'upcoming');
  assert.equal(T.instalmentStatus('2026-10-28', 0, 6250, '2026-10-14'), 'due-soon');
  assert.equal(T.instalmentStatus('2026-10-28', 0, 6250, '2026-10-29'), 'overdue');
  assert.equal(T.instalmentStatus('2026-10-28', 6250, 6250, '2026-10-29'), 'paid');
  // Sunday due date: not overdue on the Monday it rolls to
  assert.equal(T.instalmentStatus('2027-02-28', 0, 6250, '2027-03-01'), 'due-soon');
  assert.equal(T.instalmentStatus('2027-02-28', 0, 6250, '2027-03-02'), 'overdue');
});

test('instalment year: amount method, one payment', () => {
  const y = plain(T.instalmentYear({ enrolled: true, method: 'amount', amount: 6250,
    payments: [{ id: 1, date: '2026-10-20', amount: 6250, q: 1 }] }, 'FY2027', '2026-10-21'));
  assert.deepEqual(y.map((q) => q.status), ['paid', 'upcoming', 'upcoming', 'upcoming']);
  assert.equal(y[1].expected, 6250);
});

test('instalment year: rate method uses quarter income', () => {
  const y = plain(T.instalmentYear({ method: 'rate', rate: 12.5, quarterIncome: { 1: 20000 } }, 'FY2027', '2026-10-04'));
  assert.equal(y[0].expected, 2500);
  assert.equal(y[1].expected, null);
});

// ── Dates ───────────────────────────────────────────────────────
test('FY helpers', () => {
  assert.equal(T.taxFyOf('2026-06-30'), 'FY2026');
  assert.equal(T.taxFyOf('2026-07-01'), 'FY2027');
  assert.equal(T.taxFyLabel('FY2026'), '2025–26');
  assert.equal(T.taxPrevFy('FY2027'), 'FY2026');
});

// ── Return worksheet (Phase 1b) ─────────────────────────────────
// Made-up people and amounts. The CGT vectors are the ATO's own worked example
// ("Kathleen", 2026 supplementary instructions, question 18).
test('Q18 net capital gain: ATO 2026 worked example', () => {
  const items = [{ gain: 3000, discount: true }, { gain: 520, discount: false }, { gain: -600, discount: false }];
  const r = plain(T.taxNetCapitalGain(items, 400));
  assert.equal(r.H, 3520);
  assert.equal(r.A, 1260);           // (3000 − 80 − 400) × 50%
  assert.equal(r.carryForward, 0);
});

test('Q18: losses beyond gains carry forward; no discount on other gains', () => {
  assert.deepEqual(plain(T.taxNetCapitalGain([{ gain: 1000, discount: true }, { gain: -1500 }], 200)),
    { H: 1000, A: 0, discount: 0, currentLosses: 1500, lossesCF: 200, carryForward: 700 });
  assert.equal(T.taxNetCapitalGain([{ gain: 800, discount: false }], 0).A, 800);
  assert.equal(T.taxNetCapitalGain([], 0).A, 0);
});

test('Q11 dividends: assessable is S + T + U', () => {
  assert.deepEqual(plain(T.taxDividends({ unfranked: 100, franked: 700, credits: 300, tfnWithheld: 0 })),
    { S: 100, T: 700, U: 300, V: 0, assessable: 1100 });
  assert.equal(T.taxDividends(null).assessable, 0);
  assert.equal(T.taxDividends({ franked: -50 }).T, 0);
});

const txs = [
  { id: 1, date: '2025-08-01', type: 'income', catId: 'interest', subcat: 'Savings Interest', amount: 40, person: 'brenton' },
  { id: 2, date: '2025-09-01', type: 'income', catId: 'interest', subcat: 'Term Deposit', amount: 100, person: 'joint' },
  { id: 3, date: '2025-10-01', type: 'income', catId: 'interest', subcat: 'Offset Interest', amount: 900, person: 'brenton' },
  { id: 4, date: '2025-11-01', type: 'income', catId: 'interest', amount: 25, person: 'shelley' },
  { id: 5, date: '2026-07-01', type: 'income', catId: 'interest', amount: 60, person: 'brenton' },       // next FY
  { id: 6, date: '2025-12-01', type: 'expense', catId: 'shopping', amount: 120, person: 'brenton',
    taxDeductible: true, taxLabel: 'D9', taxNote: 'Receipt in email' },
  { id: 7, date: '2026-01-10', type: 'expense', catId: 'other', amount: 80, person: 'brenton',
    taxDeductible: true, taxLabel: 'D5', taxPerson: 'shelley' },
  { id: 8, date: '2026-02-10', type: 'expense', catId: 'other', amount: 55, person: 'joint',
    taxDeductible: true, taxLabel: 'D10' },                                                            // no claimant
  { id: 9, date: '2026-03-10', type: 'expense', catId: 'other', amount: 30, person: 'brenton',
    taxDeductible: true, taxLabel: 'X1' },                                                             // bad label
  { id: 10, date: '2026-03-11', type: 'income', catId: 'other', amount: 30, person: 'brenton',
    taxDeductible: true, taxLabel: 'D5' },                                                             // refund
  { id: 11, date: '2026-04-01', type: 'expense', catId: 'other', amount: 70, person: 'brenton' }       // untagged
];

test('Q10 from interest transactions, joint at half, offset excluded', () => {
  const on = plain(T.taxInterestFromTx(txs, 'brenton', 'FY2026', true));
  assert.equal(on.own, 40);
  assert.equal(on.joint, 100);
  assert.equal(on.jointCounted, 50);
  assert.equal(on.total, 90);
  assert.deepEqual(on.excluded.map((t) => t.id), [3]);
  assert.equal(T.taxInterestFromTx(txs, 'brenton', 'FY2026', false).total, 40);
  assert.equal(T.taxInterestFromTx(txs, 'brenton', 'FY2027', true).total, 60);
  assert.equal(T.taxInterestFromTx(txs, 'shelley', 'FY2026', true).total, 75);
});

test('tax tag: label checked, claimant from taxPerson then person', () => {
  assert.deepEqual(plain(T.taxTxTag(txs[5])), { label: 'D9', person: 'brenton', note: 'Receipt in email' });
  assert.equal(T.taxTxTag(txs[6]).person, 'shelley');
  assert.equal(T.taxTxTag(txs[7]).person, null);
  assert.equal(T.taxTxTag(txs[8]), null);
  assert.equal(T.taxTxTag(txs[10]), null);
  assert.equal(T.taxTxTag({ taxDeductible: false, taxLabel: 'D5' }), null);
});

test('D1–D10 from tagged expenses only, per claimant', () => {
  const b = plain(T.taxDeductionsFromTx(txs, 'brenton', 'FY2026'));
  assert.equal(b.D9.total, 120);
  assert.equal(b.D5.total, 0);         // refund ignored; the D5 expense belongs to Shelley
  assert.equal(b.D10.total, 0);        // joint with no claimant isn't counted
  assert.equal(T.taxDeductionsFromTx(txs, 'shelley', 'FY2026').D5.total, 80);
  assert.equal(Object.keys(b).length, 10);
});

test('return: salary-only estimate, 2025–26', () => {
  const r = plain(T.taxBuildReturn({
    statements: [{ gross: 90000, withheld: 20000, super: 5000, rfba: 0 }, { gross: 10000, withheld: 2000 }],
    instalmentsPaid: 1000
  }, 'FY2026'));
  assert.equal(r.q1.gross, 100000);
  assert.equal(r.q1.count, 2);
  assert.equal(r.taxable, 100000);
  assert.equal(r.tax, 20788);           // 4,288 + 30% × 55,000
  assert.equal(r.medicare, 2000);
  assert.equal(r.credits.total, 23000);
  assert.equal(r.payable, -212);        // refund
});

test('return: all income lines, deductions, franking and FITO', () => {
  const r = plain(T.taxBuildReturn({
    statements: [{ gross: 120000, withheld: 30000 }],
    interest: 500,
    dividends: { unfranked: 100, franked: 700, credits: 300 },
    ess: { F: 10000 },
    deductions: { D5: 400, D9: 100.5 },
    cgt: { items: [{ gain: 2000, discount: true }], lossesCF: 0 },
    fito: 1500
  }, 'FY2026'));
  assert.equal(r.totalIncome, 120000 + 500 + 1100 + 10000 + 1000);
  assert.equal(r.deductions.total, 500.5);
  assert.equal(r.taxable, 132099);      // floor(132,600 − 500.50)
  assert.equal(r.offsets.franking, 300);
  assert.equal(r.offsets.fito, 1000);   // capped at the direct-claim limit
  assert.equal(r.offsets.fitoCapped, true);
  const tax = T.calcResidentTax(132099, 'FY2026'), med = T.calcMedicare(132099, 'FY2026');
  assert.equal(r.payable, Math.round((tax + med - 1000 - 300 - 30000) * 100) / 100);
});

test('return: ESS $1,000 reduction only when the income test answer is yes', () => {
  assert.equal(T.taxBuildReturn({ ess: { D: 3000, reductionTest: 'yes' } }, 'FY2026').q12.B, 2000);
  assert.equal(T.taxBuildReturn({ ess: { D: 3000, reductionTest: 'unsure' } }, 'FY2026').q12.B, 3000);
  assert.equal(T.taxBuildReturn({}, 'FY2099'), null);
});

test('readiness counts only sections that apply', () => {
  const r = plain(T.taxReadiness([
    { id: 'q1', label: 'Income statements', ready: true },
    { id: 'q10', label: 'Interest', ready: false },
    { id: 'inst', label: 'Instalments', ready: false, applies: false }
  ]));
  assert.equal(r.ready, 1);
  assert.equal(r.total, 2);
  assert.deepEqual(r.missing.map((m) => m.id), ['q10']);
});

test('CSV: quoting and formula guard', () => {
  assert.equal(T.taxCsv([['a', 1.5, null], ['=SUM(A1)', 'x,y', 'say "hi"'], ['-5', -5, '@x']]),
    'a,1.5,\r\n\'=SUM(A1),"x,y","say ""hi"""\r\n\'-5,-5,\'@x');
});

test('Q10: a record with only the category name still counts', () => {
  const r = T.taxInterestFromTx([{ date: '2025-08-01', type: 'income', category: 'Interest', amount: 12, person: 'brenton' },
    { date: '2025-08-02', type: 'income', category: 'Salary', amount: 99, person: 'brenton' }], 'brenton', 'FY2026', true);
  assert.equal(r.total, 12);
});
