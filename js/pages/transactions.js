
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
  // Gather subcats that actually appear in transactions for this category
  if (!catId) {
    var allSubcats = [...new Set(TX.map(function(t){ return t.subcat||''; }).filter(Boolean))].sort();
    subcats = allSubcats;
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
          + c.icon + ' ' + c.name + '</option>';
      }).join('');
}

function buildMonthFilter(){
  const sel=document.getElementById('tx-filter-month');
  if(!sel)return;
  const months=[...new Set(TX.map(t=>t.date.slice(0,7)))].sort().reverse();
  const cur=sel.value;
  sel.innerHTML='<option value="">All Time</option>'+months.map(m=>`<option value="${m}" ${m===cur?'selected':''}>${new Date(m+'-02').toLocaleString('default',{month:'long',year:'numeric'})}</option>`).join('');
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

  // income summaries




  const tbody=document.getElementById('tx-tbody');
  const empty=document.getElementById('tx-empty');
  tbody.innerHTML='';
  if(!data.length){empty.style.display='block';return;}
  empty.style.display='none';
  updateTxBulkSelects();
  data.forEach(t=>{
    const tr=document.createElement('tr');
    tr.dataset.id=t.id;
    const isTr=isTransfer(t);
    if(isTr)tr.classList.add('transfer-excluded-row');
    const personBadge=t.type==='income'?'<span style="font-size:.68rem;background:var(--primary-bg);color:var(--pink-light);border-radius:99px;padding:2px 7px;font-weight:600;margin-left:5px">'+(t.person==='brenton'?getUserName('brenton').charAt(0):t.person==='shelley'?getUserName('shelley').charAt(0):'J')+'</span>':'';
    const catOpts=buildCatOptions(t.catId||t.category);
    const rowColor=t.type==='income'?'var(--success)':'var(--primary)';
    const amtSign=t.type==='income'?'+':'-';
    const dateStr=new Date(t.date+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
    const subcatBadge=t.subcat?'<span style="font-size:.7rem;color:var(--muted)">'+t.subcat+'</span>':'<span style="color:var(--border)">—</span>';
    tr.innerHTML='<td><input type="checkbox" class="tx-check tx-row-check" data-id="'+t.id+'" onchange="onTxCheck()" title="Select"/></td>'
      +'<td>'+dateStr+'</td>'
      +'<td><span class="badge '+(t.type==='income'?'b-income':'b-expense')+'">'+(t.type==='income'?'Income':'Expense')+'</span>'+personBadge+(isTr?' <span class="badge b-transfer">'+ICON('refresh')+'</span>':'')+'</td>'
      +'<td style="font-weight:600;font-size:.84rem">'+(t.name||'—')+'</td>'
      +'<td><select class="tx-cat-sel" data-id="'+t.id+'" onchange="inlineAssignCat(this)">'+catOpts+'</select></td>'
      +'<td>'
        +('<select class="tx-cat-sel" data-id="'+t.id+'" data-field="subcat" onchange="inlineAssignSubcat(this)">'
          +'<option value="">—</option>'
          +(getSubcats(t.catId||t.category).map(function(s){return '<option value="'+s+'"'+(t.subcat===s?' selected':'')+'>'+s+'</option>';}).join(''))
          +'</select>')
      +'</td>'
      +'<td style="color:var(--muted);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(t.description||'—')+'</td>'
      +'<td>'
      +('<select class="tx-cat-sel" data-id="'+t.id+'" data-field="account" onchange="inlineAssignAccount(this)">'
        +'<option value="">—</option>'
        +['offset','home','brenton','shelley','joint'].map(function(a){
            var labels={'offset':'Offset','home':'Home','brenton':getUserName('brenton'),'shelley':getUserName('shelley'),'joint':'Joint'};
            return '<option value="'+a+'"'+(( t.account||t.person||'')=== a?' selected':'')+'>'+labels[a]+'</option>';
          }).join('')
        +'</select>')
      +'</td>'
      +'<td style="font-weight:600;color:'+rowColor+'">'+amtSign+fmt(t.amount)+'</td>'
      +'<td><button class="del-btn" onclick="delTx('+t.id+')">'+ICON('trash')+'</button></td>';
    tbody.appendChild(tr);
  });

  const inc=activeTX().reduce((s,t)=>t.type==='income'?s+Number(t.amount):s,0);
  const exp=activeTX().reduce((s,t)=>t.type==='expense'?s+Number(t.amount):s,0);
  const bal=inc-exp;
  document.getElementById('tx-balance').textContent=fmt(bal);
  document.getElementById('tx-balance').style.color=bal>=0?'var(--primary)':'var(--danger)';
  document.getElementById('tx-inc-total').textContent=fmt(inc);
  document.getElementById('tx-exp-total').textContent=fmt(exp);
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
