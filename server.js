// ============================================
// server.js - X Lodon Sports API
// ✅ Complete mock data for all endpoints
// ✅ Returns real-looking match data
// ✅ No API key required
// ============================================

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ============================================
// MOCK DATA GENERATOR
// ============================================

const leagues = [
    { id: 39, name: 'Premier League', logo: 'https://media.api-sports.io/football/leagues/39.png', country: 'England' },
    { id: 140, name: 'La Liga', logo: 'https://media.api-sports.io/football/leagues/140.png', country: 'Spain' },
    { id: 78, name: 'Bundesliga', logo: 'https://media.api-sports.io/football/leagues/78.png', country: 'Germany' },
    { id: 135, name: 'Serie A', logo: 'https://media.api-sports.io/football/leagues/135.png', country: 'Italy' },
    { id: 61, name: 'Ligue 1', logo: 'https://media.api-sports.io/football/leagues/61.png', country: 'France' }
];

const teams = {
    'Premier League': [
        { id: 33, name: 'Manchester United', logo: 'https://media.api-sports.io/football/teams/33.png' },
        { id: 40, name: 'Liverpool', logo: 'https://media.api-sports.io/football/teams/40.png' },
        { id: 42, name: 'Arsenal', logo: 'https://media.api-sports.io/football/teams/42.png' },
        { id: 49, name: 'Chelsea', logo: 'https://media.api-sports.io/football/teams/49.png' },
        { id: 50, name: 'Manchester City', logo: 'https://media.api-sports.io/football/teams/50.png' },
        { id: 47, name: 'Tottenham', logo: 'https://media.api-sports.io/football/teams/47.png' }
    ],
    'La Liga': [
        { id: 541, name: 'Real Madrid', logo: 'https://media.api-sports.io/football/teams/541.png' },
        { id: 529, name: 'Barcelona', logo: 'https://media.api-sports.io/football/teams/529.png' },
        { id: 530, name: 'Atletico Madrid', logo: 'https://media.api-sports.io/football/teams/530.png' },
        { id: 536, name: 'Sevilla', logo: 'https://media.api-sports.io/football/teams/536.png' }
    ],
    'Bundesliga': [
        { id: 157, name: 'Bayern Munich', logo: 'https://media.api-sports.io/football/teams/157.png' },
        { id: 165, name: 'Borussia Dortmund', logo: 'https://media.api-sports.io/football/teams/165.png' },
        { id: 168, name: 'Bayer Leverkusen', logo: 'https://media.api-sports.io/football/teams/168.png' }
    ],
    'Serie A': [
        { id: 489, name: 'AC Milan', logo: 'https://media.api-sports.io/football/teams/489.png' },
        { id: 505, name: 'Inter Milan', logo: 'https://media.api-sports.io/football/teams/505.png' },
        { id: 496, name: 'Juventus', logo: 'https://media.api-sports.io/football/teams/496.png' }
    ],
    'Ligue 1': [
        { id: 85, name: 'PSG', logo: 'https://media.api-sports.io/football/teams/85.png' },
        { id: 91, name: 'Marseille', logo: 'https://media.api-sports.io/football/teams/91.png' }
    ]
};

// Generate random odds
function generateOdds(fixtureId) {
    const baseHome = 1.80 + (Math.random() * 0.8);
    const baseDraw = 3.20 + (Math.random() * 0.5);
    const baseAway = 2.80 + (Math.random() * 0.8);
    
    return {
        home: baseHome.toFixed(2),
        draw: baseDraw.toFixed(2),
        away: baseAway.toFixed(2)
    };
}

// Generate matches for date range
function generateMatches(fromDate, toDate) {
    const matches = [];
    let fixtureId = 15000000;
    
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const daysDiff = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
    
    for (let day = 0; day <= daysDiff; day++) {
        const matchDate = new Date(from);
        matchDate.setDate(from.getDate() + day);
        
        // Skip if date is in the past beyond 2 days
        const now = new Date();
        if (matchDate < now && (now - matchDate) > 2 * 24 * 60 * 60 * 1000) {
            continue;
        }
        
        // Determine if it's a weekend (more matches)
        const isWeekend = matchDate.getDay() === 0 || matchDate.getDay() === 6;
        const matchesPerDay = isWeekend ? 24 : 16;
        
        for (let i = 0; i < matchesPerDay; i++) {
            const league = leagues[Math.floor(Math.random() * leagues.length)];
            const leagueTeams = teams[league.name];
            if (!leagueTeams) continue;
            
            const homeTeam = leagueTeams[Math.floor(Math.random() * leagueTeams.length)];
            let awayTeam = leagueTeams[Math.floor(Math.random() * leagueTeams.length)];
            let attempts = 0;
            while (awayTeam.id === homeTeam.id && attempts < 10) {
                awayTeam = leagueTeams[Math.floor(Math.random() * leagueTeams.length)];
                attempts++;
            }
            
            // Random kickoff times
            const hours = [12, 14, 15, 16, 17, 18, 19, 20, 21];
            const hour = hours[Math.floor(Math.random() * hours.length)];
            const minute = [0, 30][Math.floor(Math.random() * 2)];
            matchDate.setHours(hour, minute, 0, 0);
            
            // Determine match status
            let status = { short: 'NS', long: 'Not Started', elapsed: null };
            let goals = { home: null, away: null };
            let score = {
                halftime: { home: null, away: null },
                fulltime: { home: null, away: null }
            };
            
            if (matchDate < now) {
                const minutesAgo = (now - matchDate) / 60000;
                if (minutesAgo > 105) {
                    // Finished match
                    status = { short: 'FT', long: 'Match Finished', elapsed: 90 };
                    const homeGoals = Math.floor(Math.random() * 4);
                    const awayGoals = Math.floor(Math.random() * 3);
                    goals = { home: homeGoals, away: awayGoals };
                    score = {
                        halftime: { home: Math.floor(Math.random() * 2), away: Math.floor(Math.random() * 2) },
                        fulltime: { home: homeGoals, away: awayGoals }
                    };
                } else if (minutesAgo > 0) {
                    // Live match
                    const elapsed = Math.floor(minutesAgo);
                    const isFirstHalf = elapsed < 45;
                    status = { short: isFirstHalf ? '1H' : '2H', long: isFirstHalf ? 'First Half' : 'Second Half', elapsed: elapsed };
                    goals = {
                        home: Math.floor(Math.random() * 3),
                        away: Math.floor(Math.random() * 3)
                    };
                    score = {
                        halftime: { home: Math.floor(Math.random() * 2), away: Math.floor(Math.random() * 2) },
                        fulltime: { home: null, away: null }
                    };
                }
            }
            
            matches.push({
                fixture: {
                    id: fixtureId++,
                    date: matchDate.toISOString(),
                    status: status,
                    venue: { name: `${homeTeam.name} Stadium`, city: league.country }
                },
                league: {
                    id: league.id,
                    name: league.name,
                    logo: league.logo,
                    country: league.country
                },
                teams: {
                    home: homeTeam,
                    away: awayTeam
                },
                goals: goals,
                score: score,
                odds: generateOdds(fixtureId)
            });
        }
    }
    
    return matches.sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));
}

// ============================================
// API ENDPOINTS
// ============================================

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get fixtures for the week (today + next 7 days)
app.get('/api/fixtures/week', (req, res) => {
    const today = new Date();
    const fromDate = today.toISOString().split('T')[0];
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    const toDate = nextWeek.toISOString().split('T')[0];
    
    const matches = generateMatches(fromDate, toDate);
    
    // Group by date for easier display
    const groupedByDate = {};
    matches.forEach(m => {
        const date = new Date(m.fixture.date).toDateString();
        if (!groupedByDate[date]) groupedByDate[date] = [];
        groupedByDate[date].push(m);
    });
    
    res.json({
        success: true,
        data: matches,
        count: matches.length,
        grouped_by_date: groupedByDate,
        date_range: { from: fromDate, to: toDate },
        timestamp: new Date().toISOString()
    });
});

// Get live scores
app.get('/api/livescores', (req, res) => {
    const today = new Date();
    const fromDate = today.toISOString().split('T')[0];
    const toDate = today.toISOString().split('T')[0];
    
    const allMatches = generateMatches(fromDate, toDate);
    const liveMatches = allMatches.filter(m => {
        const status = m.fixture.status.short;
        return status === '1H' || status === '2H' || status === 'HT';
    });
    
    res.json({
        success: true,
        data: liveMatches,
        count: liveMatches.length,
        timestamp: new Date().toISOString()
    });
});

// Get fixtures for today
app.get('/api/fixtures/today', (req, res) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    const matches = generateMatches(todayStr, todayStr);
    
    res.json({
        success: true,
        data: matches,
        count: matches.length,
        date: todayStr,
        timestamp: new Date().toISOString()
    });
});

// Get leagues
app.get('/api/leagues', (req, res) => {
    res.json({
        success: true,
        data: leagues,
        count: leagues.length,
        timestamp: new Date().toISOString()
    });
});

// Get match events (goals, cards, substitutions)
app.get('/api/fixtures/events/:id', (req, res) => {
    const fixtureId = parseInt(req.params.id);
    
    // Generate random events for live matches
    const events = [];
    const numEvents = Math.floor(Math.random() * 6);
    
    const players = ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5'];
    const eventTypes = ['Goal', 'Card', 'Subst'];
    const cardTypes = ['Yellow Card', 'Red Card'];
    
    for (let i = 0; i < numEvents; i++) {
        const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
        const minute = Math.floor(Math.random() * 90) + 1;
        
        if (type === 'Goal') {
            events.push({
                type: 'Goal',
                player: { id: Math.floor(Math.random() * 100), name: players[Math.floor(Math.random() * players.length)] },
                time: { elapsed: minute },
                detail: 'Normal Goal'
            });
        } else if (type === 'Card') {
            events.push({
                type: 'Card',
                player: { id: Math.floor(Math.random() * 100), name: players[Math.floor(Math.random() * players.length)] },
                time: { elapsed: minute },
                detail: cardTypes[Math.floor(Math.random() * cardTypes.length)]
            });
        }
    }
    
    res.json({
        success: true,
        data: events,
        fixture_id: fixtureId,
        timestamp: new Date().toISOString()
    });
});

// Get head to head stats
app.get('/api/fixtures/head2head/:home/:away', (req, res) => {
    const homeId = parseInt(req.params.home);
    const awayId = parseInt(req.params.away);
    
    // Generate mock H2H data
    const totalMatches = Math.floor(Math.random() * 20) + 5;
    const homeWins = Math.floor(Math.random() * totalMatches);
    const awayWins = Math.floor(Math.random() * (totalMatches - homeWins));
    const draws = totalMatches - homeWins - awayWins;
    
    res.json({
        success: true,
        data: {
            total_matches: totalMatches,
            home_wins: homeWins,
            away_wins: awayWins,
            draws: draws,
            home_win_rate: ((homeWins / totalMatches) * 100).toFixed(1),
            away_win_rate: ((awayWins / totalMatches) * 100).toFixed(1),
            draw_rate: ((draws / totalMatches) * 100).toFixed(1)
        },
        timestamp: new Date().toISOString()
    });
});

// Get match statistics
app.get('/api/fixtures/statistics/:id', (req, res) => {
    res.json({
        success: true,
        data: {
            ball_possession: { home: Math.floor(Math.random() * 60) + 20, away: Math.floor(Math.random() * 60) + 20 },
            shots_on_target: { home: Math.floor(Math.random() * 10), away: Math.floor(Math.random() * 10) },
            shots_off_target: { home: Math.floor(Math.random() * 10), away: Math.floor(Math.random() * 10) },
            corners: { home: Math.floor(Math.random() * 8), away: Math.floor(Math.random() * 8) },
            fouls: { home: Math.floor(Math.random() * 15), away: Math.floor(Math.random() * 15) },
            yellow_cards: { home: Math.floor(Math.random() * 4), away: Math.floor(Math.random() * 4) },
            red_cards: { home: Math.floor(Math.random() * 2), away: Math.floor(Math.random() * 2) }
        },
        timestamp: new Date().toISOString()
    });
});

// Get predictions
app.get('/api/predictions/:id', (req, res) => {
    res.json({
        success: true,
        data: {
            home_win_probability: (Math.random() * 50 + 25).toFixed(1),
            draw_probability: (Math.random() * 30 + 15).toFixed(1),
            away_win_probability: (Math.random() * 50 + 25).toFixed(1),
            predicted_score: {
                home: Math.floor(Math.random() * 3) + 1,
                away: Math.floor(Math.random() * 2)
            },
            recommendation: ['Home Win', 'Draw', 'Away Win'][Math.floor(Math.random() * 3)]
        },
        timestamp: new Date().toISOString()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'X Lodon Sports API',
        version: '3.0.0',
        status: 'active',
        endpoints: {
            health: '/health',
            fixtures_week: '/api/fixtures/week',
            fixtures_today: '/api/fixtures/today',
            livescores: '/api/livescores',
            leagues: '/api/leagues',
            events: '/api/fixtures/events/:id',
            head2head: '/api/fixtures/head2head/:home/:away',
            statistics: '/api/fixtures/statistics/:id',
            predictions: '/api/predictions/:id'
        },
        data_source: 'Mock Data (Fully Functional)',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 X Lodon Sports API Server');
    console.log(`📍 Port: ${PORT}`);
    console.log(`📍 Health: http://localhost:${PORT}/health`);
    console.log(`📍 Fixtures: http://localhost:${PORT}/api/fixtures/week`);
    console.log('========================================');
    console.log('📡 Data Source: Mock Data (No API Key Required)');
    console.log('========================================');
});
