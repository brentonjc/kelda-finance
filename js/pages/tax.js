// ═══════════════════════════════════════════════════════════════
//  pages/tax.js — Tax (Beta) page, opt-in and sheets
// ───────────────────────────────────────────────────────────────
//  Off until the household opts in (K.taxcfg.betaEnabled). Kelda can't
//  lodge: everything here is an estimate or a worksheet. Calculations
//  live in js/tax/engine.js; rates and dates in js/tax/rules.js.
//
//  Phase 1a: beta opt-in, page shell, person/FY switchers, lodgement
//  (first-run choice, chip, settings, unsure banner) and PAYG instalments.
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
  else h += _taxLaterHtml(taxUi.tab);
  h += '</div>';

  h += _taxRulesBadge(fy);
  el.innerHTML = h;

  _taxMaybeFirstRun();
}

function taxSetPerson(v) { taxUi.person = v; renderTaxPage(); }
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
  var h = '<div class="card mb tax-est">';
  h += '<div class="section-label">Estimated to pay at assessment</div>';
  h += '<p class="tax-desc">Your estimate appears here once the Return worksheet is filled in. That arrives in the next beta update.</p>';
  h += '</div>';

  h += '<div class="card mb"><div class="section-label">Coming up</div>' + _taxComingUpRows(res, person, today) + '</div>';

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
    var res = resolveLodgement(c, p, fy);
    var inst = _taxInst(fy, p);
    var yr = inst.enrolled ? instalmentYear(inst, fy, today) : [];
    var paid = yr.reduce(function(s, q) { return s + q.paid; }, 0);
    var next = _taxNextInstalment(p, today);
    return { p: p, res: res, enrolled: inst.enrolled, paid: paid, next: next };
  });
  var h = '<div class="card mb"><table class="tax-cmp"><caption class="tax-sr">Lodgement and instalments, FY ' + esc(taxFyLabel(fy)) + '</caption>';
  h += '<thead><tr><th scope="col"><span class="tax-sr">Item</span></th>';
  cols.forEach(function(x) { h += '<th scope="col">' + esc(_taxName(x.p)) + '</th>'; });
  h += '</tr></thead><tbody>';
  function row(label, fn) {
    h += '<tr><th scope="row">' + label + '</th>';
    cols.forEach(function(x) { h += '<td>' + fn(x) + '</td>'; });
    h += '</tr>';
  }
  row('Lodging', function(x) { return _taxChip(x.res); });
  row('Lodgment due', function(x) { return x.res.lodgmentDue ? '<span class="tax-mono">' + esc(taxFmtDate(x.res.lodgmentDue)) + '</span>' : '—'; });
  row('Payment due', function(x) { return x.res.paymentDue ? '<span class="tax-mono">' + esc(taxFmtDate(x.res.paymentDue)) + '</span>' : '—'; });
  row('Instalments paid', function(x) { return x.enrolled ? _taxMoney(x.paid) : '<span class="tax-muted">Not set up</span>'; });
  row('Next instalment', function(x) { return x.next ? '<span class="tax-mono">' + esc(taxFmtDate(x.next.due)) + '</span>' : '—'; });
  h += '</tbody></table></div>';
  h += '<div class="tax-infobox">Each person lodges and pays separately. Kelda never adds two people\'s tax into one figure.</div>';
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

// ── Later phases ────────────────────────────────────────────────
function _taxLaterHtml(tab) {
  var txt = {
    'return': 'The Return worksheet arrives in the next beta update: income statements, interest, dividends, deductions and an export for myTax or your agent.',
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
