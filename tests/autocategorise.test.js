// Unit tests for the auto-categoriser (js/pages/autocategorise.js): broker and exchange
// settlements are transfers, not capital gains; RSU sale proceeds are bonus income; the user's
// own rules outrank built-in keywords; and Rescan leaves hand-categorised transactions alone.
// Run: node --test "tests/**/*.test.js"
// Every description here is made up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Load the page scripts the way the browser does: classic scripts sharing one global scope.
// LRULES, LCATS and TX normally come from data.js. Timers are stubbed so the debounced rule save
// never fires.
function loadApp({ store = {}, tx = [] } = {}) {
  const ctx = {
    console: { log() {}, warn() {}, group() {}, groupEnd() {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      key: (i) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/storage.js'), 'utf8'), ctx, { filename: 'js/storage.js' });
  vm.runInContext('var LRULES = load(K.rules) || {};', ctx);
  ctx.TX = tx;
  ctx.LCATS = [
    { id: 'transfers', name: 'Transfers' }, { id: 'bonus', name: 'Bonus' },
    { id: 'capital_gains', name: 'Capital Gains' }, { id: 'food_eating_out', name: 'Food & Eating Out' },
  ];
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/pages/autocategorise.js'), 'utf8'), ctx,
    { filename: 'js/pages/autocategorise.js' });
  ctx.seedLRulesFromCSV();   // as unlocking the app does
  return ctx;
}

// What a CSV import assigns: category, or category › subcategory
function categorise(app, description, type = 'expense', amount = 500) {
  const r = app.AutoCat.categorise(description, '', amount, type);
  return r.catId + (r.subcat ? ' › ' + r.subcat : '');
}

const INVESTMENT = 'transfers › Investment Transfer';

test('payments to brokers, crypto exchanges and Vanguard are investment transfers', () => {
  const app = loadApp();
  for (const d of ['COMMSEC SECURITIES LTD SYDNEY', 'DIRECT DEBIT COMMSEC', 'SELFWEALTH PTY LTD',
    'STAKE AUS PTY LTD', 'INTERACTIVE BROKERS AUSTRALIA', 'PEARLER INVESTMENTS', 'COINSPOT PTY LTD',
    'SWYFTX PTY LTD BRISBANE', 'BTC MARKETS PTY LTD', 'CRYPTO.COM MELBOURNE', 'BPAY VANGUARD PERSONAL INVESTOR']) {
    assert.equal(categorise(app, d), INVESTMENT, d);
  }
});

test('sale proceeds from a broker are investment transfers, not income', () => {
  const app = loadApp();
  assert.equal(categorise(app, 'COMMSEC SECURITIES SALE PROCEEDS', 'income', 12000), INVESTMENT);
  assert.equal(categorise(app, 'DIRECT CREDIT SELFWEALTH', 'income', 6000), INVESTMENT);
});

test('a "transfer to" a broker is filed as an investment transfer', () => {
  const app = loadApp();
  assert.equal(categorise(app, 'TRANSFER TO COMMSEC'), INVESTMENT);
  const other = categorise(app, 'TRANSFER TO SAVINGS');
  assert.ok(other.startsWith('transfers') && other !== INVESTMENT, other);
});

test('Vanguard Super, distributions, Stake.com and near-miss words are not investment transfers', () => {
  const app = loadApp();
  for (const [d, type] of [['VANGUARD SUPER', 'expense'], ['VANGUARD INVESTMENTS DISTRIBUTION', 'income'],
    ['STAKE.COM', 'expense'], ['MISTAKE REVERSAL', 'income'], ['DEFINITELY DELICIOUS BAKERY', 'expense'],
    ['ABTC CONSULTING', 'expense']]) {
    const got = categorise(app, d, type, 250);
    assert.notEqual(got, INVESTMENT, d);
    assert.ok(!got.startsWith('capital_gains'), d + ' → ' + got);
  }
  assert.equal(categorise(app, 'THE STAKEHOLDER CAFE', 'expense', 12), 'food_eating_out › Cafe and Lunches');
});

test('no built-in keyword files anything under Capital Gains any more', () => {
  const app = loadApp();
  for (const d of ['BTC SYDNEY', 'CRYPTO SYDNEY', 'NFT SYDNEY', 'BLACKROCK SYDNEY', 'ISHARES SYDNEY', 'ETHEREUM SYDNEY']) {
    for (const type of ['expense', 'income']) {
      assert.ok(!categorise(app, d, type, 42).startsWith('capital_gains'), d + ' ' + type);
    }
  }
});

test('everyday merchants are unaffected', () => {
  const app = loadApp();
  assert.equal(categorise(app, 'EFTPOS COLES 3421 CHATSWOOD NSW', 'expense', 80).split(' › ')[0], 'food_eating_out');
  assert.equal(categorise(app, 'NETFLIX.COM', 'expense', 20).split(' › ')[0], 'entertainment');
});

test("the user's own rule for a description beats the built-in keywords", () => {
  const app = loadApp();
  // What saving a manual category does: an exact rule on the full (pre-alias) description
  app.writeExactRule(app.preprocessMerchantString('COMMSEC SECURITIES LTD'), 'transfers', 'Savings Transfer');
  assert.equal(categorise(app, 'COMMSEC SECURITIES LTD'), 'transfers › Savings Transfer');
});

test('RSU sale proceeds from Morgan Stanley are bonus income', () => {
  const app = loadApp();
  assert.equal(categorise(app, 'FROM CITIBANK MORGAN STANLEY SMI', 'income', 15000), 'bonus › Work Bonus');
});

test('an existing install updates the seeded RSU rule, unless the user edited it', () => {
  const KEY = 'from citibank morgan stanley smi';
  const oldRule = { catId: 'capital_gains', subcat: 'Shares', pattern: 'contains', source: 'manual', confidence: 'HIGH' };
  for (const userModified of [false, true]) {
    const store = { cff_seed_version: '2026-06-28-v1', ledger_rules: JSON.stringify({ [KEY]: { ...oldRule, userModified } }) };
    const app = loadApp({ store });
    const rule = JSON.parse(store.ledger_rules)[KEY];
    assert.equal(rule.catId, userModified ? 'capital_gains' : 'bonus', 'userModified=' + userModified);
    assert.equal(categorise(app, 'FROM CITIBANK MORGAN STANLEY SMI', 'income'), userModified ? 'capital_gains › Shares' : 'bonus › Work Bonus');
  }
});

test('Rescan moves auto-categorised broker payments but leaves hand-categorised ones alone', () => {
  const tx = [
    { id: 1, name: 'COMMSEC SECURITIES', type: 'expense', amount: 5000, catId: 'capital_gains', subcat: 'Shares' },
    { id: 2, name: 'COMMSEC SECURITIES', type: 'expense', amount: 5000, catId: 'capital_gains', subcat: 'Shares', correctionSource: 'user' },
  ];
  const app = loadApp({ tx });
  let changed = null;
  app.AutoCat.reprocess(null, (n) => { changed = n; });
  assert.equal(changed, 1);
  assert.deepEqual(tx.map((t) => t.catId + ' › ' + t.subcat), [INVESTMENT, 'capital_gains › Shares']);
});
