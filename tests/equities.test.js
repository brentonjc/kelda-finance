// Unit tests for the pure investment logic in js/pages/equities.js: holdings grouped by code,
// shared prices, US$ prices, pasted prices, and the value and cost of RSUs and options.
// Run: node --test "tests/**/*.test.js"
// All holdings here are made up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const DAY = 86400000;

// Load the page scripts the way the browser does: classic scripts sharing one global scope.
// EQUITIES normally comes from data.js; here each test supplies its own holdings.
function loadApp(holdings) {
  const store = {};
  const ctx = {
    console,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      key: (i) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    },
    document: { getElementById: () => null, querySelectorAll: () => [] },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const file of ['js/storage.js', 'js/pages/equities.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  }
  ctx.EQUITIES = holdings || [];
  return ctx;
}

// Objects made inside the VM have that realm's prototypes; compare them as plain data.
const plain = (x) => JSON.parse(JSON.stringify(x));

// A YYYY-MM-DD date a whole number of years from today (negative = in the past).
function yearsFromToday(n) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
}

// One-vest grants: fully vested if granted a year or more ago, fully unvested if granted in future.
const rsu = (extra) => ({ id: 10, type: 'rsu', ticker: 'TEAM', company: 'Example Corp', exchange: 'NASDAQ',
  totalUnits: 100, grantDate: yearsFromToday(-2), cliffYears: 0, vestingYears: 1, vestFrequency: 'annual',
  currentPrice: 50, grantPrice: 40, sales: [], ...extra });
const option = (extra) => ({ id: 11, type: 'option', ticker: 'TEAM', company: 'Example Corp', exchange: 'NASDAQ',
  totalUnits: 1000, grantDate: yearsFromToday(-2), cliffYears: 0, vestingYears: 1, vestFrequency: 'annual',
  currentPrice: 50, strikePrice: 30, sales: [], ...extra });
const stock = (extra) => ({ id: 1, type: 'stock', ticker: 'CBA', company: 'Example Bank', exchange: 'ASX',
  qty: 100, cost: 95, currentPrice: 110, sales: [], ...extra });

test('holdings are keyed by code, ignoring case and an ASX .AX suffix', () => {
  const app = loadApp();
  assert.equal(app.eqSecKey({ type: 'stock', ticker: 'cba.ax' }), 'CBA');
  assert.equal(app.eqSecKey({ type: 'etf', ticker: ' VGS ' }), 'VGS');
  assert.equal(app.eqSecKey({ type: 'rsu', ticker: '', company: 'Example  Corp' }), 'name:example corp');
  assert.equal(app.eqSecKey({ type: 'bond', ticker: 'GB1', company: 'Govt Bond' }), '', 'bonds are never grouped');
});

test('one security per code, with the most recently set price', () => {
  const now = Date.now();
  const app = loadApp([
    stock({ id: 1, ticker: 'CBA', currentPrice: 110.2, priceUpdated: now - 45 * DAY }),
    stock({ id: 2, ticker: 'CBA.AX', qty: 50, currentPrice: 112.4, priceUpdated: now - 10 * DAY }),
    stock({ id: 3, ticker: 'VGS', type: 'etf', qty: 200, currentPrice: 98 }),
  ]);
  const secs = plain(app.eqSecurities());
  assert.deepEqual(secs.map((s) => s.key), ['CBA', 'VGS']);
  const cba = secs[0];
  assert.equal(cba.holdings.length, 2);
  assert.equal(cba.price, 112.4);
  assert.equal(cba.units, 150);
  assert.equal(cba.mixedPrices, true);
  assert.equal(cba.ccy, 'AUD');
  assert.equal(secs[1].mixedPrices, false);
});

test('RSUs and options on one code share a row; options are counted separately', () => {
  const app = loadApp([rsu(), option()]);
  const [team] = plain(app.eqSecurities());
  assert.equal(team.holdings.length, 2);
  assert.equal(team.units, 100);
  assert.equal(team.options, 1000);
});

test('US-listed codes are priced in US$ unless switched to A$', () => {
  const app = loadApp([rsu(), stock({ id: 2, ticker: 'MSFT', exchange: 'NYSE', priceCcy: 'AUD' })]);
  const byKey = Object.fromEntries(plain(app.eqSecurities()).map((s) => [s.key, s]));
  assert.equal(byKey.TEAM.ccy, 'USD');
  assert.equal(byKey.MSFT.ccy, 'AUD');
});

test('setting a price updates every holding with that code, and only those', () => {
  const holdings = [stock({ id: 1 }), stock({ id: 2, ticker: 'CBA.AX' }), stock({ id: 3, ticker: 'VGS' })];
  const app = loadApp(holdings);
  const when = Date.now();
  assert.equal(app.eqSetPrice('CBA', 118, when), 2);
  assert.deepEqual(holdings.map((h) => h.currentPrice), [118, 118, 110]);
  assert.deepEqual(holdings.map((h) => h.priceUpdated), [when, when, undefined]);
});

test('a US$ price keeps its quote and rate; a later A$ price drops them', () => {
  const holdings = [rsu(), option()];
  const app = loadApp(holdings);
  app.eqSetPrice('TEAM', app.eqToAud(255.1, 'USD', 1.52), 1, { price: 255.1, rate: 1.52 });
  assert.deepEqual(holdings.map((h) => [h.currentPrice, h.quotePrice, h.fxRate]),
    [[387.752, 255.1, 1.52], [387.752, 255.1, 1.52]]);
  assert.deepEqual(plain(app.eqSecurities()[0].quote), { price: 255.1, rate: 1.52 });
  app.eqSetPrice('TEAM', 390, 2);
  assert.deepEqual(holdings.map((h) => [h.currentPrice, h.quotePrice, h.fxRate]),
    [[390, undefined, undefined], [390, undefined, undefined]]);
});

test('switching a code to A$ drops its US$ quote', () => {
  const holdings = [rsu({ priceCcy: 'USD', quotePrice: 250, fxRate: 1.5 })];
  const app = loadApp(holdings);
  app.eqSetCcy('TEAM', 'AUD');
  assert.equal(holdings[0].priceCcy, 'AUD');
  assert.equal(holdings[0].quotePrice, undefined);
});

test('US$ converts at A$ per US$1, rounded to 4 decimals; A$ passes through', () => {
  const app = loadApp();
  assert.equal(app.eqToAud(255.1, 'USD', 1.52), 387.752);
  assert.equal(app.eqToAud(1, 'USD', 1.523456789), 1.5235);
  assert.equal(app.eqToAud(112.4, 'AUD', 1.52), 112.4);
});

test('the saved exchange rate is read back, and ignored when missing or not positive', () => {
  const app = loadApp();
  assert.equal(app.eqFxRate(), null);
  app.save(app.EQ_FX_KEY, { usdAud: 1.52, updated: 5 });
  assert.deepEqual(plain(app.eqFxRate()), { usdAud: 1.52, updated: 5 });
  app.save(app.EQ_FX_KEY, { usdAud: 0 });
  assert.equal(app.eqFxRate(), null);
});

test('pasted price lines: codes, currency marks, thousands separators and unreadable lines', () => {
  const app = loadApp();
  const res = plain(app.eqParsePriceLines([
    'CBA 112.40',
    'VGS.AX, $98.12',
    'BTC\t121,500.25',
    'TEAM US$255.10',
    'MSFT 410.5 USD',
    'cba: A$113',
    'Code Price',
    '',
    'XYZ 0',
  ].join('\n')));
  assert.deepEqual(res.found, [
    { code: 'CBA', key: 'CBA', price: 112.4, ccy: null },
    { code: 'VGS.AX', key: 'VGS', price: 98.12, ccy: null },
    { code: 'BTC', key: 'BTC', price: 121500.25, ccy: null },
    { code: 'TEAM', key: 'TEAM', price: 255.1, ccy: 'USD' },
    { code: 'MSFT', key: 'MSFT', price: 410.5, ccy: 'USD' },
    { code: 'CBA', key: 'CBA', price: 113, ccy: 'AUD' },
  ]);
  assert.equal(res.unread, 2, 'the header line and the zero price');
});

test('price age labels, and prices over 30 days old are stale', () => {
  const app = loadApp();
  const now = Date.now();
  assert.deepEqual(plain(app.eqPriceAge(now)), { label: 'today', stale: false });
  assert.deepEqual(plain(app.eqPriceAge(now - DAY)), { label: 'yesterday', stale: false });
  assert.deepEqual(plain(app.eqPriceAge(now - 30 * DAY)), { label: '30 days ago', stale: false });
  assert.deepEqual(plain(app.eqPriceAge(now - 31 * DAY)), { label: '31 days ago', stale: true });
  assert.deepEqual(plain(app.eqPriceAge(now - 90 * DAY)), { label: '3 months ago', stale: true });
  assert.equal(app.eqPriceAge(undefined).stale, true, 'no date counts as stale');
});

test('only securities still held or vesting are flagged stale', () => {
  const now = Date.now();
  const app = loadApp([
    stock({ id: 1, priceUpdated: now - 60 * DAY }),
    stock({ id: 2, ticker: 'OLD', priceUpdated: now - 60 * DAY, sales: [{ id: 1, qty: 100, price: 1 }] }),
    stock({ id: 3, ticker: 'VGS', priceUpdated: now }),
  ]);
  assert.deepEqual(plain(app.eqStaleSecurities().map((s) => s.key)), ['CBA']);
});

test('prices under $2 keep up to 4 decimals', () => {
  const app = loadApp();
  assert.equal(app.eqFmtPrice(1.2345), '$1.2345');
  assert.equal(app.eqFmtPrice(0.5), '$0.50');
  assert.equal(app.eqFmtPrice(112.4), '$112.40');
  assert.equal(app.eqFmtPrice(119000), '$119,000.00');
});

test('options are worth only the price above strike; RSUs and shares the full price', () => {
  const app = loadApp();
  assert.equal(app.eqUnitValue(option(), 50), 20);
  assert.equal(app.eqUnitValue(option(), 25), 0, 'underwater options are worth nothing');
  assert.equal(app.eqUnitValue(rsu(), 50), 50);
  assert.equal(app.eqHoldingValueAt(option(), 50), 20000);
  assert.equal(app.eqHoldingValueAt(rsu({ sales: [{ id: 1, qty: 20 }] }), 50), 4000, 'sold units are not held');
  assert.equal(app.eqHoldingValueAt(stock(), 118), 11800);
});

test('RSUs are costed at their vest price, so the gain is only the rise since vesting', () => {
  const app = loadApp();
  const grant = rsu({ currentPrice: 50, grantPrice: 40, sales: [{ id: 1, qty: 20 }] });
  assert.equal(app.eqHoldingCost(grant), 80 * 40);
  assert.equal(app.eqHoldingGain(grant), 80 * 10);
});

test('an RSU without a vest price adds nothing to the gain', () => {
  const app = loadApp();
  const grant = rsu({ grantPrice: 0 });
  assert.equal(app.eqHoldingCost(grant), 0);
  assert.equal(app.eqHoldingGain(grant), 0);
});

test('options cost nothing, so their gain is the value above strike; shares use their cost', () => {
  const app = loadApp();
  assert.equal(app.eqHoldingCost(option()), 0);
  assert.equal(app.eqHoldingGain(option()), 20000);
  assert.equal(app.eqHoldingCost(stock({ sales: [{ id: 1, qty: 40 }] })), 60 * 95);
});

test('vesting totals value options above strike and count only units still held', () => {
  const app = loadApp();
  const t = plain(app.eqVestTotals([
    rsu({ sales: [{ id: 1, qty: 20 }] }),
    option(),
    option({ id: 12, totalUnits: 500, grantDate: yearsFromToday(1) }),
  ]));
  assert.equal(t.totalUnits, 1600);
  assert.equal(t.vestedUnits, 1100);
  assert.equal(t.unvestedUnits, 500);
  assert.equal(t.vestedValue, 80 * 50 + 1000 * 20);
  assert.equal(t.unvestedValue, 500 * 20);
});

test('vesting by year values options above strike', () => {
  const app = loadApp();
  const grant = option({ totalUnits: 500, grantDate: yearsFromToday(1) });
  const byYear = plain(app.eqVestByYear([grant]));
  const year = String(new Date(grant.grantDate + 'T00:00:00').getFullYear());
  assert.deepEqual(byYear[year], { vestedUnits: 0, vestedValue: 0, unvestedUnits: 500, unvestedValue: 10000 });
});

test('holdings without a code are offered a link to the coded stock with the same name', () => {
  const app = loadApp([
    rsu({ id: 1, ticker: '', company: 'Example' }),
    rsu({ id: 2, ticker: 'TEAM', company: 'Example Corporation' }),
    stock({ id: 3, ticker: '', company: 'Unrelated Pty Ltd' }),
  ]);
  const links = app.eqLinkSuggestions(app.eqSecurities()).map((l) => [l.from.key, l.to.key]);
  assert.deepEqual(plain(links), [['name:example', 'TEAM']]);
});
