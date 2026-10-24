// ══════════════════════════════════════════════════════════════
// GOALS — record shape, migration and maths (pure)
// ══════════════════════════════════════════════════════════════
// Nothing here reads globals. Callers pass a context:
//   { today: 'YYYY-MM-DD',
//     balanceOf(acctId)      → latest Cash Tracker balance, or null when none,
//     balanceHistory(acctId) → [{ month:'YYYY-MM', value }] oldest first,
//     goals                  → every goal (bucket goals share their account),
//     fallbackRate           → monthly $ for a goal with no contributions yet }
// Loaded before data.js so its migration can run at startup.

var GOAL_SCHEMA = 2;
var GOAL_MILESTONES = [25, 50, 75, 100];
// Contributions that move a balance onto the goal rather than save new money.
// They count toward the amount saved, never toward pace or streaks.
var GOAL_NON_PACE_NOTES = ['opening balance', 'carried over'];

// ── Dates ──────────────────────────────────────────────────────
function goalToday(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function goalAddMonths(ym, n) {
  var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return y + '-' + String(m + 1).padStart(2, '0');
}
// Whole months from ym a to ym b (b − a)
function goalMonthDiff(a, b) {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
}

// ── Records ────────────────────────────────────────────────────
function _goalUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function makeContribution(amount, opts) {
  opts = opts || {};
  var c = { id: 'c_' + _goalUid(), date: opts.date || goalToday(), amount: Math.round(Number(amount) * 100) / 100, person: opts.person || 'joint' };
  if (opts.note) c.note = opts.note;
  return c;
}
// Every goal is created through here, so nothing writes the old shape again
function makeGoal(f) {
  f = f || {};
  var today = f.createdAt || goalToday();
  return {
    id: f.id || 'g_' + _goalUid(),
    schemaVersion: GOAL_SCHEMA,
    name: f.name || 'Goal',
    icon: f.icon || 'target',
    type: f.type || 'save',
    owner: f.owner || 'joint',
    target: Number(f.target) || 0,
    targetDate: f.targetDate || '',
    createdAt: today,
    source: f.accountId ? { kind: 'account', accountId: f.accountId } : { kind: 'manual' },
    contributions: [],
    status: 'active',
    milestonesHit: [],
    cycle: 1
  };
}

function goalAccountId(g) {
  return g && g.source && (g.source.kind === 'account' || g.source.kind === 'bucket') ? g.source.accountId : '';
}

// ── Migration (v1 → v2) ────────────────────────────────────────
// Adds fields only; the old ones (targetAmount, currentAmount, saved, target,
// linkedAccount) stay for one release so a rollback still reads them.
// Idempotent: a v2 record is left alone.
function goalsMigrateV2(list, today) {
  if (!Array.isArray(list)) return { goals: [], changed: false };
  today = today || goalToday();
  var users = {};
  list.forEach(function(g) {
    if (g && g.schemaVersion !== GOAL_SCHEMA && g.linkedAccount) users[g.linkedAccount] = (users[g.linkedAccount] || 0) + 1;
  });
  var changed = false;
  var goals = list.map(function(g) {
    if (!g || typeof g !== 'object' || g.schemaVersion === GOAL_SCHEMA) return g;
    changed = true;
    var n = Object.assign({}, g);
    if (typeof n.id === 'number' || (typeof n.id === 'string' && n.id.indexOf('g_') !== 0)) n.id = 'g_' + n.id;
    if (n.id === undefined || n.id === null || n.id === '') n.id = 'g_' + _goalUid();
    var target = Number(g.targetAmount) || Number(g.target) || 0;
    var current = Number(g.currentAmount) || Number(g.saved) || 0;
    var created = String(g.createdAt || today).slice(0, 10);
    n.schemaVersion = GOAL_SCHEMA;
    n.target = target;
    n.targetDate = g.targetDate || '';
    n.createdAt = created;
    n.icon = g.icon || 'target';
    n.type = g.type || 'save';
    n.owner = g.owner || 'joint';
    n.cycle = 1;
    if (g.linkedAccount) n.source = { kind: users[g.linkedAccount] > 1 ? 'bucket' : 'account', accountId: g.linkedAccount };
    else n.source = { kind: 'manual' };
    // The old amount becomes an opening balance. For an account goal it only
    // shows while the account has no Cash Tracker balance.
    n.contributions = current > 0
      ? [{ id: 'c_' + n.id.slice(2) + '_open', date: created, amount: current, person: 'joint', note: 'opening balance' }]
      : [];
    // Milestones already passed are recorded, so none celebrate after the upgrade
    var pct = target > 0 ? Math.floor(current / target * 100) : 0;
    n.milestonesHit = GOAL_MILESTONES.filter(function(m) { return pct >= m; });
    n.status = target > 0 && current >= target ? 'achieved' : 'active';
    return n;
  });
  return { goals: goals, changed: changed };
}

// ── Contributions ──────────────────────────────────────────────
function _goalStoredSum(g) {
  return (g.contributions || []).reduce(function(s, c) { return s + (Number(c.amount) || 0); }, 0);
}
// Month-on-month balance changes of a dedicated account since the goal began.
// Worked out on every read, never stored, so editing a past Cash Tracker month
// or restoring a backup can't leave stale or duplicate entries.
function goalSyncContributions(g, ctx) {
  if (!g.source || g.source.kind !== 'account' || !ctx || typeof ctx.balanceHistory !== 'function') return [];
  var hist = ctx.balanceHistory(g.source.accountId) || [];
  if (!hist.length) return [];
  var startMo = String(g.createdAt || ctx.today).slice(0, 7);
  var prev = null;
  // Baseline = the last balance before the goal's first month
  hist.forEach(function(h) { if (h.month < startMo) prev = h.value; });
  var out = [];
  hist.forEach(function(h) {
    if (h.month < startMo) return;
    if (prev !== null && h.value !== prev) {
      out.push({ id: 'sync_' + h.month, date: h.month + '-01', amount: Math.round((h.value - prev) * 100) / 100, person: 'joint', note: 'balance sync', synthetic: true });
    }
    prev = h.value;
  });
  return out;
}
function goalContributions(g, ctx) {
  return (g.contributions || []).concat(goalSyncContributions(g, ctx));
}
function _goalPaceContribs(g, ctx) {
  return goalContributions(g, ctx).filter(function(c) { return GOAL_NON_PACE_NOTES.indexOf(c.note) === -1; });
}
// { 'YYYY-MM': net } of contributions that count toward pace
function _goalMonthlyNet(g, ctx) {
  var by = {};
  _goalPaceContribs(g, ctx).forEach(function(c) {
    var m = String(c.date).slice(0, 7);
    by[m] = (by[m] || 0) + (Number(c.amount) || 0);
  });
  return by;
}

// ── Amounts ────────────────────────────────────────────────────
function goalTarget(g) {
  return Number(g && g.target) || 0;
}
function _goalBalance(ctx, acctId) {
  return ctx && typeof ctx.balanceOf === 'function' ? ctx.balanceOf(acctId) : null;
}
function goalCurrent(g, ctx) {
  if (!g) return 0;
  var kind = g.source && g.source.kind;
  var v;
  if (kind === 'account') {
    var bal = _goalBalance(ctx, g.source.accountId);
    v = bal !== null && bal !== undefined ? bal : _goalStoredSum(g);
  } else if (kind === 'bucket') {
    v = _goalStoredSum(g);
    var acctBal = _goalBalance(ctx, g.source.accountId);
    if (acctBal !== null && acctBal !== undefined && v > 0) {
      // Buckets never add up to more than the account holds: scale them down together
      var all = ((ctx && ctx.goals) || [g]).filter(function(o) {
        return o.source && o.source.kind === 'bucket' && o.source.accountId === g.source.accountId;
      });
      if (all.indexOf(g) === -1) all.push(g);
      var total = all.reduce(function(s, o) { return s + Math.max(0, _goalStoredSum(o)); }, 0);
      if (total > acctBal) v = acctBal > 0 ? v * acctBal / total : 0;
    }
  } else {
    v = _goalStoredSum(g);
  }
  return Math.max(0, v);
}
// Whole percent, 0–100. 100 only once the target is met (99.6 stays 99)
function goalPct(g, ctx) {
  var t = goalTarget(g);
  if (t <= 0) return 0;
  var c = goalCurrent(g, ctx);
  if (c >= t) return 100;
  return Math.max(0, Math.min(99, Math.floor(c / t * 100)));
}

// Sum of goal progress. Dedicated-account goals that point at the same
// account count its balance once (buckets are already split, so they add up).
function goalsTotalCurrent(goals, ctx) {
  var seen = {};
  return (goals || []).reduce(function(s, g) {
    if (g.source && g.source.kind === 'account' && _goalBalance(ctx, g.source.accountId) !== null) {
      if (seen[g.source.accountId]) return s;
      seen[g.source.accountId] = true;
    }
    return s + goalCurrent(g, ctx);
  }, 0);
}

// ── Pace and projections ───────────────────────────────────────
// Average monthly net contribution over the last 3 full months, or every full
// month since the goal began when it's younger. When those months net to
// nothing, this month's money so far stands in, so a contribution shows up in
// the finish date straight away. A goal with nothing logged yet falls back to
// ctx.fallbackRate (its share of household savings).
function goalPace(g, ctx) {
  var nowMo = String(ctx.today).slice(0, 7);
  var byMonth = _goalMonthlyNet(g, ctx);
  var months = Object.keys(byMonth);
  if (!months.length) return Math.max(0, Number(ctx.fallbackRate) || 0);
  var age = goalMonthDiff(String(g.createdAt || ctx.today).slice(0, 7), nowMo);
  var span = Math.max(1, Math.min(3, age));
  var sum = 0;
  for (var i = 1; i <= span && age >= 1; i++) sum += byMonth[goalAddMonths(nowMo, -i)] || 0;
  if (sum <= 0 && (byMonth[nowMo] || 0) > 0) return byMonth[nowMo];
  return sum / span;
}
// { perMonth, perFortnight } still needed to hit the target date, or null without one
function goalNeeded(g, ctx) {
  if (!g.targetDate) return null;
  var left = Math.max(1, goalMonthDiff(String(ctx.today).slice(0, 7), String(g.targetDate).slice(0, 7)));
  var perMonth = Math.max(0, goalTarget(g) - goalCurrent(g, ctx)) / left;
  return { perMonth: perMonth, perFortnight: perMonth * 12 / 26, monthsLeft: left };
}
// 'achieved' | 'ahead' | 'on-track' | 'behind' | 'no-date'
function goalStatus(g, ctx) {
  if (goalTarget(g) > 0 && goalPct(g, ctx) === 100) return 'achieved';
  var need = goalNeeded(g, ctx);
  if (!need) return 'no-date';
  if (need.perMonth <= 0) return 'ahead';
  var r = goalPace(g, ctx) / need.perMonth;
  return r >= 1.1 ? 'ahead' : r >= 0.9 ? 'on-track' : 'behind';
}
// Months to finish at the current pace; null when pace is 0 or less
function goalEta(g, ctx) {
  var rem = goalTarget(g) - goalCurrent(g, ctx);
  if (rem <= 0) return 0;
  var pace = goalPace(g, ctx);
  return pace > 0 ? Math.ceil(rem / pace) : null;
}
// Consecutive calendar months with net new money, ending this month or last.
// This month is still in progress, so an empty one doesn't break the run.
function goalStreak(g, ctx) {
  var byMonth = _goalMonthlyNet(g, ctx);
  var mo = String(ctx.today).slice(0, 7);
  if (!((byMonth[mo] || 0) > 0)) mo = goalAddMonths(mo, -1);
  var n = 0;
  while ((byMonth[mo] || 0) > 0) { n++; mo = goalAddMonths(mo, -1); }
  return n;
}

// ── Household fallback rate (PR 1) ─────────────────────────────
// Average monthly net savings (income − expenses) over the last 3 full months
// that have any activity.
function goalAvgMonthlySavings(txns, now) {
  var arr = [];
  for (var i = 1; i <= 3; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var p = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    var inc = 0, exp = 0;
    (txns || []).forEach(function(t) {
      if (!t.date || !t.date.startsWith(p)) return;
      if (t.type === 'income') inc += Number(t.amount) || 0;
      else if (t.type === 'expense') exp += Number(t.amount) || 0;
    });
    if (inc > 0 || exp > 0) arr.push(inc - exp);
  }
  return arr.length ? arr.reduce(function(a, b) { return a + b; }, 0) / arr.length : 0;
}
// The average split evenly across unfinished goals
function goalMonthlyRate(goals, avgSavings, ctx) {
  var open = (goals || []).filter(function(g) { var t = goalTarget(g); return t > 0 && goalCurrent(g, ctx) < t; }).length;
  return (open && avgSavings > 0) ? avgSavings / open : 0;
}

// ── Edits ──────────────────────────────────────────────────────
// Set the amount saved by logging the difference as a contribution.
// Returns false when nothing changed or the amount comes from a live balance.
function goalSetCurrent(g, amount, ctx, opts) {
  if (g.source && g.source.kind === 'account' && _goalBalance(ctx, g.source.accountId) !== null) return false;
  var delta = Math.round((Number(amount) - goalCurrent(g, ctx)) * 100) / 100;
  if (!isFinite(delta) || Math.abs(delta) < 0.01) return false;
  g.contributions = g.contributions || [];
  g.contributions.push(makeContribution(delta, { date: ctx.today, person: opts && opts.person, note: 'adjusted' }));
  return true;
}
// Link a goal to an account ('' = none). Leaving a live account keeps the
// amount saved by carrying the balance over as a contribution.
function goalSetAccount(g, acctId, ctx) {
  var cur = goalAccountId(g);
  if ((acctId || '') === (cur || '')) return false;
  var wasLive = g.source && g.source.kind === 'account' && _goalBalance(ctx, g.source.accountId) !== null;
  if (wasLive && !acctId) {
    var carry = Math.round((goalCurrent(g, ctx) - _goalStoredSum(g)) * 100) / 100;
    if (Math.abs(carry) >= 0.01) {
      g.contributions = g.contributions || [];
      g.contributions.push(makeContribution(carry, { date: ctx.today, note: 'carried over' }));
    }
  }
  g.source = acctId ? { kind: 'account', accountId: acctId } : { kind: 'manual' };
  return true;
}
// An account is being deleted: its goals become manual at their last balance
function goalsDetachAccount(goals, acctId, ctx) {
  var n = 0;
  (goals || []).forEach(function(g) {
    if (goalAccountId(g) !== acctId) return;
    if (g.source.kind === 'bucket') g.source = { kind: 'manual' }; // allocations already are the amount
    else goalSetAccount(g, '', ctx);
    n++;
  });
  return n;
}
