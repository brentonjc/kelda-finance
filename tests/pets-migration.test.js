// Unit tests for the Pets category id rename ('pippen' → 'pets', js/data.js migratePetsCatId):
// every store that holds a category id moves across, the migration is idempotent, and old
// exports that still say 'pippen' resolve to Pets.
// Run: node --test "tests/**/*.test.js"
// Every record here is made up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function makeContext(store) {
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
  return ctx;
}

function run(ctx, file) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
}

// Load storage.js + data.js the way the browser does on page load (data.js runs the migration).
function loadData(store) {
  const ctx = makeContext(store);
  run(ctx, 'js/storage.js');
  run(ctx, 'js/data.js');
  return ctx;
}

const read = (store, k) => JSON.parse(store[k]);

// A device whose data predates the rename. Custom categories keep a CAT_VERSION that's current,
// so data.js keeps them rather than resetting to the built-ins.
function oldStore() {
  return {
    cff_cat_version: '11',
    ledger_categories: JSON.stringify([
      { id: 'food_eating_out', name: 'Food & Eating Out', subcats: ['Groceries'] },
      { id: 'pippen', name: 'Pets', icon: 'paw', subcats: ['Vet Bills', 'Pet Food', 'Fish Tank'] },
      { id: 'hobbies_1700000000000', name: 'Hobbies', subcats: [] },
    ]),
    cff_tx: JSON.stringify([
      { id: 't1', name: 'HAPPY TAILS VET', catId: 'pippen', subcat: 'Vet Bills', suggestedCatId: '' },
      { id: 't2', name: 'CORNER GROCER', catId: 'food_eating_out', suggestedCatId: 'pippen' },
      { id: 't3', name: 'BOOK NOOK', catId: 'other', suggestedCatId: '' },
    ]),
    cff_budgets: JSON.stringify({ pippen: 80, food_eating_out: 600 }),
    ledger_budgets: JSON.stringify({ pippen: 150, food_eating_out: 900 }),
    ledger_rules: JSON.stringify({
      'happy tails vet': { catId: 'pippen', subcat: 'Vet Bills', pattern: 'contains' },
      'corner grocer': { catId: 'food_eating_out', subcat: 'Groceries', pattern: 'contains',
        amountThresholds: [{ maxAmount: 20, catId: 'pippen', subcat: 'Pet Food' }] },
    }),
    learnedMappings: JSON.stringify({ 'kibble kingdom': { catId: 'pippen', subcat: 'Pet Food' } }),
    ledger_recurring: JSON.stringify([{ id: 'r1', name: 'Pet insurance', catId: 'pippen' }]),
    cff_bills: JSON.stringify([
      { id: 'b1', name: 'Paw Cover', category: 'pippen', subcategory: 'Pet Insurance' },
      { id: 'b2', name: 'Power Co', category: 'utilities', subcategory: 'Power Bill' },
    ]),
    cff_pending_reviews: JSON.stringify([
      { txId: 't1', currentCatId: 'pippen', suggestedCatId: 'other' },
      { txId: 't2', currentCatId: 'food_eating_out', suggestedCatId: 'pippen' },
    ]),
  };
}

test('every store that holds a category id moves from pippen to pets', () => {
  const store = oldStore();
  loadData(store);

  const cats = read(store, 'ledger_categories');
  const pets = cats.find((c) => c.id === 'pets');
  assert.ok(pets, 'Pets category renamed');
  assert.deepEqual(pets.subcats, ['Vet Bills', 'Pet Food', 'Fish Tank'], 'custom subcats kept');
  assert.equal(pets.name, 'Pets');
  assert.ok(cats.find((c) => c.id === 'hobbies_1700000000000'), 'other custom categories kept');

  const tx = read(store, 'cff_tx');
  assert.equal(tx[0].catId, 'pets');
  assert.equal(tx[1].suggestedCatId, 'pets');
  assert.equal(tx[1].catId, 'food_eating_out');
  assert.equal(tx[2].catId, 'other');

  assert.deepEqual(read(store, 'cff_budgets'), { pets: 80, food_eating_out: 600 });
  assert.deepEqual(read(store, 'ledger_budgets'), { pets: 150, food_eating_out: 900 });

  const rules = read(store, 'ledger_rules');
  assert.equal(rules['happy tails vet'].catId, 'pets');
  assert.equal(rules['corner grocer'].catId, 'food_eating_out');
  assert.equal(rules['corner grocer'].amountThresholds[0].catId, 'pets');
  assert.equal(read(store, 'learnedMappings')['kibble kingdom'].catId, 'pets');

  assert.equal(read(store, 'ledger_recurring')[0].catId, 'pets');
  const bills = read(store, 'cff_bills');
  assert.equal(bills[0].category, 'pets');
  assert.equal(bills[1].category, 'utilities');

  const reviews = read(store, 'cff_pending_reviews');
  assert.equal(reviews[0].currentCatId, 'pets');
  assert.equal(reviews[0].suggestedCatId, 'other');
  assert.equal(reviews[1].suggestedCatId, 'pets');

  assert.doesNotMatch(JSON.stringify(store), /pippen/);
});

test('the in-memory globals see the migrated data', () => {
  const app = loadData(oldStore());
  assert.equal(vm.runInContext('TX[0].catId', app), 'pets');
  assert.equal(vm.runInContext('LBUDGETS.pets', app), 150);
  assert.equal(vm.runInContext('LRULES["happy tails vet"].catId', app), 'pets');
  assert.ok(vm.runInContext('LCATS.some(c => c.id === "pets")', app));
});

test('running it again changes nothing', () => {
  const store = oldStore();
  const app = loadData(store);
  const once = { ...store };
  const writes = [];
  const setItem = app.localStorage.setItem;
  app.localStorage.setItem = (k, v) => { writes.push(k); setItem(k, v); };
  app.migratePetsCatId();
  assert.deepEqual(writes, [], 'no store rewritten');
  assert.deepEqual(store, once);
  loadData(store);   // and a full reload
  assert.deepEqual(store, once);
});

test('a new device gets pets from the built-in categories and nothing is written for it', () => {
  const store = {};
  loadData(store);
  const cats = read(store, 'ledger_categories');
  assert.ok(cats.find((c) => c.id === 'pets' && c.name === 'Pets'));
  assert.doesNotMatch(JSON.stringify(store), /pippen/);
});

test('if both ids exist, the pets entries win and the old ones fold in', () => {
  const store = {
    cff_cat_version: '11',
    ledger_categories: JSON.stringify([
      { id: 'pets', name: 'Pets', subcats: ['Vet Bills'] },
      { id: 'pippen', name: 'Pets', subcats: ['Vet Bills', 'Fish Tank'] },
    ]),
    ledger_budgets: JSON.stringify({ pets: 100, pippen: 40 }),
  };
  loadData(store);
  const cats = read(store, 'ledger_categories');
  assert.deepEqual(cats.filter((c) => /^(pets|pippen)$/.test(c.id)),
    [{ id: 'pets', name: 'Pets', subcats: ['Vet Bills', 'Fish Tank'] }]);
  assert.deepEqual(read(store, 'ledger_budgets'), { pets: 100 });
});

test('a restored old backup is migrated on the reload that follows', () => {
  const store = {};
  loadData(store);
  // Restore writes the backup's keys straight to storage, then reloads the page.
  store.cff_tx = JSON.stringify([{ id: 't9', name: 'FURRY FRIENDS GROOMING', catId: 'pippen' }]);
  loadData(store);
  assert.equal(read(store, 'cff_tx')[0].catId, 'pets');
});

test('built-in keyword rules file pet merchants under pets', () => {
  const store = {};
  const app = loadData(store);
  run(app, 'js/pages/autocategorise.js');
  app.seedLRulesFromCSV();
  const r = app.AutoCat.categorise('SOMEWHERE VETERINARY CLINIC', '', 120, 'expense');
  assert.equal(r.catId, 'pets');
});

test('old exports that say pippen still resolve to pets', () => {
  const app = loadData({});
  run(app, 'js/pages/categories.js');
  assert.equal(app.resolveValidCatId('pippen', '', ''), 'pets');
  assert.equal(app.resolveValidCatId('', 'pippen', ''), 'pets');
  assert.equal(app.resolveValidCatId('pet', '', ''), 'pets');
});
