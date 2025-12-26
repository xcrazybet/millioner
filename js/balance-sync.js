// balance-sync.js
class BalanceSync {
    constructor() {
        this.balanceListeners = [];
        this.currentBalance = 0;
        this.userId = null;
        this.unsubscribe = null;
        this.isInitialized = false;
        
        // Setup cross-tab communication if supported
        this.setupBroadcastChannel();
        
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
    
    setupBroadcastChannel() {
        // Use BroadcastChannel for cross-tab synchronization
        if (typeof BroadcastChannel !== 'undefined') {
            try {
                this.broadcastChannel = new BroadcastChannel('balance_updates');
                this.broadcastChannel.onmessage = (event) => {
                    // Only process messages for our user and valid balance updates
                    if (event.data.type === 'balance_update' && 
                        event.data.userId === this.userId &&
                        typeof event.data.balance === 'number') {
                        
                        // Update balance and notify listeners
                        this.currentBalance = event.data.balance;
                        this.notifyListeners();
                    }
                };
            } catch (error) {
                console.warn('BroadcastChannel not supported:', error);
                this.broadcastChannel = null;
            }
        }
    }
    
    setupBalanceListener() {
        if (!this.userId) return;
        
        // Clean up existing listener
        this.cleanupListener();
        
        try {
            // Setup real-time listener for wallet
            this.unsubscribe = firebaseApp.db.collection('wallets')
                .doc(this.userId)
                .onSnapshot((doc) => {
                    if (doc.exists) {
                        const data = doc.data();
                        const newBalance = data.balance || 0;
                        
                        // Only update if balance actually changed
                        if (newBalance !== this.currentBalance) {
                            this.currentBalance = newBalance;
                            
                            // Notify other tabs through broadcast channel
                            this.broadcastBalanceUpdate();
                            
                            // Notify all local listeners
                            this.notifyListeners();
                        }
                    }
                }, (error) => {
                    console.error("Balance sync error:", error);
                    // Optional: Add retry logic here
                });
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error("Failed to setup balance listener:", error);
            this.isInitialized = false;
        }
    }
    
    broadcastBalanceUpdate() {
        if (this.broadcastChannel && this.userId) {
            try {
                this.broadcastChannel.postMessage({
                    type: 'balance_update',
                    userId: this.userId,
                    balance: this.currentBalance,
                    timestamp: Date.now(),
                    source: 'firebase' // Helps identify source of update
                });
            } catch (error) {
                console.warn('Failed to broadcast balance update:', error);
            }
        }
    }
    
    // Register callback to be notified when balance changes
    onBalanceUpdate(callback) {
        if (typeof callback !== 'function') {
            console.error('Callback must be a function');
            return () => {};
        }
        
        this.balanceListeners.push(callback);
        
        // Immediately call with current balance if available
        if (this.currentBalance !== null && this.isInitialized) {
            setTimeout(() => callback(this.currentBalance), 0);
        }
        
        // Return cleanup function
        return () => {
            const index = this.balanceListeners.indexOf(callback);
            if (index > -1) {
                this.balanceListeners.splice(index, 1);
            }
        };
    }
    
    notifyListeners() {
        // Use a copy of the array to avoid issues if listeners remove themselves
        const listeners = [...this.balanceListeners];
        listeners.forEach(callback => {
            try {
                callback(this.currentBalance);
            } catch (error) {
                console.error('Error in balance listener:', error);
            }
        });
    }
    
    getCurrentBalance() {
        return this.currentBalance;
    }
    
    cleanupListener() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }
    
    cleanup() {
        // Clean up Firebase listener
        this.cleanupListener();
        
        // Clean up broadcast channel
        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.close();
            } catch (error) {
                // Ignore errors on close
            }
            this.broadcastChannel = null;
        }
        
        // Reset state
        this.balanceListeners = [];
        this.userId = null;
        this.currentBalance = 0;
        this.isInitialized = false;
    }
    
    // Optional: Force refresh balance
    async refreshBalance() {
        if (!this.userId) return null;
        
        try {
            const doc = await firebaseApp.db.collection('wallets')
                .doc(this.userId)
                .get();
                
            if (doc.exists) {
                const data = doc.data();
                const newBalance = data.balance || 0;
                
                if (newBalance !== this.currentBalance) {
                    this.currentBalance = newBalance;
                    this.broadcastBalanceUpdate();
                    this.notifyListeners();
                }
                
                return this.currentBalance;
            }
        } catch (error) {
            console.error('Failed to refresh balance:', error);
            throw error;
        }
        
        return null;
    }
}

// Create global instance
window.balanceSync = new BalanceSync();
