// ============================================
// UTILITY FUNCTIONS
// ============================================

function showNotification(msg, isError = false) {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    const n = document.createElement('div');
    n.className = `notification ${isError ? 'error' : ''}`;
    n.innerHTML = `<i class="fas ${isError ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i> ${msg}`;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 3500);
}

function esc(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
}

function $c(v) {
    return '$' + (parseFloat(v) || 0).toFixed(2);
}

function formatDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

function formatBetType(t) {
    const types = {
        'home': '🏆 Home Win',
        'away': '✈️ Away Win', 
        'draw': '🤝 Draw',
        'over25': '⚽ Over 2.5 Goals',
        'under25': '🥅 Under 2.5 Goals',
        'btts_yes': '✅ Both Teams Score',
        'btts_no': '❌ BTTS - No',
        '1X': '🏠 Home or Draw',
        '12': '⚡ Home or Away',
        'X2': '🚀 Draw or Away'
    };
    return types[t] || t;
}

function detectWinner(betType, homeScore, awayScore) {
    const hs = parseInt(homeScore) || 0;
    const as = parseInt(awayScore) || 0;
    const total = hs + as;
    
    switch(betType) {
        case 'home': return hs > as;
        case 'away': return as > hs;
        case 'draw': return hs === as;
        case 'over25': return total > 2.5;
        case 'under25': return total < 2.5;
        case 'btts_yes': return hs > 0 && as > 0;
        case 'btts_no': return hs === 0 || as === 0;
        case '1X': return hs >= as;
        case 'X2': return as >= hs;
        case '12': return hs !== as;
        default: return false;
    }
}

function parseSelections(bet) {
    if (!bet) return [];
    if (bet.selections && Array.isArray(bet.selections)) return bet.selections;
    if (bet.selections && typeof bet.selections === 'string') {
        try { return JSON.parse(bet.selections); } catch(e) { return []; }
    }
    return [];
}

function getTicketNumber(betId) {
    return '#' + String(betId).slice(-8).toUpperCase();
}
