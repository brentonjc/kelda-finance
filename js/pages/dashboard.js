// Dashboard always shows the current month — no period navigation needed here.
// Analytical/trend views live in js/pages/insights.js

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

  // Hero greeting + figures (used by snapshot hero card if present)
  const _heroGreet = document.getElementById('db-hero-greeting');
  const _heroNW    = document.getElementById('db-hero-nw');
  const _heroInc   = document.getElementById('db-hero-inc');
  const _heroExp   = document.getElementById('db-hero-exp');
  const _heroSaved = document.getElementById('db-hero-saved');
  const _hr        = new Date().getHours();
  const _greet     = _hr < 12 ? 'GOOD MORNING' : _hr < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
  if (_heroGreet) _heroGreet.textContent = _greet;
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
