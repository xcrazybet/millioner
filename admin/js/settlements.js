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
                <strong style="font-size:14px;">${getTicketNumber(bet.id)}</strong>
                <span class="badge badge-single" style="margin-left:8px;">SINGLE</span>
            </div>
            <div><i class="fas fa-user"></i> ${esc(bet.user_email || bet.user_id?.slice(-10))}</div>
            <div><i class="fas fa-dollar-sign"></i> ${$c(bet.amount)} @ ${bet.odds}</div>
        </div>
        <div class="settle-body">
            <div class="match-score">
                <div class="teams">${esc(homeName)} <span style="color:#888;">vs</span> ${esc(awayName)}</div>
                <div class="score">${homeScore} - ${awayScore}</div>
                <div class="meta"><i class="fas fa-hashtag"></i> Fixture #${bet.fixture_id} | ${match?.league_name || ''}</div>
            </div>
            <div class="legs-list">
                <div class="leg-row">
                    <span class="leg-match">${esc(homeName)} vs ${esc(awayName)}</span>
                    <span class="leg-score">${homeScore}–${awayScore}</span>
                    <span class="leg-pick">${formatBetType(bet.bet_type)} @ ${bet.odds}</span>
                    <span class="leg-result">
                        ${isWin !== null ? 
                            `<span class="badge ${isWin ? 'badge-won' : 'badge-lost'}"><i class="fas ${isWin ? 'fa-trophy' : 'fa-times'}"></i> ${isWin ? 'WINS' : 'LOSS'}</span>` : 
                            '<span class="badge badge-pending"><i class="fas fa-clock"></i> Waiting</span>'}
                    </span>
                </div>
            </div>
            <div class="fin-row">
                <div class="fin-item"><div class="label"><i class="fas fa-coins"></i> Stake</div><div class="value">${$c(bet.amount)}</div></div>
                <div class="fin-item"><div class="label"><i class="fas fa-chart-line"></i> Potential Win</div><div class="value" style="color:#4caf50;">${$c(bet.potential_win)}</div></div>
            </div>
            <div class="action-buttons">
                <button class="btn-win" onclick="window.settleSingleBet('${bet.id}', 'won')"><i class="fas fa-trophy"></i> WIN - Pay ${$c(bet.potential_win)}</button>
                <button class="btn-lose" onclick="window.settleSingleBet('${bet.id}', 'lost')"><i class="fas fa-times-circle"></i> LOSE - No Payout</button>
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
            <span class="leg-match"><strong>#${i+1}</strong> ${esc(homeName)} vs ${esc(awayName)}</span>
            <span class="leg-score">${homeScore}–${awayScore}</span>
            <span class="leg-pick">${formatBetType(sBetType)} @ ${s.odds}</span>
            <span class="leg-result">
                ${legWin !== null ? 
                    `<span class="badge ${legWin ? 'badge-won' : 'badge-lost'}"><i class="fas ${legWin ? 'fa-check' : 'fa-times'}"></i> ${legWin ? 'WON' : 'LOST'}</span>` : 
                    '<span class="badge badge-pending"><i class="fas fa-clock"></i> No score</span>'}
            </span>
        </div>`;
    }
    
    let verdictHtml = '';
    if (hasAllScores && selections.length > 0) {
        if (allWon) {
            verdictHtml = `<div class="auto-banner-won"><i class="fas fa-trophy"></i> <strong>✅ ALL LEGS WON!</strong> Settle as WIN - Pay ${$c(bet.potential_win)}</div>`;
        } else {
            verdictHtml = `<div class="auto-banner-lost"><i class="fas fa-times-circle"></i> <strong>❌ AT LEAST ONE LEG LOST!</strong> Settle as LOSS - No payout</div>`;
        }
    } else {
        verdictHtml = `<div class="auto-banner-warning"><i class="fas fa-clock"></i> <strong>⏳ Waiting for match scores</strong> - Please check manually when all matches finish</div>`;
    }
    
    return `
    <div class="settle-card accumulator">
        <div class="settle-header">
            <div>
                <strong style="font-size:14px;">${getTicketNumber(bet.id)}</strong>
                <span class="badge badge-accumulator" style="margin-left:8px;">ACCUMULATOR</span>
            </div>
            <div><i class="fas fa-user"></i> ${esc(bet.user_email || bet.user_id?.slice(-10))}</div>
            <div><i class="fas fa-dollar-sign"></i> ${$c(bet.amount)} | ${selections.length} legs</div>
        </div>
        <div class="settle-body">
            ${verdictHtml}
            <div class="legs-list">
                ${legsHtml}
            </div>
            <div class="fin-row">
                <div class="fin-item"><div class="label"><i class="fas fa-coins"></i> Total Stake</div><div class="value">${$c(bet.amount)}</div></div>
                <div class="fin-item"><div class="label"><i class="fas fa-calculator"></i> Total Odds</div><div class="value">${bet.total_odds || bet.odds || '-'}</div></div>
                <div class="fin-item"><div class="label"><i class="fas fa-chart-line"></i> Potential Win</div><div class="value" style="color:#4caf50;">${$c(bet.potential_win)}</div></div>
            </div>
            <div class="action-buttons">
                <button class="btn-win" onclick="window.settleAccumulatorBet('${bet.id}', 'won')"><i class="fas fa-trophy"></i> ALL WIN - Pay ${$c(bet.potential_win)}</button>
                <button class="btn-lose" onclick="window.settleAccumulatorBet('${bet.id}', 'lost')"><i class="fas fa-times-circle"></i> ALL LOSE - No Payout</button>
            </div>
        </div>
    </div>`;
}

async function settleSingleBet(betId, result) {
    if (!confirm(`💰 Settle bet as ${result.toUpperCase()}?\n\n${result === 'won' ? 'User will receive payout.' : 'No payout will be given.'}`)) return;
    
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
                showNotification(`✅ Bet settled as WIN! Paid ${$c(payout)} to ${bet.user_email || bet.user_id}`, false);
            } catch(e) { console.log('Wallet error:', e); }
        } else {
            showNotification(`✅ Bet settled as LOSS. No payout.`, false);
        }
        
        if (bet.fixture_id) {
            await supabase.from('sports_matches').update({ bets_settled: true }).eq('fixture_id', bet.fixture_id);
        }
        
        await loadPending();
        await loadActive();
        await loadSettled();
        updateStats();
    } catch(e) {
        showNotification('Error: ' + e.message, true);
    }
}

async function settleAccumulatorBet(betId, result) {
    if (!confirm(`💰 Settle ACCUMULATOR as ${result.toUpperCase()}?\n\n${result === 'won' ? 'User will receive full payout.' : 'No payout will be given.'}`)) return;
    
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
                showNotification(`✅ Accumulator settled as WIN! Paid ${$c(payout)} to ${bet.user_email || bet.user_id}`, false);
            } catch(e) { console.log('Wallet error:', e); }
        } else {
            showNotification(`✅ Accumulator settled as LOSS. No payout.`, false);
        }
        
        const selections = parseSelections(bet);
        for (const s of selections) {
            const fid = s.fixture_id || s.fixtureId;
            if (fid) {
                await supabase.from('sports_matches').update({ bets_settled: true }).eq('fixture_id', fid);
            }
        }
        
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
    
    if (!confirm(`🤖 AUTO-SETTLE ${pendingBets.length} bets?\n\nSystem will check match scores and settle automatically.\n\n- Single bets: based on final score\n- Accumulators: all legs must have scores\n\nContinue?`)) return;
    
    let settled = 0;
    let skipped = 0;
    
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
                settlement_reason: 'Auto-settled by admin'
            }).eq('id', bet.id);
            if (result === 'won' && payout > 0) {
                try { await db.collection('wallets').doc(bet.user_id).update({ balance: firebase.firestore.FieldValue.increment(payout) }); } catch(e) {}
            }
            settled++;
        } else {
            skipped++;
        }
    }
    
    showNotification(`🤖 Auto-settled: ${settled} bets. Skipped: ${skipped} (missing data).`);
    await loadPending();
    await loadActive();
    await loadSettled();
    updateStats();
}

function filterPending() {
    renderPending();
}
