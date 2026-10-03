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
