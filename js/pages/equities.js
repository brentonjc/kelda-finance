// ══════════════════════════════════════════════════════════════
// EQUITY HOLDINGS — Shares, ETFs, Bonds, Crypto, RSUs, Options
// Single source of truth for all investment holdings.
// ══════════════════════════════════════════════════════════════

function eqToken(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()||'';}

// ── Chart instances ────────────────────────────────────────────
var eqAllocChart      = null;
var eqBarChart        = null;
var eqVestChart       = null;
var eqVestDonutChart  = null;

// ── Asset type config ──────────────────────────────────────────
var EQ_TYPES = [
    { key:'stock',  label:'Shares',  icon:'building-bank', color:'#F0538A' },
    { key:'etf',    label:'ETF',     icon:'chart-bar', color:'#818CF8' },
    { key:'bond',   label:'Bond',    icon:'lock', color:'#F59E0B' },
    { key:'crypto', label:'Crypto',  icon:'₿',  color:'#F97316' },
    { key:'rsu',    label:'RSU',     icon:'target', color:'#00C896' },
    { key:'option', label:'Options', icon:'settings', color:'#60A5FA' },
];
var EQ_EXCHANGES = ['ASX', 'NYSE', 'NASDAQ', 'Other', 'Private', 'Crypto'];

function eqTypeCfg(key) {
    for (var i = 0; i < EQ_TYPES.length; i++) { if (EQ_TYPES[i].key === key) return EQ_TYPES[i]; }
    return EQ_TYPES[0];
}

// ── Vesting engine ────────────────────────────────────────────
// Model: totalUnits granted, vestingYears total period, vestFrequency per year.
// cliffYears = delay before first vest event (0 = vesting starts from grant date).
// numVests = vestingYears × freqPerYear, evenly distributed from cliffDate.
// Supports old data stored in cliffMonths/vestingMonths via fallback conversion.
// Returns { vested, unvested, pct, nextVestDate, nextVestQty, unitsPerVest, schedule[] }
function eqVestCalc(h) {
    var total = parseFloat(h.totalUnits) || 0;
    // Support new (years) and legacy (months) storage
    var cliffY = (h.cliffYears !== undefined) ? parseFloat(h.cliffYears) : (parseInt(h.cliffMonths) || 0) / 12;
    var vestY  = (h.vestingYears !== undefined) ? parseFloat(h.vestingYears) : (parseInt(h.vestingMonths) || 48) / 12;
    var freq   = h.vestFrequency || 'quarterly';
    var gd     = h.grantDate || '';
    var empty  = { vested:0, unvested:total, pct:0, nextVestDate:null, nextVestQty:0, unitsPerVest:0, schedule:[] };
    if (!total || !gd) return empty;
    var grant = new Date(gd + 'T00:00:00');
    if (isNaN(grant.getTime())) return empty;
    var now = new Date();

    // Cliff date = grant + cliffYears (converted to whole months)
    var cliffMonths = Math.round(cliffY * 12);
    var cliffDate   = new Date(grant.getFullYear(), grant.getMonth() + cliffMonths, grant.getDate());

    // Frequency: months between vest events, and events per year
    var freqM       = freq === 'monthly' ? 1 : freq === 'annual' ? 12 : 3;
    var freqPerYear = freq === 'monthly' ? 12 : freq === 'annual' ? 1 : 4;

    // Total vest events across the full vesting period
    var numVests    = Math.max(1, Math.round(vestY * freqPerYear));
    var unitsPerV   = total / numVests;

    var schedule = [], vested = 0, cum = 0, nextVestDate = null, nextVestQty = 0;
    for (var i = 0; i < numVests; i++) {
        var vd    = new Date(cliffDate.getFullYear(), cliffDate.getMonth() + i * freqM, cliffDate.getDate());
        var units = (i === numVests - 1) ? Math.max(0, Math.round(total - cum)) : Math.round(unitsPerV);
        cum += units;
        var isPast = vd <= now;
        if (isPast) { vested += units; } else if (!nextVestDate) { nextVestDate = vd; nextVestQty = units; }
        schedule.push({ date: vd, units: units, cumulative: cum, isPast: isPast });
    }
    var pct = total > 0 ? Math.min(100, (vested / total) * 100) : 0;
    return { vested:vested, unvested:total-vested, pct:pct, nextVestDate:nextVestDate, nextVestQty:nextVestQty, unitsPerVest:Math.round(unitsPerV), schedule:schedule };
}

// ── Value & cost helpers ──────────────────────────────────────
function eqHoldingValue(h) {
    var t = h.type || 'stock';
    if (t === 'bond') return parseFloat(h.currentValue) || 0;
    if (t === 'rsu') {
        var v = eqVestCalc(h);
        var s = (h.sales||[]).reduce(function(a,x){return a+(parseFloat(x.qty)||0);},0);
        return Math.max(0, v.vested - s) * (parseFloat(h.currentPrice)||0);
    }
    if (t === 'option') {
        var v2 = eqVestCalc(h);
        var s2 = (h.sales||[]).reduce(function(a,x){return a+(parseFloat(x.qty)||0);},0);
        var intr = Math.max(0, (parseFloat(h.currentPrice)||0) - (parseFloat(h.strikePrice)||0));
        return Math.max(0, v2.vested - s2) * intr;
    }
    var sold = (h.sales||[]).reduce(function(a,x){return a+(parseFloat(x.qty)||0);},0);
    return Math.max(0, (parseFloat(h.qty)||0) - sold) * (parseFloat(h.currentPrice)||0);
}

function eqHoldingCost(h) {
    var t = h.type || 'stock';
    if (t === 'bond') return parseFloat(h.purchasePrice) || 0;
    if (t === 'rsu' || t === 'option') return 0;
    var sold = (h.sales||[]).reduce(function(a,x){return a+(parseFloat(x.qty)||0);},0);
    return Math.max(0, (parseFloat(h.qty)||0) - sold) * (parseFloat(h.cost)||0);
}

function eqHoldingGain(h) { return eqHoldingValue(h) - eqHoldingCost(h); }

function eqTotalByType(type) {
    return EQUITIES.filter(function(h){return h.type===type;})
                   .reduce(function(s,h){return s+eqHoldingValue(h);},0);
}

function eqTotalEquitiesValue() {
    return EQUITIES.reduce(function(s,h){return s+eqHoldingValue(h);},0);
}

function eqTotalCostBasis() {
    return EQUITIES.reduce(function(s,h){return s+eqHoldingCost(h);},0);
}

function eqTotalGain() {
    return EQUITIES.reduce(function(s,h){return s+eqHoldingGain(h);},0);
}


// Live price fetch removed — enter prices manually via ✏️ Edit or 💱 Update Prices

// ══════════════════════════════════════════════════════════════
// MAIN RENDER
// ══════════════════════════════════════════════════════════════
function renderEquitiesPage() {
    renderEqHero();
    renderEqKPIs();
    renderEqVestSummary();
    renderEqVestByYear();
    renderEqCharts();
    renderEquitiesList();
    renderEqMonthlyGrid();
}

// ── Vested vs Unvested — portfolio summary card ───────────────
function renderEqVestSummary() {
    var el = document.getElementById('eq-vest-summary');
    if (!el) return;
    var vestHoldings = EQUITIES.filter(function(h){ return h.type==='rsu'||h.type==='option'; });
    if (!vestHoldings.length) { el.innerHTML=''; el.style.display='none'; return; }
    el.style.display = '';

    var totalUnits=0, vestedUnits=0, unvestedUnits=0, vestedValue=0, unvestedValue=0;
    vestHoldings.forEach(function(h) {
        var v   = eqVestCalc(h);
        var px  = parseFloat(h.currentPrice) || 0;
        var sold= (h.sales||[]).reduce(function(a,x){ return a+(parseFloat(x.qty)||0); }, 0);
        var heldVested = Math.max(0, v.vested - sold);
        totalUnits    += parseFloat(h.totalUnits) || 0;
        vestedUnits   += v.vested;
        unvestedUnits += v.unvested;
        vestedValue   += heldVested * px;
        unvestedValue += v.unvested * px;
    });

    var pct    = totalUnits > 0 ? Math.min(100, vestedUnits / totalUnits * 100) : 0;
    var barClr = pct >= 75 ? 'var(--success)' : pct >= 40 ? 'var(--warn)' : 'var(--danger)';

    el.innerHTML = '<div class="section-label mb-sm">RSU &amp; Options — Vesting Status</div>'
        + '<div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:16px">'
        + '<div>'
        +   '<div style="font-size:.7rem;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:.05em">Vested (held)</div>'
        +   '<div style="font-family:var(--font-mono);font-size:1.4rem;font-weight:700;color:var(--success)">' + fmt(vestedValue) + '</div>'
        +   '<div style="font-size:.72rem;color:var(--muted);margin-top:2px">' + vestedUnits.toFixed(0) + ' units vested</div>'
        + '</div>'
        + '<div style="border-left:1px solid var(--border);padding-left:24px">'
        +   '<div style="font-size:.7rem;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:.05em">Unvested (future)</div>'
        +   '<div style="font-family:var(--font-mono);font-size:1.4rem;font-weight:700;color:var(--warn)">' + fmt(unvestedValue) + '</div>'
        +   '<div style="font-size:.72rem;color:var(--muted);margin-top:2px">' + unvestedUnits.toFixed(0) + ' units remaining</div>'
        + '</div>'
        + '<div style="border-left:1px solid var(--border);padding-left:24px">'
        +   '<div style="font-size:.7rem;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:.05em">Total Granted</div>'
        +   '<div style="font-family:var(--font-mono);font-size:1.4rem;font-weight:700">' + fmt(vestedValue + unvestedValue) + '</div>'
        +   '<div style="font-size:.72rem;color:var(--muted);margin-top:2px">' + totalUnits.toFixed(0) + ' total units</div>'
        + '</div>'
        + '</div>'
        + '<div style="background:var(--card2);border-radius:6px;height:10px;overflow:hidden">'
        +   '<div style="height:100%;width:' + pct.toFixed(1) + '%;background:' + barClr + ';border-radius:6px"></div>'
        + '</div>'
        + '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:.72rem;color:var(--muted)">'
        +   '<span style="color:' + barClr + ';font-weight:600">' + pct.toFixed(1) + '% vested</span>'
        +   '<span>' + (100 - pct).toFixed(1) + '% unvested</span>'
        + '</div>';
}

// ── Vested vs Unvested — by year: doughnut + table ────────────
function renderEqVestByYear() {
    var el = document.getElementById('eq-vest-by-year');
    if (!el) return;
    var vestHoldings = EQUITIES.filter(function(h){ return h.type==='rsu'||h.type==='option'; });
    if (!vestHoldings.length) { el.style.display='none'; return; }
    el.style.display = '';

    // Build year map: year → { vestedUnits, vestedValue, unvestedUnits, unvestedValue }
    var yearMap = {};
    vestHoldings.forEach(function(h) {
        var v  = eqVestCalc(h);
        var px = parseFloat(h.currentPrice) || 0;
        v.schedule.forEach(function(s) {
            var yr = s.date.getFullYear();
            if (!yearMap[yr]) yearMap[yr] = { vestedUnits:0, vestedValue:0, unvestedUnits:0, unvestedValue:0 };
            if (s.isPast) {
                yearMap[yr].vestedUnits  += s.units;
                yearMap[yr].vestedValue  += s.units * px;
            } else {
                yearMap[yr].unvestedUnits += s.units;
                yearMap[yr].unvestedValue += s.units * px;
            }
        });
    });

    var years        = Object.keys(yearMap).map(Number).sort();
    var totalVested  = years.reduce(function(s,y){ return s + yearMap[y].vestedValue;   }, 0);
    var totalUnvested= years.reduce(function(s,y){ return s + yearMap[y].unvestedValue; }, 0);

    // ── Doughnut chart ────────────────────────────────────────
    if (eqVestDonutChart) { eqVestDonutChart.destroy(); eqVestDonutChart = null; }
    var donutCtx = document.getElementById('eq-vest-donut-chart');
    if (donutCtx && (totalVested > 0 || totalUnvested > 0)) {
        eqVestDonutChart = safeChart(donutCtx, {
            type: 'doughnut',
            data: {
                labels: ['Vested', 'Unvested'],
                datasets: [{
                    data: [totalVested, totalUnvested],
                    backgroundColor: ['#00C896', '#F59E0B'],
                    borderWidth: 3,
                    borderColor: eqToken('--card'),
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position:'bottom', labels:{ color:eqToken('--muted'), font:{size:12}, padding:14 } },
                    tooltip: { callbacks: { label: function(c){ return ' ' + c.label + ': ' + fmt(c.parsed); } } }
                }
            }
        });
    }

    // ── Year-by-year table ────────────────────────────────────
    var tableEl = document.getElementById('eq-vest-year-table');
    if (!tableEl) return;
    var now = new Date();
    var curYr = now.getFullYear();
    var rows = '';
    years.forEach(function(yr) {
        var d   = yearMap[yr];
        var tag = yr < curYr ? '<span style="font-size:.65rem;background:var(--card2);color:var(--muted);padding:1px 6px;border-radius:20px;margin-left:6px">past</span>'
                : yr === curYr ? '<span style="font-size:.65rem;background:#00C89622;color:var(--success);padding:1px 6px;border-radius:20px;margin-left:6px">current</span>'
                : '';
        rows += '<tr style="border-bottom:1px solid var(--border)">'
            + '<td style="padding:7px 12px 7px 0;font-weight:600;white-space:nowrap">' + yr + tag + '</td>'
            + '<td style="padding:7px 8px;font-family:var(--font-mono);font-size:.82rem;color:var(--success);text-align:right">'
            +   (d.vestedUnits > 0 ? d.vestedUnits.toFixed(0) : '—') + '</td>'
            + '<td style="padding:7px 8px;font-family:var(--font-mono);font-size:.82rem;color:var(--success);text-align:right">'
            +   (d.vestedValue > 0 ? fmt(d.vestedValue) : '—') + '</td>'
            + '<td style="padding:7px 8px;font-family:var(--font-mono);font-size:.82rem;color:var(--warn);text-align:right">'
            +   (d.unvestedUnits > 0 ? d.unvestedUnits.toFixed(0) : '—') + '</td>'
            + '<td style="padding:7px 0 7px 8px;font-family:var(--font-mono);font-size:.82rem;color:var(--warn);text-align:right">'
            +   (d.unvestedValue > 0 ? fmt(d.unvestedValue) : '—') + '</td>'
            + '</tr>';
    });

    // Totals row
    var tvU = years.reduce(function(s,y){ return s+yearMap[y].vestedUnits; }, 0);
    var tuU = years.reduce(function(s,y){ return s+yearMap[y].unvestedUnits; }, 0);
    rows += '<tr style="border-top:2px solid var(--border)">'
        + '<td style="padding:8px 12px 4px 0;font-weight:700;font-size:.82rem">Total</td>'
        + '<td style="padding:8px 8px 4px;font-family:var(--font-mono);font-size:.82rem;color:var(--success);font-weight:700;text-align:right">' + tvU.toFixed(0) + '</td>'
        + '<td style="padding:8px 8px 4px;font-family:var(--font-mono);font-size:.82rem;color:var(--success);font-weight:700;text-align:right">' + fmt(totalVested) + '</td>'
        + '<td style="padding:8px 8px 4px;font-family:var(--font-mono);font-size:.82rem;color:var(--warn);font-weight:700;text-align:right">' + tuU.toFixed(0) + '</td>'
        + '<td style="padding:8px 0 4px 8px;font-family:var(--font-mono);font-size:.82rem;color:var(--warn);font-weight:700;text-align:right">' + fmt(totalUnvested) + '</td>'
        + '</tr>';

    tableEl.innerHTML = '<div style="overflow-x:auto">'
        + '<table style="width:100%;border-collapse:collapse;font-size:.82rem">'
        + '<thead><tr style="border-bottom:1.5px solid var(--border)">'
        +   '<th style="padding:0 12px 8px 0;text-align:left;color:var(--muted);font-weight:600;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em">Year</th>'
        +   '<th style="padding:0 8px 8px;text-align:right;color:var(--success);font-weight:600;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em">Units</th>'
        +   '<th style="padding:0 8px 8px;text-align:right;color:var(--success);font-weight:600;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em">Value</th>'
        +   '<th style="padding:0 8px 8px;text-align:right;color:var(--warn);font-weight:600;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em">Units</th>'
        +   '<th style="padding:0 0 8px 8px;text-align:right;color:var(--warn);font-weight:600;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em">Value</th>'
        + '</tr>'
        + '<tr style="border-bottom:1px solid var(--border)">'
        +   '<td></td>'
        +   '<td colspan="2" style="padding:2px 8px 6px;text-align:center;font-size:.68rem;color:var(--success);font-weight:600">' + ICON('check') + ' Vested</td>'
        +   '<td colspan="2" style="padding:2px 0 6px 8px;text-align:center;font-size:.68rem;color:var(--warn);font-weight:600">⏳ Unvested</td>'
        + '</tr></thead>'
        + '<tbody>' + rows + '</tbody>'
        + '</table></div>';
}

// ── Hero card ─────────────────────────────────────────────────
function renderEqHero() {
    var el = document.getElementById('eq-hero');
    if (!el) return;
    var total = eqTotalEquitiesValue();
    var cost  = eqTotalCostBasis();
    var gain  = eqTotalGain();
    var gainPct = cost > 0 ? ((gain / cost) * 100).toFixed(2) : '0.00';
    var gc  = gain >= 0 ? 'var(--success)' : 'var(--danger)';
    var gs  = gain >= 0 ? '+' : '';
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px">'
        + '<div>'
        + '<div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px">Total Portfolio Value</div>'
        + '<div style="font-family:var(--font-mono);font-size:2.2rem;font-weight:700;line-height:1">' + fmt(total) + '</div>'
        + '<div style="margin-top:10px;display:flex;gap:20px;flex-wrap:wrap">'
        + '<div><div style="font-size:.7rem;color:var(--muted)">Cost Basis</div><div style="font-family:var(--font-mono);font-weight:600;font-size:.9rem">' + fmt(cost) + '</div></div>'
        + '<div><div style="font-size:.7rem;color:var(--muted)">Unrealised P&amp;L</div><div style="font-family:var(--font-mono);font-weight:700;font-size:.9rem;color:' + gc + '">' + gs + fmt(Math.abs(gain)) + ' (' + gs + gainPct + '%)</div></div>'
        + '</div></div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">'
        + '<button class="btn btn-ghost btn-sm" onclick="openBatchPriceModal()">'+ICON('currency-dollar')+' Update Prices</button>'
        + '<button class="btn btn-primary btn-sm" onclick="openEqModal(null)">+ Add Holding</button>'
        + '</div></div>';
}

// ── KPI stats ─────────────────────────────────────────────────
function renderEqKPIs() {
    var el = document.getElementById('eq-kpis');
    if (!el) return;
    var shares = eqTotalByType('stock') + eqTotalByType('etf');
    var crypto = eqTotalByType('crypto');
    var rsuOpt = eqTotalByType('rsu') + eqTotalByType('option');
    var bonds  = eqTotalByType('bond');
    el.innerHTML = '<div class="stat stat-pink"><div class="sl">Shares &amp; ETFs</div><div class="sv">' + fmt(shares) + '</div><div class="ss">Market value</div></div>'
        + '<div class="stat stat-purple"><div class="sl">Crypto</div><div class="sv">' + fmt(crypto) + '</div><div class="ss">Current value</div></div>'
        + '<div class="stat stat-green"><div class="sl">RSUs &amp; Options</div><div class="sv">' + fmt(rsuOpt) + '</div><div class="ss">Vested only</div></div>'
        + '<div class="stat stat-amber"><div class="sl">Bonds</div><div class="sv">' + fmt(bonds) + '</div><div class="ss">Current value</div></div>';
}

// ── Charts ────────────────────────────────────────────────────
function renderEqCharts() {
    // Allocation pie
    var allocCtx = document.getElementById('eq-alloc-chart');
    if (allocCtx) {
        if (eqAllocChart) { eqAllocChart.destroy(); eqAllocChart = null; }
        var allocData = EQ_TYPES.map(function(t){ return { label:t.label, value:eqTotalByType(t.key), color:t.color }; }).filter(function(d){ return d.value > 0; });
        if (allocData.length) {
            eqAllocChart = safeChart(allocCtx, {
                type: 'doughnut',
                data: { labels: allocData.map(function(d){return d.label;}), datasets: [{ data: allocData.map(function(d){return d.value;}), backgroundColor: allocData.map(function(d){return d.color;}), borderWidth:3, borderColor:eqToken('--card'), hoverOffset:6 }] },
                options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:eqToken('--muted'), font:{size:11}, padding:10 } }, tooltip:{ callbacks:{ label:function(c){ return ' '+c.label+': '+fmt(c.parsed); } } } } }
            });
        }
    }

    // Holdings bar (top 10)
    var barCtx = document.getElementById('eq-bar-chart');
    if (barCtx) {
        if (eqBarChart) { eqBarChart.destroy(); eqBarChart = null; }
        var sorted = EQUITIES.slice().sort(function(a,b){ return eqHoldingValue(b)-eqHoldingValue(a); }).slice(0,10);
        if (sorted.length) {
            eqBarChart = safeChart(barCtx, {
                type: 'bar',
                data: { labels: sorted.map(function(h){ return h.ticker||h.company||'—'; }),
                    datasets: [{ label:'Value', data: sorted.map(function(h){ return eqHoldingValue(h); }), backgroundColor: sorted.map(function(h){ return eqTypeCfg(h.type).color+'cc'; }), borderColor: sorted.map(function(h){ return eqTypeCfg(h.type).color; }), borderWidth:1.5, borderRadius:4 }] },
                options: { indexAxis:'y', responsive:true, maintainAspectRatio:false,
                    plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:function(c){ return ' '+fmt(c.parsed.x); } } } },
                    scales:{ x:{ grid:{color:eqToken('--card2')}, ticks:{color:eqToken('--muted'),font:{size:10},callback:function(v){ return '$'+Math.round(v/1000)+'k'; }} }, y:{ grid:{display:false}, ticks:{color:eqToken('--muted'),font:{size:11}} } } }
            });
        }
    }

    // Vesting timeline (quarterly, next 3 years) — shows unit count bars, value in tooltip
    var vestCtx = document.getElementById('eq-vest-chart');
    if (vestCtx) {
        if (eqVestChart) { eqVestChart.destroy(); eqVestChart = null; }
        var vestHoldings = EQUITIES.filter(function(h){ return h.type==='rsu'||h.type==='option'; });
        if (vestHoldings.length) {
            var now2 = new Date();
            // Build 12 rolling quarters starting from current calendar quarter
            var qStartMonth = Math.floor(now2.getMonth()/3)*3;
            var quarters = [];
            for (var qi = 0; qi < 12; qi++) {
                var qMonth = qStartMonth + qi*3;
                var qYear  = now2.getFullYear() + Math.floor(qMonth/12);
                qMonth = qMonth % 12;
                var qd = new Date(qYear, qMonth, 1);
                var qLabel = 'Q'+(Math.floor(qMonth/3)+1)+' '+(qYear);
                quarters.push({ date:qd, label:qLabel, units:0, value:0 });
            }
            vestHoldings.forEach(function(h) {
                var vest2 = eqVestCalc(h);
                var px2   = parseFloat(h.currentPrice)||0;
                vest2.schedule.forEach(function(s) {
                    if (s.isPast) return;
                    for (var qi2 = 0; qi2 < quarters.length; qi2++) {
                        var qEnd2 = new Date(quarters[qi2].date.getFullYear(), quarters[qi2].date.getMonth()+3, 0);
                        if (s.date >= quarters[qi2].date && s.date <= qEnd2) {
                            quarters[qi2].units += s.units;
                            quarters[qi2].value += s.units * px2;
                            break;
                        }
                    }
                });
            });
            var hasData = quarters.some(function(q){ return q.units > 0; });
            if (hasData) {
                var hasPrice = quarters.some(function(q){ return q.value > 0; });
                eqVestChart = safeChart(vestCtx, {
                    type: 'bar',
                    data: { labels: quarters.map(function(q){return q.label;}),
                        datasets: [{ label:'Units Vesting', data: quarters.map(function(q){return q.units;}),
                            backgroundColor:'#00C89644', borderColor:'#00C896', borderWidth:1.5, borderRadius:4 }] },
                    options: { responsive:true, maintainAspectRatio:false,
                        plugins:{ legend:{display:false},
                            tooltip:{ callbacks:{ label:function(c){
                                var q = quarters[c.dataIndex];
                                var s = ' '+q.units+' units';
                                if (q.value > 0) s += ' (' + fmt(q.value) + ')';
                                return s;
                            }}}},
                        scales:{ x:{ grid:{display:false}, ticks:{color:eqToken('--muted'),font:{size:10}} },
                            y:{ grid:{color:eqToken('--card2')}, ticks:{color:eqToken('--muted'),font:{size:10},
                                callback:function(v){ return v % 1 === 0 ? v : ''; }} } } }
                });
            } else {
                // No future vesting events — show message on canvas
                var ctx2d = vestCtx.getContext('2d');
                if (ctx2d) { ctx2d.clearRect(0,0,vestCtx.width,vestCtx.height); ctx2d.fillStyle=eqToken('--muted'); ctx2d.font='13px Inter,sans-serif'; ctx2d.textAlign='center'; ctx2d.fillText('No upcoming vesting events', vestCtx.width/2, vestCtx.height/2||80); }
            }
        } else {
            var ctx2d2 = vestCtx.getContext('2d');
            if (ctx2d2) { ctx2d2.clearRect(0,0,vestCtx.width,vestCtx.height); ctx2d2.fillStyle=eqToken('--muted'); ctx2d2.font='13px Inter,sans-serif'; ctx2d2.textAlign='center'; ctx2d2.fillText('Add RSU or Options holdings to see vesting timeline', vestCtx.width/2, vestCtx.height/2||80); }
        }
    }
}

// ══════════════════════════════════════════════════════════════
// HOLDINGS LIST
// ══════════════════════════════════════════════════════════════
function renderEquitiesList() {
    var el = document.getElementById('eq-holdings-list');
    if (!el) return;

    if (!EQUITIES.length) {
        el.innerHTML = '<div class="empty"><div class="ei">'+ICON('trending-up')+'</div><p>No holdings yet. Click <strong>+ Add Holding</strong> to get started.</p></div>';
        return;
    }

    var html = '';

    // ── Grouped EQUITIES ──────────────────────────────────────
    var byType = {};
    EQUITIES.forEach(function(h){ var t=h.type||'stock'; if(!byType[t])byType[t]=[]; byType[t].push(h); });
    EQ_TYPES.forEach(function(tc) {
        var group = byType[tc.key];
        if (!group || !group.length) return;
        html += '<div class="eq-group-label">' + iconTag(tc.icon) + ' ' + tc.label + 's</div>';
        group.forEach(function(h){ html += renderEqHoldingRow(h); });
    });

    el.innerHTML = html;
}

function renderEqHoldingRow(h) {
    var tc   = eqTypeCfg(h.type);
    var val  = eqHoldingValue(h), cost = eqHoldingCost(h), gain = eqHoldingGain(h);
    var gPct = cost > 0 ? ((gain/cost)*100).toFixed(1) : null;
    var gc   = gain >= 0 ? 'var(--success)' : 'var(--danger)', gs = gain >= 0 ? '+' : '';
    var isVesting = h.type==='rsu'||h.type==='option';
    var exch = h.exchange||'';
    var updated = h.priceUpdated ? new Date(h.priceUpdated).toLocaleDateString('en-AU',{day:'numeric',month:'short'}) : '';

    var badge = exch==='Private' ? '<span class="eq-badge eq-badge-private">Private</span>' : (exch ? '<span class="eq-badge eq-badge-exch">'+exch+'</span>' : '');

    var vestBar = '';
    if (isVesting) {
        var vest = eqVestCalc(h), pct = vest.pct;
        var barClr = pct>=70?'var(--success)':pct>=30?'var(--warn)':'var(--danger)';
        vestBar = '<div class="eq-vest-bar-wrap"><div class="eq-vest-bar" style="width:'+pct.toFixed(1)+'%;background:'+barClr+'"></div></div>'
            + '<div style="font-size:.68rem;color:var(--muted);margin-top:2px">'
            + pct.toFixed(0)+'% vested &nbsp;·&nbsp; '+vest.vested.toFixed(0)+' / '+(parseFloat(h.totalUnits)||0).toFixed(0)+' units'
            + (vest.nextVestDate ? ' &nbsp;·&nbsp; Next: '+vest.nextVestDate.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})+' ('+vest.nextVestQty+' units)' : '')
            + '</div>';
        if (h.type==='option' && h.expiryDate) {
            var dExp = Math.ceil((new Date(h.expiryDate+'T00:00:00')-new Date())/86400000);
            if (dExp<=0) vestBar += '<div style="font-size:.7rem;color:var(--danger);font-weight:700;margin-top:3px">'+ICON('circle-filled')+' Expired</div>';
            else if (dExp<=90) vestBar += '<div style="font-size:.7rem;color:var(--warn);font-weight:700;margin-top:3px">'+ICON('alert-triangle')+' Expires in '+dExp+' days</div>';
        }
    }

    var qtyLine = '';
    if (h.type==='bond') {
        qtyLine = 'Face value: '+fmt(parseFloat(h.faceValue)||0)+' &nbsp;·&nbsp; Coupon: '+(parseFloat(h.couponRate)||0)+'%';
    } else if (isVesting) {
        qtyLine = 'Granted: '+(parseFloat(h.totalUnits)||0).toFixed(0)+' units';
    } else {
        var soldQ = (h.sales||[]).reduce(function(a,x){return a+(parseFloat(x.qty)||0);},0);
        var heldQ = Math.max(0,(parseFloat(h.qty)||0)-soldQ);
        qtyLine = heldQ.toFixed(heldQ%1===0?0:4)+' units';
    }

    return '<div class="eq-row" id="eq-row-'+h.id+'">'
        + '<div class="eq-row-main" onclick="eqToggleExpand('+h.id+')">'
        + '<div class="eq-row-icon">'+iconTag(tc.icon)+'</div>'
        + '<div class="eq-row-info">'
        + '<div class="eq-row-name">'+(h.ticker?'<span style="font-weight:700">'+h.ticker+'</span> ':'')+( h.company||'')+ ' '+badge+'</div>'
        + '<div class="eq-row-sub">'+qtyLine+(updated?' &nbsp;·&nbsp; Updated '+updated:'')+'</div>'
        + (vestBar?'<div style="margin-top:6px">'+vestBar+'</div>':'')
        + '</div>'
        + '<div class="eq-row-values">'
        + '<div style="font-family:var(--font-mono);font-weight:700;font-size:.95rem">'+fmt(val)+'</div>'
        + (gPct!==null
            ? '<div style="font-family:var(--font-mono);font-size:.78rem;color:'+gc+'">'+gs+fmt(Math.abs(gain))+' ('+gs+gPct+'%)</div>'
            : (isVesting && h.grantPrice && parseFloat(h.currentPrice) > 0
                ? (function(){ var gp=parseFloat(h.grantPrice),cp=parseFloat(h.currentPrice),vest2=eqVestCalc(h),sold2=(h.sales||[]).reduce(function(a,x){return a+(parseFloat(x.qty)||0);},0),held2=Math.max(0,vest2.vested-sold2),rg=(cp-gp)*held2,rgc=rg>=0?'var(--success)':'var(--danger)',rgs=rg>=0?'+':''; return '<div style="font-family:var(--font-mono);font-size:.78rem;color:'+rgc+'">'+rgs+fmt(Math.abs(rg))+ ' vs grant</div>'; })()
                : (isVesting?'<div style="font-size:.7rem;color:var(--muted)">Set price to see gain</div>':'')))
        + '</div>'
        + '<div class="eq-row-actions">'
        + '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openEqModal('+h.id+')" style="padding:8px 10px" title="Edit">'+ICON('pencil')+'</button>'
        + '<button class="del-btn" onclick="event.stopPropagation();deleteEquity('+h.id+')" style="padding:8px 10px" title="Delete">'+ICON('trash')+'</button>'
        + '</div>'
        + '</div>'
        + '<div class="eq-row-detail" id="eq-detail-'+h.id+'" style="display:none">'+renderEqHoldingDetail(h)+'</div>'
        + '</div>';
}

function eqToggleExpand(id) {
    var detail = document.getElementById('eq-detail-' + id);
    if (detail) detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
}

function renderEqHoldingDetail(h) {
    var t = h.type || 'stock';
    var html = '<div class="eq-detail-inner">';

    if (t==='stock'||t==='etf'||t==='crypto') {
        var sold = (h.sales||[]).reduce(function(a,x){return a+(parseFloat(x.qty)||0);},0);
        var held = Math.max(0,(parseFloat(h.qty)||0)-sold);
        html += '<div class="eq-detail-grid">'
            +'<span class="eq-lbl">Purchase Date</span><span class="eq-val">'+(h.purchaseDate||'—')+'</span>'
            +'<span class="eq-lbl">Purchase Price</span><span class="eq-val">'+fmt(parseFloat(h.cost)||0)+'/unit</span>'
            +'<span class="eq-lbl">Current Price</span><span class="eq-val">'+fmt(parseFloat(h.currentPrice)||0)+'/unit</span>'
            +'<span class="eq-lbl">Units Held</span><span class="eq-val">'+held+'</span>'
            +'<span class="eq-lbl">Total Cost</span><span class="eq-val">'+fmt(eqHoldingCost(h))+'</span>'
            +'<span class="eq-lbl">Current Value</span><span class="eq-val">'+fmt(eqHoldingValue(h))+'</span>'
            +(h.owner?'<span class="eq-lbl">Owner</span><span class="eq-val">'+getUserName(h.owner)+'</span>':'')
            +(h.notes?'<span class="eq-lbl">Notes</span><span class="eq-val" style="color:var(--muted)">'+h.notes+'</span>':'')
            +'</div>';
    } else if (t==='bond') {
        var matStr = h.maturityDate ? new Date(h.maturityDate+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}) : '—';
        html += '<div class="eq-detail-grid">'
            +'<span class="eq-lbl">Issuer</span><span class="eq-val">'+(h.company||'—')+'</span>'
            +'<span class="eq-lbl">Face Value</span><span class="eq-val">'+fmt(parseFloat(h.faceValue)||0)+'</span>'
            +'<span class="eq-lbl">Coupon Rate</span><span class="eq-val">'+(parseFloat(h.couponRate)||0)+'%</span>'
            +'<span class="eq-lbl">Maturity Date</span><span class="eq-val">'+matStr+'</span>'
            +'<span class="eq-lbl">Purchase Price</span><span class="eq-val">'+fmt(parseFloat(h.purchasePrice)||0)+'</span>'
            +'<span class="eq-lbl">Current Value</span><span class="eq-val">'+fmt(parseFloat(h.currentValue)||0)+'</span>'
            +'</div>';
    } else if (t==='rsu'||t==='option') {
        var vest = eqVestCalc(h);
        html += '<div class="eq-detail-grid">'
            +'<span class="eq-lbl">Grant Date</span><span class="eq-val">'+(h.grantDate||'—')+'</span>'
            +'<span class="eq-lbl">Total Units</span><span class="eq-val">'+(parseFloat(h.totalUnits)||0)+'</span>'
            +'<span class="eq-lbl">Cliff</span><span class="eq-val">'+((h.cliffYears!==undefined?parseFloat(h.cliffYears):(parseInt(h.cliffMonths)||0)/12)||0)+' yrs</span>'
            +'<span class="eq-lbl">Vesting Period</span><span class="eq-val">'+((h.vestingYears!==undefined?parseFloat(h.vestingYears):(parseInt(h.vestingMonths)||48)/12)||4)+' yrs — '+(h.vestFrequency||'quarterly')+'</span>'
            +'<span class="eq-lbl">Units / Period</span><span class="eq-val">'+eqVestCalc(h).unitsPerVest+' units</span>'
            +'<span class="eq-lbl">Vested</span><span class="eq-val" style="color:var(--success)">'+vest.vested+' units</span>'
            +'<span class="eq-lbl">Unvested</span><span class="eq-val" style="color:var(--muted)">'+vest.unvested+' units</span>'
            +'<span class="eq-lbl">Grant Price / Unit</span><span class="eq-val">'+(h.grantPrice?fmt(parseFloat(h.grantPrice)):'—')+'</span>'
            +'<span class="eq-lbl">Current Price</span><span class="eq-val">'+fmt(parseFloat(h.currentPrice)||0)+'/unit</span>'
            +(t==='option'?'<span class="eq-lbl">Strike Price</span><span class="eq-val">'+fmt(parseFloat(h.strikePrice)||0)+'/unit</span>':'')
            +(t==='option'?'<span class="eq-lbl">Expiry</span><span class="eq-val">'+(h.expiryDate||'—')+'</span>':'')
            +(h.taxWithheld?'<span class="eq-lbl">Tax Withheld</span><span class="eq-val">'+h.taxWithheld+'%</span>':'')
            +(h.owner?'<span class="eq-lbl">Owner</span><span class="eq-val">'+getUserName(h.owner)+'</span>':'')
            +'</div>';

        // Vesting schedule table (expandable)
        if (vest.schedule.length) {
            var px2 = parseFloat(h.currentPrice)||0;
            var schedRows = '';
            vest.schedule.forEach(function(s) {
                var ds = s.date.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
                schedRows += '<tr class="'+(s.isPast?'eq-sched-past':'')+'">'
                    +'<td>'+ds+'</td>'
                    +'<td style="font-family:var(--font-mono)">'+s.units+'</td>'
                    +'<td style="font-family:var(--font-mono)">'+s.cumulative+'</td>'
                    +'<td style="font-family:var(--font-mono)">'+fmt(s.units*px2)+'</td>'
                    +'<td>'+(s.isPast?'<span style="color:var(--success)">'+ICON('check')+' Vested</span>':'<span style="color:var(--muted)">Upcoming</span>')+'</td>'
                    +'</tr>';
            });
            html += '<div style="margin-top:14px">'
                +'<div class="eq-schedule-toggle" onclick="eqToggleSchedule('+h.id+')">'+ICON('calendar')+' Vesting Schedule <span id="eq-sched-arrow-'+h.id+'">▶</span></div>'
                +'<div id="eq-schedule-'+h.id+'" style="display:none;margin-top:8px;overflow-x:auto">'
                +'<table class="eq-sched-table"><thead><tr><th>Vest Date</th><th>Units</th><th>Cumulative</th><th>Est. Value</th><th>Status</th></tr></thead>'
                +'<tbody>'+schedRows+'</tbody></table></div></div>';
        }
    }

    // Sales history
    if (h.sales && h.sales.length) {
        html += '<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px">'
            +'<div style="font-size:.72rem;font-weight:700;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em">Sales History</div>';
        h.sales.forEach(function(sale) {
            var costPer  = parseFloat(h.cost)||parseFloat(h.currentPrice)||0;
            var proceeds = (sale.qty*sale.price)-(sale.costs||0);
            var cg       = proceeds-(sale.qty*costPer);
            html += '<div class="eq-sales-row">'
                +'<span style="color:var(--muted)">'+(sale.date||'—')+'</span>'
                +'<span>'+(parseFloat(sale.qty)||0)+' units @ '+fmt(sale.price)+'</span>'
                +'<span style="color:var(--success)">Proceeds: '+fmt(proceeds)+'</span>'
                +'<span class="'+(cg>=0?'eq-gain-pos':'eq-gain-neg')+'">'+(cg>=0?'+':'')+fmt(Math.abs(cg))+' CG</span>'
                +'<button class="del-btn" style="margin-left:auto" onclick="deleteSaleEq('+h.id+','+sale.id+')">'+ICON('trash')+'</button>'
                +'</div>';
        });
        html += '</div>';
    }

    // Sell button
    if (t !== 'bond') {
        html += '<div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border)">'
            +'<button class="btn btn-ghost btn-sm" onclick="openEqSale('+h.id+')">'+ICON('cash')+' Record Sale</button>'
            +'</div>';
    }

    html += '</div>';
    return html;
}

function eqToggleSchedule(id) {
    var el = document.getElementById('eq-schedule-'+id), arrow = document.getElementById('eq-sched-arrow-'+id);
    if (!el) return;
    var show = el.style.display==='none';
    el.style.display = show?'block':'none';
    if (arrow) arrow.textContent = show?'▼':'▶';
}

// ── Vest preview (live allocation summary in modal) ───────────
function eqUpdateVestPreview() {
    var el = document.getElementById('eq-vest-preview');
    if (!el) return;
    var units  = parseFloat(document.getElementById('eq-m-totalunits') ? document.getElementById('eq-m-totalunits').value : '') || 0;
    var vestY  = parseFloat(document.getElementById('eq-m-vestyears')  ? document.getElementById('eq-m-vestyears').value  : '') || 0;
    var cliffY = parseFloat(document.getElementById('eq-m-cliffyears') ? document.getElementById('eq-m-cliffyears').value : '') || 0;
    var freqEl = document.getElementById('eq-m-vestfreq');
    var freq   = freqEl ? freqEl.value : 'quarterly';
    if (!units || !vestY) { el.textContent = 'Enter units and vesting period to see allocation'; return; }
    var freqPerYear = freq === 'monthly' ? 12 : freq === 'annual' ? 1 : 4;
    var freqLabel   = freq === 'monthly' ? 'month' : freq === 'annual' ? 'year' : 'quarter';
    var numVests    = Math.max(1, Math.round(vestY * freqPerYear));
    var perVest     = Math.round(units / numVests);
    var lastVest    = Math.max(0, units - perVest * (numVests - 1));
    var firstDate   = '';
    var gdEl = document.getElementById('eq-m-grantdate');
    if (gdEl && gdEl.value) {
        var gd = new Date(gdEl.value + 'T00:00:00');
        var cliffM = Math.round(cliffY * 12);
        var fd = new Date(gd.getFullYear(), gd.getMonth() + cliffM, gd.getDate());
        firstDate = ' · first vest ' + fd.toLocaleDateString('en-AU', {day:'numeric',month:'short',year:'numeric'});
    }
    el.innerHTML = '<strong style="color:var(--success)">'
        + perVest + ' units / ' + freqLabel
        + '</strong> &nbsp;·&nbsp; '
        + numVests + ' events over ' + vestY + ' yr'
        + (cliffY > 0 ? ' (cliff ' + cliffY + ' yr)' : '')
        + firstDate
        + (lastVest !== perVest ? ' &nbsp;·&nbsp; last tranche: ' + lastVest + ' units' : '');
}

// ══════════════════════════════════════════════════════════════
// ADD / EDIT MODAL
// ══════════════════════════════════════════════════════════════
function openEqModal(id) {
    var overlay = document.getElementById('eq-modal-overlay');
    if (!overlay) return;
    var h = id ? EQUITIES.find(function(e){ return e.id===id; }) : null;
    var selType = h ? (h.type||'stock') : 'stock';
    var tc = eqTypeCfg(selType);
    var title = h ? ('Edit ' + iconTag(tc.icon) + ' ' + tc.label) : 'Add Holding';

    var typeOpts = EQ_TYPES.map(function(t){ return '<option value="'+t.key+'"'+(selType===t.key?' selected':'')+'>'+t.label+'</option>'; }).join('');
    var ownerOpts = '<option value="brenton"'+(!h||h.owner==='brenton'?' selected':'')+'>'+getUserName('brenton')+'</option>'
        +'<option value="shelley"'+(h&&h.owner==='shelley'?' selected':'')+'>'+getUserName('shelley')+'</option>'
        +'<option value="joint"'+(h&&h.owner==='joint'?' selected':'')+'>Joint</option>';

    overlay.innerHTML = '<div class="eq-modal-box" onclick="event.stopPropagation()">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
        +'<div class="section-label" style="margin:0">'+title+'</div>'
        +'<button class="btn btn-ghost btn-sm" onclick="closeEqModal()" style="padding:6px 10px">'+ICON('x')+'</button>'
        +'</div>'
        +'<input type="hidden" id="eq-m-id" value="'+(id||'')+'"/>'
        +'<div class="form-grid" style="margin-bottom:14px">'
        +'<div><label class="lbl">Asset Type</label><select id="eq-m-type" onchange="eqModalTypeChange()">'+typeOpts+'</select></div>'
        +'<div><label class="lbl">Held By</label><select id="eq-m-owner">'+ownerOpts+'</select></div>'
        +'</div>'
        +'<div id="eq-m-fields"></div>'
        +'<div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">'
        +'<button class="btn btn-primary" onclick="saveEqModal()">'+ICON('device-floppy')+' Save</button>'
        +'<button class="btn btn-ghost" onclick="closeEqModal()">Cancel</button>'
        +'</div></div>';

    overlay.style.display = 'flex';
    overlay.onclick = function(e){ if(e.target===overlay) closeEqModal(); };
    eqModalBuildFields(selType, h);
    setTimeout(eqUpdateVestPreview, 0);
}

function closeEqModal() {
    var overlay = document.getElementById('eq-modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

function eqModalTypeChange() {
    var sel = document.getElementById('eq-m-type'), idEl = document.getElementById('eq-m-id');
    if (!sel) return;
    var id = idEl ? idEl.value : '';
    var h  = id ? EQUITIES.find(function(e){ return String(e.id)===id; }) : null;
    eqModalBuildFields(sel.value, h);
    setTimeout(eqUpdateVestPreview, 0);
}

function eqModalBuildFields(type, h) {
    var el = document.getElementById('eq-m-fields');
    if (!el) return;
    var v  = h || {}, html = '';

    // Ticker + Company (all except bond)
    if (type !== 'bond') {
        html += '<div class="form-grid">'
            +'<div><label class="lbl">Ticker / Code</label>'
            +'<input type="text" id="eq-m-ticker" value="'+(v.ticker||'')+'" placeholder="e.g. AAPL, CBA, VGS.AX" style="text-transform:uppercase"/>'
            +'</div>'
            +'<div><label class="lbl">Company / Asset Name</label>'
            +'<input type="text" id="eq-m-company" value="'+(v.company||'')+'" placeholder="e.g. Apple Inc."/></div>'
            +'</div>';
    }

    // Exchange selector
    if (type==='stock'||type==='etf') {
        var exchOpts = EQ_EXCHANGES.filter(function(e){return e!=='Crypto';}).map(function(e){ return '<option value="'+e+'"'+(v.exchange===e?' selected':'')+'>'+e+'</option>'; }).join('');
        html += '<div class="form-grid"><div><label class="lbl">Exchange</label><select id="eq-m-exchange">'+exchOpts+'</select></div></div>';
    } else if (type==='rsu'||type==='option') {
        var exchOpts2 = EQ_EXCHANGES.map(function(e){ return '<option value="'+e+'"'+(v.exchange===e?' selected':'')+'>'+e+'</option>'; }).join('');
        html += '<div class="form-grid"><div><label class="lbl">Exchange / Type</label><select id="eq-m-exchange">'+exchOpts2+'</select></div></div>';
    } else if (type==='crypto') {
        html += '<input type="hidden" id="eq-m-exchange" value="Crypto"/>';
    }

    // Type-specific fields
    if (type==='stock'||type==='etf'||type==='crypto') {
        html += '<div class="form-grid">'
            +'<div><label class="lbl">Quantity</label><input type="number" id="eq-m-qty" value="'+(v.qty||'')+'" placeholder="0" min="0" step="any" inputmode="numeric"/></div>'
            +'<div><label class="lbl">Cost Basis per Unit (AUD)</label><input type="number" id="eq-m-cost" value="'+(v.cost||'')+'" placeholder="0.00" min="0" step="0.01" inputmode="decimal"/></div>'
            +'</div>'
            +'<div class="form-grid">'
            +'<div><label class="lbl">Current Price (AUD)</label><input type="number" id="eq-m-price" value="'+(v.currentPrice||'')+'" placeholder="0.00" min="0" step="0.01" inputmode="decimal"/></div>'
            +'<div><label class="lbl">Purchase Date</label><input type="date" id="eq-m-purchasedate" value="'+(v.purchaseDate||'')+'"/></div>'
            +'</div>';
    }

    if (type==='bond') {
        html += '<div class="form-grid">'
            +'<div><label class="lbl">Issuer / Bond Name</label><input type="text" id="eq-m-company" value="'+(v.company||'')+'" placeholder="e.g. Commonwealth Bank"/></div>'
            +'<div><label class="lbl">Face Value (AUD)</label><input type="number" id="eq-m-facevalue" value="'+(v.faceValue||'')+'" placeholder="10000" min="0" step="0.01" inputmode="decimal"/></div>'
            +'</div>'
            +'<div class="form-grid">'
            +'<div><label class="lbl">Coupon Rate (%)</label><input type="number" id="eq-m-coupon" value="'+(v.couponRate||'')+'" placeholder="5.5" min="0" max="100" step="0.01" inputmode="decimal"/></div>'
            +'<div><label class="lbl">Maturity Date</label><input type="date" id="eq-m-maturity" value="'+(v.maturityDate||'')+'"/></div>'
            +'</div>'
            +'<div class="form-grid">'
            +'<div><label class="lbl">Purchase Price (AUD)</label><input type="number" id="eq-m-purchaseprice" value="'+(v.purchasePrice||'')+'" placeholder="0.00" min="0" step="0.01" inputmode="decimal"/></div>'
            +'<div><label class="lbl">Current Value (AUD)</label><input type="number" id="eq-m-currentvalue" value="'+(v.currentValue||'')+'" placeholder="0.00" min="0" step="0.01" inputmode="decimal"/></div>'
            +'</div>';
    }

    if (type==='rsu'||type==='option') {
        var freqOpts = ['monthly','quarterly','annual'].map(function(f){ return '<option value="'+f+'"'+((v.vestFrequency||'quarterly')===f?' selected':'')+'>'+f.charAt(0).toUpperCase()+f.slice(1)+'</option>'; }).join('');
        html += '<div class="form-grid">'
            +'<div><label class="lbl">Total Units Granted</label><input type="number" id="eq-m-totalunits" value="'+(v.totalUnits||'')+'" placeholder="0" min="0" step="1" inputmode="numeric" oninput="eqUpdateVestPreview()"/></div>'
            +'<div><label class="lbl">Grant Date</label><input type="date" id="eq-m-grantdate" value="'+(v.grantDate||'')+'" onchange="eqUpdateVestPreview()"/></div>'
            +'</div>'
            +'<div class="form-grid">'
            +'<div><label class="lbl">Cliff Period (years)</label><input type="number" id="eq-m-cliffyears" value="'+(v.cliffYears!==undefined?v.cliffYears:(v.cliffMonths!==undefined?(v.cliffMonths/12):0))+'" placeholder="0" min="0" step="0.5" inputmode="decimal" oninput="eqUpdateVestPreview()"/><div style="font-size:.68rem;color:var(--muted);margin-top:3px">Years before first vest event (0 = vesting starts immediately)</div></div>'
            +'<div><label class="lbl">Vesting Period (years)</label><input type="number" id="eq-m-vestyears" value="'+(v.vestingYears!==undefined?v.vestingYears:(v.vestingMonths?(v.vestingMonths/12):4))+'" placeholder="4" min="0.5" step="0.5" inputmode="decimal" oninput="eqUpdateVestPreview()"/></div>'
            +'</div>'
            +'<div class="form-grid">'
            +'<div><label class="lbl">Vest Frequency</label><select id="eq-m-vestfreq" onchange="eqUpdateVestPreview()">'+freqOpts+'</select></div>'
            +'<div><label class="lbl">Current Price per Unit (AUD)</label><input type="number" id="eq-m-price" value="'+(v.currentPrice||'')+'" placeholder="0.00" min="0" step="0.01" inputmode="decimal"/></div>'
            +'</div>'
            +'<div id="eq-vest-preview" style="background:var(--card2);border-radius:var(--radius-sm);padding:10px 14px;font-size:.8rem;color:var(--muted);margin-bottom:4px"></div>'
            +'<div class="form-grid">'
            +'<div><label class="lbl">Price at Grant / Vest (AUD)</label><input type="number" id="eq-m-grantprice" value="'+(v.grantPrice||'')+'" placeholder="0.00" min="0" step="0.01" inputmode="decimal"/><div style="font-size:.68rem;color:var(--muted);margin-top:3px">Market price on vest date — used to calculate net gain</div></div>'
            +'</div>';

        if (type==='option') {
            var optTypeOpts = ['Call','Put','ESO'].map(function(o){ return '<option value="'+o+'"'+((v.optionType||'ESO')===o?' selected':'')+'>'+o+(o==='ESO'?' (Employee Stock Options)':'')+'</option>'; }).join('');
            html += '<div class="form-grid">'
                +'<div><label class="lbl">Option Type</label><select id="eq-m-opttype">'+optTypeOpts+'</select></div>'
                +'<div><label class="lbl">Strike Price (AUD)</label><input type="number" id="eq-m-strike" value="'+(v.strikePrice||'')+'" placeholder="0.00" min="0" step="0.01" inputmode="decimal"/></div>'
                +'</div>'
                +'<div class="form-grid"><div><label class="lbl">Expiry Date</label><input type="date" id="eq-m-expiry" value="'+(v.expiryDate||'')+'"/></div></div>';
        }

        if (type==='rsu') {
            html += '<div class="form-grid"><div><label class="lbl">Tax Withheld (%)</label>'
                +'<input type="number" id="eq-m-taxwithheld" value="'+(v.taxWithheld||32)+'" placeholder="32" min="0" max="100" step="1" inputmode="numeric"/>'
                +'</div></div>';
        }
    }

    // Notes
    html += '<div><label class="lbl">Notes (optional)</label>'
        +'<input type="text" id="eq-m-notes" value="'+(v.notes||'')+'" placeholder="e.g. broker, account, grant #"/></div>';

    el.innerHTML = html;
}

function saveEqModal() {
    var idEl   = document.getElementById('eq-m-id'),  typeEl = document.getElementById('eq-m-type'), ownerEl = document.getElementById('eq-m-owner');
    var editId = idEl ? idEl.value : '';
    var type   = typeEl ? typeEl.value : 'stock';
    var owner  = ownerEl ? (ownerEl.value||'brenton') : 'brenton';

    function fv(id){ var e=document.getElementById(id); return e?e.value:''; }
    function fnum(id){ return parseFloat(fv(id))||0; }

    var company  = fv('eq-m-company').trim();
    var ticker   = (fv('eq-m-ticker')||'').trim().toUpperCase();
    var exchange = fv('eq-m-exchange')||'Other';
    var notes    = fv('eq-m-notes').trim();

    if (type==='bond')                               { if (!company)               { toast('Enter issuer name'); return; } }
    else if (type==='rsu'||type==='option')          { if (!company)               { toast('Enter company name'); return; }
                                                       if (!fnum('eq-m-totalunits')){ toast('Enter total units granted'); return; }
                                                       if (!fv('eq-m-grantdate'))   { toast('Enter grant date'); return; } }
    else                                             { if (!ticker&&!company)       { toast('Enter a ticker or company name'); return; }
                                                       if (!fnum('eq-m-qty'))       { toast('Enter quantity'); return; } }

    var obj = { type:type, company:company, ticker:ticker, exchange:exchange, owner:owner, notes:notes, priceUpdated:Date.now() };

    if (type==='stock'||type==='etf'||type==='crypto') {
        obj.qty=fnum('eq-m-qty'); obj.cost=fnum('eq-m-cost'); obj.currentPrice=fnum('eq-m-price'); obj.purchaseDate=fv('eq-m-purchasedate');
    } else if (type==='bond') {
        obj.faceValue=fnum('eq-m-facevalue'); obj.couponRate=fnum('eq-m-coupon'); obj.maturityDate=fv('eq-m-maturity');
        obj.purchasePrice=fnum('eq-m-purchaseprice'); obj.currentValue=fnum('eq-m-currentvalue');
    } else {
        obj.totalUnits=fnum('eq-m-totalunits'); obj.grantDate=fv('eq-m-grantdate');
        obj.cliffYears=parseFloat(fv('eq-m-cliffyears'))||0; obj.vestingYears=parseFloat(fv('eq-m-vestyears'))||4;
        obj.vestFrequency=fv('eq-m-vestfreq')||'quarterly'; obj.currentPrice=fnum('eq-m-price');
        obj.grantPrice=fnum('eq-m-grantprice')||0;
        if (type==='option') { obj.optionType=fv('eq-m-opttype')||'ESO'; obj.strikePrice=fnum('eq-m-strike'); obj.expiryDate=fv('eq-m-expiry'); }
        if (type==='rsu')    { obj.taxWithheld=fnum('eq-m-taxwithheld')||32; }
    }

    if (editId) {
        var idx = -1;
        for (var i=0;i<EQUITIES.length;i++){ if(String(EQUITIES[i].id)===editId){ idx=i; break; } }
        if (idx !== -1) { obj.id=EQUITIES[idx].id; obj.sales=EQUITIES[idx].sales||[]; EQUITIES[idx]=obj; }
    } else {
        obj.id=Date.now(); obj.sales=[];
        EQUITIES.push(obj);
    }

    try { save(K.equities, EQUITIES); } catch(e) {}
    try{if(typeof nwRecordEqMonth==="function"&&typeof eqTotalEquitiesValue==="function")nwRecordEqMonth(_nwCurrentMonth(),eqTotalEquitiesValue());}catch(e){}
    try{if(typeof recordNetWorthSnapshot==="function")recordNetWorthSnapshot();}catch(e){}
    closeEqModal();
    renderEquitiesPage();
    if (typeof renderAssets==='function') renderAssets();
    toast(editId?'Holding updated':'Holding added');
}

// ── Delete ────────────────────────────────────────────────────
function deleteEquity(id) {
    if (!confirm('Delete this holding? Sales history will also be removed.')) return;
    EQUITIES = EQUITIES.filter(function(e){ return e.id!==id; });
    try { save(K.equities, EQUITIES); } catch(e) {}
    try{if(typeof nwRecordEqMonth==="function"&&typeof eqTotalEquitiesValue==="function")nwRecordEqMonth(_nwCurrentMonth(),eqTotalEquitiesValue());}catch(e){}
    try{if(typeof recordNetWorthSnapshot==="function")recordNetWorthSnapshot();}catch(e){}
    renderEquitiesPage();
    if (typeof renderAssets==='function') renderAssets();
    toast('Holding removed');
}

// ── Sale recording ────────────────────────────────────────────
function openEqSale(id) {
    var h = EQUITIES.find(function(e){ return e.id===id; });
    if (!h) return;
    var overlay = document.getElementById('eq-sale-overlay');
    if (!overlay) return;
    var label = h.ticker||h.company||'Holding';
    overlay.innerHTML = '<div class="eq-modal-box" onclick="event.stopPropagation()">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
        +'<div class="section-label" style="margin:0;color:var(--success)">'+ICON('cash')+' Record Sale — '+label+'</div>'
        +'<button class="btn btn-ghost btn-sm" onclick="closeEqSale()">'+ICON('x')+'</button>'
        +'</div>'
        +'<input type="hidden" id="eq-sale-id" value="'+id+'"/>'
        +'<div class="form-grid">'
        +'<div><label class="lbl">Units Sold</label><input type="number" id="eq-sale-qty" placeholder="0" min="0" step="any" inputmode="numeric" oninput="calcEqSalePreview()"/></div>'
        +'<div><label class="lbl">Sale Price per Unit (AUD)</label><input type="number" id="eq-sale-price" placeholder="0.00" min="0" step="0.01" inputmode="decimal" oninput="calcEqSalePreview()"/></div>'
        +'</div>'
        +'<div class="form-grid">'
        +'<div><label class="lbl">Sale Date</label><input type="date" id="eq-sale-date" value="'+today()+'"/></div>'
        +'<div><label class="lbl">Brokerage / Costs (AUD)</label><input type="number" id="eq-sale-costs" placeholder="0.00" min="0" step="0.01" inputmode="decimal" oninput="calcEqSalePreview()"/></div>'
        +'</div>'
        +'<div id="eq-sale-preview" style="margin-top:10px;font-size:.78rem;color:var(--muted)"></div>'
        +'<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">'
        +'<button class="btn btn-primary" onclick="saveEqSale()">Record Sale</button>'
        +'<button class="btn btn-ghost" onclick="closeEqSale()">Cancel</button>'
        +'</div></div>';
    overlay.style.display = 'flex';
    overlay.onclick = function(e){ if(e.target===overlay) closeEqSale(); };
}

function closeEqSale() {
    var overlay = document.getElementById('eq-sale-overlay');
    if (overlay) overlay.style.display = 'none';
}

function calcEqSalePreview() {
    var id    = (document.getElementById('eq-sale-id')||{}).value;
    var qty   = parseFloat((document.getElementById('eq-sale-qty')||{}).value)||0;
    var price = parseFloat((document.getElementById('eq-sale-price')||{}).value)||0;
    var costs = parseFloat((document.getElementById('eq-sale-costs')||{}).value)||0;
    var prev  = document.getElementById('eq-sale-preview');
    if (!prev||!id||!qty||!price){ if(prev) prev.innerHTML=''; return; }
    var h = EQUITIES.find(function(e){ return e.id===Number(id); });
    if (!h) return;
    var costPer  = parseFloat(h.cost)||parseFloat(h.currentPrice)||0;
    var proceeds = qty*price-costs, costBase = qty*costPer, gain = proceeds-costBase;
    prev.innerHTML = '<span style="color:var(--muted)">Proceeds: </span><strong>'+fmt(proceeds)+'</strong>'
        +' &nbsp;·&nbsp; <span style="color:var(--muted)">Cost base: </span><strong>'+fmt(costBase)+'</strong>'
        +' &nbsp;·&nbsp; <span style="color:'+(gain>=0?'var(--success)':'var(--danger)')+';font-weight:700">'
        +(gain>=0?'Gain: +':'Loss: ')+fmt(Math.abs(gain))+'</span>';
}

function saveEqSale() {
    var id    = (document.getElementById('eq-sale-id')||{}).value;
    var qty   = parseFloat((document.getElementById('eq-sale-qty')||{}).value)||0;
    var price = parseFloat((document.getElementById('eq-sale-price')||{}).value)||0;
    var date  = (document.getElementById('eq-sale-date')||{}).value||'';
    var costs = parseFloat((document.getElementById('eq-sale-costs')||{}).value)||0;
    if (!id||!qty||!price){ toast('Enter quantity and sale price'); return; }
    var h = EQUITIES.find(function(e){ return e.id===Number(id); });
    if (!h) return;
    if (!h.sales) h.sales=[];
    h.sales.push({ id:Date.now(), qty:qty, price:price, date:date, costs:costs });
    try { save(K.equities, EQUITIES); } catch(e) {}
    try{if(typeof nwRecordEqMonth==="function"&&typeof eqTotalEquitiesValue==="function")nwRecordEqMonth(_nwCurrentMonth(),eqTotalEquitiesValue());}catch(e){}
    try{if(typeof recordNetWorthSnapshot==="function")recordNetWorthSnapshot();}catch(e){}
    closeEqSale();
    renderEquitiesPage();
    if (typeof renderAssets==='function') renderAssets();
    toast('Sale recorded — '+qty+' units at '+fmt(price));
}

function deleteSaleEq(holdingId, saleId) {
    var h = EQUITIES.find(function(e){ return e.id===holdingId; });
    if (!h||!h.sales) return;
    h.sales = h.sales.filter(function(s){ return s.id!==saleId; });
    try { save(K.equities, EQUITIES); } catch(e) {}
    try{if(typeof nwRecordEqMonth==="function"&&typeof eqTotalEquitiesValue==="function")nwRecordEqMonth(_nwCurrentMonth(),eqTotalEquitiesValue());}catch(e){}
    try{if(typeof recordNetWorthSnapshot==="function")recordNetWorthSnapshot();}catch(e){}
    renderEquitiesPage();
    if (typeof renderAssets==='function') renderAssets();
    toast('Sale removed');
}

// ── Batch price update modal ───────────────────────────────────
function openBatchPriceModal() {
    var overlay = document.getElementById('eq-modal-overlay');
    if (!overlay) return;
    var priceable = EQUITIES.filter(function(h){ return h.type!=='bond'; });
    var rows = priceable.map(function(h) {
        var tc    = eqTypeCfg(h.type);
        var label = (h.ticker||h.company||'—')+' ('+iconTag(tc.icon)+' '+tc.label+')';
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">'
            +'<div style="flex:1;font-size:.84rem">'+label+'</div>'
            +'<div style="flex:0 0 150px"><input type="number" value="'+(h.currentPrice||'')+'" placeholder="Enter price" min="0" step="0.01" inputmode="decimal"'
            +' style="padding:6px 8px;font-size:.82rem;font-family:var(--font-mono);width:100%" id="batch-price-'+h.id+'"/></div>'
            +'</div>';
    }).join('');

    overlay.innerHTML = '<div class="eq-modal-box" onclick="event.stopPropagation()">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
        +'<div class="section-label" style="margin:0">'+ICON('currency-dollar')+' Update Current Prices</div>'
        +'<button class="btn btn-ghost btn-sm" onclick="closeEqModal()">'+ICON('x')+'</button>'
        +'</div>'
        +'<div style="font-size:.76rem;color:var(--muted);margin-bottom:14px">Enter the latest market price (AUD) for each holding, or click '+ICON('search')+' to fetch live. For US-listed stocks enter the AUD equivalent.</div>'
        +(priceable.length?rows:'<div class="empty" style="padding:20px 0"><p>No priceable holdings yet.</p></div>')
        +'<div style="display:flex;gap:10px;margin-top:20px">'
        +'<button class="btn btn-primary" onclick="saveBatchPrices()">'+ICON('device-floppy')+' Save All</button>'
        +'<button class="btn btn-ghost" onclick="closeEqModal()">Cancel</button>'
        +'</div></div>';
    overlay.style.display = 'flex';
    overlay.onclick = function(e){ if(e.target===overlay) closeEqModal(); };
}

function saveBatchPrices() {
    var changed = 0;
    EQUITIES.forEach(function(h) {
        var inp = document.getElementById('batch-price-'+h.id);
        if (!inp) return;
        var val = parseFloat(inp.value);
        if (!isNaN(val) && val > 0) { h.currentPrice=val; h.priceUpdated=Date.now(); changed++; }
    });
    try { save(K.equities, EQUITIES); } catch(e) {}
    try{if(typeof nwRecordEqMonth==="function"&&typeof eqTotalEquitiesValue==="function")nwRecordEqMonth(_nwCurrentMonth(),eqTotalEquitiesValue());}catch(e){}
    try{if(typeof recordNetWorthSnapshot==="function")recordNetWorthSnapshot();}catch(e){}
    closeEqModal();
    renderEquitiesPage();
    if (typeof renderAssets==='function') renderAssets();
    toast('Prices updated for '+changed+' holding'+(changed!==1?'s':''));
}

// ══════════════════════════════════════════════════════════════
// EQUITIES MONTHLY PORTFOLIO SNAPSHOT GRID (Cash Tracker-style)
// ══════════════════════════════════════════════════════════════

function _eqMonthlyMonthOpts(sel) {
  var now = new Date();
  var o = '';
  for (var i = 0; i < 36; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var v = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    var l = d.toLocaleString('en-AU', { month: 'long', year: 'numeric' });
    o += '<option value="' + v + '"' + (v === sel ? ' selected' : '') + '>' + l + '</option>';
  }
  return o;
}

function eqMonthSave() {
  var mo  = (document.getElementById('eq-mo-inp') || {}).value;
  var val = parseFloat((document.getElementById('eq-mo-val') || {}).value);
  if (!mo || isNaN(val)) { toast('⚠️ Select month and enter portfolio value'); return; }
  if (!EQ_MONTHLY[mo]) EQ_MONTHLY[mo] = {};
  EQ_MONTHLY[mo].closing = val;
  save(K.eqMonthly, EQ_MONTHLY);
  try {
    if (typeof nwRecordEqMonth === 'function') nwRecordEqMonth(mo, val);
    if (typeof recordNetWorthSnapshot === 'function') recordNetWorthSnapshot();
  } catch(e) {}
  renderEqMonthlyGrid();
  var inp = document.getElementById('eq-mo-val');
  if (inp) inp.value = '';
  toast('✅ Portfolio value saved');
}

function eqMonthUpdate(mo, value) {
  var v = parseFloat(value);
  if (!EQ_MONTHLY[mo]) EQ_MONTHLY[mo] = {};
  if (!isNaN(v)) {
    EQ_MONTHLY[mo].closing = v;
  } else {
    delete EQ_MONTHLY[mo];
  }
  save(K.eqMonthly, EQ_MONTHLY);
  try {
    if (!isNaN(v) && typeof nwRecordEqMonth === 'function') nwRecordEqMonth(mo, v);
    if (typeof recordNetWorthSnapshot === 'function') recordNetWorthSnapshot();
  } catch(e) {}
}

function eqMonthDel(mo) {
  delete EQ_MONTHLY[mo];
  save(K.eqMonthly, EQ_MONTHLY);
  try {
    var hist = load(K.eqHist) || {};
    delete hist[mo];
    save(K.eqHist, hist);
    if (typeof recordNetWorthSnapshot === 'function') recordNetWorthSnapshot();
  } catch(e) {}
  renderEqMonthlyGrid();
}

function renderEqMonthlyGrid() {
  var el = document.getElementById('eq-monthly-grid');
  if (!el) return;

  var curVal = typeof eqTotalEquitiesValue === 'function' ? eqTotalEquitiesValue() : 0;
  var curMo  = typeof _nwCurrentMonth === 'function' ? _nwCurrentMonth() : new Date().toISOString().slice(0, 7);
  var months = Object.keys(EQ_MONTHLY).sort();

  var rows = '';
  if (!months.length) {
    rows = '<div style="font-size:.78rem;color:var(--muted);padding:8px 0">No entries yet.</div>';
  } else {
    months.forEach(function(m, i) {
      var closing = (EQ_MONTHLY[m] || {}).closing;
      if (closing === undefined) return;
      var prevMo  = i > 0 ? months[i - 1] : null;
      var prevVal = prevMo ? ((EQ_MONTHLY[prevMo] || {}).closing) : null;
      var diff    = prevVal !== null && prevVal !== undefined ? closing - prevVal : null;
      var diffStr = diff === null ? '' : (diff >= 0 ? '+' : '') + fmt(diff);
      var diffColor = diff === null ? '' : diff >= 0 ? 'var(--success)' : 'var(--danger)';
      var ml = new Date(m + '-02').toLocaleString('en-AU', { month: 'short', year: 'numeric' });
      rows += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);flex-wrap:wrap">'
        + '<div style="min-width:80px;font-size:.78rem;color:var(--muted)">' + ml + '</div>'
        + '<input type="number" step="1000" value="' + closing + '" inputmode="decimal"'
        + ' onchange="eqMonthUpdate(\'' + m + '\',this.value)"'
        + ' style="flex:1;min-width:100px;font-family:var(--font-mono);font-size:.85rem;background:var(--card2);border:1px solid var(--border);border-radius:6px;padding:4px 8px;color:var(--text)"/>'
        + (diffStr ? '<div style="font-size:.72rem;font-weight:700;color:' + diffColor + ';white-space:nowrap;min-width:70px;text-align:right">' + diffStr + '</div>' : '<div style="min-width:70px"></div>')
        + '<button onclick="eqMonthDel(\'' + m + '\')" style="background:none;border:none;color:var(--danger);cursor:pointer;padding:4px 8px;min-height:36px;font-size:.85rem">'+ICON('trash')+'</button>'
        + '</div>';
    });
  }

  el.innerHTML = '<div class="card mb">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">'
    + '<div class="section-label" style="margin:0">'+ICON('calendar')+' Monthly Portfolio Snapshots</div>'
    + '<div style="font-family:var(--font-mono);font-size:.82rem;color:var(--muted)">Current: <span style="color:var(--primary);font-weight:700">' + fmt(curVal) + '</span></div>'
    + '</div>'
    + '<div style="font-size:.74rem;color:var(--muted);margin-bottom:14px">Record your total portfolio closing value each month to track growth and link to Net Worth history. Holdings-level data auto-populates the current value above.</div>'
    + rows
    + '<div style="display:flex;gap:8px;align-items:flex-end;margin-top:10px;flex-wrap:wrap">'
    + '<div style="flex:1;min-width:140px"><label style="font-size:.68rem;color:var(--muted);display:block;margin-bottom:3px">Month</label>'
    + '<select id="eq-mo-inp" style="width:100%;font-size:.82rem">' + _eqMonthlyMonthOpts(curMo) + '</select></div>'
    + '<div style="flex:1;min-width:140px"><label style="font-size:.68rem;color:var(--muted);display:block;margin-bottom:3px">Closing Portfolio Value (AUD)</label>'
    + '<input type="number" id="eq-mo-val" placeholder="0" step="1000" inputmode="decimal" style="width:100%;font-size:16px;box-sizing:border-box"/></div>'
    + '<button class="btn btn-primary btn-sm" onclick="eqMonthSave()" style="flex-shrink:0;min-height:44px">Save</button>'
    + '</div>'
    + '</div>';
}

// ── Mobile nav ────────────────────────────────────────────────
var MOB_TAB_PAGES = ['dashboard','bills','transactions','cash'];
