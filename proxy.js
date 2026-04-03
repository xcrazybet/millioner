const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

const TOKEN = "DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy";

app.get('/api/fixtures', async (req, res) => {
    const response = await fetch(`https://api.sportmonks.com/v3/football/fixtures/latest?api_token=${TOKEN}&include=participants;scores;odds;league`);
    const data = await response.json();
    res.json(data);
});

app.get('/api/inplay', async (req, res) => {
    const response = await fetch(`https://api.sportmonks.com/v3/football/livescores/inplay?api_token=${TOKEN}&include=participants;scores;league`);
    const data = await response.json();
    res.json(data);
});

app.listen(3000, () => console.log('Proxy running on port 3000'));
