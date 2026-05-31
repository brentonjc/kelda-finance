// ══════════════════════════════════════════════════════════════
// FINANCIAL HEALTH PAGE — js/pages/health.js
// ══════════════════════════════════════════════════════════════

var FH_FACTORS = [
  {
    key: 'cashFlow',
    label: 'Cash Flow',
    icon: '💸',
    weight: '20%',
    explain: 'Measures whether your income exceeds your expenses this month. Positive cash flow is the foundation of financial health.',
    scoreLabel: function(s) {
      return s >= 80 ? 'Income comfortably exceeds expenses'
           : s >= 50 ? 'Roughly breaking even this month'
           : 'Spending is exceeding income';
    },
    actions: [
      'Review all subscriptions — cancel any you no longer use',
      'Look for ways to grow income: overtime, side projects, freelance',
      'Use the Transactions tab to spot where money is leaking'
    ]
  },
  {
    key: 'savingsRate',
    label: 'Savings Rate',
    icon: '🏦',
    weight: '20%',
    explain: 'What percentage of your income you are saving. A 20%+ savings rate is the target for long-term wealth building.',
    scoreLabel: function(s) {
      return s >= 80 ? 'Excellent — saving 20%+ of income'
           : s >= 50 ? 'Moderate — saving 10–20% of income'
           : 'Below target — saving less than 10%';
    },
    actions: [
      'Automate a savings transfer on payday ("pay yourself first")',
      'Set a concrete monthly savings target and treat it like a bill',
      'Review Budget vs Actuals to find the easiest areas to cut'
    ]
  },
  {
    key: 'billsPaid',
    label: 'Bills Paid On Time',
    icon: '📅',
    weight: '15%',
    explain: 'Tracks whether your recurring bills are being marked as paid. Staying current avoids late fees, stress and credit issues.',
    scoreLabel: function(s) {
      return s >= 80 ? 'Bills are well managed'
           : s >= 50 ? 'Some bills still outstanding'
           : 'Multiple bills overdue — action needed';
    },
    actions: [
      'Set calendar reminders 3 days before each bill is due',
      'Mark bills as paid in the Bills tab immediately when done',
      'Consider automating direct debits for fixed recurring bills'
    ]
  },
  {
    key: 'budgetAdherence',
    label: 'Budget Adherence',
    icon: '🎯',
    weight: '15%',
    explain: 'How many of your budgeted categories are staying within their monthly limits. Consistency here builds financial discipline.',
    scoreLabel: function(s) {
      return s >= 80 ? 'Strong budget discipline this month'
           : s >= 50 ? 'Some categories are over limit'
           : 'Multiple budgets exceeded — review now';
    },
    actions: [
      'Check Budget vs Actuals weekly, not just at month end',
      'Use the Smart Insights nudges to catch overspends early',
      'Adjust budget limits to reflect realistic spending if needed'
    ]
  },
  {
    key: 'mortgageLVR',
    label: 'Mortgage LVR',
    icon: '🏡',
    weight: '15%',
    explain: 'Loan-to-Value Ratio — your mortgage balance as a percentage of your property value. Crossing below 80% is a key financial milestone.',
    scoreLabel: function(s) {
      return s >= 80 ? 'LVR below 80% — excellent position'
           : s >= 50 ? 'LVR 80–90% — approaching the milestone'
           : 'LVR above 90% — higher risk zone';
    },
    actions: [
      'Make additional mortgage repayments to reduce the principal faster',
      'Maximise your offset account balance to reduce effective interest',
      'Ask your lender about a rate reduction once you cross 80% LVR'
    ]
  },
  {
    key: 'netWorthGrowth',
    label: 'Net Worth Growth',
    icon: '📈',
    weight: '15%',
    explain: 'Whether your total net worth (assets minus all liabilities) is growing compared to the prior month.',
    scoreLabel: function(s) {
      return s >= 80 ? 'Net worth growing month on month'
           : s >= 50 ? 'Net worth holding steady'
           : 'Net worth declined this period';
    },
    actions: [
      'Review your full asset picture on the Net Assets page each month',
      'Focus on reducing high-interest debt — it erodes net worth fastest',
      'Invest surplus cash to compound asset growth over time'
    ]
  }
];

function renderHealthPage() {
  var sd;
  try { sd = calculateHealthScore(); } catch(e) {
    sd = { total:0, cashFlow:0, savingsRate:0, billsPaid:0, budgetAdherence:0, mortgageLVR:0, netWorthGrowth:0, previousScore:null };
  }
  _fhRenderHero(sd);
  _fhRenderFactors(sd);
}

function _fhRenderHero(sd) {
  var el = document.getElementById('fh-ring-wrap');
  if (!el) return;
  var score = sd.total;
  var ringColor = score >= 80 ? '#00C896' : score >= 60 ? '#F59E0B' : '#EF4444';
  var grade = score >= 80 ? 'Great Shape' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Work';
  var circ = (2 * Math.PI * 60).toFixed(1);

  var subHtml;
  if (sd.previousScore !== null && sd.previousScore !== score) {
    var diff = score - sd.previousScore;
    subHtml = '<div style="font-size:.88rem;font-weight:600;margin-top:6px;color:' + (diff >= 0 ? '#00C896' : '#EF4444') + '">'
      + (diff >= 0 ? '&#8593;' : '&#8595;') + ' ' + Math.abs(diff) + ' pts vs last month</div>';
  } else {
    subHtml = '<div style="font-size:.85rem;color:var(--muted);margin-top:6px">Tracking your progress</div>';
  }

  el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;padding:24px 0 16px">'
    + '<div style="position:relative;width:160px;height:160px">'
    + '<svg style="width:160px;height:160px;transform:rotate(-90deg)" viewBox="0 0 160 160">'
    + '<circle cx="80" cy="80" r="60" fill="none" stroke="rgba(98,120,160,0.15)" stroke-width="13"/>'
    + '<circle id="fh-ring-fill" cx="80" cy="80" r="60" fill="none" stroke="' + ringColor + '" stroke-width="13" stroke-linecap="round"'
    + ' stroke-dasharray="' + circ + '" stroke-dashoffset="' + circ + '"'
    + ' style="transition:stroke-dashoffset 1.4s cubic-bezier(0.34,1.56,0.64,1);filter:drop-shadow(0 0 10px ' + ringColor + ')"/>'
    + '</svg>'
    + '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0">'
    + '<div id="fh-score-num" style="font-family:var(--font-mono);font-size:44px;font-weight:700;color:' + ringColor + ';line-height:1">0</div>'
    + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)">/100</div>'
    + '</div>'
    + '</div>'
    + '<div style="font-family:var(--font-display);font-size:1.5rem;font-weight:700;margin-top:12px;color:' + ringColor + '">' + grade + '</div>'
    + subHtml
    + '<div style="font-size:.78rem;color:var(--muted);margin-top:8px;text-align:center;max-width:280px;line-height:1.5">'
    + 'Based on six key financial factors. Tap any card below to understand your score and take action.'
    + '</div>'
    + '</div>';

  setTimeout(function() {
    var fill = document.getElementById('fh-ring-fill');
    if (fill) {
      var offset = Number(circ) - (Number(circ) * score / 100);
      fill.style.strokeDashoffset = offset.toFixed(1);
    }
    var numEl = document.getElementById('fh-score-num');
    if (numEl && score > 0) {
      var cur = 0;
      var step = score / 50;
      var iv = setInterval(function() {
        cur = Math.min(cur + step, score);
        numEl.textContent = Math.round(cur);
        if (cur >= score) clearInterval(iv);
      }, 24);
    }
  }, 300);
}

function _fhRenderFactors(sd) {
  var el = document.getElementById('fh-factors');
  if (!el) return;
  var html = '';
  for (var fi = 0; fi < FH_FACTORS.length; fi++) {
    var f = FH_FACTORS[fi];
    var score = sd[f.key] || 0;
    var scoreColor = score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--warn)' : 'var(--danger)';
    var actHtml = f.actions.map(function(a) {
      return '<li class="fh-action-item">' + a + '</li>';
    }).join('');

    html += '<div class="card fh-factor-card">'
      + '<div class="fh-factor-hd">'
      + '<span class="fh-factor-icon">' + f.icon + '</span>'
      + '<div class="fh-factor-meta">'
      + '<div class="fh-factor-name">' + f.label + ' <span class="fh-factor-wt">' + f.weight + '</span></div>'
      + '<div class="fh-factor-explain">' + f.explain + '</div>'
      + '</div>'
      + '<div class="fh-factor-score" style="color:' + scoreColor + '">' + score + '</div>'
      + '</div>'
      + '<div class="fh-bar-track"><div class="fh-bar-fill" style="width:' + score + '%;background:' + scoreColor + '"></div></div>'
      + '<div class="fh-factor-status" style="color:' + scoreColor + '">' + f.scoreLabel(score) + '</div>'
      + (score < 80
          ? '<div class="fh-actions-hd">How to improve</div><ul class="fh-actions-list">' + actHtml + '</ul>'
          : '<div class="fh-on-track">&#10003; This factor is looking great — keep it up!</div>')
      + '</div>';
  }
  el.innerHTML = html;
}
