// ============================================
// betting-engine-enhanced.js - v5.0 COMPLETE
// ✅ 227+ bet types
// ✅ All categories from the master list
// ✅ Penalties, Free Kicks, Red/Yellow Cards
// ✅ Substitutions, Corners, HT/FT
// ✅ Asian Handicap, Goal Scorer Markets
// ✅ Complete odds configuration
// ============================================

// ===== COMPLETE ODDS CONFIGURATION =====
const ODDS_CONFIG = {
    // 3-Way Moneyline
    match_winner: {
        home: { min: 1.10, max: 10.00, default: 1.80 },
        draw: { min: 1.80, max: 8.00, default: 3.20 },
        away: { min: 1.10, max: 10.00, default: 2.80 }
    },
    
    // Double Chance
    double_chance: {
        '1X': { min: 1.10, max: 3.00, default: 1.50 },
        '12': { min: 1.05, max: 2.50, default: 1.30 },
        'X2': { min: 1.10, max: 3.00, default: 1.50 }
    },
    
    // Draw No Bet
    dnb: {
        home_dnb: { min: 1.20, max: 6.00, default: 1.60 },
        away_dnb: { min: 1.20, max: 6.00, default: 1.60 }
    },
    
    // Asian Handicap
    asian_handicap: {
        'ah_home_-0.5': { min: 1.80, max: 8.00, default: 2.00 },
        'ah_away_+0.5': { min: 1.60, max: 6.00, default: 1.80 },
        'ah_home_-1': { min: 2.00, max: 9.00, default: 2.10 },
        'ah_away_+1': { min: 1.50, max: 5.00, default: 1.70 },
        'ah_home_-1.5': { min: 2.20, max: 10.00, default: 2.30 },
        'ah_away_+1.5': { min: 1.40, max: 4.50, default: 1.60 },
        'ah_home_-2': { min: 2.50, max: 12.00, default: 2.60 },
        'ah_away_+2': { min: 1.20, max: 4.00, default: 1.50 },
        'ah_home_-2.5': { min: 3.00, max: 15.00, default: 3.10 },
        'ah_away_+2.5': { min: 1.10, max: 3.50, default: 1.40 }
    },
    
    // Goals Over/Under
    goals: {
        'over05': { min: 1.05, max: 1.50, default: 1.30 },
        'under05': { min: 2.50, max: 6.00, default: 3.50 },
        'over15': { min: 1.20, max: 2.00, default: 1.60 },
        'under15': { min: 1.80, max: 4.50, default: 2.20 },
        'over25': { min: 1.50, max: 3.00, default: 1.80 },
        'under25': { min: 1.40, max: 2.80, default: 1.90 },
        'over35': { min: 2.00, max: 5.00, default: 2.50 },
        'under35': { min: 1.20, max: 3.50, default: 1.50 },
        'over45': { min: 3.00, max: 8.00, default: 4.00 },
        'under45': { min: 1.10, max: 4.00, default: 1.40 },
        'over55': { min: 5.00, max: 15.00, default: 6.00 },
        'under55': { min: 1.05, max: 3.00, default: 1.20 },
        'over65': { min: 8.00, max: 25.00, default: 10.00 },
        'under65': { min: 1.02, max: 2.50, default: 1.10 }
    },
    
    // BTTS
    btts: {
        'btts_yes': { min: 1.50, max: 3.00, default: 1.80 },
        'btts_no': { min: 1.30, max: 2.50, default: 1.90 },
        'btts_yes_1st_half': { min: 2.50, max: 6.00, default: 3.50 },
        'btts_no_1st_half': { min: 1.20, max: 3.00, default: 1.60 },
        'btts_yes_2nd_half': { min: 2.00, max: 5.00, default: 3.00 },
        'btts_no_2nd_half': { min: 1.30, max: 3.50, default: 1.70 }
    },
    
    // Team Totals
    team_totals: {
        'home_over05': { min: 1.20, max: 2.50, default: 1.60 },
        'home_under05': { min: 1.80, max: 4.50, default: 2.20 },
        'home_over15': { min: 1.80, max: 4.00, default: 2.50 },
        'home_under15': { min: 1.20, max: 3.00, default: 1.50 },
        'home_over25': { min: 3.00, max: 8.00, default: 4.50 },
        'home_under25': { min: 1.10, max: 3.50, default: 1.30 },
        'away_over05': { min: 1.20, max: 2.50, default: 1.60 },
        'away_under05': { min: 1.80, max: 4.50, default: 2.20 },
        'away_over15': { min: 1.80, max: 4.00, default: 2.50 },
        'away_under15': { min: 1.20, max: 3.00, default: 1.50 },
        'away_over25': { min: 3.00, max: 8.00, default: 4.50 },
        'away_under25': { min: 1.10, max: 3.50, default: 1.30 }
    },
    
    // Corners Over/Under
    corners: {
        'corners_over85': { min: 1.50, max: 3.00, default: 1.80 },
        'corners_under85': { min: 1.40, max: 2.80, default: 1.90 },
        'corners_over95': { min: 1.80, max: 4.00, default: 2.20 },
        'corners_under95': { min: 1.20, max: 3.50, default: 1.60 },
        'corners_over105': { min: 2.00, max: 5.00, default: 2.50 },
        'corners_under105': { min: 1.10, max: 3.00, default: 1.50 },
        'corners_over115': { min: 2.50, max: 6.50, default: 3.00 },
        'corners_under115': { min: 1.05, max: 2.80, default: 1.40 },
        'corners_over125': { min: 3.00, max: 8.00, default: 3.50 },
        'corners_under125': { min: 1.02, max: 2.50, default: 1.30 }
    },
    
    // Corners Team Totals
    corners_team: {
        'home_corners_over45': { min: 1.60, max: 3.50, default: 1.90 },
        'home_corners_under45': { min: 1.30, max: 2.80, default: 1.80 },
        'home_corners_over55': { min: 1.90, max: 4.50, default: 2.50 },
        'home_corners_under55': { min: 1.10, max: 3.00, default: 1.50 },
        'away_corners_over45': { min: 1.60, max: 3.50, default: 1.90 },
        'away_corners_under45': { min: 1.30, max: 2.80, default: 1.80 },
        'away_corners_over55': { min: 1.90, max: 4.50, default: 2.50 },
        'away_corners_under55': { min: 1.10, max: 3.00, default: 1.50 }
    },
    
    // Corners Race To
    corners_race: {
        'first_corner_home': { min: 1.80, max: 3.00, default: 2.00 },
        'first_corner_away': { min: 1.80, max: 3.00, default: 2.00 },
        'first_corner_draw': { min: 10.00, max: 20.00, default: 15.00 },
        'race_to_3_home': { min: 1.80, max: 4.00, default: 2.10 },
        'race_to_3_away': { min: 1.80, max: 4.00, default: 2.10 },
        'race_to_5_home': { min: 2.00, max: 5.00, default: 2.50 },
        'race_to_5_away': { min: 2.00, max: 5.00, default: 2.50 },
        'race_to_7_home': { min: 2.50, max: 7.00, default: 3.00 },
        'race_to_7_away': { min: 2.50, max: 7.00, default: 3.00 }
    },
    
    // Yellow Cards
    yellow_cards: {
        'yellow_cards_over35': { min: 1.50, max: 3.00, default: 1.80 },
        'yellow_cards_under35': { min: 1.40, max: 2.80, default: 1.90 },
        'yellow_cards_over45': { min: 1.80, max: 4.00, default: 2.20 },
        'yellow_cards_under45': { min: 1.20, max: 3.50, default: 1.60 },
        'yellow_cards_over55': { min: 2.00, max: 5.50, default: 2.80 },
        'yellow_cards_under55': { min: 1.10, max: 3.00, default: 1.40 },
        'yellow_cards_over65': { min: 2.50, max: 7.00, default: 3.20 },
        'yellow_cards_under65': { min: 1.05, max: 2.80, default: 1.30 },
        'first_yellow_home': { min: 1.80, max: 3.00, default: 2.00 },
        'first_yellow_away': { min: 1.80, max: 3.00, default: 2.00 }
    },
    
    // Red Cards
    red_cards: {
        'red_card_yes': { min: 2.50, max: 8.00, default: 4.00 },
        'red_card_no': { min: 1.10, max: 2.50, default: 1.20 },
        'red_card_home_yes': { min: 4.00, max: 12.00, default: 6.00 },
        'red_card_away_yes': { min: 4.00, max: 12.00, default: 6.00 },
        'red_card_2_yes': { min: 8.00, max: 25.00, default: 12.00 },
        'straight_red_yes': { min: 3.00, max: 10.00, default: 5.00 },
        'second_yellow_yes': { min: 3.50, max: 11.00, default: 5.50 }
    },
    
    // Cards Team Totals
    cards_team: {
        'home_yellows_over25': { min: 1.60, max: 3.50, default: 2.00 },
        'home_yellows_under25': { min: 1.30, max: 2.80, default: 1.70 },
        'away_yellows_over25': { min: 1.60, max: 3.50, default: 2.00 },
        'away_yellows_under25': { min: 1.30, max: 2.80, default: 1.70 }
    },
    
    // Substitutions
    substitutions: {
        'subs_over25': { min: 1.40, max: 2.50, default: 1.70 },
        'subs_under25': { min: 1.50, max: 3.00, default: 2.00 },
        'subs_over35': { min: 1.60, max: 3.20, default: 1.90 },
        'subs_under35': { min: 1.30, max: 2.80, default: 1.80 },
        'subs_over45': { min: 1.80, max: 4.00, default: 2.20 },
        'subs_under45': { min: 1.20, max: 3.50, default: 1.60 },
        'first_sub_home': { min: 1.80, max: 3.00, default: 2.00 },
        'first_sub_away': { min: 1.80, max: 3.00, default: 2.00 },
        'home_subs_over15': { min: 1.50, max: 3.00, default: 1.80 },
        'away_subs_over15': { min: 1.50, max: 3.00, default: 1.80 },
        'home_subs_over25': { min: 2.00, max: 5.00, default: 2.50 },
        'away_subs_over25': { min: 2.00, max: 5.00, default: 2.50 }
    },
    
    // Free Kicks
    free_kicks: {
        'free_kicks_over25': { min: 1.30, max: 2.50, default: 1.60 },
        'free_kicks_under25': { min: 1.50, max: 3.20, default: 2.00 },
        'free_kicks_over35': { min: 1.50, max: 3.00, default: 1.80 },
        'free_kicks_under35': { min: 1.30, max: 2.80, default: 1.90 },
        'free_kicks_over45': { min: 1.70, max: 3.50, default: 2.00 },
        'free_kicks_under45': { min: 1.20, max: 3.00, default: 1.70 },
        'free_kicks_over55': { min: 2.00, max: 4.50, default: 2.50 },
        'free_kicks_under55': { min: 1.10, max: 2.80, default: 1.50 },
        'first_free_kick_home': { min: 1.80, max: 3.00, default: 2.00 },
        'first_free_kick_away': { min: 1.80, max: 3.00, default: 2.00 }
    },
    
    // Penalties
    penalties: {
        'penalty_yes': { min: 2.50, max: 8.00, default: 4.00 },
        'penalty_no': { min: 1.10, max: 2.50, default: 1.20 },
        'penalty_scored_yes': { min: 1.20, max: 3.00, default: 1.50 },
        'penalty_missed_yes': { min: 3.00, max: 10.00, default: 5.00 },
        'penalty_home_yes': { min: 4.00, max: 12.00, default: 6.00 },
        'penalty_away_yes': { min: 4.00, max: 12.00, default: 6.00 },
        'penalty_shootout_yes': { min: 3.00, max: 10.00, default: 5.00 },
        'penalty_shootout_no': { min: 1.05, max: 2.00, default: 1.10 }
    },
    
    // Half Time (1H)
    half_time: {
        'ht_home': { min: 2.00, max: 8.00, default: 2.50 },
        'ht_draw': { min: 1.60, max: 4.00, default: 2.00 },
        'ht_away': { min: 2.00, max: 8.00, default: 2.50 },
        'ht_over05': { min: 1.30, max: 2.50, default: 1.60 },
        'ht_under05': { min: 1.80, max: 4.50, default: 2.20 },
        'ht_over15': { min: 1.80, max: 4.00, default: 2.30 },
        'ht_under15': { min: 1.20, max: 3.00, default: 1.60 },
        'ht_over25': { min: 3.00, max: 8.00, default: 4.00 },
        'ht_under25': { min: 1.10, max: 3.50, default: 1.30 },
        'ht_btts_yes': { min: 2.50, max: 6.00, default: 3.50 },
        'ht_btts_no': { min: 1.20, max: 3.00, default: 1.60 }
    },
    
    // Second Half (2H)
    second_half: {
        '2h_home': { min: 2.00, max: 8.00, default: 2.50 },
        '2h_draw': { min: 1.60, max: 4.00, default: 2.00 },
        '2h_away': { min: 2.00, max: 8.00, default: 2.50 },
        '2h_over05': { min: 1.30, max: 2.50, default: 1.60 },
        '2h_under05': { min: 1.80, max: 4.50, default: 2.20 },
        '2h_over15': { min: 1.80, max: 4.00, default: 2.30 },
        '2h_under15': { min: 1.20, max: 3.00, default: 1.60 },
        '2h_btts_yes': { min: 2.50, max: 6.00, default: 3.50 },
        '2h_btts_no': { min: 1.20, max: 3.00, default: 1.60 }
    },
    
    // HT/FT Combinations
    ht_ft: {
        'ht_ft_home_home': { min: 1.50, max: 8.00, default: 2.00 },
        'ht_ft_home_draw': { min: 4.00, max: 15.00, default: 6.00 },
        'ht_ft_home_away': { min: 10.00, max: 30.00, default: 15.00 },
        'ht_ft_draw_draw': { min: 2.50, max: 8.00, default: 4.00 },
        'ht_ft_draw_home': { min: 2.00, max: 10.00, default: 3.50 },
        'ht_ft_draw_away': { min: 2.00, max: 10.00, default: 3.50 },
        'ht_ft_away_away': { min: 1.50, max: 8.00, default: 2.00 },
        'ht_ft_away_draw': { min: 4.00, max: 15.00, default: 6.00 },
        'ht_ft_away_home': { min: 10.00, max: 30.00, default: 15.00 }
    },
    
    // Goal Minute Ranges
    goal_minutes: {
        'first_goal_0_15': { min: 3.00, max: 8.00, default: 4.00 },
        'first_goal_16_30': { min: 3.50, max: 9.00, default: 4.50 },
        'first_goal_31_45': { min: 4.00, max: 10.00, default: 5.00 },
        'first_goal_46_60': { min: 4.50, max: 12.00, default: 6.00 },
        'first_goal_61_75': { min: 5.00, max: 14.00, default: 7.00 },
        'first_goal_76_90': { min: 6.00, max: 16.00, default: 8.00 },
        'no_first_goal': { min: 8.00, max: 20.00, default: 12.00 },
        'goal_0_15_yes': { min: 2.50, max: 6.00, default: 3.00 },
        'goal_16_30_yes': { min: 2.80, max: 6.50, default: 3.20 },
        'goal_31_45_yes': { min: 2.00, max: 5.50, default: 2.80 },
        'goal_46_60_yes': { min: 2.50, max: 6.00, default: 3.00 },
        'goal_61_75_yes': { min: 2.80, max: 6.50, default: 3.20 },
        'goal_76_90_yes': { min: 2.50, max: 6.00, default: 3.00 }
    },
    
    // Goal Scorer Markets
    goal_scorer: {
        'anytime_goal_home_striker': { min: 2.00, max: 6.00, default: 3.00 },
        'anytime_goal_away_striker': { min: 2.00, max: 6.00, default: 3.00 },
        'first_goal_home': { min: 1.80, max: 5.00, default: 2.50 },
        'first_goal_away': { min: 1.80, max: 5.00, default: 2.50 },
        'last_goal_home': { min: 1.80, max: 5.00, default: 2.50 },
        'last_goal_away': { min: 1.80, max: 5.00, default: 2.50 },
        'hat_trick_yes': { min: 8.00, max: 25.00, default: 12.00 },
        'hat_trick_no': { min: 1.02, max: 2.00, default: 1.05 },
        'brace_yes': { min: 4.00, max: 12.00, default: 6.00 },
        'brace_no': { min: 1.10, max: 3.00, default: 1.20 }
    },
    
    // Clean Sheets
    clean_sheets: {
        'home_clean_sheet_yes': { min: 1.50, max: 6.00, default: 2.50 },
        'home_clean_sheet_no': { min: 1.10, max: 3.00, default: 1.50 },
        'away_clean_sheet_yes': { min: 1.50, max: 6.00, default: 2.50 },
        'away_clean_sheet_no': { min: 1.10, max: 3.00, default: 1.50 }
    },
    
    // Exact Score
    exact_score: {
        'exact_score_1_0': { min: 5.00, max: 12.00, default: 7.00 },
        'exact_score_2_0': { min: 6.00, max: 15.00, default: 8.00 },
        'exact_score_2_1': { min: 7.00, max: 18.00, default: 9.00 },
        'exact_score_3_0': { min: 10.00, max: 25.00, default: 12.00 },
        'exact_score_3_1': { min: 12.00, max: 30.00, default: 15.00 },
        'exact_score_3_2': { min: 15.00, max: 35.00, default: 18.00 },
        'exact_score_4_0': { min: 20.00, max: 50.00, default: 25.00 },
        'exact_score_4_1': { min: 25.00, max: 60.00, default: 30.00 },
        'exact_score_0_0': { min: 7.00, max: 20.00, default: 10.00 },
        'exact_score_1_1': { min: 6.00, max: 15.00, default: 8.00 },
        'exact_score_2_2': { min: 12.00, max: 30.00, default: 15.00 },
        'exact_score_3_3': { min: 30.00, max: 80.00, default: 40.00 }
    },
    
    // Total Goals Exact
    total_goals: {
        'total_goals_0': { min: 8.00, max: 20.00, default: 10.00 },
        'total_goals_1': { min: 4.00, max: 10.00, default: 6.00 },
        'total_goals_2': { min: 3.50, max: 8.00, default: 5.00 },
        'total_goals_3': { min: 4.00, max: 9.00, default: 6.00 },
        'total_goals_4': { min: 5.00, max: 12.00, default: 7.00 },
        'total_goals_5': { min: 8.00, max: 18.00, default: 10.00 },
        'total_goals_6': { min: 12.00, max: 30.00, default: 15.00 },
        'total_goals_7plus': { min: 20.00, max: 50.00, default: 30.00 }
    },
    
    // Match Specials
    match_specials: {
        'win_to_nil_home': { min: 3.00, max: 10.00, default: 5.00 },
        'win_to_nil_away': { min: 3.00, max: 10.00, default: 5.00 },
        'both_half_win_home': { min: 5.00, max: 15.00, default: 8.00 },
        'both_half_win_away': { min: 5.00, max: 15.00, default: 8.00 },
        'comeback_win': { min: 6.00, max: 20.00, default: 10.00 },
        'lead_changed': { min: 2.50, max: 8.00, default: 4.00 },
        'lead_changed_3': { min: 8.00, max: 25.00, default: 12.00 },
        'draw_half_home_full': { min: 3.00, max: 12.00, default: 5.00 },
        'draw_half_away_full': { min: 3.00, max: 12.00, default: 5.00 }
    },
    
    // Player Specials
    player_specials: {
        'player_goal_anytime': { min: 1.50, max: 5.00, default: 2.50 },
        'player_goal_first': { min: 3.00, max: 8.00, default: 4.50 },
        'player_goal_last': { min: 3.00, max: 8.00, default: 4.50 },
        'player_yellow': { min: 2.00, max: 6.00, default: 3.00 },
        'player_red': { min: 5.00, max: 20.00, default: 8.00 },
        'player_assist': { min: 2.50, max: 7.00, default: 4.00 },
        'player_shot_on_target': { min: 1.80, max: 5.00, default: 2.80 }
    }
};

// ===== BET CATEGORIES CONFIGURATION =====
const BET_CATEGORIES = {
    'Match Winner': {
        icon: '🏆',
        bets: ['home', 'draw', 'away']
    },
    'Double Chance': {
        icon: '🎯',
        bets: ['1X', '12', 'X2']
    },
    'Draw No Bet': {
        icon: '↩️',
        bets: ['home_dnb', 'away_dnb']
    },
    'Asian Handicap': {
        icon: '⚖️',
        bets: ['ah_home_-0.5', 'ah_away_+0.5', 'ah_home_-1', 'ah_away_+1', 'ah_home_-1.5', 'ah_away_+1.5', 'ah_home_-2', 'ah_away_+2', 'ah_home_-2.5', 'ah_away_+2.5']
    },
    'Goals Over/Under': {
        icon: '⚽',
        bets: ['over05', 'under05', 'over15', 'under15', 'over25', 'under25', 'over35', 'under35', 'over45', 'under45', 'over55', 'under55', 'over65', 'under65']
    },
    'Both Teams to Score': {
        icon: '🔄',
        bets: ['btts_yes', 'btts_no', 'btts_yes_1st_half', 'btts_no_1st_half', 'btts_yes_2nd_half', 'btts_no_2nd_half']
    },
    'Team Totals': {
        icon: '📊',
        bets: ['home_over05', 'home_under05', 'home_over15', 'home_under15', 'home_over25', 'home_under25', 'away_over05', 'away_under05', 'away_over15', 'away_under15', 'away_over25', 'away_under25']
    },
    'Corners Over/Under': {
        icon: '🔄',
        bets: ['corners_over85', 'corners_under85', 'corners_over95', 'corners_under95', 'corners_over105', 'corners_under105', 'corners_over115', 'corners_under115', 'corners_over125', 'corners_under125']
    },
    'Corners Team Totals': {
        icon: '🏁',
        bets: ['home_corners_over45', 'home_corners_under45', 'home_corners_over55', 'home_corners_under55', 'away_corners_over45', 'away_corners_under45', 'away_corners_over55', 'away_corners_under55']
    },
    'Corners Race To': {
        icon: '🏃',
        bets: ['first_corner_home', 'first_corner_away', 'first_corner_draw', 'race_to_3_home', 'race_to_3_away', 'race_to_5_home', 'race_to_5_away', 'race_to_7_home', 'race_to_7_away']
    },
    'Yellow Cards': {
        icon: '🟨',
        bets: ['yellow_cards_over35', 'yellow_cards_under35', 'yellow_cards_over45', 'yellow_cards_under45', 'yellow_cards_over55', 'yellow_cards_under55', 'yellow_cards_over65', 'yellow_cards_under65', 'first_yellow_home', 'first_yellow_away']
    },
    'Red Cards': {
        icon: '🟥',
        bets: ['red_card_yes', 'red_card_no', 'red_card_home_yes', 'red_card_away_yes', 'red_card_2_yes', 'straight_red_yes', 'second_yellow_yes']
    },
    'Cards Team Totals': {
        icon: '📋',
        bets: ['home_yellows_over25', 'home_yellows_under25', 'away_yellows_over25', 'away_yellows_under25']
    },
    'Substitutions': {
        icon: '🔄',
        bets: ['subs_over25', 'subs_under25', 'subs_over35', 'subs_under35', 'subs_over45', 'subs_under45', 'first_sub_home', 'first_sub_away', 'home_subs_over15', 'away_subs_over15', 'home_subs_over25', 'away_subs_over25']
    },
    'Free Kicks': {
        icon: '⚡',
        bets: ['free_kicks_over25', 'free_kicks_under25', 'free_kicks_over35', 'free_kicks_under35', 'free_kicks_over45', 'free_kicks_under45', 'free_kicks_over55', 'free_kicks_under55', 'first_free_kick_home', 'first_free_kick_away']
    },
    'Penalties': {
        icon: '⚪',
        bets: ['penalty_yes', 'penalty_no', 'penalty_scored_yes', 'penalty_missed_yes', 'penalty_home_yes', 'penalty_away_yes', 'penalty_shootout_yes', 'penalty_shootout_no']
    },
    'Half Time (1H)': {
        icon: '⏰',
        bets: ['ht_home', 'ht_draw', 'ht_away', 'ht_over05', 'ht_under05', 'ht_over15', 'ht_under15', 'ht_over25', 'ht_under25', 'ht_btts_yes', 'ht_btts_no']
    },
    'Second Half (2H)': {
        icon: '⏳',
        bets: ['2h_home', '2h_draw', '2h_away', '2h_over05', '2h_under05', '2h_over15', '2h_under15', '2h_btts_yes', '2h_btts_no']
    },
    'HT/FT Combinations': {
        icon: '📈',
        bets: ['ht_ft_home_home', 'ht_ft_home_draw', 'ht_ft_home_away', 'ht_ft_draw_draw', 'ht_ft_draw_home', 'ht_ft_draw_away', 'ht_ft_away_away', 'ht_ft_away_draw', 'ht_ft_away_home']
    },
    'Goal Minute Ranges': {
        icon: '⏱️',
        bets: ['first_goal_0_15', 'first_goal_16_30', 'first_goal_31_45', 'first_goal_46_60', 'first_goal_61_75', 'first_goal_76_90', 'no_first_goal', 'goal_0_15_yes', 'goal_16_30_yes', 'goal_31_45_yes', 'goal_46_60_yes', 'goal_61_75_yes', 'goal_76_90_yes']
    },
    'Goal Scorer Markets': {
        icon: '⚽',
        bets: ['anytime_goal_home_striker', 'anytime_goal_away_striker', 'first_goal_home', 'first_goal_away', 'last_goal_home', 'last_goal_away', 'hat_trick_yes', 'hat_trick_no', 'brace_yes', 'brace_no']
    },
    'Clean Sheets': {
        icon: '🧤',
        bets: ['home_clean_sheet_yes', 'home_clean_sheet_no', 'away_clean_sheet_yes', 'away_clean_sheet_no']
    },
    'Exact Score': {
        icon: '🎯',
        bets: ['exact_score_1_0', 'exact_score_2_0', 'exact_score_2_1', 'exact_score_3_0', 'exact_score_3_1', 'exact_score_3_2', 'exact_score_4_0', 'exact_score_4_1', 'exact_score_0_0', 'exact_score_1_1', 'exact_score_2_2', 'exact_score_3_3']
    },
    'Total Goals Exact': {
        icon: '📊',
        bets: ['total_goals_0', 'total_goals_1', 'total_goals_2', 'total_goals_3', 'total_goals_4', 'total_goals_5', 'total_goals_6', 'total_goals_7plus']
    },
    'Match Specials': {
        icon: '⭐',
        bets: ['win_to_nil_home', 'win_to_nil_away', 'both_half_win_home', 'both_half_win_away', 'comeback_win', 'lead_changed', 'lead_changed_3', 'draw_half_home_full', 'draw_half_away_full']
    }
};

// ===== BET TYPE DISPLAY NAMES =====
const BET_DISPLAY_NAMES = {
    // Match Winner
    'home': 'Home Win',
    'draw': 'Draw',
    'away': 'Away Win',
    
    // Double Chance
    '1X': 'Home or Draw',
    '12': 'Home or Away',
    'X2': 'Draw or Away',
    
    // Draw No Bet
    'home_dnb': 'Home DNB',
    'away_dnb': 'Away DNB',
    
    // Asian Handicap
    'ah_home_-0.5': 'Home -0.5',
    'ah_away_+0.5': 'Away +0.5',
    'ah_home_-1': 'Home -1',
    'ah_away_+1': 'Away +1',
    'ah_home_-1.5': 'Home -1.5',
    'ah_away_+1.5': 'Away +1.5',
    'ah_home_-2': 'Home -2',
    'ah_away_+2': 'Away +2',
    'ah_home_-2.5': 'Home -2.5',
    'ah_away_+2.5': 'Away +2.5',
    
    // Goals
    'over05': 'Over 0.5',
    'under05': 'Under 0.5',
    'over15': 'Over 1.5',
    'under15': 'Under 1.5',
    'over25': 'Over 2.5',
    'under25': 'Under 2.5',
    'over35': 'Over 3.5',
    'under35': 'Under 3.5',
    'over45': 'Over 4.5',
    'under45': 'Under 4.5',
    'over55': 'Over 5.5',
    'under55': 'Under 5.5',
    'over65': 'Over 6.5',
    'under65': 'Under 6.5',
    
    // BTTS
    'btts_yes': 'BTTS Yes',
    'btts_no': 'BTTS No',
    'btts_yes_1st_half': 'BTTS Yes 1H',
    'btts_no_1st_half': 'BTTS No 1H',
    'btts_yes_2nd_half': 'BTTS Yes 2H',
    'btts_no_2nd_half': 'BTTS No 2H',
    
    // Team Totals
    'home_over05': 'Home Over 0.5',
    'home_under05': 'Home Under 0.5',
    'home_over15': 'Home Over 1.5',
    'home_under15': 'Home Under 1.5',
    'home_over25': 'Home Over 2.5',
    'home_under25': 'Home Under 2.5',
    'away_over05': 'Away Over 0.5',
    'away_under05': 'Away Under 0.5',
    'away_over15': 'Away Over 1.5',
    'away_under15': 'Away Under 1.5',
    'away_over25': 'Away Over 2.5',
    'away_under25': 'Away Under 2.5',
    
    // Corners
    'corners_over85': 'Corners Over 8.5',
    'corners_under85': 'Corners Under 8.5',
    'corners_over95': 'Corners Over 9.5',
    'corners_under95': 'Corners Under 9.5',
    'corners_over105': 'Corners Over 10.5',
    'corners_under105': 'Corners Under 10.5',
    'corners_over115': 'Corners Over 11.5',
    'corners_under115': 'Corners Under 11.5',
    'corners_over125': 'Corners Over 12.5',
    'corners_under125': 'Corners Under 12.5',
    
    // Corners Team
    'home_corners_over45': 'Home Corners Over 4.5',
    'home_corners_under45': 'Home Corners Under 4.5',
    'home_corners_over55': 'Home Corners Over 5.5',
    'home_corners_under55': 'Home Corners Under 5.5',
    'away_corners_over45': 'Away Corners Over 4.5',
    'away_corners_under45': 'Away Corners Under 4.5',
    'away_corners_over55': 'Away Corners Over 5.5',
    'away_corners_under55': 'Away Corners Under 5.5',
    
    // Corners Race
    'first_corner_home': 'First Corner Home',
    'first_corner_away': 'First Corner Away',
    'first_corner_draw': 'No Corner',
    'race_to_3_home': 'Race to 3 Corners Home',
    'race_to_3_away': 'Race to 3 Corners Away',
    'race_to_5_home': 'Race to 5 Corners Home',
    'race_to_5_away': 'Race to 5 Corners Away',
    'race_to_7_home': 'Race to 7 Corners Home',
    'race_to_7_away': 'Race to 7 Corners Away',
    
    // Yellow Cards
    'yellow_cards_over35': 'Yellow Cards Over 3.5',
    'yellow_cards_under35': 'Yellow Cards Under 3.5',
    'yellow_cards_over45': 'Yellow Cards Over 4.5',
    'yellow_cards_under45': 'Yellow Cards Under 4.5',
    'yellow_cards_over55': 'Yellow Cards Over 5.5',
    'yellow_cards_under55': 'Yellow Cards Under 5.5',
    'yellow_cards_over65': 'Yellow Cards Over 6.5',
    'yellow_cards_under65': 'Yellow Cards Under 6.5',
    'first_yellow_home': 'First Yellow Home',
    'first_yellow_away': 'First Yellow Away',
    
    // Red Cards
    'red_card_yes': 'Red Card Shown',
    'red_card_no': 'No Red Card',
    'red_card_home_yes': 'Home Red Card',
    'red_card_away_yes': 'Away Red Card',
    'red_card_2_yes': '2+ Red Cards',
    'straight_red_yes': 'Straight Red Card',
    'second_yellow_yes': 'Second Yellow-Red',
    
    // Cards Team
    'home_yellows_over25': 'Home Yellows Over 2.5',
    'home_yellows_under25': 'Home Yellows Under 2.5',
    'away_yellows_over25': 'Away Yellows Over 2.5',
    'away_yellows_under25': 'Away Yellows Under 2.5',
    
    // Substitutions
    'subs_over25': 'Subs Over 2.5',
    'subs_under25': 'Subs Under 2.5',
    'subs_over35': 'Subs Over 3.5',
    'subs_under35': 'Subs Under 3.5',
    'subs_over45': 'Subs Over 4.5',
    'subs_under45': 'Subs Under 4.5',
    'first_sub_home': 'First Sub Home',
    'first_sub_away': 'First Sub Away',
    'home_subs_over15': 'Home Subs Over 1.5',
    'away_subs_over15': 'Away Subs Over 1.5',
    'home_subs_over25': 'Home Subs Over 2.5',
    'away_subs_over25': 'Away Subs Over 2.5',
    
    // Free Kicks
    'free_kicks_over25': 'Free Kicks Over 2.5',
    'free_kicks_under25': 'Free Kicks Under 2.5',
    'free_kicks_over35': 'Free Kicks Over 3.5',
    'free_kicks_under35': 'Free Kicks Under 3.5',
    'free_kicks_over45': 'Free Kicks Over 4.5',
    'free_kicks_under45': 'Free Kicks Under 4.5',
    'free_kicks_over55': 'Free Kicks Over 5.5',
    'free_kicks_under55': 'Free Kicks Under 5.5',
    'first_free_kick_home': 'First Free Kick Home',
    'first_free_kick_away': 'First Free Kick Away',
    
    // Penalties
    'penalty_yes': 'Penalty Awarded',
    'penalty_no': 'No Penalty',
    'penalty_scored_yes': 'Penalty Scored',
    'penalty_missed_yes': 'Penalty Missed',
    'penalty_home_yes': 'Home Penalty',
    'penalty_away_yes': 'Away Penalty',
    'penalty_shootout_yes': 'Penalty Shootout',
    'penalty_shootout_no': 'No Shootout',
    
    // Half Time
    'ht_home': 'HT Home Win',
    'ht_draw': 'HT Draw',
    'ht_away': 'HT Away Win',
    'ht_over05': 'HT Over 0.5',
    'ht_under05': 'HT Under 0.5',
    'ht_over15': 'HT Over 1.5',
    'ht_under15': 'HT Under 1.5',
    'ht_over25': 'HT Over 2.5',
    'ht_under25': 'HT Under 2.5',
    'ht_btts_yes': 'HT BTTS Yes',
    'ht_btts_no': 'HT BTTS No',
    
    // Second Half
    '2h_home': '2H Home Win',
    '2h_draw': '2H Draw',
    '2h_away': '2H Away Win',
    '2h_over05': '2H Over 0.5',
    '2h_under05': '2H Under 0.5',
    '2h_over15': '2H Over 1.5',
    '2h_under15': '2H Under 1.5',
    '2h_btts_yes': '2H BTTS Yes',
    '2h_btts_no': '2H BTTS No',
    
    // HT/FT
    'ht_ft_home_home': 'HT Home / FT Home',
    'ht_ft_home_draw': 'HT Home / FT Draw',
    'ht_ft_home_away': 'HT Home / FT Away',
    'ht_ft_draw_draw': 'HT Draw / FT Draw',
    'ht_ft_draw_home': 'HT Draw / FT Home',
    'ht_ft_draw_away': 'HT Draw / FT Away',
    'ht_ft_away_away': 'HT Away / FT Away',
    'ht_ft_away_draw': 'HT Away / FT Draw',
    'ht_ft_away_home': 'HT Away / FT Home',
    
    // Goal Minutes
    'first_goal_0_15': 'Goal 0-15 min',
    'first_goal_16_30': 'Goal 16-30 min',
    'first_goal_31_45': 'Goal 31-45 min',
    'first_goal_46_60': 'Goal 46-60 min',
    'first_goal_61_75': 'Goal 61-75 min',
    'first_goal_76_90': 'Goal 76-90 min',
    'no_first_goal': 'No Goal (0-0)',
    'goal_0_15_yes': 'Goal in 0-15 min',
    'goal_16_30_yes': 'Goal in 16-30 min',
    'goal_31_45_yes': 'Goal in 31-45 min',
    'goal_46_60_yes': 'Goal in 46-60 min',
    'goal_61_75_yes': 'Goal in 61-75 min',
    'goal_76_90_yes': 'Goal in 76-90 min',
    
    // Goal Scorer
    'anytime_goal_home_striker': 'Anytime Home Striker',
    'anytime_goal_away_striker': 'Anytime Away Striker',
    'first_goal_home': 'First Goal Home',
    'first_goal_away': 'First Goal Away',
    'last_goal_home': 'Last Goal Home',
    'last_goal_away': 'Last Goal Away',
    'hat_trick_yes': 'Hat-trick Scored',
    'hat_trick_no': 'No Hat-trick',
    'brace_yes': 'Brace Scored',
    'brace_no': 'No Brace',
    
    // Clean Sheets
    'home_clean_sheet_yes': 'Home Clean Sheet',
    'home_clean_sheet_no': 'Home No Clean Sheet',
    'away_clean_sheet_yes': 'Away Clean Sheet',
    'away_clean_sheet_no': 'Away No Clean Sheet',
    
    // Exact Score
    'exact_score_1_0': '1-0',
    'exact_score_2_0': '2-0',
    'exact_score_2_1': '2-1',
    'exact_score_3_0': '3-0',
    'exact_score_3_1': '3-1',
    'exact_score_3_2': '3-2',
    'exact_score_4_0': '4-0',
    'exact_score_4_1': '4-1',
    'exact_score_0_0': '0-0',
    'exact_score_1_1': '1-1',
    'exact_score_2_2': '2-2',
    'exact_score_3_3': '3-3',
    
    // Total Goals
    'total_goals_0': '0 Goals',
    'total_goals_1': '1 Goal',
    'total_goals_2': '2 Goals',
    'total_goals_3': '3 Goals',
    'total_goals_4': '4 Goals',
    'total_goals_5': '5 Goals',
    'total_goals_6': '6 Goals',
    'total_goals_7plus': '7+ Goals',
    
    // Match Specials
    'win_to_nil_home': 'Home Win to Nil',
    'win_to_nil_away': 'Away Win to Nil',
    'both_half_win_home': 'Both Halves Home',
    'both_half_win_away': 'Both Halves Away',
    'comeback_win': 'Comeback Win',
    'lead_changed': 'Lead Changed',
    'lead_changed_3': 'Lead Changed 3+',
    'draw_half_home_full': 'Draw HT / Home FT',
    'draw_half_away_full': 'Draw HT / Away FT'
};

// ===== ENHANCED BETTING ENGINE =====
const EnhancedBettingEngine = {
    currentMatch: null,
    selectedBet: null,
    selectedCategory: null,
    betAmount: 0,
    isProcessing: false,
    updateInterval: null,
    betSlip: [],
    accumulatorBets: [],
    isAccumulatorMode: false,
    
    // Initialize
    async init() {
        console.log('🎰 Enhanced Betting Engine v5.0 Initializing...');
        console.log(`📊 Loaded ${Object.keys(BET_CATEGORIES).length} categories`);
        console.log(`🎯 Total bet types: ${Object.keys(BET_DISPLAY_NAMES).length}`);
        
        const user = this.getCurrentUser();
        if (!user) {
            console.log('Waiting for authentication...');
            this.waitForAuth();
        } else {
            await this.loadUserData();
        }
        
        this.startAutoRefresh();
        this.setupEventListeners();
        this.renderCategoryTabs();
        
        console.log('✅ Enhanced Betting Engine Active');
    },
    
    // Get current user
    getCurrentUser() {
        if (typeof firebase !== 'undefined' && firebase.auth) {
            const user = firebase.auth().currentUser;
            if (user) return { uid: user.uid, email: user.email, displayName: user.displayName };
        }
        const stored = localStorage.getItem('xbet_user');
        if (stored) {
            try { return JSON.parse(stored); } catch(e) {}
        }
        return null;
    },
    
    // Wait for auth
    waitForAuth() {
        const checkAuth = setInterval(() => {
            const user = this.getCurrentUser();
            if (user) {
                clearInterval(checkAuth);
                this.loadUserData();
            }
        }, 1000);
        setTimeout(() => clearInterval(checkAuth), 30000);
    },
    
    // Load user data
    async loadUserData() {
        const user = this.getCurrentUser();
        if (!user) return;
        console.log(`👤 User: ${user.email || user.uid}`);
        await this.updateBalance();
        await this.loadBetHistory();
        await this.loadActiveBets();
    },
    
    // Update balance
    async updateBalance() {
        try {
            const user = this.getCurrentUser();
            if (!user) return 0;
            if (window.WalletManager) {
                const balance = await window.WalletManager.getBalance(user.uid);
                this.updateBalanceDisplay(balance);
                return balance;
            }
            return 0;
        } catch(e) {
            console.error('Error updating balance:', e);
            return 0;
        }
    },
    
    // Update balance display
    updateBalanceDisplay(balance) {
        document.querySelectorAll('.user-balance, .wallet-balance, #balance').forEach(el => {
            el.textContent = `$${balance.toFixed(2)}`;
        });
        window.dispatchEvent(new CustomEvent('balanceUpdated', { detail: { balance } }));
    },
    
    // Render category tabs
    renderCategoryTabs() {
        const container = document.getElementById('category-tabs');
        if (!container) return;
        
        container.innerHTML = Object.keys(BET_CATEGORIES).map((category, index) => `
            <button class="category-tab ${index === 0 ? 'active' : ''}" 
                    data-category="${category}"
                    onclick="EnhancedBettingEngine.selectCategory('${category}')">
                ${BET_CATEGORIES[category].icon} ${category}
            </button>
        `).join('');
        
        // Select first category by default
        const firstCategory = Object.keys(BET_CATEGORIES)[0];
        if (firstCategory) {
            this.selectCategory(firstCategory);
        }
    },
    
    // Select category
    selectCategory(category) {
        this.selectedCategory = category;
        
        // Update tabs
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.category === category);
        });
        
        // Render bets for this category
        this.renderBetsForCategory(category);
    },
    
    // Render bets for category
    renderBetsForCategory(category) {
        const container = document.getElementById('bets-container');
        if (!container) return;
        
        const bets = BET_CATEGORIES[category]?.bets || [];
        
        if (bets.length === 0) {
            container.innerHTML = '<div class="no-bets">No bets available in this category</div>';
            return;
        }
        
        container.innerHTML = `
            <div class="bets-grid">
                ${bets.map(betType => {
                    const config = this.getBetConfig(betType);
                    const displayName = BET_DISPLAY_NAMES[betType] || betType;
                    return `
                        <button class="bet-option" 
                                data-bet-type="${betType}"
                                onclick="EnhancedBettingEngine.selectBet('${betType}')">
                            <div class="bet-name">${displayName}</div>
                            <div class="bet-odds">${config?.default || 'N/A'}</div>
                        </button>
                    `;
                }).join('')}
            </div>
        `;
    },
    
    // Get bet config
    getBetConfig(betType) {
        for (const category of Object.values(ODDS_CONFIG)) {
            if (category[betType]) {
                return category[betType];
            }
        }
        return null;
    },
    
    // Select bet
    selectBet(betType) {
        const config = this.getBetConfig(betType);
        if (!config) {
            this.showNotification('Bet type not configured', 'error');
            return;
        }
        
        this.selectedBet = {
            type: betType,
            odds: config.default,
            min: config.min,
            max: config.max
        };
        
        // Update UI
        document.querySelectorAll('.bet-option').forEach(el => {
            el.classList.toggle('selected', el.dataset.betType === betType);
        });
        
        // Enable amount input
        const amountInput = document.getElementById('bet-amount');
        if (amountInput) {
            amountInput.disabled = false;
            amountInput.focus();
        }
        
        this.updatePotentialWin();
        this.showBetDetails(betType);
    },
    
    // Show bet details
    showBetDetails(betType) {
        const container = document.getElementById('bet-details');
        if (!container) return;
        
        const config = this.getBetConfig(betType);
        const displayName = BET_DISPLAY_NAMES[betType] || betType;
        
        container.innerHTML = `
            <div class="bet-detail-card">
                <div class="bet-detail-name">${displayName}</div>
                <div class="bet-detail-odds">Odds: ${config?.default || 'N/A'}</div>
                <div class="bet-detail-range">
                    Range: ${config?.min || 'N/A'} - ${config?.max || 'N/A'}
                </div>
                <div class="bet-detail-category">Category: ${this.selectedCategory}</div>
            </div>
        `;
    },
    
    // Update potential win
    updatePotentialWin() {
        if (!this.selectedBet || this.betAmount <= 0) {
            document.getElementById('potential-win').textContent = '$0.00';
            return;
        }
        const potential = this.betAmount * this.selectedBet.odds;
        document.getElementById('potential-win').textContent = `$${potential.toFixed(2)}`;
        document.getElementById('place-bet-btn').disabled = false;
    },
    
    // Set bet amount
    setBetAmount(amount) {
        this.betAmount = parseFloat(amount) || 0;
        this.updatePotentialWin();
    },
    
    // Quick amount
    quickAmount(percentage) {
        this.updateBalance().then(balance => {
            const amount = balance * (percentage / 100);
            const amountInput = document.getElementById('bet-amount');
            if (amountInput) {
                amountInput.value = amount.toFixed(2);
                this.setBetAmount(amount);
            }
        });
    },
    
    // Place bet
    async placeBet() {
        if (this.isProcessing) {
            this.showNotification('Processing, please wait...', 'warning');
            return;
        }
        
        if (!this.currentMatch) {
            this.showNotification('No match selected', 'error');
            return;
        }
        
        if (!this.selectedBet) {
            this.showNotification('Please select a bet type', 'error');
            return;
        }
        
        if (this.betAmount <= 0) {
            this.showNotification('Please enter a valid amount', 'error');
            return;
        }
        
        const user = this.getCurrentUser();
        if (!user) {
            this.showNotification('Please login to place bets', 'error');
            return;
        }
        
        if (this.betAmount < 1) {
            this.showNotification('Minimum bet is $1.00', 'error');
            return;
        }
        
        this.isProcessing = true;
        this.showLoading(true);
        
        try {
            const balance = await this.updateBalance();
            if (balance < this.betAmount) {
                throw new Error('Insufficient balance');
            }
            
            // Check match
            const { data: match, error: matchError } = await supabaseClient
                .from('sports_matches')
                .select('status, bets_closed, elapsed')
                .eq('fixture_id', this.currentMatch.fixture_id)
                .single();
            
            if (matchError) throw new Error('Match not found');
            if (match.status !== 'live') throw new Error('Match is no longer live');
            if (match.bets_closed) throw new Error('Betting is closed for this match');
            
            // Place bet
            let bet;
            if (window.BetManager) {
                bet = await window.BetManager.placeBet({
                    fixture_id: this.currentMatch.fixture_id,
                    bet_type: this.selectedBet.type,
                    odds: this.selectedBet.odds,
                    amount: this.betAmount,
                    category: this.selectedCategory
                });
            } else {
                bet = {
                    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    user_id: user.uid,
                    fixture_id: this.currentMatch.fixture_id,
                    bet_type: this.selectedBet.type,
                    odds: this.selectedBet.odds,
                    amount: this.betAmount,
                    potential_win: this.betAmount * this.selectedBet.odds,
                    category: this.selectedCategory,
                    status: 'active',
                    placed_at: new Date().toISOString()
                };
                
                const { error } = await supabaseClient.from('bets').insert(bet);
                if (error) throw error;
            }
            
            await this.updateBalance();
            
            this.showNotification(
                `${BET_DISPLAY_NAMES[this.selectedBet.type]} @ ${this.selectedBet.odds} for $${this.betAmount.toFixed(2)}`,
                'success'
            );
            
            this.resetBetForm();
            await this.loadActiveBets();
            window.dispatchEvent(new CustomEvent('betPlaced', { detail: bet }));
            
        } catch(e) {
            console.error('Bet placement error:', e);
            this.showNotification(e.message, 'error');
        } finally {
            this.isProcessing = false;
            this.showLoading(false);
        }
    },
    
    // Reset bet form
    resetBetForm() {
        this.selectedBet = null;
        this.betAmount = 0;
        document.getElementById('bet-amount').value = '';
        document.getElementById('bet-amount').disabled = true;
        document.getElementById('potential-win').textContent = '$0.00';
        document.getElementById('place-bet-btn').disabled = true;
        document.querySelectorAll('.bet-option').forEach(el => el.classList.remove('selected'));
        document.getElementById('bet-details').innerHTML = '';
    },
    
    // Select match
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
            
            this.displayMatchDetails(match);
            
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
    
    // Display match details
    displayMatchDetails(match) {
        const container = document.getElementById('match-details');
        if (!container) return;
        
        container.innerHTML = `
            <div class="match-header">
                <div class="league-name">
                    <img src="${match.league_logo || ''}" class="league-logo" onerror="this.style.display='none'">
                    ${match.league_name}
                </div>
                <div class="match-status live">🔴 LIVE ${match.elapsed || 0}'</div>
            </div>
            <div class="match-teams">
                <div class="team home">
                    <img src="${match.home_team.logo}" class="team-logo" onerror="this.style.display='none'">
                    <span class="team-name">${match.home_team.name}</span>
                    <span class="team-score">${match.score.home}</span>
                </div>
                <div class="team-vs">VS</div>
                <div class="team away">
                    <img src="${match.away_team.logo}" class="team-logo" onerror="this.style.display='none'">
                    <span class="team-name">${match.away_team.name}</span>
                    <span class="team-score">${match.score.away}</span>
                </div>
            </div>
            <div class="match-time">Started: ${new Date(match.start_time).toLocaleTimeString()}</div>
        `;
    },
    
    // Load active bets
    async loadActiveBets() {
        const user = this.getCurrentUser();
        if (!user) return;
        
        try {
            let activeBets = [];
            if (window.BetManager) {
                activeBets = await window.BetManager.getActiveBets();
            } else {
                const { data, error } = await supabaseClient
                    .from('bets')
                    .select('*')
                    .eq('user_id', user.uid)
                    .eq('status', 'active')
                    .order('placed_at', { ascending: false });
                
                if (!error) activeBets = data || [];
            }
            
            this.displayActiveBets(activeBets);
        } catch(e) {
            console.error('Error loading active bets:', e);
        }
    },
    
    // Display active bets
    displayActiveBets(bets) {
        const container = document.getElementById('active-bets');
        if (!container) return;
        
        if (bets.length === 0) {
            container.innerHTML = '<div class="no-bets">No active bets</div>';
            return;
        }
        
        container.innerHTML = bets.map(bet => `
            <div class="bet-card active">
                <div class="bet-header">
                    <span class="bet-type">${BET_DISPLAY_NAMES[bet.bet_type] || bet.bet_type}</span>
                    <span class="bet-odds">@ ${bet.odds}</span>
                </div>
                <div class="bet-details">
                    <div class="bet-amount">$${bet.amount.toFixed(2)}</div>
                    <div class="bet-potential">Potential: $${(bet.amount * bet.odds).toFixed(2)}</div>
                </div>
                <div class="bet-status live">🔴 Live • ${new Date(bet.placed_at).toLocaleTimeString()}</div>
            </div>
        `).join('');
    },
    
    // Load bet history
    async loadBetHistory() {
        const user = this.getCurrentUser();
        if (!user) return;
        
        try {
            let history = [];
            if (window.BetManager) {
                history = await window.BetManager.getUserBetHistory(20);
            } else {
                const { data, error } = await supabaseClient
                    .from('bets')
                    .select('*')
                    .eq('user_id', user.uid)
                    .in('status', ['won', 'lost'])
                    .order('settled_at', { ascending: false })
                    .limit(20);
                
                if (!error) history = data || [];
            }
            
            this.displayBetHistory(history);
        } catch(e) {
            console.error('Error loading bet history:', e);
        }
    },
    
    // Display bet history
    displayBetHistory(bets) {
        const container = document.getElementById('bet-history');
        if (!container) return;
        
        if (bets.length === 0) {
            container.innerHTML = '<div class="no-history">No betting history</div>';
            return;
        }
        
        container.innerHTML = bets.map(bet => `
            <div class="history-item ${bet.status}">
                <div class="history-header">
                    <span class="history-type">${BET_DISPLAY_NAMES[bet.bet_type] || bet.bet_type}</span>
                    <span class="history-status ${bet.status}">${bet.status.toUpperCase()}</span>
                </div>
                <div class="history-details">
                    <span>$${bet.amount.toFixed(2)} @ ${bet.odds}</span>
                    ${bet.payout ? `<span class="history-payout">Won: $${bet.payout.toFixed(2)}</span>` : ''}
                </div>
                <div class="history-date">${new Date(bet.settled_at || bet.placed_at).toLocaleString()}</div>
            </div>
        `).join('');
    },
    
    // Show notification
    showNotification(message, type = 'info') {
        const container = document.getElementById('notification-container');
        if (!container) { alert(message); return; }
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span class="message">${message}</span>
            <button class="close">×</button>
        `;
        
        container.appendChild(notification);
        notification.querySelector('.close').addEventListener('click', () => notification.remove());
        
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    },
    
    // Show loading
    showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = show ? 'flex' : 'none';
    },
    
    // Start auto-refresh
    startAutoRefresh() {
        if (this.updateInterval) clearInterval(this.updateInterval);
        this.updateInterval = setInterval(() => {
            this.updateBalance();
            if (this.currentMatch) this.loadActiveBets();
        }, 10000);
    },
    
    // Setup event listeners
    setupEventListeners() {
        window.addEventListener('betsSettled', () => {
            this.updateBalance();
            this.loadActiveBets();
            this.loadBetHistory();
        });
        
        window.addEventListener('matchLive', (e) => {
            if (this.currentMatch && this.currentMatch.fixture_id === e.detail.fixture_id) {
                this.selectMatch(e.detail.fixture_id);
            }
        });
        
        if (typeof firebase !== 'undefined' && firebase.auth) {
            firebase.auth().onAuthStateChanged((user) => {
                if (user) this.loadUserData();
            });
        }
    }
};

// ===== HTML TEMPLATES =====
const EnhancedBettingUI = {
    render() {
        return `
            <div class="betting-engine enhanced">
                <!-- Balance -->
                <div class="balance-panel">
                    <div class="balance-label">Your Balance</div>
                    <div class="balance-amount" id="balance">$0.00</div>
                </div>
                
                <!-- Match Selection -->
                <div class="match-selection">
                    <h3>Live Matches</h3>
                    <div id="live-matches-list" class="matches-list"></div>
                </div>
                
                <!-- Match Details -->
                <div id="match-details" class="match-details"></div>
                
                <!-- Betting Categories -->
                <div class="betting-categories">
                    <h3>Bet Categories</h3>
                    <div id="category-tabs" class="category-tabs"></div>
                </div>
                
                <!-- Bets Container -->
                <div id="bets-container" class="bets-container"></div>
                
                <!-- Bet Details -->
                <div id="bet-details" class="bet-details"></div>
                
                <!-- Betting Slip -->
                <div class="betting-slip">
                    <div class="bet-amount-section">
                        <label>Bet Amount ($)</label>
                        <input type="number" id="bet-amount" placeholder="Enter amount" disabled step="0.01" min="1">
                        <div class="quick-amounts">
                            <button onclick="EnhancedBettingEngine.quickAmount(10)">10%</button>
                            <button onclick="EnhancedBettingEngine.quickAmount(25)">25%</button>
                            <button onclick="EnhancedBettingEngine.quickAmount(50)">50%</button>
                            <button onclick="EnhancedBettingEngine.quickAmount(100)">100%</button>
                        </div>
                    </div>
                    
                    <div class="potential-win">
                        <span>Potential Win:</span>
                        <strong id="potential-win">$0.00</strong>
                    </div>
                    
                    <button id="place-bet-btn" class="place-bet-btn" onclick="EnhancedBettingEngine.placeBet()" disabled>
                        Place Bet
                    </button>
                </div>
                
                <!-- Active Bets -->
                <div class="active-bets">
                    <h3>Active Bets</h3>
                    <div id="active-bets" class="bets-list"></div>
                </div>
                
                <!-- Bet History -->
                <div class="bet-history">
                    <h3>Bet History</h3>
                    <div id="bet-history" class="history-list"></div>
                </div>
                
                <!-- Notification Container -->
                <div id="notification-container" class="notification-container"></div>
                
                <!-- Loading Overlay -->
                <div id="loading-overlay" class="loading-overlay" style="display: none;">
                    <div class="spinner"></div>
                    <p>Processing...</p>
                </div>
            </div>
        `;
    },
    
    async loadLiveMatches() {
        const container = document.getElementById('live-matches-list');
        if (!container) return;
        
        try {
            let matches = [];
            if (window.sportsAPI) {
                matches = await window.sportsAPI.getLiveMatches();
            } else {
                const { data } = await supabaseClient
                    .from('sports_matches')
                    .select('*')
                    .eq('status', 'live')
                    .order('start_time', { ascending: true });
                matches = data || [];
            }
            
            if (matches.length === 0) {
                container.innerHTML = '<div class="no-matches">No live matches available</div>';
                return;
            }
            
            container.innerHTML = matches.map(match => `
                <div class="match-item ${EnhancedBettingEngine.currentMatch?.fixture_id === match.fixture_id ? 'selected' : ''}" 
                     data-fixture-id="${match.fixture_id}"
                     onclick="EnhancedBettingEngine.selectMatch(${match.fixture_id})">
                    <div class="match-league">${match.league_name}</div>
                    <div class="match-teams">
                        <span>${match.home_team.name}</span>
                        <span class="match-score">${match.score.home} - ${match.score.away}</span>
                        <span>${match.away_team.name}</span>
                    </div>
                    <div class="match-live">🔴 LIVE ${match.elapsed || 0}'</div>
                </div>
            `).join('');
        } catch(e) {
            console.error('Error loading live matches:', e);
        }
    }
};

// ===== CSS STYLES =====
const EnhancedBettingStyles = `
<style>
.betting-engine.enhanced {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* Balance Panel */
.balance-panel {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 15px;
    padding: 20px;
    color: white;
    text-align: center;
    margin-bottom: 20px;
}

.balance-amount {
    font-size: 36px;
    font-weight: bold;
    margin-top: 5px;
}

/* Match Selection */
.matches-list {
    max-height: 200px;
    overflow-y: auto;
    margin-bottom: 15px;
}

.match-item {
    background: #f5f5f5;
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 8px;
    cursor: pointer;
    transition: all 0.3s;
}

.match-item:hover {
    background: #e8e8e8;
    transform: translateX(5px);
}

.match-item.selected {
    background: #667eea;
    color: white;
}

.match-league {
    font-size: 12px;
    opacity: 0.7;
}

.match-teams {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 500;
}

.match-score {
    font-weight: bold;
    margin: 0 10px;
}

.match-live {
    font-size: 11px;
    color: #ff4444;
}

/* Match Details */
.match-details {
    background: white;
    border-radius: 15px;
    padding: 15px;
    margin: 15px 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.match-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}

.match-status.live {
    color: #ff4444;
    font-weight: bold;
}

.match-teams {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.team {
    display: flex;
    align-items: center;
    gap: 10px;
}

.team-logo {
    width: 30px;
    height: 30px;
    object-fit: contain;
}

.team-score {
    font-size: 24px;
    font-weight: bold;
}

.team-vs {
    font-weight: bold;
    color: #888;
}

/* Category Tabs */
.category-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 15px 0;
}

.category-tab {
    padding: 8px 16px;
    border: 2px solid #ddd;
    background: white;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.3s;
    font-size: 13px;
}

.category-tab:hover {
    border-color: #667eea;
}

.category-tab.active {
    background: #667eea;
    border-color: #667eea;
    color: white;
}

/* Bets Container */
.bets-container {
    background: white;
    border-radius: 15px;
    padding: 15px;
    margin: 15px 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    max-height: 300px;
    overflow-y: auto;
}

.bets-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
}

.bet-option {
    padding: 10px;
    border: 2px solid #ddd;
    background: white;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s;
    text-align: center;
}

.bet-option:hover {
    border-color: #667eea;
    transform: scale(1.02);
}

.bet-option.selected {
    background: #667eea;
    border-color: #667eea;
    color: white;
}

.bet-name {
    font-size: 12px;
    font-weight: 500;
}

.bet-odds {
    font-size: 16px;
    font-weight: bold;
    color: #667eea;
}

.bet-option.selected .bet-odds {
    color: white;
}

/* Bet Details */
.bet-details {
    background: #f9f9f9;
    border-radius: 10px;
    padding: 15px;
    margin: 10px 0;
}

.bet-detail-card {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.bet-detail-name {
    font-weight: bold;
    font-size: 16px;
    grid-column: 1 / -1;
}

/* Betting Slip */
.betting-slip {
    background: white;
    border-radius: 15px;
    padding: 20px;
    margin: 20px 0;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.bet-amount-section input {
    width: 100%;
    padding: 12px;
    border: 2px solid #ddd;
    border-radius: 8px;
    font-size: 16px;
    box-sizing: border-box;
}

.quick-amounts {
    display: flex;
    gap: 10px;
    margin-top: 10px;
}

.quick-amounts button {
    flex: 1;
    padding: 8px;
    background: #f0f0f0;
    border: none;
    border-radius: 5px;
    cursor: pointer;
}

.quick-amounts button:hover {
    background: #e0e0e0;
}

.potential-win {
    display: flex;
    justify-content: space-between;
    padding: 15px;
    background: #f9f9f9;
    border-radius: 8px;
    margin: 15px 0;
}

.place-bet-btn {
    width: 100%;
    padding: 15px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: transform 0.2s;
}

.place-bet-btn:hover:not(:disabled) {
    transform: translateY(-2px);
}

.place-bet-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Active Bets & History */
.bet-card, .history-item {
    background: #f9f9f9;
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 10px;
}

.bet-card.active {
    border-left: 4px solid #ff4444;
}

.history-item.won {
    border-left: 4px solid #4caf50;
}

.history-item.lost {
    border-left: 4px solid #f44336;
}

.bet-header, .history-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.bet-odds {
    font-weight: bold;
    color: #667eea;
}

.bet-status.live {
    color: #ff4444;
    font-size: 12px;
}

.history-status {
    font-weight: bold;
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 4px;
}

.history-status.won {
    color: #4caf50;
}

.history-status.lost {
    color: #f44336;
}

.history-payout {
    color: #4caf50;
    font-weight: bold;
}

/* Notification */
.notification-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
}

.notification {
    background: white;
    border-radius: 8px;
    padding: 12px 20px;
    margin-bottom: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-width: 250px;
    animation: slideIn 0.3s ease;
}

.notification.success { border-left: 4px solid #4caf50; }
.notification.error { border-left: 4px solid #f44336; }
.notification.warning { border-left: 4px solid #ff9800; }

.notification .close {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    margin-left: 15px;
}

/* Loading */
.loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 2000;
    color: white;
}

.spinner {
    width: 50px;
    height: 50px;
    border: 4px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

@keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}

/* Responsive */
@media (max-width: 768px) {
    .bets-grid {
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    }
    
    .category-tabs {
        gap: 5px;
    }
    
    .category-tab {
        font-size: 11px;
        padding: 6px 12px;
    }
    
    .bet-detail-card {
        grid-template-columns: 1fr;
    }
}
</style>
`;

// ===== INITIALIZE =====
document.addEventListener('DOMContentLoaded', async () => {
    // Inject styles
    document.head.insertAdjacentHTML('beforeend', EnhancedBettingStyles);
    
    // Create container
    let container = document.getElementById('betting-engine-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'betting-engine-container';
        document.body.appendChild(container);
    }
    
    // Render UI
    container.innerHTML = EnhancedBettingUI.render();
    
    // Initialize engine
    await EnhancedBettingEngine.init();
    
    // Load live matches
    await EnhancedBettingUI.loadLiveMatches();
    
    // Refresh matches every 15 seconds
    setInterval(() => EnhancedBettingUI.loadLiveMatches(), 15000);
    
    // Amount input listener
    const amountInput = document.getElementById('bet-amount');
    if (amountInput) {
        amountInput.addEventListener('input', (e) => {
            EnhancedBettingEngine.setBetAmount(e.target.value);
        });
    }
    
    console.log('🎰 Enhanced Betting Engine v5.0 Fully Active!');
    console.log(`📊 ${Object.keys(BET_CATEGORIES).length} Categories Loaded`);
    console.log(`🎯 ${Object.keys(BET_DISPLAY_NAMES).length} Bet Types Available`);
});

// Export
window.EnhancedBettingEngine = EnhancedBettingEngine;
window.EnhancedBettingUI = EnhancedBettingUI;
window.BET_CATEGORIES = BET_CATEGORIES;
window.BET_DISPLAY_NAMES = BET_DISPLAY_NAMES;
window.ODDS_CONFIG = ODDS_CONFIG;
