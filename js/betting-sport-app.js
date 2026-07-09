// ============================================
// betting-sport-app.js - SECURE HOME PAGE LOGIC
// ✅ No credentials exposed
// ✅ Uses window.supabaseClient from supabase-client.js
// ✅ Uses firebase from firebase-config.js
// ============================================

(function() {
    'use strict';
    
    // Wait for Supabase and Firebase to be ready
    let currentUser = null;
    let allMatches = [];
    let refreshInterval = null;
    let leagueMatchesToday = {};
    
    const BETTING_CLOSES_AT = 80;
    const API_BASE = 'https://muddy-wildflower-a70d.dilovantalan.workers.dev';
    
    // Helper: HTML escaping
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>]/g, function(m) {
            return m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;';
        });
    }
    
    // Language toggle
    window.toggleLanguage = function() {
        const isArabic = document.body.classList.toggle('arabic');
        localStorage.setItem('lang', isArabic ? 'ar' : 'en');
        document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
        document.querySelectorAll('.en').forEach(el => el.style.display = isArabic ? 'none' : '');
        document.querySelectorAll('.ar').forEach(el => el.style.display = isArabic ? '' : 'none');
    };
    
    if (localStorage.getItem('lang') === 'ar') {
        setTimeout(() => window.toggleLanguage(), 100);
    }
    
    // Load balance from Firebase
    async function loadBalance() {
        try {
            if (!currentUser || !window.firebaseDB) return 0;
            const doc = await window.firebaseDB.collection('wallets').doc(currentUser.uid).get();
            const balance = doc.exists ? (doc.data().balance || 0) : 1000;
            document.getElementById('balance-display').textContent = `$${balance.toFixed(2)}`;
            return balance;
        } catch(e) { 
            console.error('Balance error:', e); 
            return 0;
        }
    }
    
    // Fetch matches from API
    async function fetchMatches() {
        try {
            const today = new Date();
            const dates = [];
            
            for (let i = 0; i <= 7; i++) {
                const date = new Date(today);
                date.setDate(today.getDate() + i);
                dates.push(date.toISOString().split('T')[0]);
            }
            
            const fetchPromises = dates.map(date => 
                fetch(`${API_BASE}/api/fixtures/date/${date}`)
                    .then(r => r.json())
                    .catch(() => ({ success: false, data: [] }))
            );
            
            const results = await Promise.all(fetchPromises);
            const matches = [];
            const todayStr = today.toISOString().split('T')[0];
            
            for (const data of results) {
                if (data.success && data.data) {
                    for (const m of data.data) {
                        const statusShort = m.fixture.status?.short;
                        const isLive = statusShort === '1H' || statusShort === '2H' || statusShort === 'HT';
                        const isFinished = statusShort === 'FT' || statusShort === 'AET' || statusShort === 'PEN';
                        const matchTime = new Date(m.fixture.date);
                        const matchDateStr = matchTime.toISOString().split('T')[0];
                        
                        let status = 'upcoming';
                        if (isLive) status = 'live';
                        else if (isFinished) status = 'finished';
                        else if (matchTime < new Date()) status = 'finished';
                        
                        if (matchDateStr === todayStr && (status === 'live' || status === 'upcoming')) {
                            if (!leagueMatchesToday[m.league.id]) {
                                leagueMatchesToday[m.league.id] = {
                                    name: m.league.name,
                                    logo: m.league.logo,
                                    count: 0,
                                    hasLive: false
                                };
                            }
                            leagueMatchesToday[m.league.id].count++;
                            if (isLive) leagueMatchesToday[m.league.id].hasLive = true;
                        }
                        
                        matches.push({
                            fixture_id: m.fixture.id,
                            start_time: m.fixture.date,
                            status: status,
                            league_id: m.league.id,
                            league_name: m.league.name,
                            league_logo: m.league.logo,
                            home_team: {
                                id: m.teams.home.id,
                                name: m.teams.home.name,
                                logo: m.teams.home.logo
                            },
                            away_team: {
                                id: m.teams.away.id,
                                name: m.teams.away.name,
                                logo: m.teams.away.logo
                            },
                            score: { home: m.goals?.home || 0, away: m.goals?.away || 0 },
                            elapsed: m.fixture.status?.elapsed || 0,
                            odds: {
                                home: (1.80 + ((m.fixture.id % 20) / 100)).toFixed(2),
                                draw: (3.20 + ((m.fixture.id % 15) / 100)).toFixed(2),
                                away: (2.80 + ((m.fixture.id % 25) / 100)).toFixed(2)
                            }
                        });
                    }
                }
            }
            
            return matches;
        } catch(e) {
            console.error('Fetch error:', e);
            return [];
        }
    }
    
    function displayTopLiveMatches(matches) {
        const container = document.getElementById('live-container');
        
        if (!matches.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-futbol"></i> No live matches at the moment</div>';
            return;
        }
        
        container.innerHTML = matches.map(m => {
            const homeTeam = m.home_team || { name: 'Home', logo: '' };
            const awayTeam = m.away_team || { name: 'Away', logo: '' };
            const score = m.score || { home: 0, away: 0 };
            const elapsed = m.elapsed || 0;
            const period = elapsed < 45 ? '1st Half' : (elapsed < 60 ? 'Half Time' : (elapsed < 90 ? '2nd Half' : 'Added Time'));
            const isBettingClosed = elapsed >= BETTING_CLOSES_AT;
            const progressPercent = Math.min((elapsed / 90) * 100, 100);
            
            return `
                <div class="match-card live ${isBettingClosed ? 'betting-closed' : ''}" onclick="location.href='match-details.html?id=${m.fixture_id}'">
                    <div class="match-league">
                        ${m.league_logo ? `<img class="league-logo-mini" src="${escapeHtml(m.league_logo)}" onerror="this.style.display='none'">` : '<i class="fas fa-trophy"></i>'}
                        <span>${escapeHtml(m.league_name || 'League')}</span>
                        <span class="${isBettingClosed ? 'closed-badge' : 'live-badge'}">
                            <i class="fas ${isBettingClosed ? 'fa-lock' : 'fa-circle'}"></i> 
                            ${isBettingClosed ? 'BETTING CLOSED' : `LIVE ${period} ${elapsed}'`}
                        </span>
                    </div>
                    <div class="match-teams">
                        <div class="team">
                            ${homeTeam.logo ? `<img class="team-logo-mini" src="${escapeHtml(homeTeam.logo)}" onerror="this.style.display='none'">` : ''}
                            ${escapeHtml(homeTeam.name)}
                        </div>
                        <div class="score">${score.home} - ${score.away}</div>
                        <div class="team">
                            ${escapeHtml(awayTeam.name)}
                            ${awayTeam.logo ? `<img class="team-logo-mini" src="${escapeHtml(awayTeam.logo)}" onerror="this.style.display='none'">` : ''}
                        </div>
                    </div>
                    <div class="live-progress">
                        <div class="progress-fill ${isBettingClosed ? 'closed' : ''}" style="width: ${progressPercent}%;"></div>
                    </div>
                    <div class="odds-preview">
                        <div class="odd-preview ${isBettingClosed ? 'disabled' : ''}">1 <span>${m.odds?.home || '2.00'}</span></div>
                        <div class="odd-preview ${isBettingClosed ? 'disabled' : ''}">X <span>${m.odds?.draw || '3.50'}</span></div>
                        <div class="odd-preview ${isBettingClosed ? 'disabled' : ''}">2 <span>${m.odds?.away || '3.80'}</span></div>
                    </div>
                    ${isBettingClosed ? '<div style="text-align:center; margin-top:5px; font-size:10px; color:#ff5252;"><i class="fas fa-lock"></i> Betting closed - Match in final minutes</div>' : ''}
                </div>
            `;
        }).join('');
    }
    
    function displayTopUpcomingMatches(matches) {
        const container = document.getElementById('upcoming-container');
        
        if (!matches.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i> No upcoming matches found</div>';
            return;
        }
        
        container.innerHTML = matches.map(m => {
            const homeTeam = m.home_team || { name: 'Home', logo: '' };
            const awayTeam = m.away_team || { name: 'Away', logo: '' };
            const matchTime = new Date(m.start_time);
            const now = new Date();
            const minutesUntil = Math.floor((matchTime - now) / 60000);
            const isSoon = minutesUntil < 60 && minutesUntil > 0;
            
            return `
                <div class="match-card" onclick="location.href='match-details.html?id=${m.fixture_id}'">
                    <div class="match-league">
                        ${m.league_logo ? `<img class="league-logo-mini" src="${escapeHtml(m.league_logo)}" onerror="this.style.display='none'">` : '<i class="fas fa-trophy"></i>'}
                        <span>${escapeHtml(m.league_name || 'League')}</span>
                        ${isSoon ? '<span class="live-badge" style="background:#ff9800;"><i class="fas fa-clock"></i> Starting soon!</span>' : ''}
                    </div>
                    <div class="match-teams">
                        <div class="team">
                            ${homeTeam.logo ? `<img class="team-logo-mini" src="${escapeHtml(homeTeam.logo)}" onerror="this.style.display='none'">` : ''}
                            ${escapeHtml(homeTeam.name)}
                        </div>
                        <span style="color:#ff9800; font-weight:bold;">VS</span>
                        <div class="team">
                            ${escapeHtml(awayTeam.name)}
                            ${awayTeam.logo ? `<img class="team-logo-mini" src="${escapeHtml(awayTeam.logo)}" onerror="this.style.display='none'">` : ''}
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-top:8px;">
                        <span class="match-time"><i class="far fa-calendar"></i> ${matchTime.toLocaleDateString()}</span>
                        <span class="match-time"><i class="far fa-clock"></i> ${matchTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                        ${minutesUntil > 0 ? `<span class="match-time"><i class="fas fa-hourglass-start"></i> ${minutesUntil}m</span>` : ''}
                    </div>
                    <div class="odds-preview">
                        <div class="odd-preview">1 <span>${m.odds?.home || '2.00'}</span></div>
                        <div class="odd-preview">X <span>${m.odds?.draw || '3.50'}</span></div>
                        <div class="odd-preview">2 <span>${m.odds?.away || '3.80'}</span></div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    function loadDynamicLeagues() {
        const container = document.getElementById('top-leagues-grid');
        
        const leagues = Object.keys(leagueMatchesToday)
            .map(id => ({
                id: parseInt(id),
                ...leagueMatchesToday[id]
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 15);
        
        if (!leagues.length) {
            container.innerHTML = '<div class="empty-state">No leagues with matches today</div>';
            return;
        }
        
        container.innerHTML = leagues.map(league => `
            <div class="league-item ${league.hasLive ? 'has-live' : ''}" onclick="location.href='upcoming-matches.html?league=${league.id}&name=${encodeURIComponent(league.name)}'">
                <img src="${escapeHtml(league.logo)}" onerror="this.style.display='none'">
                <span>${escapeHtml(league.name)}</span>
                <span style="font-size: 8px; color: #a0a8c9;">${league.count} matches</span>
                ${league.hasLive ? `<div class="live-indicator" title="Live match now"></div>` : ''}
                ${league.hasLive ? `<span class="match-badge">LIVE</span>` : ''}
            </div>
        `).join('');
    }
    
    async function loadAllData() {
        try {
            leagueMatchesToday = {};
            allMatches = await fetchMatches();
            
            const liveMatches = allMatches.filter(m => m.status === 'live');
            const upcomingMatches = allMatches.filter(m => m.status === 'upcoming' && new Date(m.start_time) > new Date());
            const totalMatches = allMatches.length;
            const todayMatches = allMatches.filter(m => {
                const matchDate = new Date(m.start_time).toDateString();
                const today = new Date().toDateString();
                return matchDate === today && (m.status === 'live' || m.status === 'upcoming');
            });
            
            document.getElementById('stat-total').textContent = totalMatches;
            document.getElementById('stat-live').textContent = liveMatches.length;
            document.getElementById('stat-upcoming').textContent = upcomingMatches.length;
            document.getElementById('live-count').textContent = liveMatches.length;
            document.getElementById('quick-live').textContent = liveMatches.length;
            document.getElementById('quick-upcoming').textContent = upcomingMatches.length;
            document.getElementById('today-count').textContent = `${todayMatches.length} matches`;
            document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-US', { 
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
            });
            
            displayTopLiveMatches(liveMatches.slice(0, 5));
            displayTopUpcomingMatches(upcomingMatches.slice(0, 5));
            loadDynamicLeagues();
            
            if (currentUser && window.supabaseClient) {
                const { data: bets } = await window.supabaseClient
                    .from('bets')
                    .select('id', { count: 'exact' })
                    .eq('user_id', currentUser.uid)
                    .eq('status', 'active');
                
                const activeCount = bets?.length || 0;
                document.getElementById('stat-active-bets').textContent = activeCount;
                document.getElementById('quick-active').textContent = activeCount;
            }
            
            document.getElementById('last-updated').textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
        } catch(e) {
            console.error('Load data error:', e);
        }
    }
    
    function startAutoRefresh() {
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(() => {
            loadAllData();
            loadBalance();
        }, 60000);
    }
    
    // Initialize when Firebase is ready
    function init() {
        if (!window.firebaseAuth) {
            setTimeout(init, 100);
            return;
        }
        
        window.firebaseAuth.onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = '../login.html';
                return;
            }
            
            currentUser = user;
            document.getElementById('user-name').textContent = user.displayName || 'Sports Bettor';
            document.getElementById('user-email').textContent = user.email || '';
            
            await loadBalance();
            await loadAllData();
            startAutoRefresh();
        });
    }
    
    // Start initialization
    init();
    
    console.log('✅ Betting Sport Home Page - SECURED');
    console.log('   ✅ No credentials in HTML');
    console.log('   ✅ All sensitive data in external JS files');
})();
