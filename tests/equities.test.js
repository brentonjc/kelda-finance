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

// ── Buying and selling: parcels, matching, gains ───────────────
// Fixed dates in the past, so nothing depends on today.
function sellFixture() {
  return [
    stock({ id: 1, owner: 'brenton', purchaseDate: '2023-03-01', qty: 100, cost: 95 }),
    stock({ id: 2, owner: 'brenton', purchaseDate: '2026-01-10', qty: 50, cost: 120,
      sales: [{ id: 1, qty: 10, price: 118, date: '2026-02-01', costs: 0 }] }),
    stock({ id: 3, owner: 'shelley', purchaseDate: '2022-05-01', qty: 30, cost: 80 }),
    stock({ id: 4, owner: 'brenton', purchaseDate: '2026-09-01', qty: 20, cost: 130 }),
    option({ id: 5, owner: 'brenton', ticker: 'CBA' }),
    // Four annual vests of 100 (2021–2024); 150 already sold, so 50 of the 2022 vest is left
    rsu({ id: 6, owner: 'brenton', ticker: 'CBA', grantDate: '2021-01-15', totalUnits: 400, vestingYears: 4,
      grantPrice: 60, sales: [{ id: 2, qty: 150, price: 100, date: '2024-06-01', costs: 0 }] }),
  ];
}

test('the 12-month rule: the sale has to fall after the first anniversary', () => {
  const app = loadApp();
  assert.equal(app.eqHeld12Months('2024-07-01', '2025-06-30'), false);
  assert.equal(app.eqHeld12Months('2024-07-01', '2025-07-01'), false, 'the anniversary itself is not enough');
  assert.equal(app.eqHeld12Months('2024-07-01', '2025-07-02'), true);
  assert.equal(app.eqHeld12Months('', '2025-07-02'), false, 'an unknown purchase date never qualifies');
});

test('Australian financial years run 1 July to 30 June', () => {
  const app = loadApp();
  assert.deepEqual(plain(app.eqFinancialYear('2026-09-28')), { start: '2026-07-01', end: '2027-06-30', label: '2026–27' });
  assert.deepEqual(plain(app.eqFinancialYear('2027-06-30')), { start: '2026-07-01', end: '2027-06-30', label: '2026–27' });
  assert.equal(app.eqFinancialYear('2026-06-30').label, '2025–26');
});

test('a purchase costs the price paid plus its share of the brokerage', () => {
  const app = loadApp();
  assert.equal(app.eqBuyCost(100, 50, 20), 100.4);
  assert.equal(app.eqBuyCost(100, 50, 0), 100);
});

test('sales are measured against cost: shares at cost, RSUs at vest price, options at strike', () => {
  const app = loadApp();
  assert.equal(app.eqCostPerUnit(stock({ cost: 95 })), 95);
  assert.equal(app.eqCostPerUnit(rsu({ grantPrice: 60 })), 60);
  assert.equal(app.eqCostPerUnit(option({ strikePrice: 30 })), 30);
});

test("an owner's sellable parcels on a date, oldest first, with RSU vests as parcels", () => {
  const app = loadApp();
  const lots = app.eqSellableLots(sellFixture(), 'brenton', '2026-08-01')
    .map((l) => [l.h.id, l.acquired, l.available, l.costPerUnit, !!l.vest]);
  assert.deepEqual(plain(lots), [
    [6, '2022-01-15', 50, 60, true],     // the 2021 vest and half the 2022 one were sold earlier
    [6, '2023-01-15', 100, 60, true],
    [1, '2023-03-01', 100, 95, false],
    [6, '2024-01-15', 100, 60, true],
    [2, '2026-01-10', 40, 120, false],   // 10 of the 50 already sold
  ]);                                    // not Shelley's parcel, the option, or one bought after the sale date
});

test('selling takes the oldest parcels first, and fails when there are not enough units', () => {
  const app = loadApp();
  const lots = app.eqSellableLots(sellFixture(), 'brenton', '2026-08-01');
  const parts = app.eqAllocateFifo(lots, 180).map((p) => [p.lot.acquired, p.units]);
  assert.deepEqual(plain(parts), [['2022-01-15', 50], ['2023-01-15', 100], ['2023-03-01', 30]]);
  assert.equal(app.eqAllocateFifo(lots, 391), null, 'only 390 units are sellable');
});

test('a sale summary shares brokerage by units and splits the gain by holding period', () => {
  const app = loadApp();
  const lots = app.eqSellableLots(sellFixture(), 'brenton', '2026-08-01');
  const oldest = lots[2], newest = lots[4];   // the 2023 parcel (cost 95) and the 2026 one (cost 120)
  const s = plain(app.eqSaleSummary([{ lot: oldest, units: 30 }, { lot: newest, units: 30 }], 130, 12, '2026-08-01'));
  assert.equal(s.qty, 60);
  assert.deepEqual(s.parts.map((p) => [p.costs, p.proceeds, p.costBase, p.gain, p.held12]),
    [[6, 3894, 2850, 1044, true], [6, 3894, 3600, 294, false]]);
  assert.equal(s.gain, 1338);
  assert.equal(s.gainHeld12, 1044);
  assert.equal(s.gainUnder12, 294);
});

test('a sale across parcels is recorded on each and shows as one trade', () => {
  const holdings = sellFixture();
  const app = loadApp(holdings);
  const lots = app.eqSellableLots(holdings, 'brenton', '2026-08-01');
  const summary = app.eqSaleSummary(app.eqAllocateFifo(lots, 180), 120, 18, '2026-08-01');
  const tradeId = app.eqRecordSale(summary, 120, '2026-08-01', null);

  const written = holdings.flatMap((h) => (h.sales || []).filter((s) => s.tradeId === tradeId).map((s) => [h.id, s.qty, s.acquired, s.costs]));
  assert.deepEqual(plain(written), [[1, 30, '2023-03-01', 3], [6, 50, '2022-01-15', 5], [6, 100, '2023-01-15', 10]]);
  assert.equal(app.eqHeldUnits(holdings[0]), 70);
  assert.equal(app.eqHeldUnits(holdings[5]), 100, '400 vested, 300 sold');

  const trades = plain(app.eqTrades(holdings.filter((h) => h.id === 1 || h.id === 6)));
  assert.equal(trades.length, 2, 'the new trade and the earlier RSU sale');
  const t = trades[0];
  assert.deepEqual([t.date, t.qty, t.proceeds, t.costBase, t.gain], ['2026-08-01', 180, 21582, 11850, 9732]);
  assert.equal(t.gainHeld12, 9732);
});

test('realised gain counts sales in the financial year only', () => {
  const holdings = sellFixture();
  const app = loadApp(holdings);
  const lots = app.eqSellableLots(holdings, 'brenton', '2026-08-01');
  app.eqRecordSale(app.eqSaleSummary(app.eqAllocateFifo(lots, 180), 120, 18, '2026-08-01'), 120, '2026-08-01', null);
  assert.equal(app.eqRealisedGain(app.eqFinancialYear('2026-08-01')), 9732);
  // FY 2025–26: parcel 2 sold 10 @ 118 against a cost of 120
  assert.equal(app.eqRealisedGain(app.eqFinancialYear('2026-02-01')), -20);
});

test('an RSU sale that chose a vest comes off that vest; older sales come off the earliest', () => {
  const grant = rsu({ id: 7, owner: 'brenton', grantDate: '2021-01-15', totalUnits: 400, vestingYears: 4, grantPrice: 60,
    sales: [
      { id: 1, qty: 30, price: 100, date: '2024-06-01', costs: 0, acquired: '2024-01-15' },   // chose the newest vest
      { id: 2, qty: 120, price: 100, date: '2024-07-01', costs: 0 },                          // older entry, no vest recorded
    ] });
  const app = loadApp([grant]);
  const lots = app.eqSellableLots([grant], 'brenton', '2026-08-01').map((l) => [l.acquired, l.available]);
  assert.deepEqual(plain(lots), [['2022-01-15', 80], ['2023-01-15', 100], ['2024-01-15', 70]]);
});
