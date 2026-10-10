// ══════════════════════════════════════════════════════════════
// LIABILITIES PAGE
// ══════════════════════════════════════════════════════════════

var liabSortMode = 'rate';
var liabEditIdx = -1;

// ── Data helpers ──────────────────────────────────────────────

// Returns true if any mortgage property is linked to this liability ID
function _liabIsMortgageLinked(liabId) {
  var props = (MORTGAGE && MORTGAGE.properties && MORTGAGE.properties.length)
    ? MORTGAGE.properties : [];
  return props.some(function(p) { return p.linkedLiabilityId === liabId; });
}

// Returns the mortgage property linked to a given liability ID (or null)
function _liabLinkedMortgageProp(liabId) {
  var props = (MORTGAGE && MORTGAGE.properties && MORTGAGE.properties.length)
    ? MORTGAGE.properties : [];
  return props.find(function(p) { return p.linkedLiabilityId === liabId; }) || null;
}

function liabAllMortgages() {
  var props = (MORTGAGE && MORTGAGE.properties && MORTGAGE.properties.length)
    ? MORTGAGE.properties : null;

  if (!props) {
    // Legacy flat object fallback
    var m = MORTGAGE;
    if (!m || !m.balance) return [];
    var r  = (m.rate || 0) / 100 / 12;
    var n  = (m.years || 0) * 12;
    var isIO = m.reptype === 'io';
    var repmt = 0;
    if (isIO) { repmt = m.balance * r; }
    else if (r && n) { repmt = m.balance * (r * Math.pow(1+r,n)) / (Math.pow(1+r,n)-1); }
    var payoffDate = '';
    if (!isIO && r && n) {
      var d = new Date(); d.setMonth(d.getMonth() + n);
      payoffDate = d.toLocaleDateString('en-AU', { month:'short', year:'numeric' });
    }
    return [{
      id: 'mortgage_primary', type: 'mortgage',
      lender: m.lenderName || 'Home Loan',
      balance: Number(m.balance) || 0, originalBalance: Number(m.original) || 0,
      rate: Number(m.rate) || 0, rateType: 'variable', payment: repmt,
      dueDay: 1, termMonths: n, payoffDate: payoffDate,
      homeValue: Number(m.homeValue) || 0, readonly: true
    }];
  }

  var items = [];
  props.forEach(function(p, idx) {
    // Skip: this property is linked to a LIABILITIES entry — that card represents it
    if (p.linkedLiabilityId) return;
    if (!p.balance) return;

    var r  = (Number(p.rate) || 0) / 100 / 12;
    var n  = (Number(p.years) || 0) * 12;
    var isIO = p.reptype === 'io';
    var repmt = 0;
    if (isIO) { repmt = p.balance * r; }
    else if (r && n) { repmt = p.balance * (r * Math.pow(1+r,n)) / (Math.pow(1+r,n)-1); }
    var payoffDate = '';
    if (!isIO && r && n) {
      var d = new Date(); d.setMonth(d.getMonth() + n);
      payoffDate = d.toLocaleDateString('en-AU', { month:'short', year:'numeric' });
    }
    // First property keeps 'mortgage_primary' for backward-compat with monthly history data
    var id = idx === 0 ? 'mortgage_primary' : ('mortgage_prop_' + p.id);
    items.push({
      id: id, type: 'mortgage',
      lender: p.name || 'Home Loan',
      balance: Number(p.balance) || 0, originalBalance: Number(p.original) || 0,
      rate: Number(p.rate) || 0, rateType: 'variable', payment: repmt,
      dueDay: 1, termMonths: n, payoffDate: payoffDate,
      homeValue: Number(p.homeValue) || 0, readonly: true
    });
  });
  return items;
}

function liabTotal() {
  var total = 0;
  liabAllMortgages().forEach(function(m) { total += m.balance; });
  LIABILITIES.forEach(function(l) { total += Number(l.balance) || 0; });
  return total;
}

function liabMonthlyTotal() {
  var total = 0;
  liabAllMortgages().forEach(function(m) { total += m.payment || 0; });
  LIABILITIES.forEach(function(l) {
    if (l.type === 'hecs') {
      total += (Number(l.payment) || 0) / 12;
    } else {
      total += Number(l.payment) || 0;
    }
  });
  return total;
}

function liabTotalInterest() {
  var total = 0;
  LIABILITIES.forEach(function(l) {
    if (l.type === 'hecs' || !Number(l.rate) || !Number(l.termMonths)) return;
    var sched = liabAmortise(Number(l.balance), Number(l.rate), Number(l.payment), Number(l.termMonths));
    total += sched.totalInterest;
  });
  return total;
}

function liabDTI() {
  var pfx = thisMonth();
  var monthInc = TX.filter(function(t) { return t.type === 'income' && t.date.startsWith(pfx); })
    .reduce(function(s, t) { return s + Number(t.amount); }, 0);
  if (!monthInc) {
    var total = 0, count = 0;
    for (var i = 1; i <= 3; i++) {
      var d = new Date();
      d.setMonth(d.getMonth() - i);
      var m = d.toISOString().slice(0, 7);
      var inc = TX.filter(function(t) { return t.type === 'income' && t.date.startsWith(m); })
        .reduce(function(s, t) { return s + Number(t.amount); }, 0);
      if (inc > 0) { total += inc; count++; }
    }
    monthInc = count ? total / count : 0;
  }
  if (!monthInc) return null;
  return (liabMonthlyTotal() / monthInc) * 100;
}

function liabAmortise(balance, ratePa, monthlyPayment, termMonths) {
  var result = { rows: [], totalInterest: 0, totalCost: 0, payoffDate: '', warning: '', negAmort: false };
  if (!balance || !termMonths) return result;

  var r = ratePa / 100 / 12;
  var bal = balance;
  var d = new Date();

  if (ratePa === 0) {
    var principal = balance / termMonths;
    for (var i = 1; i <= termMonths && bal > 0.01; i++) {
      var p = Math.min(principal, bal);
      bal = Math.max(0, bal - p);
      d.setMonth(d.getMonth() + 1);
      result.rows.push({ month: i, label: d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }), payment: p, principal: p, interest: 0, balance: bal });
    }
    result.payoffDate = d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
    result.totalCost = balance;
    return result;
  }

  var firstInterest = bal * r;
  if (monthlyPayment > 0 && monthlyPayment <= firstInterest) {
    result.negAmort = true;
    result.warning = ICON('alert-triangle') + ' Minimum payment does not cover interest — balance is growing';
    return result;
  }

  var maxMonths = termMonths > 0 ? Math.max(termMonths, 600) : 600;
  for (var i = 1; i <= maxMonths && bal > 0.01; i++) {
    var interest = bal * r;
    var principal = Math.min(monthlyPayment - interest, bal);
    if (principal < 0) {
      result.negAmort = true;
      result.warning = ICON('alert-triangle') + ' Minimum payment does not cover interest — balance is growing';
      break;
    }
    bal = Math.max(0, bal - principal);
    d.setMonth(d.getMonth() + 1);
    var pmt = (bal < 0.01) ? (principal + interest) : monthlyPayment;
    result.rows.push({ month: i, label: d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }), payment: pmt, principal: principal, interest: interest, balance: bal });
    result.totalInterest += interest;
    if (i === termMonths && bal > 0.01) {
      result.warning = ICON('alert-triangle') + ' Minimum payment will not pay off this loan in the stated term';
    }
  }

  if (result.rows.length) {
    result.payoffDate = d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
  }
  result.totalCost = balance + result.totalInterest;
  return result;
}

function liabDebtFreeDate(l) {
  if (!l.balance || !l.payment || l.type === 'hecs') return '';
  var sched = liabAmortise(Number(l.balance), Number(l.rate), Number(l.payment), Number(l.termMonths) || 600);
  return sched.negAmort ? '' : (sched.payoffDate || '');
}

function liabRateTone(rate) {
  if (rate === 0) return 'tone-green';
  if (rate < 5) return 'tone-green';
  if (rate <= 15) return 'tone-amber';
  return 'tone-danger';
}

// Type colour -> tone suffix (card border modifier) and text tone class
var LIAB_TONES = { 'var(--n300)': 'slate', 'var(--warn)': 'amber', 'var(--success)': 'green', 'var(--danger)': 'danger', 'var(--purple)': 'purple' };

function liabTypeInfo(type) {
  var map = {
    mortgage:        { emoji: 'home', label: 'Mortgage',        color: 'var(--n300)',    group: 'mortgage' },
    car_loan:        { emoji: 'car', label: 'Car Loan',        color: 'var(--warn)',    group: 'secured' },
    investment_loan: { emoji: 'chart-bar', label: 'Investment Loan', color: 'var(--success)', group: 'secured' },
    credit_card:     { emoji: 'credit-card', label: 'Credit Card',     color: 'var(--danger)',  group: 'unsecured' },
    personal_loan:   { emoji: 'coin', label: 'Personal Loan',   color: 'var(--warn)',    group: 'unsecured' },
    bnpl:            { emoji: 'device-mobile', label: 'BNPL',            color: 'var(--danger)',  group: 'bnpl' },
    hecs:            { emoji: 'school', label: 'HECS/HELP',       color: 'var(--purple)',  group: 'hecs' },
    tax_debt:        { emoji: 'alert-triangle', label: 'Tax Debt',        color: 'var(--danger)',  group: 'unsecured' },
    other:           { emoji: 'clipboard-list', label: 'Other',           color: 'var(--n300)',    group: 'unsecured' }
  };
  return map[type] || map.other;
}

function liabAvalancheHint() {
  if (!LIABILITIES.length) return '';
  var highest = null;
  LIABILITIES.forEach(function(l) {
    if (!highest || Number(l.rate) > Number(highest.rate)) highest = l;
  });
  if (!highest || !Number(highest.rate)) return '';
  return ICON('bulb') + ' Paying off ' + esc(highest.lender) + ' (' + highest.rate + '% p.a.) first saves the most interest (avalanche strategy)';
}

function liabSorted() {
  var list = LIABILITIES.slice();
  if (liabSortMode === 'rate') {
    list.sort(function(a, b) { return Number(b.rate) - Number(a.rate); });
  } else if (liabSortMode === 'balance') {
    list.sort(function(a, b) { return Number(b.balance) - Number(a.balance); });
  } else if (liabSortMode === 'due') {
    list.sort(function(a, b) { return Number(a.dueDay || 99) - Number(b.dueDay || 99); });
  }
  return list;
}

// ── Render: Summary ───────────────────────────────────────────

function liabRenderSummary() {
  var el = document.getElementById('liab-summary');
  if (!el) return;

  var total = liabTotal();
  var monthly = liabMonthlyTotal();
  var totalInt = liabTotalInterest();
  var dti = liabDTI();
  var hint = liabAvalancheHint();

  var groups = { mortgage: 0, secured: 0, unsecured: 0, bnpl: 0, hecs: 0 };
  liabAllMortgages().forEach(function(m) { groups.mortgage += m.balance; });
  LIABILITIES.forEach(function(l) {
    var g = liabTypeInfo(l.type).group;
    if (groups[g] !== undefined) groups[g] += Number(l.balance) || 0;
    else groups.unsecured += Number(l.balance) || 0;
  });
  var highest = null;
  LIABILITIES.forEach(function(l) {
    if (!highest || Number(l.rate) > Number(highest.rate)) highest = l;
  });

  var dtiHtml = '';
  if (dti !== null) {
    var dtiTone = dti <= 36 ? 'tone-green' : dti <= 50 ? 'tone-amber' : 'tone-danger';
    var dtiLabel = dti <= 36 ? 'Healthy' : dti <= 50 ? 'Elevated' : 'High risk';
    dtiHtml = '<div class="liab-dti">'
      + '<span class="liab-sum-lbl">Debt-to-Income Ratio</span>'
      + '<span class="liab-dti-val ' + dtiTone + '">' + dti.toFixed(1) + '%</span>'
      + '<span class="liab-dti-badge ' + dtiTone + '">' + dtiLabel + '</span>'
      + '</div>';
  }

  var groupDefs = [
    { key: 'mortgage',  label: ICON('home') + ' Mortgage' },
    { key: 'secured',   label: ICON('lock') + ' Secured' },
    { key: 'unsecured', label: ICON('credit-card') + ' Unsecured' },
    { key: 'bnpl',      label: ICON('device-mobile') + ' BNPL' },
    { key: 'hecs',      label: ICON('school') + ' HECS' }
  ];
  var groupHtml = '';
  groupDefs.forEach(function(g) {
    var val = groups[g.key];
    if (!val) return;
    var pct = total ? (val / total * 100).toFixed(1) : 0;
    groupHtml += '<div class="liab-grp">'
      + '<div class="liab-grp-hd">'
      + '<span class="tone-muted">' + g.label + '</span>'
      + '<span class="liab-mono tone-danger">' + fmt(val) + ' <span class="tone-muted">(' + pct + '%)</span></span>'
      + '</div>'
      + '<div class="prog-track liab-track-6"><div class="prog-fill danger" style="width:' + pct + '%"></div></div>'
      + '</div>';
  });

  var highestRateHtml = '';
  if (highest && Number(highest.rate) > 0) {
    var rTone = liabRateTone(Number(highest.rate));
    highestRateHtml = '<div class="liab-hi">'
      + '<span class="liab-hi-ico">' + ICON('alert-triangle') + '</span>'
      + '<span class="liab-sum-lbl">Highest rate:</span>'
      + '<strong class="liab-mono ' + rTone + '">' + highest.rate + '% p.a.</strong>'
      + '<span class="liab-hi-lender">' + esc(highest.lender) + '</span>'
      + '</div>';
  }

  var totalIntHtml = '';
  if (totalInt > 0) {
    totalIntHtml = '<div class="liab-tot-int">Total interest payable (manual): <span class="liab-mono tone-danger">' + fmt(totalInt) + '</span></div>';
  }

  var hintHtml = '';
  if (hint) {
    hintHtml = '<div class="liab-hint">' + hint + '</div>';
  }

  el.innerHTML = '<div class="liab-kpis">'
    + '<div>'
    + '<div class="liab-kpi-lbl">Total Liabilities</div>'
    + '<div class="liab-kpi-val tone-danger">' + fmt(total) + '</div>'
    + '</div>'
    + '<div>'
    + '<div class="liab-kpi-lbl">Monthly Payments</div>'
    + '<div class="liab-kpi-val">' + fmt(monthly) + '<span class="liab-kpi-unit">/mo</span></div>'
    + '</div>'
    + '</div>'
    + totalIntHtml
    + dtiHtml
    + '<hr class="liab-hr"/>'
    + groupHtml
    + highestRateHtml
    + hintHtml;
}

// ── Render: Mortgages ─────────────────────────────────────────

function liabRenderMortgages() {
  var el = document.getElementById('liab-mortgages');
  if (!el) return;
  var mortgages = liabAllMortgages();
  if (!mortgages.length) {
    el.innerHTML = '<div class="empty empty--pad12"><div class="ei">' + ICON('home-2') + '</div><p>No mortgage data. Add details in the <a href="#" onclick="go(\'mortgage\');return false;">Mortgage tab</a>.</p></div>';
    return;
  }
  var html = '';
  mortgages.forEach(function(m) {
    var rTone = liabRateTone(m.rate);
    var progHtml = '';
    if (m.originalBalance && m.originalBalance > m.balance) {
      var paidPct = ((m.originalBalance - m.balance) / m.originalBalance * 100).toFixed(1);
      progHtml = '<div class="liab-prog liab-prog--12">'
        + '<div class="liab-prog-hd"><span>Principal repaid</span><span>' + paidPct + '%</span></div>'
        + '<div class="prog-track liab-track-6"><div class="prog-fill" style="width:' + paidPct + '%"></div></div>'
        + '</div>';
    }
    html += '<div class="card liab-card">'
      + '<div class="liab-mg-hd">'
      + '<span class="liab-pill liab-pill--mg">' + ICON('home') + ' Mortgage</span>'
      + '<span class="liab-ro">Read-only &middot; <a href="#" onclick="go(\'mortgage\');return false;" class="tone-pink">Edit in Mortgage tab →</a></span>'
      + '</div>'
      + '<div class="liab-lender liab-lender--12">' + esc(m.lender) + '</div>'
      + '<div class="liab-stats">'
      + '<div><div class="liab-stat-lbl">Balance</div><div class="liab-stat-val tone-danger">' + fmt(m.balance) + '</div></div>'
      + '<div><div class="liab-stat-lbl">Interest Rate</div><div class="liab-stat-val ' + rTone + '">' + m.rate + '% p.a.</div></div>'
      + '<div><div class="liab-stat-lbl">Monthly Payment</div><div class="liab-stat-pay">' + fmt(m.payment) + '</div></div>'
      + '<div><div class="liab-stat-lbl">Payoff</div><div class="liab-stat-txt">' + (m.payoffDate || 'Interest Only') + '</div></div>'
      + '</div>'
      + progHtml
      + '</div>';
  });
  el.innerHTML = html;
}

// ── Render: List ──────────────────────────────────────────────

function liabRenderList() {
  var el = document.getElementById('liab-list');
  if (!el) return;
  var list = liabSorted();
  if (!list.length) {
    el.innerHTML = '<div class="empty liab-empty"><div class="ei">' + ICON('scale') + '</div><p class="liab-empty-p">No other liabilities added.</p></div>';
    return;
  }
  var html = '';
  list.forEach(function(l) {
    var realIdx = LIABILITIES.findIndex(function(x) { return x.id === l.id; });
    var info = liabTypeInfo(l.type);
    var rTone = liabRateTone(Number(l.rate));
    var toneKey = LIAB_TONES[info.color] || 'slate';
    var isHecs = l.type === 'hecs';

    // Progress bar
    var progHtml = '';
    if (l.originalBalance && Number(l.originalBalance) > Number(l.balance)) {
      var paidPct = ((Number(l.originalBalance) - Number(l.balance)) / Number(l.originalBalance) * 100).toFixed(1);
      progHtml = '<div class="liab-prog">'
        + '<div class="liab-prog-hd"><span>Principal repaid</span><span>' + paidPct + '%</span></div>'
        + '<div class="prog-track liab-track-6"><div class="prog-fill" style="width:' + paidPct + '%"></div></div>'
        + '</div>';
    }

    // Credit utilisation
    var utilHtml = '';
    if ((l.type === 'credit_card' || l.type === 'bnpl') && l.creditLimit && Number(l.creditLimit) > 0) {
      var util = (Number(l.balance) / Number(l.creditLimit) * 100).toFixed(0);
      var utilColor = util <= 30 ? 'var(--success)' : util <= 70 ? 'var(--warn)' : 'var(--danger)';
      var utilTone = util <= 30 ? 'tone-green' : util <= 70 ? 'tone-amber' : 'tone-danger';
      utilHtml = '<div class="liab-util">'
        + '<div class="liab-util-hd">'
        + '<span class="tone-muted">Credit utilisation</span>'
        + '<span class="liab-mono ' + utilTone + '">' + util + '%' + (util > 70 ? ' — High' : '') + '</span>'
        + '</div>'
        + '<div class="prog-track liab-track-5"><div class="liab-util-fill" style="width:' + Math.min(util,100) + '%;background:' + utilColor + '"></div></div>'
        + '<div class="field-hint">Limit: ' + fmt(Number(l.creditLimit)) + '</div>'
        + '</div>';
    }

    // Fixed rate expiry
    var fixedHtml = '';
    if (l.rateType === 'fixed' && l.fixedExpiry) {
      try {
        var expDate = new Date(l.fixedExpiry);
        var daysUntil = Math.round((expDate - new Date()) / (1000 * 60 * 60 * 24));
        if (daysUntil >= 0 && daysUntil <= 90) {
          fixedHtml = '<div class="liab-fixed-warn">'
            + ICON('alert-triangle') + ' Fixed rate expires ' + expDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) + ' (' + daysUntil + ' days)'
            + '</div>';
        } else if (daysUntil > 90) {
          fixedHtml = '<div class="liab-note">Fixed until ' + expDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) + '</div>';
        }
      } catch(e) {}
    }

    // Payoff date
    var payoffHtml = '';
    var payoffDate = liabDebtFreeDate(l);
    if (payoffDate) {
      payoffHtml = '<div class="liab-note">Payoff: <span class="liab-strong tone-green">' + payoffDate + '</span></div>';
    }

    // HECS note
    var hecsHtml = '';
    if (isHecs) {
      hecsHtml = '<div class="liab-hecs">'
        + ICON('school') + ' HECS repayments are made via ATO payroll deduction above the income threshold. No standard amortisation schedule applies.'
        + '</div>';
    }

    // Amortisation schedule
    var scheduleHtml = '';
    if (!isHecs && Number(l.termMonths) > 0) {
      var sched = liabAmortise(Number(l.balance), Number(l.rate), Number(l.payment), Number(l.termMonths));
      var schedId = 'liab-sched-' + l.id;
      var schedSummary = '';
      if (sched.negAmort) {
        schedSummary = '<div class="liab-sched-warn liab-sched-warn--neg tone-danger">' + sched.warning + '</div>';
      } else if (sched.warning) {
        schedSummary = '<div class="liab-sched-warn tone-amber">' + sched.warning + '</div>';
      } else if (sched.rows.length) {
        schedSummary = '<div class="liab-sched-sum">'
          + '<span class="tone-muted">Total interest: <span class="liab-mono tone-danger">' + fmt(sched.totalInterest) + '</span></span>'
          + '<span class="tone-muted">Total cost: <span class="liab-mono">' + fmt(sched.totalCost) + '</span></span>'
          + '<span class="tone-muted">Payoff: <span class="liab-strong tone-green">' + sched.payoffDate + '</span></span>'
          + '</div>';
      }

      var tableHtml = '';
      if (sched.rows.length && !sched.negAmort) {
        tableHtml = '<div id="' + schedId + '" class="liab-sch-wrap" style="display:none">'
          + '<table class="liab-sch-tbl">'
          + '<thead><tr class="liab-sch-hrow">'
          + '<th class="liab-sch-th liab-sch-th--mo">Month</th>'
          + '<th class="liab-sch-th liab-sch-num">Payment</th>'
          + '<th class="liab-sch-th liab-sch-num">Principal</th>'
          + '<th class="liab-sch-th liab-sch-num">Interest</th>'
          + '<th class="liab-sch-th liab-sch-num">Balance</th>'
          + '</tr></thead><tbody>';
        sched.rows.forEach(function(row, idx) {
          var rowCls = idx % 2 === 0 ? '' : ' class="liab-sch-alt"';
          tableHtml += '<tr' + rowCls + '>'
            + '<td class="liab-sch-td liab-sch-mo">' + row.label + '</td>'
            + '<td class="liab-sch-td liab-sch-num">' + fmt(row.payment) + '</td>'
            + '<td class="liab-sch-td liab-sch-num tone-green">' + fmt(row.principal) + '</td>'
            + '<td class="liab-sch-td liab-sch-num tone-danger">' + fmt(row.interest) + '</td>'
            + '<td class="liab-sch-td liab-sch-num">' + fmt(row.balance) + '</td>'
            + '</tr>';
        });
        tableHtml += '</tbody></table></div>';
      }

      scheduleHtml = '<div class="liab-sched">'
        + schedSummary
        + (tableHtml
          ? '<button onclick="liabToggleSched(\'' + l.id + '\')" id="btn-sched-' + l.id + '" class="liab-sched-btn">View Schedule ▾</button>'
          : '')
        + tableHtml
        + '</div>';
    }

    // Rate type badge
    var rateBadge = l.rateType === 'fixed'
      ? '<span class="liab-badge liab-badge--fixed">Fixed</span>'
      : '<span class="liab-badge liab-badge--var">Variable</span>';

    // Due day label
    var dueSuffix = l.dueDay == 1 ? 'st' : l.dueDay == 2 ? 'nd' : l.dueDay == 3 ? 'rd' : 'th';

    // Mortgage link detection
    var linkedProp = _liabLinkedMortgageProp(l.id);
    var mortgageLinkBadge = linkedProp
      ? '<span class="liab-badge liab-badge--link">' + ICON('link') + ' Mortgage Linked</span>'
      : '';
    var mortgageSyncNote = linkedProp
      ? '<div class="liab-sync">'
        + ICON('link') + ' Balance auto-syncs from the <a href="#" onclick="go(\'mortgage\');return false;" class="tone-green">Mortgage tab</a>'
        + ' · <strong>' + esc(linkedProp.name || 'Primary Property') + '</strong>'
        + '</div>'
      : '';

    html += '<div class="card liab-card liab-card--' + toneKey + '">'
      + '<div class="liab-card-hd">'
      + '<div class="liab-badges">'
      + '<span class="liab-pill ' + (toneKey === 'slate' ? 'liab-tone-slate' : 'tone-' + toneKey) + '">' + info.emoji + ' ' + info.label + '</span>'
      + rateBadge
      + mortgageLinkBadge
      + '</div>'
      + '<div class="liab-acts">'
      + '<button onclick="liabOpenModal(' + realIdx + ')" class="liab-act tone-pink">' + ICON('pencil') + '</button>'
      + '<button onclick="liabConfirmDelete(\'' + l.id + '\')" class="liab-act tone-danger">' + ICON('trash') + '</button>'
      + '</div>'
      + '</div>'
      + '<div class="liab-lender">' + esc(l.lender) + '</div>'
      + '<div class="liab-stats">'
      + '<div><div class="liab-stat-lbl">Balance</div><div class="liab-stat-val tone-danger">' + fmt(Number(l.balance)) + '</div></div>'
      + '<div><div class="liab-stat-lbl">' + (isHecs ? 'CPI Indexation' : 'Interest Rate') + '</div><div class="liab-stat-val ' + rTone + '">' + l.rate + (isHecs ? '% CPI est.' : '% p.a.') + '</div></div>'
      + '<div><div class="liab-stat-lbl">' + (isHecs ? 'Annual Repayment' : 'Monthly Payment') + '</div><div class="liab-stat-pay">' + fmt(Number(l.payment)) + (isHecs ? '/yr' : '/mo') + '</div></div>'
      + (!isHecs ? '<div><div class="liab-stat-lbl">Due Date</div><div class="liab-stat-txt">' + (l.dueDay ? l.dueDay + dueSuffix + ' of month' : '—') + '</div></div>' : '<div></div>')
      + '</div>'
      + progHtml
      + utilHtml
      + fixedHtml
      + payoffHtml
      + hecsHtml
      + scheduleHtml
      + mortgageSyncNote
      + (l.notes ? '<div class="liab-notes">' + esc(l.notes) + '</div>' : '')
      + '</div>';
  });
  el.innerHTML = html;
}

function liabToggleSched(id) {
  var el = document.getElementById('liab-sched-' + id);
  var btn = document.getElementById('btn-sched-' + id);
  if (!el) return;
  var visible = el.style.display !== 'none';
  el.style.display = visible ? 'none' : 'block';
  if (btn) btn.textContent = visible ? 'View Schedule ▾' : 'Hide Schedule ▴';
}

// ── Full page render ──────────────────────────────────────────

function liabRenderPage() {
  liabRenderSummary();
  if (typeof taxRenderLiabilityGroup === 'function') taxRenderLiabilityGroup();
  liabRenderMortgages();
  liabRenderList();
  renderLiabMonthlyGrid();
}

// ── Modal ─────────────────────────────────────────────────────

function liabOpenModal(idx) {
  liabEditIdx = (idx !== undefined && idx >= 0) ? idx : -1;
  var l = liabEditIdx >= 0 ? LIABILITIES[liabEditIdx] : null;

  var titleEl = document.getElementById('liab-modal-title');
  if (titleEl) titleEl.textContent = l ? 'Edit Liability' : 'Add Liability';

  var fields = {
    'liab-m-type':          l ? l.type : 'credit_card',
    'liab-m-lender':        l ? l.lender : '',
    'liab-m-balance':       l ? l.balance : '',
    'liab-m-original':      l ? (l.originalBalance || '') : '',
    'liab-m-opened':        l ? (l.openedDate || '') : '',
    'liab-m-rate':          l ? l.rate : '',
    'liab-m-rate-type':     l ? (l.rateType || 'variable') : 'variable',
    'liab-m-fixed-expiry':  l ? (l.fixedExpiry || '') : '',
    'liab-m-payment':       l ? l.payment : '',
    'liab-m-due-day':       l ? (l.dueDay || '') : '',
    'liab-m-term':          l ? (l.termMonths || '') : '',
    'liab-m-credit-limit':  l ? (l.creditLimit || '') : '',
    'liab-m-notes':         l ? (l.notes || '') : ''
  };
  Object.keys(fields).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = fields[id];
  });
  var cbEl = document.getElementById('liab-m-add-to-bills');
  if (cbEl) cbEl.checked = l ? !!l.addToBills : false;

  liabModalTypeChange();
  liabModalRateTypeChange();

  var modal = document.getElementById('liab-modal');
  if (modal) modal.classList.add('open');
}

function liabCloseModal() {
  var modal = document.getElementById('liab-modal');
  if (modal) modal.classList.remove('open');
  liabEditIdx = -1;
}

function liabModalTypeChange() {
  var typeEl = document.getElementById('liab-m-type');
  if (!typeEl) return;
  var type = typeEl.value;
  var isHecs = type === 'hecs';
  var isCcBnpl = type === 'credit_card' || type === 'bnpl';

  var show = function(id, visible) {
    var el = document.getElementById(id);
    if (el) el.style.display = visible ? 'block' : 'none';
  };
  show('liab-m-due-row', !isHecs);
  show('liab-m-credit-limit-row', isCcBnpl);
  show('liab-m-sched-note', isHecs);

  var rateLabel = document.getElementById('liab-m-rate-label');
  var paymentLabel = document.getElementById('liab-m-payment-label');
  if (rateLabel) rateLabel.textContent = isHecs ? 'CPI Indexation Rate (% est.)' : 'Interest Rate (% p.a.)';
  if (paymentLabel) paymentLabel.textContent = isHecs ? 'Est. Annual Payroll Repayment (AUD)' : 'Minimum Monthly Payment (AUD)';
}

function liabModalRateTypeChange() {
  var rtEl = document.getElementById('liab-m-rate-type');
  if (!rtEl) return;
  var el = document.getElementById('liab-m-fixed-expiry-row');
  if (el) el.style.display = rtEl.value === 'fixed' ? 'block' : 'none';
}

function liabSave() {
  var get = function(id) { var el = document.getElementById(id); return el ? el.value : ''; };
  var type = get('liab-m-type');
  var lender = get('liab-m-lender').trim();
  var balance = parseFloat(get('liab-m-balance')) || 0;
  var originalBalance = parseFloat(get('liab-m-original')) || null;
  var openedDate = get('liab-m-opened') || null;
  var rate = parseFloat(get('liab-m-rate')) || 0;
  var rateType = get('liab-m-rate-type');
  var fixedExpiry = get('liab-m-fixed-expiry') || null;
  var payment = parseFloat(get('liab-m-payment')) || 0;
  var dueDay = parseInt(get('liab-m-due-day')) || null;
  var termMonths = parseInt(get('liab-m-term')) || null;
  var creditLimit = parseFloat(get('liab-m-credit-limit')) || null;
  var notes = get('liab-m-notes').trim();
  var cbEl = document.getElementById('liab-m-add-to-bills');
  var addToBills = cbEl ? cbEl.checked : false;

  if (!lender) { toast('❌ Enter a lender name'); return; }
  if (!balance) { toast('❌ Enter a current balance'); return; }

  var record = {
    id: liabEditIdx >= 0 ? LIABILITIES[liabEditIdx].id : 'liab_' + Date.now(),
    type: type,
    lender: lender,
    balance: balance,
    originalBalance: originalBalance,
    openedDate: openedDate,
    rate: rate,
    rateType: rateType,
    fixedExpiry: fixedExpiry,
    payment: payment,
    dueDay: dueDay,
    termMonths: termMonths,
    creditLimit: creditLimit,
    notes: notes,
    addToBills: addToBills,
    createdAt: liabEditIdx >= 0 ? LIABILITIES[liabEditIdx].createdAt : today()
  };

  if (liabEditIdx >= 0) {
    LIABILITIES[liabEditIdx] = record;
  } else {
    LIABILITIES.push(record);
  }
  try { save(K.liabilities, LIABILITIES); } catch(e) {}

  if (addToBills && dueDay && payment > 0 && type !== 'hecs') {
    try {
      var billMerchantKey = (typeof preprocessMerchantString === 'function' ? preprocessMerchantString(lender) : lender.toLowerCase()) || lender.toLowerCase();
      var billExists = BILLS.some(function(b) { return b.merchantKey === billMerchantKey; });
      if (!billExists) {
        var liabNextDue = (function() {
          var d = new Date();
          var day = Math.min(dueDay, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
          d.setDate(day);
          if (d < new Date(new Date().toDateString())) d.setMonth(d.getMonth() + 1);
          return d.toISOString().slice(0, 10);
        })();
        BILLS.push({
          id: 'bill_liab_' + Date.now(), merchantKey: billMerchantKey, displayName: lender,
          icon: 'building-bank', category: 'home', subcategory: 'Loan Repayment', billType: 'bill',
          frequency: 'monthly', amountType: 'fixed', amount: payment, amountTrend: 'stable',
          pendingAmountUpdate: null, nextDueDate: liabNextDue, lastSeenDate: '',
          confidence: null, source: 'manual', status: 'confirmed', isAnnual: false
        });
        save(K.bills, BILLS);
        toast('✅ Liability saved and added to Bills');
      } else {
        toast('✅ Liability saved (bill already exists)');
      }
    } catch(e) { toast('✅ Liability saved'); }
  } else {
    toast('✅ Liability saved');
  }

  liabCloseModal();
  liabRenderPage();
  if(typeof qsCheckAndAutoComplete==='function')qsCheckAndAutoComplete();
  try{if(typeof nwRecordLiabMonth==='function')nwRecordLiabMonth(_nwCurrentMonth(),liabTotal());}catch(e){}
  try{if(typeof recordNetWorthSnapshot==='function')recordNetWorthSnapshot();}catch(e){}
}

function liabConfirmDelete(id) {
  if (!confirm('Delete this liability? This cannot be undone.')) return;
  LIABILITIES = LIABILITIES.filter(function(l) { return l.id !== id; });
  try { save(K.liabilities, LIABILITIES); } catch(e) {}
  toast('🗑 Liability deleted');
  liabRenderPage();
  try{if(typeof nwRecordLiabMonth==='function')nwRecordLiabMonth(_nwCurrentMonth(),liabTotal());}catch(e){}
  try{if(typeof recordNetWorthSnapshot==='function')recordNetWorthSnapshot();}catch(e){}
}

function liabSetSort(mode) {
  liabSortMode = mode;
  ['rate', 'balance', 'due'].forEach(function(m) {
    var btn = document.getElementById('liab-sort-' + m);
    if (btn) btn.classList.toggle('active', m === mode);
  });
  liabRenderList();
}

// ══════════════════════════════════════════════════════════════
// LIABILITY MONTHLY CLOSING BALANCE GRID (Cash Tracker-style)
// ══════════════════════════════════════════════════════════════

function _liabMonthlyMonthOpts(sel) {
  var now = new Date();
  var o = '';
  for (var i = 0; i < 36; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var v = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    var l = d.toLocaleString('en-AU', { month: 'long', year: 'numeric' });
    o += '<option value="' + v + '"' + (v === sel ? ' selected' : '') + '>' + l + '</option>';
  }
  return o;
}

function _liabMonthlyAllItems() {
  var items = [];
  liabAllMortgages().forEach(function(m) {
    items.push({ id: m.id, label: m.lender, currentBalance: m.balance, icon: 'home', note: 'Balance mirrors Mortgage tab — edit there' });
  });
  LIABILITIES.forEach(function(l) {
    var info = liabTypeInfo(l.type);
    items.push({ id: l.id, label: l.lender, currentBalance: Number(l.balance) || 0, icon: info.emoji, note: '' });
  });
  return items;
}

function _liabMonthlyTotalForMonth(mo) {
  var total = 0;
  _liabMonthlyAllItems().forEach(function(item) {
    var hist = LIAB_MONTHLY[item.id] || {};
    total += hist[mo] !== undefined ? hist[mo] : item.currentBalance;
  });
  return total;
}

function _liabMonthlyUpdateNW(mo) {
  try {
    if (typeof nwRecordLiabMonth !== 'function') return;
    nwRecordLiabMonth(mo, _liabMonthlyTotalForMonth(mo));
    if (typeof recordNetWorthSnapshot === 'function') recordNetWorthSnapshot();
  } catch(e) {}
}

function liabMonthSave(itemId) {
  var mo  = (document.getElementById('liab-mo-inp-' + itemId) || {}).value;
  var bal = parseFloat((document.getElementById('liab-mo-bal-' + itemId) || {}).value);
  if (!mo || isNaN(bal)) { toast('⚠️ Select month and enter balance'); return; }
  if (!LIAB_MONTHLY[itemId]) LIAB_MONTHLY[itemId] = {};
  LIAB_MONTHLY[itemId][mo] = bal;
  save(K.liabMonthly, LIAB_MONTHLY);
  _liabMonthlyUpdateNW(mo);
  renderLiabMonthlyGrid();
  var balInp = document.getElementById('liab-mo-bal-' + itemId);
  if (balInp) balInp.value = '';
  toast('✅ Balance saved');
}

function liabMonthUpdate(itemId, mo, value) {
  var v = parseFloat(value);
  if (!LIAB_MONTHLY[itemId]) LIAB_MONTHLY[itemId] = {};
  if (!isNaN(v)) {
    LIAB_MONTHLY[itemId][mo] = v;
  } else {
    delete LIAB_MONTHLY[itemId][mo];
  }
  save(K.liabMonthly, LIAB_MONTHLY);
  _liabMonthlyUpdateNW(mo);
}

function liabMonthDel(itemId, mo) {
  if (LIAB_MONTHLY[itemId]) delete LIAB_MONTHLY[itemId][mo];
  save(K.liabMonthly, LIAB_MONTHLY);
  _liabMonthlyUpdateNW(mo);
  renderLiabMonthlyGrid();
}

function renderLiabMonthlyGrid() {
  var el = document.getElementById('liab-monthly-grid');
  if (!el) return;

  var items = _liabMonthlyAllItems();
  if (!items.length) {
    el.innerHTML = '<div class="card mb sp-mo-empty">Add mortgage or liabilities above to start tracking monthly balances.</div>';
    return;
  }

  var curMo = typeof _nwCurrentMonth === 'function' ? _nwCurrentMonth() : new Date().toISOString().slice(0, 7);
  var html = '<div class="section-label liab-mo-title">' + ICON('calendar') + ' Monthly Liability Balances</div>'
    + '<div class="sp-mo-desc">Record each liability\'s closing balance by month — tracks debt reduction over time and links to Net Worth history.</div>';

  items.forEach(function(item) {
    var data = LIAB_MONTHLY[item.id] || {};
    var months = Object.keys(data).sort();
    var rows = '';
    if (!months.length) {
      rows = '<div class="sp-mo-none">No entries yet.</div>';
    } else {
      months.forEach(function(m, i) {
        var bal = data[m];
        var prev = i > 0 ? data[months[i - 1]] : null;
        var diff = prev !== null ? bal - prev : null;
        var diffStr = diff === null ? '' : (diff >= 0 ? '+' : '') + fmt(diff);
        // For liabilities: going down = green (good), up = red (bad)
        var diffTone = diff === null ? '' : diff <= 0 ? 'tone-green' : 'tone-danger';
        var ml = new Date(m + '-02').toLocaleString('en-AU', { month: 'short', year: 'numeric' });
        rows += '<div class="sp-mo-row">'
          + '<div class="sp-mo-month">' + ml + '</div>'
          + '<input type="number" step="1000" value="' + bal + '" inputmode="decimal"'
          + ' onchange="liabMonthUpdate(\'' + item.id + '\',\'' + m + '\',this.value)"'
          + ' class="sp-mo-input"/>'
          + (diffStr ? '<div class="sp-mo-diff ' + diffTone + '">' + diffStr + '</div>' : '<div class="sp-mo-diff-empty"></div>')
          + '<button onclick="liabMonthDel(\'' + item.id + '\',\'' + m + '\')" class="sp-mo-del">' + ICON('trash') + '</button>'
          + '</div>';
      });
    }

    html += '<div class="sp-mo-card">'
      + '<div class="sp-mo-hd">'
      + '<span class="liab-mo-ico">' + item.icon + '</span>'
      + '<div class="sp-mo-main">'
      + '<div class="sp-mo-fund">' + esc(item.label) + '</div>'
      + (item.note ? '<div class="liab-mo-note">' + item.note + '</div>' : '')
      + '</div>'
      + '<div class="sp-mo-cur">Current: <span class="sp-mo-cur-val tone-danger">' + fmt(item.currentBalance) + '</span></div>'
      + '</div>'
      + rows
      + '<div class="sp-mo-add">'
      + '<div class="sp-field"><label class="sp-mo-lbl">Month</label>'
      + '<select id="liab-mo-inp-' + item.id + '" class="sp-mo-sel">' + _liabMonthlyMonthOpts(curMo) + '</select></div>'
      + '<div class="sp-field sp-field--sm"><label class="sp-mo-lbl">Closing Balance (AUD)</label>'
      + '<input type="number" id="liab-mo-bal-' + item.id + '" placeholder="0" step="1000" inputmode="decimal" class="sp-input-16"/></div>'
      + '<button class="btn btn-primary btn-sm sp-mo-save" onclick="liabMonthSave(\'' + item.id + '\')">Save</button>'
      + '</div>'
      + '</div>';
  });

  el.innerHTML = '<div class="card mb">' + html + '</div>';
}
