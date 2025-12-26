// balance-sync.js
class BalanceSync {
    constructor() {
        this.balanceListeners = [];
        this.transactionListeners = [];
        this.currentBalance = 0;
        this.userId = null;
        this.unsubscribeBalance = null;
        this.unsubscribeTransactions = null;
        
        // Listen for auth state changes
        this.setupAuthListener();
        
        // Setup cross-tab communication
        this.setupCrossTabSync();
    }
    
    setupAuthListener() {
        firebaseApp.auth.onAuthStateChanged((user) => {
            if (user) {
                this.userId = user.uid;
                this.setupBalanceListener();
                this.setupTransactionsListener();
            } else {
                this.cleanup();
                this.userId = null;
                this.currentBalance = 0;
            }
        });
    }
    
    setupCrossTabSync() {
        // Use localStorage events for cross-tab communication
        window.addEventListener('storage', (e) => {
            if (e.key === 'balance_update' && this.userId) {
                try {
                    const data = JSON.parse(e.newValue);
                    if (data.userId === this.userId) {
                        this.currentBalance = data.balance;
                        this.notifyBalanceListeners();
                    }
                } catch (error) {
                    console.error('Cross-tab sync error:', error);
                }
            }
        });
    }
    
    setupBalanceListener() {
        if (!this.userId) return;
        
        // Clean up existing listener
        if (this.unsubscribeBalance) {
            this.unsubscribeBalance();
        }
        
        // Setup real-time listener for wallet
        this.unsubscribeBalance = firebaseApp.db.collection('wallets')
            .doc(this.userId)
            .onSnapshot(async (doc) => {
                if (!doc.exists) {
                    // Create wallet if doesn't exist
                    try {
                        const user = firebaseApp.auth.currentUser;
                        await firebaseApp.db.collection('wallets').doc(this.userId).set({
                            userId: this.userId,
                            email: user.email,
                            username: user.email.split('@')[0],
                            balance: 0,
                            walletId: `WALLET-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            totalDeposits: 0,
                            totalWithdrawn: 0,
                            totalWon: 0,
                            totalLost: 0,
                            status: 'active',
                            kycStatus: 'pending'
                        });
                        
                        this.currentBalance = 0;
                        this.notifyBalanceListeners();
                    } catch (error) {
                        console.error('Error creating wallet:', error);
                    }
                } else {
                    const data = doc.data();
                    this.currentBalance = data.balance || 0;
                    
                    // Notify other tabs
                    localStorage.setItem('balance_update', JSON.stringify({
                        userId: this.userId,
                        balance: this.currentBalance,
                        timestamp: Date.now()
                    }));
                    
                    this.notifyBalanceListeners();
                }
            }, (error) => {
                console.error("Balance sync error:", error);
                this.notifyBalanceListeners();
            });
    }
    
    setupTransactionsListener() {
        if (!this.userId) return;
        
        if (this.unsubscribeTransactions) {
            this.unsubscribeTransactions();
        }
        
        this.unsubscribeTransactions = firebaseApp.db.collection('transactions')
            .where('userId', '==', this.userId)
            .orderBy('timestamp', 'desc')
            .limit(50)
            .onSnapshot((snapshot) => {
                const transactions = [];
                snapshot.forEach(doc => {
                    transactions.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                this.notifyTransactionListeners(transactions);
            }, (error) => {
                console.error("Transactions listener error:", error);
            });
    }
    
    // Balance listeners
    onBalanceUpdate(callback) {
        this.balanceListeners.push(callback);
        // Immediately call with current balance
        if (this.currentBalance !== null) {
            callback(this.currentBalance);
        }
        return () => {
            const index = this.balanceListeners.indexOf(callback);
            if (index > -1) {
                this.balanceListeners.splice(index, 1);
            }
        };
    }
    
    onTransactionsUpdate(callback) {
        this.transactionListeners.push(callback);
        return () => {
            const index = this.transactionListeners.indexOf(callback);
            if (index > -1) {
                this.transactionListeners.splice(index, 1);
            }
        };
    }
    
    notifyBalanceListeners() {
        this.balanceListeners.forEach(callback => {
            try {
                callback(this.currentBalance);
            } catch (error) {
                console.error('Balance listener error:', error);
            }
        });
    }
    
    notifyTransactionListeners(transactions) {
        this.transactionListeners.forEach(callback => {
            try {
                callback(transactions);
            } catch (error) {
                console.error('Transaction listener error:', error);
            }
        });
    }
    
    // Utility methods
    formatBalance(balance) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(balance || 0);
    }
    
    getCurrentBalance() {
        return this.currentBalance;
    }
    
    cleanup() {
        if (this.unsubscribeBalance) {
            this.unsubscribeBalance();
            this.unsubscribeBalance = null;
        }
        if (this.unsubscribeTransactions) {
            this.unsubscribeTransactions();
            this.unsubscribeTransactions = null;
        }
        this.balanceListeners = [];
        this.transactionListeners = [];
        this.currentBalance = 0;
    }
    
    // Admin function to transfer money
    async adminTransferToUser(targetUserId, amount, reason = 'admin_transfer', notes = '') {
        try {
            if (!this.userId) {
                throw new Error('Admin not authenticated');
            }
            
            // Get admin data
            const adminDoc = await firebaseApp.db.collection('admins').doc(this.userId).get();
            if (!adminDoc.exists) {
                throw new Error('Admin not found');
            }
            
            // Use transaction for atomic operation
            await firebaseApp.db.runTransaction(async (transaction) => {
                // Get target user wallet
                const targetWalletRef = firebaseApp.db.collection('wallets').doc(targetUserId);
                const targetWalletDoc = await transaction.get(targetWalletRef);
                
                let currentBalance = 0;
                let userData = {};
                
                if (targetWalletDoc.exists) {
                    const data = targetWalletDoc.data();
                    currentBalance = data.balance || 0;
                    userData = data;
                } else {
                    // Create wallet if doesn't exist
                    const user = await firebaseApp.auth.getUser(targetUserId).catch(() => null);
                    transaction.set(targetWalletRef, {
                        userId: targetUserId,
                        email: user?.email || 'unknown@user.com',
                        username: user?.email?.split('@')[0] || 'Unknown',
                        balance: amount,
                        walletId: `WALLET-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        totalDeposits: 0,
                        totalWithdrawn: 0,
                        totalWon: 0,
                        totalLost: 0,
                        status: 'active',
                        kycStatus: 'pending'
                    });
                    currentBalance = 0;
                }
                
                const newBalance = currentBalance + amount;
                
                // Update balance
                transaction.update(targetWalletRef, {
                    balance: newBalance,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Create transaction record for user
                const transactionRef = firebaseApp.db.collection('transactions').doc();
                transaction.set(transactionRef, {
                    userId: targetUserId,
                    type: 'admin_adjustment',
                    subType: 'credit',
                    amount: amount,
                    description: reason,
                    notes: notes,
                    status: 'completed',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    userEmail: userData.email || 'unknown@user.com',
                    username: userData.username || 'Unknown',
                    adminId: this.userId,
                    adminEmail: adminDoc.data().email,
                    previousBalance: currentBalance,
                    newBalance: newBalance,
                    metadata: {
                        action: 'credit',
                        reason: reason,
                        notes: notes
                    }
                });
                
                // Create admin log
                const adminLogRef = firebaseApp.db.collection('admin_logs').doc();
                transaction.set(adminLogRef, {
                    adminId: this.userId,
                    adminEmail: adminDoc.data().email,
                    action: 'balance_adjustment',
                    targetUserId: targetUserId,
                    amount: amount,
                    reason: reason,
                    notes: notes,
                    previousBalance: currentBalance,
                    newBalance: newBalance,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            
            return { success: true, message: `Successfully transferred $${amount} to user` };
            
        } catch (error) {
            console.error('Admin transfer error:', error);
            return { success: false, message: error.message || 'Transfer failed' };
        }
    }
}

// Create global instance
window.balanceSync = new BalanceSync();
