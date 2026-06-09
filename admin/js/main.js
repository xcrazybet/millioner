// ============================================
// MAIN INITIALIZATION
// ============================================

let supabaseClient = null;
let db = null;
let auth = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Supabase
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabase = supabaseClient;
    
    // Initialize Firebase
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    window.db = db;
    window.auth = auth;
    
    // Auth state listener
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = '../login.html';
            return;
        }
        
        if (!ALLOWED_ADMINS.includes(user.email)) {
            alert('Access Denied!');
            await auth.signOut();
            window.location.href = '../login.html';
            return;
        }
        
        document.getElementById('admin-email').textContent = user.email;
        
        // Load all data
        await loadPending();
        await loadActive();
        await loadSettled();
        await loadUsers();
        
        // Auto refresh every 30 seconds
        setInterval(async () => {
            await loadPending();
            await updateStats();
        }, 30000);
    });
});

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(panel => panel.classList.remove('active'));
    
    const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');
    
    const panel = document.getElementById(`${tabName}-panel`);
    if (panel) panel.classList.add('active');
    
    // Refresh data when switching tabs
    if (tabName === 'pending') loadPending();
    if (tabName === 'active') loadActive();
    if (tabName === 'settled') loadSettled();
    if (tabName === 'users') loadUsers();
}

async function logout() {
    await auth.signOut();
    window.location.href = '../login.html';
}

// Make functions global for onclick handlers
window.switchTab = switchTab;
window.logout = logout;
window.loadPending = loadPending;
window.settleSingleBet = settleSingleBet;
window.settleAccumulatorBet = settleAccumulatorBet;
window.autoSettleAll = autoSettleAll;
window.filterPending = filterPending;
