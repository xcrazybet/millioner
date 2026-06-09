// ============================================
// USERS MODULE
// ============================================

async function loadUsers() {
    try {
        const { data, error } = await supabase
            .from('wallets')
            .select('*')
            .order('total_wagered', { ascending: false })
            .limit(100);
        
        if (error) throw error;
        
        const tbody = document.getElementById('users-list');
        if (!tbody) return;
        
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3"><div class="empty-state">No users found</div></td></tr>';
            return;
        }
        
        tbody.innerHTML = data.map(w => `
            <tr>
                <td>${esc(w.user_id)}</td>
                <td>${$c(w.balance)}</td>
                <td>${$c(w.total_wagered || 0)}</td>
            </tr>
        `).join('');
    } catch(e) {
        console.error('Load users error:', e);
    }
}
