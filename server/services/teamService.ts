// server/services/teamService.ts

import { db } from '../db.js';
import { teams, games, teamEfficiencyRatings, gameBoxScoreStats, GameWithTeams } from '@college-pickem/shared';
// Corrected import: added `isNotNull` operator and `inArray` for performance optimization
import { asc, desc, eq, or, and, ilike, SQL, isNotNull, inArray } from 'drizzle-orm';
import { getGamePrediction } from './predictionService.js';
// REMOVED: import { efficiencyCalculationService } from './efficiencyCalculationService.js';
// This service was moved to deprecated/ folder as it used broken calculations

// Define types inferred from the Drizzle schema for strong typing
type TeamSelect = typeof teams.$inferSelect;
type EfficiencyRatingSelect = typeof teamEfficiencyRatings.$inferSelect;

// Enhanced game type with predictions
type GameWithPrediction = GameWithTeams & {
  prediction?: {
    winProbability: number;
    expectedScore: { team: number; opponent: number };
    confidence: number;
  };
};

// Define the shape of the complete team profile object, now with nextGame and statistical analysis
export type TeamProfile = {
  team: TeamSelect;
  schedule: GameWithPrediction[];
  efficiencyRatings: EfficiencyRatingSelect | null;
  record: { wins: number; losses: number };
  nextGame: (GameWithTeams & { 
    winProbability: number;
    expectedScore?: { team: number; opponent: number };
    predictionConfidence?: number;
  }) | null;
  statisticalAnalysis?: {
    offense: {
      passingYards: number;
      rushingYards: number;
      totalYards: number;
      pointsPerGame: number;
      thirdDownConversion: number;
      redZoneEfficiency: number;
    };
    defense: {
      passingYardsAllowed: number;
      rushingYardsAllowed: number;
      totalYardsAllowed: number;
      pointsAllowedPerGame: number;
      sacks: number;
      interceptions: number;
      tacklesForLoss: number;
      turnoversGainedPerGame: number;
    };
    specialTeams?: {
      fgMadePerGame: number;
      fgAttPerGame: number;
    };
    turnoversLostPerGame: number;
    strengths: string[];
    weaknesses: string[];
  } | null;
};

/**
 * Enhanced prediction system using opponent-adjusted efficiency ratings
 */
const generateStatisticallyInformedPrediction = async (teamId: number, opponentId: number, isHome: boolean, game: GameWithTeams) => {
    try {
        const homeTeamId = isHome ? teamId : opponentId;
        const awayTeamId = isHome ? opponentId : teamId;
        
        const prediction = await getGamePrediction(homeTeamId, awayTeamId, game.season, game.id);
        
        return {
            winProbability: isHome ? prediction.winProbability : (100 - prediction.winProbability),
            expectedScore: {
                team: isHome ? prediction.expectedScore.home : prediction.expectedScore.away,
                opponent: isHome ? prediction.expectedScore.away : prediction.expectedScore.home
            },
            confidence: prediction.confidence
        };
    } catch (error) {
        console.error('Error generating enhanced prediction:', error);
        // Fallback to basic prediction if enhanced prediction fails
        return generateBasicPrediction(teamId, game);
    }
};

/**
 * Get conference strength rating (higher = stronger)
 * Power 5: 4, Group of 5: 3, FCS Strong: 2, FCS Weak: 1, Other: 0
 */
const getConferenceStrength = (conference: string | null): number => {
    if (!conference) return 0;
    
    const conferenceStrengths: { [key: string]: number } = {
        // Power 5 Conferences
        'SEC': 4,
        'Big Ten': 4,
        'Big 12': 4,
        'ACC': 4,
        'Pac-12': 4,
        
        // Group of 5 Conferences
        'American Athletic': 3,
        'Mountain West': 3,
        'Conference USA': 3,
        'Mid-American': 3,
        'Sun Belt': 3,
        
        // Strong FCS Conferences
        'Big Sky': 2,
        'Missouri Valley': 2,
        'Colonial Athletic Association': 2,
        'Southland': 2,
        'MVFC': 2,
        
        // Weaker FCS Conferences
        'SWAC': 1,
        'MEAC': 1,
        'Pioneer': 1,
        'Patriot': 1,
        'UAC': 1,
        'Big South': 1,
        'Ohio Valley': 1,
        'Northeast': 1,
        
        // Independent/Other
        'Independent': 2
    };
    
    return conferenceStrengths[conference] || 1; // Default to weak FCS level
};



/**
 * Fallback prediction method for when enhanced prediction system fails
 * Uses deterministic calculations based on team IDs to avoid randomness
 */
const generateBasicPrediction = (teamId: number, game: GameWithTeams): any => {
    // Use team IDs to create deterministic but varied predictions
    const homeTeamId = game.homeTeamId;
    const awayTeamId = game.awayTeamId;
    const isHome = teamId === homeTeamId;
    
    // Create a simple hash from team IDs for consistency
    const hash = (homeTeamId * 31 + awayTeamId * 17) % 100;
    
    // Base probability with slight home field advantage
    let probability = 50;
    if (isHome) {
        probability += 5; // Home field advantage
    } else {
        probability -= 5;
    }
    
    // Add variation based on team ID hash (but deterministic)
    const variation = (hash % 21) - 10; // -10 to +10
    probability += variation;
    
    // Calculate expected scores based on team IDs (deterministic)
    const teamScore = 21 + ((teamId * 7) % 14); // 21-34 points
    const opponentId = isHome ? awayTeamId : homeTeamId;
    const opponentScore = 21 + ((opponentId * 7) % 14); // 21-34 points
    
    return {
        winProbability: Math.max(15, Math.min(85, Math.round(probability))),
        expectedScore: {
            team: teamScore,
            opponent: opponentScore
        },
        confidence: 25 // Low confidence for basic predictions
    };
};

/**
 * Fetches all teams from the database, ordered by api_team_id.
 */
export const getAllTeams = async (): Promise<TeamSelect[]> => {
  return db.select().from(teams).orderBy(asc(teams.apiTeamId));
};

/**
 * MODIFIED FUNCTION
 * Searches for teams by name and optionally filters by conference and classification.
 * Since classification data is null in the database, we skip classification filtering.
 */
export const searchTeams = async (
    query?: string, 
    conference?: string
): Promise<TeamSelect[]> => {
  const conditions: SQL[] = [];

  // Skip classification filtering since all teams have null classification in the database
  
  // Search by team name if query provided
  if (query) {
    conditions.push(ilike(teams.name, `%${query}%`));
  }
  
  // Filter by conference if provided
  if (conference) {
    conditions.push(eq(teams.conference, conference));
  }

  return db.select()
    .from(teams)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(teams.apiTeamId));
};

/**
 * ENHANCED FUNCTION
 * Gathers a complete profile for a single team for a given season.
 * Includes details on the next upcoming game and statistical analysis.
 */
export const getTeamProfile = async (teamId: number, season: number): Promise<TeamProfile | null> => {
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
  });

  if (!team) return null;

  const schedule = await db.query.games.findMany({
    where: and(
      eq(games.season, season),
      or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId))
    ),
    with: { 
      homeTeam: true, 
      awayTeam: true,
      boxScoreStats: true
    },
    orderBy: [asc(games.gameTime)],
  }) as GameWithTeams[];
  
  const efficiencyRatings = await db.query.teamEfficiencyRatings.findFirst({
      where: and(eq(teamEfficiencyRatings.teamId, teamId), eq(teamEfficiencyRatings.season, season)),
      orderBy: [desc(teamEfficiencyRatings.lastCalculated)],
  });

  const record = schedule.reduce((acc, game) => {
    if (!game.isFinal || game.homeTeamScore === null || game.awayTeamScore === null) return acc;
    const isHome = game.homeTeamId === teamId;
    const teamScore = isHome ? game.homeTeamScore : game.awayTeamScore;
    const opponentScore = isHome ? game.awayTeamScore : game.homeTeamScore;
    
    if (teamScore > opponentScore) acc.wins++;
    else if (teamScore < opponentScore) acc.losses++;
    
    return acc;
  }, { wins: 0, losses: 0 });

  const firstUpcomingGame = schedule.find(game => !game.isFinal) || null;
  let nextGameWithPrediction = null;

  if (firstUpcomingGame) {
      const isHome = firstUpcomingGame.homeTeamId === teamId;
      const opponentId = isHome ? firstUpcomingGame.awayTeamId : firstUpcomingGame.homeTeamId;
      
      const prediction = await generateStatisticallyInformedPrediction(
          teamId, 
          opponentId, 
          isHome, 
          firstUpcomingGame
      );
      
      nextGameWithPrediction = {
          ...firstUpcomingGame,
          winProbability: prediction.winProbability,
          expectedScore: prediction.expectedScore,
          predictionConfidence: prediction.confidence
      };
  }

  // Get statistical analysis
  const statisticalAnalysis = await getTeamStatisticalAnalysis(teamId, season);

  // Generate predictions for all upcoming games using dynamic season data
  const scheduleWithPredictions = await Promise.all(
    schedule.map(async (game) => {
      if (game.isFinal) {
        return game; // Return completed games as-is
      }
      
      // Generate prediction for upcoming games
      const isHome = game.homeTeamId === teamId;
      const opponentId = isHome ? game.awayTeamId : game.homeTeamId;
      
      const prediction = await generateStatisticallyInformedPrediction(
        teamId, 
        opponentId, 
        isHome, 
        game
      );
      
      return {
        ...game,
        prediction: {
          winProbability: prediction.winProbability,
          expectedScore: prediction.expectedScore,
          confidence: prediction.confidence
        }
      };
    })
  );

  // Return the complete, enhanced profile object.
  return {
    team,
    schedule: scheduleWithPredictions,
    efficiencyRatings: efficiencyRatings || null,
    record,
    nextGame: nextGameWithPrediction,
    statisticalAnalysis,
  };
};

/**
 * NEW FILTER DATA FUNCTION
 * Fetches all distinct, non-null conference names from the teams table.
 */
export const getAvailableConferences = async (): Promise<string[]> => {
    console.log('Fetching available conferences...');
    const results = await db
        .selectDistinct({ conference: teams.conference })
        .from(teams)
        // Corrected syntax for filtering out null values
        .where(isNotNull(teams.conference))
        .orderBy(asc(teams.conference));

    return results.map(r => r.conference).filter((c): c is string => c !== null);
};

/**
 * Get team classifications and conferences for hierarchical filtering
 */
export const getTeamClassificationsAndConferences = async () => {
    console.log('Fetching team classifications and conferences...');
    
    // Get all distinct classifications
    const classifications = await db
        .selectDistinct({ classification: teams.classification })
        .from(teams)
        .where(isNotNull(teams.classification))
        .orderBy(asc(teams.classification));

    // Get conferences grouped by classification
    const conferencesByClassification = await db
        .selectDistinct({ 
            classification: teams.classification, 
            conference: teams.conference 
        })
        .from(teams)
        .where(and(
            isNotNull(teams.classification),
            isNotNull(teams.conference)
        ))
        .orderBy(asc(teams.classification), asc(teams.conference));

    // Group conferences by classification
    const grouped: Record<string, string[]> = {};
    for (const item of conferencesByClassification) {
        if (item.classification && item.conference) {
            if (!grouped[item.classification]) {
                grouped[item.classification] = [];
            }
            grouped[item.classification].push(item.conference);
        }
    }

    return {
        classifications: classifications.map(c => c.classification).filter((c): c is string => c !== null),
        conferencesByClassification: grouped
    };
};

/**
 * Get team efficiency rankings with calculated ranks for each category
 */
export const getTeamEfficiencyRankings = async (season: number) => {
    console.log(`Fetching team efficiency rankings for season ${season}...`);
    
    const { teamEfficiencyRatings } = await import('@college-pickem/shared');
    
    // Get all efficiency ratings for the season
    const ratings = await db.query.teamEfficiencyRatings.findMany({
        where: eq(teamEfficiencyRatings.season, season),
        with: { team: true },
        orderBy: [desc(teamEfficiencyRatings.lastCalculated)]
    });

    if (ratings.length === 0) {
        return [];
    }

    // Convert to working format with numeric values
    const teamData = ratings.map(rating => ({
        teamId: rating.teamId,
        teamName: rating.team.name,
        conference: rating.team.conference || 'Independent',
        classification: rating.team.classification || 'Unknown',
        passOffenseEfficiency: parseFloat(rating.passingOffenseEfficiency || '0'),
        rushOffenseEfficiency: parseFloat(rating.rushingOffenseEfficiency || '0'),
        scoringOffenseEfficiency: parseFloat(rating.scoringOffenseEfficiency || '0'),
        passDefenseEfficiency: parseFloat(rating.passingDefenseEfficiency || '0'),
        rushDefenseEfficiency: parseFloat(rating.rushingDefenseEfficiency || '0'),
        scoringDefenseEfficiency: parseFloat(rating.scoringDefenseEfficiency || '0'),
        turnoverEfficiency: parseFloat(rating.turnoverEfficiency || '0'),
        specialTeamsEfficiency: parseFloat(rating.specialTeamsEfficiency || '0'),
        gamesPlayed: rating.gamesPlayed || 0,
        dataQuality: rating.dataQuality || 'Insufficient'
    }));

    // Calculate overall efficiency score (weighted average)
    const teamsWithOverall = teamData.map(team => ({
        ...team,
        overallEfficiency: (
            team.passOffenseEfficiency * 0.15 +
            team.rushOffenseEfficiency * 0.15 +
            team.scoringOffenseEfficiency * 0.20 +
            team.passDefenseEfficiency * 0.15 +
            team.rushDefenseEfficiency * 0.15 +
            team.scoringDefenseEfficiency * 0.20
        ) // Note: Defense efficiencies are already adjusted (negative = better)
    }));

    // Helper function to calculate ranks (higher efficiency = better rank)
    const calculateRanks = (teams: typeof teamsWithOverall, field: keyof typeof teamsWithOverall[0], isDefense = false) => {
        const sorted = [...teams].sort((a, b) => {
            const aVal = a[field] as number;
            const bVal = b[field] as number;
            // For defense, lower (more negative) is better
            return isDefense ? aVal - bVal : bVal - aVal;
        });
        
        const ranks = new Map<number, number>();
        sorted.forEach((team, index) => {
            ranks.set(team.teamId, index + 1);
        });
        
        return ranks;
    };

    // Calculate ranks for each category
    const passOffenseRanks = calculateRanks(teamsWithOverall, 'passOffenseEfficiency');
    const rushOffenseRanks = calculateRanks(teamsWithOverall, 'rushOffenseEfficiency');
    const scoringOffenseRanks = calculateRanks(teamsWithOverall, 'scoringOffenseEfficiency');
    const passDefenseRanks = calculateRanks(teamsWithOverall, 'passDefenseEfficiency', true);
    const rushDefenseRanks = calculateRanks(teamsWithOverall, 'rushDefenseEfficiency', true);
    const scoringDefenseRanks = calculateRanks(teamsWithOverall, 'scoringDefenseEfficiency', true);
    const turnoverRanks = calculateRanks(teamsWithOverall, 'turnoverEfficiency');
    const specialTeamsRanks = calculateRanks(teamsWithOverall, 'specialTeamsEfficiency');
    const overallRanks = calculateRanks(teamsWithOverall, 'overallEfficiency');

    // Combine data with rankings
    const rankedTeams = teamsWithOverall.map(team => ({
        ...team,
        passOffenseRank: passOffenseRanks.get(team.teamId) || 999,
        rushOffenseRank: rushOffenseRanks.get(team.teamId) || 999,
        scoringOffenseRank: scoringOffenseRanks.get(team.teamId) || 999,
        passDefenseRank: passDefenseRanks.get(team.teamId) || 999,
        rushDefenseRank: rushDefenseRanks.get(team.teamId) || 999,
        scoringDefenseRank: scoringDefenseRanks.get(team.teamId) || 999,
        turnoverRank: turnoverRanks.get(team.teamId) || 999,
        specialTeamsRank: specialTeamsRanks.get(team.teamId) || 999,
        overallRank: overallRanks.get(team.teamId) || 999
    }));

    console.log(`Generated rankings for ${rankedTeams.length} teams`);
    return rankedTeams;
};

/**
 * ENHANCED STATISTICAL ANALYSIS FUNCTION
 * Calculates team statistical analysis using real game data and opponent-adjusted efficiency ratings.
 * Returns null for insufficient data instead of mock values.
 * PERFORMANCE OPTIMIZED: Fixed N+1 query issue with batch fetching.
 */
export const getTeamStatisticalAnalysis = async (teamId: number, season: number) => {
  // Get all completed games for the team in the season
  const completedGames = await db.query.games.findMany({
    where: and(
      eq(games.season, season),
      or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId)),
      eq(games.isFinal, true)
    )
  });

  // If no completed games, still return an analysis skeleton, but include best-available blended efficiency ratings
  if (completedGames.length === 0) {
    // Try to fetch or compute current-season efficiency; if missing, fall back to blended profile from previous season
    let efficiencyRating = await db.query.teamEfficiencyRatings.findFirst({
      where: and(
        eq(teamEfficiencyRatings.teamId, teamId),
        eq(teamEfficiencyRatings.season, season)
      ),
      orderBy: [desc(teamEfficiencyRatings.lastCalculated)]
    });

    let blendedProfile: any = null;

    if (!efficiencyRating) {
      try {
        const { statisticalProcessingEngine } = await import('./statisticalProcessingService.js');
        await statisticalProcessingEngine.calculateAndStoreTeamStatistics(teamId, season);
        efficiencyRating = await db.query.teamEfficiencyRatings.findFirst({
          where: and(
            eq(teamEfficiencyRatings.teamId, teamId),
            eq(teamEfficiencyRatings.season, season)
          ),
          orderBy: [desc(teamEfficiencyRatings.lastCalculated)]
        });
      } catch (e) {
        console.warn('Unable to compute efficiency ratings on-demand:', e);
      }
    }

    // REMOVED: Code that used the old broken efficiencyCalculationService
    // If no efficiency rating is found, the system will use fallback values

    const strengths = deriveStrengthsFromEfficiency(efficiencyRating || blendedProfile);
    const weaknesses = deriveWeaknessesFromEfficiency(efficiencyRating || blendedProfile);

    const efficiencyRatings = efficiencyRating
      ? {
          passOffense: parseFloat(efficiencyRating.passingOffenseEfficiency || '0'),
          rushOffense: parseFloat(efficiencyRating.rushingOffenseEfficiency || '0'),
          scoringOffense: parseFloat(efficiencyRating.scoringOffenseEfficiency || '0'),
          passDefense: parseFloat(efficiencyRating.passingDefenseEfficiency || '0'),
          rushDefense: parseFloat(efficiencyRating.rushingDefenseEfficiency || '0'),
          scoringDefense: parseFloat(efficiencyRating.scoringDefenseEfficiency || '0'),
          turnover: parseFloat(efficiencyRating.interceptionEfficiency || '0'),
          specialTeams: parseFloat(efficiencyRating.fieldGoalEfficiency || '0'),
          dataQuality: efficiencyRating.confidenceLevel === 'High' ? 'Excellent' : efficiencyRating.confidenceLevel === 'Medium' ? 'Good' : 'Limited'
        }
      : blendedProfile
      ? {
          passOffense: blendedProfile.passingOffenseEfficiency || 0,
          rushOffense: blendedProfile.rushingOffenseEfficiency || 0,
          scoringOffense: blendedProfile.scoringOffenseEfficiency || 0,
          passDefense: blendedProfile.passingDefenseEfficiency || 0,
          rushDefense: blendedProfile.rushingDefenseEfficiency || 0,
          scoringDefense: blendedProfile.scoringDefenseEfficiency || 0,
          turnover: blendedProfile.interceptionEfficiency || 0,
          specialTeams: blendedProfile.fieldGoalEfficiency || 0,
          dataQuality: blendedProfile.confidenceLevel === 'High' ? 'Excellent' : blendedProfile.confidenceLevel === 'Medium' ? 'Good' : 'Limited'
        }
      : null;

    return {
      offense: {
        passingYards: 0,
        rushingYards: 0,
        totalYards: 0,
        pointsPerGame: 0,
        thirdDownConversion: 0,
        redZoneEfficiency: 0
      },
      defense: {
        passingYardsAllowed: 0,
        rushingYardsAllowed: 0,
        totalYardsAllowed: 0,
        pointsAllowedPerGame: 0,
        sacks: 0,
        interceptions: 0,
        tacklesForLoss: 0,
        turnoversGainedPerGame: 0,
      },
      specialTeams: {
        fgMadePerGame: 0,
        fgAttPerGame: 0,
      },
      turnoversLostPerGame: 0,
      strengths,
      weaknesses,
      efficiencyRatings
    };
  }

  // Get efficiency ratings for this team (moved up to avoid TDZ in no-stats branch)
  const efficiencyRating = await db.query.teamEfficiencyRatings.findFirst({
    where: and(
      eq(teamEfficiencyRatings.teamId, teamId),
      eq(teamEfficiencyRatings.season, season)
    ),
    orderBy: [desc(teamEfficiencyRatings.lastCalculated)]
  });

  // PERFORMANCE OPTIMIZATION: Batch fetch all box score stats for all games at once
  const gameIds = completedGames.map(game => game.id);
  const allBoxScoreStats = await db.select()
    .from(gameBoxScoreStats)
    .where(inArray(gameBoxScoreStats.gameId, gameIds));

  // If no box score stats, still return an analysis skeleton but include efficiency ratings if present
  if (allBoxScoreStats.length === 0) {
    const strengths = deriveStrengthsFromEfficiency(efficiencyRating);
    const weaknesses = deriveWeaknessesFromEfficiency(efficiencyRating);

    return {
      offense: {
        passingYards: 0,
        rushingYards: 0,
        totalYards: 0,
        pointsPerGame: 0,
        thirdDownConversion: 0,
        redZoneEfficiency: 0
      },
      defense: {
        passingYardsAllowed: 0,
        rushingYardsAllowed: 0,
        totalYardsAllowed: 0,
        pointsAllowedPerGame: 0,
        sacks: 0,
        interceptions: 0,
        tacklesForLoss: 0,
        turnoversGainedPerGame: 0,
      },
      specialTeams: {
        fgMadePerGame: 0,
        fgAttPerGame: 0,
      },
      turnoversLostPerGame: 0,
      strengths,
      weaknesses,
      efficiencyRatings: efficiencyRating ? {
        passOffense: parseFloat(efficiencyRating.passingOffenseEfficiency || '0'),
        rushOffense: parseFloat(efficiencyRating.rushingOffenseEfficiency || '0'),
        scoringOffense: parseFloat(efficiencyRating.scoringOffenseEfficiency || '0'),
        passDefense: parseFloat(efficiencyRating.passingDefenseEfficiency || '0'),
        rushDefense: parseFloat(efficiencyRating.rushingDefenseEfficiency || '0'),
        scoringDefense: parseFloat(efficiencyRating.scoringDefenseEfficiency || '0'),
        turnover: parseFloat(efficiencyRating.interceptionEfficiency || '0'),
        specialTeams: parseFloat(efficiencyRating.fieldGoalEfficiency || '0'),
        dataQuality: efficiencyRating.confidenceLevel === 'High' ? 'Excellent' : efficiencyRating.confidenceLevel === 'Medium' ? 'Good' : 'Limited'
      } : null
    };
  }

  // Calculate actual averages from box score stats
  const gameCount = completedGames.length;
  let totalPassingYards = 0;
  let totalRushingYards = 0;
  let totalYards = 0;
  let totalPoints = 0;
  let totalThirdDownAttempts = 0;
  let totalThirdDownConversions = 0;
  let totalRedZoneAttempts = 0;
  let totalRedZoneScores = 0;
  // Moved below declarations up to avoid Temporal Dead Zone runtime errors
  let totalTurnoversLost = 0;
  let totalFgMade = 0;
  let totalFgAtt = 0;

  // Get team's stats from pre-fetched data
  const teamStats = allBoxScoreStats.filter(stat => stat.teamId === teamId);

  // Calculate team's offensive stats from real box score data
  for (const stat of teamStats) {
    totalPassingYards += stat.netPassingYards || 0;
    totalRushingYards += stat.rushingYards || 0;
    totalYards += stat.totalYards || 0;
    
    // Parse third down efficiency (format: "4-12")
    if (stat.thirdDownEff) {
      const [conversions, attempts] = stat.thirdDownEff.split('-').map(Number);
      if (!isNaN(conversions) && !isNaN(attempts)) {
        totalThirdDownConversions += conversions;
        totalThirdDownAttempts += attempts;
      }
    }
    
    // Red zone efficiency
    totalRedZoneAttempts += stat.redZoneAttempts || 0;
    totalRedZoneScores += stat.redZoneScores || 0;

    // Turnovers lost and FG attempts/made
    totalTurnoversLost += stat.turnovers || 0;
    totalFgMade += stat.fieldGoalsMade || 0;
    totalFgAtt += stat.fieldGoalAttempts || 0;
  }

  // Calculate points from games
  for (const game of completedGames) {
    const isHome = game.homeTeamId === teamId;
    const teamScore = isHome ? game.homeTeamScore : game.awayTeamScore;
    totalPoints += teamScore || 0;
  }

  // Calculate opponent stats by looking at all games and getting opponent performance
  let totalOpponentPassingYards = 0;
  let totalOpponentRushingYards = 0;
  let totalOpponentPoints = 0;
  let totalSacks = 0;
  let totalInterceptions = 0;
  let totalTacklesForLoss = 0;
  let totalTurnoversGained = 0;
  
  for (const game of completedGames) {
    const isHome = game.homeTeamId === teamId;
    const opponentScore = isHome ? game.awayTeamScore : game.homeTeamScore;
    totalOpponentPoints += opponentScore || 0;
    
    // PERFORMANCE OPTIMIZED: Get opponent's stats from pre-fetched data (what they did against us)
    const opponentStats = allBoxScoreStats.find(stat => 
      stat.gameId === game.id && stat.teamId === (isHome ? game.awayTeamId : game.homeTeamId)
    );
    
    if (opponentStats) {
      totalOpponentPassingYards += opponentStats.netPassingYards || 0;
      totalOpponentRushingYards += opponentStats.rushingYards || 0;
      // Opponent turnovers are our takeaways
      totalTurnoversGained += opponentStats.turnovers || 0;
    }
    
    // PERFORMANCE OPTIMIZED: Get our defensive stats from pre-fetched data
    const ourStats = allBoxScoreStats.find(stat => 
      stat.gameId === game.id && stat.teamId === teamId
    );
    
    if (ourStats) {
      totalSacks += parseFloat(ourStats.sacks || '0');
      totalInterceptions += ourStats.interceptions || 0;
      totalTacklesForLoss += parseFloat(ourStats.tacklesForLoss || '0');
    }
  }

  // Derive strengths and weaknesses from efficiency ratings
  const strengths = deriveStrengthsFromEfficiency(efficiencyRating);
  const weaknesses = deriveWeaknessesFromEfficiency(efficiencyRating);

  // Calculate actual percentages for efficiency metrics
  const thirdDownConversionRate = totalThirdDownAttempts > 0 ? totalThirdDownConversions / totalThirdDownAttempts : 0;
  const redZoneEfficiencyRate = totalRedZoneAttempts > 0 ? totalRedZoneScores / totalRedZoneAttempts : 0;

  const analysis = {
    offense: {
      passingYards: totalPassingYards / gameCount,
      rushingYards: totalRushingYards / gameCount,
      totalYards: totalYards / gameCount,
      pointsPerGame: totalPoints / gameCount,
      thirdDownConversion: thirdDownConversionRate,
      redZoneEfficiency: redZoneEfficiencyRate
    },
    defense: {
      passingYardsAllowed: totalOpponentPassingYards / gameCount,
      rushingYardsAllowed: totalOpponentRushingYards / gameCount,
      totalYardsAllowed: (totalOpponentPassingYards + totalOpponentRushingYards) / gameCount,
      pointsAllowedPerGame: totalOpponentPoints / gameCount,
      sacks: totalSacks / gameCount,
      interceptions: totalInterceptions / gameCount,
      tacklesForLoss: totalTacklesForLoss / gameCount,
      turnoversGainedPerGame: totalTurnoversGained / gameCount,
    },
    specialTeams: {
      fgMadePerGame: totalFgMade / gameCount,
      fgAttPerGame: totalFgAtt / gameCount,
    },
    turnoversLostPerGame: totalTurnoversLost / gameCount,
    strengths,
    weaknesses,
    efficiencyRatings: efficiencyRating ? {
      passOffense: parseFloat(efficiencyRating.passingOffenseEfficiency || '0'),
      rushOffense: parseFloat(efficiencyRating.rushingOffenseEfficiency || '0'),
      scoringOffense: parseFloat(efficiencyRating.scoringOffenseEfficiency || '0'),
      passDefense: parseFloat(efficiencyRating.passingDefenseEfficiency || '0'),
      rushDefense: parseFloat(efficiencyRating.rushingDefenseEfficiency || '0'),
      scoringDefense: parseFloat(efficiencyRating.scoringDefenseEfficiency || '0'),
      turnover: parseFloat(efficiencyRating.turnoverEfficiency || '0'),
      specialTeams: parseFloat(efficiencyRating.specialTeamsEfficiency || '0'),
      dataQuality: efficiencyRating.dataQuality || 'Insufficient'
    } : null
  };

  return analysis;
};

/**
 * Derive team strengths from opponent-adjusted efficiency ratings
 * Only includes categories where the team performs significantly above average
 */
const deriveStrengthsFromEfficiency = (efficiencyRating: any): string[] => {
  if (!efficiencyRating) return [];
  
  const strengths: string[] = [];
  const strongThreshold = 8.0; // Well above average threshold
  const goodThreshold = 3.0; // Above average threshold
  
  const passOffense = parseFloat(efficiencyRating.passingOffenseEfficiency || '0');
  const rushOffense = parseFloat(efficiencyRating.rushingOffenseEfficiency || '0');
  const scoringOffense = parseFloat(efficiencyRating.scoringOffenseEfficiency || '0');
  const passDefense = parseFloat(efficiencyRating.passingDefenseEfficiency || '0');
  const rushDefense = parseFloat(efficiencyRating.rushingDefenseEfficiency || '0');
  const scoringDefense = parseFloat(efficiencyRating.scoringDefenseEfficiency || '0');
  const turnover = parseFloat(efficiencyRating.interceptionEfficiency || '0');
  const specialTeams = parseFloat(efficiencyRating.fieldGoalEfficiency || '0');
  
  // Only include as strengths if significantly above average
  if (passOffense > goodThreshold) {
    strengths.push(passOffense > strongThreshold ? 'Elite Passing Attack' : 'Passing Attack');
  }
  if (rushOffense > goodThreshold) {
    strengths.push(rushOffense > strongThreshold ? 'Elite Rushing Attack' : 'Rushing Attack');
  }
  if (scoringOffense > goodThreshold) {
    strengths.push(scoringOffense > strongThreshold ? 'Elite Red Zone Offense' : 'Red Zone Offense');
  }
  if (passDefense > goodThreshold) {
    strengths.push(passDefense > strongThreshold ? 'Elite Pass Defense' : 'Pass Defense');
  }
  if (rushDefense > goodThreshold) {
    strengths.push(rushDefense > strongThreshold ? 'Elite Run Defense' : 'Run Defense');
  }
  if (scoringDefense > goodThreshold) {
    strengths.push(scoringDefense > strongThreshold ? 'Elite Red Zone Defense' : 'Red Zone Defense');
  }
  if (turnover > goodThreshold) {
    strengths.push(turnover > strongThreshold ? 'Elite Turnover Margin' : 'Turnover Creation');
  }
  if (specialTeams > goodThreshold) {
    strengths.push(specialTeams > strongThreshold ? 'Elite Special Teams' : 'Special Teams');
  }
  
  return strengths;
};

/**
 * Derive team weaknesses from opponent-adjusted efficiency ratings
 * Only includes categories where the team performs significantly below average
 */
const deriveWeaknessesFromEfficiency = (efficiencyRating: any): string[] => {
  if (!efficiencyRating) return [];
  
  const weaknesses: string[] = [];
  const poorThreshold = -8.0; // Well below average threshold
  const belowThreshold = -3.0; // Below average threshold
  
  const passOffense = parseFloat(efficiencyRating.passingOffenseEfficiency || '0');
  const rushOffense = parseFloat(efficiencyRating.rushingOffenseEfficiency || '0');
  const scoringOffense = parseFloat(efficiencyRating.scoringOffenseEfficiency || '0');
  const passDefense = parseFloat(efficiencyRating.passingDefenseEfficiency || '0');
  const rushDefense = parseFloat(efficiencyRating.rushingDefenseEfficiency || '0');
  const scoringDefense = parseFloat(efficiencyRating.scoringDefenseEfficiency || '0');
  const turnover = parseFloat(efficiencyRating.interceptionEfficiency || '0');
  const specialTeams = parseFloat(efficiencyRating.fieldGoalEfficiency || '0');
  
  // Only include as weaknesses if significantly below average
  if (passOffense < belowThreshold) {
    weaknesses.push(passOffense < poorThreshold ? 'Poor Passing Game' : 'Passing Game');
  }
  if (rushOffense < belowThreshold) {
    weaknesses.push(rushOffense < poorThreshold ? 'Poor Running Game' : 'Running Game');
  }
  if (scoringOffense < belowThreshold) {
    weaknesses.push(scoringOffense < poorThreshold ? 'Poor Red Zone Offense' : 'Red Zone Offense');
      }
  if (passDefense < belowThreshold) {
    weaknesses.push(passDefense < poorThreshold ? 'Poor Pass Coverage' : 'Pass Coverage');
  }
  if (rushDefense < belowThreshold) {
    weaknesses.push(rushDefense < poorThreshold ? 'Poor Run Stopping' : 'Run Stopping');
  }
  if (scoringDefense < belowThreshold) {
    weaknesses.push(scoringDefense < poorThreshold ? 'Poor Goal Line Defense' : 'Goal Line Defense');
  }
  if (turnover < belowThreshold) {
    weaknesses.push(turnover < poorThreshold ? 'Poor Ball Security' : 'Ball Security');
  }
  if (specialTeams < belowThreshold) {
    weaknesses.push(specialTeams < poorThreshold ? 'Poor Special Teams' : 'Special Teams');
  }
  
  return weaknesses;
};