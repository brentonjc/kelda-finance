// ══════════════════════════════════════════════════════════════
function addBill(){
  const name=document.getElementById('bill-name').value.trim();
  const amount=parseFloat(document.getElementById('bill-amount').value);
  const due=parseInt(document.getElementById('bill-due').value);
  const icon=document.getElementById('bill-icon').value;
  if(!name||!amount||!due){toast('⚠️ Fill in all fields');return;}
  BILLS.push({id:Date.now(),name,amount,due,icon,paid:false});save(K.bills,BILLS);
  document.getElementById('bill-name').value='';document.getElementById('bill-amount').value='';document.getElementById('bill-due').value='';
  renderBills();toast('✅ Bill added');
}

function toggleBillPaid(id){
  const b=BILLS.find(b=>b.id===id);if(b){b.paid=!b.paid;save(K.bills,BILLS);renderBills();}
}
function delBill(id){BILLS=BILLS.filter(b=>b.id!==id);save(K.bills,BILLS);renderBills();toast('🗑️ Deleted');}

function renderBills(){
  const today_d=new Date().getDate();
  const total=BILLS.reduce((s,b)=>s+Number(b.amount),0);
  const paid=BILLS.filter(b=>b.paid).length;
  const unpaidAmt=BILLS.filter(b=>!b.paid).reduce((s,b)=>s+Number(b.amount),0);
  document.getElementById('bills-summary').innerHTML=`
    <div class="dr"><span class="dr-k">Total Monthly Bills</span><span class="dr-v">${fmt(total)}</span></div>
    <div class="dr"><span class="dr-k">Paid This Month</span><span class="dr-v" style="color:var(--success)">${paid} / ${BILLS.length}</span></div>
    <div class="dr"><span class="dr-k">Still Unpaid</span><span class="dr-v" style="color:var(--primary)">${fmt(unpaidAmt)}</span></div>`;

  const el=document.getElementById('bills-list');
  if(!BILLS.length){el.innerHTML='<div class="empty"><div class="ei">📅</div><p>No bills yet</p></div>';return;}
  const sorted=[...BILLS].sort((a,b)=>a.due-b.due);
  el.innerHTML=sorted.map(b=>{
    const over=!b.paid&&b.due<today_d;
    const dlbl=b.due===today_d?'Today!':b.due<today_d?(b.paid?'Paid':'Overdue'):`Due ${b.due}${ord(b.due)}`;
    const bc=b.paid?'b-paid':over?'b-overdue':'b-due';
    return`<div class="bill-card" style="${b.paid?'opacity:.55':''}">
      <div class="bill-icon" style="background:${b.paid?'var(--success-bg)':over?'var(--danger-bg)':'var(--warn-bg)'}">${b.icon}</div>
      <div class="bill-info"><div class="bill-name">${b.name}</div>
        <div class="bill-meta"><span class="badge ${bc}">${dlbl}</span></div></div>
      <div class="bill-amt">${fmt(b.amount)}</div>
      <div class="bill-actions">
        <button class="btn btn-sm ${b.paid?'btn-ghost':'btn-primary'}" onclick="toggleBillPaid(${b.id})">${b.paid?'↩ Undo':'✔ Paid'}</button>
        <button class="del-btn" onclick="delBill(${b.id})">🗑</button>
      </div></div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// MORTGAGE
// ══════════════════════════════════════════════════════════════
