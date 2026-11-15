// Writes a minimal PDF (Helvetica text only, uncompressed) from a layout in
// ./statements.js. Used by the end-to-end test and to make sample statements
// for checking the import in a browser. No dependencies.
const { width, SIZE } = require('./statements');

function pdfString(s) {
  return '(' + String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')';
}

// layout: { pages: [[ [y, [x, text], ...], ... ], ...] }; opts.noText writes
// pages with no text at all (like a scanned statement).
function makePdf(layout, opts = {}) {
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const catalog = add(null);
  const pagesId = add(null);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids = [];
  layout.pages.forEach((lines) => {
    let ops = '';
    if (!opts.noText) {
      lines.forEach(([y, ...cells]) => {
        cells.forEach(([x, text]) => {
          const left = x < 0 ? -x - width(text) : x;
          ops += 'BT /F1 ' + SIZE + ' Tf 1 0 0 1 ' + left.toFixed(2) + ' ' + y + ' Tm ' + pdfString(text) + ' Tj ET\n';
        });
      });
    } else {
      ops = '0.9 g 40 40 515 760 re f\n';
    }
    const content = add('<< /Length ' + Buffer.byteLength(ops, 'latin1') + ' >>\nstream\n' + ops + 'endstream');
    kids.push(add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ' + font + ' 0 R >> >> /Contents ' + content + ' 0 R >>'));
  });
  objs[catalog - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>';
  objs[pagesId - 1] = '<< /Type /Pages /Kids [' + kids.map((k) => k + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>';

  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += (i + 1) + ' 0 obj\n' + body + '\nendobj\n';
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  offsets.forEach((o) => { out += String(o).padStart(10, '0') + ' 00000 n \n'; });
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}

module.exports = { makePdf };
