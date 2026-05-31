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
    + '<div class="score-ring-wrap" onclick="toggleScoreTooltip()">'
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
    + '<div id="scoreTooltip" class="score-tooltip">'
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
  var txns   = activeTX();
  var months = [];
  for (var m = 1; m <= 12; m++) {
    var pfx  = _dbPastMonthPfx(m);
    var moTx = txns.filter(function(t){ return t.date && t.date.startsWith(pfx); });
    var inc  = moTx.filter(function(t){return t.type==='income';}).reduce(function(s,t){return s+Number(t.amount);},0);
    var exp  = moTx.filter(function(t){return t.type==='expense';}).reduce(function(s,t){return s+Number(t.amount);},0);
    months.unshift(inc > exp); // oldest first
  }
  var count = 0;
  for (var i = months.length - 1; i >= 0; i--) {
    if (months[i]) { count++; } else { break; }
  }
  return { count: count, months: months.slice(-8) };
}

function calculateBudgetStreak() {
  var txns      = activeTX();
  var budgKeys  = Object.keys(LBUDGETS || {});
  var months    = [];
  for (var m = 1; m <= 12; m++) {
    var pfx   = _dbPastMonthPfx(m);
    var moTx  = txns.filter(function(t){ return t.date && t.date.startsWith(pfx); });
    var allOk = true;
    if (!budgKeys.length) { allOk = false; }
    else {
      for (var bi = 0; bi < budgKeys.length; bi++) {
        var catId   = budgKeys[bi];
        var limit   = Number(LBUDGETS[catId]) || 0;
        if (!limit) continue;
        var cat     = LCATS.find(function(c){ return c.id === catId; });
        var catName = cat ? cat.name : catId;
        var spent   = moTx.filter(function(t){
          return t.type === 'expense' && (t.catId === catId || t.category === catName);
        }).reduce(function(s,t){ return s + Number(t.amount); }, 0);
        if (spent > limit) { allOk = false; break; }
      }
    }
    months.unshift(allOk);
  }
  var count = 0;
  for (var i = months.length - 1; i >= 0; i--) {
    if (months[i]) { count++; } else { break; }
  }
  return { count: count, months: months.slice(-8) };
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
  function dots(arr, colorClass) {
    return arr.map(function(v){
      return '<div class="streak-dot' + (v ? ' ' + colorClass : '') + '"></div>';
    }).join('');
  }

  var sb = savBadge(sav.count);
  var bb = budBadge(bud.count);
  var savClick = sav.count >= 3 ? 'onclick="triggerCelebration(\'Savings streak! 🔥\',\'' + sav.count + ' months of positive savings\')"' : '';

  el.innerHTML = '<div class="streak-card savings-streak" ' + savClick + '>'
    + '<div class="streak-icon">🔥</div>'
    + '<div class="streak-content">'
    + '<div class="streak-title">Savings Streak</div>'
    + '<div class="streak-count" id="sav-streak-count">0</div>'
    + '<div class="streak-desc">months in a row</div>'
    + '<div class="streak-dots">' + dots(sav.months, 'filled-green') + '</div>'
    + '</div>'
    + '<div class="streak-badge ' + sb[0] + '">' + sb[1] + '</div>'
    + '</div>'
    + '<div class="streak-card budget-streak">'
    + '<div class="streak-icon">🎯</div>'
    + '<div class="streak-content">'
    + '<div class="streak-title">Budget Streak</div>'
    + '<div class="streak-count" id="bud-streak-count">0</div>'
    + '<div class="streak-desc">months under budget</div>'
    + '<div class="streak-dots">' + dots(bud.months, 'filled-amber') + '</div>'
    + '</div>'
    + '<div class="streak-badge ' + bb[0] + '">' + bb[1] + '</div>'
    + '</div>';

  // Animate counts
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

  // Rule 8: Fallback
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

function renderDashboard() {
  // Always reset to current month so dashboard is a "right now" view
  dbMode  = 'month';
  dbYear  = new Date().getFullYear();
  dbMonth = new Date().getMonth() + 1;

  migrateTxCategories();

  // ── Gamification sequence (steps 1–8) ──────────────────────
  try { recordNetWorthSnapshot(); } catch(e) { console.warn('nw snapshot', e); }
  var _scoreData;
  try { _scoreData = calculateHealthScore(); } catch(e) { _scoreData = null; }
  try { if (_scoreData) renderHealthScore(_scoreData); } catch(e) {}
  var _savStreak, _budStreak;
  try { _savStreak = calculateSavingsStreak(); } catch(e) { _savStreak = { count:0, months:[] }; }
  try { _budStreak = calculateBudgetStreak(); } catch(e) { _budStreak = { count:0, months:[] }; }
  try { renderStreaks(_savStreak, _budStreak); } catch(e) {}
  var _nudges;
  try { _nudges = generateNudges(); } catch(e) { _nudges = [{ icon:'✅', text:'Everything looks on track this month.' }]; }
  try { renderNudges(_nudges); } catch(e) {}

  // Hero greeting + figures (used by snapshot hero card if present)
  const _heroGreet = document.getElementById('db-hero-greeting');
  const _heroNW    = document.getElementById('db-hero-nw');
  const _heroInc   = document.getElementById('db-hero-inc');
  const _heroExp   = document.getElementById('db-hero-exp');
  const _heroSaved = document.getElementById('db-hero-saved');
  const _now       = new Date();
  const _hr        = _now.getHours();
  const _greet     = _hr < 12 ? 'GOOD MORNING' : _hr < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
  if (_heroGreet) _heroGreet.textContent = _greet;
  // Greeting name
  var _gnEl = document.getElementById('db-greeting-name');
  if (_gnEl) {
    var _gname = typeof getUserName === 'function' ? getUserName(activeProfile) : activeProfile;
    _gnEl.textContent = (_gname && _gname !== 'joint') ? _gname : 'Welcome back';
  }
  // Greeting date — "Sunday, 1 June 2026 · June 2026"
  var _gdEl = document.getElementById('db-greeting-date');
  if (_gdEl) {
    var _dayStr  = _now.toLocaleDateString('en-AU', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    var _monStr  = _now.toLocaleDateString('en-AU', { month:'long', year:'numeric' });
    _gdEl.textContent = _dayStr + ' · showing ' + _monStr;
  }
  const _pfx  = dbPeriodStr();
  const _inc  = activeTX().filter(t => t.type === 'income'  && t.date.startsWith(_pfx)).reduce((s, t) => s + Number(t.amount), 0);
  const _exp  = activeTX().filter(t => t.type === 'expense' && t.date.startsWith(_pfx)).reduce((s, t) => s + Number(t.amount), 0);
  if (_heroInc)   _heroInc.textContent   = '+' + fmt(_inc);
  if (_heroExp)   _heroExp.textContent   = '-' + fmt(_exp);
  if (_heroSaved) _heroSaved.textContent = ((_inc - _exp) >= 0 ? '+' : '-') + fmt(Math.abs(_inc - _exp));
  try {
    const _months = ctAllMonths(), _lm = _months.length ? _months[_months.length - 1] : null;
    const _bank   = _lm ? ['offset', 'home', 'sav1', 'sav2'].reduce((s, a) => s + ((CT[a] || {})[_lm] || 0), 0) : 0;
    const _supB   = (SUPER.b && SUPER.b.balance) || 0;
    const _supS   = (SUPER.s && SUPER.s.balance) || 0;
    const _eqV    = (typeof eqTotalEquitiesValue === 'function') ? eqTotalEquitiesValue() : 0;
    const _totalLiab = (typeof liabTotal === 'function') ? liabTotal() : (MORTGAGE.balance || 0);
    const _nw     = _bank + _supB + _supS + (MORTGAGE.homeValue || 0) + _eqV - _totalLiab;
    if (_heroNW) _heroNW.textContent = fmt(_nw);
  } catch (e) {}

  dbRenderNetWorth();
  dbRenderSummaryCards();
  dbRenderAccounts();
  dbRenderBudgetBars();
  dbRenderUpcomingBills();
  dbRenderMortgage();
  dbRenderGoals();
}

// ══════════════════════════════════════════════════════════════
// KPI SUMMARY CARDS — Income / Expenses / Surplus (current month)
// ══════════════════════════════════════════════════════════════

function dbRenderSummaryCards() {
  const el = document.getElementById('db-summary-cards');
  if (!el) return;
  const pfx    = dbPeriodStr();
  const incTx  = activeTX().filter(t => t.type === 'income'  && t.date.startsWith(pfx));
  const expTx  = activeTX().filter(t => t.type === 'expense' && t.date.startsWith(pfx));
  const inc    = incTx.reduce((s, t) => s + Number(t.amount), 0);
  const exp    = expTx.reduce((s, t) => s + Number(t.amount), 0);
  const net    = inc - exp;
  el.innerHTML = ''
    + '<div class="dash-stat ds-income"><div class="ds-lbl">Income</div><div class="ds-val">' + fmt(inc) + '</div><div class="ds-sub">' + dbPeriodLabel() + '</div></div>'
    + '<div class="dash-stat ds-expense"><div class="ds-lbl">Expenses</div><div class="ds-val">' + fmt(exp) + '</div><div class="ds-sub">' + expTx.length + ' transaction' + (expTx.length !== 1 ? 's' : '') + '</div></div>'
    + '<div class="dash-stat ds-net"><div class="ds-lbl">' + (net >= 0 ? 'Surplus' : 'Deficit') + '</div><div class="ds-val">' + fmt(Math.abs(net)) + '</div><div class="ds-sub">' + (net >= 0 ? 'Income over expenses' : 'Expenses over income') + '</div></div>';
}

// ══════════════════════════════════════════════════════════════
// BUDGET ALERTS — alert-only view (red / yellow categories only)
// ══════════════════════════════════════════════════════════════

function dbRenderBudgetBars() {
  const el = document.getElementById('db-budget-bars');
  if (!el) return;
  const pfx  = dbPeriodStr();
  const rows = [];

  Object.entries(LBUDGETS).forEach(([catId, ml]) => {
    const cat   = LCATS.find(c => c.id === catId);
    const name  = cat ? cat.name : catId;
    const lim   = ml; // always monthly on dashboard
    const spent = activeTX().filter(t =>
      t.type === 'expense' && t.date.startsWith(pfx) &&
      (t.catId === catId || t.category === name)
    ).reduce((s, t) => s + Number(t.amount), 0);
    rows.push({ name, icon: cat ? cat.icon : '', color: cat ? cat.color : 'var(--primary)', lim, spent });
  });

  if (!rows.length) {
    el.innerHTML = '<div class="empty"><div class="ei">🎯</div><p>Set budgets to see alerts. <a href="#" onclick="go(\'bva\');return false;" style="color:var(--primary)">Configure budgets →</a></p></div>';
    return;
  }

  // Only show categories at 70%+ (warn or over) — alert-only mode
  const alerts = rows
    .filter(r => r.lim > 0 && (r.spent / r.lim) >= 0.7)
    .sort((a, b) => (b.spent / b.lim) - (a.spent / a.lim));

  if (!alerts.length) {
    el.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:6px 0">'
      + '<span style="font-size:1.4rem">✅</span>'
      + '<div><div style="font-weight:600;font-size:.9rem">All budgets on track</div>'
      + '<div style="font-size:.76rem;color:var(--muted);margin-top:2px">' + rows.length + ' categor' + (rows.length === 1 ? 'y' : 'ies') + ' within budget this month</div></div>'
      + '</div>';
    return;
  }

  el.innerHTML = alerts.map(r => {
    const pct = Math.min((r.spent / r.lim) * 100, 100);
    const cls = pct >= 100 ? 'over' : 'warn';
    const rem = r.lim - r.spent;
    return '<div class="prog-wrap">'
      + '<div class="prog-hd"><span class="prog-lbl">' + (r.icon ? r.icon + ' ' : '') + r.name + '</span>'
      + '<span class="prog-val">' + fmt(r.spent) + ' / ' + fmt(r.lim) + '</span></div>'
      + '<div class="prog-track"><div class="prog-fill ' + cls + '" style="width:' + pct.toFixed(0) + '%"></div></div>'
      + '<div style="display:flex;justify-content:space-between;margin-top:3px;font-size:.7rem">'
      + '<span style="color:var(--muted)">' + pct.toFixed(0) + '%</span>'
      + '<span style="color:' + (rem < 0 ? 'var(--danger)' : 'var(--warn)') + ';font-weight:600">'
      + (rem < 0 ? 'Over by ' + fmt(Math.abs(rem)) : fmt(rem) + ' left') + '</span></div></div>';
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// ACCOUNT BALANCES
// ══════════════════════════════════════════════════════════════

function dbRenderAccounts() {
  const el = document.getElementById('db-accounts');
  if (!el) return;
  const months  = ctAllMonths();
  const lm      = months.length ? months[months.length - 1] : null;
  const accts   = [
    { id: 'offset', label: CTCFG.offsetLbl || 'Offset Account',     icon: '🏦' },
    { id: 'home',   label: CTCFG.homeLbl   || 'Home Transaction',    icon: '🏠' },
    { id: 'sav1',   label: CTCFG.sav1Lbl   || getUserName('brenton') + ' Savings', icon: '💰' },
    { id: 'sav2',   label: CTCFG.sav2Lbl   || getUserName('shelley') + ' Savings', icon: '💎' },
  ];
  const vals    = accts.map(a => lm ? ((CT[a.id] || {})[lm] || 0) : 0);
  const total   = vals.reduce((s, v) => s + v, 0);
  const dateLbl = lm ? new Date(lm + '-02').toLocaleString('en-AU', { month: 'long', year: 'numeric' }) : 'No data yet';
  el.innerHTML  = '<div class="acct-strip">'
    + accts.map((a, i) => '<div class="acct-strip-item"><div class="acct-strip-lbl">' + a.icon + ' ' + a.label + '</div><div class="acct-strip-val">' + fmt(vals[i]) + '</div></div>').join('')
    + '<div class="acct-strip-item acct-strip-total"><div class="acct-strip-lbl" style="color:var(--warn)">Combined</div><div class="acct-strip-val" style="color:var(--warn)">' + fmt(total) + '</div></div>'
    + '</div><div style="font-size:.7rem;color:var(--muted);margin-top:8px">As at ' + dateLbl + '</div>';
}

// ══════════════════════════════════════════════════════════════
// NET WORTH HERO
// ══════════════════════════════════════════════════════════════

function dbRenderNetWorth() {
  const el = document.getElementById('db-networth');
  if (!el) return;
  const months      = ctAllMonths();
  const lm          = months.length ? months[months.length - 1] : null;
  const prevM       = months.length >= 2 ? months[months.length - 2] : null;
  const bank        = lm ? ['offset', 'home', 'sav1', 'sav2'].reduce((s, a) => s + ((CT[a] || {})[lm] || 0), 0) : 0;
  const bankPrev    = prevM ? ['offset', 'home', 'sav1', 'sav2'].reduce((s, a) => s + ((CT[a] || {})[prevM] || 0), 0) : null;
  const supB        = SUPER.b?.balance || 0;
  const supS        = SUPER.s?.balance || 0;
  const homeVal     = MORTGAGE.homeValue || 0;
  const eqV         = (typeof eqTotalEquitiesValue === 'function') ? eqTotalEquitiesValue() : 0;
  const totalLiab   = (typeof liabTotal === 'function') ? liabTotal() : (MORTGAGE.balance || 0);
  const assetsTotal = bank + supB + supS + homeVal + eqV;
  const nw          = assetsTotal - totalLiab;
  const prevNW      = bankPrev !== null ? bankPrev + supB + supS + homeVal + eqV - totalLiab : null;
  const delta       = prevNW !== null ? nw - prevNW : null;
  const deltaHtml   = delta !== null
    ? '<div style="font-size:.8rem;font-weight:600;color:' + (delta >= 0 ? 'var(--success)' : 'var(--danger)') + ';margin-top:4px">'
      + (delta >= 0 ? '↑' : '↓') + ' ' + fmt(Math.abs(delta)) + ' vs last month</div>'
    : '';

  el.innerHTML = '<div class="tile-hd" style="margin-bottom:8px">'
    + '<div class="section-label" style="margin:0">Net Worth</div>'
    + '<a href="#" onclick="go(\'assets\');return false;" class="tile-link">View assets →</a>'
    + '</div>'
    + '<div class="nw-val">' + fmt(nw) + '</div>'
    + deltaHtml
    + '<div class="nw-sub" style="margin-top:6px">Assets ' + fmt(assetsTotal) + ' − Liabilities ' + fmt(totalLiab) + '</div>'
    + '<div style="font-size:.68rem;color:var(--muted);margin-top:2px;margin-bottom:10px">Assets − Liabilities · <a href="#" onclick="go(\'liabilities\');return false;" style="color:var(--primary)">View liabilities →</a></div>'
    + '<div class="nw-breakdown">'
    + '<div class="nw-item"><div class="nw-item-lbl">Bank</div><div class="nw-item-val" style="color:var(--primary)">' + fmt(bank) + '</div></div>'
    + '<div class="nw-item"><div class="nw-item-lbl">Super</div><div class="nw-item-val" style="color:var(--purple)">' + fmt(supB + supS) + '</div></div>'
    + '<div class="nw-item"><div class="nw-item-lbl">Home Value</div><div class="nw-item-val" style="color:var(--success)">' + fmt(homeVal) + '</div></div>'
    + (eqV > 0 ? '<div class="nw-item"><div class="nw-item-lbl">Equities</div><div class="nw-item-val" style="color:var(--success)">' + fmt(eqV) + '</div></div>' : '')
    + '<div class="nw-item"><div class="nw-item-lbl">All Liabilities</div><div class="nw-item-val" style="color:var(--danger)">-' + fmt(totalLiab) + '</div></div>'
    + '</div>';
}

// ══════════════════════════════════════════════════════════════
// MORTGAGE SNAPSHOT
// ══════════════════════════════════════════════════════════════

function dbRenderMortgage() {
  const el = document.getElementById('db-mortgage');
  if (!el) return;
  if (!MORTGAGE.balance) {
    el.innerHTML = '<div class="empty" style="padding:12px 0"><div class="ei">🏡</div><p>No mortgage data.</p></div>';
    return;
  }
  const m      = MORTGAGE;
  const equity = Math.max(0, (m.homeValue || 0) - (m.balance || 0));
  const eqPct  = m.homeValue ? (equity / m.homeValue * 100).toFixed(1) : 0;
  const isIO   = m.reptype === 'io';
  const effBal = Math.max(0, (m.balance || 0) - (m.offset || 0));
  const r      = (m.rate || 0) / 100 / 12;
  const n      = (m.years || 0) * 12;
  const repmt  = isIO ? m.balance * r : (r && n ? m.balance * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : 0);
  const np     = new Date(); np.setMonth(np.getMonth() + 1); np.setDate(1);
  const npStr  = np.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  el.innerHTML = '<div class="mort-snap">'
    + '<div class="mort-snap-item"><div class="mort-snap-lbl">Balance</div><div class="mort-snap-val" style="color:var(--danger)">' + fmt(m.balance) + '</div></div>'
    + '<div class="mort-snap-item"><div class="mort-snap-lbl">Equity</div><div class="mort-snap-val" style="color:var(--success)">' + fmt(equity) + '</div><div style="font-size:.68rem;color:var(--muted);margin-top:2px">' + eqPct + '% of value</div></div>'
    + '<div class="mort-snap-item"><div class="mort-snap-lbl">Next Payment</div><div class="mort-snap-val" style="font-size:.9rem">' + npStr + '</div></div>'
    + '</div>'
    + (m.offset ? '<div style="margin-top:10px;font-size:.76rem;padding:7px 12px;background:var(--primary-bg);border-radius:8px;color:var(--pink-light)">Offset: <strong>' + fmt(m.offset) + '</strong> · Effective balance: <strong>' + fmt(effBal) + '</strong></div>' : '');
}

// ══════════════════════════════════════════════════════════════
// UPCOMING BILLS
// ══════════════════════════════════════════════════════════════

function dbRenderUpcomingBills() {
  const el = document.getElementById('db-upcoming-bills');
  if (!el) return;
  const todayNum = new Date().getDate();
  // Show bills due in the next 14 days (or overdue but unpaid)
  const upcoming = BILLS.filter(b => !b.paid && b.due - todayNum >= -2 && b.due - todayNum <= 14)
                        .sort((a, b) => a.due - b.due);
  if (!upcoming.length) {
    el.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:6px 0">'
      + '<span style="font-size:1.4rem">✅</span>'
      + '<div><div style="font-weight:600;font-size:.9rem">No bills due soon</div>'
      + '<div style="font-size:.76rem;color:var(--muted);margin-top:2px">Nothing due in the next 14 days</div></div>'
      + '</div>';
    return;
  }
  // Show up to 3 bills; link to all if more
  const shown = upcoming.slice(0, 3);
  el.innerHTML = shown.map(b => {
    const daysUntil  = b.due - todayNum;
    const pillClass  = daysUntil <= 0 ? 'days-today' : daysUntil <= 3 ? 'days-soon' : 'days-ok';
    const daysLbl    = daysUntil <= 0 ? (daysUntil === 0 ? 'Today!' : 'Overdue') : daysUntil === 1 ? 'Tomorrow' : 'In ' + daysUntil + 'd';
    return '<div class="upcoming-bill-row">'
      + '<div style="font-size:1.2rem">' + b.icon + '</div>'
      + '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:.86rem">' + b.name + '</div>'
      + '<div style="font-size:.72rem;color:var(--muted)">Due ' + b.due + ord(b.due) + '</div></div>'
      + '<span class="bill-days-pill ' + pillClass + '">' + daysLbl + '</span>'
      + '<div style="font-family:var(--font-mono);font-weight:700;font-size:1rem;flex-shrink:0">' + fmt(b.amount) + '</div>'
      + '</div>';
  }).join('')
    + (upcoming.length > 3 ? '<div style="font-size:.75rem;color:var(--muted);margin-top:8px">+' + (upcoming.length - 3) + ' more — <a href="#" onclick="go(\'bills\');return false;" style="color:var(--primary)">view all →</a></div>' : '');
}

// ══════════════════════════════════════════════════════════════
// SAVINGS GOALS — top 2 priority goals
// ══════════════════════════════════════════════════════════════

function dbRenderGoals() {
  const el = document.getElementById('db-goals');
  if (!el) return;
  if (!GOALS.length) {
    el.innerHTML = '<div class="empty" style="padding:12px 0"><div class="ei">🎯</div><p>No goals yet — <a href="#" onclick="go(\'goals\');return false;" style="color:var(--primary)">add your first goal →</a></p></div>';
    return;
  }
  const shown = GOALS.slice(0, 2);
  el.innerHTML = shown.map(g => {
    const current = (typeof _goalCurrent === 'function') ? _goalCurrent(g) : (Number(g.currentAmount) || Number(g.saved) || 0);
    const target  = (typeof _goalTarget  === 'function') ? _goalTarget(g)  : (Number(g.targetAmount)  || Number(g.target)  || 0);
    const p       = target > 0 ? Math.min((current / target) * 100, 100) : 0;
    const cls     = p >= 100 ? 'over' : p >= 75 ? 'warn' : '';
    return '<div class="prog-wrap">'
      + '<div class="prog-hd"><span class="prog-lbl">' + (g.icon || '🎯') + ' ' + (p >= 100 ? '✅ ' : '') + g.name + '</span>'
      + '<span class="prog-val" style="font-family:var(--font-mono)">' + fmt(current) + ' / ' + fmt(target) + '</span></div>'
      + '<div class="prog-track"><div class="prog-fill ' + cls + '" style="width:' + p.toFixed(0) + '%"></div></div>'
      + '<div style="font-size:.7rem;color:var(--muted);margin-top:3px">' + p.toFixed(0) + '% · ' + (p >= 100 ? 'Goal reached!' : fmt(Math.max(0, target - current)) + ' to go') + '</div>'
      + '</div>';
  }).join('')
    + (GOALS.length > 2 ? '<div style="font-size:.75rem;color:var(--muted);margin-top:8px">+' + (GOALS.length - 2) + ' more — <a href="#" onclick="go(\'goals\');return false;" style="color:var(--primary)">view all →</a></div>' : '');
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
