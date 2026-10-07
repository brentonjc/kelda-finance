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
// table body, whose rendered <select>s are read back the way csvPreview reads them.
function loadApp({ withAutoCat = false } = {}) {
  const tbody = { innerHTML: '' };
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
      getElementById: (id) => (id === 'csv-map-body' ? tbody : null),
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
  ctx.window = ctx;
  vm.createContext(ctx);
  const run = (file) => vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  if (withAutoCat) {
    delete ctx.K;
    run('js/storage.js');
    vm.runInContext('var LRULES = load(K.rules) || {};', ctx);
    run('js/pages/autocategorise.js');
    ctx.seedLRulesFromCSV();   // as unlocking the app does
  }
  run('js/pages/export.js');
  ctx.toast = (m) => ctx.toasts.push(m);
  ctx.csvGoStep = () => {};
  ctx.csvRefreshPreview = () => {};
  return ctx;
}

// Run a file through the wizard: read, guess the mapping, preview.
function importText(ctx, text) {
  ctx.FileReader = function () {
    this.readAsText = () => this.onload({ target: { result: text } });
  };
  ctx.csvProcess({ name: 'activity.csv' });
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
