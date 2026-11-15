// ══════════════════════════════════════════════════════════════
// PDF STATEMENTS. Reads a bank or card statement PDF on this device and
// turns it into the {headers, rows} table the CSV import uses, so the
// mapping, preview, duplicate check and balance sync are shared.
//
// Text comes out with pdf.js (assets/vendor/pdfjs, loaded only when a PDF
// is chosen). Everything below the loader is plain functions over text
// positions, so it's unit-tested without a browser.
//
// How a statement is read:
//   1. Text pieces are grouped into lines by height on the page, and pieces
//      close together on a line are joined into cells.
//   2. A line naming a date column and a money column (Debit, Credit,
//      Amount, Withdrawals, Balance…) is the column header. Its cell
//      positions say which column each amount below it belongs to.
//   3. A line starting with a date starts a transaction. Lines after it with
//      no date are more of its description (or carry its amounts).
//   4. Dates without a year take it from the statement period.
//   5. Signs: Debit/Credit columns decide; else -, (), DR and CR marks; else
//      the change in the running balance.
// ══════════════════════════════════════════════════════════════
// Append b to a in place (concat in a loop copies the whole array each time)
function pdfPushAll(a, b) { for (var i = 0; i < b.length; i++) a.push(b[i]); return a; }

var StatementPdf = (function() {

  var MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  // A month's abbreviation or full name, not any word starting with one ("2 MARKET ST")
  var MON_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';

  // ── 1. Lines and cells ──────────────────────────────────────

  // items: [{page, str, x, y, w, h}] in PDF units (y grows upwards).
  // → [{page, y, h, cells:[{x0, x1, text}], text}] top to bottom.
  function groupLines(items) {
    var pieces = items.filter(function(it) { return it && String(it.str).trim(); })
      .map(function(it) { return { page: it.page || 1, str: String(it.str), x: +it.x || 0, y: +it.y || 0, w: +it.w || 0, h: +it.h || 10 }; });
    pieces.sort(function(a, b) { return a.page - b.page || b.y - a.y || a.x - b.x; });
    var lines = [];
    pieces.forEach(function(p) {
      var last = lines[lines.length - 1];
      // Same line when baselines are within ~40% of the text height
      if (last && last.page === p.page && Math.abs(last.y - p.y) <= Math.max(2, 0.4 * Math.min(last.h, p.h))) last.pieces.push(p);
      else lines.push({ page: p.page, y: p.y, h: p.h, pieces: [p] });
    });
    return lines.map(function(l) {
      l.pieces.sort(function(a, b) { return a.x - b.x; });
      var cells = [];
      l.pieces.forEach(function(p) {
        var c = cells[cells.length - 1];
        var gap = c ? p.x - c.x1 : Infinity;
        // Word spaces join a cell; a column gap (over ~0.8 of the text height) starts a new one
        if (c && gap <= 0.8 * p.h) {
          c.text += (gap > 0.15 * p.h && !/\s$/.test(c.text) && !/^\s/.test(p.str) ? ' ' : '') + p.str;
          c.x1 = Math.max(c.x1, p.x + p.w);
        } else {
          cells.push({ x0: p.x, x1: p.x + p.w, text: p.str });
        }
      });
      cells.forEach(function(c) { c.text = c.text.replace(/\s+/g, ' ').trim(); });
      return { page: l.page, y: l.y, h: l.h, cells: cells, text: cells.map(function(c) { return c.text; }).join(' ') };
    });
  }

  // ── 2. Money ────────────────────────────────────────────────

  // An amount as statements print it: cents always shown, optional $, sign,
  // brackets, and CR/DR or a trailing minus. Reference numbers don't match.
  var MONEY_RE = /^\(?[-+]?\$?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\)?-?(?:CR|DR)?$/i;

  // Split a cell into its text and any amounts at its end:
  // "EFTPOS COLES 0123 12.50 CR" → text "EFTPOS COLES 0123", money ["12.50 CR"].
  // Each amount gets an x estimated from its place in the cell.
  function peelMoney(cell) {
    var toks = cell.text.split(' ');
    var money = [];
    var end = toks.length;
    while (end > 0) {
      var t = toks[end - 1], used = 1;
      var tag = '';
      if (/^(CR|DR)$/i.test(t) && end > 1) { tag = ' ' + t.toUpperCase(); t = toks[end - 2]; used = 2; }
      if (t === '$' ) break;
      if (end - used > 0 && toks[end - used - 1] === '$') { t = '$' + t; used++; }
      if (!MONEY_RE.test(t)) break;
      money.unshift({ str: t + tag, endTok: end, startTok: end - used });
      end -= used;
    }
    var text = toks.slice(0, end).join(' ');
    var len = cell.text.length || 1;
    var w = cell.x1 - cell.x0;
    money.forEach(function(m) {
      var before = toks.slice(0, m.startTok).join(' ').length + (m.startTok ? 1 : 0);
      var upto = toks.slice(0, m.endTok).join(' ').length;
      m.x0 = cell.x0 + w * before / len;
      m.x1 = cell.x0 + w * upto / len;
      delete m.endTok; delete m.startTok;
    });
    return { text: text, money: money };
  }

  // "12.50 CR" → {cents, marked} where marked says the text itself carried a sign.
  function readMoney(str) {
    var cents = BalanceSync.parseCents(str);
    var t = String(str).trim();
    return { cents: cents, marked: /^[(\-]|-$|(CR|DR)$/i.test(t), cr: /CR$/i.test(t), dr: /DR$/i.test(t) };
  }

  // ── 3. Dates ────────────────────────────────────────────────

  function ymd(y, m, d) {
    y = +y; m = +m; d = +d;
    if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1)) return null;
    if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function fullYear(y) { y = String(y); return y.length === 2 ? '20' + y : y; }
  function monthOf(s) { return MONTHS.indexOf(String(s).slice(0, 3).toLowerCase()) + 1; }

  // A date at the start of a line: {y|null, m, d, len}. Numeric dates are day first.
  var DATE_STARTS = [
    { re: /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?![\d])/, f: function(r) { return { d: r[1], m: r[2], y: fullYear(r[3]) }; } },
    { re: new RegExp('^(\\d{1,2})[ \\-]?' + MON_RE + '(?:[ \\-,]+(\\d{4}|\\d{2}))?(?![a-z\\d])', 'i'), f: function(r) { return { d: r[1], m: monthOf(r[2]), y: r[3] ? fullYear(r[3]) : null }; } },
    { re: new RegExp('^' + MON_RE + ' (\\d{1,2})(?:,? (\\d{4}))?(?![a-z\\d])', 'i'), f: function(r) { return { d: r[2], m: monthOf(r[1]), y: r[3] || null }; } },
    { re: /^(\d{1,2})\/(\d{1,2})(?![\/\d])/, f: function(r) { return { d: r[1], m: r[2], y: null }; } }
  ];
  function dateAtStart(text) {
    for (var i = 0; i < DATE_STARTS.length; i++) {
      var r = text.match(DATE_STARTS[i].re);
      if (r) {
        var o = DATE_STARTS[i].f(r);
        if (+o.m >= 1 && +o.m <= 12 && +o.d >= 1 && +o.d <= 31) { o.len = r[0].length; return o; }
      }
    }
    return null;
  }

  // Dates with a year anywhere on a line, for the statement period
  function fullDatesIn(text) {
    var out = [], r;
    var re1 = new RegExp('\\b(\\d{1,2})[ \\-]' + MON_RE + '[ \\-,]+(\\d{4})\\b', 'gi');
    while ((r = re1.exec(text))) { var a = ymd(r[3], monthOf(r[2]), r[1]); if (a) out.push(a); }
    var re2 = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
    while ((r = re2.exec(text))) { var b = ymd(r[3], r[2], r[1]); if (b) out.push(b); }
    var re3 = new RegExp('\\b' + MON_RE + ' (\\d{1,2}),? (\\d{4})\\b', 'gi');
    while ((r = re3.exec(text))) { var c = ymd(r[3], monthOf(r[1]), r[2]); if (c) out.push(c); }
    return out;
  }

  // The statement's date range: a line with two dates joined by "to" or a dash
  // ("Period 1 Jul 2026 to 30 Sep 2026"), else the span of every full date seen.
  function statementPeriod(lines, today) {
    var all = [];
    for (var i = 0; i < lines.length; i++) {
      var ds = fullDatesIn(lines[i].text);
      // "to", or a dash with spaces round it; "REF 12-34" on a transaction line isn't a range
      if (ds.length >= 2 && /\b(to|until|through)\b|\s[-–—]\s/i.test(lines[i].text)) {
        var s = ds.slice(0, 2).sort();
        return { start: s[0], end: s[1] };
      }
      pdfPushAll(all, ds);
    }
    if (all.length) {
      all.sort();
      return { start: null, end: all[all.length - 1] };
    }
    return { start: null, end: today };
  }

  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // Give a yearless day and month the year that puts it inside the statement
  // period (a period from December into January has two years).
  function withYear(m, d, period) {
    var endY = +period.end.slice(0, 4);
    var startY = period.start ? +period.start.slice(0, 4) : endY - 1;
    var lo = period.start ? addDays(period.start, -7) : addDays(period.end, -366);
    var hi = addDays(period.end, 7);
    for (var y = endY; y >= startY; y--) {
      var iso = ymd(y, m, d);
      if (iso && iso >= lo && iso <= hi) return iso;
    }
    return ymd(endY, m, d);
  }

  // ── 4. Column header ────────────────────────────────────────

  // What a header cell names. Order matters: "Transaction date" is a date,
  // "Transaction details" a description.
  function headerKind(text) {
    var s = text.toLowerCase();
    if (s.length > 40) return '';
    if (/balance/.test(s)) return 'balance';
    if (/\bdate\b|^when$/.test(s)) return 'date';
    if (/debit|withdraw|paid out|money out|^payments?\b|spent/.test(s)) return 'debit';
    if (/credit|deposit|paid in|money in|received/.test(s)) return 'credit';
    if (/amount|^value\b|^aud\b|\(\$\)|^\$$/.test(s)) return 'amount';
    if (/description|details|transaction|particulars|narrative|merchant|payee/.test(s)) return 'desc';
    return '';
  }

  // A header line: a date column, a money column, nothing that looks like an amount
  function readHeader(line) {
    if (line.cells.some(function(c) { return peelMoney(c).money.length; })) return null;
    var cols = [];
    line.cells.forEach(function(c) {
      var k = headerKind(c.text);
      if (k) cols.push({ kind: k, x0: c.x0, x1: c.x1 });
    });
    var kinds = cols.map(function(c) { return c.kind; });
    var money = kinds.filter(function(k) { return /debit|credit|amount|balance/.test(k); });
    if (kinds.indexOf('date') < 0 || !money.length || cols.length < 3) return null;
    return cols;
  }

  // The money column an amount sits under: amounts are usually right-aligned
  // with their heading, so compare right edges and centres.
  function columnFor(m, cols) {
    var best = null, bestD = Infinity;
    cols.forEach(function(c) {
      if (!/debit|credit|amount|balance/.test(c.kind)) return;
      var d = Math.min(Math.abs(m.x1 - c.x1), Math.abs((m.x0 + m.x1) / 2 - (c.x0 + c.x1) / 2));
      if (d < bestD) { bestD = d; best = c.kind; }
    });
    return best;
  }

  // ── 5. Transactions ─────────────────────────────────────────

  var SKIP_RE = /^(opening|closing) balance|balance (brought|carried) forward|^(brought|carried) forward|^total|^sub ?total|^page \d+|^continued/i;
  var OPENING_RE = /^opening balance|balance brought forward|^brought forward/i;

  // lines → {headers, rows, meta}. opts.today (YYYY-MM-DD) is the fallback year.
  function parseLines(lines, opts) {
    opts = opts || {};
    var today = opts.today || new Date().toISOString().slice(0, 10);
    var period = statementPeriod(lines, today);
    var cols = null;
    var txs = [];
    var open = null;
    var openingCents = null;
    var lastPage = 0, lastY = 0;

    function close() { if (open) { txs.push(open); open = null; } }

    lines.forEach(function(line) {
      var hdr = readHeader(line);
      if (hdr) { cols = hdr; close(); lastPage = line.page; return; }

      // A page change, or a big vertical gap, ends the current description
      var gap = line.page !== lastPage ? Infinity : lastY - line.y;
      lastPage = line.page; lastY = line.y;
      if (open && gap > 3 * line.h) close();

      var dt = dateAtStart(line.text);
      // Pull amounts out of every cell; what's left is description text
      var money = [], textParts = [];
      line.cells.forEach(function(c, i) {
        var p = peelMoney(c);
        pdfPushAll(money, p.money);
        var t = p.text;
        if (i === 0 && dt) t = t.slice(Math.min(dt.len, t.length)).trim();
        if (t) textParts.push({ text: t, x0: c.x0 });
      });
      var text = textParts.map(function(t) { return t.text; }).join(' ');
      // A second date column (value or posting date) right after the first
      if (dt) {
        var dt2 = dateAtStart(text);
        if (dt2) text = text.slice(dt2.len).trim();
      }

      if (dt) {
        close();
        var date = dt.y ? ymd(dt.y, dt.m, dt.d) : withYear(dt.m, dt.d, period);
        if (SKIP_RE.test(text)) {
          if (OPENING_RE.test(text) && money.length) openingCents = readMoney(money[money.length - 1].str).cents;
          return;
        }
        if (!date) return;
        open = { date: date, desc: text, money: money, page: line.page };
        return;
      }

      if (!open) {
        if (OPENING_RE.test(text) && money.length) openingCents = readMoney(money[money.length - 1].str).cents;
        return;
      }
      if (SKIP_RE.test(text)) { close(); return; }
      // Amounts printed on a later line of a multi-line transaction. Only inside a
      // table with a column header: without one, a dated summary line such as the
      // statement period would pick up the next line's figures.
      if (money.length) {
        if (open.money.length || !cols) { close(); return; }
        open.money = money;
      }
      if (text && text.length < 120) open.desc = (open.desc + ' ' + text).trim();
    });
    close();

    // Give each amount its column
    var layout = 'none';
    if (cols) {
      var k = cols.map(function(c) { return c.kind; });
      layout = (k.indexOf('debit') >= 0 || k.indexOf('credit') >= 0) ? 'debitcredit' : 'amount';
    }
    var rows = [];
    txs.forEach(function(t) {
      if (!t.money.length) return;
      var r = { date: t.date, desc: t.desc, debit: null, credit: null, amount: null, balance: null };
      if (cols) {
        t.money.forEach(function(m) {
          var kind = columnFor(m, cols);
          if (kind && r[kind] === null) r[kind] = readMoney(m.str);
        });
      } else {
        // No header: one amount, or an amount and a running balance
        r.amount = readMoney(t.money[0].str);
        if (t.money.length > 1) r.balance = readMoney(t.money[t.money.length - 1].str);
      }
      if (r.debit === null && r.credit === null && r.amount === null) return;
      rows.push(r);
    });

    // Signs. Debit/Credit columns carry their own; a single amount column uses
    // its marks (-, (), DR, CR) when the statement has any, else the change in
    // the running balance, else stays unsigned for the user to decide.
    var anyMarked = rows.some(function(r) { return r.amount && r.amount.marked; });
    var anyCr = rows.some(function(r) { return r.amount && r.amount.cr; });
    var anyBal = rows.some(function(r) { return r.balance && r.balance.cents !== null; });
    var signUnknown = false, signFrom = 'columns';
    var prevBal = openingCents;
    rows.forEach(function(r) {
      var cents;
      if (r.debit || r.credit) {
        var d = r.debit && r.debit.cents !== null ? Math.abs(r.debit.cents) : 0;
        var c = r.credit && r.credit.cents !== null ? Math.abs(r.credit.cents) : 0;
        // A debit cell marked CR (rare) is a refund
        if (r.debit && r.debit.cr) { c += d; d = 0; }
        cents = c - d;
      } else {
        var a = r.amount.cents;
        if (anyCr && !r.amount.dr && !/^[(\-]|-$/.test(r.amount.str || '')) {
          // Card style: purchases plain, payments and refunds marked CR
          cents = r.amount.cr ? Math.abs(a) : -Math.abs(a);
          signFrom = 'marks';
        } else if (anyMarked) {
          cents = a;
          signFrom = 'marks';
        } else if (anyBal) {
          var bal = r.balance && r.balance.cents;
          if (prevBal !== null && bal !== null && bal !== undefined && Math.abs(Math.abs(bal - prevBal) - Math.abs(a)) <= 1) {
            cents = bal >= prevBal ? Math.abs(a) : -Math.abs(a);
          } else {
            cents = -Math.abs(a);
          }
          signFrom = 'balance';
        } else {
          cents = Math.abs(a);
          signUnknown = true;
          signFrom = 'unknown';
        }
      }
      r.cents = cents;
      if (r.balance && r.balance.cents !== null) prevBal = r.balance.cents;
    });

    var headers = anyBal ? ['Date', 'Description', 'Amount', 'Balance'] : ['Date', 'Description', 'Amount'];
    var out = rows.map(function(r) {
      var o = { Date: r.date, Description: r.desc, Amount: (r.cents / 100).toFixed(2) };
      if (anyBal) o.Balance = r.balance && r.balance.cents !== null ? (r.balance.cents / 100).toFixed(2) : '';
      return o;
    });
    return {
      headers: headers, rows: out,
      meta: { layout: layout, signFrom: signFrom, signUnknown: signUnknown, period: period, lines: lines.length }
    };
  }

  function parseItems(items, opts) { return parseLines(groupLines(items), opts); }

  return {
    groupLines: groupLines, parseLines: parseLines, parseItems: parseItems,
    peelMoney: peelMoney, dateAtStart: dateAtStart, statementPeriod: statementPeriod,
    withYear: withYear, headerKind: headerKind, MAX_PAGES: 200
  };
})();

// ── Reading the file (browser only) ──────────────────────────
var _pdfLib = null;     // promise of the pdf.js module, loaded once
var _pdfJob = 0;        // bumped by each new file and by Start over
var _pdfTask = null;    // the open pdf.js loading task

function pdfLoadLib() {
  if (!_pdfLib) {
    var base = document.baseURI;
    _pdfLib = import(new URL('assets/vendor/pdfjs/pdf.min.mjs', base).href).then(function(lib) {
      lib.GlobalWorkerOptions.workerSrc = new URL('assets/vendor/pdfjs/pdf.worker.min.mjs', base).href;
      return lib;
    }, function(e) { _pdfLib = null; throw e; });
  }
  return _pdfLib;
}

// Stop reading the current PDF (Start over, or another file chosen)
function pdfCancel() {
  _pdfJob++;
  if (_pdfTask) { try { _pdfTask.destroy(); } catch (e) {} _pdfTask = null; }
  pdfReading('');
}

function pdfReading(msg) {
  var box = document.getElementById('csv-reading');
  var txt = document.getElementById('csv-reading-msg');
  if (txt && msg) txt.textContent = msg;
  if (box) box.hidden = !msg;
}

// A page's text. pdf.js's own getTextContent() loops over a ReadableStream with
// for-await, which Safari (iOS 26 included) doesn't support, so read the
// stream with a plain reader instead.
async function pdfPageTextContent(page) {
  if (typeof page.streamTextContent !== 'function') return page.getTextContent();
  var reader = page.streamTextContent().getReader();
  var items = [];
  for (;;) {
    var chunk = await reader.read();
    if (chunk.done) break;
    if (chunk.value && chunk.value.items) pdfPushAll(items, chunk.value.items);
  }
  return { items: items };
}

// pdf.js text pieces → the {page, str, x, y, w, h} the parser reads
function pdfPageItems(content, page) {
  return content.items.filter(function(it) { return typeof it.str === 'string'; }).map(function(it) {
    var t = it.transform;
    return { page: page, str: it.str, x: t[4], y: t[5], w: it.width, h: it.height || Math.hypot(t[2], t[3]) || 10 };
  });
}

async function pdfImportFile(file) {
  pdfCancel();
  var job = _pdfJob;
  var stale = function() { return job !== _pdfJob; };
  pdfReading('Opening PDF…');
  var task = null;
  try {
    var lib = await pdfLoadLib();
    var data = await file.arrayBuffer();
    if (stale()) return;
    // No eval, no web fonts, no fetching: the file is only read for its text
    task = _pdfTask = lib.getDocument({ data: data, isEvalSupported: false, disableFontFace: true, enableXfa: false, stopAtErrors: false });
    task.onPassword = function(update, reason) {
      var pw = window.prompt(reason === 2 ? 'That password didn’t work. Enter the PDF’s password:' : 'This PDF is password-protected. Enter its password (it isn’t saved):');
      if (pw === null) { pdfCancel(); csvShowError('The PDF wasn’t opened because no password was entered.'); }
      else update(pw);
    };
    var doc = await task.promise;
    if (stale()) return;
    var n = doc.numPages;
    if (n > StatementPdf.MAX_PAGES) { csvShowError('This PDF has ' + n + ' pages. Kelda reads statements of up to ' + StatementPdf.MAX_PAGES + ' pages; download a shorter date range.'); return; }
    var items = [];
    for (var p = 1; p <= n; p++) {
      pdfReading('Reading page ' + p + ' of ' + n + '…');
      var page = await doc.getPage(p);
      var content = await pdfPageTextContent(page);
      if (stale()) return;
      pdfPushAll(items, pdfPageItems(content, p));
      page.cleanup();
    }
    if (!items.some(function(it) { return /\d/.test(it.str); })) {
      csvShowError('This PDF has no readable text. It’s probably a scanned or photographed statement, which Kelda can’t read. Download the statement from your bank’s website or app instead.');
      return;
    }
    var res = StatementPdf.parseItems(items, { today: typeof today === 'function' ? today() : undefined });
    if (!res.rows.length) {
      csvShowError('Kelda read ' + n + ' page' + (n !== 1 ? 's' : '') + ' but couldn’t find any transactions. Some statement layouts can’t be read yet. If your bank offers a CSV download, use that instead.');
      return;
    }
    var note = 'Read ' + res.rows.length + ' transaction' + (res.rows.length !== 1 ? 's' : '') + ' from ' + n + ' page' + (n !== 1 ? 's' : '') + ' of a PDF statement. Statement layouts vary, so check the dates, amounts and money in/out in the preview before importing.';
    if (res.meta.signUnknown) note += ' This statement doesn’t show which amounts are money in, so all are treated as spending. Untick “Positive amounts are spending” if that’s wrong.';
    pdfReading('');
    if (csvLoadTable(res, file.name, { synthetic: true, note: note }) && res.meta.signUnknown) csvSetPosSpend(true);
  } catch (e) {
    if (stale()) return;
    var msg = e && e.name === 'InvalidPDFException' ? 'This file isn’t a readable PDF. It may be damaged; try downloading it again.'
      : e && e.name === 'PasswordException' ? 'The PDF couldn’t be opened with that password.'
      : 'Kelda couldn’t read this PDF on this device. If your bank offers a CSV download, use that instead.';
    console.warn('PDF import:', e);
    csvShowError(msg);
  } finally {
    // Frees the worker's copy of the file
    if (task) { try { task.destroy(); } catch (e) {} }
    if (_pdfTask === task) _pdfTask = null;
    if (!stale()) pdfReading('');
  }
}
