// ══════════════════════════════════════════════════════════════
// EQUITY HOLDINGS (RSU + Shares + Options)
// ══════════════════════════════════════════════════════════════

function eqTotalValue(h) {
    var qty  = Number(h.qty)          || 0;
    var sold = (h.sales || []).reduce(function(s, sale) { return s + (Number(sale.qty) || 0); }, 0);
    var held = Math.max(0, qty - sold);
    var price = Number(h.currentPrice) || 0;
    return held * price;
}

function eqCostBase(h) {
    var qty  = Number(h.qty)  || 0;
    var cost = Number(h.cost) || 0;
    var sold = (h.sales || []).reduce(function(s, sale) { return s + (Number(sale.qty) || 0); }, 0);
    var held = Math.max(0, qty - sold);
    return held * cost;
}

function eqTotalGain(h) {
    return eqTotalValue(h) - eqCostBase(h);
}

function eqTotalEquitiesValue() {
    // RSU from tax tab (vested, not yet sold)
    var rsuVal = eqRSUFromTax();
    // Manual holdings
    var manVal = EQUITIES.reduce(function(s, h) { return s + eqTotalValue(h); }, 0);
    return rsuVal + manVal;
}

// Pull RSU grants from TAX data and calculate current value
function eqRSUFromTax() {
    var total = 0;
    var fy = (typeof taxGetFY === 'function') ? taxGetFY() : 2024;
    // Check all FYs
    Object.keys(TAX).forEach(function(fyKey) {
        var d = TAX[fyKey];
        if (!d || !d.rsus) return;
        d.rsus.forEach(function(rsu) {
            var units = parseFloat(rsu.units) || 0;
            var price = parseFloat(rsu.price) || 0;
            // Subtract any sales recorded on this RSU
            var sold = 0;
            if (rsu.sales) {
                rsu.sales.forEach(function(s) { sold += parseFloat(s.qty) || 0; });
            }
            var held = Math.max(0, units - sold);
            // Use current price if set, otherwise use vesting price
            var curPrice = parseFloat(rsu.currentPrice) || price;
            total += held * curPrice;
        });
    });
    return total;
}

// ── Live price fetch ──────────────────────────────────────────
// Fetches current market price via Yahoo Finance (no API key needed).
// Supports US stocks/ETFs (bare ticker: AAPL, NVDA) and
// ASX stocks/ETFs (.AX suffix: CBA.AX, or bare code: CBA — auto-retried).
//
// Strategy: try v8/chart (range=5d) → v7/quote on both query1 + query2.
// range=5d avoids empty results on weekends/public holidays.
// Returns Promise<{ price, ticker }> on success, or Promise<null> on failure.
function eqFetchLivePrice(ticker, priceElId, statusElId, nameElId) {
    if (!ticker) { return Promise.reject('No ticker'); }
    var tick = ticker.trim().toUpperCase();
    var statusEl = statusElId ? document.getElementById(statusElId) : null;
    if (statusEl) { statusEl.textContent = 'Fetching ' + tick + '…'; statusEl.style.color = 'var(--muted)'; }

    // Raw fetch + JSON parse (throws on non-2xx)
    function doGet(url) {
        return fetch(url).then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    // Parse v8/chart response → { price, name, currency, exchange, timestamp }
    function parseChart(data) {
        var res = data && data.chart && data.chart.result && data.chart.result[0];
        if (!res || !res.meta) throw new Error('chart: no result');
        var m = res.meta;
        // regularMarketPrice is always the last known price, even outside market hours.
        // chartPreviousClose is used as a final fallback.
        var price = Number(m.regularMarketPrice || m.chartPreviousClose || m.previousClose || 0);
        if (!price || isNaN(price)) throw new Error('chart: no price');
        return { price: price, name: m.longName || m.shortName || '', currency: m.currency || '', exchange: m.fullExchangeName || m.exchangeName || '', timestamp: m.regularMarketTime || 0 };
    }

    // Parse v7/quote response → same shape
    function parseQuote(data) {
        var res = data && data.quoteResponse && data.quoteResponse.result && data.quoteResponse.result[0];
        if (!res) throw new Error('quote: no result');
        var price = Number(res.regularMarketPrice || 0);
        if (!price || isNaN(price)) throw new Error('quote: no price');
        return { price: price, name: res.longName || res.shortName || '', currency: res.currency || '', exchange: res.fullExchangeName || res.exchange || '', timestamp: res.regularMarketTime || 0 };
    }

    // Try all four endpoint variants for a given symbol, in order
    function tryAll(t) {
        var enc = encodeURIComponent(t);
        return doGet('https://query1.finance.yahoo.com/v8/finance/chart/' + enc + '?interval=1d&range=5d').then(parseChart)
            .catch(function() { return doGet('https://query2.finance.yahoo.com/v8/finance/chart/' + enc + '?interval=1d&range=5d').then(parseChart); })
            .catch(function() { return doGet('https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + enc).then(parseQuote); })
            .catch(function() { return doGet('https://query2.finance.yahoo.com/v7/finance/quote?symbols=' + enc).then(parseQuote); });
    }

    // If ticker has an exchange suffix (e.g. .AX, .L) use as-is.
    // Otherwise try US first; only fall to ASX if every US endpoint fails.
    var hasSuffix = tick.indexOf('.') !== -1;

    var fetchChain;
    if (hasSuffix) {
        fetchChain = tryAll(tick).then(function(r) { r.resolvedTicker = tick; return r; });
    } else {
        fetchChain = tryAll(tick)
            .then(function(r) { r.resolvedTicker = tick; return r; })
            .catch(function(usErr) {
                console.warn('eqFetch: US lookup failed for "' + tick + '":', usErr.message, '— trying ASX');
                var asxTick = tick + '.AX';
                if (statusEl) { statusEl.textContent = 'US not found — trying ASX (' + asxTick + ')…'; statusEl.style.color = 'var(--muted)'; }
                return tryAll(asxTick).then(function(r) { r.resolvedTicker = asxTick; return r; });
            });
    }

    return fetchChain
        .then(function(r) {
            // Fill price input
            var priceEl = priceElId ? document.getElementById(priceElId) : null;
            if (priceEl) priceEl.value = r.price.toFixed(2);
            // Fill company name if blank
            var nameEl = nameElId ? document.getElementById(nameElId) : null;
            if (nameEl && !nameEl.value.trim() && r.name) nameEl.value = r.name;
            // Status: ✅ AAPL: USD 213.50 · NasdaqGS · as at 04:32 PM
            var updated = r.timestamp ? new Date(r.timestamp * 1000).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '';
            var parts = ['✅ ' + r.resolvedTicker + ': ' + (r.currency || 'AUD') + ' ' + r.price.toFixed(2)];
            if (r.exchange) parts.push(r.exchange);
            if (updated) parts.push('as at ' + updated);
            if (statusEl) { statusEl.textContent = parts.join(' · '); statusEl.style.color = 'var(--success)'; }
            return { price: r.price, ticker: r.resolvedTicker };
        })
        .catch(function(err) {
            console.warn('eqFetchLivePrice: all endpoints failed for "' + tick + '":', err);
            if (statusEl) {
                statusEl.textContent = '⚠️ Could not fetch "' + tick + '". US examples: AAPL, NVDA, VGS. ASX examples: CBA.AX, BHP or BHP.AX.';
                statusEl.style.color = 'var(--warn)';
            }
            return null;
        });
}

// Wrapper called by the 🔍 Live button in the add/edit form.
// Resolves the ticker, updates the price field, and if the exchange suffix was
// auto-detected (e.g. user typed "CBA" → resolved "CBA.AX") also updates the
// ticker input so the correct symbol is saved with the holding.
function eqFetchPrice() {
    var tickerEl = document.getElementById('eq-ticker');
    var ticker   = tickerEl ? (tickerEl.value || '') : '';
    if (!ticker.trim()) {
        var statusEl = document.getElementById('eq-price-status');
        if (statusEl) {
            statusEl.textContent = '⚠️ Enter a ticker first (e.g. AAPL for US, or CBA.AX / CBA for ASX)';
            statusEl.style.color = 'var(--warn)';
        }
        return;
    }
    eqFetchLivePrice(ticker, 'eq-price', 'eq-price-status', 'eq-company')
        .then(function(result) {
            // Auto-update the ticker field if exchange suffix was resolved
            if (result && tickerEl && result.ticker !== tickerEl.value.trim().toUpperCase()) {
                tickerEl.value = result.ticker;
            }
        });
}

// Stores resolved ticker back on the RSU grant (so subsequent 🔍 clicks skip the prompt)
function taxStoreRSUTicker(fy, idx, ticker) {
    var fyStr = String(fy);
    if (!TAX[fyStr] || !TAX[fyStr].rsus || !TAX[fyStr].rsus[idx]) return;
    TAX[fyStr].rsus[idx].ticker = ticker;
    try { save(K.tax, TAX); } catch(e) {}
}

// Called by the 🔍 button next to an RSU price input in renderEquitiesList().
// Uses stored ticker if present; otherwise prompts once and stores the answer.
function eqFetchRSUPrice(fy, idx, storedTicker) {
    var tick = storedTicker || prompt('Enter ticker symbol for this RSU grant (e.g. NVDA, CBA.AX):');
    if (!tick || !tick.trim()) return;
    var statusId = 'rsu-price-status-' + fy + '-' + idx;
    var priceId  = 'rsu-price-input-'  + fy + '-' + idx;
    eqFetchLivePrice(tick.trim(), priceId, statusId, null)
        .then(function(result) {
            if (!result) return;
            // Update price in TAX data
            if (typeof taxUpdateRSUPrice === 'function') taxUpdateRSUPrice(fy, idx, result.price);
            // Store the resolved ticker (with exchange suffix) for next time
            taxStoreRSUTicker(fy, idx, result.ticker);
            // If the RSU row renders a stored-ticker data attribute, update it
            var btn = document.querySelector('[data-rsu-ticker-btn="' + fy + '-' + idx + '"]');
            if (btn) btn.setAttribute('data-stored-ticker', result.ticker);
        });
}

// ── UI Functions ──────────────────────────────────────────────
function openAddEquity(id) {
    var form = document.getElementById('eq-add-form');
    if (!form) return;
    if (id) {
        var h = EQUITIES.find(function(e) { return e.id === id; });
        if (h) {
            document.getElementById('eq-edit-id').value = id;
            document.getElementById('eq-ticker').value   = h.ticker   || '';
            document.getElementById('eq-company').value  = h.company  || '';
            document.getElementById('eq-type').value     = h.type     || 'stock';
            document.getElementById('eq-owner').value    = h.owner    || 'brenton';
            document.getElementById('eq-qty').value      = h.qty      || '';
            document.getElementById('eq-cost').value     = h.cost     || '';
            document.getElementById('eq-price').value    = h.currentPrice || '';
            document.getElementById('eq-date').value     = h.date     || '';
            document.getElementById('eq-notes').value    = h.notes    || '';
            document.getElementById('eq-form-title').textContent = 'Edit Holding';
        }
    } else {
        document.getElementById('eq-edit-id').value = '';
        ['eq-ticker','eq-company','eq-qty','eq-cost','eq-price','eq-date','eq-notes'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('eq-form-title').textContent = 'Add Equity Holding';
    }
    form.style.display = 'block';
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeAddEquity() {
    var f = document.getElementById('eq-add-form');
    if (f) f.style.display = 'none';
}

function saveEquity() {
    var ticker  = (document.getElementById('eq-ticker')?.value  || '').trim().toUpperCase();
    var company = (document.getElementById('eq-company')?.value || '').trim();
    var type    = document.getElementById('eq-type')?.value    || 'stock';
    var owner   = document.getElementById('eq-owner')?.value   || 'brenton';
    var qty     = parseFloat(document.getElementById('eq-qty')?.value)   || 0;
    var cost    = parseFloat(document.getElementById('eq-cost')?.value)  || 0;
    var price   = parseFloat(document.getElementById('eq-price')?.value) || 0;
    var date    = document.getElementById('eq-date')?.value    || '';
    var notes   = (document.getElementById('eq-notes')?.value  || '').trim();
    var editId  = document.getElementById('eq-edit-id')?.value || '';

    if (!ticker && !company) { toast('Enter a ticker or company name'); return; }
    if (!qty)                 { toast('Enter quantity'); return; }

    if (editId) {
        var existing = EQUITIES.find(function(e) { return String(e.id) === editId; });
        if (existing) {
            existing.ticker = ticker; existing.company = company; existing.type = type;
            existing.owner = owner; existing.qty = qty; existing.cost = cost;
            existing.currentPrice = price; existing.date = date; existing.notes = notes;
        }
    } else {
        EQUITIES.push({ id: Date.now(), ticker: ticker, company: company, type: type,
                        owner: owner, qty: qty, cost: cost, currentPrice: price,
                        date: date, notes: notes, sales: [] });
    }
    try { save(K.equities, EQUITIES); } catch(e) {}
    closeAddEquity();
    renderEquitiesPage();
    if (typeof renderAssets === 'function') renderAssets();
    toast('Holding saved');
}

function deleteEquity(id) {
    if (!confirm('Delete this holding? Sales history will also be removed.')) return;
    EQUITIES = EQUITIES.filter(function(e) { return e.id !== id; });
    try { save(K.equities, EQUITIES); } catch(e) {}
    renderEquitiesPage();
    if (typeof renderAssets === 'function') renderAssets();
    toast('Holding removed');
}

// ── Sale recording ────────────────────────────────────────────
function openEquitySale(id) {
    var form = document.getElementById('eq-sale-form');
    if (!form) return;
    document.getElementById('eq-sale-holding-id').value = id;
    ['eq-sale-qty','eq-sale-price','eq-sale-costs'].forEach(function(fid) {
        var el = document.getElementById(fid); if (el) el.value = '';
    });
    var today = new Date().toISOString().slice(0, 10);
    var dateEl = document.getElementById('eq-sale-date');
    if (dateEl) dateEl.value = today;
    form.style.display = 'block';
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    calcSalePreview();
}

function closeEquitySale() {
    var f = document.getElementById('eq-sale-form');
    if (f) f.style.display = 'none';
}

function calcSalePreview() {
    var id    = document.getElementById('eq-sale-holding-id')?.value;
    var qty   = parseFloat(document.getElementById('eq-sale-qty')?.value)    || 0;
    var price = parseFloat(document.getElementById('eq-sale-price')?.value)  || 0;
    var costs = parseFloat(document.getElementById('eq-sale-costs')?.value)  || 0;
    var prev  = document.getElementById('eq-sale-preview');
    if (!prev || !id || !qty || !price) { if (prev) prev.textContent = ''; return; }
    var h = EQUITIES.find(function(e) { return e.id === Number(id); });
    if (!h) return;
    var proceeds = qty * price - costs;
    var costBase = qty * (h.cost || 0);
    var gain = proceeds - costBase;
    prev.innerHTML = '<span style="color:var(--muted)">Proceeds: </span><strong>' + fmt(proceeds) + '</strong>'
        + ' &nbsp;·&nbsp; <span style="color:var(--muted)">Cost base: </span><strong>' + fmt(costBase) + '</strong>'
        + ' &nbsp;·&nbsp; <span style="color:' + (gain >= 0 ? 'var(--success)' : 'var(--danger)') + ';font-weight:700">'
        + (gain >= 0 ? 'Gain: +' : 'Loss: ') + fmt(Math.abs(gain)) + '</span>';
}

function saveEquitySale() {
    var id    = document.getElementById('eq-sale-holding-id')?.value;
    var qty   = parseFloat(document.getElementById('eq-sale-qty')?.value)   || 0;
    var price = parseFloat(document.getElementById('eq-sale-price')?.value) || 0;
    var date  = document.getElementById('eq-sale-date')?.value  || '';
    var costs = parseFloat(document.getElementById('eq-sale-costs')?.value) || 0;
    if (!id || !qty || !price) { toast('Enter quantity and sale price'); return; }
    var h = EQUITIES.find(function(e) { return e.id === Number(id); });
    if (!h) return;
    if (!h.sales) h.sales = [];
    h.sales.push({ id: Date.now(), qty: qty, price: price, date: date, costs: costs });
    try { save(K.equities, EQUITIES); } catch(e) {}
    closeEquitySale();
    renderEquitiesPage();
    if (typeof renderAssets === 'function') renderAssets();
    toast('Sale recorded — ' + qty + ' units at ' + fmt(price));
}

function deleteSale(holdingId, saleId) {
    var h = EQUITIES.find(function(e) { return e.id === holdingId; });
    if (!h || !h.sales) return;
    h.sales = h.sales.filter(function(s) { return s.id !== saleId; });
    try { save(K.equities, EQUITIES); } catch(e) {}
    renderEquitiesPage();
    if (typeof renderAssets === 'function') renderAssets();
    toast('Sale removed');
}

// ── RSU sale recording (on tax tab RSU entries) ───────────────
function openRSUSale(fyKey, rsuIdx) {
    // Record a sale against a specific RSU grant in the tax tab
    var fy = String(fyKey);
    if (!TAX[fy] || !TAX[fy].rsus || !TAX[fy].rsus[rsuIdx]) return;
    var rsu  = TAX[fy].rsus[rsuIdx];
    var units = parseFloat(rsu.units) || 0;
    var sold  = (rsu.sales || []).reduce(function(s, x) { return s + (parseFloat(x.qty) || 0); }, 0);
    var held  = Math.max(0, units - sold);
    var salePrice = prompt('Sale price per unit (AUD)? Units held: ' + held.toFixed(0));
    if (!salePrice) return;
    var saleQty = prompt('Units to sell? (max ' + held.toFixed(0) + ')');
    if (!saleQty) return;
    var qtyNum   = Math.min(parseFloat(saleQty) || 0, held);
    var priceNum = parseFloat(salePrice) || 0;
    if (qtyNum <= 0 || priceNum <= 0) { toast('Invalid quantity or price'); return; }
    if (!rsu.sales) rsu.sales = [];
    rsu.sales.push({ id: Date.now(), qty: qtyNum, price: priceNum, date: today() });
    try { save(K.tax, TAX); } catch(e) {}
    renderTax();
    renderEquitiesPage();
    if (typeof renderAssets === 'function') renderAssets();
    toast('RSU sale recorded: ' + qtyNum + ' units at ' + fmt(priceNum));
}

// ── Render holdings list ──────────────────────────────────────
function renderEquitiesList() {
    var el = document.getElementById('eq-holdings-list');
    if (!el) return;

    // Combine: manual holdings + RSU from tax
    var hasManual = EQUITIES.length > 0;
    var hasRSU    = eqRSUFromTax() > 0 || Object.keys(TAX).some(function(fy) {
        return TAX[fy] && TAX[fy].rsus && TAX[fy].rsus.length > 0;
    });

    var html = '';

    // ── RSU section from Tax tab ──────────────────────────────
    var fyKeys = Object.keys(TAX).sort();
    fyKeys.forEach(function(fy) {
        var d = TAX[fy];
        if (!d || !d.rsus || !d.rsus.length) return;
        html += '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:12px 0 8px">RSU Grants — FY ' + fy + '-' + String(parseInt(fy)+1).slice(2) + '</div>';
        d.rsus.forEach(function(rsu, idx) {
            var units    = parseFloat(rsu.units) || 0;
            var vestPx   = parseFloat(rsu.price) || 0;
            var curPx    = parseFloat(rsu.currentPrice) || vestPx;
            var sold     = (rsu.sales || []).reduce(function(s, x) { return s + (parseFloat(x.qty) || 0); }, 0);
            var held     = Math.max(0, units - sold);
            var value    = held * curPx;
            var costBase = held * vestPx;
            var gain     = value - costBase;
            var vestDate = rsu.date ? new Date(rsu.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

            html += '<div class="eq-card">'
                + '<div class="eq-header">'
                + '<div class="eq-ticker">RSU</div>'
                + '<div class="eq-company">' + getUserName('brenton') + ' — Vested ' + vestDate + '</div>'
                + '<span class="eq-type-badge eq-type-rsu">RSU</span>'
                + '<div style="margin-left:auto;display:flex;gap:6px">';
            // Current price input + live fetch button
            var rsuPriceId  = 'rsu-price-input-'  + fy + '-' + idx;
            var rsuStatusId = 'rsu-price-status-' + fy + '-' + idx;
            var rsuTicker   = rsu.ticker || '';
            html += '<div style="display:flex;flex-direction:column;gap:2px">'
                + '<div style="display:flex;gap:4px;align-items:center">'
                + '<input type="number" id="' + rsuPriceId + '" value="' + (rsu.currentPrice || '') + '" placeholder="Current price"'
                + ' style="width:100px;padding:4px 8px;font-size:.76rem;border-radius:6px;background:var(--card);border:1px solid var(--border);color:var(--text)"'
                + ' oninput="taxUpdateRSUPrice(\'' + fy + '\',' + idx + ',this.value)" title="Update current market price"/>'
                + '<button class="btn btn-ghost btn-sm" onclick="eqFetchRSUPrice(\'' + fy + '\',' + idx + ',\'' + rsuTicker + '\')" title="Fetch live price" style="padding:4px 7px;font-size:.75rem">🔍</button>'
                + '</div>'
                + '<div id="' + rsuStatusId + '" style="font-size:.68rem;color:var(--muted);min-height:12px"></div>'
                + '</div>';
            html += '<button class="btn btn-ghost btn-sm" onclick="openRSUSale(\'' + fy + '\',' + idx + ')">💵 Sell</button>';
            html += '</div></div>';

            html += '<div class="eq-grid">'
                + '<span class="eq-lbl">Vesting Price</span><span class="eq-val">' + fmt(vestPx) + '</span>'
                + '<span class="eq-lbl">Current Price</span><span class="eq-val">' + (rsu.currentPrice ? fmt(curPx) : '<span style="color:var(--muted)">= vesting</span>') + '</span>'
                + '<span class="eq-lbl">Units Granted</span><span class="eq-val">' + units.toFixed(0) + '</span>'
                + '<span class="eq-lbl">Units Sold</span><span class="eq-val">' + sold.toFixed(0) + '</span>'
                + '<span class="eq-lbl">Units Held</span><span class="eq-val" style="color:var(--primary)">' + held.toFixed(0) + '</span>'
                + '<span class="eq-lbl">Current Value</span><span class="eq-val ' + (gain >= 0 ? 'eq-gain-pos' : 'eq-gain-neg') + '">' + fmt(value) + '</span>'
                + '</div>';

            // Sales history
            if (rsu.sales && rsu.sales.length) {
                html += '<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">'
                    + '<div style="font-size:.7rem;font-weight:700;color:var(--muted);margin-bottom:6px">Sales History</div>';
                rsu.sales.forEach(function(sale) {
                    var proceeds = (sale.qty * sale.price);
                    var cg = proceeds - (sale.qty * vestPx);
                    html += '<div class="eq-sales-row">'
                        + '<span style="color:var(--muted)">' + (sale.date || '—') + '</span>'
                        + '<span>' + (parseFloat(sale.qty)||0).toFixed(0) + ' units @ ' + fmt(sale.price) + '</span>'
                        + '<span style="color:var(--success)">Proceeds: ' + fmt(proceeds) + '</span>'
                        + '<span class="' + (cg >= 0 ? 'eq-gain-pos' : 'eq-gain-neg') + '">' + (cg >= 0 ? '+' : '') + fmt(cg) + ' CG</span>'
                        + '</div>';
                });
                html += '</div>';
            }
            html += '</div>';
        });
    });

    // ── Manual holdings ───────────────────────────────────────
    if (EQUITIES.length) {
        html += '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:16px 0 8px">Manual Holdings</div>';
        EQUITIES.forEach(function(h) {
            var sold     = (h.sales || []).reduce(function(s, sale) { return s + (parseFloat(sale.qty) || 0); }, 0);
            var held     = Math.max(0, (h.qty || 0) - sold);
            var value    = held * (h.currentPrice || 0);
            var costBase = held * (h.cost || 0);
            var gain     = value - costBase;
            var gainPct  = costBase > 0 ? ((gain / costBase) * 100).toFixed(1) : '—';
            var typeCls  = h.type === 'rsu' ? 'eq-type-rsu' : h.type === 'option' ? 'eq-type-option' : 'eq-type-stock';

            html += '<div class="eq-card">'
                + '<div class="eq-header">'
                + '<div class="eq-ticker">' + (h.ticker || '—') + '</div>'
                + '<div class="eq-company">' + (h.company || '') + (h.owner ? ' · ' + (h.owner === 'brenton' ? getUserName('brenton') : h.owner === 'shelley' ? getUserName('shelley') : 'Joint') : '') + '</div>'
                + '<span class="eq-type-badge ' + typeCls + '">' + (h.type || 'stock').toUpperCase() + '</span>'
                + '<div style="margin-left:auto;display:flex;gap:6px">'
                + '<button class="btn btn-ghost btn-sm" onclick="openEquitySale(' + h.id + ')">💵 Sell</button>'
                + '<button class="btn btn-ghost btn-sm" onclick="openAddEquity(' + h.id + ')">✏️</button>'
                + '<button class="del-btn" onclick="deleteEquity(' + h.id + ')">🗑</button>'
                + '</div></div>';

            html += '<div class="eq-grid">'
                + '<span class="eq-lbl">Cost Base / Unit</span><span class="eq-val">' + fmt(h.cost || 0) + '</span>'
                + '<span class="eq-lbl">Current Price</span><span class="eq-val">' + fmt(h.currentPrice || 0) + '</span>'
                + '<span class="eq-lbl">Units Held</span><span class="eq-val">' + held.toFixed(2) + '</span>'
                + '<span class="eq-lbl">Market Value</span><span class="eq-val ' + (gain >= 0 ? 'eq-gain-pos' : 'eq-gain-neg') + '">' + fmt(value) + '</span>'
                + '<span class="eq-lbl">Unrealised G/L</span><span class="eq-val ' + (gain >= 0 ? 'eq-gain-pos' : 'eq-gain-neg') + '">' + (gain >= 0 ? '+' : '') + fmt(gain) + ' (' + gainPct + '%)</span>'
                + (h.notes ? '<span class="eq-lbl">Notes</span><span class="eq-val" style="color:var(--muted)">' + h.notes + '</span>' : '')
                + '</div>';

            if (h.sales && h.sales.length) {
                html += '<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">'
                    + '<div style="font-size:.7rem;font-weight:700;color:var(--muted);margin-bottom:6px">Sales</div>';
                h.sales.forEach(function(sale) {
                    var proceeds = sale.qty * sale.price - (sale.costs || 0);
                    var cg = proceeds - (sale.qty * (h.cost || 0));
                    html += '<div class="eq-sales-row">'
                        + '<span style="color:var(--muted)">' + (sale.date || '—') + '</span>'
                        + '<span>' + (parseFloat(sale.qty)||0) + ' units @ ' + fmt(sale.price) + '</span>'
                        + '<span style="color:var(--success)">Proceeds: ' + fmt(proceeds) + '</span>'
                        + '<span class="' + (cg >= 0 ? 'eq-gain-pos' : 'eq-gain-neg') + '">' + (cg >= 0 ? '+' : '') + fmt(cg) + ' CG</span>'
                        + '<button class="del-btn" style="margin-left:auto" onclick="deleteSale(' + h.id + ',' + sale.id + ')">🗑</button>'
                        + '</div>';
                });
                html += '</div>';
            }
            html += '</div>';
        });
    }

    if (!hasManual && !hasRSU) {
        html = '<div class="empty"><div class="ei">📈</div><p>No equity holdings yet. Add RSU grants in the Tax tab or click <strong>+ Add Holding</strong> above.</p></div>';
    }
    el.innerHTML = html;
}

function renderEquitiesPage() {
    // Render summary stats into the equities page header
    var statsEl = document.getElementById('eq-page-stats');
    if (statsEl) {
        var totalVal  = eqTotalEquitiesValue();
        var rsuVal    = (typeof eqRSUFromTax === 'function') ? eqRSUFromTax() : 0;
        var manVal    = EQUITIES.reduce(function(s, h) { return s + eqTotalValue(h); }, 0);
        var totalCost = EQUITIES.reduce(function(s, h) { return s + eqCostBase(h); }, 0);
        var totalGain = EQUITIES.reduce(function(s, h) { return s + eqTotalGain(h); }, 0);
        var gainColor = totalGain >= 0 ? 'var(--success)' : 'var(--danger)';
        var gainSign  = totalGain >= 0 ? '+' : '';

        statsEl.innerHTML = ''
            + '<div class="stat stat-pink"><div class="sl">Total Portfolio Value</div>'
            + '<div class="sv">' + fmt(totalVal) + '</div>'
            + '<div class="ss">RSU + manual holdings</div></div>'
            + '<div class="stat stat-purple"><div class="sl">RSU Grants</div>'
            + '<div class="sv">' + fmt(rsuVal) + '</div>'
            + '<div class="ss">Synced from Tax tab</div></div>'
            + '<div class="stat stat-dark"><div class="sl">Manual Holdings</div>'
            + '<div class="sv">' + fmt(manVal) + '</div>'
            + '<div class="ss">Shares &amp; ETFs</div></div>'
            + (totalCost > 0
                ? '<div class="stat stat-dark"><div class="sl">Unrealised G/L</div>'
                  + '<div class="sv" style="color:' + gainColor + '">' + gainSign + fmt(totalGain) + '</div>'
                  + '<div class="ss">Manual holdings only</div></div>'
                : '');
    }
    // Render the holdings list
    renderEquitiesList();
}

function taxUpdateRSUPrice(fy, idx, value) {
    if (!TAX[String(fy)] || !TAX[String(fy)].rsus || !TAX[String(fy)].rsus[idx]) return;
    TAX[String(fy)].rsus[idx].currentPrice = parseFloat(value) || 0;
    try { save(K.tax, TAX); } catch(e) {}
    if (typeof renderAssets === 'function') renderAssets();
}



// ── Mobile bottom tab navigation ─────────────────────────────
var MOB_TAB_PAGES = ['dashboard','bills','transactions','cash'];

