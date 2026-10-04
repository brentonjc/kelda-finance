// FORECAST — HISTORICAL BASELINE + ADJUSTMENTS MODEL
// ══════════════════════════════════════════════════════════════
// Option B: actuals through end of last month, forecast from 1st of current month forward.

var fc2Chart      = null;   // Chart.js instance
var fc2ChartMode  = 'bars'; // 'bars' | 'cumulative'
var fc2AdjEditIdx = -1;     // index of adjustment being edited (-1 = new)
var fc2MonthModal = null;   // currently open month index

// ── localStorage keys ─────────────────────────────────────────
var FC_ADJ_KEY   = 'forecastAdjustments';
var FC_BAL_KEY   = 'forecastStartingBalance';
var FC_SYNC_KEY  = 'forecastLastSyncTime';
var FC_CACHE_KEY = 'forecastBaselineCache';

// ── Safe localStorage helpers ─────────────────────────────────
function fc2Load(key) {
  try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
  catch(e) { return null; }
}
function fc2Save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); }
  catch(e) { console.warn('fc2Save failed', key, e); }
}

// ── Date / month helpers ──────────────────────────────────────
// Returns YYYY-MM for a given year+month offset from now
function fc2YearMonth(offsetMonths) {
  var d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  var y = d.getFullYear();
  var m = d.getMonth() + 1;
  return y + '-' + (m < 10 ? '0' : '') + m;
}

// Format YYYY-MM as "Aug 2026"
function fc2FmtMonth(ym) {
  var parts = ym.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
  return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

// Format YYYY-MM as "Aug '26"
function fc2FmtShort(ym) {
  var parts = ym.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
  return d.toLocaleDateString('en-AU', { month: 'short' }) + " '" + parts[0].slice(2);
}

// Prior year's equivalent YYYY-MM for a given YYYY-MM
function fc2PriorYear(ym) {
  var parts = ym.split('-');
  return (parseInt(parts[0]) - 1) + '-' + parts[1];
}

// ── Build monthly actuals map from TX ─────────────────────────
// Returns { 'YYYY-MM': { income, expenses, net } }
function fc2BuildActualsMap() {
  var map = {};
  var txList = typeof activeTX === 'function' ? activeTX() : TX;
  txList.forEach(function(t) {
    if (!t.date) return;
    var ym = t.date.slice(0, 7);
    if (!map[ym]) map[ym] = { income: 0, expenses: 0, net: 0 };
    if (t.type === 'income')   map[ym].income   += Number(t.amount) || 0;
    if (t.type === 'expense')  map[ym].expenses += Number(t.amount) || 0;
  });
  Object.keys(map).forEach(function(ym) {
    map[ym].net = map[ym].income - map[ym].expenses;
  });
  return map;
}

// ── Build 12-month forecast baseline array ────────────────────
// Window: current month (index 0) through +11 months
// Actuals are used for months that have fully passed (last month and earlier).
// For months from current month onward → look up same month last year, or avg proxy.
function fc2BuildBaseline() {
  var actuals  = fc2BuildActualsMap();
  var allNets  = Object.values(actuals).map(function(v) { return v.net; });
  var avgNet   = allNets.length ? allNets.reduce(function(s,v){return s+v;},0) / allNets.length : 0;

  // Last fully-completed month = one month before current month
  var now        = new Date();
  var lastActual = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var lastActualYM = lastActual.getFullYear() + '-' + (lastActual.getMonth() < 9 ? '0' : '') + (lastActual.getMonth() + 1);

  var months = [];
  for (var i = 0; i < 12; i++) {
    var ym      = fc2YearMonth(i);
    var isActual = ym <= lastActualYM;

    if (isActual && actuals[ym]) {
      months.push({
        month:       ym,
        label:       fc2FmtMonth(ym),
        short:       fc2FmtShort(ym),
        baseline:    actuals[ym].net,
        income:      actuals[ym].income,
        expenses:    actuals[ym].expenses,
        adjustments: [],
        net:         actuals[ym].net,
        isActual:    true,
        isForecast:  false,
        isAvgProxy:  false
      });
    } else {
      var pyYM      = fc2PriorYear(ym);
      var pyData    = actuals[pyYM];
      var isProxy   = !pyData;
      var baseline  = pyData ? pyData.net : avgNet;
      var inc       = pyData ? pyData.income   : (avgNet >= 0 ? avgNet + Math.abs(avgNet)*0.3 : 0);
      var exp       = pyData ? pyData.expenses : Math.abs(avgNet >= 0 ? avgNet*0.3 : avgNet);

      months.push({
        month:       ym,
        label:       fc2FmtMonth(ym),
        short:       fc2FmtShort(ym),
        baseline:    baseline,
        income:      inc,
        expenses:    exp,
        adjustments: [],
        net:         baseline,
        isActual:    false,
        isForecast:  true,
        isAvgProxy:  isProxy
      });
    }
  }
  return months;
}

// ── Apply adjustments to a baseline array ─────────────────────
function fc2ApplyAdjustments(months, adjs) {
  // Reset adjustments and recalculate net
  months.forEach(function(m) {
    m.adjustments = [];
    m.net = m.baseline;
  });

  adjs.forEach(function(adj, idx) {
    months.forEach(function(m, mi) {
      if (m.isActual) return; // Don't adjust actuals
      var applies = false;

      if (adj.type === 'oneoff') {
        applies = adj.month === m.month;
      } else if (adj.type === 'recurring') {
        var inRange = true;
        if (adj.startMonth && m.month < adj.startMonth) inRange = false;
        if (adj.endMonth   && m.month > adj.endMonth)   inRange = false;
        if (!inRange) return;

        if (adj.frequency === 'monthly') {
          applies = true;
        } else if (adj.frequency === 'quarterly') {
          // Apply if this month index within the window is 0, 3, 6, 9 from startMonth
          var startYM  = adj.startMonth || months[0].month;
          var startParts = startYM.split('-');
          var mParts     = m.month.split('-');
          var diffMonths = (parseInt(mParts[0]) - parseInt(startParts[0])) * 12
                         + (parseInt(mParts[1]) - parseInt(startParts[1]));
          applies = diffMonths % 3 === 0;
        } else if (adj.frequency === 'annually') {
          var startYM2   = adj.startMonth || months[0].month;
          var sMonth     = startYM2.slice(5, 7);
          applies        = m.month.slice(5, 7) === sMonth;
        }
      }

      if (applies) {
        m.adjustments.push({ idx: idx, desc: adj.description, amount: adj.amount, source: adj.source });
        m.net += Number(adj.amount) || 0;
        // Also update income/expenses totals for chart
        var amt = Number(adj.amount) || 0;
        if (amt >= 0) m.income   += amt;
        else          m.expenses += Math.abs(amt);
      }
    });
  });

  return months;
}

// ── Get the full calculated 12-month array ────────────────────
function fc2GetMonths() {
  var baseline = fc2BuildBaseline();
  var adjs     = fc2Load(FC_ADJ_KEY) || [];
  return fc2ApplyAdjustments(baseline, adjs);
}

// ── Cash Tracker balance sync ─────────────────────────────────
// Saves the latest Cash Tracker total as the starting balance, with no
// render or toast. Runs silently each time the tab opens (see go()).
// Returns the balance, or null when Cash Tracker has none.
function fc2PullBalance() {
  var bal = null;
  try {
    // CT and CT_ACCTS are global, loaded in data.js
    var months = typeof ctAllMonths === 'function' ? ctAllMonths() : [];
    if (months.length) {
      var lm = months[months.length - 1];
      var total = ctBankTotal(lm);
      if (total !== 0) bal = total;
    }
  } catch(e) { console.warn('fc2PullBalance error', e); }

  if (bal !== null) {
    fc2Save(FC_BAL_KEY,   bal);
    fc2Save(FC_SYNC_KEY,  new Date().toISOString());
  }
  return bal;
}

// Sync Balance button: pull, re-render and report the result.
function fc2SyncBalance() {
  var bal = fc2PullBalance();
  if (bal === null) {
    toast('No balance found in Cash Tracker — add balances first');
    return;
  }
  renderForecast();
  toast('Balance synced: ' + fmt(bal));
}

// ── KPI strip ─────────────────────────────────────────────────
function fc2RenderKPIs(months) {
  var el = document.getElementById('fc2-kpis');
  if (!el) return;

  var actuals  = fc2BuildActualsMap();
  var allNets  = Object.values(actuals).map(function(v){ return v.net; });
  var avgMonthly = allNets.length ? allNets.reduce(function(s,v){return s+v;},0) / allNets.length : 0;

  var fcastNets = months.filter(function(m){ return m.isForecast; }).map(function(m){ return m.net; });
  var bestNet   = fcastNets.length ? Math.max.apply(null, fcastNets) : 0;
  var worstNet  = fcastNets.length ? Math.min.apply(null, fcastNets) : 0;
  var worstM    = months.filter(function(m){ return m.isForecast && m.net === worstNet; })[0];
  var yearEnd   = months.reduce(function(s,m){ return s + m.net; }, 0);

  var worstTone = worstNet < 0 ? 'tone-danger' : (avgMonthly > 0 && worstNet < avgMonthly * 0.2 ? 'tone-amber' : 'tone-green');

  el.innerHTML =
    '<div class="fc2-kpi">'
    + '<div class="fc2-kpi-label">Avg Monthly Net</div>'
    + '<div class="fc2-kpi-val ' + (avgMonthly >= 0 ? 'tone-green' : 'tone-danger') + '">'
    + fmt(avgMonthly) + '</div>'
    + '<div class="fc2-kpi-sub">from ' + allNets.length + ' month' + (allNets.length !== 1 ? 's' : '') + ' history</div>'
    + '</div>'

    + '<div class="fc2-kpi">'
    + '<div class="fc2-kpi-label">Best Forecast Month</div>'
    + '<div class="fc2-kpi-val tone-green">' + fmt(bestNet) + '</div>'
    + '<div class="fc2-kpi-sub">' + (fcastNets.length ? months.filter(function(m){return m.isForecast&&m.net===bestNet;})[0].label : '—') + '</div>'
    + '</div>'

    + '<div class="fc2-kpi">'
    + '<div class="fc2-kpi-label">Tightest Month</div>'
    + '<div class="fc2-kpi-val ' + worstTone + '">' + fmt(worstNet) + '</div>'
    + '<div class="fc2-kpi-sub">' + (worstM ? worstM.label : '—') + '</div>'
    + '</div>'

    + '<div class="fc2-kpi">'
    + '<div class="fc2-kpi-label">Projected Year-End Net</div>'
    + '<div class="fc2-kpi-val ' + (yearEnd >= 0 ? 'tone-green' : 'tone-danger') + '">' + fmt(yearEnd) + '</div>'
    + '<div class="fc2-kpi-sub">sum of all 12 months</div>'
    + '</div>';
}

// ── Sync bar ──────────────────────────────────────────────────
function fc2RenderSyncBar() {
  var balEl  = document.getElementById('fc2-bal-value');
  var timeEl = document.getElementById('fc2-sync-time');
  var togBtn = document.getElementById('fc2-cum-toggle');

  var bal      = fc2Load(FC_BAL_KEY);
  var syncTime = fc2Load(FC_SYNC_KEY);

  if (balEl) {
    balEl.textContent = bal !== null ? 'Starting balance: ' + fmt(bal) : 'Sync from Cash Tracker to enable cumulative view';
    balEl.classList.toggle('tone-text', bal !== null);
  }
  if (timeEl) {
    if (syncTime) {
      var d = new Date(syncTime);
      timeEl.textContent = 'Synced ' + d.toLocaleDateString('en-AU', {day:'numeric',month:'short'}) + ' at ' + d.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit'});
    } else {
      timeEl.textContent = '';
    }
  }
  if (togBtn) {
    togBtn.disabled = bal === null;
  }
}

// ── Chart ─────────────────────────────────────────────────────
function fc2SetChartMode(mode) {
  fc2ChartMode = mode;
  var barsBtn = document.getElementById('fc2-bars-btn');
  var cumBtn  = document.getElementById('fc2-cum-toggle');
  if (barsBtn) barsBtn.classList.toggle('active', mode === 'bars');
  if (cumBtn)  cumBtn.classList.toggle('active',  mode === 'cumulative');
  fc2RenderChart(fc2GetMonths());
}

function fc2RenderChart(months) {
  var canvas = document.getElementById('fc2-chart');
  if (!canvas) return;

  // Destroy existing
  if (fc2Chart) { try { fc2Chart.destroy(); } catch(e){} fc2Chart = null; }

  var labels    = months.map(function(m){ return m.short; });
  var nowIdx    = months.findIndex ? months.findIndex(function(m){ return !m.isActual; })
                : (function(){ for(var i=0;i<months.length;i++){if(!months[i].isActual)return i;} return months.length; })();

  var fcastFrom = nowIdx; // first forecast month index

  var tickColors = months.map(function(m,i){
    return m.isActual ? '#6278A0' : 'rgba(240,83,138,0.7)';
  });

  var gridColor = 'rgba(255,255,255,0.06)';

  if (fc2ChartMode === 'cumulative') {
    var bal      = fc2Load(FC_BAL_KEY) || 0;
    var cumData  = [];
    var running  = bal;
    months.forEach(function(m) {
      running += m.net;
      cumData.push(running);
    });

    // Segment coloring — green above zero, red below
    fc2Chart = safeChart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Cumulative Balance',
          data: cumData,
          borderColor: '#00C896',
          backgroundColor: 'rgba(0,200,150,0.10)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2.5,
          segment: {
            borderColor: function(ctx) {
              var p0 = ctx.p0.parsed.y;
              var p1 = ctx.p1.parsed.y;
              return (p0 < 0 || p1 < 0) ? '#EF4444' : '#00C896';
            },
            backgroundColor: function(ctx) {
              var p0 = ctx.p0.parsed.y;
              var p1 = ctx.p1.parsed.y;
              return (p0 < 0 || p1 < 0) ? 'rgba(239,68,68,0.10)' : 'rgba(0,200,150,0.10)';
            }
          }
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        backgroundColor: 'transparent',
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#111830',
            titleColor: '#F0538A',
            bodyColor: '#E8EDF5',
            callbacks: {
              label: function(c) { return ' Balance: ' + fmt(c.parsed.y); }
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: {
              color: function(ctx) { return tickColors[ctx.index] || '#6278A0'; },
              font: { family: 'DM Sans', size: 10 }
            }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: '#6278A0',
              font: { family: 'DM Sans', size: 10 },
              callback: function(v) { return '$' + Math.round(v/1000) + 'k'; }
            }
          }
        }
      }
    });
    return;
  }

  // Bars mode
  var incData  = months.map(function(m){ return m.income; });
  var expData  = months.map(function(m){ return m.expenses; });
  var netData  = months.map(function(m){ return m.net; });

  // Actual vs forecast styling
  var incColors = months.map(function(m){
    return m.isActual ? 'rgba(0,200,150,0.45)' : 'rgba(0,200,150,0.22)';
  });
  var expColors = months.map(function(m){
    return m.isActual ? 'rgba(240,83,138,0.35)' : 'rgba(240,83,138,0.18)';
  });

  fc2Chart = safeChart(canvas, {
    data: {
      labels: labels,
      datasets: [
        {
          type: 'bar',
          label: 'Income',
          data: incData,
          backgroundColor: incColors,
          borderColor: '#00C896',
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'y'
        },
        {
          type: 'bar',
          label: 'Expenses',
          data: expData.map(function(v){ return -v; }),
          backgroundColor: expColors,
          borderColor: '#F0538A',
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'Net',
          data: netData,
          borderColor: '#F59E0B',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [4, 4],
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.3,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      backgroundColor: 'transparent',
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'DM Sans', size: 11 }, padding: 14, color: '#6278A0' }
        },
        tooltip: {
          backgroundColor: '#111830',
          titleColor: '#F0538A',
          bodyColor: '#E8EDF5',
          callbacks: {
            label: function(c) { return ' ' + c.dataset.label + ': ' + fmt(Math.abs(c.parsed.y)); }
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: {
            color: function(ctx) { return tickColors[ctx.index] || '#6278A0'; },
            font: { family: 'DM Sans', size: 10 }
          }
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: '#6278A0',
            font: { family: 'DM Sans', size: 10 },
            callback: function(v) { return '$' + Math.round(v).toLocaleString('en-AU'); }
          }
        }
      }
    }
  });
}

// ── Insights ─────────────────────────────────────────────────
function fc2RenderInsights(months) {
  var el = document.getElementById('fc2-insights');
  if (!el) return;

  var actuals  = fc2BuildActualsMap();
  var keys     = Object.keys(actuals).sort();

  if (keys.length < 2) {
    el.innerHTML =
      '<div class="fc2-insight-card fc2-insight-card--muted">'
      + '<div class="fc2-insight-icon">' + ICON('chart-bar') + '</div>'
      + '<div><div class="fc2-insight-title">Not enough data yet</div>'
      + '<div class="fc2-insight-body">Add more transactions to unlock forecast insights.</div></div>'
      + '</div>';
    return;
  }

  var cards = [];
  var allNets = keys.map(function(k){ return actuals[k].net; });
  var avgNet  = allNets.reduce(function(s,v){return s+v;},0) / allNets.length;
  var proxyMonths = months.filter(function(m){ return m.isAvgProxy; }).length;

  // 1. Average monthly net — always shown
  cards.push({
    icon: avgNet >= 0 ? 'circle-check-filled' : 'alert-triangle',
    bg: avgNet >= 0 ? 'rgba(0,200,150,0.12)' : 'rgba(245,158,11,0.15)',
    title: 'Average monthly net',
    body: 'Based on ' + keys.length + ' month' + (keys.length !== 1 ? 's' : '') + ' of history, your average net is '
      + '<strong>' + fmt(avgNet) + '</strong>/month.'
      + (proxyMonths > 0 ? ' ' + proxyMonths + ' forecast month' + (proxyMonths !== 1 ? 's' : '') + ' use a historical average proxy (no prior-year data).' : '')
  });

  // 2. Tight forecast months
  var tightMonths = months.filter(function(m){
    return m.isForecast && avgNet > 0 && m.net < avgNet * 0.25;
  });
  if (tightMonths.length) {
    var names = tightMonths.slice(0, 3).map(function(m){ return m.label; }).join(', ');
    cards.push({
      icon: 'circle-filled',
      bg: 'rgba(240,83,138,0.12)',
      title: 'Tight month' + (tightMonths.length > 1 ? 's' : '') + ' ahead',
      body: '<strong>' + names + '</strong> project'
        + (tightMonths.length === 1 ? 's' : '') + ' below 25% of your average net. Lowest: '
        + '<strong>' + fmt(Math.min.apply(null, tightMonths.map(function(m){return m.net;}))) + '</strong>.'
    });
  }

  // 3. Prior-year large category spikes — detect from tx
  var txList = typeof activeTX === 'function' ? activeTX() : TX;
  var catMonthly = {}; // { catId: { ym: total } }
  txList.filter(function(t){ return t.type === 'expense'; }).forEach(function(t) {
    var cat = t.catId || t.category || 'other';
    var ym  = t.date ? t.date.slice(0,7) : '';
    if (!ym) return;
    if (!catMonthly[cat]) catMonthly[cat] = {};
    catMonthly[cat][ym] = (catMonthly[cat][ym]||0) + (Number(t.amount)||0);
  });
  var spikes = [];
  Object.keys(catMonthly).forEach(function(cat) {
    var monthly = catMonthly[cat];
    var vals    = Object.values(monthly);
    if (vals.length < 2) return;
    var avg = vals.reduce(function(s,v){return s+v;},0) / vals.length;
    Object.keys(monthly).forEach(function(ym) {
      if (monthly[ym] > avg * 2) {
        // Is this month coming up in the forecast window?
        var mmPart = ym.slice(5,7);
        var upcoming = months.filter(function(m){ return m.isForecast && m.month.slice(5,7) === mmPart; });
        if (upcoming.length) {
          spikes.push({ cat: cat, ym: ym, amt: monthly[ym], upcoming: upcoming[0] });
        }
      }
    });
  });
  if (spikes.length) {
    var spike = spikes[0];
    var catName = (function(){
      var c = (typeof LCATS !== 'undefined' ? LCATS : []).find(function(c){ return c.id === spike.cat; });
      return c ? iconTag(c.icon) + ' ' + c.name : spike.cat;
    })();
    cards.push({
      icon: 'alert-triangle',
      bg: 'rgba(245,158,11,0.15)',
      title: 'Watch out: ' + catName + ' spike coming',
      body: 'Last year in ' + fc2FmtMonth(spike.ym) + ', ' + catName + ' was <strong>' + fmt(spike.amt) + '</strong> — over 2x its usual average. '
        + spike.upcoming.label + ' is in your forecast window.'
    });
  }

  // 4. Seasonal income high
  var incByMonth = {};
  txList.filter(function(t){ return t.type === 'income'; }).forEach(function(t) {
    var mm = t.date ? t.date.slice(5,7) : '';
    if (!mm) return;
    if (!incByMonth[mm]) incByMonth[mm] = [];
    incByMonth[mm].push(Number(t.amount)||0);
  });
  var allInc = txList.filter(function(t){return t.type==='income';}).reduce(function(s,t){return s+Number(t.amount);},0);
  var allIncMonths = keys.length || 1;
  var avgIncMonthly = allInc / allIncMonths;
  var highInc = Object.keys(incByMonth).filter(function(mm) {
    var monthAvg = incByMonth[mm].reduce(function(s,v){return s+v;},0) / incByMonth[mm].length;
    return monthAvg > avgIncMonthly * 1.15 && incByMonth[mm].length >= 2;
  });
  if (highInc.length >= 2 && cards.length < 4) {
    var mmNames = highInc.slice(0,3).map(function(mm){
      return new Date(2000, parseInt(mm)-1, 1).toLocaleDateString('en-AU',{month:'long'});
    }).join(', ');
    cards.push({
      icon: 'trending-up',
      bg: 'rgba(0,200,150,0.12)',
      title: 'Seasonal income lift',
      body: 'Income in <strong>' + mmNames + '</strong> is consistently 15%+ above your monthly average — positive signal for those forecast months.'
    });
  }

  el.innerHTML = cards.slice(0,4).map(function(c) {
    return '<div class="fc2-insight-card" style="background:' + c.bg + '">'
      + '<div class="fc2-insight-icon">' + iconTag(c.icon) + '</div>'
      + '<div><div class="fc2-insight-title">' + c.title + '</div>'
      + '<div class="fc2-insight-body">' + c.body + '</div></div>'
      + '</div>';
  }).join('');
}

// ── Month strip ───────────────────────────────────────────────
function fc2RenderStrip(months) {
  var el = document.getElementById('fc2-strip');
  if (!el) return;

  var avgNet = (function(){
    var nets = months.map(function(m){return m.net;});
    return nets.reduce(function(s,v){return s+v;},0)/nets.length;
  })();

  el.innerHTML = months.map(function(m, i) {
    var netTone = m.net >= 0 ? 'tone-green' : 'tone-danger';
    var status, statusCls;
    if (m.isActual) {
      status = 'Actual'; statusCls = 'fc2-status--actual';
    } else if (m.net < 0) {
      status = 'Negative'; statusCls = 'fc2-status--neg';
    } else if (avgNet > 0 && m.net < avgNet * 0.25) {
      status = 'Tight'; statusCls = 'fc2-status--tight';
    } else {
      status = 'Forecast'; statusCls = 'fc2-status--fc';
    }

    return '<button class="fc2-month-card" onclick="fc2OpenMonthModal(' + i + ')">'
      + '<div class="fc2-month-lbl">' + m.short + '</div>'
      + '<div class="fc2-month-net ' + netTone + '">' + fmt(m.net) + '</div>'
      + '<div class="fc2-month-status ' + statusCls + '">' + status + '</div>'
      + (m.isAvgProxy ? '<div class="fc2-month-proxy">avg proxy</div>' : '')
      + '</button>';
  }).join('');
}

// ── Month modal ───────────────────────────────────────────────
function fc2OpenMonthModal(idx) {
  fc2MonthModal = idx;
  var months = fc2GetMonths();
  var m      = months[idx];
  if (!m) return;

  var overlay = document.getElementById('fc2-month-overlay');
  var box     = document.getElementById('fc2-month-box');
  if (!overlay || !box) return;

  var adjs = m.adjustments;
  var srcLabel = m.isActual ? 'Actual transactions' : (m.isAvgProxy ? 'Average proxy (no prior-year data)' : 'Prior year ' + fc2FmtMonth(fc2PriorYear(m.month)));

  box.innerHTML =
    '<div class="fc2-mm-hd">'
    + '<h3 class="fc2-mm-title">' + m.label + '</h3>'
    + '<button class="fc2-mm-close" onclick="fc2CloseMonthModal()">×</button>'
    + '</div>'

    + '<div class="fc2-modal-row">'
    + '<span class="fc2-modal-lbl">Baseline</span>'
    + '<span class="fc2-mm-amt ' + (m.baseline>=0?'tone-green':'tone-danger') + '">' + fmt(m.baseline) + '</span>'
    + '</div>'
    + '<div class="fc2-modal-row">'
    + '<span class="fc2-modal-lbl">Source</span>'
    + '<span class="fc2-mm-src">' + srcLabel + '</span>'
    + '</div>'

    + (adjs.length
      ? '<div class="fc2-mm-adjs"><div class="section-label">Adjustments applied</div>'
        + adjs.map(function(a){
          return '<div class="fc2-modal-row">'
            + '<span>' + (a.desc || 'Adjustment') + '</span>'
            + '<span class="fc2-mm-amt ' + (a.amount>=0?'tone-green':'tone-danger') + '">'
            + (a.amount>=0?'+':'') + fmt(a.amount) + '</span>'
            + '</div>';
        }).join('') + '</div>'
      : '<div class="fc2-mm-none">No adjustments for this month.</div>')

    + '<div class="fc2-modal-row fc2-mm-final">'
    + '<span class="fc2-mm-final-lbl">Final net</span>'
    + '<span class="fc2-mm-final-val ' + (m.net>=0?'tone-green':'tone-danger') + '">' + fmt(m.net) + '</span>'
    + '</div>'

    + (m.isActual ? '' :
      '<button class="btn btn-ghost btn-sm fc2-mm-add" onclick="fc2CloseMonthModal();fc2PrefilledAdj(\'' + m.month + '\')">+ Add adjustment for ' + m.label + '</button>')
    ;

  overlay.classList.add('open');
}

function fc2CloseMonthModal() {
  var overlay = document.getElementById('fc2-month-overlay');
  if (overlay) overlay.classList.remove('open');
  fc2MonthModal = null;
}

function fc2PrefilledAdj(ym) {
  // Open the add form with month pre-filled
  fc2OpenAdjForm(-1);
  var typeEl = document.getElementById('fc2-adj-type');
  if (typeEl) { typeEl.value = 'oneoff'; fc2AdjTypeChange(); }
  var mEl = document.getElementById('fc2-adj-month');
  if (mEl) mEl.value = ym;
}

// ── Adjustments table ─────────────────────────────────────────
function fc2RenderAdjs() {
  var wrap = document.getElementById('fc2-adj-table-wrap');
  if (!wrap) return;

  var adjs = fc2Load(FC_ADJ_KEY) || [];
  if (!adjs.length) {
    if (wrap) wrap.innerHTML = '<div class="empty empty--pad20"><div class="ei">' + ICON('plus') + '</div><p>No adjustments yet. Add one to tweak the forecast.</p></div>';
    return;
  }

  if (wrap) {
    wrap.innerHTML =
      '<div class="tbl-wrap"><table class="fc2-adj-table">'
      + '<thead><tr><th>Description</th><th>Type</th><th>Month(s)</th><th>Category</th><th>Amount</th><th>Source</th><th></th></tr></thead>'
      + '<tbody id="fc2-adj-tbody"></tbody>'
      + '</table></div>';
  }

  var tbody = document.getElementById('fc2-adj-tbody');
  if (!tbody) return;

  tbody.innerHTML = adjs.map(function(a, i) {
    var typeBadge = a.type === 'oneoff'
      ? '<span class="fc2-badge fc2-badge-grey">One-off</span>'
      : '<span class="fc2-badge fc2-badge-green">Recurring</span>';

    var monthStr = a.type === 'oneoff'
      ? fc2FmtMonth(a.month || '')
      : (function(){
          var s = (a.frequency || 'monthly');
          if (a.startMonth) s += ' from ' + fc2FmtMonth(a.startMonth);
          if (a.endMonth)   s += ' to '   + fc2FmtMonth(a.endMonth);
          else if (a.startMonth) s += ' (ongoing)';
          return s;
        })();

    var amtTone = Number(a.amount) >= 0 ? 'tone-green' : 'tone-danger';
    var editedTag = a.wasEdited ? '<span class="fc2-edited-tag">Edited</span>' : '';

    return '<tr>'
      + '<td>' + (a.description || '—') + '</td>'
      + '<td>' + typeBadge + '</td>'
      + '<td class="fc2-td-muted">' + monthStr + '</td>'
      + '<td class="fc2-td-muted">' + (a.category || '—') + '</td>'
      + '<td class="fc2-td-amt ' + amtTone + '">' + (Number(a.amount)>=0?'+':'') + fmt(a.amount) + '</td>'
      + '<td class="fc2-td-src">' + (a.source || 'Manual') + '</td>'
      + '<td class="fc2-td-actions">' + editedTag
      + '<button class="icon-btn" onclick="fc2OpenAdjForm(' + i + ')" title="Edit">' + ICON('pencil') + '</button>'
      + '<button class="del-btn" onclick="fc2DeleteAdj(' + i + ')" title="Delete">' + ICON('trash') + '</button>'
      + '</td>'
      + '</tr>';
  }).join('');
}

// ── Build month options HTML for the 12-month forecast window ─
function fc2MonthOptions(selected) {
  var html = '<option value="">-- Select month --</option>';
  for (var i = 0; i < 12; i++) {
    var ym  = fc2YearMonth(i);
    var lbl = fc2FmtMonth(ym);
    html += '<option value="' + ym + '"' + (selected === ym ? ' selected' : '') + '>' + lbl + '</option>';
  }
  return html;
}

// ── Populate all month selects in the adj form ─────────────────
function fc2PopulateMonthSelects(a) {
  var mSel     = document.getElementById('fc2-adj-month');
  var startSel = document.getElementById('fc2-adj-start');
  var endSel   = document.getElementById('fc2-adj-end');
  var selMonth = a && a.type === 'oneoff'    ? (a.month      || '') : '';
  var selStart = a && a.type === 'recurring' ? (a.startMonth || '') : '';
  var selEnd   = a && a.type === 'recurring' ? (a.endMonth   || '') : '';
  if (mSel)     mSel.innerHTML     = fc2MonthOptions(selMonth);
  if (startSel) startSel.innerHTML = fc2MonthOptions(selStart);
  if (endSel)   endSel.innerHTML   = '<option value="">None (ongoing)</option>' + (function(){
    var h = '';
    for (var i = 0; i < 12; i++) {
      var ym = fc2YearMonth(i);
      h += '<option value="' + ym + '"' + (selEnd === ym ? ' selected' : '') + '>' + fc2FmtMonth(ym) + '</option>';
    }
    return h;
  })();
}

// ── Adjustment form ───────────────────────────────────────────
function fc2OpenAdjForm(idx) {
  fc2AdjEditIdx = idx;
  var form = document.getElementById('fc2-adj-form');
  if (!form) return;

  var adjs = fc2Load(FC_ADJ_KEY) || [];
  var a    = idx >= 0 ? adjs[idx] : null;

  document.getElementById('fc2-adj-desc').value      = a ? (a.description || '') : '';
  document.getElementById('fc2-adj-type').value      = a ? (a.type || 'oneoff') : 'oneoff';
  document.getElementById('fc2-adj-cat').value       = a ? (a.category || '') : '';
  document.getElementById('fc2-adj-amount').value    = a ? a.amount : '';
  document.getElementById('fc2-adj-freq').value      = a ? (a.frequency || 'monthly') : 'monthly';
  document.getElementById('fc2-adj-ongoing').checked = a ? (!!a.ongoing) : false;

  fc2PopulateMonthSelects(a);
  fc2AdjTypeChange();
  form.style.display = 'block';
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function fc2CloseAdjForm() {
  var form = document.getElementById('fc2-adj-form');
  if (form) form.style.display = 'none';
  fc2AdjEditIdx = -1;
}

function fc2AdjTypeChange() {
  var type = document.getElementById('fc2-adj-type') ? document.getElementById('fc2-adj-type').value : 'oneoff';
  var oneoffRow  = document.getElementById('fc2-adj-oneoff-row');
  var recurRow   = document.getElementById('fc2-adj-recur-row');
  if (oneoffRow) oneoffRow.style.display = type === 'oneoff'    ? '' : 'none';
  if (recurRow)  recurRow.style.display  = type === 'recurring' ? '' : 'none';
  // Ensure selects are populated when switching type
  fc2PopulateMonthSelects(null);
}

function fc2AdjOngoingChange() {
  var ongoing = document.getElementById('fc2-adj-ongoing') ? document.getElementById('fc2-adj-ongoing').checked : false;
  var endEl   = document.getElementById('fc2-adj-end');
  if (endEl) endEl.disabled = ongoing;
}

function fc2SaveAdj() {
  var desc    = document.getElementById('fc2-adj-desc').value.trim();
  var type    = document.getElementById('fc2-adj-type').value;
  var cat     = document.getElementById('fc2-adj-cat').value;
  var amount  = parseFloat(document.getElementById('fc2-adj-amount').value);
  var month   = document.getElementById('fc2-adj-month') ? document.getElementById('fc2-adj-month').value : '';
  var freq    = document.getElementById('fc2-adj-freq').value;
  var start   = document.getElementById('fc2-adj-start') ? document.getElementById('fc2-adj-start').value : '';
  var end     = document.getElementById('fc2-adj-end')   ? document.getElementById('fc2-adj-end').value   : '';
  var ongoing = document.getElementById('fc2-adj-ongoing').checked;

  if (!desc) { toast('Enter a description'); return; }
  if (isNaN(amount)) { toast('Enter a valid amount (use negative for expenses)'); return; }
  if (type === 'oneoff' && !month) { toast('Select a month'); return; }
  if (type === 'recurring' && !start) { toast('Select a start month'); return; }

  var adjs  = fc2Load(FC_ADJ_KEY) || [];
  var isEdit = fc2AdjEditIdx >= 0 && fc2AdjEditIdx < adjs.length;
  var wasFromHistory = isEdit && adjs[fc2AdjEditIdx].source === 'From history';

  var obj = {
    description: desc,
    type:        type,
    category:    cat,
    amount:      amount,
    source:      'Manual',
    wasEdited:   wasFromHistory
  };
  if (type === 'oneoff') {
    obj.month = month;
  } else {
    obj.frequency  = freq;
    obj.startMonth = start;
    obj.endMonth   = ongoing ? null : (end || null);
    obj.ongoing    = ongoing;
  }

  if (isEdit) {
    if (wasFromHistory) obj.source = adjs[fc2AdjEditIdx].source;
    adjs[fc2AdjEditIdx] = obj;
  } else {
    adjs.push(obj);
  }

  fc2Save(FC_ADJ_KEY, adjs);
  fc2CloseAdjForm();
  renderForecast();
  toast('Adjustment saved');
}

function fc2DeleteAdj(idx) {
  var adjs = fc2Load(FC_ADJ_KEY) || [];
  adjs.splice(idx, 1);
  fc2Save(FC_ADJ_KEY, adjs);
  renderForecast();
  toast('Removed');
}

// ── Master render ─────────────────────────────────────────────
function renderForecast() {
  var months = fc2GetMonths();
  fc2RenderSyncBar();
  fc2RenderKPIs(months);
  fc2RenderChart(months);
  fc2RenderInsights(months);
  fc2RenderStrip(months);
  fc2RenderAdjs();
}

// ══════════════════════════════════════════════════════════════
