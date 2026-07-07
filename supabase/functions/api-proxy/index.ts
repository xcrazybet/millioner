// supabase/functions/api-proxy/index.ts
// Your complete API proxy - replaces Render entirely

const RAPIDAPI_KEY = "2396236d9d5cd07468ce280da8390ad5";
const RAPIDAPI_HOST = "api-football-v1.p.rapidapi.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Cache responses for 60 seconds to reduce API calls
const CACHE_DURATION = 60;

// In-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();

function getCached(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_DURATION * 1000) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
  // Limit cache size
  if (cache.size > 100) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

async function fetchFromRapidAPI(endpoint: string) {
  const cacheKey = endpoint;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[CACHE HIT] ${endpoint}`);
    return cached;
  }

  console.log(`[FETCHING] ${endpoint}`);
  const response = await fetch(`https://${RAPIDAPI_HOST}${endpoint}`, {
    headers: {
      "x-rapidapi-key": RAPIDAPI_KEY,
      "x-rapidapi-host": RAPIDAPI_HOST,
    },
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  setCache(cacheKey, data);
  return data;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace("/api-proxy", "");
  const endpoint = url.searchParams.get("endpoint") || path;

  // Handle different endpoints
  try {
    let result;

    switch (endpoint) {
      case "/fixtures":
      case "fixtures": {
        const date = url.searchParams.get("date") || new Date().toISOString().split("T")[0];
        const league = url.searchParams.get("league");
        const season = url.searchParams.get("season") || "2024";
        let apiPath = `/v3/fixtures?date=${date}&season=${season}`;
        if (league) apiPath += `&league=${league}`;
        result = await fetchFromRapidAPI(apiPath);
        break;
      }

      case "/fixture":
      case "fixture": {
        const id = url.searchParams.get("id");
        if (!id) throw new Error("Missing fixture ID");
        result = await fetchFromRapidAPI(`/v3/fixtures?id=${id}`);
        break;
      }

      case "/live":
      case "live": {
        result = await fetchFromRapidAPI("/v3/fixtures?live=all");
        break;
      }

      case "/leagues":
      case "leagues": {
        result = await fetchFromRapidAPI("/v3/leagues");
        break;
      }

      case "/teams":
      case "teams": {
        const leagueId = url.searchParams.get("league");
        const season = url.searchParams.get("season") || "2024";
        if (!leagueId) throw new Error("Missing league ID");
        result = await fetchFromRapidAPI(`/v3/teams?league=${leagueId}&season=${season}`);
        break;
      }

      case "/odds":
      case "odds": {
        const fixtureId = url.searchParams.get("fixture");
        if (!fixtureId) throw new Error("Missing fixture ID");
        result = await fetchFromRapidAPI(`/v3/odds?fixture=${fixtureId}`);
        break;
      }

      case "/health":
      case "health": {
        return new Response(
          JSON.stringify({ 
            status: "healthy", 
            timestamp: new Date().toISOString(),
            cacheSize: cache.size,
            rapidApiKey: RAPIDAPI_KEY ? "configured" : "missing"
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default: {
        // Default: fixtures for today
        const date = url.searchParams.get("date") || new Date().toISOString().split("T")[0];
        result = await fetchFromRapidAPI(`/v3/fixtures?date=${date}`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: result,
        cached: getCached(endpoint) !== null,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${CACHE_DURATION}`
        },
        status: 200,
      }
    );
  } catch (error) {
    console.error(`[ERROR] ${endpoint}:`, error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        endpoint: endpoint,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
