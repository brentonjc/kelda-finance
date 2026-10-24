// ══════════════════════════════════════════════════════════════
// GOALS PAGE
// ══════════════════════════════════════════════════════════════
// Record shape, migration and all goal maths live in js/goals-calc.js.

// Cash Tracker access and household fallback rate for js/goals-calc.js.
// Balances are cached for the life of one context (one render), and the
// fallback is only worked out if a goal with no contributions asks for it.
function goalCtx() {
  var bals = {}, hists = {};
  var ctx = {
    today: goalToday(),
    goals: GOALS,
    balanceOf: function(id) { return id in bals ? bals[id] : (bals[id] = _goalCtBalance(id)); },
    balanceHistory: function(id) { return id in hists ? hists[id] : (hists[id] = _goalCtHistory(id)); }
  };
  var rate = null;
  Object.defineProperty(ctx, 'fallbackRate', { get: function() {
    if (rate === null) {
      var txns = typeof activeTX === 'function' ? activeTX() : [];
      rate = goalMonthlyRate(GOALS, goalAvgMonthlySavings(txns, new Date()), ctx);
    }
    return rate;
  } });
  return ctx;
}

// Build account select HTML with live CT balances as hints
function _goalAccountSelect(selectedVal) {
  var accts = typeof ACCOUNTS !== 'undefined' && ACCOUNTS ? ACCOUNTS : [];
  var html = '<select id="g-account"><option value="">— None —</option>';
  accts.forEach(function(a) {
    var name = typeof getAccountName === 'function' ? getAccountName(a.id) : (a.name || a.id);
    var bal  = _goalCtBalance(a.id);
    var hint = bal !== null ? ' · ' + Number(bal).toLocaleString('en-AU', {style:'currency',currency:'AUD'}) : '';
    var sel  = (selectedVal === a.id) ? ' selected' : '';
    html += '<option value="' + esc(a.id) + '"' + sel + '>' + esc(name) + hint + '</option>';
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
// An account's balance for every Cash Tracker month it has one (carried forward)
function _goalCtHistory(acctId) {
  try {
    var months = typeof ctAllMonths === 'function' ? ctAllMonths() : [];
    return months.map(function(m) {
      var b = ctBalanceAt(acctId, m);
      return b.month ? { month: m, value: b.value } : null;
    }).filter(Boolean);
  } catch(e) { return []; }
}
// Shorthands for callers outside the Goals page (dashboard, export)
function _goalCurrent(g) { return goalCurrent(g, goalCtx()); }
function _goalTarget(g) { return goalTarget(g); }

// Account id of a dedicated-account goal, but only when it has a live Cash Tracker balance
function _goalLiveAccount(g) {
  return (g.source && g.source.kind === 'account' && _goalCtBalance(g.source.accountId) !== null) ? g.source.accountId : '';
}

// Dedicated-account goals grouped by the live account they read: { acctId: [goal, …] }.
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
  return goalsTotalCurrent(goals, goalCtx());
}

// Contributions are logged for the person using the app (Joint when in Joint)
function _goalPerson() {
  return typeof activeProfile !== 'undefined' && activeProfile ? activeProfile : 'joint';
}

// An account is about to be deleted: its goals keep their amount as manual goals
function goalsAccountRemoved(acctId) {
  if (typeof GOALS === 'undefined' || !GOALS) return;
  if (goalsDetachAccount(GOALS, acctId, goalCtx())) {
    try { save(K.goals, GOALS); } catch(e) {}
  }
}

function renderGoalsPage(){
  const el=document.getElementById('goals-content');if(!el)return;
  const totalSaved=goalsTotalSaved(GOALS);
  const totalTarget=GOALS.reduce((s,g)=>s+goalTarget(g),0);
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
  var ctx = goalCtx();
  var byAcct = _goalsByAccount(GOALS);
  el.innerHTML = GOALS.map(function(g, i) {
    var current = goalCurrent(g, ctx);
    var target  = goalTarget(g);
    var pct     = goalPct(g, ctx);
    var rem     = Math.max(0, target - current);
    var done    = current >= target && target > 0;
    var proj    = _goalProjection(g, ctx);
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
      + '<div class="goal-pct">' + pct + '%</div>'
      + '<button class="btn btn-ghost btn-sm" onclick="toggleGoalEdit(' + i + ')">' + ICON('pencil') + ' Edit</button>'
      + '<button class="del-btn" aria-label="Delete goal" onclick="delGoalItem(\'' + esc(g.id) + '\')">' + ICON('trash') + '</button>'
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
      + _goalEditForm(g, i, ctx)
      + '</div>'
      + '</div>';
  }).join('');
  el.querySelectorAll('.prog-fill[data-pct]').forEach(function(f) { f.style.width = f.dataset.pct + '%'; });
}

function _goalEditForm(g, i, ctx) {
  var acctSel = _goalAccountSelect(goalAccountId(g)).replace('id="g-account"', 'id="ge-account-' + i + '"');
  // A live account balance sets the amount, so it can't be typed over
  var live = !!_goalLiveAccount(g);
  return '<div class="form-grid">'
    + '<div><label class="lbl">Goal Name</label><input type="text" id="ge-name-' + i + '" value="' + esc(g.name || '') + '" placeholder="Goal name"/></div>'
    + '<div><label class="lbl">Icon</label>'
    + '<input type="hidden" id="ge-icon-' + i + '" value="' + esc(g.icon || 'target') + '"/>'
    + '<div id="ge-icon-preview-' + i + '" class="g-icon-preview">' + iconTag(g.icon || 'target') + '</div>'
    + '</div>'
    + '</div>'
    + '<div class="g-icon-presets g-icon-presets--edit">'
    + ICON_PICKER_SET.map(function(k) {
        return '<span class="g-icon-opt" onclick="_goalPickIcon(' + i + ',\'' + k + '\')">' + ICON(k) + '</span>';
      }).join('')
    + '</div>'
    + '<div class="form-grid">'
    + '<div><label class="lbl">Target Amount</label><input type="number" id="ge-target-' + i + '" value="' + (goalTarget(g) || '') + '" placeholder="10000" min="0" step="100" inputmode="decimal"/></div>'
    + '<div><label class="lbl">Current Amount' + (live ? ' <span class="lbl-hint">(from Cash Tracker)</span>' : '') + '</label>'
    + '<input type="number" id="ge-current-' + i + '" value="' + Math.round(goalCurrent(g, ctx) * 100) / 100 + '" placeholder="0" min="0" step="100" inputmode="decimal"' + (live ? ' disabled' : '') + '/></div>'
    + '</div>'
    + '<div class="form-grid">'
    + '<div><label class="lbl">Target Date (optional)</label><input type="date" id="ge-date-' + i + '" value="' + esc(g.targetDate || '') + '"/></div>'
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
  var goal = GOALS[i];
  if (!goal) return;
  var g = function(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
  var n = function(id) { var e = document.getElementById(id); return parseFloat((e||{}).value) || 0; };
  var ctx = goalCtx();
  goal.name       = g('ge-name-' + i)   || goal.name;
  goal.icon       = g('ge-icon-' + i)   || 'target';
  goal.target     = n('ge-target-' + i) || goal.target;
  goal.targetDate = g('ge-date-' + i);
  goalSetAccount(goal, (document.getElementById('ge-account-' + i) || {}).value || '', ctx);
  var cur = document.getElementById('ge-current-' + i);
  if (cur && !cur.disabled) goalSetCurrent(goal, n('ge-current-' + i), ctx, { person: _goalPerson() });
  try { save(K.goals, GOALS); } catch(e) { toast('⚠️ Could not save'); return; }
  renderGoalCards();
  if (typeof dbRenderGoals === 'function') dbRenderGoals();
  toast('✅ Goal updated');
}

// Finish date at the goal's own pace (or its share of household savings
// until it has contributions). Same maths as the dashboard's projection card.
function _goalProjection(g, ctx) {
  var target = goalTarget(g);
  if (target <= 0 || goalCurrent(g, ctx) >= target) return '';
  if (g.targetDate) {
    var d = new Date(g.targetDate);
    return 'Target: ' + d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
  }
  var months = goalEta(g, ctx);
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
  const target=parseFloat(document.getElementById('g-target').value);
  const icon=document.getElementById('g-icon').value.trim()||'target';
  const targetDate=document.getElementById('g-date').value;
  const accountId=document.getElementById('g-account').value;
  if(!name||!target){toast('⚠️ Enter goal name and target amount');return;}
  try{
    GOALS.push(makeGoal({name,icon,target,targetDate,accountId,owner:_goalPerson()}));
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
  document.getElementById('modal-goal-amt').value=Math.round(_goalCurrent(g)*100)/100;
  document.getElementById('goal-modal').classList.add('open');
}
function closeModal(){document.getElementById('goal-modal').classList.remove('open');}
function updateGoal(){
  const idx=parseInt(document.getElementById('modal-goal-idx').value);
  const amt=parseFloat(document.getElementById('modal-goal-amt').value)||0;
  if(!GOALS[idx])return;
  try{
    goalSetCurrent(GOALS[idx],amt,goalCtx(),{person:_goalPerson()});
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
