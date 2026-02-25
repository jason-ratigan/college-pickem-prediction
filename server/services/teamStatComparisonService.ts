// server/services/teamStatComparisonService.ts

import { db } from '../db.js';
import { 
  games, 
  gameBoxScoreStats, 
  teams,
  StatCategory,
  OffensiveStatCategory,
  DefensiveStatCategory,
  StatComparisonData,
  StatComparisonResponse,
  StatComparisonSummary
} from '@college-pickem/shared';
import { eq, and, or } from 'drizzle-orm';

// Complete result object (alias for StatComparisonResponse for internal use)
export type StatComparisonResult = StatComparisonResponse;

// =============================================================================
// STAT CATEGORY MAPPING
// =============================================================================

/**
 * Maps offensive categories to their corresponding defensive categories
 */
const STAT_CATEGORY_MAPPING: Record<OffensiveStatCategory, DefensiveStatCategory> = {
  passingOffense: 'passingDefense',
  rushingOffense: 'rushingDefense',
  totalOffense: 'totalDefense',
  scoringOffense: 'scoringDefense',
  thirdDownConversion: 'thirdDownDefense',
  redZoneEfficiency: 'redZoneDefense'
};

/**
 * Maps defensive categories to their corresponding offensive categories
 */
const REVERSE_STAT_CATEGORY_MAPPING: Record<DefensiveStatCategory, OffensiveStatCategory> = {
  passingDefense: 'passingOffense',
  rushingDefense: 'rushingOffense',
  totalDefense: 'totalOffense',
  scoringDefense: 'scoringOffense',
  thirdDownDefense: 'thirdDownConversion',
  redZoneDefense: 'redZoneEfficiency'
};

/**
 * Helper function to map offensive category to defensive category
 * Requirements: 2.1, 2.2, 2.3
 */
export const mapOffensiveToDefensiveCategory = (
  offensiveCategory: OffensiveStatCategory
): DefensiveStatCategory => {
  return STAT_CATEGORY_MAPPING[offensiveCategory];
};

/**
 * Helper function to map defensive category to offensive category
 */
export const mapDefensiveToOffensiveCategory = (
  defensiveCategory: DefensiveStatCategory
): OffensiveStatCategory => {
  return REVERSE_STAT_CATEGORY_MAPPING[defensiveCategory];
};

/**
 * Determine if a stat category is offensive or defensive
 */
const isOffensiveCategory = (category: StatCategory): category is OffensiveStatCategory => {
  return category in STAT_CATEGORY_MAPPING;
};

// =============================================================================
// STAT EXTRACTION FUNCTIONS
// =============================================================================

/**
 * Extract the stat value from box score stats based on category
 */
const extractStatValue = (
  stats: typeof gameBoxScoreStats.$inferSelect,
  category: StatCategory,
  isOffensive: boolean
): number | null => {
  if (isOffensive) {
    switch (category as OffensiveStatCategory) {
      case 'passingOffense':
        return stats.netPassingYards;
      case 'rushingOffense':
        return stats.rushingYards;
      case 'totalOffense':
        return stats.totalYards;
      case 'scoringOffense':
        // Points are in the games table, not box score stats
        return null;
      case 'thirdDownConversion':
        // Parse "4-12" format to percentage
        if (stats.thirdDownEff) {
          const [conversions, attempts] = stats.thirdDownEff.split('-').map(Number);
          if (!isNaN(conversions) && !isNaN(attempts) && attempts > 0) {
            return (conversions / attempts) * 100;
          }
        }
        return null;
      case 'redZoneEfficiency':
        if (stats.redZoneAttempts && stats.redZoneScores && stats.redZoneAttempts > 0) {
          return (stats.redZoneScores / stats.redZoneAttempts) * 100;
        }
        return null;
      default:
        return null;
    }
  } else {
    // For defensive stats, we look at what opponents did against this team
    switch (category as DefensiveStatCategory) {
      case 'passingDefense':
        return stats.netPassingYards;
      case 'rushingDefense':
        return stats.rushingYards;
      case 'totalDefense':
        return stats.totalYards;
      case 'scoringDefense':
        return null;
      case 'thirdDownDefense':
        if (stats.thirdDownEff) {
          const [conversions, attempts] = stats.thirdDownEff.split('-').map(Number);
          if (!isNaN(conversions) && !isNaN(attempts) && attempts > 0) {
            return (conversions / attempts) * 100;
          }
        }
        return null;
      case 'redZoneDefense':
        if (stats.redZoneAttempts && stats.redZoneScores && stats.redZoneAttempts > 0) {
          return (stats.redZoneScores / stats.redZoneAttempts) * 100;
        }
        return null;
      default:
        return null;
    }
  }
};

// =============================================================================
// MAIN SERVICE FUNCTIONS
// =============================================================================

/**
 * Calculate opponent's season average for a defensive category
 * Requirements: 1.3, 1.4, 1.5, 2.1, 2.2, 2.3
 * 
 * Optimized with batch queries and proper JOINs
 */
export const calculateOpponentDefensiveAverage = async (
  opponentId: number,
  season: number,
  category: StatCategory
): Promise<number | null> => {
  try {
    // Determine if we're looking at offensive or defensive category
    const isOffensive = isOffensiveCategory(category);
    
    // Handle scoring categories separately (data comes from games table)
    if (category === 'scoringOffense' || category === 'scoringDefense') {
      const opponentGames = await db.query.games.findMany({
        where: and(
          eq(games.season, season),
          or(
            eq(games.homeTeamId, opponentId),
            eq(games.awayTeamId, opponentId)
          ),
          eq(games.isFinal, true)
        )
      });

      if (opponentGames.length === 0) {
        return null;
      }

      let totalPoints = 0;
      let pointsCount = 0;

      for (const game of opponentGames) {
        const isHome = game.homeTeamId === opponentId;
        
        if (category === 'scoringOffense') {
          const points = isHome ? game.homeTeamScore : game.awayTeamScore;
          if (points !== null) {
            totalPoints += points;
            pointsCount++;
          }
        } else {
          // scoringDefense: points allowed
          const pointsAllowed = isHome ? game.awayTeamScore : game.homeTeamScore;
          if (pointsAllowed !== null) {
            totalPoints += pointsAllowed;
            pointsCount++;
          }
        }
      }

      return pointsCount > 0 ? totalPoints / pointsCount : null;
    }

    // For box score stats, use optimized batch query with JOIN
    // Get all box score stats for the opponent's games in one query
    const opponentGamesWithStats = await db.query.games.findMany({
      where: and(
        eq(games.season, season),
        or(
          eq(games.homeTeamId, opponentId),
          eq(games.awayTeamId, opponentId)
        ),
        eq(games.isFinal, true)
      ),
      with: {
        boxScoreStats: true
      }
    });

    if (opponentGamesWithStats.length === 0) {
      return null;
    }

    const values: number[] = [];

    for (const game of opponentGamesWithStats) {
      const isHome = game.homeTeamId === opponentId;
      
      if (isOffensive) {
        // For offensive stats, get the opponent's offensive performance
        const stats = game.boxScoreStats.find(s => s.teamId === opponentId);
        
        if (stats) {
          const value = extractStatValue(stats, category, true);
          if (value !== null) {
            values.push(value);
          }
        }
      } else {
        // For defensive stats, get what opponents did against this team
        // We need to look at opponent's OFFENSIVE stats (e.g., passing yards they gained)
        const opponentTeamId = isHome ? game.awayTeamId : game.homeTeamId;
        const stats = game.boxScoreStats.find(s => s.teamId === opponentTeamId);
        
        if (stats) {
          // Convert defensive category to offensive to extract the right stat
          // e.g., passingDefense -> look at opponent's passing yards (offensive stat)
          const offensiveCategory = mapDefensiveToOffensiveCategory(category as DefensiveStatCategory);
          const value = extractStatValue(stats, offensiveCategory, true);
          if (value !== null) {
            values.push(value);
          }
        }
      }
    }

    // Calculate average
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  } catch (error) {
    console.error(`Error calculating opponent defensive average for opponent ${opponentId}:`, error);
    throw new Error('Failed to calculate opponent defensive average');
  }
};

/**
 * Get team's performance in a specific stat category vs opponents' averages
 * Requirements: 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 4.4
 * 
 * Optimized with batch queries and proper JOINs to minimize database calls
 */
export const getTeamStatComparison = async (
  teamId: number,
  season: number,
  statCategory: StatCategory
): Promise<StatComparisonResult> => {
  try {
    // Get team information
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId)
    });

    if (!team) {
      throw new Error(`Team with ID ${teamId} not found`);
    }

    // Get all completed games for the team with box score stats in one query
    // This uses JOIN to fetch related data efficiently
    const teamGames = await db.query.games.findMany({
      where: and(
        eq(games.season, season),
        or(
          eq(games.homeTeamId, teamId),
          eq(games.awayTeamId, teamId)
        ),
        eq(games.isFinal, true)
      ),
      with: {
        homeTeam: true,
        awayTeam: true,
        boxScoreStats: true  // Fetch all box score stats with the games
      },
      orderBy: (games, { asc }) => [asc(games.week)]
    });

    // Handle edge case: no games found
    if (teamGames.length === 0) {
      return {
        teamId,
        teamName: team.name,
        season,
        statCategory,
        games: [],
        summary: {
          averageTeamPerformance: 0,
          averageOpponentDefense: 0,
          overallDifference: 0,
          gamesAboveAverage: 0,
          gamesBelowAverage: 0
        }
      };
    }

    // Determine if we're analyzing offensive or defensive performance
    const isOffensive = isOffensiveCategory(statCategory);
    
    // Get the corresponding category for opponent comparison
    const comparisonCategory = isOffensive 
      ? mapOffensiveToDefensiveCategory(statCategory as OffensiveStatCategory)
      : mapDefensiveToOffensiveCategory(statCategory as DefensiveStatCategory);

    // Extract unique opponent IDs for batch processing
    const opponentIds = new Set<number>();
    teamGames.forEach(game => {
      const opponentId = game.homeTeamId === teamId ? game.awayTeamId : game.homeTeamId;
      opponentIds.add(opponentId);
    });

    // Pre-calculate all opponent averages in batch to avoid N+1 queries
    const opponentAveragesMap = new Map<number, number | null>();
    await Promise.all(
      Array.from(opponentIds).map(async (opponentId) => {
        const average = await calculateOpponentDefensiveAverage(
          opponentId,
          season,
          comparisonCategory
        );
        opponentAveragesMap.set(opponentId, average);
      })
    );

    // Build game-by-game comparison data
    const comparisonData: StatComparisonData[] = [];
    
    for (const game of teamGames) {
      const isHome = game.homeTeamId === teamId;
      const opponent = isHome ? game.awayTeam : game.homeTeam;
      const opponentId = opponent.id;

      // Get team's performance in this game
      let teamPerformance: number | null = null;
      
      if (statCategory === 'scoringOffense') {
        teamPerformance = isHome ? game.homeTeamScore : game.awayTeamScore;
      } else if (statCategory === 'scoringDefense') {
        teamPerformance = isHome ? game.awayTeamScore : game.homeTeamScore;
      } else {
        // Use pre-fetched box score stats instead of separate queries
        if (isOffensive) {
          // Get team's offensive stats from the already-loaded data
          const teamStats = game.boxScoreStats.find(s => s.teamId === teamId);
          
          if (teamStats) {
            teamPerformance = extractStatValue(teamStats, statCategory, true);
          }
        } else {
          // Get opponent's offensive stats (what they did against our defense)
          const opponentStats = game.boxScoreStats.find(s => s.teamId === opponentId);
          
          if (opponentStats) {
            teamPerformance = extractStatValue(opponentStats, statCategory, false);
          }
        }
      }

      // Get opponent's season average from pre-calculated map
      const opponentAverage = opponentAveragesMap.get(opponentId) ?? null;

      // Handle edge case: missing box score data
      if (teamPerformance === null) {
        console.warn(`Missing box score data for team ${teamId} in game ${game.id}`);
        continue;
      }

      // Handle edge case: opponent with no other games
      if (opponentAverage === null) {
        console.warn(`No season average available for opponent ${opponentId}`);
        continue;
      }

      // Calculate differences
      const difference = teamPerformance - opponentAverage;
      const percentageDifference = opponentAverage !== 0 
        ? (difference / Math.abs(opponentAverage)) * 100 
        : 0;

      comparisonData.push({
        gameId: game.id,
        week: game.week,
        opponent: {
          id: opponent.id,
          name: opponent.name,
          logoUrl: opponent.logoUrl
        },
        isHomeGame: isHome,
        teamPerformance,
        opponentSeasonAverage: opponentAverage,
        difference,
        percentageDifference,
        gameDate: game.gameTime ? game.gameTime.toISOString() : null
      });
    }

    // Calculate summary statistics
    const summary = calculateSummary(comparisonData);

    return {
      teamId,
      teamName: team.name,
      season,
      statCategory,
      games: comparisonData,
      summary
    };
  } catch (error) {
    console.error(`Error getting team stat comparison for team ${teamId}:`, error);
    throw error;
  }
};

/**
 * Calculate summary statistics from comparison data
 */
const calculateSummary = (data: StatComparisonData[]): StatComparisonSummary => {
  if (data.length === 0) {
    return {
      averageTeamPerformance: 0,
      averageOpponentDefense: 0,
      overallDifference: 0,
      gamesAboveAverage: 0,
      gamesBelowAverage: 0
    };
  }

  const totalTeamPerformance = data.reduce((sum, game) => sum + game.teamPerformance, 0);
  const totalOpponentAverage = data.reduce((sum, game) => sum + game.opponentSeasonAverage, 0);
  const gamesAboveAverage = data.filter(game => game.difference > 0).length;
  const gamesBelowAverage = data.filter(game => game.difference < 0).length;

  const averageTeamPerformance = totalTeamPerformance / data.length;
  const averageOpponentDefense = totalOpponentAverage / data.length;
  const overallDifference = averageTeamPerformance - averageOpponentDefense;

  return {
    averageTeamPerformance,
    averageOpponentDefense,
    overallDifference,
    gamesAboveAverage,
    gamesBelowAverage
  };
};
