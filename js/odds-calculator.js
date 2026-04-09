// ============================================
// GLOBAL STANDARD ODDS CALCULATOR
// X Lodon Betting Platform
// ============================================

const ODDS_CONFIG = {
    houseEdge: 0.95,        // 5% house advantage
    homeAdvantage: 0.15,    // 15% boost to home team
    minOdds: 1.10,
    maxOdds: 100.00
};

// ===== TEAM STRENGTH CALCULATION =====

function calculateTeamStrength(teamStats) {
    // Default stats if none provided
    const stats = teamStats || {
        played: 10,
        wins: 4,
        draws: 3,
        losses: 3,
        goalsFor: 15,
        goalsAgainst: 12,
        recentForm: ['W', 'D', 'L', 'W', 'D']
    };
    
    // Win rate (40% weight)
    const winRate = stats.wins / stats.played;
    
    // Goal ratio (30% weight) - normalized to ~1.0 average
    const goalRatio = (stats.goalsFor / stats.played) / 1.5;
    const cappedGoalRatio = Math.min(2.0, Math.max(0.5, goalRatio));
    
    // Recent form (30% weight)
    let formPoints = 0;
    if (stats.recentForm && stats.recentForm.length > 0) {
        const last5 = stats.recentForm.slice(0, 5);
        last5.forEach(result => {
            if (result === 'W') formPoints += 3;
            else if (result === 'D') formPoints += 1;
        });
        formPoints = formPoints / (last5.length * 3);
    } else {
        formPoints = 0.5;
    }
    
    // Weighted average
    const strength = (winRate * 0.4) + (cappedGoalRatio * 0.3) + (formPoints * 0.3);
    
    return Math.min(1.0, Math.max(0.1, strength));
}

// ===== PROBABILITY CALCULATION =====

function calculateProbabilities(homeStrength, awayStrength) {
    // Base probabilities (before adjustment)
    let homeProb = 0.40;
    let drawProb = 0.25;
    let awayProb = 0.35;
    
    // Adjust for team strength difference
    const strengthDiff = homeStrength - awayStrength;
    
    homeProb += strengthDiff * 0.20;
    awayProb -= strengthDiff * 0.20;
    drawProb += (1 - (homeProb + awayProb)) * 0.3;
    
    // Apply home advantage
    homeProb += ODDS_CONFIG.homeAdvantage;
    awayProb -= ODDS_CONFIG.homeAdvantage * 0.5;
    drawProb -= ODDS_CONFIG.homeAdvantage * 0.5;
    
    // Ensure all probabilities are positive
    homeProb = Math.max(0.15, Math.min(0.70, homeProb));
    drawProb = Math.max(0.10, Math.min(0.35, drawProb));
    awayProb = Math.max(0.10, Math.min(0.60, awayProb));
    
    // Normalize to 100%
    const total = homeProb + drawProb + awayProb;
    
    return {
        home: homeProb / total,
        draw: drawProb / total,
        away: awayProb / total
    };
}

// ===== ODDS CALCULATION =====

function probabilitiesToOdds(probabilities) {
    // Convert probability to decimal odds (with house edge)
    let homeOdds = (1 / probabilities.home) * ODDS_CONFIG.houseEdge;
    let drawOdds = (1 / probabilities.draw) * ODDS_CONFIG.houseEdge;
    let awayOdds = (1 / probabilities.away) * ODDS_CONFIG.houseEdge;
    
    // Apply min/max bounds
    homeOdds = Math.min(ODDS_CONFIG.maxOdds, Math.max(ODDS_CONFIG.minOdds, homeOdds));
    drawOdds = Math.min(ODDS_CONFIG.maxOdds, Math.max(ODDS_CONFIG.minOdds, drawOdds));
    awayOdds = Math.min(ODDS_CONFIG.maxOdds, Math.max(ODDS_CONFIG.minOdds, awayOdds));
    
    // Round to 2 decimal places
    return {
        home: Math.round(homeOdds * 100) / 100,
        draw: Math.round(drawOdds * 100) / 100,
        away: Math.round(awayOdds * 100) / 100
    };
}

function calculateMatchOdds(homeTeam, awayTeam, homeStats = null, awayStats = null) {
    // Calculate team strengths
    const homeStrength = calculateTeamStrength(homeStats);
    const awayStrength = calculateTeamStrength(awayStats);
    
    // Calculate probabilities
    const probabilities = calculateProbabilities(homeStrength, awayStrength);
    
    // Convert to odds
    const odds = probabilitiesToOdds(probabilities);
    
    return {
        odds: odds,
        probabilities: {
            home: Math.round(probabilities.home * 100),
            draw: Math.round(probabilities.draw * 100),
            away: Math.round(probabilities.away * 100)
        },
        strengths: {
            home: Math.round(homeStrength * 100) / 100,
            away: Math.round(awayStrength * 100) / 100
        }
    };
}

// ===== ODDS FORMATTING =====

function formatOdds(odds) {
    if (typeof odds === 'number') {
        return odds.toFixed(2);
    }
    return {
        home: odds.home.toFixed(2),
        draw: odds.draw.toFixed(2),
        away: odds.away.toFixed(2)
    };
}

function formatOddsDisplay(odds, betType) {
    const value = odds[betType];
    return `${value.toFixed(2)}x`;
}

// ===== POTENTIAL WIN CALCULATOR =====

function calculatePotentialWin(amount, odds) {
    return amount * odds;
}

function calculatePayout(betAmount, odds, betType) {
    const winAmount = betAmount * odds[betType];
    return {
        stake: betAmount,
        profit: winAmount - betAmount,
        totalReturn: winAmount
    };
}

// ===== BATCH ODDS UPDATE =====

async function updateOddsForAllMatches() {
    if (!firebase || !firebase.firestore) {
        console.error('Firebase not initialized');
        return;
    }
    
    const db = firebase.firestore();
    
    try {
        const snapshot = await db.collection('sports_matches')
            .where('status', '==', 'upcoming')
            .get();
        
        console.log(`Updating odds for ${snapshot.size} upcoming matches`);
        
        const batch = db.batch();
        
        snapshot.forEach(doc => {
            const match = doc.data();
            const result = calculateMatchOdds(match.homeTeam, match.awayTeam);
            
            batch.update(doc.ref, {
                odds: result.odds,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        
        await batch.commit();
        console.log('Odds updated successfully');
        
    } catch (error) {
        console.error('Error updating odds:', error);
    }
}

// ===== TEST FUNCTION =====

function testOddsCalculator() {
    const testHomeTeam = { name: 'Arsenal' };
    const testAwayTeam = { name: 'Chelsea' };
    
    const result = calculateMatchOdds(testHomeTeam, testAwayTeam);
    
    console.log('=== Odds Calculator Test ===');
    console.log(`Match: ${testHomeTeam.name} vs ${testAwayTeam.name}`);
    console.log(`Odds: Home ${result.odds.home} | Draw ${result.odds.draw} | Away ${result.odds.away}`);
    console.log(`Probabilities: Home ${result.probabilities.home}% | Draw ${result.probabilities.draw}% | Away ${result.probabilities.away}%`);
    
    return result;
}

// Auto-run test on load (optional)
// window.addEventListener('load', testOddsCalculator);
