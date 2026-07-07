// ============================================
// X Lodon Sports API - COMPLETE ALL ENDPOINTS
// ============================================

const API_KEY = '2396236d9d5cd07468ce280da8390ad5';
const API_HOST = 'v3.football.api-sports.io';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

let apiCalls = 0;
let minuteStart = Date.now();

async function fetchAPI(path) {
  if (Date.now() - minuteStart > 60000) { apiCalls = 0; minuteStart = Date.now(); }
  if (apiCalls >= 25) { await new Promise(r => setTimeout(r, 61000 - (Date.now() - minuteStart))); apiCalls = 0; minuteStart = Date.now(); }
  apiCalls++;
  const res = await fetch(`https://${API_HOST}${path}`, { headers: { 'x-apisports-key': API_KEY } });
  const data = await res.json();
  if (data.errors?.rateLimit) { await new Promise(r => setTimeout(r, 2000)); apiCalls++; const retry = await fetch(`https://${API_HOST}${path}`, { headers: { 'x-apisports-key': API_KEY } }); return await retry.json(); }
  return data;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function formatFixture(f) {
  if (!f) return null;
  return {
    fixture: { id: f.fixture?.id, date: f.fixture?.date, status: { long: f.fixture?.status?.long, short: f.fixture?.status?.short, elapsed: f.fixture?.status?.elapsed }, venue: { id: f.fixture?.venue?.id, name: f.fixture?.venue?.name, city: f.fixture?.venue?.city }, referee: f.fixture?.referee },
    league: { id: f.league?.id, name: f.league?.name, country: f.league?.country, logo: f.league?.logo, flag: f.league?.flag, season: f.league?.season, round: f.league?.round },
    teams: { home: { id: f.teams?.home?.id, name: f.teams?.home?.name, logo: f.teams?.home?.logo, winner: f.teams?.home?.winner }, away: { id: f.teams?.away?.id, name: f.teams?.away?.name, logo: f.teams?.away?.logo, winner: f.teams?.away?.winner } },
    score: { halftime: { home: f.score?.halftime?.home ?? 0, away: f.score?.halftime?.away ?? 0 }, fulltime: { home: f.score?.fulltime?.home ?? 0, away: f.score?.fulltime?.away ?? 0 }, extratime: { home: f.score?.extratime?.home ?? null, away: f.score?.extratime?.away ?? null }, penalty: { home: f.score?.penalty?.home ?? null, away: f.score?.penalty?.away ?? null } },
    goals: { home: f.goals?.home ?? 0, away: f.goals?.away ?? 0 }
  };
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (path === '/health') {
      return json({ status: 'ok', timestamp: new Date().toISOString(), api_calls: apiCalls });
    }

    if (path === '/') {
      return json({
        name: 'X Lodon Sports API', version: '20.0.0', status: 'active',
        endpoints: [
          '/health', '/api/test',
          '/api/fixtures/week', '/api/fixtures/date/:date', '/api/fixtures/range/:from/:to',
          '/api/livescores',
          '/api/fixture/:id', '/api/fixtures/events/:id', '/api/fixtures/statistics/:id',
          '/api/fixtures/head2head/:home/:away', '/api/predictions/:id',
          '/api/leagues', '/api/standings/:league/:season',
          '/api/team/:id', '/api/topscorers/:league/:season', '/api/countries',
          '/api/venues/:id', '/api/coaches/:teamId', '/api/squad/:teamId',
          '/api/injuries?league=&season=', '/api/rounds?league=&season=',
          '/api/debug'
        ]
      });
    }

    if (path === '/api/test') {
      return json({ success: true, message: 'API is working!' });
    }

    if (path === '/api/fixtures/week') {
      const today = new Date();
      const from = today.toISOString().split('T')[0];
      const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
      const to = nextWeek.toISOString().split('T')[0];
      const data = await fetchAPI(`/fixtures?from=${from}&to=${to}`);
      const fixtures = (data.response || []).map(formatFixture);
      return json({ success: true, data: fixtures, count: fixtures.length, date_range: { from, to } });
    }

    if (path.startsWith('/api/fixtures/date/')) {
      const date = path.replace('/api/fixtures/date/', '');
      const data = await fetchAPI(`/fixtures?date=${date}`);
      const fixtures = (data.response || []).map(formatFixture);
      return json({ success: true, data: fixtures, count: fixtures.length, date });
    }

    if (path.startsWith('/api/fixtures/range/')) {
      const parts = path.replace('/api/fixtures/range/', '').split('/');
      const from = parts[0]; const to = parts[1];
      const data = await fetchAPI(`/fixtures?from=${from}&to=${to}`);
      const fixtures = (data.response || []).map(formatFixture);
      return json({ success: true, data: fixtures, count: fixtures.length, date_range: { from, to } });
    }

    if (path === '/api/livescores') {
      const data = await fetchAPI('/fixtures?live=all');
      const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'LIVE', 'INT', 'P'];
      const live = (data.response || []).filter(f => liveStatuses.includes(f.fixture?.status?.short));
      return json({ success: true, data: live.map(formatFixture), count: live.length });
    }

    if (path.startsWith('/api/fixtures/head2head/')) {
      const parts = path.replace('/api/fixtures/head2head/', '').split('/');
      const data = await fetchAPI(`/fixtures/headtohead?h2h=${parts[0]}-${parts[1]}`);
      const matches = (data.response || []).map(f => ({
        fixture: { id: f.fixture.id, date: f.fixture.date },
        teams: { home: { name: f.teams.home.name, winner: f.teams.home.winner }, away: { name: f.teams.away.name, winner: f.teams.away.winner } },
        goals: { home: f.goals.home, away: f.goals.away }
      }));
      const total = matches.length;
      const hw = matches.filter(m => m.teams.home.winner === true).length;
      const aw = matches.filter(m => m.teams.away.winner === true).length;
      return json({ success: true, data: matches, stats: { total, home_wins: hw, away_wins: aw, draws: total - hw - aw } });
    }

    if (path.startsWith('/api/predictions/')) {
      const id = path.replace('/api/predictions/', '');
      const data = await fetchAPI(`/predictions?fixture=${id}`);
      return json({ success: true, data: data.response?.[0] || null });
    }

    if (path.startsWith('/api/fixtures/events/')) {
      const id = path.replace('/api/fixtures/events/', '');
      const data = await fetchAPI(`/fixtures/events?fixture=${id}`);
      return json({ success: true, data: data.response || [] });
    }

    if (path.startsWith('/api/fixtures/statistics/')) {
      const id = path.replace('/api/fixtures/statistics/', '');
      const data = await fetchAPI(`/fixtures/statistics?fixture=${id}`);
      return json({ success: true, data: data.response || [] });
    }

    if (path.startsWith('/api/fixture/')) {
      const id = path.replace('/api/fixture/', '');
      const [fixData, evData, stData, odData] = await Promise.all([
        fetchAPI(`/fixtures?id=${id}`),
        fetchAPI(`/fixtures/events?fixture=${id}`).catch(() => ({ response: [] })),
        fetchAPI(`/fixtures/statistics?fixture=${id}`).catch(() => ({ response: [] })),
        fetchAPI(`/odds?fixture=${id}`).catch(() => ({ response: [] }))
      ]);
      if (fixData.response?.length) {
        return json({ success: true, fixture: formatFixture(fixData.response[0]), events: evData.response || [], statistics: stData.response || [], odds: odData.response || [] });
      }
      return json({ success: false, error: 'Fixture not found' }, 404);
    }

    if (path === '/api/leagues') {
      const data = await fetchAPI('/leagues');
      const leagues = (data.response || []).map(l => ({
        id: l.league.id, name: l.league.name, logo: l.league.logo, type: l.league.type,
        country: l.country.name, flag: l.country.flag
      }));
      return json({ success: true, data: leagues, count: leagues.length });
    }

    if (path.startsWith('/api/standings/')) {
      const parts = path.replace('/api/standings/', '').split('/');
      const data = await fetchAPI(`/standings?league=${parts[0]}&season=${parts[1]}`);
      return json({ success: true, data: data.response || [], league: parts[0], season: parts[1] });
    }

    if (path.startsWith('/api/team/')) {
      const id = path.replace('/api/team/', '');
      const data = await fetchAPI(`/teams?id=${id}`);
      if (data.response?.length) {
        const t = data.response[0];
        return json({ success: true, data: { id: t.team.id, name: t.team.name, logo: t.team.logo, country: t.team.country, founded: t.team.founded, venue: t.venue } });
      }
      return json({ success: false, error: 'Team not found' }, 404);
    }

    if (path.startsWith('/api/topscorers/')) {
      const parts = path.replace('/api/topscorers/', '').split('/');
      const data = await fetchAPI(`/players/topscorers?league=${parts[0]}&season=${parts[1]}`);
      const scorers = (data.response || []).map(p => ({
        rank: p.rank, player: p.player.name, photo: p.player.photo,
        team: p.statistics?.[0]?.team?.name, team_logo: p.statistics?.[0]?.team?.logo,
        goals: p.statistics?.[0]?.goals?.total || 0, assists: p.statistics?.[0]?.goals?.assists || 0,
        appearances: p.statistics?.[0]?.games?.appearences || 0, minutes: p.statistics?.[0]?.games?.minutes || 0
      }));
      return json({ success: true, data: scorers, count: scorers.length, league: parts[0], season: parts[1] });
    }

    if (path === '/api/countries') {
      const data = await fetchAPI('/countries');
      return json({ success: true, data: data.response || [], count: (data.response || []).length });
    }

    if (path.startsWith('/api/venues/')) {
      const id = path.replace('/api/venues/', '');
      const data = await fetchAPI(`/venues?id=${id}`);
      return json({ success: true, data: data.response || [] });
    }

    if (path.startsWith('/api/coaches/')) {
      const id = path.replace('/api/coaches/', '');
      const data = await fetchAPI(`/coachs?team=${id}`);
      return json({ success: true, data: data.response || [] });
    }

    if (path.startsWith('/api/squad/')) {
      const id = path.replace('/api/squad/', '');
      const data = await fetchAPI(`/players/squads?team=${id}`);
      return json({ success: true, data: data.response || [] });
    }

    if (path === '/api/injuries') {
      const league = url.searchParams.get('league') || '39';
      const season = url.searchParams.get('season') || '2024';
      const data = await fetchAPI(`/injuries?league=${league}&season=${season}`);
      return json({ success: true, data: data.response || [], league, season });
    }

    if (path === '/api/rounds') {
      const league = url.searchParams.get('league') || '39';
      const season = url.searchParams.get('season') || '2024';
      const data = await fetchAPI(`/fixtures/rounds?league=${league}&season=${season}`);
      return json({ success: true, data: data.response || [], league, season });
    }

    if (path === '/api/debug') {
      const today = new Date().toISOString().split('T')[0];
      const [fixtures, live] = await Promise.all([
        fetchAPI(`/fixtures?date=${today}`),
        fetchAPI('/fixtures?live=all')
      ]);
      return json({
        success: true, current_date: today,
        fixtures_today: (fixtures.response || []).length,
        live_matches: (live.response || []).length,
        api_calls: apiCalls,
        sample: (fixtures.response || []).slice(0, 2).map(formatFixture)
      });
    }

    return json({ success: false, error: `Endpoint not found: ${path}`, tip: 'Visit / for all endpoints' }, 404);

  } catch (error) {
    return json({ success: false, error: error.message }, 500);
  }
}

export default { async fetch(request, env, ctx) { return handleRequest(request); } };
