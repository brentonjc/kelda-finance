// ══════════════════════════════════════════════════════════════
// TRANSFERS & RECONCILIATION v2
// ══════════════════════════════════════════════════════════════

// ── Helpers ──────────────────────────────────────────────────
function trDateDiff(a, b) {
  return Math.abs((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);
}

function trAmtMatch(a, b) {
  return Math.abs(Number(a.amount) - Number(b.amount)) < 0.01;
}

function trAlreadyLinked(idA, idB) {
  return TRANSFERS.some(function(tr) {
    return (tr.txIdA === idA && tr.txIdB === idB) ||
           (tr.txIdA === idB && tr.txIdB === idA) ||
           (tr.debitTxId === idA && tr.creditTxId === idB) ||
           (tr.debitTxId === idB && tr.creditTxId === idA);
  });
}

function tagTxAsTransfer(txId, subcat) {
  var t = TX.find(function(x) { return x.id === txId; });
  if (!t) return;
  t.catId    = 'transfers';
  t.category = 'Transfers';
  t.subcat   = subcat || 'Between Accounts';
  try { save(K.tx, TX); } catch(e) {}
}

function trGetAccountName(acctId) {
  if (!acctId) return '';
  var acct = ACCOUNTS.find(function(a) { return a.id === acctId; });
  return acct ? acct.name : acctId;
}

function trFmtDate(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' });
}

function trFmtDateFull(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function trFmtTimestamp(iso) {
  if (!iso) return 'Never';
  var d = new Date(iso);
  var today = new Date();
  var isToday = d.toDateString() === today.toDateString();
  var time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (isToday) return 'Today ' + time;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ' ' + time;
}

// ── Transfer pair ID lookup ───────────────────────────────────
function trIsConfirmedTx(txId) {
  return TRANSFERS.some(function(p) {
    return p.debitTxId === txId || p.creditTxId === txId ||
           p.txIdA === txId || p.txIdB === txId;
  });
}

function trIsPendingTx(txId) {
  return TRANSFERS_PENDING.some(function(p) {
    return p.debitTxId === txId || p.creditTxId === txId;
  });
}

// Transfer keywords for detection
var TRANSFER_KEYWORDS = [
  'transfer', 'internal', 'linked account', 'own transfer', 'between accounts',
  'sweep', 'from linked', 'to linked', 'internet transfer', 'funds transfer',
  'from offset', 'to offset', 'from savings', 'to savings'
];

// ── Detection Engine ──────────────────────────────────────────
function detectTransfers(txArray, options) {
  var opts = options || {};
  var rerunAll = !!opts.rerunAll;

  var AUTO_CONFIRM_THRESHOLD = parseFloat(load('kf_transfer_threshold') || '0.80');
  var DATE_WINDOW_DAYS = 3;
  var rules = load('kf_transfer_rules') || { exactAmount: true, recurring: true, keyword: true, frequency: true };

  var result = { confirmed: [], pending: [], newPairs: 0, updatedPairs: 0, removedPairs: 0 };

  // Build existing confirmed pairs map to avoid duplicates
  var existingPairKeys = {};
  TRANSFERS.forEach(function(p) {
    var key = (p.debitTxId || p.txIdA || '') + ':' + (p.creditTxId || p.txIdB || '');
    existingPairKeys[key] = true;
  });

  // Existing pending pair keys for dedup
  var existingPendingKeys = {};
  TRANSFERS_PENDING.forEach(function(p) {
    existingPendingKeys[p.debitTxId + ':' + p.creditTxId] = true;
  });

  // Separate debits and credits for pairing
  var debits = txArray.filter(function(t) {
    return t.type === 'expense' && !trIsConfirmedTx(t.id) && Number(t.amount) >= 1;
  });
  var credits = txArray.filter(function(t) {
    return t.type === 'income' && !trIsConfirmedTx(t.id) && Number(t.amount) >= 1;
  });

  var matched = {};

  for (var i = 0; i < debits.length; i++) {
    var debit = debits[i];
    if (matched[debit.id]) continue;

    for (var j = 0; j < credits.length; j++) {
      var credit = credits[j];
      if (matched[credit.id]) continue;
      if (credit.id === debit.id) continue;

      var dateDiff = trDateDiff(debit.date, credit.date);
      if (dateDiff > DATE_WINDOW_DAYS) continue;
      if (Math.abs(Number(debit.amount) - Number(credit.amount)) >= 0.01) continue;

      var pairKey = debit.id + ':' + credit.id;
      var reversePairKey = credit.id + ':' + debit.id;
      if (existingPairKeys[pairKey] || existingPairKeys[reversePairKey]) continue;

      var score = 0;
      var reasons = [];

      // Rule 1 — Exact amount match (0.50)
      if (rules.exactAmount !== false) {
        score += 0.50;
        reasons.push('amount_match');
      }

      // Rule 2 — Keyword match (0.25)
      if (rules.keyword !== false) {
        var debitDesc = (debit.name || debit.description || '').toLowerCase();
        var creditDesc = (credit.name || credit.description || '').toLowerCase();
        var kwHit = false;
        for (var k = 0; k < TRANSFER_KEYWORDS.length; k++) {
          if (debitDesc.indexOf(TRANSFER_KEYWORDS[k]) >= 0 ||
              creditDesc.indexOf(TRANSFER_KEYWORDS[k]) >= 0) {
            kwHit = true; break;
          }
        }
        if (kwHit) { score += 0.25; reasons.push('keyword_match'); }
      }

      // Rule 3 — Recurring pattern (0.20)
      if (rules.recurring !== false) {
        var sameAmtCount = TRANSFERS.filter(function(p) {
          return Math.abs(p.amount - Number(debit.amount)) < 0.01;
        }).length;
        if (sameAmtCount >= 2) { score += 0.20; reasons.push('recurring_strong'); }
        else if (sameAmtCount === 1) { score += 0.10; reasons.push('recurring_weak'); }
      }

      // Rule 4 — Cross-account bonus (0.05)
      if (rules.frequency !== false) {
        var debitAcct = debit.account || debit.acctId || '';
        var creditAcct = credit.account || credit.acctId || '';
        if (debitAcct && creditAcct && debitAcct !== creditAcct) {
          score += 0.05; reasons.push('cross_account');
        }
      }

      if (score > 1.0) score = 1.0;

      if (score < 0.40) continue;

      matched[debit.id] = true;
      matched[credit.id] = true;

      var pair = {
        id: 'tr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        debitTxId: debit.id,
        creditTxId: credit.id,
        amount: Number(debit.amount),
        date: debit.date,
        confidence: Math.round(score * 100) / 100,
        confidenceReasons: reasons
      };

      if (score >= AUTO_CONFIRM_THRESHOLD) {
        pair.source = 'auto';
        pair.confirmedAt = new Date().toISOString();
        pair.notes = '';
        result.confirmed.push(pair);
        existingPairKeys[pairKey] = true;
        result.newPairs++;
      } else {
        // Dedup against existing pending
        var pendingKey = debit.id + ':' + credit.id;
        if (!existingPendingKeys[pendingKey]) {
          result.pending.push(pair);
          existingPendingKeys[pendingKey] = true;
        }
      }
      break;
    }
  }

  return result;
}

// ── runDetection ──────────────────────────────────────────────
var _trUndoTimer = null;

function runDetection(rerunAll) {
  var btn = document.getElementById('tr-rerun-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Running…'; }

  setTimeout(function() {
    try {
      var result = detectTransfers(TX, { rerunAll: !!rerunAll });

      if (rerunAll) {
        // Show preview banner if destructive
        if (result.updatedPairs > 0 || result.removedPairs > 0) {
          var bannerEl = document.getElementById('tr-rerun-preview');
          if (bannerEl) {
            bannerEl.style.display = 'block';
            var msgEl = document.getElementById('tr-rerun-preview-msg');
            if (msgEl) msgEl.textContent = 'Re-run will update ' + result.updatedPairs
              + ' pairs and remove ' + result.removedPairs + ' confirmed pairs. Proceed?';
            var proceedBtn = document.getElementById('tr-rerun-proceed');
            if (proceedBtn) {
              proceedBtn.onclick = function() {
                bannerEl.style.display = 'none';
                _applyDetectionResults(result, true);
              };
            }
            var cancelBtn = document.getElementById('tr-rerun-cancel');
            if (cancelBtn) {
              cancelBtn.onclick = function() {
                bannerEl.style.display = 'none';
                if (btn) { btn.disabled = false; btn.textContent = '↻ Re-run detection'; }
              };
            }
            return;
          }
        }
        _applyDetectionResults(result, true);
      } else {
        _applyDetectionResults(result, false);
      }
    } catch(e) {
      console.warn('runDetection error', e);
      if (btn) { btn.disabled = false; btn.textContent = '↻ Re-run detection'; }
    }
  }, 10);
}

function _applyDetectionResults(result, fullReplace) {
  var btn = document.getElementById('tr-rerun-btn');
  try {
    if (fullReplace) {
      TRANSFERS = TRANSFERS.concat(result.confirmed.filter(function(p) {
        return !TRANSFERS.some(function(e) {
          return (e.debitTxId === p.debitTxId && e.creditTxId === p.creditTxId) ||
                 (e.txIdA === p.debitTxId && e.txIdB === p.creditTxId);
        });
      }));
      TRANSFERS_PENDING = result.pending;
    } else {
      // Merge new confirmed pairs (no duplicates)
      result.confirmed.forEach(function(p) {
        var exists = TRANSFERS.some(function(e) {
          return (e.debitTxId === p.debitTxId && e.creditTxId === p.creditTxId) ||
                 (e.txIdA === p.debitTxId && e.txIdB === p.creditTxId);
        });
        if (!exists) TRANSFERS.push(p);
      });
      // Merge new pending (dedup)
      result.pending.forEach(function(s) {
        var exists = TRANSFERS_PENDING.some(function(p) {
          return p.debitTxId === s.debitTxId && p.creditTxId === s.creditTxId;
        });
        if (!exists) TRANSFERS_PENDING.push(s);
      });
    }
    try { save(K.transfers, TRANSFERS); } catch(e) {}
    try { save(K.transfersPending, TRANSFERS_PENDING); } catch(e) {}
    try { localStorage.setItem('kf_transfer_lastrun', new Date().toISOString()); } catch(e) {}
    renderTransfers();
    toast('Detection complete — ' + result.newPairs + ' new, ' + result.updatedPairs + ' updated');
  } catch(e) {
    console.warn('_applyDetectionResults error', e);
  }
  if (btn) { btn.disabled = false; btn.textContent = '↻ Re-run detection'; }
}

// ── Manual link ───────────────────────────────────────────────
var _trManualSel = [];
var _trManualPreFilter = null;

function trOpenManualModal(preFilter) {
  _trManualSel = [];
  _trManualPreFilter = preFilter || null;
  var overlay = document.getElementById('tr-link-modal');
  if (!overlay) return;
  overlay.style.display = 'flex';
  overlay.setAttribute('aria-hidden', 'false');
  var heading = document.getElementById('tr-modal-title');
  if (heading) heading.focus();
  trRenderModalList();
}

function trCloseManualModal() {
  var overlay = document.getElementById('tr-link-modal');
  if (overlay) { overlay.style.display = 'none'; overlay.setAttribute('aria-hidden', 'true'); }
  _trManualSel = [];
  _trManualPreFilter = null;
  var triggerBtn = document.getElementById('tr-manual-link-btn');
  if (triggerBtn) triggerBtn.focus();
}

function trRenderModalList() {
  var search = '';
  var searchEl = document.getElementById('tr-modal-search');
  if (searchEl) search = searchEl.value.toLowerCase();
  var month = '';
  var monthEl = document.getElementById('tr-modal-month');
  if (monthEl) month = monthEl.value;

  var pf = _trManualPreFilter;
  var pool = TX.filter(function(t) {
    if (trIsConfirmedTx(t.id)) return false;
    if (month && !t.date.startsWith(month)) return false;
    var desc = (t.name || t.description || '').toLowerCase();
    if (search && desc.indexOf(search) < 0) return false;
    // If preFilter: show only opposite type
    if (pf) {
      var pfTx = TX.find(function(x) { return x.id === pf; });
      if (pfTx) {
        if (pfTx.type === 'expense' && t.type !== 'income') return false;
        if (pfTx.type === 'income' && t.type !== 'expense') return false;
        // Date range ±7 days
        if (trDateDiff(t.date, pfTx.date) > 7) return false;
      }
    }
    return true;
  }).sort(function(a, b) { return b.date.localeCompare(a.date); }).slice(0, 80);

  var listEl = document.getElementById('tr-modal-list');
  if (!listEl) return;

  if (!pool.length) {
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:#7A8FBC;font-size:.8rem">No transactions match.</div>';
  } else {
    var html = '';
    pool.forEach(function(t) {
      var isSel = _trManualSel.indexOf(t.id) >= 0;
      var selIdx = _trManualSel.indexOf(t.id);
      var color = t.type === 'income' ? 'var(--success)' : 'var(--primary)';
      var sign = t.type === 'income' ? '+' : '-';
      html += '<div role="option" aria-selected="' + isSel + '" tabindex="0"'
        + ' style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;cursor:pointer;min-height:44px;border:1.5px solid ' + (isSel ? 'var(--primary)' : 'transparent') + ';background:' + (isSel ? 'rgba(240,83,138,.06)' : 'transparent') + ';margin-bottom:3px"'
        + ' onclick="trModalToggleSel(' + JSON.stringify(t.id) + ')"'
        + ' onkeydown="if(event.key===\'Enter\'||event.key==\' \'){trModalToggleSel(' + JSON.stringify(t.id) + ');event.preventDefault();}">'
        + '<div style="flex:0 0 65px;font-size:.73rem;color:#7A8FBC">' + trFmtDate(t.date) + '</div>'
        + '<div style="flex:1;min-width:0;font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.name || t.description || '—') + '</div>'
        + '<div style="font-size:.75rem;color:#7A8FBC;flex-shrink:0;margin-right:4px">' + esc(t.catId === 'transfers' ? 'Transfer' : (t.category || '')) + '</div>'
        + '<div style="font-weight:700;color:' + color + ';flex-shrink:0;font-family:var(--font-mono);font-size:.82rem">' + sign + fmt(t.amount) + '</div>'
        + '</div>';
    });
    listEl.innerHTML = html;
  }

  _trUpdateModalStatus();
}

function trModalToggleSel(id) {
  var idx = _trManualSel.indexOf(id);
  if (idx >= 0) {
    _trManualSel.splice(idx, 1);
  } else if (_trManualSel.length < 2) {
    _trManualSel.push(id);
  } else {
    toast('Already have 2 selected — uncheck one first');
    return;
  }
  trRenderModalList();
}

function _trUpdateModalStatus() {
  var statusEl = document.getElementById('tr-modal-status');
  var confirmBtn = document.getElementById('tr-modal-confirm');
  var msg = '';
  var canConfirm = false;

  if (_trManualSel.length === 0) {
    msg = 'Select one outgoing and one incoming transaction';
  } else if (_trManualSel.length === 1) {
    msg = '✓ Outgoing selected — now select an incoming transaction';
  } else {
    var t1 = TX.find(function(t) { return t.id === _trManualSel[0]; });
    var t2 = TX.find(function(t) { return t.id === _trManualSel[1]; });
    if (t1 && t2 && t1.type === t2.type) {
      msg = 'Both transactions are the same type — select one outgoing and one incoming';
    } else if (t1 && t2) {
      msg = '✓ Ready to link — ' + esc(t1.name || t1.description || '?') + ' → ' + esc(t2.name || t2.description || '?');
      canConfirm = true;
    }
  }

  if (statusEl) statusEl.textContent = msg;
  if (confirmBtn) {
    confirmBtn.disabled = !canConfirm;
    confirmBtn.setAttribute('aria-disabled', String(!canConfirm));
    confirmBtn.style.opacity = canConfirm ? '1' : '0.4';
  }
}

function trConfirmManualLink() {
  if (_trManualSel.length !== 2) return;
  var t1 = TX.find(function(t) { return t.id === _trManualSel[0]; });
  var t2 = TX.find(function(t) { return t.id === _trManualSel[1]; });
  if (!t1 || !t2) return;
  if (t1.type === t2.type) { toast('Select one outgoing and one incoming'); return; }

  var debitTx  = t1.type === 'expense' ? t1 : t2;
  var creditTx = t1.type === 'income'  ? t1 : t2;

  if (trAlreadyLinked(debitTx.id, creditTx.id)) { toast('Already linked'); return; }

  var pair = {
    id: 'tr_' + Date.now(),
    debitTxId: debitTx.id,
    creditTxId: creditTx.id,
    amount: Number(debitTx.amount),
    date: debitTx.date,
    source: 'manual',
    confidence: 1.0,
    confidenceReasons: ['manual'],
    confirmedAt: new Date().toISOString(),
    notes: ''
  };
  TRANSFERS.push(pair);
  try { save(K.transfers, TRANSFERS); } catch(e) {}
  tagTxAsTransfer(debitTx.id, 'Between Accounts');
  tagTxAsTransfer(creditTx.id, 'Between Accounts');
  trCloseManualModal();
  renderTransfers();
  toast('Transfer pair linked');
}

// ── Unlink a confirmed pair ───────────────────────────────────
function trUnlinkPair(pairId) {
  if (!TRANSFERS.some(function(p) { return p.id === pairId; })) return;

  // Re-find pair at confirm time (not at click time) to avoid stale-index bug
  // if another unlink fires during the 8s confirm window.
  var onConfirm = function() {
    var currentIdx = -1;
    for (var i = 0; i < TRANSFERS.length; i++) {
      if (TRANSFERS[i].id === pairId) { currentIdx = i; break; }
    }
    if (currentIdx < 0) return;
    var pair = TRANSFERS[currentIdx];
    var debitId  = pair.debitTxId  || pair.txIdA;
    var creditId = pair.creditTxId || pair.txIdB;
    [debitId, creditId].forEach(function(txId) {
      var tx = TX.find(function(x) { return x.id === txId; });
      if (tx && tx.catId === 'transfers') {
        tx.catId = 'other'; tx.category = 'Other'; tx.subcat = '';
        delete tx.transferUnlinked;
      }
    });
    try { save(K.tx, TX); } catch(e) {}
    TRANSFERS.splice(currentIdx, 1);
    try { save(K.transfers, TRANSFERS); } catch(e) {}
    renderTransfers();
    if (typeof renderDashboard === 'function') renderDashboard();
    toast('Transfer unlinked — transactions restored to analysis');
  };

  _trShowInlineConfirm('Unlink this pair?', onConfirm, null);
}

function _trShowInlineConfirm(msg, onConfirm, onCancel) {
  var existing = document.getElementById('tr-inline-confirm');
  if (existing) existing.remove();
  var el = document.createElement('div');
  el.id = 'tr-inline-confirm';
  el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);'
    + 'background:var(--card2);border:1px solid var(--border);border-radius:10px;'
    + 'padding:12px 16px;display:flex;align-items:center;gap:12px;'
    + 'font-size:.82rem;font-family:var(--font-body);color:var(--text);'
    + 'box-shadow:0 8px 32px rgba(0,0,0,.45);z-index:9998;white-space:nowrap;';
  var msgEl = document.createElement('span');
  msgEl.textContent = msg;
  var confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Confirm';
  confirmBtn.style.cssText = 'background:var(--danger);color:#fff;border:none;border-radius:999px;'
    + 'padding:6px 14px;font-size:.78rem;font-weight:600;cursor:pointer;min-height:32px;';
  var cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'background:var(--card3);color:var(--text);border:1px solid var(--border);border-radius:999px;'
    + 'padding:6px 14px;font-size:.78rem;font-weight:600;cursor:pointer;min-height:32px;';
  confirmBtn.onclick = function() { el.remove(); onConfirm(); };
  cancelBtn.onclick = function() { el.remove(); if (onCancel) onCancel(); };
  el.appendChild(msgEl);
  el.appendChild(confirmBtn);
  el.appendChild(cancelBtn);
  document.body.appendChild(el);
  setTimeout(function() { if (el.parentNode) el.remove(); }, 8000);
}

// ── Confirm a pending pair ────────────────────────────────────
function trConfirmPending(pendingId) {
  var pendingIdx = -1;
  for (var i = 0; i < TRANSFERS_PENDING.length; i++) {
    if (TRANSFERS_PENDING[i].id === pendingId) { pendingIdx = i; break; }
  }
  if (pendingIdx < 0) return;

  var suggestion = TRANSFERS_PENDING[pendingIdx];
  var undoSnap = { pending: JSON.parse(JSON.stringify(TRANSFERS_PENDING)) };

  var confirmed = {
    id: 'tr_' + Date.now(),
    debitTxId: suggestion.debitTxId,
    creditTxId: suggestion.creditTxId,
    amount: suggestion.amount,
    date: suggestion.date || '',
    source: 'manual',
    confidence: 1.0,
    confidenceReasons: ['manual'],
    confirmedAt: new Date().toISOString(),
    notes: ''
  };

  TRANSFERS.push(confirmed);
  TRANSFERS_PENDING.splice(pendingIdx, 1);
  try { save(K.transfers, TRANSFERS); } catch(e) {}
  try { save(K.transfersPending, TRANSFERS_PENDING); } catch(e) {}
  tagTxAsTransfer(confirmed.debitTxId, 'Between Accounts');
  tagTxAsTransfer(confirmed.creditTxId, 'Between Accounts');

  renderTransfers();
  if (typeof showUndoToast === 'function') {
    showUndoToast('Transfer pair confirmed', 5000, function() {
      TRANSFERS = TRANSFERS.filter(function(p) { return p.id !== confirmed.id; });
      TRANSFERS_PENDING = undoSnap.pending;
      try { save(K.transfers, TRANSFERS); } catch(e) {}
      try { save(K.transfersPending, TRANSFERS_PENDING); } catch(e) {}
      renderTransfers();
      toast('Confirm reversed');
    });
  }
}

// ── Reject a pending pair ─────────────────────────────────────
function trRejectPending(pendingId) {
  TRANSFERS_PENDING = TRANSFERS_PENDING.filter(function(p) { return p.id !== pendingId; });
  try { save(K.transfersPending, TRANSFERS_PENDING); } catch(e) {}
  renderTransfers();
}

// ── Bulk confirm all high-confidence pending ──────────────────
function trBulkConfirmHighConf() {
  var AUTO_CONFIRM_THRESHOLD = parseFloat(load('kf_transfer_threshold') || '0.80');
  var threshold = AUTO_CONFIRM_THRESHOLD - 0.05;
  var highConf = TRANSFERS_PENDING.filter(function(p) { return p.confidence >= threshold; });
  if (!highConf.length) return;

  var undoSnap = {
    transfers: JSON.parse(JSON.stringify(TRANSFERS)),
    pending:   JSON.parse(JSON.stringify(TRANSFERS_PENDING))
  };

  highConf.forEach(function(p) {
    TRANSFERS.push({
      id: 'tr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      debitTxId: p.debitTxId,
      creditTxId: p.creditTxId,
      amount: p.amount,
      date: p.date || '',
      source: 'auto',
      confidence: p.confidence,
      confidenceReasons: p.confidenceReasons || [],
      confirmedAt: new Date().toISOString(),
      notes: ''
    });
    tagTxAsTransfer(p.debitTxId, 'Between Accounts');
    tagTxAsTransfer(p.creditTxId, 'Between Accounts');
  });
  TRANSFERS_PENDING = TRANSFERS_PENDING.filter(function(p) { return p.confidence < threshold; });
  try { save(K.transfers, TRANSFERS); } catch(e) {}
  try { save(K.transfersPending, TRANSFERS_PENDING); } catch(e) {}

  renderTransfers();
  if (typeof showUndoToast === 'function') {
    showUndoToast('Confirmed ' + highConf.length + ' pairs', 8000, function() {
      TRANSFERS = undoSnap.transfers;
      TRANSFERS_PENDING = undoSnap.pending;
      try { save(K.transfers, TRANSFERS); } catch(e) {}
      try { save(K.transfersPending, TRANSFERS_PENDING); } catch(e) {}
      renderTransfers();
      toast('Bulk confirm reversed');
    });
  }
}

// ── Bulk selected pending actions ─────────────────────────────
var _trBulkSel = [];

function trBulkToggle(pendingId, checked) {
  var idx = _trBulkSel.indexOf(pendingId);
  if (checked && idx < 0) _trBulkSel.push(pendingId);
  else if (!checked && idx >= 0) _trBulkSel.splice(idx, 1);
  _trUpdateBulkBar();
}

function trBulkSelectAll(checked) {
  if (checked) {
    _trBulkSel = TRANSFERS_PENDING.map(function(p) { return p.id; });
  } else {
    _trBulkSel = [];
  }
  renderTransfers();
}

function trBulkConfirmSelected() {
  if (!_trBulkSel.length) return;
  var undoSnap = {
    transfers: JSON.parse(JSON.stringify(TRANSFERS)),
    pending:   JSON.parse(JSON.stringify(TRANSFERS_PENDING))
  };
  var n = _trBulkSel.length;
  _trBulkSel.forEach(function(pid) {
    var p = TRANSFERS_PENDING.find(function(x) { return x.id === pid; });
    if (!p) return;
    TRANSFERS.push({
      id: 'tr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      debitTxId: p.debitTxId, creditTxId: p.creditTxId,
      amount: p.amount, date: p.date || '',
      source: 'manual', confidence: 1.0, confidenceReasons: ['manual'],
      confirmedAt: new Date().toISOString(), notes: ''
    });
    tagTxAsTransfer(p.debitTxId, 'Between Accounts');
    tagTxAsTransfer(p.creditTxId, 'Between Accounts');
  });
  TRANSFERS_PENDING = TRANSFERS_PENDING.filter(function(p) { return _trBulkSel.indexOf(p.id) < 0; });
  _trBulkSel = [];
  try { save(K.transfers, TRANSFERS); } catch(e) {}
  try { save(K.transfersPending, TRANSFERS_PENDING); } catch(e) {}
  renderTransfers();
  if (typeof showUndoToast === 'function') {
    showUndoToast('Confirmed ' + n + ' pairs', 8000, function() {
      TRANSFERS = undoSnap.transfers;
      TRANSFERS_PENDING = undoSnap.pending;
      try { save(K.transfers, TRANSFERS); } catch(e) {}
      try { save(K.transfersPending, TRANSFERS_PENDING); } catch(e) {}
      renderTransfers();
      toast('Bulk confirm reversed');
    });
  }
}

function trBulkRejectSelected() {
  _trShowInlineConfirm('Reject ' + _trBulkSel.length + ' suggestions?', function() {
    TRANSFERS_PENDING = TRANSFERS_PENDING.filter(function(p) { return _trBulkSel.indexOf(p.id) < 0; });
    _trBulkSel = [];
    try { save(K.transfersPending, TRANSFERS_PENDING); } catch(e) {}
    renderTransfers();
  }, null);
}

function _trUpdateBulkBar() {
  var bar = document.getElementById('tr-bulk-bar');
  if (!bar) return;
  var n = _trBulkSel.length;
  bar.style.display = n > 0 ? 'flex' : 'none';
  var countEl = document.getElementById('tr-bulk-count');
  if (countEl) countEl.textContent = n + ' selected';
  var confBtn = document.getElementById('tr-bulk-confirm-sel');
  if (confBtn) confBtn.textContent = 'Confirm selected (' + n + ')';
  var rejBtn = document.getElementById('tr-bulk-reject-sel');
  if (rejBtn) rejBtn.textContent = 'Reject selected (' + n + ')';
}

// ── CSV Export ────────────────────────────────────────────────
function trExportCSV() {
  var rows = ['Date,From Account,From Description,To Account,To Description,Amount,Source,Confidence,Confirmed At'];
  TRANSFERS.forEach(function(p) {
    var debitId  = p.debitTxId  || p.txIdA  || '';
    var creditId = p.creditTxId || p.txIdB  || '';
    var debitTx  = TX.find(function(t) { return t.id === debitId;  });
    var creditTx = TX.find(function(t) { return t.id === creditId; });
    var fromAcct = debitTx  ? (debitTx.account  || debitTx.acctId  || '') : '';
    var toAcct   = creditTx ? (creditTx.account || creditTx.acctId || '') : '';
    var fromDesc = debitTx  ? (debitTx.name  || debitTx.description  || '') : '';
    var toDesc   = creditTx ? (creditTx.name || creditTx.description || '') : '';
    rows.push([
      p.date || '',
      '"' + fromAcct.replace(/"/g, '""') + '"',
      '"' + fromDesc.replace(/"/g, '""') + '"',
      '"' + toAcct.replace(/"/g, '""') + '"',
      '"' + toDesc.replace(/"/g, '""') + '"',
      p.amount || 0,
      p.source || '',
      ((p.confidence || 0) * 100).toFixed(0) + '%',
      p.confirmedAt || ''
    ].join(','));
  });
  var csv = rows.join('\n');
  var a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'transfers-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
}

// ── State for tabs/pagination ─────────────────────────────────
var _trActiveTab   = 'confirmed';
var _trPage        = { confirmed: 1, pending: 1, unmatched: 1 };
var _trAcctFilter  = 'all';
var _trMonthFilter = 'all';
var _trAutoFilter  = false;
var _trPeriod      = 'all';

// ── Main render ───────────────────────────────────────────────
function renderTransfers() {
  // Clear any active undo timer for this page
  if (_trUndoTimer) { clearTimeout(_trUndoTimer); _trUndoTimer = null; }

  try { _trPeriod = localStorage.getItem('kf_transfers_period') || '6m'; } catch(e) { _trPeriod = '6m'; }

  var el = document.getElementById('page-transfers');
  if (!el) return;

  var AUTO_CONFIRM_THRESHOLD = parseFloat(load('kf_transfer_threshold') || '0.80');
  var rules = load('kf_transfer_rules') || { exactAmount: true, recurring: true, keyword: true, frequency: true };
  var lastRun = '';
  try { lastRun = localStorage.getItem('kf_transfer_lastrun') || ''; } catch(e) {}

  // KPI stats
  var totalTx  = TX.length;
  var excluded = TRANSFERS.length * 2;
  var included = totalTx - excluded;
  var totalExcluded = TRANSFERS.reduce(function(s, p) { return s + (p.amount || 0); }, 0);
  var pendingCount = TRANSFERS_PENDING.length;

  // Unmatched transactions: catId=transfers but no confirmed pair
  var unmatchedTx = TX.filter(function(t) {
    return (t.catId === 'transfers' && !trIsConfirmedTx(t.id)) || t.transferUnlinked;
  });

  // Chart data
  var chartHtml = _trBuildChartCard();

  // KPI row
  var kpiHtml = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">'
    + _trKpiTile('Total transactions', totalTx, '', 'color:#7A8FBC')
    + _trKpiTile('Included in analysis', included, '', 'color:var(--success)')
    + _trKpiTile('Excluded (transfers)', excluded, TRANSFERS.length + ' pairs · ' + fmt(totalExcluded), 'color:var(--primary)')
    + _trKpiTile('Pending review', pendingCount, pendingCount > 0 ? 'Needs your review' : 'All reviewed',
        pendingCount > 0 ? 'color:var(--warn)' : 'color:#7A8FBC')
    + '</div>';

  // Detection config card
  var activeRules = Object.values(rules).filter(Boolean).length;
  var configHtml = _trBuildConfigCard(rules, AUTO_CONFIRM_THRESHOLD, lastRun, activeRules);

  // Re-run preview banner (hidden by default)
  var previewBannerHtml = '<div id="tr-rerun-preview" style="display:none;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:10px;padding:12px 16px;margin-bottom:14px;display:none;align-items:center;gap:12px;flex-wrap:wrap">'
    + '<span id="tr-rerun-preview-msg" style="flex:1;font-size:.82rem;color:var(--warn)"></span>'
    + '<button id="tr-rerun-proceed" style="background:var(--warn);color:#111;border:none;border-radius:999px;padding:8px 16px;font-size:.78rem;font-weight:700;cursor:pointer;min-height:44px">Proceed</button>'
    + '<button id="tr-rerun-cancel" style="background:transparent;border:1px solid var(--border);color:#7A8FBC;border-radius:999px;padding:8px 16px;font-size:.78rem;cursor:pointer;min-height:44px">Cancel</button>'
    + '</div>';

  // Tab panel
  var confirmedBadge = TRANSFERS.length;
  var pendingBadge   = pendingCount;
  var unmatchedBadge = unmatchedTx.length;

  var tabsHtml = '<div role="tablist" aria-label="Transfer categories" style="display:flex;border-bottom:1px solid var(--border);margin-bottom:16px;gap:0;overflow-x:auto;scrollbar-width:none">'
    + _trTabBtn('confirmed', 'Confirmed', confirmedBadge, 'rgba(0,200,150,.15)', 'var(--success)')
    + _trTabBtn('pending',   'Pending review', pendingBadge, 'rgba(245,158,11,.15)', 'var(--warn)', true)
    + _trTabBtn('unmatched', 'Unmatched', unmatchedBadge, 'rgba(239,68,68,.15)', 'var(--danger)')
    + '</div>'
    + '<div id="tr-tab-confirmed" role="tabpanel" aria-labelledby="tr-tab-btn-confirmed" tabindex="0"' + (_trActiveTab === 'confirmed' ? '' : ' hidden') + '>'
    + _trBuildConfirmedTab() + '</div>'
    + '<div id="tr-tab-pending" role="tabpanel" aria-labelledby="tr-tab-btn-pending" tabindex="0"' + (_trActiveTab === 'pending' ? '' : ' hidden') + ' aria-live="polite">'
    + _trBuildPendingTab() + '</div>'
    + '<div id="tr-tab-unmatched" role="tabpanel" aria-labelledby="tr-tab-btn-unmatched" tabindex="0"' + (_trActiveTab === 'unmatched' ? '' : ' hidden') + ' aria-live="polite">'
    + _trBuildUnmatchedTab(unmatchedTx) + '</div>';

  // Manual link modal
  var modalHtml = _trBuildModal();

  // Styles
  var styles = '<style>'
    + '.tr-tab-btn{background:none;border:none;border-bottom:2px solid transparent;padding:10px 16px;font-size:.82rem;font-weight:600;cursor:pointer;color:#7A8FBC;min-height:44px;font-family:var(--font-body);white-space:nowrap}'
    + '.tr-tab-btn.active{color:var(--primary);border-bottom-color:var(--primary)}'
    + '.tr-tab-btn:focus{outline:none;box-shadow:0 0 0 3px rgba(240,83,138,.4)}'
    + '.tr-btn{border:none;border-radius:6px;cursor:pointer;font-family:var(--font-body);font-weight:600}'
    + '.tr-btn:focus{outline:none;box-shadow:0 0 0 3px rgba(240,83,138,.4)}'
    + '.help-tip{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:var(--card3);border:1px solid var(--border);color:#7A8FBC;font-size:.6rem;font-weight:700;cursor:help;margin-left:4px;vertical-align:middle;font-family:var(--font-body)}'
    + '.help-tip:hover,.help-tip:focus{background:var(--card2);border-color:var(--primary);color:var(--primary);outline:none;box-shadow:0 0 0 3px rgba(240,83,138,.3)}'
    + '@keyframes kf-pulse{0%,100%{opacity:1}50%{opacity:.25}}'
    + '.kf-pulse-dot{width:6px;height:6px;border-radius:50%;background:var(--warn);animation:kf-pulse 2s ease-in-out infinite;display:inline-block;margin-left:4px;vertical-align:middle}'
    + '.tr-toggle-wrap{display:flex;align-items:center;justify-content:flex-end;min-height:44px;min-width:44px;cursor:pointer}'
    + '.tr-toggle-pill{width:32px;height:18px;border-radius:9999px;transition:background .2s;position:relative;flex-shrink:0}'
    + '.tr-toggle-thumb{position:absolute;top:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:left .2s}'
    + '@media(max-width:759px){.tr-kpi-grid{grid-template-columns:repeat(2,1fr)!important}.tr-header-row{flex-wrap:wrap!important}}'
    + '</style>';

  el.innerHTML = styles + previewBannerHtml
    + '<div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px" class="tr-header-row">'
    + '<div><div class="page-title" style="margin-bottom:2px">Transfers</div>'
    + '<div style="font-size:.76rem;color:#7A8FBC">Internal movements excluded from income and expense analysis</div></div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
    + '<button id="tr-rerun-btn" onclick="runDetection(true)" style="background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.3);color:var(--warn);border-radius:999px;padding:9px 16px;min-height:44px;font-size:.78rem;font-weight:600;cursor:pointer;font-family:var(--font-body)">↻ Re-run detection</button>'
    + '<button onclick="trExportCSV()" style="background:transparent;border:1px solid var(--border);color:#7A8FBC;border-radius:999px;padding:9px 16px;min-height:44px;font-size:.78rem;font-weight:600;cursor:pointer;font-family:var(--font-body)">⬇ Export</button>'
    + '<button id="tr-manual-link-btn" onclick="trOpenManualModal(null)" style="background:var(--primary);color:#fff;border:none;border-radius:999px;padding:9px 16px;min-height:44px;font-size:.78rem;font-weight:700;cursor:pointer;font-family:var(--font-body)">＋ Link manually</button>'
    + '</div></div>'
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px" class="tr-kpi-grid">'
    + _trKpiTile('Total transactions', totalTx, '', 'color:#7A8FBC')
    + _trKpiTile('Included in analysis', included, '', 'color:var(--success)')
    + _trKpiTile('Excluded (transfers)', excluded, TRANSFERS.length + ' pairs · ' + fmt(totalExcluded), 'color:var(--primary)')
    + _trKpiTile('Pending review', pendingCount, pendingCount > 0 ? 'Needs your review' : 'All reviewed',
        pendingCount > 0 ? 'color:var(--warn)' : 'color:#7A8FBC')
    + '</div>'
    + chartHtml
    + configHtml
    + '<div class="card">'
    + tabsHtml
    + '</div>'
    + modalHtml;

  // Wire up tab keyboard nav
  _trWireTabNav();
  // Wire detection config toggles
  _trWireConfigToggles();
  // Init bulk bar
  _trUpdateBulkBar();
}

function _trKpiTile(label, value, sub, valueStyle) {
  return '<div style="background:var(--card);border-radius:14px;border:1px solid var(--border);padding:14px 16px">'
    + '<div style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#7A8FBC;margin-bottom:6px">' + esc(label) + '</div>'
    + '<div style="font-size:1.4rem;font-weight:700;font-family:var(--font-mono);' + valueStyle + '">' + value + '</div>'
    + (sub ? '<div style="font-size:.68rem;color:#7A8FBC;margin-top:2px;font-family:var(--font-mono)">' + esc(sub) + '</div>' : '')
    + '</div>';
}

function _trTabBtn(id, label, count, badgeBg, badgeColor, pulse) {
  var isActive = _trActiveTab === id;
  var badgeHtml = '<span aria-live="polite" aria-atomic="true" style="display:inline-block;background:' + badgeBg + ';color:' + badgeColor + ';border-radius:999px;padding:1px 7px;font-size:.65rem;font-weight:700;margin-left:5px">' + count + '</span>'
    + (pulse && count > 0 ? '<span class="kf-pulse-dot"></span>' : '');
  return '<button id="tr-tab-btn-' + id + '" role="tab" class="tr-tab-btn' + (isActive ? ' active' : '') + '"'
    + ' aria-selected="' + isActive + '" aria-controls="tr-tab-' + id + '"'
    + ' onclick="_trSwitchTab(\'' + id + '\')">'
    + esc(label) + badgeHtml + '</button>';
}

function _trSwitchTab(id) {
  _trActiveTab = id;
  _trPage = { confirmed: 1, pending: 1, unmatched: 1 };
  _trBulkSel = [];
  renderTransfers();
}

function _trWireTabNav() {
  var tabBtns = document.querySelectorAll('[role="tab"]');
  tabBtns.forEach(function(btn, i) {
    btn.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowRight') { tabBtns[(i + 1) % tabBtns.length].focus(); }
      else if (e.key === 'ArrowLeft') { tabBtns[(i - 1 + tabBtns.length) % tabBtns.length].focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { btn.click(); e.preventDefault(); }
    });
  });
}

// ── Chart card ────────────────────────────────────────────────
function _trBuildChartCard() {
  var months = _trGetMonthLabels();
  var outliers = _trGetOutliers(months);
  var outlierHtml = '';
  if (outliers.length > 0) {
    outliers.slice(0, 3).forEach(function(o) {
      outlierHtml += '<div style="margin-bottom:8px;padding:8px 10px;background:rgba(245,158,11,.06);border-radius:8px;border:1px solid rgba(245,158,11,.15)">'
        + '<div style="font-size:.72rem;color:var(--warn);font-weight:600">' + ICON('alert-triangle') + ' ' + esc(o.label) + ': ' + fmt(o.gap) + ' gap</div>'
        + '<div style="font-size:.65rem;color:#7A8FBC;margin-top:2px">' + o.count + ' unmatched transaction' + (o.count !== 1 ? 's' : '') + '</div>'
        + '</div>';
    });
  } else {
    outlierHtml = '<div style="padding:8px 10px;background:rgba(0,200,150,.06);border-radius:8px;border:1px solid rgba(0,200,150,.15)">'
      + '<div style="font-size:.72rem;color:var(--success);font-weight:600">' + ICON('check') + ' All months balanced</div>'
      + '</div>';
  }

  var periodBtns = [['6m', '6 months'], ['12m', '12 months'], ['all', 'All time']];
  var periodToggle = '<div style="display:flex;gap:4px">';
  periodBtns.forEach(function(pb) {
    var active = _trPeriod === pb[0];
    periodToggle += '<button onclick="_trSetPeriod(\'' + pb[0] + '\')" style="background:' + (active ? 'rgba(240,83,138,.15)' : 'transparent') + ';color:' + (active ? 'var(--primary)' : '#7A8FBC') + ';border:1px solid ' + (active ? 'rgba(240,83,138,.3)' : 'var(--border)') + ';border-radius:999px;padding:5px 12px;font-size:.7rem;cursor:pointer;min-height:32px;font-family:var(--font-body)">' + esc(pb[1]) + '</button>';
  });
  periodToggle += '</div>';

  return '<div class="card" style="margin-bottom:16px">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">'
    + '<div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#7A8FBC">Transfer reconciliation</div>'
    + periodToggle
    + '</div>'
    + '<div style="display:flex;gap:16px;flex-wrap:wrap">'
    + '<div style="flex:1;min-width:0"><div style="position:relative;height:180px"><canvas id="chart-transfers-recon" role="img" aria-label="Bar chart showing money sent, money received, and unmatched transfers by month">Money sent, received, and unmatched transfers by month.</canvas></div>'
    + '<div style="display:flex;gap:16px;margin-top:8px">'
    + '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(239,68,68,0.65);margin-right:5px"></span><span style="font-size:.7rem;color:#7A8FBC">Money sent</span></span>'
    + '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(0,200,150,0.65);margin-right:5px"></span><span style="font-size:.7rem;color:#7A8FBC">Money received</span></span>'
    + '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgba(245,158,11,0.75);margin-right:5px"></span><span style="font-size:.7rem;color:#7A8FBC">Unmatched</span></span>'
    + '</div></div>'
    + '<div style="width:210px;flex-shrink:0">'
    + '<div style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#7A8FBC;margin-bottom:8px">Outliers</div>'
    + outlierHtml
    + '<div id="tr-acct-flow-toggle" style="margin-top:12px">'
    + '<button onclick="_trToggleAcctFlow()" style="background:none;border:none;color:#7A8FBC;font-size:.72rem;cursor:pointer;padding:0;font-family:var(--font-body)">Account flow ▸</button>'
    + '<div id="tr-acct-flow" style="display:none;margin-top:8px">' + _trBuildAccountFlow() + '</div>'
    + '</div>'
    + '</div></div></div>';
}

function _trGetMonthLabels() {
  var now = new Date();
  var n = _trPeriod === '6m' ? 6 : _trPeriod === '12m' ? 12 : 24;
  if (_trPeriod === 'all' && TRANSFERS.length > 0) {
    var earliest = TRANSFERS.reduce(function(min, p) { return p.date < min ? p.date : min; }, TRANSFERS[0].date || '2000-01');
    var months = [];
    var d = new Date(earliest + '-01');
    while (d <= now) {
      months.push(d.toISOString().slice(0, 7));
      d.setMonth(d.getMonth() + 1);
    }
    return months;
  }
  var labels = [];
  for (var i = n - 1; i >= 0; i--) {
    var d2 = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(d2.toISOString().slice(0, 7));
  }
  return labels;
}

function _trGetOutliers(months) {
  var outliers = [];
  months.forEach(function(m) {
    var sentTotal = 0, receivedTotal = 0;
    var unmatched = TX.filter(function(t) {
      return t.date.startsWith(m) && t.catId === 'transfers' && !trIsConfirmedTx(t.id);
    }).length;
    TRANSFERS.forEach(function(p) {
      var debitTx = TX.find(function(t) { return t.id === (p.debitTxId || p.txIdA); });
      var creditTx = TX.find(function(t) { return t.id === (p.creditTxId || p.txIdB); });
      if (debitTx && debitTx.date.startsWith(m)) sentTotal += p.amount || 0;
      if (creditTx && creditTx.date.startsWith(m)) receivedTotal += p.amount || 0;
    });
    var gap = Math.abs(sentTotal - receivedTotal);
    if (gap > 500) {
      var label = new Date(m + '-02').toLocaleString('en-AU', { month: 'short', year: 'numeric' });
      outliers.push({ label: label, gap: gap, count: unmatched });
    }
  });
  return outliers;
}

function _trBuildAccountFlow() {
  var pairMap = {};
  TRANSFERS.forEach(function(p) {
    var debitTx  = TX.find(function(t) { return t.id === (p.debitTxId || p.txIdA); });
    var creditTx = TX.find(function(t) { return t.id === (p.creditTxId || p.txIdB); });
    if (!debitTx || !creditTx) return;
    var fromAcct = debitTx.account  || debitTx.acctId  || 'Unknown';
    var toAcct   = creditTx.account || creditTx.acctId || 'Unknown';
    if (fromAcct === toAcct) return;
    var key = fromAcct + '→' + toAcct;
    pairMap[key] = (pairMap[key] || 0) + (p.amount || 0);
  });
  var keys = Object.keys(pairMap);
  if (!keys.length) {
    return '<div style="font-size:.72rem;color:#7A8FBC">No confirmed transfers yet</div>';
  }
  return keys.map(function(k) {
    var parts = k.split('→');
    return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">'
      + '<span style="background:var(--card2);border-radius:6px;padding:2px 8px;font-size:.68rem;color:#7A8FBC">' + esc(parts[0]) + '</span>'
      + '<span style="color:#7A8FBC;font-size:.7rem">→</span>'
      + '<span style="background:var(--card2);border-radius:6px;padding:2px 8px;font-size:.68rem;color:#7A8FBC">' + esc(parts[1]) + '</span>'
      + '<span style="font-size:.7rem;color:#7A8FBC;font-family:var(--font-mono)">' + fmt(pairMap[k]) + '</span>'
      + '</div>';
  }).join('');
}

function _trToggleAcctFlow() {
  var el = document.getElementById('tr-acct-flow');
  if (!el) return;
  var btn = document.querySelector('#tr-acct-flow-toggle button');
  if (el.style.display === 'none') {
    el.style.display = 'block';
    if (btn) btn.textContent = 'Account flow ▾';
  } else {
    el.style.display = 'none';
    if (btn) btn.textContent = 'Account flow ▸';
  }
}

function _trSetPeriod(p) {
  _trPeriod = p;
  try { localStorage.setItem('kf_transfers_period', p); } catch(e) {}
  // Re-render chart only — rebuild full page for simplicity
  renderTransfers();
}

function _trInitChart(months) {
  var sentTotals = [], receivedTotals = [], unmatchedTotals = [];
  months.forEach(function(m) {
    var sent = 0, received = 0, unmatched = 0;
    TRANSFERS.forEach(function(p) {
      var debitTx  = TX.find(function(t) { return t.id === (p.debitTxId || p.txIdA); });
      var creditTx = TX.find(function(t) { return t.id === (p.creditTxId || p.txIdB); });
      if (debitTx  && debitTx.date.startsWith(m))  sent     += p.amount || 0;
      if (creditTx && creditTx.date.startsWith(m)) received += p.amount || 0;
    });
    TX.filter(function(t) {
      return t.date.startsWith(m) && t.catId === 'transfers' && !trIsConfirmedTx(t.id);
    }).forEach(function(t) { unmatched += Number(t.amount) || 0; });
    sentTotals.push(sent);
    receivedTotals.push(received);
    unmatchedTotals.push(unmatched);
  });

  var labels = months.map(function(m) {
    return new Date(m + '-02').toLocaleString('en-AU', { month: 'short', year: '2-digit' });
  });

  safeChart('chart-transfers-recon', {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Money sent',     data: sentTotals,      backgroundColor: 'rgba(239,68,68,0.65)',  borderRadius: 3 },
        { label: 'Money received', data: receivedTotals,  backgroundColor: 'rgba(0,200,150,0.65)',  borderRadius: 3 },
        { label: 'Unmatched',      data: unmatchedTotals, backgroundColor: 'rgba(245,158,11,0.75)', borderRadius: 3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(98,120,160,0.12)' }, ticks: { color: '#7A8FBC' } },
        y: { grid: { color: 'rgba(98,120,160,0.12)' }, ticks: { color: '#7A8FBC', callback: function(v) { return '$' + (v / 1000).toFixed(0) + 'k'; } } }
      }
    }
  });
}

// ── Detection config card ─────────────────────────────────────
function _trBuildConfigCard(rules, threshold, lastRun, activeRules) {
  var summary = activeRules + ' rule' + (activeRules !== 1 ? 's' : '') + ' active · threshold ' + Math.round(threshold * 100) + '%';
  return '<div class="card" style="margin-bottom:16px" id="tr-config-card">'
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div><div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#7A8FBC;margin-bottom:2px">Detection rules</div>'
    + '<div id="tr-config-summary" style="font-size:.74rem;color:#7A8FBC">' + esc(summary) + '</div></div>'
    + '<button onclick="_trToggleConfig()" style="background:transparent;border:1px solid var(--border);color:#7A8FBC;border-radius:999px;padding:6px 14px;font-size:.72rem;cursor:pointer;min-height:36px;font-family:var(--font-body)">▸ Configure</button>'
    + '</div>'
    + '<div id="tr-config-body" style="display:none;margin-top:16px">'
    + _trToggleRow('exactAmount', 'Exact amount match', 'Same amount within ±3 days across accounts', rules.exactAmount !== false)
    + _trToggleRow('recurring',   'Recurring pattern',   'Same amount seen in prior months',           rules.recurring  !== false)
    + _trToggleRow('keyword',     'Keyword matching',    'Description contains transfer-related terms', rules.keyword    !== false)
    + _trToggleRow('frequency',   'Cross-account bonus', 'Confirms different source and destination accounts', rules.frequency !== false)
    + '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">'
    + '<div style="font-size:.78rem;font-weight:600;margin-bottom:4px">Auto-confirm threshold: '
    + '<input id="tr-threshold-input" type="number" inputmode="decimal" min="50" max="99" step="1" value="' + Math.round(threshold * 100)
    + '" style="width:60px;padding:4px 8px;font-size:.78rem;background:var(--card2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--font-mono);text-align:center" onblur="_trSaveThreshold()" onchange="_trSaveThreshold()">%'
    + '</div>'
    + '<div style="font-size:.7rem;color:#7A8FBC">Pairs scoring above this are confirmed automatically. Below it, they appear in Pending review.</div>'
    + '</div>'
    + '<div style="font-size:.68rem;color:#7A8FBC;margin-top:10px">Last run: ' + esc(lastRun ? trFmtTimestamp(lastRun) : 'Never') + '</div>'
    + '</div></div>';
}

function _trToggleRow(key, label, sub, on) {
  var pill = '<div class="tr-toggle-pill" style="background:' + (on ? 'var(--primary)' : 'var(--card3)') + '">'
    + '<div class="tr-toggle-thumb" style="left:' + (on ? '16px' : '2px') + '"></div></div>';
  return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">'
    + '<div style="flex:1"><div style="font-size:.8rem;font-weight:600">' + esc(label) + '</div>'
    + '<div style="font-size:.7rem;color:#7A8FBC">' + esc(sub) + '</div></div>'
    + '<div class="tr-toggle-wrap" id="tr-toggle-wrap-' + key + '">'
    + '<button role="switch" aria-checked="' + on + '" aria-label="' + esc(label) + ' detection rule"'
    + ' id="tr-toggle-' + key + '" class="tr-btn" style="background:none;border:none;padding:0;display:flex;align-items:center">'
    + pill + '</button></div></div>';
}

function _trToggleConfig() {
  var body = document.getElementById('tr-config-body');
  var btn  = document.querySelector('#tr-config-card button');
  if (!body) return;
  if (body.style.display === 'none') {
    body.style.display = 'block';
    if (btn) btn.textContent = '▾ Configure';
  } else {
    body.style.display = 'none';
    if (btn) btn.textContent = '▸ Configure';
  }
}

function _trWireConfigToggles() {
  ['exactAmount', 'recurring', 'keyword', 'frequency'].forEach(function(key) {
    var btn = document.getElementById('tr-toggle-' + key);
    if (!btn) return;
    btn.addEventListener('click', function() {
      var rules = load('kf_transfer_rules') || { exactAmount: true, recurring: true, keyword: true, frequency: true };
      rules[key] = !rules[key];
      try { localStorage.setItem('kf_transfer_rules', JSON.stringify(rules)); } catch(e) {}
      runDetection(false);
    });
  });
  var threshInput = document.getElementById('tr-threshold-input');
  if (threshInput) {
    threshInput.addEventListener('focus', function() {
      threshInput.addEventListener('blur', _trSaveThreshold, { once: true });
    });
  }
}

function _trSaveThreshold() {
  var input = document.getElementById('tr-threshold-input');
  if (!input) return;
  var val = parseInt(input.value, 10);
  if (isNaN(val) || val < 50 || val > 99) { val = 80; input.value = 80; }
  try { localStorage.setItem('kf_transfer_threshold', (val / 100).toFixed(2)); } catch(e) {}
  runDetection(false);
}

// ── Confirmed pairs tab ───────────────────────────────────────
function _trBuildConfirmedTab() {
  // Filter options
  var accts = {};
  TRANSFERS.forEach(function(p) {
    var debitTx  = TX.find(function(t) { return t.id === (p.debitTxId || p.txIdA); });
    var creditTx = TX.find(function(t) { return t.id === (p.creditTxId || p.txIdB); });
    [debitTx, creditTx].forEach(function(tx) {
      if (tx) { var a = tx.account || tx.acctId || ''; if (a) accts[a] = true; }
    });
  });
  var acctKeys = Object.keys(accts);

  var months = {};
  TRANSFERS.forEach(function(p) { if (p.date) months[p.date.slice(0, 7)] = true; });
  var monthKeys = Object.keys(months).sort().reverse();

  var filterHtml = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center">'
    + '<button onclick="_trSetAcctFilter(\'all\')" style="background:' + (_trAcctFilter === 'all' ? 'rgba(240,83,138,.12)' : 'transparent') + ';color:' + (_trAcctFilter === 'all' ? 'var(--primary)' : '#7A8FBC') + ';border:1px solid ' + (_trAcctFilter === 'all' ? 'rgba(240,83,138,.3)' : 'var(--border)') + ';border-radius:999px;padding:6px 14px;font-size:.72rem;cursor:pointer;min-height:36px;font-family:var(--font-body)">All accounts</button>'
    + acctKeys.map(function(a) {
      var active = _trAcctFilter === a;
      return '<button onclick="_trSetAcctFilter(\'' + esc(a) + '\')" style="background:' + (active ? 'rgba(240,83,138,.12)' : 'transparent') + ';color:' + (active ? 'var(--primary)' : '#7A8FBC') + ';border:1px solid ' + (active ? 'rgba(240,83,138,.3)' : 'var(--border)') + ';border-radius:999px;padding:6px 14px;font-size:.72rem;cursor:pointer;min-height:36px;font-family:var(--font-body)">' + esc(a) + '</button>';
    }).join('')
    + '<select onchange="_trSetMonthFilter(this.value)" style="padding:6px 10px;font-size:.72rem;background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:8px;min-height:36px">'
    + '<option value="all"' + (_trMonthFilter === 'all' ? ' selected' : '') + '>All months</option>'
    + monthKeys.map(function(m) {
      var lbl = new Date(m + '-02').toLocaleString('en-AU', { month: 'long', year: 'numeric' });
      return '<option value="' + m + '"' + (_trMonthFilter === m ? ' selected' : '') + '>' + lbl + '</option>';
    }).join('')
    + '</select>'
    + '<button onclick="_trToggleAutoFilter()" style="background:' + (_trAutoFilter ? 'rgba(240,83,138,.12)' : 'transparent') + ';color:' + (_trAutoFilter ? 'var(--primary)' : '#7A8FBC') + ';border:1px solid ' + (_trAutoFilter ? 'rgba(240,83,138,.3)' : 'var(--border)') + ';border-radius:999px;padding:6px 14px;font-size:.72rem;cursor:pointer;min-height:36px;font-family:var(--font-body)">Auto only</button>'
    + '</div>';

  // Filter pairs
  var pairs = TRANSFERS.filter(function(p) {
    if (_trAutoFilter && p.source !== 'auto') return false;
    if (_trMonthFilter !== 'all' && p.date && !p.date.startsWith(_trMonthFilter)) return false;
    if (_trAcctFilter !== 'all') {
      var debitTx  = TX.find(function(t) { return t.id === (p.debitTxId || p.txIdA); });
      var creditTx = TX.find(function(t) { return t.id === (p.creditTxId || p.txIdB); });
      var fromAcct = debitTx  ? (debitTx.account  || debitTx.acctId  || '') : '';
      var toAcct   = creditTx ? (creditTx.account || creditTx.acctId || '') : '';
      if (fromAcct !== _trAcctFilter && toAcct !== _trAcctFilter) return false;
    }
    return true;
  }).sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

  // Pagination
  var PAGE_SIZE = 20;
  var page = _trPage.confirmed;
  var total = pairs.length;
  var start = (page - 1) * PAGE_SIZE;
  var pagePairs = pairs.slice(start, start + PAGE_SIZE);

  if (!TRANSFERS.length) {
    return filterHtml + '<div style="text-align:center;padding:32px;color:#7A8FBC">'
      + '<div style="font-size:2rem;margin-bottom:8px">' + ICON('refresh') + '</div>'
      + '<div style="font-size:.9rem;font-weight:600;margin-bottom:4px">No confirmed transfers yet</div>'
      + '<div style="font-size:.76rem">Import transactions or link pairs manually to see transfer pairs here.</div>'
      + '</div>';
  }

  var tableHtml = '<div style="overflow-x:auto"><table role="table" style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:.78rem">'
    + '<thead><tr style="border-bottom:1px solid var(--border)">'
    + '<th style="width:70px;padding:8px 10px;text-align:left;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">Date</th>'
    + '<th style="width:20%;padding:8px 10px;text-align:left;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">From</th>'
    + '<th style="width:28px;padding:8px 4px;text-align:center;color:#7A8FBC">→</th>'
    + '<th style="width:20%;padding:8px 10px;text-align:left;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">To</th>'
    + '<th style="padding:8px 10px;text-align:left;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">Description</th>'
    + '<th style="width:90px;padding:8px 10px;text-align:right;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">Amount</th>'
    + '<th style="width:110px;padding:8px 10px;text-align:left;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">Confidence <span class="help-tip" tabindex="0" aria-label="How confidence is calculated" title="Score based on: exact amount match (50%), keyword match (25%), recurring pattern (20%), cross-account bonus (5%). Pairs above the auto-confirm threshold are confirmed automatically.">?</span></th>'
    + '<th style="width:70px;padding:8px 10px;text-align:left;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">Source</th>'
    + '<th style="width:80px;padding:8px 10px;text-align:center;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">Action</th>'
    + '</tr></thead><tbody>';

  pagePairs.forEach(function(p) {
    var debitTx  = TX.find(function(t) { return t.id === (p.debitTxId || p.txIdA); });
    var creditTx = TX.find(function(t) { return t.id === (p.creditTxId || p.txIdB); });
    var fromAcct = debitTx  ? esc(debitTx.account  || debitTx.acctId  || 'Unknown') : '—';
    var toAcct   = creditTx ? esc(creditTx.account || creditTx.acctId || 'Unknown') : '—';
    var fromDesc = debitTx  ? esc(debitTx.name  || debitTx.description  || '') : '';
    var toDesc   = creditTx ? esc(creditTx.name || creditTx.description || '') : '';
    var desc     = debitTx  ? esc((debitTx.name || debitTx.description || '').slice(0, 28)) : '';
    var conf     = p.confidence || 0;
    var confPct  = Math.round(conf * 100);
    var confColor = conf >= 0.80 ? 'var(--success)' : conf >= 0.50 ? 'var(--warn)' : 'var(--danger)';
    var confLabel = conf >= 0.80 ? 'High' : conf >= 0.50 ? 'Medium' : 'Low';
    var reasons   = (p.confidenceReasons || []).map(function(r) {
      var m = { amount_match: 'Amount match (+50%)', keyword_match: 'Keyword match (+25%)', recurring_strong: 'Recurring (+20%)', recurring_weak: 'Recurring (+10%)', cross_account: 'Cross-account (+5%)', manual: 'Manual link' };
      return m[r] || r;
    }).join(' · ');
    var sourceBadge = p.source === 'manual'
      ? '<span style="background:rgba(240,83,138,.15);color:var(--primary);border-radius:999px;padding:2px 7px;font-size:.65rem;font-weight:700">manual</span>'
      : '<span style="background:rgba(129,140,248,.15);color:var(--purple);border-radius:999px;padding:2px 7px;font-size:.65rem;font-weight:700">auto</span>';

    tableHtml += '<tr style="border-bottom:1px solid var(--border)">'
      + '<td style="padding:10px;color:#7A8FBC;font-size:.72rem">' + esc(trFmtDate(p.date)) + '</td>'
      + '<td style="padding:10px"><div style="font-weight:600;font-size:.76rem">' + fromAcct + '</div><div style="font-size:.68rem;color:#7A8FBC">' + fromDesc + '</div></td>'
      + '<td style="padding:4px;text-align:center;color:#7A8FBC">→</td>'
      + '<td style="padding:10px"><div style="font-weight:600;font-size:.76rem">' + toAcct + '</div><div style="font-size:.68rem;color:#7A8FBC">' + toDesc + '</div></td>'
      + '<td style="padding:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + desc + '</td>'
      + '<td style="padding:10px;text-align:right;font-family:var(--font-mono);font-weight:700">' + fmt(p.amount || 0) + '</td>'
      + '<td style="padding:10px">'
      + '<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">'
      + '<span style="width:7px;height:7px;border-radius:50%;background:' + confColor + ';display:inline-block;flex-shrink:0"></span>'
      + '<span style="font-size:.7rem;color:' + confColor + '">' + confLabel + '</span>'
      + '</div>'
      + '<div role="meter" aria-valuenow="' + confPct + '" aria-valuemin="0" aria-valuemax="100" aria-label="Confidence ' + confPct + '%" title="' + esc(reasons) + '" style="width:60px;height:5px;background:var(--card3);border-radius:3px">'
      + '<div style="width:' + confPct + '%;height:100%;background:' + confColor + ';border-radius:3px"></div></div>'
      + '</td>'
      + '<td style="padding:10px">' + sourceBadge + '</td>'
      + '<td style="padding:10px;text-align:center"><button onclick="trUnlinkPair(\'' + esc(p.id) + '\')" class="tr-btn" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:var(--danger);border-radius:6px;min-width:60px;min-height:44px;padding:10px 12px;font-size:.72rem;font-weight:600">Unlink</button></td>'
      + '</tr>';
  });

  tableHtml += '</tbody></table></div>';

  var pagHtml = _trPagination(total, PAGE_SIZE, page, 'confirmed');

  return filterHtml + (total > 0 ? tableHtml + pagHtml : '<div style="text-align:center;padding:32px;color:#7A8FBC"><div style="font-size:.9rem">No confirmed pairs match these filters.</div></div>');
}

function _trSetAcctFilter(v) { _trAcctFilter = v; _trPage.confirmed = 1; renderTransfers(); }
function _trSetMonthFilter(v) { _trMonthFilter = v; _trPage.confirmed = 1; renderTransfers(); }
function _trToggleAutoFilter() { _trAutoFilter = !_trAutoFilter; _trPage.confirmed = 1; renderTransfers(); }

// ── Pending tab ───────────────────────────────────────────────
function _trBuildPendingTab() {
  var AUTO_CONFIRM_THRESHOLD = parseFloat(load('kf_transfer_threshold') || '0.80');
  var threshold = AUTO_CONFIRM_THRESHOLD - 0.05;
  var highConf = TRANSFERS_PENDING.filter(function(p) { return p.confidence >= threshold; });

  if (!TRANSFERS_PENDING.length) {
    return '<div style="text-align:center;padding:40px;color:#7A8FBC">'
      + '<div style="font-size:2rem;margin-bottom:8px">' + ICON('check') + '</div>'
      + '<div style="font-size:.9rem;font-weight:600;margin-bottom:4px">All caught up</div>'
      + '<div style="font-size:.76rem">No suggested pairs waiting for review.</div>'
      + '</div>';
  }

  // Header row
  var headerHtml = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">'
    + '<div style="font-size:.8rem;color:#7A8FBC">' + TRANSFERS_PENDING.length + ' suggested pair' + (TRANSFERS_PENDING.length !== 1 ? 's' : '') + '</div>'
    + '<div style="display:flex;gap:8px;align-items:center">'
    + '<input type="checkbox" id="tr-select-all" onchange="trBulkSelectAll(this.checked)" style="width:16px;height:16px;cursor:pointer" aria-label="Select all suggestions">'
    + '<label for="tr-select-all" style="font-size:.75rem;color:#7A8FBC">Select all</label>'
    + (highConf.length > 0 ? '<button onclick="trBulkConfirmHighConf()" style="background:rgba(0,200,150,.1);border:1px solid rgba(0,200,150,.2);color:var(--success);border-radius:999px;padding:8px 14px;font-size:.72rem;font-weight:600;cursor:pointer;min-height:44px;font-family:var(--font-body)">Confirm all high-confidence ▸</button>' : '')
    + '</div></div>';

  // Bulk action bar
  var bulkBarHtml = '<div id="tr-bulk-bar" style="display:none;align-items:center;gap:10px;flex-wrap:wrap;background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:12px;position:sticky;top:0;z-index:10">'
    + '<span id="tr-bulk-count" style="flex:1;font-size:.8rem;font-weight:600"></span>'
    + '<button id="tr-bulk-confirm-sel" onclick="trBulkConfirmSelected()" style="background:rgba(0,200,150,.1);border:1px solid rgba(0,200,150,.2);color:var(--success);border-radius:6px;padding:8px 14px;font-size:.75rem;font-weight:600;cursor:pointer;min-height:44px;font-family:var(--font-body)">Confirm selected</button>'
    + '<button id="tr-bulk-reject-sel" onclick="trBulkRejectSelected()" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:var(--danger);border-radius:6px;padding:8px 14px;font-size:.75rem;font-weight:600;cursor:pointer;min-height:44px;font-family:var(--font-body)">Reject selected</button>'
    + '<button onclick="_trBulkClear()" style="background:transparent;border:1px solid var(--border);color:#7A8FBC;border-radius:6px;padding:8px 14px;font-size:.75rem;cursor:pointer;min-height:44px;font-family:var(--font-body)">Clear selection</button>'
    + '</div>';

  // Table
  var tableHtml = '<div style="overflow-x:auto"><table role="table" style="width:100%;border-collapse:collapse;font-size:.78rem">'
    + '<thead><tr style="border-bottom:1px solid var(--border)">'
    + '<th style="width:28px;padding:8px 10px"></th>'
    + '<th style="width:70px;padding:8px 10px;text-align:left;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">Date</th>'
    + '<th style="padding:8px 10px;text-align:left;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">From</th>'
    + '<th style="width:28px;text-align:center;color:#7A8FBC">→</th>'
    + '<th style="padding:8px 10px;text-align:left;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">To</th>'
    + '<th style="padding:8px 10px;text-align:left;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">Description</th>'
    + '<th style="width:90px;padding:8px 10px;text-align:right;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">Amount</th>'
    + '<th style="width:90px;padding:8px 10px;text-align:left;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">Confidence</th>'
    + '<th style="width:130px;padding:8px 10px;text-align:center;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">Action</th>'
    + '</tr></thead><tbody>';

  var PAGE_SIZE = 20;
  var page = _trPage.pending;
  var total = TRANSFERS_PENDING.length;
  var pagePairs = TRANSFERS_PENDING.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  pagePairs.forEach(function(p) {
    var debitTx  = TX.find(function(t) { return t.id === p.debitTxId; });
    var creditTx = TX.find(function(t) { return t.id === p.creditTxId; });
    var fromDesc = debitTx  ? esc(debitTx.name  || debitTx.description  || '') : '—';
    var toDesc   = creditTx ? esc(creditTx.name || creditTx.description || '') : '—';
    var fromAcct = debitTx  ? esc(debitTx.account  || debitTx.acctId  || '') : '';
    var toAcct   = creditTx ? esc(creditTx.account || creditTx.acctId || '') : '';
    var date     = p.date || (debitTx ? debitTx.date : '') || '';
    var conf     = p.confidence || 0;
    var confPct  = Math.round(conf * 100);
    var confColor = conf >= 0.80 ? 'var(--success)' : conf >= 0.50 ? 'var(--warn)' : 'var(--danger)';
    var confLabel = conf >= 0.80 ? 'High' : conf >= 0.50 ? 'Medium' : 'Low';
    var isSel    = _trBulkSel.indexOf(p.id) >= 0;
    var desc     = debitTx ? esc((debitTx.name || debitTx.description || '').slice(0, 24)) : '';

    tableHtml += '<tr style="border-bottom:1px solid var(--border)">'
      + '<td style="padding:10px"><input type="checkbox" ' + (isSel ? 'checked' : '') + ' onchange="trBulkToggle(\'' + esc(p.id) + '\',this.checked)" style="width:16px;height:16px;cursor:pointer"></td>'
      + '<td style="padding:10px;color:#7A8FBC;font-size:.72rem">' + esc(trFmtDate(date)) + '</td>'
      + '<td style="padding:10px"><div style="font-weight:600;font-size:.76rem">' + (fromAcct || fromDesc) + '</div><div style="font-size:.68rem;color:#7A8FBC">' + fromDesc + '</div></td>'
      + '<td style="padding:4px;text-align:center;color:#7A8FBC">→</td>'
      + '<td style="padding:10px"><div style="font-weight:600;font-size:.76rem">' + (toAcct || toDesc) + '</div><div style="font-size:.68rem;color:#7A8FBC">' + toDesc + '</div></td>'
      + '<td style="padding:10px;font-size:.74rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + desc + '</td>'
      + '<td style="padding:10px;text-align:right;font-family:var(--font-mono);font-weight:700">' + fmt(p.amount || 0) + '</td>'
      + '<td style="padding:10px">'
      + '<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px"><span style="width:7px;height:7px;border-radius:50%;background:' + confColor + ';display:inline-block"></span><span style="font-size:.7rem;color:' + confColor + '">' + confLabel + ' (' + confPct + '%)</span></div>'
      + '<div role="meter" aria-valuenow="' + confPct + '" aria-valuemin="0" aria-valuemax="100" aria-label="Confidence ' + confPct + '%" style="width:60px;height:5px;background:var(--card3);border-radius:3px"><div style="width:' + confPct + '%;height:100%;background:' + confColor + ';border-radius:3px"></div></div>'
      + '</td>'
      + '<td style="padding:10px;text-align:center">'
      + '<div style="display:flex;gap:4px;justify-content:center">'
      + '<button onclick="trConfirmPending(\'' + esc(p.id) + '\')" class="tr-btn" style="background:rgba(0,200,150,.1);border:1px solid rgba(0,200,150,.2);color:var(--success);border-radius:6px;min-height:44px;padding:10px 10px;font-size:.72rem">Confirm</button>'
      + '<button onclick="trRejectPending(\'' + esc(p.id) + '\')" class="tr-btn" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:var(--danger);border-radius:6px;min-height:44px;padding:10px 10px;font-size:.72rem">Reject</button>'
      + '</div></td>'
      + '</tr>';
  });

  tableHtml += '</tbody></table></div>';

  return headerHtml + bulkBarHtml + tableHtml + _trPagination(total, PAGE_SIZE, page, 'pending');
}

function _trBulkClear() { _trBulkSel = []; renderTransfers(); }

// ── Unmatched tab ─────────────────────────────────────────────
function _trBuildUnmatchedTab(unmatchedTx) {
  if (!unmatchedTx.length) {
    return '<div style="text-align:center;padding:40px;color:#7A8FBC">'
      + '<div style="font-size:2rem;margin-bottom:8px">' + ICON('check') + '</div>'
      + '<div style="font-size:.9rem;font-weight:600;margin-bottom:4px">All transfers reconciled</div>'
      + '<div style="font-size:.76rem">No unmatched transfer transactions detected.</div>'
      + '</div>';
  }

  var tableHtml = '<div style="overflow-x:auto"><table role="table" style="width:100%;border-collapse:collapse;font-size:.78rem">'
    + '<thead><tr style="border-bottom:1px solid var(--border)">'
    + '<th style="padding:8px 10px;text-align:left;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">Date</th>'
    + '<th style="padding:8px 10px;text-align:left;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">Account</th>'
    + '<th style="padding:8px 10px;text-align:left;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">Description</th>'
    + '<th style="width:90px;padding:8px 10px;text-align:right;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">Amount</th>'
    + '<th style="padding:8px 10px;text-align:left;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">Reason</th>'
    + '<th style="width:110px;padding:8px 10px;text-align:center;font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7A8FBC">Action</th>'
    + '</tr></thead><tbody>';

  var PAGE_SIZE = 20;
  var page = _trPage.unmatched;
  var total = unmatchedTx.length;
  var pageTx = unmatchedTx.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  pageTx.forEach(function(t) {
    var acct = esc(t.account || t.acctId || '—');
    var desc = esc(t.name || t.description || '—');
    var reason = t.transferUnlinked
      ? 'Pair removed by re-run'
      : 'Categorised as transfer — no pair found';
    var sign  = t.type === 'income' ? '+' : '-';
    var color = t.type === 'income' ? 'var(--success)' : 'var(--danger)';

    tableHtml += '<tr style="border-bottom:1px solid var(--border)">'
      + '<td style="padding:10px;color:#7A8FBC;font-size:.72rem">' + esc(trFmtDate(t.date)) + '</td>'
      + '<td style="padding:10px;font-size:.76rem">' + acct + '</td>'
      + '<td style="padding:10px;font-size:.76rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + desc + '</td>'
      + '<td style="padding:10px;text-align:right;font-family:var(--font-mono);font-weight:700;color:' + color + '">' + sign + fmt(t.amount) + '</td>'
      + '<td style="padding:10px;font-size:.72rem;color:#7A8FBC">' + esc(reason) + '</td>'
      + '<td style="padding:10px;text-align:center"><button onclick="trOpenManualModal(\'' + esc(t.id) + '\')" class="tr-btn" style="background:rgba(240,83,138,.1);border:1px solid rgba(240,83,138,.2);color:var(--primary);border-radius:6px;min-height:44px;padding:10px 10px;font-size:.72rem;font-weight:600">Find match</button></td>'
      + '</tr>';
  });

  tableHtml += '</tbody></table></div>';
  return tableHtml + _trPagination(total, PAGE_SIZE, page, 'unmatched');
}

// ── Pagination ────────────────────────────────────────────────
function _trPagination(total, pageSize, current, tabKey) {
  if (total <= pageSize) return '';
  var totalPages = Math.ceil(total / pageSize);
  var start = (current - 1) * pageSize + 1;
  var end   = Math.min(current * pageSize, total);

  var html = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">'
    + '<div style="font-size:.75rem;color:#7A8FBC">Showing ' + start + '–' + end + ' of ' + total + '</div>'
    + '<div style="display:flex;gap:4px">';

  // Prev
  html += '<button onclick="_trGoPage(\'' + tabKey + '\',' + (current - 1) + ')" ' + (current <= 1 ? 'disabled' : '') + ' style="min-height:36px;min-width:36px;background:transparent;border:1px solid var(--border);color:#7A8FBC;border-radius:6px;cursor:pointer;font-size:.75rem">‹</button>';

  // Page numbers (max 5)
  var pStart = Math.max(1, current - 2);
  var pEnd   = Math.min(totalPages, pStart + 4);
  for (var i = pStart; i <= pEnd; i++) {
    var isActive = i === current;
    html += '<button onclick="_trGoPage(\'' + tabKey + '\',' + i + ')" style="min-height:36px;min-width:36px;background:' + (isActive ? 'rgba(240,83,138,.15)' : 'transparent') + ';border:1px solid ' + (isActive ? 'rgba(240,83,138,.3)' : 'var(--border)') + ';color:' + (isActive ? 'var(--primary)' : '#7A8FBC') + ';border-radius:6px;cursor:pointer;font-size:.75rem">' + i + '</button>';
  }

  // Next
  html += '<button onclick="_trGoPage(\'' + tabKey + '\',' + (current + 1) + ')" ' + (current >= totalPages ? 'disabled' : '') + ' style="min-height:36px;min-width:36px;background:transparent;border:1px solid var(--border);color:#7A8FBC;border-radius:6px;cursor:pointer;font-size:.75rem">›</button>';

  html += '</div></div>';
  return html;
}

function _trGoPage(tabKey, page) {
  _trPage[tabKey] = page;
  renderTransfers();
}

// ── Manual link modal ─────────────────────────────────────────
function _trBuildModal() {
  var months = [...new Set(TX.map(function(t) { return t.date.slice(0, 7); }))].sort().reverse();
  var monthOpts = '<option value="">All months</option>'
    + months.map(function(m) {
      return '<option value="' + m + '">' + new Date(m + '-02').toLocaleString('en-AU', { month: 'long', year: 'numeric' }) + '</option>';
    }).join('');

  return '<div id="tr-link-modal" role="dialog" aria-modal="true" aria-labelledby="tr-modal-title" aria-hidden="true"'
    + ' style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.6);z-index:10000;align-items:center;justify-content:center;padding:16px"'
    + ' onclick="if(event.target===this)trCloseManualModal()">'
    + '<div style="background:var(--card);border-radius:14px;border:1px solid var(--border);max-width:480px;width:100%;max-height:88vh;overflow-y:auto;padding:20px" onclick="event.stopPropagation()">'
    + '<h3 id="tr-modal-title" tabindex="-1" style="margin:0 0 6px;font-size:1rem;font-weight:700">Link two transactions as a transfer pair</h3>'
    + '<p style="font-size:.78rem;color:#7A8FBC;margin-bottom:14px">Select one outgoing and one incoming transaction. Both will be excluded from income and expense analysis.</p>'
    + '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">'
    + '<input id="tr-modal-search" type="text" placeholder="Search..." oninput="trRenderModalList()" style="flex:1;min-width:140px;padding:8px 10px;font-size:.8rem;background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:8px">'
    + '<select id="tr-modal-month" onchange="trRenderModalList()" style="padding:8px 10px;font-size:.78rem;background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:8px">' + monthOpts + '</select>'
    + '</div>'
    + '<div id="tr-modal-list" role="listbox" aria-label="Transactions to link" style="max-height:320px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;padding:4px"></div>'
    + '<div id="tr-modal-status" style="font-size:.78rem;color:#7A8FBC;margin:10px 0;min-height:18px">Select one outgoing and one incoming transaction</div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">'
    + '<button onclick="trCloseManualModal()" style="background:transparent;border:1px solid var(--border);color:#7A8FBC;border-radius:8px;padding:10px 16px;font-size:.8rem;cursor:pointer;min-height:44px;font-family:var(--font-body)">Cancel</button>'
    + '<button onclick="_trBulkClearModal()" style="background:transparent;border:1px solid var(--border);color:#7A8FBC;border-radius:8px;padding:10px 16px;font-size:.8rem;cursor:pointer;min-height:44px;font-family:var(--font-body)">Clear</button>'
    + '<button id="tr-modal-confirm" onclick="trConfirmManualLink()" disabled aria-disabled="true" style="background:var(--primary);color:#fff;border:none;border-radius:8px;padding:10px 18px;font-size:.8rem;font-weight:700;cursor:pointer;min-height:44px;opacity:.4;font-family:var(--font-body)">Link as transfer</button>'
    + '</div></div></div>';
}

function _trBulkClearModal() {
  _trManualSel = [];
  trRenderModalList();
}

// ── Backward compatibility shim ───────────────────────────────
// Old pages may call renderTransfersPage(), autoDetectTransfers(), etc.
function renderTransfersPage() { renderTransfers(); }

function autoDetectTransfers() {
  runDetection(false);
}

// ── Dashboard stat (unchanged) ────────────────────────────────
function dbRenderTransferStat() {
  var el = document.getElementById('db-transfer-stat');
  if (!el) return;
  var pfx = typeof dbPeriodStr === 'function' ? dbPeriodStr() : thisMonth();
  var conf = TRANSFERS.filter(function(t) { return t.status === 'confirmed' || t.source === 'auto' || t.source === 'manual'; });
  var thisMonthPairs = conf.filter(function(tr) {
    var txId = tr.debitTxId || tr.txIdA;
    var tx = TX.find(function(t) { return t.id === txId; });
    return tx && tx.date.startsWith(pfx);
  });
  if (!conf.length) { el.innerHTML = ''; return; }
  var total = thisMonthPairs.reduce(function(s, t) { return s + (t.amount || 0); }, 0);
  el.innerHTML = '<div class="dash-transfer-stat">'
    + ICON('refresh') + ' <strong>' + thisMonthPairs.length + ' internal transfer' + (thisMonthPairs.length !== 1 ? 's' : '') + '</strong>'
    + ' excluded this period'
    + (total > 0 ? ' — <strong>' + fmt(total) + '</strong> total' : '')
    + ' &nbsp;<a href="#" onclick="go(\'transfers\');return false;" style="color:#74b9ff;font-size:.76rem">View transfers →</a>'
    + '</div>';
}

// ── Post-render: init chart ───────────────────────────────────
// Chart init must run after DOM is painted
var _trChartInit = false;
(function _trScheduleChart() {
  var orig = renderTransfers;
  renderTransfers = function() {
    orig();
    setTimeout(function() {
      var months = _trGetMonthLabels();
      _trInitChart(months);
    }, 50);
  };
})();

// ══════════════════════════════════════════════════════════════
