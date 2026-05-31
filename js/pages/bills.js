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
  var due=parseInt(document.getElementById('bill-due').value);
  var icon=document.getElementById('bill-icon').value;
  var frequency=(document.getElementById('bill-frequency')||{}).value||'monthly';
  if(!name||!amount||!due){toast('⚠️ Fill in all fields');return;}
  try{BILLS.push({id:Date.now(),name,amount,due,icon,frequency,paid:false});save(K.bills,BILLS);}catch(e){toast('⚠️ Could not save');return;}
  document.getElementById('bill-name').value='';document.getElementById('bill-amount').value='';document.getElementById('bill-due').value='';
  renderBills();toast('✅ Bill added');
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
  var recurring = typeof LRECURRING !== 'undefined' ? LRECURRING : [];
  var candidates = recurring.filter(function(r) {
    if (!r.description && !r.merchant) return false;
    var nm = ((r.description || r.merchant || r.name || '')).toLowerCase();
    var cat = (r.catId || r.category || '').toLowerCase();
    var catMatch = BILL_SUGGEST_CATS.some(function(c){ return cat.indexOf(c) !== -1; });
    var kwMatch  = BILL_SUGGEST_KWORDS.some(function(k){ return nm.indexOf(k) !== -1; });
    return catMatch || kwMatch;
  });
  // Filter out ones already in BILLS (by name similarity)
  candidates = candidates.filter(function(r) {
    var nm = (r.description || r.merchant || r.name || '').toLowerCase();
    return !BILLS.some(function(b){ return b.name.toLowerCase().indexOf(nm.slice(0,6)) !== -1; });
  });
  if (!candidates.length) { el.innerHTML = ''; return; }
  var html = '<div class="card mb">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">';
  html += '<div><div class="section-label" style="margin-bottom:2px">💡 Suggested Bills</div>';
  html += '<div style="font-size:.74rem;color:var(--muted)">Detected from your recurring transactions — click to add</div></div>';
  html += '</div>';
  html += '<div style="display:flex;flex-direction:column;gap:8px">';
  candidates.slice(0, 8).forEach(function(r, i) {
    var nm   = r.description || r.merchant || r.name || 'Unknown';
    var amt  = r.avgAmount || r.amount || 0;
    var icon = billSuggestIcon(nm, r.catId || r.category);
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
