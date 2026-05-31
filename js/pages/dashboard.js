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
  var _nudges;
  try { _nudges = generateNudges(); } catch(e) { _nudges = [{ icon:'✅', text:'Everything looks on track this month.' }]; }
  try { renderNudges(_nudges); } catch(e) {}

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

// ── Hero: Net Worth value + YTD trend ─────────────────────────
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

    // YTD trend from nw history
    var trendEl = document.getElementById('db-hero-trend');
    if (trendEl) {
      var yrStart = new Date().getFullYear() + '-01';
      var hist    = [];
      try { hist = JSON.parse(localStorage.getItem('cff_networth_history') || '[]') || []; } catch(e) {}
      var ytdEntry = null;
      for (var hi = 0; hi < hist.length; hi++) {
        if (hist[hi].date && hist[hi].date.startsWith(yrStart)) { ytdEntry = hist[hi]; break; }
      }
      var delta   = ytdEntry ? nw - ytdEntry.netWorth : null;
      var sparkVals = hist.slice(-8).map(function(h){ return h.netWorth; });
      var sparkSvg  = _dbSparkline(sparkVals, delta !== null && delta < 0 ? '#EF4444' : '#00C896');
      var trendColor = delta === null ? 'var(--muted)' : (delta >= 0 ? 'var(--success)' : 'var(--danger)');
      var trendLbl   = delta === null ? '' : ((delta >= 0 ? '&#8593; ' : '&#8595; ') + fmt(Math.abs(delta)) + ' this year');
      trendEl.innerHTML = '<div class="db-hero-trend">'
        + (sparkSvg ? '<span>' + sparkSvg + '</span>' : '')
        + (trendLbl ? '<span class="db-hero-trend-lbl" style="color:' + trendColor + '">' + trendLbl + '</span>' : '')
        + '</div>';
    }
  } catch(e) { console.warn('dbRenderHero', e); }
}

// ── KPI row: Income / Expenses / Saved ───────────────────────
function dbRenderKpiRow() {
  var el = document.getElementById('db-kpi-row');
  if (!el) return;
  var pfx = dbPeriodStr();
  var txns = activeTX();
  var inc = txns.filter(function(t){return t.type==='income' && t.date.startsWith(pfx);}).reduce(function(s,t){return s+Number(t.amount);},0);
  var exp = txns.filter(function(t){return t.type==='expense' && t.date.startsWith(pfx);}).reduce(function(s,t){return s+Number(t.amount);},0);
  var saved    = inc - exp;
  var savePct  = inc > 0 ? Math.round((saved / inc) * 100) : 0;
  var saveClip = Math.min(Math.max(savePct, 0), 100);

  // Last 6 months of income / expenses for sparklines
  var incVals = [], expVals = [];
  for (var mi = 5; mi >= 0; mi--) {
    var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - mi);
    var mp = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    incVals.push(txns.filter(function(t){return t.type==='income'&&t.date.startsWith(mp);}).reduce(function(s,t){return s+Number(t.amount);},0));
    expVals.push(txns.filter(function(t){return t.type==='expense'&&t.date.startsWith(mp);}).reduce(function(s,t){return s+Number(t.amount);},0));
  }

  el.innerHTML = '<div class="db-kpi-card">'
    + '<div class="db-kpi-lbl">Income</div>'
    + '<div class="db-kpi-val" style="color:var(--success)">+' + fmt(inc) + '</div>'
    + _dbSparkline(incVals, '#00C896')
    + '</div>'
    + '<div class="db-kpi-card">'
    + '<div class="db-kpi-lbl">Expenses</div>'
    + '<div class="db-kpi-val" style="color:var(--primary)">-' + fmt(exp) + '</div>'
    + _dbSparkline(expVals, '#F0538A')
    + '</div>'
    + '<div class="db-kpi-card">'
    + '<div class="db-kpi-lbl">Saved</div>'
    + '<div class="db-kpi-val" style="color:' + (saved >= 0 ? 'var(--text)' : 'var(--danger)') + '">' + fmt(Math.abs(saved)) + '</div>'
    + '<div class="db-kpi-bar"><div class="db-kpi-bar-fill" style="width:' + saveClip + '%;background:' + (savePct < 0 ? 'var(--danger)' : savePct < 20 ? 'var(--warn)' : 'var(--success)') + '"></div></div>'
    + '<div class="db-kpi-sub">' + savePct + '% savings rate</div>'
    + '</div>';
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

  el.innerHTML = '<div class="db-glance-hd">'
    + '<div class="db-glance-title">📊 Monthly Budget</div>'
    + (rows.length ? '<span class="db-glance-badge ' + badgeCls + '">' + overallPct + '%  ' + badgeTxt + '</span>' : '')
    + '</div>'
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
