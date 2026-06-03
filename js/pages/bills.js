// ══════════════════════════════════════════════════════════════
// BILLS
// ══════════════════════════════════════════════════════════════

var BILL_FREQ_LABELS = {
  'monthly':'Monthly', 'fortnightly':'Fortnightly',
  'quarterly':'Quarterly', 'yearly':'Yearly', 'weekly':'Weekly'
};

function addBill(){
  var name=document.getElementById('bill-name').value.trim();
  var amount=parseFloat(document.getElementById('bill-amount').value);
  var dueDateVal=document.getElementById('bill-due').value; // YYYY-MM-DD from date picker
  var due=dueDateVal?parseInt(dueDateVal.split('-')[2])||1:0;
  var icon=document.getElementById('bill-icon').value;
  var frequency=(document.getElementById('bill-frequency')||{}).value||'monthly';
  if(!name||!amount||!due){toast('⚠️ Fill in name, amount and due date');return;}
  try{BILLS.push({id:Date.now(),name,amount,due,icon,frequency,paid:false});save(K.bills,BILLS);}catch(e){toast('⚠️ Could not save');return;}
  document.getElementById('bill-name').value='';document.getElementById('bill-amount').value='';document.getElementById('bill-due').value='';
  renderBills();toast('✅ Bill added');
  if(typeof qsCheckAndAutoComplete==='function')qsCheckAndAutoComplete();
}

// Auto-detect bills from recurring transactions
var BILL_SUGGEST_CATS = ['insurance','phone','mobile','utilities','childcare','internet','streaming','subscriptions'];
var BILL_SUGGEST_KWORDS = [
  // Insurance
  'insurance','insur','allianz','nrma','bupa','medibank','ahm','hcf','nib','frank health',
  // Phone / mobile
  'telstra','optus','vodafone','aldi mobile','boost mobile','amaysim','dodo mobile','belong mobile',
  // Utilities
  'electricity','energy','gas bill','power bill','agl','origin energy','energex','alinta','ausgrid','jemena',
  // Childcare
  'childcare','child care','kindy','kindergarten','daycare','day care','c&k','goodstart',
  // Internet / broadband
  'broadband','internet','iinet','aussie broadband','tpg','superloop','tangerine'
];

function billSuggestIcon(name, cat) {
  var n = (name||'').toLowerCase();
  if (/insurance|insur|bupa|medibank|nrma|allianz|ahm|hcf|nib/.test(n) || cat === 'insurance') return '❤️';
  if (/phone|mobile|telstra|optus|vodafone|amaysim|boost/.test(n) || cat === 'phone' || cat === 'mobile') return '📱';
  if (/electricity|energy|gas|power|agl|origin|alinta|ausgrid/.test(n) || cat === 'utilities') return '💡';
  if (/childcare|kindy|kindergarten|daycare|goodstart|c&k/.test(n) || cat === 'childcare') return '👶';
  if (/internet|broadband|iinet|aussie|tpg|superloop/.test(n) || cat === 'internet') return '📡';
  return '🧾';
}

function suggestBillsFromRecurring() {
  var el = document.getElementById('bills-suggestions');
  if (!el) return;

  // Source 1: LRECURRING (from forecast detection)
  var fromRecurring = (typeof LRECURRING !== 'undefined' ? LRECURRING : []).filter(function(r) {
    var nm  = ((r.description || r.merchant || r.name || '')).toLowerCase();
    var cat = (r.catId || r.category || '').toLowerCase();
    return BILL_SUGGEST_CATS.some(function(c){ return cat.indexOf(c) !== -1; })
        || BILL_SUGGEST_KWORDS.some(function(k){ return nm.indexOf(k) !== -1; });
  }).map(function(r) {
    return { description: r.description || r.merchant || r.name, amount: r.avgAmount || r.amount || 0,
             catId: r.catId || r.category, frequency: r.frequency || 'monthly', _src: 'recurring' };
  });

  // Source 2: scan TX directly for keyword matches (catches bills not yet in LRECURRING)
  var seen = {};
  var fromTx = (typeof TX !== 'undefined' ? TX : []).filter(function(t) {
    if (t.type !== 'expense') return false;
    var nm  = ((t.description || t.category || t.name || '')).toLowerCase();
    var cat = (t.catId || t.category || '').toLowerCase();
    var match = BILL_SUGGEST_CATS.some(function(c){ return cat.indexOf(c) !== -1; })
             || BILL_SUGGEST_KWORDS.some(function(k){ return nm.indexOf(k) !== -1; });
    if (!match) return false;
    var key = nm.slice(0, 12);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  }).map(function(t) {
    return { description: t.description || t.category, amount: Math.abs(Number(t.amount)),
             catId: t.catId || t.category, frequency: 'monthly', _src: 'tx' };
  });

  // Merge, deduplicate against each other
  var allSeenNames = {};
  fromRecurring.forEach(function(r){ allSeenNames[((r.description||'').slice(0,8)).toLowerCase()] = true; });
  var txExtra = fromTx.filter(function(t){
    return !allSeenNames[((t.description||'').slice(0,8)).toLowerCase()];
  });
  var combined = fromRecurring.concat(txExtra);

  // Filter out bills already added
  var candidates = combined.filter(function(r) {
    var nm = (r.description || '').toLowerCase();
    return !BILLS.some(function(b){ return b.name.toLowerCase().indexOf(nm.slice(0,6)) !== -1; });
  });

  if (!candidates.length) { el.innerHTML = ''; return; }

  var html = '<div class="card mb">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">';
  html += '<div><div class="section-label" style="margin-bottom:2px">💡 Suggested Bills</div>';
  html += '<div style="font-size:.74rem;color:var(--muted)">Detected from your transactions — click to add</div></div>';
  html += '</div>';
  html += '<div style="display:flex;flex-direction:column;gap:8px">';
  candidates.slice(0, 8).forEach(function(r, i) {
    var nm   = r.description || 'Unknown';
    var amt  = r.amount || 0;
    var icon = billSuggestIcon(nm, r.catId);
    var freq = r.frequency || 'monthly';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--card2);border-radius:10px;gap:10px">';
    html += '<div style="display:flex;align-items:center;gap:10px">';
    html += '<span style="font-size:1.3rem">' + icon + '</span>';
    html += '<div><div style="font-weight:600;font-size:.88rem">' + nm + '</div>';
    html += '<div style="font-size:.74rem;color:var(--muted)">' + (BILL_FREQ_LABELS[freq] || 'Monthly') + ' · ~' + Number(amt).toLocaleString('en-AU',{style:'currency',currency:'AUD'}) + '</div></div>';
    html += '</div>';
    html += '<button class="btn btn-primary btn-sm" onclick="billAddSuggestion(' + i + ')">+ Add</button>';
    html += '</div>';
  });
  html += '</div></div>';
  el._candidates = candidates;
  el.innerHTML = html;
}

function billAddSuggestion(i) {
  var el = document.getElementById('bills-suggestions');
  if (!el || !el._candidates) return;
  var r   = el._candidates[i];
  var nm  = r.description || r.merchant || r.name || 'Bill';
  var amt = r.avgAmount || r.amount || 0;
  var icon= billSuggestIcon(nm, r.catId || r.category);
  var freq= r.frequency || 'monthly';
  try {
    BILLS.push({id:Date.now(),name:nm,amount:amt,due:1,icon:icon,frequency:freq,paid:false});
    save(K.bills, BILLS);
  } catch(e) { toast('⚠️ Could not save'); return; }
  renderBills();
  toast('✅ ' + nm + ' added to Bills');
}

function toggleBillPaid(id){
  const b=BILLS.find(b=>b.id===id);if(b){b.paid=!b.paid;save(K.bills,BILLS);renderBills();}
}
function delBill(id){BILLS=BILLS.filter(b=>b.id!==id);save(K.bills,BILLS);renderBills();toast('🗑️ Deleted');}

function renderBills(){
  // Run auto-detect first
  suggestBillsFromRecurring();

  var today_d=new Date().getDate();
  var total=BILLS.reduce(function(s,b){return s+Number(b.amount);},0);
  var paid=BILLS.filter(function(b){return b.paid;}).length;
  var unpaidAmt=BILLS.filter(function(b){return !b.paid;}).reduce(function(s,b){return s+Number(b.amount);},0);
  document.getElementById('bills-summary').innerHTML=
    '<div class="dr"><span class="dr-k">Total Monthly Bills</span><span class="dr-v">'+fmt(total)+'</span></div>'
    +'<div class="dr"><span class="dr-k">Paid This Month</span><span class="dr-v" style="color:var(--success)">'+paid+' / '+BILLS.length+'</span></div>'
    +'<div class="dr"><span class="dr-k">Still Unpaid</span><span class="dr-v" style="color:var(--primary)">'+fmt(unpaidAmt)+'</span></div>';

  var el=document.getElementById('bills-list');
  if(!BILLS.length){el.innerHTML='<div class="empty"><div class="ei">📅</div><p>No bills yet</p></div>';return;}
  var sorted=[].concat(BILLS).sort(function(a,b){return a.due-b.due;});
  el.innerHTML=sorted.map(function(b){
    var over=!b.paid&&b.due<today_d;
    var dlbl=b.due===today_d?'Today!':b.due<today_d?(b.paid?'Paid':'Overdue'):'Due '+b.due+ord(b.due);
    var bc=b.paid?'b-paid':over?'b-overdue':'b-due';
    var freqLbl=BILL_FREQ_LABELS[b.frequency||'monthly']||'Monthly';
    return '<div class="bill-card" style="'+(b.paid?'opacity:.55':'')+'">'+
      '<div class="bill-icon" style="background:'+(b.paid?'var(--success-bg)':over?'var(--danger-bg)':'var(--warn-bg)')+'">'+b.icon+'</div>'+
      '<div class="bill-info"><div class="bill-name">'+b.name+'</div>'+
      '<div class="bill-meta"><span class="badge '+bc+'">'+dlbl+'</span>'+
      '<span style="font-size:.7rem;color:var(--muted);margin-left:6px">'+freqLbl+'</span></div></div>'+
      '<div class="bill-amt">'+fmt(b.amount)+'</div>'+
      '<div class="bill-actions">'+
      '<button class="btn btn-sm '+(b.paid?'btn-ghost':'btn-primary')+'" onclick="toggleBillPaid('+b.id+')">'+(b.paid?'↩ Undo':'✔ Paid')+'</button>'+
      '<button class="del-btn" onclick="delBill('+b.id+')">🗑</button>'+
      '</div></div>';
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// MORTGAGE
// ══════════════════════════════════════════════════════════════
