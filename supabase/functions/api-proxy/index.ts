// API Proxy for X Lodon - Replace your Render API
// Deployed on Supabase Edge Functions - Zero Downtime

const RAPIDAPI_KEY = "2396236d9d5cd07468ce280da8390ad5";
const RAPIDAPI_HOST = "api-football-v1.p.rapidapi.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace("/api-proxy", "");
  const endpoint = url.searchParams.get("endpoint") || path.replace("/", "");

  try {
    let apiPath = `/v3/fixtures?date=${new Date().toISOString().split("T")[0]}`;

    if (endpoint === "fixtures" || endpoint === "/fixtures") {
      const date = url.searchParams.get("date") || new Date().toISOString().split("T")[0];
      const league = url.searchParams.get("league");
      apiPath = `/v3/fixtures?date=${date}`;
      if (league) apiPath += `&league=${league}`;
    } else if (endpoint === "fixture" || endpoint === "/fixture") {
      const id = url.searchParams.get("id");
      if (!id) throw new Error("Missing fixture ID");
      apiPath = `/v3/fixtures?id=${id}`;
    } else if (endpoint === "live" || endpoint === "/live") {
      apiPath = "/v3/fixtures?live=all";
    } else if (endpoint === "health" || endpoint === "/health") {
      return new Response(JSON.stringify({ 
        status: "healthy", 
        api: "configured",
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Fetching: ${apiPath}`);
    const response = await fetch(`https://${RAPIDAPI_HOST}${apiPath}`, {
      headers: {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST,
      },
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();

    return new Response(JSON.stringify({ 
      success: true, 
      data: data,
      endpoint: endpoint 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
