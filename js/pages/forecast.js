// FORECAST — RECURRING PATTERN DETECTION & CASH FLOW PROJECTION
// ══════════════════════════════════════════════════════════════

let fcRange  = 3;          // months ahead to project
let fcView   = 'chart';    // 'chart' | 'table'
let fcChart  = null;

// ── Frequency helpers ─────────────────────────────────────────
const FREQ_DAYS = { weekly:7, fortnightly:14, monthly:30.44, quarterly:91.3, annual:365.25 };

function freqLabel(f) {
  return { weekly:'Weekly', fortnightly:'Fortnightly', monthly:'Monthly',
           quarterly:'Quarterly', annual:'Annual' }[f] || f;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + Math.round(n));
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return (new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000;
}

function guessFrequency(dayGaps) {
  const avg = dayGaps.reduce((s, d) => s + d, 0) / dayGaps.length;
  if (avg <= 9)   return 'weekly';
  if (avg <= 20)  return 'fortnightly';
  if (avg <= 45)  return 'monthly';
  if (avg <= 120) return 'quarterly';
  return 'annual';
}

// ── Get combined cash balance from Cash Tracker ───────────────
function getCashBalance() {
  const months = ctAllMonths();
  if (!months.length) return null;
  const lm = months[months.length - 1];
  const total = CT_ACCTS.reduce((s, a) => s + ((CT[a.id] || {})[lm] || 0), 0);
  return total > 0 ? total : null;
}

// ── Pattern Detection ─────────────────────────────────────────
function detectRecurring() {
  const expenses = TX.filter(t => t.type === 'expense').sort((a, b) => a.date.localeCompare(b.date));
  const income   = TX.filter(t => t.type === 'income').sort((a, b) => a.date.localeCompare(b.date));

  // Group by normalised merchant key (first 3 words of description, lowercased)
  function merchantKey(t) {
    return (t.description || t.category || 'unknown').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/).slice(0, 3).join(' ');
  }

  function detectGroup(txList, type) {
    const groups = {};
    txList.forEach(t => {
      const k = merchantKey(t);
      if (!groups[k]) groups[k] = [];
      groups[k].push(t);
    });

    const found = [];
    Object.entries(groups).forEach(([key, txs]) => {
      if (txs.length < 2) return;
      // Amount variance check: all within 10% of median
      const amounts = txs.map(t => Number(t.amount)).sort((a, b) => a - b);
      const median  = amounts[Math.floor(amounts.length / 2)];
      const allClose = amounts.every(a => Math.abs(a - median) / median <= 0.10);
      if (!allClose) return;

      const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const sortedDates = txs.map(t => t.date).sort();
      const gaps = [];
      for (let i = 1; i < sortedDates.length; i++) {
        gaps.push(daysBetween(sortedDates[i - 1], sortedDates[i]));
      }
      const avgGap = gaps.reduce((s, d) => s + d, 0) / gaps.length;
      // All gaps within 30% of average (allows some skipped months etc.)
      const gapsConsistent = gaps.every(g => Math.abs(g - avgGap) / avgGap <= 0.30);
      if (!gapsConsistent) return;

      const freq     = guessFrequency(gaps);
      const lastDate = sortedDates[sortedDates.length - 1];
      const nextDate = addDays(lastDate, FREQ_DAYS[freq]);
      const catId    = txs[txs.length - 1].catId || catIdFor(txs[txs.length - 1].category);
      const cat      = LCATS.find(c => c.id === catId);

      found.push({
        id:       key + '_' + type,
        name:     txs[0].description || txs[0].category || key,
        amount:   Math.round(avgAmount * 100) / 100,
        type,
        freq,
        nextDate,
        catId,
        catName:  cat ? cat.name : 'Other',
        catIcon:  cat ? cat.icon : '📋',
        catColor: cat ? cat.color : '#8a8095',
        occurrences: txs.length,
        status:   'pending', // 'pending' | 'confirmed' | 'dismissed'
        source:   'detected',
      });
    });
    return found;
  }

  const detected = [...detectGroup(expenses, 'expense'), ...detectGroup(income, 'income')];

  // Merge into LRECURRING: add new detections as 'pending', keep existing confirmed/dismissed
  const existingIds = new Set(LRECURRING.map(r => r.id));
  detected.forEach(d => {
    if (!existingIds.has(d.id)) {
      LRECURRING.push(d);
    } else {
      // Update amount + nextDate for pending items
      const existing = LRECURRING.find(r => r.id === d.id);
      if (existing && existing.status === 'pending') {
        existing.amount   = d.amount;
        existing.nextDate = d.nextDate;
        existing.freq     = d.freq;
      }
    }
  });
  save(K.recurring, LRECURRING);
}

// ── Confirm / Dismiss pattern ─────────────────────────────────
function confirmPattern(id) {
  const r = LRECURRING.find(x => x.id === id);
  if (r) { r.status = 'confirmed'; save(K.recurring, LRECURRING); renderForecast(); }
}

function dismissPattern(id) {
  const r = LRECURRING.find(x => x.id === id);
  if (r) { r.status = 'dismissed'; save(K.recurring, LRECURRING); renderForecast(); }
}

function deleteRecurring(id) {
  LRECURRING = LRECURRING.filter(x => x.id !== id);
  save(K.recurring, LRECURRING);
  renderForecast();
  toast('🗑️ Removed');
}

// ── Manual add / edit ─────────────────────────────────────────
function openAddRecurring(id) {
  const form = document.getElementById('fc-add-form');
  if (!form) return;
  // Populate category select
  const catSel = document.getElementById('fc-add-cat');
  if (catSel) catSel.innerHTML = LCATS.map(c => '<option value="' + c.id + '">' + c.icon + ' ' + c.name + '</option>').join('');

  if (id) {
    const r = LRECURRING.find(x => x.id === id);
    if (r) {
      document.getElementById('fc-edit-id').value = id;
      document.getElementById('fc-add-name').value   = r.name;
      document.getElementById('fc-add-amount').value = r.amount;
      document.getElementById('fc-add-type').value   = r.type;
      document.getElementById('fc-add-freq').value   = r.freq;
      document.getElementById('fc-add-next').value   = r.nextDate;
      if (catSel) catSel.value = r.catId || 'other';
      document.getElementById('fc-add-form-title').textContent = 'Edit Recurring Item';
    }
  } else {
    document.getElementById('fc-edit-id').value = '';
    document.getElementById('fc-add-name').value   = '';
    document.getElementById('fc-add-amount').value = '';
    document.getElementById('fc-add-type').value   = 'expense';
    document.getElementById('fc-add-freq').value   = 'monthly';
    document.getElementById('fc-add-next').value   = today();
    document.getElementById('fc-add-form-title').textContent = 'Add Recurring Item';
  }
  form.style.display = 'block';
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeAddRecurring() {
  const form = document.getElementById('fc-add-form');
  if (form) form.style.display = 'none';
}

function saveRecurringItem() {
  const name   = document.getElementById('fc-add-name').value.trim();
  const amount = parseFloat(document.getElementById('fc-add-amount').value);
  const type   = document.getElementById('fc-add-type').value;
  const freq   = document.getElementById('fc-add-freq').value;
  const next   = document.getElementById('fc-add-next').value;
  const catId  = document.getElementById('fc-add-cat').value;
  const editId = document.getElementById('fc-edit-id').value;

  if (!name || !amount || !next) { toast('⚠️ Fill in all fields'); return; }
  const cat = LCATS.find(c => c.id === catId);

  if (editId) {
    const r = LRECURRING.find(x => x.id === editId);
    if (r) {
      Object.assign(r, { name, amount, type, freq, nextDate: next, catId,
        catName: cat ? cat.name : 'Other', catIcon: cat ? cat.icon : '📋',
        catColor: cat ? cat.color : '#8a8095', status: 'confirmed' });
    }
  } else {
    LRECURRING.push({
      id: 'manual_' + Date.now(), name, amount, type, freq, nextDate: next,
      catId, catName: cat ? cat.name : 'Other', catIcon: cat ? cat.icon : '📋',
      catColor: cat ? cat.color : '#8a8095', status: 'confirmed', source: 'manual',
      occurrences: 0,
    });
  }
  save(K.recurring, LRECURRING);
  closeAddRecurring();
  renderForecast();
  toast('✅ Saved');
}

// ── Upcoming 30-day list ──────────────────────────────────────
function getUpcoming(days) {
  const today_d = today();
  const endDate = addDays(today_d, days);
  const confirmed = LRECURRING.filter(r => r.status === 'confirmed');
  const items = [];

  confirmed.forEach(r => {
    let d = r.nextDate;
    // Walk forward from nextDate generating occurrences within window
    let safety = 0;
    while (d <= endDate && safety < 60) {
      safety++;
      if (d >= today_d) items.push({ ...r, date: d });
      d = addDays(d, FREQ_DAYS[r.freq]);
    }
  });

  return items.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Project weekly cash flows ─────────────────────────────────
function projectCashFlow(startingBalance, months) {
  const today_d = today();
  const totalDays = Math.round(months * 30.44);
  const endDate   = addDays(today_d, totalDays);
  const confirmed = LRECURRING.filter(r => r.status === 'confirmed');

  // Build week boundaries
  const weeks = [];
  let weekStart = today_d;
  while (weekStart <= endDate) {
    const weekEnd = addDays(weekStart, 6);
    weeks.push({ start: weekStart, end: weekEnd < endDate ? weekEnd : endDate, income: 0, expenses: 0 });
    weekStart = addDays(weekStart, 7);
  }

  // Distribute recurring items across weeks
  confirmed.forEach(r => {
    let d = r.nextDate;
    let safety = 0;
    while (d <= endDate && safety < 365) {
      safety++;
      if (d >= today_d) {
        const week = weeks.find(w => d >= w.start && d <= w.end);
        if (week) {
          if (r.type === 'income') week.income += r.amount;
          else week.expenses += r.amount;
        }
      }
      d = addDays(d, FREQ_DAYS[r.freq]);
    }
  });

  // Calculate running balance
  let balance = startingBalance !== null ? startingBalance : 0;
  const rows = weeks.map(w => {
    const net = w.income - w.expenses;
    balance += net;
    return {
      start:   w.start,
      income:  w.income,
      expenses: w.expenses,
      net,
      balance: startingBalance !== null ? balance : null,
    };
  });

  return rows;
}

// ── Controls ──────────────────────────────────────────────────
function setFcRange(m) {
  fcRange = m;
  [1, 3, 6, 12].forEach(r => {
    const btn = document.getElementById('fc-r-' + r);
    if (btn) btn.classList.toggle('active', r === m);
  });
  renderForecastChart();
  renderForecastTable();
}

function setFcView(v) {
  fcView = v;
  ['chart', 'table'].forEach(x => {
    const btn = document.getElementById('fc-v-' + x);
    if (btn) btn.classList.toggle('active', x === v);
  });
  const cp = document.getElementById('fc-chart-panel');
  const tp = document.getElementById('fc-table-panel');
  if (cp) cp.style.display = v === 'chart' ? 'block' : 'none';
  if (tp) tp.style.display = v === 'table'  ? 'block' : 'none';
}

// ── Main render ───────────────────────────────────────────────
function renderForecast() {
  // Starting balance from Cash Tracker
  const cashBal = getCashBalance();
  const balEl   = document.getElementById('fc-bal-value');
  const warnEl  = document.getElementById('fc-bal-warn');
  if (balEl) balEl.textContent = cashBal !== null ? fmt(cashBal) : '—';
  if (warnEl) warnEl.style.display = cashBal === null ? 'block' : 'none';

  // Pattern lists
  renderFcPending();
  renderFcConfirmed();
  renderFcUpcoming();
  renderForecastChart();
  renderForecastTable();
  renderFcInsights(cashBal);
  setFcView(fcView);
}

function renderFcPending() {
  const el = document.getElementById('fc-pending-list');
  if (!el) return;
  const pending = LRECURRING.filter(r => r.status === 'pending');
  if (!pending.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--warn);margin-bottom:10px">🔍 Detected — Needs Review (' + pending.length + ')</div>'
    + pending.map(r => buildRecCard(r, true)).join('');
}

function renderFcConfirmed() {
  const el = document.getElementById('fc-confirmed-list');
  if (!el) return;
  const confirmed = LRECURRING.filter(r => r.status === 'confirmed');
  el.innerHTML = confirmed.length
    ? confirmed.map(r => buildRecCard(r, false)).join('')
    : '<div class="empty" style="padding:16px 0"><div class="ei">✅</div><p>No confirmed patterns yet. Confirm detected patterns above or add one manually.</p></div>';
}

function buildRecCard(r, isPending) {
  const color = r.type === 'income' ? 'var(--success)' : 'var(--primary)';
  const bg    = r.type === 'income' ? '#1a3020' : '#2a1030';
  const sign  = r.type === 'income' ? '+' : '-';
  const nextFmt = new Date(r.nextDate + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

  return '<div class="rec-card' + (isPending ? ' rec-pending' : '') + '">'
    + '<div class="rec-icon" style="background:' + r.catColor + '33;color:' + r.catColor + '">' + r.catIcon + '</div>'
    + '<div class="rec-info">'
    + '<div class="rec-name">' + r.name + '</div>'
    + '<div class="rec-meta">' + freqLabel(r.freq) + ' · ' + r.catName + ' · Next: ' + nextFmt
    + (r.occurrences > 0 ? ' · ' + r.occurrences + ' occurrences detected' : '') + '</div>'
    + '</div>'
    + '<div class="rec-amt" style="color:' + color + '">' + sign + fmt(r.amount) + '</div>'
    + '<div class="rec-actions">'
    + (isPending ? '<button class="btn btn-primary btn-sm" onclick="confirmPattern(\'' + r.id + '\')">✅ Confirm</button>' : '')
    + (isPending ? '<button class="btn btn-ghost btn-sm" onclick="dismissPattern(\'' + r.id + '\')">✕ Dismiss</button>' : '')
    + (!isPending ? '<button class="btn btn-ghost btn-sm" onclick="openAddRecurring(\'' + r.id + '\')">✏️</button>' : '')
    + '<button class="del-btn" onclick="deleteRecurring(\'' + r.id + '\')" title="Delete">🗑</button>'
    + '</div></div>';
}

function renderFcUpcoming() {
  const el = document.getElementById('fc-upcoming');
  if (!el) return;
  const items = getUpcoming(30);
  if (!items.length) {
    el.innerHTML = '<div class="empty" style="padding:16px 0"><div class="ei">📅</div><p>No confirmed upcoming items in the next 30 days.</p></div>';
    return;
  }
  el.innerHTML = items.map(item => {
    const dateStr = new Date(item.date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    const isInc   = item.type === 'income';
    const daysAway = Math.round(daysBetween(today(), item.date));
    const daysLbl = daysAway === 0 ? 'Today' : daysAway === 1 ? 'Tomorrow' : 'In ' + daysAway + ' days';

    return '<div class="upcoming-row">'
      + '<div class="upcoming-date">' + dateStr + '<div style="font-size:.68rem;color:var(--muted)">' + daysLbl + '</div></div>'
      + '<div class="upcoming-name">' + item.name + '<div style="font-size:.72rem;color:var(--muted)">' + freqLabel(item.freq) + '</div></div>'
      + '<span class="upcoming-cat" style="background:' + item.catColor + '33;color:' + item.catColor + '">' + item.catIcon + ' ' + item.catName + '</span>'
      + '<div class="' + (isInc ? 'upcoming-amt-pos' : 'upcoming-amt-neg') + '">' + (isInc ? '+' : '-') + fmt(item.amount) + '</div>'
      + '</div>';
  }).join('');
}

// ── Chart ─────────────────────────────────────────────────────
function renderForecastChart() {
  const canvas = document.getElementById('fc-chart');
  if (!canvas) return;
  const cashBal = getCashBalance();
  const rows    = projectCashFlow(cashBal, fcRange);

  const labels  = rows.map(r => new Date(r.start + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }));
  const balData = rows.map(r => r.balance);
  const incData = rows.map(r => r.income);
  const expData = rows.map(r => r.expenses);
  const hasBalance = cashBal !== null;

  // Negative balance warning
  const negWeeks = rows.filter(r => r.balance !== null && r.balance < 0);
  const negWarnEl = document.getElementById('fc-neg-warn');
  const negTextEl = document.getElementById('fc-neg-warn-text');
  if (negWarnEl && negTextEl) {
    if (negWeeks.length) {
      const firstNeg = negWeeks[0];
      const fmtDate  = new Date(firstNeg.start + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
      negWarnEl.style.display = 'flex';
      negTextEl.textContent = 'Balance projected to go negative from week of ' + fmtDate + ' (lowest: ' + fmt(Math.min(...negWeeks.map(r => r.balance))) + ')';
    } else {
      negWarnEl.style.display = 'none';
    }
  }

  if (fcChart) { fcChart.destroy(); fcChart = null; }

  const ctx = canvas.getContext('2d');
  const datasets = [];

  // Income bars
  datasets.push({
    type: 'bar', label: 'Income', data: incData, backgroundColor: 'rgba(82,214,138,.4)',
    borderColor: '#52d68a', borderWidth: 1, borderRadius: 4, yAxisID: 'y',
  });
  // Expense bars
  datasets.push({
    type: 'bar', label: 'Expenses', data: expData.map(v => -v), backgroundColor: 'rgba(232,69,122,.35)',
    borderColor: '#e8457a', borderWidth: 1, borderRadius: 4, yAxisID: 'y',
  });
  // Balance line
  if (hasBalance) {
    datasets.push({
      type: 'line', label: 'Running Balance', data: balData, borderColor: '#f0a040',
      backgroundColor: 'rgba(240,160,64,.12)', fill: true, tension: 0.3, pointRadius: 3,
      pointHoverRadius: 5, borderWidth: 2.5, yAxisID: 'y',
    });
  }

  fcChart = safeChart(ctx, {
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 11 }, padding: 13, color: '#8a8095' } },
        tooltip: {
          callbacks: {
            label: c => ' ' + c.dataset.label + ': ' + fmt(Math.abs(c.parsed.y)),
          }
        },
        annotation: { annotations: {} }, // placeholder
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 10 }, color: '#8a8095', maxTicksLimit: 12 } },
        y: { grid: { color: '#2a2535' }, ticks: { font: { family: 'Inter', size: 10 }, color: '#8a8095', callback: v => '$' + Math.round(v).toLocaleString() } },
      }
    }
  });
}

// ── Table ─────────────────────────────────────────────────────
function renderForecastTable() {
  const tbody  = document.getElementById('fc-tbody');
  const empty  = document.getElementById('fc-table-empty');
  if (!tbody) return;
  const cashBal = getCashBalance();
  const rows    = projectCashFlow(cashBal, fcRange);

  if (!rows.length || !LRECURRING.filter(r => r.status === 'confirmed').length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = rows.map(r => {
    const isNeg = r.balance !== null && r.balance < 0;
    const weekLbl = new Date(r.start + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    const incStr  = r.income   > 0 ? '<span style="color:var(--success)">+' + fmt(r.income) + '</span>' : '—';
    const expStr  = r.expenses > 0 ? '<span style="color:var(--danger)">-'  + fmt(r.expenses) + '</span>' : '—';
    const netStr  = r.net !== 0 ? (r.net > 0 ? '<span style="color:var(--success)">+' + fmt(r.net) + '</span>' : '<span style="color:var(--danger)">-' + fmt(Math.abs(r.net)) + '</span>') : '<span style="color:var(--muted)">—</span>';
    const balStr  = r.balance !== null ? (r.balance < 0 ? '<span style="color:var(--danger)">' + fmt(r.balance) + '</span>' : '<span style="color:var(--success)">' + fmt(r.balance) + '</span>') : '<span style="color:var(--muted)">—</span>';
    return '<tr class="' + (isNeg ? 'fc-neg' : '') + '">'
      + '<td>' + weekLbl + '</td>'
      + '<td>' + incStr + '</td>'
      + '<td>' + expStr + '</td>'
      + '<td>' + netStr + '</td>'
      + '<td>' + balStr + '</td>'
      + '</tr>';
  }).join('');
}

// ── Insights ─────────────────────────────────────────────────
function renderFcInsights(cashBal) {
  const el = document.getElementById('fc-insights-panel');
  if (!el) return;
  const confirmed = LRECURRING.filter(r => r.status === 'confirmed');
  if (!confirmed.length) { el.innerHTML = '<div class="empty" style="padding:12px 0"><div class="ei">💡</div><p>Add recurring patterns to see insights.</p></div>'; return; }

  const insights = [];
  const expenses = confirmed.filter(r => r.type === 'expense');
  const income   = confirmed.filter(r => r.type === 'income');

  // 1. Largest recurring expense
  if (expenses.length) {
    const monthlyAmt = r => r.amount * (365.25 / FREQ_DAYS[r.freq] / 12);
    const biggest = expenses.slice().sort((a, b) => monthlyAmt(b) - monthlyAmt(a))[0];
    insights.push({
      icon: '💸',
      text: 'Your largest recurring expense is <strong>' + biggest.name + '</strong> at '
        + (biggest.freq === 'monthly' ? fmt(biggest.amount) + '/month' : fmt(biggest.amount) + ' ' + biggest.freq.replace('ly',''))
        + ' (' + fmt(monthlyAmt(biggest)) + '/mo effective).',
    });
  }

  // 2. Upcoming in 14 days
  const next14 = getUpcoming(14).filter(i => i.type === 'expense');
  if (next14.length) {
    const total14 = next14.reduce((s, i) => s + i.amount, 0);
    insights.push({
      icon: '📅',
      text: 'You have <strong>' + next14.length + ' expense' + (next14.length > 1 ? 's' : '') + '</strong> totalling <strong>' + fmt(total14) + '</strong> due in the next 14 days.',
    });
  }

  // 3. Lowest projected balance date
  if (cashBal !== null) {
    const rows = projectCashFlow(cashBal, fcRange);
    const minRow = rows.filter(r => r.balance !== null).sort((a, b) => a.balance - b.balance)[0];
    if (minRow) {
      const minDate = new Date(minRow.start + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
      const isNeg   = minRow.balance < 0;
      insights.push({
        icon: isNeg ? '🚨' : '📉',
        text: 'Based on current patterns, your balance will be lowest around <strong>' + minDate + '</strong> at <strong style="color:' + (isNeg ? 'var(--danger)' : 'var(--warn)') + '">' + fmt(minRow.balance) + '</strong>.',
      });
    }
  }

  // 4. Monthly net
  const totalMonthlyInc  = income.reduce((s, r)   => s + r.amount * (365.25 / FREQ_DAYS[r.freq]   / 12), 0);
  const totalMonthlyExp  = expenses.reduce((s, r) => s + r.amount * (365.25 / FREQ_DAYS[r.freq] / 12), 0);
  const netMonthly = totalMonthlyInc - totalMonthlyExp;
  if (totalMonthlyInc > 0 || totalMonthlyExp > 0) {
    insights.push({
      icon: netMonthly >= 0 ? '✅' : '⚠️',
      text: 'Confirmed recurring patterns total <strong style="color:var(--success)">' + fmt(totalMonthlyInc) + '</strong>/mo income and <strong style="color:var(--danger)">' + fmt(totalMonthlyExp) + '</strong>/mo expenses — net <strong style="color:' + (netMonthly >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + fmt(netMonthly) + '</strong>/mo.',
    });
  }

  el.innerHTML = insights.map(i =>
    '<div class="insight-card"><div class="insight-icon">' + i.icon + '</div><div class="insight-text">' + i.text + '</div></div>'
  ).join('');
}


// ══════════════════════════════════════════════════════════════
