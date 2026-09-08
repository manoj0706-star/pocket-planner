// =================== LOCAL STORAGE HELPERS ===================
const STORAGE_KEY = 'pocketplanner_transactions';

function loadFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveToStorage(txns) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(txns));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

let allTransactions = loadFromStorage();

// =================== NAVIGATION ===================
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', function() {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

    this.classList.add('active');
    const sectionId = 'section-' + this.getAttribute('data-section');
    const sectionEl = document.getElementById(sectionId);
    if (sectionEl) sectionEl.classList.add('active');

    // Trigger insight sections
    const section = this.getAttribute('data-section');
    if (section === 'health-score') loadHealthScore();
    else if (section === 'spending-prediction') loadSpendingPrediction();
  });
});

window.navigate = function(section) {
  const navItem = document.querySelector(`.nav-item[data-section="${section}"]`);
  if (navItem) navItem.click();
};

// =================== DATA INIT ===================
function refreshAll() {
  updateDashboard();
  renderTransactions();
  updateCharts();
  updateBudgetUI();
  renderCategoryBudgets();
}

// =================== ADD TRANSACTION ===================
window.addTransaction = function(type) {
  const prefix = type === 'income' ? 'inc' : 'exp';
  const amount = document.getElementById(`${prefix}-amount`).value;
  const date = document.getElementById(`${prefix}-date`).value || new Date().toISOString().split('T')[0];
  const category = document.getElementById(`${prefix}-category`).value;
  const note = document.getElementById(`${prefix}-note`).value;

  if (!amount || amount <= 0) return showToast('Enter a valid amount', 'error');
  if (!category) return showToast('Select a category', 'error');

  const newTx = {
    _id: generateId(),
    type,
    amount: Number(amount),
    date,
    category,
    note: note || ''
  };

  allTransactions.unshift(newTx); // newest first
  saveToStorage(allTransactions);

  showToast('Transaction Added!', 'success');
  document.getElementById(`${prefix}-amount`).value = '';
  document.getElementById(`${prefix}-date`).value = '';
  document.getElementById(`${prefix}-category`).value = '';
  document.getElementById(`${prefix}-note`).value = '';

  refreshAll();
  navigate('transactions');
};

// =================== DELETE TRANSACTION ===================
window.deleteTransaction = function(id) {
  if (!confirm('Delete this transaction?')) return;
  allTransactions = allTransactions.filter(t => t._id !== id);
  saveToStorage(allTransactions);
  showToast('Deleted transaction', 'success');
  refreshAll();
};

// =================== DASHBOARD ===================
function updateDashboard() {
  let income = 0;
  let expense = 0;

  allTransactions.forEach(t => {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  });

  const balance = income - expense;
  const savingsRate = income > 0 ? ((balance / income) * 100).toFixed(1) : 0;
  const ratio = income > 0 ? ((expense / income) * 100).toFixed(1) : (expense > 0 ? 100 : 0);

  document.getElementById('dash-income').textContent = `₹${income.toLocaleString()}`;
  document.getElementById('dash-expense').textContent = `₹${expense.toLocaleString()}`;
  document.getElementById('dash-balance').textContent = `₹${balance.toLocaleString()}`;
  document.getElementById('dash-savings').textContent = `${savingsRate}%`;

  document.getElementById('ratio-pct').textContent = `${ratio}%`;
  document.getElementById('ratio-bar').style.width = `${Math.min(ratio, 100)}%`;

  const recentTbody = document.getElementById('recent-tbody');
  const emptyState = document.getElementById('recent-empty');

  if (allTransactions.length === 0) {
    recentTbody.innerHTML = '';
    emptyState.style.display = 'flex';
  } else {
    emptyState.style.display = 'none';
    recentTbody.innerHTML = allTransactions.slice(0, 5).map(t => {
      const isInc = t.type === 'income';
      return `
        <tr>
          <td>${new Date(t.date).toLocaleDateString()}</td>
          <td><span style="color: ${isInc ? 'var(--income)' : 'var(--expense)'}">${t.type}</span></td>
          <td>${t.category}</td>
          <td>${isInc ? '+' : '-'}₹${t.amount.toLocaleString()}</td>
          <td>${t.note || '-'}</td>
        </tr>
      `;
    }).join('');
  }
}

// =================== TRANSACTIONS LIST ===================
window.renderTransactions = function() {
  const typeFilter = document.getElementById('filter-type').value;
  const catFilter = document.getElementById('filter-cat').value;

  let filtered = allTransactions;
  if (typeFilter) filtered = filtered.filter(t => t.type === typeFilter);
  if (catFilter) filtered = filtered.filter(t => t.category === catFilter);

  const tbody = document.getElementById('tx-tbody');
  const empty = document.getElementById('tx-empty');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
  } else {
    empty.style.display = 'none';
    tbody.innerHTML = filtered.map(t => {
      const isInc = t.type === 'income';
      return `
        <tr>
          <td>${new Date(t.date).toLocaleDateString()}</td>
          <td><span style="color: ${isInc ? 'var(--income)' : 'var(--expense)'}">${t.type}</span></td>
          <td>${t.category}</td>
          <td>${isInc ? '+' : '-'}₹${t.amount.toLocaleString()}</td>
          <td>${t.note || '-'}</td>
          <td>
            <button onclick="deleteTransaction('${t._id}')" class="btn btn-primary" style="background:#ff4d4d;border:none;padding:5px 10px;font-size:0.8rem;">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  }
};

// =================== CHARTS ===================
let pieChart, barChart, lineChart;
function updateCharts() {
  if (typeof Chart === 'undefined') return;

  const expensesByCategory = {};
  const monthlyData = {};

  allTransactions.forEach(t => {
    const d = new Date(t.date);
    const monthKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        income: 0,
        expense: 0,
        label: d.toLocaleString('default', { month: 'short', year: 'numeric' })
      };
    }

    if (t.type === 'expense') {
      expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount;
      monthlyData[monthKey].expense += t.amount;
    } else {
      monthlyData[monthKey].income += t.amount;
    }
  });

  // Pie Chart
  const pieCtx = document.getElementById('pieChart');
  if (pieCtx && Object.keys(expensesByCategory).length > 0) {
    const pieCanvas = pieCtx.getContext('2d');
    if (pieChart) pieChart.destroy();
    pieChart = new Chart(pieCanvas, {
      type: 'doughnut',
      data: {
        labels: Object.keys(expensesByCategory),
        datasets: [{
          data: Object.values(expensesByCategory),
          backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#E7E9ED', '#71B37C']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  const sortedKeys = Object.keys(monthlyData).sort();
  const labels = sortedKeys.map(k => monthlyData[k].label);
  const incomeData = sortedKeys.map(k => monthlyData[k].income);
  const expenseData = sortedKeys.map(k => monthlyData[k].expense);
  const savingsData = sortedKeys.map(k => monthlyData[k].income - monthlyData[k].expense);

  const barCtx = document.getElementById('barChart');
  if (barCtx && labels.length > 0) {
    if (barChart) barChart.destroy();
    barChart = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Income', data: incomeData, backgroundColor: '#4BC0C0' },
          { label: 'Expense', data: expenseData, backgroundColor: '#FF6384' }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  const lineCtx = document.getElementById('lineChart');
  if (lineCtx && labels.length > 0) {
    if (lineChart) lineChart.destroy();
    lineChart = new Chart(lineCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Savings',
          data: savingsData,
          borderColor: '#36A2EB',
          borderWidth: 2,
          fill: true,
          backgroundColor: 'rgba(54, 162, 235, 0.1)'
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

// =================== MONTHLY BUDGET ===================
window.saveMonthlyBudget = function() {
  const month = document.getElementById('mb-month').value;
  const amount = Number(document.getElementById('mb-amount').value);
  if (!month || amount <= 0) return showToast('Enter valid month and amount', 'error');

  const budgets = JSON.parse(localStorage.getItem('monthlyBudgets') || '{}');
  budgets[month] = amount;
  localStorage.setItem('monthlyBudgets', JSON.stringify(budgets));
  showToast('Budget saved', 'success');
  updateBudgetUI();
};

function updateBudgetUI() {
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const budgets = JSON.parse(localStorage.getItem('monthlyBudgets') || '{}');

  let monthlyExpenses = 0;
  allTransactions.forEach(t => {
    if (t.type === 'expense' && t.date.startsWith(currentMonthStr)) {
      monthlyExpenses += t.amount;
    }
  });

  const currentBudget = budgets[currentMonthStr] || 0;
  document.getElementById('mb-total').textContent = `₹${currentBudget.toLocaleString()}`;
  document.getElementById('mb-spent').textContent = `₹${monthlyExpenses.toLocaleString()}`;
  document.getElementById('mb-remaining').textContent = `₹${Math.max(0, currentBudget - monthlyExpenses).toLocaleString()}`;

  const usagePct = currentBudget > 0 ? ((monthlyExpenses / currentBudget) * 100).toFixed(1) : 0;
  document.getElementById('mb-usage-pct').textContent = `${usagePct}%`;
  document.getElementById('mb-bar-pct').textContent = `${usagePct}%`;
  document.getElementById('mb-bar').style.width = `${Math.min(usagePct, 100)}%`;

  const formattedMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
  document.getElementById('mb-month-label').textContent = formattedMonth;

  // Warning
  const warningEl = document.getElementById('mb-warning');
  if (currentBudget > 0 && monthlyExpenses >= currentBudget * 0.9) {
    warningEl.style.display = 'block';
    warningEl.textContent = monthlyExpenses >= currentBudget
      ? `🔴 You've exceeded your monthly budget by ₹${(monthlyExpenses - currentBudget).toLocaleString()}!`
      : `⚠️ You've used ${usagePct}% of your budget. Spend carefully!`;
  } else {
    warningEl.style.display = 'none';
  }

  // History
  const historyTbody = document.getElementById('mb-history-tbody');
  const emptyHistory = document.getElementById('mb-history-empty');

  const historyHtml = Object.keys(budgets).sort().reverse().map(m => {
    let exp = 0;
    allTransactions.forEach(t => {
      if (t.type === 'expense' && t.date.startsWith(m)) exp += t.amount;
    });
    const b = budgets[m];
    const rem = b - exp;
    const u = b > 0 ? ((exp / b) * 100).toFixed(1) : 0;
    const status = exp > b ? '🔴 Over Budget' : '🟢 Under Budget';
    return `<tr><td>${m}</td><td>₹${b.toLocaleString()}</td><td>₹${exp.toLocaleString()}</td><td>₹${rem.toLocaleString()}</td><td>${u}%</td><td>${status}</td></tr>`;
  }).join('');

  if (historyHtml) {
    historyTbody.innerHTML = historyHtml;
    if (emptyHistory) emptyHistory.style.display = 'none';
  } else {
    if (emptyHistory) emptyHistory.style.display = 'flex';
  }

  // Populate category filter
  const cats = [...new Set(allTransactions.map(t => t.category))].filter(Boolean);
  const filterCat = document.getElementById('filter-cat');
  if (filterCat) {
    const currentVal = filterCat.value;
    filterCat.innerHTML = '<option value="">All Categories</option>' +
      cats.map(c => `<option value="${c}">${c}</option>`).join('');
    if (cats.includes(currentVal)) filterCat.value = currentVal;
  }
}

// =================== CATEGORY BUDGETS ===================
window.addBudget = function() {
  const cat = document.getElementById('budget-cat').value;
  const limit = Number(document.getElementById('budget-limit').value);
  if (!cat || limit <= 0) return showToast('Select a category and valid limit', 'error');

  const catBudgets = JSON.parse(localStorage.getItem('categoryBudgets') || '{}');
  catBudgets[cat] = limit;
  localStorage.setItem('categoryBudgets', JSON.stringify(catBudgets));

  showToast('Category Limit Set', 'success');
  document.getElementById('budget-cat').value = '';
  document.getElementById('budget-limit').value = '';
  renderCategoryBudgets();
};

function renderCategoryBudgets() {
  const catBudgets = JSON.parse(localStorage.getItem('categoryBudgets') || '{}');
  const listEl = document.getElementById('budget-list');
  const emptyEl = document.getElementById('budget-empty');
  const currentMonthStr = new Date().toISOString().slice(0, 7);

  const html = Object.keys(catBudgets).map(cat => {
    const limit = catBudgets[cat];
    let spent = 0;
    allTransactions.forEach(t => {
      if (t.type === 'expense' && t.category === cat && t.date.startsWith(currentMonthStr)) {
        spent += t.amount;
      }
    });

    const pct = Math.min((spent / limit) * 100, 100).toFixed(0);
    const over = spent > limit;

    return `
      <div class="budget-item">
        <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
          <strong>${cat}</strong>
          <span>₹${spent.toLocaleString()} / ₹${limit.toLocaleString()}</span>
        </div>
        <div class="progress-track" style="height: 10px;">
          <div class="progress-fill" style="width: ${pct}%; background: ${over ? '#ff4d4d' : '#8B5CF6'}"></div>
        </div>
        ${over ? `<span style="font-size: 0.8rem; color: #ff4d4d;">Exceeded by ₹${(spent - limit).toLocaleString()}</span>` : ''}
      </div>
    `;
  }).join('');

  if (html) {
    if (emptyEl) emptyEl.style.display = 'none';
    listEl.querySelectorAll('.budget-item').forEach(item => item.remove());
    listEl.insertAdjacentHTML('beforeend', html);
  } else {
    if (emptyEl) emptyEl.style.display = 'flex';
  }
}

// =================== FINANCIAL HEALTH SCORE (LOCAL) ===================

// Animate a counter
function animateCounter(el, target, duration = 1000) {
  const start = performance.now();
  const from = parseInt(el.textContent) || 0;
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (target - from) * ease);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function computeHealthScore() {
  const txns = allTransactions;
  if (txns.length === 0) {
    return { score: 0, grade: 'N/A', breakdown: [], tips: ['Add some transactions to get your financial health score!'] };
  }

  const totalIncome = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  // --- Factor 1: Savings Rate (weight 40) ---
  let savingsScore = 0;
  if (totalIncome > 0) {
    const rate = ((totalIncome - totalExpense) / totalIncome) * 100;
    if (rate >= 30) savingsScore = 100;
    else if (rate >= 20) savingsScore = 80;
    else if (rate >= 10) savingsScore = 60;
    else if (rate >= 0) savingsScore = 40;
    else savingsScore = 10; // spending more than earning
  }

  // --- Factor 2: Expense-to-Income Ratio consistency (weight 25) ---
  // Build per-month income vs expense
  const monthly = {};
  txns.forEach(t => {
    const key = t.date.slice(0, 7);
    if (!monthly[key]) monthly[key] = { income: 0, expense: 0 };
    if (t.type === 'income') monthly[key].income += t.amount;
    else monthly[key].expense += t.amount;
  });
  const months = Object.values(monthly);
  let consistencyScore = 50; // default
  if (months.length >= 2) {
    const ratios = months.map(m => m.income > 0 ? m.expense / m.income : 1);
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const variance = ratios.reduce((s, r) => s + Math.pow(r - avg, 2), 0) / ratios.length;
    // Lower variance = more consistent
    consistencyScore = Math.max(0, 100 - variance * 200);
  }

  // --- Factor 3: Debt Burden – EMI/Bills share of expense (weight 20) ---
  const debtExpense = txns
    .filter(t => t.type === 'expense' && (t.category === 'EMI' || t.category === 'Bills'))
    .reduce((s, t) => s + t.amount, 0);
  let debtScore = 100;
  if (totalExpense > 0) {
    const debtRatio = debtExpense / totalExpense;
    if (debtRatio >= 0.5) debtScore = 10;
    else if (debtRatio >= 0.35) debtScore = 40;
    else if (debtRatio >= 0.2) debtScore = 70;
    else debtScore = 100;
  }

  // --- Factor 4: Income Diversity (weight 15) ---
  const incomeCategories = new Set(txns.filter(t => t.type === 'income').map(t => t.category));
  let diversityScore = Math.min(incomeCategories.size * 33, 100);

  // Weighted total
  const score = Math.round(
    savingsScore * 0.40 +
    consistencyScore * 0.25 +
    debtScore * 0.20 +
    diversityScore * 0.15
  );

  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F';

  const breakdown = [
    { label: 'Savings Rate', score: savingsScore, weight: 40 },
    { label: 'Spending Consistency', score: Math.round(consistencyScore), weight: 25 },
    { label: 'Debt Burden', score: debtScore, weight: 20 },
    { label: 'Income Diversity', score: diversityScore, weight: 15 }
  ];

  const tips = [];
  if (savingsScore < 60) tips.push('Try to save at least 20% of your income each month.');
  if (consistencyScore < 60) tips.push('Your spending varies a lot month to month — try to keep expenses stable.');
  if (debtScore < 60) tips.push('EMI/Bills take up a large portion of your expenses. Review fixed commitments.');
  if (diversityScore < 66) tips.push('Consider multiple income sources to reduce financial risk.');
  if (tips.length === 0) tips.push('Excellent financial health! Keep maintaining your current habits. 🎉');

  return { score, grade, breakdown, tips };
}

function loadHealthScore() {
  const data = computeHealthScore();

  const scoreEl = document.getElementById('health-score-val');
  animateCounter(scoreEl, data.score, 1200);

  const gradeBadge = document.getElementById('health-grade');
  gradeBadge.textContent = data.grade;
  gradeBadge.className = 'health-grade-badge' + (data.grade !== 'N/A' ? ` grade-${data.grade}` : '');

  const gaugeFill = document.getElementById('gauge-fill');
  if (gaugeFill) {
    const fullArc = 376.99;
    const targetOffset = fullArc - (data.score / 100) * fullArc;
    setTimeout(() => {
      gaugeFill.style.strokeDashoffset = targetOffset;
      const gradeColors = { A: '#34d399', B: '#38bdf8', C: '#fbbf24', D: '#fb923c', F: '#f87171' };
      if (gradeColors[data.grade]) gaugeFill.style.stroke = gradeColors[data.grade];
    }, 100);
  }

  const breakdownEl = document.getElementById('health-breakdown');
  if (data.breakdown && data.breakdown.length) {
    breakdownEl.innerHTML = data.breakdown.map(b => {
      const cls = b.score >= 70 ? 'ok' : b.score >= 40 ? 'mid' : 'low';
      return `
        <div class="breakdown-item">
          <div class="breakdown-header">
            <span class="breakdown-name">${b.label}</span>
            <div class="breakdown-meta">
              <span class="breakdown-weight">${b.weight}%</span>
              <span class="breakdown-val">${b.score}/100</span>
            </div>
          </div>
          <div class="breakdown-track">
            <div class="breakdown-fill ${cls}" style="width:${b.score}%"></div>
          </div>
        </div>`;
    }).join('');
  } else {
    breakdownEl.innerHTML = '<div class="breakdown-loading">No data yet.</div>';
  }

  const tipsList = document.getElementById('health-tips');
  tipsList.innerHTML = (data.tips || []).map(tip => `<li>${tip}</li>`).join('');
}

// =================== SPENDING PREDICTION (LOCAL) ===================
function computeSpendingPrediction() {
  const alpha = 0.4; // exponential smoothing factor

  // Group expenses & income by month, then by category
  const monthlyByCategory = {};
  const monthlyIncome = {};

  allTransactions.forEach(t => {
    const m = t.date.slice(0, 7);
    if (t.type === 'expense') {
      if (!monthlyByCategory[t.category]) monthlyByCategory[t.category] = {};
      monthlyByCategory[t.category][m] = (monthlyByCategory[t.category][m] || 0) + t.amount;
    } else {
      monthlyIncome[m] = (monthlyIncome[m] || 0) + t.amount;
    }
  });

  const allMonths = [...new Set(allTransactions.map(t => t.date.slice(0, 7)))].sort();
  const monthsOfData = allMonths.length;

  if (monthsOfData === 0) {
    return {
      totalExpensePrediction: 0,
      totalIncomePrediction: 0,
      predictedSavings: 0,
      confidence: 'none',
      monthsOfData: 0,
      predictions: []
    };
  }

  // Exponential smoothing helper
  function smoothedPredict(seriesObj, months) {
    const values = months.map(m => seriesObj[m] || 0);
    if (values.length === 0) return 0;
    let smoothed = values[0];
    for (let i = 1; i < values.length; i++) {
      smoothed = alpha * values[i] + (1 - alpha) * smoothed;
    }
    return Math.round(smoothed);
  }

  function avgLast3(seriesObj, months) {
    const recent = months.slice(-3);
    const vals = recent.map(m => seriesObj[m] || 0);
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  function trendDir(seriesObj, months) {
    if (months.length < 2) return 'stable';
    const vals = months.map(m => seriesObj[m] || 0);
    const last = vals[vals.length - 1];
    const prev = vals[vals.length - 2];
    const diff = last - prev;
    if (Math.abs(diff) < last * 0.05) return 'stable';
    return diff > 0 ? 'up' : 'down';
  }

  const predictions = Object.keys(monthlyByCategory).map(cat => {
    const predicted = smoothedPredict(monthlyByCategory[cat], allMonths);
    const avg = avgLast3(monthlyByCategory[cat], allMonths);
    const trend = trendDir(monthlyByCategory[cat], allMonths);
    return { category: cat, predicted, avgLast3: avg, trend };
  }).sort((a, b) => b.predicted - a.predicted);

  const totalExpensePrediction = predictions.reduce((s, p) => s + p.predicted, 0);
  const totalIncomePrediction = smoothedPredict(monthlyIncome, allMonths);
  const predictedSavings = totalIncomePrediction - totalExpensePrediction;

  const confidence = monthsOfData >= 4 ? 'high' : monthsOfData >= 2 ? 'medium' : 'low';

  return {
    totalExpensePrediction,
    totalIncomePrediction,
    predictedSavings,
    confidence,
    monthsOfData,
    predictions
  };
}

function loadSpendingPrediction() {
  const data = computeSpendingPrediction();

  document.getElementById('pred-total-exp').textContent = `₹${data.totalExpensePrediction.toLocaleString()}`;
  document.getElementById('pred-total-inc').textContent = `₹${data.totalIncomePrediction.toLocaleString()}`;

  const savings = data.predictedSavings;
  const savingsEl = document.getElementById('pred-savings');
  savingsEl.textContent = `${savings >= 0 ? '+' : ''}₹${savings.toLocaleString()}`;
  savingsEl.className = 'pred-stat-value ' + (savings >= 0 ? 'income' : 'expense');

  const confBadge = document.getElementById('pred-confidence');
  const confLabel = {
    high: '🟢 High Confidence',
    medium: '🟡 Medium Confidence',
    low: '🔴 Low Confidence',
    none: 'No Data'
  };
  confBadge.textContent = confLabel[data.confidence] || '—';
  confBadge.className = 'confidence-badge ' + (data.confidence || 'none');

  document.getElementById('pred-months-note').textContent =
    data.monthsOfData ? `📅 Based on ${data.monthsOfData} month(s) of data` : '';

  const tbody = document.getElementById('pred-tbody');
  const empty = document.getElementById('pred-empty');

  if (!data.predictions || data.predictions.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
  } else {
    empty.style.display = 'none';
    const trendMap = {
      up: '<span class="trend-badge trend-up">↑ Rising</span>',
      down: '<span class="trend-badge trend-down">↓ Falling</span>',
      stable: '<span class="trend-badge trend-stable">→ Stable</span>'
    };
    tbody.innerHTML = data.predictions.map(p => `
      <tr>
        <td><span class="cat-chip">${p.category}</span></td>
        <td class="amount-expense">₹${p.predicted.toLocaleString()}</td>
        <td style="color:var(--muted)">₹${p.avgLast3.toLocaleString()}</td>
        <td>${trendMap[p.trend] || trendMap.stable}</td>
      </tr>`).join('');
  }
}

// =================== UTILS ===================
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = message;
  document.getElementById('toast-icon').textContent = type === 'success' ? '✅' : '❌';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Set Today's Date
document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

// Inject SVG gradient for gauge
(function injectGaugeGradient() {
  const svg = document.querySelector('.gauge-svg');
  if (!svg) return;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#7c6aff"/>
      <stop offset="100%" stop-color="#34d399"/>
    </linearGradient>`;
  svg.prepend(defs);
})();

// =================== INIT ===================
refreshAll();