import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = 3000;
const TOKEN = "DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy";

app.use(express.static("public"));

// Generic proxy function
async function proxy(url, res) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
}

// Routes for key endpoints
app.get("/api/inplay", (req, res) =>
  proxy(`https://api.sportmonks.com/v3/football/livescores/inplay?api_token=${TOKEN}&include=state;lineups;events;statistics;periods`, res)
);

app.get("/api/upcoming", (req, res) =>
  proxy(`https://api.sportmonks.com/v3/football/fixtures/upcoming?api_token=${TOKEN}&include=participants;state`, res)
);

app.get("/api/leagues", (req, res) =>
  proxy(`https://api.sportmonks.com/v3/football/leagues?api_token=${TOKEN}`, res)
);

app.get("/api/seasons", (req, res) =>
  proxy(`https://api.sportmonks.com/v3/football/seasons?api_token=${TOKEN}`, res)
);

app.get("/api/teams", (req, res) =>
  proxy(`https://api.sportmonks.com/v3/football/teams?api_token=${TOKEN}`, res)
);

app.get("/api/players", (req, res) =>
  proxy(`https://api.sportmonks.com/v3/football/players?api_token=${TOKEN}`, res)
);

app.get("/api/standings", (req, res) =>
  proxy(`https://api.sportmonks.com/v3/football/standings?api_token=${TOKEN}`, res)
);

app.get("/api/odds", (req, res) =>
  proxy(`https://api.sportmonks.com/v3/football/odds/inplay?api_token=${TOKEN}`, res)
);

app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
