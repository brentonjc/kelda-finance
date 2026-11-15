// End to end: write made-up statements as real PDF files, read them with the
// vendored pdf.js (as the browser does), and check the transactions that come out.
// Run: node --test "tests/**/*.test.js"
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const S = require('./helpers/statements');
const { makePdf } = require('./helpers/make-pdf');

const ROOT = path.join(__dirname, '..');
const VENDOR = path.join(ROOT, 'assets/vendor/pdfjs');

const ctx = { console, URL };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/pages/balancesync.js', 'js/statement-pdf.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}

let lib;
async function pdfjs() {
  if (!lib) {
    lib = await import(pathToFileURL(path.join(VENDOR, 'pdf.min.mjs')).href);
    lib.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(VENDOR, 'pdf.worker.min.mjs')).href;
  }
  return lib;
}

// The same steps as pdfImportFile, minus the page
async function readPdf(buf) {
  const { getDocument } = await pdfjs();
  const task = getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, enableXfa: false, verbosity: 0 });
  const doc = await task.promise;
  const items = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    items.push(...ctx.pdfPageItems(await ctx.pdfPageTextContent(page), p));
  }
  await task.destroy();
  return items;
}

const rowsOf = (items) => JSON.parse(JSON.stringify(ctx.StatementPdf.parseItems(items, { today: '2026-11-15' }).rows));

test('a two-page debit/credit statement PDF reads into signed transactions', async () => {
  const rows = rowsOf(await readPdf(makePdf(S.commbankStyle)));
  assert.deepEqual(rows.map((r) => [r.Date, r.Amount, r.Balance]), [
    ['2026-10-04', '-6.50', '493.50'],
    ['2026-10-06', '200.00', '693.50'],
    ['2026-10-07', '-1089.95', '-396.45'],
    ['2026-10-12', '-23.10', '-419.55'],
  ]);
  assert.match(rows[0].Description, /^Madeup Cafe Sydney/);
});

test('a card statement PDF reads purchases as spending and CR payments as money in', async () => {
  const rows = rowsOf(await readPdf(makePdf(S.cardStyle)));
  assert.deepEqual(rows.map((r) => [r.Date, r.Description, r.Amount]), [
    ['2026-12-18', 'FAKE AIRLINE BOOKING', '-420.00'],
    ['2026-12-24', 'PAYMENT THANK YOU', '500.00'],
    ['2027-01-03', 'MADE UP BOOKS', '-32.99'],
  ]);
});

test('every made-up layout gives the same rows from the PDF as from the text positions', async () => {
  for (const layout of [S.westpacStyle, S.noHeaderStyle, S.anzStyle]) {
    const fromPdf = rowsOf(await readPdf(makePdf(layout)));
    const fromItems = rowsOf(S.toItems(layout));
    assert.deepEqual(fromPdf, fromItems, layout.name);
    assert.ok(fromPdf.length >= 2, layout.name);
  }
});

test('a PDF with no text (a scanned statement) gives no text pieces', async () => {
  const items = await readPdf(makePdf(S.westpacStyle, { noText: true }));
  assert.equal(items.filter((it) => /\d/.test(it.str)).length, 0);
});
