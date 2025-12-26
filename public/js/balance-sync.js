// balance-sync.js
class BalanceSync {
    constructor() {
        this.balanceListeners = [];
        this.currentBalance = 0;
        this.userId = null;
        this.unsubscribe = null;
        
        // Listen for auth state to know when to setup balance listener
        firebaseApp.auth.onAuthStateChanged((user) => {
            if (user) {
                this.userId = user.uid;
                this.setupBalanceListener();
            } else {
                this.cleanup();
            }
        });
    }
    
    setupBalanceListener() {
        if (!this.userId) return;
        
        // Clean up existing listener
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        
        // Setup real-time listener for wallet
        this.unsubscribe = firebaseApp.db.collection('wallets')
            .doc(this.userId)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    this.currentBalance = data.balance || 0;
                    
                    // Notify all listeners
                    this.notifyListeners();
                }
            }, (error) => {
                console.error("Balance sync error:", error);
            });
    }
    
    // Register callback to be notified when balance changes
    onBalanceUpdate(callback) {
        this.balanceListeners.push(callback);
        // Immediately call with current balance
        if (this.currentBalance !== null) {
            callback(this.currentBalance);
        }
        return () => {
            // Return cleanup function
            const index = this.balanceListeners.indexOf(callback);
            if (index > -1) {
                this.balanceListeners.splice(index, 1);
            }
        };
    }
    
    notifyListeners() {
        this.balanceListeners.forEach(callback => {
            callback(this.currentBalance);
        });
    }
    
    getCurrentBalance() {
        return this.currentBalance;
    }
    
    cleanup() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        this.balanceListeners = [];
        this.userId = null;
        this.currentBalance = 0;
    }
}

// Create global instance
window.balanceSync = new BalanceSync();
