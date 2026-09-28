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
// Units still held: shares/ETF/crypto bought minus sold; RSUs/options vested minus sold
function eqHeldUnits(h) {
    var t = h.type || 'stock';
    if (t === 'bond') return 0;
    var sold = (h.sales||[]).reduce(function(a,x){return a+(parseFloat(x.qty)||0);},0);
    var base = (t === 'rsu' || t === 'option') ? eqVestCalc(h).vested : (parseFloat(h.qty)||0);
    return Math.max(0, base - sold);
}

// What one unit is worth at a share price — an option only the part above its strike
function eqUnitValue(h, price) {
    return h.type === 'option' ? Math.max(0, price - (parseFloat(h.strikePrice)||0)) : price;
}

function eqHoldingValueAt(h, price) {
    if ((h.type || 'stock') === 'bond') return parseFloat(h.currentValue) || 0;
    return eqHeldUnits(h) * eqUnitValue(h, price);
}

function eqHoldingValue(h) { return eqHoldingValueAt(h, parseFloat(h.currentPrice)||0); }

// Cost base of the units still held. An RSU costs its market price at vest (the vest price
// entered on the grant); options are granted at no cost.
function eqHoldingCost(h) {
    var t = h.type || 'stock';
    if (t === 'bond') return parseFloat(h.purchasePrice) || 0;
    if (t === 'option') return 0;
    return eqHeldUnits(h) * (parseFloat(t === 'rsu' ? h.grantPrice : h.cost) || 0);
}

// An RSU without a vest price has no known cost, so it adds nothing rather than counting its
// whole value as profit
function eqHoldingGain(h) {
    if (h.type === 'rsu' && !(parseFloat(h.grantPrice) > 0)) return 0;
    return eqHoldingValue(h) - eqHoldingCost(h);
}

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


// ══════════════════════════════════════════════════════════════
// SECURITIES — holdings with the same code share one price
// Prices are entered by hand (no live feed, so nothing leaves the device). The price
// stays on each holding so every other reader keeps working, but it only changes through
// eqSetPrice(), which updates every holding with that code at once.
// ══════════════════════════════════════════════════════════════
var EQ_STALE_DAYS = 30;
var EQ_LISTED = ['ASX', 'NYSE', 'NASDAQ', 'Crypto'];
var EQ_US_LISTED = ['NYSE', 'NASDAQ'];
var EQ_FX_KEY = 'cff_eq_fx';   // { usdAud: A$ per US$1, updated } — the rate last used on the price sheet

// Group key: the code upper-cased with an ASX ".AX" suffix dropped, else the company name.
// Bonds carry their own value and are never grouped.
function eqSecKey(h) {
    if (!h || h.type === 'bond') return '';
    var code = String(h.ticker || '').trim().toUpperCase().replace(/\.AX$/, '');
    if (code) return code;
    var name = String(h.company || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return name ? 'name:' + name : '';
}

// One entry per security: its holdings, the latest price and when it was set, units held.
// price is always A$; quote is the US$ price and rate it came from, when it was entered in US$.
function eqSecurities() {
    var map = {}, list = [];
    EQUITIES.forEach(function(h) {
        var key = eqSecKey(h);
        if (!key) return;
        var s = map[key];
        if (!s) {
            s = map[key] = { key:key, code: key.indexOf('name:') === 0 ? '' : key, name:'', holdings:[],
                             price:0, updated:0, quote:null, prices:{}, exchanges:{}, ccy:'', usListed:false,
                             units:0, options:0, value:0, active:false };
            list.push(s);
        }
        s.holdings.push(h);
        if (!s.name && h.company) s.name = h.company;
        var px = parseFloat(h.currentPrice) || 0, ts = h.priceUpdated || 0;
        if (px > 0) {
            s.prices[px] = true;
            if (!s.price || ts > s.updated) {
                s.price = px; s.updated = ts;
                s.quote = h.quotePrice > 0 && h.fxRate > 0 ? { price:h.quotePrice, rate:h.fxRate } : null;
            }
        }
        if (EQ_LISTED.indexOf(h.exchange) !== -1) s.exchanges[h.exchange] = true;
        if (EQ_US_LISTED.indexOf(h.exchange) !== -1) s.usListed = true;
        if (!s.ccy && h.priceCcy) s.ccy = h.priceCcy;
        var held = eqHeldUnits(h);
        if (h.type === 'option') s.options += held; else s.units += held;
        s.value += eqHoldingValue(h);
        if (held > 0 || ((h.type === 'rsu' || h.type === 'option') && eqVestCalc(h).unvested > 0)) s.active = true;
    });
    list.forEach(function(s) {
        s.mixedPrices  = Object.keys(s.prices).length > 1;
        s.exchangeList = Object.keys(s.exchanges);
        if (!s.ccy) s.ccy = s.usListed ? 'USD' : 'AUD';   // US-listed codes are priced in US$ unless switched
    });
    return list;
}

function eqSecLabel(s) { return s.code || s.name || '—'; }

// The one place a security's price changes: every holding with that code gets it. price is A$;
// quote is the US$ price and rate it was converted from — without one, an old US$ quote is dropped.
function eqSetPrice(key, price, when, quote) {
    var n = 0;
    EQUITIES.forEach(function(h) {
        if (!key || eqSecKey(h) !== key) return;
        h.currentPrice = price;
        h.priceUpdated = when || Date.now();
        if (quote) { h.quotePrice = quote.price; h.fxRate = quote.rate; }
        else { delete h.quotePrice; delete h.fxRate; }
        n++;
    });
    return n;
}

// Which currency a code's price is entered in on the price sheet ('AUD' or 'USD')
function eqSetCcy(key, ccy) {
    EQUITIES.forEach(function(h) {
        if (!key || eqSecKey(h) !== key) return;
        h.priceCcy = ccy;
        if (ccy !== 'USD') { delete h.quotePrice; delete h.fxRate; }
    });
}

// A$ per US$1, as last saved on the price sheet
function eqFxRate() {
    var fx = load(EQ_FX_KEY);
    return fx && fx.usdAud > 0 ? fx : null;
}

function eqToAud(price, ccy, rate) {
    return ccy === 'USD' ? Math.round(price * rate * 10000) / 10000 : price;
}

// Lines like "CBA 112.40", "VGS.AX, $98.12", "TEAM US$255.10", "TEAM 255.10 USD" or two
// spreadsheet columns. ccy is 'USD'/'AUD' when the line says which, else null.
function eqParsePriceLines(text) {
    var found = [], unread = 0;
    String(text || '').split(/\r?\n/).forEach(function(line) {
        line = line.trim();
        if (!line) return;
        var m = line.match(/^([A-Za-z0-9][A-Za-z0-9.\-]*)[\s,;:|=–-]+(US\$|USD|A\$|AUD|\$)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)(?:\s*(USD|AUD))?/i);
        var price = m ? parseFloat(m[3].replace(/,/g, '')) : 0;
        if (!(price > 0)) { unread++; return; }
        var mark = (m[2] || m[4] || '').toUpperCase(), code = m[1].toUpperCase();
        found.push({ code:code, key:code.replace(/\.AX$/, ''), price:price,
                     ccy: mark.indexOf('US') === 0 ? 'USD' : mark.indexOf('A') === 0 ? 'AUD' : null });
    });
    return { found:found, unread:unread };
}

function eqPriceAge(ts) {
    if (!ts) return { label:'date unknown', stale:true };
    var days = Math.floor((Date.now() - ts) / 86400000);
    var label = days <= 0 ? 'today' : days === 1 ? 'yesterday'
              : days < 60 ? days + ' days ago' : Math.round(days / 30) + ' months ago';
    return { label:label, stale: days > EQ_STALE_DAYS };
}

// Securities still held (or vesting) whose price is missing or older than EQ_STALE_DAYS
function eqStaleSecurities() {
    return eqSecurities().filter(function(s) { return s.active && (!s.price || eqPriceAge(s.updated).stale); });
}

// Share prices can run to fractions of a cent below $2
function eqFmtPrice(p) {
    return '$' + Number(p || 0).toLocaleString('en-AU', { minimumFractionDigits:2, maximumFractionDigits: p < 2 ? 4 : 2 });
}

// Company name without punctuation or suffixes like "Ltd", for spotting the same stock
function eqNameCore(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
        .replace(/\b(the|ltd|limited|inc|corp|corporation|plc|pty|co|company|group|holdings)\b/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

// Holdings entered without a code whose name matches a security that has one — probably the
// same stock, so the price sheet offers to link them
function eqLinkSuggestions(secs) {
    var out = [];
    secs.forEach(function(s) {
        if (s.code) return;
        var core = eqNameCore(s.name);
        if (!core) return;
        var match = secs.find(function(o) {
            return o.code && o.holdings.some(function(h) {
                var n = eqNameCore(h.company);
                return n && (n === core || n.indexOf(core + ' ') === 0 || core.indexOf(n + ' ') === 0);
            });
        });
        if (match) out.push({ from:s, to:match });
    });
    return out;
}

// ══════════════════════════════════════════════════════════════
// PARCELS & TRADES — every buy is its own parcel; a sale is matched to parcels
// A share, ETF or crypto holding is one parcel with its own date and cost. An RSU grant gives one
// parcel per vest, costed at the grant's vest price. A sale writes one entry per parcel it draws
// on, all sharing a tradeId, so it shows and deletes as a single trade.
// ══════════════════════════════════════════════════════════════
var EQ_OWNERS = ['brenton', 'shelley', 'joint'];

// YYYY-MM-DD in local time (today() in app.js gives the UTC date, a day behind on AU mornings)
function eqIsoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// What each unit sold is measured against: shares at their cost (price plus brokerage), RSUs at
// the vest price, options at the strike paid to exercise them
function eqCostPerUnit(h) {
    var t = h.type || 'stock';
    if (t === 'rsu') return parseFloat(h.grantPrice) || 0;
    if (t === 'option') return parseFloat(h.strikePrice) || 0;
    return parseFloat(h.cost) || 0;
}

// Cost base per unit of a purchase: the price paid plus its share of the brokerage
function eqBuyCost(price, qty, brokerage) {
    return qty > 0 ? price + (brokerage || 0) / qty : price;
}

// Owned for at least 12 months before the sale, not counting the day bought or the day sold —
// so the sale has to fall after the first anniversary
function eqHeld12Months(acquired, saleDate) {
    if (!acquired || !saleDate) return false;
    var a = new Date(acquired + 'T00:00:00');
    return saleDate > eqIsoDate(new Date(a.getFullYear() + 1, a.getMonth(), a.getDate()));
}

// The Australian financial year (1 July – 30 June) a date falls in
function eqFinancialYear(dateStr) {
    var d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    var y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
    return { start: y + '-07-01', end: (y + 1) + '-06-30', label: y + '–' + String(y + 1).slice(2) };
}

// The parcels one owner could sell of a security on a date, oldest first. Shares, ETFs and crypto
// are one parcel per holding; each RSU vest is a parcel. A sale that recorded which vest it came
// from comes off that vest; older sales come off the earliest vests. Options aren't sold this way,
// and nothing acquired after the sale date counts.
function eqSellableLots(holdings, owner, saleDate) {
    var lots = [];
    holdings.forEach(function(h) {
        if ((h.owner || 'brenton') !== owner) return;
        var t = h.type || 'stock';
        if (t === 'stock' || t === 'etf' || t === 'crypto') {
            var held = eqHeldUnits(h);
            if (held > 0 && (!h.purchaseDate || !saleDate || h.purchaseDate <= saleDate))
                lots.push({ h:h, acquired:h.purchaseDate || '', available:held, costPerUnit:eqCostPerUnit(h) });
        } else if (t === 'rsu') {
            var vests = eqVestCalc(h).schedule.filter(function(s){ return s.isPast; })
                .map(function(s){ return { date:eqIsoDate(s.date), left:s.units }; });
            var loose = 0;
            (h.sales||[]).forEach(function(x) {
                var qty = parseFloat(x.qty) || 0, vest = x.acquired && vests.find(function(v){ return v.date === x.acquired; });
                if (vest) { var off = Math.min(qty, vest.left); vest.left -= off; loose += qty - off; }
                else loose += qty;
            });
            vests.forEach(function(v) {
                var off = Math.min(loose, v.left);
                v.left -= off; loose -= off;
                if (v.left > 0 && (!saleDate || v.date <= saleDate))
                    lots.push({ h:h, acquired:v.date, available:v.left, costPerUnit:eqCostPerUnit(h), vest:true });
            });
        }
    });
    return lots.sort(function(a, b){ return a.acquired.localeCompare(b.acquired) || a.h.id - b.h.id; });
}

// Take qty from the oldest parcels first; null when they don't hold that many
function eqAllocateFifo(lots, qty) {
    var parts = [], left = qty;
    for (var i = 0; i < lots.length && left > 1e-9; i++) {
        var units = Math.min(lots[i].available, left);
        parts.push({ lot:lots[i], units:units });
        left -= units;
    }
    return left > 1e-9 ? null : parts;
}

// What a sale comes to: for each parcel, proceeds after its share of the brokerage, cost base and
// gain; in total, and split by whether the parcel was held 12 months (for the CGT discount)
function eqSaleSummary(parts, price, brokerage, saleDate) {
    var qty = parts.reduce(function(t, p){ return t + p.units; }, 0);
    var s = { qty:qty, proceeds:0, costBase:0, gain:0, gainHeld12:0, gainUnder12:0, parts:[] };
    parts.forEach(function(p) {
        var costs    = qty ? (brokerage || 0) * p.units / qty : 0;
        var proceeds = p.units * price - costs, costBase = p.units * p.lot.costPerUnit, gain = proceeds - costBase;
        var held12   = eqHeld12Months(p.lot.acquired, saleDate);
        s.proceeds += proceeds; s.costBase += costBase; s.gain += gain;
        if (held12) s.gainHeld12 += gain; else s.gainUnder12 += gain;
        s.parts.push({ lot:p.lot, units:p.units, costs:costs, proceeds:proceeds, costBase:costBase, gain:gain, held12:held12 });
    });
    return s;
}

// Write a sale onto the parcels it draws on. quote keeps the US$ price and rate when sold in US$.
function eqRecordSale(summary, price, saleDate, quote) {
    var tradeId = Date.now();
    summary.parts.forEach(function(p, i) {
        var sale = { id:tradeId + i, tradeId:tradeId, qty:p.units, price:price, date:saleDate, costs:p.costs, acquired:p.lot.acquired };
        if (quote) { sale.quotePrice = quote.price; sale.fxRate = quote.rate; }
        if (!p.lot.h.sales) p.lot.h.sales = [];
        p.lot.h.sales.push(sale);
    });
    return tradeId;
}

function eqTradeKey(h, sale) { return sale.tradeId ? 't' + sale.tradeId : 's' + h.id + '-' + sale.id; }

// The sales on a set of holdings as trades, newest first: entries sharing a tradeId become one
// trade (older single entries stand alone), with gains against each holding's cost per unit
function eqTrades(holdings) {
    var map = {}, list = [];
    holdings.forEach(function(h) {
        (h.sales || []).forEach(function(sale) {
            var key = eqTradeKey(h, sale), tr = map[key];
            if (!tr) {
                tr = map[key] = { key:key, date:sale.date || '', qty:0, price:parseFloat(sale.price) || 0, quotePrice:sale.quotePrice,
                                  proceeds:0, costBase:0, gain:0, gainHeld12:0 };
                list.push(tr);
            }
            var qty = parseFloat(sale.qty) || 0;
            var proceeds = qty * (parseFloat(sale.price) || 0) - (parseFloat(sale.costs) || 0), gain = proceeds - qty * eqCostPerUnit(h);
            var acquired = sale.acquired || ((h.type === 'rsu' || h.type === 'option') ? '' : h.purchaseDate);
            tr.qty += qty; tr.proceeds += proceeds; tr.costBase += proceeds - gain; tr.gain += gain;
            if (eqHeld12Months(acquired, sale.date)) tr.gainHeld12 += gain;
        });
    });
    return list.sort(function(a, b){ return b.date.localeCompare(a.date); });
}

// Gain on everything sold during a financial year
function eqRealisedGain(fy) {
    return eqTrades(EQUITIES).reduce(function(t, tr) {
        return tr.date >= fy.start && tr.date <= fy.end ? t + tr.gain : t;
    }, 0);
}

// Save holdings, record this month's portfolio value for net worth, and redraw
function eqCommit() {
    try { save(K.equities, EQUITIES); } catch(e) {}
    try{if(typeof nwRecordEqMonth==="function")nwRecordEqMonth(_nwCurrentMonth(),eqTotalEquitiesValue());}catch(e){}
    try{if(typeof recordNetWorthSnapshot==="function")recordNetWorthSnapshot();}catch(e){}
    renderEquitiesPage();
    if (typeof renderAssets==='function') renderAssets();
}

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
// Units and value across RSU and option grants; vested value counts only units still held
function eqVestTotals(holdings) {
    var t = { totalUnits:0, vestedUnits:0, unvestedUnits:0, vestedValue:0, unvestedValue:0 };
    holdings.forEach(function(h) {
        var v    = eqVestCalc(h);
        var unit = eqUnitValue(h, parseFloat(h.currentPrice) || 0);
        t.totalUnits    += parseFloat(h.totalUnits) || 0;
        t.vestedUnits   += v.vested;
        t.unvestedUnits += v.unvested;
        t.vestedValue   += eqHeldUnits(h) * unit;
        t.unvestedValue += v.unvested * unit;
    });
    return t;
}

function renderEqVestSummary() {
    var el = document.getElementById('eq-vest-summary');
    if (!el) return;
    var vestHoldings = EQUITIES.filter(function(h){ return h.type==='rsu'||h.type==='option'; });
    if (!vestHoldings.length) { el.innerHTML=''; el.style.display='none'; return; }
    el.style.display = '';

    var vt = eqVestTotals(vestHoldings);
    var totalUnits = vt.totalUnits, vestedUnits = vt.vestedUnits, unvestedUnits = vt.unvestedUnits;
    var vestedValue = vt.vestedValue, unvestedValue = vt.unvestedValue;

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
// year → { vestedUnits, vestedValue, unvestedUnits, unvestedValue } from each grant's schedule
function eqVestByYear(holdings) {
    var yearMap = {};
    holdings.forEach(function(h) {
        var unit = eqUnitValue(h, parseFloat(h.currentPrice) || 0);
        eqVestCalc(h).schedule.forEach(function(s) {
            var yr = s.date.getFullYear();
            if (!yearMap[yr]) yearMap[yr] = { vestedUnits:0, vestedValue:0, unvestedUnits:0, unvestedValue:0 };
            if (s.isPast) {
                yearMap[yr].vestedUnits  += s.units;
                yearMap[yr].vestedValue  += s.units * unit;
            } else {
                yearMap[yr].unvestedUnits += s.units;
                yearMap[yr].unvestedValue += s.units * unit;
            }
        });
    });
    return yearMap;
}

function renderEqVestByYear() {
    var el = document.getElementById('eq-vest-by-year');
    if (!el) return;
    var vestHoldings = EQUITIES.filter(function(h){ return h.type==='rsu'||h.type==='option'; });
    if (!vestHoldings.length) { el.style.display='none'; return; }
    el.style.display = '';

    var yearMap = eqVestByYear(vestHoldings);

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
    // Realised gain this financial year, once anything has been sold in it
    var fy = eqFinancialYear(eqIsoDate(new Date()));
    var soldThisFy = eqTrades(EQUITIES).some(function(tr){ return tr.date >= fy.start && tr.date <= fy.end; });
    var realised = soldThisFy ? eqRealisedGain(fy) : 0;
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px">'
        + '<div>'
        + '<div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px">Total Portfolio Value</div>'
        + '<div style="font-family:var(--font-mono);font-size:2.2rem;font-weight:700;line-height:1">' + fmt(total) + '</div>'
        + '<div style="margin-top:10px;display:flex;gap:20px;flex-wrap:wrap">'
        + '<div><div style="font-size:.7rem;color:var(--muted)">Cost Basis</div><div style="font-family:var(--font-mono);font-weight:600;font-size:.9rem">' + fmt(cost) + '</div></div>'
        + '<div><div style="font-size:.7rem;color:var(--muted)">Unrealised P&amp;L</div><div style="font-family:var(--font-mono);font-weight:700;font-size:.9rem;color:' + gc + '">' + gs + fmt(Math.abs(gain)) + ' (' + gs + gainPct + '%)</div></div>'
        + (soldThisFy
            ? '<div><div style="font-size:.7rem;color:var(--muted)">Realised FY ' + fy.label + '</div><div style="font-family:var(--font-mono);font-weight:700;font-size:.9rem;color:'
              + (realised >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + (realised >= 0 ? '+' : '−') + fmt(Math.abs(realised)) + '</div></div>'
            : '')
        + '</div></div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">'
        + '<button class="btn btn-ghost btn-sm" onclick="openBatchPriceModal()">'+ICON('currency-dollar')+' Update Prices</button>'
        + '<button class="btn btn-primary btn-sm" onclick="openEqModal(null)">+ Add Holding</button>'
        + '</div></div>';
    var stale = eqStaleSecurities().length;
    if (stale) {
        el.innerHTML += '<div class="eq-stale-note">' + ICON('alert-triangle') + ' '
            + (stale === 1 ? '1 price hasn’t' : stale + ' prices haven’t') + ' been updated in over ' + EQ_STALE_DAYS + ' days</div>';
    }
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
                var px2   = eqUnitValue(h, parseFloat(h.currentPrice)||0);
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
var eqList = [];        // securities in the holdings list — row buttons refer to them by index
var eqOpenSecs = {};    // keys of the securities left open, so a redraw keeps them open

function eqFmtUnits(n) { return Number(n || 0).toLocaleString('en-AU', { maximumFractionDigits:4 }); }

function eqFmtDate(iso) {
    return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' }) : 'date unknown';
}

function renderEquitiesList() {
    var el = document.getElementById('eq-holdings-list');
    if (!el) return;

    if (!EQUITIES.length) {
        el.innerHTML = '<div class="empty"><div class="ei">'+ICON('trending-up')+'</div><p>No holdings yet. Click <strong>+ Add Holding</strong> to get started.</p></div>';
        return;
    }

    eqList = eqSecurities().sort(function(a, b){ return b.value - a.value; });
    var bonds = EQUITIES.filter(function(h){ return h.type === 'bond'; });
    el.innerHTML = eqList.map(renderEqSecurityRow).join('')
        + (bonds.length ? '<div class="eq-group-label">' + iconTag(eqTypeCfg('bond').icon) + ' Bonds</div>' + bonds.map(renderEqHoldingRow).join('') : '');
}

// One row per security. Open it for Buy / Sell, its holdings (sold-out ones folded away) and its sales.
function renderEqSecurityRow(s, i) {
    var types = {}, cost = 0, gain = 0, active = [], sold = [];
    s.holdings.forEach(function(h) {
        types[h.type || 'stock'] = true;
        cost += eqHoldingCost(h); gain += eqHoldingGain(h);
        var vesting = (h.type === 'rsu' || h.type === 'option') && eqVestCalc(h).unvested > 0;
        (eqHeldUnits(h) > 0 || vesting ? active : sold).push(h);
    });
    var main = s.holdings.slice().sort(function(a, b){ return eqHoldingValue(b) - eqHoldingValue(a); })[0];
    var age = eqPriceAge(s.updated), open = !!eqOpenSecs[s.key], n = s.holdings.length;
    var price = s.price
        ? '<span class="eq-px-age' + (age.stale ? ' eq-px-age--stale' : '') + '"><span class="mono">' + eqFmtPrice(s.price) + '</span>'
          + (s.quote ? ' <span class="mono">(US' + eqFmtPrice(s.quote.price) + ')</span>' : '') + ' · ' + age.label + '</span>'
        : '<span class="eq-px-age eq-px-age--stale">No price yet</span>';
    var badges = s.exchangeList.map(function(x){ return '<span class="eq-badge eq-badge-exch">' + esc(x) + '</span>'; }).join('')
        + (Object.keys(types).length > 1 ? Object.keys(types).map(function(t){ return '<span class="eq-badge eq-badge-exch">' + eqTypeCfg(t).label + '</span>'; }).join('') : '');
    var units = (s.units ? eqFmtUnits(s.units) + ' units' : '') + (s.units && s.options ? ' · ' : '') + (s.options ? eqFmtUnits(s.options) + ' options' : '');
    var canSell = EQ_OWNERS.some(function(o){ return eqSellableLots(s.holdings, o, eqIsoDate(new Date())).length; });
    var gc = gain >= 0 ? 'var(--success)' : 'var(--danger)', gs = gain >= 0 ? '+' : '−';

    return '<div class="eq-row eq-sec">'
        + '<div class="eq-row-main" onclick="eqToggleSec(' + i + ')" aria-expanded="' + open + '">'
        + '<div class="eq-row-icon">' + iconTag(eqTypeCfg(main.type).icon) + '</div>'
        + '<div class="eq-row-info">'
        +   '<div class="eq-row-name"><span style="font-weight:700">' + esc(eqSecLabel(s)) + '</span> ' + (s.code ? esc(s.name) : '') + ' ' + badges + '</div>'
        +   '<div class="eq-row-sub">' + n + ' holding' + (n !== 1 ? 's' : '') + (units ? ' · ' + units : '') + ' &nbsp;·&nbsp; ' + price + '</div>'
        + '</div>'
        + '<div class="eq-row-values">'
        +   '<div style="font-family:var(--font-mono);font-weight:700;font-size:.95rem">' + fmt(s.value) + '</div>'
        +   (cost > 0 ? '<div style="font-family:var(--font-mono);font-size:.78rem;color:' + gc + '">' + gs + fmt(Math.abs(gain)) + ' (' + gs + Math.abs(gain / cost * 100).toFixed(1) + '%)</div>' : '')
        + '</div>'
        + '<div class="eq-sec-chev" aria-hidden="true">' + ICON(open ? 'chevron-up' : 'chevron-down') + '</div>'
        + '</div>'
        + '<div class="eq-row-detail eq-sec-body" id="eq-sec-' + i + '"' + (open ? '' : ' style="display:none"') + '>'
        +   '<div class="eq-sec-actions">'
        +     '<button class="btn btn-primary btn-sm" onclick="eqOpenBuy(' + i + ')">' + ICON('plus') + ' Buy</button>'
        +     (canSell ? '<button class="btn btn-ghost btn-sm" onclick="eqOpenSellAt(' + i + ')">' + ICON('cash') + ' Sell</button>' : '')
        +     '<button class="btn btn-ghost btn-sm" onclick="openBatchPriceModal(eqList[' + i + '].key)">' + ICON('currency-dollar') + ' Update price</button>'
        +   '</div>'
        +   active.map(renderEqHoldingRow).join('')
        +   (sold.length ? '<details class="eq-sec-sold"><summary>Sold parcels (' + sold.length + ')</summary>' + sold.map(renderEqHoldingRow).join('') + '</details>' : '')
        +   renderEqTrades(s)
        + '</div></div>';
}

function eqToggleSec(i) {
    var s = eqList[i], body = document.getElementById('eq-sec-' + i);
    if (!s || !body) return;
    var open = body.style.display === 'none';
    body.style.display = open ? '' : 'none';
    if (open) eqOpenSecs[s.key] = true; else delete eqOpenSecs[s.key];
    var head = body.previousElementSibling;
    head.setAttribute('aria-expanded', open);
    head.querySelector('.eq-sec-chev').innerHTML = ICON(open ? 'chevron-up' : 'chevron-down');
}

// A security's sales, one line per trade, newest first
function renderEqTrades(s) {
    var trades = eqTrades(s.holdings);
    if (!trades.length) return '';
    return '<div class="eq-sec-trades"><div class="eq-lbl">Sales</div>'
        + trades.map(function(tr) {
            return '<div class="eq-trade">'
                + '<span style="color:var(--muted)">' + eqFmtDate(tr.date) + '</span>'
                + '<span>Sold <span class="mono">' + eqFmtUnits(tr.qty) + '</span> @ <span class="mono">' + eqFmtPrice(tr.price) + '</span>'
                +   (tr.quotePrice ? ' <span class="mono">(US' + eqFmtPrice(tr.quotePrice) + ')</span>' : '') + '</span>'
                + '<span>Proceeds <span class="mono">' + fmt(tr.proceeds) + '</span></span>'
                + '<span class="mono ' + (tr.gain >= 0 ? 'eq-gain-pos' : 'eq-gain-neg') + '">' + (tr.gain >= 0 ? '+' : '−') + fmt(Math.abs(tr.gain)) + '</span>'
                + (tr.gainHeld12 > 0 ? '<span class="eq-badge eq-badge-12m" title="Gain from parcels held 12 months or more">12m+ <span class="mono">' + fmt(tr.gainHeld12) + '</span></span>' : '')
                + '<button class="del-btn" style="margin-left:auto" aria-label="Delete this sale" onclick="eqDeleteTrade(\'' + tr.key + '\')">' + ICON('trash') + '</button>'
                + '</div>';
        }).join('') + '</div>';
}

// Undo a sale: every entry it wrote, on every parcel
function eqDeleteTrade(key) {
    if (!confirm('Delete this sale? The units go back into your holdings.')) return;
    EQUITIES.forEach(function(h) {
        if (h.sales) h.sales = h.sales.filter(function(sale){ return eqTradeKey(h, sale) !== key; });
    });
    eqCommit();
    toast('Sale deleted');
}

// Buy more of a security: the add form filled in from it, saved as a new parcel
function eqOpenBuy(i) {
    var s = eqList[i];
    if (!s) return;
    var shareTypes = ['stock', 'etf', 'crypto'];
    var base = s.holdings.find(function(h){ return shareTypes.indexOf(h.type) !== -1; }) || s.holdings[0];
    openEqModal(null);
    function set(id, v) { var e = document.getElementById(id); if (e) e.value = v; }
    set('eq-m-type', shareTypes.indexOf(base.type) !== -1 ? base.type : 'stock');
    eqModalTypeChange();
    set('eq-m-owner', base.owner || 'brenton');
    set('eq-m-ticker', base.ticker || '');
    set('eq-m-company', base.company || '');
    if (base.exchange && base.exchange !== 'Crypto') set('eq-m-exchange', base.exchange);
    set('eq-m-purchasedate', eqIsoDate(new Date()));
    eqModalSecHint(true);
    var title = document.getElementById('eq-m-title');
    if (title) title.textContent = 'Buy ' + eqSecLabel(s);
    var qty = document.getElementById('eq-m-qty');
    if (qty) qty.focus();
}

function eqOpenSellAt(i) { if (eqList[i]) openEqSell(eqList[i].key); }

function renderEqHoldingRow(h) {
    var tc   = eqTypeCfg(h.type);
    var val  = eqHoldingValue(h), cost = eqHoldingCost(h), gain = eqHoldingGain(h);
    var gPct = cost > 0 ? ((gain/cost)*100).toFixed(1) : null;
    var gc   = gain >= 0 ? 'var(--success)' : 'var(--danger)', gs = gain >= 0 ? '+' : '';
    var isVesting = h.type==='rsu'||h.type==='option';
    var exch = h.exchange||'';
    var priceLine = '';
    if (h.type === 'bond') {
        if (h.priceUpdated) priceLine = 'Updated ' + new Date(h.priceUpdated).toLocaleDateString('en-AU',{day:'numeric',month:'short'});
    } else {
        var px = parseFloat(h.currentPrice) || 0, age = eqPriceAge(h.priceUpdated);
        priceLine = px
            ? '<span class="eq-px-age'+(age.stale?' eq-px-age--stale':'')+'"><span class="mono">'+eqFmtPrice(px)+'</span>'
              + (h.quotePrice > 0 ? ' <span class="mono">(US'+eqFmtPrice(h.quotePrice)+')</span>' : '') + ' · '+age.label+'</span>'
            : '<span class="eq-px-age eq-px-age--stale">No price yet</span>';
    }

    var badge = exch==='Private' ? '<span class="eq-badge eq-badge-private">Private</span>' : (exch ? '<span class="eq-badge eq-badge-exch">'+esc(exch)+'</span>' : '');

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
        + '<div class="eq-row-name">'+(h.ticker?'<span style="font-weight:700">'+esc(h.ticker)+'</span> ':'')+esc(h.company||'')+ ' '+badge+'</div>'
        + '<div class="eq-row-sub">'+qtyLine+(priceLine?' &nbsp;·&nbsp; '+priceLine:'')+'</div>'
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
            +(h.buyPrice !== undefined
                ? '<span class="eq-lbl">Price Paid</span><span class="eq-val">'+fmt(parseFloat(h.buyPrice)||0)+'/unit</span>'
                  +'<span class="eq-lbl">Brokerage</span><span class="eq-val">'+fmt(parseFloat(h.brokerage)||0)+'</span>'
                  +'<span class="eq-lbl">Cost Base</span><span class="eq-val">'+fmt(parseFloat(h.cost)||0)+'/unit</span>'
                : '<span class="eq-lbl">Purchase Price</span><span class="eq-val">'+fmt(parseFloat(h.cost)||0)+'/unit</span>')
            +'<span class="eq-lbl">Current Price</span><span class="eq-val">'+fmt(parseFloat(h.currentPrice)||0)+'/unit</span>'
            +'<span class="eq-lbl">Units Held</span><span class="eq-val">'+held+'</span>'
            +'<span class="eq-lbl">Total Cost</span><span class="eq-val">'+fmt(eqHoldingCost(h))+'</span>'
            +'<span class="eq-lbl">Current Value</span><span class="eq-val">'+fmt(eqHoldingValue(h))+'</span>'
            +(h.owner?'<span class="eq-lbl">Owner</span><span class="eq-val">'+esc(getUserName(h.owner))+'</span>':'')
            +(h.notes?'<span class="eq-lbl">Notes</span><span class="eq-val" style="color:var(--muted)">'+esc(h.notes)+'</span>':'')
            +'</div>';
    } else if (t==='bond') {
        var matStr = h.maturityDate ? new Date(h.maturityDate+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}) : '—';
        html += '<div class="eq-detail-grid">'
            +'<span class="eq-lbl">Issuer</span><span class="eq-val">'+esc(h.company||'—')+'</span>'
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
            +(h.owner?'<span class="eq-lbl">Owner</span><span class="eq-val">'+esc(getUserName(h.owner))+'</span>':'')
            +'</div>';

        // Vesting schedule table (expandable)
        if (vest.schedule.length) {
            var px2 = eqUnitValue(h, parseFloat(h.currentPrice)||0);
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

    // Shares, ETFs, crypto and RSUs are sold from their security's Sell button (sales show there);
    // options are exercised or sold grant by grant
    if (t === 'option') {
        html += '<div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border)">'
            +'<button class="btn btn-ghost btn-sm" onclick="openEqSale('+h.id+')">'+ICON('cash')+' Record exercise or sale</button>'
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
        +'<div class="section-label" id="eq-m-title" style="margin:0">'+title+'</div>'
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
            +'<input type="text" id="eq-m-ticker" value="'+esc(v.ticker||'')+'" placeholder="e.g. AAPL, CBA, VGS.AX" style="text-transform:uppercase" oninput="eqModalSecHint(true)"/>'
            +'</div>'
            +'<div><label class="lbl">Company / Asset Name</label>'
            +'<input type="text" id="eq-m-company" value="'+esc(v.company||'')+'" placeholder="e.g. Apple Inc." oninput="eqModalSecHint(true)"/></div>'
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
        var paid = v.buyPrice !== undefined ? v.buyPrice : v.cost;   // older holdings only have the cost base
        html += '<div class="form-grid">'
            +'<div><label class="lbl">Quantity</label><input type="number" id="eq-m-qty" value="'+(v.qty||'')+'" placeholder="0" min="0" step="any" inputmode="decimal"/></div>'
            +'<div><label class="lbl">Price Paid per Unit (AUD)</label><input type="number" id="eq-m-cost" value="'+(paid||'')+'" placeholder="0.00" min="0" step="any" inputmode="decimal"/></div>'
            +'</div>'
            +'<div class="form-grid">'
            +'<div><label class="lbl">Brokerage (AUD)</label><input type="number" id="eq-m-brokerage" value="'+(v.brokerage||'')+'" placeholder="0.00" min="0" step="any" inputmode="decimal"/><div class="eq-field-hint">Added to the cost base</div></div>'
            +'<div><label class="lbl">Purchase Date</label><input type="date" id="eq-m-purchasedate" value="'+(v.purchaseDate||'')+'"/></div>'
            +'</div>'
            +'<div class="form-grid">'
            +'<div><label class="lbl">Current Price (AUD)</label><input type="number" id="eq-m-price" value="'+(v.currentPrice||'')+'" placeholder="0.00" min="0" step="any" inputmode="decimal"/><div id="eq-m-sec-hint" class="eq-field-hint"></div></div>'
            +'</div>';
    }

    if (type==='bond') {
        html += '<div class="form-grid">'
            +'<div><label class="lbl">Issuer / Bond Name</label><input type="text" id="eq-m-company" value="'+esc(v.company||'')+'" placeholder="e.g. Commonwealth Bank"/></div>'
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
            +'<div><label class="lbl">Current Price per Unit (AUD)</label><input type="number" id="eq-m-price" value="'+(v.currentPrice||'')+'" placeholder="0.00" min="0" step="any" inputmode="decimal"/><div id="eq-m-sec-hint" class="eq-field-hint"></div></div>'
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
        +'<input type="text" id="eq-m-notes" value="'+esc(v.notes||'')+'" placeholder="e.g. broker, account, grant #"/></div>';

    el.innerHTML = html;
    eqModalSecHint(false);
}

// Under the price field: which other holdings share this code (their price moves together),
// and, when prefill is set, fill in their price if the field is still empty
function eqModalSecHint(prefill) {
    var el = document.getElementById('eq-m-sec-hint');
    if (!el) return;
    function fv(id){ var e=document.getElementById(id); return e?e.value:''; }
    var idStr = fv('eq-m-id');
    var key = eqSecKey({ type: fv('eq-m-type') || 'stock', ticker: fv('eq-m-ticker'), company: fv('eq-m-company') });
    var sec = key ? eqSecurities().find(function(s){ return s.key === key; }) : null;
    var others = sec ? sec.holdings.filter(function(h){ return String(h.id) !== idStr; }).length : 0;
    if (!others) { el.textContent = ''; return; }
    el.textContent = 'Shared with ' + others + ' other ' + eqSecLabel(sec) + ' holding' + (others !== 1 ? 's' : '')
        + ' — changing it updates them too.';
    var priceEl = document.getElementById('eq-m-price');
    if (prefill && priceEl && !priceEl.value && sec.price) priceEl.value = sec.price;
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

    var obj = { type:type, company:company, ticker:ticker, exchange:exchange, owner:owner, notes:notes };

    if (type==='stock'||type==='etf'||type==='crypto') {
        obj.qty=fnum('eq-m-qty'); obj.buyPrice=fnum('eq-m-cost'); obj.brokerage=fnum('eq-m-brokerage');
        obj.cost=eqBuyCost(obj.buyPrice, obj.qty, obj.brokerage);   // what sales are measured against
        obj.currentPrice=fnum('eq-m-price'); obj.purchaseDate=fv('eq-m-purchasedate');
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

    var existing = editId ? EQUITIES.find(function(e){ return String(e.id)===editId; }) : null;
    var oldKey = existing ? eqSecKey(existing) : '', oldUpdated = existing ? existing.priceUpdated : undefined;
    var oldPrice = existing ? (parseFloat(existing.currentPrice)||0) : 0;
    var oldValue = existing ? (parseFloat(existing.currentValue)||0) : 0;

    var rec;
    if (existing && existing.type === type) {
        rec = Object.assign(existing, obj);    // keeps fields this form doesn't show
    } else if (existing) {
        rec = obj; rec.id = existing.id; rec.sales = existing.sales || [];
        EQUITIES[EQUITIES.indexOf(existing)] = rec;
    } else {
        rec = obj; rec.id = Date.now(); rec.sales = [];
        EQUITIES.push(rec);
    }

    var now = Date.now(), shared = 0;
    if (type === 'bond') {
        rec.priceUpdated = (!existing || rec.currentValue !== oldValue) ? now : oldUpdated;
    } else {
        // Prices are shared by code. A price typed here goes to every holding with the code
        // (and moves the date); otherwise a holding joining a code takes the code's price.
        var key = eqSecKey(rec), price = rec.currentPrice;
        var peer = EQUITIES.filter(function(h){ return h !== rec && eqSecKey(h) === key && (parseFloat(h.currentPrice)||0) > 0; })
            .reduce(function(best, h){ return !best || (h.priceUpdated||0) > (best.priceUpdated||0) ? h : best; }, null);
        var edited = existing ? price !== oldPrice : price > 0 && (!peer || price !== parseFloat(peer.currentPrice));
        if (price > 0 && edited) shared = eqSetPrice(key, price, now) - 1;
        else if (peer && (!existing || key !== oldKey)) {
            rec.currentPrice = parseFloat(peer.currentPrice); rec.priceUpdated = peer.priceUpdated;
            ['priceCcy', 'quotePrice', 'fxRate'].forEach(function(f){ if (peer[f] !== undefined) rec[f] = peer[f]; else delete rec[f]; });
        }
        else if (existing) rec.priceUpdated = oldUpdated;
    }

    closeEqModal();
    eqCommit();
    toast((editId ? 'Holding updated' : 'Holding added')
        + (shared > 0 ? ' — price applied to ' + shared + ' other ' + esc(rec.ticker ? key : rec.company) + ' holding' + (shared !== 1 ? 's' : '') : ''));
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

// ── Sell ──────────────────────────────────────────────────────
// Sell units of a security for one owner. Parcels go oldest first unless "Choose parcels" is ticked.
// The summary shows proceeds, cost base and gain, and how much of the gain is from parcels held
// 12 months or more.
var eqSell = null;   // { sec, fx, lots } for the open sheet — parcel boxes refer to lots by index

function eqLotUnits(lots) { return lots.reduce(function(t, l){ return t + l.available; }, 0); }

function openEqSell(key) {
    var s = eqSecurities().find(function(x){ return x.key === key; });
    var overlay = document.getElementById('eq-sale-overlay');
    if (!s || !overlay) return;
    var today = eqIsoDate(new Date());
    // Whoever holds the most sellable units comes first
    var owners = EQ_OWNERS.filter(function(o){ return eqSellableLots(s.holdings, o, today).length; })
        .sort(function(a, b){ return eqLotUnits(eqSellableLots(s.holdings, b, today)) - eqLotUnits(eqSellableLots(s.holdings, a, today)); });
    if (!owners.length) { toast('Nothing to sell yet: no units held or vested'); return; }
    eqSell = { sec:s, fx:eqFxRate(), lots:[] };
    var usd = s.ccy === 'USD', price = usd ? (s.quote ? s.quote.price : '') : (s.price || '');
    var ownerField = owners.length > 1
        ? '<div><label class="lbl" for="eq-sell-owner">Sold by</label><select id="eq-sell-owner" onchange="eqSellLots()">'
          + owners.map(function(o){ return '<option value="' + o + '">' + esc(o === 'joint' ? 'Joint' : getUserName(o)) + '</option>'; }).join('')
          + '</select></div>'
        : '<input type="hidden" id="eq-sell-owner" value="' + owners[0] + '"/>';

    overlay.innerHTML = '<div class="eq-modal-box" onclick="event.stopPropagation()">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
        + '<div class="section-label" style="margin:0">' + ICON('cash') + ' Sell ' + esc(eqSecLabel(s))
        +   (s.code && s.name ? ' <span class="eq-px-co">' + esc(s.name) + '</span>' : '') + '</div>'
        + '<button class="btn btn-ghost btn-sm" onclick="closeEqSale()" aria-label="Close">' + ICON('x') + '</button>'
        + '</div>'
        + '<div class="form-grid">' + ownerField
        +   '<div><label class="lbl" for="eq-sell-date">Sale date</label><input type="date" id="eq-sell-date" value="' + today + '" max="' + today + '" onchange="eqSellLots()"/></div>'
        + '</div>'
        + '<div class="form-grid">'
        +   '<div><label class="lbl" for="eq-sell-qty">Units to sell</label><div class="eq-px-field">'
        +     '<input type="number" id="eq-sell-qty" class="mono" min="0" step="any" inputmode="decimal" placeholder="0" oninput="eqSellUpdate()"/>'
        +     '<button class="btn btn-ghost btn-sm" onclick="eqSellAll()">All</button></div></div>'
        +   '<div><label class="lbl" for="eq-sell-price">Sale price per unit</label><div class="eq-px-field">'
        +     '<select id="eq-sell-ccy" class="eq-px-ccy" aria-label="Currency of the price and brokerage" onchange="eqSellUpdate()">'
        +       '<option value="AUD"' + (usd ? '' : ' selected') + '>A$</option><option value="USD"' + (usd ? ' selected' : '') + '>US$</option></select>'
        +     '<input type="number" id="eq-sell-price" class="mono" min="0" step="any" inputmode="decimal" value="' + price + '" placeholder="0.00" oninput="eqSellUpdate()"/></div></div>'
        + '</div>'
        + '<div class="form-grid">'
        +   '<div><label class="lbl" for="eq-sell-costs">Brokerage</label><input type="number" id="eq-sell-costs" class="mono" min="0" step="any" inputmode="decimal" placeholder="0.00" oninput="eqSellUpdate()"/>'
        +     '<div class="eq-field-hint">In the same currency as the price</div></div>'
        +   '<div id="eq-sell-fx"' + (usd ? '' : ' hidden') + '><label class="lbl" for="eq-sell-rate">US$1 = A$ on the sale date</label>'
        +     '<input type="number" id="eq-sell-rate" class="mono" min="0" step="any" inputmode="decimal" value="' + (eqSell.fx ? eqSell.fx.usdAud : '') + '" placeholder="e.g. 1.52" oninput="eqSellUpdate()"/></div>'
        + '</div>'
        + '<div class="eq-sell-lots-head"><div class="eq-lbl">Parcels, oldest first</div>'
        +   '<label class="eq-sell-choose"><input type="checkbox" id="eq-sell-manual" onchange="eqSellLots()"/> Choose parcels</label></div>'
        + '<div id="eq-sell-lots"></div>'
        + '<div id="eq-sell-summary" class="eq-sell-summary" role="status"></div>'
        + '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">'
        + '<button class="btn btn-primary" onclick="saveEqSell()">Record sale</button>'
        + '<button class="btn btn-ghost" onclick="closeEqSale()">Cancel</button>'
        + '</div></div>';
    overlay.style.display = 'flex';
    overlay.onclick = function(e){ if (e.target === overlay) closeEqSale(); };
    eqSellLots();
    document.getElementById('eq-sell-qty').focus();
}

// Redraw the parcels for the chosen owner and date. With "Choose parcels" each gets a box,
// filled in with what oldest-first would take.
function eqSellLots() {
    if (!eqSell) return;
    var date = document.getElementById('eq-sell-date').value, manual = document.getElementById('eq-sell-manual').checked;
    var qtyEl = document.getElementById('eq-sell-qty');
    eqSell.lots = eqSellableLots(eqSell.sec.holdings, document.getElementById('eq-sell-owner').value, date);
    var fifo = eqAllocateFifo(eqSell.lots, parseFloat(qtyEl.value) || 0) || [];
    document.getElementById('eq-sell-lots').innerHTML = eqSell.lots.length
        ? eqSell.lots.map(function(l, i) {
            var take = fifo.find(function(p){ return p.lot === l; });
            return '<div class="eq-lot">'
                + '<div class="eq-lot-info"><div>' + eqFmtDate(l.acquired) + (l.vest ? ' · RSU vest' : '')
                +   (eqHeld12Months(l.acquired, date) ? ' <span class="eq-badge eq-badge-12m">12m+</span>' : '') + '</div>'
                +   '<div class="eq-px-sub"><span class="mono">' + eqFmtUnits(l.available) + '</span> units · cost <span class="mono">' + eqFmtPrice(l.costPerUnit) + '</span></div></div>'
                + (manual
                    ? '<input type="number" class="eq-lot-in mono" data-i="' + i + '" min="0" max="' + l.available + '" step="any" inputmode="decimal" placeholder="0"'
                      + ' value="' + (take ? +take.units.toFixed(8) : '') + '" aria-label="Units from the parcel of ' + eqFmtDate(l.acquired) + '" oninput="eqSellUpdate()"/>'
                    : '<div class="eq-lot-take mono" id="eq-lot-take-' + i + '"></div>')
                + '</div>';
        }).join('')
        : '<div class="eq-px-sub">No units to sell on this date.</div>';
    qtyEl.readOnly = manual;
    eqSellUpdate();
}

function eqSellAll() {
    if (!eqSell || document.getElementById('eq-sell-manual').checked) return;
    document.getElementById('eq-sell-qty').value = +eqLotUnits(eqSell.lots).toFixed(8);
    eqSellUpdate();
}

// What the sale would record, or an error to show instead (quiet ones just mean "not filled in yet")
function eqSellState() {
    function g(id) { return document.getElementById(id); }
    var date = g('eq-sell-date').value, usd = g('eq-sell-ccy').value === 'USD';
    var price = parseFloat(g('eq-sell-price').value) || 0, costs = parseFloat(g('eq-sell-costs').value) || 0;
    var rate = parseFloat(g('eq-sell-rate').value) || 0, parts, qty;
    if (g('eq-sell-manual').checked) {
        parts = [];
        var over = null;
        document.querySelectorAll('.eq-lot-in').forEach(function(inp) {
            var units = parseFloat(inp.value) || 0, lot = eqSell.lots[+inp.dataset.i];
            if (units > lot.available + 1e-9) over = lot;
            if (units > 0) parts.push({ lot:lot, units:units });
        });
        qty = parts.reduce(function(t, p){ return t + p.units; }, 0);
        g('eq-sell-qty').value = qty ? +qty.toFixed(8) : '';
        if (over) return { error:'The parcel from ' + eqFmtDate(over.acquired) + ' only has ' + eqFmtUnits(over.available) + ' units' };
    } else {
        qty = parseFloat(g('eq-sell-qty').value) || 0;
        parts = eqAllocateFifo(eqSell.lots, qty);
        if (!parts) return { error:'Only ' + eqFmtUnits(eqLotUnits(eqSell.lots)) + ' units can be sold on this date' };
    }
    if (!date) return { error:'Choose the sale date' };
    if (date > eqIsoDate(new Date())) return { error:'The sale date can’t be in the future' };
    if (!(qty > 0)) return { error:'Enter the units to sell', quiet:true, parts:parts };
    if (!(price > 0)) return { error:'Enter the sale price', quiet:true, parts:parts };
    if (usd && !(rate > 0)) return { error:'Enter the exchange rate for the sale date', parts:parts };
    var audPrice = eqToAud(price, usd ? 'USD' : 'AUD', rate), audCosts = usd ? Math.round(costs * rate * 100) / 100 : costs;
    return { date:date, qty:qty, parts:parts, usd:usd, price:price, audPrice:audPrice,
             quote: usd ? { price:price, rate:rate } : null, summary: eqSaleSummary(parts, audPrice, audCosts, date) };
}

function eqSellUpdate() {
    if (!eqSell) return;
    document.getElementById('eq-sell-fx').hidden = document.getElementById('eq-sell-ccy').value !== 'USD';
    var st = eqSellState();
    eqSell.lots.forEach(function(l, i) {   // oldest-first: what each parcel gives
        var el = document.getElementById('eq-lot-take-' + i), p = (st.parts || []).find(function(x){ return x.lot === l; });
        if (el) el.textContent = p ? 'Sell ' + eqFmtUnits(p.units) : '';
    });
    var out = document.getElementById('eq-sell-summary');
    if (st.error) { out.innerHTML = st.quiet ? '' : '<div class="eq-px-warn" style="margin:0">' + esc(st.error) + '</div>'; return; }
    var s = st.summary;
    function row(label, amount, cls) {
        return '<div class="eq-sell-row"><span>' + label + '</span><span class="mono' + (cls ? ' ' + cls : '') + '">' + amount + '</span></div>';
    }
    function signed(n) { return (n >= 0 ? '+' : '−') + fmt(Math.abs(n)); }
    out.innerHTML = (st.usd ? '<div class="eq-px-sub" style="margin:0 0 6px">US' + eqFmtPrice(st.price) + ' is ' + eqFmtPrice(st.audPrice) + ' a unit</div>' : '')
        + row('Proceeds after brokerage', fmt(s.proceeds))
        + row('Cost base', fmt(s.costBase))
        + row('<strong>' + (s.gain >= 0 ? 'Gain' : 'Loss') + '</strong>', '<strong>' + signed(s.gain) + '</strong>', s.gain >= 0 ? 'eq-gain-pos' : 'eq-gain-neg')
        + (s.parts.some(function(p){ return p.held12; }) && s.parts.some(function(p){ return !p.held12; })
            ? row('From parcels held 12+ months', signed(s.gainHeld12)) + row('From parcels held under 12 months', signed(s.gainUnder12))
            : '<div class="eq-px-sub">All from parcels held ' + (s.parts[0].held12 ? '12 months or more' : 'under 12 months') + '</div>');
}

function saveEqSell() {
    if (!eqSell) return;
    var st = eqSellState();
    if (st.error) { toast(st.error); return; }
    eqRecordSale(st.summary, st.audPrice, st.date, st.quote);
    var s = eqSell.sec, g = st.summary.gain;
    eqOpenSecs[s.key] = true;   // leave it open so the sale shows
    closeEqSale();
    eqCommit();
    toast('Sold ' + eqFmtUnits(st.qty) + ' ' + esc(eqSecLabel(s)) + ': ' + (g >= 0 ? 'gain ' : 'loss ') + fmt(Math.abs(g)));
}

// ── Options: record an exercise or sale on one grant ─────────
function openEqSale(id) {
    var h = EQUITIES.find(function(e){ return e.id===id; });
    if (!h) return;
    var overlay = document.getElementById('eq-sale-overlay');
    if (!overlay) return;
    var label = h.ticker||h.company||'Holding';
    overlay.innerHTML = '<div class="eq-modal-box" onclick="event.stopPropagation()">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
        +'<div class="section-label" style="margin:0">'+ICON('cash')+' Record exercise or sale — '+esc(label)+'</div>'
        +'<button class="btn btn-ghost btn-sm" onclick="closeEqSale()" aria-label="Close">'+ICON('x')+'</button>'
        +'</div>'
        +'<input type="hidden" id="eq-sale-id" value="'+id+'"/>'
        +'<div class="form-grid">'
        +'<div><label class="lbl">Units</label><input type="number" id="eq-sale-qty" placeholder="0" min="0" step="any" inputmode="decimal" oninput="calcEqSalePreview()"/>'
        +'<div class="eq-field-hint">'+eqFmtUnits(eqHeldUnits(h))+' vested and not yet sold</div></div>'
        +'<div><label class="lbl">Sale Price per Share (AUD)</label><input type="number" id="eq-sale-price" placeholder="0.00" min="0" step="any" inputmode="decimal" oninput="calcEqSalePreview()"/></div>'
        +'</div>'
        +'<div class="form-grid">'
        +'<div><label class="lbl">Date</label><input type="date" id="eq-sale-date" value="'+eqIsoDate(new Date())+'"/></div>'
        +'<div><label class="lbl">Brokerage / Costs (AUD)</label><input type="number" id="eq-sale-costs" placeholder="0.00" min="0" step="any" inputmode="decimal" oninput="calcEqSalePreview()"/></div>'
        +'</div>'
        +'<div id="eq-sale-preview" style="margin-top:10px;font-size:.78rem;color:var(--muted)"></div>'
        +'<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">'
        +'<button class="btn btn-primary" onclick="saveEqSale()">Record</button>'
        +'<button class="btn btn-ghost" onclick="closeEqSale()">Cancel</button>'
        +'</div></div>';
    overlay.style.display = 'flex';
    overlay.onclick = function(e){ if(e.target===overlay) closeEqSale(); };
}

function closeEqSale() {
    var overlay = document.getElementById('eq-sale-overlay');
    if (overlay) overlay.style.display = 'none';
    eqSell = null;
}

// The cost of each option exercised is its strike price
function calcEqSalePreview() {
    var id    = (document.getElementById('eq-sale-id')||{}).value;
    var qty   = parseFloat((document.getElementById('eq-sale-qty')||{}).value)||0;
    var price = parseFloat((document.getElementById('eq-sale-price')||{}).value)||0;
    var costs = parseFloat((document.getElementById('eq-sale-costs')||{}).value)||0;
    var prev  = document.getElementById('eq-sale-preview');
    if (!prev||!id||!qty||!price){ if(prev) prev.innerHTML=''; return; }
    var h = EQUITIES.find(function(e){ return e.id===Number(id); });
    if (!h) return;
    var proceeds = qty*price-costs, costBase = qty*eqCostPerUnit(h), gain = proceeds-costBase;
    prev.innerHTML = '<span style="color:var(--muted)">Proceeds: </span><strong>'+fmt(proceeds)+'</strong>'
        +' &nbsp;·&nbsp; <span style="color:var(--muted)">Cost (strike): </span><strong>'+fmt(costBase)+'</strong>'
        +' &nbsp;·&nbsp; <span style="color:'+(gain>=0?'var(--success)':'var(--danger)')+';font-weight:700">'
        +(gain>=0?'Gain: +':'Loss: ')+fmt(Math.abs(gain))+'</span>';
}

function saveEqSale() {
    var id    = (document.getElementById('eq-sale-id')||{}).value;
    var qty   = parseFloat((document.getElementById('eq-sale-qty')||{}).value)||0;
    var price = parseFloat((document.getElementById('eq-sale-price')||{}).value)||0;
    var date  = (document.getElementById('eq-sale-date')||{}).value||'';
    var costs = parseFloat((document.getElementById('eq-sale-costs')||{}).value)||0;
    if (!id||!qty||!price){ toast('Enter the units and sale price'); return; }
    var h = EQUITIES.find(function(e){ return e.id===Number(id); });
    if (!h) return;
    var left = eqHeldUnits(h);
    if (qty > left + 1e-9) { toast('Only ' + eqFmtUnits(left) + ' vested units are left'); return; }
    var saleId = Date.now();
    if (!h.sales) h.sales=[];
    h.sales.push({ id:saleId, tradeId:saleId, qty:qty, price:price, date:date, costs:costs });
    eqOpenSecs[eqSecKey(h)] = true;
    closeEqSale();
    eqCommit();
    toast('Recorded ' + eqFmtUnits(qty) + ' units at ' + fmt(price));
}

// ══════════════════════════════════════════════════════════════
// UPDATE PRICES SHEET — one row per security; a blank box keeps the current price
// ══════════════════════════════════════════════════════════════
var eqPx = null;   // { secs, links, fx } for the open sheet — inputs refer to rows by index

function openBatchPriceModal(focusKey) {
    var overlay = document.getElementById('eq-modal-overlay');
    if (!overlay) return;
    var secs  = eqSecurities().sort(function(a, b){ return eqSecLabel(a).localeCompare(eqSecLabel(b)); });
    var bonds = EQUITIES.filter(function(h){ return h.type === 'bond'; });
    eqPx = { secs:secs, links:eqLinkSuggestions(secs), fx:eqFxRate() };

    var notes = eqPx.links.map(function(l, i) {
        return '<div class="eq-px-note"><span style="flex:1;min-width:180px">' + ICON('link') + ' <strong>' + esc(l.from.name)
            + '</strong> has no code but looks like <strong>' + esc(l.to.code) + '</strong>' + (l.to.name ? ' (' + esc(l.to.name) + ')' : '')
            + '. Same stock?</span><button class="btn btn-ghost btn-sm" onclick="eqPxLink(' + i + ')">Use code ' + esc(l.to.code) + '</button></div>';
    }).join('');

    var rows = secs.map(function(s, i) {
        var n = s.holdings.length, age = eqPriceAge(s.updated), label = eqSecLabel(s);
        var sub = n + ' holding' + (n !== 1 ? 's' : '')
            + (s.units ? ' · ' + s.units.toLocaleString('en-AU', { maximumFractionDigits:4 }) + ' units' : '')
            + (s.options ? ' · ' + s.options.toLocaleString('en-AU', { maximumFractionDigits:4 }) + ' options' : '');
        var ageTxt = '<span class="' + (age.stale ? 'eq-px-age--stale' : '') + '">' + age.label + '</span>';
        var last = !s.price ? '<span class="eq-px-age--stale">No price yet</span>'
            : s.quote ? 'Last <span class="mono">US' + eqFmtPrice(s.quote.price) + '</span> (<span class="mono">' + eqFmtPrice(s.price) + '</span>) · ' + ageTxt
            : 'Last <span class="mono">' + eqFmtPrice(s.price) + '</span> · ' + ageTxt;
        var warn = '';
        if (s.mixedPrices) {
            var ps = Object.keys(s.prices).map(Number).sort(function(a, b){ return a - b; });
            warn += '<div class="eq-px-warn">These holdings have different prices (' + eqFmtPrice(ps[0]) + '–' + eqFmtPrice(ps[ps.length - 1]) + '). Enter one price to set them all.</div>';
        }
        if (s.exchangeList.length > 1) warn += '<div class="eq-px-warn">Listed on ' + s.exchangeList.join(' and ') + ' — check these are the same stock.</div>';
        return '<div class="eq-px-row">'
            + '<div class="eq-px-info">'
            +   '<div class="eq-px-name"><strong>' + esc(label) + '</strong>' + (s.code && s.name ? ' <span class="eq-px-co">' + esc(s.name) + '</span>' : '') + '</div>'
            +   '<div class="eq-px-sub">' + sub + '</div><div class="eq-px-sub">' + last + '</div>' + warn
            + '</div>'
            + '<div class="eq-px-entry"><div class="eq-px-field">'
            +   '<select class="eq-px-ccy" id="eq-px-c-' + i + '" data-i="' + i + '" aria-label="Currency for ' + esc(label) + '" onchange="eqPxCcy(this)">'
            +     '<option value="AUD"' + (s.ccy === 'AUD' ? ' selected' : '') + '>A$</option>'
            +     '<option value="USD"' + (s.ccy === 'USD' ? ' selected' : '') + '>US$</option></select>'
            +   '<input type="number" class="eq-px-input mono" id="eq-px-' + i + '" data-i="' + i + '" min="0" step="any" inputmode="decimal" enterkeyhint="next"'
            +   ' placeholder="New price" aria-label="New price for ' + esc(label) + '" oninput="eqPxInput(this)" onkeydown="eqPxKey(event)"/>'
            + '</div><div class="eq-px-delta mono" id="eq-px-d-' + i + '"></div></div>'
            + '</div>';
    }).join('');

    var bondRows = bonds.map(function(h) {
        var val = parseFloat(h.currentValue) || 0;
        return '<div class="eq-px-row">'
            + '<div class="eq-px-info"><div class="eq-px-name"><strong>' + esc(h.company || 'Bond') + '</strong></div>'
            +   '<div class="eq-px-sub">Current value <span class="mono">' + fmt(val) + '</span>' + (h.priceUpdated ? ' · ' + eqPriceAge(h.priceUpdated).label : '') + '</div></div>'
            + '<div class="eq-px-entry"><input type="number" class="eq-px-bond mono" data-id="' + h.id + '" min="0" step="any" inputmode="decimal" enterkeyhint="next"'
            +   ' placeholder="New value" aria-label="New value for ' + esc(h.company || 'bond') + '" oninput="eqPxCount()" onkeydown="eqPxKey(event)"/></div>'
            + '</div>';
    }).join('');

    var fx = eqPx.fx;
    var fxRow = secs.length
        ? '<div class="eq-px-fx" id="eq-px-fx"><label for="eq-px-rate">Exchange rate: US$1 = A$</label>'
            + '<input type="number" class="eq-px-rate mono" id="eq-px-rate" min="0" step="any" inputmode="decimal" enterkeyhint="next"'
            + ' value="' + (fx ? fx.usdAud : '') + '" placeholder="e.g. 1.52" oninput="eqPxRate()" onkeydown="eqPxKey(event)"/>'
            + '<div class="eq-px-sub">' + (fx ? 'Saved ' + eqPriceAge(fx.updated).label + '. ' : '')
            + 'US$ prices are converted to A$ with this rate. Codes listed on NYSE or NASDAQ start in US$.</div>'
            + '<div class="eq-px-warn" id="eq-px-rate-warn"></div></div>'
        : '';

    overlay.innerHTML = '<div class="eq-modal-box" onclick="event.stopPropagation()">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
        + '<div class="section-label" style="margin:0">' + ICON('currency-dollar') + ' Update prices</div>'
        + '<button class="btn btn-ghost btn-sm" onclick="closeEqModal()" aria-label="Close">' + ICON('x') + '</button>'
        + '</div>'
        + '<div class="eq-px-help">One price per code, and it updates every holding with that code. Leave a box blank to keep the current price. Choose A$ or US$ for each code.</div>'
        + (secs.length ? '<details class="eq-px-paste"><summary>' + ICON('clipboard-text') + ' Paste prices</summary>'
            + '<div class="eq-px-help">One per line: the code, then the price, e.g. <span class="mono">CBA 112.40</span> or <span class="mono">TEAM US$255.10</span>. Two columns copied from a spreadsheet work too.</div>'
            + '<textarea id="eq-px-paste" rows="4" placeholder="CBA 112.40&#10;VGS 98.12"></textarea>'
            + '<button class="btn btn-ghost btn-sm" onclick="eqPxApplyPaste()">Fill in prices</button>'
            + '<div id="eq-px-paste-result" class="eq-px-help" role="status"></div>'
            + '</details>' : '')
        + fxRow
        + notes
        + (rows || bondRows
            ? rows + (bondRows ? '<div class="eq-group-label">Bonds — current value</div>' + bondRows : '')
            : '<div class="empty" style="padding:20px 0"><p>No holdings to price yet.</p></div>')
        + '<div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">'
        + '<button class="btn btn-primary" id="eq-px-save" onclick="saveBatchPrices()"></button>'
        + '<button class="btn btn-ghost" onclick="closeEqModal()">Cancel</button>'
        + '</div></div>';
    overlay.style.display = 'flex';
    overlay.onclick = function(e){ if(e.target===overlay) closeEqModal(); };
    eqPxSyncFx();
    eqPxCount();

    var at = focusKey ? secs.findIndex(function(s){ return s.key === focusKey; }) : -1;
    var inp = at !== -1 ? document.getElementById('eq-px-' + at) : null;
    if (inp) {
        inp.closest('.eq-px-row').classList.add('eq-px-row--focus');
        inp.scrollIntoView({ block:'center' });
        inp.focus();
    }
}

function eqPxCcyOf(inp) {
    var sel = document.getElementById('eq-px-c-' + inp.dataset.i);
    return sel ? sel.value : 'AUD';
}

// A$ per US$1 as typed in the rate box (0 when blank or not a number)
function eqPxRateValue() {
    var r = parseFloat((document.getElementById('eq-px-rate') || {}).value);
    return r > 0 ? r : 0;
}

// The exchange rate box only shows while some code is priced in US$
function eqPxSyncFx() {
    var row = document.getElementById('eq-px-fx');
    if (row) row.hidden = !Array.prototype.some.call(document.querySelectorAll('.eq-px-ccy'), function(sel){ return sel.value === 'USD'; });
}

function eqPxCcy(sel) {
    eqPxSyncFx();
    eqPxInput(document.getElementById('eq-px-' + sel.dataset.i));
}

function eqPxRate() {
    var r = parseFloat((document.getElementById('eq-px-rate') || {}).value), warn = document.getElementById('eq-px-rate-warn');
    if (warn) warn.textContent = r > 0 && r < 1
        ? 'That looks like US$ per A$1. Enter A$ per US$1 instead: 1 ÷ ' + r + ' = ' + (1 / r).toFixed(4) + '.' : '';
    document.querySelectorAll('.eq-px-input').forEach(function(inp){ if (eqPxCcyOf(inp) === 'USD') eqPxInput(inp); });
    eqPxCount();
}

// Live preview of a typed price: its A$ value if entered in US$, the change vs the last price,
// and the change in total value
function eqPxInput(inp) {
    var s = eqPx && eqPx.secs[+inp.dataset.i], out = document.getElementById('eq-px-d-' + inp.dataset.i);
    if (s && out) {
        var p = parseFloat(inp.value), usd = eqPxCcyOf(inp) === 'USD', rate = eqPxRateValue();
        out.style.color = '';
        if (inp.value === '' || !(p > 0)) {
            out.textContent = '';
        } else if (usd && !rate) {
            out.textContent = 'Enter the exchange rate above';
            out.style.color = 'var(--warn)';
        } else {
            var aud  = eqToAud(p, usd ? 'USD' : 'AUD', rate);
            var diff = s.holdings.reduce(function(t, h){ return t + eqHoldingValueAt(h, aud); }, 0) - s.value;
            var pct  = s.price ? (aud / s.price - 1) * 100 : null;
            out.textContent = (usd ? '= ' + eqFmtPrice(aud) + ' · ' : '')
                + (pct !== null ? (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(1) + '% · ' : '')
                + (diff >= 0 ? '+' : '−') + fmt(Math.abs(diff));
            out.style.color = diff >= 0 ? 'var(--success)' : 'var(--danger)';
        }
    }
    eqPxCount();
}

// What Save would write: filled price and value boxes, codes switched between A$ and US$, and a
// new exchange rate. count is per code, so a new price in a new currency counts once.
function eqPxChanges() {
    var ch = { prices:[], bonds:[], ccys:[], rate:0 }, rows = {};
    document.querySelectorAll('.eq-px-input').forEach(function(inp) {
        if (inp.value !== '' && parseFloat(inp.value) > 0) { ch.prices.push(inp); rows[inp.dataset.i] = 1; }
    });
    document.querySelectorAll('.eq-px-ccy').forEach(function(sel) {
        if (sel.value !== eqPx.secs[+sel.dataset.i].ccy) { ch.ccys.push(sel); rows[sel.dataset.i] = 1; }
    });
    document.querySelectorAll('.eq-px-bond').forEach(function(inp) {
        if (inp.value !== '' && parseFloat(inp.value) >= 0) ch.bonds.push(inp);
    });
    var rate = eqPxRateValue();
    if (rate && !(eqPx.fx && eqPx.fx.usdAud === rate)) ch.rate = rate;
    ch.count = Object.keys(rows).length + ch.bonds.length + (ch.rate ? 1 : 0);
    return ch;
}

function eqPxCount() {
    var n = eqPx ? eqPxChanges().count : 0, btn = document.getElementById('eq-px-save');
    if (btn) btn.innerHTML = ICON('device-floppy') + (n ? ' Save ' + n + ' change' + (n !== 1 ? 's' : '') : ' Save');
}

// Return moves to the next box, so a list of prices can be typed straight through
function eqPxKey(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var inputs = Array.prototype.filter.call(document.querySelectorAll('.eq-px-rate, .eq-px-input, .eq-px-bond'), function(el) {
        return el.offsetParent !== null;
    });
    var next = inputs[inputs.indexOf(e.target) + 1] || document.getElementById('eq-px-save');
    if (next) next.focus();
}

// Fill boxes from pasted lines (see eqParsePriceLines); a line marked US$ or A$ also sets the row's currency
function eqPxApplyPaste() {
    var ta = document.getElementById('eq-px-paste'), out = document.getElementById('eq-px-paste-result');
    if (!ta || !eqPx) return;
    var rowFor = {};
    eqPx.secs.forEach(function(s, i){ if (s.code) rowFor[s.key] = i; });
    var res = eqParsePriceLines(ta.value), filled = 0, unknown = [];
    res.found.forEach(function(f) {
        if (!(f.key in rowFor)) { unknown.push(f.code); return; }
        var sel = document.getElementById('eq-px-c-' + rowFor[f.key]), inp = document.getElementById('eq-px-' + rowFor[f.key]);
        if (f.ccy && sel) sel.value = f.ccy;
        inp.value = f.price;
        eqPxInput(inp);
        filled++;
    });
    eqPxSyncFx();
    if (out) out.textContent = (filled ? 'Filled in ' + filled + ' price' + (filled !== 1 ? 's' : '') + '. Check them, then save.' : 'No prices filled in.')
        + (unknown.length ? ' Not in your holdings: ' + unknown.join(', ') + '.' : '')
        + (res.unread ? ' Couldn’t read ' + res.unread + ' line' + (res.unread !== 1 ? 's' : '') + '.' : '');
}

// Give holdings without a code the matching security's code, so they share its price
function eqPxLink(i) {
    var l = eqPx && eqPx.links[i];
    if (!l) return;
    // Keep what was typed or chosen through the redraw
    var typed = {}, ccys = {}, rate = (document.getElementById('eq-px-rate') || {}).value;
    document.querySelectorAll('.eq-px-input').forEach(function(inp){ if (inp.value !== '') typed[eqPx.secs[+inp.dataset.i].key] = inp.value; });
    document.querySelectorAll('.eq-px-bond').forEach(function(inp){ if (inp.value !== '') typed['b:' + inp.dataset.id] = inp.value; });
    document.querySelectorAll('.eq-px-ccy').forEach(function(sel){ ccys[eqPx.secs[+sel.dataset.i].key] = sel.value; });

    l.from.holdings.forEach(function(h){ h.ticker = l.to.code; });
    var merged = eqSecurities().find(function(s){ return s.key === l.to.key; });
    if (merged && merged.price) eqSetPrice(merged.key, merged.price, merged.updated, merged.quote);
    eqCommit();
    openBatchPriceModal();

    var rateEl = document.getElementById('eq-px-rate');
    if (rateEl && rate !== undefined) rateEl.value = rate;
    document.querySelectorAll('.eq-px-ccy').forEach(function(sel){ var v = ccys[eqPx.secs[+sel.dataset.i].key]; if (v) sel.value = v; });
    document.querySelectorAll('.eq-px-bond').forEach(function(inp){ var v = typed['b:' + inp.dataset.id]; if (v !== undefined) inp.value = v; });
    document.querySelectorAll('.eq-px-input').forEach(function(inp) {
        var v = typed[eqPx.secs[+inp.dataset.i].key];
        if (v !== undefined) { inp.value = v; eqPxInput(inp); }
    });
    eqPxSyncFx();
    eqPxCount();
    var n = l.from.holdings.length;
    toast('Linked ' + n + ' holding' + (n !== 1 ? 's' : '') + ' to ' + esc(l.to.code));
}

function saveBatchPrices() {
    if (!eqPx) return;
    var ch = eqPxChanges(), now = Date.now(), rate = eqPxRateValue();
    if (!rate && ch.prices.some(function(inp){ return eqPxCcyOf(inp) === 'USD'; })) {
        var r = document.getElementById('eq-px-rate');
        if (r) r.focus();
        toast('Enter the exchange rate for your US$ prices first');
        return;
    }
    if (ch.rate) save(EQ_FX_KEY, { usdAud:ch.rate, updated:now });
    ch.ccys.forEach(function(sel){ eqSetCcy(eqPx.secs[+sel.dataset.i].key, sel.value); });
    ch.prices.forEach(function(inp) {
        var key = eqPx.secs[+inp.dataset.i].key, v = parseFloat(inp.value);
        if (eqPxCcyOf(inp) === 'USD') eqSetPrice(key, eqToAud(v, 'USD', rate), now, { price:v, rate:rate });
        else eqSetPrice(key, v, now);
    });
    ch.bonds.forEach(function(inp) {
        var h = EQUITIES.find(function(e){ return String(e.id) === inp.dataset.id; });
        if (h) { h.currentValue = parseFloat(inp.value); h.priceUpdated = now; }
    });
    closeEqModal();
    if (!ch.count) return;
    eqCommit();
    toast('Saved ' + ch.count + ' change' + (ch.count !== 1 ? 's' : ''));
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
