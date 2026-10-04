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

  // All mortgages (supports multi-property; liabAllMortgages() already excludes any
  // property that's linked to a LIABILITIES entry, so it's never double-counted below)
  (typeof liabAllMortgages === 'function' ? liabAllMortgages() : []).forEach(function(m) {
    var bal = Number(m.balance) || 0;
    if (bal > 0) addSeg('Mortgage', bal, '#EF4444');
  });

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
    var bal = lm ? ctBalanceAt(a.id, lm) : { value: 0, carried: false, month: null };
    return { label: ctLabel(a), icon: a.icon, value: bal.value, carriedFrom: bal.carried ? bal.month : null };
  });
  var bankTotal = bankRows.reduce(function(s, r) { return s + r.value; }, 0);

  document.getElementById('assets-bank').innerHTML =
    bankRows.map(function(r) {
      var carried = r.carriedFrom ? '<span class="dr-carried">as of ' + esc(ctMonthLabel(r.carriedFrom)) + '</span>' : '';
      return '<div class="dr"><span class="dr-k">' + iconTag(r.icon) + ' ' + r.label + carried + '</span><span class="dr-v">' + fmt(r.value) + '</span></div>';
    }).join('')
    + '<div class="dr dr--total">'
    + '<span class="dr-k">Total Bank</span>'
    + '<span class="dr-v tone-pink">' + fmt(bankTotal) + '</span></div>';

  // ── Super ─────────────────────────────────────────────────
  var supB = (SUPER.b && SUPER.b.balance) ? SUPER.b.balance : 0;
  var supS = (SUPER.s && SUPER.s.balance) ? SUPER.s.balance : 0;
  var supTotal = supB + supS;

  document.getElementById('assets-super').innerHTML =
    '<div class="dr"><span class="dr-k">' + ICON('briefcase') + ' ' + getUserName('brenton') + '</span><span class="dr-v">' + fmt(supB) + '</span></div>'
    + '<div class="dr"><span class="dr-k">' + ICON('briefcase') + ' ' + getUserName('shelley') + '</span><span class="dr-v">' + fmt(supS) + '</span></div>'
    + '<div class="dr dr--total">'
    + '<span class="dr-k">Total Super</span>'
    + '<span class="dr-v tone-pink">' + fmt(supTotal) + '</span></div>';

  // ── Property (supports multiple properties — sums across all of them) ──
  var mortProps = (MORTGAGE && MORTGAGE.properties && MORTGAGE.properties.length)
    ? MORTGAGE.properties : (MORTGAGE && MORTGAGE.homeValue ? [MORTGAGE] : []);
  var hv = 0, mb = 0, off = 0, pp = 0;
  mortProps.forEach(function(p) {
    hv += Number(p.homeValue) || 0;
    mb += Number(p.balance) || 0;
    off += Number(p.offset) || 0;
    pp += Number(p.purchasePrice) || 0;
  });
  var eq = hv - mb;

  // Acquired-date helpers (inline — no dependency on mortgage.js being loaded)
  function acqInfo(ad) {
    if (!ad) return null;
    var then = new Date(ad + 'T00:00:00'), now = new Date();
    if (isNaN(then.getTime()) || then > now) return null;
    var yrs = now.getFullYear() - then.getFullYear();
    var mos = now.getMonth() - then.getMonth();
    if (mos < 0) { yrs--; mos += 12; }
    return {
      hold: yrs === 0 ? mos + ' mo' : (mos === 0 ? yrs + ' yr' : yrs + ' yr ' + mos + ' mo'),
      date: then.toLocaleDateString('en-AU', {day:'numeric', month:'short', year:'numeric'})
    };
  }

  var propertyRowsHtml = mortProps.map(function(p) {
    var pHv = Number(p.homeValue) || 0, pMb = Number(p.balance) || 0, pOff = Number(p.offset) || 0, pPp = Number(p.purchasePrice) || 0;
    var pEq = pHv - pMb;
    var ai = acqInfo(p.acquiredDate);
    var gainHtml = '';
    if (pPp > 0 && pHv > 0) {
      var gain = pHv - pPp, gainPct = (gain / pPp * 100).toFixed(1);
      var gainTone = gain >= 0 ? 'tone-green' : 'tone-danger';
      gainHtml = '<div class="dr"><span class="dr-k">Capital Growth</span><span class="dr-v ' + gainTone + '">'
        + (gain >= 0 ? '+' : '') + fmt(gain) + ' (' + (gain >= 0 ? '+' : '') + gainPct + '%)</span></div>';
    }
    return '<div class="as-prop">'
      + (mortProps.length > 1 ? '<div class="dr-k as-prop-name">' + ICON('home-2') + ' ' + (p.name || 'Property') + '</div>' : '')
      + '<div class="dr"><span class="dr-k">Home Value</span><span class="dr-v">' + fmt(pHv) + '</span></div>'
      + '<div class="dr"><span class="dr-k">Mortgage</span><span class="dr-v tone-danger">-' + fmt(pMb) + '</span></div>'
      + (pOff ? '<div class="dr"><span class="dr-k">Offset</span><span class="dr-v tone-green">' + fmt(pOff) + '</span></div>' : '')
      + (ai ? '<div class="dr"><span class="dr-k">Acquired</span><span class="dr-v">' + ai.date + ' · ' + ai.hold + '</span></div>' : '')
      + gainHtml
      + '<div class="dr"><span class="dr-k">Equity</span><span class="dr-v tone-pink">' + fmt(pEq) + '</span></div>'
      + '</div>';
  }).join('');

  document.getElementById('assets-property').innerHTML = hv
    ? propertyRowsHtml
      + '<div class="dr dr--total">'
      + '<span class="dr-k">Net Equity' + (mortProps.length > 1 ? ' (all properties)' : '') + '</span>'
      + '<span class="dr-v tone-pink">' + fmt(eq) + '</span></div>'
    : '<div class="empty empty--pad12"><p>Add mortgage details</p></div>';

  // eqVal still used in grossAssets calculation — equities tile removed from page view
  var eqVal = (typeof eqTotalEquitiesValue === 'function') ? eqTotalEquitiesValue() : 0;

  // ── Liabilities summary card ──────────────────────────────
  var liabSegs  = _assetsLiabSegments();
  var totalLiab = liabSegs.reduce(function(s, l) { return s + l.value; }, 0);
  var liabSummEl = document.getElementById('assets-liabilities-summary');
  if (liabSummEl) {
    if (liabSegs.length) {
      liabSummEl.innerHTML = liabSegs.map(function(s) {
        return '<div class="dr"><span class="dr-k"><span class="as-liab-dot" style="background:' + s.color + '"></span>' + s.label + '</span>'
          + '<span class="dr-v tone-danger">-' + fmt(s.value) + '</span></div>';
      }).join('')
      + '<div class="dr dr--total">'
      + '<span class="dr-k">Total Liabilities</span>'
      + '<span class="dr-v tone-danger">' + fmt(totalLiab) + '</span></div>'
      + '<div class="as-link-wrap"><a href="#" onclick="go(\'liabilities\');return false;" class="as-link">Manage Liabilities →</a></div>';
    } else {
      liabSummEl.innerHTML = '<div class="empty empty--pad10"><p>No liabilities recorded. <a href="#" onclick="go(\'liabilities\');return false;" class="as-link-inline">Add →</a></p></div>';
    }
  }

  // ── Totals & net ──────────────────────────────────────────
  // grossAssets = full property value (hv), not net equity.
  // Mortgage is already captured in totalLiab — deducting it here would double-count.
  var grossAssets = bankTotal + supTotal + hv + eqVal;
  var netAssets   = grossAssets - totalLiab;
  var liabRatio   = grossAssets > 0 ? Math.min(100, (totalLiab / grossAssets) * 100) : 0;
  var netTone     = netAssets >= 0 ? 'tone-green' : 'tone-danger';

  // ── KPI stats ─────────────────────────────────────────────
  document.getElementById('assets-stats').innerHTML =
    '<div class="stat stat-pink"><div class="sl">Net Assets</div><div class="sv">' + fmt(netAssets) + '</div><div class="ss">Assets minus liabilities</div></div>'
    + '<div class="stat stat-rose"><div class="sl">Gross Assets</div><div class="sv">' + fmt(grossAssets) + '</div><div class="ss">Total before debt</div></div>'
    + '<div class="stat stat-purple"><div class="sl">Total Liabilities</div><div class="sv tone-danger">' + fmt(totalLiab) + '</div><div class="ss">All debt balances</div></div>'
    + '<div class="stat stat-dark"><div class="sl">Debt Ratio</div><div class="sv">' + liabRatio.toFixed(1) + '%</div><div class="ss">Liabilities / Gross assets</div></div>';

  // ── Net Position hero card ────────────────────────────────
  var npEl = document.getElementById('assets-net-position');
  if (npEl) {
    npEl.innerHTML =
      '<div class="section-label section-label--mb14">Net Assets Position</div>'
      + '<div class="as-np-hero">'
      + '<div class="as-np-lbl">Net Assets</div>'
      + '<div class="as-np-val ' + netTone + '">' + fmt(netAssets) + '</div>'
      + '</div>'
      + '<div class="dr"><span class="dr-k">Gross Assets</span><span class="dr-v tone-green">' + fmt(grossAssets) + '</span></div>'
      + '<div class="dr"><span class="dr-k">Total Liabilities</span><span class="dr-v tone-danger">-' + fmt(totalLiab) + '</span></div>'
      + '<div class="dr dr--total dr--total-6">'
      + '<span class="dr-k">Net Assets</span>'
      + '<span class="dr-v dr-v--bold ' + netTone + '">' + fmt(netAssets) + '</span></div>'
      + (totalLiab > 0
        ? '<div class="as-ratio"><div class="prog-track prog-track--sm"><div class="prog-fill danger" style="width:' + Math.min(100, liabRatio).toFixed(1) + '%"></div></div>'
          + '<div class="as-ratio-lbls"><span>Debt ' + liabRatio.toFixed(1) + '% of assets</span><span>' + (100 - liabRatio).toFixed(1) + '% equity</span></div></div>'
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

  // ── Net Worth History ─────────────────────────────────────
  renderNetWorthHistory();
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

// ══════════════════════════════════════════════════════════════
// NET WORTH HISTORY — monthly breakdown table + trend chart
// ══════════════════════════════════════════════════════════════
var _nwTrendChart = null;

// Compute vested units for an RSU/option holding AS OF a historical date
function _eqVestCalcAt(h, asOfDate) {
  var total  = parseFloat(h.totalUnits) || 0;
  var cliffY = (h.cliffYears !== undefined) ? parseFloat(h.cliffYears) : (parseInt(h.cliffMonths) || 0) / 12;
  var vestY  = (h.vestingYears !== undefined) ? parseFloat(h.vestingYears) : (parseInt(h.vestingMonths) || 48) / 12;
  var freq   = h.vestFrequency || 'quarterly';
  var gd     = h.grantDate || '';
  if (!total || !gd) return 0;
  var grant = new Date(gd + 'T00:00:00');
  if (isNaN(grant.getTime())) return 0;
  var cliffMonths = Math.round(cliffY * 12);
  var cliffDate   = new Date(grant.getFullYear(), grant.getMonth() + cliffMonths, grant.getDate());
  var freqM       = freq === 'monthly' ? 1 : freq === 'annual' ? 12 : 3;
  var freqPerYear = freq === 'monthly' ? 12 : freq === 'annual' ? 1 : 4;
  var numVests    = Math.max(1, Math.round(vestY * freqPerYear));
  var unitsPerV   = total / numVests;
  var vested = 0, cum = 0;
  for (var i = 0; i < numVests; i++) {
    var vd    = new Date(cliffDate.getFullYear(), cliffDate.getMonth() + i * freqM, cliffDate.getDate());
    var units = (i === numVests - 1) ? Math.max(0, Math.round(total - cum)) : Math.round(unitsPerV);
    cum += units;
    if (vd <= asOfDate) vested += units;
  }
  return vested;
}

// Derive total equity cost-basis value for a given month from EQUITIES[]
// Returns null if no holding existed yet (so callers can distinguish 0 cost from "not yet started")
function _eqCostBasisForMonth(mo) {
  if (typeof EQUITIES === 'undefined' || !EQUITIES.length) return null;
  var moEnd = new Date(parseInt(mo.slice(0,4)), parseInt(mo.slice(5,7)), 0); // last day of month
  var anyHolding = false, total = 0;
  EQUITIES.forEach(function(h) {
    var type     = h.type || 'stock';
    var startStr = h.purchaseDate || h.grantDate || '';
    if (!startStr) return;
    var startDate = new Date(startStr + 'T00:00:00');
    if (isNaN(startDate.getTime()) || startDate > moEnd) return;
    anyHolding = true;
    var salesByMo = (h.sales || []).filter(function(s) {
      return s.date && new Date(s.date + 'T00:00:00') <= moEnd;
    });
    var soldQty = salesByMo.reduce(function(a, s) { return a + (parseFloat(s.qty) || 0); }, 0);
    if (type === 'bond') {
      var saleVal = salesByMo.reduce(function(a, s) {
        return a + (parseFloat(s.qty) || 0) * (parseFloat(s.price) || 0);
      }, 0);
      total += Math.max(0, (parseFloat(h.purchasePrice) || 0) - saleVal);
    } else if (type === 'rsu' || type === 'option') {
      var vestedAt = _eqVestCalcAt(h, moEnd);
      var price    = parseFloat(h.currentPrice) || 0;
      var strike   = type === 'option' ? (parseFloat(h.strikePrice) || 0) : 0;
      total += Math.max(0, vestedAt - soldQty) * Math.max(0, price - strike);
    } else {
      // stock: (qty - sold) × cost per unit
      total += Math.max(0, (parseFloat(h.qty) || 0) - soldQty) * (parseFloat(h.cost) || parseFloat(h.currentPrice) || 0);
    }
  });
  return anyHolding ? total : null;
}

function renderNetWorthHistory() {
  var el = document.getElementById('nw-history-wrap');
  if (!el) return;

  // ── Load all data sources ─────────────────────────────────────
  var hist = [];
  try { hist = JSON.parse(localStorage.getItem('cff_networth_history') || '[]') || []; } catch(e) {}
  var superHist = {}; try { superHist = JSON.parse(localStorage.getItem('cff_super_history')    || '{}') || {}; } catch(e) {}
  var mortHist  = {}; try { mortHist  = JSON.parse(localStorage.getItem('cff_mortgage_history') || '{}') || {}; } catch(e) {}
  var eqHist    = {}; try { eqHist    = JSON.parse(localStorage.getItem('cff_eq_history')       || '{}') || {}; } catch(e) {}
  var liabHist  = {}; try { liabHist  = JSON.parse(localStorage.getItem('cff_liab_history')     || '{}') || {}; } catch(e) {}
  // New monthly grids — highest fidelity per-component data
  var superMonthly = (typeof SUPER_MONTHLY !== 'undefined') ? SUPER_MONTHLY : {};
  var liabMonthly  = (typeof LIAB_MONTHLY  !== 'undefined') ? LIAB_MONTHLY  : {};
  var eqMonthly    = (typeof EQ_MONTHLY    !== 'undefined') ? EQ_MONTHLY    : {};

  // ── Earliest start dates for property and equities ───────────
  // Property: driven by acquisition date entered on the Mortgage tab
  var propAcqMo = null;
  if (MORTGAGE && MORTGAGE.properties && MORTGAGE.properties.length) {
    MORTGAGE.properties.forEach(function(p) {
      if (p.acquiredDate) {
        var d = p.acquiredDate.slice(0, 7);
        if (!propAcqMo || d < propAcqMo) propAcqMo = d;
      }
    });
  }
  if (!propAcqMo && MORTGAGE && MORTGAGE.acquiredDate) propAcqMo = MORTGAGE.acquiredDate.slice(0, 7);

  // Equities: driven by earliest purchaseDate / grantDate across all holdings
  var eqStartMo = null;
  if (typeof EQUITIES !== 'undefined' && EQUITIES.length) {
    EQUITIES.forEach(function(h) {
      var d = (h.purchaseDate || h.grantDate || '').slice(0, 7);
      if (d && (!eqStartMo || d < eqStartMo)) eqStartMo = d;
    });
  }

  // Liabilities: build a per-liability model so each debt only contributes from
  // the month it began. A liability cannot exist before it was taken on, so —
  // like property and equities — it must not be back-filled into earlier months.
  // Start month resolves as: mortgage → its property's acquisition date; other
  // liabilities → opened/start date, else earliest recorded balance, else the
  // month the record was created.
  function _propAcqForMortgage(mortId) {
    if (MORTGAGE && MORTGAGE.properties && MORTGAGE.properties.length) {
      for (var i = 0; i < MORTGAGE.properties.length; i++) {
        var p   = MORTGAGE.properties[i];
        var pid = (i === 0) ? 'mortgage_primary' : ('mortgage_prop_' + p.id);
        if (pid === mortId) return (p.acquiredDate || '').slice(0, 7) || null;
      }
    }
    return (MORTGAGE && MORTGAGE.acquiredDate) ? MORTGAGE.acquiredDate.slice(0, 7) : null;
  }
  function _earliestGridMo(id) {
    var g = liabMonthly[id] || {}, ks = Object.keys(g).sort();
    return ks.length ? ks[0] : null;
  }
  var liabList = [];
  if (typeof liabAllMortgages === 'function') {
    liabAllMortgages().forEach(function(m) {
      liabList.push({ id: m.id, curBal: Number(m.balance) || 0,
        startMo: _propAcqForMortgage(m.id) || _earliestGridMo(m.id) });
    });
  }
  if (typeof LIABILITIES !== 'undefined') {
    LIABILITIES.forEach(function(l) {
      var start = (l.openedDate || l.startDate || '').slice(0, 7)
                || _earliestGridMo(l.id)
                || (l.createdAt || '').slice(0, 7) || null;
      liabList.push({ id: l.id, curBal: Number(l.balance) || 0, startMo: start });
    });
  }

  // ── Bank from CT per month ────────────────────────────────────
  var ctAcctsIds = (typeof CT_ACCTS !== 'undefined' && CT_ACCTS && CT_ACCTS.length)
    ? CT_ACCTS.map(function(a){ return a.id; }) : ['offset','home','sav1','sav2'];
  function bankForMonth(mo) {
    return ctBankTotal(mo, ctAcctsIds);
  }

  // ── Build union of all months ─────────────────────────────────
  var allMonthSet = {};
  hist.forEach(function(e){ if(e.date) allMonthSet[e.date.slice(0,7)] = true; });
  Object.keys(superHist).forEach(function(m){ allMonthSet[m] = true; });
  Object.keys(mortHist).forEach(function(m){ allMonthSet[m] = true; });
  Object.keys(eqHist).forEach(function(m){ allMonthSet[m] = true; });
  Object.keys(liabHist).forEach(function(m){ allMonthSet[m] = true; });
  Object.keys(eqMonthly).forEach(function(m){ allMonthSet[m] = true; });
  Object.keys(liabMonthly).forEach(function(lid){ Object.keys(liabMonthly[lid]||{}).forEach(function(m){ allMonthSet[m]=true; }); });
  Object.keys(superMonthly).forEach(function(aid){ Object.keys(superMonthly[aid]||{}).forEach(function(m){ allMonthSet[m]=true; }); });
  if (typeof ctAllMonths === 'function') { ctAllMonths().forEach(function(m){ allMonthSet[m] = true; }); }
  // Always include component start months so they anchor the history
  if (propAcqMo) allMonthSet[propAcqMo] = true;
  if (eqStartMo) allMonthSet[eqStartMo] = true;
  liabList.forEach(function(item) { if (item.startMo) allMonthSet[item.startMo] = true; });

  // Helper: super total for a month from per-account monthly data
  function superTotalForMonth(mo) {
    var bAccts   = (typeof SUPER_ACCTS !== 'undefined') ? (SUPER_ACCTS.brenton||[]) : [];
    var sAccts   = (typeof SUPER_ACCTS !== 'undefined') ? (SUPER_ACCTS.shelley||[]) : [];
    var allAccts = bAccts.concat(sAccts);
    if (!allAccts.length) return null;
    var anyEntry = false, total = 0;
    allAccts.forEach(function(a) {
      var h = superMonthly[a.id] || {};
      if (h[mo] !== undefined) { total += h[mo]; anyEntry = true; }
    });
    return anyEntry ? total : null;
  }

  // Per-liability balance for a month: nearest recorded balance at/before the
  // month, else earliest recorded, else the current balance. Zero before the
  // liability's start month so a debt never predates when it was taken on.
  function liabValueForMonth(item, mo) {
    if (item.startMo && mo < item.startMo) return 0;
    var g  = liabMonthly[item.id] || {};
    var ks = Object.keys(g).sort();
    var val = null;
    for (var i = 0; i < ks.length; i++) {
      if (ks[i] <= mo) val = g[ks[i]]; else break;
    }
    if (val === null) val = ks.length ? g[ks[0]] : item.curBal;
    return val;
  }
  // Authoritative liabilities total for a month, summed across every liability
  // from its own start date. Returns null only when no liabilities exist at all.
  function liabTotalForMonth(mo) {
    if (!liabList.length) return null;
    var total = 0;
    liabList.forEach(function(item) { total += liabValueForMonth(item, mo); });
    return total;
  }

  // ── Build moMap in ascending order with carry-forward ─────────
  // Each component carries its last known value forward month-to-month.
  // Property only starts from acquisition date; equities from earliest grant/purchase date.
  var moMap = {};
  hist.forEach(function(e){ if(e.date){ var m=e.date.slice(0,7); if(!moMap[m])moMap[m]=e; } });

  var lastKnownSuper = 0;
  var lastKnownProp  = 0;
  var lastKnownEq    = 0;
  var lastKnownLiab  = 0;

  Object.keys(allMonthSet).sort().forEach(function(mo) {
    var bank = bankForMonth(mo);

    // ── Super: carry forward last known value once entered ──────
    var smGrid = superTotalForMonth(mo);
    var sh     = superHist[mo];
    var super_;
    if (smGrid !== null) {
      super_ = smGrid; lastKnownSuper = smGrid;
    } else if (sh) {
      super_ = (sh.brenton||0) + (sh.shelley||0); lastKnownSuper = super_;
    } else if (moMap[mo] && moMap[mo].super_) {
      super_ = moMap[mo].super_; lastKnownSuper = super_;
    } else {
      super_ = lastKnownSuper; // persist until updated
    }

    // ── Property: only from acquisition date, then carry forward ─
    var prop = 0;
    if (!propAcqMo || mo >= propAcqMo) {
      var mh = mortHist[mo];
      if (mh && (mh.homeValue || mh.homeValue === 0)) {
        prop = mh.homeValue; lastKnownProp = prop;
      } else if (moMap[mo] && moMap[mo].property) {
        prop = moMap[mo].property; lastKnownProp = prop;
      } else if (lastKnownProp > 0) {
        prop = lastKnownProp; // carry forward
      } else if (propAcqMo && mo === propAcqMo && MORTGAGE.homeValue) {
        // Anchor the acquisition month with current home value if no history yet
        prop = MORTGAGE.homeValue; lastKnownProp = prop;
      }
    }

    // ── Equities: from first grant/purchase date, carry forward ──
    var eq = 0;
    if (!eqStartMo || mo >= eqStartMo) {
      var eqGrid = eqMonthly[mo] ? eqMonthly[mo].closing : undefined;
      if (eqGrid !== undefined) {
        eq = eqGrid; lastKnownEq = eq;
      } else if (typeof eqHist[mo] !== 'undefined') {
        eq = eqHist[mo]; lastKnownEq = eq;
      } else if (moMap[mo] && typeof moMap[mo].equities !== 'undefined' && moMap[mo].equities > 0) {
        eq = moMap[mo].equities; lastKnownEq = eq;
      } else {
        // Derive from cost basis of holdings that existed by this month
        var costBasis = _eqCostBasisForMonth(mo);
        if (costBasis !== null) {
          eq = costBasis; lastKnownEq = eq;
        } else {
          eq = lastKnownEq; // carry forward
        }
      }
    }

    // ── Liabilities: authoritative per-liability total (each from its
    // own start date). Falls back to prior aggregate history only when no
    // liabilities are defined, so nothing predates when a debt was taken on.
    var lTot = liabTotalForMonth(mo);
    var liab;
    if (lTot !== null) {
      liab = lTot; lastKnownLiab = lTot;
    } else if (typeof liabHist[mo] !== 'undefined') {
      liab = liabHist[mo]; lastKnownLiab = liab;
    } else if (moMap[mo] && moMap[mo].liabilities) {
      liab = moMap[mo].liabilities; lastKnownLiab = liab;
    } else {
      liab = 0;
    }

    var nw = bank + super_ + prop + eq - liab;
    moMap[mo] = { date: mo + '-01', netWorth: Math.round(nw * 100) / 100,
                  bank: Math.round(bank), super_: Math.round(super_),
                  property: Math.round(prop), equities: Math.round(eq),
                  liabilities: Math.round(liab) };
  });

  var moKeys = Object.keys(moMap).sort().reverse(); // most-recent first for display

  if (moKeys.length === 0) {
    el.innerHTML = '<div class="empty empty--pad20"><p>No history yet — save any balance to start recording snapshots automatically.</p></div>';
    return;
  }

  // ── Precompute month-on-month deltas in ascending order ───────
  // The change column shows how much net worth grew FROM the previous month.
  // The oldest entry gets —; all subsequent entries show current − previous.
  var ascKeys  = moKeys.slice().reverse();
  var deltaMap = {};
  for (var di = 0; di < ascKeys.length; di++) {
    if (di === 0) {
      deltaMap[ascKeys[di]] = null; // first ever entry has no predecessor
    } else {
      deltaMap[ascKeys[di]] = (moMap[ascKeys[di]].netWorth || 0) - (moMap[ascKeys[di - 1]].netWorth || 0);
    }
  }

  // ── Trend chart ──────────────────────────────────────────────
  var chartKeys = ascKeys; // oldest→newest
  var hasCmp = chartKeys.some(function(m){ return typeof moMap[m].bank !== 'undefined'; });
  var muted  = asToken('--muted') || '#6278A0';
  var card2  = asToken('--card2') || '#111830';
  var pr     = chartKeys.length > 18 ? 0 : 3;

  var chartHtml = '<div class="nw-chart"><canvas id="nw-trend-canvas"></canvas></div>';

  // ── Table ────────────────────────────────────────────────────
  var hasBank = hasCmp, hasSuper = hasCmp, hasProp = hasCmp, hasEq = hasCmp, hasLiab = hasCmp;

  var thead = '<thead><tr>'
    + '<th class="nw-th nw-th--l">Month</th>'
    + (hasBank  ? '<th class="nw-th">' + ICON('building-bank') + ' Bank</th>'        : '')
    + (hasSuper ? '<th class="nw-th">' + ICON('briefcase') + ' Super</th>'       : '')
    + (hasProp  ? '<th class="nw-th">' + ICON('home-2') + ' Property</th>'    : '')
    + (hasEq    ? '<th class="nw-th">' + ICON('trending-up') + ' Equities</th>'    : '')
    + (hasLiab  ? '<th class="nw-th">' + ICON('scale') + ' Liabilities</th>' : '')
    + '<th class="nw-th nw-th--nw">Net Worth</th>'
    + '<th class="nw-th">Change</th>'
    + '</tr></thead>';

  var rows = moKeys.map(function(mk) {
    var e       = moMap[mk];
    var nw      = e.netWorth || 0;
    var mo      = new Date(mk + '-02').toLocaleString('en-AU', {month:'short', year:'numeric'});
    var delta   = deltaMap[mk];
    var nwTone   = nw >= 0 ? 'tone-green' : 'tone-danger';
    var dltTone  = delta === null ? '' : (delta >= 0 ? ' tone-green' : ' tone-danger');
    var dltStr   = delta === null ? '—' : (delta >= 0 ? '+' : '') + fmt(delta);

    return '<tr>'
      + '<td class="nw-td nw-td--month">' + mo + '</td>'
      + (hasBank  ? '<td class="nw-td">'                             + fmt(e.bank        || 0) + '</td>' : '')
      + (hasSuper ? '<td class="nw-td">'                             + fmt(e.super_      || 0) + '</td>' : '')
      + (hasProp  ? '<td class="nw-td">'                             + fmt(e.property    || 0) + '</td>' : '')
      + (hasEq    ? '<td class="nw-td">'                             + fmt(e.equities    || 0) + '</td>' : '')
      + (hasLiab  ? '<td class="nw-td tone-danger">-'       + fmt(e.liabilities || 0) + '</td>' : '')
      + '<td class="nw-td nw-td--bold ' + nwTone + '">'  + fmt(nw)                 + '</td>'
      + '<td class="nw-td' + dltTone + '">'                       + dltStr                  + '</td>'
      + '</tr>';
  }).join('');

  var tableHtml = '<div class="nw-scroll">'
    + '<table class="nw-tbl">'
    + thead + '<tbody>' + rows + '</tbody></table></div>';

  el.innerHTML = chartHtml + tableHtml;

  // ── Render trend chart ────────────────────────────────────────
  var canvas = document.getElementById('nw-trend-canvas');
  if (_nwTrendChart) { try { _nwTrendChart.destroy(); } catch(ex){} _nwTrendChart = null; }
  if (!canvas || chartKeys.length < 2) return;

  var labels = chartKeys.map(function(m) {
    return new Date(m + '-02').toLocaleString('en-AU', {month:'short', year:'2-digit'});
  });
  var nwVals = chartKeys.map(function(m) { return moMap[m].netWorth; });
  var isUp   = nwVals[nwVals.length - 1] >= nwVals[0];
  var lc     = isUp ? '#00C896' : '#EF4444';

  var datasets = [{ label:'Net Worth', data:nwVals, borderColor:lc, backgroundColor:lc+'20',
    fill:true, tension:0.35, pointRadius:pr, pointHoverRadius:6, borderWidth:2.5 }];

  if (hasCmp && chartKeys.length >= 2) {
    // Assets stack UP (positive) from zero; liabilities plot DOWN (negative).
    // The Net Worth line sits at the difference between the two — exactly the
    // gap between the top of the asset stack and the bottom of the liability bar.
    datasets = [
      { type:'bar', label:'Bank',      data:chartKeys.map(function(m){return moMap[m].bank     || 0;}), backgroundColor:'#3B82F6', stack:'assets', order:3, borderWidth:0 },
      { type:'bar', label:'Super',     data:chartKeys.map(function(m){return moMap[m].super_   || 0;}), backgroundColor:'#818CF8', stack:'assets', order:3, borderWidth:0 },
      { type:'bar', label:'Property',  data:chartKeys.map(function(m){return moMap[m].property || 0;}), backgroundColor:'#F0538A', stack:'assets', order:3, borderWidth:0 },
      { type:'bar', label:'Equities',  data:chartKeys.map(function(m){return moMap[m].equities || 0;}), backgroundColor:'#F59E0B', stack:'assets', order:3, borderWidth:0 },
      { type:'bar', label:'Liabilities', data:chartKeys.map(function(m){return -(moMap[m].liabilities || 0);}), backgroundColor:'#EF4444', stack:'liabilities', order:3, borderWidth:0 },
      { type:'line', label:'Net Worth', data:nwVals, borderColor:'#00C896', backgroundColor:'transparent', fill:false, tension:0.35, pointRadius:pr?pr+1:0, pointHoverRadius:6, borderWidth:3, order:1 }
    ];
  }

  _nwTrendChart = safeChart(canvas, {
    type: hasCmp ? 'bar' : 'line',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: hasCmp, labels: { color: muted, font: { family:'DM Sans', size:11 }, boxWidth:12, padding:10 } },
        tooltip: { callbacks: { label: function(c) {
          // Liabilities are plotted negative — show the actual (positive) balance
          var v = (c.dataset.label === 'Liabilities') ? Math.abs(c.parsed.y) : c.parsed.y;
          return ' ' + c.dataset.label + ': ' + fmt(v);
        } } }
      },
      scales: {
        x: { stacked: hasCmp, grid:{ display:false }, ticks:{ color:muted, font:{ family:'DM Sans' } } },
        y: { stacked: hasCmp, grid:{ color:card2 }, ticks:{ color:muted, font:{ family:'DM Mono' }, callback: function(v){ return '$'+(v/1000).toFixed(0)+'k'; } } }
      }
    }
  });
}

