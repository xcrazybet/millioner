// ============================================
// PENDING SETTLEMENTS MODULE
// ============================================

let pendingBets = [];
let matchCache = {};

async function loadPending() {
    showNotification('Loading pending settlements...');
    const container = document.getElementById('pending-list');
    if (container) container.innerHTML = '<div class="loading-spinner"></div> Loading pending settlements...';
    
    try {
        // Get finished matches
        const { data: finishedMatches, error: mErr } = await supabase
            .from('sports_matches')
            .select('*')
            .eq('status', 'finished');
        
        if (mErr) throw mErr;
        
        // Cache finished matches
        const finishedIds = new Set();
        for (const m of finishedMatches || []) {
            matchCache[m.fixture_id] = m;
            finishedIds.add(m.fixture_id);
        }
        
        // Get active bets
        const { data: activeBets, error: bErr } = await supabase
            .from('bets')
            .select('*')
            .eq('status', 'active');
        
        if (bErr) throw bErr;
        
        // Find pending bets (finished matches with unsettled active bets)
        pendingBets = [];
        for (const bet of activeBets || []) {
            const isAcc = bet.bet_type === 'accumulator' || bet.bet_category === 'accumulator';
            if (!isAcc) {
                if (finishedIds.has(bet.fixture_id)) {
                    pendingBets.push(bet);
                }
            } else {
                const selections = parseSelections(bet);
                const hasFinished = selections.some(s => finishedIds.has(s.fixture_id || s.fixtureId));
                if (hasFinished && selections.length > 0) {
                    pendingBets.push(bet);
                }
            }
        }
        
        // Load match data for accumulator legs
        for (const bet of pendingBets) {
            const selections = parseSelections(bet);
            for (const s of selections) {
                const fid = s.fixture_id || s.fixtureId;
                if (fid && !matchCache[fid]) {
                    const { data: m } = await supabase
                        .from('sports_matches')
                        .select('*')
                        .eq('fixture_id', fid)
                        .single();
                    if (m) matchCache[fid] = m;
                }
            }
        }
        
        renderPending();
        updateStats();
        
    } catch(e) {
        console.error('Load pending error:', e);
        if (container) container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error loading data: ' + esc(e.message) + '</p></div>';
        showNotification('Error: ' + e.message, true);
    }
}

function renderPending() {
    const search = document.getElementById('search-pending')?.value?.toLowerCase() || '';
    let filtered = pendingBets;
    if (search) {
        filtered = filtered.filter(b => 
            (b.user_email || '').toLowerCase().includes(search) ||
            (b.id || '').toLowerCase().includes(search)
        );
    }
    
    const container = document.getElementById('pending-list');
    if (!container) return;
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>✅ No pending settlements - all caught up!</p></div>';
        document.getElementById('stat-pending').textContent = '0';
        document.getElementById('pending-badge').textContent = '0';
        return;
    }
    
    let singlesHtml = '';
    let accumulatorsHtml = '';
    
    for (const bet of filtered) {
        const isAcc = bet.bet_type === 'accumulator' || bet.bet_category === 'accumulator';
        if (!isAcc) {
            singlesHtml += renderSingleBet(bet);
        } else {
            accumulatorsHtml += renderAccumulatorBet(bet);
        }
    }
    
    let finalHtml = '';
    if (singlesHtml) {
        finalHtml += `<div style="margin: 0 0 15px 0; padding: 10px 15px; background: #1a2332; border-radius: 10px;">
            <i class="fas fa-ticket-alt"></i> <strong>Single Bets</strong> (${filtered.filter(b => !(b.bet_type === 'accumulator' || b.bet_category === 'accumulator')).length} pending)
        </div>`;
        finalHtml += singlesHtml;
    }
    if (accumulatorsHtml) {
        finalHtml += `<div style="margin: 20px 0 15px 0; padding: 10px 15px; background: #1a2332; border-radius: 10px;">
            <i class="fas fa-layer-group"></i> <strong>Accumulator Bets</strong> (${filtered.filter(b => b.bet_type === 'accumulator' || b.bet_category === 'accumulator').length} pending)
        </div>`;
        finalHtml += accumulatorsHtml;
    }
    
    container.innerHTML = finalHtml;
    document.getElementById('stat-pending').textContent = filtered.length;
    document.getElementById('pending-badge').textContent = filtered.length;
}

function renderSingleBet(bet) {
    const match = matchCache[bet.fixture_id];
    const homeName = match?.home_team?.name || match?.home_team || 'Home';
    const awayName = match?.away_team?.name || match?.away_team || 'Away';
    const homeScore = match?.score?.home ?? '?';
    const awayScore = match?.score?.away ?? '?';
    const hasScore = typeof homeScore === 'number' && typeof awayScore === 'number';
    const isWin = hasScore ? detectWinner(bet.bet_type, homeScore, awayScore) : null;
    
    return `
    <div class="settle-card single">
        <div class="settle-header">
            <div>
                <strong style="font-size:14px;">${getTicketNumber(bet.id)}</strong
