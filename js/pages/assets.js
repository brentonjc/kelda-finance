// ══════════════════════════════════════════════════════════════
// NET ASSETS PAGE
// Two donut charts: Assets · Liabilities
// ══════════════════════════════════════════════════════════════

var assetsChart    = null;
var assetsLiabChart = null;

function asToken(n) {
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '';
}

// ── Liabilities breakdown ─────────────────────────────────────
// Returns array of { label, value, color } segments from LIABILITIES + mortgage
function _assetsLiabSegments() {
  var segs = {};
  var addSeg = function(label, value, color) {
    if (!value || value <= 0) return;
    if (!segs[label]) segs[label] = { label: label, value: 0, color: color };
    segs[label].value += value;
  };

  // Mortgage from MORTGAGE object (primary property)
  var mortgageBal = Number(MORTGAGE.balance) || 0;
  if (mortgageBal > 0) addSeg('Mortgage', mortgageBal, '#EF4444');

  // Each liability by type
  (typeof LIABILITIES !== 'undefined' ? LIABILITIES : []).forEach(function(l) {
    var bal = Number(l.balance) || 0;
    if (!bal) return;
    var typeMap = {
      'car':        { label: 'Car Loan',       color: '#F97316' },
      'personal':   { label: 'Personal Loan',  color: '#F59E0B' },
      'credit':     { label: 'Credit Card',    color: '#EC4899' },
      'hecs':       { label: 'HECS / HELP',    color: '#8B5CF6' },
      'line':       { label: 'Line of Credit', color: '#06B6D4' },
      'investment': { label: 'Investment Loan',color: '#3B82F6' },
      'other':      { label: 'Other Debt',     color: '#6B7280' }
    };
    var info = typeMap[l.type] || { label: l.type || 'Other', color: '#6B7280' };
    addSeg(info.label, bal, info.color);
  });

  return Object.values(segs);
}

// ── Main render ───────────────────────────────────────────────
function renderAssets() {
  // ── Bank ──────────────────────────────────────────────────
  var months   = ctAllMonths();
  var lm       = months.length ? months[months.length - 1] : null;
  var bankRows = CT_ACCTS.map(function(a) {
    var b = lm ? ((CT[a.id] || {})[lm] || 0) : 0;
    return { label: ctLabel(a), icon: a.icon, value: b };
  });
  var bankTotal = bankRows.reduce(function(s, r) { return s + r.value; }, 0);

  document.getElementById('assets-bank').innerHTML =
    bankRows.map(function(r) {
      return '<div class="dr"><span class="dr-k">' + r.icon + ' ' + r.label + '</span><span class="dr-v">' + fmt(r.value) + '</span></div>';
    }).join('')
    + '<div class="dr" style="border-top:1.5px solid var(--border);margin-top:4px;padding-top:10px">'
    + '<span class="dr-k" style="font-weight:700">Total Bank</span>'
    + '<span class="dr-v" style="color:var(--primary)">' + fmt(bankTotal) + '</span></div>';

  // ── Super ─────────────────────────────────────────────────
  var supB = (SUPER.b && SUPER.b.balance) ? SUPER.b.balance : 0;
  var supS = (SUPER.s && SUPER.s.balance) ? SUPER.s.balance : 0;
  var supTotal = supB + supS;

  document.getElementById('assets-super').innerHTML =
    '<div class="dr"><span class="dr-k">💼 ' + getUserName('brenton') + '</span><span class="dr-v">' + fmt(supB) + '</span></div>'
    + '<div class="dr"><span class="dr-k">💼 ' + getUserName('shelley') + '</span><span class="dr-v">' + fmt(supS) + '</span></div>'
    + '<div class="dr" style="border-top:1.5px solid var(--border);margin-top:4px;padding-top:10px">'
    + '<span class="dr-k" style="font-weight:700">Total Super</span>'
    + '<span class="dr-v" style="color:var(--primary)">' + fmt(supTotal) + '</span></div>';

  // ── Property ──────────────────────────────────────────────
  var hv  = MORTGAGE.homeValue     || 0;
  var mb  = MORTGAGE.balance       || 0;
  var off = MORTGAGE.offset        || 0;
  var eq  = hv - mb;
  var pp  = MORTGAGE.purchasePrice || 0;
  var ad  = MORTGAGE.acquiredDate  || '';

  // Acquired-date helpers (inline — no dependency on mortgage.js being loaded)
  var acqHoldStr = '';
  var acqDateStr = '';
  if (ad) {
    var then = new Date(ad + 'T00:00:00'), now = new Date();
    if (!isNaN(then.getTime()) && then <= now) {
      var yrs = now.getFullYear() - then.getFullYear();
      var mos = now.getMonth() - then.getMonth();
      if (mos < 0) { yrs--; mos += 12; }
      acqHoldStr = yrs === 0 ? mos + ' mo' : (mos === 0 ? yrs + ' yr' : yrs + ' yr ' + mos + ' mo');
      acqDateStr = then.toLocaleDateString('en-AU', {day:'numeric', month:'short', year:'numeric'});
    }
  }
  var capGainHtml = '';
  if (pp > 0 && hv > 0) {
    var gain    = hv - pp;
    var gainPct = (gain / pp * 100).toFixed(1);
    var gainColor = gain >= 0 ? 'var(--success)' : 'var(--danger)';
    capGainHtml = '<div class="dr"><span class="dr-k">Purchase Price</span><span class="dr-v">' + fmt(pp) + '</span></div>'
      + '<div class="dr"><span class="dr-k">Capital Growth</span><span class="dr-v" style="color:' + gainColor + '">'
      + (gain >= 0 ? '+' : '') + fmt(gain) + ' (' + (gain >= 0 ? '+' : '') + gainPct + '%)</span></div>';
  }

  document.getElementById('assets-property').innerHTML = hv
    ? '<div class="dr"><span class="dr-k">🏡 Home Value</span><span class="dr-v">' + fmt(hv) + '</span></div>'
      + '<div class="dr"><span class="dr-k">📉 Mortgage</span><span class="dr-v" style="color:var(--danger)">-' + fmt(mb) + '</span></div>'
      + '<div class="dr"><span class="dr-k">🏦 Offset</span><span class="dr-v" style="color:var(--success)">' + fmt(off) + '</span></div>'
      + (acqDateStr ? '<div class="dr"><span class="dr-k">📅 Acquired</span><span class="dr-v">' + acqDateStr + (acqHoldStr ? ' · ' + acqHoldStr : '') + '</span></div>' : '')
      + capGainHtml
      + '<div class="dr" style="border-top:1.5px solid var(--border);margin-top:4px;padding-top:10px">'
      + '<span class="dr-k" style="font-weight:700">Net Equity</span>'
      + '<span class="dr-v" style="color:var(--primary)">' + fmt(eq) + '</span></div>'
    : '<div class="empty" style="padding:12px 0"><p>Add mortgage details</p></div>';

  // eqVal still used in grossAssets calculation — equities tile removed from page view
  var eqVal = (typeof eqTotalEquitiesValue === 'function') ? eqTotalEquitiesValue() : 0;

  // ── Liabilities summary card ──────────────────────────────
  var liabSegs  = _assetsLiabSegments();
  var totalLiab = liabSegs.reduce(function(s, l) { return s + l.value; }, 0);
  var liabSummEl = document.getElementById('assets-liabilities-summary');
  if (liabSummEl) {
    if (liabSegs.length) {
      liabSummEl.innerHTML = liabSegs.map(function(s) {
        return '<div class="dr"><span class="dr-k"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + s.color + ';margin-right:6px;vertical-align:middle"></span>' + s.label + '</span>'
          + '<span class="dr-v" style="color:var(--danger)">-' + fmt(s.value) + '</span></div>';
      }).join('')
      + '<div class="dr" style="border-top:1.5px solid var(--border);margin-top:4px;padding-top:10px">'
      + '<span class="dr-k" style="font-weight:700">Total Liabilities</span>'
      + '<span class="dr-v" style="color:var(--danger)">' + fmt(totalLiab) + '</span></div>'
      + '<div style="margin-top:10px"><a href="#" onclick="go(\'liabilities\');return false;" style="font-size:.8rem;color:var(--primary);text-decoration:none;font-weight:600">Manage Liabilities →</a></div>';
    } else {
      liabSummEl.innerHTML = '<div class="empty" style="padding:10px 0"><p>No liabilities recorded. <a href="#" onclick="go(\'liabilities\');return false;" style="color:var(--primary)">Add →</a></p></div>';
    }
  }

  // ── Totals & net ──────────────────────────────────────────
  // grossAssets = full property value (hv), not net equity.
  // Mortgage is already captured in totalLiab — deducting it here would double-count.
  var grossAssets = bankTotal + supTotal + hv + eqVal;
  var netAssets   = grossAssets - totalLiab;
  var liabRatio   = grossAssets > 0 ? Math.min(100, (totalLiab / grossAssets) * 100) : 0;
  var netColor    = netAssets >= 0 ? 'var(--success)' : 'var(--danger)';

  // ── KPI stats ─────────────────────────────────────────────
  document.getElementById('assets-stats').innerHTML =
    '<div class="stat stat-pink"><div class="sl">Net Assets</div><div class="sv">' + fmt(netAssets) + '</div><div class="ss">Assets minus liabilities</div></div>'
    + '<div class="stat stat-rose"><div class="sl">Gross Assets</div><div class="sv">' + fmt(grossAssets) + '</div><div class="ss">Total before debt</div></div>'
    + '<div class="stat stat-purple"><div class="sl">Total Liabilities</div><div class="sv" style="color:var(--danger)">' + fmt(totalLiab) + '</div><div class="ss">All debt balances</div></div>'
    + '<div class="stat stat-dark"><div class="sl">Debt Ratio</div><div class="sv">' + liabRatio.toFixed(1) + '%</div><div class="ss">Liabilities / Gross assets</div></div>';

  // ── Net Position hero card ────────────────────────────────
  var npEl = document.getElementById('assets-net-position');
  if (npEl) {
    npEl.innerHTML =
      '<div class="section-label" style="margin-bottom:14px">Net Assets Position</div>'
      + '<div style="text-align:center;padding:10px 0 16px">'
      + '<div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:6px">Net Assets</div>'
      + '<div style="font-family:var(--font-mono);font-size:2.4rem;font-weight:700;color:' + netColor + '">' + fmt(netAssets) + '</div>'
      + '</div>'
      + '<div class="dr"><span class="dr-k">Gross Assets</span><span class="dr-v" style="color:var(--success)">' + fmt(grossAssets) + '</span></div>'
      + '<div class="dr"><span class="dr-k">Total Liabilities</span><span class="dr-v" style="color:var(--danger)">-' + fmt(totalLiab) + '</span></div>'
      + '<div class="dr" style="border-top:1.5px solid var(--border);margin-top:6px;padding-top:10px">'
      + '<span class="dr-k" style="font-weight:700">Net Assets</span>'
      + '<span class="dr-v" style="font-family:var(--font-mono);font-weight:700;color:' + netColor + '">' + fmt(netAssets) + '</span></div>'
      + (totalLiab > 0
        ? '<div style="margin-top:14px"><div class="prog-track" style="height:8px"><div class="prog-fill" style="width:' + Math.min(100, liabRatio).toFixed(1) + '%;background:var(--danger)"></div></div>'
          + '<div style="display:flex;justify-content:space-between;font-size:.7rem;color:var(--muted);margin-top:3px"><span>Debt ' + liabRatio.toFixed(1) + '% of assets</span><span>' + (100 - liabRatio).toFixed(1) + '% equity</span></div></div>'
        : '');
  }

  // ── Data note ─────────────────────────────────────────────
  var noteEl = document.getElementById('assets-note');
  if (noteEl) {
    noteEl.textContent = lm
      ? 'Bank data as at ' + new Date(lm + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })
      : 'Add cash tracker data to see bank balances';
  }

  // ── Charts ────────────────────────────────────────────────
  _assetsRenderAssetsDonut(bankTotal, supTotal, hv, eqVal);
  _assetsRenderLiabDonut(liabSegs, totalLiab);
}

// ── Chart 1: Assets breakdown donut ──────────────────────────
function _assetsRenderAssetsDonut(bankTotal, supTotal, propertyValue, eqVal) {
  var canvas = document.getElementById('assets-chart');
  if (!canvas) return;
  if (assetsChart) { try { assetsChart.destroy(); } catch(e){} assetsChart = null; }

  var data = [
    { label: 'Bank',       value: Math.max(0, bankTotal),      color: '#F0538A' },
    { label: 'Super',      value: Math.max(0, supTotal),       color: '#818CF8' },
    { label: 'Property',   value: Math.max(0, propertyValue),  color: '#F07AAA' },
    { label: 'Equities',   value: Math.max(0, eqVal),          color: '#52D68A' }
  ].filter(function(d) { return d.value > 0; });

  var muted = asToken('--muted');
  var card  = asToken('--card');

  if (!data.length) {
    var ctx2d = canvas.getContext('2d');
    if (ctx2d) { ctx2d.clearRect(0, 0, canvas.width, canvas.height); }
    return;
  }

  assetsChart = safeChart(canvas, {
    type: 'doughnut',
    data: {
      labels: data.map(function(d) { return d.label; }),
      datasets: [{ data: data.map(function(d) { return d.value; }), backgroundColor: data.map(function(d) { return d.color; }), borderWidth: 3, borderColor: card, hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'DM Sans', size: 11 }, padding: 12, color: muted } },
        tooltip: { callbacks: { label: function(c) { return ' ' + c.label + ': ' + fmt(c.parsed); } } }
      },
      onClick: function(evt, els) {
        if (els.length) {
          var l = data[els[0].index].label;
          if (l === 'Bank') go('cash'); else if (l === 'Super') go('super'); else if (l === 'Property') go('mortgage'); else if (l === 'Equities') go('equities');
        }
      }
    }
  });
}

// ── Chart 2: Liabilities breakdown donut ─────────────────────
function _assetsRenderLiabDonut(liabSegs, totalLiab) {
  var canvas = document.getElementById('assets-liab-chart');
  if (!canvas) return;
  if (assetsLiabChart) { try { assetsLiabChart.destroy(); } catch(e){} assetsLiabChart = null; }

  var muted = asToken('--muted');
  var card  = asToken('--card');

  if (!liabSegs.length) {
    var ctx2d = canvas.getContext('2d');
    if (ctx2d) {
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      ctx2d.fillStyle = muted || '#6278A0';
      ctx2d.font = '13px DM Sans';
      ctx2d.textAlign = 'center';
      ctx2d.fillText('No liabilities recorded', canvas.width / 2, canvas.height / 2);
    }
    return;
  }

  assetsLiabChart = safeChart(canvas, {
    type: 'doughnut',
    data: {
      labels: liabSegs.map(function(s) { return s.label; }),
      datasets: [{ data: liabSegs.map(function(s) { return s.value; }), backgroundColor: liabSegs.map(function(s) { return s.color; }), borderWidth: 3, borderColor: card, hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'DM Sans', size: 11 }, padding: 12, color: muted } },
        tooltip: { callbacks: { label: function(c) { return ' ' + c.label + ': ' + fmt(c.parsed); } } }
      },
      onClick: function() { go('liabilities'); }
    }
  });
}

