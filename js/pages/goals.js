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
    var bal = ctBalanceAt(acctId, lm);
    return bal.month ? bal.value : null;
  } catch(e) { return null; }
}
function _goalCurrent(g) {
  var ctBal = _goalCtBalance(g.linkedAccount);
  if (ctBal !== null) return ctBal;
  return Number(g.currentAmount) || Number(g.saved) || 0;
}
function _goalTarget(g){ return Number(g.targetAmount)||Number(g.target)||0; }

// Linked account id, but only when it has a live Cash Tracker balance
function _goalLiveAccount(g) {
  return (g.linkedAccount && _goalCtBalance(g.linkedAccount) !== null) ? g.linkedAccount : '';
}

// Goals grouped by the live account they read: { acctId: [goal, …] }.
// A group of 2+ means each goal shows that account's full balance.
function _goalsByAccount(goals) {
  var by = {};
  goals.forEach(function(g) {
    var acct = _goalLiveAccount(g);
    if (acct) (by[acct] = by[acct] || []).push(g);
  });
  return by;
}

// Sum of goal progress, counting each shared linked account once
function goalsTotalSaved(goals) {
  var seen = {};
  return goals.reduce(function(s, g) {
    var acct = _goalLiveAccount(g);
    if (acct) {
      if (seen[acct]) return s;
      seen[acct] = true;
    }
    return s + _goalCurrent(g);
  }, 0);
}

// Average monthly net savings (income − expenses) over the last 3 full
// months that have any activity. Same window as the dashboard projection.
function goalAvgMonthlySavings(txns, now) {
  var arr = [];
  for (var i = 1; i <= 3; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var p = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    var inc = 0, exp = 0;
    txns.forEach(function(t) {
      if (!t.date || !t.date.startsWith(p)) return;
      if (t.type === 'income') inc += Number(t.amount) || 0;
      else if (t.type === 'expense') exp += Number(t.amount) || 0;
    });
    if (inc > 0 || exp > 0) arr.push(inc - exp);
  }
  return arr.length ? arr.reduce(function(a, b) { return a + b; }, 0) / arr.length : 0;
}

// Monthly savings available to each unfinished goal: the average split evenly
function goalMonthlyRate(goals, avgSavings) {
  var open = goals.filter(function(g) { var t = _goalTarget(g); return t > 0 && _goalCurrent(g) < t; }).length;
  return (open && avgSavings > 0) ? avgSavings / open : 0;
}

function goalMonthsToTarget(remaining, rate) {
  return rate > 0 ? Math.ceil(Math.max(0, remaining) / rate) : null;
}

function _goalRateNow() {
  var txns = typeof activeTX === 'function' ? activeTX() : [];
  return goalMonthlyRate(GOALS, goalAvgMonthlySavings(txns, new Date()));
}

function renderGoalsPage(){
  const el=document.getElementById('goals-content');if(!el)return;
  const totalSaved=goalsTotalSaved(GOALS);
  const totalTarget=GOALS.reduce((s,g)=>s+_goalTarget(g),0);
  el.innerHTML=`
    <div class="g3 mb">
      <div class="card goals-stat">
        <div class="goals-stat-lbl">Goals</div>
        <div class="goals-stat-val tone-pink">${GOALS.length}</div>
      </div>
      <div class="card goals-stat">
        <div class="goals-stat-lbl">Total Saved</div>
        <div class="goals-stat-val goals-stat-val--money tone-green">${fmtAUD(totalSaved)}</div>
      </div>
      <div class="card goals-stat">
        <div class="goals-stat-lbl">Total Target</div>
        <div class="goals-stat-val goals-stat-val--money">${fmtAUD(totalTarget)}</div>
      </div>
    </div>
    <div id="goals-cards-list"></div>
    <div class="card goals-add">
      <div class="section-label">Add New Goal</div>
      <div class="form-grid">
        <div><label class="lbl">Goal Name</label><input type="text" id="g-name" placeholder="e.g. Emergency Fund"/></div>
        <div><label class="lbl">Icon</label>
          <input type="hidden" id="g-icon" value="target"/>
          <div id="g-icon-preview" class="g-icon-preview">${ICON('target')}</div>
          <div class="g-icon-presets" id="g-icon-presets"></div>
        </div>
      </div>
      <div class="form-grid">
        <div><label class="lbl">Target Amount (AUD)</label><input type="number" id="g-target" placeholder="10000" min="0" step="100" inputmode="decimal"/></div>
        <div><label class="lbl">Target Date (optional)</label><input type="date" id="g-date"/></div>
      </div>
      <div class="form-grid">
        <div><label class="lbl">Linked Account <span class="lbl-hint">(balance syncs from Cash Tracker)</span></label>
          ${_goalAccountSelect()}
        </div>
      </div>
      <button class="btn btn-primary" onclick="addGoalFromPage()">${ICON('plus')} Add Goal</button>
    </div>`;
  renderGoalCards();
  // Populate icon preset row (avoids template-literal nesting)
  var presetsEl = document.getElementById('g-icon-presets');
  if (presetsEl) {
    presetsEl.innerHTML = ICON_PICKER_SET.map(function(k) {
      return '<span class="g-icon-opt" onclick="_gNewPickIcon(\'' + k + '\')">' + ICON(k) + '</span>';
    }).join('');
  }
}

function _gNewPickIcon(key) {
  var input = document.getElementById('g-icon');
  if (input) input.value = key;
  var prev = document.getElementById('g-icon-preview');
  if (prev) prev.innerHTML = ICON(key);
}

function renderGoalCards(){
  const el=document.getElementById('goals-cards-list');if(!el)return;
  if(!GOALS.length){
    el.innerHTML='<div class="empty"><div class="ei">' + ICON('target') + '</div><p>No goals yet — add your first goal below.</p></div>';
    return;
  }
  var rate = _goalRateNow();
  var byAcct = _goalsByAccount(GOALS);
  el.innerHTML = GOALS.map(function(g, i) {
    var current = _goalCurrent(g);
    var target  = _goalTarget(g);
    var pct     = target > 0 ? Math.min((current / target) * 100, 100) : 0;
    var rem     = Math.max(0, target - current);
    var done    = current >= target && target > 0;
    var proj    = _goalProjection(g, current, target, rate);
    var acct    = _goalLiveAccount(g);
    var acctName = acct && typeof getAccountName === 'function' ? getAccountName(acct) : '';
    var shared  = acct ? byAcct[acct].filter(function(o) { return o !== g; }) : [];
    var note    = done
      ? '<span class="goal-foot-note--done">' + ICON('confetti') + ' Goal reached!</span>'
      : (rem > 0 ? '<span class="mono">' + fmtAUD(rem) + '</span> to go' : '') + (proj ? ' · ' + proj : '');
    return '<div class="goal-card" id="goal-card-' + i + '">'
      + '<div class="goal-hd">'
      + '<div>'
      + '<div class="goal-name">' + iconTag(g.icon || 'target') + ' ' + (done ? ICON('circle-check-filled') + ' ' : '') + esc(g.name) + '</div>'
      + '<div class="goal-meta">'
      + fmtAUD(current) + ' saved of ' + fmtAUD(target)
      + (acct ? ' · <span class="goal-linked">' + ICON('link') + ' ' + esc(acctName) + '</span>' : '')
      + '</div>'
      + '</div>'
      + '<div class="goal-actions">'
      + '<div class="goal-pct">' + Math.floor(pct) + '%</div>'
      + '<button class="btn btn-ghost btn-sm" onclick="toggleGoalEdit(' + i + ')">' + ICON('pencil') + ' Edit</button>'
      + '<button class="del-btn" aria-label="Delete goal" onclick="delGoalItem(' + g.id + ')">' + ICON('trash') + '</button>'
      + '</div>'
      + '</div>'
      + '<div class="prog-track prog-track--lg"><div class="prog-fill" data-pct="' + pct.toFixed(1) + '"></div></div>'
      + '<div class="goal-foot">'
      + '<div class="goal-foot-note">' + note + '</div>'
      + '</div>'
      + (shared.length
          ? '<div class="goal-shared">' + ICON('info-circle') + ' Shared with ' + shared.map(function(o) { return esc(o.name); }).join(', ')
            + ': progress shows the full ' + esc(acctName) + ' balance until buckets arrive.</div>'
          : '')
      + '<div id="goal-edit-' + i + '" class="goal-edit">'
      + _goalEditForm(g, i)
      + '</div>'
      + '</div>';
  }).join('');
  el.querySelectorAll('.prog-fill[data-pct]').forEach(function(f) { f.style.width = f.dataset.pct + '%'; });
}

function _goalEditForm(g, i) {
  var acctSel = _goalAccountSelect(g.linkedAccount || '').replace('id="g-account"', 'id="ge-account-' + i + '"');
  return '<div class="form-grid">'
    + '<div><label class="lbl">Goal Name</label><input type="text" id="ge-name-' + i + '" value="' + (g.name || '').replace(/"/g, '&quot;') + '" placeholder="Goal name"/></div>'
    + '<div><label class="lbl">Icon</label>'
    + '<input type="hidden" id="ge-icon-' + i + '" value="' + (g.icon || 'target') + '"/>'
    + '<div id="ge-icon-preview-' + i + '" class="g-icon-preview">' + iconTag(g.icon || 'target') + '</div>'
    + '</div>'
    + '</div>'
    + '<div class="g-icon-presets g-icon-presets--edit">'
    + ICON_PICKER_SET.map(function(k) {
        return '<span class="g-icon-opt" onclick="_goalPickIcon(' + i + ',\'' + k + '\')">' + ICON(k) + '</span>';
      }).join('')
    + '</div>'
    + '<div class="form-grid">'
    + '<div><label class="lbl">Target Amount</label><input type="number" id="ge-target-' + i + '" value="' + (_goalTarget(g) || '') + '" placeholder="10000" min="0" step="100" inputmode="decimal"/></div>'
    + '<div><label class="lbl">Current Amount</label><input type="number" id="ge-current-' + i + '" value="' + (Number(g.currentAmount) || Number(g.saved) || 0) + '" placeholder="0" min="0" step="100" inputmode="decimal"/></div>'
    + '</div>'
    + '<div class="form-grid">'
    + '<div><label class="lbl">Target Date (optional)</label><input type="date" id="ge-date-' + i + '" value="' + (g.targetDate || '') + '"/></div>'
    + '<div><label class="lbl">Linked Account</label>' + acctSel + '</div>'
    + '</div>'
    + '<div class="goal-edit-actions">'
    + '<button class="btn btn-primary btn-sm" onclick="saveGoalEdit(' + i + ')">Save</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="toggleGoalEdit(' + i + ')">Cancel</button>'
    + '</div>';
}

function toggleGoalEdit(i) {
  var panel = document.getElementById('goal-edit-' + i);
  if (panel) panel.classList.toggle('is-open');
}

function _goalPickIcon(i, key) {
  var input = document.getElementById('ge-icon-' + i);
  if (input) input.value = key;
  var prev = document.getElementById('ge-icon-preview-' + i);
  if (prev) prev.innerHTML = iconTag(key);
}

function saveGoalEdit(i) {
  if (!GOALS[i]) return;
  var g = function(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
  var n = function(id) { var e = document.getElementById(id); return parseFloat((e||{}).value) || 0; };
  GOALS[i].name          = g('ge-name-' + i)    || GOALS[i].name;
  GOALS[i].icon          = g('ge-icon-' + i)    || 'target';
  GOALS[i].targetAmount  = n('ge-target-' + i)  || GOALS[i].targetAmount;
  GOALS[i].currentAmount = n('ge-current-' + i);
  GOALS[i].targetDate    = g('ge-date-' + i);
  GOALS[i].linkedAccount = (document.getElementById('ge-account-' + i) || {}).value || '';
  try { save(K.goals, GOALS); } catch(e) { toast('⚠️ Could not save'); return; }
  renderGoalCards();
  if (typeof dbRenderGoals === 'function') dbRenderGoals();
  toast('✅ Goal updated');
}

// rate = this goal's share of real average monthly savings (see goalMonthlyRate)
function _goalProjection(g, current, target, rate) {
  if (target <= 0 || current >= target) return '';
  if (g.targetDate) {
    var d = new Date(g.targetDate);
    return 'Target: ' + d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
  }
  var months = goalMonthsToTarget(target - current, rate);
  if (months === null) return 'Add a contribution to see a finish date';
  var now = new Date();
  var proj = new Date(now.getFullYear(), now.getMonth() + months, 1);
  return 'On track for ' + proj.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

function fmtAUD(n){
  return Number(n).toLocaleString('en-AU',{style:'currency',currency:'AUD'});
}

function addGoalFromPage(){
  const name=document.getElementById('g-name').value.trim();
  const targetAmount=parseFloat(document.getElementById('g-target').value);
  const icon=document.getElementById('g-icon').value.trim()||'target';
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
  if(typeof qsCheckAndAutoComplete==='function')qsCheckAndAutoComplete();
}

function delGoalItem(id){
  var idx = GOALS.findIndex(function(g) { return g.id === id; });
  if (idx < 0) return;
  var goal = GOALS[idx];
  if (!confirm('Delete ' + goal.name + '? This can\'t be undone.')) return;
  GOALS = GOALS.filter(function(g) { return g.id !== id; });
  try { save(K.goals, GOALS); } catch(e) {}
  _goalsRefresh();
  showUndoToast('Goal deleted', 5000, function() {
    if (GOALS.some(function(g) { return g.id === id; })) return;
    GOALS.splice(Math.min(idx, GOALS.length), 0, goal);
    try { save(K.goals, GOALS); } catch(e) {}
    _goalsRefresh();
    toast('Goal restored');
  });
}

function _goalsRefresh() {
  renderGoalsPage();
  if (typeof dbRenderGoals === 'function') dbRenderGoals();
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
