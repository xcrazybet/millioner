// ============================================
// PENDING SETTLEMENTS MODULE
// ============================================

let pendingBets = [];
let matchCache = {};

async function loadPending() {
    showNotification('Loading pending settlements...');
    const container = document.getElementById('pending-list');
    if (container) container.innerHTML = '<div class="loading-spinner"></div> Loading...';
    
    try {
        // Get finished matches
        const { data: finishedMatches, error: mErr } = await supabase
            .from('sports_matches')
            .select('*')
            .eq('status', 'finished');
        
        if (mErr) throw mErr;
        
        // Cache matches
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
        
        // Find pending bets
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
        
        // Load accumulator leg match data
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
        if (container) container.innerHTML = '<div class="empty-state">Error loading data</div>';
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
        container.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i> No pending settlements</div>';
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
        finalHtml += `<div style="margin: 15px 0 10px 0; padding: 8px 12px; background: #1a2332; border-radius: 8px;">
            <i class="fas fa-ticket-alt"></i> Single Bets (${filtered.filter(b => !(b.bet_type === 'accumulator' || b.bet_category === 'accumulator')).length})
        </div>`;
        finalHtml += singlesHtml;
    }
    if (accumulatorsHtml) {
        finalHtml += `<div style="margin: 15px 0 10px 0; padding: 8px 12px; background: #1a2332; border-radius: 8px;">
            <i class="fas fa-layer-group"></i> Accumulator Bets (${filtered.filter(b => b.bet_type === 'accumulator' || b.bet_category === 'accumulator').length})
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
                <strong>${getTicketNumber(bet.id)}</strong>
                <span class="badge badge-single">SINGLE</span>
            </div>
            <div>👤 ${esc(bet.user_email || bet.user_id?.slice(-10))}</div>
            <div>💰 ${$c(bet.amount)} @ ${bet.odds}</div>
        </div>
        <div class="settle-body">
            <div class="match-score">
                <div class="teams">${esc(homeName)} vs ${esc(awayName)}</div>
                <div class="score">${homeScore} - ${awayScore}</div>
                <div class="meta">Fixture #${bet.fixture_id}</div>
            </div>
            <div class="legs-list">
                <div class="leg-row">
                    <span class="leg-match">${esc(homeName)} vs ${esc(awayName)}</span>
                    <span class="leg-score">${homeScore}–${awayScore}</span>
                    <span class="leg-pick">${formatBetType(bet.bet_type)} @ ${bet.odds}</span>
                    <span class="leg-result">
                        ${isWin !== null ? 
                            `<span class="badge ${isWin ? 'badge-won' : 'badge-lost'}">${isWin ? 'WINS' : 'LOSS'}</span>` : 
                            '<span class="badge badge-pending">Waiting</span>'}
                    </span>
                </div>
            </div>
            <div class="fin-row">
                <div class="fin-item"><div class="label">Stake</div><div class="value">${$c(bet.amount)}</div></div>
                <div class="fin-item"><div class="label">Potential Win</div><div class="value" style="color:#4caf50;">${$c(bet.potential_win)}</div></div>
            </div>
            <div class="action-buttons">
                <button class="btn-win" onclick="window.settleSingleBet('${bet.id}', 'won')">🏆 WIN - Pay ${$c(bet.potential_win)}</button>
                <button class="btn-lose" onclick="window.settleSingleBet('${bet.id}', 'lost')">❌ LOSE - No Payout</button>
            </div>
        </div>
    </div>`;
}

function renderAccumulatorBet(bet) {
    const selections = parseSelections(bet);
    let legsHtml = '';
    let allWon = true;
    let hasAllScores = true;
    
    for (let i = 0; i < selections.length; i++) {
        const s = selections[i];
        const fid = s.fixture_id || s.fixtureId;
        const match = matchCache[fid];
        const homeName = match?.home_team?.name || match?.home_team || 'Home';
        const awayName = match?.away_team?.name || match?.away_team || 'Away';
        const homeScore = match?.score?.home ?? '?';
        const awayScore = match?.score?.away ?? '?';
        const hasScore = typeof homeScore === 'number' && typeof awayScore === 'number';
        const sBetType = s.bet_type || s.betType;
        let legWin = null;
        
        if (hasScore) {
            legWin = detectWinner(sBetType, homeScore, awayScore);
            if (!legWin) allWon = false;
        } else {
            hasAllScores = false;
        }
        
        legsHtml += `
        <div class="leg-row">
            <span class="leg-match">#${i+1} ${esc(homeName)} vs ${esc(awayName)}</span>
            <span class="leg-score">${homeScore}–${awayScore}</span>
            <span class="leg-pick">${formatBetType(sBetType)} @ ${s.odds}</span>
            <span class="leg-result">
                ${legWin !== null ? 
                    `<span class="badge ${legWin ? 'badge-won' : 'badge-lost'}">${legWin ? 'WON' : 'LOST'}</span>` : 
                    '<span class="badge badge-pending">No score</span>'}
            </span>
        </div>`;
    }
    
    let verdictHtml = '';
    if (hasAllScores && selections.length > 0) {
        if (allWon) {
            verdictHtml = `<div class="auto-banner-won"><i class="fas fa-trophy"></i> ✅ ALL LEGS WON - Settle as WIN (Pay ${$c(bet.potential_win)})</div>`;
        } else {
            verdictHtml = `<div class="auto-banner-lost"><i class="fas fa-times-circle"></i> ❌ AT LEAST ONE LEG LOST - Settle as LOSS (No payout)</div>`;
        }
    } else {
        verdictHtml = `<div class="auto-banner-warning"><i class="fas fa-clock"></i> ⏳ Waiting for match scores to finalize</div>`;
    }
    
    return `
    <div class="settle-card accumulator">
        <div class="settle-header">
            <div>
                <strong>${getTicketNumber(bet.id)}</strong>
                <span class="badge badge-accumulator">ACCUMULATOR</span>
            </div>
            <div>👤 ${esc(bet.user_email || bet.user_id?.slice(-10))}</div>
            <div>💰 ${$c(bet.amount)} | ${selections.length} legs</div>
        </div>
        <div class="settle-body">
            ${verdictHtml}
            <div class="legs-list">
                ${legsHtml}
            </div>
            <div class="fin-row">
                <div class="fin-item"><div class="label">Total Stake</div><div class="value">${$c(bet.amount)}</div></div>
                <div class="fin-item"><div class="label">Total Odds</div><div class="value">${bet.total_odds || bet.odds || '-'}</div></div>
                <div class="fin-item"><div class="label">Potential Win</div><div class="value" style="color:#4caf50;">${$c(bet.potential_win)}</div></div>
            </div>
            <div class="action-buttons">
                <button class="btn-win" onclick="window.settleAccumulatorBet('${bet.id}', 'won')">🏆 ALL WIN - Pay ${$c(bet.potential_win)}</button>
                <button class="btn-lose" onclick="window.settleAccumulatorBet('${bet.id}', 'lost')">❌ ALL LOSE - No Payout</button>
            </div>
        </div>
    </div>`;
}

async function settleSingleBet(betId, result) {
    if (!confirm(`Settle bet as ${result.toUpperCase()}? ${result === 'won' ? 'User will receive payout.' : 'No payout.'}`)) return;
    
    try {
        const { data: bet, error } = await supabase.from('bets').select('*').eq('id', betId).single();
        if (error) throw error;
        
        const payout = result === 'won' ? parseFloat(bet.potential_win || bet.amount * bet.odds) : 0;
        
        await supabase.from('bets').update({
            status: result,
            payout: payout,
            settled_at: new Date().toISOString(),
            settled_by: auth.currentUser?.email,
            settlement_reason: `Admin settled as ${result.toUpperCase()}`
        }).eq('id', betId);
        
        if (result === 'won' && payout > 0) {
            try {
                await db.collection('wallets').doc(bet.user_id).update({
                    balance: firebase.firestore.FieldValue.increment(payout)
                });
            } catch(e) { console.log('Wallet error:', e); }
        }
        
        if (bet.fixture_id) {
            await supabase.from('sports_matches').update({ bets_settled: true }).eq('fixture_id', bet.fixture_id);
        }
        
        showNotification(`✅ Bet settled as ${result.toUpperCase()}! ${result === 'won' ? `Paid ${$c(payout)}` : ''}`);
        await loadPending();
        await loadActive();
        await loadSettled();
        updateStats();
    } catch(e) {
        showNotification('Error: ' + e.message, true);
    }
}

async function settleAccumulatorBet(betId, result) {
    if (!confirm(`Settle accumulator as ${result.toUpperCase()}? ${result === 'won' ? `User will receive ${$c(pendingBets.find(b => b.id === betId)?.potential_win || 0)}` : 'No payout.'}`)) return;
    
    try {
        const { data: bet, error } = await supabase.from('bets').select('*').eq('id', betId).single();
        if (error) throw error;
        
        const payout = result === 'won' ? parseFloat(bet.potential_win || bet.amount * (bet.total_odds || bet.odds)) : 0;
        
        await supabase.from('bets').update({
            status: result,
            payout: payout,
            settled_at: new Date().toISOString(),
            settled_by: auth.currentUser?.email,
            settlement_reason: `Admin settled accumulator as ${result.toUpperCase()}`
        }).eq('id', betId);
        
        if (result === 'won' && payout > 0) {
            try {
                await db.collection('wallets').doc(bet.user_id).update({
                    balance: firebase.firestore.FieldValue.increment(payout)
                });
            } catch(e) { console.log('Wallet error:', e); }
        }
        
        const selections = parseSelections(bet);
        for (const s of selections) {
            const fid = s.fixture_id || s.fixtureId;
            if (fid) {
                await supabase.from('sports_matches').update({ bets_settled: true }).eq('fixture_id', fid);
            }
        }
        
        showNotification(`✅ Accumulator settled as ${result.toUpperCase()}! ${result === 'won' ? `Paid ${$c(payout)}` : ''}`);
        await loadPending();
        await loadActive();
        await loadSettled();
        updateStats();
    } catch(e) {
        showNotification('Error: ' + e.message, true);
    }
}

async function autoSettleAll() {
    if (pendingBets.length === 0) {
        showNotification('No pending bets to settle');
        return;
    }
    if (!confirm(`Auto-settle ${pendingBets.length} bets based on match scores?`)) return;
    
    let settled = 0;
    for (const bet of pendingBets) {
        const isAcc = bet.bet_type === 'accumulator' || bet.bet_category === 'accumulator';
        let result = null;
        
        if (!isAcc) {
            const match = matchCache[bet.fixture_id];
            if (match?.score && typeof match.score.home === 'number') {
                const isWin = detectWinner(bet.bet_type, match.score.home, match.score.away);
                result = isWin ? 'won' : 'lost';
            }
        } else {
            const selections = parseSelections(bet);
            let allWon = true;
            let hasData = true;
            for (const s of selections) {
                const fid = s.fixture_id || s.fixtureId;
                const match = matchCache[fid];
                if (!match?.score || typeof match.score.home !== 'number') {
                    hasData = false;
                    break;
                }
                const isWin = detectWinner(s.bet_type || s.betType, match.score.home, match.score.away);
                if (!isWin) allWon = false;
            }
            if (hasData) result = allWon ? 'won' : 'lost';
        }
        
        if (result) {
            const payout = result === 'won' ? parseFloat(bet.potential_win || bet.amount * (bet.total_odds || bet.odds)) : 0;
            await supabase.from('bets').update({
                status: result,
                payout: payout,
                settled_at: new Date().toISOString(),
                settled_by: auth.currentUser?.email,
                settlement_reason: 'Auto-settled'
            }).eq('id', bet.id);
            if (result === 'won' && payout > 0) {
                try { await db.collection('wallets').doc(bet.user_id).update({ balance: firebase.firestore.FieldValue.increment(payout) }); } catch(e) {}
            }
            settled++;
        }
    }
    
    showNotification(`Auto-settled ${settled} bets`);
    await loadPending();
    await loadActive();
    await loadSettled();
    updateStats();
}

function filterPending() {
    renderPending();
}
