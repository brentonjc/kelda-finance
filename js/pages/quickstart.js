// ══════════════════════════════════════════════════════════════
// QUICK START GUIDE
// Interactive onboarding checklist with localStorage persistence
// ══════════════════════════════════════════════════════════════

// Initialize QS progress structure from localStorage
function qsLoad() {
  var data = load(K.quickstart);
  if (!data) {
    data = {
      completed: false,
      completedAt: null,
      startedAt: new Date().toISOString().split('T')[0],
      lastUpdated: new Date().toISOString().split('T')[0],
      tasks: {
        'step-1-add-tx': false,
        'step-2-categorise': false,
        'step-3-rules': false,
        'step-4-liabilities': false,
        'step-5-goals': false,
        'step-6-bills': false,
        'step-7-budget': false
      },
      showOnDashboard: true
    };
    save(K.quickstart, data);
  }
  return data;
}

// Get progress stats
function qsGetProgress() {
  var data = qsLoad();
  var tasks = data.tasks || {};
  var completed = Object.values(tasks).filter(Boolean).length;
  var total = Object.keys(tasks).length;
  var pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed: completed, total: total, pct: pct, allDone: data.completed };
}

// Mark a step as complete and check if guide is finished
function qsMarkComplete(stepId) {
  var data = qsLoad();
  var tasks = data.tasks || {};
  tasks[stepId] = !tasks[stepId]; // Toggle
  data.tasks = tasks;
  data.lastUpdated = new Date().toISOString().split('T')[0];

  // Check if all steps complete
  var allDone = Object.values(tasks).every(Boolean);
  if (allDone && !data.completed) {
    data.completed = true;
    data.completedAt = new Date().toISOString().split('T')[0];
    data.showOnDashboard = false;
    qsShowConfetti();
    toast('🎉 You\'re all set! You\'ve completed the Quick Start.');
  } else if (!allDone && data.completed) {
    data.completed = false;
    data.completedAt = null;
  }

  save(K.quickstart, data);
  renderQuickStart();
  if (typeof navSyncQuickStart === 'function') navSyncQuickStart();
}

// Auto-complete steps based on user actions in other pages
function qsCheckAndAutoComplete() {
  var data = qsLoad();
  if (!data) return;

  var tasks = data.tasks || {};
  var changed = false;

  // Step 1: Any transaction added
  if (!tasks['step-1-add-tx'] && TX && TX.length > 0) {
    tasks['step-1-add-tx'] = true;
    changed = true;
  }

  // Step 2: Any transaction categorised
  if (!tasks['step-2-categorise'] && TX && TX.some(t => t.catId)) {
    tasks['step-2-categorise'] = true;
    changed = true;
  }

  // Step 3: Any rule created
  if (!tasks['step-3-rules'] && LRULES && Object.keys(LRULES).length > 0) {
    tasks['step-3-rules'] = true;
    changed = true;
  }

  // Step 4: Any liability added
  if (!tasks['step-4-liabilities'] && typeof LIABILITIES !== 'undefined' && LIABILITIES && LIABILITIES.length > 0) {
    tasks['step-4-liabilities'] = true;
    changed = true;
  }

  // Step 5: Any goal created
  if (!tasks['step-5-goals'] && GOALS && GOALS.length > 0) {
    tasks['step-5-goals'] = true;
    changed = true;
  }

  // Step 6: Any bill added
  if (!tasks['step-6-bills'] && BILLS && BILLS.length > 0) {
    tasks['step-6-bills'] = true;
    changed = true;
  }

  // Step 7: Any budget set
  if (!tasks['step-7-budget'] && BUDGETS && Object.keys(BUDGETS).length > 0) {
    tasks['step-7-budget'] = true;
    changed = true;
  }

  if (changed) {
    data.tasks = tasks;
    data.lastUpdated = new Date().toISOString().split('T')[0];

    // Check if all complete
    var allDone = Object.values(tasks).every(Boolean);
    if (allDone && !data.completed) {
      data.completed = true;
      data.completedAt = new Date().toISOString().split('T')[0];
      data.showOnDashboard = false;
    }

    save(K.quickstart, data);
  }
}

// Reset guide progress
function qsReset() {
  if (confirm('Clear your progress and start the Quick Start Guide over?')) {
    save(K.quickstart, null);
    renderQuickStart();
  }
}

// Navigate to target page with context
function qsNavigateWithContext(pageId, stepId) {
  go(pageId);
  // Optional: Could add contextual highlights or scroll to specific sections
}

// Show confetti animation
function qsShowConfetti() {
  var emojis = ['🎉', '✨', '🚀', '💪', '🎯', '⭐', '🏆', '💎'];
  for (var i = 0; i < 20; i++) {
    var conf = document.createElement('div');
    conf.className = 'confetti';
    conf.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    conf.style.left = (Math.random() * 100) + '%';
    conf.style.top = '-50px';
    conf.style.opacity = '1';
    conf.style.animationDelay = (Math.random() * 0.5) + 's';
    document.body.appendChild(conf);
    setTimeout(function() { conf.remove(); }, 3500);
  }
}

// Main render function
function renderQuickStart() {
  var el = document.getElementById('quickstart-content');
  if (!el) return;

  var data = qsLoad();
  var progress = qsGetProgress();
  var tasks = data.tasks || {};

  // Step definitions
  var steps = [
    {
      id: 'step-1-add-tx',
      num: 1,
      emoji: 'credit-card',
      title: 'Add Transactions',
      body: 'Import CSV from your bank or add transactions manually. Our app supports Australia\'s top 10 banks.',
      cta: 'Add Transaction',
      ctaFn: "qsNavigateWithContext('transactions', 'step-1-add-tx')"
    },
    {
      id: 'step-2-categorise',
      num: 2,
      emoji: 'tag',
      title: 'Categorise Transactions',
      body: 'Assign each transaction to a category. This helps you track spending by type.',
      cta: 'View Transactions',
      ctaFn: "qsNavigateWithContext('transactions', 'step-2-categorise')"
    },
    {
      id: 'step-3-rules',
      num: 3,
      emoji: 'settings',
      title: 'Setup Auto-Categorisation Rules',
      body: 'Create rules to automatically categorise transactions based on merchant name. Save time on future transactions.',
      cta: 'Create Rule',
      ctaFn: "qsNavigateWithContext('smartrules', 'step-3-rules')"
    },
    {
      id: 'step-4-liabilities',
      num: 4,
      emoji: 'clipboard-list',
      title: 'Add Liabilities',
      body: 'Record your mortgage, loans, and credit cards. This helps you see your net worth clearly.',
      cta: 'Add Liability',
      ctaFn: "qsNavigateWithContext('liabilities', 'step-4-liabilities')"
    },
    {
      id: 'step-5-goals',
      num: 5,
      emoji: 'target',
      title: 'Create Savings Goals',
      body: 'Set financial targets like emergency fund, holiday, or home renovation. Track your progress visually.',
      cta: 'Create Goal',
      ctaFn: "qsNavigateWithContext('goals', 'step-5-goals')"
    },
    {
      id: 'step-6-bills',
      num: 6,
      emoji: 'calendar',
      title: 'Schedule Bills',
      body: 'Add recurring bills (rent, utilities, insurance). Get reminders before they\'re due.',
      cta: 'Add Bill',
      ctaFn: "qsNavigateWithContext('bills', 'step-6-bills')"
    },
    {
      id: 'step-7-budget',
      num: 7,
      emoji: 'coin',
      title: 'Configure Budget',
      body: 'Set monthly spending limits by category. Track your actual spend against budget in real-time.',
      cta: 'Set Budget',
      ctaFn: "qsNavigateWithContext('bva', 'step-7-budget')"
    }
  ];

  // Build HTML
  var html = '';

  // Progress header
  html += '<div class="card mb">';
  html += '<div class="qs-prog-hd">';
  html += '<div><div class="section-label">Your Progress</div><div class="qs-prog-count">' + progress.completed + ' of ' + progress.total + ' complete</div></div>';
  html += '<div class="qs-prog-pctwrap"><div class="qs-prog-pct">' + progress.pct + '%</div></div>';
  html += '</div>';
  html += '<div class="prog-track"><div class="prog-fill" style="width:' + progress.pct + '%"></div></div>';
  html += '</div>';

  // Completion banner
  if (progress.allDone) {
    html += '<div class="card mb qs-done">';
    html += '<div class="qs-done-row">';
    html += '<div class="qs-done-ico">' + ICON('circle-check-filled') + '</div>';
    html += '<div>';
    html += '<div class="qs-done-title">You\'ve Completed the Quick Start!</div>';
    html += '<div class="qs-done-sub">You\'re all set to manage your finances. Explore other features anytime.</div>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
  }

  // Step cards
  html += '<div>';
  steps.forEach(function(step) {
    var isDone = tasks[step.id];
    html += '<div class="card mb qs-step' + (isDone ? ' qs-step--done' : '') + '">';
    html += '<div class="qs-step-row">';
    html += '<div class="qs-step-ico">' + ICON(step.emoji) + '</div>';
    html += '<div class="qs-step-body">';
    html += '<div class="qs-step-hd">';
    html += '<div class="qs-step-num">STEP ' + step.num + '</div>';
    if (isDone) html += '<span class="qs-done-badge">' + ICON('check') + '</span>';
    html += '</div>';
    html += '<div class="qs-step-title">' + step.title + '</div>';
    html += '<div class="qs-step-text">' + step.body + '</div>';
    html += '<div class="qs-step-actions">';
    html += '<button onclick="' + step.ctaFn + '" class="btn btn-sm qs-cta">→ ' + step.cta + '</button>';
    html += '<button onclick="qsMarkComplete(\'' + step.id + '\')" class="btn btn-sm qs-mark">' + (isDone ? 'Undo' : 'Mark Done') + '</button>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
  });
  html += '</div>';

  // Reset button
  html += '<div class="qs-reset-wrap">';
  html += '<button onclick="qsReset()" class="qs-reset">Reset progress</button>';
  html += '</div>';

  el.innerHTML = html;
}
