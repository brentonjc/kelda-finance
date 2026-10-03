// ═══════════════════════════════════════════════════════════════
//  tax/engine.js — Tax (Beta) calculations
// ───────────────────────────────────────────────────────────────
//  Pure functions: no DOM, no storage, no globals other than TAX_RULES
//  (rules.js). Every function takes the date it should treat as "today"
//  as an argument, so results are reproducible and testable.
//
//  Estimates only. Nothing here decides eligibility; it applies the
//  rules in rules.js to the figures the user enters.
// ═══════════════════════════════════════════════════════════════

// ── Dates ('YYYY-MM-DD', calendar days, timezone-free) ──────────
var TAX_DAY_MS = 86400000;
var TAX_DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function _taxMs(d) {
  var p = String(d || '').split('-');
  return Date.UTC(+p[0], +p[1] - 1, +p[2]);
}
function _taxIso(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
function taxIsDate(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !isNaN(_taxMs(d));
}
// Whole days from a to b (b later → positive)
function taxDaysBetween(a, b) {
  return Math.round((_taxMs(b) - _taxMs(a)) / TAX_DAY_MS);
}
function taxAddDays(d, n) {
  return _taxIso(_taxMs(d) + n * TAX_DAY_MS);
}
function taxDayName(d) {
  return TAX_DOW[new Date(_taxMs(d)).getUTCDay()];
}
// Next Monday–Friday on or after d. Public holidays are not modelled.
function taxNextBusinessDay(d) {
  var dow = new Date(_taxMs(d)).getUTCDay();
  if (dow === 6) return taxAddDays(d, 2);
  if (dow === 0) return taxAddDays(d, 1);
  return d;
}
// For a due date on a weekend: { day, nextBusinessDay }; otherwise null.
// The ATO-stated date stays the date shown; this is the note beside it.
function taxWeekendNote(d) {
  if (!taxIsDate(d)) return null;
  var next = taxNextBusinessDay(d);
  return next === d ? null : { day: taxDayName(d), nextBusinessDay: next };
}
// Today in the device's local time zone (the app's today() is UTC, which is a day behind
// in Australia every morning).
function taxToday(now) {
  var t = now || new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}

// ── Financial years ─────────────────────────────────────────────
// 'FY2026' = 1 Jul 2025 – 30 Jun 2026
function taxFyOf(d) {
  var y = +String(d).slice(0, 4), m = +String(d).slice(5, 7);
  return 'FY' + (m >= 7 ? y + 1 : y);
}
function taxPrevFy(fy) { return 'FY' + (+fy.slice(2) - 1); }
function taxFyLabel(fy) {
  var y = +fy.slice(2);
  return (y - 1) + '–' + String(y).slice(2);
}
function taxRulesFor(fy) {
  return (typeof TAX_RULES !== 'undefined' && TAX_RULES[fy]) || null;
}

// ── Income tax ──────────────────────────────────────────────────
// Resident tax on taxable income for one person. Whole dollars, no offsets.
function calcResidentTax(income, fy) {
  var r = taxRulesFor(fy);
  if (!r) return null;
  var x = Math.max(0, Math.floor(Number(income) || 0));
  var tax = 0, b = r.brackets;
  for (var i = 0; i < b.length; i++) {
    var top = i + 1 < b.length ? b[i + 1].from : Infinity;
    if (x > b[i].from) tax += (Math.min(x, top) - b[i].from) * b[i].rate;
  }
  return Math.round(tax * 100) / 100;
}

// Base Medicare levy only (2%). Low-income reduction and the surcharge are not modelled,
// so callers must show this as flagged.
function calcMedicare(income, fy) {
  if (!taxRulesFor(fy)) return null;
  var x = Math.max(0, Number(income) || 0);
  return Math.round(x * TAX_RULES.common.medicareRate * 100) / 100;
}

// ── Employee share schemes ──────────────────────────────────────
// Q12 label B from labels D, E, F. The $1,000 reduction applies to D only, and only
// when the income test total is at or under the threshold.
function essTaxableAmount(labels) {
  var c = TAX_RULES.common.essReduction;
  var D = Math.max(0, Number(labels.D) || 0);
  var E = Math.max(0, Number(labels.E) || 0);
  var F = Math.max(0, Number(labels.F) || 0);
  var test = Number(labels.incomeTest) || 0;
  var reduction = test <= c.incomeTestMax ? Math.min(D, c.amount) : 0;
  return { B: D - reduction + E + F, reduction: reduction };
}

// Market value of one vest in AUD, and the CGT cost base per unit.
function essVestValue(units, priceUsd, audPerUsd) {
  var u = Number(units) || 0, p = Number(priceUsd) || 0, r = Number(audPerUsd) || 0;
  var perUnit = Math.round(p * r * 100) / 100;
  return { taxable: Math.round(u * p * r * 100) / 100, costBasePerUnit: perUnit };
}

// 30-day rule (ITAA 1997 s 83A-115(3)): a disposal within 30 days after the deferred
// taxing point becomes the taxing point, which can move the income into the next FY.
// `boundary` flags day 30 and day 31, where the treatment is not confirmed.
function applyThirtyDayRule(taxingPoint, saleDate) {
  var out = { taxingPoint: taxingPoint, shifted: false, daysToSale: null, boundary: false };
  if (taxIsDate(saleDate)) {
    var days = taxDaysBetween(taxingPoint, saleDate);
    out.daysToSale = days;
    var limit = TAX_RULES.common.essThirtyDays;
    if (days >= 0 && days <= limit) { out.taxingPoint = saleDate; out.shifted = days > 0; }
    out.boundary = !TAX_RULES.common.essThirtyDayBoundaryVerified && (days === limit || days === limit + 1);
  }
  out.fy = taxFyOf(out.taxingPoint);
  out.movedFy = out.fy !== taxFyOf(taxingPoint);
  return out;
}

// Extra tax caused by one vest: tax(base + vest) − tax(base), plus 2% Medicare on the vest.
function estimateVestTax(baseIncome, vestValue, fy) {
  var base = Number(baseIncome) || 0, vest = Number(vestValue) || 0;
  var t1 = calcResidentTax(base + vest, fy), t0 = calcResidentTax(base, fy);
  if (t1 === null) return null;
  var diff = Math.round((t1 - t0) * 100) / 100;
  var med = calcMedicare(vest, fy);
  return { taxDiff: diff, medicare: med, total: Math.round((diff + med) * 100) / 100 };
}

// ── Lodgement ───────────────────────────────────────────────────
// Default dates for one person's return. method: 'self' | 'agent' | 'unsure'.
// opts: { plannedLodgeDate, priorLiabilityHigh }
// Returns null dates (with available:false) where the ATO has not published them.
function lodgementDates(fy, method, opts) {
  opts = opts || {};
  var r = taxRulesFor(fy);
  var L = r && r.lodgement;
  var out = { fy: fy, method: method, lodgmentDue: null, paymentDue: null, paymentIsEstimate: true,
              paymentBasis: '', concessionDue: null, agentListCutoff: null, available: false,
              verified: !!(L && L.verified) };
  if (!L) return out;
  out.agentListCutoff = L.agentListCutoff;

  if (method !== 'agent') {
    out.lodgmentDue = L.selfDue;
    out.paymentDue = taxAddDays(L.selfDue, L.selfPaymentDaysAfterDue);
    out.paymentBasis = L.selfPaymentDaysAfterDue + ' days after the due date. Your notice of assessment is the final word.';
    out.available = true;
    return out;
  }

  if (opts.priorLiabilityHigh) {
    if (!L.agentPriorLiabilityDue) return out;
    out.lodgmentDue = L.agentPriorLiabilityDue;
    out.paymentDue = taxAddDays(L.agentPriorLiabilityDue, L.otherPaymentDaysAfterDue);
    out.paymentBasis = 'The later of ' + L.otherPaymentDaysAfterDue + ' days after the due date, or 7 business days after your notice of assessment issues.';
    out.available = true;
    return out;
  }

  if (!L.agentDue) return out;
  out.lodgmentDue = L.agentDue;
  out.concessionDue = L.agentConcessionDue;
  var planned = taxIsDate(opts.plannedLodgeDate) ? opts.plannedLodgeDate : null;
  var bands = L.agentPaymentBands || [];
  var band = bands[bands.length - 1];
  if (planned) {
    for (var i = 0; i < bands.length; i++) {
      if (bands[i].to === null || planned <= bands[i].to) { band = bands[i]; break; }
    }
  }
  out.paymentDue = band ? band.pay : null;
  out.paymentIsEstimate = true;
  out.paymentBasis = planned
    ? 'Latest payment date for a return lodged ' + planned + '. Allow at least 2 weeks for processing.'
    : 'Latest payment date if you lodge after the earlier bands. Set a planned lodge date to refine it.';
  out.available = true;
  return out;
}

// One person's lodgement settings for one FY, with defaults filled in.
// cfg is K.taxcfg. Stored dates win only when listed in editedFields. A FY with no record
// inherits lodgeMethod from the latest earlier FY that has one; edited dates never carry.
function resolveLodgement(cfg, person, fy) {
  var pp = (cfg && cfg.perPerson && cfg.perPerson[person]) || {};
  var all = pp.lodgement || {};
  var rec = all[fy] || null;
  var method = rec && rec.lodgeMethod, inherited = false;
  if (!method) {
    var keys = Object.keys(all).filter(function(k) { return k < fy && all[k] && all[k].lodgeMethod; }).sort();
    if (keys.length) { method = all[keys[keys.length - 1]].lodgeMethod; inherited = true; }
  }
  if (method !== 'self' && method !== 'agent') method = 'unsure';
  rec = rec || {};
  var edited = Array.isArray(rec.editedFields) ? rec.editedFields : [];
  var d = lodgementDates(fy, method, { plannedLodgeDate: rec.plannedLodgeDate, priorLiabilityHigh: !!rec.priorLiabilityHigh });
  function pick(f) { return edited.indexOf(f) !== -1 && taxIsDate(rec[f]) ? rec[f] : d[f]; }
  return {
    person: person, fy: fy, lodgeMethod: method, viaAgent: method === 'agent', inherited: inherited,
    agentName: rec.agentName || '', engagedBeforeCutoff: !!rec.engagedBeforeCutoff,
    priorLiabilityHigh: !!rec.priorLiabilityHigh,
    plannedLodgeDate: taxIsDate(rec.plannedLodgeDate) ? rec.plannedLodgeDate : '',
    lodgmentDue: pick('lodgmentDue'), paymentDue: pick('paymentDue'),
    lodgmentEdited: edited.indexOf('lodgmentDue') !== -1, paymentEdited: edited.indexOf('paymentDue') !== -1,
    defaults: d, bannerDismissed: !!rec.bannerDismissed
  };
}

// Warnings for a resolved lodgement record as of `today`. Each: { kind, text }.
function lodgementWarnings(res, today) {
  var out = [], cut = res.defaults.agentListCutoff;
  if (res.lodgeMethod === 'agent') {
    if (!res.defaults.available) out.push({ kind: 'info', text: 'The ATO has not published agent due dates for ' + taxFyLabel(res.fy) + ' yet.' });
    if (cut && !res.engagedBeforeCutoff && today > cut)
      out.push({ kind: 'warn', text: 'The later agent date usually only applies if your agent had you on their client list by ' + cut + '. Check with your agent.' });
  }
  return out;
}

// Banner for 'unsure': before the agent cutoff, a countdown; after it, a prompt to choose.
// Dismissal is per FY, but it comes back within 14 days of the self-lodge date.
function unsureBanner(res, today) {
  if (res.lodgeMethod !== 'unsure') return null;
  var cut = res.defaults.agentListCutoff, selfDue = res.defaults.lodgmentDue;
  var nearSelfDue = selfDue && taxDaysBetween(today, selfDue) >= 0 &&
                    taxDaysBetween(today, selfDue) <= TAX_RULES.common.unsureReminderDays;
  if (res.bannerDismissed && !nearSelfDue) return null;
  if (cut && today <= cut) return { kind: 'pre', days: taxDaysBetween(today, cut), cutoff: cut };
  return { kind: 'post', cutoff: cut };
}

// ── PAYG instalments ────────────────────────────────────────────
function quarterDueDates(fy) {
  var r = taxRulesFor(fy);
  if (!r) return [];
  return r.instalments.map(function(q) {
    return { q: q.q, period: q.period, due: q.due, weekend: taxWeekendNote(q.due) };
  });
}

// Status of one quarter. paid: total paid against it. Overdue counts from the next
// business day after a weekend due date (the ATO's general rule).
function instalmentStatus(due, paid, expected, today) {
  if ((Number(paid) || 0) > 0 && (Number(paid) || 0) >= (Number(expected) || 0) - 0.005) return 'paid';
  var lastDay = taxNextBusinessDay(due);
  if (today > lastDay) return 'overdue';
  if (taxDaysBetween(today, due) <= TAX_RULES.common.instalmentDueSoonDays) return 'due-soon';
  return 'upcoming';
}

// One person's instalment year: quarters with expected amount, paid and status.
// inst: { enrolled, method: 'amount'|'rate', amount, rate, quarterIncome: {1..4}, payments: [{id,date,amount,q}] }
function instalmentYear(inst, fy, today) {
  inst = inst || {};
  var pays = Array.isArray(inst.payments) ? inst.payments : [];
  return quarterDueDates(fy).map(function(q) {
    var expected = null;
    if (inst.method === 'amount') expected = Number(inst.amount) || 0;
    else if (inst.method === 'rate') {
      var qi = inst.quarterIncome && Number(inst.quarterIncome[q.q]);
      expected = qi ? Math.round(qi * (Number(inst.rate) || 0) / 100 * 100) / 100 : null;
    }
    var paid = pays.filter(function(p) { return p.q === q.q; })
                   .reduce(function(s, p) { return s + (Number(p.amount) || 0); }, 0);
    return { q: q.q, period: q.period, due: q.due, weekend: q.weekend, expected: expected,
             paid: Math.round(paid * 100) / 100,
             status: instalmentStatus(q.due, paid, expected === null ? Infinity : expected, today) };
  });
}
