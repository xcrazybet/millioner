// ============================================
// server.js - X Lodon Sports API
// ✅ COMPLETE API with ALL endpoints
// ✅ Live matches, fixtures, head2head, predictions, statistics
// ✅ 3 months (90 days) of matches
// ============================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// API-Football configuration
const API_KEY = '2396236d9d5cd07468ce280da8390ad5';
const BASE_URL = 'https://v3.football.api-sports.io';

app.use(cors());
app.use(express.json());

// Helper function
function getDateString(date) {
    return date.toISOString().split('T')[0];
}

function getDateRange(days = 90) {
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setHours(0, 0, 0, 0);
    const from = getDateString(fromDate);
    
    const toDate = new Date(today);
    toDate.setDate(today.getDate() + days);
    toDate.setHours(23, 59, 59, 999);
    const to = getDateString(toDate);
    
    return { from, to, days };
}

async function fetchFromAPI(endpoint, params = {}) {
    try {
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
            params: params,
            headers: { 'x-apisports-key': API_KEY },
            timeout: 30000
        });
        return { success: true, data: response.data.response, total: response.data.results };
    } catch (error) {
        console.error(`API Error:`, error.message);
        return { success: false, data: [], error: error.message };
    }
}

// ============================================
// HEALTH & INFO
// ============================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// 1. FIXTURES - Get matches for date range
// ============================================
app.get('/api/fixtures/week', async (req, res) => {
    try {
        const { from, to, days } = getDateRange(90);
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success && result.data) {
            const fixtures = result.data.map(f => ({
                fixture: {
                    id: f.fixture.id,
                    date: f.fixture.date,
                    status: f.fixture.status,
                    venue: f.fixture.venue
                },
                league: {
                    id: f.league.id,
                    name: f.league.name,
                    logo: f.league.logo,
                    country: f.league.country
                },
                teams: {
                    home: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
                    away: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo }
                },
                goals: { home: f.goals.home, away: f.goals.away }
            }));
            
            res.json({ success: true, data: fixtures, count: fixtures.length, date_range: { from, to, days } });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 2. LIVE SCORES - Get currently live matches
// ============================================
app.get('/api/livescores', async (req, res) => {
    try {
        const result = await fetchFromAPI('/fixtures', { live: 'all' });
        
        if (result.success && result.data) {
            const liveMatches = result.data.filter(f =>
                f.fixture.status.short === '1H' ||
                f.fixture.status.short === '2H' ||
                f.fixture.status.short === 'HT'
            );
            
            const matches = liveMatches.map(f => ({
                fixture: {
                    id: f.fixture.id,
                    date: f.fixture.date,
                    status: f.fixture.status,
                    elapsed: f.fixture.status.elapsed
                },
                league: {
                    id: f.league.id,
                    name: f.league.name,
                    logo: f.league.logo,
                    country: f.league.country
                },
                teams: {
                    home: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
                    away: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo }
                },
                goals: { home: f.goals.home, away: f.goals.away },
                score: f.score
            }));
            
            res.json({ success: true, data: matches, count: matches.length });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 3. FIXTURES BY DATE - Get matches for specific date
// ============================================
app.get('/api/fixtures/date/:date', async (req, res) => {
    try {
        const date = req.params.date;
        const result = await fetchFromAPI('/fixtures', { date });
        
        if (result.success && result.data) {
            const fixtures = result.data.map(f => ({
                fixture: { id: f.fixture.id, date: f.fixture.date, status: f.fixture.status },
                league: { id: f.league.id, name: f.league.name, logo: f.league.logo, country: f.league.country },
                teams: {
                    home: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
                    away: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo }
                },
                goals: { home: f.goals.home, away: f.goals.away }
            }));
            res.json({ success: true, data: fixtures, count: fixtures.length, date: date });
        } else {
            res.json({ success: true, data: [], count: 0, date: date });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 4. FIXTURES BY DATE RANGE
// ============================================
app.get('/api/fixtures/range/:from/:to', async (req, res) => {
    try {
        const { from, to } = req.params;
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success && result.data) {
            const fixtures = result.data.map(f => ({
                fixture: { id: f.fixture.id, date: f.fixture.date, status: f.fixture.status },
                league: { id: f.league.id, name: f.league.name, logo: f.league.logo },
                teams: {
                    home: { id: f.teams.home.id, name: f.teams.home.name },
                    away: { id: f.teams.away.id, name: f.teams.away.name }
                }
            }));
            res.json({ success: true, data: fixtures, count: fixtures.length, date_range: { from, to } });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 5. SINGLE FIXTURE - Full details
// ============================================
app.get('/api/fixture/:id', async (req, res) => {
    try {
        const fixtureId = req.params.id;
        const [fixtureRes, eventsRes, statsRes, oddsRes] = await Promise.all([
            fetchFromAPI('/fixtures', { id: fixtureId }),
            fetchFromAPI('/fixtures/events', { fixture: fixtureId }),
            fetchFromAPI('/fixtures/statistics', { fixture: fixtureId }),
            fetchFromAPI('/odds', { fixture: fixtureId })
        ]);
        
        if (fixtureRes.success && fixtureRes.data) {
            const f = fixtureRes.data[0];
            res.json({
                success: true,
                fixture: {
                    id: f.fixture.id,
                    date: f.fixture.date,
                    status: f.fixture.status,
                    venue: f.fixture.venue,
                    timezone: f.fixture.timezone
                },
                league: {
                    id: f.league.id,
                    name: f.league.name,
                    logo: f.league.logo,
                    country: f.league.country,
                    season: f.league.season,
                    round: f.league.round
                },
                teams: {
                    home: {
                        id: f.teams.home.id,
                        name: f.teams.home.name,
                        logo: f.teams.home.logo,
                        formation: f.teams.home.formation
                    },
                    away: {
                        id: f.teams.away.id,
                        name: f.teams.away.name,
                        logo: f.teams.away.logo,
                        formation: f.teams.away.formation
                    }
                },
                goals: f.goals,
                score: f.score,
                events: eventsRes.data,
                statistics: statsRes.data,
                odds: oddsRes.data
            });
        } else {
            res.json({ success: false, error: 'Fixture not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 6. MATCH EVENTS - Goals, cards, substitutions
// ============================================
app.get('/api/fixtures/events/:id', async (req, res) => {
    try {
        const result = await fetchFromAPI('/fixtures/events', { fixture: req.params.id });
        res.json({ success: true, data: result.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 7. MATCH STATISTICS - Possession, shots, etc.
// ============================================
app.get('/api/fixtures/statistics/:id', async (req, res) => {
    try {
        const result = await fetchFromAPI('/fixtures/statistics', { fixture: req.params.id });
        res.json({ success: true, data: result.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 8. HEAD TO HEAD - Team vs Team history
// ============================================
app.get('/api/fixtures/head2head/:home/:away', async (req, res) => {
    try {
        const { home, away } = req.params;
        const result = await fetchFromAPI('/fixtures/headtohead', { h2h: `${home}-${away}` });
        
        if (result.success && result.data) {
            const matches = result.data.map(f => ({
                fixture: { id: f.fixture.id, date: f.fixture.date, status: f.fixture.status },
                league: { id: f.league.id, name: f.league.name },
                teams: {
                    home: { id: f.teams.home.id, name: f.teams.home.name, winner: f.teams.home.winner },
                    away: { id: f.teams.away.id, name: f.teams.away.name, winner: f.teams.away.winner }
                },
                goals: { home: f.goals.home, away: f.goals.away }
            }));
            
            const total = matches.length;
            const homeWins = matches.filter(m => m.teams.home.winner === true).length;
            const awayWins = matches.filter(m => m.teams.away.winner === true).length;
            const draws = total - homeWins - awayWins;
            
            res.json({
                success: true,
                data: matches,
                stats: {
                    total_matches: total,
                    home_wins: homeWins,
                    away_wins: awayWins,
                    draws: draws,
                    home_win_rate: ((homeWins / total) * 100).toFixed(1),
                    away_win_rate: ((awayWins / total) * 100).toFixed(1),
                    draw_rate: ((draws / total) * 100).toFixed(1)
                }
            });
        } else {
            res.json({ success: true, data: [], stats: null });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 9. PREDICTIONS - AI match predictions
// ============================================
app.get('/api/predictions/:id', async (req, res) => {
    try {
        const result = await fetchFromAPI('/predictions', { fixture: req.params.id });
        
        if (result.success && result.data && result.data[0]) {
            const p = result.data[0];
            res.json({
                success: true,
                data: {
                    predictions: p.predictions,
                    comparison: p.comparison,
                    h2h: p.h2h,
                    form: p.form,
                    percentage: p.percentage
                }
            });
        } else {
            res.json({ success: true, data: null });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 10. LEAGUES - All leagues
// ============================================
app.get('/api/leagues', async (req, res) => {
    try {
        const result = await fetchFromAPI('/leagues');
        
        if (result.success && result.data) {
            const leagues = result.data.map(l => ({
                id: l.league.id,
                name: l.league.name,
                logo: l.league.logo,
                type: l.league.type,
                country: l.country.name,
                country_code: l.country.code,
                flag: l.country.flag,
                seasons: l.seasons
            }));
            res.json({ success: true, data: leagues, count: leagues.length });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 11. LEAGUE STANDINGS / TABLE
// ============================================
app.get('/api/standings/:league/:season', async (req, res) => {
    try {
        const { league, season } = req.params;
        const result = await fetchFromAPI('/standings', { league, season });
        
        if (result.success && result.data) {
            res.json({ success: true, data: result.data });
        } else {
            res.json({ success: true, data: [] });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 12. TEAM INFORMATION
// ============================================
app.get('/api/team/:id', async (req, res) => {
    try {
        const result = await fetchFromAPI('/teams', { id: req.params.id });
        
        if (result.success && result.data) {
            const team = result.data[0];
            res.json({
                success: true,
                data: {
                    id: team.team.id,
                    name: team.team.name,
                    logo: team.team.logo,
                    country: team.team.country,
                    founded: team.team.founded,
                    venue: team.venue
                }
            });
        } else {
            res.json({ success: false, error: 'Team not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 13. PLAYER STATISTICS
// ============================================
app.get('/api/players', async (req, res) => {
    try {
        const { team, season, league } = req.query;
        const result = await fetchFromAPI('/players', { team, season, league });
        
        if (result.success && result.data) {
            const players = result.data.map(p => ({
                id: p.player.id,
                name: p.player.name,
                age: p.player.age,
                nationality: p.player.nationality,
                position: p.statistics[0]?.games?.position,
                team: p.statistics[0]?.team?.name,
                goals: p.statistics[0]?.goals?.total,
                assists: p.statistics[0]?.goals?.assists
            }));
            res.json({ success: true, data: players, count: players.length });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 14. TOP SCORERS
// ============================================
app.get('/api/topscorers/:league/:season', async (req, res) => {
    try {
        const { league, season } = req.params;
        const result = await fetchFromAPI('/players/topscorers', { league, season });
        
        if (result.success && result.data) {
            const scorers = result.data.map(p => ({
                rank: p.rank,
                player: p.player.name,
                team: p.statistics[0]?.team?.name,
                goals: p.statistics[0]?.goals?.total,
                assists: p.statistics[0]?.goals?.assists,
                penalties: p.statistics[0]?.penalty?.scored
            }));
            res.json({ success: true, data: scorers, count: scorers.length });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 15. COUNTRY LIST
// ============================================
app.get('/api/countries', async (req, res) => {
    try {
        const result = await fetchFromAPI('/countries');
        
        if (result.success && result.data) {
            const countries = result.data.map(c => ({
                name: c.name,
                code: c.code,
                flag: c.flag
            }));
            res.json({ success: true, data: countries, count: countries.length });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 16. TIMEZONES
// ============================================
app.get('/api/timezones', async (req, res) => {
    try {
        const result = await fetchFromAPI('/timezone');
        res.json({ success: true, data: result.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 17. DEBUG - Check API status
// ============================================
app.get('/api/debug', async (req, res) => {
    const { from, to, days } = getDateRange(90);
    const result = await fetchFromAPI('/fixtures', { from, to });
    
    res.json({
        api_working: result.success,
        total_matches_found: result.total || 0,
        date_range: { from, to, days_requested: days },
        is_valid_range: from <= to,
        sample_data: result.data ? result.data.slice(0, 3) : []
    });
});

// ============================================
// ROOT ENDPOINT
// ============================================
app.get('/', (req, res) => {
    const { from, to, days } = getDateRange(90);
    
    res.json({
        name: 'X Lodon Sports API',
        version: '12.0.0',
        status: 'active',
        api_key_configured: !!API_KEY,
        current_date_range: { from, to, total_days: days, description: '3 months' },
        endpoints: {
            fixtures: {
                week: '/api/fixtures/week (90 days)',
                date: '/api/fixtures/date/:date',
                range: '/api/fixtures/range/:from/:to',
                single: '/api/fixture/:id'
            },
            live: {
                scores: '/api/livescores'
            },
            statistics: {
                events: '/api/fixtures/events/:id',
                statistics: '/api/fixtures/statistics/:id',
                head2head: '/api/fixtures/head2head/:home/:away'
            },
            predictions: {
                match: '/api/predictions/:id'
            },
            leagues: {
                all: '/api/leagues',
                standings: '/api/standings/:league/:season'
            },
            teams: {
                info: '/api/team/:id',
                players: '/api/players?team=:id&season=:year'
            },
            other: {
                top_scorers: '/api/topscorers/:league/:season',
                countries: '/api/countries',
                timezones: '/api/timezones',
                debug: '/api/debug'
            }
        },
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    const { from, to, days } = getDateRange(90);
    
    console.log('\n========================================');
    console.log('🚀 X Lodon Sports API Server');
    console.log(`📍 Port: ${PORT}`);
    console.log('========================================');
    console.log(`🔑 API Key: ${API_KEY ? '✓ Configured' : '✗ Missing'}`);
    console.log(`📅 Date Range: ${from} → ${to} (${days} days / 3 months)`);
    console.log('========================================');
    console.log('\n📋 ENDPOINTS AVAILABLE:');
    console.log('   📅 FIXTURES:');
    console.log('      GET /api/fixtures/week');
    console.log('      GET /api/fixtures/date/:date');
    console.log('      GET /api/fixtures/range/:from/:to');
    console.log('      GET /api/fixture/:id');
    console.log('   🔴 LIVE:');
    console.log('      GET /api/livescores');
    console.log('   📊 STATISTICS:');
    console.log('      GET /api/fixtures/events/:id');
    console.log('      GET /api/fixtures/statistics/:id');
    console.log('      GET /api/fixtures/head2head/:home/:away');
    console.log('   🤖 PREDICTIONS:');
    console.log('      GET /api/predictions/:id');
    console.log('   🏆 LEAGUES:');
    console.log('      GET /api/leagues');
    console.log('      GET /api/standings/:league/:season');
    console.log('   ⚽ TEAMS:');
    console.log('      GET /api/team/:id');
    console.log('      GET /api/players?team=:id&season=:year');
    console.log('   🎯 OTHER:');
    console.log('      GET /api/topscorers/:league/:season');
    console.log('      GET /api/countries');
    console.log('      GET /api/timezones');
    console.log('      GET /api/debug');
    console.log('========================================\n');
});
