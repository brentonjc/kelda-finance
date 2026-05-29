// TRANSACTION BAR CHART
// ══════════════════════════════════════════════════════════════
let txCatChart = null;
function txToken(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()||'';}

function renderTxCatChart() {
  const canvas = document.getElementById('tx-cat-chart');
  if (!canvas) return;
  if (txCatChart) { txCatChart.destroy(); txCatChart = null; }

  const fm  = document.getElementById('tx-filter-month')?.value || '';
  const pfx = fm || thisMonth();
  const periodEl = document.getElementById('tx-chart-period');
  if (periodEl) periodEl.textContent = fm
    ? new Date(fm+'-02').toLocaleString('en-AU',{month:'long',year:'numeric'})
    : 'This month';

  // Exclude transfers category
  const expTx = activeTX().filter(t =>
    t.type==='expense' && t.date.startsWith(pfx) &&
    t.catId !== 'transfers' &&
    (t.category||'').toLowerCase() !== 'transfers'
  );
  if (!expTx.length) return;

  // Group by catId
  const catTotals = {};
  expTx.forEach(t => {
    const id = t.catId || 'other';
    catTotals[id] = (catTotals[id]||0) + Number(t.amount);
  });

  const sorted = Object.entries(catTotals)
    .map(([id,amt]) => {
      const cat = LCATS.find(c => c.id === id);
      return { name: cat ? cat.name : id, color: cat ? cat.color : '#8a8095', amt };
    })
    .sort((a,b) => b.amt - a.amt)
    .slice(0, 10);

  txCatChart = safeChart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map(r => r.name),
      datasets: [{ label: 'Spent',
        data: sorted.map(r => r.amt),
        backgroundColor: sorted.map(r => r.color+'cc'),
        borderColor:     sorted.map(r => r.color),
        borderWidth: 1.5, borderRadius: 5 }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c => ' '+fmt(c.parsed.x) } } },
      scales: {
        x: { grid:{color:txToken('--card3')}, ticks:{font:{family:'Inter',size:10},color:txToken('--muted'),callback:v=>'$'+Math.round(v).toLocaleString()} },
        y: { grid:{display:false}, ticks:{font:{family:'Inter',size:11},color:txToken('--muted')} }
      }
    }
  });
}

// ══════════════════════════════════════════════════════════════
// ENHANCED addTx — capture name + subcat
// ══════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════
// TAX LIABILITY TRACKER
// ══════════════════════════════════════════════════════════════

// Australian 2024-25 individual tax brackets + Medicare levy
function calcAusTax(taxableIncome) {
    var tax = 0;
    var ti = Number(taxableIncome) || 0;
    if      (ti <= 18200)  { tax = 0; }
    else if (ti <= 45000)  { tax = (ti - 18200) * 0.19; }
    else if (ti <= 135000) { tax = 5092 + (ti - 45000) * 0.325; }
    else if (ti <= 190000) { tax = 34372 + (ti - 135000) * 0.37; }
    else                   { tax = 54732 + (ti - 190000) * 0.45; }
    var medicare = ti > 26000 ? ti * 0.02 : 0;
    return {
        incomeTax: Math.round(tax),
        medicare:  Math.round(medicare),
        total:     Math.round(tax + medicare)
    };
}

// FY helpers
function taxGetFY() {
    try {
        var sel = document.getElementById('tax-fy-select');
        return sel ? (parseInt(sel.value, 10) || 2024) : 2024;
    } catch(e) { return 2024; }
}

function taxFyLabel(fy) {
    return 'FY ' + fy + '\u2013' + String(fy + 1).slice(2);
}

function taxFyChanged() {
    taxSave();
    renderTax();
}

function taxQuarters(fy) {
    return [
        { q: 'Q1', period: 'Jul-Sep ' + fy,        key: 'q1' },
        { q: 'Q2', period: 'Oct-Dec ' + fy,        key: 'q2' },
        { q: 'Q3', period: 'Jan-Mar ' + (fy + 1),  key: 'q3' },
        { q: 'Q4', period: 'Apr-Jun ' + (fy + 1),  key: 'q4' },
    ];
}

// Data storage helpers
function taxData(fy) {
    try {
        var d = TAX[String(fy)];
        return d || {};
    } catch(e) { return {}; }
}

function taxSave() {
    try {
        var fy = taxGetFY();
        if (!TAX[String(fy)]) TAX[String(fy)] = {};
        var d = TAX[String(fy)];
        var rateEl = document.getElementById('tax-b-rate');
        var sIncEl = document.getElementById('tax-s-income');
        var sDecEl = document.getElementById('tax-s-deductions');
        if (rateEl) d.bRate   = parseFloat(rateEl.value) || 47;
        if (sIncEl) d.sIncome = parseFloat(sIncEl.value) || 0;
        if (sDecEl) d.sDeduc  = parseFloat(sDecEl.value) || 0;
        save(K.tax, TAX);
    } catch(e) { /* silent */ }
}

function taxSaveBAS(person, quarter, field, value) {
    try {
        var fy = taxGetFY();
        if (!TAX[String(fy)]) TAX[String(fy)] = {};
        if (!TAX[String(fy)].bas) TAX[String(fy)].bas = {};
        TAX[String(fy)].bas[person + '_' + quarter + '_' + field] = value;
        save(K.tax, TAX);
    } catch(e) { /* silent */ }
}

function taxGetBASRaw(fy, person, quarter, field) {
    try {
        var d = TAX[String(fy)];
        if (!d || !d.bas) return '';
        return d.bas[person + '_' + quarter + '_' + field] || '';
    } catch(e) { return ''; }
}

function taxSaveRSU(idx, field, value) {
    try {
        var fy = taxGetFY();
        if (!TAX[String(fy)]) TAX[String(fy)] = {};
        if (!TAX[String(fy)].rsus) TAX[String(fy)].rsus = [];
        if (!TAX[String(fy)].rsus[idx]) TAX[String(fy)].rsus[idx] = {};
        TAX[String(fy)].rsus[idx][field] = value;
        save(K.tax, TAX);
    } catch(e) { /* silent */ }
    renderTaxResults();
}

function taxAddRSU() {
    try {
        var fy = taxGetFY();
        if (!TAX[String(fy)]) TAX[String(fy)] = {};
        if (!TAX[String(fy)].rsus) TAX[String(fy)].rsus = [];
        TAX[String(fy)].rsus.push({ date: '', units: '', price: '' });
        save(K.tax, TAX);
    } catch(e) { /* silent */ }
    renderTax();
}

function taxDeleteRSU(idx) {
    try {
        var fy = taxGetFY();
        if (TAX[String(fy)] && TAX[String(fy)].rsus) {
            TAX[String(fy)].rsus.splice(idx, 1);
            save(K.tax, TAX);
        }
    } catch(e) { /* silent */ }
    renderTax();
}

// Pull D293 from the existing calcDiv293() in the Super section
function taxGetD293Auto() {
    try {
        var b      = (SUPER && SUPER.b) ? SUPER.b : {};
        var salary = Number(b.salary) || 0;
        var sgcPct = Number(b.sgc)    || 11.5;
        var extra  = Number(b.extra)  || 0;
        if (!salary) return 0;
        // Inline D293 calculation (does not depend on calcDiv293 being defined)
        var sgcAmt    = salary * (sgcPct / 100);
        var totalConc = Math.min(sgcAmt + extra, 30000);   // 2024-25 concessional cap
        var incTest   = salary + totalConc;
        var threshold = 250000;
        if (incTest <= threshold) return 0;
        var taxable   = Math.min(totalConc, incTest - threshold);
        return Math.round(taxable * 0.15);
    } catch(e) { return 0; }
}

// Calculate Brenton's total liability
function taxCalcBreton(fy) {
    try {
        var d    = taxData(fy);
        var rate = Number(d.bRate) || 47;
        var d293 = taxGetD293Auto();
        var rsus = d.rsus || [];
        var rsuTotal = 0;
        for (var i = 0; i < rsus.length; i++) {
            var units = parseFloat(rsus[i].units) || 0;
            var price = parseFloat(rsus[i].price) || 0;
            rsuTotal += units * price;
        }
        var rsuTax = Math.round(rsuTotal * (rate / 100));
        var totalLiability = rsuTax + d293;
        var basTotal = 0;
        var quarters = taxQuarters(fy);
        for (var j = 0; j < quarters.length; j++) {
            basTotal += parseFloat(taxGetBASRaw(fy, 'b', quarters[j].key, 'amt')) || 0;
        }
        var owing = totalLiability - basTotal;
        return {
            rate: rate, d293: d293, rsuIncome: rsuTotal, rsuTax: rsuTax,
            totalLiability: totalLiability, basTotal: basTotal, owing: owing,
            salary: (SUPER && SUPER.b) ? (Number(SUPER.b.salary) || 0) : 0
        };
    } catch(e) {
        return { rate: 47, d293: 0, rsuIncome: 0, rsuTax: 0, totalLiability: 0, basTotal: 0, owing: 0, salary: 0 };
    }
}

// Calculate Shelley's total liability
function taxCalcShelley(fy) {
    try {
        var d      = taxData(fy);
        var gross  = Number(d.sIncome) || 0;
        var deduc  = Number(d.sDeduc)  || 0;
        var taxable = Math.max(0, gross - deduc);
        var r       = calcAusTax(taxable);
        var basTotal = 0;
        var quarters = taxQuarters(fy);
        for (var j = 0; j < quarters.length; j++) {
            basTotal += parseFloat(taxGetBASRaw(fy, 's', quarters[j].key, 'amt')) || 0;
        }
        var owing = r.total - basTotal;
        return {
            gross: gross, deduc: deduc, taxable: taxable,
            incomeTax: r.incomeTax, medicare: r.medicare,
            totalLiability: r.total, basTotal: basTotal, owing: owing
        };
    } catch(e) {
        return { gross: 0, deduc: 0, taxable: 0, incomeTax: 0, medicare: 0, totalLiability: 0, basTotal: 0, owing: 0 };
    }
}

// Combined owing (used by Cash Tracker and Dashboard)
function taxTotalOwing() {
    try {
        var fy = taxGetFY();
        return Math.max(0, taxCalcBreton(fy).owing) + Math.max(0, taxCalcShelley(fy).owing);
    } catch(e) { return 0; }
}

// ── Main render ───────────────────────────────────────────────
function taxGoSuper(){ go('super'); }

function renderTaxResults() {
    try {
        var fy = taxGetFY();
        var d  = taxData(fy);

        // ── D293 display (reads SUPER.b live) ────────────────
        var d293El   = document.getElementById('tax-b-d293-display');
        var d293Work = document.getElementById('tax-d293-workings');
        var syncRows = document.getElementById('tax-super-sync-rows');
        var bSup     = (SUPER && SUPER.b) ? SUPER.b : {};
        var sal      = Number(bSup.salary) || 0;
        var sgcPct   = Number(bSup.sgc)   || 11.5;
        var extraC   = Number(bSup.extra)  || 0;
        var sgcAmt   = sal * (sgcPct / 100);
        var concCap  = 30000;
        var totalConc  = Math.min(sgcAmt + extraC, concCap);
        var incomeTest = sal + totalConc;
        var threshold  = 250000;

        if (syncRows) {
            if (!sal) {
                syncRows.innerHTML = '<div style="font-size:.8rem;color:var(--warn)">&#9888; No salary found — <a href="#" onclick="taxGoSuper();return false;" style="color:var(--primary)">update in Super tab</a></div>';
            } else {
                syncRows.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:.78rem">'
                    + '<span style="color:var(--muted)">Annual Salary</span><span style="font-weight:700">' + fmt(sal) + '</span>'
                    + '<span style="color:var(--muted)">SGC Rate</span><span style="font-weight:700">' + sgcPct + '%</span>'
                    + '<span style="color:var(--muted)">SGC Contribution</span><span style="font-weight:700">' + fmt(sgcAmt) + '</span>'
                    + (extraC > 0 ? '<span style="color:var(--muted)">Extra Concessional</span><span style="font-weight:700">' + fmt(extraC) + '</span>' : '')
                    + '<span style="color:var(--muted)">Total Concessional</span><span style="font-weight:700">' + fmt(totalConc) + (totalConc >= concCap ? ' <span style="color:var(--warn);font-size:.68rem">(capped at $30k)</span>' : '') + '</span>'
                    + '<span style="color:var(--muted)">Income Test Total</span><span style="font-weight:700;color:' + (incomeTest > threshold ? 'var(--danger)' : 'var(--success)') + '">' + fmt(incomeTest) + (incomeTest > threshold ? ' &#x25b2;$250k' : ' &#x25bc;$250k') + '</span>'
                    + '</div>';
            }
        }
        if (d293El) {
            if (!sal) {
                d293El.textContent = '—';
            } else if (incomeTest <= threshold) {
                d293El.innerHTML = '<span style="color:var(--success);font-weight:700">Nil</span>';
            } else {
                var taxableD293 = Math.min(totalConc, incomeTest - threshold);
                var d293amount  = Math.round(taxableD293 * 0.15);
                d293El.innerHTML = '<span style="font-weight:700;color:var(--danger);font-size:1.05rem">' + fmt(d293amount) + '</span>';
            }
        }
        if (d293Work) {
            if (!sal) {
                d293Work.textContent = 'Enter salary in Super tab';
            } else if (incomeTest <= threshold) {
                d293Work.textContent = 'Income test ' + fmt(incomeTest) + ' is below the $250,000 threshold — Div 293 does not apply.';
            } else {
                var taxableD293b = Math.min(totalConc, incomeTest - threshold);
                d293Work.textContent = fmt(taxableD293b) + ' x 15% = ' + fmt(Math.round(taxableD293b * 0.15))
                    + ' (income test ' + fmt(incomeTest) + ' exceeds $250k by ' + fmt(incomeTest - threshold) + ')';
            }
        }

        // ── Brenton result box ────────────────────────────────
        var bCalc     = taxCalcBreton(fy);
        var bResultEl = document.getElementById('tax-b-result');
        if (bResultEl) {
            var d293Label = bCalc.d293 > 0 ? 'Division 293 (15% surcharge)' : 'Division 293';
            var d293Val   = bCalc.d293 > 0
                ? '<span style="color:var(--danger)">' + fmt(bCalc.d293) + '</span>'
                : '<span style="color:var(--success)">Not applicable</span>';
            var bOwingHtml = bCalc.owing <= 0
                ? '<span class="tax-owing clear">Nil' + (bCalc.owing < 0 ? ' (overpaid ' + fmt(Math.abs(bCalc.owing)) + ')' : '') + '</span>'
                : '<span class="tax-owing">' + fmt(bCalc.owing) + '</span>';
            bResultEl.innerHTML = ''
                + '<div class="tax-result-row"><span class="tax-result-label">RSU Taxable Income</span><span>' + fmt(bCalc.rsuIncome) + '</span></div>'
                + '<div class="tax-result-row"><span class="tax-result-label">RSU Tax (' + bCalc.rate + '% rate)</span><span>' + fmt(bCalc.rsuTax) + '</span></div>'
                + '<div class="tax-result-row"><span class="tax-result-label">' + d293Label + '</span>' + d293Val + '</div>'
                + '<div class="tax-result-row" style="border-top:1.5px solid var(--border);margin-top:4px;padding-top:8px"><span class="tax-result-label" style="font-weight:700">Total Estimated Liability</span><span style="font-weight:700">' + fmt(bCalc.totalLiability) + '</span></div>'
                + '<div class="tax-result-row"><span class="tax-result-label" style="color:var(--success)">Less: PAYG Instalments Paid</span><span style="color:var(--success)">-' + fmt(bCalc.basTotal) + '</span></div>'
                + '<div class="tax-result-row tax-result-total"><span>Still Owing</span>' + bOwingHtml + '</div>';
        }

        // ── BAS totals only (do NOT rebuild inputs) ───────────
        var qs = taxQuarters(fy);
        for (var pi = 0; pi < 2; pi++) {
            var person = pi === 0 ? 'b' : 's';
            var runTotal = 0;
            for (var qi = 0; qi < qs.length; qi++) {
                runTotal += parseFloat(taxGetBASRaw(fy, person, qs[qi].key, 'amt')) || 0;
            }
            var totalEl = document.getElementById('tax-' + person + '-bas-total');
            if (totalEl) totalEl.textContent = runTotal > 0 ? 'Total paid: ' + fmt(runTotal) : '';
        }

        // ── Shelley result box ────────────────────────────────
        var sCalc     = taxCalcShelley(fy);
        var sResultEl = document.getElementById('tax-s-result');
        if (sResultEl) {
            var sOwingHtml = sCalc.owing <= 0
                ? '<span class="tax-owing clear">Nil' + (sCalc.owing < 0 ? ' (overpaid ' + fmt(Math.abs(sCalc.owing)) + ')' : '') + '</span>'
                : '<span class="tax-owing">' + fmt(sCalc.owing) + '</span>';
            sResultEl.innerHTML = ''
                + '<div class="tax-result-row"><span class="tax-result-label">Gross Business Income</span><span>' + fmt(sCalc.gross) + '</span></div>'
                + '<div class="tax-result-row"><span class="tax-result-label">Business Deductions</span><span style="color:var(--success)">-' + fmt(sCalc.deduc) + '</span></div>'
                + '<div class="tax-result-row" style="border-top:1.5px solid var(--border);margin-top:4px;padding-top:8px"><span class="tax-result-label" style="font-weight:700">Taxable Income</span><span style="font-weight:700">' + fmt(sCalc.taxable) + '</span></div>'
                + '<div class="tax-result-row"><span class="tax-result-label">Income Tax (2024-25 rates)</span><span>' + fmt(sCalc.incomeTax) + '</span></div>'
                + '<div class="tax-result-row"><span class="tax-result-label">Medicare Levy (2%)</span><span>' + fmt(sCalc.medicare) + '</span></div>'
                + '<div class="tax-result-row"><span class="tax-result-label" style="font-weight:700">Total Estimated Liability</span><span style="font-weight:700">' + fmt(sCalc.totalLiability) + '</span></div>'
                + '<div class="tax-result-row"><span class="tax-result-label" style="color:var(--success)">Less: BAS Payments Made</span><span style="color:var(--success)">-' + fmt(sCalc.basTotal) + '</span></div>'
                + '<div class="tax-result-row tax-result-total"><span>Still Owing</span>' + sOwingHtml + '</div>';
        }

        // ── Summary strip ─────────────────────────────────────
        var sumEl = document.getElementById('tax-summary-strip');
        if (sumEl) {
            var totalLiab  = bCalc.totalLiability + sCalc.totalLiability;
            var totalBAS   = bCalc.basTotal + sCalc.basTotal;
            var totalOwing = Math.max(0, bCalc.owing) + Math.max(0, sCalc.owing);
            sumEl.innerHTML = ''
                + '<div class="stat stat-dark"><div class="sl">Total Liability</div><div class="sv">' + fmt(totalLiab) + '</div><div class="ss">' + taxFyLabel(fy) + '</div></div>'
                + '<div class="stat stat-purple"><div class="sl">PAYG / BAS Paid</div><div class="sv">' + fmt(totalBAS) + '</div><div class="ss">Reduces amount owing</div></div>'
                + '<div class="stat ' + (totalOwing > 0 ? 'stat-rose' : 'stat-dark') + '"><div class="sl">Still Owing</div><div class="sv">' + fmt(totalOwing) + '</div><div class="ss">Net after payments</div></div>';
        }

        // ── Combined section ──────────────────────────────────
        var combinedEl = document.getElementById('tax-combined');
        if (combinedEl) {
            var bOwe = Math.max(0, bCalc.owing);
            var sOwe = Math.max(0, sCalc.owing);
            var tOwe = bOwe + sOwe;
            combinedEl.innerHTML = '<div class="g3">'
                + '<div class="stat stat-pink"><div class="sl">'+getUserName('brenton')+' Owing</div><div class="sv" style="color:' + (bOwe > 0 ? 'var(--danger)' : 'var(--success)') + '">' + fmt(bOwe) + '</div><div class="ss">After PAYG instalments</div></div>'
                + '<div class="stat stat-purple"><div class="sl">'+getUserName('shelley')+' Owing</div><div class="sv" style="color:' + (sOwe > 0 ? 'var(--danger)' : 'var(--success)') + '">' + fmt(sOwe) + '</div><div class="ss">After BAS payments</div></div>'
                + '<div class="stat ' + (tOwe > 0 ? 'stat-rose' : 'stat-dark') + '"><div class="sl">Combined Owing</div><div class="sv">' + fmt(tOwe) + '</div><div class="ss">Cash to set aside</div></div>'
                + '</div>';
        }
    } catch(e) {
        console.error('renderTaxResults error:', e);
    }
}

function renderTax() {
    try {
        var fy = taxGetFY();
        var d  = taxData(fy);
        var qs = taxQuarters(fy);

        // FY label + due date
        var fyLbl = document.getElementById('tax-fy-label');
        if (fyLbl) fyLbl.textContent = taxFyLabel(fy);

        var duePill = document.getElementById('tax-due-pill');
        if (duePill) {
            var dueDate = new Date(String(fy + 1) + '-05-31');
            var diffD   = Math.ceil((dueDate - new Date()) / 86400000);
            var dueStr  = dueDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
            duePill.textContent = diffD < 0
                ? 'Due ' + dueStr + ' (past due)'
                : 'Due ' + dueStr + ' \u2014 ' + diffD + ' days';
            duePill.style.color = diffD <= 60 ? 'var(--danger)' : 'var(--warn)';
        }

        // Restore saved field values (don't override if user is typing)
        var rateEl = document.getElementById('tax-b-rate');
        var sIncEl = document.getElementById('tax-s-income');
        var sDecEl = document.getElementById('tax-s-deductions');
        if (rateEl && document.activeElement !== rateEl) rateEl.value = d.bRate || 47;
        if (sIncEl && document.activeElement !== sIncEl) sIncEl.value = d.sIncome || '';
        if (sDecEl && document.activeElement !== sDecEl) sDecEl.value = d.sDeduc  || '';

        // RSU grants list (inputs — only rebuild if not focused inside)
        var rsuEl = document.getElementById('tax-b-rsu-list');
        if (rsuEl) {
            var rsus = d.rsus || [];
            if (!rsus.length) {
                rsuEl.innerHTML = '<div style="font-size:.78rem;color:var(--muted);padding:8px 0 4px">No RSU grants added. Click <strong>+ Add RSU Grant</strong> below.</div>';
            } else {
                var rHtml = '';
                for (var ri = 0; ri < rsus.length; ri++) {
                    var rsu   = rsus[ri];
                    var uVal  = parseFloat(rsu.units) || 0;
                    var pVal  = parseFloat(rsu.price) || 0;
                    var calc  = uVal * pVal;
                    rHtml += '<div class="rsu-row">'
                        + '<div style="flex:0 0 140px"><label class="lbl" style="font-size:.68rem">Grant / Vest Date</label>'
                        + '<input type="date" value="' + (rsu.date || '') + '"'
                        + ' style="padding:5px 8px;font-size:.8rem;width:100%"'
                        + ' onchange="taxSaveRSU(' + ri + ',\'date\',this.value)"/></div>'
                        + '<div style="flex:1;min-width:90px"><label class="lbl" style="font-size:.68rem">Units Vested</label>'
                        + '<input type="number" value="' + (rsu.units || '') + '" placeholder="0" min="0"'
                        + ' style="padding:5px 8px;font-size:.8rem;width:100%"'
                        + ' oninput="taxSaveRSU(' + ri + ',\'units\',this.value)"/></div>'
                        + '<div style="flex:1;min-width:90px"><label class="lbl" style="font-size:.68rem">Market Value / Unit ($)</label>'
                        + '<input type="number" value="' + (rsu.price || '') + '" placeholder="0.00" min="0" step="0.01"'
                        + ' style="padding:5px 8px;font-size:.8rem;width:100%"'
                        + ' oninput="taxSaveRSU(' + ri + ',\'price\',this.value)"/></div>'
                        + '<div class="rsu-calculated"><div style="font-size:.64rem;color:var(--muted);margin-bottom:2px">Taxable Income</div>'
                        + fmt(calc) + '</div>'
                        + '<button class="del-btn" onclick="taxDeleteRSU(' + ri + ')" title="Remove">&#x1f5d1;</button>'
                        + '</div>';
                }
                rsuEl.innerHTML = rHtml;
            }
        }

        // BAS input tables — only rebuild if tbody is empty (first load / FY change)
        renderTaxBAS('b', qs);
        renderTaxBAS('s', qs);

        // All result boxes, summaries, combined
        renderTaxResults();
    } catch(e) {
        console.error('renderTax error:', e);
    }
}


function renderTaxBAS(person, qs) {
    try {
        var fy     = taxGetFY();
        var bodyEl = document.getElementById('tax-' + person + '-bas-body');
        if (!bodyEl) return;
        var rows  = '';
        var total = 0;
        for (var i = 0; i < qs.length; i++) {
            var q    = qs[i];
            var dval = taxGetBASRaw(fy, person, q.key, 'date');
            var aval = taxGetBASRaw(fy, person, q.key, 'amt');
            var aNum = parseFloat(aval) || 0;
            total += aNum;
            // Use single-quoted args so they don't break the HTML attribute
            var saveAmt  = "taxSaveBAS('" + person + "','" + q.key + "','amt',this.value);renderTaxResults()";
            var saveDate = "taxSaveBAS('" + person + "','" + q.key + "','date',this.value);renderTaxResults()";
            rows += '<tr>'
                + '<td style="font-weight:700;color:var(--primary)">' + q.q + '</td>'
                + '<td style="color:var(--muted);font-size:.76rem">' + q.period + '</td>'
                + '<td><input type="date" value="' + dval + '"'
                + ' style="padding:5px 8px;font-size:.8rem;width:130px;border-radius:6px;background:var(--card2);border:1px solid var(--border);color:var(--text)"'
                + ' onchange="' + saveDate + '"/></td>'
                + '<td><input type="number" value="' + aval + '" placeholder="0.00" min="0" step="100"'
                + ' style="padding:5px 8px;font-size:.8rem;width:120px;border-radius:6px;background:var(--card2);border:1px solid var(--border);color:var(--text)"'
                + ' oninput="' + saveAmt + '"/></td>'
                + '<td style="font-weight:600;text-align:right;padding-right:8px;color:' + (aNum > 0 ? 'var(--success)' : 'var(--muted)') + '">'
                + (aNum > 0 ? fmt(aNum) : '—') + '</td>'
                + '</tr>';
        }
        bodyEl.innerHTML = rows;
        var totalEl = document.getElementById('tax-' + person + '-bas-total');
        if (totalEl) totalEl.textContent = total > 0 ? 'Total paid: ' + fmt(total) : '';
    } catch(e) {
        console.error('renderTaxBAS error:', e);
    }
}

// Dashboard tax stat card
function dbRenderTaxStat() {
    try {
        var el = document.getElementById('db-tax-stat');
        if (!el) return;
        var fy    = taxGetFY();
        var bCalc = taxCalcBreton(fy);
        var sCalc = taxCalcShelley(fy);
        var bOwe  = Math.max(0, bCalc.owing);
        var sOwe  = Math.max(0, sCalc.owing);
        var total = bOwe + sOwe;
        if (!bCalc.totalLiability && !sCalc.totalLiability) { el.innerHTML = ''; return; }
        el.innerHTML = '<div class="card" style="margin-top:14px">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">'
            + '<div class="section-label" style="margin:0">&#x1F9FE; Tax Liability \u2014 ' + taxFyLabel(fy) + '</div>'
            + '<a href="#" onclick="go(\'tax\');return false;" style="font-size:.76rem;color:var(--primary)">View details &#x2192;</a>'
            + '</div>'
            + '<div class="g3">'
            + '<div class="stat stat-dark"><div class="sl">'+getUserName('brenton')+' Owing</div><div class="sv" style="color:' + (bOwe > 0 ? 'var(--danger)' : 'var(--success)') + '">' + fmt(bOwe) + '</div><div class="ss">After BAS</div></div>'
            + '<div class="stat stat-dark"><div class="sl">'+getUserName('shelley')+' Owing</div><div class="sv" style="color:' + (sOwe > 0 ? 'var(--danger)' : 'var(--success)') + '">' + fmt(sOwe) + '</div><div class="ss">After BAS</div></div>'
            + '<div class="stat ' + (total > 0 ? 'stat-rose' : 'stat-dark') + '"><div class="sl">Combined Owing</div><div class="sv">' + fmt(total) + '</div><div class="ss">Set aside from cash</div></div>'
            + '</div></div>';
    } catch(e) { console.error('dbRenderTaxStat error:', e); }
}


// ══════════════════════════════════════════════════════════════
