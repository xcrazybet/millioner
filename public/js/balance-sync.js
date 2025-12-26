// balance-sync.js v2.0
class BalanceSync {
    constructor() {
        this.balanceListeners = new Set();
        this.transactionListeners = new Set();
        this.lowBalanceListeners = new Set();
        this.currentBalance = 0;
        this.userId = null;
        this.unsubscribeBalance = null;
        this.unsubscribeTransactions = null;
        this.lastBalanceUpdate = null;
        this.balanceUpdateDebounce = null;
        this.isInitialized = false;
        this.LOW_BALANCE_THRESHOLD = 10.00; // $10 threshold
        this.BALANCE_UPDATE_DEBOUNCE_MS = 500;
        this.MAX_TRANSACTION_HISTORY = 100;
        
        // Configuration
        this.config = {
            enableOfflineCache: true,
            syncAcrossTabs: true,
            enableBalanceAlerts: true,
            enableAutoRetry: true,
            maxRetryAttempts: 3
        };
        
        // Initialize with error handling
        this.initialize();
    }
    
    async initialize() {
        try {
            // Check Firebase availability
            if (!firebaseApp || !firebaseApp.auth) {
                throw new Error('Firebase not properly initialized');
            }
            
            this.setupAuthListener();
            
            if (this.config.syncAcrossTabs) {
                this.setupCrossTabSync();
            }
            
            // Setup offline cache if enabled
            if (this.config.enableOfflineCache) {
                await this.setupOfflineCache();
            }
            
            this.isInitialized = true;
            console.log('BalanceSync initialized successfully');
            
        } catch (error) {
            console.error('BalanceSync initialization failed:', error);
            this.handleInitializationError(error);
        }
    }
    
    setupAuthListener() {
        firebaseApp.auth.onAuthStateChanged(async (user) => {
            if (user) {
                this.userId = user.uid;
                
                // Notify listeners of auth change
                this.notifyAuthStateChange(true);
                
                // Setup listeners with retry logic
                await this.setupListenersWithRetry();
                
                // Load cached data if available
                if (this.config.enableOfflineCache) {
                    await this.loadCachedData();
                }
            } else {
                await this.cleanup();
                this.userId = null;
                this.currentBalance = 0;
                this.notifyAuthStateChange(false);
            }
        }, (error) => {
            console.error('Auth state change error:', error);
            this.handleAuthError(error);
        });
    }
    
    async setupListenersWithRetry(retryCount = 0) {
        try {
            await Promise.all([
                this.setupBalanceListener(),
                this.setupTransactionsListener()
            ]);
            
            // Reset retry count on success
            retryCount = 0;
            
        } catch (error) {
            if (retryCount < this.config.maxRetryAttempts && this.config.enableAutoRetry) {
                console.log(`Retrying listener setup (attempt ${retryCount + 1}/${this.config.maxRetryAttempts})`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                await this.setupListenersWithRetry(retryCount + 1);
            } else {
                console.error('Failed to setup listeners after retries:', error);
                this.notifyError('connection_error', 'Failed to connect to balance service');
            }
        }
    }
    
    setupCrossTabSync() {
        window.addEventListener('storage', (e) => {
            if (e.key === 'balance_sync_update' && this.userId) {
                try {
                    const data = JSON.parse(e.newValue);
                    if (data.userId === this.userId && data.timestamp > (this.lastBalanceUpdate || 0)) {
                        this.currentBalance = data.balance;
                        this.lastBalanceUpdate = data.timestamp;
                        this.notifyBalanceListeners();
                        
                        // Check for low balance
                        this.checkLowBalance();
                    }
                } catch (error) {
                    console.error('Cross-tab sync error:', error);
                }
            }
            
            // Handle transaction updates
            if (e.key === 'transaction_sync_update' && this.userId) {
                try {
                    const data = JSON.parse(e.newValue);
                    if (data.userId === this.userId) {
                        this.notifyTransactionListeners(data.transactions || []);
                    }
                } catch (error) {
                    console.error('Transaction sync error:', error);
                }
            }
        });
        
        // Also listen for broadcast channel messages for more reliable cross-tab communication
        if (typeof BroadcastChannel !== 'undefined') {
            this.broadcastChannel = new BroadcastChannel('balance_sync_channel');
            this.broadcastChannel.onmessage = (event) => {
                if (event.data.type === 'balance_update' && event.data.userId === this.userId) {
                    this.currentBalance = event.data.balance;
                    this.notifyBalanceListeners();
                }
            };
        }
    }
    
    async setupOfflineCache() {
        // Initialize IndexedDB for offline cache
        if ('indexedDB' in window) {
            this.db = await this.initIndexedDB();
        }
    }
    
    initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('BalanceSyncDB', 1);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create balance store
                if (!db.objectStoreNames.contains('balance')) {
                    const balanceStore = db.createObjectStore('balance', { keyPath: 'userId' });
                    balanceStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                // Create transactions store
                if (!db.objectStoreNames.contains('transactions')) {
                    const transactionStore = db.createObjectStore('transactions', { keyPath: 'id' });
                    transactionStore.createIndex('userId', 'userId', { unique: false });
                    transactionStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
            
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }
    
    async cacheBalanceData(userId, balance, timestamp) {
        if (!this.db) return;
        
        const transaction = this.db.transaction(['balance'], 'readwrite');
        const store = transaction.objectStore('balance');
        
        await store.put({
            userId,
            balance,
            timestamp,
            cachedAt: Date.now()
        });
    }
    
    async loadCachedData() {
        if (!this.db) return;
        
        try {
            // Load cached balance
            const transaction = this.db.transaction(['balance'], 'readonly');
            const store = transaction.objectStore('balance');
            const request = store.get(this.userId);
            
            request.onsuccess = (event) => {
                const data = event.target.result;
                if (data) {
                    this.currentBalance = data.balance;
                    this.notifyBalanceListeners();
                }
            };
        } catch (error) {
            console.error('Failed to load cached data:', error);
        }
    }
    
    setupBalanceListener() {
        return new Promise((resolve, reject) => {
            if (!this.userId) {
                reject(new Error('User ID not available'));
                return;
            }
            
            // Clean up existing listener
            if (this.unsubscribeBalance) {
                this.unsubscribeBalance();
            }
            
            const walletRef = firebaseApp.db.collection('wallets').doc(this.userId);
            
            this.unsubscribeBalance = walletRef.onSnapshot(
                async (doc) => {
                    try {
                        if (!doc.exists) {
                            await this.createUserWallet();
                            this.currentBalance = 0;
                        } else {
                            const data = doc.data();
                            const previousBalance = this.currentBalance;
                            this.currentBalance = data.balance || 0;
                            
                            // Check for significant balance changes
                            if (Math.abs(previousBalance - this.currentBalance) > 0.01) {
                                this.notifyBalanceChange(previousBalance, this.currentBalance);
                            }
                            
                            // Cache balance
                            if (this.config.enableOfflineCache) {
                                await this.cacheBalanceData(this.userId, this.currentBalance, Date.now());
                            }
                        }
                        
                        // Debounce balance updates
                        clearTimeout(this.balanceUpdateDebounce);
                        this.balanceUpdateDebounce = setTimeout(() => {
                            this.notifyBalanceListeners();
                            this.checkLowBalance();
                            
                            // Broadcast to other tabs
                            this.broadcastBalanceUpdate();
                        }, this.BALANCE_UPDATE_DEBOUNCE_MS);
                        
                        resolve();
                        
                    } catch (error) {
                        console.error('Balance listener processing error:', error);
                        reject(error);
                    }
                },
                (error) => {
                    console.error('Balance snapshot error:', error);
                    
                    // Try to use cached data
                    if (this.config.enableOfflineCache) {
                        this.loadCachedData();
                    }
                    
                    reject(error);
                }
            );
        });
    }
    
    async createUserWallet() {
        try {
            const user = firebaseApp.auth.currentUser;
            const walletData = {
                userId: this.userId,
                email: user.email,
                username: user.displayName || user.email.split('@')[0],
                balance: 0,
                walletId: `WALLET-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                currency: 'USD',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                totalDeposits: 0,
                totalWithdrawn: 0,
                totalWon: 0,
                totalLost: 0,
                status: 'active',
                kycStatus: 'pending',
                settings: {
                    lowBalanceAlert: true,
                    transactionNotifications: true
                }
            };
            
            await firebaseApp.db.collection('wallets').doc(this.userId).set(walletData);
            
            return walletData;
        } catch (error) {
            console.error('Error creating wallet:', error);
            throw error;
        }
    }
    
    setupTransactionsListener() {
        return new Promise((resolve, reject) => {
            if (!this.userId) {
                reject(new Error('User ID not available'));
                return;
            }
            
            if (this.unsubscribeTransactions) {
                this.unsubscribeTransactions();
            }
            
            this.unsubscribeTransactions = firebaseApp.db.collection('transactions')
                .where('userId', '==', this.userId)
                .orderBy('timestamp', 'desc')
                .limit(this.MAX_TRANSACTION_HISTORY)
                .onSnapshot(
                    (snapshot) => {
                        const transactions = [];
                        snapshot.forEach(doc => {
                            transactions.push({
                                id: doc.id,
                                ...doc.data()
                            });
                        });
                        
                        this.notifyTransactionListeners(transactions);
                        
                        // Cache transactions
                        if (this.config.enableOfflineCache && this.db) {
                            this.cacheTransactions(transactions);
                        }
                        
                        resolve();
                    },
                    (error) => {
                        console.error("Transactions listener error:", error);
                        
                        // Load cached transactions
                        if (this.config.enableOfflineCache) {
                            this.loadCachedTransactions();
                        }
                        
                        reject(error);
                    }
                );
        });
    }
    
    async cacheTransactions(transactions) {
        if (!this.db) return;
        
        const transaction = this.db.transaction(['transactions'], 'readwrite');
        const store = transaction.objectStore('transactions');
        
        // Clear old transactions for this user
        const index = store.index('userId');
        const request = index.openCursor(IDBKeyRange.only(this.userId));
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        
        // Add new transactions
        transactions.forEach(tx => {
            store.put({
                ...tx,
                cachedAt: Date.now()
            });
        });
    }
    
    async loadCachedTransactions() {
        if (!this.db) return;
        
        try {
            const transaction = this.db.transaction(['transactions'], 'readonly');
            const store = transaction.objectStore('transactions');
            const index = store.index('userId');
            const request = index.getAll(IDBKeyRange.only(this.userId));
            
            request.onsuccess = (event) => {
                const transactions = event.target.result.sort((a, b) => 
                    new Date(b.timestamp) - new Date(a.timestamp)
                );
                this.notifyTransactionListeners(transactions);
            };
        } catch (error) {
            console.error('Failed to load cached transactions:', error);
        }
    }
    
    // Event subscription methods
    onBalanceUpdate(callback, options = { immediate: true }) {
        const wrappedCallback = (balance) => {
            try {
                callback(balance);
            } catch (error) {
                console.error('Balance callback error:', error);
            }
        };
        
        this.balanceListeners.add(wrappedCallback);
        
        if (options.immediate && this.currentBalance !== null) {
            wrappedCallback(this.currentBalance);
        }
        
        return () => {
            this.balanceListeners.delete(wrappedCallback);
        };
    }
    
    onTransactionsUpdate(callback) {
        const wrappedCallback = (transactions) => {
            try {
                callback(transactions);
            } catch (error) {
                console.error('Transactions callback error:', error);
            }
        };
        
        this.transactionListeners.add(wrappedCallback);
        
        return () => {
            this.transactionListeners.delete(wrappedCallback);
        };
    }
    
    onLowBalance(callback, threshold = this.LOW_BALANCE_THRESHOLD) {
        const wrappedCallback = (balance) => {
            try {
                callback(balance);
            } catch (error) {
                console.error('Low balance callback error:', error);
            }
        };
        
        this.lowBalanceListeners.add({ callback: wrappedCallback, threshold });
        
        // Immediate check
        if (this.currentBalance < threshold) {
            wrappedCallback(this.currentBalance);
        }
        
        return () => {
            for (const listener of this.lowBalanceListeners) {
                if (listener.callback === wrappedCallback) {
                    this.lowBalanceListeners.delete(listener);
                    break;
                }
            }
        };
    }
    
    onAuthStateChange(callback) {
        // Store auth listeners separately
        if (!this.authListeners) {
            this.authListeners = new Set();
        }
        
        this.authListeners.add(callback);
        
        return () => {
            this.authListeners.delete(callback);
        };
    }
    
    // Notification methods
    notifyBalanceListeners() {
        for (const callback of this.balanceListeners) {
            try {
                callback(this.currentBalance);
            } catch (error) {
                console.error('Balance listener error:', error);
            }
        }
    }
    
    notifyTransactionListeners(transactions) {
        for (const callback of this.transactionListeners) {
            try {
                callback(transactions);
            } catch (error) {
                console.error('Transaction listener error:', error);
            }
        }
    }
    
    notifyLowBalanceListeners(balance) {
        for (const listener of this.lowBalanceListeners) {
            if (balance < listener.threshold) {
                try {
                    listener.callback(balance);
                } catch (error) {
                    console.error('Low balance listener error:', error);
                }
            }
        }
    }
    
    notifyAuthStateChange(isAuthenticated) {
        if (!this.authListeners) return;
        
        for (const callback of this.authListeners) {
            try {
                callback(isAuthenticated, this.userId);
            } catch (error) {
                console.error('Auth state listener error:', error);
            }
        }
    }
    
    notifyBalanceChange(previousBalance, newBalance) {
        // You can add custom logic for balance change notifications
        const change = newBalance - previousBalance;
        const changeType = change > 0 ? 'credit' : 'debit';
        
        // Example: Send to analytics
        if (typeof gtag !== 'undefined') {
            gtag('event', 'balance_change', {
                'user_id': this.userId,
                'previous_balance': previousBalance,
                'new_balance': newBalance,
                'change_amount': Math.abs(change),
                'change_type': changeType
            });
        }
    }
    
    notifyError(errorType, message) {
        // Dispatch custom event for error handling
        const event = new CustomEvent('balance_sync_error', {
            detail: { type: errorType, message, userId: this.userId }
        });
        window.dispatchEvent(event);
    }
    
    // Utility methods
    checkLowBalance() {
        if (this.currentBalance < this.LOW_BALANCE_THRESHOLD) {
            this.notifyLowBalanceListeners(this.currentBalance);
        }
    }
    
    broadcastBalanceUpdate() {
        const updateData = {
            userId: this.userId,
            balance: this.currentBalance,
            timestamp: Date.now()
        };
        
        // LocalStorage for cross-tab
        localStorage.setItem('balance_sync_update', JSON.stringify(updateData));
        
        // BroadcastChannel for more reliable communication
        if (this.broadcastChannel) {
            this.broadcastChannel.postMessage({
                type: 'balance_update',
                ...updateData
            });
        }
    }
    
    formatBalance(balance, options = {}) {
        const config = {
            style: 'currency',
            currency: options.currency || 'USD',
            minimumFractionDigits: options.minimumFractionDigits ?? 2,
            maximumFractionDigits: options.maximumFractionDigits ?? 2,
            ...options
        };
        
        return new Intl.NumberFormat('en-US', config).format(balance || 0);
    }
    
    formatBalanceShort(balance) {
        if (balance >= 1000000) {
            return `$${(balance / 1000000).toFixed(1)}M`;
        } else if (balance >= 1000) {
            return `$${(balance / 1000).toFixed(1)}K`;
        } else {
            return this.formatBalance(balance);
        }
    }
    
    getCurrentBalance() {
        return this.currentBalance;
    }
    
    getBalanceInfo() {
        return {
            balance: this.currentBalance,
            formatted: this.formatBalance(this.currentBalance),
            formattedShort: this.formatBalanceShort(this.currentBalance),
            isLow: this.currentBalance < this.LOW_BALANCE_THRESHOLD,
            threshold: this.LOW_BALANCE_THRESHOLD,
            userId: this.userId,
            lastUpdated: this.lastBalanceUpdate
        };
    }
    
    async updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        // Reinitialize if needed
        if (newConfig.enableOfflineCache && !this.db) {
            await this.setupOfflineCache();
        }
    }
    
    async refresh() {
        if (!this.userId) return false;
        
        try {
            // Force refresh balance
            const walletDoc = await firebaseApp.db.collection('wallets').doc(this.userId).get();
            if (walletDoc.exists) {
                const data = walletDoc.data();
                this.currentBalance = data.balance || 0;
                this.notifyBalanceListeners();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Refresh failed:', error);
            return false;
        }
    }
    
    async cleanup() {
        // Clear debounce timer
        clearTimeout(this.balanceUpdateDebounce);
        
        // Unsubscribe from Firebase listeners
        if (this.unsubscribeBalance) {
            this.unsubscribeBalance();
            this.unsubscribeBalance = null;
        }
        
        if (this.unsubscribeTransactions) {
            this.unsubscribeTransactions();
            this.unsubscribeTransactions = null;
        }
        
        // Close broadcast channel
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
            this.broadcastChannel = null;
        }
        
        // Clear listeners
        this.balanceListeners.clear();
        this.transactionListeners.clear();
        this.lowBalanceListeners.clear();
        
        if (this.authListeners) {
            this.authListeners.clear();
        }
        
        this.currentBalance = 0;
        this.lastBalanceUpdate = null;
        this.isInitialized = false;
    }
    
    // Error handling methods
    handleInitializationError(error) {
        // Implement fallback strategies
        console.error('Initialization error:', error);
        this.notifyError('initialization_failed', 'Failed to initialize balance sync');
    }
    
    handleAuthError(error) {
        console.error('Auth error:', error);
        this.notifyError('auth_error', 'Authentication error occurred');
    }
    
    // Admin functions with enhanced security
    async adminTransferToUser(targetUserId, amount, reason = 'admin_transfer', notes = '', metadata = {}) {
        try {
            // Validation
            if (!this.userId) {
                throw new Error('Admin not authenticated');
            }
            
            if (!targetUserId || !amount || amount <= 0) {
                throw new Error('Invalid parameters');
            }
            
            // Get admin data with additional validation
            const adminDoc = await firebaseApp.db.collection('admins').doc(this.userId).get();
            if (!adminDoc.exists) {
                throw new Error('Admin not found or unauthorized');
            }
            
            const adminData = adminDoc.data();
            
            // Check admin permissions
            if (!adminData.permissions?.includes('balance_adjustment')) {
                throw new Error('Insufficient permissions');
            }
            
            // Use transaction for atomic operation
            const result = await firebaseApp.db.runTransaction(async (transaction) => {
                // Get target user wallet
                const targetWalletRef = firebaseApp.db.collection('wallets').doc(targetUserId);
                const targetWalletDoc = await transaction.get(targetWalletRef);
                
                let currentBalance = 0;
                let userData = {};
                
                if (targetWalletDoc.exists) {
                    const data = targetWalletDoc.data();
                    currentBalance = data.balance || 0;
                    userData = data;
                    
                    // Check if wallet is active
                    if (data.status !== 'active') {
                        throw new Error(`Target wallet is ${data.status}`);
                    }
                } else {
                    // Get user info for new wallet
                    const user = await firebaseApp.auth.getUser(targetUserId).catch(() => null);
                    
                    if (!user) {
                        throw new Error('Target user not found');
                    }
                    
                    userData = {
                        email: user.email || 'unknown@user.com',
                        username: user.displayName || user.email?.split('@')[0] || 'Unknown',
                        status: 'active'
                    };
                    
                    // Create wallet
                    transaction.set(targetWalletRef, {
                        userId: targetUserId,
                        email: userData.email,
                        username: userData.username,
                        balance: amount,
                        walletId: `WALLET-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        currency: 'USD',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        totalDeposits: 0,
                        totalWithdrawn: 0,
                        totalWon: 0,
                        totalLost: 0,
                        status: 'active',
                        kycStatus: 'pending',
                        settings: {
                            lowBalanceAlert: true,
                            transactionNotifications: true
                        }
                    });
                    
                    currentBalance = 0;
                }
                
                const newBalance = currentBalance + amount;
                
                // Update balance
                transaction.update(targetWalletRef, {
                    balance: newBalance,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    totalDeposits: firebase.firestore.FieldValue.increment(amount)
                });
                
                // Create transaction record
                const transactionId = `TX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const transactionRef = firebaseApp.db.collection('transactions').doc(transactionId);
                
                transaction.set(transactionRef, {
                    id: transactionId,
                    userId: targetUserId,
                    type: 'admin_adjustment',
                    subType: 'credit',
                    amount: amount,
                    description: reason,
                    notes: notes,
                    status: 'completed',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    userEmail: userData.email,
                    username: userData.username,
                    adminId: this.userId,
                    adminEmail: adminData.email,
                    previousBalance: currentBalance,
                    newBalance: newBalance,
                    metadata: {
                        action: 'credit',
                        reason: reason,
                        notes: notes,
                        ...metadata
                    },
                    ipAddress: metadata.ipAddress || 'admin_console',
                    userAgent: metadata.userAgent || 'admin_system'
                });
                
                // Create admin log
                const adminLogId = `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const adminLogRef = firebaseApp.db.collection('admin_logs').doc(adminLogId);
                
                transaction.set(adminLogRef, {
                    id: adminLogId,
                    adminId: this.userId,
                    adminEmail: adminData.email,
                    action: 'balance_adjustment',
                    targetUserId: targetUserId,
                    amount: amount,
                    reason: reason,
                    notes: notes,
                    previousBalance: currentBalance,
                    newBalance: newBalance,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    metadata: {
                        ...metadata,
                        transactionId: transactionId
                    }
                });
                
                // Update admin stats
                const adminStatsRef = firebaseApp.db.collection('admin_stats').doc(this.userId);
                transaction.set(adminStatsRef, {
                    totalAdjustments: firebase.firestore.FieldValue.increment(1),
                    totalAmountAdjusted: firebase.firestore.FieldValue.increment(amount),
                    lastAdjustment: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                
                return {
                    success: true,
                    transactionId,
                    previousBalance: currentBalance,
                    newBalance
                };
            });
            
            return {
                success: true,
                message: `Successfully transferred ${this.formatBalance(amount)} to user`,
                transactionId: result.transactionId,
                previousBalance: result.previousBalance,
                newBalance: result.newBalance
            };
            
        } catch (error) {
            console.error('Admin transfer error:', error);
            
            // Log the error
            await this.logAdminError('admin_transfer', error.message, {
                targetUserId,
                amount,
                reason,
                adminId: this.userId
            });
            
            return {
                success: false,
                message: error.message || 'Transfer failed',
                errorCode: this.getErrorCode(error)
            };
        }
    }
    
    async logAdminError(action, errorMessage, context = {}) {
        try {
            await firebaseApp.db.collection('admin_error_logs').add({
                action,
                errorMessage,
                context,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                adminId: this.userId
            });
        } catch (logError) {
            console.error('Failed to log admin error:', logError);
        }
    }
    
    getErrorCode(error) {
        if (error.message.includes('permission') || error.message.includes('unauthorized')) {
            return 'PERMISSION_DENIED';
        } else if (error.message.includes('not found')) {
            return 'USER_NOT_FOUND';
        } else if (error.message.includes('transaction')) {
            return 'TRANSACTION_FAILED';
        } else {
            return 'UNKNOWN_ERROR';
        }
    }
    
    // Utility for external use
    static getInstance() {
        if (!window.balanceSync) {
            window.balanceSync = new BalanceSync();
        }
        return window.balanceSync;
    }
}

// Initialize singleton instance
if (!window.balanceSync) {
    window.balanceSync = BalanceSync.getInstance();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BalanceSync;
}
