// admin-middleware.js
class AdminMiddleware {
    constructor() {
        this.firebaseConfig = {
            apiKey: "AIzaSyA72Yo_YGqno9PX25p3yQBvyflcaM-NqEM",
            authDomain: "x-bet-prod-jd.firebaseapp.com",
            projectId: "x-bet-prod-jd",
            storageBucket: "x-bet-prod-jd.firebasestorage.app",
            messagingSenderId: "499334334535",
            appId: "1:499334334535:web:bebc1bf817e24d9e3c4962",
            measurementId: "G-PTV4XMYQ6P"
        };
        
        this.init();
    }
    
    async init() {
        if (!firebase.apps.length) {
            firebase.initializeApp(this.firebaseConfig);
        }
        this.auth = firebase.auth();
        this.db = firebase.firestore();
    }
    
    // Check if current user is admin
    async isAdmin() {
        const user = this.auth.currentUser;
        if (!user) return false;
        
        try {
            const adminDoc = await this.db.collection('admins').doc(user.uid).get();
            return adminDoc.exists;
        } catch (error) {
            console.error("Admin check error:", error);
            return false;
        }
    }
    
    // Check specific admin permission
    async hasPermission(permission) {
        const user = this.auth.currentUser;
        if (!user) return false;
        
        try {
            const adminDoc = await this.db.collection('admins').doc(user.uid).get();
            if (!adminDoc.exists) return false;
            
            const adminData = adminDoc.data();
            
            // Super admin has all permissions
            if (adminData.role === 'super') return true;
            
            // Check specific permissions array
            if (adminData.permissions && adminData.permissions.includes('all')) return true;
            if (adminData.permissions && adminData.permissions.includes(permission)) return true;
            
            return false;
        } catch (error) {
            console.error("Permission check error:", error);
            return false;
        }
    }
    
    // Protect admin pages
    async protectAdminPage() {
        const isAdmin = await this.isAdmin();
        
        if (!isAdmin) {
            // Redirect non-admins
            window.location.href = 'index.html';
            return false;
        }
        
        return true;
    }
    
    // Get all admins (for super admin only)
    async getAllAdmins() {
        if (!await this.hasPermission('manage_admins')) {
            throw new Error('Insufficient permissions');
        }
        
        try {
            const snapshot = await this.db.collection('admins').get();
            const admins = [];
            snapshot.forEach(doc => {
                admins.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            return admins;
        } catch (error) {
            console.error("Error getting admins:", error);
            throw error;
        }
    }
    
    // Add new admin
    async addAdmin(email, role = 'admin', permissions = []) {
        if (!await this.hasPermission('manage_admins')) {
            throw new Error('Insufficient permissions');
        }
        
        try {
            // First check if user exists
            const usersSnapshot = await this.db.collection('wallets')
                .where('email', '==', email.toLowerCase())
                .limit(1)
                .get();
            
            if (usersSnapshot.empty) {
                throw new Error('User not found');
            }
            
            const userDoc = usersSnapshot.docs[0];
            const userId = userDoc.id;
            
            // Add to admins collection
            await this.db.collection('admins').doc(userId).set({
                email: email,
                role: role,
                permissions: permissions,
                addedBy: this.auth.currentUser.uid,
                addedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            return { success: true, userId: userId };
            
        } catch (error) {
            console.error("Error adding admin:", error);
            throw error;
        }
    }
    
    // Remove admin
    async removeAdmin(userId) {
        if (!await this.hasPermission('manage_admins')) {
            throw new Error('Insufficient permissions');
        }
        
        try {
            await this.db.collection('admins').doc(userId).delete();
            return { success: true };
        } catch (error) {
            console.error("Error removing admin:", error);
            throw error;
        }
    }
    
    // Get admin dashboard stats
    async getDashboardStats() {
        if (!await this.isAdmin()) {
            throw new Error('Admin access required');
        }
        
        try {
            const [
                usersCount,
                transactionsCount,
                totalBalance,
                recentTransactions
            ] = await Promise.all([
                this.getUsersCount(),
                this.getTransactionsCount(),
                this.getTotalBalance(),
                this.getRecentTransactions(10)
            ]);
            
            return {
                usersCount,
                transactionsCount,
                totalBalance,
                recentTransactions
            };
        } catch (error) {
            console.error("Error getting dashboard stats:", error);
            throw error;
        }
    }
    
    async getUsersCount() {
        const snapshot = await this.db.collection('wallets').get();
        return snapshot.size;
    }
    
    async getTransactionsCount() {
        const snapshot = await this.db.collection('transactions').get();
        return snapshot.size;
    }
    
    async getTotalBalance() {
        const snapshot = await this.db.collection('wallets').get();
        let total = 0;
        snapshot.forEach(doc => {
            total += doc.data().balance || 0;
        });
        return total;
    }
    
    async getRecentTransactions(limit = 10) {
        const snapshot = await this.db.collection('transactions')
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();
        
        const transactions = [];
        snapshot.forEach(doc => {
            transactions.push({
                id: doc.id,
                ...doc.data()
            });
        });
        return transactions;
    }
}

// Create global instance
window.AdminMiddleware = new AdminMiddleware();
