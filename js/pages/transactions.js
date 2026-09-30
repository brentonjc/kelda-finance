
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

// ── Add / Edit Transaction modal ─────────────────────────────────
// One modal serves both: openTxModal() adds, openTxModal(id) edits that transaction.
var _txEditId = null;      // id being edited, or null when adding
var _txModalWasEdit = false; // last open was an edit → clear its values before the next add

function txSetModalMode(editing){
  var set=function(id,txt){var el=document.getElementById(id);if(el)el.textContent=txt;};
  set('tx-modal-title', editing?'Edit Transaction':'＋ Add Transaction');
  set('tx-modal-sub', editing?'Update or delete this transaction':'Manually log an income or expense for either profile');
  set('tx-save-btn', editing?'Save changes':'＋ Add Transaction');
  var del=document.getElementById('tx-del-btn'); if(del)del.style.display=editing?'':'none';
}
function txFillForm(t){
  var v=function(id,val){var el=document.getElementById(id);if(el)el.value=val;};
  v('tx-date', t.date||today());
  v('tx-type', t.type||'expense');
  v('tx-name', t.name||'');
  v('tx-amount', t.amount!=null?t.amount:'');
  v('tx-desc', t.description||'');
  v('tx-account', t.account||'');
  v('tx-person', t.person||'brenton');
  populateCatSelect();
  if(t.catId||t.category){ v('tx-cat', catIdFor(t.catId||t.category)); refreshSubcatSelect(); }
  v('tx-subcat', t.subcat||'');
}

function openTxModal(id){
  var m=document.getElementById('tx-add-modal');
  if(!m)return;
  var t=id!=null?TX.find(function(x){return x.id===id;}):null;
  _txEditId=t?t.id:null;
  if(t){
    txFillForm(t);
  } else {
    // New entry: expense is the common case. Clear leftovers from a previous edit;
    // otherwise keep a cancelled draft so an accidental close doesn't lose typing.
    if(_txModalWasEdit) txFillForm({type:'expense'});
    else { var ty=document.getElementById('tx-type'); if(ty)ty.value='expense'; populateCatSelect(); }
    var d=document.getElementById('tx-date'); if(d&&!d.value)d.value=today();
  }
  _txModalWasEdit=!!t;
  txSetModalMode(!!t);
  togglePerson();        // show/hide the Earner field to match the type
  m.classList.add('open');
  // Don't pop the keyboard over a record the user is only reviewing
  if(!t){ var n=document.getElementById('tx-name'); if(n)setTimeout(function(){n.focus();},50); }
}
function closeTxModal(){
  var m=document.getElementById('tx-add-modal');
  if(m)m.classList.remove('open');
  var pill=document.getElementById('tx-autocat-pill'); if(pill)pill.style.display='none';
  _txEditId=null;
}
function txQuickAmount(n){
  var a=document.getElementById('tx-amount'); if(a)a.value=n;
}
function txDeleteFromModal(){
  if(_txEditId==null)return;
  var id=_txEditId;
  if(!confirm('Delete this transaction? This can\'t be undone.'))return;
  closeTxModal();
  delTx(id);
  if(typeof renderDashboard==='function')renderDashboard();
}
// Card tap (mobile only) → edit, or toggle selection in Select mode.
// Ignores taps on the card's own controls; desktop keeps its table behaviour.
function txRowTap(e,id){
  if(!txIsCardLayout())return;
  if(e.target.closest('select,input,button,a,label'))return;
  if(document.querySelector('.tx-table.tx-selecting')){
    var cb=e.currentTarget.querySelector('.tx-row-check');
    if(cb){ cb.checked=!cb.checked; onTxRowCheck(cb); }
    return;
  }
  openTxModal(id);
}
// Same query as the layout.css mobile block
function txIsCardLayout(){
  return window.matchMedia('(max-width:759px), (pointer:coarse) and (max-height:500px)').matches;
}
// Mobile "Select" toggle — reveals row checkboxes + the bulk bar
function txToggleSelectMode(){
  var tbl=document.querySelector('.tx-table'); if(!tbl)return;
  var on=tbl.classList.toggle('tx-selecting');
  var b=document.getElementById('tx-select-toggle');
  if(b){ b.innerHTML=on?'<i class="ti ti-x"></i> Done':'<i class="ti ti-checkbox"></i> Select'; b.setAttribute('aria-pressed',on); }
  if(!on && typeof clearTxSelection==='function') clearTxSelection();
}
// Badge on the mobile Filter button: how many dropdown filters are active
// (search stays visible on phones, so it isn't counted)
function txUpdateFilterCount(n){
  var c=document.getElementById('tx-filter-count'); if(!c)return;
  c.textContent=n?String(n):''; c.style.display=n?'':'none';
}
// Mobile "Filter" toggle — the filter row is collapsed by default on phones
function txToggleFilters(){
  var f=document.getElementById('tx-filters'); if(!f)return;
  var on=f.classList.toggle('tx-filters--open');
  var b=document.getElementById('tx-filter-toggle'); if(b)b.setAttribute('aria-expanded',on);
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
  // Edit mode: update the existing record in place, keeping its id and any
  // import metadata. Auto-rules aren't re-run so they can't undo the user's edit.
  if(_txEditId!=null){
    var et=TX.find(function(x){return x.id===_txEditId;});
    if(et){
      var prevCat=catIdFor(et.catId||et.category);
      var catObj=LCATS.find(function(c){return c.id===cat;});
      et.date=date; et.type=type; et.amount=amt; et.person=person; et.account=account;
      et.name=name; et.description=desc; et.subcat=subcat;
      if(cat){ et.catId=cat; et.category=catObj?catObj.name:cat; }
      if(cat && cat!==prevCat){
        et.userSet=true;
        if(cat!=='other' && name && typeof AutoCat!=='undefined') AutoCat.learn(name, cat, subcat);
      }
      save(K.tx,TX);
      closeTxModal();
      renderTx();renderDashboard();toast('✅ Transaction updated');
    }
    return;
  }
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
  tr.addEventListener('click',function(e){txRowTap(e,t.id);});
  const isTr=isTransfer(t);
  if(isTr)tr.classList.add('transfer-excluded-row');
  const personBadge=t.type==='income'?'<span class="tx-person-badge">'+(t.person==='brenton'?getUserName('brenton').charAt(0):t.person==='shelley'?getUserName('shelley').charAt(0):'J')+'</span>':'';
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
    +'<td class="tx-cell-clip tx-cell-name"'+(t.name?' title="'+esc(t.name)+'"':'')+'>'+(t.name||'—')+'</td>'
    +'<td><select class="tx-cat-sel" data-id="'+t.id+'" data-field="cat" '+lazyAttrs+' onchange="inlineAssignCat(this)"><option value="'+curCatId+'" selected>'+curCatName+'</option></select></td>'
    +'<td><select class="tx-cat-sel" data-id="'+t.id+'" data-field="subcat" '+lazyAttrs+' onchange="inlineAssignSubcat(this)"><option value="'+curSub+'" selected>'+(curSub||'—')+'</option></select></td>'
    +'<td class="tx-desc-cell"'+(t.description?' title="'+esc(t.description)+'"':'')+'>'+(t.description||'—')+'</td>'
    +'<td><select class="tx-cat-sel" data-id="'+t.id+'" data-field="account" '+lazyAttrs+' onchange="inlineAssignAccount(this)"><option value="'+curAcct+'" selected>'+curAcctLabel+'</option></select></td>'
    +'<td class="tx-amt tx-amt--'+(t.type==='income'?'income':'expense')+'">'+amtSign+fmt(t.amount)+'</td>'
    +'<td><button class="del-btn" onclick="delTx('+t.id+')">'+ICON('trash')+'</button></td>';
  return tr;
}

// Month divider row — shown only in the mobile card layout (hidden on desktop in CSS).
// Rows are sorted newest-first, so a divider goes wherever the YYYY-MM changes.
var TX_MONTH_FMT = new Intl.DateTimeFormat('en-AU', { month:'long', year:'numeric' });
function txAppendRows(frag, from, to){
  var prev = from>0 ? _txFiltered[from-1].date.slice(0,7) : null;
  for(var i=from;i<to;i++){
    var t=_txFiltered[i], ym=t.date.slice(0,7);
    if(ym!==prev){
      var mr=document.createElement('tr');
      mr.className='tx-month-row';
      mr.innerHTML='<td colspan="10">'+TX_MONTH_FMT.format(new Date(ym+'-01T00:00:00'))+'</td>';
      frag.appendChild(mr);
      prev=ym;
    }
    frag.appendChild(txMakeRow(t));
  }
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
  tr.innerHTML='<td colspan="10">Loading more…</td>';
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
  txAppendRows(frag,start,end);
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
  txUpdateFilterCount([fm,ft,fc,fs,fa].filter(Boolean).length);

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
  txAppendRows(_frag,0,_txWindow);
  tbody.appendChild(_frag);
  txMountSentinel(tbody);
  txSelectionChanged();
}


function populateTxCatSelect() {
  populateCatSelect();
}

// ══════════════════════════════════════════════════════════════
// BILLS
// ══════════════════════════════════════════════════════════════
