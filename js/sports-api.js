// ============================================
// sports-api.js - v7.0 COMPLETE AUTO-SYNC
// ✅ No browser code - works in Node.js
// ✅ Auto-sync every 2 minutes
// ✅ Fetches from external API and saves to Supabase
// ============================================

const BACKEND_URL = 'https://millioner.onrender.com';

// Default odds for matches
const DEFAULT_ODDS = { home: 2.50, draw: 3.20, away: 2.80 };

// Helper: Generate odds based on fixture ID (consistent)
function generateOdds(fixtureId) {
    const id = fixtureId || Math.floor(Math.random() * 10000);
    return {
        home: (1.80 + ((id % 20) / 100)).toFixed(2),
        draw: (3.20 + ((id % 15) / 100)).toFixed(2),
        away: (2.80 + ((id % 25) / 100)).toFixed(2)
    };
}

// Helper: Get match status from API status
function getMatchStatus(apiStatus) {
    const status = apiStatus?.short || 'NS';
    if (status === 'NS') return 'upcoming';
    if (status === '1H' || status === '2H' || status === 'HT' || status === 'LIVE') return 'live';
    if (status === 'FT' || status === 'AET' || status === 'PEN') return 'finished';
    return 'upcoming';
}

// ===== FETCH FROM EXTERNAL API =====
async function fetchFromAPI(endpoint) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(BACKEND_URL + endpoint, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch(e) {
        console.error(`Fetch error ${endpoint}:`, e.message);
        return { success: false, data: [] };
    }
}

// ===== SYNC MATCH TO SUPABASE =====
async function syncMatchToDB(match, supaDB) {
    const fixture = match.fixture || {};
    const teams = match.teams || {};
    const league = match.league || {};
    const goals = match.goals || {};
    
    const fixtureId = fixture.id;
    if (!fixtureId) return false;
    
    try {
        const odds = generateOdds(fixtureId);
        const status = getMatchStatus(fixture.status);
        
        const matchData = {
            fixture_id: fixtureId,
            status: status,
            odds: odds,
            league_id: league.id || 0,
            league_name: league.name || 'Unknown League',
            league_logo: league.logo || '',
            home_team: {
                id: teams.home?.id || 0,
                name: teams.home?.name || 'Home',
                logo: teams.home?.logo || ''
            },
            away_team: {
                id: teams.away?.id || 0,
                name: teams.away?.name || 'Away',
                logo: teams.away?.logo || ''
            },
            start_time: fixture.date || new Date().toISOString(),
            score: {
                home: goals.home || 0,
                away: goals.away || 0
            },
            updated_at: new Date().toISOString()
        };
        
        return await supaDB.upsertMatch(matchData);
    } catch(e) {
        console.error(`Error syncing match ${fixtureId}:`, e.message);
        return false;
    }
}

// ===== SYNC ALL UPCOMING MATCHES =====
async function syncUpcomingMatches(supaDB) {
    console.log('📡 Fetching upcoming matches...');
    const data = await fetchFromAPI('/api/fixtures/week');
    
    if (!data.success || !data.data) {
        console.log('❌ Failed to fetch upcoming matches');
        return 0;
    }
    
    console.log(`📡 API returned ${data.data.length} matches`);
    
    // Filter for upcoming and live matches
    const now = new Date();
    const relevantMatches = data.data.filter(m => {
        const matchDate = new Date(m.fixture?.date);
        const status = m.fixture?.status?.short;
        return matchDate >= now && (status === 'NS' || status === '1H' || status === '2H' || status === 'HT');
    });
    
    console.log(`📅 Filtered to ${relevantMatches.length} relevant matches`);
    
    let synced = 0;
    for (const match of relevantMatches) {
        if (await syncMatchToDB(match, supaDB)) synced++;
        if (synced % 50 === 0) console.log(`   Synced: ${synced}/${relevantMatches.length}`);
    }
    
    console.log(`✅ Synced ${synced} upcoming matches`);
    return synced;
}

// ===== SYNC ALL LIVE MATCHES =====
async function syncLiveMatches(supaDB) {
    console.log('📡 Fetching live matches...');
    const data = await fetchFromAPI('/api/livescores');
    
    if (!data.success || !data.data) {
        console.log('❌ Failed to fetch live matches');
        return 0;
    }
    
    console.log(`📡 Live API returned ${data.data.length} matches`);
    
    let synced = 0;
    for (const match of data.data) {
        if (await syncMatchToDB(match, supaDB)) synced++;
    }
    
    console.log(`✅ Synced ${synced} live matches`);
    return synced;
}

// ===== UPDATE MATCH STATUSES =====
async function updateMatchStatuses(supaDB) {
    if (!supaDB || !supaDB.getAllMatches) return 0;
    
    try {
        const matches = await supaDB.getAllMatches();
        const now = new Date();
        let updated = 0;
        
        for (const match of matches) {
            const matchTime = new Date(match.start_time);
            let newStatus = match.status;
            
            if (match.status === 'upcoming' && matchTime <= now) {
                newStatus = 'live';
            } else if (match.status === 'live' && (now - matchTime) > 2 * 60 * 60 * 1000) {
                newStatus = 'finished';
            }
            
            if (newStatus !== match.status) {
                await supaDB.upsertMatch({
                    ...match,
                    status: newStatus,
                    updated_at: now.toISOString()
                });
                updated++;
            }
        }
        
        if (updated > 0) console.log(`⏰ Updated ${updated} match statuses`);
        return updated;
    } catch(e) {
        console.error('Status update error:', e);
        return 0;
    }
}

// ===== MAIN SYNC FUNCTION =====
async function syncAllMatches(supaDB) {
    console.log('\n========================================');
    console.log('🔄 Starting Auto-Sync');
    console.log('Time:', new Date().toLocaleString());
    console.log('========================================\n');
    
    const startTime = Date.now();
    
    const live = await syncLiveMatches(supaDB);
    const upcoming = await syncUpcomingMatches(supaDB);
    const statusUpdates = await updateMatchStatuses(supaDB);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n========================================');
    console.log(`✅ Sync Complete in ${duration}s`);
    console.log(`   Live: ${live} | Upcoming: ${upcoming} | Status Updates: ${statusUpdates}`);
    console.log('========================================\n');
    
    return { live, upcoming, statusUpdates };
}

// ===== AUTO-SYSTEM =====
let syncInterval = null;

function startAutoSync(supaDB, intervalMs = 120000) {
    if (syncInterval) clearInterval(syncInterval);
    
    console.log(`⏰ Auto-sync starting - every ${intervalMs / 1000} seconds`);
    
    // Run initial sync after 5 seconds
    setTimeout(() => syncAllMatches(supaDB), 5000);
    
    // Set interval
    syncInterval = setInterval(() => {
        syncAllMatches(supaDB);
    }, intervalMs);
}

function stopAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log('⏰ Auto-sync stopped');
    }
}

// ===== EXPORTS FOR DIFFERENT ENVIRONMENTS =====
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        syncAllMatches,
        startAutoSync,
        stopAutoSync,
        syncUpcomingMatches,
        syncLiveMatches,
        updateMatchStatuses,
        generateOdds
    };
}

// Browser environment - attach to window
if (typeof window !== 'undefined') {
    window.syncSportsData = () => {
        if (window.supaDB) {
            syncAllMatches(window.supaDB);
        } else {
            console.error('Supabase not loaded');
        }
    };
    window.startAutoSync = () => {
        if (window.supaDB) {
            startAutoSync(window.supaDB);
        } else {
            console.error('Supabase not loaded');
        }
    };
    
    console.log('🏈 Sports API v7.0 - Loaded');
    console.log('   Commands: syncSportsData() - manual sync');
    console.log('            startAutoSync() - start auto-sync');
}
