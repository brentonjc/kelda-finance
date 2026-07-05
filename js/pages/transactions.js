
// ══════════════════════════════════════════════════════════════
// TRANSACTIONS
// ══════════════════════════════════════════════════════════════
function txRescanCategories() {
  var btn = document.getElementById('tx-rescan-btn');
  var result = document.getElementById('tx-rescan-result');
  if (btn) btn.disabled = true;
  if (result) { result.style.display = 'inline'; result.style.color = 'var(--muted)'; result.textContent = 'Scanning…'; }

  AutoCat.reprocess(
    null,
    function(changed) {
      if (btn) btn.disabled = false;
      if (result) {
        result.style.display = 'inline';
        result.style.color = changed > 0 ? 'var(--success)' : 'var(--muted)';
        result.textContent = changed > 0 ? changed + ' updated ✓' : 'Nothing to update';
        setTimeout(function() { result.style.display = 'none'; }, 4000);
      }
      renderTx();
      renderDashboard();
      toast('🤖 ' + changed + ' transaction' + (changed !== 1 ? 's' : '') + ' re-categorised');
    }
  );
}

function togglePerson(){
  const w=document.getElementById('tx-person-wrap');
  if(w)w.style.display=document.getElementById('tx-type').value==='income'?'':'none';
}

// ── Manual "Add Transaction" modal ───────────────────────────────
function openTxModal(){
  var m=document.getElementById('tx-add-modal');
  if(!m)return;
  var d=document.getElementById('tx-date'); if(d&&!d.value)d.value=today();
  populateCatSelect();   // fill category/subcategory selects for the current type
  togglePerson();        // show/hide the Earner field to match the type
  m.classList.add('open');
  var n=document.getElementById('tx-name'); if(n)setTimeout(function(){n.focus();},50);
}
function closeTxModal(){
  var m=document.getElementById('tx-add-modal');
  if(m)m.classList.remove('open');
  var pill=document.getElementById('tx-autocat-pill'); if(pill)pill.style.display='none';
}

function addTx(){
  const date=document.getElementById('tx-date').value;
  const type=document.getElementById('tx-type').value;
  const cat=document.getElementById('tx-cat').value;
  const subcat=document.getElementById('tx-subcat')?.value||'';
  const amt=parseFloat(document.getElementById('tx-amount').value);
  const person=document.getElementById('tx-person').value;
  const account=document.getElementById('tx-account')?.value||'';
  const name=document.getElementById('tx-name')?.value.trim()||'';
  const desc=document.getElementById('tx-desc').value.trim();
  if(!date||!amt||amt<=0){toast('⚠️ Enter date and amount');return;}
  var _resolvedCatId = cat||'other';
  var _resolvedSubcat = subcat;
  // If no category explicitly chosen, try AutoCat
  if((!cat||cat==='other') && name && typeof AutoCat !== 'undefined'){
    var _ac = AutoCat.categorise(name, desc, amt, type);
    if(_ac.confidence !== AutoCat.CONF_NONE && _ac.catId !== 'other'){
      _resolvedCatId = _ac.catId;
      if(!_resolvedSubcat && _ac.subcat) _resolvedSubcat = _ac.subcat;
    }
  }
  // If user explicitly chose a category, teach AutoCat
  if(cat && cat !== 'other' && name && typeof AutoCat !== 'undefined'){
    AutoCat.learn(name, cat, subcat);
  }
  var _addTxCatObj = LCATS.find(function(c){return c.id===_resolvedCatId;});
  var _addTxCatName = _addTxCatObj ? _addTxCatObj.name : _resolvedCatId;
  const newTx={id:Date.now(),date,type,category:_addTxCatName,subcat:_resolvedSubcat,amount:amt,person,account,name,description:desc,catId:_resolvedCatId};
  applyAutoRules(newTx);
  TX.unshift(newTx);
  save(K.tx,TX);
  document.getElementById('tx-amount').value='';
  document.getElementById('tx-desc').value='';
  const tn=document.getElementById('tx-name');if(tn)tn.value='';
  const ta=document.getElementById('tx-account');if(ta)ta.value='';
  closeTxModal();
  renderTx();renderDashboard();toast('✅ Transaction added');
  if(typeof qsCheckAndAutoComplete==='function')qsCheckAndAutoComplete();
}

function delTx(id){TX=TX.filter(t=>t.id!==id);save(K.tx,TX);renderTx();toast('🗑️ Deleted');}


function inlineAssignAccount(sel) {
  var txId = Number(sel.dataset.id);
  var t = TX.find(function(x) { return x.id === txId; });
  if (!t) return;
  t.account = sel.value;
  try { save(K.tx, TX); } catch(e) {}
}

function txClearFilters() {
  ['tx-filter-month','tx-filter-cat','tx-filter-subcat','tx-filter-account','tx-filter-type'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var sq = document.getElementById('tx-filter-search');
  if (sq) sq.value = '';
  renderTx();
}

function txFilterCatChanged() {
  // When type or category changes, rebuild the subcategory filter options
  var catSel = document.getElementById('tx-filter-cat');
  var subSel = document.getElementById('tx-filter-subcat');
  if (!subSel) return;
  var catId = catSel ? catSel.value : '';
  var cat = catId ? LCATS.find(function(c) { return c.id === catId; }) : null;
  var subcats = cat ? (cat.subcats || []) : [];
  // With no category selected, show every subcategory that exists on the
  // Categories tab (across all categories). We intersect with subcats actually
  // used in transactions so the filter stays useful, while dropping stale
  // subcats that no longer exist on the Categories tab.
  if (!catId) {
    var valid = new Set();
    LCATS.forEach(function(c){ (c.subcats || []).forEach(function(s){ valid.add(s); }); });
    subcats = [...new Set(TX.map(function(t){ return t.subcat||''; }).filter(Boolean))]
      .filter(function(s){ return valid.has(s); })
      .sort();
  }
  subSel.innerHTML = '<option value="">All Subcategories</option>'
    + subcats.map(function(s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
}

function buildTxCatFilter() {
  var sel = document.getElementById('tx-filter-cat');
  if (!sel) return;
  var cur = sel.value;
  var type = document.getElementById('tx-filter-type')?.value || '';
  // Only show categories that have transactions
  var usedCatIds = new Set(TX.map(function(t) { return t.catId || ''; }));
  var visible = LCATS.filter(function(c) {
    if (!usedCatIds.has(c.id)) return false;
    if (type && c.type !== 'both' && c.type !== type) return false;
    return true;
  });
  sel.innerHTML = '<option value="">All Categories</option>'
    + visible.map(function(c) {
        return '<option value="' + c.id + '"' + (c.id === cur ? ' selected' : '') + '>'
          + c.name + '</option>';
      }).join('');
}

function buildMonthFilter(){
  const sel=document.getElementById('tx-filter-month');
  if(!sel)return;
  const months=[...new Set(TX.map(t=>t.date.slice(0,7)))].sort().reverse();
  const cur=sel.value;
  sel.innerHTML='<option value="">All Time</option>'+months.map(m=>`<option value="${m}" ${m===cur?'selected':''}>${new Date(m+'-02').toLocaleString('default',{month:'long',year:'numeric'})}</option>`).join('');
}

// Shared date formatter + cache. Dates repeat heavily across rows, so a cached
// Intl.DateTimeFormat replaces the per-row `new Date().toLocaleDateString()`
// (measured: 102ms → ~2ms at 2,579 rows).
var TX_DATE_FMT = new Intl.DateTimeFormat('en-AU', { day:'numeric', month:'short', year:'numeric' });
var _txDateCache = Object.create(null);
function txFmtDate(d){
  var c = _txDateCache[d];
  if (c) return c;
  return (_txDateCache[d] = TX_DATE_FMT.format(new Date(d + 'T00:00:00')));
}

// Lazy-populate the inline row <select>s. Each row initially renders only its
// current option; the full option list is built on first interaction. mousedown
// (desktop) and focus (keyboard / iOS) both fire before the native dropdown
// reads its options, so the list is present in time. This removes ~85k <option>
// nodes at 2,579 rows — the single biggest render cost.
function txHydrateSelect(sel){
  if (sel.dataset.hydrated) return;
  sel.dataset.hydrated = '1';
  var t = TX.find(function(x){ return x.id === Number(sel.dataset.id); });
  if (!t) return;
  var field = sel.dataset.field || 'cat';
  var cur = sel.value;
  if (field === 'cat') {
    sel.innerHTML = buildCatOptions(t.catId || t.category);
  } else if (field === 'subcat') {
    sel.innerHTML = '<option value="">—</option>'
      + getSubcats(t.catId || t.category).map(function(s){
          return '<option value="' + s + '"' + (t.subcat === s ? ' selected' : '') + '>' + s + '</option>';
        }).join('');
  } else if (field === 'account') {
    var labels = { offset:'Offset', home:'Home', brenton:getUserName('brenton'), shelley:getUserName('shelley'), joint:'Joint' };
    sel.innerHTML = '<option value="">—</option>'
      + ['offset','home','brenton','shelley','joint'].map(function(a){
          return '<option value="' + a + '"' + (((t.account||t.person||'') === a) ? ' selected' : '') + '>' + labels[a] + '</option>';
        }).join('');
  }
  if (cur) sel.value = cur;
}

// Debounce the search box — its `oninput` fires renderTx on every keystroke,
// and each renderTx is a full table rebuild.
var _txSearchTimer = null;
function txSearchInput(){
  clearTimeout(_txSearchTimer);
  _txSearchTimer = setTimeout(renderTx, 180);
}

// ── Load-more windowing ──────────────────────────────────────────
// Rather than build all matching rows at once (~2,600 = ~135k DOM nodes), render
// a window of TX_PAGE rows and append the next page when the user scrolls near
// the bottom. Rows are only ever added, never recycled, so inline <select>s and
// checkbox state never get torn out from under the user.
var TX_PAGE = 100;            // rows rendered initially and per load-more step
var _txFiltered = [];         // full filtered+sorted set (may be far larger than what's rendered)
var _txWindow = TX_PAGE;      // how many rows are currently in the DOM
var _txFilterSig = null;      // filter fingerprint; a change resets the window to the top
var _txSelected = new Set();  // selected tx ids — spans the whole filtered set, not just visible rows
var _txObserver = null;       // IntersectionObserver that drives load-more
var _txLoadingMore = false;

// Build one transaction <tr>. Extracted from renderTx so load-more can append
// rows without a full re-render.
function txMakeRow(t){
  const tr=document.createElement('tr');
  tr.dataset.id=t.id;
  const isTr=isTransfer(t);
  if(isTr)tr.classList.add('transfer-excluded-row');
  const personBadge=t.type==='income'?'<span style="font-size:.68rem;background:var(--primary-bg);color:var(--pink-light);border-radius:99px;padding:2px 7px;font-weight:600;margin-left:5px">'+(t.person==='brenton'?getUserName('brenton').charAt(0):t.person==='shelley'?getUserName('shelley').charAt(0):'J')+'</span>':'';
  const rowColor=t.type==='income'?'var(--success)':'var(--primary)';
  const amtSign=t.type==='income'?'+':'-';
  const dateStr=txFmtDate(t.date);
  // Lazy selects: render only the current value; full lists build on interaction.
  const curCatId=catIdFor(t.catId||t.category);
  const curCatName=catNameFor(curCatId);
  const curSub=t.subcat||'';
  const acctLabels={offset:'Offset',home:'Home',brenton:getUserName('brenton'),shelley:getUserName('shelley'),joint:'Joint'};
  const curAcct=t.account||t.person||'';
  const curAcctLabel=acctLabels[curAcct]||'—';
  const lazyAttrs='onmousedown="txHydrateSelect(this)" onfocus="txHydrateSelect(this)"';
  tr.innerHTML='<td><input type="checkbox" class="tx-check tx-row-check" data-id="'+t.id+'"'+(_txSelected.has(t.id)?' checked':'')+' onchange="onTxRowCheck(this)" title="Select"/></td>'
    +'<td>'+dateStr+'</td>'
    +'<td><span class="badge '+(t.type==='income'?'b-income':'b-expense')+'">'+(t.type==='income'?'Income':'Expense')+'</span>'+personBadge+(isTr?' <span class="badge b-transfer">'+ICON('refresh')+'</span>':'')+'</td>'
    +'<td class="tx-cell-clip" style="font-weight:600;font-size:.84rem"'+(t.name?' title="'+esc(t.name)+'"':'')+'>'+(t.name||'—')+'</td>'
    +'<td><select class="tx-cat-sel" data-id="'+t.id+'" data-field="cat" '+lazyAttrs+' onchange="inlineAssignCat(this)"><option value="'+curCatId+'" selected>'+curCatName+'</option></select></td>'
    +'<td><select class="tx-cat-sel" data-id="'+t.id+'" data-field="subcat" '+lazyAttrs+' onchange="inlineAssignSubcat(this)"><option value="'+curSub+'" selected>'+(curSub||'—')+'</option></select></td>'
    +'<td class="tx-desc-cell" style="color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"'+(t.description?' title="'+esc(t.description)+'"':'')+'>'+(t.description||'—')+'</td>'
    +'<td><select class="tx-cat-sel" data-id="'+t.id+'" data-field="account" '+lazyAttrs+' onchange="inlineAssignAccount(this)"><option value="'+curAcct+'" selected>'+curAcctLabel+'</option></select></td>'
    +'<td style="font-weight:600;color:'+rowColor+'">'+amtSign+fmt(t.amount)+'</td>'
    +'<td><button class="del-btn" onclick="delTx('+t.id+')">'+ICON('trash')+'</button></td>';
  return tr;
}

// Row checkbox → keep the selection set in sync (survives load-more appends).
function onTxRowCheck(cb){
  var id=Number(cb.dataset.id);
  if(cb.checked) _txSelected.add(id); else _txSelected.delete(id);
  txSelectionChanged();
}
// Reflect the selection set in the bulk bar + header "select all" tri-state.
function txSelectionChanged(){
  var n=_txSelected.size, total=_txFiltered.length;
  var bar=document.getElementById('tx-bulk-bar');
  var lbl=document.getElementById('tx-bulk-count');
  var selAll=document.getElementById('tx-select-all');
  if(bar) bar.style.display=n?'flex':'none';
  if(lbl) lbl.textContent=(n>0&&n===total)?('All '+n+' selected'):(n+' selected');
  if(selAll){ selAll.indeterminate=n>0&&n<total; selAll.checked=n>0&&n>=total; }
}

// Load-more machinery -------------------------------------------------
function txStopObserver(){
  var s=document.getElementById('tx-sentinel'); if(s) s.remove();
  if(_txObserver) _txObserver.disconnect();
}
function txMountSentinel(tbody){
  var old=document.getElementById('tx-sentinel'); if(old) old.remove();
  if(_txObserver) _txObserver.disconnect();
  if(_txWindow>=_txFiltered.length) return; // everything is already rendered
  var tr=document.createElement('tr');
  tr.id='tx-sentinel';
  tr.innerHTML='<td colspan="10" style="padding:14px;text-align:center;color:var(--muted);font-size:.76rem;border:none">Loading more…</td>';
  tbody.appendChild(tr);
  if(!_txObserver){
    _txObserver=new IntersectionObserver(function(entries){
      for(var i=0;i<entries.length;i++){ if(entries[i].isIntersecting){ txLoadMore(); break; } }
    },{ root:null, rootMargin:'600px 0px' });
  }
  _txObserver.observe(tr);
}
function txLoadMore(){
  if(_txLoadingMore) return;
  var tbody=document.getElementById('tx-tbody'); if(!tbody) return;
  var start=_txWindow, end=Math.min(_txWindow+TX_PAGE,_txFiltered.length);
  if(start>=end) return;
  _txLoadingMore=true;
  var sentinel=document.getElementById('tx-sentinel');
  var frag=document.createDocumentFragment();
  for(var i=start;i<end;i++){ frag.appendChild(txMakeRow(_txFiltered[i])); }
  if(sentinel) tbody.insertBefore(frag,sentinel); else tbody.appendChild(frag);
  _txWindow=end;
  _txLoadingMore=false;
  txMountSentinel(tbody); // re-arm below the new rows, or remove the sentinel if done
}

function renderTx(){
  buildMonthFilter();
  buildTxCatFilter();
  populateTxCatSelect();
  const fm=document.getElementById('tx-filter-month')?.value||'';
  const ft=document.getElementById('tx-filter-type')?.value||'';
  const fc=document.getElementById('tx-filter-cat')?.value||'';
  const fs=document.getElementById('tx-filter-subcat')?.value||'';
  const fa=document.getElementById('tx-filter-account')?.value||'';
  const fq=(document.getElementById('tx-filter-search')?.value||'').toLowerCase().trim();
  let data=[...TX].sort((a,b)=>b.date.localeCompare(a.date));
  if(fm)data=data.filter(t=>t.date.startsWith(fm));
  if(ft)data=data.filter(t=>t.type===ft);
  if(fc)data=data.filter(t=>t.catId===fc||(t.category||'')===(LCATS.find(c=>c.id===fc)||{}).name);
  if(fs)data=data.filter(t=>(t.subcat||'')===fs);
  if(fa)data=data.filter(t=>(t.account||t.person||'')===fa);
  if(fq)data=data.filter(t=>(t.name||'').toLowerCase().includes(fq)||(t.description||'').toLowerCase().includes(fq)||(t.category||'').toLowerCase().includes(fq));
  // Show/hide clear-filters button
  const hasFilter=fm||ft||fc||fs||fa||fq;
  const cfBtn=document.getElementById('tx-clear-filters');
  if(cfBtn)cfBtn.style.display=hasFilter?'':'none';

  // ── Windowing: reset to the top when the filter changes, otherwise keep the
  // user's scroll depth across in-place re-renders (delete, bulk assign, add). ──
  _txFiltered = data;
  var _sig = [fm,ft,fc,fs,fa,fq].join('');
  if(_sig !== _txFilterSig){ _txFilterSig = _sig; _txWindow = TX_PAGE; _txSelected.clear(); }
  if(_txSelected.size){ // drop selected ids that are no longer in the filtered set
    var _present = new Set(data.map(function(t){ return t.id; }));
    _txSelected.forEach(function(id){ if(!_present.has(id)) _txSelected.delete(id); });
  }
  if(_txWindow > data.length) _txWindow = data.length;
  if(_txWindow < TX_PAGE) _txWindow = Math.min(TX_PAGE, data.length);

  const tbody=document.getElementById('tx-tbody');
  const empty=document.getElementById('tx-empty');
  tbody.innerHTML='';
  if(!data.length){empty.style.display='block';txStopObserver();updateTxBulkSelects();txSelectionChanged();return;}
  empty.style.display='none';
  updateTxBulkSelects();
  var _frag=document.createDocumentFragment();
  for(var _i=0;_i<_txWindow;_i++){ _frag.appendChild(txMakeRow(data[_i])); }
  tbody.appendChild(_frag);
  txMountSentinel(tbody);
  txSelectionChanged();
}


function populateTxCatSelect() {
  populateCatSelect();
}

// ══════════════════════════════════════════════════════════════
// BUDGET
// ══════════════════════════════════════════════════════════════
function setBudget(){
  const cat=document.getElementById('bud-cat').value;
  const lim=parseFloat(document.getElementById('bud-limit').value);
  if(!lim||lim<=0){toast('⚠️ Enter a limit');return;}
  BUDGETS[cat]=lim;save(K.budgets,BUDGETS);
  document.getElementById('bud-limit').value='';
  renderBudget();toast('✅ Budget saved');
}

function renderBudget(){
  const el=document.getElementById('bud-bars');
  if(!Object.keys(BUDGETS).length){el.innerHTML='<div class="empty"><div class="ei">'+ICON('target')+'</div><p>Set your first budget limit</p></div>';return;}
  el.innerHTML=Object.entries(BUDGETS).map(([cat,lim])=>{
    const spent=getCatSpend(cat);
    const pct=Math.min((spent/lim)*100,100);
    const cls=pct>=100?'over':pct>=70?'warn':'';
    return`<div class="prog-wrap">
      <div class="prog-hd"><span class="prog-lbl">${cat}</span><span class="prog-val">${fmt(spent)} / ${fmt(lim)}</span></div>
      <div class="prog-track"><div class="prog-fill ${cls}" style="width:${pct.toFixed(0)}%"></div></div>
      <div style="display:flex;justify-content:space-between;margin-top:3px"><span style="font-size:.7rem;color:var(--muted)">${pct.toFixed(0)}%</span>
      <button class="btn btn-ghost btn-sm" style="padding:3px 8px;font-size:.68rem" onclick="delBudget('${cat}')">Remove</button></div></div>`;
  }).join('');
}

function delBudget(cat){delete BUDGETS[cat];save(K.budgets,BUDGETS);renderBudget();toast('🗑️ Removed');}

// ══════════════════════════════════════════════════════════════
// BILLS
// ══════════════════════════════════════════════════════════════
