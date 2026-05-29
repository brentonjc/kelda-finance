// ══════════════════════════════════════════════════════════════
// LIABILITIES PAGE
// ══════════════════════════════════════════════════════════════

var liabSortMode = 'rate';
var liabEditIdx = -1;

// ── Data helpers ──────────────────────────────────────────────

function liabAllMortgages() {
  var m = MORTGAGE;
  if (!m || !m.balance) return [];
  var r = (m.rate || 0) / 100 / 12;
  var n = (m.years || 0) * 12;
  var isIO = m.reptype === 'io';
  var repmt = 0;
  if (isIO) {
    repmt = m.balance * r;
  } else if (r && n) {
    repmt = m.balance * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }
  var payoffDate = '';
  if (!isIO && r && n) {
    var d = new Date();
    d.setMonth(d.getMonth() + n);
    payoffDate = d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
  }
  return [{
    id: 'mortgage_primary',
    type: 'mortgage',
    lender: m.lenderName || 'Home Loan',
    balance: Number(m.balance) || 0,
    originalBalance: Number(m.original) || 0,
    rate: Number(m.rate) || 0,
    rateType: 'variable',
    payment: repmt,
    dueDay: 1,
    termMonths: n,
    payoffDate: payoffDate,
    homeValue: Number(m.homeValue) || 0,
    readonly: true
  }];
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
    result.warning = '⚠️ Minimum payment does not cover interest — balance is growing';
    return result;
  }

  var maxMonths = termMonths > 0 ? Math.max(termMonths, 600) : 600;
  for (var i = 1; i <= maxMonths && bal > 0.01; i++) {
    var interest = bal * r;
    var principal = Math.min(monthlyPayment - interest, bal);
    if (principal < 0) {
      result.negAmort = true;
      result.warning = '⚠️ Minimum payment does not cover interest — balance is growing';
      break;
    }
    bal = Math.max(0, bal - principal);
    d.setMonth(d.getMonth() + 1);
    var pmt = (bal < 0.01) ? (principal + interest) : monthlyPayment;
    result.rows.push({ month: i, label: d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }), payment: pmt, principal: principal, interest: interest, balance: bal });
    result.totalInterest += interest;
    if (i === termMonths && bal > 0.01) {
      result.warning = '⚠️ Minimum payment will not pay off this loan in the stated term';
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

function liabRateColor(rate) {
  if (rate === 0) return 'var(--success)';
  if (rate < 5) return 'var(--success)';
  if (rate <= 15) return 'var(--warn)';
  return 'var(--danger)';
}

function liabTypeInfo(type) {
  var map = {
    mortgage:        { emoji: '🏠', label: 'Mortgage',        color: 'var(--n300)',    group: 'mortgage' },
    car_loan:        { emoji: '🚗', label: 'Car Loan',        color: 'var(--warn)',    group: 'secured' },
    investment_loan: { emoji: '📊', label: 'Investment Loan', color: 'var(--success)', group: 'secured' },
    credit_card:     { emoji: '💳', label: 'Credit Card',     color: 'var(--danger)',  group: 'unsecured' },
    personal_loan:   { emoji: '💰', label: 'Personal Loan',   color: 'var(--warn)',    group: 'unsecured' },
    bnpl:            { emoji: '📱', label: 'BNPL',            color: 'var(--danger)',  group: 'bnpl' },
    hecs:            { emoji: '🎓', label: 'HECS/HELP',       color: 'var(--purple)',  group: 'hecs' },
    tax_debt:        { emoji: '⚠️', label: 'Tax Debt',        color: 'var(--danger)',  group: 'unsecured' },
    other:           { emoji: '📋', label: 'Other',           color: 'var(--n300)',    group: 'unsecured' }
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
  return '💡 Paying off ' + esc(highest.lender) + ' (' + highest.rate + '% p.a.) first saves the most interest (avalanche strategy)';
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
    var dtiColor = dti <= 36 ? 'var(--success)' : dti <= 50 ? 'var(--warn)' : 'var(--danger)';
    var dtiLabel = dti <= 36 ? 'Healthy' : dti <= 50 ? 'Elevated' : 'High risk';
    dtiHtml = '<div style="display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px 14px;background:var(--card2);border-radius:10px;flex-wrap:wrap">'
      + '<span style="font-size:.78rem;color:var(--muted)">Debt-to-Income Ratio</span>'
      + '<span style="font-family:var(--font-mono);font-weight:700;color:' + dtiColor + ';margin-left:auto">' + dti.toFixed(1) + '%</span>'
      + '<span style="font-size:.72rem;padding:2px 8px;background:' + dtiColor + '22;color:' + dtiColor + ';border-radius:12px">' + dtiLabel + '</span>'
      + '</div>';
  }

  var groupDefs = [
    { key: 'mortgage',  label: '🏠 Mortgage' },
    { key: 'secured',   label: '🔒 Secured' },
    { key: 'unsecured', label: '💳 Unsecured' },
    { key: 'bnpl',      label: '📱 BNPL' },
    { key: 'hecs',      label: '🎓 HECS' }
  ];
  var groupHtml = '';
  groupDefs.forEach(function(g) {
    var val = groups[g.key];
    if (!val) return;
    var pct = total ? (val / total * 100).toFixed(1) : 0;
    groupHtml += '<div style="margin-bottom:10px">'
      + '<div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:4px">'
      + '<span style="color:var(--muted)">' + g.label + '</span>'
      + '<span style="font-family:var(--font-mono);color:var(--danger)">' + fmt(val) + ' <span style="color:var(--muted)">(' + pct + '%)</span></span>'
      + '</div>'
      + '<div class="prog-track" style="height:6px"><div class="prog-fill" style="width:' + pct + '%;background:var(--danger)"></div></div>'
      + '</div>';
  });

  var highestRateHtml = '';
  if (highest && Number(highest.rate) > 0) {
    var rColor = liabRateColor(Number(highest.rate));
    highestRateHtml = '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:10px;margin-top:10px;flex-wrap:wrap">'
      + '<span style="font-size:1rem">⚠️</span>'
      + '<span style="font-size:.78rem;color:var(--muted)">Highest rate:</span>'
      + '<strong style="font-family:var(--font-mono);color:' + rColor + '">' + highest.rate + '% p.a.</strong>'
      + '<span style="font-size:.78rem;color:var(--text)">' + esc(highest.lender) + '</span>'
      + '</div>';
  }

  var totalIntHtml = '';
  if (totalInt > 0) {
    totalIntHtml = '<div style="font-size:.76rem;color:var(--muted);margin-top:6px">Total interest payable (manual): <span style="font-family:var(--font-mono);color:var(--danger)">' + fmt(totalInt) + '</span></div>';
  }

  var hintHtml = '';
  if (hint) {
    hintHtml = '<div style="margin-top:12px;padding:10px 14px;background:rgba(129,140,248,.08);border:1px solid rgba(129,140,248,.2);border-radius:10px;font-size:.78rem;color:var(--muted)">' + hint + '</div>';
  }

  el.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px">'
    + '<div>'
    + '<div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:4px">Total Liabilities</div>'
    + '<div style="font-family:var(--font-mono);font-size:2rem;font-weight:700;color:var(--danger)">' + fmt(total) + '</div>'
    + '</div>'
    + '<div>'
    + '<div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:4px">Monthly Payments</div>'
    + '<div style="font-family:var(--font-mono);font-size:2rem;font-weight:700">' + fmt(monthly) + '<span style="font-size:1rem;color:var(--muted)">/mo</span></div>'
    + '</div>'
    + '</div>'
    + totalIntHtml
    + dtiHtml
    + '<hr style="border:none;border-top:1px solid rgba(255,255,255,.07);margin:16px 0"/>'
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
    el.innerHTML = '<div class="empty" style="padding:12px 0"><div class="ei">🏡</div><p>No mortgage data. Add details in the <a href="#" onclick="go(\'mortgage\');return false;">Mortgage tab</a>.</p></div>';
    return;
  }
  var html = '';
  mortgages.forEach(function(m) {
    var rColor = liabRateColor(m.rate);
    var progHtml = '';
    if (m.originalBalance && m.originalBalance > m.balance) {
      var paidPct = ((m.originalBalance - m.balance) / m.originalBalance * 100).toFixed(1);
      progHtml = '<div style="margin-top:12px">'
        + '<div style="display:flex;justify-content:space-between;font-size:.7rem;color:var(--muted);margin-bottom:4px"><span>Principal repaid</span><span>' + paidPct + '%</span></div>'
        + '<div class="prog-track" style="height:6px"><div class="prog-fill" style="width:' + paidPct + '%;background:var(--success)"></div></div>'
        + '</div>';
    }
    html += '<div class="card" style="margin-bottom:12px;border-left:3px solid var(--n300)">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">'
      + '<span style="background:rgba(98,120,160,.15);color:var(--n300);padding:3px 10px;border-radius:20px;font-size:.72rem;font-weight:700">🏠 Mortgage</span>'
      + '<span style="font-size:.7rem;color:var(--muted);margin-left:auto">Read-only &middot; <a href="#" onclick="go(\'mortgage\');return false;" style="color:var(--primary)">Edit in Mortgage tab →</a></span>'
      + '</div>'
      + '<div style="font-size:1rem;font-weight:600;margin-bottom:12px">' + esc(m.lender) + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">'
      + '<div><div style="font-size:.68rem;color:var(--muted);margin-bottom:2px">Balance</div><div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:var(--danger)">' + fmt(m.balance) + '</div></div>'
      + '<div><div style="font-size:.68rem;color:var(--muted);margin-bottom:2px">Interest Rate</div><div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:' + rColor + '">' + m.rate + '% p.a.</div></div>'
      + '<div><div style="font-size:.68rem;color:var(--muted);margin-bottom:2px">Monthly Payment</div><div style="font-family:var(--font-mono);font-size:1rem;font-weight:600">' + fmt(m.payment) + '</div></div>'
      + '<div><div style="font-size:.68rem;color:var(--muted);margin-bottom:2px">Payoff</div><div style="font-size:.9rem;font-weight:600">' + (m.payoffDate || 'Interest Only') + '</div></div>'
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
    el.innerHTML = '<div class="empty" style="padding:32px 0;text-align:center"><div class="ei">⚖️</div><p style="color:var(--muted)">No other liabilities added.</p></div>';
    return;
  }
  var html = '';
  list.forEach(function(l) {
    var realIdx = LIABILITIES.findIndex(function(x) { return x.id === l.id; });
    var info = liabTypeInfo(l.type);
    var rColor = liabRateColor(Number(l.rate));
    var isHecs = l.type === 'hecs';

    // Progress bar
    var progHtml = '';
    if (l.originalBalance && Number(l.originalBalance) > Number(l.balance)) {
      var paidPct = ((Number(l.originalBalance) - Number(l.balance)) / Number(l.originalBalance) * 100).toFixed(1);
      progHtml = '<div style="margin-top:10px">'
        + '<div style="display:flex;justify-content:space-between;font-size:.7rem;color:var(--muted);margin-bottom:4px"><span>Principal repaid</span><span>' + paidPct + '%</span></div>'
        + '<div class="prog-track" style="height:6px"><div class="prog-fill" style="width:' + paidPct + '%;background:var(--success)"></div></div>'
        + '</div>';
    }

    // Credit utilisation
    var utilHtml = '';
    if ((l.type === 'credit_card' || l.type === 'bnpl') && l.creditLimit && Number(l.creditLimit) > 0) {
      var util = (Number(l.balance) / Number(l.creditLimit) * 100).toFixed(0);
      var utilColor = util <= 30 ? 'var(--success)' : util <= 70 ? 'var(--warn)' : 'var(--danger)';
      utilHtml = '<div style="margin-top:10px;padding:8px 12px;background:var(--card2);border-radius:8px">'
        + '<div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:4px">'
        + '<span style="color:var(--muted)">Credit utilisation</span>'
        + '<span style="font-family:var(--font-mono);color:' + utilColor + '">' + util + '%' + (util > 70 ? ' — High' : '') + '</span>'
        + '</div>'
        + '<div class="prog-track" style="height:5px"><div style="height:100%;width:' + Math.min(util,100) + '%;background:' + utilColor + ';border-radius:3px"></div></div>'
        + '<div style="font-size:.68rem;color:var(--muted);margin-top:3px">Limit: ' + fmt(Number(l.creditLimit)) + '</div>'
        + '</div>';
    }

    // Fixed rate expiry
    var fixedHtml = '';
    if (l.rateType === 'fixed' && l.fixedExpiry) {
      try {
        var expDate = new Date(l.fixedExpiry);
        var daysUntil = Math.round((expDate - new Date()) / (1000 * 60 * 60 * 24));
        if (daysUntil >= 0 && daysUntil <= 90) {
          fixedHtml = '<div style="margin-top:8px;padding:7px 12px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;font-size:.74rem;color:var(--warn)">'
            + '⚠️ Fixed rate expires ' + expDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) + ' (' + daysUntil + ' days)'
            + '</div>';
        } else if (daysUntil > 90) {
          fixedHtml = '<div style="font-size:.7rem;color:var(--muted);margin-top:4px">Fixed until ' + expDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) + '</div>';
        }
      } catch(e) {}
    }

    // Payoff date
    var payoffHtml = '';
    var payoffDate = liabDebtFreeDate(l);
    if (payoffDate) {
      payoffHtml = '<div style="font-size:.7rem;color:var(--muted);margin-top:4px">Payoff: <span style="color:var(--success);font-weight:600">' + payoffDate + '</span></div>';
    }

    // HECS note
    var hecsHtml = '';
    if (isHecs) {
      hecsHtml = '<div style="margin-top:8px;padding:8px 12px;background:rgba(129,140,248,.07);border:1px solid rgba(129,140,248,.2);border-radius:8px;font-size:.74rem;color:var(--muted)">'
        + '🎓 HECS repayments are made via ATO payroll deduction above the income threshold. No standard amortisation schedule applies.'
        + '</div>';
    }

    // Amortisation schedule
    var scheduleHtml = '';
    if (!isHecs && Number(l.termMonths) > 0) {
      var sched = liabAmortise(Number(l.balance), Number(l.rate), Number(l.payment), Number(l.termMonths));
      var schedId = 'liab-sched-' + l.id;
      var schedSummary = '';
      if (sched.negAmort) {
        schedSummary = '<div style="color:var(--danger);font-size:.76rem;font-weight:600">' + sched.warning + '</div>';
      } else if (sched.warning) {
        schedSummary = '<div style="color:var(--warn);font-size:.76rem">' + sched.warning + '</div>';
      } else if (sched.rows.length) {
        schedSummary = '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:.75rem">'
          + '<span style="color:var(--muted)">Total interest: <span style="font-family:var(--font-mono);color:var(--danger)">' + fmt(sched.totalInterest) + '</span></span>'
          + '<span style="color:var(--muted)">Total cost: <span style="font-family:var(--font-mono)">' + fmt(sched.totalCost) + '</span></span>'
          + '<span style="color:var(--muted)">Payoff: <span style="color:var(--success);font-weight:600">' + sched.payoffDate + '</span></span>'
          + '</div>';
      }

      var tableHtml = '';
      if (sched.rows.length && !sched.negAmort) {
        tableHtml = '<div id="' + schedId + '" style="display:none;overflow-x:auto;margin-top:10px;max-height:300px;overflow-y:auto;-webkit-overflow-scrolling:touch">'
          + '<table style="width:100%;font-size:.72rem;border-collapse:collapse;min-width:380px">'
          + '<thead><tr style="background:var(--card2)">'
          + '<th style="padding:6px 8px;text-align:left;font-weight:600;color:var(--muted);white-space:nowrap">Month</th>'
          + '<th style="padding:6px 8px;text-align:right;font-family:var(--font-mono);font-weight:600;color:var(--muted)">Payment</th>'
          + '<th style="padding:6px 8px;text-align:right;font-family:var(--font-mono);font-weight:600;color:var(--muted)">Principal</th>'
          + '<th style="padding:6px 8px;text-align:right;font-family:var(--font-mono);font-weight:600;color:var(--muted)">Interest</th>'
          + '<th style="padding:6px 8px;text-align:right;font-family:var(--font-mono);font-weight:600;color:var(--muted)">Balance</th>'
          + '</tr></thead><tbody>';
        sched.rows.forEach(function(row, idx) {
          var bg = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)';
          tableHtml += '<tr style="background:' + bg + '">'
            + '<td style="padding:5px 8px;color:var(--muted);white-space:nowrap">' + row.label + '</td>'
            + '<td style="padding:5px 8px;text-align:right;font-family:var(--font-mono)">' + fmt(row.payment) + '</td>'
            + '<td style="padding:5px 8px;text-align:right;font-family:var(--font-mono);color:var(--success)">' + fmt(row.principal) + '</td>'
            + '<td style="padding:5px 8px;text-align:right;font-family:var(--font-mono);color:var(--danger)">' + fmt(row.interest) + '</td>'
            + '<td style="padding:5px 8px;text-align:right;font-family:var(--font-mono)">' + fmt(row.balance) + '</td>'
            + '</tr>';
        });
        tableHtml += '</tbody></table></div>';
      }

      scheduleHtml = '<div style="margin-top:12px;border-top:1px solid rgba(255,255,255,.06);padding-top:10px">'
        + schedSummary
        + (tableHtml
          ? '<button onclick="liabToggleSched(\'' + l.id + '\')" id="btn-sched-' + l.id + '" style="margin-top:8px;background:none;border:1px solid rgba(255,255,255,.15);border-radius:8px;color:var(--muted);font-size:.74rem;padding:5px 14px;cursor:pointer;min-height:36px">View Schedule ▾</button>'
          : '')
        + tableHtml
        + '</div>';
    }

    // Rate type badge
    var rateBadge = l.rateType === 'fixed'
      ? '<span style="background:rgba(240,83,138,.12);color:var(--primary);padding:2px 8px;border-radius:12px;font-size:.68rem">Fixed</span>'
      : '<span style="background:rgba(98,120,160,.12);color:var(--n300);padding:2px 8px;border-radius:12px;font-size:.68rem">Variable</span>';

    // Due day label
    var dueSuffix = l.dueDay == 1 ? 'st' : l.dueDay == 2 ? 'nd' : l.dueDay == 3 ? 'rd' : 'th';

    html += '<div class="card" style="margin-bottom:12px;border-left:3px solid ' + info.color + '">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;gap:8px">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      + '<span style="background:' + info.color + '22;color:' + info.color + ';padding:3px 10px;border-radius:20px;font-size:.72rem;font-weight:700">' + info.emoji + ' ' + info.label + '</span>'
      + rateBadge
      + '</div>'
      + '<div style="display:flex;gap:4px;flex-shrink:0">'
      + '<button onclick="liabOpenModal(' + realIdx + ')" style="background:none;border:none;color:var(--primary);font-size:.8rem;cursor:pointer;padding:6px 8px;min-height:44px;min-width:44px;border-radius:8px">✏️</button>'
      + '<button onclick="liabConfirmDelete(\'' + l.id + '\')" style="background:none;border:none;color:var(--danger);font-size:.8rem;cursor:pointer;padding:6px 8px;min-height:44px;min-width:44px;border-radius:8px">🗑</button>'
      + '</div>'
      + '</div>'
      + '<div style="font-size:1rem;font-weight:600;margin-bottom:10px">' + esc(l.lender) + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">'
      + '<div><div style="font-size:.68rem;color:var(--muted);margin-bottom:2px">Balance</div><div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:var(--danger)">' + fmt(Number(l.balance)) + '</div></div>'
      + '<div><div style="font-size:.68rem;color:var(--muted);margin-bottom:2px">' + (isHecs ? 'CPI Indexation' : 'Interest Rate') + '</div><div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:' + rColor + '">' + l.rate + (isHecs ? '% CPI est.' : '% p.a.') + '</div></div>'
      + '<div><div style="font-size:.68rem;color:var(--muted);margin-bottom:2px">' + (isHecs ? 'Annual Repayment' : 'Monthly Payment') + '</div><div style="font-family:var(--font-mono);font-size:1rem;font-weight:600">' + fmt(Number(l.payment)) + (isHecs ? '/yr' : '/mo') + '</div></div>'
      + (!isHecs ? '<div><div style="font-size:.68rem;color:var(--muted);margin-bottom:2px">Due Date</div><div style="font-size:.9rem;font-weight:600">' + (l.dueDay ? l.dueDay + dueSuffix + ' of month' : '—') + '</div></div>' : '<div></div>')
      + '</div>'
      + progHtml
      + utilHtml
      + fixedHtml
      + payoffHtml
      + hecsHtml
      + scheduleHtml
      + (l.notes ? '<div style="margin-top:10px;font-size:.75rem;color:var(--muted);border-top:1px solid rgba(255,255,255,.06);padding-top:8px">' + esc(l.notes) + '</div>' : '')
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
  liabRenderMortgages();
  liabRenderList();
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
      var billExists = BILLS.some(function(b) { return b.name && b.name.toLowerCase() === lender.toLowerCase(); });
      if (!billExists) {
        BILLS.push({ id: 'bill_liab_' + Date.now(), name: lender, amount: payment, dueDay: dueDay, category: 'home', notes: 'From Liabilities', paid: false });
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
}

function liabConfirmDelete(id) {
  if (!confirm('Delete this liability? This cannot be undone.')) return;
  LIABILITIES = LIABILITIES.filter(function(l) { return l.id !== id; });
  try { save(K.liabilities, LIABILITIES); } catch(e) {}
  toast('🗑 Liability deleted');
  liabRenderPage();
}

function liabSetSort(mode) {
  liabSortMode = mode;
  ['rate', 'balance', 'due'].forEach(function(m) {
    var btn = document.getElementById('liab-sort-' + m);
    if (btn) btn.classList.toggle('active', m === mode);
  });
  liabRenderList();
}
