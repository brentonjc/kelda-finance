// ══════════════════════════════════════════════════════════════
// BALANCE SYNC. Reads the running-balance column of a bank CSV,
// checks it against what Kelda already has, and once the user confirms,
// writes the measured balances to Cash Tracker.
//
// Money is integer cents throughout. A balance "on" a date means the
// balance at the end of that day, after all of that day's rows.
// ══════════════════════════════════════════════════════════════
var BalanceSync = (function() {

  // ── Parsing ──────────────────────────────────────────────────

  // "$1,234.56", "(12.00)", "-5", "12.00 DR", "3.10CR" → cents, or null if not money.
  function parseCents(s) {
    if (s === null || s === undefined) return null;
    var t = String(s).trim().toUpperCase();
    if (!t) return null;
    var neg = false;
    var m = t.match(/^(.*?)\s*(CR|DR)$/);
    if (m) { t = m[1]; if (m[2] === 'DR') neg = !neg; }
    t = t.replace(/AUD|\$|,|\s/g, '');
    if (/^\(.*\)$/.test(t)) { neg = !neg; t = t.slice(1, -1); }
    if (/^-/.test(t)) { neg = !neg; t = t.slice(1); }
    else if (/-$/.test(t)) { neg = !neg; t = t.slice(0, -1); }
    if (/^\+/.test(t)) t = t.slice(1);
    if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
    var c = Math.round(parseFloat(t) * 100);
    return neg && c !== 0 ? -c : c;
  }

  // A running-balance header: "Balance", "Running Balance", "Closing Balance".
  // Available balance includes overdraft limits, so it doesn't count.
  function isBalanceHeader(h) {
    var s = String(h || '').toLowerCase().replace(/[^a-z]/g, '');
    return /balance/.test(s) && !/available|opening|limit|date/.test(s);
  }

  // Share of rows whose balance cell parses as money.
  function balanceFill(rawRows, col) {
    if (!rawRows.length) return 0;
    var n = 0;
    rawRows.forEach(function(r) { if (parseCents(r[col]) !== null) n++; });
    return n / rawRows.length;
  }
  var MIN_FILL = 0.8;

  // CSV rows → [{ fileIndex, line, date, amountCents, balanceCents }].
  // Sign follows the import: a mapped Type column decides income vs expense,
  // otherwise the amount's own sign does. dateFn is the import's date parser.
  function buildRows(rawRows, map, dateFn) {
    return rawRows.map(function(row, i) {
      var amt;
      if (map.amount) {
        amt = parseCents(row[map.amount]);
      } else {
        var d = parseCents(row[map.debit]) || 0;
        var c = parseCents(row[map.credit]) || 0;
        amt = (map.debit && parseCents(row[map.debit]) === null && map.credit && parseCents(row[map.credit]) === null)
          ? null : c - Math.abs(d);
      }
      if (amt !== null && map.type) {
        var tv = String(row[map.type] || '').toLowerCase();
        amt = /credit|income|deposit/.test(tv) ? Math.abs(amt) : -Math.abs(amt);
      }
      return {
        fileIndex: i,
        line: i + 2, // header is line 1
        date: dateFn(row[map.date]) || null,
        amountCents: amt,
        balanceCents: parseCents(row[map.balance])
      };
    });
  }

  // ── Dates ────────────────────────────────────────────────────
  function addDays(iso, n) {
    var d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n));
    return d.toISOString().slice(0, 10);
  }
  function monthEnd(mo) {
    var d = new Date(Date.UTC(+mo.slice(0, 4), +mo.slice(5, 7), 0));
    return d.toISOString().slice(0, 10);
  }
  function nextMonth(mo) {
    var y = +mo.slice(0, 4), m = +mo.slice(5, 7) + 1;
    if (m > 12) { m = 1; y++; }
    return y + '-' + String(m).padStart(2, '0');
  }

  // ── Chain ────────────────────────────────────────────────────
  function linkHolds(prev, cur) {
    return prev.balanceCents !== null && cur.balanceCents !== null &&
      prev.balanceCents + cur.amountCents === cur.balanceCents;
  }

  // Orders one day's rows so each balance follows from the one before.
  // prevBal null = first day: try each row as the day's first and keep the best run.
  function orderDay(group, prevBal) {
    function run(start, prev) {
      var rest = group.slice(), out = [];
      if (start !== null) { out.push(rest.splice(start, 1)[0]); prev = out[0].balanceCents; }
      while (rest.length) {
        var k = -1;
        if (prev !== null) {
          for (var i = 0; i < rest.length; i++) {
            if (rest[i].balanceCents !== null && prev + rest[i].amountCents === rest[i].balanceCents) { k = i; break; }
          }
        }
        var r = rest.splice(k < 0 ? 0 : k, 1)[0];
        prev = r.balanceCents !== null ? r.balanceCents : (prev !== null ? prev + r.amountCents : null);
        out.push(r);
      }
      return out;
    }
    if (prevBal !== null) return run(null, prevBal);
    var best = null, bestLinks = -1;
    for (var s = 0; s < group.length; s++) {
      var o = run(s, null), links = 0;
      for (var j = 1; j < o.length; j++) if (linkHolds(o[j - 1], o[j])) links++;
      if (links > bestLinks) { best = o; bestLinks = links; }
    }
    return best;
  }

  function chronological(base) {
    var sorted = base.map(function(r, i) { return { r: r, i: i }; })
      .sort(function(a, b) { return a.r.date < b.r.date ? -1 : a.r.date > b.r.date ? 1 : a.i - b.i; })
      .map(function(x) { return x.r; });
    var out = [], prev = null;
    for (var i = 0; i < sorted.length;) {
      var j = i;
      while (j < sorted.length && sorted[j].date === sorted[i].date) j++;
      var day = orderDay(sorted.slice(i, j), prev);
      day.forEach(function(r) { out.push(r); });
      var last = day[day.length - 1];
      prev = last.balanceCents !== null ? last.balanceCents : null;
      i = j;
    }
    return out;
  }

  // Banks export newest-first or oldest-first, and same-day rows aren't reliably
  // ordered. Try both directions, order each day so the balances chain, and keep
  // the direction with the most valid links.
  // → { order, openingCents, closingCents, from, to, chain, brokenLines, invalidLines }
  function deriveChain(rows) {
    var invalidLines = [];
    var usable = rows.filter(function(r) {
      var ok = r.date && r.amountCents !== null;
      if (!ok) invalidLines.push(r.line);
      return ok;
    });
    if (!usable.length) return null;
    var fwd = chronological(usable);
    var rev = chronological(usable.slice().reverse());
    function score(o) { var n = 0; for (var i = 1; i < o.length; i++) if (linkHolds(o[i - 1], o[i])) n++; return n; }
    var order = score(rev) > score(fwd) ? rev : fwd;
    var brokenLines = [];
    if (order[0].balanceCents === null) brokenLines.push(order[0].line);
    for (var i = 1; i < order.length; i++) if (!linkHolds(order[i - 1], order[i])) brokenLines.push(order[i].line);
    var first = order[0], last = order[order.length - 1];
    var lastBal = null;
    for (var k = order.length - 1; k >= 0 && lastBal === null; k--) lastBal = order[k].balanceCents;
    return {
      order: order,
      openingCents: first.balanceCents !== null ? first.balanceCents - first.amountCents : null,
      closingCents: lastBal,
      from: first.date,
      to: last.date,
      chain: (brokenLines.length || invalidLines.length) ? 'broken' : 'verified',
      brokenLines: brokenLines.sort(function(a, b) { return a - b; }),
      invalidLines: invalidLines
    };
  }

  // Balance at the end of `date` according to the file (null before the file's opening).
  function balanceOn(ch, date) {
    if (date < addDays(ch.from, -1)) return null;
    var bal = ch.openingCents;
    for (var i = 0; i < ch.order.length && ch.order[i].date <= date; i++) {
      if (ch.order[i].balanceCents !== null) bal = ch.order[i].balanceCents;
    }
    return bal;
  }

  // Measured balances the file supports, one per month:
  // monthEnd for every month-end inside the file (including the day before its first
  // row, which is the opening), asOf with the real date for a part-month at the end.
  function monthClosings(ch) {
    var out = [];
    var dayBefore = addDays(ch.from, -1);
    if (ch.openingCents !== null && dayBefore === monthEnd(dayBefore.slice(0, 7))) {
      out.push({ month: dayBefore.slice(0, 7), date: dayBefore, cents: ch.openingCents, kind: 'monthEnd' });
    }
    for (var mo = ch.from.slice(0, 7); mo <= ch.to.slice(0, 7); mo = nextMonth(mo)) {
      var me = monthEnd(mo);
      if (ch.to >= me) out.push({ month: mo, date: me, cents: balanceOn(ch, me), kind: 'monthEnd' });
      else out.push({ month: mo, date: ch.to, cents: ch.closingCents, kind: 'asOf' });
    }
    return out.filter(function(c) { return c.cents !== null; });
  }

  // ── Reconcile ────────────────────────────────────────────────
  function txCents(t) {
    var c = Math.round(Math.abs(Number(t.amount) || 0) * 100);
    return t.type === 'income' ? c : -c;
  }

  // Compares the file with Kelda. Pure: everything comes in through `inp`.
  // inp: { acctId, chain, anchors:[…this account's], tx:[all TX], ct:{month:dollars}, ctDates:{month:date} }
  function reconcile(inp) {
    var ch = inp.chain, acctId = inp.acctId;
    var anchors = (inp.anchors || []).slice().sort(function(a, b) { return a.date < b.date ? -1 : 1; });
    var mine = (inp.tx || []).filter(function(t) { return t.account === acctId && t.date; });

    // Expected opening: last measured balance before the file, rolled forward by every
    // Kelda movement on this account since (transfer legs count too, since they're TX rows).
    var prior = null;
    anchors.forEach(function(a) { if (a.date < ch.from) prior = a; });
    var expected = null, gap = null, rolled = [];
    if (prior) {
      expected = prior.cents;
      mine.forEach(function(t) {
        if (t.date > prior.date && t.date < ch.from) { expected += txCents(t); rolled.push(t); }
      });
      if (ch.openingCents !== null) gap = ch.openingCents - expected;
    }

    // Kelda movements inside the file's range that no file row accounts for.
    var pool = {};
    ch.order.forEach(function(r) {
      var k = r.date + '|' + r.amountCents;
      pool[k] = (pool[k] || 0) + 1;
    });
    var extras = [];
    mine.forEach(function(t) {
      if (t.date < ch.from || t.date > ch.to) return;
      var k = t.date + '|' + txCents(t);
      if (pool[k]) pool[k]--; else extras.push(t);
    });

    // An earlier measured balance the file disagrees with.
    var conflicts = [];
    anchors.forEach(function(a) {
      if (a.date < addDays(ch.from, -1) || a.date > ch.to) return;
      var fileCents = balanceOn(ch, a.date);
      if (fileCents !== null && fileCents !== a.cents) conflicts.push({ date: a.date, previousCents: a.cents, fileCents: fileCents });
    });

    // Cash Tracker months this would change. A manual entry dated after the file's
    // last day is newer than anything the file knows, so that month is left alone.
    var closings = monthClosings(ch);
    var ct = inp.ct || {}, ctDates = inp.ctDates || {};
    var ctChanges = [], ctSkips = [], writes = [];
    closings.forEach(function(c) {
      var has = ct[c.month] !== undefined && ct[c.month] !== null;
      if (has && c.kind === 'asOf' && ctDates[c.month] && ctDates[c.month] > c.date) {
        ctSkips.push({ month: c.month, existingCents: Math.round(Number(ct[c.month]) * 100), enteredOn: ctDates[c.month] });
        return;
      }
      writes.push(c);
      if (has && Math.round(Number(ct[c.month]) * 100) !== c.cents) {
        ctChanges.push({ month: c.month, existingCents: Math.round(Number(ct[c.month]) * 100), fileCents: c.cents, enteredOn: ctDates[c.month] || null });
      }
    });

    var clean = ch.chain === 'verified' && !gap && !conflicts.length && !extras.length && !ctChanges.length;
    return {
      firstSync: !prior,
      prior: prior,
      expectedOpeningCents: expected,
      gapCents: gap,
      rolled: rolled,
      extras: extras,
      conflicts: conflicts,
      closings: closings,
      ctWrites: writes,
      ctChanges: ctChanges,
      ctSkips: ctSkips,
      status: clean ? 'clean' : 'review'
    };
  }

  // Adds a sync's measured balances to an account's anchor list (one per date; a
  // confirmed sync replaces an earlier value for the same date). Returns a new list.
  function mergeAnchors(list, add) {
    var byDate = {};
    (list || []).forEach(function(a) { byDate[a.date] = a; });
    add.forEach(function(a) { byDate[a.date] = a; });
    return Object.keys(byDate).sort().map(function(d) { return byDate[d]; });
  }

  // Anchors recorded for one sync: the opening, each month-end and the closing.
  // A day that hasn't ended yet (todayIso or later) can still gain transactions,
  // so it isn't recorded; the next file would otherwise disagree with it.
  function anchorsFor(ch, closings, batchId, todayIso) {
    var out = [];
    if (ch.openingCents !== null) out.push({ date: addDays(ch.from, -1), cents: ch.openingCents, batchId: batchId, kind: 'open' });
    closings.forEach(function(c) {
      if (c.kind === 'monthEnd' && c.date >= ch.from) out.push({ date: c.date, cents: c.cents, batchId: batchId, kind: 'monthEnd' });
    });
    if (ch.closingCents !== null && !out.some(function(a) { return a.date === ch.to; })) {
      out.push({ date: ch.to, cents: ch.closingCents, batchId: batchId, kind: 'close' });
    }
    return todayIso ? out.filter(function(a) { return a.date < todayIso; }) : out;
  }

  return {
    parseCents: parseCents, isBalanceHeader: isBalanceHeader, balanceFill: balanceFill, MIN_FILL: MIN_FILL,
    buildRows: buildRows, deriveChain: deriveChain, balanceOn: balanceOn, monthClosings: monthClosings,
    reconcile: reconcile, mergeAnchors: mergeAnchors, anchorsFor: anchorsFor, addDays: addDays
  };
})();

// ══════════════════════════════════════════════════════════════
// Import wizard integration: the review panel and the commit
// ══════════════════════════════════════════════════════════════
var BS_LOG_CAP = 50;
var _bsCheck = null; // { acctId, acct, fileName, chain, rec, reason } for the file in the wizard

function bsLoadStore() {
  var s = load(K.balanceSync);
  if (!s || typeof s !== 'object') s = {};
  if (!s.anchors) s.anchors = {};
  if (!s.log) s.log = [];
  s.v = 1;
  return s;
}

function bsIsCard(acct) { return !!acct && /credit/i.test(acct.acctType || ''); }
function bsCents(c) { return fmt(c / 100); }
function bsDay(iso) { return txFmtDate(iso); }
function bsMonth(mo) { return typeof ctMonthLabel === 'function' ? ctMonthLabel(mo) : mo; }

// Shows the account picker in step 2 when a column is mapped to Running Balance.
function csvBalToggle() {
  var on = false;
  document.querySelectorAll('#csv-map-body select').forEach(function(s) { if (s.value === 'balance') on = true; });
  var wrap = document.getElementById('csv-bal-acct-wrap');
  if (!wrap) return;
  wrap.hidden = !on;
  if (on) {
    var sel = document.getElementById('csv-bal-acct');
    var cur = sel.value;
    sel.innerHTML = '<option value="">Choose account…</option>' + ACCOUNTS.map(function(a) {
      return '<option value="' + esc(a.id) + '"' + (a.id === cur ? ' selected' : '') + '>' + esc(a.name) + '</option>';
    }).join('');
  }
}

// Runs after the import's own parsing and dedupe. Returns false to stop the preview
// (an account is needed first); otherwise prepares _bsCheck (null = no balance sync).
function bsPrepare(map, fileName) {
  _bsCheck = null;
  if (!map.balance) return true;
  var acctId = (document.getElementById('csv-bal-acct') || {}).value || '';
  if (!acctId) { toast('⚠️ Choose which account this file is for'); return false; }
  var acct = ACCOUNTS.find(function(a) { return a.id === acctId; });
  var base = { acctId: acctId, acct: acct, fileName: fileName || '' };
  if (bsIsCard(acct)) { _bsCheck = Object.assign(base, { reason: 'card' }); return true; }
  if (BalanceSync.balanceFill(_csvRaw, map.balance) < BalanceSync.MIN_FILL) { _bsCheck = Object.assign(base, { reason: 'blank' }); return true; }
  var chain = BalanceSync.deriveChain(BalanceSync.buildRows(_csvRaw, map, csvDate));
  if (!chain || chain.openingCents === null || chain.closingCents === null) { _bsCheck = Object.assign(base, { reason: 'blank' }); return true; }
  var rec = BalanceSync.reconcile({
    acctId: acctId, chain: chain,
    anchors: bsLoadStore().anchors[acctId] || [],
    tx: TX, ct: CT[acctId] || {}, ctDates: CT_DATES[acctId] || {}
  });
  _bsCheck = Object.assign(base, { chain: chain, rec: rec });
  return true;
}

function bsList(items, render, cap) {
  cap = cap || 8;
  var html = '<ul class="bs-list">' + items.slice(0, cap).map(function(x) { return '<li>' + render(x) + '</li>'; }).join('') + '</ul>';
  if (items.length > cap) html += '<p class="bs-more">and ' + (items.length - cap) + ' more</p>';
  return html;
}
function bsTxLine(t) {
  return '<span class="bs-li-date">' + esc(bsDay(t.date)) + '</span> <span class="bs-li-name">' + esc(t.name || t.description || 'Transaction')
    + (typeof isTransfer === 'function' && isTransfer(t) ? ' <span class="bs-tag">Transfer</span>' : '')
    + '</span> <span class="bs-amt">' + (t.type === 'income' ? '+' : '−') + fmt(Math.abs(Number(t.amount) || 0)) + '</span>';
}

// Renders the Balance check into step 3 and swaps the import buttons.
function bsRenderPanel(keepFocus) {
  var box = document.getElementById('csv-bal');
  var plain = document.getElementById('csv-import-actions');
  if (!box) return;
  if (!_bsCheck) { box.hidden = true; box.innerHTML = ''; if (plain) plain.hidden = false; return; }
  if (plain) plain.hidden = true;
  box.hidden = false;
  var c = _bsCheck, acctName = c.acct ? c.acct.name : c.acctId;
  var cancelBtn = '<button class="btn btn-ghost" onclick="bsCancel()">Cancel</button>';
  var txOnlyBtn = '<button class="btn btn-ghost" onclick="bsCommit(false)">Import transactions only</button>';
  var html;

  if (c.reason) {
    var why = c.reason === 'card'
      ? 'Balance sync isn\'t available for credit card accounts yet. Transactions import as usual.'
      : 'The balance column is mostly empty, so balances can\'t be read from this file. Transactions import as usual.';
    html = '<section class="bs-panel" aria-labelledby="bs-h">'
      + '<h3 class="bs-h" id="bs-h" tabindex="-1">' + ICON('info-circle') + ' Balances not synced</h3>'
      + '<p class="bs-p">' + esc(why) + '</p>'
      + '<div class="up-actions up-actions--wrap">' + cancelBtn
      + '<button class="btn btn-primary" onclick="bsCommit(false)">' + ICON('circle-check-filled') + ' Import transactions</button></div>'
      + '</section>';
    box.innerHTML = html;
    if (!keepFocus) bsFocusHeading();
    return;
  }

  var ch = c.chain, r = c.rec;
  var importCount = _csvParsed.filter(function(x) {
    var skip = document.getElementById('csv-skip-dupes') && document.getElementById('csv-skip-dupes').checked;
    return !(x._err || x.amount === 0) && !(x._dup && skip);
  }).length;
  var period = esc(bsDay(ch.from)) + ' – ' + esc(bsDay(ch.to));
  var sum = '<dl class="bs-sum">'
    + '<div><dt>Account</dt><dd>' + esc(acctName) + '</dd></div>'
    + '<div><dt>Period</dt><dd>' + period + '</dd></div>'
    + '<div><dt>Opening → closing</dt><dd class="bs-amt">' + bsCents(ch.openingCents) + ' → ' + bsCents(ch.closingCents) + '</dd></div>'
    + '<div><dt>Transactions</dt><dd>' + ch.order.length + ' in file, ' + importCount + ' to import</dd></div>'
    + '</dl>';
  var months = r.ctWrites.map(function(w) {
    return esc(bsMonth(w.month)) + (w.kind === 'asOf' ? ' (as of ' + esc(bsDay(w.date)) + ')' : '');
  }).join(', ');
  var writesNote = months ? '<p class="bs-p">Cash Tracker will record ' + months + '.</p>' : '';
  var firstNote = r.firstSync ? '<p class="bs-p bs-muted">First sync for this account: the file\'s opening balance becomes the starting point.</p>' : '';

  if (r.status === 'clean') {
    html = '<section class="bs-panel bs-panel--ok" aria-labelledby="bs-h">'
      + '<h3 class="bs-h" id="bs-h" tabindex="-1">' + ICON('circle-check') + ' Balances check out</h3>'
      + sum + writesNote + firstNote
      + '<div class="up-actions up-actions--wrap">' + cancelBtn + txOnlyBtn
      + '<button class="btn btn-primary" onclick="bsCommit(true)">' + ICON('circle-check-filled') + ' Import &amp; sync</button></div>'
      + '</section>';
    box.innerHTML = html;
    if (!keepFocus) bsFocusHeading();
    return;
  }

  // ── Needs review ──
  var issues = [];
  if (ch.chain === 'broken') {
    var lines = ch.brokenLines.concat(ch.invalidLines).sort(function(a, b) { return a - b; });
    issues.push('<h4 class="bs-h4">Balances don\'t follow on</h4>'
      + '<p class="bs-p">On ' + (lines.length === 1 ? 'line ' : 'lines ') + esc(lines.slice(0, 12).join(', ')) + (lines.length > 12 ? '…' : '')
      + ' of the file, the balance isn\'t the previous balance plus the amount. A row may be missing or edited.</p>');
  }
  if (r.gapCents) {
    var gapHtml = '<h4 class="bs-h4">Opening balance differs by <span class="bs-amt">' + bsCents(Math.abs(r.gapCents)) + '</span></h4>'
      + '<dl class="bs-sum">'
      + '<div><dt>File opening</dt><dd class="bs-amt">' + bsCents(ch.openingCents) + '</dd></div>'
      + '<div><dt>Expected by Kelda</dt><dd class="bs-amt">' + bsCents(r.expectedOpeningCents) + '</dd></div>'
      + '</dl>'
      + '<p class="bs-p">Kelda\'s last synced balance was ' + bsCents(r.prior.cents) + ' on ' + esc(bsDay(r.prior.date)) + '. ';
    if (r.rolled.length) {
      gapHtml += 'These Kelda transactions on this account fall between then and the file:</p>' + bsList(r.rolled, bsTxLine);
    } else {
      gapHtml += 'Kelda has no transactions on this account between then and the file, so one may be missing'
        + (r.gapCents > 0 ? ' (money in).' : ' (money out).') + '</p>';
    }
    issues.push(gapHtml);
  }
  if (r.extras.length) {
    issues.push('<h4 class="bs-h4">In Kelda but not in this file</h4>'
      + '<p class="bs-p">These transactions on this account fall inside the file\'s dates but the bank doesn\'t list them. They may be manual entries or duplicates.</p>'
      + bsList(r.extras, bsTxLine));
  }
  if (r.conflicts.length) {
    issues.push('<h4 class="bs-h4">Disagrees with an earlier sync</h4>'
      + '<p class="bs-p bs-muted">Earlier sync → this file</p>'
      + bsList(r.conflicts, function(x) {
        return '<span class="bs-li-date">' + esc(bsDay(x.date)) + '</span> <span class="bs-amt">' + bsCents(x.previousCents)
          + '</span> → <span class="bs-amt">' + bsCents(x.fileCents) + '</span>';
      }));
  }
  if (r.ctChanges.length) {
    issues.push('<h4 class="bs-h4">Cash Tracker balances that would change</h4>'
      + bsList(r.ctChanges, function(x) {
        return '<span class="bs-li-date">' + esc(bsMonth(x.month)) + '</span> <span class="bs-amt">' + bsCents(x.existingCents) + '</span> → <span class="bs-amt">'
          + bsCents(x.fileCents) + '</span>';
      }));
  }
  var skipNote = r.ctSkips.length
    ? '<p class="bs-p bs-muted">' + r.ctSkips.map(function(x) { return esc(bsMonth(x.month)); }).join(', ')
      + ': Cash Tracker already has a newer balance, so it\'s left as is.</p>'
    : '';

  html = '<section class="bs-panel bs-panel--review" aria-labelledby="bs-h">'
    + '<h3 class="bs-h" id="bs-h" tabindex="-1">' + ICON('alert-triangle') + ' Needs review</h3>'
    + '<p class="bs-p">Nothing has been saved yet. Check the differences below before syncing balances.</p>'
    + sum + issues.join('') + writesNote + skipNote + firstNote
    + '<label class="bs-ack"><input type="checkbox" id="bs-ack" onchange="bsAckChanged(this)"/> '
    + '<span>I\'ve checked the differences. Sync balances from this file anyway.</span></label>'
    + '<div class="up-actions up-actions--wrap">' + cancelBtn + txOnlyBtn
    + '<button class="btn btn-primary" id="bs-sync-btn" onclick="bsCommit(true)" disabled>' + ICON('circle-check-filled') + ' Import &amp; sync balances</button></div>'
    + '</section>';
  box.innerHTML = html;
  if (!keepFocus) bsFocusHeading();
}

function bsFocusHeading() {
  var h = document.getElementById('bs-h');
  if (h) { try { h.focus({ preventScroll: false }); } catch (e) { h.focus(); } }
}
function bsAckChanged(cb) {
  var b = document.getElementById('bs-sync-btn');
  if (b) b.disabled = !cb.checked;
}
function bsCancel() {
  _bsCheck = null;
  csvReset();
  var drop = document.getElementById('csv-drop');
  if (drop) { if (!drop.hasAttribute('tabindex')) drop.setAttribute('tabindex', '-1'); drop.focus(); }
  toast('Import cancelled. Nothing was changed.');
}

// Commits the import. syncBalances=false imports transactions only (no balance writes).
// Everything written is snapshotted first; any failure restores all of it, and the
// undo toast restores the same snapshot.
function bsCommit(syncBalances) {
  var c = _bsCheck;
  if (!c) return;
  if (syncBalances && (c.reason || !c.rec)) return;
  if (syncBalances && c.rec.status !== 'clean') {
    var ack = document.getElementById('bs-ack');
    if (!ack || !ack.checked) { toast('⚠️ Tick the box to confirm the differences first'); return; }
  }
  var snap = bsSnapshot();
  var batchId = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  var count = 0, months = [];
  try {
    count = csvCommitRows({ account: c.acctId, batch: batchId });
    if (syncBalances) {
      var ch = c.chain, r = c.rec;
      var store = bsLoadStore();
      store.anchors[c.acctId] = BalanceSync.mergeAnchors(store.anchors[c.acctId], BalanceSync.anchorsFor(ch, r.closings, batchId, today()));
      store.log.unshift({
        batchId: batchId, accountId: c.acctId, fileName: c.fileName, from: ch.from, to: ch.to,
        openingCents: ch.openingCents, closingCents: ch.closingCents,
        expectedOpeningCents: r.expectedOpeningCents, gapCents: r.gapCents,
        chain: ch.chain, brokenRows: ch.brokenLines.concat(ch.invalidLines),
        status: r.status === 'clean' ? 'synced' : 'synced-with-gap', imported: count, at: new Date().toISOString()
      });
      if (store.log.length > BS_LOG_CAP) store.log = store.log.slice(0, BS_LOG_CAP);
      if (!saveChecked(K.balanceSync, store)) throw new Error('Could not save balance sync');

      if (!CT[c.acctId]) CT[c.acctId] = {};
      if (!CT_DATES[c.acctId]) CT_DATES[c.acctId] = {};
      r.ctWrites.forEach(function(w) {
        CT[c.acctId][w.month] = w.cents / 100;
        CT_DATES[c.acctId][w.month] = w.date;
        months.push(w.month);
      });
      if (!saveChecked(K.ct, CT) || !saveChecked(K.ctdates, CT_DATES)) throw new Error('Could not save Cash Tracker');
      if (typeof nwRefreshMonths === 'function') nwRefreshMonths(months);
    }
  } catch (e) {
    console.warn('Balance sync import failed', e);
    bsRestore(snap);
    toast('⚠️ Import failed, so nothing was changed. Try again, or free up storage by exporting a backup.');
    return;
  }

  _bsCheck = null;
  if (syncBalances && c.acctId === 'offset' && typeof syncOffsetToMortgage === 'function') {
    try { syncOffsetToMortgage(); } catch (e) {}
  }
  csvFinishImport(count);
  if (typeof showUndoToast === 'function') {
    var msg = syncBalances
      ? 'Imported ' + count + ' · balances synced for ' + (c.acct ? c.acct.name : c.acctId)
      : 'Imported ' + count + ' transaction' + (count !== 1 ? 's' : '');
    showUndoToast(msg, 10000, function() {
      bsRestore(snap);
      try { renderTx(); } catch (e) {}
      try { renderDashboard(); } catch (e) {}
      if (c.acctId === 'offset' && typeof syncOffsetToMortgage === 'function') { try { syncOffsetToMortgage(); } catch (e) {} }
      toast('Import undone');
    });
  }
}

// Deep copies of every store an import can touch.
function bsSnapshot() {
  return {
    tx: JSON.stringify(TX), ct: JSON.stringify(CT), ctDates: JSON.stringify(CT_DATES),
    bs: JSON.stringify(load(K.balanceSync)), nw: JSON.stringify(load('cff_networth_history')),
    lastImport: JSON.stringify(load(K.lastCsvImport))
  };
}
function bsRestore(s) {
  TX = JSON.parse(s.tx); CT = JSON.parse(s.ct); CT_DATES = JSON.parse(s.ctDates);
  save(K.tx, TX); save(K.ct, CT); save(K.ctdates, CT_DATES);
  save(K.balanceSync, JSON.parse(s.bs));
  save('cff_networth_history', JSON.parse(s.nw));
  save(K.lastCsvImport, JSON.parse(s.lastImport));
}
