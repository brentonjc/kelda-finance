let dbMode  = 'month';
let dbYear  = new Date().getFullYear();
let dbMonth = new Date().getMonth() + 1;
let dbCashFlowChart  = null;
let dbCompareChart   = null;
let dbCatChart       = null;

// Read a CSS token at render time so Chart.js picks up the active theme
function dbToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '';
}

function dbPeriodStr() {
  if (dbMode === 'year') return String(dbYear);
  return dbYear + '-' + String(dbMonth).padStart(2, '0');
}
function dbPeriodLabel() {
  if (dbMode === 'year') return String(dbYear);
  return new Date(dbYear, dbMonth-1, 1).toLocaleString('en-AU',{month:'long',year:'numeric'});
}
function dbPrevPeriodStr() {
  if (dbMode === 'year') return String(dbYear-1);
  const pm = dbMonth===1?12:dbMonth-1, py = dbMonth===1?dbYear-1:dbYear;
  return py+'-'+String(pm).padStart(2,'0');
}
function dbDaysInPeriod() {
  if (dbMode==='year') return 365;
  return new Date(dbYear, dbMonth, 0).getDate();
}
function dbSetMode(m) {
  dbMode=m;
  ['month','year'].forEach(x=>{const b=document.getElementById('db-mode-'+x);if(b)b.classList.toggle('active',x===m);});
  renderDashboard();
}
function dbNav(d) {
  if(dbMode==='year'){dbYear+=d;}
  else{dbMonth+=d;if(dbMonth>12){dbMonth=1;dbYear++;}if(dbMonth<1){dbMonth=12;dbYear--;}}
  renderDashboard();
}
function dbGoToday() {
  dbYear=new Date().getFullYear();dbMonth=new Date().getMonth()+1;renderDashboard();
}

// ══════════════════════════════════════════════════════════════
// SANKEY — DASHBOARD
// ══════════════════════════════════════════════════════════════

// ── SVG Sankey ──────────────────────────────────────────────────
function dbSankeyTip(evt, label, amt, pct, color) {
  var tip = document.getElementById('db-sankey-tip');
  if (!tip) return;
  tip.style.display = 'block';
  tip.innerHTML = '<div style="font-weight:700;margin-bottom:4px">' + label + '</div>'
    + '<div style="color:' + color + ';font-size:1rem;font-weight:700">' + fmt(amt) + '</div>'
    + '<div style="color:var(--muted);font-size:.72rem;margin-top:2px">' + pct + '% of income</div>';
  // Always position relative to the card (position:relative parent), not the SVG
  var card = document.getElementById('db-sankey-row');
  var cardRect = card ? card.getBoundingClientRect() : { left:0, top:0, width:400 };
  var clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  var clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
  var x = clientX - cardRect.left + 14;
  var y = clientY - cardRect.top  - 10;
  if (x + 190 > cardRect.width) x = clientX - cardRect.left - 190;
  if (y < 4) y = 4;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}
function dbSankeyHide() {
  var tip = document.getElementById('db-sankey-tip');
  if (tip) tip.style.display = 'none';
}

// ── Sankey resize observer — re-renders when the tile width changes ──
var _sankeyRO = null;

function dbRenderSankey() {
  var el = document.getElementById('db-sankey-container');
  if (!el) return;

  // Wire up ResizeObserver once so re-renders happen on window/sidebar resize
  if (!_sankeyRO && typeof ResizeObserver !== 'undefined') {
    _sankeyRO = new ResizeObserver(function() { _dbDrawSankey(el); });
    _sankeyRO.observe(el);
  }

  _dbDrawSankey(el);
}

function _dbDrawSankey(el) {
  if (!el) return;

  var pfx = dbPeriodStr();
  var txs = activeTX().filter(function(t) { return t.date.startsWith(pfx); });

  var totalIncome  = txs.filter(function(t){ return t.type==='income'; }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
  var totalExpense = txs.filter(function(t){ return t.type==='expense'; }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
  var savings = Math.max(0, totalIncome - totalExpense);

  if (!totalIncome) {
    el.innerHTML = '<div class="empty" style="min-height:180px"><div class="ei">💸</div><p>No income data for this period.</p></div>';
    return;
  }

  var catTotals = {};
  txs.filter(function(t){ return t.type==='expense' && t.catId !== 'transfers'; })
     .forEach(function(t) {
       var id = t.catId || 'other';
       catTotals[id] = (catTotals[id]||0) + Number(t.amount);
     });

  // Fallback palette — 24 visually distinct colours for uncategorised entries
  var SANKEY_PALETTE = [
    '#F0538A','#818CF8','#00C896','#F59E0B','#38BDF8',
    '#FB7185','#34D399','#FBBF24','#A78BFA','#22D3EE',
    '#F97316','#4ADE80','#E879F9','#60A5FA','#FACC15',
    '#F43F5E','#2DD4BF','#C084FC','#FB923C','#86EFAC',
    '#E11D48','#06B6D4','#8B5CF6','#10B981',
  ];

  var catEntries = Object.entries(catTotals).sort(function(a,b){ return b[1]-a[1]; });
  var topCats    = catEntries.slice(0, 14);
  var otherTotal = catEntries.slice(14).reduce(function(s,e){ return s+e[1]; }, 0);
  if (otherTotal > 0) topCats.push(['other_group', otherTotal]);
  if (savings > 0)    topCats.push(['savings', savings]);

  // Read container width AFTER layout — use getBoundingClientRect for accuracy,
  // fall back to offsetWidth, then a sensible default.
  var rect = el.getBoundingClientRect();
  var W = (rect && rect.width > 20) ? Math.floor(rect.width)
        : (el.offsetWidth > 20)     ? el.offsetWidth
        : 600;

  // Layout constants — right pad gives room for label + amount text
  var nodeW    = 26;
  var labelPad = 10;
  var leftPad  = 96;
  var rightPad = Math.min(220, Math.floor(W * 0.28));  // scales with width
  var incomeY  = 15;
  var gap      = 10;
  var MIN_NODE_H = 30;
  var n = topCats.length;

  var maxAmt    = topCats.reduce(function(mx, e) { return Math.max(mx, e[1]); }, 1);
  var MAX_NODE_H = Math.max(MIN_NODE_H * 2, Math.min(150, Math.floor(700 / n)));
  var scale     = MAX_NODE_H / maxAmt;

  var colX1 = leftPad;
  var colX2 = W - rightPad - nodeW;

  // Guard against degenerate geometry (very narrow container)
  if (colX2 <= colX1 + 40) {
    el.innerHTML = '<div class="empty" style="min-height:80px"><p style="font-size:.75rem;color:var(--muted);text-align:center">Container too narrow to render</p></div>';
    return;
  }

  var paletteIdx = 0;
  var curY = incomeY;
  var nodes = topCats.map(function(e) {
    var id = e[0], amt = e[1];
    var h = Math.max(MIN_NODE_H, Math.round(amt * scale));
    var cat = LCATS.find(function(c){ return c.id === id; });
    var color = id === 'savings'     ? dbToken('--success')
              : id === 'other_group' ? dbToken('--muted')
              : (cat && cat.color)   ? cat.color
              : SANKEY_PALETTE[paletteIdx++ % SANKEY_PALETTE.length];
    var label = id === 'savings'     ? '💚 Savings'
              : id === 'other_group' ? '📋 Other'
              : (cat ? cat.icon + ' ' + cat.name : id);
    var node = { id: id, amt: amt, h: h, y: curY, color: color, label: label };
    curY += h + gap;
    return node;
  });

  // SVG canvas height is exactly what the layout needs — no padding, no overflow
  var H       = Math.max(300, curY - gap + 28);
  var incomeH = H - incomeY - 28;

  var paths = '', rects = '', labels = '';
  var lY = incomeY;

  nodes.forEach(function(node) {
    var frac   = node.amt / totalIncome;
    var flowH  = Math.max(3, Math.round(incomeH * frac));
    var srcY1  = lY,       srcY2 = lY + flowH;
    var tgtY1  = node.y,   tgtY2 = node.y + node.h;
    var cx     = Math.round((colX1 + nodeW + colX2) / 2);
    var pct    = (node.amt / totalIncome * 100).toFixed(1);
    // Escape label for inline event handler attribute
    var safeLabel = node.label.replace(/'/g, '\\\'').replace(/"/g, '&quot;');
    var tipArgs = '\'' + safeLabel + '\',' + node.amt.toFixed(2) + ',' + pct + ',\'' + node.color + '\'';

    paths += '<path d="M' + (colX1+nodeW) + ',' + srcY1
           + ' C' + cx + ',' + srcY1 + ' ' + cx + ',' + tgtY1 + ' ' + colX2 + ',' + tgtY1
           + ' L' + colX2 + ',' + tgtY2
           + ' C' + cx + ',' + tgtY2 + ' ' + cx + ',' + srcY2 + ' ' + (colX1+nodeW) + ',' + srcY2 + ' Z"'
           + ' fill="' + node.color + '" opacity="0.28"'
           + ' style="cursor:pointer;transition:opacity .15s"'
           + ' onmouseover="this.style.opacity=\'0.65\';dbSankeyTip(event,' + tipArgs + ')"'
           + ' onmouseout="this.style.opacity=\'0.28\';dbSankeyHide()"'
           + ' ontouchstart="this.style.opacity=\'0.65\';dbSankeyTip(event,' + tipArgs + ')"'
           + ' ontouchend="this.style.opacity=\'0.28\';dbSankeyHide()"/>';

    rects += '<rect x="' + colX2 + '" y="' + node.y + '" width="' + nodeW + '" height="' + node.h + '"'
           + ' rx="5" fill="' + node.color + '" style="cursor:pointer"'
           + ' onmouseover="dbSankeyTip(event,' + tipArgs + ')"'
           + ' onmouseout="dbSankeyHide()"/>';

    var labelY   = node.y + Math.round(node.h / 2) + 4;
    var labelX   = colX2 + nodeW + labelPad;
    var maxChars = Math.max(8, Math.floor((W - labelX - 4) / 7));
    labels += '<text x="' + labelX + '" y="' + labelY
            + '" font-size="11" fill="#d0cce8" font-family="Inter,sans-serif">'
            + node.label.slice(0, maxChars) + '</text>'
            + '<text x="' + labelX + '" y="' + (labelY + 14)
            + '" font-size="10" fill="' + node.color + '" font-family="DM Mono,monospace" font-weight="600">'
            + fmt(node.amt)
            + ' <tspan fill="#6b7280" font-weight="400">(' + pct + '%)</tspan></text>';

    lY = srcY2;
  });

  // Income source bar (left side)
  var srcH = Math.min(nodes.reduce(function(s,nd){ return s+nd.h+gap; }, 0) - gap, incomeH);
  var midY = incomeY + Math.round(srcH / 2);
  var incSVG = '<rect x="' + colX1 + '" y="' + incomeY + '" width="' + nodeW + '" height="' + srcH + '" rx="5" fill="#F0538A"/>';
  var incLabel = '<text x="' + (colX1 - labelPad) + '" y="' + (midY - 7) + '"'
               + ' font-size="11" fill="#d0cce8" text-anchor="end" font-family="Inter,sans-serif">Income</text>'
               + '<text x="' + (colX1 - labelPad) + '" y="' + (midY + 8) + '"'
               + ' font-size="10" fill="#F0538A" text-anchor="end" font-family="DM Mono,monospace" font-weight="600">'
               + fmt(totalIncome) + '</text>';

  // SVG: explicit width+height as natural dimensions; CSS width:100% + height:auto
  // makes it fill the card while preserving all geometry (no distortion).
  el.innerHTML = '<svg'
    + ' width="' + W + '" height="' + H + '"'
    + ' viewBox="0 0 ' + W + ' ' + H + '"'
    + ' style="width:100%;height:auto;display:block;overflow:visible">'
    + paths + rects + incSVG + incLabel + labels
    + '</svg>'
    + '<div style="font-size:.7rem;color:var(--muted);margin-top:8px;text-align:center">'
    + dbPeriodLabel() + ' · Hover/tap flows to explore</div>';
}

function renderDashboard(){
  // Ensure all transactions have a catId resolved from category name
  migrateTxCategories();

  // Update hero card
  var _heroGreet = document.getElementById('db-hero-greeting');
  var _heroNW    = document.getElementById('db-hero-nw');
  var _heroInc   = document.getElementById('db-hero-inc');
  var _heroExp   = document.getElementById('db-hero-exp');
  var _heroSaved = document.getElementById('db-hero-saved');
  var _hr = new Date().getHours();
  var _greet = _hr < 12 ? 'GOOD MORNING' : _hr < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
  if (_heroGreet) _heroGreet.textContent = _greet;
  var _pfx = dbPeriodStr();
  var _inc = activeTX().filter(function(t){return t.type==='income'&&t.date.startsWith(_pfx);}).reduce(function(s,t){return s+Number(t.amount);},0);
  var _exp = activeTX().filter(function(t){return t.type==='expense'&&t.date.startsWith(_pfx);}).reduce(function(s,t){return s+Number(t.amount);},0);
  var _saved = Math.max(0,_inc - _exp);
  if (_heroInc)   _heroInc.textContent   = '+' + fmt(_inc);
  if (_heroExp)   _heroExp.textContent   = '-' + fmt(_exp);
  if (_heroSaved) _heroSaved.textContent = ((_inc-_exp)>=0?'+':'-') + fmt(Math.abs(_inc-_exp));
  // Net worth (sync with dbRenderNetWorth calculation)
  try {
    var _months=ctAllMonths(),_lm=_months.length?_months[_months.length-1]:null;
    var _bank=_lm?['offset','home','sav1','sav2'].reduce(function(s,a){return s+((CT[a]||{})[_lm]||0);},0):0;
    var _supB=(SUPER.b&&SUPER.b.balance)||0,_supS=(SUPER.s&&SUPER.s.balance)||0;
    var _eq=(MORTGAGE.homeValue||0)-(MORTGAGE.balance||0);
    var _eqV=(typeof eqTotalEquitiesValue==='function')?eqTotalEquitiesValue():0;
    var _tax=(typeof taxTotalOwing==='function')?taxTotalOwing():0;
    var _nw=_bank+_supB+_supS+Math.max(0,_eq)+_eqV-_tax;
    if(_heroNW) _heroNW.textContent=fmt(_nw);
  } catch(e) {}
  const lbl=document.getElementById('db-period-lbl');
  if(lbl)lbl.textContent=dbPeriodLabel();
  dbRenderSummaryCards();
  dbRenderCashFlowChart();
  dbRenderCompareChart();
  dbRenderBudgetBars();
  dbRenderAccounts();
  dbRenderNetWorth();
  dbRenderMortgage();
  dbRenderSuper();
  dbRenderSankey();
  dbRenderCatChart();
  dbRenderSubcatChart();
  dbRenderUpcomingBills();
  dbRenderGoals();
  dbRenderInsurance();
  dbRenderTransferStat();
  dbRenderForecastTable();
}

function dbRenderForecastTable() {
  var el = document.getElementById('db-forecast-table-wrap');
  if (!el) return;

  // Use forecast functions if available
  if (typeof fc2GetMonths !== 'function' || typeof fc2FmtMonth !== 'function') {
    el.innerHTML = '<div style="color:var(--muted);font-size:.84rem;padding:8px 0">Forecast data unavailable.</div>';
    return;
  }

  var months = fc2GetMonths();
  if (!months || !months.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:.84rem;padding:8px 0">No forecast data yet.</div>';
    return;
  }

  var totalInc = 0, totalExp = 0, totalNet = 0;
  var rows = '';
  months.forEach(function(m) {
    totalInc += m.income   || 0;
    totalExp += m.expenses || 0;
    totalNet += m.net      || 0;
    var netColor  = m.net >= 0 ? 'var(--success)' : 'var(--danger)';
    var statusDot = m.isActual ? '' : (m.net < 0 ? '<span style="color:var(--danger)">&#x25CF;</span> ' : '');
    var adjCount  = m.adjustments && m.adjustments.length ? '<span style="font-size:.68rem;color:var(--primary);margin-left:4px">+' + m.adjustments.length + ' adj</span>' : '';
    rows += '<tr>'
      + '<td style="white-space:nowrap">' + statusDot + m.label + adjCount + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono);color:var(--success)">' + (m.income > 0 ? fmt(m.income) : '—') + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono);color:var(--danger)">'  + (m.expenses > 0 ? fmt(m.expenses) : '—') + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:' + netColor + '">' + (m.net >= 0 ? '+' : '') + fmt(m.net) + '</td>'
      + '<td style="text-align:right"><span class="fc2-badge ' + (m.isActual ? 'fc2-badge-grey' : 'fc2-badge-green') + '">' + (m.isActual ? 'Actual' : 'Forecast') + '</span></td>'
      + '</tr>';
  });

  var footerNetColor = totalNet >= 0 ? 'var(--success)' : 'var(--danger)';

  el.innerHTML = '<div class="tbl-wrap"><table style="width:100%;border-collapse:collapse;font-size:.82rem">'
    + '<thead><tr>'
    + '<th style="text-align:left;padding:8px 10px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);border-bottom:1.5px solid var(--border)">Month</th>'
    + '<th style="text-align:right;padding:8px 10px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);border-bottom:1.5px solid var(--border)">Income</th>'
    + '<th style="text-align:right;padding:8px 10px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);border-bottom:1.5px solid var(--border)">Expenses</th>'
    + '<th style="text-align:right;padding:8px 10px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);border-bottom:1.5px solid var(--border)">Net</th>'
    + '<th style="text-align:right;padding:8px 10px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);border-bottom:1.5px solid var(--border)"></th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '<tfoot><tr style="border-top:1.5px solid var(--border)">'
    + '<td style="padding:9px 10px;font-weight:700;font-size:.82rem">Total</td>'
    + '<td style="text-align:right;padding:9px 10px;font-family:var(--font-mono);font-weight:700;color:var(--success)">' + fmt(totalInc) + '</td>'
    + '<td style="text-align:right;padding:9px 10px;font-family:var(--font-mono);font-weight:700;color:var(--danger)">'  + fmt(totalExp) + '</td>'
    + '<td style="text-align:right;padding:9px 10px;font-family:var(--font-mono);font-weight:700;color:' + footerNetColor + '">' + (totalNet >= 0 ? '+' : '') + fmt(totalNet) + '</td>'
    + '<td></td>'
    + '</tr></tfoot>'
    + '</table></div>'
    + '<div style="font-size:.72rem;color:var(--muted);margin-top:8px">Actuals through last month &nbsp;&#xB7;&nbsp; Forecast from this month forward &nbsp;&#xB7;&nbsp; Adjustments included</div>';
}

function dbRenderSummaryCards(){
  const el=document.getElementById('db-summary-cards');if(!el)return;
  const pfx=dbPeriodStr(),ppfx=dbPrevPeriodStr();
  const incTx=activeTX().filter(t=>t.type==='income'&&t.date.startsWith(pfx));
  const expTx=activeTX().filter(t=>t.type==='expense'&&t.date.startsWith(pfx));
  const pExpTx=activeTX().filter(t=>t.type==='expense'&&t.date.startsWith(ppfx));
  const inc=incTx.reduce((s,t)=>s+Number(t.amount),0);
  const exp=expTx.reduce((s,t)=>s+Number(t.amount),0);
  const pExp=pExpTx.reduce((s,t)=>s+Number(t.amount),0);
  const net=inc-exp, days=dbDaysInPeriod(), daily=exp>0&&days>0?exp/days:0;
  const momDelta=exp-pExp;
  const momColor=momDelta>0?'#f04060':'#52d68a';
  const prevLabel=dbMode==='year'?String(dbYear-1):new Date(dbYear,dbMonth-2,1).toLocaleString('en-AU',{month:'long'});
  const momText=momDelta===0?'Same as '+prevLabel:(momDelta>0?'+':'')+fmt(momDelta>0?momDelta:-momDelta)+(momDelta>0?' more than ':' less than ')+prevLabel;
  el.innerHTML=''
    +'<div class="dash-stat ds-income"><div class="ds-lbl">Total Income</div><div class="ds-val">'+fmt(inc)+'</div><div class="ds-sub">'+dbPeriodLabel()+'</div></div>'
    +'<div class="dash-stat ds-expense"><div class="ds-lbl">Total Expenses</div><div class="ds-val">'+fmt(exp)+'</div><div class="ds-sub">'+expTx.length+' transaction'+(expTx.length!==1?'s':'')+'</div></div>'
    +'<div class="dash-stat ds-net"><div class="ds-lbl">'+(net>=0?'Surplus':'Deficit')+'</div><div class="ds-val">'+fmt(Math.abs(net))+'</div><div class="ds-sub">'+(net>=0?'Income over expenses':'Expenses over income')+'</div></div>'
    +'<div class="dash-stat ds-mom"><div class="ds-lbl">vs Previous Period</div><div class="ds-val" style="font-size:1rem;color:'+momColor+'">'+(momDelta>=0?'↑':'↓')+' '+fmt(Math.abs(momDelta))+'</div><div class="ds-sub">'+momText+'</div></div>'
    +'<div class="dash-stat ds-daily"><div class="ds-lbl">Avg Daily Spend</div><div class="ds-val">'+fmt(daily)+'</div><div class="ds-sub">per day this '+(dbMode==='year'?'year':'month')+'</div></div>';
}

function dbRenderCashFlowChart(){
  const canvas=document.getElementById('db-cashflow-chart');if(!canvas)return;
  if(dbCashFlowChart){dbCashFlowChart.destroy();dbCashFlowChart=null;}
  let months=[], chartType='line', labelTitle='';
  if(dbMode==='year'){
    // Year selected: show all 12 months of that year
    for(let m=1;m<=12;m++) months.push(dbYear+'-'+String(m).padStart(2,'0'));
    labelTitle='Monthly in '+dbYear;
    chartType='bar';
  } else {
    // Month selected: show that month + 5 previous months (6-month window)
    for(let i=5;i>=0;i--){
      const d=new Date(dbYear,dbMonth-1-i,1);
      months.push(d.toISOString().slice(0,7));
    }
    labelTitle='Last 6 months ending '+dbPeriodLabel();
  }
  const labels=months.map(m=>new Date(m+'-02').toLocaleString('en-AU',{month:'short',year:'2-digit'}));
  const incData=months.map(m=>activeTX().filter(t=>t.type==='income'&&t.date.startsWith(m)).reduce((s,t)=>s+Number(t.amount),0));
  const expData=months.map(m=>activeTX().filter(t=>t.type==='expense'&&t.date.startsWith(m)).reduce((s,t)=>s+Number(t.amount),0));
  // Highlight selected month
  const selectedPfx=dbPeriodStr().slice(0,7);
  const highlightBgs=months.map(m=>m===selectedPfx?'rgba(232,69,122,.9)':'rgba(232,69,122,.35)');
  const incBgs=months.map(m=>m===selectedPfx?'rgba(82,214,138,.9)':'rgba(82,214,138,.35)');
  const isBar=dbMode==='year'||months.length<=6;
  dbCashFlowChart=safeChart(canvas,{type:isBar?'bar':'line',data:{labels,datasets:[
    {label:'Income',data:incData,borderColor:'#52d68a',
      backgroundColor:isBar?incBgs:'rgba(82,214,138,.15)',
      fill:!isBar,tension:0.3,pointRadius:3,borderWidth:isBar?0:2,borderRadius:isBar?4:0},
    {label:'Expenses',data:expData,borderColor:'#e8457a',
      backgroundColor:isBar?highlightBgs:'rgba(232,69,122,.12)',
      fill:!isBar,tension:0.3,pointRadius:3,borderWidth:isBar?0:2,borderRadius:isBar?4:0}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{position:'bottom',labels:{font:{family:'Inter',size:11},padding:12,color:dbToken('--muted')}},
      tooltip:{callbacks:{
        title:items=>{const m=months[items[0].dataIndex];return new Date(m+'-02').toLocaleString('en-AU',{month:'long',year:'numeric'})+(m===selectedPfx?' ★':' ');},
        label:c=>' '+c.dataset.label+': '+fmt(c.parsed.y)}}},
    scales:{x:{grid:{display:false},ticks:{font:{family:'Inter',size:10},color:dbToken('--muted')}},
      y:{grid:{color:dbToken('--card3')},ticks:{font:{family:'Inter',size:10},color:dbToken('--muted'),callback:v=>'$'+Math.round(v).toLocaleString()}}}}});
  // Update chart subtitle
  const lbl=document.querySelector('#db-cashflow-chart')?.closest('.card')?.querySelector('.section-label');
  if(lbl)lbl.textContent='📈 Cash Flow — '+labelTitle;
}

// ── Period-on-period income vs expenses comparison ──────────────
function dbRenderCompareChart(){
  const canvas   = document.getElementById('db-compare-chart');
  const deltasEl = document.getElementById('db-compare-deltas');
  if(!canvas) return;
  if(dbCompareChart){dbCompareChart.destroy();dbCompareChart=null;}

  const pfx  = dbPeriodStr();
  const ppfx = dbPrevPeriodStr();

  const curInc  = activeTX().filter(t=>t.type==='income' &&t.date.startsWith(pfx) ).reduce((s,t)=>s+Number(t.amount),0);
  const curExp  = activeTX().filter(t=>t.type==='expense'&&t.date.startsWith(pfx) ).reduce((s,t)=>s+Number(t.amount),0);
  const prevInc = activeTX().filter(t=>t.type==='income' &&t.date.startsWith(ppfx)).reduce((s,t)=>s+Number(t.amount),0);
  const prevExp = activeTX().filter(t=>t.type==='expense'&&t.date.startsWith(ppfx)).reduce((s,t)=>s+Number(t.amount),0);

  const curNet  = curInc  - curExp;
  const prevNet = prevInc - prevExp;

  const curLabel  = dbPeriodLabel();
  const prevLabel = dbMode==='year'
    ? String(dbYear-1)
    : new Date(dbYear, dbMonth-2, 1).toLocaleString('en-AU',{month:'long',year:'numeric'});

  // Update tile header with period context
  const hdr = canvas.closest('.card')?.querySelector('.section-label');
  if(hdr) hdr.textContent = '📊 ' + prevLabel + '  vs  ' + curLabel;

  dbCompareChart = safeChart(canvas, {
    type: 'bar',
    data: {
      labels: ['Income','Expenses','Net'],
      datasets: [
        {
          label: prevLabel,
          data: [prevInc, prevExp, prevNet],
          backgroundColor: ['rgba(82,214,138,.28)','rgba(232,69,122,.28)','rgba(162,155,254,.28)'],
          borderColor:     ['rgba(82,214,138,.7)','rgba(232,69,122,.7)','rgba(162,155,254,.7)'],
          borderWidth: 1.5, borderRadius: 5
        },
        {
          label: curLabel,
          data: [curInc, curExp, curNet],
          backgroundColor: ['rgba(82,214,138,.85)','rgba(232,69,122,.85)','rgba(162,155,254,.85)'],
          borderColor:     ['#52d68a','#e8457a','#a29bfe'],
          borderWidth: 1.5, borderRadius: 5
        }
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{position:'bottom',labels:{font:{family:'Inter',size:11},padding:14,color:dbToken('--muted')}},
        tooltip:{callbacks:{label:c=>' '+c.dataset.label+': '+fmt(c.parsed.y)}}
      },
      scales:{
        x:{grid:{display:false},ticks:{font:{family:'Inter',size:11},color:dbToken('--muted'),font:{weight:'600'}}},
        y:{grid:{color:dbToken('--card3')},ticks:{font:{family:'Inter',size:10},color:dbToken('--muted'),callback:v=>'$'+Math.round(v).toLocaleString()}}
      }
    }
  });

  // Delta chips below the chart
  if(deltasEl){
    const chips = [
      { label:'Income',   cur:curInc,  prev:prevInc, color:'#52d68a' },
      { label:'Expenses', cur:curExp,  prev:prevExp, color:'#e8457a' },
      { label:'Net',      cur:curNet,  prev:prevNet, color:'#a29bfe' },
    ];
    deltasEl.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:10px">'
      + chips.map(c=>{
          const delta = c.cur - c.prev;
          const pct   = c.prev !== 0 ? (delta/Math.abs(c.prev)*100).toFixed(1) : null;
          const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
          const dColor = delta === 0 ? 'var(--muted)'
                       : (c.label==='Expenses') ? (delta>0?'var(--danger)':'var(--success)')
                       : (delta>0?'var(--success)':'var(--danger)');
          return '<div style="flex:1 1 120px;background:var(--card2);border-radius:10px;padding:10px 14px">'
            +'<div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:4px">'+c.label+'</div>'
            +'<div style="font-family:var(--font-mono);font-size:1.05rem;font-weight:700;color:'+c.color+'">'+fmt(c.cur)+'</div>'
            +'<div style="font-size:.74rem;color:'+dColor+';margin-top:3px;font-weight:600">'
            +arrow+' '+fmt(Math.abs(delta))+(pct!==null?' ('+pct+'%)':'')
            +' <span style="color:var(--muted);font-weight:400">vs '+prevLabel+'</span></div>'
            +'</div>';
        }).join('')
      + '</div>';
  }
}

function dbRenderBudgetBars(){
  const el=document.getElementById('db-budget-bars');if(!el)return;
  const pfx=dbPeriodStr();
  const rows=[];
  Object.entries(LBUDGETS).forEach(([catId,ml])=>{
    const cat=LCATS.find(c=>c.id===catId);
    const name=cat?cat.name:catId;
    const lim=dbMode==='year'?ml*12:ml;
    const spent=activeTX().filter(t=>t.type==='expense'&&t.date.startsWith(pfx)&&(t.catId===catId||t.category===name)).reduce((s,t)=>s+Number(t.amount),0);
    rows.push({name,icon:cat?cat.icon:'',color:cat?cat.color:'var(--primary)',lim,spent});
  });
  const covered=new Set(rows.map(r=>r.name.toLowerCase()));
  // Only LBUDGETS used — old BUDGETS object ignored

  if(!rows.length){el.innerHTML='<div class="empty"><div class="ei">🎯</div><p>Set budgets to see progress.</p></div>';return;}
  rows.sort((a,b)=>(b.spent/b.lim)-(a.spent/a.lim));
  el.innerHTML=rows.map(r=>{
    const pct=Math.min((r.spent/r.lim)*100,100);
    const cls=pct>=100?'over':pct>=70?'warn':'';
    const rem=r.lim-r.spent;
    return '<div class="prog-wrap">'
      +'<div class="prog-hd"><span class="prog-lbl">'+(r.icon?r.icon+' ':'')+r.name+'</span>'
      +'<span class="prog-val">'+fmt(r.spent)+' / '+fmt(r.lim)+'</span></div>'
      +'<div class="prog-track"><div class="prog-fill '+cls+'" style="width:'+pct.toFixed(0)+'%"></div></div>'
      +'<div style="display:flex;justify-content:space-between;margin-top:3px;font-size:.7rem">'
      +'<span style="color:var(--muted)">'+pct.toFixed(0)+'%</span>'
      +'<span style="color:'+(rem<0?'var(--danger)':rem<r.lim*0.1?'var(--warn)':'var(--success)')+';font-weight:600">'
      +(rem<0?'Over by '+fmt(Math.abs(rem)):fmt(rem)+' left')+'</span></div></div>';
  }).join('');
}

function dbRenderAccounts(){
  const el=document.getElementById('db-accounts');if(!el)return;
  const months=ctAllMonths(),lm=months.length?months[months.length-1]:null;
  const accts=[
    {id:'offset',label:CTCFG.offsetLbl||'Offset Account',icon:'🏦'},
    {id:'home',  label:CTCFG.homeLbl  ||'Home Transaction',icon:'🏠'},
    {id:'sav1',  label:CTCFG.sav1Lbl  ||getUserName('brenton')+' Savings',icon:'💰'},
    {id:'sav2',  label:CTCFG.sav2Lbl  ||getUserName('shelley')+' Savings',icon:'💎'},
  ];
  const vals=accts.map(a=>lm?((CT[a.id]||{})[lm]||0):0);
  const total=vals.reduce((s,v)=>s+v,0);
  const dateLbl=lm?new Date(lm+'-02').toLocaleString('en-AU',{month:'long',year:'numeric'}):'No data yet';
  el.innerHTML='<div class="acct-strip">'
    +accts.map((a,i)=>'<div class="acct-strip-item"><div class="acct-strip-lbl">'+a.icon+' '+a.label+'</div><div class="acct-strip-val">'+fmt(vals[i])+'</div></div>').join('')
    +'<div class="acct-strip-item acct-strip-total"><div class="acct-strip-lbl" style="color:var(--warn)">Combined</div><div class="acct-strip-val" style="color:var(--warn)">'+fmt(total)+'</div></div>'
    +'</div><div style="font-size:.7rem;color:var(--muted);margin-top:8px">As at '+dateLbl+'</div>';
}

function dbRenderNetWorth(){
  const el=document.getElementById('db-networth');if(!el)return;
  const months=ctAllMonths(),lm=months.length?months[months.length-1]:null;
  const bank=lm?['offset','home','sav1','sav2'].reduce((s,a)=>s+((CT[a]||{})[lm]||0),0):0;
  const supB=SUPER.b?.balance||0,supS=SUPER.s?.balance||0;
  const equity=Math.max(0,(MORTGAGE.homeValue||0)-(MORTGAGE.balance||0));
  const assets=bank+supB+supS+(MORTGAGE.homeValue||0);
  const liab=MORTGAGE.balance||0;
  const taxOwing=(typeof taxTotalOwing==='function')?taxTotalOwing():0;
  var eqV=(typeof eqTotalEquitiesValue==='function')?eqTotalEquitiesValue():0;
  const nw=bank+supB+supS+equity+eqV-taxOwing;
  var assetsTotal=bank+supB+supS+(MORTGAGE.homeValue||0)+eqV;
  el.innerHTML='<div class="tile-hd" style="margin-bottom:8px"><div class="section-label" style="margin:0">Net Worth</div><a href="#" onclick="go(\'assets\');return false;" class="tile-link">View assets →</a></div>'
    +'<div class="nw-val">'+fmt(nw)+'</div>'
    +'<div class="nw-sub">Assets '+fmt(assetsTotal)+' − Liabilities '+fmt(liab)+(eqV>0?' + Equities '+fmt(eqV):'')+(taxOwing>0?' − Tax '+fmt(taxOwing):'')+'</div>'
    +'<div class="nw-breakdown">'
    +'<div class="nw-item"><div class="nw-item-lbl">Bank</div><div class="nw-item-val" style="color:var(--primary)">'+fmt(bank)+'</div></div>'
    +'<div class="nw-item"><div class="nw-item-lbl">Super</div><div class="nw-item-val" style="color:var(--purple)">'+fmt(supB+supS)+'</div></div>'
    +'<div class="nw-item"><div class="nw-item-lbl">Home Equity</div><div class="nw-item-val" style="color:var(--success)">'+fmt(equity)+'</div></div>'
    +(eqV>0?'<div class="nw-item"><div class="nw-item-lbl">Equities</div><div class="nw-item-val" style="color:var(--success-lt)">'+fmt(eqV)+'</div></div>':'')
    +'<div class="nw-item"><div class="nw-item-lbl">Mortgage</div><div class="nw-item-val" style="color:var(--danger)">-'+fmt(liab)+'</div></div>'
    +(taxOwing>0?'<div class="nw-item"><div class="nw-item-lbl">Tax Owing</div><div class="nw-item-val" style="color:var(--danger)">-'+fmt(taxOwing)+'</div></div>':'')
    +'</div>';
}

function dbRenderMortgage(){
  const el=document.getElementById('db-mortgage');if(!el)return;
  if(!MORTGAGE.balance){el.innerHTML='<div class="empty" style="padding:12px 0"><div class="ei">🏡</div><p>No mortgage data.</p></div>';return;}
  const m=MORTGAGE;
  const equity=Math.max(0,(m.homeValue||0)-(m.balance||0));
  const eqPct=m.homeValue?(equity/m.homeValue*100).toFixed(1):0;
  const isIO=m.reptype==='io';
  const effBal=Math.max(0,(m.balance||0)-(m.offset||0));
  const r=(m.rate||0)/100/12,n=(m.years||0)*12;
  // Repayment based on full loan balance (not offset-adjusted); offset shown separately
  const repmt=isIO?m.balance*r:(r&&n?m.balance*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1):0);
  const np=new Date();np.setMonth(np.getMonth()+1);np.setDate(1);
  const npStr=np.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
  el.innerHTML='<div class="mort-snap">'
    +'<div class="mort-snap-item"><div class="mort-snap-lbl">Balance</div><div class="mort-snap-val" style="color:var(--danger)">'+fmt(m.balance)+'</div></div>'
    +'<div class="mort-snap-item"><div class="mort-snap-lbl">Equity</div><div class="mort-snap-val" style="color:var(--success)">'+fmt(equity)+'</div><div style="font-size:.68rem;color:var(--muted);margin-top:2px">'+eqPct+'% of value</div></div>'
    +'<div class="mort-snap-item"><div class="mort-snap-lbl">Monthly Payment</div><div class="mort-snap-val">'+fmt(repmt)+'</div></div>'
    +'<div class="mort-snap-item"><div class="mort-snap-lbl">Next Payment</div><div class="mort-snap-val" style="font-size:.9rem">'+npStr+'</div></div>'
    +'</div>'
    +(m.offset?'<div style="margin-top:10px;font-size:.76rem;padding:7px 12px;background:var(--primary-bg);border-radius:8px;color:var(--pink-light)">Offset: <strong>'+fmt(m.offset)+'</strong> · Effective balance: <strong>'+fmt(effBal)+'</strong></div>':'');
}

function dbRenderSuper(){
  const el=document.getElementById('db-super');if(!el)return;
  const bBal=SUPER.b?.balance||0,sBal=SUPER.s?.balance||0;
  el.innerHTML='<div class="super-strip">'
    +'<div class="super-strip-item" style="background:linear-gradient(135deg,#8b1a4a,#e8457a)">'
    +'<div class="super-strip-lbl">'+getUserName('brenton')+'</div><div class="super-strip-val">'+fmt(bBal)+'</div>'
    +(SUPER.b?.age?'<div style="font-size:.7rem;opacity:.75;margin-top:3px">Age '+SUPER.b.age+' · Retire '+(SUPER.b.retire||67)+'</div>':'')
    +'</div>'
    +'<div class="super-strip-item" style="background:linear-gradient(135deg,#3a2060,#7c5cbf)">'
    +'<div class="super-strip-lbl">'+getUserName('shelley')+'</div><div class="super-strip-val">'+fmt(sBal)+'</div>'
    +(SUPER.s?.age?'<div style="font-size:.7rem;opacity:.75;margin-top:3px">Age '+SUPER.s.age+' · Retire '+(SUPER.s.retire||67)+'</div>':'')
    +'</div>'
    +'<div class="super-strip-item" style="background:linear-gradient(135deg,#2a1535,#4a2060);flex-basis:100%">'
    +'<div class="super-strip-lbl">Combined</div><div class="super-strip-val">'+fmt(bBal+sBal)+'</div></div>'
    +'</div>';
}

function dbRenderCatChart(){
  const canvas     = document.getElementById('db-cat-chart');
  const wrap       = document.getElementById('db-cat-chart-wrap');
  const breakdownEl= document.getElementById('db-cat-breakdown');
  const periodLbl  = document.getElementById('db-cat-period-lbl');
  if(dbCatChart){dbCatChart.destroy();dbCatChart=null;}
  const pfx  = dbPeriodStr();
  const label= dbPeriodLabel();
  if(periodLbl) periodLbl.textContent = label;

  const expTx = activeTX().filter(t =>
    t.type==='expense' && t.date.startsWith(pfx) &&
    t.catId !== 'transfers' && (t.category||'').toLowerCase() !== 'transfers'
  );

  if(!expTx.length){
    if(wrap)        wrap.style.height = '';
    if(breakdownEl) breakdownEl.innerHTML = '<div class="empty"><div class="ei">📊</div><p>No expenses this period.</p></div>';
    return;
  }

  const catTotals = {};
  expTx.forEach(t => {
    const id = t.catId || 'other';
    catTotals[id] = (catTotals[id]||0) + Number(t.amount);
  });

  const sorted = Object.entries(catTotals)
    .map(([id,amt]) => {
      const cat = LCATS.find(c => c.id===id);
      return { id, name: cat?cat.name:(id==='other'?'Other':id), icon:cat?cat.icon:'📋', color:cat?cat.color:dbToken('--muted'), amt };
    })
    .sort((a,b) => b.amt - a.amt);

  const total  = sorted.reduce((s,r) => s+r.amt, 0);
  const topN   = Math.min(sorted.length, 14);   // show up to 14 categories
  const top    = sorted.slice(0, topN);

  // Dynamic height: 44px per bar + axes padding — grows with data
  const chartH = Math.max(220, topN * 44 + 48);
  if(wrap) wrap.style.height = chartH + 'px';

  if(canvas){
    dbCatChart = safeChart(canvas, {
      type: 'bar',
      data: {
        labels: top.map(r => r.icon + ' ' + r.name),
        datasets:[{
          label: 'Spent',
          data:  top.map(r => r.amt),
          backgroundColor: top.map(r => r.color + 'cc'),
          borderColor:     top.map(r => r.color),
          borderWidth: 1.5, borderRadius: 6
        }]
      },
      options:{
        indexAxis:'y', responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{label:c=>' '+fmt(c.parsed.x)+' ('+((c.parsed.x/total)*100).toFixed(1)+'%)'}}
        },
        scales:{
          x:{grid:{color:dbToken('--card3')},ticks:{font:{family:'Inter',size:10},color:dbToken('--muted'),callback:v=>'$'+Math.round(v).toLocaleString()}},
          y:{grid:{display:false},ticks:{font:{family:'Inter',size:11},color:dbToken('--muted')}}
        }
      }
    });
  }

  if(breakdownEl){
    const barMax = sorted[0]?sorted[0].amt:1;
    breakdownEl.innerHTML = '<div style="font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:10px">Full Breakdown — '+fmt(total)+' total</div>'
      + sorted.map(r => {
          const pct  = (r.amt/total*100).toFixed(1);
          const barW = Math.round(r.amt/barMax*100);
          return '<div style="padding:7px 0;border-bottom:1px solid var(--border)">'
            +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
            +'<span style="width:22px;text-align:center">'+(r.icon||'📋')+'</span>'
            +'<span style="flex:1;font-size:.82rem;font-weight:600">'+r.name+'</span>'
            +'<span style="font-size:.78rem;color:var(--muted)">'+pct+'%</span>'
            +'<span style="font-weight:700;font-size:.86rem;color:'+r.color+'">'+fmt(r.amt)+'</span>'
            +'</div>'
            +'<div style="height:4px;background:var(--card3);border-radius:99px;overflow:hidden;margin-left:30px">'
            +'<div style="height:100%;width:'+barW+'%;background:'+r.color+';border-radius:99px;transition:width .4s ease"></div>'
            +'</div></div>';
        }).join('');
  }
}

let dbSubcatChart = null;

function dbRenderSubcatChart() {
  const canvas    = document.getElementById('db-subcat-chart');
  const wrap      = document.getElementById('db-subcat-chart-wrap');
  const breakdown = document.getElementById('db-subcat-breakdown');
  const periodLbl = document.getElementById('db-subcat-period-lbl');
  const catFilter = document.getElementById('db-subcat-filter-cat');

  if (dbSubcatChart) { dbSubcatChart.destroy(); dbSubcatChart = null; }

  // Populate category filter
  if (catFilter) {
    const cur = catFilter.value;
    catFilter.innerHTML = '<option value="">All Categories</option>'
      + LCATS.filter(c => c.type === 'expense' || c.type === 'both')
             .filter(c => c.id !== 'transfers' && c.id !== 'other')
             .map(c => '<option value="' + c.id + '"' + (c.id === cur ? ' selected' : '') + '>'
                       + c.icon + ' ' + c.name + '</option>')
             .join('');
  }

  const pfx         = dbPeriodStr();
  const filterCatId = catFilter ? catFilter.value : '';
  if (periodLbl) periodLbl.textContent = dbPeriodLabel();

  const expTx = activeTX().filter(t =>
    t.type === 'expense' && t.date.startsWith(pfx) &&
    t.catId !== 'transfers' && (t.category||'').toLowerCase() !== 'transfers' &&
    t.subcat && t.subcat.trim() !== '' &&
    (!filterCatId || t.catId === filterCatId)
  );

  if (!expTx.length) {
    if (wrap)       wrap.style.height = '';
    if (breakdown)  breakdown.innerHTML = '<div class="empty"><div class="ei">🔎</div><p>No subcategorised expenses this period.'
      + (filterCatId ? '' : ' Assign subcategories in the Transactions tab.') + '</p></div>';
    return;
  }

  // Group — when filtering by a single category show subcat only; otherwise "Category › Subcat"
  const totals = {};
  expTx.forEach(t => {
    const cat     = LCATS.find(c => c.id === (t.catId || 'other'));
    const catName = cat ? cat.name : (t.category || 'Other');
    const key = filterCatId ? t.subcat : catName + ' › ' + t.subcat;
    totals[key] = (totals[key] || 0) + Number(t.amount);
  });

  // Derive bar colours from the parent category where possible
  const sorted = Object.entries(totals)
    .map(([label, amt]) => {
      // Try to match a category colour from the label prefix
      let color = dbToken('--muted');
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

  // Vary lightness when many items share the same base colour
  const colorCount = {};
  sorted.forEach(r => { colorCount[r.color] = (colorCount[r.color]||0) + 1; });
  const colorIdx   = {};
  sorted.forEach(r => {
    colorIdx[r.color] = (colorIdx[r.color]||0);
    const siblings = colorCount[r.color];
    if (siblings > 1) {
      // Slightly shift opacity/brightness per sibling so bars are distinguishable
      const shift = colorIdx[r.color] / siblings;
      r.displayColor = r.color + Math.round(204 - shift * 80).toString(16).padStart(2,'0');
    } else {
      r.displayColor = r.color + 'cc';
    }
    colorIdx[r.color]++;
  });

  const total  = sorted.reduce((s, r) => s + r.amt, 0);
  const topN   = Math.min(sorted.length, 16);
  const top    = sorted.slice(0, topN);

  // Dynamic height: 40px per bar
  const chartH = Math.max(220, topN * 40 + 48);
  if (wrap) wrap.style.height = chartH + 'px';

  if (canvas) {
    dbSubcatChart = safeChart(canvas, {
      type: 'bar',
      data: {
        labels: top.map(r => r.label),
        datasets: [{
          label: 'Spent',
          data:  top.map(r => r.amt),
          backgroundColor: top.map(r => r.displayColor),
          borderColor:     top.map(r => r.color),
          borderWidth: 1.5, borderRadius: 5
        }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => ' ' + fmt(c.parsed.x) + ' (' + ((c.parsed.x/total)*100).toFixed(1) + '%)' } }
        },
        scales: {
          x: { grid:{color:dbToken('--card3')}, ticks:{font:{family:'Inter',size:10},color:dbToken('--muted'),callback:v=>'$'+Math.round(v).toLocaleString()} },
          y: { grid:{display:false},  ticks:{font:{family:'Inter',size:10},color:dbToken('--muted')} }
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


function dbRenderUpcomingBills(){
  const el=document.getElementById('db-upcoming-bills');
  const ratel=document.getElementById('db-bills-rate');
  if(!el)return;
  const todayNum=new Date().getDate();
  const upcoming=BILLS.filter(b=>!b.paid&&b.due-todayNum>=0&&b.due-todayNum<=14).sort((a,b)=>a.due-b.due);
  const paid=BILLS.filter(b=>b.paid).length;
  if(ratel)ratel.textContent=BILLS.length?paid+' of '+BILLS.length+' bills paid this month':'';
  if(!upcoming.length){el.innerHTML='<div class="empty" style="padding:16px 0"><div class="ei">✅</div><p>No bills due in the next 14 days.</p></div>';return;}
  el.innerHTML=upcoming.map(b=>{
    const daysUntil=b.due-todayNum;
    const pillClass=daysUntil===0?'days-today':daysUntil<=3?'days-soon':'days-ok';
    const daysLbl=daysUntil===0?'Today!':daysUntil===1?'Tomorrow':'In '+daysUntil+'d';
    return '<div class="upcoming-bill-row">'
      +'<div style="font-size:1.2rem">'+b.icon+'</div>'
      +'<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:.86rem">'+b.name+'</div>'
      +'<div style="font-size:.72rem;color:var(--muted)">Due '+b.due+ord(b.due)+'</div></div>'
      +'<span class="bill-days-pill '+pillClass+'">'+daysLbl+'</span>'
      +'<div style="font-family:\'Sora\',system-ui,sans-serif;font-weight:700;font-size:1rem;flex-shrink:0">'+fmt(b.amount)+'</div>'
      +'</div>';
  }).join('');
}

function dbRenderGoals(){
  const el=document.getElementById('db-goals');if(!el)return;
  if(!GOALS.length){
    el.innerHTML='<div class="empty" style="padding:12px 0"><div class="ei">🎯</div><p>No goals yet — <a href="#" onclick="go(\'goals\');return false;" style="color:var(--primary)">add your first goal →</a></p></div>';
    return;
  }
  const shown=GOALS.slice(0,3);
  el.innerHTML=shown.map(g=>{
    const current=(typeof _goalCurrent==='function')?_goalCurrent(g):(Number(g.currentAmount)||Number(g.saved)||0);
    const target=(typeof _goalTarget==='function')?_goalTarget(g):(Number(g.targetAmount)||Number(g.target)||0);
    const p=target>0?Math.min((current/target)*100,100):0;
    const cls=p>=100?'over':p>=75?'warn':'';
    return '<div class="prog-wrap">'
      +'<div class="prog-hd"><span class="prog-lbl">'+(g.icon||'🎯')+' '+(p>=100?'✅ ':'')+g.name+'</span>'
      +'<span class="prog-val" style="font-family:var(--font-mono)">'+fmt(current)+' / '+fmt(target)+'</span></div>'
      +'<div class="prog-track"><div class="prog-fill '+cls+'" style="width:'+p.toFixed(0)+'%"></div></div>'
      +'<div style="font-size:.7rem;color:var(--muted);margin-top:3px">'+p.toFixed(0)+'% · '+(p>=100?'Goal reached!':fmt(Math.max(0,target-current))+' to go')+'</div>'
      +'</div>';
  }).join('')
  +(GOALS.length>3?'<div style="font-size:.75rem;color:var(--muted);margin-top:8px">+' +(GOALS.length-3)+' more — <a href="#" onclick="go(\'goals\');return false;" style="color:var(--primary)">view all →</a></div>':'');
}

function dbRenderInsurance(){
  const el=document.getElementById('db-insurance');if(!el)return;
  if(!INS.length){el.innerHTML='<div class="ins-flag ins-flag-warn">No insurance policies entered — add them in the Insurance tab.</div>';return;}
  const flags=[];
  const td=new Date();
  INS.forEach(p=>{
    if(!p.renewal)return;
    const days=Math.ceil((new Date(p.renewal)-td)/86400000);
    if(days>=0&&days<=60)flags.push('Renewal in '+days+'d: '+p.name);
    if(days<0)flags.push('Overdue renewal: '+p.name);
  });
  ['brenton','shelley'].forEach(person=>{
    ['Life','TPD','Income Protection'].forEach(type=>{
      if(!INS.find(p=>p.type===type&&(p.covered===person||p.covered==='joint')))
        flags.push('No '+type+' cover for '+(getUserName(person)));
    });
  });
  el.innerHTML=flags.length
    ?flags.map(f=>'<div class="ins-flag ins-flag-warn">⚠️ '+f+'</div>').join('')
    :'<div class="ins-flag ins-flag-ok">✅ All '+INS.length+' polic'+(INS.length===1?'y':'ies')+' up to date — no gaps detected.</div>';
}

function ord(n){return n+(n===1?'st':n===2?'nd':n===3?'rd':'th');}

// ── Shared helpers — exported for Snapshot page ─────────────────
function getNetWorthSnapshot() {
  var months = ctAllMonths();
  var lm    = months.length ? months[months.length - 1] : null;
  var prevM = months.length >= 2 ? months[months.length - 2] : null;
  var bank  = lm ? ['offset','home','sav1','sav2'].reduce(function(s,a){
    return s + ((CT[a] || {})[lm] || 0);
  }, 0) : 0;
  var supB = SUPER.b ? (SUPER.b.balance || 0) : 0;
  var supS = SUPER.s ? (SUPER.s.balance || 0) : 0;
  var equity = Math.max(0, (MORTGAGE.homeValue || 0) - (MORTGAGE.balance || 0));
  var taxOwing = (typeof taxTotalOwing === 'function') ? taxTotalOwing() : 0;
  var eqV = (typeof eqTotalEquitiesValue === 'function') ? eqTotalEquitiesValue() : 0;
  var netWorth = bank + supB + supS + equity + eqV - taxOwing;
  var assets = bank + supB + supS + (MORTGAGE.homeValue || 0) + eqV;
  var liabilities = MORTGAGE.balance || 0;
  var bankPrev = prevM ? ['offset','home','sav1','sav2'].reduce(function(s,a){
    return s + ((CT[a] || {})[prevM] || 0);
  }, 0) : null;
  var lastMonthNW = bankPrev !== null ? (bankPrev + supB + supS + equity + eqV - taxOwing) : null;
  return { netWorth: netWorth, assets: assets, liabilities: liabilities, lastMonthNetWorth: lastMonthNW };
}

function getMonthSummary(year, month) {
  var pfx = year + '-' + String(month).padStart(2, '0');
  var txns = activeTX().filter(function(t) { return t.date && t.date.startsWith(pfx); });
  var income = txns.filter(function(t) {
    return t.type === 'income';
  }).reduce(function(s, t) { return s + Number(t.amount); }, 0);
  var expenses = txns.filter(function(t) {
    return t.type === 'expense'
      && t.catId !== 'transfers'
      && (t.category || '').toLowerCase() !== 'transfers';
  }).reduce(function(s, t) { return s + Number(t.amount); }, 0);
  var surplus = income - expenses;
  var budgetIds = Object.keys(LBUDGETS || {});
  var budgetTotal = 0;
  for (var bi = 0; bi < budgetIds.length; bi++) {
    budgetTotal += Number(LBUDGETS[budgetIds[bi]] || 0);
  }
  var budgetVariance = budgetTotal - expenses; // positive = under budget
  return { income: income, expenses: expenses, surplus: surplus, budgetTotal: budgetTotal, budgetVariance: budgetVariance };
}
