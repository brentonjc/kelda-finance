// Unit tests for the CSV import logic in js/pages/export.js: parsing, column guesses,
// dates, and American Express files (multi-line cells, purchases as positive amounts).
// Run: node --test "tests/**/*.test.js"
// Every row here is made up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Load export.js as a classic script. The wizard's DOM is reduced to the mapping
// table body, whose rendered <select>s are read back the way csvPreview reads them,
// and step 2's "Positive amounts are spending" checkbox.
function loadApp({ withAutoCat = false } = {}) {
  const tbody = { innerHTML: '' };
  const posSpend = { checked: false };
  const fileInput = { value: '' };
  const errBox = { textContent: '', hidden: true };
  const noteBox = { textContent: '', hidden: true };
  const store = {};
  const ctx = {
    console,
    K: {},
    TX: [],
    LCATS: [{ id: 'food', name: 'Food & Eating Out' }, { id: 'other', name: 'Other' }],
    catIdFor: (name) => (name === 'Food & Eating Out' ? 'food' : 'other'),
    toasts: [],
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      key: (i) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    },
    document: {
      getElementById: (id) => ({ 'csv-map-body': tbody, 'csv-pos-spend': posSpend, 'csv-file-input': fileInput, 'csv-err': errBox, 'csv-src-note': noteBox }[id] ?? null),
      querySelectorAll: (sel) => {
        if (sel !== '#csv-map-body select') return [];
        return [...tbody.innerHTML.matchAll(/<select data-col="([^"]*)"[^>]*>([\s\S]*?)<\/select>/g)]
          .map(([, col, opts]) => {
            const picked = opts.match(/<option value="([^"]*)" selected>/);
            return { dataset: { col }, value: picked ? picked[1] : '' };
          });
      },
    },
  };
  ctx.posSpend = posSpend;
  ctx.errBox = errBox;
  ctx.noteBox = noteBox;
  ctx.store = store;
  ctx.window = ctx;
  vm.createContext(ctx);
  const run = (file) => vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  if (withAutoCat) {
    delete ctx.K;
    run('js/storage.js');
    vm.runInContext('var LRULES = load(K.rules) || {};', ctx);
    run('js/pages/autocategorise.js');
    ctx.seedLRulesFromCSV();   // as unlocking the app does
  } else {
    // export.js escapes CSV text with storage.js's esc() and remembers column
    // choices with load()/save(); load just those helpers
    const storageSrc = fs.readFileSync(path.join(ROOT, 'js/storage.js'), 'utf8');
    for (const fn of ['esc', 'load', 'save']) {
      vm.runInContext(storageSrc.match(new RegExp('^function ' + fn + '\\(.*$', 'm'))[0], ctx);
    }
    ctx.K.csvMaps = 'cff_csv_maps';
  }
  // Every import path parses money with BalanceSync.parseCents
  run('js/pages/balancesync.js');
  run('js/pages/export.js');
  ctx.toast = (m) => ctx.toasts.push(m);
  ctx.csvGoStep = () => {};
  ctx.csvRefreshPreview = () => {};
  return ctx;
}

// Run a file through the wizard: read, guess the mapping, preview.
// `onStep2` runs between them, where the user would change the mapping step.
function importText(ctx, text, onStep2 = () => {}) {
  ctx.FileReader = function () {
    this.readAsText = () => this.onload({ target: { result: text } });
  };
  ctx.csvProcess({ name: 'activity.csv' });
  onStep2(ctx);
  ctx.csvPreview();
  return { map: mappingOf(ctx), rows: JSON.parse(JSON.stringify(vm.runInContext('_csvParsed', ctx))) };
}

function mappingOf(ctx) {
  const map = {};
  for (const s of ctx.document.querySelectorAll('#csv-map-body select')) if (s.value) map[s.value] = s.dataset.col;
  return map;
}

const AMEX = [
  'Date,Date Processed,Description,Card Member,Account #,Amount,Extended Details,Appears On Your Statement As,Address,Town/City,Postcode,Country,Reference,Category',
  '03/09/2026,04/09/2026,BEANS CAFE SURRY HILLS,A N OTHER,-12345,12.50,"BEANS CAFE',
  'SURRY HILLS NSW",BEANS CAFE SURRY HILLS,"1 MADE UP ST',
  'SURRY HILLS",SURRY HILLS NSW,2010,AUSTRALIA,\'AT262460000000000000001\',Restaurant-Restaurant',
  '04/09/2026,04/09/2026,PAYMENT RECEIVED - THANK YOU,A N OTHER,-12345,-500.00,,PAYMENT RECEIVED - THANK YOU,,,,,\'AT262470000000000000002\',',
  '05/09/2026,06/09/2026,"EXAMPLE STORE ""ONLINE""",A N OTHER,-12345,"1,089.95",,EXAMPLE STORE,,SYDNEY,2000,AUSTRALIA,\'AT262480000000000000003\',Merchandise & Supplies-Internet Purchase',
].join('\r\n');

test('csvParse keeps line breaks, commas and doubled quotes inside quoted cells', () => {
  const ctx = loadApp();
  const { headers, rows } = ctx.csvParse(AMEX);
  assert.equal(headers.length, 14);
  assert.equal(rows.length, 3);
  assert.equal(rows[0]['Extended Details'], 'BEANS CAFE SURRY HILLS NSW');
  assert.equal(rows[0].Address, '1 MADE UP ST SURRY HILLS');
  assert.equal(rows[0].Category, 'Restaurant-Restaurant');
  assert.equal(rows[2].Description, 'EXAMPLE STORE "ONLINE"');
  assert.equal(rows[2].Amount, '1,089.95');
});

test('csvParse strips a byte-order mark and skips title rows above the header', () => {
  const ctx = loadApp();
  const { headers, rows } = ctx.csvParse('﻿Transaction history\nCard ending 0000\n\nDate,Description,Amount\n01/09/2026,TEST,5.00\n');
  assert.deepEqual([...headers], ['Date', 'Description', 'Amount']);
  assert.equal(rows.length, 1);
});

test('csvParse still reads a plain bank file, with the first row as the header', () => {
  const ctx = loadApp();
  const { headers, rows } = ctx.csvParse('Date,Amount,Description\n01/09/2026,-20.00,SHOP\n02/09/2026,100.00,PAY\n');
  assert.deepEqual([...headers], ['Date', 'Amount', 'Description']);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].Description, 'PAY');
});

test('an Amex file maps Description to merchant and leaves reference, category and address unmapped', () => {
  const ctx = loadApp();
  const { map } = importText(ctx, AMEX);
  assert.deepEqual(map, { date: 'Date', name: 'Description', amount: 'Amount', desc: 'Extended Details' });
  assert.equal(ctx.toasts.length, 1);
});

test('an Amex file imports purchases as expenses and payments as income', () => {
  const ctx = loadApp();
  const { rows } = importText(ctx, AMEX);
  assert.deepEqual(rows.map((r) => [r.date, r.type, r.amount, r.name, r._err]), [
    ['2026-09-03', 'expense', 12.5, 'BEANS CAFE SURRY HILLS', null],
    ['2026-09-04', 'income', 500, 'PAYMENT RECEIVED - THANK YOU', null],
    ['2026-09-05', 'expense', 1089.95, 'EXAMPLE STORE "ONLINE"', null],
  ]);
  assert.equal(rows[0].description, 'BEANS CAFE SURRY HILLS NSW');
});

test('an Amex repayment is filed as a credit card payment, not income', () => {
  const ctx = loadApp({ withAutoCat: true });
  const { rows } = importText(ctx, AMEX);
  assert.deepEqual([rows[1].catId, rows[1].subcat], ['transfers', 'Credit Card Payment']);
});

test('an Amex amount header with a currency suffix is still mapped', () => {
  const ctx = loadApp();
  const { map, rows } = importText(ctx, 'Date,Description,Amount (AUD),Extended Details\n01/09/2026,SHOP,20.00,\n');
  assert.equal(map.amount, 'Amount (AUD)');
  assert.equal(rows[0].type, 'expense');
});

test('a bank file keeps its signs: negative is spending', () => {
  const ctx = loadApp();
  const { rows } = importText(ctx, 'Date,Amount,Description\n01/09/2026,-20.00,SHOP\n02/09/2026,100.00,PAY\n');
  assert.deepEqual(rows.map((r) => [r.type, r.amount]), [['expense', 20], ['income', 100]]);
  assert.equal(ctx.toasts.length, 0);
});

test('an Amex file ticks "Positive amounts are spending"; a bank file leaves it unticked', () => {
  const amex = loadApp();
  importText(amex, AMEX);
  assert.equal(amex.posSpend.checked, true);
  const bank = loadApp();
  bank.posSpend.checked = true;   // left over from an earlier file
  importText(bank, 'Date,Amount,Description\n01/09/2026,-20.00,SHOP\n');
  assert.equal(bank.posSpend.checked, false);
});

test('starting over unticks the box', () => {
  const ctx = loadApp();
  importText(ctx, AMEX);
  ctx.csvReset();
  assert.equal(ctx.posSpend.checked, false);
});

test('unticking the box on an Amex file keeps the file\'s signs', () => {
  const ctx = loadApp();
  const { rows } = importText(ctx, AMEX, (c) => { c.posSpend.checked = false; });
  assert.deepEqual(rows.map((r) => [r.type, r.amount]), [['income', 12.5], ['expense', 500], ['income', 1089.95]]);
});

test('ticking the box on a card file with a single Amount column imports positive amounts as spending', () => {
  const ctx = loadApp();
  const { rows } = importText(ctx, 'Date,Amount,Description\n01/09/2026,45.00,SHOP\n02/09/2026,-300.00,PAYMENT THANK YOU\n',
    (c) => { c.posSpend.checked = true; });
  assert.deepEqual(rows.map((r) => [r.type, r.amount]), [['expense', 45], ['income', 300]]);
});

test('Debit/Credit columns ignore the box', () => {
  const text = 'Date,Description,Debit,Credit\n01/09/2026,SHOP,45.00,\n02/09/2026,PAY,,300.00\n';
  for (const ticked of [false, true]) {
    const ctx = loadApp();
    const { map, rows } = importText(ctx, text, (c) => { c.posSpend.checked = ticked; });
    assert.deepEqual([map.debit, map.credit, map.amount], ['Debit', 'Credit', undefined]);
    assert.deepEqual(rows.map((r) => [r.type, r.amount]), [['expense', 45], ['income', 300]]);
  }
});

test('the first matching column keeps a field; NAB-style "Transaction" columns are not dates', () => {
  const ctx = loadApp();
  const { map } = importText(ctx,
    'Date,Amount,Account Number,,Transaction Type,Transaction Details,Balance,Category,Merchant Name\n'
    + '01/09/2026,-20.00,000000000,,EFTPOS,SHOP 1,100.00,Shopping,SHOP\n');
  assert.equal(map.date, 'Date');
  assert.equal(map.type, 'Transaction Type');
  assert.equal(map.desc, 'Transaction Details');
  assert.equal(map.name, 'Merchant Name');
});

test('csvDate reads day-first numbers and month names without shifting the day', () => {
  const ctx = loadApp();
  assert.equal(ctx.csvDate('2026-10-08'), '2026-10-08');
  assert.equal(ctx.csvDate('8/10/2026'), '2026-10-08');
  assert.equal(ctx.csvDate('08 Oct 2026'), '2026-10-08');
  assert.equal(ctx.csvDate('8-Oct-26'), '2026-10-08');
  assert.equal(ctx.csvDate('Oct 8, 2026'), '2026-10-08');
  assert.equal(ctx.csvDate('08 Sept 2026'), '2026-09-08');
  assert.equal(ctx.csvDate('not a date'), null);
});

// ── Statement import fixes (2026-11) ───────────────────────────────────────

function processFile(ctx, name, text) {
  ctx.FileReader = function () {
    this.readAsText = () => this.onload({ target: { result: text } });
  };
  ctx.csvProcess({ name });
}

// Select a field for a column in the rendered mapping table, as the user would
function pick(ctx, col, field) {
  const tbody = ctx.document.getElementById('csv-map-body');
  tbody.innerHTML = tbody.innerHTML.replace(
    new RegExp('(<select data-col="' + col + '"[^>]*>)([\\s\\S]*?)(</select>)'),
    (_, open, opts, close) => open + opts.replace(' selected>', '>')
      .replace('<option value="' + field + '">', '<option value="' + field + '" selected>') + close);
}

test('the template\'s Merchant column and the plain "name" header map to merchant', () => {
  const ctx = loadApp();
  assert.equal(ctx.csvGuess('name'), 'name');
  assert.equal(ctx.csvGuess('Merchant'), 'name');
  const text = ctx.csvTemplateRows().map((r) => r.map(ctx.csvCell).join(',')).join('\n');
  const { map, rows } = importText(ctx, text);
  assert.deepEqual(map, { date: 'Date', name: 'Merchant', desc: 'Description', amount: 'Amount', cat: 'Category', subcat: 'Subcategory' });
  assert.deepEqual(rows.map((r) => [r.date, r.type, r.amount, r.name, r._err]).slice(0, 2), [
    ['2026-03-14', 'expense', 127.5, 'Woolworths', null],
    ['2026-03-15', 'income', 3200, 'Employer Pty Ltd', null],
  ]);
  // A blank category is filled in rather than imported blank
  assert.ok(rows[2].category);
});

test('template category names come from the user\'s own categories', () => {
  const ctx = loadApp();
  ctx.LCATS = [{ id: 'food_eating_out', name: 'Groceries & Dining' }];
  assert.equal(ctx.csvTemplateRows()[1][4], 'Groceries & Dining');
});

test('impossible dates are rejected', () => {
  const ctx = loadApp();
  assert.equal(ctx.csvDate('31/02/2026'), null);
  assert.equal(ctx.csvDate('29/02/2027'), null);
  assert.equal(ctx.csvDate('29/02/2028'), '2028-02-29');
  assert.equal(ctx.csvDate('2026-13-01'), null);
  assert.equal(ctx.csvDate('3/14/2026'), null);       // day first: month 14
  assert.equal(ctx.csvDate('31 Feb 2026'), null);
  assert.equal(ctx.csvDate('14.03.2026'), '2026-03-14');
});

test('a file with month-first dates is read month first', () => {
  const ctx = loadApp();
  assert.equal(ctx.csvDateOrder(['3/14/2026', '3/2/2026']), 'mdy');
  assert.equal(ctx.csvDateOrder(['14/3/2026', '2/3/2026']), 'dmy');
  assert.equal(ctx.csvDateOrder(['2/3/2026']), 'dmy');            // can't tell: Australian order
  const { rows } = importText(ctx, 'Date,Amount,Description\n3/14/2026,-5.00,A\n3/2/2026,-6.00,B\n');
  assert.deepEqual(rows.map((r) => r.date), ['2026-03-14', '2026-03-02']);
  assert.ok(ctx.toasts.some((t) => /month first/.test(t)));
});

test('a row with an impossible date is marked, not imported with a bad date', () => {
  const ctx = loadApp();
  const { rows } = importText(ctx, 'Date,Amount,Description\n31/02/2026,-5.00,A\n01/03/2026,-6.00,B\n');
  assert.deepEqual(rows.map((r) => [r.date, r._err]), [[null, 'Invalid date'], ['2026-03-01', null]]);
});

test('amounts: trailing minus, CR/DR, brackets and comma decimals keep their value and sign', () => {
  const ctx = loadApp();
  assert.equal(ctx.csvDollar('100.00-'), -100);
  assert.equal(ctx.csvDollar('-1.234,56'), -1234.56);
  assert.equal(ctx.csvDollar('12,50'), 12.5);
  assert.equal(ctx.csvDollar('1,234'), 1234);
  assert.equal(ctx.csvDollar('$1,234.56'), 1234.56);
  assert.equal(ctx.csvDollar('(12.00)'), -12);
  assert.equal(ctx.csvDollar('45.00 DR'), -45);
  assert.equal(ctx.csvDollar('45.00 CR'), 45);
  assert.ok(Number.isNaN(ctx.csvDollar('12.34abc')));
  assert.ok(Number.isNaN(ctx.csvDollar('')));
});

test('an unterminated quote stops the import with the line number instead of dropping rows', () => {
  const ctx = loadApp();
  const r = ctx.csvParse('Date,Amount,Description\n01/10/2026,-5.00,"Unclosed\n02/10/2026,-6.00,Coles\n');
  assert.equal(r.rows.length, 0);
  assert.match(r.error, /^Line 2 opens a quote/);
  processFile(ctx, 'bad.csv', 'Date,Amount,Description\n01/10/2026,-5.00,"Unclosed\n');
  assert.equal(ctx.errBox.hidden, false);
  assert.match(ctx.errBox.textContent, /Line 2/);
});

test('a CSV with no header row (CommBank style) keeps its first transaction and names the columns', () => {
  const ctx = loadApp();
  const text = '01/10/2026,"-5.00","BEANS CAFE SYDNEY","+995.00"\n02/10/2026,"+1000.00","SALARY EMPLOYER","+1995.00"\n';
  const p = ctx.csvParse(text);
  assert.equal(p.headerless, true);
  assert.deepEqual([...p.headers], ['Date', 'Amount', 'Description', 'Balance']);
  assert.equal(p.rows.length, 2);
  processFile(ctx, 'commbank.csv', text);
  assert.equal(ctx.noteBox.hidden, false);
  assert.deepEqual(mappingOf(ctx), { date: 'Date', amount: 'Amount', desc: 'Description', balance: 'Balance' });
});

test('spreadsheet and other files get a specific message', () => {
  const ctx = loadApp();
  processFile(ctx, 'statement.xlsx', '');
  assert.match(ctx.errBox.textContent, /Save As › CSV/);
  processFile(ctx, 'photo.jpg', '');
  assert.match(ctx.errBox.textContent, /CSV files and PDF statements/);
});

test('a file with no transactions says what Kelda looked for and what it found', () => {
  const ctx = loadApp();
  processFile(ctx, 'odd.csv', 'Account summary for October\n');
  assert.match(ctx.errBox.textContent, /No transactions found[\s\S]*Account summary/);
});

test('confirmed columns are remembered for the next file with the same header row', () => {
  const ctx = loadApp();
  const text = 'When,Value,Payee,Memo\n01/10/2026,45.00,SHOP,x\n';
  importText(ctx, text, (c) => {
    pick(c, 'When', 'date');
    pick(c, 'Value', 'amount');
    c.posSpend.checked = true;
  });
  assert.equal(Object.keys(JSON.parse(ctx.store.cff_csv_maps)).length, 1);
  ctx.csvReset();
  const again = importText(ctx, text);
  assert.equal(again.map.date, 'When');
  assert.equal(again.map.amount, 'Value');
  assert.equal(ctx.posSpend.checked, true);
  assert.equal(again.rows[0].type, 'expense');
  assert.match(ctx.noteBox.textContent, /last time/);
});

test('headerless files don\'t save a mapping', () => {
  const ctx = loadApp();
  importText(ctx, '01/10/2026,-5.00,SHOP,995.00\n02/10/2026,-6.00,SHOP 2,989.00\n');
  assert.equal(ctx.store.cff_csv_maps, undefined);
});

test('description-only files: different payees on the same date and amount aren\'t duplicates', () => {
  const ctx = loadApp({ withAutoCat: true });
  const existing = [{ date: '2026-10-01', amount: 5, name: '', description: 'BEANS CAFE SYDNEY' }];
  assert.equal(ctx.AutoCat.isDuplicate('2026-10-01', 5, '', existing, 'BAKERY NEWTOWN'), false);
  assert.equal(ctx.AutoCat.isDuplicate('2026-10-01', 5, '', existing, 'BEANS CAFE SYDNEY'), true);
  // A merchant typed by hand still matches the bank's longer text
  assert.equal(ctx.AutoCat.isDuplicate('2026-10-01', 5, 'beans cafe', existing, ''), true);
  // No text on one side: date and amount decide, as before
  assert.equal(ctx.AutoCat.isDuplicate('2026-10-01', 5, '', existing, ''), true);
});

test('text ending in a number isn\'t a date', () => {
  const ctx = loadApp();
  assert.equal(ctx.csvDate('Coles 2'), null);
  assert.equal(ctx.csvDate('Account 12345'), null);
  assert.equal(ctx.csvDate('Thu Oct 08 2026'), '2026-10-08');
});

test('a headerless file\'s account-number column isn\'t taken for money', () => {
  const ctx = loadApp();
  const p = ctx.csvParse('01/10/2026,12345678,-5.00,SHOP 1,995.00\n02/10/2026,12345678,-6.00,SHOP 2,989.00\n');
  assert.deepEqual([...p.headers], ['Date', 'Column 2', 'Amount', 'Description', 'Balance']);
});
