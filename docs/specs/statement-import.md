# Statement import: CSV fixes and PDF statements

Status: approved and built (2026-11-15). Delivered as one commit rather than two, because the CSV and PDF changes share files.
Branch: `worktree-pdf-statement-import-1115a`
Board card: "CSV Upload fixes" (`2ih5gfxn1pmc6nq4pzq0`)

## Problems found in the current CSV import

Probed against `js/pages/export.js` on origin/main:

| # | Problem | Evidence |
|---|---------|----------|
| 1 | The template's `name` column is never auto-mapped, so merchants from the template are dropped unless the user remaps by hand | `csvGuess('name')` returns `''` |
| 2 | Impossible dates are accepted | `csvDate('31/02/2026')` → `2026-02-31` |
| 3 | US-ordered dates (Excel on a US-locale Mac re-saves the template that way) produce month 14 rather than an error | `csvDate('3/14/2026')` → `2026-14-03` |
| 4 | A trailing minus loses its sign | `csvDollar('100.00-')` → `100` |
| 5 | European decimals are misread | `csvDollar('-1.234,56')` → `-1.23456` |
| 6 | An unterminated quote silently swallows every row after it | 3-row file → 1 row |
| 7 | Files with a description but no merchant column flag different purchases with the same date and amount as duplicates | `AutoCat.isDuplicate` treats an empty name as a match |
| 8 | `.xlsx`/`.numbers` files get "Please upload a .csv file" with no explanation of how to save as CSV | `csvProcess` |
| 9 | "Could not read file — check the format" doesn't say what was wrong | `csvProcess` |
| 10 | The template's design pushes users to retype their bank export into it: a `type` column plus unsigned amounts, ISO dates that Excel rewrites, and category names that must match exactly | `csvDownloadTemplate` |
| 11 | The column mapping is guessed again on every import, even for the same bank | no saved mapping |
| 12 | Banks that only offer PDF statements can't be imported at all | `accept=".csv,.txt"` |

## Design

### Principle: PDF becomes another way to produce `{headers, rows}`

Everything after step 1 of the wizard (column mapping, sign handling, preview, duplicate check, auto-categorisation, balance sync) works on `{headers, rows}` from `csvParse`. The PDF reader outputs the same shape with synthetic headers (`Date`, `Description`, `Debit`, `Credit`, `Balance` or `Date`, `Description`, `Amount`, `Balance`), which `csvGuess` already maps. No second import pipeline.

```
CSV file ──csvParse──┐
                     ├─> {headers, rows} ─> map columns ─> preview ─> import
PDF file ──pdfRead───┘      (unchanged from here on)
```

### PDF reading

1. **Text extraction: vendored pdf.js** (Mozilla, Apache-2.0), legacy build of `pdfjs-dist@6.4.299` in `assets/vendor/pdfjs/` (`pdf.min.mjs` 524 KB + `pdf.worker.min.mjs` 1.3 MB). The legacy build supports older iOS Safari.
   - **Loaded lazily** via `import()` only when a PDF is chosen, so the 1.8 MB never touches normal app load. It is not in the service-worker precache; the existing network-first runtime cache keeps it available offline after first use.
   - Runs fully on-device: no network, `isEvalSupported:false`, no font loading, no CMap fetching. Statement files never leave the device, same as CSV.
   - Writing our own PDF text extractor is not viable: compressed streams, font encodings and ToUnicode maps vary by bank.
2. **Layout to lines (pure, testable):** `js/statement-pdf.js` groups text items into lines by y-position (with tolerance) and sorts each line by x.
3. **Lines to transactions (pure, testable):**
   - Find the column header line (words like Date, Transaction/Details/Description/Particulars, Debit/Withdrawals, Credit/Deposits, Amount, Balance) and record each column's x-range. Re-detect it on every page, since pages repeat headers.
   - A transaction starts on a line whose first token is a date (`05/10/2026`, `05/10/26`, `05 Oct`, `05 Oct 2026`, `Oct 05`). Dates without a year take it from the statement period ("1 Jul 2026 to 30 Sep 2026"), including a December to January rollover.
   - Money tokens (`1,234.56`, `$1,234.56`, `1,234.56 CR`, `(12.00)`, `12.00-`) go to whichever column their x-centre falls in.
   - Lines with no date and no money continue the previous description (multi-line merchant text).
   - Skip opening/closing balance, brought/carried forward, totals and page footers.
   - **Sign fallback:** if the layout has one amount column and a balance column, the sign comes from the balance change. BalanceSync already proves the chain, so a misread row shows as a balance gap in the preview rather than importing silently wrong.
4. **What's not supported (clear message, not a silent failure):**
   - Scanned/image PDFs with no text layer: "This PDF is a scanned image, so there's no text to read. Ask your bank for a downloadable statement." OCR would need ~10 MB of Tesseract; out of scope.
   - Password-protected PDFs: prompt for the password and pass it to pdf.js (it never leaves the page or gets stored).
   - No transactions found: say so, and show how many pages and lines were read.
5. **Review before import:** PDF rows always land on step 2 (mapping) with a "Read from PDF, check the preview carefully" note, so the user confirms columns and signs.

### CSV fixes

| # | Fix |
|---|-----|
| 1 | `csvGuess` maps `name`, `merchant name` and `payee name` to Merchant |
| 2, 3 | `csvDate` validates real calendar dates. Date order is detected across the whole file: any first number > 12 means day-first, any second number > 12 means month-first, otherwise day-first (AU default). Rows that still fail are marked "Invalid date" in the preview instead of importing |
| 4, 5 | `csvDollar` handles a trailing minus, `CR`/`DR` suffixes, and comma decimals (only when the value has a comma decimal and no dot decimal) |
| 6 | `csvParse` detects an unterminated quote and stops with "Row N has an opening quote with no closing quote" instead of dropping rows |
| 7 | The duplicate check compares descriptions when neither side has a merchant name |
| 8 | `.xlsx`/`.xls`/`.numbers`: specific message with Save As CSV steps for Excel, Numbers and Google Sheets |
| 9 | Unreadable files say why: no header with a date and amount column found, and show the first line read |
| 10 | New template: `Date, Merchant, Description, Amount, Category, Subcategory`, DD/MM/YYYY dates, negative amounts = spending (matches bank files, no `type` column), category names taken from the user's own categories, plus a note row. Copy on step 1 says plainly: "You don't need the template for bank files. Upload your bank's CSV as it is." |
| 11 | Remember the confirmed mapping per header signature in localStorage (`K.csvMaps`), and pre-fill it next time with a "Using your saved columns for this bank" note |

Out of scope (separate cards if wanted): keeping the source file (#card note), `.xlsx` parsing, OCR, open banking.

### UI changes (step 1)

- Drop zone: "Drop a CSV or PDF statement here". `accept=".csv,.txt,.pdf"`.
- Wizard heading "Import from CSV" becomes "Import a statement".
- While a PDF reads: inline progress ("Reading page 2 of 6…") in the drop zone; the large library load shows a spinner on first use.
- Copy follows the existing card style; no new inline styles (CLAUDE.md).

### Files

| File | Change |
|------|--------|
| `assets/vendor/pdfjs/pdf.min.mjs`, `pdf.worker.min.mjs`, `LICENSE` | new, vendored |
| `js/statement-pdf.js` | new: lazy loader, lines grouping, lines→rows parser (pure functions exposed for tests) |
| `js/pages/export.js` | CSV fixes, route `.pdf` to the PDF reader, template, saved mappings |
| `js/pages/autocategorise.js` | duplicate check for description-only rows |
| `js/storage.js` / `js/data.js` | `K.csvMaps` key, included in backups |
| `index.html` | step 1 copy, accept list, progress element, script tag |
| `css/components.css` | progress state in the drop zone |
| `sw.js` | add `js/statement-pdf.js` to the shell; bump cache version |
| `netlify.toml` | `Content-Type: text/javascript` for `*.mjs` (the site sends `nosniff`) |
| `tests/csv-import.test.js` | tests for fixes 1–7, 9, 11 |
| `tests/statement-pdf.test.js` | line grouping and parser tests on made-up line fixtures (CBA-, Westpac-, NAB-, ANZ-style layouts, card statement, year rollover, multi-line descriptions, sign from balance) |
| `tests/statement-pdf-e2e.test.js` | generates a tiny made-up PDF in the test, runs vendored pdf.js in Node, checks the extracted rows |

All fixtures are made up. No real statements are committed.

### Verification

- `node --test "tests/**/*.test.js"` and `node .claude/check-syntax.mjs`
- Built-in browser on the local preview: CSV (template, bank file, bad dates), generated PDF statements in two layouts, scanned PDF message, `.xlsx` message, desktop and 375 px mobile widths
- iOS Simulator Safari: PDF pick from Files, worker loads, import completes

Manual check needed: a real PDF from each of Brenton's and Shelley's banks on the deploy preview (we can't commit real statements, so layout coverage beyond the made-up fixtures depends on this).

### Delivery

Two commits on one PR, so the CSV fixes can be reviewed apart from the PDF feature:
1. CSV import fixes + template + saved mappings
2. PDF statement import

Version bump: minor (new feature).
