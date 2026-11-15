// Made-up statement layouts for the PDF statement tests. Every name, amount and
// account here is invented. Each layout is pages of lines; a line is a y position
// and cells. A cell's x is its left edge, or, when negative, its right edge
// (amounts are right-aligned in their columns, as on real statements).
//
// toItems() turns a layout into the text pieces pdf.js reports, and makePdf()
// (./make-pdf.js) writes the same layout as a real PDF.

const SIZE = 9;
// Helvetica averages a little over half the font size per character
const width = (text, size = SIZE) => text.length * size * 0.52;

function toItems(layout) {
  const items = [];
  layout.pages.forEach((lines, pi) => {
    lines.forEach(([y, ...cells]) => {
      cells.forEach(([x, text]) => {
        const w = width(text);
        items.push({ page: pi + 1, str: text, x: x < 0 ? -x - w : x, y, w, h: SIZE });
      });
    });
  });
  return items;
}

// Columns used by several layouts
const C = { date: 40, desc: 100, debit: -360, credit: -440, bal: -540 };

// Debit / Credit / Balance, numeric dates with a two-digit year, period in the heading
const westpacStyle = {
  name: 'debit/credit columns, dd/mm/yy dates',
  pages: [[
    [800, [40, 'Example Bank Everyday Account']],
    [785, [40, 'Statement period 01/10/2026 to 31/10/2026']],
    [740, [C.date, 'Date'], [C.desc, 'Transaction Description'], [C.debit, 'Debit'], [C.credit, 'Credit'], [C.bal, 'Balance']],
    [725, [C.date, '01/10/26'], [C.desc, 'OPENING BALANCE'], [C.bal, '1,000.00']],
    [710, [C.date, '02/10/26'], [C.desc, 'EFTPOS PURCHASE MADEUP GROCER'], [C.debit, '45.20'], [C.bal, '954.80']],
    [695, [C.date, '03/10/26'], [C.desc, 'SALARY EXAMPLE EMPLOYER'], [C.credit, '2,500.00'], [C.bal, '3,454.80']],
    [680, [C.date, '05/10/26'], [C.desc, 'DIRECT DEBIT FAKE ENERGY CO'], [C.debit, '180.00'], [C.bal, '3,274.80']],
    [665, [C.date, '31/10/26'], [C.desc, 'CLOSING BALANCE'], [C.bal, '3,274.80']],
  ]],
};

// "01 Oct" dates, "$1,234.56 CR" balances, descriptions over two lines, header repeated on page 2
const commbankStyle = {
  name: 'dd Mon dates, CR balances, two-line descriptions, two pages',
  pages: [
    [
      [800, [40, 'Period 1 Oct 2026 - 31 Oct 2026']],
      [740, [C.date, 'Date'], [C.desc, 'Transaction'], [C.debit, 'Debit'], [C.credit, 'Credit'], [C.bal, 'Balance']],
      [725, [C.date, '01 Oct'], [C.desc, 'OPENING BALANCE'], [C.bal, '$500.00 CR']],
      [710, [C.date, '04 Oct'], [C.desc, 'Madeup Cafe Sydney'], [C.debit, '6.50'], [C.bal, '$493.50 CR']],
      [699, [C.desc, 'Card xx0000 Value Date: 03/10/2026']],
      [684, [C.date, '06 Oct'], [C.desc, 'Transfer from Savings'], [C.credit, '200.00'], [C.bal, '$693.50 CR']],
      [669, [C.date, '07 Oct'], [C.desc, 'Imaginary Hardware'], [C.debit, '1,089.95'], [C.bal, '$396.45 DR']],
      [100, [40, 'Page 1 of 2']],
    ],
    [
      [740, [C.date, 'Date'], [C.desc, 'Transaction'], [C.debit, 'Debit'], [C.credit, 'Credit'], [C.bal, 'Balance']],
      [725, [C.date, '12 Oct'], [C.desc, 'Pretend Pharmacy'], [C.debit, '23.10'], [C.bal, '$419.55 DR']],
      [710, [C.date, '31 Oct'], [C.desc, 'CLOSING BALANCE'], [C.bal, '$419.55 DR']],
      [100, [40, 'Page 2 of 2']],
    ],
  ],
};

// Credit card: one Amount column, payments marked CR, period running into January
const cardStyle = {
  name: 'card statement, CR payments, December to January',
  pages: [[
    [800, [40, 'Example Rewards Card']],
    [785, [40, 'Statement period 15 Dec 2026 to 14 Jan 2027']],
    [740, [C.date, 'Date'], [C.desc, 'Transaction details'], [-540, 'Amount ($)']],
    [725, [C.date, '18 Dec'], [C.desc, 'FAKE AIRLINE BOOKING'], [-540, '420.00']],
    [710, [C.date, '24 Dec'], [C.desc, 'PAYMENT THANK YOU'], [-540, '500.00 CR']],
    [695, [C.date, '03 Jan'], [C.desc, 'MADE UP BOOKS'], [-540, '32.99']],
  ]],
};

// No column header; each line has an unsigned amount and a running balance
const noHeaderStyle = {
  name: 'no column header, sign from the running balance',
  pages: [[
    [800, [40, 'Statement 1 Nov 2026 to 30 Nov 2026']],
    [760, [40, 'Opening balance'], [-540, '1,000.00']],
    [745, [C.date, '05 Nov'], [C.desc, 'IMAGINARY SUPERMARKET'], [-440, '45.00'], [-540, '955.00']],
    [730, [C.date, '06 Nov'], [C.desc, 'REFUND FAKE STORE'], [-440, '15.00'], [-540, '970.00']],
    [715, [C.date, '09 Nov'], [C.desc, 'MADEUP GYM'], [-440, '60.00'], [-540, '910.00']],
  ]],
};

// "Withdrawals ($)" / "Deposits ($)", upper-case months, the amount on the
// second line of a two-line transaction, years printed on each date
const anzStyle = {
  name: 'withdrawals/deposits, amounts on the second line',
  pages: [[
    [740, [C.date, 'Date'], [C.desc, 'Transaction Details'], [C.debit, 'Withdrawals ($)'], [C.credit, 'Deposits ($)'], [C.bal, 'Balance ($)']],
    [725, [C.date, '02 OCT 2026'], [C.desc, 'VISA DEBIT PURCHASE CARD 0000']],
    [714, [C.desc, 'PRETEND PETROL STATION'], [C.debit, '88.40'], [C.bal, '1,911.60']],
    [699, [C.date, '03 OCT 2026'], [C.desc, 'PAY/SALARY FROM EXAMPLE CO'], [C.credit, '1,250.00'], [C.bal, '3,161.60']],
  ]],
};

module.exports = { toItems, width, SIZE, westpacStyle, commbankStyle, cardStyle, noHeaderStyle, anzStyle };
