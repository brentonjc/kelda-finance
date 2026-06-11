// ══════════════════════════════════════════════════════════════
// INSIGHTS PAGE — Trends, patterns and spending analysis
// ══════════════════════════════════════════════════════════════

let insMode  = 'month';
let insYear  = new Date().getFullYear();
let insMonth = new Date().getMonth() + 1;
let insCashFlowChart = null;
let insCompareChart  = null;
let insCatChart      = null;
let insSubcatChart   = null;

function insToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '';
}

function insPeriodStr() {
  if (insMode === 'year') return String(insYear);
  return insYear + '-' + String(insMonth).padStart(2, '0');
}
function insPeriodLabel() {
  if (insMode === 'year') return String(insYear);
  return new Date(insYear, insMonth - 1, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' });
}
function insPrevPeriodStr() {
  if (insMode === 'year') return String(insYear - 1);
  const pm = insMonth === 1 ? 12 : insMonth - 1;
  const py = insMonth === 1 ? insYear - 1 : insYear;
  return py + '-' + String(pm).padStart(2, '0');
}
function insSetMode(m) {
  insMode = m;
  ['month', 'year'].forEach(x => {
    const b = document.getElementById('ins-mode-' + x);
    if (b) b.classList.toggle('active', x === m);
  });
  renderInsights();
}
function insNav(d) {
  if (insMode === 'year') { insYear += d; }
  else {
    insMonth += d;
    if (insMonth > 12) { insMonth = 1; insYear++; }
    if (insMonth < 1)  { insMonth = 12; insYear--; }
  }
  renderInsights();
}
function insGoToday() {
  insYear  = new Date().getFullYear();
  insMonth = new Date().getMonth() + 1;
  renderInsights();
}

// ── Main render ─────────────────────────────────────────────────
function renderInsights() {
  const lbl = document.getElementById('ins-period-lbl');
  if (lbl) lbl.textContent = insPeriodLabel();
  ['month', 'year'].forEach(x => {
    const b = document.getElementById('ins-mode-' + x);
    if (b) b.classList.toggle('active', x === insMode);
  });
  insRenderNWChart();
  insRenderCashFlowChart();
  insRenderCompareChart();
  insRenderSankey();
  insRenderCatChart();
  insRenderSubcatChart();
}

// ── Net Worth History Chart (Insights — summary view only) ──────
// Full monthly breakdown table lives on the Net Worth page (assets.js).
var insNWChart = null;
function insRenderNWChart() {
  var canvas  = document.getElementById('ins-nw-chart');
  var deltaEl = document.getElementById('ins-nw-deltas');
  if (!canvas) return;
  if (insNWChart) { insNWChart.destroy(); insNWChart = null; }

  var hist = [];
  try { hist = JSON.parse(localStorage.getItem('cff_networth_history') || '[]') || []; } catch(e) {}

  // One entry per month — last entry per month wins
  var moMap = {};
  for (var i = 0; i < hist.length; i++) {
    var e = hist[i];
    if (e.date) moMap[e.date.slice(0,7)] = e;
  }
  var moKeys = Object.keys(moMap).sort();

  // ── Delta chips (change vs N months ago) ───────────────────
  if (deltaEl) {
    if (moKeys.length >= 1) {
      var last   = moMap[moKeys[moKeys.length - 1]].netWorth;
      var chips  = [{label:'1 mo',mo:1},{label:'3 mo',mo:3},{label:'6 mo',mo:6},{label:'12 mo',mo:12}];
      deltaEl.innerHTML = chips.map(function(d) {
        var idx = moKeys.length - 1 - d.mo;
        if (idx < 0) return '';
        var prev  = moMap[moKeys[idx]].netWorth;
        var delta = last - prev;
        var pct   = prev !== 0 ? ((delta / Math.abs(prev)) * 100).toFixed(1) : null;
        var col   = delta >= 0 ? 'var(--success)' : 'var(--danger)';
        var sign  = delta >= 0 ? '+' : '';
        return '<div style="background:var(--card2);border-radius:9px;padding:8px 13px;text-align:center;flex:1;min-width:80px">'
          + '<div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">' + d.label + '</div>'
          + '<div style="font-family:var(--font-mono);font-size:.88rem;font-weight:700;color:' + col + '">' + sign + fmt(delta) + '</div>'
          + (pct ? '<div style="font-size:.66rem;color:' + col + '">' + sign + pct + '%</div>' : '')
          + '</div>';
      }).join('');
    } else {
      deltaEl.innerHTML = '';
    }
  }

  // ── Chart: clean single net-worth line ──────────────────────
  if (moKeys.length < 2) {
    var ctx2 = canvas.getContext('2d');
    ctx2.clearRect(0, 0, canvas.width, canvas.height);
    ctx2.fillStyle = insToken('--muted') || '#6278A0';
    ctx2.font = '13px DM Sans, sans-serif';
    ctx2.textAlign = 'center';
    ctx2.fillText('Save any balance to start recording history', canvas.width / 2, canvas.height / 2);
    return;
  }

  var labels = moKeys.map(function(m) {
    return new Date(m + '-02').toLocaleString('en-AU', {month:'short', year:'2-digit'});
  });
  var values    = moKeys.map(function(m) { return moMap[m].netWorth; });
  var isUp      = values[values.length - 1] >= values[0];
  var lineColor = isUp ? '#00C896' : '#EF4444';
  var muted     = insToken('--muted') || '#6278A0';
  var card      = insToken('--card')  || '#111830';
  var pr        = moKeys.length > 18 ? 2 : 4;

  insNWChart = safeChart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Net Worth',
        data: values,
        borderColor: lineColor,
        backgroundColor: lineColor + '18',
        fill: true,
        tension: 0.35,
        pointRadius: pr,
        pointHoverRadius: 6,
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function(c) { return ' Net Worth: ' + fmt(c.parsed.y); } } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: muted, font: { family: 'DM Sans' } } },
        y: { grid: { color: card },    ticks: { color: muted, font: { family: 'DM Mono' },
             callback: function(v) { return '$' + (v/1000).toFixed(0) + 'k'; } } }
      }
    }
  });
}

// ══════════════════════════════════════════════════════════════
// SANKEY — INSIGHTS
// ══════════════════════════════════════════════════════════════

function insSankeyTip(evt, label, amt, pct, color) {
  const tip = document.getElementById('ins-sankey-tip');
  if (!tip) return;
  tip.style.display = 'block';
  tip.innerHTML = '<div style="font-weight:700;margin-bottom:4px">' + label + '</div>'
    + '<div style="color:' + color + ';font-size:1rem;font-weight:700">' + fmt(amt) + '</div>'
    + '<div style="color:var(--muted);font-size:.72rem;margin-top:2px">' + pct + '% of income</div>';
  const card = document.getElementById('ins-sankey-row');
  const cardRect = card ? card.getBoundingClientRect() : { left: 0, top: 0, width: 400 };
  const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
  let x = clientX - cardRect.left + 14;
  let y = clientY - cardRect.top  - 10;
  if (x + 190 > cardRect.width) x = clientX - cardRect.left - 190;
  if (y < 4) y = 4;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}
function insSankeyHide() {
  const tip = document.getElementById('ins-sankey-tip');
  if (tip) tip.style.display = 'none';
}

let _insSankeyRO = null;

function insRenderSankey() {
  const el = document.getElementById('ins-sankey-container');
  if (!el) return;
  if (!_insSankeyRO && typeof ResizeObserver !== 'undefined') {
    _insSankeyRO = new ResizeObserver(function () { _insDrawSankey(el); });
    _insSankeyRO.observe(el);
  }
  _insDrawSankey(el);
}

function _insDrawSankey(el) {
  if (!el) return;

  const pfx = insPeriodStr();
  const txs = activeTX().filter(t => t.date.startsWith(pfx));
  const totalIncome  = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const savings = Math.max(0, totalIncome - totalExpense);

  if (!totalIncome) {
    el.innerHTML = '<div class="empty" style="min-height:180px"><div class="ei">💸</div><p>No income data for this period.</p></div>';
    return;
  }

  const catTotals = {};
  txs.filter(t => t.type === 'expense' && t.catId !== 'transfers')
     .forEach(t => {
       const id = t.catId || 'other';
       catTotals[id] = (catTotals[id] || 0) + Number(t.amount);
     });

  const SANKEY_PALETTE = [
    '#F0538A','#818CF8','#00C896','#F59E0B','#38BDF8',
    '#FB7185','#34D399','#FBBF24','#A78BFA','#22D3EE',
    '#F97316','#4ADE80','#E879F9','#60A5FA','#FACC15',
    '#F43F5E','#2DD4BF','#C084FC','#FB923C','#86EFAC',
    '#E11D48','#06B6D4','#8B5CF6','#10B981',
  ];

  let catEntries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  let topCats    = catEntries.slice(0, 14);
  const otherTotal = catEntries.slice(14).reduce((s, e) => s + e[1], 0);
  if (otherTotal > 0) topCats.push(['other_group', otherTotal]);
  if (savings > 0)    topCats.push(['savings', savings]);

  const rect = el.getBoundingClientRect();
  const W = (rect && rect.width > 20) ? Math.floor(rect.width)
          : (el.offsetWidth > 20)     ? el.offsetWidth
          : 600;

  const nodeW    = 26;
  const labelPad = 10;
  const leftPad  = 96;
  const rightPad = Math.min(220, Math.floor(W * 0.28));
  const incomeY  = 15;
  const gap      = 10;
  const MIN_NODE_H = 30;
  const n        = topCats.length;
  const maxAmt   = topCats.reduce((mx, e) => Math.max(mx, e[1]), 1);
  const MAX_NODE_H = Math.max(MIN_NODE_H * 2, Math.min(150, Math.floor(700 / n)));
  const scale    = MAX_NODE_H / maxAmt;
  const colX1    = leftPad;
  const colX2    = W - rightPad - nodeW;

  if (colX2 <= colX1 + 40) {
    el.innerHTML = '<div class="empty" style="min-height:80px"><p style="font-size:.75rem;color:var(--muted);text-align:center">Container too narrow to render</p></div>';
    return;
  }

  let paletteIdx = 0;
  let curY = incomeY;
  const nodes = topCats.map(e => {
    const id = e[0], amt = e[1];
    const h   = Math.max(MIN_NODE_H, Math.round(amt * scale));
    const cat = LCATS.find(c => c.id === id);
    const color = id === 'savings'     ? insToken('--success')
                : id === 'other_group' ? insToken('--muted')
                : (cat && cat.color)   ? cat.color
                : SANKEY_PALETTE[paletteIdx++ % SANKEY_PALETTE.length];
    const label = id === 'savings'     ? '💚 Savings'
                : id === 'other_group' ? '📋 Other'
                : (cat ? cat.icon + ' ' + cat.name : id);
    const node = { id, amt, h, y: curY, color, label };
    curY += h + gap;
    return node;
  });

  const H = Math.max(300, curY - gap + 28);
  const incomeH = H - incomeY - 28;

  let paths = '', rects = '', labels = '';
  let lY = incomeY;

  nodes.forEach(node => {
    const frac  = node.amt / totalIncome;
    const flowH = Math.max(3, Math.round(incomeH * frac));
    const srcY1 = lY, srcY2 = lY + flowH;
    const tgtY1 = node.y, tgtY2 = node.y + node.h;
    const cx    = Math.round((colX1 + nodeW + colX2) / 2);
    const pct   = (node.amt / totalIncome * 100).toFixed(1);
    const safeLabel = node.label.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const tipArgs = "'" + safeLabel + "'," + node.amt.toFixed(2) + "," + pct + ",'" + node.color + "'";

    paths += '<path d="M' + (colX1 + nodeW) + ',' + srcY1
           + ' C' + cx + ',' + srcY1 + ' ' + cx + ',' + tgtY1 + ' ' + colX2 + ',' + tgtY1
           + ' L' + colX2 + ',' + tgtY2
           + ' C' + cx + ',' + tgtY2 + ' ' + cx + ',' + srcY2 + ' ' + (colX1 + nodeW) + ',' + srcY2 + ' Z"'
           + ' fill="' + node.color + '" opacity="0.28"'
           + ' style="cursor:pointer;transition:opacity .15s"'
           + ' onmouseover="this.style.opacity=\'0.65\';insSankeyTip(event,' + tipArgs + ')"'
           + ' onmouseout="this.style.opacity=\'0.28\';insSankeyHide()"'
           + ' ontouchstart="this.style.opacity=\'0.65\';insSankeyTip(event,' + tipArgs + ')"'
           + ' ontouchend="this.style.opacity=\'0.28\';insSankeyHide()"/>';

    rects += '<rect x="' + colX2 + '" y="' + node.y + '" width="' + nodeW + '" height="' + node.h + '"'
           + ' rx="5" fill="' + node.color + '" style="cursor:pointer"'
           + ' onmouseover="insSankeyTip(event,' + tipArgs + ')"'
           + ' onmouseout="insSankeyHide()"/>';

    const labelY   = node.y + Math.round(node.h / 2) + 4;
    const labelX   = colX2 + nodeW + labelPad;
    const maxChars = Math.max(8, Math.floor((W - labelX - 4) / 7));
    labels += '<text x="' + labelX + '" y="' + labelY
            + '" font-size="11" fill="#d0cce8" font-family="Inter,sans-serif">'
            + node.label.slice(0, maxChars) + '</text>'
            + '<text x="' + labelX + '" y="' + (labelY + 14)
            + '" font-size="10" fill="' + node.color + '" font-family="DM Mono,monospace" font-weight="600">'
            + fmt(node.amt)
            + ' <tspan fill="#6b7280" font-weight="400">(' + pct + '%)</tspan></text>';

    lY = srcY2;
  });

  const srcH = Math.min(nodes.reduce((s, nd) => s + nd.h + gap, 0) - gap, incomeH);
  const midY = incomeY + Math.round(srcH / 2);
  const incSVG   = '<rect x="' + colX1 + '" y="' + incomeY + '" width="' + nodeW + '" height="' + srcH + '" rx="5" fill="#F0538A"/>';
  const incLabel = '<text x="' + (colX1 - labelPad) + '" y="' + (midY - 7) + '"'
                 + ' font-size="11" fill="#d0cce8" text-anchor="end" font-family="Inter,sans-serif">Income</text>'
                 + '<text x="' + (colX1 - labelPad) + '" y="' + (midY + 8) + '"'
                 + ' font-size="10" fill="#F0538A" text-anchor="end" font-family="DM Mono,monospace" font-weight="600">'
                 + fmt(totalIncome) + '</text>';

  el.innerHTML = '<svg'
    + ' width="' + W + '" height="' + H + '"'
    + ' viewBox="0 0 ' + W + ' ' + H + '"'
    + ' style="width:100%;height:auto;display:block;overflow:visible">'
    + paths + rects + incSVG + incLabel + labels
    + '</svg>'
    + '<div style="font-size:.7rem;color:var(--muted);margin-top:8px;text-align:center">'
    + insPeriodLabel() + ' · Hover/tap flows to explore</div>';
}

// ── Cash Flow Chart ─────────────────────────────────────────────
function insRenderCashFlowChart() {
  const canvas = document.getElementById('ins-cashflow-chart');
  if (!canvas) return;
  if (insCashFlowChart) { insCashFlowChart.destroy(); insCashFlowChart = null; }

  let months = [], chartType = 'line', labelTitle = '';
  if (insMode === 'year') {
    for (let m = 1; m <= 12; m++) months.push(insYear + '-' + String(m).padStart(2, '0'));
    labelTitle = 'Monthly in ' + insYear;
    chartType  = 'bar';
  } else {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(insYear, insMonth - 1 - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }
    labelTitle = 'Last 6 months ending ' + insPeriodLabel();
  }

  const labels   = months.map(m => new Date(m + '-02').toLocaleString('en-AU', { month: 'short', year: '2-digit' }));
  const incData  = months.map(m => activeTX().filter(t => t.type === 'income'  && t.date.startsWith(m)).reduce((s, t) => s + Number(t.amount), 0));
  const expData  = months.map(m => activeTX().filter(t => t.type === 'expense' && t.date.startsWith(m)).reduce((s, t) => s + Number(t.amount), 0));
  const selectedPfx = insPeriodStr().slice(0, 7);
  const highlightBgs = months.map(m => m === selectedPfx ? 'rgba(232,69,122,.9)'  : 'rgba(232,69,122,.35)');
  const incBgs       = months.map(m => m === selectedPfx ? 'rgba(82,214,138,.9)'  : 'rgba(82,214,138,.35)');
  const isBar = insMode === 'year' || months.length <= 6;

  insCashFlowChart = safeChart(canvas, {
    type: isBar ? 'bar' : 'line',
    data: { labels, datasets: [
      { label: 'Income',   data: incData, borderColor: '#52d68a',
        backgroundColor: isBar ? incBgs       : 'rgba(82,214,138,.15)',
        fill: !isBar, tension: 0.3, pointRadius: 3, borderWidth: isBar ? 0 : 2, borderRadius: isBar ? 4 : 0 },
      { label: 'Expenses', data: expData, borderColor: '#e8457a',
        backgroundColor: isBar ? highlightBgs : 'rgba(232,69,122,.12)',
        fill: !isBar, tension: 0.3, pointRadius: 3, borderWidth: isBar ? 0 : 2, borderRadius: isBar ? 4 : 0 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 11 }, padding: 12, color: insToken('--muted') } },
        tooltip: { callbacks: {
          title: items => { const m = months[items[0].dataIndex]; return new Date(m + '-02').toLocaleString('en-AU', { month: 'long', year: 'numeric' }) + (m === selectedPfx ? ' ★' : ''); },
          label: c => ' ' + c.dataset.label + ': ' + fmt(c.parsed.y)
        }}
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 10 }, color: insToken('--muted') } },
        y: { grid: { color: insToken('--card3') }, ticks: { font: { family: 'Inter', size: 10 }, color: insToken('--muted'), callback: v => '$' + Math.round(v).toLocaleString() } }
      }
    }
  });

  const lbl = canvas.closest('.card')?.querySelector('.section-label');
  if (lbl) lbl.textContent = '📈 Cash Flow — ' + labelTitle;
}

// ── Period Comparison Chart ─────────────────────────────────────
function insRenderCompareChart() {
  const canvas   = document.getElementById('ins-compare-chart');
  const deltasEl = document.getElementById('ins-compare-deltas');
  if (!canvas) return;
  if (insCompareChart) { insCompareChart.destroy(); insCompareChart = null; }

  const pfx  = insPeriodStr();
  const ppfx = insPrevPeriodStr();

  const curInc  = activeTX().filter(t => t.type === 'income'  && t.date.startsWith(pfx) ).reduce((s, t) => s + Number(t.amount), 0);
  const curExp  = activeTX().filter(t => t.type === 'expense' && t.date.startsWith(pfx) ).reduce((s, t) => s + Number(t.amount), 0);
  const prevInc = activeTX().filter(t => t.type === 'income'  && t.date.startsWith(ppfx)).reduce((s, t) => s + Number(t.amount), 0);
  const prevExp = activeTX().filter(t => t.type === 'expense' && t.date.startsWith(ppfx)).reduce((s, t) => s + Number(t.amount), 0);
  const curNet  = curInc  - curExp;
  const prevNet = prevInc - prevExp;

  const curLabel  = insPeriodLabel();
  const prevLabel = insMode === 'year'
    ? String(insYear - 1)
    : new Date(insYear, insMonth - 2, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' });

  const hdr = canvas.closest('.card')?.querySelector('.section-label');
  if (hdr) hdr.textContent = '📊 ' + prevLabel + '  vs  ' + curLabel;

  insCompareChart = safeChart(canvas, {
    type: 'bar',
    data: {
      labels: ['Income', 'Expenses', 'Net'],
      datasets: [
        { label: prevLabel, data: [prevInc, prevExp, prevNet],
          backgroundColor: ['rgba(82,214,138,.28)', 'rgba(232,69,122,.28)', 'rgba(162,155,254,.28)'],
          borderColor:     ['rgba(82,214,138,.7)',  'rgba(232,69,122,.7)',  'rgba(162,155,254,.7)'],
          borderWidth: 1.5, borderRadius: 5 },
        { label: curLabel,  data: [curInc, curExp, curNet],
          backgroundColor: ['rgba(82,214,138,.85)', 'rgba(232,69,122,.85)', 'rgba(162,155,254,.85)'],
          borderColor:     ['#52d68a', '#e8457a', '#a29bfe'],
          borderWidth: 1.5, borderRadius: 5 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 11 }, padding: 14, color: insToken('--muted') } },
        tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + fmt(c.parsed.y) } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11, weight: '600' }, color: insToken('--muted') } },
        y: { grid: { color: insToken('--card3') }, ticks: { font: { family: 'Inter', size: 10 }, color: insToken('--muted'), callback: v => '$' + Math.round(v).toLocaleString() } }
      }
    }
  });

  if (deltasEl) {
    const chips = [
      { label: 'Income',   cur: curInc,  prev: prevInc, color: '#52d68a' },
      { label: 'Expenses', cur: curExp,  prev: prevExp, color: '#e8457a' },
      { label: 'Net',      cur: curNet,  prev: prevNet, color: '#a29bfe' },
    ];
    deltasEl.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:10px">'
      + chips.map(c => {
          const delta = c.cur - c.prev;
          const pct   = c.prev !== 0 ? (delta / Math.abs(c.prev) * 100).toFixed(1) : null;
          const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
          const dColor = delta === 0 ? 'var(--muted)'
                       : (c.label === 'Expenses') ? (delta > 0 ? 'var(--danger)' : 'var(--success)')
                       : (delta > 0 ? 'var(--success)' : 'var(--danger)');
          return '<div style="flex:1 1 120px;background:var(--card2);border-radius:10px;padding:10px 14px">'
            + '<div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:4px">' + c.label + '</div>'
            + '<div style="font-family:var(--font-mono);font-size:1.05rem;font-weight:700;color:' + c.color + '">' + fmt(c.cur) + '</div>'
            + '<div style="font-size:.74rem;color:' + dColor + ';margin-top:3px;font-weight:600">'
            + arrow + ' ' + fmt(Math.abs(delta)) + (pct !== null ? ' (' + pct + '%)' : '')
            + ' <span style="color:var(--muted);font-weight:400">vs ' + prevLabel + '</span></div>'
            + '</div>';
        }).join('')
      + '</div>';
  }
}

// ── Spending by Category Chart ──────────────────────────────────
function insRenderCatChart() {
  const canvas      = document.getElementById('ins-cat-chart');
  const wrap        = document.getElementById('ins-cat-chart-wrap');
  const breakdownEl = document.getElementById('ins-cat-breakdown');
  const periodLbl   = document.getElementById('ins-cat-period-lbl');
  if (insCatChart) { insCatChart.destroy(); insCatChart = null; }

  const pfx   = insPeriodStr();
  const label = insPeriodLabel();
  if (periodLbl) periodLbl.textContent = label;

  const expTx = activeTX().filter(t =>
    t.type === 'expense' && t.date.startsWith(pfx) &&
    t.catId !== 'transfers' && (t.category || '').toLowerCase() !== 'transfers'
  );

  if (!expTx.length) {
    if (wrap)        wrap.style.height = '';
    if (breakdownEl) breakdownEl.innerHTML = '<div class="empty"><div class="ei">📊</div><p>No expenses this period.</p></div>';
    return;
  }

  const catTotals = {};
  expTx.forEach(t => {
    const id = t.catId || 'other';
    catTotals[id] = (catTotals[id] || 0) + Number(t.amount);
  });

  const sorted = Object.entries(catTotals)
    .map(([id, amt]) => {
      const cat = LCATS.find(c => c.id === id);
      return { id, name: cat ? cat.name : (id === 'other' ? 'Other' : id), icon: cat ? cat.icon : '📋', color: cat ? cat.color : insToken('--muted'), amt };
    })
    .sort((a, b) => b.amt - a.amt);

  const total  = sorted.reduce((s, r) => s + r.amt, 0);
  const topN   = Math.min(sorted.length, 14);
  const top    = sorted.slice(0, topN);
  const chartH = Math.max(220, topN * 44 + 48);
  if (wrap) wrap.style.height = chartH + 'px';

  if (canvas) {
    insCatChart = safeChart(canvas, {
      type: 'bar',
      data: {
        labels: top.map(r => r.icon + ' ' + r.name),
        datasets: [{ label: 'Spent', data: top.map(r => r.amt),
          backgroundColor: top.map(r => r.color + 'cc'),
          borderColor:     top.map(r => r.color),
          borderWidth: 1.5, borderRadius: 6 }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => ' ' + fmt(c.parsed.x) + ' (' + ((c.parsed.x / total) * 100).toFixed(1) + '%)' } }
        },
        scales: {
          x: { grid: { color: insToken('--card3') }, ticks: { font: { family: 'Inter', size: 10 }, color: insToken('--muted'), callback: v => '$' + Math.round(v).toLocaleString() } },
          y: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: insToken('--muted') } }
        }
      }
    });
  }

  if (breakdownEl) {
    const barMax = sorted[0] ? sorted[0].amt : 1;
    breakdownEl.innerHTML = '<div style="font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:10px">Full Breakdown — ' + fmt(total) + ' total</div>'
      + sorted.map(r => {
          const pct  = (r.amt / total * 100).toFixed(1);
          const barW = Math.round(r.amt / barMax * 100);
          return '<div style="padding:7px 0;border-bottom:1px solid var(--border)">'
            + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
            + '<span style="width:22px;text-align:center">' + (r.icon || '📋') + '</span>'
            + '<span style="flex:1;font-size:.82rem;font-weight:600">' + r.name + '</span>'
            + '<span style="font-size:.78rem;color:var(--muted)">' + pct + '%</span>'
            + '<span style="font-weight:700;font-size:.86rem;color:' + r.color + '">' + fmt(r.amt) + '</span>'
            + '</div>'
            + '<div style="height:4px;background:var(--card3);border-radius:99px;overflow:hidden;margin-left:30px">'
            + '<div style="height:100%;width:' + barW + '%;background:' + r.color + ';border-radius:99px;transition:width .4s ease"></div>'
            + '</div></div>';
        }).join('');
  }
}

// ── Spending by Subcategory Chart ───────────────────────────────
function insRenderSubcatChart() {
  const canvas    = document.getElementById('ins-subcat-chart');
  const wrap      = document.getElementById('ins-subcat-chart-wrap');
  const breakdown = document.getElementById('ins-subcat-breakdown');
  const periodLbl = document.getElementById('ins-subcat-period-lbl');
  const catFilter = document.getElementById('ins-subcat-filter-cat');

  if (insSubcatChart) { insSubcatChart.destroy(); insSubcatChart = null; }

  if (catFilter) {
    const cur = catFilter.value;
    catFilter.innerHTML = '<option value="">All Categories</option>'
      + LCATS.filter(c => c.type === 'expense' || c.type === 'both')
             .filter(c => c.id !== 'transfers' && c.id !== 'other')
             .map(c => '<option value="' + c.id + '"' + (c.id === cur ? ' selected' : '') + '>'
                       + c.icon + ' ' + c.name + '</option>')
             .join('');
  }

  const pfx         = insPeriodStr();
  const filterCatId = catFilter ? catFilter.value : '';
  if (periodLbl) periodLbl.textContent = insPeriodLabel();

  const expTx = activeTX().filter(t =>
    t.type === 'expense' && t.date.startsWith(pfx) &&
    t.catId !== 'transfers' && (t.category || '').toLowerCase() !== 'transfers' &&
    t.subcat && t.subcat.trim() !== '' &&
    (!filterCatId || t.catId === filterCatId)
  );

  if (!expTx.length) {
    if (wrap)       wrap.style.height = '';
    if (breakdown)  breakdown.innerHTML = '<div class="empty"><div class="ei">🔎</div><p>No subcategorised expenses this period.'
      + (filterCatId ? '' : ' Assign subcategories in the Transactions tab.') + '</p></div>';
    return;
  }

  const totals = {};
  expTx.forEach(t => {
    const cat     = LCATS.find(c => c.id === (t.catId || 'other'));
    const catName = cat ? cat.name : (t.category || 'Other');
    const key     = filterCatId ? t.subcat : catName + ' › ' + t.subcat;
    totals[key]   = (totals[key] || 0) + Number(t.amount);
  });

  const sorted = Object.entries(totals)
    .map(([label, amt]) => {
      let color = insToken('--muted');
      if (filterCatId) {
        const cat = LCATS.find(c => c.id === filterCatId);
        if (cat && cat.color) color = cat.color;
      } else {
        const matchedCat = LCATS.find(c => label.startsWith(c.name + ' ›'));
        if (matchedCat && matchedCat.color) color = matchedCat.color;
      }
      return { label, amt, color };
    })
    .sort((a, b) => b.amt - a.amt);

  const colorCount = {};
  sorted.forEach(r => { colorCount[r.color] = (colorCount[r.color] || 0) + 1; });
  const colorIdx = {};
  sorted.forEach(r => {
    colorIdx[r.color] = (colorIdx[r.color] || 0);
    const siblings = colorCount[r.color];
    if (siblings > 1) {
      const shift = colorIdx[r.color] / siblings;
      r.displayColor = r.color + Math.round(204 - shift * 80).toString(16).padStart(2, '0');
    } else {
      r.displayColor = r.color + 'cc';
    }
    colorIdx[r.color]++;
  });

  const total  = sorted.reduce((s, r) => s + r.amt, 0);
  const topN   = Math.min(sorted.length, 16);
  const top    = sorted.slice(0, topN);
  const chartH = Math.max(220, topN * 40 + 48);
  if (wrap) wrap.style.height = chartH + 'px';

  if (canvas) {
    insSubcatChart = safeChart(canvas, {
      type: 'bar',
      data: {
        labels: top.map(r => r.label),
        datasets: [{ label: 'Spent', data: top.map(r => r.amt),
          backgroundColor: top.map(r => r.displayColor),
          borderColor:     top.map(r => r.color),
          borderWidth: 1.5, borderRadius: 5 }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => ' ' + fmt(c.parsed.x) + ' (' + ((c.parsed.x / total) * 100).toFixed(1) + '%)' } }
        },
        scales: {
          x: { grid: { color: insToken('--card3') }, ticks: { font: { family: 'Inter', size: 10 }, color: insToken('--muted'), callback: v => '$' + Math.round(v).toLocaleString() } },
          y: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 10 }, color: insToken('--muted') } }
        }
      }
    });
  }

  if (breakdown) {
    const barMax = sorted[0] ? sorted[0].amt : 1;
    breakdown.innerHTML = '<div style="font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:10px">Full Breakdown — ' + fmt(total) + ' total</div>'
      + sorted.map(r => {
          const pct  = (r.amt / total * 100).toFixed(1);
          const barW = Math.round(r.amt / barMax * 100);
          return '<div style="padding:6px 0;border-bottom:1px solid var(--border)">'
            + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">'
            + '<span style="flex:1;font-size:.8rem;font-weight:600">' + r.label + '</span>'
            + '<span style="font-size:.74rem;color:var(--muted)">' + pct + '%</span>'
            + '<span style="font-weight:700;font-size:.84rem;color:' + r.color + '">' + fmt(r.amt) + '</span>'
            + '</div>'
            + '<div style="height:3px;background:var(--card3);border-radius:99px;overflow:hidden">'
            + '<div style="height:100%;width:' + barW + '%;background:' + r.color + ';border-radius:99px;transition:width .4s ease"></div>'
            + '</div></div>';
        }).join('');
  }
}
