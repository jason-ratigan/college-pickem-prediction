// server/services/gameService.ts

import { db } from '../db.js';
import { games, teams, picks, teamEfficiencyRatings, GameWithTeams, EnrichedGame, TeamSelect, TeamEfficiencyRatings, gameBoxScoreStats, TeamHeadlineStats } from '@college-pickem/shared';
import { eq, and, desc, asc, or, inArray, SQL, gte, sql } from 'drizzle-orm';
import * as predictionService from './predictionService.js';
import { AdvancedTeamEfficiencyProfile } from './deprecated/recursiveEfficiencyEngine.js';
import { getTeamStatisticalAnalysis as getTeamAnalysis } from './teamService.js';

// Headline stats aggregation for a team within a season
// Now proxies to the Team page's statistical analysis to ensure consistency.
async function getTeamHeadlineStats(teamId: number, season: number): Promise<TeamHeadlineStats> {
  // Only use final games to compute averages
  const teamGames = await db.select({
    id: games.id,
    homeTeamId: games.homeTeamId,
    awayTeamId: games.awayTeamId,
    homeTeamScore: games.homeTeamScore,
    awayTeamScore: games.awayTeamScore,
  })
  .from(games)
  .where(and(
    eq(games.season, season),
    eq(games.isFinal, true),
    sql`${games.homeTeamId} = ${teamId} OR ${games.awayTeamId} = ${teamId}`
  ));

  // Reuse the same logic powering the Team page to ensure consistent numbers
  const analysis = await getTeamAnalysis(teamId, season);
  if (!analysis) {
    return {
      pointsPerGame: 0,
      pointsAllowedPerGame: 0,
      totalYardsPerGame: 0,
      totalYardsAllowedPerGame: 0,
      passYardsPerGame: 0,
      rushYardsPerGame: 0,
      passYardsAllowedPerGame: 0,
      rushYardsAllowedPerGame: 0,
      turnoversLostPerGame: 0,
      turnoversGainedPerGame: 0,
      sacksPerGame: 0,
      fgMadePerGame: 0,
      fgAttPerGame: 0,
    };
  }

  return {
    pointsPerGame: +analysis.offense.pointsPerGame.toFixed(1),
    pointsAllowedPerGame: +analysis.defense.pointsAllowedPerGame.toFixed(1),
    totalYardsPerGame: +analysis.offense.totalYards.toFixed(0),
    totalYardsAllowedPerGame: +analysis.defense.totalYardsAllowed.toFixed(0),
    passYardsPerGame: +analysis.offense.passingYards.toFixed(0),
    rushYardsPerGame: +analysis.offense.rushingYards.toFixed(0),
    passYardsAllowedPerGame: +analysis.defense.passingYardsAllowed.toFixed(0),
    rushYardsAllowedPerGame: +analysis.defense.rushingYardsAllowed.toFixed(0),
    turnoversLostPerGame: +(analysis.turnoversLostPerGame ?? 0).toFixed(2),
    turnoversGainedPerGame: +(analysis.defense.turnoversGainedPerGame ?? 0).toFixed(2),
    sacksPerGame: +analysis.defense.sacks.toFixed(2),
    fgMadePerGame: +(analysis.specialTeams?.fgMadePerGame ?? 0).toFixed(2),
    fgAttPerGame: +(analysis.specialTeams?.fgAttPerGame ?? 0).toFixed(2),
  };
}


// Define types inferred from Drizzle schemas for strong typing
type PickSelect = typeof picks.$inferSelect;

// Enhanced game analysis interfaces
export interface EfficiencyComparison {
  category: 'passOffense' | 'rushOffense' | 'passDefense' | 'rushDefense' | 'scoring' | 'turnovers' | 'specialTeams';
  homeValue: number;
  awayValue: number;
  advantage: 'home' | 'away' | 'neutral';
  advantageMargin: number;
  description: string;
  impactLevel: 'high' | 'medium' | 'low';
}

export interface ExpectedTeamPerformance {
  passingYards: { expected: number; calculation: string };
  rushingYards: { expected: number; calculation: string };
  pointsScored: { expected: number; calculation: string };
  turnovers: { expected: number; calculation: string };
}

export interface CalculationStep {
  step: string;
  description: string;
  homeValue: number;
  awayValue: number;
  formula: string;
}

export interface ConfidenceFactor {
  factor: string;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
  value: number;
}

export interface PredictionBreakdown {
  expectedPerformance: {
    home: ExpectedTeamPerformance;
    away: ExpectedTeamPerformance;
  };
  calculationSteps: CalculationStep[];
  confidenceFactors: ConfidenceFactor[];
}

export interface DataQualityInfo {
  homeTeamQuality: string;
  awayTeamQuality: string;
  homeGamesPlayed: number;
  awayGamesPlayed: number;
  overallReliability: 'high' | 'medium' | 'low';
}

export interface EfficiencyAnalysis {
  homeTeamEfficiency: AdvancedTeamEfficiencyProfile;
  awayTeamEfficiency: AdvancedTeamEfficiencyProfile;
  efficiencyComparisons: EfficiencyComparison[];
  predictionBreakdown: PredictionBreakdown;
  dataQualityAssessment: DataQualityInfo;
}

/**
 * Safely parses a string into a float, returning null if the value is invalid or empty.
 * @param value The string or null value to parse.
 * @returns A number or null.
 */
const safeParseFloat = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined || value.trim() === '') {
    return null;
  }
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
};

/**
 * Converts a prediction from the prediction service to the format expected by EnrichedGame.
 * @param prediction The raw prediction object from the prediction service.
 * @returns An object formatted for the EnrichedGame type.
 */
// Converts prediction to the format expected by the GameAnalysis page (numeric winProbability)
// Hub format: includes per-team win probabilities
const convertPredictionToHubFormat = (prediction: any) => {
  if (!prediction) return null;
  const homeWinProb = prediction.winProbability ?? 50;
  return {
    predictedWinner: homeWinProb > 50 ? (prediction.homeTeam?.id ?? 0) : (prediction.awayTeam?.id ?? 0),
    confidence: Math.abs(homeWinProb - 50) * 2,
    expectedScore: {
      home: prediction.expectedScore?.home ?? 0,
      away: prediction.expectedScore?.away ?? 0,
    },
    winProbability: {
      home: homeWinProb,
      away: 100 - homeWinProb,
    },
    spread: prediction.spread ?? 0,
    total: prediction.total ?? 0,
    keyMatchups: prediction.keyMatchups || [],
  };
};

// Converts prediction to the format expected by the GameAnalysis page (single numeric winProbability for home team)
const convertPredictionToAnalysisFormat = (prediction: any) => {
  if (!prediction) return null;
  return {
    expectedScore: {
      home: prediction.expectedScore?.home ?? 0,
      away: prediction.expectedScore?.away ?? 0,
    },
    winProbability: prediction.winProbability ?? 50,
    confidence: prediction.confidence ?? 0,
    spread: prediction.spread ?? 0,
    total: prediction.total ?? 0,
    keyMatchups: prediction.keyMatchups || [],
  };
};


/**
 * Fetches team efficiency profiles for both teams for a given season.
 * @param homeTeamId The ID of the home team.
 * @param awayTeamId The ID of the away team.
 * @param season The season year.
 * @returns An object containing the efficiency profiles for the home and away teams.
 */
export const getTeamEfficiencyProfiles = async (
  homeTeamId: number,
  awayTeamId: number,
  season: number
): Promise<{
  homeProfile: AdvancedTeamEfficiencyProfile | null;
  awayProfile: AdvancedTeamEfficiencyProfile | null;
}> => {
  console.log(`Fetching efficiency profiles for teams ${homeTeamId} and ${awayTeamId} in season ${season}`);

  const efficiencyRatings = await db.query.teamEfficiencyRatings.findMany({
    where: and(
      inArray(teamEfficiencyRatings.teamId, [homeTeamId, awayTeamId]),
      eq(teamEfficiencyRatings.season, season)
    ),
    orderBy: [desc(teamEfficiencyRatings.lastCalculated)]
  });

  const convertToProfile = (rating: TeamEfficiencyRatings): AdvancedTeamEfficiencyProfile => ({
    teamId: rating.teamId,
    season: rating.season,
    
    // Offensive Efficiency
    totalOffenseEfficiency: parseFloat(rating.totalOffenseEfficiency || '0'),
    passingOffenseEfficiency: parseFloat(rating.passingOffenseEfficiency || '0'),
    rushingOffenseEfficiency: parseFloat(rating.rushingOffenseEfficiency || '0'),
    scoringOffenseEfficiency: parseFloat(rating.scoringOffenseEfficiency || '0'),
    
    // Defensive Efficiency
    totalDefenseEfficiency: parseFloat(rating.totalDefenseEfficiency || '0'),
    passingDefenseEfficiency: parseFloat(rating.passingDefenseEfficiency || '0'),
    rushingDefenseEfficiency: parseFloat(rating.rushingDefenseEfficiency || '0'),
    scoringDefenseEfficiency: parseFloat(rating.scoringDefenseEfficiency || '0'),
    
    // Turnover & Special Teams
    interceptionEfficiency: parseFloat(rating.interceptionEfficiency || '0'),
    interceptionDefenseEfficiency: parseFloat(rating.interceptionDefenseEfficiency || '0'),
    sackOffenseEfficiency: parseFloat(rating.sackOffenseEfficiency || '0'),
    sackDefenseEfficiency: parseFloat(rating.sackDefenseEfficiency || '0'),
    fieldGoalEfficiency: parseFloat(rating.fieldGoalEfficiency || '0'),
    
    // Metadata
    gamesPlayed: rating.gamesPlayed || 0,
    convergenceScore: parseFloat(rating.convergenceScore || '0.5'),
    confidenceLevel: (rating.confidenceLevel as 'High' | 'Medium' | 'Low') || 'Low',
    lastCalculated: rating.lastCalculated || new Date()
  });

  const homeRating = efficiencyRatings.find(r => r.teamId === homeTeamId);
  const awayRating = efficiencyRatings.find(r => r.teamId === awayTeamId);

  return {
    homeProfile: homeRating ? convertToProfile(homeRating) : null,
    awayProfile: awayRating ? convertToProfile(awayRating) : null
  };
};

/**
 * Calculates efficiency comparisons between two teams based on their profiles.
 * @param homeProfile The efficiency profile of the home team.
 * @param awayProfile The efficiency profile of the away team.
 * @returns An array of efficiency comparisons across various categories.
 */
export const calculateEfficiencyComparisons = (
  homeProfile: AdvancedTeamEfficiencyProfile,
  awayProfile: AdvancedTeamEfficiencyProfile
): EfficiencyComparison[] => {
  const comparisons: EfficiencyComparison[] = [];

  const createComparison = (
    category: EfficiencyComparison['category'],
    homeValue: number,
    awayValue: number,
    description: string
  ): EfficiencyComparison => {
    const margin = Math.abs(homeValue - awayValue);
    let advantage: 'home' | 'away' | 'neutral' = 'neutral';
    let impactLevel: 'high' | 'medium' | 'low' = 'low';

    if (margin > 0.1) {
      advantage = homeValue > awayValue ? 'home' : 'away';
      if (margin > 0.5) impactLevel = 'high';
      else if (margin > 0.25) impactLevel = 'medium';
    }

    return {
      category,
      homeValue,
      awayValue,
      advantage,
      advantageMargin: margin,
      description,
      impactLevel
    };
  };

  comparisons.push(
    createComparison(
      'passOffense',
      homeProfile.passingOffenseEfficiency,
      awayProfile.passingOffenseEfficiency,
      'Passing offense efficiency comparison'
    ),
    createComparison(
      'rushOffense',
      homeProfile.rushingOffenseEfficiency,
      awayProfile.rushingOffenseEfficiency,
      'Rushing offense efficiency comparison'
    ),
    createComparison(
      'passDefense',
      homeProfile.passingDefenseEfficiency,
      awayProfile.passingDefenseEfficiency,
      'Pass defense efficiency comparison'
    ),
    createComparison(
      'rushDefense',
      homeProfile.rushingDefenseEfficiency,
      awayProfile.rushingDefenseEfficiency,
      'Rush defense efficiency comparison'
    ),
    createComparison(
      'scoring',
      homeProfile.scoringOffenseEfficiency,
      awayProfile.scoringOffenseEfficiency,
      'Scoring efficiency comparison'
    ),
    createComparison(
      'turnovers',
      homeProfile.interceptionEfficiency,
      awayProfile.interceptionEfficiency,
      'Turnover efficiency comparison'
    ),
    createComparison(
      'specialTeams',
      homeProfile.fieldGoalEfficiency,
      awayProfile.fieldGoalEfficiency,
      'Special teams efficiency comparison'
    )
  );

  return comparisons;
};

/**
 * Generates a detailed breakdown of a game prediction, including expected performance metrics and calculation steps.
 * @param homeProfile The efficiency profile of the home team.
 * @param awayProfile The efficiency profile of the away team.
 * @param prediction The raw prediction object.
 * @returns A structured breakdown of the prediction.
 */
export const generatePredictionBreakdown = (
  homeProfile: AdvancedTeamEfficiencyProfile,
  awayProfile: AdvancedTeamEfficiencyProfile,
  prediction: any
): PredictionBreakdown => {
  // Calculate expected performance metrics
  const calculateExpectedPerformance = (
    teamOffense: number,
    opponentDefense: number,
    baseline: number,
    scalingFactor: number = 1.0
  ): number => {
    const netEfficiency = teamOffense - opponentDefense;
    return baseline + (netEfficiency * scalingFactor);
  };

  const homeExpectedPassing = calculateExpectedPerformance(
    homeProfile.passingOffenseEfficiency,
    awayProfile.passingDefenseEfficiency,
    250, // baseline passing yards
    50   // scaling factor
  );

  const awayExpectedPassing = calculateExpectedPerformance(
    awayProfile.passingOffenseEfficiency,
    homeProfile.passingDefenseEfficiency,
    250,
    50
  );

  const homeExpectedRushing = calculateExpectedPerformance(
    homeProfile.rushingOffenseEfficiency,
    awayProfile.rushingDefenseEfficiency,
    150, // baseline rushing yards
    30   // scaling factor
  );

  const awayExpectedRushing = calculateExpectedPerformance(
    awayProfile.rushingOffenseEfficiency,
    homeProfile.rushingDefenseEfficiency,
    150,
    30
  );

  const homeExpectedPoints = calculateExpectedPerformance(
    homeProfile.scoringOffenseEfficiency,
    awayProfile.scoringDefenseEfficiency,
    28, // baseline points
    7   // scaling factor
  );

  const awayExpectedPoints = calculateExpectedPerformance(
    awayProfile.scoringOffenseEfficiency,
    homeProfile.scoringDefenseEfficiency,
    28,
    7
  );

  const homeExpectedTurnovers = Math.max(0, calculateExpectedPerformance(
    -homeProfile.interceptionEfficiency, // negative because fewer turnovers is better
    awayProfile.interceptionEfficiency,
    1.5, // baseline turnovers
    0.5  // scaling factor
  ));

  const awayExpectedTurnovers = Math.max(0, calculateExpectedPerformance(
    -awayProfile.interceptionEfficiency,
    homeProfile.interceptionEfficiency,
    1.5,
    0.5
  ));

  const expectedPerformance = {
    home: {
      passingYards: {
        expected: Math.round(homeExpectedPassing),
        calculation: `${homeProfile.passingOffenseEfficiency.toFixed(2)} (offense) - ${awayProfile.passingDefenseEfficiency.toFixed(2)} (opponent defense) = ${(homeProfile.passingOffenseEfficiency - awayProfile.passingDefenseEfficiency).toFixed(2)} net efficiency`
      },
      rushingYards: {
        expected: Math.round(homeExpectedRushing),
        calculation: `${homeProfile.rushingOffenseEfficiency.toFixed(2)} (offense) - ${awayProfile.rushingDefenseEfficiency.toFixed(2)} (opponent defense) = ${(homeProfile.rushingOffenseEfficiency - awayProfile.rushingDefenseEfficiency).toFixed(2)} net efficiency`
      },
      pointsScored: {
        expected: Math.round(homeExpectedPoints),
        calculation: `${homeProfile.scoringOffenseEfficiency.toFixed(2)} (offense) - ${awayProfile.scoringDefenseEfficiency.toFixed(2)} (opponent defense) = ${(homeProfile.scoringOffenseEfficiency - awayProfile.scoringDefenseEfficiency).toFixed(2)} net efficiency`
      },
      turnovers: {
        expected: Math.round(homeExpectedTurnovers * 10) / 10,
        calculation: `Turnover efficiency: ${homeProfile.interceptionEfficiency.toFixed(2)} vs opponent ${awayProfile.interceptionEfficiency.toFixed(2)}`
      }
    },
    away: {
      passingYards: {
        expected: Math.round(awayExpectedPassing),
        calculation: `${awayProfile.passingOffenseEfficiency.toFixed(2)} (offense) - ${homeProfile.passingDefenseEfficiency.toFixed(2)} (opponent defense) = ${(awayProfile.passingOffenseEfficiency - homeProfile.passingDefenseEfficiency).toFixed(2)} net efficiency`
      },
      rushingYards: {
        expected: Math.round(awayExpectedRushing),
        calculation: `${awayProfile.rushingOffenseEfficiency.toFixed(2)} (offense) - ${homeProfile.rushingDefenseEfficiency.toFixed(2)} (opponent defense) = ${(awayProfile.rushingOffenseEfficiency - homeProfile.rushingDefenseEfficiency).toFixed(2)} net efficiency`
      },
      pointsScored: {
        expected: Math.round(awayExpectedPoints),
        calculation: `${awayProfile.scoringOffenseEfficiency.toFixed(2)} (offense) - ${homeProfile.scoringDefenseEfficiency.toFixed(2)} (opponent defense) = ${(awayProfile.scoringOffenseEfficiency - homeProfile.scoringDefenseEfficiency).toFixed(2)} net efficiency`
      },
      turnovers: {
        expected: Math.round(awayExpectedTurnovers * 10) / 10,
        calculation: `Turnover efficiency: ${awayProfile.interceptionEfficiency.toFixed(2)} vs opponent ${homeProfile.interceptionEfficiency.toFixed(2)}`
      }
    }
  };

  const calculationSteps: CalculationStep[] = [
    {
      step: 'Passing Game Matchup',
      description: 'Team passing offense efficiency vs opponent pass defense efficiency',
      homeValue: homeProfile.passingOffenseEfficiency - awayProfile.passingDefenseEfficiency,
      awayValue: awayProfile.passingOffenseEfficiency - homeProfile.passingDefenseEfficiency,
      formula: 'Team Pass Offense - Opponent Pass Defense'
    },
    {
      step: 'Rushing Game Matchup',
      description: 'Team rushing offense efficiency vs opponent rush defense efficiency',
      homeValue: homeProfile.rushingOffenseEfficiency - awayProfile.rushingDefenseEfficiency,
      awayValue: awayProfile.rushingOffenseEfficiency - homeProfile.rushingDefenseEfficiency,
      formula: 'Team Rush Offense - Opponent Rush Defense'
    },
    {
      step: 'Scoring Efficiency',
      description: 'Overall scoring ability vs opponent defensive efficiency',
      homeValue: homeProfile.scoringOffenseEfficiency - awayProfile.scoringDefenseEfficiency,
      awayValue: awayProfile.scoringOffenseEfficiency - homeProfile.scoringDefenseEfficiency,
      formula: 'Team Scoring Offense - Opponent Scoring Defense'
    }
  ];

  const confidenceFactors: ConfidenceFactor[] = [
    {
      factor: 'Home Team Data Quality',
      description: `Based on ${homeProfile.gamesPlayed} games played`,
      impact: homeProfile.confidenceLevel === 'High' ? 'positive' : homeProfile.confidenceLevel === 'Medium' ? 'neutral' : 'negative',
      value: homeProfile.gamesPlayed
    },
    {
      factor: 'Away Team Data Quality',
      description: `Based on ${awayProfile.gamesPlayed} games played`,
      impact: awayProfile.confidenceLevel === 'High' ? 'positive' : awayProfile.confidenceLevel === 'Medium' ? 'neutral' : 'negative',
      value: awayProfile.gamesPlayed
    }
  ];

  return {
    expectedPerformance,
    calculationSteps,
    confidenceFactors
  };
};

/**
 * Fetches all data required for the "Games Hub" page for a specific season and week.
 * @param season The season year (e.g., 2023).
 * @param week The week number of the season.
 * @param conference (Optional) The specific conference to filter games by (e.g., "SEC").
 * @param classification (Optional) The team classification to filter games by (e.g., "FBS").
 * @param userId (Optional) The ID of the logged-in user to fetch their picks.
 * @returns An object containing the list of enriched games and counts of completed/upcoming games.
 */
export const getWeeklyGamesHubData = async (
  season: number,
  week: number,
  conference?: string,
  classification?: string,
  userId?: string
): Promise<{ games: EnrichedGame[]; completedGames: number; upcomingGames: number }> => {
  const filterLog = classification ? `Classification: ${classification}` : `Conference: ${conference || 'All'}`;
  console.log(`Fetching Hub Data for Season: ${season}, Week: ${week}, ${filterLog}, UserID: ${userId || 'None'}`);

  const conditions: SQL[] = [
    eq(games.season, season),
    eq(games.week, week)
  ];
  
  let weekGames = await db.query.games.findMany({
    where: and(...conditions),
    with: {
      homeTeam: true,
      awayTeam: true,
    },
    orderBy: [desc(games.isFeaturedGame), asc(games.gameTime)],
  });

  if (classification) {
    weekGames = weekGames.filter(game => 
      game.homeTeam.classification === classification || game.awayTeam.classification === classification
    );
  } else if (conference) {
    weekGames = weekGames.filter(game => 
      game.homeTeam.conference === conference || game.awayTeam.conference === conference
    );
  }

  let userPicksMap = new Map<number, PickSelect>();
  if (userId) {
    const gameIds = weekGames.map((g) => g.id);
    if (gameIds.length > 0) {
      const userPicks = await db.query.picks.findMany({
        where: and(
            eq(picks.userId, userId),
            inArray(picks.gameId, gameIds)
        ),
      });
      userPicksMap = new Map(userPicks.map((p) => [p.gameId, p]));
    }
  }

  const upcomingGamesList = weekGames.filter(game => !game.isFinal);
  let predictionsMap = new Map<number, any>();
  
  if (upcomingGamesList.length > 0) {
    try {
      const predictions = await predictionService.getWeeklyPredictions(season, week);
      predictionsMap = new Map(predictions.map(p => [p.gameId || 0, p]));
    } catch (error) {
      console.error('Failed to fetch predictions:', error);
    }
  }

  const enrichedGames: EnrichedGame[] = await Promise.all(weekGames.map(async (game) => {
    const prediction = predictionsMap.get(game.id);

    // Compute headline stats for both teams for this season
    const [homeStats, awayStats] = await Promise.all([
      getTeamHeadlineStats(game.homeTeamId, game.season),
      getTeamHeadlineStats(game.awayTeamId, game.season)
    ]);

    const enrichedGame: EnrichedGame = {
      ...game,
      prediction: game.isFinal ? null : (prediction ? convertPredictionToHubFormat(prediction) : null),
      userPick: userPicksMap.get(game.id) || null,
      headlineStats: { home: homeStats, away: awayStats },
    };
    return enrichedGame;
  }));

  const completedGames = weekGames.filter(game => game.isFinal).length;
  const upcomingGames = weekGames.length - completedGames;

  return {
    games: enrichedGames,
    completedGames,
    upcomingGames,
  };
};


/**
 * Updates specific details of a game, such as betting lines or featured status.
 * @param gameId The ID of the game to update.
 * @param details An object containing the fields to update (e.g., spread, overUnder).
 * @returns The updated game object with team information.
 */
export const updateGameDetails = async (
  gameId: number,
  details: { spread?: string; overUnder?: string; isFeaturedGame?: boolean }
) => {
  console.log(`Admin updating game ${gameId} with details:`, details);

  await db.update(games)
    .set(details)
    .where(eq(games.id, gameId));

  return db.query.games.findFirst({
    where: eq(games.id, gameId),
    with: { homeTeam: true, awayTeam: true }
  });
};


/**
 * Fetches all distinct seasons and their corresponding weeks from the database.
 * @returns An object where keys are season years and values are arrays of week numbers.
 */
export const getAvailableSeasonsAndWeeks = async (): Promise<Record<string, number[]>> => {
  console.log('Fetching available seasons and weeks for filters...');
  
  const results = await db.select({
    season: games.season,
    week: games.week,
  }).from(games).groupBy(games.season, games.week).orderBy(desc(games.season), asc(games.week));

  const seasonsAndWeeks = results.reduce((acc: Record<string, number[]>, row) => {
    const { season, week } = row;
    if (!acc[season]) {
      acc[season] = [];
    }
    acc[season].push(week);
    return acc;
  }, {});

  return seasonsAndWeeks;
};


// --- RETAINED UTILITY FUNCTIONS ---

/**
 * Determines the current week of the season by finding the latest completed game.
 * @returns An object containing the current season and week.
 */
export const getCurrentWeek = async (): Promise<{ season: number; week: number }> => {
  console.log('Determining current week from database...');
  
  const latestCompletedGame = await db.query.games.findFirst({
    orderBy: [desc(games.season), desc(games.week)],
    where: eq(games.isFinal, true),
  });
  
  if (!latestCompletedGame) {
    console.log('No completed games found. Defaulting to Week 1.');
    return { season: new Date().getFullYear(), week: 1 };
  }
  
  // Current week is the same as the latest completed week, not +1
  // This assumes we're in the middle of the week with games still to be played
  const currentWeek = latestCompletedGame.week;
  console.log(`Last completed week was ${latestCompletedGame.season} W${latestCompletedGame.week}. Current week is W${currentWeek}.`);
  
  return { season: latestCompletedGame.season, week: currentWeek };
};

/**
 * Fetches a single game by its ID, including its home and away team information.
 * @param gameId The ID of the game to fetch.
 * @returns The game object with team data, or null if not found.
 */
export const getGameById = async (gameId: number): Promise<GameWithTeams | null> => {
  console.log(`Fetching game with ID: ${gameId}`);
  
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    with: {
      homeTeam: true,
      awayTeam: true,
    },
  });

  return game as GameWithTeams || null;
};

/**
 * Fetches a comprehensive analysis for a single game.
 * @param gameId The ID of the game to analyze.
 * @returns An object containing detailed analysis data for the game, or null if the game is not found.
 */
export const getGameAnalysis = async (gameId: number) => {
  console.log(`Fetching analysis for game ID: ${gameId}`);
  
  const game = await getGameById(gameId);
  if (!game) return null;

  let boxScoreStats = null;
  if (game.isFinal) {
    const { gameBoxScoreStats } = await import('@college-pickem/shared');
    boxScoreStats = await db.query.gameBoxScoreStats.findMany({
      where: eq(gameBoxScoreStats.gameId, gameId),
      with: { team: true }
    });
  }

  let prediction = null;
  if (!game.isFinal) {
    try {
      const predictions = await predictionService.getWeeklyPredictions(game.season, game.week);
      const gamePrediction = predictions.find(p => p.gameId === gameId);
      if (gamePrediction) {
        prediction = convertPredictionToAnalysisFormat(gamePrediction);
      }
    } catch (error) {
      console.error('Failed to fetch prediction for game analysis:', error);
    }
  }

  const historicalMatchups = await db.query.games.findMany({
    where: and(
      or(
        and(eq(games.homeTeamId, game.homeTeamId), eq(games.awayTeamId, game.awayTeamId)),
        and(eq(games.homeTeamId, game.awayTeamId), eq(games.awayTeamId, game.homeTeamId))
      ),
      eq(games.isFinal, true),
      gte(games.season, game.season - 3)
    ),
    with: { homeTeam: true, awayTeam: true },
    orderBy: [desc(games.season), desc(games.week)],
    limit: 5
  });

  let efficiencyAnalysis: EfficiencyAnalysis | undefined;
  try {
    const { homeProfile, awayProfile } = await getTeamEfficiencyProfiles(
      game.homeTeamId,
      game.awayTeamId,
      game.season
    );

    if (homeProfile && awayProfile) {
      const efficiencyComparisons = calculateEfficiencyComparisons(homeProfile, awayProfile);
      
      let predictionBreakdown: PredictionBreakdown;
      if (prediction) {
        predictionBreakdown = generatePredictionBreakdown(homeProfile, awayProfile, prediction);
      } else {
        predictionBreakdown = generatePredictionBreakdown(homeProfile, awayProfile, {});
      }

      const dataQualityAssessment: DataQualityInfo = {
        homeTeamQuality: homeProfile.confidenceLevel === 'High' ? 'Excellent' : homeProfile.confidenceLevel === 'Medium' ? 'Good' : 'Limited',
        awayTeamQuality: awayProfile.confidenceLevel === 'High' ? 'Excellent' : awayProfile.confidenceLevel === 'Medium' ? 'Good' : 'Limited',
        homeGamesPlayed: homeProfile.gamesPlayed,
        awayGamesPlayed: awayProfile.gamesPlayed,
        overallReliability: (
          homeProfile.gamesPlayed >= 8 && awayProfile.gamesPlayed >= 8 &&
          homeProfile.confidenceLevel === 'High' && awayProfile.confidenceLevel === 'High'
        ) ? 'high' : (
          homeProfile.gamesPlayed >= 5 && awayProfile.gamesPlayed >= 5 &&
          (homeProfile.confidenceLevel === 'Medium' || homeProfile.confidenceLevel === 'High') &&
          (awayProfile.confidenceLevel === 'Medium' || awayProfile.confidenceLevel === 'High')
        ) ? 'medium' : 'low'
      };

      efficiencyAnalysis = {
        homeTeamEfficiency: homeProfile,
        awayTeamEfficiency: awayProfile,
        efficiencyComparisons,
        predictionBreakdown,
        dataQualityAssessment
      };
    }
  } catch (error) {
    console.error('Failed to fetch efficiency analysis:', error);
  }

  const [homeStats, awayStats] = await Promise.all([
      getTeamHeadlineStats(game.homeTeamId, game.season),
      getTeamHeadlineStats(game.awayTeamId, game.season)
    ]);

  return {
    game: {
      id: game.id,
      season: game.season,
      homeTeam: { id: game.homeTeam.id, name: game.homeTeam.name, logoUrl: game.homeTeam.logoUrl },
      awayTeam: { id: game.awayTeam.id, name: game.awayTeam.name, logoUrl: game.awayTeam.logoUrl },
      gameTime: game.gameTime?.toISOString() || '',
      spread: safeParseFloat(game.spread),
      overUnder: safeParseFloat(game.overUnder),
      isFinal: game.isFinal,
      homeTeamScore: game.homeTeamScore,
      awayTeamScore: game.awayTeamScore,
    },
    prediction,
    headlineStats: { home: homeStats, away: awayStats },
    boxScoreStats: boxScoreStats ? {
      homeTeam: boxScoreStats.find(stat => stat.teamId === game.homeTeamId),
      awayTeam: boxScoreStats.find(stat => stat.teamId === game.awayTeamId)
    } : null,
    historicalMatchups: historicalMatchups.map(match => ({
      season: match.season,
      week: match.week,
      homeTeam: { id: match.homeTeam.id, name: match.homeTeam.name },
      awayTeam: { id: match.awayTeam.id, name: match.awayTeam.name },
      homeScore: match.homeTeamScore,
      awayScore: match.awayTeamScore,
      date: match.gameTime?.toISOString() || ''
    })),
    efficiencyAnalysis
  };
  
};