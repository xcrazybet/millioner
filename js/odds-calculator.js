// ============================================
// betting-engine-enhanced-with-odds.js - v6.0
// ✅ Full odds calculator integration
// ✅ Dynamic odds generation
// ✅ All 227+ bet types with dynamic odds
// ============================================

const EnhancedBettingEngine = {
    // ... all existing properties ...
    
    // 🆕 Dynamic odds cache
    dynamicOdds: null,
    
    // ✅ Enhanced selectMatch with odds calculation
    async selectMatch(fixtureId) {
        try {
            const { data: match, error } = await supabaseClient
                .from('sports_matches')
                .select('*')
                .eq('fixture_id', fixtureId)
                .single();
            
            if (error) throw error;
            if (match.status !== 'live') {
                this.showNotification('Betting only available for live matches!', 'error');
                return false;
            }
            if (match.bets_closed) {
                this.showNotification('Betting is closed for this match!', 'error');
                return false;
            }
            
            this.currentMatch = match;
            this.selectedBet = null;
            this.betAmount = 0;
            
            // 🆕 Calculate dynamic odds
            this.dynamicOdds = this.calculateAllOdds(match);
            
            // 🆕 Update odds config with dynamic values
            this.applyDynamicOdds(this.dynamicOdds);
            
            this.displayMatchDetails(match);
            
            // 🆕 Refresh displayed odds
            this.renderBetsForCategory(this.selectedCategory || Object.keys(BET_CATEGORIES)[0]);
            
            // Update match selection UI
            document.querySelectorAll('.match-item').forEach(el => {
                el.classList.toggle('selected', el.dataset.fixtureId == fixtureId);
            });
            
            return true;
        } catch(e) {
            console.error('Error loading match:', e);
            this.showNotification('Could not load match data', 'error');
            return false;
        }
    },
    
    // 🆕 Calculate all odds for a match
    calculateAllOdds(match) {
        const homeTeam = match.home_team.name;
        const awayTeam = match.away_team.name;
        
        // Get team strengths
        const homeStrength = OddsCalculator.getTeamStrength(homeTeam);
        const awayStrength = OddsCalculator.getTeamStrength(awayTeam);
        
        // 1. Match Winner Odds
        const matchOdds = OddsCalculator.calculateMatchOdds(homeTeam, awayTeam);
        
        // 2. Over/Under Odds
        const ouOdds = OddsCalculator.calculateOverUnderOdds(homeTeam, awayTeam);
        
        // 3. BTTS Odds
        const bttsOdds = OddsCalculator.calculateBTTSOdds(homeTeam, awayTeam);
        
        // 4. Double Chance Odds
        const dcOdds = OddsCalculator.calculateDoubleChanceOdds(
            parseFloat(matchOdds.home),
            parseFloat(matchOdds.draw),
            parseFloat(matchOdds.away)
        );
        
        // 5. Corner Odds
        const cornerOdds = OddsCalculator.calculateCornerOdds(homeTeam, awayTeam);
        
        // 6. Card Odds
        const cardOdds = OddsCalculator.calculateCardOdds(homeTeam, awayTeam);
        
        // 7. Asian Handicap Odds
        const ahOdds = OddsCalculator.calculateAsianHandicapOdds(homeTeam, awayTeam);
        
        // 8. Calculate derived odds for all bet types
        return {
            match_winner: {
                home: parseFloat(matchOdds.home),
                draw: parseFloat(matchOdds.draw),
                away: parseFloat(matchOdds.away)
            },
            double_chance: {
                '1X': parseFloat(dcOdds['1X']),
                '12': parseFloat(dcOdds['12']),
                'X2': parseFloat(dcOdds['X2'])
            },
            dnb: {
                home_dnb: Math.min(parseFloat(matchOdds.home) * 0.85, 6.00),
                away_dnb: Math.min(parseFloat(matchOdds.away) * 0.85, 6.00)
            },
            asian_handicap: {
                'ah_home_-0.5': parseFloat(ahOdds.home),
                'ah_away_+0.5': parseFloat(ahOdds.away),
                'ah_home_-1': parseFloat(ahOdds.home) * 1.05,
                'ah_away_+1': parseFloat(ahOdds.away) * 0.95,
                'ah_home_-1.5': parseFloat(ahOdds.home) * 1.10,
                'ah_away_+1.5': parseFloat(ahOdds.away) * 0.90,
                'ah_home_-2': parseFloat(ahOdds.home) * 1.15,
                'ah_away_+2': parseFloat(ahOdds.away) * 0.85,
                'ah_home_-2.5': parseFloat(ahOdds.home) * 1.20,
                'ah_away_+2.5': parseFloat(ahOdds.away) * 0.80
            },
            goals: {
                'over05': this.calculateDerivedOverUnder(0.5, homeStrength, awayStrength),
                'under05': this.calculateDerivedOverUnder(0.5, homeStrength, awayStrength, true),
                'over15': this.calculateDerivedOverUnder(1.5, homeStrength, awayStrength),
                'under15': this.calculateDerivedOverUnder(1.5, homeStrength, awayStrength, true),
                'over25': parseFloat(ouOdds.over25),
                'under25': parseFloat(ouOdds.under25),
                'over35': this.calculateDerivedOverUnder(3.5, homeStrength, awayStrength),
                'under35': this.calculateDerivedOverUnder(3.5, homeStrength, awayStrength, true),
                'over45': this.calculateDerivedOverUnder(4.5, homeStrength, awayStrength),
                'under45': this.calculateDerivedOverUnder(4.5, homeStrength, awayStrength, true),
                'over55': this.calculateDerivedOverUnder(5.5, homeStrength, awayStrength),
                'under55': this.calculateDerivedOverUnder(5.5, homeStrength, awayStrength, true),
                'over65': this.calculateDerivedOverUnder(6.5, homeStrength, awayStrength),
                'under65': this.calculateDerivedOverUnder(6.5, homeStrength, awayStrength, true)
            },
            btts: {
                'btts_yes': parseFloat(bttsOdds.yes),
                'btts_no': parseFloat(bttsOdds.no),
                'btts_yes_1st_half': this.calculateHalfBTTS(homeStrength, awayStrength, true),
                'btts_no_1st_half': this.calculateHalfBTTS(homeStrength, awayStrength, false),
                'btts_yes_2nd_half': this.calculateHalfBTTS(homeStrength, awayStrength, true, true),
                'btts_no_2nd_half': this.calculateHalfBTTS(homeStrength, awayStrength, false, true)
            },
            team_totals: this.calculateTeamTotals(homeStrength, awayStrength),
            corners: {
                'corners_over85': this.calculateCornerDerived(8.5, homeStrength, awayStrength),
                'corners_under85': this.calculateCornerDerived(8.5, homeStrength, awayStrength, true),
                'corners_over95': parseFloat(cornerOdds.over95),
                'corners_under95': parseFloat(cornerOdds.under95),
                'corners_over105': this.calculateCornerDerived(10.5, homeStrength, awayStrength),
                'corners_under105': this.calculateCornerDerived(10.5, homeStrength, awayStrength, true),
                'corners_over115': this.calculateCornerDerived(11.5, homeStrength, awayStrength),
                'corners_under115': this.calculateCornerDerived(11.5, homeStrength, awayStrength, true),
                'corners_over125': this.calculateCornerDerived(12.5, homeStrength, awayStrength),
                'corners_under125': this.calculateCornerDerived(12.5, homeStrength, awayStrength, true)
            },
            corners_team: this.calculateTeamCorners(homeStrength, awayStrength),
            corners_race: this.calculateRaceToCorners(homeStrength, awayStrength),
            yellow_cards: {
                'yellow_cards_over35': this.calculateCardDerived(3.5, homeStrength, awayStrength),
                'yellow_cards_under35': this.calculateCardDerived(3.5, homeStrength, awayStrength, true),
                'yellow_cards_over45': parseFloat(cardOdds.over45),
                'yellow_cards_under45': parseFloat(cardOdds.under45),
                'yellow_cards_over55': this.calculateCardDerived(5.5, homeStrength, awayStrength),
                'yellow_cards_under55': this.calculateCardDerived(5.5, homeStrength, awayStrength, true),
                'yellow_cards_over65': this.calculateCardDerived(6.5, homeStrength, awayStrength),
                'yellow_cards_under65': this.calculateCardDerived(6.5, homeStrength, awayStrength, true),
                'first_yellow_home': (homeStrength / (homeStrength + awayStrength) * 2.0).toFixed(2),
                'first_yellow_away': (awayStrength / (homeStrength + awayStrength) * 2.0).toFixed(2)
            },
            red_cards: {
                'red_card_yes': (3.0 + (1 - (homeStrength + awayStrength) / 200) * 5).toFixed(2),
                'red_card_no': (1.1 + (homeStrength + awayStrength) / 200 * 0.5).toFixed(2),
                'red_card_home_yes': (4.0 + (1 - homeStrength / 100) * 8).toFixed(2),
                'red_card_away_yes': (4.0 + (1 - awayStrength / 100) * 8).toFixed(2),
                'red_card_2_yes': (8.0 + (1 - (homeStrength + awayStrength) / 200) * 15).toFixed(2),
                'straight_red_yes': (3.5 + (1 - (homeStrength + awayStrength) / 200) * 6).toFixed(2),
                'second_yellow_yes': (4.0 + (1 - (homeStrength + awayStrength) / 200) * 7).toFixed(2)
            },
            cards_team: this.calculateTeamCards(homeStrength, awayStrength),
            substitutions: this.calculateSubstitutions(homeStrength, awayStrength),
            free_kicks: this.calculateFreeKicks(homeStrength, awayStrength),
            penalties: this.calculatePenalties(homeStrength, awayStrength),
            half_time: this.calculateHalfTime(homeStrength, awayStrength),
            second_half: this.calculateSecondHalf(homeStrength, awayStrength),
            ht_ft: this.calculateHTFT(homeStrength, awayStrength),
            goal_minutes: this.calculateGoalMinutes(homeStrength, awayStrength),
            goal_scorer: this.calculateGoalScorer(homeStrength, awayStrength),
            clean_sheets: this.calculateCleanSheets(homeStrength, awayStrength),
            exact_score: this.calculateExactScore(homeStrength, awayStrength),
            total_goals: this.calculateTotalGoals(homeStrength, awayStrength),
            match_specials: this.calculateMatchSpecials(homeStrength, awayStrength)
        };
    },
    
    // 🆕 Helper: Calculate derived Over/Under odds
    calculateDerivedOverUnder(threshold, homeStrength, awayStrength, under = false) {
        const avgStrength = (homeStrength + awayStrength) / 2;
        const expectedGoals = (avgStrength / 100) * 2.5;
        const prob = Math.min(expectedGoals / (threshold + 0.5), 0.85);
        const odds = 1 / (under ? (1 - prob) : prob);
        return Math.min(Math.max(odds * 1.08, 1.02), 10.00).toFixed(2);
    },
    
    // 🆕 Helper: Calculate BTTS by half
    calculateHalfBTTS(homeStrength, awayStrength, yes, secondHalf = false) {
        const factor = secondHalf ? 1.2 : 0.8;
        const prob = (homeStrength / 100 * awayStrength / 100) * factor;
        const odds = 1 / (yes ? prob : (1 - prob));
        return Math.min(Math.max(odds * 1.08, 1.10), 8.00).toFixed(2);
    },
    
    // 🆕 Helper: Calculate Team Totals
    calculateTeamTotals(homeStrength, awayStrength) {
        const homeExpected = (homeStrength / 100) * 1.5;
        const awayExpected = (awayStrength / 100) * 1.5;
        
        return {
            'home_over05': (1 / (1 - Math.exp(-homeExpected)) * 1.08).toFixed(2),
            'home_under05': (1 / (Math.exp(-homeExpected)) * 1.08).toFixed(2),
            'home_over15': (1 / (1 - Math.exp(-homeExpected * 1.5)) * 1.08).toFixed(2),
            'home_under15': (1 / (Math.exp(-homeExpected * 1.5)) * 1.08).toFixed(2),
            'home_over25': (1 / (1 - Math.exp(-homeExpected * 2)) * 1.08).toFixed(2),
            'home_under25': (1 / (Math.exp(-homeExpected * 2)) * 1.08).toFixed(2),
            'away_over05': (1 / (1 - Math.exp(-awayExpected)) * 1.08).toFixed(2),
            'away_under05': (1 / (Math.exp(-awayExpected)) * 1.08).toFixed(2),
            'away_over15': (1 / (1 - Math.exp(-awayExpected * 1.5)) * 1.08).toFixed(2),
            'away_under15': (1 / (Math.exp(-awayExpected * 1.5)) * 1.08).toFixed(2),
            'away_over25': (1 / (1 - Math.exp(-awayExpected * 2)) * 1.08).toFixed(2),
            'away_under25': (1 / (Math.exp(-awayExpected * 2)) * 1.08).toFixed(2)
        };
    },
    
    // 🆕 Helper: Calculate Corner derived odds
    calculateCornerDerived(threshold, homeStrength, awayStrength, under = false) {
        const avgStrength = (homeStrength + awayStrength) / 2;
        const expectedCorners = (avgStrength / 100) * 10;
        const prob = Math.min(expectedCorners / (threshold + 1), 0.8);
        const odds = 1 / (under ? (1 - prob) : prob);
        return Math.min(Math.max(odds * 1.10, 1.02), 8.00).toFixed(2);
    },
    
    // 🆕 Helper: Calculate Team Corners
    calculateTeamCorners(homeStrength, awayStrength) {
        const homeExpected = (homeStrength / 100) * 5.5;
        const awayExpected = (awayStrength / 100) * 4.5;
        
        return {
            'home_corners_over45': (1 / (1 - Math.exp(-homeExpected * 0.8)) * 1.10).toFixed(2),
            'home_corners_under45': (1 / (Math.exp(-homeExpected * 0.8)) * 1.10).toFixed(2),
            'home_corners_over55': (1 / (1 - Math.exp(-homeExpected * 1.2)) * 1.10).toFixed(2),
            'home_corners_under55': (1 / (Math.exp(-homeExpected * 1.2)) * 1.10).toFixed(2),
            'away_corners_over45': (1 / (1 - Math.exp(-awayExpected * 0.8)) * 1.10).toFixed(2),
            'away_corners_under45': (1 / (Math.exp(-awayExpected * 0.8)) * 1.10).toFixed(2),
            'away_corners_over55': (1 / (1 - Math.exp(-awayExpected * 1.2)) * 1.10).toFixed(2),
            'away_corners_under55': (1 / (Math.exp(-awayExpected * 1.2)) * 1.10).toFixed(2)
        };
    },
    
    // 🆕 Helper: Calculate Race To Corners
    calculateRaceToCorners(homeStrength, awayStrength) {
        const total = homeStrength + awayStrength;
        const homeProb = homeStrength / total;
        const awayProb = awayStrength / total;
        
        return {
            'first_corner_home': (1 / homeProb * 1.10).toFixed(2),
            'first_corner_away': (1 / awayProb * 1.10).toFixed(2),
            'first_corner_draw': (1 / (1 - homeProb - awayProb) * 1.10).toFixed(2),
            'race_to_3_home': (1 / Math.pow(homeProb, 3) * 1.10).toFixed(2),
            'race_to_3_away': (1 / Math.pow(awayProb, 3) * 1.10).toFixed(2),
            'race_to_5_home': (1 / Math.pow(homeProb, 5) * 1.10).toFixed(2),
            'race_to_5_away': (1 / Math.pow(awayProb, 5) * 1.10).toFixed(2),
            'race_to_7_home': (1 / Math.pow(homeProb, 7) * 1.10).toFixed(2),
            'race_to_7_away': (1 / Math.pow(awayProb, 7) * 1.10).toFixed(2)
        };
    },
    
    // 🆕 Helper: Calculate Card derived odds
    calculateCardDerived(threshold, homeStrength, awayStrength, under = false) {
        const avgStrength = (homeStrength + awayStrength) / 2;
        const expectedCards = (avgStrength / 100) * 4.5;
        const prob = Math.min(expectedCards / threshold, 0.75);
        const odds = 1 / (under ? (1 - prob) : prob);
        return Math.min(Math.max(odds * 1.12, 1.02), 7.00).toFixed(2);
    },
    
    // 🆕 Helper: Calculate Team Cards
    calculateTeamCards(homeStrength, awayStrength) {
        const homeAggression = homeStrength > 85 ? 1.2 : 0.8;
        const awayAggression = awayStrength > 85 ? 1.2 : 0.8;
        
        const homeExpected = (homeStrength / 100) * 2.5 * homeAggression;
        const awayExpected = (awayStrength / 100) * 2.5 * awayAggression;
        
        return {
            'home_yellows_over25': (1 / (1 - Math.exp(-homeExpected * 0.8)) * 1.12).toFixed(2),
            'home_yellows_under25': (1 / (Math.exp(-homeExpected * 0.8)) * 1.12).toFixed(2),
            'away_yellows_over25': (1 / (1 - Math.exp(-awayExpected * 0.8)) * 1.12).toFixed(2),
            'away_yellows_under25': (1 / (Math.exp(-awayExpected * 0.8)) * 1.12).toFixed(2)
        };
    },
    
    // 🆕 Helper: Calculate Substitutions
    calculateSubstitutions(homeStrength, awayStrength) {
        const avgStrength = (homeStrength + awayStrength) / 2;
        const expectedSubs = (avgStrength / 100) * 3.5;
        
        return {
            'subs_over25': (1 / (1 - Math.exp(-expectedSubs * 0.7)) * 1.08).toFixed(2),
            'subs_under25': (1 / (Math.exp(-expectedSubs * 0.7)) * 1.08).toFixed(2),
            'subs_over35': (1 / (1 - Math.exp(-expectedSubs * 1.1)) * 1.08).toFixed(2),
            'subs_under35': (1 / (Math.exp(-expectedSubs * 1.1)) * 1.08).toFixed(2),
            'subs_over45': (1 / (1 - Math.exp(-expectedSubs * 1.5)) * 1.08).toFixed(2),
            'subs_under45': (1 / (Math.exp(-expectedSubs * 1.5)) * 1.08).toFixed(2),
            'first_sub_home': (homeStrength / (homeStrength + awayStrength) * 2.0).toFixed(2),
            'first_sub_away': (awayStrength / (homeStrength + awayStrength) * 2.0).toFixed(2),
            'home_subs_over15': (1 / (1 - Math.exp(-(homeStrength / 100) * 1.5)) * 1.08).toFixed(2),
            'away_subs_over15': (1 / (1 - Math.exp(-(awayStrength / 100) * 1.5)) * 1.08).toFixed(2),
            'home_subs_over25': (1 / (1 - Math.exp(-(homeStrength / 100) * 2.5)) * 1.08).toFixed(2),
            'away_subs_over25': (1 / (1 - Math.exp(-(awayStrength / 100) * 2.5)) * 1.08).toFixed(2)
        };
    },
    
    // 🆕 Helper: Calculate Free Kicks
    calculateFreeKicks(homeStrength, awayStrength) {
        const avgStrength = (homeStrength + awayStrength) / 2;
        const expectedFKs = (avgStrength / 100) * 4.0;
        
        return {
            'free_kicks_over25': (1 / (1 - Math.exp(-expectedFKs * 0.6)) * 1.08).toFixed(2),
            'free_kicks_under25': (1 / (Math.exp(-expectedFKs * 0.6)) * 1.08).toFixed(2),
            'free_kicks_over35': (1 / (1 - Math.exp(-expectedFKs * 0.9)) * 1.08).toFixed(2),
            'free_kicks_under35': (1 / (Math.exp(-expectedFKs * 0.9)) * 1.08).toFixed(2),
            'free_kicks_over45': (1 / (1 - Math.exp(-expectedFKs * 1.2)) * 1.08).toFixed(2),
            'free_kicks_under45': (1 / (Math.exp(-expectedFKs * 1.2)) * 1.08).toFixed(2),
            'free_kicks_over55': (1 / (1 - Math.exp(-expectedFKs * 1.5)) * 1.08).toFixed(2),
            'free_kicks_under55': (1 / (Math.exp(-expectedFKs * 1.5)) * 1.08).toFixed(2),
            'first_free_kick_home': (homeStrength / (homeStrength + awayStrength) * 2.0).toFixed(2),
            'first_free_kick_away': (awayStrength / (homeStrength + awayStrength) * 2.0).toFixed(2)
        };
    },
    
    // 🆕 Helper: Calculate Penalties
    calculatePenalties(homeStrength, awayStrength) {
        const avgStrength = (homeStrength + awayStrength) / 2;
        const penaltyProb = (avgStrength / 100) * 0.15;
        
        return {
            'penalty_yes': (1 / penaltyProb * 1.10).toFixed(2),
            'penalty_no': (1 / (1 - penaltyProb) * 1.10).toFixed(2),
            'penalty_scored_yes': (1 / (penaltyProb * 0.75) * 1.10).toFixed(2),
            'penalty_missed_yes': (1 / (penaltyProb * 0.25) * 1.10).toFixed(2),
            'penalty_home_yes': (1 / (penaltyProb * (homeStrength / (homeStrength + awayStrength))) * 1.10).toFixed(2),
            'penalty_away_yes': (1 / (penaltyProb * (awayStrength / (homeStrength + awayStrength))) * 1.10).toFixed(2),
            'penalty_shootout_yes': (1 / (0.03 + (1 - avgStrength / 100) * 0.05) * 1.10).toFixed(2),
            'penalty_shootout_no': (1 / (1 - (0.03 + (1 - avgStrength / 100) * 0.05)) * 1.10).toFixed(2)
        };
    },
    
    // 🆕 Helper: Calculate Half Time
    calculateHalfTime(homeStrength, awayStrength) {
        const total = homeStrength + awayStrength;
        const homeProb = homeStrength / total;
        const awayProb = awayStrength / total;
        const drawProb = 1 - homeProb - awayProb;
        
        // Half time goals probability
        const htGoalsProb = (homeStrength + awayStrength) / 200;
        
        return {
            'ht_home': (1 / (homeProb * 0.9) * 1.08).toFixed(2),
            'ht_draw': (1 / (drawProb * 1.1) * 1.08).toFixed(2),
            'ht_away': (1 / (awayProb * 0.9) * 1.08).toFixed(2),
            'ht_over05': (1 / (htGoalsProb) * 1.08).toFixed(2),
            'ht_under05': (1 / (1 - htGoalsProb) * 1.08).toFixed(2),
            'ht_over15': (1 / (htGoalsProb * 0.6) * 1.08).toFixed(2),
            'ht_under15': (1 / (1 - htGoalsProb * 0.6) * 1.08).toFixed(2),
            'ht_over25': (1 / (htGoalsProb * 0.3) * 1.08).toFixed(2),
            'ht_under25': (1 / (1 - htGoalsProb * 0.3) * 1.08).toFixed(2),
            'ht_btts_yes': (1 / ((homeStrength / 100) * (awayStrength / 100) * 0.6) * 1.08).toFixed(2),
            'ht_btts_no': (1 / (1 - (homeStrength / 100) * (awayStrength / 100) * 0.6) * 1.08).toFixed(2)
        };
    },
    
    // 🆕 Helper: Calculate Second Half
    calculateSecondHalf(homeStrength, awayStrength) {
        const total = homeStrength + awayStrength;
        const homeProb = homeStrength / total;
        const awayProb = awayStrength / total;
        const drawProb = 1 - homeProb - awayProb;
        
        const shGoalsProb = (homeStrength + awayStrength) / 180;
        
        return {
            '2h_home': (1 / (homeProb * 0.9) * 1.08).toFixed(2),
            '2h_draw': (1 / (drawProb * 1.1) * 1.08).toFixed(2),
            '2h_away': (1 / (awayProb * 0.9) * 1.08).toFixed(2),
            '2h_over05': (1 / (shGoalsProb) * 1.08).toFixed(2),
            '2h_under05': (1 / (1 - shGoalsProb) * 1.08).toFixed(2),
            '2h_over15': (1 / (shGoalsProb * 0.6) * 1.08).toFixed(2),
            '2h_under15': (1 / (1 - shGoalsProb * 0.6) * 1.08).toFixed(2),
            '2h_btts_yes': (1 / ((homeStrength / 100) * (awayStrength / 100) * 0.7) * 1.08).toFixed(2),
            '2h_btts_no': (1 / (1 - (homeStrength / 100) * (awayStrength / 100) * 0.7) * 1.08).toFixed(2)
        };
    },
    
    // 🆕 Helper: Calculate HT/FT Combinations
    calculateHTFT(homeStrength, awayStrength) {
        const total = homeStrength + awayStrength;
        const homeProb = homeStrength / total;
        const awayProb = awayStrength / total;
        const drawProb = 1 - homeProb - awayProb;
        
        const htHome = homeProb * 0.9;
        const htDraw = drawProb * 1.1;
        const htAway = awayProb * 0.9;
        
        return {
            'ht_ft_home_home': (1 / (htHome * homeProb) * 1.08).toFixed(2),
            'ht_ft_home_draw': (1 / (htHome * drawProb * 0.3) * 1.08).toFixed(2),
            'ht_ft_home_away': (1 / (htHome * awayProb * 0.1) * 1.08).toFixed(2),
            'ht_ft_draw_draw': (1 / (htDraw * drawProb * 0.5) * 1.08).toFixed(2),
            'ht_ft_draw_home': (1 / (htDraw * homeProb * 0.4) * 1.08).toFixed(2),
            'ht_ft_draw_away': (1 / (htDraw * awayProb * 0.4) * 1.08).toFixed(2),
            'ht_ft_away_away': (1 / (htAway * awayProb) * 1.08).toFixed(2),
            'ht_ft_away_draw': (1 / (htAway * drawProb * 0.3) * 1.08).toFixed(2),
            'ht_ft_away_home': (1 / (htAway * homeProb * 0.1) * 1.08).toFixed(2)
        };
    },
    
    // 🆕 Helper: Calculate Goal Minutes
    calculateGoalMinutes(homeStrength, awayStrength) {
        const avgStrength = (homeStrength + awayStrength) / 2;
        const totalGoalsProb = (avgStrength / 100) * 2.5;
        
        // Distribution of goals across minutes (approximate)
        const distributions = {
            '0_15': 0.15,
            '16_30': 0.15,
            '31_45': 0.20,
            '46_60': 0.15,
            '61_75': 0.15,
            '76_90': 0.20
        };
        
        const result = {};
        for (const [range, dist] of Object.entries(distributions)) {
            const key = `first_goal_${range.replace('_', '_')}`;
            const prob = totalGoalsProb * dist;
            result[key] = (1 / prob * 1.08).toFixed(2);
            
            const yesKey = `goal_${range.replace('_', '_')}_yes`;
            result[yesKey] = (1 / prob * 1.08).toFixed(2);
        }
        
        result['no_first_goal'] = (1 / (1 - totalGoalsProb) * 1.08).toFixed(2);
        
        return result;
    },
    
    // 🆕 Helper: Calculate Goal Scorer
    calculateGoalScorer(homeStrength, awayStrength) {
        const homeScorerProb = homeStrength / 100 * 0.5;
        const awayScorerProb = awayStrength / 100 * 0.5;
        
        return {
            'anytime_goal_home_striker': (1 / (homeScorerProb) * 1.08).toFixed(2),
            'anytime_goal_away_striker': (1 / (awayScorerProb) * 1.08).toFixed(2),
            'first_goal_home': (1 / (homeScorerProb * 0.6) * 1.08).toFixed(2),
            'first_goal_away': (1 / (awayScorerProb * 0.6) * 1.08).toFixed(2),
            'last_goal_home': (1 / (homeScorerProb * 0.6) * 1.08).toFixed(2),
            'last_goal_away': (1 / (awayScorerProb * 0.6) * 1.08).toFixed(2),
            'hat_trick_yes': (1 / (0.02 + (homeStrength + awayStrength) / 1000) * 1.08).toFixed(2),
            'hat_trick_no': (1 / (1 - (0.02 + (homeStrength + awayStrength) / 1000)) * 1.08).toFixed(2),
            'brace_yes': (1 / (0.05 + (homeStrength + awayStrength) / 500) * 1.08).toFixed(2),
            'brace_no': (1 / (1 - (0.05 + (homeStrength + awayStrength) / 500)) * 1.08).toFixed(2)
        };
    },
    
    // 🆕 Helper: Calculate Clean Sheets
    calculateCleanSheets(homeStrength, awayStrength) {
        const homeCSProb = (homeStrength / 100) * 0.4;
        const awayCSProb = (awayStrength / 100) * 0.4;
        
        return {
            'home_clean_sheet_yes': (1 / homeCSProb * 1.08).toFixed(2),
            'home_clean_sheet_no': (1 / (1 - homeCSProb) * 1.08).toFixed(2),
            'away_clean_sheet_yes': (1 / awayCSProb * 1.08).toFixed(2),
            'away_clean_sheet_no': (1 / (1 - awayCSProb) * 1.08).toFixed(2)
        };
    },
    
    // 🆕 Helper: Calculate Exact Score
    calculateExactScore(homeStrength, awayStrength) {
        const homeGoals = (homeStrength / 100) * 1.8;
        const awayGoals = (awayStrength / 100) * 1.8;
        
        const poisson = (lambda, k) => {
            return Math.pow(lambda, k) * Math.exp(-lambda) / this.factorial(k);
        };
        
        const scores = [
            [1,0], [2,0], [2,1], [3,0], [3,1], [3,2],
            [4,0], [4,1], [0,0], [1,1], [2,2], [3,3]
        ];
        
        const result = {};
        for (const [h, a] of scores) {
            const key = `exact_score_${h}_${a}`;
            const prob = poisson(homeGoals, h) * poisson(awayGoals, a);
            result[key] = (1 / Math.max(prob, 0.001) * 1.08).toFixed(2);
        }
        
        return result;
    },
    
    // 🆕 Helper: Calculate Total Goals
    calculateTotalGoals(homeStrength, awayStrength) {
        const totalGoals = (homeStrength + awayStrength) / 100 * 2.5;
        const poisson = (lambda, k) => {
            return Math.pow(lambda, k) * Math.exp(-lambda) / this.factorial(k);
        };
        
        const result = {};
        for (let i = 0; i <= 6; i++) {
            const key = `total_goals_${i}`;
            result[key] = (1 / poisson(totalGoals, i) * 1.08).toFixed(2);
        }
        
        // 7+ goals
        let prob7plus = 0;
        for (let i = 7; i < 20; i++) {
            prob7plus += poisson(totalGoals, i);
        }
        result['total_goals_7plus'] = (1 / Math.max(prob7plus, 0.001) * 1.08).toFixed(2);
        
        return result;
    },
    
    // 🆕 Helper: Calculate Match Specials
    calculateMatchSpecials(homeStrength, awayStrength) {
        const total = homeStrength + awayStrength;
        const homeProb = homeStrength / total;
        const awayProb = awayStrength / total;
        
        return {
            'win_to_nil_home': (1 / (homeProb * 0.3) * 1.08).toFixed(2),
            'win_to_nil_away': (1 / (awayProb * 0.3) * 1.08).toFixed(2),
            'both_half_win_home': (1 / (homeProb * 0.5 * homeProb * 0.8) * 1.08).toFixed(2),
            'both_half_win_away': (1 / (awayProb * 0.5 * awayProb * 0.8) * 1.08).toFixed(2),
            'comeback_win': (1 / (0.1 + (1 - homeProb) * 0.2) * 1.08).toFixed(2),
            'lead_changed': (1 / (0.25 + (1 - (homeProb - awayProb)) * 0.3) * 1.08).toFixed(2),
            'lead_changed_3': (1 / (0.05 + (1 - Math.abs(homeProb - awayProb)) * 0.1) * 1.08).toFixed(2),
            'draw_half_home_full': (1 / ((1 - homeProb - awayProb) * homeProb * 0.4) * 1.08).toFixed(2),
            'draw_half_away_full': (1 / ((1 - homeProb - awayProb) * awayProb * 0.4) * 1.08).toFixed(2)
        };
    },
    
    // 🆕 Helper: Factorial for Poisson
    factorial(n) {
        if (n === 0 || n === 1) return 1;
        let result = 1;
        for (let i = 2; i <= n; i++) {
            result *= i;
        }
        return result;
    },
    
    // 🆕 Apply dynamic odds to config
    applyDynamicOdds(dynamicOdds) {
        // Merge dynamic odds with static config
        for (const [category, odds] of Object.entries(dynamicOdds)) {
            if (window.ODDS_CONFIG[category]) {
                for (const [betType, value] of Object.entries(odds)) {
                    if (window.ODDS_CONFIG[category][betType]) {
                        // Update default value
                        window.ODDS_CONFIG[category][betType].default = parseFloat(value);
                    }
                }
            }
        }
        
        console.log('✅ Dynamic odds applied to all bet types');
    },
    
    // 🆕 Override getBetConfig to use dynamic odds
    getBetConfig(betType) {
        // First try to get from dynamic odds
        for (const [category, odds] of Object.entries(this.dynamicOdds || {})) {
            if (odds[betType]) {
                const value = parseFloat(odds[betType]);
                const min = Math.max(value * 0.7, 1.01);
                const max = Math.min(value * 1.3, 100);
                return { min, max, default: value };
            }
        }
        
        // Fallback to static config
        for (const category of Object.values(ODDS_CONFIG)) {
            if (category[betType]) {
                return category[betType];
            }
        }
        return null;
    }
};

// ===== EXPORT =====
window.EnhancedBettingEngine = EnhancedBettingEngine;
window.ODDS_CONFIG = ODDS_CONFIG;
window.BET_CATEGORIES = BET_CATEGORIES;
window.BET_DISPLAY_NAMES = BET_DISPLAY_NAMES;
window.OddsCalculator = OddsCalculator;

console.log('🎰 Enhanced Betting Engine v6.0 - Complete with Odds Calculator!');
