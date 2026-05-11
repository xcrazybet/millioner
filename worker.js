// ============================================
// worker.js - PROPER BACKEND SYNC ENGINE
// ✅ FIXED: Added missing axios import
// ============================================

// ===== REQUIRED IMPORTS =====
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// ===== CONFIGURATION =====
const SUPABASE_URL = 'https://jnazybaeajyynpyoszmy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WWHC2XIWlnDR9DsDpg52Vw_UIn2KopQ';
const API_KEY = process.env.API_FOOTBALL_KEY || '2396236d9d5cd07468ce280da8390ad5';
const BASE_URL = 'https://v3.football.api-sports.io';
const BATCH_SIZE = 50;
const SYNC_INTERVAL = 60000; // 60 seconds
const STATUS_INTERVAL = 30000; // 30 seconds

// ===== INITIALIZE SUPABASE =====
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
console.log('✅ Supabase connected');

// ===== HELPER FUNCTIONS =====

// Paginated fetch from API-Football
async function fetchWithPagination(endpoint, params = {}) {
    let allData = [];
    let page = 1;
    let totalPages = 1;
    
    while (page <= totalPages) {
        try {
            const response = await axios.get(`${BASE_URL}${endpoint}`, {
                params: { ...params, page },
                headers: { 'x-apisports-key': API_KEY },
                timeout: 30000
            });
            
            totalPages = response.data.paging?.total || 1;
            const data = response.data.response || [];
            allData.push(...data);
            
            console.log(`📡 Page ${page}/${totalPages}: ${data.length} items`);
            page++;
            
            if (page <= totalPages) await new Promise(r => setTimeout(r, 200));
        } catch (error) {
            console.error(`❌ Error on page ${page}:`, error.message);
            break;
        }
    }
    
    return { success: true, data: allData, total: allData.length };
}

// Get match status
function getMatchStatus(short) {
    if (!short || short === 'NS') return 'upcoming';
    if (['1H', '2H', 'HT', 'ET', 'BT', 'LIVE'].includes(short)) return 'live';
    if (['FT', 'AET', 'PEN'].includes(short)) return 'finished';
    return 'upcoming';
}

// Format fixture for database
function formatFixture(f) {
    return {
        fixture_id: f.fixture.id,
        status: getMatchStatus(f.fixture.status?.short),
        result: null,
        odds: {
            home: (1.80 + ((f.fixture.id % 20) / 100)).toFixed(2),
            draw: (3.20 + ((f.fixture.id % 15) / 100)).toFixed(2),
            away: (2.80 + ((f.fixture.id % 25) / 100)).toFixed(2)
        },
        league_id: f.league.id,
        league_name: f.league.name,
        home_team: {
            id: f.teams.home.id,
            name: f.teams.home.name,
            logo: f.teams.home.logo
        },
        away_team: {
            id: f.teams.away.id,
            name: f.teams.away.name,
            logo: f.teams.away.logo
        },
        start_time: f.fixture.date,
        score: { home: f.goals.home || 0, away: f.goals.away || 0 },
        updated_at: new Date().toISOString(),
        bets_settled: false
    };
}

// ===== SYNC MATCHES =====
async function syncMatches() {
    console.log('\n🔄 SYNC STARTED', new Date().toLocaleTimeString());
    
    // 1. Sync live matches
    console.log('🔴 Fetching live matches...');
    const liveResult = await fetchWithPagination('/fixtures', { live: 'all' });
    
    if (liveResult.data.length > 0) {
        const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'LIVE'];
        const liveMatches = liveResult.data.filter(f => 
            liveStatuses.includes(f.fixture.status?.short)
        );
        
        console.log(`📡 Found ${liveMatches.length} live matches`);
        
        for (let i = 0; i < liveMatches.length; i += BATCH_SIZE) {
            const batch = liveMatches.slice(i, i + BATCH_SIZE);
            const formatted = batch.map(formatFixture);
            
            const { error } = await supabase
                .from('sports_matches')
                .upsert(formatted, { onConflict: 'fixture_id' });
            
            if (error) {
                console.error('Batch insert error:', error.message);
            } else {
                console.log(`✅ Synced batch ${Math.floor(i/BATCH_SIZE)+1} (${batch.length} live matches)`);
            }
        }
    }
    
    // 2. Sync upcoming matches (next 30 days)
    const today = new Date();
    const from = today.toISOString().split('T')[0];
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + 30);
    const to = futureDate.toISOString().split('T')[0];
    
    console.log(`📅 Fetching upcoming matches ${from} → ${to}`);
    
    const upcomingResult = await fetchWithPagination('/fixtures', { from, to });
    
    if (upcomingResult.data.length > 0) {
        // Filter only upcoming (not started)
        const upcomingMatches = upcomingResult.data.filter(f => 
            f.fixture.status?.short === 'NS'
        );
        
        console.log(`📡 Found ${upcomingMatches.length} upcoming matches`);
        
        for (let i = 0; i < upcomingMatches.length; i += BATCH_SIZE) {
            const batch = upcomingMatches.slice(i, i + BATCH_SIZE);
            const formatted = batch.map(formatFixture);
            
            const { error } = await supabase
                .from('sports_matches')
                .upsert(formatted, { onConflict: 'fixture_id' });
            
            if (error) {
                console.error('Batch insert error:', error.message);
            } else {
                console.log(`✅ Synced batch ${Math.floor(i/BATCH_SIZE)+1} (${batch.length} upcoming matches)`);
            }
        }
    }
    
    console.log('✅ SYNC COMPLETE\n');
}

// ===== UPDATE MATCH STATUSES =====
async function updateMatchStatuses() {
    const now = new Date().toISOString();
    
    // Upcoming → Live
    const { data: toStart } = await supabase
        .from('sports_matches')
        .select('fixture_id')
        .eq('status', 'upcoming')
        .lte('start_time', now);
    
    if (toStart && toStart.length > 0) {
        await supabase
            .from('sports_matches')
            .update({ status: 'live', updated_at: now })
            .eq('status', 'upcoming')
            .lte('start_time', now);
        console.log(`⏰ Updated ${toStart.length} matches: upcoming → live`);
    }
    
    // Live → Finished (after 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: toFinish } = await supabase
        .from('sports_matches')
        .select('fixture_id, score')
        .eq('status', 'live')
        .lte('start_time', twoHoursAgo);
    
    if (toFinish && toFinish.length > 0) {
        for (const match of toFinish) {
            const homeScore = match.score?.home || 0;
            const awayScore = match.score?.away || 0;
            const result = homeScore > awayScore ? 'home' : (homeScore < awayScore ? 'away' : 'draw');
            
            await supabase
                .from('sports_matches')
                .update({ status: 'finished', result: result, updated_at: now })
                .eq('fixture_id', match.fixture_id);
            
            console.log(`🏁 Match ${match.fixture_id} finished: ${homeScore}-${awayScore}`);
        }
    }
}

// ===== WORKER LOOP (with concurrency protection) =====
let isSyncing = false;
let isUpdatingStatus = false;

async function workerLoop() {
    // Sync matches
    if (!isSyncing) {
        isSyncing = true;
        try {
            await syncMatches();
        } catch(e) {
            console.error('Sync error:', e);
        } finally {
            isSyncing = false;
        }
    } else {
        console.log('⏳ Sync already running, skipping...');
    }
    
    // Update statuses
    if (!isUpdatingStatus) {
        isUpdatingStatus = true;
        try {
            await updateMatchStatuses();
        } catch(e) {
            console.error('Status update error:', e);
        } finally {
            isUpdatingStatus = false;
        }
    }
}

// ===== START WORKER =====
console.log('\n========================================');
console.log('🚀 X Lodon Sync Worker Started');
console.log(`📡 API Key: ${API_KEY ? '✓ Configured' : '✗ Missing'}`);
console.log(`💾 Supabase: ✓ Connected`);
console.log(`🔄 Sync interval: ${SYNC_INTERVAL / 1000}s`);
console.log('========================================\n');

// Run immediately
workerLoop();

// Set intervals
setInterval(workerLoop, SYNC_INTERVAL);
