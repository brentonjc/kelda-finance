// ══════════════════════════════════════════════════════════════
// TRANSFERS & RECONCILIATION
// ══════════════════════════════════════════════════════════════

// ── Helpers ──────────────────────────────────────────────────
function trDateDiff(a, b) {
  // Returns absolute day difference between two YYYY-MM-DD strings
  return Math.abs((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);
}

function trAmtMatch(a, b) {
  return Math.abs(Number(a.amount) - Number(b.amount)) < 0.01;
}

function trAlreadyLinked(idA, idB) {
  return TRANSFERS.some(tr =>
    (tr.txIdA === idA && tr.txIdB === idB) ||
    (tr.txIdA === idB && tr.txIdB === idA)
  );
}

// ── Auto-Detection ────────────────────────────────────────────
function autoDetectTransfers() {
  const candidates = TX.filter(t => t.amount > 0);
  const newPairs = [];

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i], b = candidates[j];
      if (trAlreadyLinked(a.id, b.id)) continue;
      if (!trAmtMatch(a, b)) continue;
      if (trDateDiff(a.date, b.date) > 1) continue;
      // Must be in different "accounts" — infer from person/description heuristic
      // or simply flag all same-amount ±1-day pairs involving one income + one expense
      if (a.type === b.type) continue; // one must be income, one expense
      newPairs.push({ a, b });
    }
  }

  newPairs.forEach(({ a, b }) => {
    if (trAlreadyLinked(a.id, b.id)) return;
    TRANSFERS.push({
      id: 'auto_' + a.id + '_' + b.id,
      txIdA: a.id,
      txIdB: b.id,
      date: a.date,
      amount: Number(a.amount),
      auto: true,
      status: 'pending', // 'pending' | 'confirmed' | 'dismissed'
      subcat: 'Between Accounts',
      note: '',
    });
    // Pre-tag both transactions as Transfers so they're excluded from analysis immediately
    tagTxAsTransfer(a.id, 'Between Accounts');
    tagTxAsTransfer(b.id, 'Between Accounts');
  });

  try { save(K.transfers, TRANSFERS); } catch(e) {}
  try { save(K.tx, TX); } catch(e) {}
}


// Tag both transactions in a transfer pair with the Transfers category
function tagTxAsTransfer(txId, subcat) {
  var t = TX.find(function(x) { return x.id === txId; });
  if (!t) return;
  t.catId    = 'transfers';
  t.category = 'Transfers';
  t.subcat   = subcat || 'Between Accounts';
  try { save(K.tx, TX); } catch(e) {}
}

function confirmTransfer(id) {
  const tr = TRANSFERS.find(t => t.id === id);
  if (tr) {
    tr.status = 'confirmed';
    save(K.transfers, TRANSFERS);
    tagTxAsTransfer(tr.txIdA, tr.subcat || 'Between Accounts');
    tagTxAsTransfer(tr.txIdB, tr.subcat || 'Between Accounts');
    save(K.tx, TX);
    renderTransfersPage(); renderDashboard(); renderTx();
    toast('✅ Transfer confirmed — tagged as Transfers category');
  }
}

function dismissTransfer(id) {
  const tr = TRANSFERS.find(t => t.id === id);
  if (tr) {
    tr.status = 'dismissed';
    // Un-tag the transactions — restore to Other so they appear in analysis again
    [tr.txIdA, tr.txIdB].forEach(txId => {
      const t = TX.find(x => x.id === txId);
      if (t && t.catId === 'transfers') {
        t.catId = 'other'; t.category = 'Other'; t.subcat = '';
      }
    });
    try { save(K.transfers, TRANSFERS); } catch(e) {}
    try { save(K.tx, TX); } catch(e) {}
    renderTransfersPage(); renderDashboard(); renderTx();
  }
}

function unlinkTransfer(id) {
  var tr = TRANSFERS.find(function(t) { return t.id === id; });
  if (tr) {
    // Clear Transfer category from both transactions so they go back to uncategorised
    [tr.txIdA, tr.txIdB].forEach(function(txId) {
      var t = TX.find(function(x) { return x.id === txId; });
      if (t && t.catId === 'transfers') {
        t.catId = 'other'; t.category = 'Other'; t.subcat = '';
      }
    });
    try { save(K.tx, TX); } catch(e) {}
  }
  TRANSFERS = TRANSFERS.filter(function(t) { return t.id !== id; });
  try { save(K.transfers, TRANSFERS); } catch(e) {}
  renderTransfersPage();
  renderDashboard();
  renderTx();
  toast('↩️ Transfer unlinked — transactions restored to analysis');
}

// ── Manual link ───────────────────────────────────────────────
let manualSelected = new Set();

function renderManualLinkList() {
  const el = document.getElementById('tr-manual-list');
  if (!el) return;
  const search = (document.getElementById('tr-manual-search')?.value || '').toLowerCase();
  const month  = document.getElementById('tr-manual-filter-month')?.value || '';
  const pool   = TX
    .filter(t => !isTransfer(t))
    .filter(t => !month || t.date.startsWith(month))
    .filter(t => !search || (t.description || '').toLowerCase().includes(search) || (t.category || '').toLowerCase().includes(search))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 80);

  if (!pool.length) { el.innerHTML = '<div class="empty" style="padding:16px"><div class="ei">💳</div><p>No transactions match.</p></div>'; return; }

  el.innerHTML = pool.map(t => {
    const checked = manualSelected.has(t.id);
    const sign    = t.type === 'income' ? '+' : '-';
    const col     = t.type === 'income' ? 'var(--success)' : 'var(--primary)';
    const dateStr = new Date(t.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border);cursor:pointer;'
      + (checked ? 'background:var(--card2);' : '')
      + '" onclick="toggleManualSelect(' + t.id + ')">'
      + '<input type="checkbox" class="tx-select-check" ' + (checked ? 'checked' : '') + ' onclick="event.stopPropagation();toggleManualSelect(' + t.id + ')" />'
      + '<div style="flex:0 0 65px;font-size:.76rem;color:var(--muted)">' + dateStr + '</div>'
      + '<div style="flex:1;min-width:0;font-size:.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (t.description || t.category || '—') + '</div>'
      + '<div style="font-size:.82rem;color:var(--muted)">' + (t.category || '') + '</div>'
      + '<div style="font-weight:700;color:' + col + ';flex-shrink:0">' + sign + fmt(t.amount) + '</div>'
      + '</div>';
  }).join('');

  const selEl = document.getElementById('tr-manual-selected');
  if (selEl) {
    if (manualSelected.size === 0) selEl.textContent = 'Select two transactions above';
    else if (manualSelected.size === 1) selEl.textContent = '1 selected — pick one more';
    else if (manualSelected.size === 2) selEl.textContent = '2 selected — ready to link';
    else selEl.textContent = manualSelected.size + ' selected — please select only 2';
  }
}

function toggleManualSelect(id) {
  if (manualSelected.has(id)) manualSelected.delete(id);
  else if (manualSelected.size < 2) manualSelected.add(id);
  else { toast('⚠️ Already have 2 selected — uncheck one first'); return; }
  renderManualLinkList();
}

function clearManualSelection() {
  manualSelected.clear();
  renderManualLinkList();
}

function buildManualMonthFilter() {
  const sel = document.getElementById('tr-manual-filter-month');
  if (!sel) return;
  const months = [...new Set(TX.map(t => t.date.slice(0, 7)))].sort().reverse();
  sel.innerHTML = '<option value="">All months</option>'
    + months.map(m => '<option value="' + m + '">'
      + new Date(m + '-02').toLocaleString('en-AU', { month: 'long', year: 'numeric' }) + '</option>').join('');
}

function manualLinkSelected() {
  if (manualSelected.size !== 2) { toast('⚠️ Select exactly 2 transactions'); return; }
  const [idA, idB] = [...manualSelected];
  if (trAlreadyLinked(idA, idB)) { toast('Already linked'); return; }
  const txA = TX.find(t => t.id === idA), txB = TX.find(t => t.id === idB);
  if (!txA || !txB) return;
  TRANSFERS.push({
    id: 'manual_' + Date.now(),
    txIdA: idA, txIdB: idB,
    date: txA.date,
    amount: Number(txA.amount),
    auto: false,
    status: 'confirmed',
    note: 'Manually linked',
  });
  save(K.transfers, TRANSFERS);
  tagTxAsTransfer(idA, 'Between Accounts');
  tagTxAsTransfer(idB, 'Between Accounts');
  save(K.tx, TX);
  manualSelected.clear();
  renderTransfersPage();
  renderDashboard();
  renderTx();
  toast('🔗 Transfer pair linked and tagged as Transfers category');
}

// ── Main render ───────────────────────────────────────────────
function setTransferSubcat(trId, subcat) {
  var tr = TRANSFERS.find(function(t) { return t.id === trId; });
  if (!tr) return;
  tr.subcat = subcat;
  // Also update the tagged transactions if already confirmed
  if (tr.status === 'confirmed') {
    tagTxAsTransfer(tr.txIdA, subcat);
    tagTxAsTransfer(tr.txIdB, subcat);
    save(K.tx, TX);
  }
  try { save(K.transfers, TRANSFERS); } catch(e) {}
}

function renderTransfersPage() {
  buildManualMonthFilter();
  renderManualLinkList();

  // Summary strip
  const confirmed = TRANSFERS.filter(t => t.status === 'confirmed');
  const pending   = TRANSFERS.filter(t => t.status === 'pending');
  const totalExcl = confirmed.reduce((s, t) => s + t.amount, 0);
  const sumEl = document.getElementById('tr-summary');
  if (sumEl) {
    sumEl.innerHTML = ''
      + '<div class="stat stat-dark"><div class="sl">Confirmed Transfers</div><div class="sv">' + confirmed.length + '</div><div class="ss">excluded from analysis</div></div>'
      + '<div class="stat stat-purple"><div class="sl">Total Excluded</div><div class="sv">' + fmt(totalExcl) + '</div><div class="ss">across all confirmed pairs</div></div>'
      + '<div class="stat ' + (pending.length ? 'stat-rose' : 'stat-dark') + '"><div class="sl">Pending Review</div><div class="sv">' + pending.length + '</div><div class="ss">' + (pending.length ? 'Needs your review' : 'All reviewed') + '</div></div>';
  }

  // Auto-detected (pending)
  const autoEl = document.getElementById('tr-auto-list');
  if (autoEl) {
    const autoPending = TRANSFERS.filter(t => t.auto && t.status === 'pending');
    autoEl.innerHTML = autoPending.length
      ? autoPending.map(tr => buildTransferCard(tr, true)).join('')
      : '<div class="empty"><div class="ei">✅</div><p>No pending pairs — all reviewed.</p></div>';
  }

  // Confirmed (all confirmed regardless of auto/manual)
  const confEl = document.getElementById('tr-confirmed-list');
  if (confEl) {
    const conf = TRANSFERS.filter(t => t.status === 'confirmed');
    confEl.innerHTML = conf.length
      ? conf.map(tr => buildTransferCard(tr, false)).join('')
      : '<div class="empty"><div class="ei">🔄</div><p>No confirmed transfers yet. Confirm auto-detected pairs above or link manually below.</p></div>';
  }
}

function buildTransferCard(tr, isPending) {
  const txA = TX.find(t => t.id === tr.txIdA);
  const txB = TX.find(t => t.id === tr.txIdB);
  if (!txA || !txB) return '';

  const fromTx = txA.type === 'expense' ? txA : txB;
  const toTx   = txA.type === 'income'  ? txA : txB;
  const dateStr = new Date(tr.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const diffDay = trDateDiff(txA.date, txB.date);
  const badge   = tr.auto ? '<span class="transfer-badge-auto">Auto-detected</span>' : '<span class="transfer-badge-manual">Manual</span>';

  return '<div class="transfer-pair ' + (tr.auto ? 'auto' : 'manual') + '">'
    + '<div class="transfer-flow">'
    + '<span class="transfer-acct">' + (fromTx.description || fromTx.category || 'Transaction') + '</span>'
    + '<span class="transfer-arrow">→</span>'
    + '<span class="transfer-acct">' + (toTx.description || toTx.category || 'Transaction') + '</span>'
    + '</div>'
    + '<div class="transfer-amt">' + fmt(tr.amount) + '</div>'
    + '<div class="transfer-date">' + dateStr + (diffDay === 1 ? ' (1 day apart)' : '') + '</div>'
    + badge
    + '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:auto">'
    + (isPending ? '<button class="btn btn-primary btn-sm" onclick="confirmTransfer(\'' + tr.id + '\')">✅ Confirm</button>' : '')
    + (isPending ? '<button class="btn btn-ghost btn-sm" onclick="dismissTransfer(\'' + tr.id + '\')">✕ Dismiss</button>' : '')
    + (!isPending ? '<button class="btn btn-danger btn-sm" onclick="unlinkTransfer(\'' + tr.id + '\')">↩ Unlink</button>' : '')
    + '</div>'
    + '</div>';
}

// ── Dashboard stat ────────────────────────────────────────────
function dbRenderTransferStat() {
  const el = document.getElementById('db-transfer-stat');
  if (!el) return;
  const pfx = dbPeriodStr();
  const conf = TRANSFERS.filter(t => t.status === 'confirmed');
  const thisMonth = conf.filter(tr => {
    const txA = TX.find(t => t.id === tr.txIdA);
    return txA && txA.date.startsWith(pfx);
  });
  if (!conf.length) { el.innerHTML = ''; return; }
  const total = thisMonth.reduce((s, t) => s + t.amount, 0);
  el.innerHTML = '<div class="dash-transfer-stat">'
    + '🔄 <strong>' + thisMonth.length + ' internal transfer' + (thisMonth.length !== 1 ? 's' : '') + '</strong>'
    + ' excluded this period'
    + (total > 0 ? ' — <strong>' + fmt(total) + '</strong> total' : '')
    + ' &nbsp;<a href="#" onclick="go(\'transfers\');return false;" style="color:#74b9ff;font-size:.76rem">View transfers →</a>'
    + '</div>';
}


// ══════════════════════════════════════════════════════════════
