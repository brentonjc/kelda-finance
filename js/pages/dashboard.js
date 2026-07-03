// Dashboard always shows the current month — no period navigation needed here.
// Analytical/trend views live in js/pages/insights.js

function _dbDaysDiff(dateStr) {
  if (!dateStr) return 9999;
  var a = new Date(today() + 'T00:00:00');
  var b = new Date(dateStr + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

// ══════════════════════════════════════════════════════════════
// GAMIFICATION — Health Score · Streaks · Nudges · NW History
// ══════════════════════════════════════════════════════════════

// ── Net Worth Snapshot recorder ───────────────────────────────
// Computes the current net worth and all component values.
// Returns { bank, super_, property, equities, liabilities, netWorth }.
function computeCurrentNetWorth() {
  var months  = (typeof ctAllMonths === 'function') ? ctAllMonths() : [];
  var lm      = months.length ? months[months.length - 1] : null;

  // Bank: all CT accounts for the most recent month, projected forward with any
  // income/expenses logged since — so net worth stays live between manual balance updates.
  var ctAcctsIds = (typeof CT_ACCTS !== 'undefined' && CT_ACCTS && CT_ACCTS.length)
    ? CT_ACCTS.map(function(a){ return a.id; })
    : ['offset','home','sav1','sav2'];
  var bank = lm ? ctAcctsIds.reduce(function(s,a){ return s + ((CT[a]||{})[lm]||0); }, 0) : 0;
  bank += _nwUnreconciledCashflow(lm);

  // Super: use multi-account totals if available, fall back to legacy SUPER fields
  var super_ = _nwSuperCurrentTotal();

  // Property: sum all mortgage property homeValues
  var property = 0;
  var mortProps = (MORTGAGE && MORTGAGE.properties && Array.isArray(MORTGAGE.properties))
    ? MORTGAGE.properties : (MORTGAGE && MORTGAGE.homeValue ? [MORTGAGE] : []);
  mortProps.forEach(function(p){ property += Number(p.homeValue)||0; });

  // Equities
  var equities = (typeof eqTotalEquitiesValue === 'function') ? eqTotalEquitiesValue() : 0;

  // Liabilities (includes all mortgage balances)
  var liabilities = (typeof liabTotal === 'function') ? liabTotal()
    : mortProps.reduce(function(s,p){ return s + (Number(p.balance)||0); }, 0);

  var netWorth = bank + super_ + property + equities - liabilities;
  return { bank: Math.round(bank), super_: Math.round(super_), property: Math.round(property),
           equities: Math.round(equities), liabilities: Math.round(liabilities),
           netWorth: Math.round(netWorth * 100) / 100 };
}

// ── Link income/expenses into net worth between Cash Tracker updates ──
// If the user hasn't yet entered this month's account balances, project the
// last known bank total forward using transactions logged after that month.
function _nwUnreconciledCashflow(lastCtMonth) {
  try {
    var nowMonth = _nwCurrentMonth();
    if (!lastCtMonth || lastCtMonth >= nowMonth) return 0;
    var txns = (typeof activeTX === 'function') ? activeTX() : (TX || []);
    var net = 0;
    txns.forEach(function(t) {
      if (!t.date || t.date.slice(0,7) <= lastCtMonth) return;
      if (t.catId === 'transfers' || (t.category||'').toLowerCase() === 'transfers') return;
      if (t.type === 'income') net += Number(t.amount) || 0;
      else if (t.type === 'expense') net -= Number(t.amount) || 0;
    });
    return net;
  } catch(e) { return 0; }
}

// Helper: current super total across both profiles
function _nwSuperCurrentTotal() {
  if (typeof SUPER_ACCTS !== 'undefined') {
    var all = [];
    if (Array.isArray(SUPER_ACCTS)) { all = SUPER_ACCTS; }
    else { ['brenton','shelley'].forEach(function(k){ if(SUPER_ACCTS[k])all=all.concat(SUPER_ACCTS[k]); }); }
    if (all.length) return all.reduce(function(s,a){ return s+(Number(a.balance)||0); }, 0);
  }
  var supB = (SUPER && SUPER.b && SUPER.b.balance) ? Number(SUPER.b.balance) : 0;
  var supS = (SUPER && SUPER.s && SUPER.s.balance) ? Number(SUPER.s.balance) : 0;
  return supB + supS;
}

// ── Record today's snapshot ───────────────────────────────────
function recordNetWorthSnapshot() {
  try {
    var nw = computeCurrentNetWorth();
    var d = new Date();
    var todayStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');

    var hist = [];
    try { hist = JSON.parse(localStorage.getItem('cff_networth_history') || '[]') || []; } catch(e) { hist = []; }

    var entry = { date: todayStr, netWorth: nw.netWorth,
                  bank: nw.bank, super_: nw.super_, property: nw.property,
                  equities: nw.equities, liabilities: nw.liabilities };
    var idx = -1;
    for (var i = 0; i < hist.length; i++) { if (hist[i].date === todayStr) { idx = i; break; } }
    if (idx >= 0) { hist[idx] = entry; } else { hist.push(entry); }
    if (hist.length > 730) hist = hist.slice(hist.length - 730);
    try { localStorage.setItem('cff_networth_history', JSON.stringify(hist)); } catch(e) {}

    // Also back-fill any CT months that don't yet have a NW entry
    _nwBackfillFromCT(hist);
  } catch(e) { console.warn('recordNetWorthSnapshot error', e); }
}

// ── Back-fill NW history using Cash Tracker months as backbone ─
// Uses component monthly histories where recorded; falls back to
// current values so every CT month immediately shows a net worth.
function _nwBackfillFromCT(existingHist) {
  try {
    var ctMonths = (typeof ctAllMonths === 'function') ? ctAllMonths() : [];
    if (!ctMonths.length) return;

    var ctAcctsIds = (typeof CT_ACCTS !== 'undefined' && CT_ACCTS && CT_ACCTS.length)
      ? CT_ACCTS.map(function(a){ return a.id; }) : ['offset','home','sav1','sav2'];

    // Current fallback values (used when no per-month entry exists)
    var currentNW     = computeCurrentNetWorth();
    var fallbackSuper = currentNW.super_;
    var fallbackProp  = currentNW.property;
    var fallbackEq    = currentNW.equities;
    var fallbackLiab  = currentNW.liabilities;

    // Load component histories
    var superHist = {}; try { superHist    = JSON.parse(localStorage.getItem('cff_super_history')    || '{}') || {}; } catch(e) {}
    var mortHist  = {}; try { mortHist     = JSON.parse(localStorage.getItem('cff_mortgage_history') || '{}') || {}; } catch(e) {}
    var eqHist    = {}; try { eqHist       = JSON.parse(localStorage.getItem('cff_eq_history')       || '{}') || {}; } catch(e) {}
    var liabHist  = {}; try { liabHist     = JSON.parse(localStorage.getItem('cff_liab_history')     || '{}') || {}; } catch(e) {}

    // Build month→existing entry map
    var moMap = {};
    existingHist.forEach(function(e){ if(e.date) moMap[e.date.slice(0,7)] = true; });

    var changed = false;
    ctMonths.forEach(function(mo) {
      if (moMap[mo]) return; // already have an entry for this month

      // Bank from CT
      var bank = ctAcctsIds.reduce(function(s,a){ return s + ((CT[a]||{})[mo]||0); }, 0);

      // Super
      var sh     = superHist[mo];
      var super_ = sh ? ((sh.brenton||0) + (sh.shelley||0)) : fallbackSuper;

      // Property
      var mh       = mortHist[mo];
      var property = mh ? (mh.homeValue||0) : fallbackProp;

      // Equities
      var equities = (typeof eqHist[mo] !== 'undefined') ? eqHist[mo] : fallbackEq;

      // Liabilities (includes mortgage balance)
      var liabilities = (typeof liabHist[mo] !== 'undefined') ? liabHist[mo] : fallbackLiab;

      var netWorth = bank + super_ + property + equities - liabilities;

      // Use last day of the month as the date
      var yr = parseInt(mo.slice(0,4)), m = parseInt(mo.slice(5,7));
      var lastDay = new Date(yr, m, 0).getDate();
      var dateStr = mo + '-' + String(lastDay).padStart(2,'0');

      existingHist.push({ date: dateStr, netWorth: Math.round(netWorth*100)/100,
        bank: Math.round(bank), super_: Math.round(super_), property: Math.round(property),
        equities: Math.round(equities), liabilities: Math.round(liabilities),
        _backfilled: true });
      changed = true;
    });

    if (changed) {
      existingHist.sort(function(a,b){ return a.date < b.date ? -1 : 1; });
      if (existingHist.length > 730) existingHist = existingHist.slice(existingHist.length - 730);
      try { localStorage.setItem('cff_networth_history', JSON.stringify(existingHist)); } catch(e) {}
    }
  } catch(e) { console.warn('_nwBackfillFromCT error', e); }
}

// ── Save per-component monthly values ─────────────────────────
// Called by super/mortgage/equities/liabilities save functions.
function nwRecordSuperMonth(mo, bretonTotal, shelleyTotal) {
  try {
    var h = {}; try { h = JSON.parse(localStorage.getItem('cff_super_history') || '{}') || {}; } catch(e) {}
    h[mo] = { brenton: Math.round(bretonTotal||0), shelley: Math.round(shelleyTotal||0) };
    localStorage.setItem('cff_super_history', JSON.stringify(h));
  } catch(e) {}
}

function nwRecordMortgageMonth(mo, homeValue, balance) {
  try {
    var h = {}; try { h = JSON.parse(localStorage.getItem('cff_mortgage_history') || '{}') || {}; } catch(e) {}
    h[mo] = { homeValue: Math.round(homeValue||0), balance: Math.round(balance||0) };
    localStorage.setItem('cff_mortgage_history', JSON.stringify(h));
  } catch(e) {}
}

function nwRecordEqMonth(mo, totalValue) {
  try {
    var h = {}; try { h = JSON.parse(localStorage.getItem('cff_eq_history') || '{}') || {}; } catch(e) {}
    h[mo] = Math.round(totalValue||0);
    localStorage.setItem('cff_eq_history', JSON.stringify(h));
  } catch(e) {}
}

function nwRecordLiabMonth(mo, totalBalance) {
  try {
    var h = {}; try { h = JSON.parse(localStorage.getItem('cff_liab_history') || '{}') || {}; } catch(e) {}
    h[mo] = Math.round(totalBalance||0);
    localStorage.setItem('cff_liab_history', JSON.stringify(h));
  } catch(e) {}
}

// Helper: current YYYY-MM string
function _nwCurrentMonth() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}

// ── Populate historical net worth from transactions ─────────────
function populateNetWorthHistory() {
  try {
    var hist = [];
    try { hist = JSON.parse(localStorage.getItem('cff_networth_history') || '[]') || []; } catch(e) { hist = []; }

    // If we already have significant history, skip regeneration
    if (hist.length >= 3) return;

    // Find earliest transaction date
    var txns = TX || [];
    if (txns.length === 0) return;

    var earliest = null;
    txns.forEach(function(t) {
      if (t.date && (!earliest || t.date < earliest)) {
        earliest = t.date;
      }
    });

    if (!earliest) return;

    // Parse earliest date
    var parts = earliest.split('-');
    var startYear = parseInt(parts[0]);
    var startMonth = parseInt(parts[1]);
    var startDay = parseInt(parts[2]);

    // Generate net worth for each month from start to today
    var hist = [];
    var now = new Date();
    var currentYear = now.getFullYear();
    var currentMonth = now.getMonth() + 1;

    var year = startYear;
    var month = startMonth;

    while (year < currentYear || (year === currentYear && month <= currentMonth)) {
      // Use the last day of each month (or current day for current month)
      var lastDay;
      if (year === currentYear && month === currentMonth) {
        lastDay = now.getDate();
      } else {
        var nextMonth = new Date(year, month, 0);
        lastDay = nextMonth.getDate();
      }

      var dateStr = year + '-' + String(month).padStart(2,'0') + '-' + String(lastDay).padStart(2,'0');

      // Calculate net worth as of this date
      var nw = 0;

      // Transactions up to this date
      var txBalance = 0;
      txns.forEach(function(t) {
        if (t.date && t.date <= dateStr) {
          if (t.type === 'income') {
            txBalance += Number(t.amount);
          } else {
            txBalance -= Number(t.amount);
          }
        }
      });
      nw += txBalance;

      // Super balances (assume constant, use current)
      var supB = (SUPER && SUPER.b && SUPER.b.balance) ? Number(SUPER.b.balance) : 0;
      var supS = (SUPER && SUPER.s && SUPER.s.balance) ? Number(SUPER.s.balance) : 0;
      nw += supB + supS;

      // Home value and mortgage (assume constant, use current)
      var homeVal = (MORTGAGE && MORTGAGE.homeValue) ? Number(MORTGAGE.homeValue) : 0;
      var mortgageBal = (MORTGAGE && MORTGAGE.balance) ? Number(MORTGAGE.balance) : 0;
      nw += homeVal - mortgageBal;

      // Equities (assume constant, use current)
      var eqV = (typeof eqTotalEquitiesValue === 'function') ? eqTotalEquitiesValue() : 0;
      nw += eqV;

      // Liabilities (assume constant, use current)
      var otherLiab = (typeof liabTotal === 'function') ? liabTotal() : 0;
      nw -= otherLiab;

      hist.push({ date: dateStr, netWorth: Math.round(nw * 100) / 100 });

      // Move to next month
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }

    // Keep last 730 days
    if (hist.length > 730) hist = hist.slice(Math.max(0, hist.length - 730));

    try { localStorage.setItem('cff_networth_history', JSON.stringify(hist)); } catch(e) {}
  } catch(e) { console.warn('populateNetWorthHistory error', e); }
}

// ── Streak calculations ────────────────────────────────────────
function _dbPastMonthPfx(monthsBack) {
  var d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsBack);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}

function calculateSavingsStreak() {
  var txns    = activeTX();
  var now     = new Date();
  var yr      = now.getFullYear();
  var currMo  = now.getMonth() + 1; // 1-12

  // YTD dot for each month Jan–Dec (null = future/current)
  var yearDots = [];
  for (var m = 1; m <= 12; m++) {
    if (m >= currMo) { yearDots.push(null); continue; }
    var pfx = yr + '-' + String(m).padStart(2,'0');
    var inc = txns.filter(function(t){return t.type==='income'&&t.date&&t.date.startsWith(pfx);}).reduce(function(s,t){return s+Number(t.amount);},0);
    var exp = txns.filter(function(t){return t.type==='expense'&&t.date&&t.date.startsWith(pfx);}).reduce(function(s,t){return s+Number(t.amount);},0);
    yearDots.push(inc > exp);
  }

  // Streak: consecutive hits from last complete month backwards
  var count = 0;
  for (var i = currMo - 2; i >= 0; i--) {
    if (yearDots[i] === true) { count++; } else { break; }
  }
  return { count: count, months: yearDots.slice(0, currMo-1).slice(-8), yearDots: yearDots };
}

function calculateBudgetStreak() {
  var txns     = activeTX();
  var budgKeys = Object.keys(LBUDGETS || {});
  var now      = new Date();
  var yr       = now.getFullYear();
  var currMo   = now.getMonth() + 1;

  var yearDots = [];
  for (var m = 1; m <= 12; m++) {
    if (m >= currMo) { yearDots.push(null); continue; }
    var pfx   = yr + '-' + String(m).padStart(2,'0');
    var moTx  = txns.filter(function(t){ return t.date && t.date.startsWith(pfx); });
    var allOk = budgKeys.length > 0;
    for (var bi = 0; bi < budgKeys.length; bi++) {
      var catId   = budgKeys[bi];
      var limit   = Number(LBUDGETS[catId]) || 0;
      if (!limit) continue;
      var cat     = LCATS.find(function(c){ return c.id === catId; });
      var catName = cat ? cat.name : catId;
      var spent   = moTx.filter(function(t){
        return t.type==='expense' && (t.catId===catId || t.category===catName);
      }).reduce(function(s,t){ return s+Number(t.amount); },0);
      if (spent > limit) { allOk = false; break; }
    }
    yearDots.push(allOk);
  }

  var count = 0;
  for (var i = currMo - 2; i >= 0; i--) {
    if (yearDots[i] === true) { count++; } else { break; }
  }
  return { count: count, months: yearDots.slice(0, currMo-1).slice(-8), yearDots: yearDots };
}

// ── YTD dot grid helper ───────────────────────────────────────
function _dbYtdDots(yearDots, hitColor) {
  var MON = ['J','F','M','A','M','J','J','A','S','O','N','D'];
  var html = '<div class="ytd-dots-row">';
  for (var i = 0; i < 12; i++) {
    var v = yearDots[i];
    var dotStyle;
    if (v === true) {
      dotStyle = 'background:' + hitColor + ';box-shadow:0 0 6px ' + hitColor + '88';
    } else if (v === false) {
      // Missed month — clearly unfilled (solid dim)
      dotStyle = 'background:rgba(98,120,160,0.30);border:1px solid rgba(98,120,160,0.15)';
    } else {
      // Future month — faint placeholder
      dotStyle = 'background:rgba(98,120,160,0.08)';
    }
    html += '<div class="ytd-dot-wrap">'
      + '<div class="ytd-dot" style="' + dotStyle + '"></div>'
      + '<div class="ytd-dot-lbl">' + MON[i] + '</div>'
      + '</div>';
  }
  html += '</div>';
  return html;
}

// ── Render Streaks ─────────────────────────────────────────────
function renderStreaks(sav, bud) {
  var el = document.getElementById('db-streaks-row');
  if (!el) return;

  function savBadge(c) {
    if (c >= 6) return ['green','On fire 🔥'];
    if (c >= 3) return ['green','Building'];
    if (c >= 1) return ['amber','Started'];
    return ['muted','Start today'];
  }
  function budBadge(c) {
    if (c >= 6) return ['green','Locked in'];
    if (c >= 3) return ['amber','On track'];
    if (c >= 1) return ['amber','Building'];
    return ['muted','Start today'];
  }

  var sb = savBadge(sav.count);
  var bb = budBadge(bud.count);
  var savClick = sav.count >= 3 ? 'onclick="triggerCelebration(\'Savings streak! 🔥\',\'' + sav.count + ' months of positive savings\')"' : '';
  var savYtd = sav.yearDots || sav.months.map(function(v){return v;});
  var budYtd = bud.yearDots || bud.months.map(function(v){return v;});

  el.innerHTML = '<div class="streak-card savings-streak" ' + savClick + '>'
    + '<div class="streak-icon">🔥</div>'
    + '<div class="streak-content">'
    + '<div class="streak-title">Savings Streak</div>'
    + '<div class="streak-count" id="sav-streak-count">0</div>'
    + '<div class="streak-desc">months income &gt; expenses</div>'
    + _dbYtdDots(savYtd, '#00C896')
    + '</div>'
    + '<div class="streak-badge ' + sb[0] + '">' + sb[1] + '</div>'
    + '</div>'
    + '<div class="streak-card budget-streak">'
    + '<div class="streak-icon">🎯</div>'
    + '<div class="streak-content">'
    + '<div class="streak-title">Budget Streak</div>'
    + '<div class="streak-count" id="bud-streak-count">0</div>'
    + '<div class="streak-desc">months all budgets under</div>'
    + _dbYtdDots(budYtd, '#F59E0B')
    + '</div>'
    + '<div class="streak-badge ' + bb[0] + '">' + bb[1] + '</div>'
    + '</div>';

  function animateCount(elId, target) {
    var numEl = document.getElementById(elId);
    if (!numEl) return;
    if (target === 0) { numEl.textContent = '0'; return; }
    var cur = 0;
    var iv = setInterval(function() {
      cur = Math.min(cur + 1, target);
      numEl.textContent = cur;
      if (cur >= target) clearInterval(iv);
    }, 80);
  }
  setTimeout(function(){ animateCount('sav-streak-count', sav.count); animateCount('bud-streak-count', bud.count); }, 200);
}

// ── Action Cards (static 3-item priority list) ────────────────
function generateActionCards() {
  var now = new Date();
  var yr  = now.getFullYear();
  var mo  = now.getMonth() + 1;
  var pfx = yr + '-' + String(mo).padStart(2,'0');
  var txns = activeTX();
  var cards = [];

  // ── Card 1: Top Goal ─────────────────────────────────────────
  var activeGoals = (GOALS || []).filter(function(g) {
    var tgt = Number(g.targetAmount) || Number(g.target) || 0;
    var cur = (typeof _goalCurrent==='function') ? _goalCurrent(g) : (Number(g.currentAmount)||Number(g.saved)||0);
    return tgt > 0 && cur < tgt;
  });
  activeGoals.sort(function(a, b) {
    var ap = ((typeof _goalCurrent==='function'?_goalCurrent(a):(Number(a.currentAmount)||Number(a.saved)||0)) / (Number(a.targetAmount)||Number(a.target)||1));
    var bp = ((typeof _goalCurrent==='function'?_goalCurrent(b):(Number(b.currentAmount)||Number(b.saved)||0)) / (Number(b.targetAmount)||Number(b.target)||1));
    return bp - ap;
  });
  if (activeGoals.length) {
    var g1   = activeGoals[0];
    var tgt1 = Number(g1.targetAmount) || Number(g1.target) || 0;
    var cur1 = (typeof _goalCurrent==='function') ? _goalCurrent(g1) : (Number(g1.currentAmount)||Number(g1.saved)||0);
    var pct1 = Math.round((cur1/tgt1)*100);
    var need1 = tgt1 - cur1;
    cards.push({
      num: 1, icon: g1.icon || '🎯', label: 'SAVINGS GOAL',
      title: g1.name,
      body: pct1 + '% complete · ' + fmt(need1) + ' to go',
      status: pct1 >= 80 ? 'green' : pct1 >= 40 ? 'amber' : 'pink',
      statusTxt: pct1 + '%',
      link: "go('goals')", linkTxt: 'View Goal →'
    });
  } else {
    cards.push({ num:1, icon:'🎯', label:'SAVINGS GOAL', title:'No active goals',
      body:'Set a target to track your savings progress.',
      status:'muted', statusTxt:'Set up', link:"go('goals')", linkTxt:'Add Goal →' });
  }

  // ── Card 2: Budget status ─────────────────────────────────────
  var budgKeys = Object.keys(LBUDGETS || {});
  var topAlert = null;
  for (var bi = 0; bi < budgKeys.length; bi++) {
    var catId  = budgKeys[bi];
    var limit  = Number(LBUDGETS[catId]) || 0;
    if (!limit) continue;
    var cat    = LCATS.find(function(c){ return c.id === catId; });
    var cName  = cat ? cat.name : catId;
    var spent  = txns.filter(function(t){
      return t.type==='expense' && t.date.startsWith(pfx) && (t.catId===catId||t.category===cName);
    }).reduce(function(s,t){return s+Number(t.amount);},0);
    var pctB = limit > 0 ? (spent/limit)*100 : 0;
    if (pctB >= 70) {
      if (!topAlert || pctB > topAlert.pct) topAlert = { name:cName, pct:pctB, limit:limit, spent:spent };
    }
  }
  if (topAlert) {
    var over = topAlert.pct >= 100;
    cards.push({
      num:2, icon:'📊', label:'BUDGET CHECK — ' + now.toLocaleString('en-AU',{month:'long'}).toUpperCase(),
      title: topAlert.name + (over ? ' over budget' : ' approaching limit'),
      body: Math.round(topAlert.pct) + '% of ' + fmt(topAlert.limit) + ' used'
        + (over ? ' · ' + fmt(topAlert.spent - topAlert.limit) + ' over' : ' this month'),
      status: over ? 'pink' : 'amber', statusTxt: Math.round(topAlert.pct) + '%',
      link:"go('bva')", linkTxt:'Budget Report →'
    });
  } else if (budgKeys.length) {
    cards.push({ num:2, icon:'✅', label:'BUDGET CHECK — ' + now.toLocaleString('en-AU',{month:'long'}).toUpperCase(),
      title:'All budgets on track', body:budgKeys.length + ' categories within limit this month.',
      status:'green', statusTxt:'On track', link:"go('bva')", linkTxt:'View Budgets →' });
  } else {
    cards.push({ num:2, icon:'📊', label:'BUDGET CHECK',
      title:'No budgets configured', body:'Set monthly limits to track your category spending.',
      status:'muted', statusTxt:'Set up', link:"go('bva')", linkTxt:'Set Budgets →' });
  }

  // ── Card 3: Months to hit top goal ───────────────────────────
  var savArr = [];
  for (var mi2 = 1; mi2 <= 3; mi2++) {
    var md  = new Date(yr, mo - 1 - mi2, 1);
    var mp2 = md.getFullYear() + '-' + String(md.getMonth()+1).padStart(2,'0');
    var mInc = txns.filter(function(t){return t.type==='income'&&t.date&&t.date.startsWith(mp2);}).reduce(function(s,t){return s+Number(t.amount);},0);
    var mExp = txns.filter(function(t){return t.type==='expense'&&t.date&&t.date.startsWith(mp2);}).reduce(function(s,t){return s+Number(t.amount);},0);
    if (mInc > 0 || mExp > 0) savArr.push(mInc - mExp);
  }
  var avgSav = savArr.length ? savArr.reduce(function(a,b){return a+b;},0)/savArr.length : 0;
  if (activeGoals.length && avgSav > 0) {
    var g3   = activeGoals[activeGoals.length - 1]; // pick least-progressed goal
    var tgt3 = Number(g3.targetAmount)||Number(g3.target)||0;
    var cur3 = (typeof _goalCurrent==='function') ? _goalCurrent(g3) : (Number(g3.currentAmount)||Number(g3.saved)||0);
    var mos  = Math.ceil(Math.max(0, tgt3 - cur3) / avgSav);
    var projD = new Date(now.getFullYear(), now.getMonth() + mos, 1);
    var projS = projD.toLocaleString('en-AU', { month: 'long', year: 'numeric' });
    cards.push({ num:3, icon:'📅', label:'GOAL PROJECTION',
      title: g3.name + ' — ~' + mos + ' month' + (mos!==1?'s':'') + ' away',
      body: 'At avg savings of ' + fmt(Math.round(avgSav)) + '/mo, you\'ll reach this around ' + projS + '.',
      status: mos <= 6 ? 'green' : mos <= 18 ? 'amber' : 'pink',
      statusTxt: mos + 'mo',
      link:"go('goals')", linkTxt:'View Goals →' });
  } else if (activeGoals.length) {
    cards.push({ num:3, icon:'📅', label:'GOAL PROJECTION',
      title:'Increase savings to project',
      body:'Your avg savings over the last 3 months is ' + fmt(Math.round(avgSav)) + '. Positive savings unlocks goal projections.',
      status:'pink', statusTxt:'Off track', link:"go('transactions')", linkTxt:'Review Spending →' });
  } else {
    cards.push({ num:3, icon:'📅', label:'GOAL PROJECTION',
      title:'Add a goal to see your projection',
      body:'Once you have a savings goal we\'ll show exactly how long it will take at your current rate.',
      status:'muted', statusTxt:'Coming soon', link:"go('goals')", linkTxt:'Add Goal →' });
  }
  return cards;
}

function renderActionCards(cards) {
  var el = document.getElementById('db-nudge-wrap');
  if (!el) return;
  var sc = {
    green: { bg:'rgba(0,200,150,0.12)', color:'var(--success)', bdr:'rgba(0,200,150,0.25)' },
    amber: { bg:'rgba(245,158,11,0.12)', color:'var(--warn)', bdr:'rgba(245,158,11,0.25)' },
    pink:  { bg:'rgba(240,83,138,0.12)', color:'var(--primary)', bdr:'rgba(240,83,138,0.25)' },
    muted: { bg:'rgba(98,120,160,0.1)', color:'var(--muted)', bdr:'rgba(98,120,160,0.2)' }
  };
  var html = '';
  for (var ci = 0; ci < cards.length; ci++) {
    var c  = cards[ci];
    var s  = sc[c.status] || sc.muted;
    html += '<div class="action-card-item">'
      + '<div class="ac-num">' + c.num + '</div>'
      + '<div class="ac-icon">' + c.icon + '</div>'
      + '<div class="ac-body">'
      + '<div class="ac-label">' + c.label + '</div>'
      + '<div class="ac-title">' + c.title + '</div>'
      + '<div class="ac-desc">' + c.body + '</div>'
      + '<a href="#" onclick="' + c.link + ';return false;" class="ac-link">' + c.linkTxt + '</a>'
      + '</div>'
      + '<div class="ac-status" style="background:' + s.bg + ';color:' + s.color + ';border:1px solid ' + s.bdr + '">' + c.statusTxt + '</div>'
      + '</div>';
  }
  el.innerHTML = html;
}

// ── Nudge generation ───────────────────────────────────────────
function generateNudges() {
  var nudges = [];
  var now    = new Date();
  var yr     = now.getFullYear();
  var mo     = now.getMonth() + 1;
  var pfx    = yr + '-' + String(mo).padStart(2,'0');
  var day    = now.getDate();
  var txns   = activeTX();
  var moTx   = txns.filter(function(t){ return t.date && t.date.startsWith(pfx); });
  var inc    = moTx.filter(function(t){return t.type==='income';}).reduce(function(s,t){return s+Number(t.amount);},0);
  var exp    = moTx.filter(function(t){return t.type==='expense';}).reduce(function(s,t){return s+Number(t.amount);},0);
  var savRate = inc > 0 ? (inc - exp) / inc : 0;

  // Rule 1: Budget pace warning
  if (nudges.length < 3) {
    var budgKeys = Object.keys(LBUDGETS || {});
    var bestPace = null;
    for (var bi = 0; bi < budgKeys.length; bi++) {
      var catId   = budgKeys[bi];
      var limit   = Number(LBUDGETS[catId]) || 0;
      if (!limit) continue;
      var cat     = LCATS.find(function(c){ return c.id === catId; });
      var catName = cat ? cat.name : catId;
      var spent   = moTx.filter(function(t){
        return t.type==='expense' && (t.catId===catId || t.category===catName);
      }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
      var pct = spent / limit;
      if (pct >= 0.70 && pct < 1.00 && day < 20) {
        if (!bestPace || pct > bestPace.pct) bestPace = { name: catName, pct: pct, limit: limit };
      }
    }
    if (bestPace) {
      var daysLeft  = new Date(yr, mo, 0).getDate() - day;
      var pctStr    = Math.round(bestPace.pct * 100);
      nudges.push({ icon: '⚠️', text: '<strong>' + bestPace.name + '</strong> is at <strong>' + pctStr + '%</strong> of its ' + fmt(bestPace.limit) + ' budget and there are <strong>' + daysLeft + ' days</strong> left this month. Watch your spending here.' });
    }
  }

  // Rule 2: Budget overrun
  if (nudges.length < 3) {
    var budgKeys2 = Object.keys(LBUDGETS || {});
    var overCat   = null;
    for (var bi2 = 0; bi2 < budgKeys2.length; bi2++) {
      var catId2   = budgKeys2[bi2];
      var limit2   = Number(LBUDGETS[catId2]) || 0;
      if (!limit2) continue;
      var cat2     = LCATS.find(function(c){ return c.id === catId2; });
      var catName2 = cat2 ? cat2.name : catId2;
      var spent2   = moTx.filter(function(t){
        return t.type==='expense' && (t.catId===catId2 || t.category===catName2);
      }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
      if (spent2 > limit2) {
        var over = spent2 - limit2;
        if (!overCat || over > overCat.over) overCat = { name: catName2, over: over };
      }
    }
    if (overCat) {
      nudges.push({ icon: '🚨', text: '<strong>' + overCat.name + '</strong> has gone over budget by <strong>' + fmt(overCat.over) + '</strong> this month. Consider reviewing recent transactions.' });
    }
  }

  // Rule 3: Goal nearly complete
  if (nudges.length < 3) {
    var goals = GOALS || [];
    var bestGoal = null;
    for (var gi = 0; gi < goals.length; gi++) {
      var g      = goals[gi];
      var cur    = (typeof _goalCurrent === 'function') ? _goalCurrent(g) : (Number(g.currentAmount) || Number(g.saved) || 0);
      var tgt    = Number(g.targetAmount) || Number(g.target) || 0;
      if (!tgt) continue;
      var gPct   = cur / tgt;
      if (gPct >= 0.80 && gPct < 1.00) {
        if (!bestGoal || gPct > bestGoal.pct) bestGoal = { name: g.name, pct: gPct, target: tgt, need: tgt - cur };
      }
    }
    if (bestGoal) {
      nudges.push({ icon: '🎯', text: '<strong>' + bestGoal.name + '</strong> is at <strong>' + Math.round(bestGoal.pct*100) + '%</strong>. You need just <strong>' + fmt(bestGoal.need) + '</strong> more to reach your ' + fmt(bestGoal.target) + ' target.' });
    }
  }

  // Rule 4: Bill due soon
  if (nudges.length < 3) {
    var soonBill = null;
    var confirmedBills = (typeof BILLS !== 'undefined' ? BILLS : []).filter(function(b){ return b.status === 'confirmed' && b.nextDueDate; });
    for (var bli = 0; bli < confirmedBills.length; bli++) {
      var b = confirmedBills[bli];
      var daysUntil = _dbDaysDiff(b.nextDueDate);
      if (daysUntil >= 0 && daysUntil <= 7) {
        if (!soonBill || daysUntil < soonBill.daysUntil) soonBill = { name: b.displayName, daysUntil: daysUntil, amount: b.amount };
      }
    }
    if (soonBill) {
      var dStr = soonBill.daysUntil === 0 ? 'today' : ('in ' + soonBill.daysUntil + ' day' + (soonBill.daysUntil === 1 ? '' : 's'));
      nudges.push({ icon: '📅', text: '<strong>' + soonBill.name + '</strong> is due ' + dStr + ' (' + fmt(soonBill.amount) + ').' });
    }
  }

  // Rule 5: Good savings rate
  if (nudges.length < 3 && savRate >= 0.20 && inc > 0) {
    nudges.push({ icon: '🌟', text: 'Great work — you\'re saving <strong>' + Math.round(savRate*100) + '%</strong> of your income this month. That\'s above the 20% target. Keep it up!' });
  }

  // Rule 6: Low savings rate
  if (nudges.length < 3 && savRate > 0 && savRate < 0.10 && inc > 0) {
    var moreNeeded = Math.round(inc * 0.20 - (inc - exp));
    nudges.push({ icon: '💡', text: 'You\'re saving <strong>' + Math.round(savRate*100) + '%</strong> of income this month. Reaching 20% (<strong>' + fmt(moreNeeded) + ' more</strong> per month) would significantly accelerate your financial goals.' });
  }

  // Rule 7: Mortgage milestone
  if (nudges.length < 3) {
    var mBal2 = Number(MORTGAGE.balance) || 0;
    var mVal2 = Number(MORTGAGE.homeValue) || 0;
    if (mBal2 && mVal2) {
      var lvr2 = mBal2 / mVal2 * 100;
      if (lvr2 >= 78 && lvr2 <= 82) {
        var milestone = lvr2 < 80 ? 'you\'ve just crossed below 80%' : 'you\'re nearly there';
        nudges.push({ icon: '🏠', text: 'Your mortgage LVR is <strong>' + lvr2.toFixed(1) + '%</strong>. Crossing below 80% is a major milestone — ' + milestone + '.' });
      }
    }
  }

  // Rule 8: Prior month savings performance
  if (nudges.length < 3) {
    var priorD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var priorPfx = priorD.getFullYear() + '-' + String(priorD.getMonth()+1).padStart(2,'0');
    var priorMonLabel = priorD.toLocaleString('en-AU', { month: 'long' });
    var priorTx = activeTX().filter(function(t){ return t.date && t.date.startsWith(priorPfx); });
    var priorInc = priorTx.filter(function(t){return t.type==='income';}).reduce(function(s,t){return s+Number(t.amount);},0);
    var priorExp = priorTx.filter(function(t){return t.type==='expense';}).reduce(function(s,t){return s+Number(t.amount);},0);
    if (priorInc > 0) {
      var priorSaved   = priorInc - priorExp;
      var priorSavePct = Math.round((priorSaved / priorInc) * 100);
      if (priorSaved > 0 && priorSavePct >= 20) {
        nudges.push({ icon: '📈', text: '<strong>' + priorMonLabel + ':</strong> You saved <strong>' + fmt(priorSaved) + '</strong> (' + priorSavePct + '% of income). Great momentum — keep it going this month!' });
      } else if (priorSaved < 0) {
        nudges.push({ icon: '⚡', text: '<strong>' + priorMonLabel + ':</strong> spending exceeded income by <strong>' + fmt(Math.abs(priorSaved)) + '</strong>. This month is a chance to reset — focus on cutting back.' });
      } else if (priorSavePct < 10) {
        nudges.push({ icon: '📊', text: '<strong>' + priorMonLabel + ':</strong> savings rate was <strong>' + priorSavePct + '%</strong>. Aiming for 20% this month (' + fmt(Math.round(priorInc * 0.20)) + ') would make a real difference.' });
      }
    }
  }

  // Rule 9: Prior month budget performance
  if (nudges.length < 3) {
    var priorD2 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var priorPfx2 = priorD2.getFullYear() + '-' + String(priorD2.getMonth()+1).padStart(2,'0');
    var priorMonLabel2 = priorD2.toLocaleString('en-AU', { month: 'long' });
    var budgKeys3 = Object.keys(LBUDGETS || {});
    var overCount = 0;
    var topOver = null;
    for (var bi3 = 0; bi3 < budgKeys3.length; bi3++) {
      var catId3   = budgKeys3[bi3];
      var limit3   = Number(LBUDGETS[catId3]) || 0;
      if (!limit3) continue;
      var cat3     = LCATS.find(function(c){ return c.id === catId3; });
      var catName3 = cat3 ? cat3.name : catId3;
      var priorSpent = activeTX().filter(function(t){
        return t.type==='expense' && t.date && t.date.startsWith(priorPfx2) && (t.catId===catId3 || t.category===catName3);
      }).reduce(function(s,t){ return s+Number(t.amount); },0);
      if (priorSpent > limit3) {
        overCount++;
        var overAmt = priorSpent - limit3;
        if (!topOver || overAmt > topOver.amt) topOver = { name: catName3, amt: overAmt };
      }
    }
    if (budgKeys3.length > 0) {
      if (overCount === 0) {
        nudges.push({ icon: '🏆', text: '<strong>' + priorMonLabel2 + ':</strong> all budgets stayed on track. Clean sweep — great discipline going into this month!' });
      } else if (topOver) {
        nudges.push({ icon: '⚠️', text: '<strong>' + priorMonLabel2 + ':</strong> <strong>' + overCount + ' categor' + (overCount===1?'y':'ies') + '</strong> went over budget. <strong>' + topOver.name + '</strong> was the biggest overspend (' + fmt(topOver.amt) + ' over). Watch it this month.' });
      }
    }
  }

  // Rule 10: Goals vs spending alignment
  if (nudges.length < 3 && GOALS && GOALS.length) {
    var totalPct = 0, goalCount = 0;
    for (var gi2 = 0; gi2 < GOALS.length; gi2++) {
      var g2  = GOALS[gi2];
      var cur2 = (typeof _goalCurrent==='function') ? _goalCurrent(g2) : (Number(g2.currentAmount)||Number(g2.saved)||0);
      var tgt2 = Number(g2.targetAmount)||Number(g2.target)||0;
      if (tgt2 > 0) { totalPct += (cur2/tgt2)*100; goalCount++; }
    }
    if (goalCount > 0) {
      var avgGoalPct = Math.round(totalPct / goalCount);
      if (avgGoalPct < 40 && savRate < 0.10 && inc > 0) {
        nudges.push({ icon: '🎯', text: 'Your goals are <strong>' + avgGoalPct + '% funded</strong> on average and savings rate is low this month. Even redirecting <strong>' + fmt(Math.round(inc * 0.05)) + '</strong> more to savings would accelerate your goals.' });
      } else if (avgGoalPct >= 60) {
        nudges.push({ icon: '🌟', text: 'Your goals are <strong>' + avgGoalPct + '% funded</strong> on average — you\'re well on track. Keep the momentum going!' });
      }
    }
  }

  // Rule 11: Fallback
  if (!nudges.length) {
    nudges.push({ icon: '✅', text: 'Everything looks on track this month. Keep up the good habits!' });
  }

  return nudges;
}

// ── Render Nudges ──────────────────────────────────────────────
var _nudgeRotateTimer = null;
var _nudgeIdx = 0;

function renderNudges(nudges) {
  var el = document.getElementById('db-nudge-wrap');
  if (!el || !nudges.length) return;
  _nudgeIdx = 0;
  if (_nudgeRotateTimer) { clearInterval(_nudgeRotateTimer); _nudgeRotateTimer = null; }

  function showNudge(idx) {
    var n = nudges[idx];
    var dotsHtml = '';
    if (nudges.length > 1) {
      for (var di = 0; di < nudges.length; di++) {
        dotsHtml += '<div class="ndot' + (di === idx ? ' active' : '') + '" onclick="nudgeGoto(' + di + ')"></div>';
      }
    }
    el.innerHTML = '<div class="nudge-card">'
      + '<div class="nudge-icon">' + n.icon + '</div>'
      + '<div class="nudge-content">'
      + '<div class="nudge-tag">Smart Insight</div>'
      + '<div class="nudge-text">' + n.text + '</div>'
      + (dotsHtml ? '<div class="nudge-dots">' + dotsHtml + '</div>' : '')
      + '</div>'
      + '</div>';
  }

  showNudge(0);
  window._nudgeList = nudges;

  if (nudges.length > 1) {
    _nudgeRotateTimer = setInterval(function() {
      _nudgeIdx = (_nudgeIdx + 1) % nudges.length;
      showNudge(_nudgeIdx);
    }, 5000);
  }
}

function nudgeGoto(idx) {
  _nudgeIdx = idx;
  if (_nudgeRotateTimer) { clearInterval(_nudgeRotateTimer); _nudgeRotateTimer = null; }
  if (window._nudgeList) {
    renderNudges(window._nudgeList);
    _nudgeIdx = idx;
    var el = document.getElementById('db-nudge-wrap');
    if (!el || !window._nudgeList[idx]) return;
    var n = window._nudgeList[idx];
    var dotsHtml = '';
    for (var di = 0; di < window._nudgeList.length; di++) {
      dotsHtml += '<div class="ndot' + (di === idx ? ' active' : '') + '" onclick="nudgeGoto(' + di + ')"></div>';
    }
    el.innerHTML = '<div class="nudge-card">'
      + '<div class="nudge-icon">' + n.icon + '</div>'
      + '<div class="nudge-content">'
      + '<div class="nudge-tag">Smart Insight</div>'
      + '<div class="nudge-text">' + n.text + '</div>'
      + (dotsHtml ? '<div class="nudge-dots">' + dotsHtml + '</div>' : '')
      + '</div>'
      + '</div>';
  }
}

// ── Celebration toast + confetti ───────────────────────────────
function triggerCelebration(title, subtitle) {
  var overlay = document.getElementById('celebration-overlay');
  var toast   = document.getElementById('celebration-toast');
  var titleEl = document.getElementById('toast-title');
  var subEl   = document.getElementById('toast-sub');
  if (!toast || !titleEl || !subEl) return;

  titleEl.textContent = title || '';
  subEl.textContent   = subtitle || '';
  toast.classList.add('show');

  // Confetti
  var colors = ['#F0538A','#00C896','#F59E0B','#F56CA0','#22D9A9'];
  var pieces = 18;
  for (var ci = 0; ci < pieces; ci++) {
    (function() {
      var piece = document.createElement('div');
      piece.className = 'confetti-piece';
      var size = 6 + Math.random() * 8;
      var left = 10 + Math.random() * 80;
      var color = colors[Math.floor(Math.random() * colors.length)];
      piece.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + left + 'vw;top:30vh;background:' + color + ';transition:all 1s ease;';
      document.body.appendChild(piece);
      setTimeout(function() {
        piece.style.opacity = '1';
        piece.style.top = (30 + Math.random() * 40) + 'vh';
        piece.style.left = (left + (Math.random() - 0.5) * 10) + 'vw';
        piece.style.transform = 'rotate(' + (Math.random()*360) + 'deg)';
      }, 30);
      setTimeout(function() {
        piece.style.opacity = '0';
        setTimeout(function() { if (piece.parentNode) piece.parentNode.removeChild(piece); }, 500);
      }, 1000);
    })();
  }

  setTimeout(function() {
    toast.classList.remove('show');
  }, 3000);
}

let dbMode  = 'month';
let dbYear  = new Date().getFullYear();
let dbMonth = new Date().getMonth() + 1;

// Read a CSS token at render time so Chart.js picks up the active theme
function dbToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '';
}

function dbPeriodStr() {
  if (dbMode === 'year') return String(dbYear);
  return dbYear + '-' + String(dbMonth).padStart(2, '0');
}
function dbPeriodLabel() {
  if (dbMode === 'year') return String(dbYear);
  return new Date(dbYear, dbMonth - 1, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' });
}
function dbPrevPeriodStr() {
  if (dbMode === 'year') return String(dbYear - 1);
  const pm = dbMonth === 1 ? 12 : dbMonth - 1;
  const py = dbMonth === 1 ? dbYear - 1 : dbYear;
  return py + '-' + String(pm).padStart(2, '0');
}
function dbDaysInPeriod() {
  if (dbMode === 'year') return 365;
  return new Date(dbYear, dbMonth, 0).getDate();
}

// ══════════════════════════════════════════════════════════════
// MAIN RENDER
// ══════════════════════════════════════════════════════════════

var _dbBudgetChart = null;

function renderDashboard() {
  dbMode  = 'month';
  dbYear  = new Date().getFullYear();
  dbMonth = new Date().getMonth() + 1;

  // ── Data-recording side effects (kept from the previous dashboard) ──
  try { migrateTxCategories(); } catch(e) {}
  try { populateNetWorthHistory(); } catch(e) { console.warn('populate nw history', e); }
  try { recordNetWorthSnapshot(); } catch(e) { console.warn('nw snapshot', e); }
  try { if (typeof blEnsureBillsReady === 'function') blEnsureBillsReady(); } catch(e) { console.warn('bills ready', e); }

  try { kdRenderDashboard(); }
  catch(e) { console.error('dashboard render', e); }
}

// ══════════════════════════════════════════════════════════════
// REDESIGNED DASHBOARD — 3×2 tile grid, wired to real data,
// tailored by the onboarding profile (kf_profile).
// ══════════════════════════════════════════════════════════════
var kdCycle = ['var(--pink)', 'var(--green)', 'var(--amber)', '#f48cb2'];

function kdGet(key, def) { try { var v = localStorage.getItem(key); return v === null ? def : v; } catch(e) { return def; } }
function kdGetJSON(key, def) { try { var v = localStorage.getItem(key); return v ? (JSON.parse(v) || def) : def; } catch(e) { return def; } }

function kdShort(n) {
  n = Math.round(Number(n) || 0); var a = Math.abs(n), s;
  if (a >= 1000000) s = '$' + (a / 1000000).toFixed(a % 1000000 === 0 ? 0 : 1) + 'm';
  else if (a >= 1000) s = '$' + (a / 1000).toFixed(a % 1000 === 0 ? 0 : 1) + 'k';
  else s = '$' + a;
  return n < 0 ? '−' + s : s;
}
function kdEsc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }


function kdSparkReal(vals, up) {
  vals = (vals && vals.length) ? vals : [0, 0];
  if (vals.length === 1) vals = [vals[0], vals[0]];
  var w = 96, h = 40, pad = 4;
  var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  var rng = (max - min) || 1, ih = h - pad * 2;
  var coords = vals.map(function(v, i) {
    var x = (i / (vals.length - 1)) * w;
    var y = pad + (1 - ((v - min) / rng)) * ih;
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  var color = up ? 'var(--green)' : 'var(--amber)';
  var fill = up ? 'rgba(0,200,150,0.12)' : 'rgba(245,158,11,0.12)';
  return '<svg width="100%" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="display:block">'
    + '<polyline points="0,' + h + ' ' + coords.join(' ') + ' ' + w + ',' + h + '" fill="' + fill + '" stroke="none"/>'
    + '<polyline points="' + coords.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<circle cx="' + w + '" cy="' + coords[coords.length - 1].split(',')[1] + '" r="2.2" fill="' + color + '"/></svg>';
}

function kdDonut(segs) {
  var total = segs.reduce(function(s, x) { return s + Math.max(x.value, 0); }, 0) || 1;
  var C = 2 * Math.PI * 46, acc = 0, circles = '';
  segs.forEach(function(x) {
    var len = (Math.max(x.value, 0) / total) * C;
    circles += '<circle cx="58" cy="58" r="46" fill="none" stroke="' + x.color + '" stroke-width="15" stroke-dasharray="' + len.toFixed(1) + ' ' + (C - len).toFixed(1) + '" stroke-dashoffset="' + (-acc).toFixed(1) + '" transform="rotate(-90 58 58)"/>';
    acc += len;
  });
  return '<svg width="116" height="116" viewBox="0 0 116 116" role="img" style="flex-shrink:0">'
    + '<circle cx="58" cy="58" r="46" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="15"/>'
    + circles
    + '<text x="58" y="62" text-anchor="middle" fill="#6278A0" font-family="DM Sans,sans-serif" font-size="11">assets</text></svg>';
}

function kdRing(pct, color, size) {
  size = size || 64;
  var r = size * 0.375, cx = size / 2, sw = size * 0.125;
  var C = 2 * Math.PI * r, len = (pct / 100) * C;
  var fs = Math.round(size * 0.172);
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" role="img">'
    + '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="' + sw + '"/>'
    + '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-dasharray="' + len.toFixed(1) + ' ' + (C - len).toFixed(1) + '" stroke-linecap="round" transform="rotate(-90 ' + cx + ' ' + cx + ')"/>'
    + '<text x="' + cx + '" y="' + (cx + fs * 0.32) + '" text-anchor="middle" fill="' + color + '" font-family="DM Mono,monospace" font-size="' + fs + '" font-weight="600">' + pct + '%</text></svg>';
}

// Real 12-month forecast chart, sourced from the Forecast tab's own fc2GetMonths() data
function kdForecastChartReal(months) {
  if (!months || months.length < 2) return '<div class="kd-empty">Add income &amp; expenses to see a forecast.</div>';
  var W = 300, H = 124, pad = 10, n = months.length;
  var nets = months.map(function(m){ return Number(m.net) || 0; });
  var min = Math.min.apply(null, nets.concat([0])), max = Math.max.apply(null, nets.concat([0]));
  var rng = (max - min) || 1;
  function X(i){ return (i / (n - 1)) * W; }
  function Y(v){ return pad + (1 - ((v - min) / rng)) * (H - pad * 2); }
  var coords = nets.map(function(v, i){ return X(i).toFixed(1) + ',' + Y(v).toFixed(1); });
  var zeroY = Y(0).toFixed(1);
  var lowIdx = 0, lowV = nets[0];
  for (var i = 1; i < n; i++) { if (nets[i] < lowV) { lowV = nets[i]; lowIdx = i; } }
  return '<svg width="100%" height="100%" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet" role="img">'
    + '<defs><linearGradient id="kdfcgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,200,150,0.22)"/><stop offset="100%" stop-color="rgba(0,200,150,0)"/></linearGradient></defs>'
    + '<line x1="0" y1="'+zeroY+'" x2="'+W+'" y2="'+zeroY+'" stroke="rgba(255,255,255,0.08)" stroke-width="0.8" stroke-dasharray="2 3"/>'
    + '<polyline points="0,'+zeroY+' '+coords.join(' ')+' '+W+','+zeroY+'" fill="url(#kdfcgrad)" stroke="none"/>'
    + '<text x="4" y="'+(pad+8)+'" fill="#6278A0" font-family="DM Sans,sans-serif" font-size="8">today</text>'
    + '<polyline points="'+coords.join(' ')+'" fill="none" stroke="var(--green)" stroke-width="2" stroke-dasharray="4 3" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>'
    + '<circle cx="'+X(lowIdx).toFixed(1)+'" cy="'+Y(lowV).toFixed(1)+'" r="3" fill="var(--amber)"/></svg>';
}

// ── Per-category budget vs actual for a month prefix (YYYY-MM) ──
function dbBudgetActuals(prefix) {
  var txns = (typeof activeTX === 'function') ? activeTX() : [];
  var keys = Object.keys((typeof LBUDGETS !== 'undefined' && LBUDGETS) ? LBUDGETS : {});
  var rows = [];
  for (var i = 0; i < keys.length; i++) {
    var catId = keys[i]; var cap = Number(LBUDGETS[catId]) || 0; if (!cap) continue;
    var cat = (typeof LCATS !== 'undefined' && LCATS) ? LCATS.find(function(c){ return c.id === catId; }) : null;
    var nm = cat ? cat.name : catId;
    var col = (cat && cat.color) ? cat.color : 'var(--green)';
    var spent = txns.filter(function(t){
      return t.type === 'expense' && t.date && t.date.indexOf(prefix) === 0 && (t.catId === catId || t.category === nm);
    }).reduce(function(s,t){ return s + Number(t.amount || 0); }, 0);
    rows.push({ name: nm, color: col, cap: cap, spent: spent });
  }
  var budgeted = rows.reduce(function(s,r){ return s + r.cap; }, 0);
  var spent = rows.reduce(function(s,r){ return s + r.spent; }, 0);
  return { rows: rows, budgeted: budgeted, spent: spent, left: budgeted - spent };
}

function kdBudgetChart(rows) {
  rows = rows.slice().sort(function(a,b){ return b.cap - a.cap; }).slice(0, 6);
  if (!rows.length) return '<div class="kd-empty">No budgets set yet.</div>';
  var scale = 1;
  rows.forEach(function(r){ scale = Math.max(scale, r.cap, r.spent); });
  var baseY = 110, maxH = 100, bw = 34, step = 48, x0 = 10;
  var svg = '<svg width="100%" height="100%" viewBox="0 0 300 140" preserveAspectRatio="xMidYMid meet" role="img">'
    + '<line x1="0" y1="110" x2="300" y2="110" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>'
    + '<line x1="0" y1="80" x2="300" y2="80" stroke="rgba(255,255,255,0.04)" stroke-width="0.5"/>'
    + '<line x1="0" y1="50" x2="300" y2="50" stroke="rgba(255,255,255,0.04)" stroke-width="0.5"/>';
  rows.forEach(function(r, i) {
    var x = x0 + step * i;
    var label = kdEsc((r.name || '').split(' ')[0].slice(0, 6));
    var pct = r.cap ? (r.spent / r.cap) : 0;
    if (r.spent > r.cap && r.cap > 0) {
      svg += '<rect x="' + x + '" y="10" width="' + bw + '" height="100" rx="3" fill="var(--pink)"/>'
        + '<text x="' + (x + bw/2) + '" y="6" text-anchor="middle" fill="var(--pink)" font-family="DM Mono,monospace" font-size="7">over</text>';
    } else {
      var capH = Math.min(maxH, (r.cap / scale) * maxH);
      var spendH = Math.min(maxH, (r.spent / scale) * maxH);
      var color = pct >= 1 ? 'var(--pink)' : pct >= 0.8 ? '#f48cb2' : 'var(--green)';
      svg += '<rect x="' + x + '" y="' + (baseY - capH) + '" width="' + bw + '" height="' + capH + '" rx="3" fill="rgba(0,200,150,0.16)"/>'
        + '<rect x="' + x + '" y="' + (baseY - spendH) + '" width="' + bw + '" height="' + spendH + '" rx="3" fill="' + color + '"/>';
    }
    svg += '<text x="' + (x + bw/2) + '" y="127" text-anchor="middle" fill="#6278A0" font-family="DM Sans,sans-serif" font-size="7.5">' + label + '</text>';
  });
  return svg + '</svg>';
}

// ── Account kind/icon/colour inferred from the account name ──
function kdAcctMeta(name) {
  var n = (name || '').toLowerCase();
  if (/sav|emerg/.test(n))   return { kind: 'Savings',     i: 'ti-pig-money',    c: 'var(--green)' };
  if (/offset/.test(n))      return { kind: 'Offset',      i: 'ti-shield-check', c: 'var(--pink)'  };
  if (/joint/.test(n))       return { kind: 'Joint',       i: 'ti-users',        c: 'var(--pink)'  };
  if (/credit|card/.test(n)) return { kind: 'Credit card', i: 'ti-credit-card',  c: 'var(--muted)' };
  if (/business/.test(n))    return { kind: 'Business',    i: 'ti-briefcase',    c: 'var(--green)' };
  if (/everyday|spend|transac/.test(n)) return { kind: 'Everyday', i: 'ti-credit-card', c: 'var(--pink)' };
  return { kind: 'Transaction', i: 'ti-wallet', c: 'var(--amber)' };
}

// ── Show/hide accounts on the Bank accounts dashboard tile ────
var KD_HIDDEN_ACCTS_KEY = 'kf_dashboard_hidden_accounts';
function kdHiddenAccounts() {
  return kdGetJSON(KD_HIDDEN_ACCTS_KEY, []) || [];
}
function kdToggleAcctVisible(id) {
  var hidden = kdHiddenAccounts();
  var idx = hidden.indexOf(id);
  if (idx === -1) hidden.push(id); else hidden.splice(idx, 1);
  try { localStorage.setItem(KD_HIDDEN_ACCTS_KEY, JSON.stringify(hidden)); } catch(e) {}
  renderAcctVisModal();
  kdRenderDashboard();
}
function openAcctVisModal() {
  renderAcctVisModal();
  var m = document.getElementById('acct-vis-modal');
  if (m) m.classList.add('open');
}
function closeAcctVisModal() {
  var m = document.getElementById('acct-vis-modal');
  if (m) m.classList.remove('open');
}
function renderAcctVisModal() {
  var el = document.getElementById('acct-vis-modal-body');
  if (!el) return;
  var accts = (typeof CT_ACCTS !== 'undefined' && CT_ACCTS) ? CT_ACCTS : [];
  var hidden = kdHiddenAccounts();
  var months = (typeof ctAllMonths === 'function') ? ctAllMonths() : [];
  var lm = months.length ? months[months.length - 1] : null;
  if (!accts.length) { el.innerHTML = '<div class="kd-empty">No accounts yet.</div>'; return; }
  el.innerHTML = accts.map(function(a) {
    var nm = (typeof ctLabel === 'function') ? ctLabel(a) : a.id;
    var bal = lm ? ((CT[a.id]||{})[lm] || 0) : 0;
    var isHidden = hidden.indexOf(a.id) !== -1;
    return '<label style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:0.5px solid var(--border);cursor:pointer">'
      + '<input type="checkbox" style="width:18px;height:18px;flex-shrink:0;accent-color:var(--primary)" ' + (isHidden ? '' : 'checked') + ' onchange="kdToggleAcctVisible(\'' + a.id + '\')"/>'
      + '<span style="flex:1;font-size:.85rem;color:var(--text)">' + kdEsc(nm) + '</span>'
      + '<span style="font-family:var(--font-mono);font-size:.8rem;color:var(--muted)">' + fmtWhole(bal) + '</span>'
      + '</label>';
  }).join('');
}

// ── Notifications modal — recommended actions & insights ───────
function openNotifModal() {
  renderNotifModal();
  var m = document.getElementById('notif-modal');
  if (m) m.classList.add('open');
}
function closeNotifModal() {
  var m = document.getElementById('notif-modal');
  if (m) m.classList.remove('open');
}
function renderNotifModal() {
  var el = document.getElementById('notif-modal-body');
  if (!el) return;
  var cards = [], nudges = [];
  try { cards = generateActionCards() || []; } catch(e) { console.warn('generateActionCards', e); }
  try { nudges = generateNudges() || []; } catch(e) { console.warn('generateNudges', e); }

  var sc = {
    green: { bg:'rgba(0,200,150,0.12)', color:'var(--success)', bdr:'rgba(0,200,150,0.25)' },
    amber: { bg:'rgba(245,158,11,0.12)', color:'var(--warn)', bdr:'rgba(245,158,11,0.25)' },
    pink:  { bg:'rgba(240,83,138,0.12)', color:'var(--primary)', bdr:'rgba(240,83,138,0.25)' },
    muted: { bg:'rgba(98,120,160,0.1)', color:'var(--muted)', bdr:'rgba(98,120,160,0.2)' }
  };

  var cardsHtml = cards.map(function(c) {
    var s = sc[c.status] || sc.muted;
    return '<div class="notif-item">'
      + '<div class="notif-item-ic" style="background:' + s.bg + '">' + c.icon + '</div>'
      + '<div class="notif-item-body">'
      + '<div class="notif-item-lbl">' + kdEsc(c.label) + '</div>'
      + '<div class="notif-item-title">' + kdEsc(c.title) + '</div>'
      + '<div class="notif-item-desc">' + c.body + '</div>'
      + '<a href="#" onclick="closeNotifModal();' + c.link + ';return false;" class="notif-item-link">' + kdEsc(c.linkTxt) + '</a>'
      + '</div>'
      + '<div class="notif-item-status" style="background:' + s.bg + ';color:' + s.color + ';border:1px solid ' + s.bdr + '">' + kdEsc(c.statusTxt) + '</div>'
      + '</div>';
  }).join('');

  var nudgesHtml = nudges.map(function(n) {
    return '<div class="notif-nudge"><span class="notif-nudge-ic">' + n.icon + '</span><span>' + n.text + '</span></div>';
  }).join('');

  el.innerHTML = (cardsHtml ? '<div class="notif-section-lbl">Priorities</div>' + cardsHtml : '')
    + (nudgesHtml ? '<div class="notif-section-lbl" style="margin-top:16px">Smart insights</div>' + nudgesHtml : '')
    + (!cardsHtml && !nudgesHtml ? '<div class="kd-empty">Nothing to flag right now — you\'re all caught up.</div>' : '');
}

// ── Period selector — drives the cashflow & budget tiles ───────
var kdPeriod = 'lastMonth'; // 'lastMonth' | 'ytd' | 'lastYear'

function kdSetPeriod(p) {
  kdPeriod = p;
  kdRenderDashboard();
}

function kdMonthPrefixesInRange(startYM, endYM) {
  var out = [];
  var sy = +startYM.slice(0,4), sm = +startYM.slice(5,7);
  var ey = +endYM.slice(0,4), em = +endYM.slice(5,7);
  var y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(y + '-' + String(m).padStart(2,'0'));
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

function kdPeriodRange(period) {
  var now = new Date();
  if (period === 'ytd') {
    var yStart = now.getFullYear() + '-01';
    var yNow   = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    return {
      start: yStart + '-01', end: today(), label: 'Year to date', deltaSuffix: 'year to date',
      months: kdMonthPrefixesInRange(yStart, yNow)
    };
  }
  if (period === 'lastYear') {
    var y = now.getFullYear() - 1;
    return {
      start: y + '-01-01', end: y + '-12-31', label: 'Last year', deltaSuffix: 'last year',
      months: kdMonthPrefixesInRange(y + '-01', y + '-12')
    };
  }
  // lastMonth (default)
  var lmDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var lmPfx  = lmDate.getFullYear() + '-' + String(lmDate.getMonth()+1).padStart(2, '0');
  var lastDay = new Date(lmDate.getFullYear(), lmDate.getMonth()+1, 0).getDate();
  return {
    start: lmPfx + '-01', end: lmPfx + '-' + String(lastDay).padStart(2,'0'), label: 'Last month', deltaSuffix: 'this month',
    months: [lmPfx]
  };
}

// Income/expenses/surplus for a date range (inclusive), transfers excluded
function kdPeriodCashflow(range) {
  var txns = (typeof activeTX === 'function') ? activeTX() : [];
  var inc = 0, exp = 0;
  txns.forEach(function(t) {
    if (!t.date || t.date < range.start || t.date > range.end) return;
    if (t.catId === 'transfers' || (t.category||'').toLowerCase() === 'transfers') return;
    if (t.type === 'income') inc += Number(t.amount) || 0;
    else if (t.type === 'expense') exp += Number(t.amount) || 0;
  });
  return { income: inc, expenses: exp, surplus: inc - exp };
}

// Budget vs actual summed across every month in the period (budgets are monthly caps)
function kdBudgetActualsRange(months) {
  var txns = (typeof activeTX === 'function') ? activeTX() : [];
  var keys = Object.keys((typeof LBUDGETS !== 'undefined' && LBUDGETS) ? LBUDGETS : {});
  var rows = [];
  for (var i = 0; i < keys.length; i++) {
    var catId = keys[i]; var capPerMonth = Number(LBUDGETS[catId]) || 0; if (!capPerMonth) continue;
    var cat = (typeof LCATS !== 'undefined' && LCATS) ? LCATS.find(function(c){ return c.id === catId; }) : null;
    var nm  = cat ? cat.name : catId;
    var col = (cat && cat.color) ? cat.color : 'var(--green)';
    var spent = txns.filter(function(t){
      return t.type === 'expense' && t.date && months.indexOf(t.date.slice(0,7)) !== -1 && (t.catId === catId || t.category === nm);
    }).reduce(function(s,t){ return s + Number(t.amount || 0); }, 0);
    rows.push({ name: nm, color: col, cap: capPerMonth * months.length, spent: spent });
  }
  var budgeted = rows.reduce(function(s,r){ return s + r.cap; }, 0);
  var spent = rows.reduce(function(s,r){ return s + r.spent; }, 0);
  return { rows: rows, budgeted: budgeted, spent: spent, left: budgeted - spent };
}

// ══ Main render ══
function kdRenderDashboard() {
  var host = document.getElementById('page-dashboard');
  if (!host) return;

  var profile = kdGet('kf_profile', 'full') || 'full';
  var name = kdGet('kf_user_name', '') || (typeof getUserName === 'function' ? getUserName(activeProfile) : '');
  if (!name || name === 'joint') name = 'there';
  var first = name.charAt(0).toUpperCase();
  var u2 = kdGet('kf_user2_name', '') || '';

  var now = new Date(), hr = now.getHours();
  var greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  var dateStr = now.toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short', year:'numeric' });

  // Last completed month (still used as the Budget/Bills tiles' "as of" anchor)
  var lmDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var lmY = lmDate.getFullYear(), lmM = lmDate.getMonth() + 1;
  var lmPrefix = lmY + '-' + String(lmM).padStart(2, '0');
  var lmSum = (typeof getMonthSummary === 'function') ? getMonthSummary(lmY, lmM) : { income:0, expenses:0, surplus:0 };

  // Period selector (Last Month / Year to Date / Last Year) — drives cashflow & budget tiles
  var range = kdPeriodRange(kdPeriod);
  var periodCF = kdPeriodCashflow(range);

  // Cash accounts + balances
  var months = (typeof ctAllMonths === 'function') ? ctAllMonths() : [];
  var lm = months.length ? months[months.length - 1] : null;
  var prevM = months.length >= 2 ? months[months.length - 2] : null;
  var last6 = months.slice(-6);
  var accts = (typeof CT_ACCTS !== 'undefined' && CT_ACCTS) ? CT_ACCTS : [];
  function bal(id, m) { return (typeof CT !== 'undefined' && CT[id] ? CT[id] : {})[m] || 0; }
  var cash = accts.reduce(function(s, a) { return s + (lm ? bal(a.id, lm) : 0); }, 0);
  var prevCash = accts.reduce(function(s, a) { return s + (prevM ? bal(a.id, prevM) : 0); }, 0);

  var nw = (typeof computeCurrentNetWorth === 'function')
    ? computeCurrentNetWorth()
    : { bank: cash, super_: 0, property: 0, equities: 0, liabilities: 0, netWorth: cash };

  var kfMort = kdGetJSON('kf_mortgage', null);
  var kfAssets = kdGetJSON('kf_assets', []);

  // ── TILE 1 — Net worth / Total balance ──
  // nw (computeCurrentNetWorth) is the single source of truth shared with the Assets tab,
  // so the figure shown here always matches go('assets').
  var nwTitle, nwBig, nwDelta, segs;
  if (profile === 'household') {
    var mlist = (typeof liabAllMortgages === 'function') ? liabAllMortgages() : [];
    var mBal = 0, mHome = 0;
    mlist.forEach(function(m){ mBal += Number(m.balance) || 0; mHome += Number(m.homeValue) || 0; });
    if (!mHome && nw.property) mHome = nw.property;
    var equity = Math.max(0, mHome - mBal);
    nwTitle = 'Net worth'; nwBig = fmtWhole(nw.netWorth);
    nwDelta = (periodCF.surplus >= 0 ? '↑ ' : '↓ ') + fmtWhole(Math.abs(periodCF.surplus)) + ' ' + range.deltaSuffix;
    segs = [{ label: 'Cash', value: Math.max(nw.bank, 0), color: 'var(--pink)' }];
    if (nw.super_ > 0) segs.push({ label: 'Super', value: nw.super_, color: 'var(--purple)' });
    segs.push({ label: 'Home equity', value: equity, color: 'var(--green)' });
    if (nw.equities > 0) segs.push({ label: 'Investments', value: nw.equities, color: 'var(--amber)' });
  } else if (profile === 'full') {
    segs = [{ label: 'Cash', value: Math.max(nw.bank, 0), color: 'var(--pink)' }];
    var assetSel = (kfAssets && kfAssets.length) ? kfAssets : [];
    var realMap = { property: nw.property, equities: nw.equities, 'super': nw.super_, liabilities: -Math.abs(nw.liabilities || 0), 'investment-property': 0 };
    var labelMap = { property: 'Property', equities: 'Investments', 'super': 'Super', liabilities: 'Liabilities', 'investment-property': 'Inv. property' };
    var aTotal = 0;
    if (assetSel.length) {
      assetSel.forEach(function(k, i) {
        var v = (typeof realMap[k] === 'number') ? realMap[k] : 0;
        aTotal += v;
        if (v > 0) segs.push({ label: labelMap[k] || k, value: v, color: kdCycle[(i + 1) % kdCycle.length] });
      });
    } else {
      // No asset categories picked at onboarding — show whatever real Super/Investments data exists
      if (nw.super_ > 0) segs.push({ label: 'Super', value: nw.super_, color: 'var(--green)' });
      if (nw.equities > 0) segs.push({ label: 'Investments', value: nw.equities, color: 'var(--amber)' });
      aTotal = nw.super_ + nw.equities;
    }
    nwTitle = 'Net worth'; nwBig = fmtWhole(nw.bank + aTotal);
    nwDelta = (periodCF.surplus >= 0 ? '↑ ' : '↓ ') + fmtWhole(Math.abs(periodCF.surplus)) + ' ' + range.deltaSuffix;
  } else {
    nwTitle = 'Total balance'; nwBig = fmtWhole(cash);
    var d = cash - prevCash;
    nwDelta = (d >= 0 ? '↑ ' : '↓ ') + fmtWhole(Math.abs(d)) + ' this month';
    segs = accts.filter(function(a){ return (lm ? bal(a.id, lm) : 0) > 0; })
      .map(function(a, i){ return { label: (typeof ctLabel === 'function' ? ctLabel(a) : a.id), value: bal(a.id, lm), color: kdCycle[i % kdCycle.length] }; });
    if (!segs.length) segs = [{ label: 'Cash', value: 1, color: 'var(--pink)' }];
  }
  var segTotal = segs.reduce(function(s, y){ return s + Math.max(y.value, 0); }, 0) || 1;
  var legend = segs.map(function(x){
    var pct = Math.round((Math.max(x.value, 0) / segTotal) * 100);
    return '<div class="kd-leg-item"><div class="kd-leg-dot" style="background:' + x.color + '"></div>' + kdEsc(x.label) + ' · ' + pct + '%</div>';
  }).join('');
  var tileNW = '<div class="kdt">'
    + '<div class="kdt-hd"><div class="kdt-ttl"><i class="ti ti-chart-pie"></i> ' + nwTitle + '</div><button class="kdt-act" onclick="go(\'assets\')">Details</button></div>'
    + '<div class="kd-nw-big">' + nwBig + '</div>'
    + '<div class="kd-nw-delta" style="color:' + (periodCF.surplus < 0 ? 'var(--amber)' : 'var(--green)') + '">' + nwDelta + '</div>'
    + '<div class="kd-sep"></div>'
    + '<div class="kd-cflbl">' + kdEsc(range.label) + ' cashflow</div>'
    + '<div class="kd-cf3"><div class="kd-cfi"><label>Income</label><span style="color:var(--green)">+' + fmtWhole(periodCF.income) + '</span></div>'
    + '<div class="kd-cfi"><label>Spent</label><span style="color:var(--muted)">−' + fmtWhole(periodCF.expenses) + '</span></div>'
    + '<div class="kd-cfi"><label>Saved</label><span style="color:var(--pink)">' + (periodCF.surplus < 0 ? '−' : '+') + fmtWhole(Math.abs(periodCF.surplus)) + '</span></div></div>'
    + '<div class="kd-donut-wrap">' + kdDonut(segs) + '<div class="kd-leg">' + legend + '</div></div>'
    + '</div>';

  // ── TILE 2 — Bank accounts (respects show/hide preferences) ──
  var hiddenAccts = kdHiddenAccounts();
  var visibleAccts = accts.filter(function(a){ return hiddenAccts.indexOf(a.id) === -1; });
  var visCash = visibleAccts.reduce(function(s, a) { return s + (lm ? bal(a.id, lm) : 0); }, 0);
  var acctRows = visibleAccts.length ? visibleAccts.map(function(a) {
    var nm = (typeof ctLabel === 'function') ? ctLabel(a) : (typeof getAccountName === 'function' ? getAccountName(a.id) : a.id);
    var meta = kdAcctMeta(nm);
    var b = lm ? bal(a.id, lm) : 0;
    var pb = prevM ? bal(a.id, prevM) : b;
    var delta = b - pb;
    var pct = pb ? (delta / Math.abs(pb) * 100) : 0;
    var up = delta >= 0;
    var sparkVals = last6.length ? last6.map(function(m){ return bal(a.id, m); }) : [b, b];
    return '<div class="kd-acc2"><div class="kd-acc2-ic" style="background:color-mix(in srgb,' + meta.c + ' 14%, transparent)"><i class="ti ' + meta.i + '" style="color:' + meta.c + '"></i></div>'
      + '<div class="kd-acc2-main"><div class="kd-acc2-name">' + kdEsc(nm) + '</div><div class="kd-acc2-sub">' + meta.kind + '</div></div>'
      + '<div class="kd-acc2-spark">' + kdSparkReal(sparkVals, up) + '</div>'
      + '<div class="kd-acc2-r"><div class="kd-acc2-delta ' + (up ? 'up' : 'down') + '">' + (up ? '▲' : '▼') + ' ' + (delta < 0 ? '−' : '+') + fmtWhole(Math.abs(delta)).replace('−','') + '</div>'
      + '<div class="kd-acc2-bal">' + fmtWhole(b) + ' · ' + (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%</div></div></div>';
  }).join('') : (accts.length
    ? '<div class="kd-empty">All accounts hidden — <span style="color:var(--pink);cursor:pointer" onclick="openAcctVisModal()">show accounts →</span></div>'
    : '<div class="kd-empty">No accounts yet — <span style="color:var(--pink);cursor:pointer" onclick="go(\'cash\')">add balances →</span></div>');
  var tileAcc = '<div class="kdt"><div class="kdt-hd"><div class="kdt-ttl"><i class="ti ti-building-bank"></i> Bank accounts</div>'
    + '<div style="display:flex;align-items:center;gap:10px">'
    + '<button class="kdt-act" onclick="openAcctVisModal()" aria-label="Show or hide accounts" title="Show/hide accounts"><i class="ti ti-eye"></i></button>'
    + '<button class="kdt-act" onclick="go(\'cash\')">Manage</button></div></div>'
    + acctRows
    + '<div class="kd-acc-total"><span class="kd-acc-total-l">Total cash' + (hiddenAccts.length ? ' (visible)' : '') + '</span><span class="kd-acc-total-v">' + fmtWhole(visCash) + '</span></div></div>';

  // ── TILE 3 — Budget (period-aware) ──
  var bud = kdBudgetActualsRange(range.months);
  var tileBudget = '<div class="kdt"><div class="kdt-hd"><div class="kdt-ttl"><i class="ti ti-target"></i> Budget · ' + kdEsc(range.label) + '</div><button class="kdt-act" onclick="go(\'bva\')">Edit</button></div>'
    + '<div class="kd-bud-top"><div class="kd-bs"><div class="kd-bs-l">Budgeted</div><div class="kd-bs-v" style="color:var(--text)">' + fmtWhole(bud.budgeted) + '</div></div>'
    + '<div class="kd-bs"><div class="kd-bs-l">Spent</div><div class="kd-bs-v" style="color:var(--muted)">' + fmtWhole(bud.spent) + '</div></div>'
    + '<div class="kd-bs"><div class="kd-bs-l">Left</div><div class="kd-bs-v" style="color:' + (bud.left < 0 ? 'var(--amber)' : 'var(--green)') + '">' + fmtWhole(bud.left) + '</div></div></div>'
    + '<div class="kd-chart-area">' + kdBudgetChart(bud.rows) + '</div></div>';

  // ── TILE 4 — Savings goals ──
  var goals = (typeof GOALS !== 'undefined' && GOALS) ? GOALS.slice(0, 4) : [];
  var goalsInner;
  if (goals.length) {
    goalsInner = '<div class="kd-goals-grid">' + goals.map(function(g, i) {
      var cur = (typeof _goalCurrent === 'function') ? _goalCurrent(g) : (Number(g.currentAmount) || Number(g.saved) || 0);
      var tgt = (typeof _goalTarget === 'function') ? _goalTarget(g) : (Number(g.targetAmount) || Number(g.target) || 0);
      var pct = tgt ? Math.min(100, Math.round(cur / tgt * 100)) : 0;
      var color = kdCycle[i % kdCycle.length];
      return '<div class="kd-goal-card">' + kdRing(pct, color, 96)
        + '<div class="kd-goal-name">' + kdEsc(g.name || 'Goal') + '</div>'
        + '<div class="kd-goal-amt">' + kdShort(cur) + ' / ' + kdShort(tgt) + '</div></div>';
    }).join('') + '</div>';
  } else {
    goalsInner = '<div class="kd-empty">No savings goals yet — <span style="color:var(--pink);cursor:pointer" onclick="go(\'goals\')">add one →</span></div>';
  }
  var tileGoals = '<div class="kdt"><div class="kdt-hd"><div class="kdt-ttl"><i class="ti ti-pig-money"></i> Savings goals</div><button class="kdt-act" onclick="go(\'goals\')">+ Add</button></div>' + goalsInner + '</div>';

  // ── TILE 5 — Bills (confirmed, no payment tracking) ──
  var bills = (typeof BILLS !== 'undefined' && BILLS) ? BILLS.filter(function(b){ return b.status === 'confirmed'; }) : [];
  var todayStr = today();
  var monthPfx = todayStr.slice(0, 7);
  function billDateLabel(b) {
    var diff = _dbDaysDiff(b.nextDueDate);
    var dt = new Date(b.nextDueDate + 'T00:00:00');
    var lbl = 'Due ' + dt.toLocaleString('en-AU', { month:'short', day:'numeric' });
    if (diff === 0) return lbl + ' · today';
    if (diff < 0) return lbl + ' · ' + Math.abs(diff) + 'd overdue';
    return lbl + ' · ' + diff + ' days';
  }
  var overdue = bills.filter(function(b){ return b.nextDueDate < todayStr; });
  var dueSoon = bills.filter(function(b){ return b.nextDueDate >= todayStr && _dbDaysDiff(b.nextDueDate) <= 7; });
  var dueThisMonth = bills.filter(function(b){ return (b.nextDueDate||'').slice(0,7) === monthPfx; });
  function billSum(arr){ return arr.reduce(function(s,b){ return s + (Number(b.amount)||0); }, 0); }
  var upcoming = bills.slice().sort(function(a,b){ return (a.nextDueDate||'') < (b.nextDueDate||'') ? -1 : 1; }).slice(0, 3);
  var billRows = bills.length ? upcoming.map(function(b) {
    return '<div class="kd-bill" onclick="go(\'bills\')" style="cursor:pointer"><div class="kd-bill-ic" style="background:color-mix(in srgb,var(--pink) 12%, transparent)"><i class="ti ti-calendar-event" style="color:var(--pink)"></i></div>'
      + '<div><div class="kd-bill-name">' + kdEsc(b.displayName || 'Bill') + '</div><div class="kd-bill-due" style="color:#f48cb2">' + billDateLabel(b) + '</div></div>'
      + '<div class="kd-bill-r"><div class="kd-bill-amt">' + fmtWhole(b.amount) + '</div></div></div>';
  }).join('') : '<div class="kd-empty">No bills tracked yet — <span style="color:var(--pink);cursor:pointer" onclick="go(\'bills\')">add one →</span></div>';
  var dueSoonPill = dueSoon.length ? '<span class="kd-pillbadge">' + dueSoon.length + ' due soon</span>' : '';
  var tileBills = '<div class="kdt"><div class="kdt-hd"><div class="kdt-ttl"><i class="ti ti-calendar-event"></i> Bills · this month</div><div style="display:flex;align-items:center;gap:7px">' + dueSoonPill + '<button class="kdt-act" onclick="go(\'bills\')">View</button></div></div>'
    + '<div class="kd-bchips"><div class="kd-bchip"><div class="kd-bchip-l">Overdue</div><div class="kd-bchip-v" style="color:' + (overdue.length ? 'var(--amber)' : '#3D4D70') + '">' + fmtWhole(billSum(overdue)) + '</div></div>'
    + '<div class="kd-bchip"><div class="kd-bchip-l">Due soon</div><div class="kd-bchip-v" style="color:#f48cb2">' + fmtWhole(billSum(dueSoon)) + '</div></div>'
    + '<div class="kd-bchip"><div class="kd-bchip-l">This month</div><div class="kd-bchip-v" style="color:var(--green)">' + fmtWhole(billSum(dueThisMonth)) + '</div></div></div>'
    + billRows + '</div>';

  // ── TILE 6 — profile specific ──
  var tile6;
  var fullHasProperty = (kfAssets && kfAssets.indexOf('property') > -1);
  if (profile === 'household' || (profile === 'full' && fullHasProperty)) {
    var fcNote = 'Add income &amp; expenses to see a forecast.';
    var fcMonths = [];
    var curFc = null;
    try {
      if (typeof fc2GetMonths === 'function') {
        fcMonths = fc2GetMonths() || [];
        if (fcMonths.length) {
          curFc = fcMonths[0];
          var worst = fcMonths[0];
          for (var wi = 1; wi < fcMonths.length; wi++) { if (fcMonths[wi].net < worst.net) worst = fcMonths[wi]; }
          fcNote = 'Lowest projected net <b style="color:var(--amber)">' + fmtWhole(worst.net) + '</b> in ' + kdEsc(worst.short || worst.label || 'the months ahead') + '.';
        }
      }
    } catch(e) {}
    var fcIncome = curFc ? curFc.income : 0, fcExpenses = curFc ? curFc.expenses : 0, fcNet = curFc ? curFc.net : 0;
    tile6 = '<div class="kdt"><div class="kdt-hd"><div class="kdt-ttl"><i class="ti ti-chart-line"></i> Cashflow forecast</div><button class="kdt-act" onclick="go(\'forecast\')">Details</button></div>'
      + '<div class="kd-bud-top"><div class="kd-bs"><div class="kd-bs-l">Money in</div><div class="kd-bs-v" style="color:var(--green)">+' + fmtWhole(fcIncome) + '</div></div>'
      + '<div class="kd-bs"><div class="kd-bs-l">Money out</div><div class="kd-bs-v" style="color:var(--muted)">−' + fmtWhole(fcExpenses) + '</div></div>'
      + '<div class="kd-bs"><div class="kd-bs-l">Net</div><div class="kd-bs-v" style="color:' + (fcNet < 0 ? 'var(--amber)' : 'var(--green)') + '">' + (fcNet < 0 ? '−' : '+') + fmtWhole(Math.abs(fcNet)) + '</div></div></div>'
      + '<div class="kd-chart-area">' + kdForecastChartReal(fcMonths) + '</div>'
      + '<div class="kd-fc-note"><span class="kd-fc-dot"></span><span>' + fcNote + '</span></div></div>';
  } else if (profile === 'full') {
    var realMap2 = { property: nw.property, equities: nw.equities, 'super': nw.super_, liabilities: -Math.abs(nw.liabilities || 0), 'investment-property': 0 };
    var assetIcon = { property: 'ti-home', equities: 'ti-chart-line', 'super': 'ti-building-bank', liabilities: 'ti-credit-card', 'investment-property': 'ti-building-estate' };
    var assetLbl = { property: 'Property', equities: 'Investments', 'super': 'Superannuation', liabilities: 'Liabilities', 'investment-property': 'Investment property' };
    var assetAcc = { property: 'var(--green)', equities: 'var(--green)', 'super': 'var(--amber)', liabilities: 'var(--red)', 'investment-property': 'var(--pink)' };
    var sel = (kfAssets && kfAssets.length) ? kfAssets : [];
    var atot = 0;
    var rows6 = sel.length ? sel.map(function(k) {
      var v = (typeof realMap2[k] === 'number') ? realMap2[k] : 0; atot += v;
      var neg = v < 0;
      return '<div class="kd-acc"><div class="kd-acc-ic" style="background:color-mix(in srgb,' + (assetAcc[k]||'var(--pink)') + ' 13%, transparent)"><i class="ti ' + (assetIcon[k]||'ti-coin') + '" style="color:' + (assetAcc[k]||'var(--pink)') + '"></i></div>'
        + '<div><div class="kd-acc-name">' + (assetLbl[k]||k) + '</div></div>'
        + '<div class="kd-acc-bal" style="color:' + (neg ? 'var(--muted)' : 'var(--text)') + '">' + fmtWhole(v) + '</div></div>';
    }).join('') : '<div class="kd-empty">No assets added yet — set them up any time.</div>';
    tile6 = '<div class="kdt"><div class="kdt-hd"><div class="kdt-ttl"><i class="ti ti-coins"></i> Your assets</div><button class="kdt-act" onclick="go(\'assets\')">+ Add</button></div>'
      + rows6 + '<div class="kd-acc-total"><span class="kd-acc-total-l">Total assets</span><span class="kd-acc-total-v">' + fmtWhole(atot) + '</span></div></div>';
  } else {
    var txns = (typeof activeTX === 'function') ? activeTX().slice() : [];
    txns.sort(function(a, b){ return (b.date || '').localeCompare(a.date || ''); });
    var recent = txns.slice(0, 4);
    var actInner = recent.length ? recent.map(function(t) {
      var pos = t.type === 'income';
      var isTransfer = (t.catId === 'transfers' || t.category === 'Transfers');
      var col = pos ? 'var(--green)' : isTransfer ? 'var(--pink)' : 'var(--amber)';
      var amt = (pos ? '+' : '−') + fmtWhole(Math.abs(Number(t.amount) || 0)).replace('−','');
      var nm = t.merchant || t.description || t.desc || t.category || 'Transaction';
      return '<div class="kd-acc"><div class="kd-acc-ic" style="background:color-mix(in srgb,' + col + ' 13%, transparent)"><i class="ti ' + (pos ? 'ti-businessplan' : isTransfer ? 'ti-arrows-exchange' : 'ti-shopping-cart') + '" style="color:' + col + '"></i></div>'
        + '<div><div class="kd-acc-name">' + kdEsc(nm) + '</div><div class="kd-acc-sub">' + kdEsc(t.category || '') + '</div></div>'
        + '<div class="kd-acc-bal" style="color:' + (pos ? 'var(--green)' : 'var(--text)') + '">' + amt + '</div></div>';
    }).join('') : '<div class="kd-empty">No transactions yet — <span style="color:var(--pink);cursor:pointer" onclick="go(\'transactions\')">add one →</span></div>';
    tile6 = '<div class="kdt"><div class="kdt-hd"><div class="kdt-ttl"><i class="ti ti-arrows-exchange"></i> Recent activity</div><button class="kdt-act" onclick="go(\'transactions\')">See all</button></div>' + actInner + '</div>';
  }

  // ── Compose ──
  var html = '<div class="kd-dash">'
    + '<div class="kd-top">'
    + '<div class="kd-greeting">' + greet + ', ' + kdEsc(name) + '</div>'
    + '<div class="kd-topdate">' + dateStr + '</div>'
    + '<div class="kd-pills">'
    + '<button class="kd-pill' + (kdPeriod==='lastMonth'?' active':'') + '" onclick="kdSetPeriod(\'lastMonth\')">Last Month</button>'
    + '<button class="kd-pill' + (kdPeriod==='ytd'?' active':'') + '" onclick="kdSetPeriod(\'ytd\')">Year to Date</button>'
    + '<button class="kd-pill' + (kdPeriod==='lastYear'?' active':'') + '" onclick="kdSetPeriod(\'lastYear\')">Last Year</button>'
    + '</div>'
    + '<div class="kd-top-r">'
    + '<button class="kd-ibtn" aria-label="Search" onclick="go(\'transactions\')"><i class="ti ti-search"></i></button>'
    + '<button class="kd-ibtn" aria-label="Notifications" onclick="openNotifModal()"><i class="ti ti-bell"></i><span class="kd-ndot"></span></button>'
    + '<button class="kd-addbtn" onclick="openCsvModal()"><i class="ti ti-plus" style="font-size:12px"></i> Add transaction</button>'
    + '</div></div>'
    + '<div class="kd-bodywrap">' + tileNW + tileAcc + tileBudget + tileGoals + tileBills + tile6 + '</div>'
    + '</div>';

  host.innerHTML = html;
}

// ── SVG sparkline helper ──────────────────────────────────────
function _dbSparkline(values, color) {
  if (!values || values.length < 2) return '';
  var min = Math.min.apply(null, values);
  var max = Math.max.apply(null, values);
  var range = (max - min) || 1;
  var w = 72, h = 24;
  var pts = values.map(function(v, i) {
    var x = (i / (values.length - 1)) * w;
    var y = h - 2 - ((v - min) / range) * (h - 4);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  return '<svg width="' + w + '" height="' + h + '" style="overflow:visible;display:block">'
    + '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>'
    + '</svg>';
}

// ── Full-width area sparkline (NW history) ────────────────────
function _dbNWSparkline(values, color) {
  if (!values || values.length < 2) return '';
  var min = Math.min.apply(null, values);
  var max = Math.max.apply(null, values);
  var range = (max - min) || 1;
  var W = 400, H = 56;
  var pts = values.map(function(v, i) {
    return {
      x: ((i / (values.length - 1)) * W).toFixed(1),
      y: (H - 4 - ((v - min) / range) * (H - 12)).toFixed(1)
    };
  });
  var lineStr = pts.map(function(p){ return p.x + ',' + p.y; }).join(' ');
  var fillStr = lineStr + ' ' + pts[pts.length-1].x + ',' + (H+2) + ' ' + pts[0].x + ',' + (H+2);
  var gradId  = 'nwGrad_' + Date.now();
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:56px;display:block">'
    + '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.22"/>'
    + '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/>'
    + '</linearGradient></defs>'
    + '<polygon points="' + fillStr + '" fill="url(#' + gradId + ')"/>'
    + '<polyline points="' + lineStr + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
    + '</svg>';
}

// ── Hero: Net Worth value + period label + wide sparkline ─────
function dbRenderHero() {
  try {
    var months    = ctAllMonths();
    var lm        = months.length ? months[months.length - 1] : null;
    var bank      = lm ? ['offset','home','sav1','sav2'].reduce(function(s,a){return s+((CT[a]||{})[lm]||0);},0) : 0;
    var supB      = (SUPER.b && SUPER.b.balance) ? Number(SUPER.b.balance) : 0;
    var supS      = (SUPER.s && SUPER.s.balance) ? Number(SUPER.s.balance) : 0;
    var homeVal   = Number(MORTGAGE.homeValue) || 0;
    var eqV       = (typeof eqTotalEquitiesValue === 'function') ? eqTotalEquitiesValue() : 0;
    var totLiab   = (typeof liabTotal === 'function') ? liabTotal() : (Number(MORTGAGE.balance) || 0);
    var nw        = bank + supB + supS + homeVal + eqV - totLiab;

    var nwEl = document.getElementById('db-hero-nw');
    if (nwEl) nwEl.textContent = fmt(nw);

    // Period label — e.g. "June 2026"
    var periodEl = document.getElementById('db-hero-period');
    if (periodEl) {
      var _now = new Date();
      periodEl.textContent = _now.toLocaleString('en-AU', { month: 'long', year: 'numeric' });
    }

    // YTD delta label (below period)
    var trendEl = document.getElementById('db-hero-trend');
    var hist = [];
    try { hist = JSON.parse(localStorage.getItem('cff_networth_history') || '[]') || []; } catch(e) {}
    var yrStart = new Date().getFullYear() + '-01';
    var ytdEntry = null;
    for (var hi = 0; hi < hist.length; hi++) {
      if (hist[hi].date && hist[hi].date.startsWith(yrStart)) { ytdEntry = hist[hi]; break; }
    }
    var delta = ytdEntry ? nw - ytdEntry.netWorth : null;
    var trendColor = delta === null ? 'var(--muted)' : (delta >= 0 ? 'var(--success)' : 'var(--danger)');
    var trendLbl   = delta === null ? 'Tracking net worth' : ((delta >= 0 ? '&#8593; ' : '&#8595; ') + fmt(Math.abs(delta)) + ' this year');
    if (trendEl) {
      trendEl.innerHTML = '<span class="db-hero-trend-lbl" style="color:' + trendColor + '">' + trendLbl + '</span>';
    }

    // Full-width area sparkline (monthly snapshots, last 12)
    var sparkEl = document.getElementById('db-hero-sparkline');
    if (sparkEl) {
      // One value per month — take the last entry of each distinct month from history
      var moMap = {};
      for (var si = 0; si < hist.length; si++) {
        var hEntry = hist[si];
        if (hEntry.date) {
          var mKey = hEntry.date.slice(0,7);
          moMap[mKey] = hEntry.netWorth; // last entry per month wins
        }
      }
      var moKeys = Object.keys(moMap).sort();
      var sparkVals = moKeys.slice(-12).map(function(k){ return moMap[k]; });
      var sparkColor = delta !== null && delta < 0 ? '#EF4444' : '#00C896';
      sparkEl.innerHTML = sparkVals.length >= 2
        ? _dbNWSparkline(sparkVals, sparkColor)
        : '<div style="height:56px"></div>';
    }
  } catch(e) { console.warn('dbRenderHero', e); }
}

// ── KPI row: Income / Expenses / Saved — LAST MONTH ──────────
function dbRenderKpiRow() {
  var el = document.getElementById('db-kpi-row');
  if (!el) return;
  var txns = activeTX();

  // Use LAST month's data — current month is always incomplete
  var now   = new Date();
  var lastD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var pfx   = lastD.getFullYear() + '-' + String(lastD.getMonth()+1).padStart(2,'0');
  var moLbl = lastD.toLocaleString('en-AU', { month: 'long' });

  var inc = txns.filter(function(t){return t.type==='income' && t.date.startsWith(pfx);}).reduce(function(s,t){return s+Number(t.amount);},0);
  var exp = txns.filter(function(t){return t.type==='expense' && t.date.startsWith(pfx);}).reduce(function(s,t){return s+Number(t.amount);},0);
  var saved    = inc - exp;
  var savePct  = inc > 0 ? Math.round((saved / inc) * 100) : 0;
  var saveClip = Math.min(Math.max(savePct, 0), 100);

  // Last 6 months ending at last month for sparklines
  var incVals = [], expVals = [];
  for (var mi = 5; mi >= 0; mi--) {
    var sd = new Date(now.getFullYear(), now.getMonth() - 1 - mi, 1);
    var mp = sd.getFullYear() + '-' + String(sd.getMonth()+1).padStart(2,'0');
    incVals.push(txns.filter(function(t){return t.type==='income'&&t.date.startsWith(mp);}).reduce(function(s,t){return s+Number(t.amount);},0));
    expVals.push(txns.filter(function(t){return t.type==='expense'&&t.date.startsWith(mp);}).reduce(function(s,t){return s+Number(t.amount);},0));
  }

  el.innerHTML = '<div class="db-kpi-card">'
    + '<div class="db-kpi-lbl">Income &ndash; ' + moLbl + '</div>'
    + '<div class="db-kpi-val" style="color:var(--success)">+' + fmt(inc) + '</div>'
    + _dbSparkline(incVals, '#00C896')
    + '</div>'
    + '<div class="db-kpi-card">'
    + '<div class="db-kpi-lbl">Expenses &ndash; ' + moLbl + '</div>'
    + '<div class="db-kpi-val" style="color:var(--primary)">-' + fmt(exp) + '</div>'
    + _dbSparkline(expVals, '#F0538A')
    + '</div>'
    + '<div class="db-kpi-card">'
    + '<div class="db-kpi-lbl">Saved &ndash; ' + moLbl + '</div>'
    + '<div class="db-kpi-val" style="color:' + (saved >= 0 ? 'var(--text)' : 'var(--danger)') + '">' + (saved < 0 ? '-' : '') + fmt(Math.abs(saved)) + '</div>'
    + '<div class="db-kpi-bar"><div class="db-kpi-bar-fill" style="width:' + saveClip + '%;background:' + (savePct < 0 ? 'var(--danger)' : savePct < 20 ? 'var(--warn)' : 'var(--success)') + '"></div></div>'
    + '<div class="db-kpi-sub">' + savePct + '% savings rate</div>'
    + '</div>';
}

// ── Zone 1: Account balance tiles with sparklines ─────────────
function dbRenderAcctTiles() {
  var el = document.getElementById('db-acct-tiles');
  if (!el) return;
  var allMonths = ctAllMonths();
  var last6     = allMonths.slice(-6);
  var lm        = last6.length ? last6[last6.length - 1] : null;

  if (!lm) {
    el.innerHTML = '<div style="font-size:.75rem;color:var(--muted);padding:4px 0">No cash tracker data. <a href="#" onclick="go(\'cash\');return false;" style="color:var(--primary)">Add balances →</a></div>';
    return;
  }

  // Build from ACCOUNTS (supports custom accounts)
  var _acctColors = ['#F0538A','#818CF8','#00C896','#F59E0B','#38BDF8','#FB923C','#A78BFA','#34D399'];
  var accts = (typeof ACCOUNTS !== 'undefined' && ACCOUNTS && ACCOUNTS.length ? ACCOUNTS : [
    { id:'offset', name:'Offset Account',    icon:'🏦' },
    { id:'home',   name:'Joint Transaction', icon:'🏠' },
    { id:'sav1',   name:'Savings 1',         icon:'💰' },
    { id:'sav2',   name:'Savings 2',         icon:'💎' }
  ]).map(function(a, i) {
    return { id: a.id, label: a.name || a.id, icon: a.icon || '🏦', color: a.color || _acctColors[i % _acctColors.length] };
  });

  var dateLbl = new Date(lm + '-02').toLocaleString('en-AU', { month: 'long', year: 'numeric' });
  var tilesHtml = '';
  for (var ai = 0; ai < accts.length; ai++) {
    var a       = accts[ai];
    var currBal = ((CT[a.id] || {})[lm] || 0);
    var prevM   = last6.length >= 2 ? last6[last6.length - 2] : null;
    var prevBal = prevM ? ((CT[a.id] || {})[prevM] || 0) : null;
    var delta   = prevBal !== null ? currBal - prevBal : null;
    var sparkVals = last6.map(function(m){ return (CT[a.id] || {})[m] || 0; });
    var deltaHtml = delta !== null && delta !== 0
      ? '<div style="font-size:.65rem;font-weight:600;color:' + (delta >= 0 ? 'var(--success)' : 'var(--danger)') + ';margin-top:1px">'
        + (delta >= 0 ? '&#8593;' : '&#8595;') + ' ' + fmt(Math.abs(delta))
        + '</div>'
      : '';
    tilesHtml += '<div class="db-acct-tile">'
      + '<div class="db-acct-tile-lbl">' + a.icon + ' ' + a.label + '</div>'
      + '<div class="db-acct-tile-val" style="color:' + a.color + '">' + fmt(currBal) + '</div>'
      + deltaHtml
      + '<div style="margin-top:7px">' + _dbSparkline(sparkVals, a.color) + '</div>'
      + '</div>';
  }

  el.innerHTML = '<div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px">Key Account Balances · ' + dateLbl + '</div>'
    + '<div class="db-acct-tiles-strip">' + tilesHtml + '</div>'
    + '<div style="margin-top:6px;text-align:right"><a href="#" onclick="go(\'cash\');return false;" style="font-size:.7rem;color:var(--primary);text-decoration:none;font-weight:600">View cash tracker →</a></div>';
}

// ── Zone 4: Glanceable Metrics ────────────────────────────────
function dbRenderGlanceMetrics() {
  _dbRenderGlanceBudget();
  _dbRenderGlanceGoals();
}

function _dbRenderGlanceBudget() {
  var el = document.getElementById('db-glance-budget');
  if (!el) return;
  var pfx  = dbPeriodStr();
  var txns = activeTX();
  var budgKeys = Object.keys(LBUDGETS || {});

  // Build rows: spent vs limit per category
  var rows = [];
  for (var bi = 0; bi < budgKeys.length; bi++) {
    var catId   = budgKeys[bi];
    var limit   = Number(LBUDGETS[catId]) || 0;
    if (!limit) continue;
    var cat     = LCATS.find(function(c){ return c.id === catId; });
    var catName = cat ? cat.name : catId;
    var catColor = cat ? (cat.color || 'var(--primary)') : 'var(--primary)';
    var spent   = txns.filter(function(t){
      return t.type==='expense' && t.date.startsWith(pfx) && (t.catId===catId || t.category===catName);
    }).reduce(function(s,t){ return s+Number(t.amount); },0);
    rows.push({ name: catName, limit: limit, spent: spent, color: catColor });
  }

  var totalBudget = rows.reduce(function(s,r){ return s+r.limit; }, 0);
  var totalSpent  = rows.reduce(function(s,r){ return s+r.spent; }, 0);
  var overallPct  = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  var badgeCls    = overallPct >= 100 ? 'pink' : overallPct >= 80 ? 'amber' : 'green';
  var badgeTxt    = overallPct >= 100 ? 'Over budget' : overallPct >= 80 ? 'Watch out' : 'On track';

  // Sort by pct desc, show top 4
  rows.sort(function(a,b){ return (b.spent/b.limit) - (a.spent/a.limit); });
  var shown = rows.slice(0, 4);

  // Donut data
  var donutColors  = ['#F0538A','#818CF8','#00C896','#F59E0B','#F07AAA','#52D68A','#38BDF8','#FB923C'];
  var donutLabels  = shown.map(function(r){ return r.name; });
  var donutValues  = shown.map(function(r){ return Math.max(r.spent, 0.1); });
  var donutClrs    = shown.map(function(r,i){ return r.color || donutColors[i % donutColors.length]; });

  var emptyMsg = rows.length === 0
    ? '<div style="font-size:.78rem;color:var(--muted);padding:8px 0">No budgets set. <a href="#" onclick="go(\'bva\');return false;" style="color:var(--primary)">Add budgets →</a></div>'
    : '';

  var catRowsHtml = shown.map(function(r) {
    var pct = r.limit > 0 ? Math.round((r.spent / r.limit) * 100) : 0;
    var barColor = pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warn)' : 'var(--success)';
    var pctColor = pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warn)' : 'var(--text)';
    return '<div class="db-glance-cat-row">'
      + '<span class="db-glance-cat-name">' + r.name + '</span>'
      + '<span class="db-glance-cat-pct" style="color:' + pctColor + '">' + pct + '%</span>'
      + '</div>'
      + '<div class="db-glance-prog"><div class="db-glance-prog-fill" style="width:' + Math.min(pct,100) + '%;background:' + barColor + '"></div></div>';
  }).join('');

  var budgetMonLabel = new Date().toLocaleString('en-AU', { month: 'long', year: 'numeric' });
  el.innerHTML = '<div class="db-glance-hd">'
    + '<div class="db-glance-title">📊 Budget</div>'
    + (rows.length ? '<span class="db-glance-badge ' + badgeCls + '">' + overallPct + '%  ' + badgeTxt + '</span>' : '')
    + '</div>'
    + '<div style="font-size:.68rem;color:var(--muted);margin:-6px 0 10px;font-weight:600">' + budgetMonLabel + '</div>'
    + emptyMsg
    + (shown.length ? '<div style="display:flex;gap:14px;align-items:center;margin-bottom:14px">'
      + '<canvas id="db-budget-donut" width="70" height="70" style="flex-shrink:0"></canvas>'
      + '<div style="flex:1;min-width:0">' + catRowsHtml + '</div>'
      + '</div>' : '')
    + '<div style="margin-top:4px"><a href="#" onclick="go(\'bva\');return false;" style="font-size:.72rem;color:var(--primary);text-decoration:none;font-weight:600">Full budget report →</a></div>';

  // Draw donut after DOM paint
  if (shown.length) {
    setTimeout(function() {
      var canvas = document.getElementById('db-budget-donut');
      if (!canvas) return;
      if (_dbBudgetChart) { try { _dbBudgetChart.destroy(); } catch(e){} _dbBudgetChart = null; }
      var muted = dbToken('--muted');
      var cardBg = dbToken('--card2');
      _dbBudgetChart = safeChart(canvas, {
        type: 'doughnut',
        data: {
          labels: donutLabels,
          datasets: [{ data: donutValues, backgroundColor: donutClrs, borderWidth: 2, borderColor: cardBg }]
        },
        options: {
          responsive: false, cutout: '70%',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c){ return ' ' + c.label + ': ' + Math.round((c.parsed / donutValues.reduce(function(a,b){return a+b;},0)) * 100) + '%'; } } } }
        }
      });
    }, 50);
  }
}

function _dbRenderGlanceGoals() {
  var el = document.getElementById('db-glance-goals');
  if (!el) return;

  if (!GOALS || !GOALS.length) {
    el.innerHTML = '<div class="db-glance-hd"><div class="db-glance-title">🎯 Savings Goals</div></div>'
      + '<div style="font-size:.78rem;color:var(--muted);padding:8px 0">No goals yet. <a href="#" onclick="go(\'goals\');return false;" style="color:var(--primary)">Add a goal →</a></div>';
    return;
  }

  var goalRows = GOALS.map(function(g) {
    var cur = (typeof _goalCurrent === 'function') ? _goalCurrent(g) : (Number(g.currentAmount) || Number(g.saved) || 0);
    var tgt = Number(g.targetAmount) || Number(g.target) || 0;
    var pct = tgt > 0 ? Math.min(Math.round((cur / tgt) * 100), 100) : 0;
    return { name: g.name, icon: g.icon || '🎯', pct: pct, done: pct >= 100 };
  });

  var doneCount  = goalRows.filter(function(g){ return g.done; }).length;
  var overBudget = goalRows.some(function(g){ return !g.done && g.pct === 0; });
  var badgeCls   = doneCount === goalRows.length ? 'green' : overBudget ? 'pink' : 'green';
  var badgeTxt   = doneCount === goalRows.length ? 'All done!' : doneCount + ' / ' + goalRows.length + ' complete';

  var rowsHtml = goalRows.slice(0, 5).map(function(g) {
    var barColor = g.done ? 'var(--success)' : g.pct >= 80 ? 'var(--warn)' : 'var(--success)';
    return '<div class="db-glance-goal-row">'
      + '<div class="db-glance-goal-name">'
      + '<span>' + g.icon + ' ' + g.name + '</span>'
      + '<span class="db-glance-goal-pct" style="color:' + (g.done ? 'var(--success)' : 'var(--muted)') + '">' + g.pct + '%</span>'
      + '</div>'
      + '<div class="db-glance-prog"><div class="db-glance-prog-fill" style="width:' + g.pct + '%;background:' + barColor + '"></div></div>'
      + '</div>';
  }).join('');

  el.innerHTML = '<div class="db-glance-hd">'
    + '<div class="db-glance-title">🎯 Savings Goals</div>'
    + '<span class="db-glance-badge ' + badgeCls + '">' + badgeTxt + '</span>'
    + '</div>'
    + rowsHtml
    + '<div style="margin-top:4px"><a href="#" onclick="go(\'goals\');return false;" style="font-size:.72rem;color:var(--primary);text-decoration:none;font-weight:600">View all goals →</a></div>';
}

function ord(n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }

// ── Shared helpers — exported for Snapshot page ─────────────────
function getNetWorthSnapshot() {
  const months  = ctAllMonths();
  const lm      = months.length ? months[months.length - 1] : null;
  const prevM   = months.length >= 2 ? months[months.length - 2] : null;
  const bank    = lm ? ['offset', 'home', 'sav1', 'sav2'].reduce((s, a) => s + ((CT[a] || {})[lm] || 0), 0) : 0;
  const supB    = SUPER.b ? (SUPER.b.balance || 0) : 0;
  const supS    = SUPER.s ? (SUPER.s.balance || 0) : 0;
  const equity  = Math.max(0, (MORTGAGE.homeValue || 0) - (MORTGAGE.balance || 0));
  const eqV     = (typeof eqTotalEquitiesValue === 'function') ? eqTotalEquitiesValue() : 0;
  const netWorth    = bank + supB + supS + equity + eqV;
  const assets      = bank + supB + supS + (MORTGAGE.homeValue || 0) + eqV;
  const liabilities = MORTGAGE.balance || 0;
  const bankPrev    = prevM ? ['offset', 'home', 'sav1', 'sav2'].reduce((s, a) => s + ((CT[a] || {})[prevM] || 0), 0) : null;
  const lastMonthNW = bankPrev !== null ? (bankPrev + supB + supS + equity + eqV) : null;
  return { netWorth, assets, liabilities, lastMonthNetWorth: lastMonthNW };
}

function getMonthSummary(year, month) {
  const pfx  = year + '-' + String(month).padStart(2, '0');
  const txns = activeTX().filter(t => t.date && t.date.startsWith(pfx));
  const income   = txns.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expenses = txns.filter(t =>
    t.type === 'expense' && t.catId !== 'transfers' && (t.category || '').toLowerCase() !== 'transfers'
  ).reduce((s, t) => s + Number(t.amount), 0);
  const surplus       = income - expenses;
  const budgetIds     = Object.keys(LBUDGETS || {});
  let budgetTotal     = 0;
  for (let bi = 0; bi < budgetIds.length; bi++) budgetTotal += Number(LBUDGETS[budgetIds[bi]] || 0);
  const budgetVariance = budgetTotal - expenses;
  return { income, expenses, surplus, budgetTotal, budgetVariance };
}
