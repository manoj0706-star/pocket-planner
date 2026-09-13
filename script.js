// =================== FIREBASE CONFIG ===================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  deleteDoc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ⬇️ Your Firebase config object
const firebaseConfig = {
  apiKey: "AIzaSyCb7itveBMM86S2EaSelo7WoX1Olyyfdt8",
  authDomain: "pocket-planner-d4188.firebaseapp.com",
  projectId: "pocket-planner-d4188",
  storageBucket: "pocket-planner-d4188.firebasestorage.app",
  messagingSenderId: "880200436664",
  appId: "1:880200436664:web:096ca58c6870ed5e95dd4d",
  measurementId: "G-X83PNG4CYK"
};

function isFirebaseConfigured() {
  return firebaseConfig &&
         firebaseConfig.apiKey &&
         !firebaseConfig.apiKey.includes("PASTE_YOUR_API_KEY_HERE") &&
         firebaseConfig.apiKey.length > 10;
}

let app, auth, db;
if (isFirebaseConfigured()) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.warn("Firebase init failed:", e);
  }
}

// =================== STATE ===================
let allTransactions = [];
let currentUser = null;
let unsubscribeTransactions = null;
let quickType = 'expense';

// =================== UTILS & NOTIFICATIONS ===================
// ── NATIVE NOTIFICATION ENGINE ──────────────────────────────
const NOTIF_ICONS = {
  income:    '💰',
  expense:   '💸',
  delete:    '🗑️',
  budget:    '📅',
  category:  '🎯',
  export:    '📥',
  signin:    '👋',
  signout:   '🚪',
  error:     '❌',
  success:   '✅',
  warning:   '⚠️',
  info:      'ℹ️',
};

async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function notify(title, body, type = 'success') {
  const icon = NOTIF_ICONS[type] || NOTIF_ICONS.success;
  // Always show in-app toast
  showToast(`${icon} ${body || title}`, type === 'error' ? 'error' : 'success');

  // Also fire native OS notification
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(`PocketPlanner — ${icon} ${title}`, {
      body: body || title,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💰</text></svg>',
      badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💰</text></svg>',
      tag: `pocketplanner-${type}`,
      renotify: true,
      silent: false,
    });
  } catch(e) {
    // Notifications may fail in some browsers silently
  }
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  document.getElementById('toast-msg').textContent = message;
  document.getElementById('toast-icon').textContent = type === 'success' ? '✅' : '❌';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function resetGoogleBtn() {
  const googleBtn = document.getElementById('google-signin-btn');
  if (!googleBtn) return;
  googleBtn.disabled = false;
  googleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Sign in with Google`;
}

function loadLocalData() {
  const savedTx = localStorage.getItem('pocketplanner_transactions');
  if (savedTx) {
    try { allTransactions = JSON.parse(savedTx); } catch(e) { allTransactions = []; }
  } else {
    allTransactions = [];
  }
  refreshAll();
}

window.exportCSV = function() {
  if (allTransactions.length === 0) return notify('No Data', 'Add some transactions first before exporting.', 'error');
  const headers = ['Date', 'Type', 'Category', 'Amount (INR)', 'Note'];
  const rows = allTransactions.map(t => [
    t.date,
    t.type,
    `"${t.category || ''}"`,
    t.amount,
    `"${(t.note || '').replace(/"/g, '""')}"`
  ]);
  const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `PocketPlanner_Transactions_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  notify('CSV Exported!', `${allTransactions.length} transactions saved to your Downloads folder.`, 'export');
};

window.handleGlobalSearch = function(query) {
  const txSearch = document.getElementById('tx-search');
  if (txSearch) {
    txSearch.value = query;
    if (!document.getElementById('section-transactions').classList.contains('active')) {
      window.navigate('transactions');
    }
    renderTransactions();
  }
};

window.applyIncomePreset = function(val) {
  document.getElementById('inc-amount').value = val;
  showToast(`Preset ₹${val.toLocaleString()} applied`, 'success');
};

window.applyExpensePreset = function(val) {
  document.getElementById('exp-amount').value = val;
  showToast(`Preset ₹${val.toLocaleString()} applied`, 'success');
};

window.clearIncomeForm = function() {
  document.getElementById('inc-amount').value = '';
  document.getElementById('inc-date').value = '';
  document.getElementById('inc-category').value = '';
  document.getElementById('inc-note').value = '';
  showToast('Income form cleared', 'success');
};

window.clearExpenseForm = function() {
  document.getElementById('exp-amount').value = '';
  document.getElementById('exp-date').value = '';
  document.getElementById('exp-category').value = '';
  document.getElementById('exp-note').value = '';
  showToast('Expense form cleared', 'success');
};

window.setMonthlyPreset = function(val) {
  document.getElementById('mb-amount').value = val;
  if (!document.getElementById('mb-month').value) {
    document.getElementById('mb-month').value = new Date().toISOString().slice(0, 7);
  }
  showToast(`Budget preset ₹${val.toLocaleString()} applied`, 'success');
};

// =================== QUICK ADD MODAL ===================
window.openQuickAddModal = function() {
  const modal = document.getElementById('quick-add-modal');
  if (modal) {
    document.getElementById('modal-date').value = new Date().toISOString().split('T')[0];
    modal.style.display = 'flex';
    modal.classList.add('show');
  }
};

window.closeQuickAddModal = function() {
  const modal = document.getElementById('quick-add-modal');
  if (modal) {
    modal.classList.remove('show');
    modal.style.display = 'none';
  }
};

window.switchQuickTab = function(type) {
  quickType = type;
  document.getElementById('modal-tab-exp').classList.toggle('active', type === 'expense');
  document.getElementById('modal-tab-inc').classList.toggle('active', type === 'income');
};

window.saveQuickAdd = async function() {
  const amount = Number(document.getElementById('modal-amount').value);
  const category = document.getElementById('modal-category').value;
  const date = document.getElementById('modal-date').value || new Date().toISOString().split('T')[0];
  const note = document.getElementById('modal-note').value || '';

  if (!amount || amount <= 0) return showToast('Enter valid amount', 'error');
  if (!category) return showToast('Select category', 'error');

  const newTx = { type: quickType, amount, date, category, note, createdAt: Date.now() };

  if (!isFirebaseConfigured() || (currentUser && currentUser.isDemo)) {
    newTx._id = generateId();
    allTransactions.unshift(newTx);
    localStorage.setItem('pocketplanner_transactions', JSON.stringify(allTransactions));
    showToast('Transaction Added!', 'success');
    refreshAll();
    closeQuickAddModal();
    document.getElementById('modal-amount').value = '';
    document.getElementById('modal-note').value = '';
    return;
  }

  try {
    await addDoc(txCollection(currentUser.uid), newTx);
    showToast('Transaction Added!', 'success');
    closeQuickAddModal();
    document.getElementById('modal-amount').value = '';
    document.getElementById('modal-note').value = '';
  } catch(e) {
    showToast('Failed to save', 'error');
  }
};

// =================== AUTH ===================
const loginOverlay = document.getElementById('login-overlay');
const googleBtn = document.getElementById('google-signin-btn');

window.enterDemoMode = function() {
  const demoUser = {
    uid: 'demo_google_user',
    displayName: 'Google User (Demo)',
    email: 'user@gmail.com',
    photoURL: '',
    isDemo: true
  };
  currentUser = demoUser;
  localStorage.setItem('pocketplanner_user', JSON.stringify(demoUser));
  if (loginOverlay) loginOverlay.style.display = 'none';
  showUserProfile(demoUser);
  loadLocalData();
  document.getElementById('sync-text').textContent = 'Local Mode';
  requestNotificationPermission().then(() => {
    notify('Welcome to Demo Mode!', 'All data saved locally on this device.', 'signin');
  });
};

if (googleBtn) {
  googleBtn.addEventListener('click', async () => {
    if (!isFirebaseConfigured()) {
      // No Firebase config — use demo mode
      const demoUser = {
        uid: 'demo_google_user',
        displayName: 'Demo User',
        email: 'demo@pocketplanner.app',
        photoURL: '',
        isDemo: true
      };
      currentUser = demoUser;
      localStorage.setItem('pocketplanner_user', JSON.stringify(demoUser));
      loginOverlay.style.display = 'none';
      showUserProfile(demoUser);
      loadLocalData();
      requestNotificationPermission().then(() => {
        notify('Welcome!', 'Running in demo mode. Data saved locally.', 'signin');
      });
      return;
    }

    googleBtn.disabled = true;
    googleBtn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px">
      <svg width="18" height="18" viewBox="0 0 24 24" style="animation:spin 1s linear infinite">
        <circle cx="12" cy="12" r="10" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="31 31" stroke-linecap="round"/>
      </svg> Signing in…</span>`;

    // Add spin keyframes if not present
    if (!document.getElementById('spin-style')) {
      const s = document.createElement('style');
      s.id = 'spin-style';
      s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      // popup() is called directly inside a click handler — browsers should NOT block it
      const result = await signInWithPopup(auth, provider);
      // onAuthStateChanged will handle the rest
      console.log('Signed in:', result.user.email);
    } catch (err) {
      console.error('Firebase popup error:', err.code, err.message);

      if (err.code === 'auth/popup-blocked') {
        // Browser blocked the popup — fall back to redirect
        showAuthError('Popup was blocked. Redirecting to Google login…');
        try {
          await signInWithRedirect(auth, provider);
        } catch (redirectErr) {
          showAuthError('Sign-in failed: ' + (redirectErr.message || 'Unknown error'));
          resetGoogleBtn();
        }
      } else if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        showAuthError('Sign-in window closed. Try again.');
        resetGoogleBtn();
      } else if (err.code === 'auth/operation-not-allowed') {
        showAuthError('Google sign-in is not enabled in Firebase Console. Go to Authentication → Sign-in method → enable Google.');
        resetGoogleBtn();
      } else if (err.code === 'auth/unauthorized-domain') {
        showAuthError('Domain not authorized (' + window.location.hostname + '). Add it to Firebase Console → Authentication → Settings → Authorized domains.');
        resetGoogleBtn();
      } else if (err.code === 'auth/network-request-failed') {
        showAuthError('Network error. Check your internet connection and try again.');
        resetGoogleBtn();
      } else if (err.code === 'auth/invalid-api-key') {
        showAuthError('Invalid Firebase API key. Please check your firebaseConfig.');
        resetGoogleBtn();
      } else {
        showAuthError(err.message || 'Authentication error (' + err.code + ')');
        resetGoogleBtn();
      }
    }
  });
}

function showAuthError(msg) {
  let el = document.getElementById('auth-error-msg');
  if (!el) {
    el = document.createElement('p');
    el.id = 'auth-error-msg';
    el.style.cssText = 'color:#f87171;font-size:13px;margin-top:12px;text-align:center;max-width:320px;line-height:1.4;';
    const btn = document.getElementById('google-signin-btn');
    if (btn) btn.parentNode.insertBefore(el, btn.nextSibling);
  }
  el.textContent = msg;
  setTimeout(() => { if (el) el.textContent = ''; }, 8000);
}

// Handle redirect result on page load
if (isFirebaseConfigured() && auth) {
  getRedirectResult(auth).then((result) => {
    if (result && result.user) {
      // User successfully signed in via redirect — onAuthStateChanged will handle the rest
      requestNotificationPermission().then(() => {
        notify('Signed in!', `Welcome, ${result.user.displayName || 'User'}! Cloud sync active.`, 'signin');
      });
    }
  }).catch((err) => {
    if (err.code !== 'auth/no-current-user') {
      console.error('Redirect result error:', err.code, err.message);
    }
  });
}

async function doLogout() {
  if (unsubscribeTransactions) unsubscribeTransactions();
  notify('Signed Out', 'You have been signed out of PocketPlanner.', 'signout');
  localStorage.removeItem('pocketplanner_user');
  currentUser = null;
  if (loginOverlay) loginOverlay.style.display = 'flex';
  const profileEl = document.getElementById('user-profile');
  if (profileEl) profileEl.style.display = 'none';
  const headerBadge = document.getElementById('header-user-badge');
  if (headerBadge) headerBadge.style.display = 'none';
  allTransactions = [];
  refreshAll();
  if (auth && isFirebaseConfigured()) {
    try { await signOut(auth); } catch(e) {}
  }
}
window.doLogout = doLogout;

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', doLogout);
}
const headerLogoutBtn = document.getElementById('header-logout-btn');
if (headerLogoutBtn) {
  headerLogoutBtn.addEventListener('click', doLogout);
}

// Eagerly restore session from localStorage to prevent flash
const initialSavedUser = localStorage.getItem('pocketplanner_user');
if (initialSavedUser) {
  try {
    const parsed = JSON.parse(initialSavedUser);
    currentUser = parsed;
    if (loginOverlay) loginOverlay.style.display = 'none';
    showUserProfile(parsed);
    loadLocalData();
    document.getElementById('sync-text').textContent = parsed.isDemo ? 'Demo Mode' : 'Local Mode';
  } catch(e) {}
} else {
  if (loginOverlay) loginOverlay.style.display = 'flex';
}

if (isFirebaseConfigured() && auth) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // Firebase authenticated user
      currentUser = user;
      if (loginOverlay) loginOverlay.style.display = 'none';
      showUserProfile(user);
      subscribeToData(user.uid);
      document.getElementById('sync-text').textContent = 'Cloud Synced';
      requestNotificationPermission();
    } else {
      // No Firebase user — check if there's a demo/local session in localStorage
      const savedUser = localStorage.getItem('pocketplanner_user');
      if (savedUser) {
        try {
          const localUser = JSON.parse(savedUser);
          currentUser = localUser;
          if (loginOverlay) loginOverlay.style.display = 'none';
          showUserProfile(localUser);
          loadLocalData();
          document.getElementById('sync-text').textContent = localUser.isDemo ? 'Demo Mode' : 'Local Mode';
          return; // Don't show login overlay
        } catch(e) {}
      }
      // Truly not logged in — show login screen
      currentUser = null;
      if (loginOverlay) loginOverlay.style.display = 'flex';
      const profileEl = document.getElementById('user-profile');
      if (profileEl) profileEl.style.display = 'none';
      const headerBadge = document.getElementById('header-user-badge');
      if (headerBadge) headerBadge.style.display = 'none';
      if (unsubscribeTransactions) unsubscribeTransactions();
      allTransactions = [];
      refreshAll();
    }
  });
} else {
  const savedUser = localStorage.getItem('pocketplanner_user');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      if (loginOverlay) loginOverlay.style.display = 'none';
      showUserProfile(currentUser);
      loadLocalData();
      document.getElementById('sync-text').textContent = 'Local Mode';
    } catch(e) {
      if (loginOverlay) loginOverlay.style.display = 'flex';
    }
  } else {
    if (loginOverlay) loginOverlay.style.display = 'flex';
  }
}

function showUserProfile(user) {
  const profileEl = document.getElementById('user-profile');
  if (profileEl) {
    profileEl.style.display = 'block';
    document.getElementById('user-name').textContent = user.displayName || 'User';
    document.getElementById('user-email').textContent = user.email || '';
    const avatar = document.getElementById('user-avatar');
    const fallback = document.getElementById('user-avatar-fallback');
    if (user.photoURL) {
      avatar.src = user.photoURL;
      avatar.style.display = 'block';
      if (fallback) fallback.style.display = 'none';
    } else {
      avatar.style.display = 'none';
      if (fallback) {
        fallback.style.display = 'flex';
        fallback.textContent = (user.displayName || 'U').charAt(0).toUpperCase();
      }
    }
  }

  const headerBadge = document.getElementById('header-user-badge');
  if (headerBadge) {
    headerBadge.style.display = 'inline-flex';
    const headerName = document.getElementById('header-user-name');
    if (headerName) headerName.textContent = (user.displayName || 'User').split(' ')[0];
  }
}

// =================== FIRESTORE PATHS ===================
function txCollection(uid) {
  return collection(db, 'users', uid, 'transactions');
}
function budgetsDoc(uid) {
  return doc(db, 'users', uid, 'budgets', 'monthly');
}
function categoryBudgetsDoc(uid) {
  return doc(db, 'users', uid, 'budgets', 'category');
}

// =================== REAL-TIME LISTENER ===================
function subscribeToData(uid) {
  if (unsubscribeTransactions) unsubscribeTransactions();

  const q = query(txCollection(uid), orderBy('createdAt', 'desc'));
  unsubscribeTransactions = onSnapshot(q, (snapshot) => {
    allTransactions = snapshot.docs.map(d => ({ _id: d.id, ...d.data() }));
    localStorage.setItem('pocketplanner_transactions', JSON.stringify(allTransactions));
    refreshAll();
  });
}

// =================== NAVIGATION & MOBILE DRAWER ===================
window.toggleMobileSidebar = function() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.toggle('open');
  if (backdrop) backdrop.classList.toggle('show');
};

window.closeMobileSidebar = function() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('show');
};

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', function() {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

    this.classList.add('active');
    const sectionId = 'section-' + this.getAttribute('data-section');
    const sectionEl = document.getElementById(sectionId);
    if (sectionEl) sectionEl.classList.add('active');

    const section = this.getAttribute('data-section');
    if (section === 'health-score') loadHealthScore();
    else if (section === 'spending-prediction') loadSpendingPrediction();

    closeMobileSidebar();
  });
});

window.navigate = function(section) {
  const navItem = document.querySelector(`.nav-item[data-section="${section}"]`);
  if (navItem) navItem.click();
  closeMobileSidebar();
};

// =================== DATA INIT ===================
function refreshAll() {
  updateDashboard();
  renderTransactions();
  updateCharts();
  updateBudgetUI();
  renderCategoryBudgets();
  renderReports();
}

// =================== ADD TRANSACTION ===================
window.addTransaction = async function(type) {
  if (!currentUser) return showToast('Please sign in first', 'error');

  const prefix = type === 'income' ? 'inc' : 'exp';
  const amount = document.getElementById(`${prefix}-amount`).value;
  const date = document.getElementById(`${prefix}-date`).value || new Date().toISOString().split('T')[0];
  const category = document.getElementById(`${prefix}-category`).value;
  const note = document.getElementById(`${prefix}-note`).value;

  if (!amount || amount <= 0) return showToast('Enter a valid amount', 'error');
  if (!category) return showToast('Select a category', 'error');

  const newTx = {
    type,
    amount: Number(amount),
    date,
    category,
    note: note || '',
    createdAt: Date.now()
  };

  if (!isFirebaseConfigured() || currentUser.isDemo) {
    newTx._id = generateId();
    allTransactions.unshift(newTx);
    localStorage.setItem('pocketplanner_transactions', JSON.stringify(allTransactions));
    const notifType = type === 'income' ? 'income' : 'expense';
    const sign = type === 'income' ? '+' : '-';
    notify(
      type === 'income' ? 'Income Added!' : 'Expense Recorded!',
      `${sign}₹${Number(amount).toLocaleString()} · ${category}${note ? ' · ' + note : ''}`,
      notifType
    );
    document.getElementById(`${prefix}-amount`).value = '';
    document.getElementById(`${prefix}-date`).value = '';
    document.getElementById(`${prefix}-category`).value = '';
    document.getElementById(`${prefix}-note`).value = '';
    refreshAll();
    navigate('transactions');
    return;
  }

  try {
    await addDoc(txCollection(currentUser.uid), newTx);
    const sign = type === 'income' ? '+' : '-';
    notify(
      type === 'income' ? 'Income Added!' : 'Expense Recorded!',
      `${sign}₹${Number(amount).toLocaleString()} · ${category}${note ? ' · ' + note : ''} · Synced to cloud`,
      type === 'income' ? 'income' : 'expense'
    );
    document.getElementById(`${prefix}-amount`).value = '';
    document.getElementById(`${prefix}-date`).value = '';
    document.getElementById(`${prefix}-category`).value = '';
    document.getElementById(`${prefix}-note`).value = '';
    navigate('transactions');
  } catch (err) {
    notify('Save Failed', 'Could not save transaction. Please try again.', 'error');
    console.error(err);
  }
};

// =================== DELETE TRANSACTION ===================
window.deleteTransaction = async function(id) {
  if (!currentUser) return;
  if (!confirm('Delete this transaction?')) return;

  const tx = allTransactions.find(t => (t._id || t.id) === id);
  const txLabel = tx ? `₹${Number(tx.amount).toLocaleString()} · ${tx.category}` : 'Transaction';

  if (!isFirebaseConfigured() || currentUser.isDemo) {
    allTransactions = allTransactions.filter(t => (t._id || t.id) !== id);
    localStorage.setItem('pocketplanner_transactions', JSON.stringify(allTransactions));
    refreshAll();
    notify('Transaction Deleted', txLabel + ' has been removed.', 'delete');
    return;
  }

  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'transactions', id));
    notify('Transaction Deleted', txLabel + ' removed and synced.', 'delete');
  } catch (err) {
    notify('Delete Failed', 'Could not delete. Try again.', 'error');
    console.error(err);
  }
};

// =================== DASHBOARD ===================
function updateDashboard() {
  let income = 0;
  let expense = 0;

  allTransactions.forEach(t => {
    if (t.type === 'income') income += Number(t.amount);
    else if (t.type === 'expense') expense += Number(t.amount);
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
          <td>${t.date || '—'}</td>
          <td><span class="type-pill ${t.type}">${isInc ? '📈 Income' : '📉 Expense'}</span></td>
          <td><strong>${t.category}</strong></td>
          <td class="amount-${t.type}">${isInc ? '+' : '-'}₹${Number(t.amount).toLocaleString()}</td>
          <td style="color:var(--text-muted);">${t.note || '—'}</td>
        </tr>
      `;
    }).join('');
  }
}

// =================== TRANSACTIONS LIST ===================
window.renderTransactions = function() {
  const typeFilter = document.getElementById('filter-type')?.value || '';
  const catFilter = document.getElementById('filter-cat')?.value || '';
  const searchVal = (document.getElementById('tx-search')?.value || '').toLowerCase();

  let filtered = allTransactions.filter(t => {
    if (typeFilter && t.type !== typeFilter) return false;
    if (catFilter && t.category !== catFilter) return false;
    if (searchVal) {
      const matchNote = (t.note || '').toLowerCase().includes(searchVal);
      const matchCat = (t.category || '').toLowerCase().includes(searchVal);
      const matchAmount = (t.amount || '').toString().includes(searchVal);
      if (!matchNote && !matchCat && !matchAmount) return false;
    }
    return true;
  });

  const tbody = document.getElementById('tx-tbody');
  const empty = document.getElementById('tx-empty');

  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'flex';
  } else {
    if (empty) empty.style.display = 'none';
    tbody.innerHTML = filtered.map(t => {
      const isInc = t.type === 'income';
      return `
        <tr>
          <td>${t.date || '—'}</td>
          <td><span class="type-pill ${t.type}">${isInc ? '📈 Income' : '📉 Expense'}</span></td>
          <td><strong>${t.category}</strong></td>
          <td class="amount-${t.type}">${isInc ? '+' : '-'}₹${Number(t.amount).toLocaleString()}</td>
          <td style="color:var(--text-muted);">${t.note || '—'}</td>
          <td>
            <button onclick="deleteTransaction('${t._id || t.id}')" class="btn-del">🗑️ Delete</button>
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
    const d = new Date(t.date || Date.now());
    const monthKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        income: 0,
        expense: 0,
        label: d.toLocaleString('default', { month: 'short', year: 'numeric' })
      };
    }

    if (t.type === 'expense') {
      expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + Number(t.amount);
      monthlyData[monthKey].expense += Number(t.amount);
    } else {
      monthlyData[monthKey].income += Number(t.amount);
    }
  });

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
          backgroundColor: ['#f43f5e', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'],
          borderWidth: 2,
          borderColor: '#0f121a'
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9ca3af' } } } }
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
          { label: 'Income', data: incomeData, backgroundColor: '#10b981', borderRadius: 6 },
          { label: 'Expense', data: expenseData, backgroundColor: '#f43f5e', borderRadius: 6 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: '#9ca3af' } }, y: { ticks: { color: '#9ca3af' } } } }
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
          label: 'Savings Trend',
          data: savingsData,
          borderColor: '#8b5cf6',
          borderWidth: 3,
          tension: 0.4,
          fill: true,
          backgroundColor: 'rgba(139, 92, 246, 0.15)'
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: '#9ca3af' } }, y: { ticks: { color: '#9ca3af' } } } }
    });
  }
}

// =================== MONTHLY BUDGET ===================
window.saveMonthlyBudget = async function() {
  if (!currentUser) return notify('Sign In Required', 'Please sign in to save budgets.', 'error');

  const month = document.getElementById('mb-month').value;
  const amount = Number(document.getElementById('mb-amount').value);
  if (!month || amount <= 0) return notify('Invalid Input', 'Enter a valid month and budget amount.', 'error');

  if (!isFirebaseConfigured() || currentUser.isDemo) {
    const budgets = JSON.parse(localStorage.getItem('pocketplanner_monthly_budgets') || '{}');
    budgets[month] = amount;
    localStorage.setItem('pocketplanner_monthly_budgets', JSON.stringify(budgets));
    notify('Budget Saved!', `₹${amount.toLocaleString()} monthly limit set for ${month}.`, 'budget');
    updateBudgetUI();
    return;
  }

  try {
    const ref = budgetsDoc(currentUser.uid);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? snap.data() : {};
    existing[month] = amount;
    await setDoc(ref, existing);
    notify('Budget Saved!', `₹${amount.toLocaleString()} monthly limit set for ${month} · Synced.`, 'budget');
    updateBudgetUI();
  } catch (err) {
    notify('Save Failed', 'Could not save monthly budget.', 'error');
    console.error(err);
  }
};

async function getMonthlyBudgets() {
  if (!currentUser) return {};
  if (!isFirebaseConfigured() || currentUser.isDemo) {
    return JSON.parse(localStorage.getItem('pocketplanner_monthly_budgets') || '{}');
  }
  try {
    const snap = await getDoc(budgetsDoc(currentUser.uid));
    return snap.exists() ? snap.data() : {};
  } catch {
    return {};
  }
}

async function updateBudgetUI() {
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const budgets = await getMonthlyBudgets();

  let monthlyExpenses = 0;
  allTransactions.forEach(t => {
    if (t.type === 'expense' && t.date.startsWith(currentMonthStr)) {
      monthlyExpenses += Number(t.amount);
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

  const warningEl = document.getElementById('mb-warning');
  if (currentBudget > 0 && monthlyExpenses >= currentBudget * 0.9) {
    warningEl.style.display = 'block';
    warningEl.textContent = monthlyExpenses >= currentBudget
      ? `🔴 Exceeded monthly budget by ₹${(monthlyExpenses - currentBudget).toLocaleString()}!`
      : `⚠️ Used ${usagePct}% of budget. Spend carefully!`;
    // Fire OS notification for budget warnings
    if (monthlyExpenses >= currentBudget) {
      notify(
        '🔴 Budget Exceeded!',
        `You've overspent by ₹${(monthlyExpenses - currentBudget).toLocaleString()} this month!`,
        'warning'
      );
    } else if (usagePct >= 90 && !window._notifiedAt90) {
      window._notifiedAt90 = true;
      notify(
        '⚠️ Budget Alert!',
        `You've used ${usagePct}% of your monthly budget. Slow down!`,
        'warning'
      );
    }
  } else {
    warningEl.style.display = 'none';
    window._notifiedAt90 = false;
  }

  const historyTbody = document.getElementById('mb-history-tbody');
  const emptyHistory = document.getElementById('mb-history-empty');

  const historyHtml = Object.keys(budgets).sort().reverse().map(m => {
    let exp = 0;
    allTransactions.forEach(t => {
      if (t.type === 'expense' && t.date.startsWith(m)) exp += Number(t.amount);
    });
    const b = budgets[m];
    const rem = b - exp;
    const u = b > 0 ? ((exp / b) * 100).toFixed(1) : 0;
    const status = exp > b ? '🔴 Over Budget' : '🟢 Under Budget';
    return `<tr><td>${m}</td><td>₹${b.toLocaleString()}</td><td>₹${exp.toLocaleString()}</td><td>₹${rem.toLocaleString()}</td><td>${u}%</td><td>${status}</td></tr>`;
  }).join('');

  if (historyHtml) {
    if (historyTbody) historyTbody.innerHTML = historyHtml;
    if (emptyHistory) emptyHistory.style.display = 'none';
  } else {
    if (emptyHistory) emptyHistory.style.display = 'flex';
  }

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
window.addBudget = async function() {
  if (!currentUser) return showToast('Please sign in first', 'error');

  const cat = document.getElementById('budget-cat').value;
  const limit = Number(document.getElementById('budget-limit').value);
  if (!cat || limit <= 0) return showToast('Select a category and valid limit', 'error');

  if (!isFirebaseConfigured() || currentUser.isDemo) {
    const catBudgets = JSON.parse(localStorage.getItem('pocketplanner_category_budgets') || '{}');
    catBudgets[cat] = limit;
    localStorage.setItem('pocketplanner_category_budgets', JSON.stringify(catBudgets));
    notify('Category Limit Set!', `${cat} · Max ₹${limit.toLocaleString()} per month.`, 'category');
    document.getElementById('budget-cat').value = '';
    document.getElementById('budget-limit').value = '';
    renderCategoryBudgets();
    return;
  }

  try {
    const ref = categoryBudgetsDoc(currentUser.uid);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? snap.data() : {};
    existing[cat] = limit;
    await setDoc(ref, existing);

    notify('Category Limit Set!', `${cat} · Max ₹${limit.toLocaleString()} per month · Synced.`, 'category');
    document.getElementById('budget-cat').value = '';
    document.getElementById('budget-limit').value = '';
    renderCategoryBudgets();
  } catch (err) {
    notify('Save Failed', 'Could not save category budget.', 'error');
    console.error(err);
  }
};

window.deleteCategoryBudget = async function(cat) {
  if (!confirm(`Remove the budget limit for ${cat}?`)) return;
  if (!isFirebaseConfigured() || currentUser.isDemo) {
    const catBudgets = JSON.parse(localStorage.getItem('pocketplanner_category_budgets') || '{}');
    delete catBudgets[cat];
    localStorage.setItem('pocketplanner_category_budgets', JSON.stringify(catBudgets));
    notify('Category Limit Removed', `The spending limit for ${cat} has been removed.`, 'category');
    renderCategoryBudgets();
    return;
  }
  try {
    const ref = categoryBudgetsDoc(currentUser.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const existing = snap.data();
      delete existing[cat];
      await setDoc(ref, existing);
      notify('Category Limit Removed', `The spending limit for ${cat} has been removed.`, 'category');
      renderCategoryBudgets();
    }
  } catch(e) {
    notify('Remove Failed', 'Could not remove category limit.', 'error');
  }
};

async function renderCategoryBudgets() {
  let catBudgets = {};
  if (currentUser) {
    if (!isFirebaseConfigured() || currentUser.isDemo) {
      catBudgets = JSON.parse(localStorage.getItem('pocketplanner_category_budgets') || '{}');
    } else {
      try {
        const snap = await getDoc(categoryBudgetsDoc(currentUser.uid));
        catBudgets = snap.exists() ? snap.data() : {};
      } catch {}
    }
  }

  const listEl = document.getElementById('budget-list');
  const emptyEl = document.getElementById('budget-empty');
  const currentMonthStr = new Date().toISOString().slice(0, 7);

  const html = Object.keys(catBudgets).map(cat => {
    const limit = catBudgets[cat];
    let spent = 0;
    allTransactions.forEach(t => {
      if (t.type === 'expense' && t.category === cat && t.date.startsWith(currentMonthStr)) {
        spent += Number(t.amount);
      }
    });

    const pct = Math.min((spent / limit) * 100, 100).toFixed(0);
    const over = spent > limit;

    return `
      <div class="budget-item">
        <div class="budget-item-header">
          <div>
            <strong>${cat}</strong>
            <span style="color:var(--text-muted); font-size:13px; margin-left:10px;">₹${spent.toLocaleString()} / ₹${limit.toLocaleString()}</span>
          </div>
          <button class="btn-del" onclick="deleteCategoryBudget('${cat}')">🗑️ Remove</button>
        </div>
        <div class="progress-track" style="height: 10px;">
          <div class="progress-fill" style="width: ${pct}%; background: ${over ? '#f43f5e' : '#8b5cf6'}"></div>
        </div>
        ${over ? `<span style="font-size: 0.8rem; color: #f43f5e; margin-top:6px; display:inline-block;">Exceeded limit by ₹${(spent - limit).toLocaleString()}</span>` : ''}
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

// =================== FINANCIAL HEALTH SCORE ===================
function animateCounter(el, target, duration = 1000) {
  if (!el) return;
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

  const totalIncome = txns.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  let savingsScore = 0;
  if (totalIncome > 0) {
    const rate = ((totalIncome - totalExpense) / totalIncome) * 100;
    if (rate >= 30) savingsScore = 100;
    else if (rate >= 20) savingsScore = 80;
    else if (rate >= 10) savingsScore = 60;
    else if (rate >= 0) savingsScore = 40;
    else savingsScore = 10;
  }

  const monthly = {};
  txns.forEach(t => {
    const key = (t.date || '').slice(0, 7);
    if (!key) return;
    if (!monthly[key]) monthly[key] = { income: 0, expense: 0 };
    if (t.type === 'income') monthly[key].income += Number(t.amount);
    else monthly[key].expense += Number(t.amount);
  });
  const months = Object.values(monthly);
  let consistencyScore = 50;
  if (months.length >= 2) {
    const ratios = months.map(m => m.income > 0 ? m.expense / m.income : 1);
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const variance = ratios.reduce((s, r) => s + Math.pow(r - avg, 2), 0) / ratios.length;
    consistencyScore = Math.max(0, 100 - variance * 200);
  }

  const debtExpense = txns
    .filter(t => t.type === 'expense' && (t.category === 'EMI' || t.category === 'Bills'))
    .reduce((s, t) => s + Number(t.amount), 0);
  let debtScore = 100;
  if (totalExpense > 0) {
    const debtRatio = debtExpense / totalExpense;
    if (debtRatio >= 0.5) debtScore = 10;
    else if (debtRatio >= 0.35) debtScore = 40;
    else if (debtRatio >= 0.2) debtScore = 70;
    else debtScore = 100;
  }

  const incomeCategories = new Set(txns.filter(t => t.type === 'income').map(t => t.category));
  let diversityScore = Math.min(incomeCategories.size * 33, 100);

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
    { label: 'Fixed Bills & Debt', score: debtScore, weight: 20 },
    { label: 'Income Streams', score: diversityScore, weight: 15 }
  ];

  const tips = [];
  if (savingsScore < 60) tips.push('Try to save at least 20% of your total income each month.');
  if (consistencyScore < 60) tips.push('Your monthly spending fluctuates significantly. Keep fixed monthly caps.');
  if (debtScore < 60) tips.push('EMI and bill commitments take up a big portion of your expenses.');
  if (diversityScore < 66) tips.push('Explore additional income sources to build a resilient financial buffer.');
  if (tips.length === 0) tips.push('Excellent financial discipline! Keep building your wealth buffer. 🎉');

  return { score, grade, breakdown, tips };
}

function loadHealthScore() {
  const data = computeHealthScore();

  const scoreEl = document.getElementById('health-score-val');
  animateCounter(scoreEl, data.score, 1200);

  const gradeBadge = document.getElementById('health-grade');
  if (gradeBadge) gradeBadge.textContent = data.grade;

  const gaugeFill = document.getElementById('gauge-fill');
  if (gaugeFill) {
    const fullArc = 376.99;
    const targetOffset = fullArc - (data.score / 100) * fullArc;
    setTimeout(() => {
      gaugeFill.style.strokeDashoffset = targetOffset;
    }, 100);
  }

  const breakdownEl = document.getElementById('health-breakdown');
  if (breakdownEl && data.breakdown && data.breakdown.length) {
    breakdownEl.innerHTML = data.breakdown.map(b => {
      const cls = b.score >= 70 ? 'ok' : b.score >= 40 ? 'mid' : 'low';
      return `
        <div class="breakdown-item">
          <div class="breakdown-header">
            <span>${b.label}</span>
            <span>${b.score}/100</span>
          </div>
          <div class="breakdown-track">
            <div class="breakdown-fill ${cls}" style="width:${b.score}%"></div>
          </div>
        </div>`;
    }).join('');
  }

  const tipsList = document.getElementById('health-tips');
  if (tipsList) {
    tipsList.innerHTML = (data.tips || []).map(tip => `<li>${tip}</li>`).join('');
  }
}

// =================== SPENDING PREDICTION ===================
function computeSpendingPrediction() {
  const alpha = 0.4;
  const monthlyByCategory = {};
  const monthlyIncome = {};

  allTransactions.forEach(t => {
    const m = (t.date || '').slice(0, 7);
    if (!m) return;
    if (t.type === 'expense') {
      if (!monthlyByCategory[t.category]) monthlyByCategory[t.category] = {};
      monthlyByCategory[t.category][m] = (monthlyByCategory[t.category][m] || 0) + Number(t.amount);
    } else {
      monthlyIncome[m] = (monthlyIncome[m] || 0) + Number(t.amount);
    }
  });

  const allMonths = [...new Set(allTransactions.map(t => (t.date || '').slice(0, 7)))].filter(Boolean).sort();
  const monthsOfData = allMonths.length;

  if (monthsOfData === 0) {
    return { totalExpensePrediction: 0, totalIncomePrediction: 0, predictedSavings: 0, confidence: 'none', monthsOfData: 0, predictions: [] };
  }

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

  return { totalExpensePrediction, totalIncomePrediction, predictedSavings, confidence, monthsOfData, predictions };
}

function loadSpendingPrediction() {
  const data = computeSpendingPrediction();

  const expEl = document.getElementById('pred-total-exp');
  if (expEl) expEl.textContent = `₹${data.totalExpensePrediction.toLocaleString()}`;

  const incEl = document.getElementById('pred-total-inc');
  if (incEl) incEl.textContent = `₹${data.totalIncomePrediction.toLocaleString()}`;

  const savings = data.predictedSavings;
  const savingsEl = document.getElementById('pred-savings');
  if (savingsEl) {
    savingsEl.textContent = `${savings >= 0 ? '+' : ''}₹${savings.toLocaleString()}`;
    savingsEl.style.color = savings >= 0 ? 'var(--income)' : 'var(--expense)';
  }

  const confBadge = document.getElementById('pred-confidence');
  if (confBadge) {
    const confLabel = { high: '🟢 High Confidence', medium: '🟡 Medium Confidence', low: '🔴 Low Confidence', none: 'No Data' };
    confBadge.textContent = confLabel[data.confidence] || '—';
  }

  const tbody = document.getElementById('pred-tbody');
  const empty = document.getElementById('pred-empty');

  if (tbody) {
    if (!data.predictions || data.predictions.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'flex';
    } else {
      if (empty) empty.style.display = 'none';
      const trendMap = {
        up: '<span class="trend-badge trend-up">↑ Rising</span>',
        down: '<span class="trend-badge trend-down">↓ Falling</span>',
        stable: '<span class="trend-badge trend-stable">→ Stable</span>'
      };
      tbody.innerHTML = data.predictions.map(p => `
        <tr>
          <td><strong>${p.category}</strong></td>
          <td class="amount-expense">₹${p.predicted.toLocaleString()}</td>
          <td style="color:var(--muted)">₹${p.avgLast3.toLocaleString()}</td>
          <td>${trendMap[p.trend] || trendMap.stable}</td>
        </tr>`).join('');
    }
  }
}

// =================== REPORTS ===================
function renderReports() {
  const expReport = document.getElementById('expense-report');
  const incReport = document.getElementById('income-report');
  if (!expReport || !incReport) return;

  const catExpenses = {};
  const catIncome = {};
  let totalExp = 0;
  let totalInc = 0;

  allTransactions.forEach(t => {
    const amt = Number(t.amount);
    if (t.type === 'expense') {
      catExpenses[t.category] = (catExpenses[t.category] || 0) + amt;
      totalExp += amt;
    } else {
      catIncome[t.category] = (catIncome[t.category] || 0) + amt;
      totalInc += amt;
    }
  });

  expReport.innerHTML = Object.keys(catExpenses).length === 0
    ? '<p style="color:var(--muted)">No expense data</p>'
    : Object.keys(catExpenses).map(cat => {
        const amt = catExpenses[cat];
        const pct = totalExp > 0 ? ((amt / totalExp) * 100).toFixed(1) : 0;
        return `
          <div style="margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-weight:600; font-size:13px;">
              <span>${cat}</span>
              <span>₹${amt.toLocaleString()} (${pct}%)</span>
            </div>
            <div class="progress-track" style="height:8px;">
              <div class="progress-fill" style="width:${pct}%; background:#f43f5e"></div>
            </div>
          </div>`;
      }).join('');

  incReport.innerHTML = Object.keys(catIncome).length === 0
    ? '<p style="color:var(--muted)">No income data</p>'
    : Object.keys(catIncome).map(cat => {
        const amt = catIncome[cat];
        const pct = totalInc > 0 ? ((amt / totalInc) * 100).toFixed(1) : 0;
        return `
          <div style="margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-weight:600; font-size:13px;">
              <span>${cat}</span>
              <span>₹${amt.toLocaleString()} (${pct}%)</span>
            </div>
            <div class="progress-track" style="height:8px;">
              <div class="progress-fill" style="width:${pct}%; background:#10b981"></div>
            </div>
          </div>`;
      }).join('');
}

// =================== DATE & INIT ===================
const dateEl = document.getElementById('today-date');
if (dateEl) {
  dateEl.textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}