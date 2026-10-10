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
// No banner for a FY whose agent cutoff the ATO hasn't published.
function unsureBanner(res, today) {
  if (res.lodgeMethod !== 'unsure') return null;
  var cut = res.defaults.agentListCutoff, selfDue = res.defaults.lodgmentDue;
  if (!cut) return null;
  var nearSelfDue = selfDue && taxDaysBetween(today, selfDue) >= 0 &&
                    taxDaysBetween(today, selfDue) <= TAX_RULES.common.unsureReminderDays;
  if (res.bannerDismissed && !nearSelfDue) return null;
  if (today <= cut) return { kind: 'pre', days: taxDaysBetween(today, cut), cutoff: cut };
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

// ── Return worksheet (Phase 1b) ─────────────────────────────────
function _taxR2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function _taxNum(n) { var x = Number(n); return isFinite(x) && x > 0 ? x : 0; }

// The deduction label for a transaction, or null when it isn't tagged.
// taxPerson is who claims it; older or joint records fall back to the transaction's person.
var _taxDedIds = null;
function taxTxTag(t) {
  if (!t || !t.taxDeductible) return null;
  if (!_taxDedIds) {
    _taxDedIds = {};
    TAX_RULES.returnRules.deductionLabels.forEach(function(l) { _taxDedIds[l.id] = true; });
  }
  if (!_taxDedIds[t.taxLabel]) return null;
  var who = t.taxPerson || t.person;
  return { label: t.taxLabel, person: who === 'brenton' || who === 'shelley' ? who : null, note: String(t.taxNote || '') };
}

function _taxInFy(d, fy) {
  var r = taxRulesFor(fy);
  return !!r && taxIsDate(d) && d >= r.start && d <= r.end;
}

// Q10 from transactions: income in the 'interest' category for one person in one FY.
// Joint interest counts at the equal share when includeJoint is on. Offset-account "interest"
// is listed but not counted (an offset reduces loan interest; it isn't paid to you).
function taxInterestFromTx(txs, person, fy, includeJoint) {
  var share = TAX_RULES.returnRules.jointEqualShare;
  var out = { total: 0, own: 0, joint: 0, jointCounted: 0, items: [], excluded: [] };
  (txs || []).forEach(function(t) {
    if (!t || t.type !== 'income' || !_taxInFy(t.date, fy)) return;
    // Older records may carry only the category name (the app resolves catId || category)
    if (t.catId ? t.catId !== 'interest' : String(t.category || '').trim().toLowerCase() !== 'interest') return;
    var amt = _taxNum(t.amount);
    if (/offset/i.test(t.subcat || '')) { out.excluded.push(t); return; }
    if (t.person === person) { out.own += amt; out.items.push(t); }
    else if (t.person === 'joint' || !t.person) { out.joint += amt; if (includeJoint) out.items.push(t); }
  });
  out.jointCounted = includeJoint ? _taxR2(out.joint * share) : 0;
  out.own = _taxR2(out.own); out.joint = _taxR2(out.joint);
  out.total = _taxR2(out.own + out.jointCounted);
  return out;
}

// D1–D10 from tagged transactions: { D1: { total, items } ... } for one person in one FY.
// Only expenses count; refunds tagged by mistake are ignored.
function taxDeductionsFromTx(txs, person, fy) {
  var out = {};
  TAX_RULES.returnRules.deductionLabels.forEach(function(l) { out[l.id] = { total: 0, items: [] }; });
  (txs || []).forEach(function(t) {
    var tag = taxTxTag(t);
    if (!tag || tag.person !== person || t.type !== 'expense' || !_taxInFy(t.date, fy)) return;
    out[tag.label].total = _taxR2(out[tag.label].total + _taxNum(t.amount));
    out[tag.label].items.push(t);
  });
  return out;
}

// Q18: net capital gain from a year's gains and losses (ATO 2026 instructions, steps 4–10).
// items: [{ gain, discount }] — gain < 0 is a loss; discount = held 12 months or more.
// Losses come off 'other' gains first, then discount gains; then the discount applies.
function taxNetCapitalGain(items, lossesCF) {
  var rate = TAX_RULES.returnRules.cgtDiscountIndividual;
  var other = 0, disc = 0, loss = 0;
  (items || []).forEach(function(x) {
    var g = Number(x.gain) || 0;
    if (g < 0) loss += -g;
    else if (x.discount) disc += g;
    else other += g;
  });
  var H = _taxR2(other + disc);
  function apply(amount) {
    var a = Math.min(amount, other); other -= a; amount -= a;
    var b = Math.min(amount, disc); disc -= b; amount -= b;
    return amount;
  }
  var lossLeft = apply(loss);
  var cfLeft = apply(_taxNum(lossesCF));
  var discount = _taxR2(disc * rate);
  return {
    H: H, A: _taxR2(other + disc - discount), discount: discount,
    currentLosses: _taxR2(loss), lossesCF: _taxR2(_taxNum(lossesCF)),
    carryForward: _taxR2(lossLeft + cfLeft)
  };
}

// Q11 labels from what the user entered. S unfranked, T franked, U franking credits,
// V TFN amounts withheld. Assessable dividend income is S + T + U.
function taxDividends(d) {
  d = d || {};
  var S = _taxR2(_taxNum(d.unfranked)), T = _taxR2(_taxNum(d.franked)),
      U = _taxR2(_taxNum(d.credits)), V = _taxR2(_taxNum(d.tfnWithheld));
  return { S: S, T: T, U: U, V: V, assessable: _taxR2(S + T + U) };
}

// One person's return for one FY. Every input is already gathered for that person:
// { statements:[{gross,withheld,super,rfba}], interest, dividends:{...}, ess:{D,E,F,reductionTest},
//   deductions:{D1..D10}, cgt:{items,lossesCF}, fito, instalmentsPaid }
// Returns income lines, taxable income, tax, Medicare, credits and the estimated
// amount payable (negative = refund). Offsets beyond franking credits and the foreign income
// tax offset aren't modelled.
function taxBuildReturn(inp, fy) {
  if (!taxRulesFor(fy)) return null;
  inp = inp || {};
  var st = inp.statements || [];
  var q1 = { gross: 0, withheld: 0, super: 0, rfba: 0, count: st.length };
  st.forEach(function(s) {
    q1.gross += _taxNum(s.gross); q1.withheld += _taxNum(s.withheld);
    q1.super += _taxNum(s.super); q1.rfba += _taxNum(s.rfba);
  });
  ['gross', 'withheld', 'super', 'rfba'].forEach(function(k) { q1[k] = _taxR2(q1[k]); });

  var q10 = _taxR2(_taxNum(inp.interest));
  var q11 = taxDividends(inp.dividends);
  var e = inp.ess || {};
  var q12 = essTaxableAmount({ D: e.D, E: e.E, F: e.F, incomeTest: e.reductionTest === 'yes' ? 0 : Infinity });
  var cgt = taxNetCapitalGain((inp.cgt && inp.cgt.items) || [], inp.cgt && inp.cgt.lossesCF);

  var ded = { total: 0, byLabel: {} };
  TAX_RULES.returnRules.deductionLabels.forEach(function(l) {
    var v = _taxR2(_taxNum(inp.deductions && inp.deductions[l.id]));
    ded.byLabel[l.id] = v; ded.total += v;
  });
  ded.total = _taxR2(ded.total);

  var totalIncome = _taxR2(q1.gross + q10 + q11.assessable + q12.B + cgt.A);
  var taxable = Math.max(0, Math.floor(totalIncome - ded.total));
  var tax = calcResidentTax(taxable, fy);
  var medicare = calcMedicare(taxable, fy);
  var gross = _taxR2(tax + medicare);

  var fitoCap = TAX_RULES.returnRules.fitoDirectLimit;
  var fitoIn = _taxR2(_taxNum(inp.fito));
  var fito = _taxR2(Math.min(fitoIn, fitoCap, tax));   // non-refundable: never below zero tax
  var franking = q11.U;
  var instalments = _taxR2(_taxNum(inp.instalmentsPaid));
  var credits = _taxR2(q1.withheld + q11.V + instalments);
  var payable = _taxR2(gross - fito - franking - credits);

  return {
    fy: fy, q1: q1, q10: q10, q11: q11, q12: q12, cgt: cgt, deductions: ded,
    totalIncome: totalIncome, taxable: taxable, tax: tax, medicare: medicare, grossTax: gross,
    offsets: { franking: franking, fito: fito, fitoEntered: fitoIn, fitoCapped: fitoIn > fito },
    credits: { withheld: q1.withheld, tfn: q11.V, instalments: instalments, total: credits },
    payable: payable
  };
}

// Readiness: which worksheet sections are done. sections: [{ id, label, ready, applies }].
// Sections that don't apply (say, instalments when not enrolled) are left out of the count.
function taxReadiness(sections) {
  var list = (sections || []).filter(function(s) { return s.applies !== false; });
  var missing = list.filter(function(s) { return !s.ready; });
  return { ready: list.length - missing.length, total: list.length, missing: missing };
}

// CSV text from rows of cells. Text cells starting with = + - @ (or a tab/CR) get a leading
// apostrophe so a spreadsheet can't run them as formulas; numbers stay numbers.
function taxCsv(rows) {
  return (rows || []).map(function(r) {
    return r.map(function(c) {
      if (c === null || c === undefined) return '';
      if (typeof c === 'number') return isFinite(c) ? String(c) : '';
      var s = String(c);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\n\r]/.test(s) || s !== s.trim() ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',');
  }).join('\r\n');
}

// ── Share awards (Phase 2a) ─────────────────────────────────────
// One RSU vest's ESS income, split by taxing point.
// v: { date, units, price, ccy: 'USD'|'AUD', audPerUsd, saleDate, saleUnits, saleProceedsAud, foreignTax }
// Units sold within 30 days after the vest are taxed at the sale date, valued at the sale
// proceeds (TAX_RULES.common.essSaleValueIsProceeds, unverified); the rest stay at the vest
// date and value. Each part is one CGT parcel with its own cost base per unit.
function taxVestEval(v) {
  v = v || {};
  var units = _taxNum(v.units);
  var rate = v.ccy === 'AUD' ? 1 : _taxNum(v.audPerUsd);
  var val = essVestValue(units, v.price, rate);
  var out = { units: units, rate: rate, valuePerUnit: val.costBasePerUnit, value: val.taxable,
              parts: [], shifted: false, movedFy: false, boundary: false, daysToSale: null,
              foreignTax: _taxR2(_taxNum(v.foreignTax)), complete: units > 0 && _taxNum(v.price) > 0 && rate > 0 };
  var sale = taxIsDate(v.saleDate) && taxIsDate(v.date) ? applyThirtyDayRule(v.date, v.saleDate) : null;
  var sold = 0;
  if (sale) {
    sold = Math.min(units, _taxNum(v.saleUnits) || units);
    out.daysToSale = sale.daysToSale;
    out.boundary = sale.boundary;
  }
  if (sale && sale.shifted && sold > 0) {
    var proceeds = _taxR2(_taxNum(v.saleProceedsAud));
    if (units - sold > 0) {
      out.parts.push({ date: v.date, fy: taxFyOf(v.date), units: units - sold, shifted: false,
                       amount: _taxR2((units - sold) * val.costBasePerUnit), costBasePerUnit: val.costBasePerUnit });
    }
    out.parts.push({ date: sale.taxingPoint, fy: sale.fy, units: sold, shifted: true, amount: proceeds,
                     costBasePerUnit: sold ? _taxR2(proceeds / sold) : 0 });
    out.shifted = true;
    out.movedFy = sale.movedFy;
  } else if (taxIsDate(v.date)) {
    out.parts.push({ date: v.date, fy: taxFyOf(v.date), units: units, shifted: false,
                     amount: val.taxable, costBasePerUnit: val.costBasePerUnit });
  }
  return out;
}

// Q12 label F for one FY from a person's vests: { F, parts:[{vest, part, eval}], foreignTax, count }.
// A vest whose income moved out of this FY under the 30-day rule contributes nothing here.
function taxEssFromVests(vests, fy) {
  var out = { F: 0, parts: [], foreignTax: 0, count: 0 };
  (vests || []).forEach(function(v) {
    var ev = taxVestEval(v);
    var mine = ev.parts.filter(function(p) { return p.fy === fy; });
    if (mine.length) out.count++;
    mine.forEach(function(p) { out.F = _taxR2(out.F + p.amount); out.parts.push({ vest: v, part: p, eval: ev }); });
    // Foreign tax belongs to the FY the vest was taxed in (its first part)
    if (ev.parts.length && ev.parts[0].fy === fy) out.foreignTax = _taxR2(out.foreignTax + ev.foreignTax);
  });
  out.parts.sort(function(a, b) { return a.part.date < b.part.date ? -1 : a.part.date > b.part.date ? 1 : 0; });
  return out;
}

// Tax to set aside for each ESS amount in date order: each one adds incrementally on top of the
// base income and the amounts before it. amounts: [{ amount, ... }]. Returns the same list with
// setAside added, and the total.
function taxVestSetAside(amounts, baseIncome, fy) {
  var running = _taxNum(baseIncome), total = 0;
  var list = (amounts || []).map(function(a) {
    var est = estimateVestTax(running, _taxNum(a.amount), fy);
    running += _taxNum(a.amount);
    var setAside = est ? est.total : null;
    if (setAside !== null) total += setAside;
    var o = {}; for (var k in a) o[k] = a[k];
    o.setAside = setAside;
    return o;
  });
  return { list: list, total: _taxR2(total) };
}
