// ══════════════════════════════════════════════════════════════
// SNAPSHOT PAGE — Financial pulse at a glance
// ══════════════════════════════════════════════════════════════

var snapYear    = new Date().getFullYear();
var snapMonth   = new Date().getMonth() + 1;
var snapBarChart = null;
var _snapRafNW  = null; // RAF handle for net worth count-up

// ── Period navigation ─────────────────────────────────────────
function snapNavMonth(delta) {
  snapMonth += delta;
  if (snapMonth > 12) { snapMonth = 1; snapYear++; }
  if (snapMonth < 1)  { snapMonth = 12; snapYear--; }
  _snapSyncSelect();
  renderSnapshot();
}

function snapGoNow() {
  var n = new Date();
  snapYear  = n.getFullYear();
  snapMonth = n.getMonth() + 1;
  _snapSyncSelect();
  renderSnapshot();
}

function snapPeriodChanged() {
  var sel = document.getElementById('snap-period-select');
  if (!sel || !sel.value) return;
  var parts = sel.value.split('-');
  snapYear  = parseInt(parts[0], 10);
  snapMonth = parseInt(parts[1], 10);
  renderSnapshot();
}

// Rebuild the period <select> from available TX months
function _snapBuildSelect() {
  var sel = document.getElementById('snap-period-select');
  if (!sel) return;
  var months = [];
  try {
    var seen = {};
    (TX || []).forEach(function(t) {
      if (t.date && t.date.length >= 7) {
        var m = t.date.slice(0, 7);
        if (!seen[m]) { seen[m] = true; months.push(m); }
      }
    });
    months.sort().reverse();
  } catch(e) {}

  // Always include today's month
  var nowM = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
  if (months.indexOf(nowM) < 0) months.unshift(nowM);
  if (!months.length) months = [nowM];

  var curVal = snapYear + '-' + String(snapMonth).padStart(2, '0');
  if (months.indexOf(curVal) < 0) months.unshift(curVal);

  sel.innerHTML = months.map(function(m) {
    var lbl = new Date(m + '-02').toLocaleString('en-AU', { month: 'long', year: 'numeric' });
    return '<option value="' + m + '"' + (m === curVal ? ' selected' : '') + '>' + lbl + '</option>';
  }).join('');
}

function _snapSyncSelect() {
  var sel = document.getElementById('snap-period-select');
  if (!sel) return;
  var curVal = snapYear + '-' + String(snapMonth).padStart(2, '0');
  sel.value = curVal;
}

// Go to import — export page, scroll to CSV card
function snapGoImport() {
  go('export');
  setTimeout(function() {
    var card = document.getElementById('csv-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 250);
}

// ── Main render ───────────────────────────────────────────────
function renderSnapshot() {
  var el = document.getElementById('snapshot-content');
  if (!el) return;

  // Rebuild period select
  _snapBuildSelect();

  // Update date subtitle
  var dateEl = document.getElementById('snap-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-AU', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  // ── Upload / refresh tile ────────────────────────────────────
  var latestDate = null;
  var txCount = 0;
  try {
    var pfxNow = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
    if (TX && TX.length) {
      var allDates = TX.map(function(t){ return t.date || ''; }).filter(Boolean).sort();
      latestDate = allDates[allDates.length - 1];
      txCount = TX.filter(function(t){ return t.date && t.date.startsWith(pfxNow); }).length;
    }
  } catch(e) {}

  var lastUpdLbl = latestDate
    ? new Date(latestDate + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'No transactions yet';

  var uploadTile = '<div class="card snap-upload-tile mb">'
    + '<div class="snap-upload-hd">'
    + '<div class="snap-upload-icon">📥</div>'
    + '<div>'
    + '<div class="snap-upload-title">Transactions</div>'
    + '<div class="snap-upload-status">Last entry: <strong>' + lastUpdLbl + '</strong>'
    + (txCount ? ' &nbsp;&middot;&nbsp; ' + txCount + ' this month' : '')
    + '</div>'
    + '</div>'
    + '</div>'
    + '<div class="snap-upload-btns">'
    + '<button class="btn btn-primary btn-sm" onclick="snapGoImport()">&#128229; Import CSV</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="go(\'transactions\')">&#43; Add manually</button>'
    + '</div>'
    + '</div>';

  // ── Section A — Net Worth Hero ───────────────────────────────
  var nwSnap = { netWorth: 0, assets: 0, liabilities: 0, lastMonthNetWorth: null };
  try {
    if (typeof getNetWorthSnapshot === 'function') nwSnap = getNetWorthSnapshot();
  } catch(e) { console.warn('getNetWorthSnapshot:', e); }

  var nw     = nwSnap.netWorth;
  var assets = nwSnap.assets;
  var liab   = nwSnap.liabilities;
  var nwColor = nw >= 0 ? 'var(--primary)' : 'var(--danger)';
  var nowLbl  = new Date().toLocaleString('en-AU', { month: 'long', year: 'numeric' });

  var deltaHtml = '';
  if (nwSnap.lastMonthNetWorth !== null) {
    var delta = nw - nwSnap.lastMonthNetWorth;
    if (delta >= 0) {
      deltaHtml = '<span style="color:var(--success)">&#9650; ' + fmt(delta) + ' vs last month</span>';
    } else {
      deltaHtml = '<span style="color:var(--danger)">&#9660; ' + fmt(Math.abs(delta)) + ' vs last month</span>';
    }
  } else {
    deltaHtml = '<span style="color:var(--muted)">&#8212; first month on record</span>';
  }

  var barTotal = assets + liab;
  var barPct   = barTotal > 0 ? Math.min(100, Math.round(assets / barTotal * 100)) : 100;

  // Net worth value rendered as span so count-up can target it
  var sectionA = '<div class="card snap-nw-card">'
    + '<div class="snap-nw-label">Net worth &middot; as at ' + nowLbl + '</div>'
    + '<div class="snap-nw-val" id="snap-nw-number" style="color:' + nwColor + '" data-target="' + nw + '">' + fmt(0) + '</div>'
    + '<div class="snap-nw-delta">' + deltaHtml + '</div>'
    + '<div class="snap-nw-bar-wrap">'
    + '<div class="snap-nw-bar-track">'
    + '<div class="snap-anim-bar snap-nw-bar-fill" data-pct="' + barPct + '" style="width:0%"></div>'
    + '</div>'
    + '<div class="snap-nw-bar-labels">'
    + '<span>Assets ' + fmt(assets) + '</span>'
    + '<span>Liabilities ' + fmt(liab) + '</span>'
    + '</div>'
    + '</div>'
    + '</div>';

  // ── Section B — Monthly Surplus + Chart ─────────────────────
  var summary = { income: 0, expenses: 0, surplus: 0, budgetTotal: 0, budgetVariance: 0 };
  try {
    if (typeof getMonthSummary === 'function') summary = getMonthSummary(snapYear, snapMonth);
  } catch(e) { console.warn('getMonthSummary:', e); }

  var periodLabel  = new Date(snapYear, snapMonth - 1, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' });
  var surplusColor = summary.surplus >= 0 ? 'var(--success)' : 'var(--danger)';
  var surplusLabel = summary.surplus >= 0 ? 'Surplus' : 'Deficit';

  var badgeHtml = '';
  if (summary.budgetTotal > 0) {
    if (summary.budgetVariance >= 0) {
      badgeHtml = '<div class="snap-badge snap-badge-success">&#9650; Ahead by ' + fmt(summary.budgetVariance) + '</div>';
    } else {
      badgeHtml = '<div class="snap-badge snap-badge-danger">&#9660; Over by ' + fmt(Math.abs(summary.budgetVariance)) + '</div>';
    }
  }

  var sectionB = '<div class="card mb">'
    + '<div class="snap-period-nav">'
    + '<button class="snap-nav-btn" onclick="snapNavMonth(-1)">&#8249;</button>'
    + '<div class="snap-period-title">' + periodLabel + '</div>'
    + '<button class="snap-nav-btn" onclick="snapNavMonth(1)">&#8250;</button>'
    + '</div>'
    + '<div class="snap-surplus-grid">'
    + '<div class="snap-surplus-col">'
    + '<div class="snap-col-val" style="color:var(--success)">' + fmt(summary.income) + '</div>'
    + '<div class="snap-col-lbl">Income</div>'
    + '</div>'
    + '<div class="snap-surplus-col">'
    + '<div class="snap-col-val" style="color:var(--primary)">' + fmt(summary.expenses) + '</div>'
    + '<div class="snap-col-lbl">Expenses</div>'
    + '</div>'
    + '<div class="snap-surplus-col">'
    + '<div class="snap-col-val" style="color:' + surplusColor + '">' + fmt(Math.abs(summary.surplus)) + '</div>'
    + '<div class="snap-col-lbl">' + surplusLabel + '</div>'
    + badgeHtml
    + '</div>'
    + '</div>'
    + '<div class="snap-chart-wrap" style="margin-top:18px"><canvas id="snap-bar-chart"></canvas></div>'
    + '</div>';

  // ── Section C — Savings Goals ────────────────────────────────
  var goals = [];
  try { goals = load(K.goals) || []; } catch(e) { goals = []; }

  // Surplus insight data (needed for inline goal calc)
  var surplusNow = 0;
  try {
    if (typeof getMonthSummary === 'function') {
      var n2 = new Date();
      surplusNow = getMonthSummary(n2.getFullYear(), n2.getMonth() + 1).surplus;
    }
  } catch(e) {}

  var sectionC = '';
  if (!goals.length) {
    sectionC = '<div class="card mb snap-empty-goals">'
      + '<div class="snap-empty-icon">🎯</div>'
      + '<div class="snap-empty-msg">No goals set yet</div>'
      + '<button class="btn btn-primary btn-sm" onclick="go(\'goals\')">Add your first goal &rarr;</button>'
      + '</div>';
  } else {
    var goalsSorted = goals.slice().sort(function(a, b) {
      var ca = (typeof _goalCurrent === 'function') ? _goalCurrent(a) : (Number(a.currentAmount) || 0);
      var ta = (typeof _goalTarget  === 'function') ? _goalTarget(a)  : (Number(a.targetAmount)  || 0);
      var cb = (typeof _goalCurrent === 'function') ? _goalCurrent(b) : (Number(b.currentAmount) || 0);
      var tb = (typeof _goalTarget  === 'function') ? _goalTarget(b)  : (Number(b.targetAmount)  || 0);
      return (tb > 0 ? cb/tb : 0) - (ta > 0 ? ca/ta : 0);
    }).slice(0, 5);

    var goalRows = '';
    var bestInsightGoal = null; // goal that surplus helps most (first incomplete)

    for (var gi = 0; gi < goalsSorted.length; gi++) {
      var g    = goalsSorted[gi];
      var gcur = (typeof _goalCurrent === 'function') ? _goalCurrent(g) : (Number(g.currentAmount) || Number(g.saved) || 0);
      var gtgt = (typeof _goalTarget  === 'function') ? _goalTarget(g)  : (Number(g.targetAmount)  || Number(g.target) || 0);
      var gpct = gtgt > 0 ? Math.min(100, Math.round(gcur / gtgt * 100)) : 0;
      var done = gpct >= 100;

      // Track first incomplete goal for surplus insight
      if (!done && bestInsightGoal === null && surplusNow > 0) bestInsightGoal = { g: g, gcur: gcur, gtgt: gtgt, gpct: gpct };

      var gpctCol = done ? 'var(--success)' : gpct >= 75 ? 'var(--success)' : gpct >= 25 ? 'var(--warn)' : 'var(--text)';
      var gname = g.name || 'Goal';
      var gicon = done ? '✅' : (g.icon || '🎯');

      // Milestone ticks at 25%, 50%, 75%
      var milestones = '';
      var mPcts = [25, 50, 75];
      for (var mi = 0; mi < mPcts.length; mi++) {
        var mReached = gpct >= mPcts[mi];
        milestones += '<div class="snap-milestone' + (mReached ? ' snap-milestone-reached' : '') + '" style="left:' + mPcts[mi] + '%"></div>';
      }

      var gdueHtml = '';
      if (g.targetDate) {
        try {
          var gdue = new Date(g.targetDate + 'T00:00:00');
          gdueHtml = '<div class="snap-goal-due">Due ' + gdue.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }) + '</div>';
        } catch(e2) {}
      }

      var celebClass = done ? ' snap-goal-celebrate' : '';

      goalRows += '<div class="snap-goals-row' + celebClass + '">'
        + '<div class="snap-goal-icon' + (done ? ' snap-goal-icon-done' : '') + '">' + gicon + '</div>'
        + '<div class="snap-goal-body">'
        + '<div class="snap-goal-name">' + esc(gname) + (done ? ' <span class="snap-done-badge">Complete!</span>' : '') + '</div>'
        + '<div class="snap-goal-bar-wrap">'
        + '<div class="snap-goal-bar-track" style="position:relative">'
        + milestones
        + '<div class="snap-anim-bar snap-goal-bar-fill' + (done ? ' snap-bar-complete' : '') + '" data-pct="' + gpct + '" style="width:0%"></div>'
        + '</div>'
        + gdueHtml
        + '</div>'
        + '</div>'
        + '<div class="snap-goal-right">'
        + '<div class="snap-goal-pct" style="color:' + gpctCol + '">' + gpct + '%</div>'
        + '<div class="snap-goal-amounts">' + fmt(gcur) + ' / ' + fmt(gtgt) + '</div>'
        + '</div>'
        + '</div>';
    }

    // Surplus insight — show for first incomplete goal when there's positive surplus
    var insightHtml = '';
    if (bestInsightGoal !== null && surplusNow > 0) {
      var bg = bestInsightGoal;
      var newAmt = bg.gcur + surplusNow;
      var newPct = bg.gtgt > 0 ? Math.min(100, Math.round(newAmt / bg.gtgt * 100)) : bg.gpct;
      var gain   = newPct - bg.gpct;
      var gname2 = bg.g.name || 'your top goal';
      if (gain > 0) {
        insightHtml = '<div class="snap-surplus-insight">'
          + '<span class="snap-insight-icon">&#128161;</span>'
          + '<span>Apply this month\'s surplus of <strong>' + fmt(surplusNow) + '</strong> to <strong>' + esc(gname2) + '</strong> and you\'d jump from <strong>' + bg.gpct + '%</strong> to <strong style="color:var(--success)">' + newPct + '%</strong></span>'
          + '</div>';
      }
    }

    sectionC = '<div class="card mb">'
      + '<div class="tile-hd" style="margin-bottom:14px">'
      + '<div class="section-label" style="margin:0">🎯 Savings Goals</div>'
      + '<a href="#" onclick="go(\'goals\');return false;" class="tile-link">View all &rarr;</a>'
      + '</div>'
      + goalRows
      + insightHtml
      + '</div>';
  }

  // ── Section D — Quick Stats Strip ───────────────────────────
  var nowD = new Date();
  var eom  = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0);
  var daysLeft = Math.ceil((eom - nowD) / 86400000);

  var unpaidBills = 0;
  try { unpaidBills = (BILLS || []).filter(function(b){ return !b.paid; }).length; } catch(e) {}

  var curSummary = { income: 0, surplus: 0 };
  try {
    if (typeof getMonthSummary === 'function') curSummary = getMonthSummary(nowD.getFullYear(), nowD.getMonth() + 1);
  } catch(e) {}
  var savingsRate = curSummary.income > 0 ? Math.round(curSummary.surplus / curSummary.income * 100) : 0;

  var bigCatLabel = '&#8212;';
  var bigCatAmtHtml = '';
  try {
    var curPfx2 = nowD.getFullYear() + '-' + String(nowD.getMonth() + 1).padStart(2, '0');
    var catTots = {};
    activeTX().filter(function(t) {
      return t.type === 'expense' && t.date && t.date.startsWith(curPfx2)
        && t.catId !== 'transfers' && (t.category || '').toLowerCase() !== 'transfers';
    }).forEach(function(t) {
      var cid = t.catId || 'other';
      catTots[cid] = (catTots[cid] || 0) + Number(t.amount);
    });
    var cEntries = Object.keys(catTots).map(function(k){ return [k, catTots[k]]; }).sort(function(a,b){ return b[1]-a[1]; });
    if (cEntries.length) {
      var topCat2 = LCATS.find(function(c){ return c.id === cEntries[0][0]; });
      bigCatLabel   = topCat2 ? (topCat2.icon + ' ' + esc(topCat2.name)) : esc(cEntries[0][0]);
      bigCatAmtHtml = '<div class="snap-chip-sub">' + fmt(cEntries[0][1]) + '</div>';
    }
  } catch(e) {}

  var sectionD = '<div class="snap-chips">'
    + '<div class="snap-chip">'
    + '<div class="snap-chip-lbl">Unpaid bills</div>'
    + '<div class="snap-chip-val">' + unpaidBills + '</div>'
    + '</div>'
    + '<div class="snap-chip">'
    + '<div class="snap-chip-lbl">Savings rate</div>'
    + '<div class="snap-chip-val">' + savingsRate + '%</div>'
    + '</div>'
    + '<div class="snap-chip">'
    + '<div class="snap-chip-lbl">Days left</div>'
    + '<div class="snap-chip-val">' + daysLeft + '</div>'
    + '</div>'
    + '<div class="snap-chip snap-chip-wide">'
    + '<div class="snap-chip-lbl">Top expense</div>'
    + '<div class="snap-chip-val snap-chip-text">' + bigCatLabel + '</div>'
    + bigCatAmtHtml
    + '</div>'
    + '</div>';

  el.innerHTML = uploadTile + sectionA + sectionB + sectionC + sectionD;

  // ── Post-render animations ───────────────────────────────────
  _snapRunAnimations(nw);
  _snapRenderBarChart();
}

// ── Animations ────────────────────────────────────────────────

// Count-up for the net worth number
function _snapRunAnimations(nwTarget) {
  // Cancel any running animation
  if (_snapRafNW) { cancelAnimationFrame(_snapRafNW); _snapRafNW = null; }

  // Animate progress bars: need two RAF ticks to let browser register width:0 first
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      var bars = document.querySelectorAll('#snapshot-content .snap-anim-bar');
      for (var i = 0; i < bars.length; i++) {
        var pct = parseFloat(bars[i].getAttribute('data-pct') || 0);
        bars[i].style.width = pct + '%';
      }
    });
  });

  // Count-up the net worth number over 900ms
  var nwEl = document.getElementById('snap-nw-number');
  if (!nwEl || nwTarget === 0) {
    if (nwEl) nwEl.textContent = fmt(nwTarget);
    return;
  }
  var startTs = null;
  var dur = 900;
  function _step(ts) {
    if (!startTs) startTs = ts;
    var prog = Math.min((ts - startTs) / dur, 1);
    // Ease-out cubic
    var eased = 1 - Math.pow(1 - prog, 3);
    nwEl.textContent = fmt(nwTarget * eased);
    if (prog < 1) {
      _snapRafNW = requestAnimationFrame(_step);
    } else {
      nwEl.textContent = fmt(nwTarget);
      _snapRafNW = null;
    }
  }
  _snapRafNW = requestAnimationFrame(_step);
}

// ── Bar chart (6-month income/expense) ────────────────────────
function _snapRenderBarChart() {
  var canvas = document.getElementById('snap-bar-chart');
  if (!canvas) return;
  if (snapBarChart) { snapBarChart.destroy(); snapBarChart = null; }

  // Build last-6-months data ending on snapYear/snapMonth
  var months = [];
  var y = snapYear, m = snapMonth;
  for (var i = 5; i >= 0; i--) {
    var mm = m - i;
    var yy = y;
    if (mm <= 0) { mm += 12; yy--; }
    months.push(yy + '-' + String(mm).padStart(2, '0'));
  }

  var incData = [];
  var expData = [];
  var labels  = [];
  try {
    var allTx = activeTX();
    months.forEach(function(pfx) {
      var lbl = new Date(pfx + '-02').toLocaleString('en-AU', { month: 'short', year: '2-digit' });
      labels.push(lbl);
      var inc = allTx.filter(function(t){ return t.type === 'income'  && t.date && t.date.startsWith(pfx); }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
      var exp = allTx.filter(function(t){ return t.type === 'expense' && t.date && t.date.startsWith(pfx) && t.catId !== 'transfers' && (t.category||'').toLowerCase() !== 'transfers'; }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
      incData.push(inc);
      expData.push(exp);
    });
  } catch(e) {}

  var token = function(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || ''; };
  var curPfx = snapYear + '-' + String(snapMonth).padStart(2, '0');

  snapBarChart = safeChart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Income',
          data: incData,
          backgroundColor: months.map(function(m){ return m === curPfx ? 'rgba(0,200,150,.9)' : 'rgba(0,200,150,.35)'; }),
          borderColor: 'rgba(0,200,150,.8)',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Expenses',
          data: expData,
          backgroundColor: months.map(function(m){ return m === curPfx ? 'rgba(240,83,138,.9)' : 'rgba(240,83,138,.35)'; }),
          borderColor: 'rgba(240,83,138,.8)',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 600, easing: 'easeOutQuart' },
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12, color: token('--muted') } },
        tooltip: {
          callbacks: {
            afterBody: function(items) {
              var inc = incData[items[0].dataIndex] || 0;
              var exp = expData[items[0].dataIndex] || 0;
              var s = inc - exp;
              return [' ─────────────', (s >= 0 ? ' Surplus: ' : ' Deficit: ') + fmt(Math.abs(s))];
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: token('--muted'), font: { size: 10 } } },
        y: { grid: { color: token('--card3') }, ticks: { color: token('--muted'), font: { size: 10 }, callback: function(v){ return '$' + Math.round(v/1000) + 'k'; } } }
      }
    }
  });
}
