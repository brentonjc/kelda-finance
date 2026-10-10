// ═══════════════════════════════════════════════════════════════
//  pages/tax.js — Tax (Beta) page, opt-in and sheets
// ───────────────────────────────────────────────────────────────
//  Off until the household opts in (K.taxcfg.betaEnabled). Kelda can't
//  lodge: everything here is an estimate or a worksheet. Calculations
//  live in js/tax/engine.js; rates and dates in js/tax/rules.js.
//
//  Phase 1a: beta opt-in, page shell, person/FY switchers, lodgement
//  (first-run choice, chip, settings, unsure banner) and PAYG instalments.
//  Phase 1b: income statements, Return worksheet with detail sheets,
//  estimate and readiness on Overview, Household columns, exports and
//  the agent pack, and the tax deduction tag on transactions.
// ═══════════════════════════════════════════════════════════════

var TAX_PEOPLE = ['brenton', 'shelley'];
var TAX_TABS = [
  { id: 'overview',    label: 'Overview' },
  { id: 'return',      label: 'Return' },
  { id: 'share',       label: 'Share awards' },
  { id: 'instalments', label: 'Instalments' },
  { id: 'cgt',         label: 'Capital gains' }
];
var TAX_METHOD_LABEL = { self: 'Self', agent: 'Tax agent', unsure: 'Not sure' };
var TAX_STATUS = {
  'paid':     { text: 'Paid',     cls: 'b-paid' },
  'due-soon': { text: 'Due soon', cls: 'b-due' },
  'overdue':  { text: 'Overdue',  cls: 'b-overdue' },
  'upcoming': { text: 'Upcoming', cls: 'tax-b-info' }
};
var TAX_ATO_INSTALMENTS_URL = 'https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/payg-instalments';

var taxUi = { person: null, fy: null, tab: 'overview' };
var _TAX_BOX = '<span class="tax-box" aria-hidden="true"><i class="ti ti-check"></i></span>';
var _taxFirstRunQueue = [];

// ── Storage ─────────────────────────────────────────────────────
function taxCfg() {
  var c = load(K.taxcfg) || {};
  if (!c.perPerson || typeof c.perPerson !== 'object') c.perPerson = {};
  if (typeof c.includeTaxInNetWorth !== 'boolean') c.includeTaxInNetWorth = true;
  return c;
}
function taxEnabled() {
  var c = load(K.taxcfg);
  return !!(c && c.betaEnabled);
}
function _taxPerson(c, person) {
  var p = c.perPerson[person];
  if (!p || typeof p !== 'object') p = c.perPerson[person] = {};
  if (!p.lodgement || typeof p.lodgement !== 'object') p.lodgement = {};
  return p;
}
function _taxInstAll() {
  var all = load(K.taxinst);
  return all && typeof all === 'object' ? all : {};
}
function _taxInst(fy, person) {
  var all = _taxInstAll();
  return (all[fy] && all[fy][person]) || { enrolled: false, method: 'amount', amount: 0, rate: 0, quarterIncome: {}, payments: [] };
}
function _taxSaveInst(fy, person, rec) {
  var all = _taxInstAll();
  if (!all[fy]) all[fy] = {};
  all[fy][person] = rec;
  save(K.taxinst, all);
}

// ── Formatting ──────────────────────────────────────────────────
function taxFmtDate(d, withYear) {
  if (!taxIsDate(d)) return '—';
  var o = { day: 'numeric', month: 'short', timeZone: 'UTC' };
  if (withYear !== false) o.year = 'numeric';
  return new Date(_taxMs(d)).toLocaleDateString('en-AU', o);
}
function _taxMoney(n) { return '<span class="tax-mono">' + esc(fmt(n)) + '</span>'; }
function _taxDays(today, d) {
  var n = taxDaysBetween(today, d);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n > 0) return n + ' days';
  return Math.abs(n) + (n === -1 ? ' day ago' : ' days ago');
}
function _taxWeekendLine(d) {
  var w = taxWeekendNote(d);
  if (!w) return '';
  return '<div class="tax-note">Falls on a ' + esc(w.day) + '. The ATO generally accepts the next business day, ' +
         esc(taxFmtDate(w.nextBusinessDay)) + '.</div>';
}
function _taxName(person) {
  return person === 'household' ? 'Household' : (typeof getUserName === 'function' ? getUserName(person) : person);
}
function _taxBadge(text, cls) { return '<span class="badge ' + cls + '">' + esc(text) + '</span>'; }

// ── Navigation visibility ───────────────────────────────────────
function taxSyncNav() {
  var on = taxEnabled();
  ['n-tax', 'mob-tax'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('tax-nav-off', !on);
  });
}

// ── Defaults ────────────────────────────────────────────────────
// The FY being lodged: the most recent FY that has ended, else the first one known.
function taxDefaultFy(today) {
  var done = TAX_FYS.filter(function(fy) { return TAX_RULES[fy].end < today; });
  return done.length ? done[done.length - 1] : TAX_FYS[0];
}
function _taxInitUi() {
  var today = taxToday();
  if (!taxUi.fy || TAX_FYS.indexOf(taxUi.fy) === -1) taxUi.fy = taxDefaultFy(today);
  if (!taxUi.person) {
    var ap = typeof activeProfile !== 'undefined' ? activeProfile : 'brenton';
    taxUi.person = TAX_PEOPLE.indexOf(ap) !== -1 ? ap : 'household';
  }
}

// ── Page ────────────────────────────────────────────────────────
function renderTaxPage() {
  var el = document.getElementById('page-tax');
  if (!el) return;
  if (!taxEnabled()) {
    el.innerHTML = '<div class="page-title">Tax</div><div class="card"><div class="empty"><p>Tax (Beta) is off. Turn it on in Settings › Beta features.</p>' +
      '<button class="btn btn-primary" onclick="go(\'settings\')">Open Settings</button></div></div>';
    return;
  }
  _taxInitUi();
  var today = taxToday();
  var c = taxCfg();
  var p = taxUi.person, fy = taxUi.fy;

  var h = '<div class="page-title tax-ttl">Tax <span class="tax-beta">Beta</span></div>';
  h += '<div class="page-sub">Estimates only. Not tax advice. Kelda can\'t lodge your return.</div>';

  // Switchers
  h += '<div class="tax-switches">';
  h += '<label class="tax-switch-fld"><span class="tax-sr">Person</span><select id="tax-person" aria-label="Person" onchange="taxSetPerson(this.value)">';
  TAX_PEOPLE.concat(['household']).forEach(function(id) {
    h += '<option value="' + id + '"' + (id === p ? ' selected' : '') + '>' + esc(_taxName(id)) + '</option>';
  });
  h += '</select></label>';
  h += '<label class="tax-switch-fld"><span class="tax-sr">Financial year</span><select id="tax-fy" aria-label="Financial year" onchange="taxSetFy(this.value)">';
  TAX_FYS.forEach(function(id) {
    h += '<option value="' + id + '"' + (id === fy ? ' selected' : '') + '>FY ' + esc(taxFyLabel(id)) + '</option>';
  });
  h += '</select></label>';
  h += '</div>';

  // Lodgement chip(s) and banner
  if (p !== 'household') {
    var res = resolveLodgement(c, p, fy);
    h += '<div class="tax-chips">' + _taxChip(res) + '</div>';
    h += _taxBannerHtml(res, today);
  }

  // Segmented control
  h += '<div class="tax-seg" role="tablist" aria-label="Tax sections" onkeydown="taxSegKey(event)">';
  TAX_TABS.forEach(function(t) {
    var on = t.id === taxUi.tab;
    h += '<button class="tax-seg-btn' + (on ? ' on' : '') + '" role="tab" id="tax-tab-' + t.id + '" aria-selected="' + on +
         '" aria-controls="tax-panel" tabindex="' + (on ? '0' : '-1') + '" onclick="taxSetTab(\'' + t.id + '\')">' + esc(t.label) + '</button>';
  });
  h += '</div>';

  h += '<div id="tax-panel" role="tabpanel" aria-labelledby="tax-tab-' + taxUi.tab + '">';
  if (taxUi.tab === 'overview') h += p === 'household' ? _taxHouseholdHtml(c, fy, today) : _taxOverviewHtml(c, p, fy, today);
  else if (taxUi.tab === 'instalments') h += _taxInstalmentsHtml(p, fy, today);
  else if (taxUi.tab === 'return') h += _taxReturnHtml(p, fy, today);
  else h += _taxLaterHtml(taxUi.tab);
  h += '</div>';

  h += _taxRulesBadge(fy);
  el.innerHTML = h;

  _taxMaybeFirstRun();
}

function taxSetPerson(v) { taxUi.person = v; renderTaxPage(); }
// Locking closes any sheet, drops the printable copy and forgets the person, year and tab,
// so the next sign-in opens on that profile's own Overview
function taxOnLock() {
  taxCloseSheet();
  var pr = document.getElementById('tax-print');
  if (pr) pr.innerHTML = '';
  document.body.classList.remove('tax-printing');
  taxUi = { person: null, fy: null, tab: 'overview' };
}
function taxSetFy(v) { taxUi.fy = v; renderTaxPage(); }
function taxSetTab(id) {
  taxUi.tab = id;
  renderTaxPage();
  var b = document.getElementById('tax-tab-' + id);
  if (b) b.focus();
}
// Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern)
function taxSegKey(e) {
  var ids = TAX_TABS.map(function(t) { return t.id; });
  var i = ids.indexOf(taxUi.tab), n = null;
  if (e.key === 'ArrowRight') n = (i + 1) % ids.length;
  else if (e.key === 'ArrowLeft') n = (i - 1 + ids.length) % ids.length;
  else if (e.key === 'Home') n = 0;
  else if (e.key === 'End') n = ids.length - 1;
  if (n === null) return;
  e.preventDefault();
  taxSetTab(ids[n]);
}

function _taxChip(res) {
  return '<button class="tax-chip" onclick="taxOpenLodgement(\'' + res.person + '\')" aria-label="Lodging: ' +
         esc(TAX_METHOD_LABEL[res.lodgeMethod]) + '. Change lodgement settings for ' + esc(_taxName(res.person)) + '">' +
         'Lodging: ' + esc(TAX_METHOD_LABEL[res.lodgeMethod]) + ' <i class="ti ti-chevron-right" aria-hidden="true"></i></button>';
}

function _taxBannerHtml(res, today) {
  var b = unsureBanner(res, today);
  if (!b) return '';
  var msg = b.kind === 'pre'
    ? 'If you plan to use a tax agent, they generally need you on their client list by <b>' + esc(taxFmtDate(b.cutoff)) +
      '</b> (<span class="tax-mono">' + b.days + '</span> ' + (b.days === 1 ? 'day' : 'days') + '). This date doesn\'t move to the next business day.'
    : 'The later agent date may no longer be available. Choose how you lodge.';
  return '<div class="tax-warnbox" role="status"><div class="tax-warn-msg"><b>Heads up:</b> ' + msg + '</div>' +
         '<div class="tax-warn-acts"><button class="btn btn-sm btn-primary" onclick="taxOpenLodgement(\'' + res.person + '\')">Choose how you lodge</button>' +
         '<button class="btn btn-sm btn-ghost" onclick="taxDismissBanner(\'' + res.person + '\')">Dismiss</button></div></div>';
}

function taxDismissBanner(person) {
  var c = taxCfg(), pp = _taxPerson(c, person);
  var rec = pp.lodgement[taxUi.fy] || (pp.lodgement[taxUi.fy] = {});
  if (!rec.lodgeMethod) rec.lodgeMethod = resolveLodgement(c, person, taxUi.fy).lodgeMethod;
  rec.bannerDismissed = true;
  save(K.taxcfg, c);
  renderTaxPage();
}

// ── Overview ────────────────────────────────────────────────────
// The next unpaid instalment across every FY the person is enrolled in.
function _taxNextInstalment(person, today) {
  var best = null;
  TAX_FYS.forEach(function(fy) {
    var inst = _taxInst(fy, person);
    if (!inst.enrolled) return;
    instalmentYear(inst, fy, today).forEach(function(q) {
      if (q.status === 'paid') return;
      if (q.status !== 'overdue' && taxDaysBetween(today, q.due) < 0) return;
      if (!best || q.due < best.due) { best = q; best.fy = fy; }
    });
  });
  return best;
}

function _taxComingUpRows(res, person, today) {
  var rows = '';
  var q = _taxNextInstalment(person, today);
  if (q) {
    var st = TAX_STATUS[q.status];
    rows += '<div class="dr"><span class="dr-k">Q' + q.q + ' PAYG instalment <span class="tax-k-sub">FY ' + esc(taxFyLabel(q.fy)) + '</span>' + _taxWeekendLine(q.due) + '</span>' +
            '<span class="dr-v"><span class="tax-mono">' + esc(taxFmtDate(q.due)) + '</span> ' + _taxBadge(st.text + ' · ' + _taxDays(today, q.due), st.cls) + '</span></div>';
  }
  var cut = res.defaults.agentListCutoff;
  if (res.lodgeMethod !== 'self' && cut && today <= cut && !res.engagedBeforeCutoff) {
    rows += '<div class="dr"><span class="dr-k">Agent client-list cutoff<span class="tax-note">Not extended to the next business day.</span></span>' +
            '<span class="dr-v"><span class="tax-mono">' + esc(taxFmtDate(cut)) + '</span> ' + _taxBadge(_taxDays(today, cut), 'b-due') + '</span></div>';
  }
  if (res.lodgmentDue) {
    var route = res.lodgeMethod === 'agent' ? 'agent dates' : 'self-lodge dates';
    rows += '<div class="dr"><span class="dr-k">Lodgment due <span class="tax-k-sub">' + route + (res.lodgmentEdited ? ' · edited' : '') + '</span>' + _taxWeekendLine(res.lodgmentDue) + '</span>' +
            '<span class="dr-v"><span class="tax-mono">' + esc(taxFmtDate(res.lodgmentDue)) + '</span> ' +
            _taxBadge(_taxDays(today, res.lodgmentDue), taxDaysBetween(today, res.lodgmentDue) < 0 ? 'b-overdue' : 'tax-b-info') + '</span></div>';
  }
  if (res.paymentDue) {
    rows += '<div class="dr"><span class="dr-k">Tax payment due, if you owe <span class="tax-k-sub">' + (res.paymentEdited ? 'Edited' : 'Estimate') + '</span>' + _taxWeekendLine(res.paymentDue) + '</span>' +
            '<span class="dr-v"><span class="tax-mono">' + esc(taxFmtDate(res.paymentDue)) + '</span></span></div>';
  }
  if (!res.defaults.available) {
    rows += '<div class="dr"><span class="dr-k">Lodgment due</span><span class="dr-v">' + _taxBadge('Not published yet', 'tax-b-info') + '</span></div>';
  }
  return rows || '<div class="empty empty--compact"><p>Nothing due yet.</p></div>';
}

function _taxOverviewHtml(c, person, fy, today) {
  var res = resolveLodgement(c, person, fy);
  var ws = _taxWorksheet(person, fy, today);
  var h = _taxEstimateCard(ws);

  h += '<div class="card mb"><div class="section-label">Coming up</div>' + _taxComingUpRows(res, person, today) + '</div>';
  h += _taxReadinessCard(ws);

  lodgementWarnings(res, today).forEach(function(w) {
    h += '<div class="' + (w.kind === 'warn' ? 'tax-warnbox' : 'tax-infobox') + '">' + esc(w.text) + '</div>';
  });

  h += _taxNotModelledHtml();
  return h;
}

function _taxNotModelledHtml() {
  return '<details class="tax-infobox tax-details"><summary>Some things aren\'t modelled yet</summary>' +
    '<ul class="tax-list">' +
    '<li>Low income tax offset, seniors and pensioners tax offset</li>' +
    '<li>Medicare levy low-income reduction and the Medicare levy surcharge (Kelda uses the flat 2% levy)</li>' +
    '<li>HELP and other study loan repayments</li>' +
    '<li>Business income, GST and BAS</li>' +
    '<li>Capital gains under the rules that start 1 July 2027</li>' +
    '</ul><p class="tax-desc">Public holidays aren\'t counted when a date moves to the next business day.</p></details>';
}

// ── Household ───────────────────────────────────────────────────
function _taxHouseholdHtml(c, fy, today) {
  var cols = TAX_PEOPLE.map(function(p) {
    var ws = _taxWorksheet(p, fy, today);
    return { p: p, ws: ws, res: ws.res, r: ws.ret, next: _taxNextInstalment(p, today) };
  });
  var h = '<div class="card mb"><table class="tax-cmp"><caption class="tax-sr">Each return side by side, FY ' + esc(taxFyLabel(fy)) + '. Estimates.</caption>';
  h += '<thead><tr><th scope="col"><span class="tax-sr">Item</span></th>';
  cols.forEach(function(x) { h += '<th scope="col">' + esc(_taxName(x.p)) + '</th>'; });
  h += '</tr></thead><tbody>';
  function row(label, fn, cls) {
    h += '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th scope="row">' + label + '</th>';
    cols.forEach(function(x) { h += '<td>' + fn(x) + '</td>'; });
    h += '</tr>';
  }
  row('Taxable income', function(x) { return _taxMoney(x.r.taxable); });
  row('Tax and Medicare', function(x) { return _taxMoney(x.r.grossTax); });
  row('Withheld', function(x) { return _taxMoney(x.r.credits.withheld); });
  row('Instalments paid', function(x) { return _taxMoney(x.r.credits.instalments); });
  row('Est. payable <span class="tax-k-sub">Estimated</span>', function(x) {
    return x.r.payable < 0 ? '<span class="tax-mono">' + esc(fmt(-x.r.payable)) + '</span><span class="tax-note">refund</span>' : _taxMoney(x.r.payable);
  }, 'tax-cmp-key');
  row('Lodgment', function(x) {
    return esc(TAX_METHOD_LABEL[x.res.lodgeMethod]) + (x.res.lodgmentDue ? ' · <span class="tax-mono">' + esc(taxFmtDate(x.res.lodgmentDue, false)) + '</span>' : '');
  });
  row('Lodging', function(x) { return _taxChip(x.res); });
  row('Payment due', function(x) { return x.res.paymentDue ? '<span class="tax-mono">' + esc(taxFmtDate(x.res.paymentDue)) + '</span>' : '—'; });
  row('Next instalment', function(x) { return x.next ? '<span class="tax-mono">' + esc(taxFmtDate(x.next.due)) + '</span>' : '—'; });
  row('Return ready', function(x) { return '<span class="tax-mono">' + x.ws.ready.ready + '/' + x.ws.ready.total + '</span>'; });
  h += '</tbody></table></div>';

  // Planning roll-up: a sum of each person's own estimate, never a combined tax calculation
  var setAside = cols.reduce(function(s, x) { return s + Math.max(0, x.r.payable); }, 0);
  h += '<div class="card mb"><div class="section-label">Cash to set aside, both returns</div>';
  h += '<div class="tax-big"><span class="tax-mono">' + esc(fmt(setAside)) + '</span> ' + _taxBadge('Planning sum', 'tax-b-info') + '</div>';
  h += '<p class="tax-desc">Adds each person\'s estimated amount to pay; a refund counts as zero. It\'s a balance for planning, not a tax figure: each person lodges and pays separately.</p></div>';
  h += '<div class="tax-infobox">Kelda never adds two people\'s income into one tax calculation.</div>';
  cols.forEach(function(x) { h += _taxBannerHtml(x.res, today).replace('<b>Heads up:</b>', '<b>' + esc(_taxName(x.p)) + ':</b>'); });
  h += _taxNotModelledHtml();
  return h;
}

// ── Instalments ─────────────────────────────────────────────────
function _taxInstalmentsHtml(person, fy, today) {
  if (person === 'household') {
    return '<div class="card"><div class="empty"><p>Instalments are set up for each person.</p>' +
      '<div class="tax-btn-row">' + TAX_PEOPLE.map(function(p) {
        return '<button class="btn btn-ghost" onclick="taxSetPerson(\'' + p + '\')">' + esc(_taxName(p)) + '</button>';
      }).join('') + '</div></div></div>';
  }
  var inst = _taxInst(fy, person);
  var h = '';
  var curFy = taxFyOf(today);
  if (fy !== curFy && TAX_FYS.indexOf(curFy) !== -1) {
    h += '<div class="tax-infobox tax-flex">Showing FY ' + esc(taxFyLabel(fy)) + '. ' +
         '<button class="btn btn-sm btn-ghost" onclick="taxSetFy(\'' + curFy + '\')">Show FY ' + esc(taxFyLabel(curFy)) + '</button></div>';
  }

  h += '<div class="card mb">';
  h += _taxSwitchRow('tax-inst-enrolled', 'I pay PAYG instalments', 'Turn on if the ATO sends ' + esc(_taxName(person)) + ' instalment notices.', inst.enrolled,
                     'taxInstToggle(\'' + person + '\')');
  if (inst.enrolled) {
    h += '<fieldset class="tax-fieldset"><legend class="tax-legend">Method, from your ATO notice</legend><div class="tax-opts tax-opts--2">';
    [['amount', 'Instalment amount', 'A set amount each quarter'], ['rate', 'Instalment rate', 'A % of each quarter\'s instalment income']].forEach(function(m) {
      h += '<label class="tax-opt"><input type="radio" name="tax-inst-method" value="' + m[0] + '"' + (inst.method === m[0] ? ' checked' : '') +
           ' onchange="taxInstSet(\'' + person + '\',\'method\',this.value)"><span class="tax-opt-t">' + m[1] + '</span><span class="tax-opt-s">' + m[2] + '</span></label>';
    });
    h += '</div></fieldset>';
    if (inst.method === 'rate') {
      h += '<div class="form-grid"><div><label class="lbl" for="tax-inst-rate">Instalment rate (%)</label>' +
           '<input id="tax-inst-rate" type="number" inputmode="decimal" step="0.01" min="0" max="100" value="' + (Number(inst.rate) || '') + '" onchange="taxInstSet(\'' + person + '\',\'rate\',this.value)"></div></div>';
      h += '<div class="form-grid">';
      quarterDueDates(fy).forEach(function(q) {
        var v = inst.quarterIncome && inst.quarterIncome[q.q];
        h += '<div><label class="lbl" for="tax-qi-' + q.q + '">Q' + q.q + ' instalment income</label>' +
             '<input id="tax-qi-' + q.q + '" type="number" inputmode="decimal" step="0.01" min="0" value="' + (Number(v) || '') + '" onchange="taxInstSetQi(\'' + person + '\',' + q.q + ',this.value)"></div>';
      });
      h += '</div>';
    } else {
      h += '<div class="form-grid"><div><label class="lbl" for="tax-inst-amount">Amount each quarter ($)</label>' +
           '<input id="tax-inst-amount" type="number" inputmode="decimal" step="0.01" min="0" value="' + (Number(inst.amount) || '') + '" onchange="taxInstSet(\'' + person + '\',\'amount\',this.value)"></div></div>';
    }
  }
  h += '</div>';

  if (!inst.enrolled) {
    h += '<div class="tax-infobox">Enter the figures from your ATO notice. Kelda tracks due dates and payments; it doesn\'t work out a variation.</div>';
    return h;
  }

  var yr = instalmentYear(inst, fy, today);
  h += '<div class="card mb"><div class="section-label">Quarters · FY ' + esc(taxFyLabel(fy)) + '</div>';
  yr.forEach(function(q) {
    var st = TAX_STATUS[q.status];
    var next = q.status !== 'paid' && yr.filter(function(x) { return x.status !== 'paid'; })[0] === q;
    h += '<div class="tax-q">';
    h += '<div class="tax-qn' + (q.status === 'paid' ? ' done' : next ? ' next' : '') + '" aria-hidden="true">Q' + q.q + '</div>';
    h += '<div class="tax-q-main"><b>' + esc(q.period) + '</b><span class="tax-mono tax-q-due">Due ' + esc(taxFmtDate(q.due)) + '</span>' + _taxWeekendLine(q.due) + '</div>';
    h += '<div class="tax-q-end"><div class="tax-q-amt">' + (q.expected === null ? '<span class="tax-muted">—</span>' : _taxMoney(q.expected)) +
         (q.paid > 0 && q.status !== 'paid' ? '<span class="tax-note">Paid ' + esc(fmt(q.paid)) + '</span>' : '') + '</div>';
    h += _taxBadge(st.text, st.cls) + '</div>';
    h += '</div>';
  });
  h += '</div>';

  // Payments
  var pays = (inst.payments || []).slice().sort(function(a, b) { return a.date < b.date ? -1 : 1; });
  h += '<div class="card mb"><div class="section-label">Payments recorded</div>';
  if (!pays.length) h += '<div class="empty empty--compact"><p>No payments yet. Record one when you pay the ATO.</p></div>';
  pays.forEach(function(pm) {
    h += '<div class="dr"><span class="dr-k">Q' + pm.q + ' · <span class="tax-mono">' + esc(taxFmtDate(pm.date)) + '</span></span>' +
         '<span class="dr-v">' + _taxMoney(pm.amount) + ' <button class="tax-icon-btn" aria-label="Delete payment of ' + esc(fmt(pm.amount)) + ' on ' + esc(taxFmtDate(pm.date)) + '" onclick="taxInstDelPay(\'' + person + '\',' + JSON.stringify(String(pm.id)).replace(/"/g, '&quot;') + ')"><i class="ti ti-trash" aria-hidden="true"></i></button></span></div>';
  });
  h += '<button class="btn btn-primary tax-full" onclick="taxOpenPayment(\'' + person + '\')"><i class="ti ti-plus" aria-hidden="true"></i> Record a payment</button>';
  h += '</div>';

  h += '<div class="tax-infobox">If your own estimate is well above or below the ATO\'s instalments, the ATO lets you vary them. Kelda doesn\'t work out a variation or the interest on one. ' +
       '<a href="' + TAX_ATO_INSTALMENTS_URL + '" target="_blank" rel="noopener noreferrer">PAYG instalments on ato.gov.au</a></div>';
  return h;
}

function _taxSwitchRow(id, label, sub, on, onclick) {
  return '<div class="tax-sw-row"><div class="tax-sw-txt"><span class="tax-sw-lbl" id="' + id + '-lbl">' + label + '</span>' +
         (sub ? '<span class="tax-sw-sub">' + sub + '</span>' : '') + '</div>' +
         '<button class="tax-sw" role="switch" id="' + id + '" aria-checked="' + !!on + '" aria-labelledby="' + id + '-lbl" onclick="' + onclick + '"><span class="tax-sw-thumb"></span></button></div>';
}

function taxInstToggle(person) {
  var inst = _taxInst(taxUi.fy, person);
  inst.enrolled = !inst.enrolled;
  if (!inst.method) inst.method = 'amount';
  _taxSaveInst(taxUi.fy, person, inst);
  renderTaxPage();
  var b = document.getElementById('tax-inst-enrolled'); if (b) b.focus();
}
function taxInstSet(person, field, value) {
  var inst = _taxInst(taxUi.fy, person);
  if (field === 'method') inst.method = value === 'rate' ? 'rate' : 'amount';
  else {
    var n = parseFloat(value);
    if (isNaN(n) || n < 0) { toast('Enter a number of 0 or more', 2400, 'warn'); return; }
    if (field === 'rate' && n > 100) { toast('The rate is a percentage, 0 to 100', 2400, 'warn'); return; }
    inst[field] = Math.round(n * 100) / 100;
  }
  _taxSaveInst(taxUi.fy, person, inst);
  renderTaxPage();
}
function taxInstSetQi(person, q, value) {
  var inst = _taxInst(taxUi.fy, person);
  var n = parseFloat(value);
  if (!inst.quarterIncome) inst.quarterIncome = {};
  if (isNaN(n) || n <= 0) delete inst.quarterIncome[q];
  else inst.quarterIncome[q] = Math.round(n * 100) / 100;
  _taxSaveInst(taxUi.fy, person, inst);
  renderTaxPage();
}
function taxInstDelPay(person, id) {
  var inst = _taxInst(taxUi.fy, person);
  var pm = (inst.payments || []).find(function(x) { return String(x.id) === String(id); });
  if (!pm || !confirm('Delete the ' + fmt(pm.amount) + ' payment for Q' + pm.q + '?')) return;
  inst.payments = inst.payments.filter(function(x) { return x !== pm; });
  _taxSaveInst(taxUi.fy, person, inst);
  toast('Payment deleted', 2400, 'info');
  renderTaxPage();
}

function taxOpenPayment(person) {
  var fy = taxUi.fy, today = taxToday();
  var inst = _taxInst(fy, person);
  var yr = instalmentYear(inst, fy, today);
  var first = yr.filter(function(q) { return q.status !== 'paid'; })[0] || yr[0];
  var h = '<div class="modal-header"><div class="modal-title" id="tax-sheet-title">Record a payment</div>' + _taxCloseBtn() + '</div>';
  h += '<p class="modal-sub">' + esc(_taxName(person)) + ' · FY ' + esc(taxFyLabel(fy)) + '</p>';
  h += '<div class="form-grid"><div><label class="lbl" for="tax-pay-q">Quarter</label><select id="tax-pay-q">';
  yr.forEach(function(q) {
    h += '<option value="' + q.q + '"' + (q === first ? ' selected' : '') + '>Q' + q.q + ' · ' + esc(q.period) + ' · due ' + esc(taxFmtDate(q.due, false)) + '</option>';
  });
  h += '</select></div></div>';
  h += '<div class="form-grid"><div><label class="lbl" for="tax-pay-date">Date paid</label><input id="tax-pay-date" type="date" value="' + today + '" max="' + today + '"></div>';
  var amt = first && first.expected ? Math.max(0, first.expected - first.paid) : '';
  h += '<div><label class="lbl" for="tax-pay-amt">Amount ($)</label><input id="tax-pay-amt" type="number" inputmode="decimal" step="0.01" min="0.01" value="' + (amt || '') + '"></div></div>';
  h += '<p class="tax-desc">Use the amount that left your account. Check it against ATO online services before you lodge.</p>';
  h += '<div class="modal-actions"><button class="btn btn-ghost" onclick="taxCloseSheet()">Cancel</button><button class="btn btn-primary" onclick="taxSavePayment(\'' + person + '\')">Save payment</button></div>';
  taxOpenSheet(h);
}
function taxSavePayment(person) {
  var q = parseInt(document.getElementById('tax-pay-q').value, 10);
  var date = document.getElementById('tax-pay-date').value;
  var amt = parseFloat(document.getElementById('tax-pay-amt').value);
  if (!taxIsDate(date)) { toast('Enter the date you paid', 2400, 'warn'); return; }
  if (date > taxToday()) { toast('The payment date can\'t be in the future', 2400, 'warn'); return; }
  if (!(amt > 0)) { toast('Enter the amount you paid', 2400, 'warn'); return; }
  var inst = _taxInst(taxUi.fy, person);
  if (!Array.isArray(inst.payments)) inst.payments = [];
  inst.payments.push({ id: Date.now(), date: date, amount: Math.round(amt * 100) / 100, q: q });
  _taxSaveInst(taxUi.fy, person, inst);
  renderTaxPage();
  taxCloseSheet();
  toast('Payment recorded', 2400, 'success');
}

// ── Return worksheet data (K.taxinc) ────────────────────────────
// { FY: { person: { statements:[{id,employer,gross,withheld,super,rfba}], deductions:[{id,label,desc,amount}],
//   interest:{override,includeJoint}, dividends:{unfranked,franked,credits,tfnWithheld},
//   ess:{D,E,F,reductionTest}, cgt:{lossesCF,includeJoint}, offsets:{fito}, checks:{id:true}, done:{section:true} } } }
var TAX_INC_OBJS = ['interest', 'dividends', 'ess', 'cgt', 'offsets', 'checks', 'done'];
// Fields the worksheet sheets may write: path → 'num' (0 or more), 'bool', or a list of allowed values
var TAX_INC_FIELDS = {
  'interest.override': 'num', 'interest.includeJoint': 'bool',
  'dividends.unfranked': 'num', 'dividends.franked': 'num', 'dividends.credits': 'num', 'dividends.tfnWithheld': 'num',
  'ess.D': 'num', 'ess.E': 'num', 'ess.F': 'num', 'ess.reductionTest': ['yes', 'no', 'unsure'],
  'cgt.lossesCF': 'num', 'cgt.includeJoint': 'bool', 'offsets.fito': 'num',
  'done.q1': 'bool', 'done.q10': 'bool', 'done.q11': 'bool', 'done.q12': 'bool', 'done.ded': 'bool', 'done.cgt': 'bool',
  'checks.lito': 'bool', 'checks.mlr': 'bool', 'checks.mls': 'bool', 'checks.phi': 'bool', 'checks.help': 'bool', 'checks.fito': 'bool'
};
// Offsets and Medicare items Kelda doesn't calculate. Each one is ticked once the user has checked it.
var TAX_CHECKS = [
  { id: 'lito', label: 'Low income tax offset', sub: 'Not modelled. The ATO works it out from your return.' },
  { id: 'mlr',  label: 'Medicare levy reduction or exemption', sub: 'Not modelled. Kelda uses the flat 2% levy.' },
  { id: 'mls',  label: 'Medicare levy surcharge and private hospital cover', sub: 'Not modelled. Check your private health insurance statement.' },
  { id: 'phi',  label: 'Private health insurance rebate', sub: 'Not modelled. Your insurer\'s statement has the figures.' },
  { id: 'help', label: 'HELP or other study loan', sub: 'Not modelled. Compulsory repayments are added on assessment.' },
  { id: 'fito', label: 'Foreign income tax offset', sub: 'Enter any foreign tax paid below, or tick if there was none.' }
];

function _taxIncAll() {
  var a = load(K.taxinc);
  return a && typeof a === 'object' ? a : {};
}
function _taxInc(fy, person) {
  var all = _taxIncAll();
  var r = (all[fy] && all[fy][person]) || {};
  if (!Array.isArray(r.statements)) r.statements = [];
  if (!Array.isArray(r.deductions)) r.deductions = [];
  TAX_INC_OBJS.forEach(function(k) { if (!r[k] || typeof r[k] !== 'object') r[k] = {}; });
  return r;
}
function _taxSaveInc(fy, person, rec) {
  var all = _taxIncAll();
  if (!all[fy] || typeof all[fy] !== 'object') all[fy] = {};
  all[fy][person] = rec;
  save(K.taxinc, all);
}
function _taxNumOr(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : 0; }

// Equities sales in the FY for one person, one entry per parcel sold. Joint holdings count at the
// equal share when includeJoint is on. Cost base is the holding's cost per unit (vest price for RSUs).
function _taxCgtSales(person, fy, includeJoint) {
  var R = TAX_RULES[fy], share = TAX_RULES.returnRules.jointEqualShare;
  var out = { items: [], own: [], joint: [] };
  if (typeof EQUITIES === 'undefined' || typeof eqCostPerUnit !== 'function') return out;
  (EQUITIES || []).forEach(function(h) {
    var owner = h.owner || 'brenton';
    if (owner !== person && owner !== 'joint') return;
    (h.sales || []).forEach(function(s) {
      if (!taxIsDate(s.date) || s.date < R.start || s.date > R.end) return;
      var qty = parseFloat(s.qty) || 0;
      var proceeds = qty * (parseFloat(s.price) || 0) - (parseFloat(s.costs) || 0);
      var cost = qty * eqCostPerUnit(h);
      var acquired = s.acquired || ((h.type === 'rsu' || h.type === 'option') ? '' : (h.purchaseDate || ''));
      var it = { date: s.date, name: h.ticker || h.company || 'Holding', qty: qty, acquired: acquired,
                 proceeds: Math.round(proceeds * 100) / 100, costBase: Math.round(cost * 100) / 100,
                 gain: Math.round((proceeds - cost) * 100) / 100,
                 discount: typeof eqHeld12Months === 'function' && eqHeld12Months(acquired, s.date),
                 joint: owner === 'joint' };
      if (it.joint) {
        out.joint.push(it);
        if (includeJoint) out.items.push({ gain: Math.round(it.gain * share * 100) / 100, discount: it.discount });
      } else {
        out.own.push(it);
        out.items.push({ gain: it.gain, discount: it.discount });
      }
    });
  });
  out.own.sort(function(a, b) { return a.date < b.date ? -1 : 1; });
  out.joint.sort(function(a, b) { return a.date < b.date ? -1 : 1; });
  return out;
}

// Everything the worksheet shows for one person and FY, gathered from storage and run
// through the engine
function _taxWorksheet(person, fy, today) {
  var rec = _taxInc(fy, person);
  var txs = typeof TX !== 'undefined' && Array.isArray(TX) ? TX : [];
  var interest = taxInterestFromTx(txs, person, fy, rec.interest.includeJoint !== false);
  var ovr = rec.interest.override;
  var hasOvr = typeof ovr === 'number' && isFinite(ovr) && ovr >= 0;
  var dedTx = taxDeductionsFromTx(txs, person, fy);
  var ded = {};
  TAX_RULES.returnRules.deductionLabels.forEach(function(l) { ded[l.id] = dedTx[l.id].total; });
  rec.deductions.forEach(function(d) { if (ded[d.label] !== undefined) ded[d.label] += _taxNumOr(d.amount); });
  var sales = _taxCgtSales(person, fy, rec.cgt.includeJoint !== false);
  var inst = _taxInst(fy, person);
  var pays = (inst.payments || []);
  var instPaid = pays.reduce(function(s, p) { return s + (Number(p.amount) || 0); }, 0);
  var ret = taxBuildReturn({
    statements: rec.statements, interest: hasOvr ? ovr : interest.total, dividends: rec.dividends,
    ess: rec.ess, deductions: ded, cgt: { items: sales.items, lossesCF: rec.cgt.lossesCF },
    fito: rec.offsets.fito, instalmentsPaid: instPaid
  }, fy);
  var ws = { person: person, fy: fy, today: today, rec: rec, interest: interest, interestOverride: hasOvr ? ovr : null,
             dedTx: dedTx, ded: ded, sales: sales, inst: inst, pays: pays, ret: ret,
             res: resolveLodgement(taxCfg(), person, fy) };
  ws.sections = _taxSections(ws);
  ws.ready = taxReadiness(ws.sections);
  return ws;
}

function _taxHasAny(o, keys) {
  return keys.some(function(k) { return _taxNumOr(o[k]) > 0; });
}

// Readiness sections, in worksheet order. `need` is what's missing, shown on Overview.
function _taxSections(ws) {
  var r = ws.rec, d = r.done;
  var paidQ = {};
  ws.pays.forEach(function(p) { paidQ[p.q] = true; });
  // Only quarters already due count; a year still under way isn't missing its later quarters
  var unpaid = quarterDueDates(ws.fy).filter(function(q) { return q.due <= ws.today && !paidQ[q.q]; })
                                     .map(function(q) { return q.q; });
  var checksDone = TAX_CHECKS.every(function(c) { return r.checks[c.id]; });
  return [
    { id: 'q1', label: 'Income statements', ready: r.statements.length > 0 || !!d.q1,
      need: 'Add each employer\'s income statement' },
    { id: 'q10', label: 'Interest', ready: ws.interestOverride !== null || !!d.q10,
      need: 'Confirm interest against your bank statements' },
    { id: 'q11', label: 'Dividends', ready: _taxHasAny(r.dividends, ['unfranked', 'franked', 'credits']) || !!d.q11,
      need: 'Enter dividends and franking credits, or mark none' },
    { id: 'q12', label: 'Employee share schemes', ready: _taxHasAny(r.ess, ['D', 'E', 'F']) || !!d.q12,
      need: 'Enter your ESS statement, or mark none' },
    { id: 'ded', label: 'Deductions', ready: !!d.ded, need: 'Review your tagged deductions' },
    { id: 'cgt', label: 'Capital gains', ready: !!d.cgt, need: 'Review sales and losses carried forward' },
    { id: 'offsets', label: 'Offsets and Medicare', ready: checksDone, need: 'Work through the offsets checklist' },
    { id: 'inst', label: 'PAYG instalments', ready: !unpaid.length, applies: !!ws.inst.enrolled || ws.pays.length > 0,
      need: 'Record payments for ' + unpaid.map(function(q) { return 'Q' + q; }).join(', ') },
    { id: 'lodge', label: 'How you lodge', ready: ws.res.lodgeMethod !== 'unsure', need: 'Choose how you lodge' }
  ];
}

function _taxSection(ws, id) {
  return ws.sections.filter(function(s) { return s.id === id; })[0];
}
function _taxReadyBadge(ready) {
  return ready ? '<span class="badge b-paid"><i class="ti ti-check" aria-hidden="true"></i> Ready</span>'
               : '<span class="badge b-due"><i class="ti ti-point" aria-hidden="true"></i> Needed</span>';
}
function _taxPlural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
function _taxDedLabelName(id) {
  var l = TAX_RULES.returnRules.deductionLabels.filter(function(x) { return x.id === id; })[0];
  return l ? l.name : id;
}
// Signed money for credits shown as reductions
function _taxLess(n) { return '<span class="tax-mono">−' + esc(fmt(Math.abs(n))) + '</span>'; }

// ── Overview: estimate and readiness ────────────────────────────
function _taxEstimateCard(ws) {
  var r = ws.ret;
  if (!ws.rec.statements.length && !ws.rec.done.q1) {
    return '<div class="card mb tax-est"><div class="section-label">Estimated to pay at assessment</div>' +
      '<p class="tax-desc">Add ' + esc(_taxName(ws.person)) + '\'s income statements in the Return worksheet to see an estimate.</p>' +
      '<button class="btn btn-primary tax-full" onclick="taxSetTab(\'return\')">Open Return worksheet</button></div>';
  }
  var refund = r.payable < 0;
  var h = '<div class="card mb tax-est">';
  h += '<div class="section-label">' + (refund ? 'Estimated refund at assessment' : 'Estimated to pay at assessment') + '</div>';
  h += '<div class="tax-big"><span class="tax-mono">' + esc(fmt(Math.abs(r.payable))) + '</span> ' + _taxBadge('Estimated', 'tax-b-info') + '</div>';
  h += '<p class="tax-desc">Tax and Medicare <span class="tax-mono">' + esc(fmt(r.grossTax)) + '</span> less <span class="tax-mono">' +
       esc(fmt(r.credits.withheld)) + '</span> withheld' +
       (r.credits.instalments ? ' and <span class="tax-mono">' + esc(fmt(r.credits.instalments)) + '</span> instalments' : '') +
       (r.offsets.franking + r.offsets.fito ? ', and <span class="tax-mono">' + esc(fmt(r.offsets.franking + r.offsets.fito)) + '</span> in offsets' : '') +
       '. Based on what\'s in the Return worksheet so far.</p>';
  h += '</div>';
  return h;
}

function _taxMeter(rd) {
  var h = '<div class="tax-meter" aria-hidden="true">';
  for (var i = 0; i < rd.total; i++) h += '<span class="tax-meter-seg' + (i < rd.ready ? ' on' : '') + '"></span>';
  return h + '</div>';
}

function _taxReadinessCard(ws) {
  var rd = ws.ready;
  var h = '<div class="card mb"><div class="section-label">Return readiness</div>';
  h += '<p class="tax-ready-line"><b><span class="tax-mono">' + rd.ready + '</span> of <span class="tax-mono">' + rd.total + '</span> sections ready</b></p>';
  h += _taxMeter(rd);
  if (rd.missing.length) {
    h += '<ul class="tax-missing" aria-label="Still needed">';
    rd.missing.forEach(function(m) {
      h += '<li><span>' + esc(m.label) + '<span class="tax-note">' + esc(m.need) + '</span></span>' + _taxBadge('Needed', 'b-due') + '</li>';
    });
    h += '</ul>';
  } else {
    h += '<p class="tax-desc">Every section is filled in. ' + (ws.res.viaAgent ? 'The agent pack is ready to share.' : 'You\'re ready to key it into myTax.') + '</p>';
  }
  h += '<button class="btn btn-primary tax-full" onclick="taxSetTab(\'return\')">Continue return worksheet</button>';
  h += '</div>';
  return h;
}

// ── Return tab ──────────────────────────────────────────────────
var TAX_ROWS = [
  { id: 'q1',      code: 'Q1',     title: 'Salary or wages' },
  { id: 'q10',     code: 'Q10',    title: 'Gross interest' },
  { id: 'q11',     code: 'Q11',    title: 'Dividends' },
  { id: 'q12',     code: 'Q12',    title: 'Employee share schemes' },
  { id: 'ded',     code: 'D1–D10', title: 'Deductions' },
  { id: 'cgt',     code: 'Q18',    title: 'Capital gains' },
  { id: 'offsets', code: '',       title: 'Offsets and Medicare' },
  { id: 'inst',    code: '',       title: 'PAYG instalments credit' }
];

// Source chip text and amount for one row
function _taxRowInfo(ws, id) {
  var r = ws.ret, rec = ws.rec;
  if (id === 'q1') return { src: rec.statements.length ? 'Income statement · ' + _taxPlural(rec.statements.length, 'employer') : (rec.done.q1 ? 'None this year' : 'No income statements yet'),
                            icon: 'file-text', amt: r.q1.gross };
  if (id === 'q10') {
    if (ws.interestOverride !== null) return { src: 'Bank statement figure', icon: 'building-bank', amt: r.q10 };
    var n = ws.interest.items.length;
    return { src: n ? 'From ' + _taxPlural(n, 'transaction') : 'No interest transactions', icon: 'arrows-exchange', amt: r.q10 };
  }
  if (id === 'q11') {
    var any = _taxHasAny(rec.dividends, ['unfranked', 'franked', 'credits']);
    return { src: any ? 'Entered by hand · incl. franking credits' : (rec.done.q11 ? 'None this year' : 'Not entered'), icon: 'pencil', amt: any ? r.q11.assessable : null };
  }
  if (id === 'q12') {
    var anyE = _taxHasAny(rec.ess, ['D', 'E', 'F']);
    return { src: anyE ? 'Entered by hand · label B' : (rec.done.q12 ? 'None this year' : 'Not entered'), icon: 'pencil', amt: anyE ? r.q12.B : null };
  }
  if (id === 'ded') {
    var nt = 0;
    Object.keys(ws.dedTx).forEach(function(k) { nt += ws.dedTx[k].items.length; });
    var parts = [_taxPlural(nt, 'tagged transaction')];
    if (rec.deductions.length) parts.push(rec.deductions.length + ' by hand');
    return { src: parts.join(' · '), icon: 'tag', amt: r.deductions.total };
  }
  if (id === 'cgt') {
    var ns = ws.sales.own.length + (rec.cgt.includeJoint !== false ? ws.sales.joint.length : 0);
    return { src: ns ? 'Equities sales · ' + _taxPlural(ns, 'parcel') + ' sold' : 'No equities sales this year', icon: 'chart-line', amt: r.cgt.A };
  }
  if (id === 'offsets') {
    var done = TAX_CHECKS.filter(function(c) { return rec.checks[c.id]; }).length;
    return { src: 'Checklist · ' + done + ' of ' + TAX_CHECKS.length + ' checked', icon: 'checklist', amt: null };
  }
  if (id === 'inst') return { src: ws.pays.length ? 'From Instalments · ' + _taxPlural(ws.pays.length, 'payment') : 'No payments recorded', icon: 'calendar-dollar', amt: r.credits.instalments };
  return { src: '', icon: 'point', amt: null };
}

function _taxReturnHtml(person, fy, today) {
  if (person === 'household') {
    return '<div class="card"><div class="empty"><p>Each person has their own return worksheet.</p>' +
      '<div class="tax-btn-row">' + TAX_PEOPLE.map(function(p) {
        return '<button class="btn btn-ghost" onclick="taxSetPerson(\'' + p + '\')">' + esc(_taxName(p)) + '</button>';
      }).join('') + '</div></div></div>';
  }
  var ws = _taxWorksheet(person, fy, today);
  var r = ws.ret;
  var h = '<div class="card mb">';
  h += '<div class="section-label">Return worksheet</div>';
  h += '<p class="tax-desc tax-desc--top">' + esc(_taxName(person)) + ' · FY ' + esc(taxFyLabel(fy)) + ' · ATO labels. ' +
       (ws.res.viaAgent ? 'Figures for sharing with your agent.' : 'Figures for keying into myTax.') + ' Tap a line to see where it comes from.</p>';
  h += '<ul class="tax-rows">';
  TAX_ROWS.forEach(function(row) {
    var info = _taxRowInfo(ws, row.id);
    var sec = _taxSection(ws, row.id);
    var applies = !sec || sec.applies !== false;
    h += '<li><button class="tax-row" id="tax-row-' + row.id + '" onclick="taxOpenDetail(\'' + row.id + '\')">';
    h += '<span class="tax-row-main"><span class="tax-row-t">' + (row.code ? '<b class="tax-row-code">' + esc(row.code) + '</b> ' : '') + esc(row.title) + '</span>';
    h += '<span class="tax-src"><i class="ti ti-' + info.icon + '" aria-hidden="true"></i> ' + esc(info.src) + '</span></span>';
    var done = sec && sec.ready;
    var none = row.id === 'offsets' ? (done ? 'Checked' : 'Check') : (done ? 'None' : 'Add');
    h += '<span class="tax-row-end">' + (info.amt === null ? '<span class="tax-muted">' + none + '</span>' : _taxMoney(info.amt)) +
         (sec && applies ? _taxReadyBadge(sec.ready) : '') + '</span>';
    h += '<i class="ti ti-chevron-right tax-row-chev" aria-hidden="true"></i></button></li>';
  });
  h += '</ul></div>';

  // Summary
  h += '<div class="card mb"><div class="section-label">Estimate</div>';
  h += _taxDr('Total income', _taxMoney(r.totalIncome));
  h += _taxDr('Deductions', _taxLess(r.deductions.total));
  h += _taxDr('Taxable income', _taxMoney(r.taxable), true);
  h += _taxDr('Tax on taxable income', _taxMoney(r.tax));
  h += _taxDr('Medicare levy <span class="tax-k-sub">flat 2%, see checklist</span>', _taxMoney(r.medicare));
  if (r.offsets.franking) h += _taxDr('Franking credits', _taxLess(r.offsets.franking));
  if (r.offsets.fito) h += _taxDr('Foreign income tax offset', _taxLess(r.offsets.fito));
  h += _taxDr('Tax withheld', _taxLess(r.credits.withheld));
  if (r.credits.tfn) h += _taxDr('TFN amounts withheld', _taxLess(r.credits.tfn));
  if (r.credits.instalments) h += _taxDr('PAYG instalments paid', _taxLess(r.credits.instalments));
  h += _taxDr((r.payable < 0 ? 'Estimated refund' : 'Estimated to pay') + ' ' + _taxBadge('Estimated', 'tax-b-info'),
              '<span class="tax-mono">' + esc(fmt(Math.abs(r.payable))) + '</span>', true);
  h += '</div>';

  h += _taxExportCard(ws);
  return h;
}

function _taxDr(k, v, total) {
  return '<div class="dr' + (total ? ' dr--total' : '') + '"><span class="dr-k">' + k + '</span><span class="dr-v">' + v + '</span></div>';
}

// ── Detail sheets ───────────────────────────────────────────────
var _taxDetailId = null, _taxStEditId = null;

function taxOpenDetail(id) {
  _taxDetailId = id;
  _taxStEditId = null;
  // Safari doesn't focus a tapped button; focus the row so closing the sheet returns to it
  var row = document.getElementById('tax-row-' + id);
  if (row) row.focus();
  _taxRenderDetail(true);
}

function _taxRenderDetail(initial) {
  var id = _taxDetailId;
  if (!id) return;
  var ws = _taxWorksheet(taxUi.person, taxUi.fy, taxToday());
  var row = TAX_ROWS.filter(function(x) { return x.id === id; })[0];
  // Focus lands on the title, so a long sheet opens at the top rather than on its first input
  var h = '<div class="modal-header"><div class="modal-title" id="tax-sheet-title" tabindex="-1" data-autofocus>' + (row.code ? esc(row.code) + ' ' : '') + esc(row.title) + '</div>' + _taxCloseBtn() + '</div>';
  h += '<p class="modal-sub">' + esc(_taxName(ws.person)) + ' · FY ' + esc(taxFyLabel(ws.fy)) + '</p>';
  h += ({ q1: _taxDetQ1, q10: _taxDetQ10, q11: _taxDetQ11, q12: _taxDetQ12, ded: _taxDetDed,
          cgt: _taxDetCgt, offsets: _taxDetOffsets, inst: _taxDetInst })[id](ws);
  h += '<div class="modal-actions"><button class="btn btn-primary" onclick="taxCloseSheet()">Done</button></div>';
  var ov = document.getElementById('tax-sheet');
  if (!initial && ov && ov.classList.contains('open')) {
    var act = document.activeElement && document.activeElement.id;
    var box = ov.firstChild, top = box.scrollTop;
    box.innerHTML = h;
    box.scrollTop = top;
    var back = act && document.getElementById(act);
    if (back) back.focus();
    return;
  }
  taxOpenSheet(h, function() { _taxDetailId = null; taxCloseSheet(); });
}

// Re-render the page behind the sheet and the sheet itself after a change
function _taxDetailChanged() {
  renderTaxPage();
  _taxRenderDetail(false);
}

function _taxNumField(id, label, value, onchange, hint) {
  return '<div><label class="lbl" for="' + id + '">' + esc(label) + '</label><input id="' + id + '" type="number" inputmode="decimal" step="0.01" min="0" value="' +
         (typeof value === 'number' && isFinite(value) && value > 0 ? value : '') + '" onchange="' + onchange + '">' +
         (hint ? '<div class="tax-note">' + esc(hint) + '</div>' : '') + '</div>';
}
function _taxIncNum(id, label, path, value, hint) {
  return _taxNumField(id, label, value, 'taxIncSet(\'' + path + '\',this.value)', hint);
}
function _taxIncCheck(id, path, on, text, sub) {
  return '<label class="tax-check"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + ' onchange="taxIncSet(\'' + path + '\',this.checked)">' +
         _TAX_BOX + '<span>' + esc(text) + (sub ? '<span class="tax-note">' + esc(sub) + '</span>' : '') + '</span></label>';
}
function _taxTxLine(t, extra) {
  return '<div class="dr"><span class="dr-k">' + esc(t.name || t.description || 'Transaction') +
         '<span class="tax-note"><span class="tax-mono">' + esc(taxFmtDate(t.date)) + '</span>' + (extra ? ' · ' + extra : '') + '</span></span>' +
         '<span class="dr-v">' + _taxMoney(t.amount) + '</span></div>';
}

function _taxDetQ1(ws) {
  var rec = ws.rec, r = ws.ret;
  var h = '<p class="tax-desc">Copy these from each income statement in ATO online services (myGov), or your payment summary. Your bank only sees net pay, so gross pay is entered here.</p>';
  if (rec.statements.length) {
    h += '<div class="tax-list-card">';
    rec.statements.forEach(function(s) {
      var idq = JSON.stringify(String(s.id)).replace(/"/g, '&quot;');
      h += '<div class="tax-st"><div class="tax-st-main"><b>' + esc(s.employer || 'Employer') + '</b>' +
           '<span class="tax-note">Gross ' + esc(fmt(s.gross)) + ' · withheld ' + esc(fmt(s.withheld)) +
           (s.super ? ' · reportable super ' + esc(fmt(s.super)) : '') + (s.rfba ? ' · RFBA ' + esc(fmt(s.rfba)) : '') + '</span></div>' +
           '<button class="tax-icon-btn" aria-label="Edit ' + esc(s.employer || 'income statement') + '" onclick="taxIncEditStatement(' + idq + ')"><i class="ti ti-pencil" aria-hidden="true"></i></button>' +
           '<button class="tax-icon-btn" aria-label="Delete ' + esc(s.employer || 'income statement') + '" onclick="taxIncDelStatement(' + idq + ')"><i class="ti ti-trash" aria-hidden="true"></i></button></div>';
    });
    h += _taxDr('Q1 label C · gross payments', _taxMoney(r.q1.gross), true);
    h += _taxDr('Tax withheld', _taxMoney(r.q1.withheld));
    if (r.q1.super) h += _taxDr('Reportable employer super <span class="tax-k-sub">not taxable income</span>', _taxMoney(r.q1.super));
    if (r.q1.rfba) h += _taxDr('Reportable fringe benefits <span class="tax-k-sub">not taxable income</span>', _taxMoney(r.q1.rfba));
    h += '</div>';
  }
  var ed = _taxStEditId !== null ? rec.statements.filter(function(s) { return String(s.id) === String(_taxStEditId); })[0] : null;
  h += '<fieldset class="tax-fieldset"><legend class="tax-legend">' + (ed ? 'Edit income statement' : 'Add an income statement') + '</legend>';
  h += '<div class="form-grid"><div><label class="lbl" for="tax-st-employer">Employer</label><input id="tax-st-employer" type="text" autocomplete="off" maxlength="80" value="' + esc(ed ? ed.employer : '') + '"></div></div>';
  h += '<div class="form-grid">' +
       _taxNumField('tax-st-gross', 'Gross payments ($)', ed ? ed.gross : null, '') +
       _taxNumField('tax-st-withheld', 'Tax withheld ($)', ed ? ed.withheld : null, '') + '</div>';
  h += '<div class="form-grid">' +
       _taxNumField('tax-st-super', 'Reportable employer super ($)', ed ? ed.super : null, '', 'Optional') +
       _taxNumField('tax-st-rfba', 'Reportable fringe benefits ($)', ed ? ed.rfba : null, '', 'Optional') + '</div>';
  h += '<div class="tax-btn-row tax-btn-row--start">' + (ed ? '<button class="btn btn-ghost" onclick="taxIncCancelEdit()">Cancel edit</button>' : '') +
       '<button class="btn btn-primary" onclick="taxIncSaveStatement()">' + (ed ? 'Save statement' : 'Add statement') + '</button></div></fieldset>';
  h += _taxIncCheck('tax-done-q1', 'done.q1', rec.done.q1, 'No salary or wages this year');
  return h;
}

function _taxDetQ10(ws) {
  var it = ws.interest, rec = ws.rec, share = TAX_RULES.returnRules.jointEqualShare;
  var h = '<p class="tax-desc">Kelda adds up ' + esc(_taxName(ws.person)) + '\'s transactions in the Interest category. The figure on your bank\'s annual statement is the one to use if they differ.</p>';
  h += '<div class="tax-list-card">';
  var own = it.items.filter(function(t) { return t.person === ws.person; });
  if (!own.length && !it.joint) h += '<div class="empty empty--compact"><p>No interest transactions in FY ' + esc(taxFyLabel(ws.fy)) + '.</p></div>';
  own.forEach(function(t) { h += _taxTxLine(t, esc(t.subcat || 'Interest')); });
  h += _taxDr('From ' + esc(_taxName(ws.person)) + '\'s transactions', _taxMoney(it.own), true);
  if (it.joint) {
    h += _taxDr('Joint interest <span class="tax-k-sub">' + (rec.interest.includeJoint !== false ? 'counted at half' : 'not counted') + '</span>',
                rec.interest.includeJoint !== false ? _taxMoney(it.jointCounted) : '<span class="tax-muted">' + esc(fmt(it.joint)) + '</span>');
  }
  h += '</div>';
  if (it.joint) h += _taxIncCheck('tax-int-joint', 'interest.includeJoint', rec.interest.includeJoint !== false,
    'Count half of joint interest (' + fmt(it.joint) + ')', 'The ATO says to show half if you held the account equally with one other person. Untick and use the bank figure below if your share is different.');
  if (it.excluded.length) {
    var ex = it.excluded.reduce(function(s, t) { return s + (Number(t.amount) || 0); }, 0);
    h += '<div class="tax-infobox">Not counted: <span class="tax-mono">' + esc(fmt(ex)) + '</span> in "Offset Interest" transactions. An offset account usually reduces your loan interest rather than paying you interest. If it was paid to you, use the bank figure below.</div>';
  }
  h += '<div class="form-grid">' + _taxIncNum('tax-int-ovr', 'Bank statement total ($)', 'interest.override', ws.interestOverride,
       'Replaces the transaction total. Leave blank to use transactions.') + '</div>';
  h += _taxIncCheck('tax-done-q10', 'done.q10', rec.done.q10, 'I\'ve checked this against my bank statements');
  h += '<p class="tax-desc">Q10 label L. Interest from foreign accounts and trusts goes elsewhere on the return and isn\'t included.</p>';
  return h;
}

function _taxDetQ11(ws) {
  var d = ws.rec.dividends, r = ws.ret.q11;
  var h = '<p class="tax-desc">The Equities page doesn\'t record dividends, so enter the totals from your dividend statements. For shares held jointly, enter your share (half if held equally).</p>';
  h += '<div class="form-grid">' + _taxIncNum('tax-dv-s', 'Unfranked (label S)', 'dividends.unfranked', d.unfranked) +
       _taxIncNum('tax-dv-t', 'Franked (label T)', 'dividends.franked', d.franked) + '</div>';
  h += '<div class="form-grid">' + _taxIncNum('tax-dv-u', 'Franking credits (label U)', 'dividends.credits', d.credits) +
       _taxIncNum('tax-dv-v', 'TFN amounts withheld (label V)', 'dividends.tfnWithheld', d.tfnWithheld) + '</div>';
  h += '<div class="tax-list-card">' + _taxDr('Assessable dividends (S + T + U)', _taxMoney(r.assessable), true) +
       _taxDr('Franking credits, credited back on assessment', _taxMoney(r.U)) + '</div>';
  h += _taxIncCheck('tax-done-q11', 'done.q11', ws.rec.done.q11, 'No dividends this year');
  h += '<p class="tax-desc">ETF and managed fund distributions go at supplementary question 13 and aren\'t modelled. Kelda doesn\'t check the 45-day holding rule.</p>';
  return h;
}

function _taxDetQ12(ws) {
  var e = ws.rec.ess, r = ws.ret.q12;
  var h = '<div class="tax-infobox">Share awards, with each RSU vest and the 30-day rule, arrive in a later beta update. Until then, copy the totals from your ESS statement.</div>';
  h += '<div class="form-grid">' + _taxIncNum('tax-es-d', 'Taxed upfront, eligible for reduction (D)', 'ess.D', e.D) +
       _taxIncNum('tax-es-e', 'Taxed upfront, not eligible (E)', 'ess.E', e.E) + '</div>';
  h += '<div class="form-grid">' + _taxIncNum('tax-es-f', 'Deferral schemes (F)', 'ess.F', e.F, 'Most RSUs land here') + '</div>';
  if (_taxNumOr(e.D) > 0) {
    var rt = e.reductionTest || 'unsure';
    h += '<fieldset class="tax-fieldset"><legend class="tax-legend">Is your income for the $1,000 reduction ' + esc(fmt(TAX_RULES.common.essReduction.incomeTestMax)).replace('.00', '') + ' or less?</legend><div class="tax-opts tax-opts--3">';
    [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']].forEach(function(o) {
      h += '<label class="tax-opt"><input type="radio" name="tax-es-rt" value="' + o[0] + '"' + (rt === o[0] ? ' checked' : '') +
           ' onchange="taxIncSet(\'ess.reductionTest\',this.value)"><span class="tax-opt-t">' + o[1] + '</span></label>';
    });
    h += '</div></fieldset><p class="tax-desc">Kelda only applies the reduction when you answer Yes; the ATO\'s income test isn\'t worked out here.</p>';
  }
  h += '<div class="tax-list-card">' + _taxDr('Q12 label B, taxable discount', _taxMoney(r.B), true) +
       (r.reduction ? _taxDr('Reduction applied to D', _taxLess(r.reduction)) : '') + '</div>';
  h += _taxIncCheck('tax-done-q12', 'done.q12', ws.rec.done.q12, 'No employee share scheme income this year');
  return h;
}

function _taxDetDed(ws) {
  var rec = ws.rec, labels = TAX_RULES.returnRules.deductionLabels;
  var h = '<p class="tax-desc">Tag a transaction as a deduction from its edit screen in Spending (tap the transaction on a phone, or the tax button on desktop). You can also add amounts that aren\'t transactions, like car expenses worked out per kilometre.</p>';
  var any = false;
  labels.forEach(function(l) {
    var tx = ws.dedTx[l.id], man = rec.deductions.filter(function(d) { return d.label === l.id; });
    if (!tx.items.length && !man.length) return;
    any = true;
    h += '<div class="tax-list-card"><div class="tax-ded-hd"><b>' + esc(l.id) + '</b> ' + esc(l.name) + '</div>';
    tx.items.forEach(function(t) {
      var tag = taxTxTag(t);
      h += _taxTxLine(t, tag && tag.note ? esc(tag.note) : 'Tagged transaction');
    });
    man.forEach(function(d) {
      var idq = JSON.stringify(String(d.id)).replace(/"/g, '&quot;');
      h += '<div class="dr"><span class="dr-k">' + esc(d.desc || 'Added by hand') + '<span class="tax-note">Added by hand</span></span>' +
           '<span class="dr-v">' + _taxMoney(d.amount) + '<button class="tax-icon-btn" aria-label="Delete ' + esc(d.desc || 'entry') + '" onclick="taxIncDelDed(' + idq + ')"><i class="ti ti-trash" aria-hidden="true"></i></button></span></div>';
    });
    h += _taxDr(esc(l.id) + ' total', _taxMoney(ws.ded[l.id]), true) + '</div>';
  });
  if (!any) h += '<div class="empty empty--compact"><p>No deductions tagged or added for FY ' + esc(taxFyLabel(ws.fy)) + ' yet.</p></div>';
  h += '<fieldset class="tax-fieldset"><legend class="tax-legend">Add an amount by hand</legend>';
  h += '<div class="form-grid"><div><label class="lbl" for="tax-dd-label">Label</label><select id="tax-dd-label">' +
       labels.map(function(l) { return '<option value="' + l.id + '">' + esc(l.id + ' ' + l.name) + '</option>'; }).join('') + '</select></div></div>';
  h += '<div class="form-grid"><div><label class="lbl" for="tax-dd-desc">Description</label><input id="tax-dd-desc" type="text" autocomplete="off" maxlength="80"></div>' +
       _taxNumField('tax-dd-amt', 'Amount ($)', null, '') + '</div>';
  h += '<div class="tax-btn-row tax-btn-row--start"><button class="btn btn-primary" onclick="taxIncAddDed()">Add deduction</button></div></fieldset>';
  if (TAX_RULES[ws.fy] && TAX_RULES[ws.fy].standardDeduction) {
    h += '<div class="tax-infobox">From 2026–27 there is a <span class="tax-mono">' + esc(fmt(TAX_RULES[ws.fy].standardDeduction)) + '</span> standard deduction. Kelda doesn\'t apply it yet, because its conditions haven\'t been checked.</div>';
  }
  h += _taxIncCheck('tax-done-ded', 'done.ded', rec.done.ded, 'I\'ve reviewed my deductions and have the records');
  return h;
}

function _taxDetCgt(ws) {
  var s = ws.sales, rec = ws.rec, r = ws.ret.cgt, share = TAX_RULES.returnRules.jointEqualShare;
  var h = '<p class="tax-desc">Sales recorded on the Equities page. A parcel held 12 months or more gets the 50% discount after losses are applied. Property and share-award parcels come in later updates.</p>';
  function line(x) {
    return '<div class="dr"><span class="dr-k">' + esc(x.name) + ' · <span class="tax-mono">' + esc(String(x.qty)) + '</span> units' +
           '<span class="tax-note"><span class="tax-mono">' + esc(taxFmtDate(x.date)) + '</span> · ' +
           (x.discount ? 'held 12 months or more' : (x.acquired ? 'held under 12 months' : 'acquired date unknown, treated as under 12 months')) +
           ' · proceeds ' + esc(fmt(x.proceeds)) + ', cost base ' + esc(fmt(x.costBase)) + '</span></span>' +
           '<span class="dr-v"><span class="tax-mono">' + (x.gain < 0 ? '−' : '') + esc(fmt(Math.abs(x.gain))) + '</span>' + _taxBadge(x.gain < 0 ? 'Loss' : 'Gain', x.gain < 0 ? 'b-overdue' : 'b-paid') + '</span></div>';
  }
  h += '<div class="tax-list-card">';
  if (!s.own.length && !s.joint.length) h += '<div class="empty empty--compact"><p>No sales in FY ' + esc(taxFyLabel(ws.fy)) + '.</p></div>';
  s.own.forEach(function(x) { h += line(x); });
  if (s.joint.length) {
    h += '<div class="tax-ded-hd">Joint holdings ' + (rec.cgt.includeJoint !== false ? '<span class="tax-k-sub">counted at half</span>' : '<span class="tax-k-sub">not counted</span>') + '</div>';
    s.joint.forEach(function(x) { h += line(x); });
  }
  h += '</div>';
  if (s.joint.length) h += _taxIncCheck('tax-cgt-joint', 'cgt.includeJoint', rec.cgt.includeJoint !== false,
    'Count half of each joint sale', 'For joint holdings held equally. Untick if your share is different.');
  h += '<div class="form-grid">' + _taxIncNum('tax-cgt-cf', 'Net capital losses from earlier years ($)', 'cgt.lossesCF', rec.cgt.lossesCF, 'From last year\'s return, label V') + '</div>';
  h += '<div class="tax-list-card">' + _taxDr('Total current year capital gains (H)', _taxMoney(r.H)) +
       (r.currentLosses ? _taxDr('Capital losses this year', _taxLess(r.currentLosses)) : '') +
       (r.lossesCF ? _taxDr('Losses from earlier years', _taxLess(r.lossesCF)) : '') +
       (r.discount ? _taxDr('CGT discount', _taxLess(r.discount)) : '') +
       _taxDr('Net capital gain (A)', _taxMoney(r.A), true) +
       (r.carryForward ? _taxDr('Losses to carry forward (V)', _taxMoney(r.carryForward)) : '') + '</div>';
  h += _taxIncCheck('tax-done-cgt', 'done.cgt', rec.done.cgt, 'I\'ve reviewed my sales and losses');
  return h;
}

function _taxDetOffsets(ws) {
  var rec = ws.rec, r = ws.ret;
  var h = '<p class="tax-desc">Kelda applies franking credits and up to <span class="tax-mono">' + esc(fmt(TAX_RULES.returnRules.fitoDirectLimit)) + '</span> of foreign income tax offset. Everything else here isn\'t calculated, so tick each item once you\'ve checked it.</p>';
  h += '<div class="tax-list-card">' + _taxDr('Medicare levy, flat 2% <span class="tax-k-sub">Estimated</span>', _taxMoney(r.medicare)) +
       _taxDr('Franking credits <span class="tax-k-sub">from Q11</span>', _taxMoney(r.offsets.franking)) +
       _taxDr('Foreign income tax offset <span class="tax-k-sub">label O</span>', _taxMoney(r.offsets.fito)) + '</div>';
  h += '<div class="form-grid">' + _taxIncNum('tax-fito', 'Foreign tax paid ($)', 'offsets.fito', rec.offsets.fito) + '</div>';
  if (r.offsets.fitoCapped) {
    h += '<div class="tax-warnbox">Over <span class="tax-mono">' + esc(fmt(TAX_RULES.returnRules.fitoDirectLimit)) + '</span>, you either work out the full offset or claim <span class="tax-mono">' +
         esc(fmt(TAX_RULES.returnRules.fitoDirectLimit)) + '</span> and forgo the rest. Kelda uses the capped figure' + (r.offsets.fito < TAX_RULES.returnRules.fitoDirectLimit ? ', limited to the tax on your income' : '') + '.</div>';
  }
  h += '<fieldset class="tax-fieldset"><legend class="tax-legend">Checklist</legend>';
  TAX_CHECKS.forEach(function(c) { h += _taxIncCheck('tax-chk-' + c.id, 'checks.' + c.id, rec.checks[c.id], c.label, c.sub); });
  h += '</fieldset>';
  return h;
}

function _taxDetInst(ws) {
  var h = '<p class="tax-desc">Instalments you\'ve paid for FY ' + esc(taxFyLabel(ws.fy)) + ' are credited against the tax on your return. Check them against ATO online services before you lodge.</p>';
  h += '<div class="tax-list-card">';
  if (!ws.pays.length) h += '<div class="empty empty--compact"><p>No payments recorded for this year.</p></div>';
  ws.pays.slice().sort(function(a, b) { return a.date < b.date ? -1 : 1; }).forEach(function(p) {
    h += _taxDr('Q' + esc(String(p.q)) + ' · <span class="tax-mono">' + esc(taxFmtDate(p.date)) + '</span>', _taxMoney(p.amount));
  });
  h += _taxDr('PAYG instalments credit', _taxMoney(ws.ret.credits.instalments), true) + '</div>';
  h += '<button class="btn btn-ghost tax-full" onclick="taxCloseSheet();taxSetTab(\'instalments\')">Open Instalments</button>';
  return h;
}

// ── Worksheet edits ─────────────────────────────────────────────
function taxIncSet(path, value) {
  var kind = TAX_INC_FIELDS[path];
  if (!kind) return;
  var parts = path.split('.');
  var rec = _taxInc(taxUi.fy, taxUi.person);
  var obj = rec[parts[0]];
  if (kind === 'bool') obj[parts[1]] = !!value;
  else if (kind === 'num') {
    var s = String(value).trim();
    if (s === '') { delete obj[parts[1]]; }
    else {
      var n = parseFloat(s);
      if (isNaN(n) || n < 0) { toast('Enter a number of 0 or more', 2400, 'warn'); _taxRenderDetail(false); return; }
      obj[parts[1]] = Math.round(n * 100) / 100;
    }
  } else if (kind.indexOf(value) !== -1) obj[parts[1]] = value;
  else return;
  _taxSaveInc(taxUi.fy, taxUi.person, rec);
  _taxDetailChanged();
}

function _taxReadNum(id) {
  var el = document.getElementById(id);
  var s = el ? String(el.value).trim() : '';
  if (s === '') return 0;
  var n = parseFloat(s);
  return isNaN(n) || n < 0 ? NaN : Math.round(n * 100) / 100;
}

function taxIncSaveStatement() {
  var emp = (document.getElementById('tax-st-employer').value || '').trim().slice(0, 80);
  var v = { gross: _taxReadNum('tax-st-gross'), withheld: _taxReadNum('tax-st-withheld'),
            super: _taxReadNum('tax-st-super'), rfba: _taxReadNum('tax-st-rfba') };
  if (Object.keys(v).some(function(k) { return isNaN(v[k]); })) { toast('Amounts must be 0 or more', 2400, 'warn'); return; }
  if (!(v.gross > 0)) { toast('Enter the gross payments', 2400, 'warn'); return; }
  var rec = _taxInc(taxUi.fy, taxUi.person);
  var ed = _taxStEditId !== null ? rec.statements.filter(function(s) { return String(s.id) === String(_taxStEditId); })[0] : null;
  if (ed) { ed.employer = emp; ed.gross = v.gross; ed.withheld = v.withheld; ed.super = v.super; ed.rfba = v.rfba; }
  else rec.statements.push({ id: Date.now(), employer: emp, gross: v.gross, withheld: v.withheld, super: v.super, rfba: v.rfba });
  _taxSaveInc(taxUi.fy, taxUi.person, rec);
  _taxStEditId = null;
  toast(ed ? 'Income statement saved' : 'Income statement added', 2400, 'success');
  _taxDetailChanged();
  var f = document.getElementById('tax-st-employer'); if (f) f.focus();
}
function taxIncEditStatement(id) {
  _taxStEditId = id;
  _taxRenderDetail(false);
  var f = document.getElementById('tax-st-employer'); if (f) f.focus();
}
function taxIncCancelEdit() {
  _taxStEditId = null;
  _taxRenderDetail(false);
}
function taxIncDelStatement(id) {
  var rec = _taxInc(taxUi.fy, taxUi.person);
  var s = rec.statements.filter(function(x) { return String(x.id) === String(id); })[0];
  if (!s || !confirm('Delete the income statement' + (s.employer ? ' from ' + s.employer : '') + '?')) return;
  rec.statements = rec.statements.filter(function(x) { return x !== s; });
  if (String(_taxStEditId) === String(id)) _taxStEditId = null;
  _taxSaveInc(taxUi.fy, taxUi.person, rec);
  toast('Income statement deleted', 2400, 'info');
  _taxDetailChanged();
}
function taxIncAddDed() {
  var label = document.getElementById('tax-dd-label').value;
  var desc = (document.getElementById('tax-dd-desc').value || '').trim().slice(0, 80);
  var amt = _taxReadNum('tax-dd-amt');
  if (TAX_RULES.returnRules.deductionLabels.every(function(l) { return l.id !== label; })) return;
  if (!(amt > 0)) { toast('Enter an amount', 2400, 'warn'); return; }
  var rec = _taxInc(taxUi.fy, taxUi.person);
  rec.deductions.push({ id: Date.now(), label: label, desc: desc, amount: amt });
  _taxSaveInc(taxUi.fy, taxUi.person, rec);
  toast('Deduction added', 2400, 'success');
  _taxDetailChanged();
}
function taxIncDelDed(id) {
  var rec = _taxInc(taxUi.fy, taxUi.person);
  var d = rec.deductions.filter(function(x) { return String(x.id) === String(id); })[0];
  if (!d || !confirm('Delete this ' + d.label + ' entry of ' + fmt(d.amount) + '?')) return;
  rec.deductions = rec.deductions.filter(function(x) { return x !== d; });
  _taxSaveInc(taxUi.fy, taxUi.person, rec);
  toast('Deduction deleted', 2400, 'info');
  _taxDetailChanged();
}

// ── Exports ─────────────────────────────────────────────────────
function _taxExportFooter(ws) {
  return 'FY ' + taxFyLabel(ws.fy) + ' · ' + _taxName(ws.person) + ' · Rules version ' + TAX_RULES_VERSION +
         ' · Estimates only. Not tax advice. Kelda can\'t lodge your return.';
}
function _taxFooterRows(ws) {
  return [[], ['FY ' + taxFyLabel(ws.fy), _taxName(ws.person), 'Rules version ' + TAX_RULES_VERSION, 'Estimates only. Not tax advice.']];
}

function _taxExportCard(ws) {
  var agent = ws.res.viaAgent;
  var h = '<div class="card mb"><div class="section-label">' + (agent ? 'Agent pack' : 'Export') + '</div>';
  h += '<p class="tax-desc tax-desc--top">' + (agent
    ? 'For sharing with your agent' + (ws.res.agentName ? ', ' + esc(ws.res.agentName) : '') + ': a printable summary, plus spreadsheets of the figures behind it.'
    : 'For keying into myTax: the worksheet as a summary, a spreadsheet, or a printout.') + '</p>';
  h += '<div class="tax-exp">';
  h += '<button class="btn btn-ghost" onclick="taxViewSummary()"><i class="ti ti-eye" aria-hidden="true"></i> View summary</button>';
  h += '<button class="btn btn-ghost" onclick="taxPrintSummary()"><i class="ti ti-printer" aria-hidden="true"></i> Print / PDF</button>';
  if (!agent) {
    h += '<button class="btn btn-ghost" onclick="taxDownloadCsv(\'worksheet\')"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i> Worksheet CSV</button>';
  } else {
    h += '<button class="btn btn-ghost" onclick="taxDownloadCsv(\'statements\')"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i> Income statements CSV</button>';
    h += '<button class="btn btn-ghost" onclick="taxDownloadCsv(\'instalments\')"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i> Instalments paid CSV</button>';
    h += '<button class="btn btn-ghost" onclick="taxDownloadCsv(\'deductions\')"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i> Deductions CSV</button>';
    if (ws.sales.own.length || ws.sales.joint.length) h += '<button class="btn btn-ghost" onclick="taxDownloadCsv(\'cgt\')"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i> Capital gains CSV</button>';
  }
  h += '</div>';
  if (agent) h += '<p class="tax-desc">Share award vests join the pack when that section arrives.</p>';
  h += '<p class="tax-desc">Every export is labelled with the year, person and rules version, and is an estimate only.</p></div>';
  return h;
}

// The summary used on screen and in print. Plain tables so it prints cleanly.
function _taxSummaryHtml(ws) {
  var r = ws.ret, rec = ws.rec, agent = ws.res.viaAgent;
  function tr(k, v, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th scope="row">' + k + '</th><td>' + v + '</td></tr>'; }
  function m(n) { return '<span class="tax-mono">' + esc(fmt(n)) + '</span>'; }
  function less(n) { return '<span class="tax-mono">−' + esc(fmt(Math.abs(n))) + '</span>'; }
  var h = '<div class="tax-sum">';
  h += '<h2 class="tax-sum-ttl">' + (agent ? 'Tax summary for your agent' : 'Tax return worksheet') + '</h2>';
  h += '<p class="tax-sum-sub">' + esc(_taxName(ws.person)) + ' · FY ' + esc(taxFyLabel(ws.fy)) + ' · ' +
       (agent ? 'For sharing with your agent' + (ws.res.agentName ? ' (' + esc(ws.res.agentName) + ')' : '') : 'For keying into myTax') + '</p>';
  h += '<table class="tax-sum-tbl"><caption>Income</caption><tbody>';
  h += tr('Q1 Salary or wages (C)', m(r.q1.gross));
  h += tr('Q10 Gross interest (L)', m(r.q10) + (ws.interestOverride !== null ? ' <span class="tax-k-sub">bank statement</span>' : ''));
  h += tr('Q11 Unfranked (S) · Franked (T) · Franking credits (U)', m(r.q11.S) + ' · ' + m(r.q11.T) + ' · ' + m(r.q11.U));
  h += tr('Q12 Employee share schemes (B)', m(r.q12.B));
  h += tr('Q18 Net capital gain (A)', m(r.cgt.A) + (r.cgt.carryForward ? ' <span class="tax-k-sub">losses to carry forward ' + esc(fmt(r.cgt.carryForward)) + '</span>' : ''));
  h += tr('Total income', m(r.totalIncome), 'tax-sum-total');
  h += '</tbody></table>';

  h += '<table class="tax-sum-tbl"><caption>Deductions</caption><tbody>';
  TAX_RULES.returnRules.deductionLabels.forEach(function(l) {
    if (ws.ded[l.id]) h += tr(esc(l.id + ' ' + l.name), m(ws.ded[l.id]));
  });
  h += tr('Total deductions', m(r.deductions.total), 'tax-sum-total');
  h += '</tbody></table>';

  if (rec.statements.length) {
    h += '<table class="tax-sum-tbl"><caption>Income statements</caption><thead><tr><th scope="col">Employer</th><th scope="col">Gross</th><th scope="col">Withheld</th><th scope="col">Super</th><th scope="col">RFBA</th></tr></thead><tbody>';
    rec.statements.forEach(function(s) {
      h += '<tr><th scope="row">' + esc(s.employer || 'Employer') + '</th><td>' + m(s.gross) + '</td><td>' + m(s.withheld) + '</td><td>' + m(s.super) + '</td><td>' + m(s.rfba) + '</td></tr>';
    });
    h += '</tbody></table>';
  }

  h += '<table class="tax-sum-tbl"><caption>Estimate</caption><tbody>';
  h += tr('Taxable income', m(r.taxable));
  h += tr('Tax on taxable income', m(r.tax));
  h += tr('Medicare levy (flat 2%)', m(r.medicare));
  if (r.offsets.franking) h += tr('Franking credits', less(r.offsets.franking));
  if (r.offsets.fito) h += tr('Foreign income tax offset (O)', less(r.offsets.fito));
  h += tr('Tax withheld', less(r.credits.withheld));
  if (r.credits.tfn) h += tr('TFN amounts withheld', less(r.credits.tfn));
  if (r.credits.instalments) h += tr('PAYG instalments paid', less(r.credits.instalments));
  h += tr((r.payable < 0 ? 'Estimated refund' : 'Estimated to pay'), m(Math.abs(r.payable)), 'tax-sum-total');
  h += '</tbody></table>';

  if (ws.ready.missing.length) {
    h += '<p class="tax-sum-k">Not ready yet: ' + esc(ws.ready.missing.map(function(x) { return x.label; }).join(', ')) + '.</p>';
  }
  h += '<p class="tax-sum-k">Not modelled: low income tax offset, Medicare levy reduction and surcharge, private health rebate, HELP, and business income.</p>';
  h += '<p class="tax-sum-foot">' + esc(_taxExportFooter(ws)) + '</p>';
  h += '</div>';
  return h;
}

function _taxCurrentWs() {
  return _taxWorksheet(taxUi.person, taxUi.fy, taxToday());
}

function taxViewSummary() {
  var ws = _taxCurrentWs();
  var h = '<div class="modal-header"><div class="modal-title" id="tax-sheet-title" tabindex="-1" data-autofocus>Summary</div>' + _taxCloseBtn() + '</div>';
  h += _taxSummaryHtml(ws);
  h += '<div class="modal-actions"><button class="btn btn-ghost" onclick="taxCloseSheet()">Close</button><button class="btn btn-primary" onclick="taxPrintSummary()">Print / PDF</button></div>';
  taxOpenSheet(h);
}

function taxPrintSummary() {
  var ws = _taxCurrentWs();
  var el = document.getElementById('tax-print');
  if (!el) { el = document.createElement('div'); el.id = 'tax-print'; document.body.appendChild(el); }
  el.innerHTML = _taxSummaryHtml(ws);
  document.body.classList.add('tax-printing');
  var done = function() {
    document.body.classList.remove('tax-printing');
    el.innerHTML = '';
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

function _taxCsvRows(ws, kind) {
  var r = ws.ret, rec = ws.rec;
  if (kind === 'worksheet') {
    var rows = [['Label', 'Item', 'Amount', 'Source']];
    rows.push(['Q1 C', 'Salary or wages', r.q1.gross, 'Income statements (' + rec.statements.length + ')']);
    rows.push(['Q1', 'Tax withheld', r.q1.withheld, 'Income statements']);
    rows.push(['Q10 L', 'Gross interest', r.q10, ws.interestOverride !== null ? 'Bank statement figure' : 'Interest transactions']);
    rows.push(['Q11 S', 'Unfranked dividends', r.q11.S, 'Entered by hand']);
    rows.push(['Q11 T', 'Franked dividends', r.q11.T, 'Entered by hand']);
    rows.push(['Q11 U', 'Franking credits', r.q11.U, 'Entered by hand']);
    rows.push(['Q11 V', 'TFN amounts withheld', r.q11.V, 'Entered by hand']);
    rows.push(['Q12 D', 'ESS taxed upfront, reduction', _taxNumOr(rec.ess.D), 'Entered by hand']);
    rows.push(['Q12 E', 'ESS taxed upfront, no reduction', _taxNumOr(rec.ess.E), 'Entered by hand']);
    rows.push(['Q12 F', 'ESS deferral schemes', _taxNumOr(rec.ess.F), 'Entered by hand']);
    rows.push(['Q12 B', 'ESS discounts', r.q12.B, 'Worked out']);
    TAX_RULES.returnRules.deductionLabels.forEach(function(l) {
      rows.push([l.id, l.name, ws.ded[l.id], 'Tagged transactions and entries by hand']);
    });
    rows.push(['Q18 H', 'Total current year capital gains', r.cgt.H, 'Equities sales']);
    rows.push(['Q18 A', 'Net capital gain', r.cgt.A, 'Worked out']);
    rows.push(['Q18 V', 'Net capital losses carried forward', r.cgt.carryForward, 'Worked out']);
    rows.push(['O', 'Foreign income tax offset', r.offsets.fito, 'Entered by hand, capped']);
    rows.push(['', 'Taxable income (estimate)', r.taxable, 'Worked out']);
    rows.push(['', 'Tax on taxable income (estimate)', r.tax, 'Worked out']);
    rows.push(['', 'Medicare levy, flat 2% (estimate)', r.medicare, 'Worked out']);
    rows.push(['', 'PAYG instalments paid', r.credits.instalments, 'Instalments']);
    rows.push(['', r.payable < 0 ? 'Estimated refund' : 'Estimated to pay', Math.abs(r.payable), 'Worked out']);
    return rows;
  }
  if (kind === 'statements') {
    var s = [['Employer', 'Gross payments', 'Tax withheld', 'Reportable employer super', 'Reportable fringe benefits']];
    rec.statements.forEach(function(x) { s.push([x.employer || '', _taxNumOr(x.gross), _taxNumOr(x.withheld), _taxNumOr(x.super), _taxNumOr(x.rfba)]); });
    return s;
  }
  if (kind === 'instalments') {
    var p = [['Quarter', 'Date paid', 'Amount']];
    ws.pays.slice().sort(function(a, b) { return a.date < b.date ? -1 : 1; }).forEach(function(x) { p.push(['Q' + x.q, x.date, Number(x.amount) || 0]); });
    return p;
  }
  if (kind === 'deductions') {
    var d = [['Label', 'Label name', 'Date', 'Description', 'Amount', 'Note', 'Source']];
    TAX_RULES.returnRules.deductionLabels.forEach(function(l) {
      ws.dedTx[l.id].items.forEach(function(t) {
        var tag = taxTxTag(t);
        d.push([l.id, l.name, t.date, t.name || t.description || '', Number(t.amount) || 0, tag ? tag.note : '', 'Transaction']);
      });
      rec.deductions.filter(function(x) { return x.label === l.id; }).forEach(function(x) {
        d.push([l.id, l.name, '', x.desc || '', _taxNumOr(x.amount), '', 'Added by hand']);
      });
    });
    return d;
  }
  if (kind === 'cgt') {
    var c = [['Holding', 'Sale date', 'Acquired', 'Units', 'Proceeds', 'Cost base', 'Gain or loss', 'Held 12 months', 'Ownership']];
    ws.sales.own.concat(ws.sales.joint).forEach(function(x) {
      c.push([x.name, x.date, x.acquired || '', x.qty, x.proceeds, x.costBase, x.gain, x.discount ? 'Yes' : 'No', x.joint ? 'Joint' : 'Own']);
    });
    return c;
  }
  return [];
}

function taxDownloadCsv(kind) {
  var ws = _taxCurrentWs();
  var rows = _taxCsvRows(ws, kind).concat(_taxFooterRows(ws));
  var slug = String(_taxName(ws.person)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ws.person;
  if (typeof downloadFile !== 'function') return;
  // Named with the local date (exportFilename() stamps the UTC date, a day behind on AU mornings)
  downloadFile(taxCsv(rows), 'kelda-finance-tax-' + kind + '-' + ws.fy + '-' + slug + '-' + taxToday() + '.csv', 'text/csv;charset=utf-8');
  toast('CSV downloaded', 2400, 'success');
}

// ── Transactions: tax deduction tag (Spending edit sheet and rows) ──
// The fields are optional and additive: an untagged transaction has none of them, and
// untagging deletes them, so existing records are never rewritten.
function taxTxFormSync(t) {
  var wrap = document.getElementById('tx-tax-wrap');
  if (!wrap) return;
  var type = document.getElementById('tx-type');
  var on = taxEnabled() && (!type || type.value === 'expense');
  wrap.hidden = !on;
  if (!on) return;
  var sel = document.getElementById('tx-tax-label');
  if (sel && sel.options.length < 2) {
    TAX_RULES.returnRules.deductionLabels.forEach(function(l) {
      var o = document.createElement('option');
      o.value = l.id; o.textContent = l.id + ' ' + l.name;
      sel.appendChild(o);
    });
  }
  if (t !== undefined && sel) {
    var tag = taxTxTag(t);
    var ap = typeof activeProfile !== 'undefined' && TAX_PEOPLE.indexOf(activeProfile) !== -1 ? activeProfile : 'brenton';
    sel.value = tag ? tag.label : '';
    document.getElementById('tx-tax-person').value = (tag && tag.person) || (t && TAX_PEOPLE.indexOf(t.person) !== -1 ? t.person : ap);
    document.getElementById('tx-tax-note').value = tag ? tag.note : '';
  }
  taxTxLabelChanged();
}
function taxTxLabelChanged() {
  var sel = document.getElementById('tx-tax-label');
  var more = document.getElementById('tx-tax-more');
  if (sel && more) more.hidden = !sel.value;
}
// Write the form's tax fields onto a transaction. Does nothing when the section is hidden
// (flag off, or an income transaction), so other paths never touch these fields.
function taxTxApplyForm(t) {
  var wrap = document.getElementById('tx-tax-wrap');
  if (!wrap || wrap.hidden || !t) return;
  var label = document.getElementById('tx-tax-label').value;
  var ok = TAX_RULES.returnRules.deductionLabels.some(function(l) { return l.id === label; });
  if (!ok) { delete t.taxDeductible; delete t.taxLabel; delete t.taxPerson; delete t.taxNote; return; }
  var who = document.getElementById('tx-tax-person').value;
  var note = (document.getElementById('tx-tax-note').value || '').trim().slice(0, 200);
  t.taxDeductible = true;
  t.taxLabel = label;
  t.taxPerson = TAX_PEOPLE.indexOf(who) !== -1 ? who : 'brenton';
  if (note) t.taxNote = note; else delete t.taxNote;
}
// Badge shown on a tagged transaction's row or card (text, not colour alone)
function taxTxBadge(t) {
  if (!taxEnabled()) return '';
  var tag = taxTxTag(t);
  return tag ? ' <span class="badge tax-b-info tax-tx-badge">Tax ' + esc(tag.label) + '</span>' : '';
}
// Desktop rows have no tap-to-edit, so a tax button opens the edit sheet
function taxTxRowBtn(t) {
  if (!taxEnabled() || t.type !== 'expense') return '';
  var tag = taxTxTag(t);
  return '<button class="tax-tx-btn" onclick="openTxModal(' + Number(t.id) + ')" aria-label="' +
         (tag ? 'Tax deduction ' + esc(tag.label) + '. Edit transaction' : 'Tag as a tax deduction') + '"><i class="ti ti-receipt-tax" aria-hidden="true"></i></button>';
}

// ── Later phases ────────────────────────────────────────────────
function _taxLaterHtml(tab) {
  var txt = {
    'share':  'Share awards arrive in a later beta update: RSU vests, the 30-day rule, the tax to set aside on each vest, and CGT parcels.',
    'cgt':    'The capital gains forecast arrives in a later beta update, once the rules that start 1 July 2027 have been checked against the law.'
  }[tab] || '';
  return '<div class="card"><div class="empty"><p>' + esc(txt) + '</p></div></div>';
}

function _taxRulesBadge(fy) {
  var r = TAX_RULES[fy], L = r && r.lodgement;
  var parts = [];
  if (r && r.verified) parts.push('Rules for FY ' + taxFyLabel(fy) + ' · verified ' + taxFmtDate(r.verifiedOn));
  if (L) parts.push(L.verified ? 'Dates per ATO lodgment program · verified ' + taxFmtDate(L.verifiedOn) : 'Agent dates for FY ' + taxFyLabel(fy) + ' not published yet');
  return '<p class="tax-rules">' + esc(parts.join(' · ')) + '</p>';
}

// ── Sheets (focus-trapped dialog) ───────────────────────────────
var _taxSheetReturn = null, _taxSheetOnEscape = null;

function _taxCloseBtn() {
  return '<button class="modal-close tax-close" onclick="taxSheetEscape()" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button>';
}

function taxOpenSheet(html, onEscape) {
  var ov = document.getElementById('tax-sheet');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'tax-sheet';
    ov.className = 'modal-overlay tax-sheet-ov';
    ov.innerHTML = '<div class="modal-box modal-box--scroll modal-box--md tax-sheet" role="dialog" aria-modal="true" aria-labelledby="tax-sheet-title"></div>';
    ov.addEventListener('click', function(e) { if (e.target === ov) taxSheetEscape(); });
    ov.addEventListener('keydown', _taxSheetKey);
    document.body.appendChild(ov);
  }
  if (!ov.classList.contains('open')) _taxSheetReturn = document.activeElement;
  _taxSheetOnEscape = onEscape || null;
  ov.firstChild.innerHTML = html;
  ov.classList.add('open');
  var f = _taxFocusables(ov);
  var first = ov.querySelector('[data-autofocus]') || f.filter(function(x) { return !x.classList.contains('tax-close'); })[0] || f[0];
  if (first) first.focus();
}

function taxCloseSheet() {
  var ov = document.getElementById('tax-sheet');
  if (ov) { ov.classList.remove('open'); ov.firstChild.innerHTML = ''; }
  _taxSheetOnEscape = null;
  var r = _taxSheetReturn; _taxSheetReturn = null;
  _taxDetailId = null;
  // A re-rendered opener (a worksheet row, say) is found again by its id
  if (r && r.id && !document.body.contains(r)) r = document.getElementById(r.id);
  if (!r || r === document.body || !document.body.contains(r)) {
    // The opener was re-rendered, or the browser never focused it (Safari doesn't focus clicked buttons)
    r = document.querySelector('#page-tax.active .tax-chip') || document.querySelector('#page-tax.active .tax-seg-btn.on');
  }
  if (r && r.focus) r.focus();
}

function taxSheetEscape() {
  if (_taxSheetOnEscape) _taxSheetOnEscape(); else taxCloseSheet();
}

function _taxFocusables(root) {
  return Array.prototype.slice.call(root.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea,a[href],summary,[tabindex]:not([tabindex="-1"])'))
    .filter(function(x) { return x.offsetParent !== null || x === document.activeElement; });
}

function _taxSheetKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); taxSheetEscape(); return; }
  if (e.key !== 'Tab') return;
  var f = _taxFocusables(e.currentTarget);
  if (!f.length) return;
  var first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// ── First run: how do you lodge? ────────────────────────────────
function _taxMaybeFirstRun() {
  var ov = document.getElementById('tax-sheet');
  if (ov && ov.classList.contains('open')) return;
  var c = taxCfg();
  _taxFirstRunQueue = TAX_PEOPLE.filter(function(p) { return !_taxPerson(c, p).firstRunDone; });
  if (_taxFirstRunQueue.length) _taxShowFirstRun();
}

function _taxShowFirstRun() {
  var person = _taxFirstRunQueue[0];
  var fy = taxDefaultFy(taxToday());
  var L = TAX_RULES[fy].lodgement;
  var name = esc(_taxName(person));
  var h = '<div class="modal-header"><div class="modal-title" id="tax-sheet-title">How does ' + name + ' lodge?</div>' + _taxCloseBtn() + '</div>';
  h += '<p class="modal-sub">This sets ' + name + '\'s due dates and what Kelda exports. You can change it any time from the Lodging chip.</p>';
  h += '<fieldset class="tax-fieldset"><legend class="tax-sr">How does ' + name + ' lodge?</legend><div class="tax-opts">';
  h += _taxMethodOpt('tax-fr', 'self', 'I lodge myself', 'Due <span class="tax-mono">' + esc(taxFmtDate(L.selfDue, false)) + '</span>. Export is a worksheet for myTax.', false);
  h += _taxMethodOpt('tax-fr', 'agent', 'A tax agent lodges for me',
    L.agentDue ? 'Usually up to <span class="tax-mono">' + esc(taxFmtDate(L.agentDue, false)) + '</span> if they have you on their list by <span class="tax-mono">' + esc(taxFmtDate(L.agentListCutoff, false)) + '</span>. Export is a pack for your agent.' : 'Export is a pack for your agent.', false);
  h += _taxMethodOpt('tax-fr', 'unsure', 'Not sure yet', 'Kelda uses self-lodge dates' + (L.agentListCutoff ? ' and reminds you before <span class="tax-mono">' + esc(taxFmtDate(L.agentListCutoff, false)) + '</span>' : '') + '.', false);
  h += '</div></fieldset>';
  h += '<div class="modal-actions"><button class="btn btn-ghost" onclick="taxFirstRunDone(null)">Skip</button><button class="btn btn-primary" onclick="taxFirstRunDone(true)">Continue</button></div>';
  if (_taxFirstRunQueue.length > 1) h += '<p class="tax-desc tax-desc--next">Next: the same question for ' + esc(_taxName(_taxFirstRunQueue[1])) + '.</p>';
  taxOpenSheet(h, function() { taxFirstRunDone(null); });
}

function _taxMethodOpt(name, value, title, sub, checked) {
  return '<label class="tax-opt"><input type="radio" id="' + name + '-' + value + '" name="' + name + '" value="' + value + '"' + (checked ? ' checked' : '') + '>' +
         '<span class="tax-opt-t">' + esc(title) + '</span><span class="tax-opt-s">' + sub + '</span></label>';
}

// choose: true = use the selected option; null = skip (stores 'unsure')
function taxFirstRunDone(choose) {
  var person = _taxFirstRunQueue[0];
  if (!person) { taxCloseSheet(); return; }
  var method = 'unsure';
  if (choose) {
    var sel = document.querySelector('input[name="tax-fr"]:checked');
    if (!sel) { toast('Choose an option, or Skip', 2400, 'warn'); return; }
    method = sel.value;
  }
  var c = taxCfg(), pp = _taxPerson(c, person);
  var fy = taxDefaultFy(taxToday());
  var rec = pp.lodgement[fy] || (pp.lodgement[fy] = {});
  rec.lodgeMethod = method;
  pp.firstRunDone = true;
  save(K.taxcfg, c);
  _taxFirstRunQueue.shift();
  if (_taxFirstRunQueue.length) { _taxShowFirstRun(); return; }
  renderTaxPage();
  taxCloseSheet();
}

// ── Lodgement settings ──────────────────────────────────────────
var _taxLodgeDraft = null;

function taxOpenLodgement(person) {
  var res = resolveLodgement(taxCfg(), person, taxUi.fy);
  _taxLodgeDraft = {
    person: person, fy: taxUi.fy, lodgeMethod: res.lodgeMethod, agentName: res.agentName,
    engagedBeforeCutoff: res.engagedBeforeCutoff, priorLiabilityHigh: res.priorLiabilityHigh,
    plannedLodgeDate: res.plannedLodgeDate,
    lodgmentDue: res.lodgmentEdited ? res.lodgmentDue : '', paymentDue: res.paymentEdited ? res.paymentDue : ''
  };
  _taxRenderLodgement(true);
}

// Rebuild the sheet from the draft (used when the method or an input that changes defaults moves)
function _taxRenderLodgement(initial) {
  var d = _taxLodgeDraft;
  var today = taxToday();
  var res = _taxDraftResolve(d);
  var L = TAX_RULES[d.fy].lodgement;
  var name = esc(_taxName(d.person));
  var h = '<div class="modal-header"><div class="modal-title" id="tax-sheet-title">Lodgement</div>' + _taxCloseBtn() + '</div>';
  h += '<p class="modal-sub">' + name + ' · FY ' + esc(taxFyLabel(d.fy)) + '</p>';

  h += '<fieldset class="tax-fieldset"><legend class="tax-legend">How ' + name + ' lodges</legend><div class="tax-opts">';
  h += _taxMethodOpt('tax-lm', 'self', 'I lodge myself', 'Self-lodge dates. Export is a worksheet for myTax.', d.lodgeMethod === 'self');
  h += _taxMethodOpt('tax-lm', 'agent', 'A tax agent lodges for me', 'Agent program dates. Export is a pack for your agent.', d.lodgeMethod === 'agent');
  h += _taxMethodOpt('tax-lm', 'unsure', 'Not sure yet', 'Self-lodge dates, with a reminder about the agent cutoff.', d.lodgeMethod === 'unsure');
  h += '</div></fieldset>';

  if (d.lodgeMethod === 'agent') {
    h += '<div class="form-grid"><div><label class="lbl" for="tax-lg-agent">Agent (optional)</label><input id="tax-lg-agent" type="text" autocomplete="off" placeholder="Name or firm" value="' + esc(d.agentName) + '"></div></div>';
    if (L.agentListCutoff) {
      h += '<label class="tax-check"><input type="checkbox" id="tax-lg-engaged"' + (d.engagedBeforeCutoff ? ' checked' : '') + '>' + _TAX_BOX + '<span>My agent had me on their client list by ' + esc(taxFmtDate(L.agentListCutoff)) + '</span></label>';
    }
    h += '<label class="tax-check"><input type="checkbox" id="tax-lg-prior" onchange="_taxLodgeSync();_taxRenderLodgement()"' + (d.priorLiabilityHigh ? ' checked' : '') + '>' + _TAX_BOX + '<span>My last return showed tax payable of $20,000 or more<span class="tax-note">The ATO then gives an earlier agent due date' + (L.agentPriorLiabilityDue ? ', ' + esc(taxFmtDate(L.agentPriorLiabilityDue)) : '') + '.</span></span></label>';
    if (!d.priorLiabilityHigh) {
      h += '<div class="form-grid"><div><label class="lbl" for="tax-lg-planned">Date you plan to lodge</label><input id="tax-lg-planned" type="date" value="' + esc(d.plannedLodgeDate) + '" onchange="_taxLodgeSync();_taxRenderLodgement()"></div></div>';
    }
  }

  lodgementWarnings(res, today).forEach(function(w) {
    h += '<div class="' + (w.kind === 'warn' ? 'tax-warnbox' : 'tax-infobox') + '">' + esc(w.text) + '</div>';
  });

  if (res.defaults.available || res.lodgmentEdited) {
    h += _taxDateField('tax-lg-due', 'Lodgment due date', res.lodgmentDue, res.defaults.lodgmentDue, res.lodgmentEdited, 'Default');
    h += _taxDateField('tax-lg-pay', 'Tax payment due, if you owe', res.paymentDue, res.defaults.paymentDue, res.paymentEdited, 'Auto');
    if (res.defaults.paymentBasis && !res.paymentEdited) h += '<p class="tax-desc">' + esc(res.defaults.paymentBasis) + '</p>';
    if (d.lodgeMethod === 'agent' && res.defaults.concessionDue && !d.priorLiabilityHigh) {
      h += '<p class="tax-desc">The ATO also accepts a 15 May return lodged by ' + esc(taxFmtDate(res.defaults.concessionDue)) + ' if any tax owed is paid by then too.</p>';
    }
  }
  h += '<div class="tax-infobox">Changing a date never changes a tax figure. Your notice of assessment is the final word on when to pay.</div>';
  h += '<div class="modal-actions"><button class="btn btn-ghost" onclick="taxCloseSheet()">Cancel</button><button class="btn btn-primary" onclick="taxSaveLodgement()">Save</button></div>';

  var ov = document.getElementById('tax-sheet');
  if (!initial && ov && ov.classList.contains('open')) {
    var act = document.activeElement && document.activeElement.id;
    ov.firstChild.innerHTML = h;
    _taxBindLodgement();
    var back = act && document.getElementById(act);
    if (back) back.focus();
    return;
  }
  taxOpenSheet(h);
  _taxBindLodgement();
}

function _taxBindLodgement() {
  Array.prototype.forEach.call(document.querySelectorAll('input[name="tax-lm"]'), function(r) {
    r.addEventListener('change', function() { _taxLodgeSync(); _taxLodgeDraft.lodgeMethod = r.value; _taxRenderLodgement(); });
  });
}

function _taxDateField(id, label, value, def, edited, autoWord) {
  var h = '<div class="tax-datefld"><label class="lbl" for="' + id + '">' + esc(label) + ' ' +
          _taxBadge(edited ? 'Edited' : autoWord, edited ? 'b-due' : 'tax-b-info') + '</label>';
  h += '<div class="tax-date-row"><input id="' + id + '" type="date" value="' + esc(value || '') + '" data-default="' + esc(def || '') + '">';
  if (edited && def) h += '<button class="btn btn-sm btn-ghost" onclick="taxResetDate(\'' + id + '\')">Use ' + esc(taxFmtDate(def)) + '</button>';
  h += '</div>' + _taxWeekendLine(value) + '</div>';
  return h;
}

function taxResetDate(id) {
  _taxLodgeSync();
  if (id === 'tax-lg-due') _taxLodgeDraft.lodgmentDue = '';
  else _taxLodgeDraft.paymentDue = '';
  _taxRenderLodgement();
}

// Copy the sheet's inputs into the draft. A date equal to its default is not an edit.
function _taxLodgeSync() {
  var d = _taxLodgeDraft;
  if (!d) return;
  function val(id) { var el = document.getElementById(id); return el ? el.value : null; }
  function chk(id) { var el = document.getElementById(id); return el ? el.checked : null; }
  var v;
  if ((v = val('tax-lg-agent')) !== null) d.agentName = v.trim().slice(0, 80);
  if ((v = chk('tax-lg-engaged')) !== null) d.engagedBeforeCutoff = v;
  if ((v = chk('tax-lg-prior')) !== null) d.priorLiabilityHigh = v;
  if ((v = val('tax-lg-planned')) !== null) d.plannedLodgeDate = taxIsDate(v) ? v : '';
  ['tax-lg-due', 'tax-lg-pay'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var out = taxIsDate(el.value) && el.value !== el.getAttribute('data-default') ? el.value : '';
    if (id === 'tax-lg-due') d.lodgmentDue = out; else d.paymentDue = out;
  });
}

function _taxDraftRecord(d) {
  var edited = [];
  if (d.lodgmentDue) edited.push('lodgmentDue');
  if (d.paymentDue) edited.push('paymentDue');
  return {
    lodgeMethod: d.lodgeMethod, agentName: d.agentName, engagedBeforeCutoff: !!d.engagedBeforeCutoff,
    priorLiabilityHigh: !!d.priorLiabilityHigh, plannedLodgeDate: d.plannedLodgeDate,
    lodgmentDue: d.lodgmentDue || null, paymentDue: d.paymentDue || null, editedFields: edited
  };
}

function _taxDraftResolve(d) {
  var rec = _taxDraftRecord(d);
  var tmp = { perPerson: {} };
  tmp.perPerson[d.person] = { lodgement: {} };
  tmp.perPerson[d.person].lodgement[d.fy] = rec;
  return resolveLodgement(tmp, d.person, d.fy);
}

function taxSaveLodgement() {
  _taxLodgeSync();
  var d = _taxLodgeDraft;
  if (!d) return;
  var c = taxCfg(), pp = _taxPerson(c, d.person);
  var prev = pp.lodgement[d.fy] || {};
  var rec = _taxDraftRecord(d);
  rec.bannerDismissed = !!prev.bannerDismissed;
  pp.lodgement[d.fy] = rec;
  pp.firstRunDone = true;
  save(K.taxcfg, c);
  _taxLodgeDraft = null;
  renderTaxPage();
  taxCloseSheet();
  toast('Lodgement saved', 2400, 'success');
}

// ── Beta opt-in (Settings › Beta features) ──────────────────────
function taxSettingsCardHtml() {
  var on = taxEnabled();
  var h = '<div class="card mb">';
  h += '<div class="section-label section-label--mb14">Beta features</div>';
  h += _taxSwitchRow('tax-beta-sw', 'Tax (Beta)', on ? 'On. Find it under Beta Features (desktop) or More › Tools (phone).'
       : 'Prepare figures for your return and track PAYG instalments. Estimates only, not tax advice.', on, 'taxBetaToggle()');
  h += '</div>';
  return h;
}

function taxBetaToggle() {
  if (taxEnabled()) {
    var h = '<div class="modal-header"><div class="modal-title" id="tax-sheet-title">Turn off Tax (Beta)?</div>' + _taxCloseBtn() + '</div>';
    h += '<p class="modal-sub">The Tax page is hidden. Everything you entered stays on this device and comes back if you turn it on again.</p>';
    h += '<div class="modal-actions"><button class="btn btn-ghost" onclick="taxCloseSheet()">Keep it on</button><button class="btn btn-primary" onclick="taxSetBeta(false)">Turn off</button></div>';
    taxOpenSheet(h);
    return;
  }
  var t = '<div class="modal-header"><div class="modal-title" id="tax-sheet-title">Turn on Tax (Beta)?</div>' + _taxCloseBtn() + '</div>';
  t += '<p class="modal-sub">Tax helps you prepare figures for your own return and estimate what you\'ll owe. Your data stays on this device.</p>';
  t += '<label class="tax-check"><input type="checkbox" id="tax-consent-1" onchange="_taxConsentSync()">' + _TAX_BOX + '<span>I understand Kelda gives general estimates, not tax advice, and is not a registered tax agent.</span></label>';
  t += '<label class="tax-check"><input type="checkbox" id="tax-consent-2" onchange="_taxConsentSync()">' + _TAX_BOX + '<span>I will check figures against my ATO income statement and ESS statements before lodging.</span></label>';
  t += '<div class="modal-actions"><button class="btn btn-ghost" onclick="taxCloseSheet()">Not now</button><button class="btn btn-primary" id="tax-consent-go" disabled onclick="taxSetBeta(true)">Turn on</button></div>';
  taxOpenSheet(t);
}

function _taxConsentSync() {
  var a = document.getElementById('tax-consent-1'), b = document.getElementById('tax-consent-2');
  var go = document.getElementById('tax-consent-go');
  if (go) go.disabled = !(a && a.checked && b && b.checked);
}

function taxSetBeta(on) {
  var c = taxCfg();
  c.betaEnabled = !!on;
  if (on) c.consentAt = taxToday();
  save(K.taxcfg, c);
  taxCloseSheet();
  taxSyncNav();
  if (typeof renderSettings === 'function') renderSettings();
  toast(on ? 'Tax (Beta) is on' : 'Tax (Beta) is off', 2400, on ? 'success' : 'info');
  var sw = document.getElementById('tax-beta-sw'); if (sw) sw.focus();
}

// Scripts are deferred, so the nav exists by now
taxSyncNav();
