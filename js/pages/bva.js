// ══════════════════════════════════════════════════════════════
// BUDGET VS ACTUALS
// ══════════════════════════════════════════════════════════════

let bvaYear  = new Date().getFullYear();
let bvaMonth = new Date().getMonth() + 1; // 1-based
let bvaView  = 'month'; // 'month' | 'annual'

function bvaSetView(v) {
  bvaView = v;
  document.querySelectorAll('.bva-view-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.view === v);
  });
  bvaRebuildMonthSelect();
  renderBVA();
}

function bvaRebuildMonthSelect() {
  const sel = document.getElementById('bva-period-select');
  if (!sel) return;
  if (bvaView === 'annual') {
    // Build year options from TX data
    const years = [...new Set(TX.map(t => t.date ? t.date.slice(0, 4) : '').filter(Boolean))].sort().reverse();
    if (!years.includes(String(bvaYear))) years.unshift(String(bvaYear));
    const cur = String(bvaYear);
    sel.innerHTML = years.map(y => '<option value="' + y + '"' + (y === cur ? ' selected' : '') + '>' + y + ' (Annual)</option>').join('');
  } else {
    // Build month options matching tx-filter-month style
    const months = [...new Set(TX.map(t => t.date ? t.date.slice(0, 7) : '').filter(Boolean))].sort().reverse();
    const curMonth = bvaYear + '-' + String(bvaMonth).padStart(2, '0');
    if (!months.includes(curMonth)) months.unshift(curMonth);
    sel.innerHTML = months.map(function(m) {
      const lbl = new Date(m + '-02').toLocaleString('en-AU', { month: 'long', year: 'numeric' });
      return '<option value="' + m + '"' + (m === curMonth ? ' selected' : '') + '>' + lbl + '</option>';
    }).join('');
  }
}

function bvaPeriodChanged() {
  const sel = document.getElementById('bva-period-select');
  if (!sel) return;
  const val = sel.value;
  if (bvaView === 'annual') {
    bvaYear = parseInt(val);
  } else {
    const parts = val.split('-');
    bvaYear  = parseInt(parts[0]);
    bvaMonth = parseInt(parts[1]);
  }
  renderBVA();
}

function renderBVA() {
  migrateTxCategories();
  bvaRebuildMonthSelect();

  const isAnnual = bvaView === 'annual';
  const monthStr  = bvaYear + '-' + String(bvaMonth).padStart(2, '0');
  const monthLabel = new Date(bvaYear, bvaMonth - 1, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' });
  const periodLabel = isAnnual ? String(bvaYear) : monthLabel;

  const title = document.getElementById('bva-title');
  if (title) title.textContent = 'Budget vs Actuals — ' + periodLabel;

  const showAll = document.getElementById('bva-show-all')?.checked;

  // Gather actuals — exclude transfers
  const actuals = {};
  TX.filter(function(t) {
    if (t.type !== 'expense') return false;
    if (t.catId === 'transfers' || (t.category || '').toLowerCase() === 'transfers') return false;
    if (isAnnual) return t.date && t.date.startsWith(String(bvaYear));
    return t.date && t.date.startsWith(monthStr);
  }).forEach(function(t) {
    const id = t.catId || catIdFor(t.category);
    actuals[id] = (actuals[id] || 0) + Number(t.amount);
  });

  // Budget: monthly value from LBUDGETS; annual = ×12
  function getBudget(id) {
    const mo = LBUDGETS[id] || 0;
    return isAnnual ? mo * 12 : mo;
  }

  const catIds = new Set([
    ...Object.keys(LBUDGETS),
    ...Object.keys(actuals).filter(function(id) { return LCATS.some(function(c) { return c.id === id; }); })
  ]);
  if (showAll) LCATS.filter(function(c) { return c.type === 'expense' || c.type === 'both'; }).forEach(function(c) { catIds.add(c.id); });

  // Uncategorised bucket
  const uncatAmt = TX.filter(function(t) {
    if (t.type !== 'expense') return false;
    if (!t.catId && !t.category) return isAnnual ? t.date && t.date.startsWith(String(bvaYear)) : t.date && t.date.startsWith(monthStr);
    return false;
  }).reduce(function(s, t) { return s + Number(t.amount); }, 0);

  const rows = [];
  catIds.forEach(function(id) {
    const cat    = LCATS.find(function(c) { return c.id === id; });
    const name   = cat ? cat.name : id;
    const icon   = cat ? cat.icon : '📋';
    const color  = cat ? cat.color : '#8a8095';
    const budget = getBudget(id);
    const actual = actuals[id] || 0;
    if (!showAll && !budget && !actual) return;
    rows.push({ id, name, icon, color, budget, actual });
  });

  rows.sort(function(a, b) {
    const aOver = a.budget > 0 && a.actual > a.budget;
    const bOver = b.budget > 0 && b.actual > b.budget;
    if (aOver && !bOver) return -1;
    if (!aOver && bOver) return 1;
    return b.actual - a.actual;
  });

  const totalBudget = rows.reduce(function(s, r) { return s + r.budget; }, 0);
  const totalActual = rows.reduce(function(s, r) { return s + r.actual; }, 0) + uncatAmt;
  const totalRemain = totalBudget - totalActual;

  // Column headers
  const thBudget = document.getElementById('bva-th-budget');
  const thActual = document.getElementById('bva-th-actual');
  const thRemain = document.getElementById('bva-th-remain');
  if (thBudget) thBudget.textContent = isAnnual ? 'Annual Budget' : 'Monthly Budget';
  if (thActual) thActual.textContent = isAnnual ? 'YTD Actual' : 'Actual';
  if (thRemain) thRemain.textContent = isAnnual ? 'YTD Remaining' : 'Remaining';

  // Summary strip
  const sumEl = document.getElementById('bva-summary-strip');
  if (sumEl) {
    const overCount = rows.filter(function(r) { return r.budget > 0 && r.actual > r.budget; }).length;
    const periodSub = isAnnual ? String(bvaYear) : monthLabel;
    sumEl.innerHTML = ''
      + '<div class="stat stat-pink"><div class="sl">' + (isAnnual ? 'Annual Budget' : 'Monthly Budget') + '</div><div class="sv">' + (totalBudget ? fmt(totalBudget) : '—') + '</div><div class="ss">' + (isAnnual ? 'full year' : 'this month') + '</div></div>'
      + '<div class="stat ' + (totalActual > totalBudget && totalBudget > 0 ? 'stat-rose' : 'stat-purple') + '"><div class="sl">' + (isAnnual ? 'YTD Spent' : 'Total Spent') + '</div><div class="sv">' + fmt(totalActual) + '</div><div class="ss">' + periodSub + '</div></div>'
      + '<div class="stat ' + (totalRemain < 0 ? 'stat-rose' : 'stat-dark') + '"><div class="sl">Remaining</div><div class="sv">' + (totalBudget ? fmt(totalRemain) : '—') + '</div><div class="ss">' + (overCount ? overCount + ' over budget' : 'on track') + '</div></div>';
  }

  const tbody = document.getElementById('bva-tbody');
  const empty = document.getElementById('bva-empty');
  if (!tbody) return;

  if (!rows.length && !uncatAmt) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = rows.map(function(r) {
    const pct      = r.budget > 0 ? Math.min(r.actual / r.budget * 100, 999) : 0;
    const remain   = r.budget ? r.budget - r.actual : null;
    const remClass = remain === null ? 'bva-no-budget' : remain < 0 ? 'rem-red' : pct >= 75 ? 'rem-amber' : 'rem-green';
    const barColor = pct >= 100 ? 'var(--danger)' : pct >= 75 ? 'var(--warn)' : 'var(--success)';
    const barW     = Math.min(pct, 100).toFixed(1);
    const remText  = remain === null ? 'No budget' : (remain < 0 ? '-' + fmt(Math.abs(remain)) : fmt(remain));
    const pctText  = r.budget ? (pct > 999 ? '>999%' : pct.toFixed(0) + '%') : '—';
    return '<tr>'
      + '<td><div class="bva-cat-cell"><div class="bva-icon" style="background:' + r.color + '33;color:' + r.color + '">' + r.icon + '</div><span>' + r.name + '</span></div></td>'
      + '<td>' + (r.budget ? fmt(r.budget) : '<span class="bva-no-budget">No budget</span>') + '</td>'
      + '<td>' + fmt(r.actual) + '</td>'
      + '<td class="' + remClass + '">' + remText + '</td>'
      + '<td>' + pctText + '</td>'
      + '<td class="bva-bar-cell"><div class="bva-bar"><div class="bva-bar-fill" style="width:' + barW + '%;background:' + barColor + '"></div></div></td>'
      + '</tr>';
  }).join('');

  if (uncatAmt > 0) {
    tbody.innerHTML += '<tr>'
      + '<td><div class="bva-cat-cell"><div class="bva-icon" style="background:var(--card3);color:var(--muted)">❓</div><span>Uncategorised</span></div></td>'
      + '<td><span class="bva-no-budget">No budget</span></td>'
      + '<td>' + fmt(uncatAmt) + '</td>'
      + '<td class="bva-no-budget">—</td><td>—</td><td></td></tr>';
  }

  tbody.innerHTML += '<tr class="bva-total">'
    + '<td>Total</td>'
    + '<td>' + (totalBudget ? fmt(totalBudget) : '—') + '</td>'
    + '<td>' + fmt(totalActual) + '</td>'
    + '<td class="' + (totalRemain < 0 ? 'rem-red' : 'rem-green') + '">' + (totalBudget ? fmt(totalRemain) : '—') + '</td>'
    + '<td>' + (totalBudget ? (totalActual / totalBudget * 100).toFixed(0) + '%' : '—') + '</td>'
    + '<td></td></tr>';

  renderBVAInputs();
}

function renderBVAInputs() {
  const el = document.getElementById('bva-budget-inputs');
  if (!el) return;
  el.innerHTML = LCATS.map(function(c) {
    const mo = LBUDGETS[c.id] || '';
    const annualNote = mo ? '<span style="font-size:.7rem;color:var(--muted);margin-left:4px">= ' + fmt(mo * 12) + '/yr</span>' : '';
    return '<div class="dr">'
      + '<div class="dr-k" style="display:flex;align-items:center;gap:8px">'
      + '<span style="font-size:.9rem">' + c.icon + '</span><span>' + c.name + '</span>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
      + '<input type="number" placeholder="No limit" value="' + mo + '" min="0" step="50"'
      + ' style="width:120px;padding:6px 10px;font-size:.82rem;text-align:right;"'
      + ' onchange="saveLBudget(\'' + c.id + '\',this.value)" />'
      + '<span style="font-size:.74rem;color:var(--muted)">/mo</span>'
      + annualNote
      + '</div></div>';
  }).join('');
}

function saveLBudget(catId, value) {
  const v = parseFloat(value);
  if (!v || v <= 0) { delete LBUDGETS[catId]; }
  else { LBUDGETS[catId] = v; }
  save(K.lbudgets, LBUDGETS);
  renderBVA();
  if(typeof qsCheckAndAutoComplete==='function')qsCheckAndAutoComplete();
}


// ══════════════════════════════════════════════════════════════
// FORECAST — RECURRING PATTERN DETECTION & CASH FLOW PROJECTION
