// ============================================
// ACTIVE BETS & HISTORY MODULE
// ============================================

async function loadActive() {
    try {
        const { data, error } = await supabase
            .from('bets')
            .select('*')
            .eq('status', 'active')
            .order('placed_at', { ascending: false })
            .limit(100);
        
        if (error) throw error;
        
        const tbody = document.getElementById('active-list');
        if (!tbody) return;
        
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state">No active bets</div></td></tr>';
            return;
        }
        
        tbody.innerHTML = data.map(b => `
            <tr>
                <td>${getTicketNumber(b.id)}</td>
                <td>${esc(b.user_email || b.user_id?.slice(-10))}</td>
                <td>${esc(b.match_name || 'N/A')}</td>
                <td>${formatBetType(b.bet_type)}</td>
                <td>${b.odds}</td>
                <td>${$c(b.amount)}</td>
                <td>${$c(b.potential_win)}</td>
            </tr>
        `).join('');
        
        document.getElementById('stat-active').textContent = data.length;
    } catch(e) {
        console.error('Load active error:', e);
    }
}

async function loadSettled() {
    try {
        const { data, error } = await supabase
            .from('bets')
            .select('*')
            .in('status', ['won', 'lost'])
            .order('settled_at', { ascending: false })
            .limit(100);
        
        if (error) throw error;
        
        const tbody = document.getElementById('settled-list');
        if (!tbody) return;
        
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">No settled bets</div></td></tr>';
            return;
        }
        
        tbody.innerHTML = data.map(b => `
            <tr>
                <td>${getTicketNumber(b.id)}</td>
                <td>${esc(b.user_email || b.user_id?.slice(-10))}</td>
                <td>${esc(b.match_name || 'N/A')}</td>
                <td><span class="badge ${b.status === 'won' ? 'badge-won' : 'badge-lost'}">${b.status.toUpperCase()}</span></td>
                <td class="${b.status === 'won' ? 'badge-won' : 'badge-lost'}">${$c(b.payout)}</td>
                <td>${formatDate(b.settled_at)}</td>
            </tr>
        `).join('');
        
        document.getElementById('stat-settled').textContent = data.length;
    } catch(e) {
        console.error('Load settled error:', e);
    }
}

async function updateStats() {
    try {
        const { count: pending } = await supabase
            .from('bets')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');
        
        document.getElementById('stat-pending').textContent = pending || 0;
    } catch(e) {
        console.error('Stats error:', e);
    }
}
