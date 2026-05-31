// Dashboard always shows the current month — no period navigation needed here.
// Analytical/trend views live in js/pages/insights.js

// ══════════════════════════════════════════════════════════════
// GAMIFICATION — Health Score · Streaks · Nudges · NW History
// ══════════════════════════════════════════════════════════════

// ── Net Worth Snapshot recorder ───────────────────────────────
function recordNetWorthSnapshot() {
  try {
    var months  = ctAllMonths();
    var lm      = months.length ? months[months.length - 1] : null;
    var bank    = lm ? ['offset','home','sav1','sav2'].reduce(function(s,a){return s+((CT[a]||{})[lm]||0);},0) : 0;
    var supB    = (SUPER.b && SUPER.b.balance) ? Number(SUPER.b.balance) : 0;
    var supS    = (SUPER.s && SUPER.s.balance) ? Number(SUPER.s.balance) : 0;
    var homeVal = Number(MORTGAGE.homeValue) || 0;
    var eqV     = (typeof eqTotalEquitiesValue === 'function') ? eqTotalEquitiesValue() : 0;
    var totalLiab = (typeof liabTotal === 'function') ? liabTotal() : (Number(MORTGAGE.balance) || 0);
    var currentNW = bank + supB + supS + homeVal + eqV - totalLiab;

    var d = new Date();
    var todayStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');

    var hist = [];
    try { hist = JSON.parse(localStorage.getItem('cff_networth_history') || '[]') || []; } catch(e) { hist = []; }

    var idx = -1;
    for (var i = 0; i < hist.length; i++) { if (hist[i].date === todayStr) { idx = i; break; } }
    if (idx >= 0) {
      hist[idx].netWorth = currentNW;
    } else {
      hist.push({ date: todayStr, netWorth: currentNW });
    }
    // Keep only last ~730 days (2 years of daily entries)
    if (hist.length > 730) hist = hist.slice(hist.length - 730);
    try { localStorage.setItem('cff_networth_history', JSON.stringify(hist)); } catch(e) {}
  } catch(e) { console.warn('recordNetWorthSnapshot error', e); }
}

// ── Health Score calculation ───────────────────────────────────
function calculateHealthScore() {
  var now      = new Date();
  var yr       = now.getFullYear();
  var mo       = now.getMonth() + 1;
  var pfx      = yr + '-' + String(mo).padStart(2,'0');
  var txns     = activeTX();
  var moTx     = txns.filter(function(t){ return t.date && t.date.startsWith(pfx); });

  // Sub-score 1: Cash Flow
  var inc = moTx.filter(function(t){return t.type==='income';}).reduce(function(s,t){return s+Number(t.amount);},0);
  var exp = moTx.filter(function(t){return t.type==='expense';}).reduce(function(s,t){return s+Number(t.amount);},0);
  var cashFlowScore;
  if (inc === 0 && exp === 0) { cashFlowScore = 50; }
  else if (inc > exp) { cashFlowScore = 100; }
  else { cashFlowScore = Math.max(0, Math.round((inc / (inc + exp)) * 100)); }

  // Sub-score 2: Savings Rate
  var savings = inc - exp;
  var rate    = inc > 0 ? savings / inc : 0;
  var savingsRateScore;
  if (rate >= 0.20)      { savingsRateScore = 100; }
  else if (rate >= 0.10) { savingsRateScore = 60; }
  else if (rate >= 0)    { savingsRateScore = 30; }
  else                   { savingsRateScore = 0; }

  // Sub-score 3: Bills Paid
  var monthBills = BILLS.filter(function(b){ return b.due >= 1 && b.due <= 31; }); // all recurring bills
  var billsPaidScore;
  if (!monthBills.length) { billsPaidScore = 100; }
  else {
    var paidCount = monthBills.filter(function(b){ return b.paid; }).length;
    billsPaidScore = Math.round((paidCount / monthBills.length) * 100);
  }

  // Sub-score 4: Budget Adherence
  var budgetKeys = Object.keys(LBUDGETS || {});
  var budgetAdherenceScore;
  if (!budgetKeys.length) { budgetAdherenceScore = 50; }
  else {
    var underCount = 0;
    for (var bi = 0; bi < budgetKeys.length; bi++) {
      var catId  = budgetKeys[bi];
      var limit  = Number(LBUDGETS[catId]) || 0;
      if (!limit) { underCount++; continue; }
      var cat    = LCATS.find(function(c){ return c.id === catId; });
      var catName = cat ? cat.name : catId;
      var spent  = moTx.filter(function(t){
        return t.type === 'expense' && (t.catId === catId || t.category === catName);
      }).reduce(function(s,t){ return s + Number(t.amount); }, 0);
      if (spent <= limit) underCount++;
    }
    budgetAdherenceScore = Math.round((underCount / budgetKeys.length) * 100);
  }

  // Sub-score 5: Mortgage LVR
  var mortgageLVRScore;
  var mBal = Number(MORTGAGE.balance) || 0;
  var mVal = Number(MORTGAGE.homeValue) || 0;
  if (!mBal || !mVal) { mortgageLVRScore = 50; }
  else {
    var lvr = mBal / mVal;
    if (lvr < 0.80)      { mortgageLVRScore = 100; }
    else if (lvr < 0.90) { mortgageLVRScore = 60; }
    else                 { mortgageLVRScore = 20; }
  }

  // Sub-score 6: Net Worth Growth
  var netWorthGrowthScore = 50;
  try {
    var nwhist = JSON.parse(localStorage.getItem('cff_networth_history') || '[]') || [];
    var thisMonthPfx = yr + '-' + String(mo).padStart(2,'0');
    var priorEntry = null;
    for (var ni = nwhist.length - 1; ni >= 0; ni--) {
      if (nwhist[ni].date && !nwhist[ni].date.startsWith(thisMonthPfx)) {
        priorEntry = nwhist[ni];
        break;
      }
    }
    if (priorEntry) {
      var todayEntry = null;
      var todayD = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
      for (var nj = nwhist.length - 1; nj >= 0; nj--) {
        if (nwhist[nj].date === todayD) { todayEntry = nwhist[nj]; break; }
      }
      var currentNW2 = todayEntry ? todayEntry.netWorth : priorEntry.netWorth;
      if (currentNW2 > priorEntry.netWorth)      { netWorthGrowthScore = 100; }
      else if (currentNW2 === priorEntry.netWorth){ netWorthGrowthScore = 50; }
      else                                        { netWorthGrowthScore = 0; }
    }
  } catch(e) {}

  var total = Math.round(
    (cashFlowScore * 0.20) +
    (savingsRateScore * 0.20) +
    (billsPaidScore * 0.15) +
    (budgetAdherenceScore * 0.15) +
    (mortgageLVRScore * 0.15) +
    (netWorthGrowthScore * 0.15)
  );

  // Score history
  var prevScore = null;
  try {
    var sh = JSON.parse(localStorage.getItem('cff_health_score_history') || '[]') || [];
    var todayKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    var thisMoPfx2 = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    var prevEntry = null;
    for (var si = sh.length - 1; si >= 0; si--) {
      if (sh[si].date && !sh[si].date.startsWith(thisMoPfx2)) { prevEntry = sh[si]; break; }
    }
    prevScore = prevEntry ? prevEntry.score : null;
    var todayHIdx = -1;
    for (var sj = 0; sj < sh.length; sj++) { if (sh[sj].date === todayKey) { todayHIdx = sj; break; } }
    if (todayHIdx >= 0) { sh[todayHIdx].score = total; } else { sh.push({ date: todayKey, score: total }); }
    if (sh.length > 400) sh = sh.slice(sh.length - 400);
    try { localStorage.setItem('cff_health_score_history', JSON.stringify(sh)); } catch(e) {}
  } catch(e) {}

  return {
    total: total,
    cashFlow: cashFlowScore,
    savingsRate: savingsRateScore,
    billsPaid: billsPaidScore,
    budgetAdherence: budgetAdherenceScore,
    mortgageLVR: mortgageLVRScore,
    netWorthGrowth: netWorthGrowthScore,
    previousScore: prevScore
  };
}

// ── Render Health Score ring ───────────────────────────────────
function renderHealthScore(sd) {
  var el = document.getElementById('db-health-score');
  if (!el) return;
  var score    = sd.total;
  var ringColor = score >= 80 ? '#00C896' : score >= 60 ? '#F59E0B' : '#EF4444';

  // Sub-label
  var subHtml;
  if (sd.previousScore !== null && sd.previousScore !== score) {
    var diff = score - sd.previousScore;
    if (diff > 0) {
      subHtml = '<div class="health-score-sub" style="color:#00C896">&#8593; ' + diff + 'pts this month</div>';
    } else {
      subHtml = '<div class="health-score-sub" style="color:#EF4444">&#8595; ' + Math.abs(diff) + 'pts this month</div>';
    }
  } else {
    subHtml = '<div class="health-score-sub" style="color:var(--muted)">Tracking progress</div>';
  }

  function scoreValColor(v) {
    return v >= 80 ? '#00C896' : v >= 50 ? '#F59E0B' : '#EF4444';
  }
  function scoreRow(label, val) {
    return '<div class="score-row">'
      + '<span class="score-row-label">' + label + '</span>'
      + '<span class="score-row-val" style="color:' + scoreValColor(val) + '">' + val + '/100</span>'
      + '</div>';
  }

  el.innerHTML = '<div class="health-score-widget">'
    + '<div class="score-ring-wrap" onclick="go(\'health\')" title="View Financial Health details">'
    + '<svg class="score-ring-svg" viewBox="0 0 90 90">'
    + '<circle class="score-ring-bg" cx="45" cy="45" r="36"/>'
    + '<circle id="scoreRingFill" class="score-ring-fill" cx="45" cy="45" r="36" stroke="' + ringColor + '" style="filter:drop-shadow(0 0 6px ' + ringColor + ')"/>'
    + '</svg>'
    + '<div class="score-center">'
    + '<div id="scoreNumber" class="score-number" style="color:' + ringColor + '">0</div>'
    + '<div class="score-grade-label">HEALTH</div>'
    + '</div>'
    + '</div>'
    + '<div class="health-score-label">Score</div>'
    + subHtml
    + '<div style="font-size:.65rem;color:var(--primary);font-weight:600;margin-top:2px;cursor:pointer" onclick="go(\'health\')">Details &rarr;</div>'
    + '<div id="scoreTooltip" class="score-tooltip" style="display:none">'
    + '<div class="score-tooltip-title">Score breakdown</div>'
    + scoreRow('Cash flow',        sd.cashFlow)
    + scoreRow('Savings rate',     sd.savingsRate)
    + scoreRow('Bills on time',    sd.billsPaid)
    + scoreRow('Budget adherence', sd.budgetAdherence)
    + scoreRow('Mortgage LVR',     sd.mortgageLVR)
    + scoreRow('Net worth growth', sd.netWorthGrowth)
    + '</div>'
    + '</div>';

  // Animate ring and number after paint
  setTimeout(function() {
    var fill = document.getElementById('scoreRingFill');
    if (fill) {
      var offset = 226 - (226 * score / 100);
      fill.style.strokeDashoffset = offset;
    }
    var numEl = document.getElementById('scoreNumber');
    if (numEl && score > 0) {
      var cur = 0;
      var step = score / 50;
      var iv = setInterval(function() {
        cur = Math.min(cur + step, score);
        numEl.textContent = Math.round(cur);
        if (cur >= score) clearInterval(iv);
      }, 24);
    }
  }, 300);
}

function toggleScoreTooltip() {
  var tooltip = document.getElementById('scoreTooltip');
  if (!tooltip) return;
  tooltip.classList.toggle('visible');
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.score-ring-wrap') && !e.target.closest('#scoreTooltip')) {
    var tooltip = document.getElementById('scoreTooltip');
    if (tooltip) tooltip.classList.remove('visible');
  }
});

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
      dotStyle = 'background:' + hitColor + ';box-shadow:0 0 5px ' + hitColor + '55';
    } else if (v === false) {
      dotStyle = 'background:rgba(98,120,160,0.18)';
    } else {
      dotStyle = 'background:rgba(98,120,160,0.06)';
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
    for (var bli = 0; bli < BILLS.length; bli++) {
      var b = BILLS[bli];
      if (b.paid) continue;
      var daysUntil = b.due - day;
      if (daysUntil >= 0 && daysUntil <= 7) {
        if (!soonBill || daysUntil < soonBill.daysUntil) soonBill = { name: b.name, daysUntil: daysUntil, amount: b.amount };
      }
    }
    if (soonBill) {
      var dStr = soonBill.daysUntil === 0 ? 'today' : ('in ' + soonBill.daysUntil + ' day' + (soonBill.daysUntil === 1 ? '' : 's'));
      nudges.push({ icon: '📅', text: '<strong>' + soonBill.name + '</strong> is due ' + dStr + ' (' + fmt(soonBill.amount) + '). Don\'t forget to mark it paid once done.' });
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

  migrateTxCategories();

  // ── Gamification sequence ───────────────────────────────────
  try { recordNetWorthSnapshot(); } catch(e) { console.warn('nw snapshot', e); }
  var _scoreData;
  try { _scoreData = calculateHealthScore(); } catch(e) { _scoreData = null; }
  try { if (_scoreData) renderHealthScore(_scoreData); } catch(e) {}
  var _savStreak, _budStreak;
  try { _savStreak = calculateSavingsStreak(); } catch(e) { _savStreak = { count:0, months:[] }; }
  try { _budStreak = calculateBudgetStreak(); } catch(e) { _budStreak = { count:0, months:[] }; }
  try { renderStreaks(_savStreak, _budStreak); } catch(e) {}
  try { renderActionCards(generateActionCards()); } catch(e) { console.warn('action cards', e); }

  // ── Greeting ────────────────────────────────────────────────
  var _now  = new Date();
  var _hr   = _now.getHours();
  var _greetText = _hr < 12 ? 'GOOD MORNING' : _hr < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
  var _hgEl = document.getElementById('db-hero-greeting');
  if (_hgEl) _hgEl.textContent = _greetText;
  var _gnEl = document.getElementById('db-greeting-name');
  if (_gnEl) {
    var _gname = typeof getUserName === 'function' ? getUserName(activeProfile) : activeProfile;
    _gnEl.textContent = (_gname && _gname !== 'joint') ? _gname : 'Welcome back';
  }
  var _gdEl = document.getElementById('db-greeting-date');
  if (_gdEl) {
    var _dayStr = _now.toLocaleDateString('en-AU', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    var _monStr = _now.toLocaleDateString('en-AU', { month:'long', year:'numeric' });
    _gdEl.textContent = _dayStr + ' · showing ' + _monStr;
  }

  // ── New layout renders ───────────────────────────────────────
  dbRenderHero();
  dbRenderKpiRow();
  dbRenderAcctTiles();
  dbRenderGlanceMetrics();
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

  var accts = [
    { id:'offset', label: (CTCFG.offsetLbl || 'Offset Account'),  icon:'🏦', color:'#F0538A' },
    { id:'home',   label: (CTCFG.homeLbl   || 'Joint Account'),   icon:'🏠', color:'#818CF8' },
    { id:'sav1',   label: (CTCFG.sav1Lbl   || (typeof getUserName==='function' ? getUserName('brenton') : 'Savings 1') + ' Savings'), icon:'💰', color:'#00C896' },
    { id:'sav2',   label: (CTCFG.sav2Lbl   || (typeof getUserName==='function' ? getUserName('shelley') : 'Savings 2') + ' Savings'), icon:'💎', color:'#F59E0B' }
  ];

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
