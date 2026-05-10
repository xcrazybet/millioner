// ===== GET FIXTURES FOR ANY DATE RANGE (Upcoming Months) =====
app.get('/api/fixtures/range/:from/:to', async (req, res) => {
    try {
        const { from, to } = req.params;
        
        console.log(`📅 Fetching fixtures from ${from} to ${to}`);
        
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success && result.data.length > 0) {
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
                    home: {
                        id: f.teams.home.id,
                        name: f.teams.home.name,
                        logo: f.teams.home.logo
                    },
                    away: {
                        id: f.teams.away.id,
                        name: f.teams.away.name,
                        logo: f.teams.away.logo
                    }
                },
                goals: {
                    home: f.goals.home,
                    away: f.goals.away
                }
            }));
            
            // Group by month
            const groupedByMonth = {};
            fixtures.forEach(f => {
                const month = new Date(f.fixture.date).toLocaleString('default', { month: 'long', year: 'numeric' });
                if (!groupedByMonth[month]) groupedByMonth[month] = [];
                groupedByMonth[month].push(f);
            });
            
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                date_range: { from, to },
                grouped_by_month: groupedByMonth,
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({
                success: true,
                data: [],
                count: 0,
                date_range: { from, to },
                message: `No fixtures found from ${from} to ${to}`,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== GET UPCOMING MATCHES (Next 30/60/90 days) =====
app.get('/api/fixtures/upcoming/:days', async (req, res) => {
    try {
        const days = parseInt(req.params.days) || 30;
        const today = new Date();
        const from = today.toISOString().split('T')[0];
        
        const futureDate = new Date(today);
        futureDate.setDate(today.getDate() + days);
        const to = futureDate.toISOString().split('T')[0];
        
        console.log(`📅 Fetching upcoming ${days} days: ${from} to ${to}`);
        
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success && result.data.length > 0) {
            const fixtures = result.data.map(f => ({
                fixture: {
                    id: f.fixture.id,
                    date: f.fixture.date,
                    status: f.fixture.status
                },
                league: {
                    id: f.league.id,
                    name: f.league.name,
                    logo: f.league.logo
                },
                teams: {
                    home: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
                    away: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo }
                }
            }));
            
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                date_range: { from, to, days: days },
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({
                success: true,
                data: [],
                count: 0,
                date_range: { from, to, days: days },
                message: `No upcoming matches in the next ${days} days`,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
