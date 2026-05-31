// ══════════════════════════════════════════════════════════════
// GOALS PAGE
// ══════════════════════════════════════════════════════════════

// Build account select HTML with live CT balances as hints
function _goalAccountSelect(selectedVal) {
  var accts = [
    { id: 'offset', def: 'Offset Account' },
    { id: 'home',   def: 'Home Transaction' },
    { id: 'sav1',   def: 'Savings Account 1' },
    { id: 'sav2',   def: 'Savings Account 2' }
  ];
  var html = '<select id="g-account"><option value="">— None —</option>';
  accts.forEach(function(a) {
    var name = typeof getAccountName === 'function' ? getAccountName(a.id) : a.def;
    var bal  = _goalCtBalance(a.id);
    var hint = bal !== null ? ' · ' + Number(bal).toLocaleString('en-AU', {style:'currency',currency:'AUD'}) : '';
    var sel  = (selectedVal === a.id) ? ' selected' : '';
    html += '<option value="' + a.id + '"' + sel + '>' + name + hint + '</option>';
  });
  html += '</select>';
  return html;
}

// Get current balance — prefer live CT balance when a linked account is set
function _goalCtBalance(acctId) {
  if (!acctId) return null;
  try {
    var months = typeof ctAllMonths === 'function' ? ctAllMonths() : [];
    if (!months.length) return null;
    var lm = months[months.length - 1];
    var bal = (CT[acctId] || {})[lm];
    return (bal !== undefined && bal !== null) ? Number(bal) : null;
  } catch(e) { return null; }
}
function _goalCurrent(g) {
  var ctBal = _goalCtBalance(g.linkedAccount);
  if (ctBal !== null) return ctBal;
  return Number(g.currentAmount) || Number(g.saved) || 0;
}
function _goalTarget(g){ return Number(g.targetAmount)||Number(g.target)||0; }

function renderGoalsPage(){
  const el=document.getElementById('goals-content');if(!el)return;
  const totalSaved=GOALS.reduce((s,g)=>s+_goalCurrent(g),0);
  const totalTarget=GOALS.reduce((s,g)=>s+_goalTarget(g),0);
  el.innerHTML=`
    <div class="g3 mb">
      <div class="card" style="text-align:center">
        <div style="font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Goals</div>
        <div style="font-size:1.6rem;font-weight:700;color:var(--primary)">${GOALS.length}</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Total Saved</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--success);font-family:var(--font-mono)">${fmtAUD(totalSaved)}</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Total Target</div>
        <div style="font-size:1.3rem;font-weight:700;font-family:var(--font-mono)">${fmtAUD(totalTarget)}</div>
      </div>
    </div>
    <div id="goals-cards-list"></div>
    <div class="card" style="margin-top:16px">
      <div class="section-label">Add New Goal</div>
      <div class="form-grid">
        <div><label class="lbl">Goal Name</label><input type="text" id="g-name" placeholder="e.g. Emergency Fund"/></div>
        <div><label class="lbl">Icon</label><input type="text" id="g-icon" placeholder="🏖️" maxlength="4" style="max-width:80px"/></div>
      </div>
      <div class="form-grid">
        <div><label class="lbl">Target Amount (AUD)</label><input type="number" id="g-target" placeholder="10000" min="0" step="100" inputmode="decimal"/></div>
        <div><label class="lbl">Target Date (optional)</label><input type="date" id="g-date"/></div>
      </div>
      <div class="form-grid">
        <div><label class="lbl">Linked Account <span style="font-size:.7rem;color:var(--muted)">(balance syncs from Cash Tracker)</span></label>
          ${_goalAccountSelect()}
        </div>
      </div>
      <button class="btn btn-primary" onclick="addGoalFromPage()">➕ Add Goal</button>
    </div>`;
  renderGoalCards();
}

function renderGoalCards(){
  const el=document.getElementById('goals-cards-list');if(!el)return;
  if(!GOALS.length){
    el.innerHTML='<div class="empty"><div class="ei">🎯</div><p>No goals yet — add your first goal below.</p></div>';
    return;
  }
  el.innerHTML=GOALS.map((g,i)=>{
    const current=_goalCurrent(g);
    const target=_goalTarget(g);
    const pct=target>0?Math.min((current/target)*100,100):0;
    const rem=Math.max(0,target-current);
    const barCls=pct>=100?'over':pct>=75?'warn':'';
    const proj=_goalProjection(g,current,target);
    var isCtLinked = g.linkedAccount && _goalCtBalance(g.linkedAccount) !== null;
    var acctName = isCtLinked && typeof getAccountName === 'function' ? getAccountName(g.linkedAccount) : '';
    return`<div class="goal-card" style="margin-bottom:12px">
      <div class="goal-hd">
        <div>
          <div class="goal-name">${g.icon||'🎯'} ${pct>=100?'✅ ':''}${g.name}</div>
          <div style="font-size:.74rem;color:var(--muted);margin-top:2px;font-family:var(--font-mono)">${fmtAUD(current)} saved of ${fmtAUD(target)}${isCtLinked?' · <span style="color:var(--success);font-size:.7rem">🔗 '+acctName+'</span>':''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="goal-pct">${pct.toFixed(0)}%</div>
          <button class="del-btn" onclick="delGoalItem(${g.id})">🗑</button>
        </div>
      </div>
      <div class="prog-track" style="height:10px"><div class="prog-fill ${barCls}" style="width:${pct.toFixed(0)}%"></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:8px">
        <div style="font-size:.75rem;color:var(--muted)">${pct>=100?'🎉 Goal reached!':(rem>0?fmtAUD(rem)+' to go':'')}${proj?' · '+proj:''}</div>
        <button class="btn btn-ghost btn-sm" onclick="openGoalModal(${i})">✏️ Update</button>
      </div>
    </div>`;
  }).join('');
}

function _goalProjection(g,current,target){
  if(target<=0||current>=target)return'';
  const rem=target-current;
  if(g.targetDate){
    const d=new Date(g.targetDate);
    return'Target: '+d.toLocaleDateString('en-AU',{month:'short',year:'numeric'});
  }
  const rate=500;
  const months=Math.ceil(rem/rate);
  const proj=new Date();
  proj.setMonth(proj.getMonth()+months);
  return'On track for '+proj.toLocaleDateString('en-AU',{month:'short',year:'numeric'});
}

function fmtAUD(n){
  return Number(n).toLocaleString('en-AU',{style:'currency',currency:'AUD'});
}

function addGoalFromPage(){
  const name=document.getElementById('g-name').value.trim();
  const targetAmount=parseFloat(document.getElementById('g-target').value);
  const icon=document.getElementById('g-icon').value.trim()||'🎯';
  const targetDate=document.getElementById('g-date').value;
  const linkedAccount=document.getElementById('g-account').value;
  if(!name||!targetAmount){toast('⚠️ Enter goal name and target amount');return;}
  try{
    GOALS.push({id:Date.now(),name,icon,targetAmount,currentAmount:0,targetDate,linkedAccount,createdAt:new Date().toISOString().split('T')[0]});
    save(K.goals,GOALS);
  }catch(e){toast('⚠️ Could not save goal');return;}
  document.getElementById('g-name').value='';
  document.getElementById('g-target').value='';
  document.getElementById('g-icon').value='';
  document.getElementById('g-date').value='';
  document.getElementById('g-account').value='';
  renderGoalsPage();
  toast('✅ Goal added');
}

function delGoalItem(id){
  GOALS=GOALS.filter(g=>g.id!==id);
  try{save(K.goals,GOALS);}catch(e){}
  renderGoalsPage();
  dbRenderGoals();
  toast('🗑️ Removed');
}

// Called from goal-modal update button (index.html) and export.js
function openGoalModal(idx){
  const g=GOALS[idx];if(!g)return;
  document.getElementById('modal-goal-idx').value=idx;
  document.getElementById('modal-goal-amt').value=_goalCurrent(g);
  document.getElementById('goal-modal').classList.add('open');
}
function closeModal(){document.getElementById('goal-modal').classList.remove('open');}
function updateGoal(){
  const idx=parseInt(document.getElementById('modal-goal-idx').value);
  const amt=parseFloat(document.getElementById('modal-goal-amt').value)||0;
  if(!GOALS[idx])return;
  try{
    if(GOALS[idx].targetAmount!==undefined){GOALS[idx].currentAmount=amt;}
    else{GOALS[idx].saved=amt;}
    save(K.goals,GOALS);
  }catch(e){toast('⚠️ Could not save');return;}
  closeModal();
  renderGoalCards();
  dbRenderGoals();
  toast('✅ Updated');
}

// Alias used by export.js and other callers
function renderGoals(){
  if(document.getElementById('goals-cards-list')){renderGoalCards();}
}
