// ============================================
// js/sports-api.js - v60.0 FINAL FIX
// ✅ Forces ALL future matches into Supabase
// ✅ Runs every 2 minutes automatically
// ============================================

const BACKEND_URL = 'https://millioner.onrender.com';

// Main sync function - fetches from API and saves to Supabase
async function syncAllMatchesToSupabase() {
    if (!supaClient) {
        console.error("Supabase not connected");
        return;
    }
    
    console.log("\n========== SYNC START ==========");
    console.log("Time:", new Date().toLocaleString());
    
    try {
        // 1. Fetch from API
        const response = await fetch(BACKEND_URL + '/api/fixtures/week/');
        const data = await response.json();
        
        if (!data.success || !data.data) {
            console.error("API fetch failed");
            return;
        }
        
        const allMatches = data.data;
        console.log("API returned:", allMatches.length, "total matches");
        
        // 2. Get today's date (UTC)
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        
        // 3. Calculate date 7 days from now
        const nextWeek = new Date(today);
        nextWeek.setUTCDate(today.getUTCDate() + 7);
        
        // 4. Filter matches from today to next 7 days
        const futureMatches = [];
        
        for (const match of allMatches) {
            const matchDate = new Date(match.fixture.date);
            const status = match.fixture.status?.short || 'NS';
            
            // Include if: date is today or future, AND not finished
            if (matchDate >= today && matchDate <= nextWeek) {
                if (status !== 'FT' && status !== 'AET' && status !== 'PEN') {
                    futureMatches.push(match);
                }
            }
        }
        
        console.log("Future matches to sync:", futureMatches.length);
        
        // Group by date for logging
        const dateGroups = {};
        for (const match of futureMatches) {
            const date = new Date(match.fixture.date).toDateString();
            dateGroups[date] = (dateGroups[date] || 0) + 1;
        }
        console.log("Matches by date:", dateGroups);
        
        // 5. Save each match to Supabase
        let saved = 0;
        let errors = 0;
        
        for (let i = 0; i < futureMatches.length; i++) {
            const match = futureMatches[i];
            
            // Generate odds based on fixture ID (consistent)
            const fixtureId = match.fixture.id;
            const homeOdds = (1.80 + ((fixtureId % 20) / 100)).toFixed(2);
            const drawOdds = (3.20 + ((fixtureId % 15) / 100)).toFixed(2);
            const awayOdds = (2.80 + ((fixtureId % 25) / 100)).toFixed(2);
            
            const matchData = {
                fixture_id: fixtureId,
                status: 'upcoming',
                league_id: match.league.id,
                league_name: match.league.name,
                league_logo: match.league.logo || '',
                home_team: {
                    id: match.teams.home.id,
                    name: match.teams.home.name,
                    logo: match.teams.home.logo || ''
                },
                away_team: {
                    id: match.teams.away.id,
                    name: match.teams.away.name,
                    logo: match.teams.away.logo || ''
                },
                start_time: match.fixture.date,
                odds: {
                    home: parseFloat(homeOdds),
                    draw: parseFloat(drawOdds),
                    away: parseFloat(awayOdds)
                },
                score: { home: 0, away: 0 },
                updated_at: new Date().toISOString()
            };
            
            // Upsert to Supabase
            const { error } = await supaClient
                .from('sports_matches')
                .upsert(matchData, { onConflict: 'fixture_id' });
            
            if (error) {
                console.error("Error saving:", match.teams.home.name, "vs", match.teams.away.name, "-", error.message);
                errors++;
            } else {
                saved++;
                // Log progress every 100 matches
                if (saved % 100 === 0) {
                    console.log("Progress:", saved, "matches saved");
                }
            }
        }
        
        console.log("\n========== SYNC COMPLETE ==========");
        console.log("Saved:", saved, "matches");
        console.log("Errors:", errors);
        
        // 6. Verify what's now in Supabase
        const { data: verify, count } = await supaClient
            .from('sports_matches')
            .select('*', { count: 'exact' })
            .gte('start_time', today.toISOString());
        
        const verifyDates = {};
        for (const v of verify || []) {
            const d = new Date(v.start_time).toDateString();
            verifyDates[d] = (verifyDates[d] || 0) + 1;
        }
        console.log("Supabase now has:", verify?.length || 0, "future matches");
        console.log("Dates in Supabase:", verifyDates);
        
    } catch(error) {
        console.error("Sync error:", error);
    }
}

// Update match statuses (upcoming -> live -> finished)
async function updateMatchStatuses() {
    if (!supaClient) return;
    
    const now = new Date().toISOString();
    
    // Move upcoming to live
    const { data: toStart } = await supaClient
        .from('sports_matches')
        .select('fixture_id')
        .eq('status', 'upcoming')
        .lte('start_time', now);
    
    if (toStart && toStart.length > 0) {
        const { error } = await supaClient
            .from('sports_matches')
            .update({ status: 'live', updated_at: now })
            .eq('status', 'upcoming')
            .lte('start_time', now);
        
        if (!error) {
            console.log("Updated", toStart.length, "matches: upcoming -> live");
        }
    }
}

// Auto-sync system
let syncInterval;
let statusInterval;

function startAutoSync() {
    // Clear existing intervals
    if (syncInterval) clearInterval(syncInterval);
    if (statusInterval) clearInterval(statusInterval);
    
    // Run initial sync after 3 seconds
    setTimeout(() => {
        syncAllMatchesToSupabase();
        updateMatchStatuses();
    }, 3000);
    
    // Sync every 2 minutes
    syncInterval = setInterval(() => {
        syncAllMatchesToSupabase();
    }, 120000);
    
    // Update statuses every 30 seconds
    statusInterval = setInterval(() => {
        updateMatchStatuses();
    }, 30000);
    
    console.log("Auto-sync system ACTIVE");
    console.log("- Full sync: every 2 minutes");
    console.log("- Status update: every 30 seconds");
}

// Manual sync command
window.syncNow = syncAllMatchesToSupabase;

// Initialize
console.log("\n========================================");
console.log("SPORTS API v60.0 - FINAL FIX");
console.log("Auto-sync will start in 3 seconds...");
console.log("========================================\n");

if (supaClient) {
    console.log("Supabase connected");
    startAutoSync();
} else {
    console.error("Supabase not connected. Check your supabase-client.js");
    // Wait for Supabase to connect
    const checkInterval = setInterval(() => {
        if (supaClient) {
            console.log("Supabase connected (delayed)");
            clearInterval(checkInterval);
            startAutoSync();
        }
    }, 1000);
}
