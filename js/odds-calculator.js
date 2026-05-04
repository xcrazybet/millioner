// ============================================
// odds-calculator.js - Professional Odds Calculator
// ✅ Calculates odds based on team strength
// ✅ Supports all bet types
// ============================================

// Team strength database (simplified)
const TEAM_STRENGTH = {
    // Premier League
    'Manchester United': 85,
    'Liverpool': 88,
    'Arsenal': 84,
    'Chelsea': 82,
    'Manchester City': 92,
    'Tottenham': 80,
    'Newcastle': 78,
    // La Liga
    'Real Madrid': 90,
    'Barcelona': 89,
    'Atletico Madrid': 83,
    // Serie A
    'Juventus': 84,
    'AC Milan': 82,
    'Inter Milan': 86,
    // Bundesliga
    'Bayern Munich': 91,
    'Borussia Dortmund': 85,
    // Default
    'default': 75
};

function getTeamStrength(teamName) {
    for (const [name, strength] of Object.entries(TEAM_STRENGTH)) {
        if (teamName.toLowerCase().includes(name.toLowerCase())) {
            return strength;
        }
    }
    return TEAM_STRENGTH.default;
}

// Calculate 1X2 odds
function calculateMatchOdds(homeTeam, awayTeam) {
    const homeStrength = getTeamStrength(homeTeam);
    const awayStrength = getTeamStrength(awayTeam);
    
    const totalStrength = homeStrength + awayStrength;
    const homeProb = homeStrength / totalStrength;
    const awayProb = awayStrength / totalStrength;
    const drawProb = 1 - (homeProb + awayProb);
    
    // Add margin (typically 5-10%)
    const margin = 1.08;
    
    const homeOdds = (1 / homeProb) * margin;
    const drawOdds = (1 / drawProb) * margin;
    const awayOdds = (1 / awayProb) * margin;
    
    return {
        home: Math.min(homeOdds.toFixed(2), 5.00),
        draw: Math.min(drawOdds.toFixed(2), 4.50),
        away: Math.min(awayOdds.toFixed(2), 5.00)
    };
}

// Calculate Over/Under 2.5 odds
function calculateOverUnderOdds(homeTeam, awayTeam) {
    const homeStrength = getTeamStrength(homeTeam);
    const awayStrength = getTeamStrength(awayTeam);
    
    // Calculate expected goals
    const expectedGoals = ((homeStrength + awayStrength) / 100) * 2.5;
    
    // Simple probability model
    const overProb = Math.min(expectedGoals / 3, 0.65);
    const underProb = 1 - overProb;
    
    const margin = 1.08;
    
    return {
        over25: (1 / overProb * margin).toFixed(2),
        under25: (1 / underProb * margin).toFixed(2)
    };
}

// Calculate BTTS odds
function calculateBTTSOdds(homeTeam, awayTeam) {
    const homeStrength = getTeamStrength(homeTeam);
    const awayStrength = getTeamStrength(awayTeam);
    
    // Probability both teams score
    const homeScoreProb = homeStrength / 100;
    const awayScoreProb = awayStrength / 100;
    const bttsProb = homeScoreProb * awayScoreProb;
    
    const margin = 1.08;
    
    return {
        yes: (1 / bttsProb * margin).toFixed(2),
        no: (1 / (1 - bttsProb) * margin).toFixed(2)
    };
}

// Calculate Double Chance odds
function calculateDoubleChanceOdds(homeOdds, drawOdds, awayOdds) {
    const homeDraw = 1 / ((1 / homeOdds) + (1 / drawOdds));
    const homeAway = 1 / ((1 / homeOdds) + (1 / awayOdds));
    const drawAway = 1 / ((1 / drawOdds) + (1 / awayOdds));
    
    return {
        '1X': homeDraw.toFixed(2),
        '12': homeAway.toFixed(2),
        'X2': drawAway.toFixed(2)
    };
}

// Calculate Corner odds
function calculateCornerOdds(homeTeam, awayTeam) {
    const homeStrength = getTeamStrength(homeTeam);
    const awayStrength = getTeamStrength(awayTeam);
    
    const totalStrength = homeStrength + awayStrength;
    const expectedCorners = (totalStrength / 100) * 10;
    
    const overProb = Math.min(expectedCorners / 12, 0.6);
    const underProb = 1 - overProb;
    
    const margin = 1.10;
    
    return {
        over95: (1 / overProb * margin).toFixed(2),
        under95: (1 / underProb * margin).toFixed(2)
    };
}

// Calculate Card odds
function calculateCardOdds(homeTeam, awayTeam) {
    // Cards are more random, use simpler model
    const homeStrength = getTeamStrength(homeTeam);
    const awayStrength = getTeamStrength(awayTeam);
    
    // Aggressive teams get more cards
    const homeAggression = homeStrength > 85 ? 1.2 : 0.8;
    const awayAggression = awayStrength > 85 ? 1.2 : 0.8;
    
    const expectedCards = 4.5 * ((homeAggression + awayAggression) / 2);
    const overProb = Math.min(expectedCards / 6, 0.55);
    const underProb = 1 - overProb;
    
    const margin = 1.12;
    
    return {
        over45: (1 / overProb * margin).toFixed(2),
        under45: (1 / underProb * margin).toFixed(2)
    };
}

// Calculate Asian Handicap odds
function calculateAsianHandicapOdds(homeTeam, awayTeam) {
    const homeStrength = getTeamStrength(homeTeam);
    const awayStrength = getTeamStrength(awayTeam);
    
    const strengthDiff = (homeStrength - awayStrength) / 10;
    let handicap = 0;
    
    if (strengthDiff > 1.5) handicap = -1.5;
    else if (strengthDiff > 0.5) handicap = -0.75;
    else if (strengthDiff > -0.5) handicap = 0;
    else if (strengthDiff > -1.5) handicap = 0.75;
    else handicap = 1.5;
    
    return {
        handicap: handicap,
        home: (1.90 + (strengthDiff * 0.1)).toFixed(2),
        away: (1.90 - (strengthDiff * 0.1)).toFixed(2)
    };
}

// Export
window.OddsCalculator = {
    calculateMatchOdds,
    calculateOverUnderOdds,
    calculateBTTSOdds,
    calculateDoubleChanceOdds,
    calculateCornerOdds,
    calculateCardOdds,
    calculateAsianHandicapOdds,
    getTeamStrength
};

console.log('📊 Odds Calculator v1.0 - Ready');
