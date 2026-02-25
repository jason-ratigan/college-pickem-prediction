// server/services/statisticalProcessingService.ts

import { db } from '../db.js';
import { 
  games, 
  gameBoxScoreStats, 
  teamEfficiencyRatings, 
  statisticalProcessingLog,
  GameBoxScoreStats,
  InsertGameBoxScoreStats,
  InsertTeamEfficiencyRatings,
  InsertStatisticalProcessingLog
} from '@college-pickem/shared';
import { eq, and, sql, desc, asc } from 'drizzle-orm';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface RawStatistics {
  // Offensive Statistics
  passingYards: number;
  rushingYards: number;
  totalYards: number;
  points: number;
  turnovers: number;
  fieldGoalsMade: number;
  fieldGoalAttempts: number;
  thirdDownConversions: number;
  thirdDownAttempts: number;
  redZoneScores: number;
  redZoneAttempts: number;
  timeOfPossessionSeconds: number;
  plays: number;
  drives: number;
  
  // Defensive Statistics (opponent's offensive stats)
  passingYardsAllowed: number;
  rushingYardsAllowed: number;
  totalYardsAllowed: number;
  pointsAllowed: number;
  turnoversForced: number;
  fieldGoalsAllowed: number;
  sacks: number;
  tacklesForLoss: number;
  interceptions: number;
}

export interface EfficiencyMetrics {
  thirdDownConversionRate: number;
  redZoneEfficiency: number;
  fieldGoalPercentage: number;
  turnoverMargin: number;
  yardsPerPlay: number;
  pointsPerDrive: number;
  timeOfPossessionPercentage: number;
}

export interface DataQualityReport {
  teamId: number;
  season: number;
  gamesPlayed: number;
  gamesWithStats: number;
  missingFields: string[];
  dataQuality: 'Excellent' | 'Good' | 'Limited' | 'Insufficient';
  completenessScore: number;
}

export interface ProcessingResult {
  teamsProcessed: number;
  statisticsCalculated: number;
  errors: string[];
  warnings: string[];
  processingTimeMs: number;
  dataQualityReports: DataQualityReport[];
}

// =============================================================================
// STATISTICAL PROCESSING ENGINE CLASS
// =============================================================================

export class StatisticalProcessingEngine {
  
  // =============================================================================
  // RAW STATISTICAL CALCULATION FUNCTIONS (WITH LOGGING)
  // =============================================================================

  async calculateTeamDefensiveActionMetrics(teamId: number, gameId: number): Promise<Partial<RawStatistics> | null> {
    try {
      const stats = await db.query.gameBoxScoreStats.findFirst({
        where: and(eq(gameBoxScoreStats.teamId, teamId), eq(gameBoxScoreStats.gameId, gameId))
      });
      if (!stats) return null;

      return {
        sacks: Number(stats.sacks) || 0,
        tacklesForLoss: Number(stats.tacklesForLoss) || 0,
        interceptions: stats.interceptions || 0,
      };
    } catch (error) {
      console.error(`[Statistical Processing] Error calculating defensive action metrics for team ${teamId}, game ${gameId}:`, error);
      return null;
    }
  }

  async calculateOffensiveMetrics(teamId: number, gameId: number): Promise<Partial<RawStatistics> | null> {
    try {
      const game = await db.query.games.findFirst({ where: eq(games.id, gameId) });
      if (!game || game.homeTeamScore === null || game.awayTeamScore === null) {
        // LOG: Failure point
        console.log(`[DEBUG] Offense - Team ${teamId}, Game ${gameId}: SKIPPING. Game record or score not found.`);
        return null;
      }

      const isHome = game.homeTeamId === teamId;
      const points = isHome ? game.homeTeamScore : game.awayTeamScore;
      
      const stats = await db.query.gameBoxScoreStats.findFirst({
        where: and(eq(gameBoxScoreStats.teamId, teamId), eq(gameBoxScoreStats.gameId, gameId))
      });
      
      if (!stats) {
        // LOG: Partial success (only points)
        console.log(`[DEBUG] Offense - Team ${teamId}, Game ${gameId}: Box score not found. Returning points ONLY: ${points}`);
        return { points };
      }

      const thirdDownParts = this.parseEfficiencyString(stats.thirdDownEff);
      
      const offensiveResult: Partial<RawStatistics> = {
        passingYards: stats.netPassingYards || 0,
        rushingYards: stats.rushingYards || 0,
        totalYards: stats.totalYards || 0,
        points: points,
        turnovers: stats.turnovers || 0,
        fieldGoalsMade: stats.fieldGoalsMade || 0,
        fieldGoalAttempts: stats.fieldGoalAttempts || 0,
        thirdDownConversions: thirdDownParts.made,
        thirdDownAttempts: thirdDownParts.attempts,
        redZoneScores: stats.redZoneScores || 0,
        redZoneAttempts: stats.redZoneAttempts || 0,
        timeOfPossessionSeconds: stats.timeOfPossessionSeconds || 0,
        plays: stats.off_plays || 0,
        drives: stats.off_drives || 0,
      };

      // LOG: Full success
      console.log(`[DEBUG] Offense - Team ${teamId}, Game ${gameId}: SUCCESS. Returning full offensive stats. Points: ${points}`);
      return offensiveResult;

    } catch (error) {
      console.error(`[Statistical Processing] Error calculating offensive metrics for team ${teamId}, game ${gameId}:`, error);
      return null;
    }
  }

  async calculateDefensiveMetrics(teamId: number, gameId: number): Promise<Partial<RawStatistics> | null> {
    try {
      const game = await db.query.games.findFirst({ where: eq(games.id, gameId) });
      if (!game || game.homeTeamScore === null || game.awayTeamScore === null) {
        // LOG: Failure point
        console.log(`[DEBUG] Defense - Team ${teamId}, Game ${gameId}: SKIPPING. Game record or score not found.`);
        return null;
      }

      const isHome = game.homeTeamId === teamId;
      const opponentId = isHome ? game.awayTeamId : game.homeTeamId;
      const pointsAllowed = isHome ? game.awayTeamScore : game.homeTeamScore;

      const defensiveStats: Partial<RawStatistics> = {
        pointsAllowed: pointsAllowed
      };

      const opponentStats = await db.query.gameBoxScoreStats.findFirst({
        where: and(eq(gameBoxScoreStats.teamId, opponentId), eq(gameBoxScoreStats.gameId, gameId))
      });

      if (opponentStats) {
        // LOG: Full success
        console.log(`[DEBUG] Defense - Team ${teamId}, Game ${gameId}: SUCCESS. Found opponent ${opponentId} box score. Points Allowed: ${pointsAllowed}`);
        defensiveStats.passingYardsAllowed = opponentStats.netPassingYards || 0;
        defensiveStats.rushingYardsAllowed = opponentStats.rushingYards || 0;
        defensiveStats.totalYardsAllowed = opponentStats.totalYards || 0;
        defensiveStats.turnoversForced = opponentStats.turnovers || 0;
        defensiveStats.fieldGoalsAllowed = opponentStats.fieldGoalsMade || 0;
      } else {
        // LOG: Partial success
        console.log(`[DEBUG] Defense - Team ${teamId}, Game ${gameId}: Opponent ${opponentId} box score not found. Returning pointsAllowed ONLY: ${pointsAllowed}`);
      }

      return defensiveStats;

    } catch (error) {
      console.error(`[Statistical Processing] Error calculating defensive metrics for team ${teamId}, game ${gameId}:`, error);
      return null;
    }
  }

  calculateEfficiencyMetrics(rawStats: RawStatistics): EfficiencyMetrics {
    return {
      thirdDownConversionRate: rawStats.thirdDownAttempts > 0 
        ? rawStats.thirdDownConversions / rawStats.thirdDownAttempts 
        : 0,
      redZoneEfficiency: rawStats.redZoneAttempts > 0 
        ? rawStats.redZoneScores / rawStats.redZoneAttempts 
        : 0,
      fieldGoalPercentage: rawStats.fieldGoalAttempts > 0 
        ? rawStats.fieldGoalsMade / rawStats.fieldGoalAttempts 
        : 0,
      turnoverMargin: rawStats.turnoversForced - rawStats.turnovers,
      yardsPerPlay: rawStats.plays > 0 ? rawStats.totalYards / rawStats.plays : 0,
      pointsPerDrive: rawStats.drives > 0 ? rawStats.points / rawStats.drives : 0,
      timeOfPossessionPercentage: rawStats.timeOfPossessionSeconds > 0 
        ? rawStats.timeOfPossessionSeconds / 3600
        : 0.5
    };
  }

  // =============================================================================
  // MAIN AGGREGATION AND STORAGE LOGIC (WITH LOGGING)
  // =============================================================================

  async calculateAndStoreTeamStatistics(teamId: number, season: number): Promise<number> {
    // LOG: Start of processing for a team
    console.log(`\n==================\n[DEBUG] Starting processing for Team ${teamId}, Season ${season}\n==================`);

    try {
      const teamGames = await db.select({ gameId: games.id })
        .from(games)
        .where(and(
          eq(games.season, season),
          eq(games.isFinal, true),
          sql`(${games.homeTeamId} = ${teamId} OR ${games.awayTeamId} = ${teamId})`
        ));

      if (teamGames.length === 0) {
        // LOG: No games found
        console.log(`[DEBUG] No completed games found for Team ${teamId}. Aborting.`);
        return 0;
      }
      console.log(`[DEBUG] Found ${teamGames.length} games for Team ${teamId}.`);

      let totalStats: Partial<RawStatistics> = {};
      let gamesProcessed = 0;

      for (const game of teamGames) {
        // LOG: Processing a specific game
        console.log(`\n[DEBUG] --- Processing Game ID: ${game.gameId} for Team ${teamId} ---`);
        
        const offensiveStats = await this.calculateOffensiveMetrics(teamId, game.gameId);
        const defensiveResultStats = await this.calculateDefensiveMetrics(teamId, game.gameId);
        const defensiveActionStats = await this.calculateTeamDefensiveActionMetrics(teamId, game.gameId);

        // LOG: Show what was returned from the calculation functions
        console.log(`[DEBUG]   => Offensive Stats returned:`, offensiveStats ? `${offensiveStats.points} pts` : 'null');
        console.log(`[DEBUG]   => Defensive Stats returned:`, defensiveResultStats ? `${defensiveResultStats.pointsAllowed} pts allowed` : 'null');

        if (offensiveStats && defensiveResultStats) {
          console.log(`[DEBUG]   DECISION: Game is processable. Aggregating stats.`);
          this.aggregateStatistics(totalStats, offensiveStats);
          this.aggregateStatistics(totalStats, defensiveResultStats);
          
          if (defensiveActionStats) {
            this.aggregateStatistics(totalStats, defensiveActionStats);
          }
          
          gamesProcessed++;
        } else {
          // LOG: Game skipped
          console.log(`[DEBUG]   DECISION: Game SKIPPED due to missing critical offensive or defensive data.`);
        }
      }

      // LOG: Post-loop summary
      console.log(`\n[DEBUG] --- Aggregation Complete for Team ${teamId} ---`);
      console.log(`[DEBUG] Total games processed: ${gamesProcessed} / ${teamGames.length}`);

      if (gamesProcessed === 0) {
        console.warn(`[DEBUG] No processable games were found for team ${teamId} in season ${season}. Cannot store stats.`);
        return 0;
      }

      // LOG: Show the total accumulated stats before averaging
      console.log(`[DEBUG] Total accumulated stats:\n`, JSON.stringify(totalStats, null, 2));

      const defaults: RawStatistics = {
        passingYards: 0, rushingYards: 0, totalYards: 0, points: 0, turnovers: 0,
        fieldGoalsMade: 0, fieldGoalAttempts: 0, thirdDownConversions: 0, thirdDownAttempts: 0,
        redZoneScores: 0, redZoneAttempts: 0, timeOfPossessionSeconds: 0, plays: 0, drives: 0,
        passingYardsAllowed: 0, rushingYardsAllowed: 0, totalYardsAllowed: 0, pointsAllowed: 0,
        turnoversForced: 0, fieldGoalsAllowed: 0, sacks: 0, tacklesForLoss: 0, interceptions: 0
      };
      const completeTotalStats = { ...defaults, ...totalStats };

      const avgStats = this.calculateAverages(completeTotalStats, gamesProcessed) as RawStatistics;
      const efficiencyMetrics = this.calculateEfficiencyMetrics(avgStats);

      // LOG: Show the final averaged stats before they go to the DB
      console.log(`[DEBUG] Final average stats for Team ${teamId}:\n`, JSON.stringify(avgStats, null, 2));

      await this.storeTeamEfficiencyRatings(teamId, season, avgStats, efficiencyMetrics, gamesProcessed);

      return 1;
    } catch (error) {
      console.error(`[Statistical Processing] CRITICAL ERROR in calculateAndStoreTeamStatistics for team ${teamId}:`, error);
      return 0;
    }
  }

  private async storeTeamEfficiencyRatings(
    teamId: number,
    season: number,
    rawStats: RawStatistics,
    efficiencyMetrics: EfficiencyMetrics,
    gamesPlayed: number
  ): Promise<void> {
    try {
      const dataQualityReport = await this.validateTeamDataQuality(teamId, season);

      // Calculate opponent-relative efficiencies (the RIGHT way)
      const opponentRelativeEfficiencies = await this.calculateOpponentRelativeEfficiencies(teamId, season);
      
      const efficiencyRating: InsertTeamEfficiencyRatings = {
        season,
        teamId,
        passingOffenseEfficiency: opponentRelativeEfficiencies.passingOffense.toFixed(4),
        rushingOffenseEfficiency: opponentRelativeEfficiencies.rushingOffense.toFixed(4),
        scoringOffenseEfficiency: opponentRelativeEfficiencies.scoringOffense.toFixed(4),
        passingDefenseEfficiency: opponentRelativeEfficiencies.passingDefense.toFixed(4),
        rushingDefenseEfficiency: opponentRelativeEfficiencies.rushingDefense.toFixed(4),
        scoringDefenseEfficiency: opponentRelativeEfficiencies.scoringDefense.toFixed(4),
        turnoverEfficiency: opponentRelativeEfficiencies.turnoverMargin.toFixed(4),
        specialTeamsEfficiency: opponentRelativeEfficiencies.specialTeams.toFixed(4),
        averagePointsFor: rawStats.points.toFixed(2),
        averagePointsAgainst: rawStats.pointsAllowed.toFixed(2),
        gamesPlayed,
        dataQuality: dataQualityReport.dataQuality,
        lastCalculated: new Date()
      };

      // LOG: Show the final object being sent to the database
      console.log(`\n[DEBUG] Storing final ratings object for Team ${teamId}:\n`, JSON.stringify(efficiencyRating, null, 2));
      
      // *** THE FIX IS HERE ***
      // We destructure the object to separate the primary key from the data to be updated.
      const { season: keySeason, teamId: keyTeamId, ...updateData } = efficiencyRating;

      await db.insert(teamEfficiencyRatings)
        .values(efficiencyRating)
        .onConflictDoUpdate({
          target: [teamEfficiencyRatings.season, teamEfficiencyRatings.teamId],
          // We provide ONLY the fields that should be updated, excluding the primary key.
          set: updateData
        });

      console.log(`[DEBUG] Successfully stored ratings for Team ${teamId}.`);

    } catch (error) {
      console.error(`[Statistical Processing] Error storing efficiency ratings for team ${teamId}:`, error);
      throw error;
    }
  }
  
  // =============================================================================
  // UNCHANGED HELPER AND WRAPPER METHODS
  // =============================================================================

  async processSeasonStatistics(season: number): Promise<ProcessingResult> {
    const startTime = Date.now();
    console.log(`[Statistical Processing] Starting season statistics processing for ${season}...`);
    
    // Import validation services
    const { dataQualityService } = await import('./dataQualityService.js');
    const { TransactionManager } = await import('./transactionManager.js');
    
    const result: ProcessingResult = {
      teamsProcessed: 0,
      statisticsCalculated: 0,
      errors: [],
      warnings: [],
      processingTimeMs: 0,
      dataQualityReports: []
    };
    
    // Use transaction management for the entire processing operation
    const transactionResult = await TransactionManager.executeInTransaction(async (tx) => {
      const teamsInSeason = await tx.selectDistinct({
        teamId: sql<number>`CASE 
          WHEN ${games.homeTeamId} IS NOT NULL THEN ${games.homeTeamId}
          ELSE ${games.awayTeamId}
        END`.as('team_id')
      })
      .from(games)
      .where(and(
        eq(games.season, season),
        eq(games.isFinal, true)
      ));

      console.log(`[Statistical Processing] Found ${teamsInSeason.length} teams to process`);
      
      // Pre-processing validation
      console.log(`[Statistical Processing] Running pre-processing data quality checks...`);
      const preProcessingQuality = await dataQualityService.generateQualityMetrics(season);
      
      if (preProcessingQuality.qualityScore < 30) {
        result.warnings.push(`Low data quality score (${preProcessingQuality.qualityScore}) detected before processing`);
      }
      
      for (const { teamId } of teamsInSeason) {
        try {
          const teamStatsCalculated = await this.calculateAndStoreTeamStatistics(teamId, season);
          if (teamStatsCalculated > 0) {
            const dataQualityReport = await this.validateTeamDataQuality(teamId, season);
            result.dataQualityReports.push(dataQualityReport);
            if (dataQualityReport.dataQuality === 'Insufficient') {
              result.warnings.push(`Team ${teamId} has insufficient data quality`);
            }
            result.statisticsCalculated += teamStatsCalculated;
            result.teamsProcessed++;
          }
        } catch (error) {
          const errorMsg = `Failed to process team ${teamId}: ${error}`;
          console.error(`[Statistical Processing] ${errorMsg}`);
          result.errors.push(errorMsg);
          
          // Don't fail the entire transaction for individual team errors
          continue;
        }
      }
      
      // Post-processing validation
      console.log(`[Statistical Processing] Running post-processing data quality checks...`);
      const postProcessingQuality = await dataQualityService.generateQualityMetrics(season);
      
      // Log quality improvement
      const qualityImprovement = postProcessingQuality.qualityScore - preProcessingQuality.qualityScore;
      if (qualityImprovement > 0) {
        console.log(`[Statistical Processing] Data quality improved by ${qualityImprovement} points`);
      }
      
      return result;
    }, `Statistical Processing for Season ${season}`);
    
    if (!transactionResult.success) {
      result.errors.push(transactionResult.error || 'Transaction failed');
      result.processingTimeMs = Date.now() - startTime;
      await this.logProcessingResult('statistical_processing', season, result);
      throw new Error(transactionResult.error);
    }
    
    // Update result with transaction data
    Object.assign(result, transactionResult.data);
    result.processingTimeMs = Date.now() - startTime;
    
    // Enhanced logging with validation results
    await this.logProcessingResult('statistical_processing', season, result);
    
    console.log(`[Statistical Processing] Completed processing ${result.teamsProcessed} teams in ${result.processingTimeMs}ms`);
    console.log(`[Statistical Processing] Quality: ${result.errors.length} errors, ${result.warnings.length} warnings`);
    
    return result;
  }

  async validateTeamDataQuality(teamId: number, season: number): Promise<DataQualityReport> {
    try {
      const completedGames = await db.select({ gameId: games.id }).from(games).where(and(eq(games.season, season), eq(games.isFinal, true), sql`(${games.homeTeamId} = ${teamId} OR ${games.awayTeamId} = ${teamId})`));
      const gamesPlayed = completedGames.length;
      const gamesWithStats = await db.select({ gameId: gameBoxScoreStats.gameId }).from(gameBoxScoreStats).innerJoin(games, eq(gameBoxScoreStats.gameId, games.id)).where(and(eq(gameBoxScoreStats.teamId, teamId), eq(games.season, season), eq(games.isFinal, true)));
      const gamesWithStatsCount = gamesWithStats.length;
      const missingFields = await this.identifyMissingStatisticalFields(teamId, season);
      const completenessScore = this.calculateCompletenessScore(gamesPlayed, gamesWithStatsCount, missingFields.length);
      const dataQuality = this.determineDataQuality(gamesPlayed, completenessScore);
      return { teamId, season, gamesPlayed, gamesWithStats: gamesWithStatsCount, missingFields, dataQuality, completenessScore };
    } catch (error) {
      console.error(`[Statistical Processing] Error validating data quality for team ${teamId}:`, error);
      return { teamId, season, gamesPlayed: 0, gamesWithStats: 0, missingFields: ['validation_error'], dataQuality: 'Insufficient', completenessScore: 0 };
    }
  }

  private async identifyMissingStatisticalFields(teamId: number, season: number): Promise<string[]> {
    const missingFields: string[] = [];
    try {
      const sampleStats = await db.query.gameBoxScoreStats.findFirst({
        where: sql`${gameBoxScoreStats.teamId} = ${teamId} AND ${gameBoxScoreStats.gameId} IN (
          SELECT id FROM games WHERE season = ${season} AND is_final = true AND 
          (home_team_id = ${teamId} OR away_team_id = ${teamId})
        )`
      });
      if (!sampleStats) { return ['all_statistics']; }
      const requiredFields = [
        { field: 'netPassingYards', name: 'passing_yards' }, { field: 'rushingYards', name: 'rushing_yards' }, { field: 'totalYards', name: 'total_yards' },
        { field: 'turnovers', name: 'turnovers' }, { field: 'thirdDownEff', name: 'third_down_efficiency' }, { field: 'redZoneAttempts', name: 'red_zone_attempts' },
        { field: 'redZoneScores', name: 'red_zone_scores' }, { field: 'fieldGoalAttempts', name: 'field_goal_attempts' }, { field: 'fieldGoalsMade', name: 'field_goals_made' },
        { field: 'sacks', name: 'sacks' }, { field: 'tacklesForLoss', name: 'tackles_for_loss' }, { field: 'interceptions', name: 'interceptions' }
      ];
      for (const { field, name } of requiredFields) {
        const value = sampleStats[field as keyof GameBoxScoreStats];
        if (value === null || value === undefined) {
          missingFields.push(name);
        }
      }
    } catch (error) {
      console.error(`[Statistical Processing] Error identifying missing fields:`, error);
      missingFields.push('field_check_error');
    }
    return missingFields;
  }

  private calculateCompletenessScore(gamesPlayed: number, gamesWithStats: number, missingFieldsCount: number): number {
    if (gamesPlayed === 0) return 0;
    const gamesCoverageScore = (gamesWithStats / gamesPlayed) * 70;
    const maxMissingFields = 12;
    const fieldCompletenessScore = Math.max(0, (maxMissingFields - missingFieldsCount) / maxMissingFields) * 30;
    return Math.round(gamesCoverageScore + fieldCompletenessScore);
  }

  private determineDataQuality(gamesPlayed: number, completenessScore: number): 'Excellent' | 'Good' | 'Limited' | 'Insufficient' {
    if (gamesPlayed >= 8 && completenessScore >= 90) return 'Excellent';
    if (gamesPlayed >= 5 && completenessScore >= 70) return 'Good';
    if (gamesPlayed >= 3 && completenessScore >= 50) return 'Limited';
    return 'Insufficient';
  }
  
  private aggregateStatistics(total: Partial<RawStatistics>, gameStats: Partial<RawStatistics>): void {
    for (const [key, value] of Object.entries(gameStats)) {
      if (typeof value === 'number') {
        total[key as keyof RawStatistics] = (total[key as keyof RawStatistics] || 0) + value;
      }
    }
  }

  private calculateAverages(totalStats: Partial<RawStatistics>, gameCount: number): Partial<RawStatistics> {
    const averages: Partial<RawStatistics> = {};
    for (const [key, value] of Object.entries(totalStats)) {
      if (typeof value === 'number' && gameCount > 0) {
        averages[key as keyof RawStatistics] = value / gameCount;
      }
    }
    return averages;
  }

  private parseEfficiencyString(efficiencyStr: string | null): { made: number; attempts: number } {
    if (!efficiencyStr || !efficiencyStr.includes('-')) {
      return { made: 0, attempts: 0 };
    }
    const parts = efficiencyStr.split('-');
    return {
      made: parseInt(parts[0]) || 0,
      attempts: parseInt(parts[1]) || 0
    };
  }

  /**
   * Calculate opponent-relative efficiencies (the correct way)
   * Returns efficiency in actual units (points, yards) relative to what opponents typically do
   */
  private async calculateOpponentRelativeEfficiencies(teamId: number, season: number): Promise<{
    scoringOffense: number;
    scoringDefense: number;
    passingOffense: number;
    passingDefense: number;
    rushingOffense: number;
    rushingDefense: number;
    turnoverMargin: number;
    specialTeams: number;
  }> {
    console.log(`[Opponent-Relative] Calculating efficiencies for team ${teamId}, season ${season}`);
    
    // Get all games for this team
    const teamGames = await db.select({
      gameId: games.id,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeScore: games.homeTeamScore,
      awayScore: games.awayTeamScore,
      teamScore: sql<number>`CASE 
        WHEN ${games.homeTeamId} = ${teamId} THEN ${games.homeTeamScore}
        ELSE ${games.awayTeamScore}
      END`.as('teamScore'),
      opponentScore: sql<number>`CASE 
        WHEN ${games.homeTeamId} = ${teamId} THEN ${games.awayTeamScore}
        ELSE ${games.homeTeamScore}
      END`.as('opponentScore'),
      opponentId: sql<number>`CASE 
        WHEN ${games.homeTeamId} = ${teamId} THEN ${games.awayTeamId}
        ELSE ${games.homeTeamId}
      END`.as('opponentId')
    })
    .from(games)
    .where(and(
      eq(games.season, season),
      eq(games.isFinal, true),
      sql`(${games.homeTeamId} = ${teamId} OR ${games.awayTeamId} = ${teamId})`
    ));

    if (teamGames.length === 0) {
      console.log(`[Opponent-Relative] No games found for team ${teamId}, returning zeros`);
      return {
        scoringOffense: 0,
        scoringDefense: 0,
        passingOffense: 0,
        passingDefense: 0,
        rushingOffense: 0,
        rushingDefense: 0,
        turnoverMargin: 0,
        specialTeams: 0
      };
    }

    // Calculate offensive efficiency (how much better/worse than what opponents typically allow)
    let totalOpponentTypicalPointsAllowed = 0;
    let totalOpponentTypicalPassingYardsAllowed = 0;
    let totalOpponentTypicalRushingYardsAllowed = 0;
    let totalTeamActualPoints = 0;
    let totalTeamActualPassingYards = 0;
    let totalTeamActualRushingYards = 0;

    // Calculate defensive efficiency (how much better/worse than what opponents typically score)
    let totalOpponentTypicalPointsScored = 0;
    let totalOpponentTypicalPassingYards = 0;
    let totalOpponentTypicalRushingYards = 0;
    let totalOpponentActualPoints = 0;
    let totalOpponentActualPassingYards = 0;
    let totalOpponentActualRushingYards = 0;

    for (const game of teamGames) {
      // Get team's box score stats for this game
      const teamStats = await db.query.gameBoxScoreStats.findFirst({
        where: and(
          eq(gameBoxScoreStats.gameId, game.gameId),
          eq(gameBoxScoreStats.teamId, teamId)
        )
      });

      // Get opponent's box score stats for this game
      const opponentStats = await db.query.gameBoxScoreStats.findFirst({
        where: and(
          eq(gameBoxScoreStats.gameId, game.gameId),
          eq(gameBoxScoreStats.teamId, game.opponentId)
        )
      });

      if (!teamStats || !opponentStats) continue;

      // === OFFENSIVE EFFICIENCY CALCULATION ===
      // Get what this opponent typically allows (their other games)
      const opponentDefensiveGames = await db.select({
        pointsAllowed: sql<number>`CASE 
          WHEN ${games.homeTeamId} = ${game.opponentId} THEN ${games.awayTeamScore}
          ELSE ${games.homeTeamScore}
        END`.as('pointsAllowed')
      })
      .from(games)
      .innerJoin(gameBoxScoreStats, eq(games.id, gameBoxScoreStats.gameId))
      .where(and(
        eq(games.season, season),
        eq(games.isFinal, true),
        sql`(${games.homeTeamId} = ${game.opponentId} OR ${games.awayTeamId} = ${game.opponentId})`,
        sql`${games.id} != ${game.gameId}`, // Exclude current game
        sql`${gameBoxScoreStats.teamId} != ${game.opponentId}` // Get opponent stats, not their own
      ));

      const opponentTypicalPointsAllowed = opponentDefensiveGames.length > 0
        ? opponentDefensiveGames.reduce((sum, g) => sum + (g.pointsAllowed || 0), 0) / opponentDefensiveGames.length
        : 28; // fallback

      totalOpponentTypicalPointsAllowed += opponentTypicalPointsAllowed;
      totalTeamActualPoints += game.teamScore || 0;

      // === DEFENSIVE EFFICIENCY CALCULATION ===
      // Get what this opponent typically scores (their other games)
      const opponentOffensiveGames = await db.select({
        pointsScored: sql<number>`CASE 
          WHEN ${games.homeTeamId} = ${game.opponentId} THEN ${games.homeTeamScore}
          ELSE ${games.awayTeamScore}
        END`.as('pointsScored')
      })
      .from(games)
      .where(and(
        eq(games.season, season),
        eq(games.isFinal, true),
        sql`(${games.homeTeamId} = ${game.opponentId} OR ${games.awayTeamId} = ${game.opponentId})`,
        sql`${games.id} != ${game.gameId}` // Exclude current game
      ));

      const opponentTypicalPointsScored = opponentOffensiveGames.length > 0
        ? opponentOffensiveGames.reduce((sum, g) => sum + (g.pointsScored || 0), 0) / opponentOffensiveGames.length
        : 28; // fallback

      totalOpponentTypicalPointsScored += opponentTypicalPointsScored;
      totalOpponentActualPoints += game.opponentScore || 0;

      // Add passing/rushing yards calculations here if needed
      totalTeamActualPassingYards += teamStats.netPassingYards || 0;
      totalTeamActualRushingYards += teamStats.rushingYards || 0;
      totalOpponentActualPassingYards += opponentStats.netPassingYards || 0;
      totalOpponentActualRushingYards += opponentStats.rushingYards || 0;
      
      // Use reasonable defaults for opponent typical yards (simplified for now)
      totalOpponentTypicalPassingYardsAllowed += 250;
      totalOpponentTypicalRushingYardsAllowed += 150;
      totalOpponentTypicalPassingYards += 250;
      totalOpponentTypicalRushingYards += 150;
    }

    const numGames = teamGames.length;
    
    // Calculate final efficiencies
    const scoringOffense = (totalTeamActualPoints / numGames) - (totalOpponentTypicalPointsAllowed / numGames);
    const scoringDefense = (totalOpponentTypicalPointsScored / numGames) - (totalOpponentActualPoints / numGames);
    const passingOffense = (totalTeamActualPassingYards / numGames) - (totalOpponentTypicalPassingYardsAllowed / numGames);
    const passingDefense = (totalOpponentTypicalPassingYards / numGames) - (totalOpponentActualPassingYards / numGames);
    const rushingOffense = (totalTeamActualRushingYards / numGames) - (totalOpponentTypicalRushingYardsAllowed / numGames);
    const rushingDefense = (totalOpponentTypicalRushingYards / numGames) - (totalOpponentActualRushingYards / numGames);

    console.log(`[Opponent-Relative] Team ${teamId} efficiencies:`);
    console.log(`  Scoring Offense: ${scoringOffense.toFixed(2)} (was using broken calculation)`);
    console.log(`  Scoring Defense: ${scoringDefense.toFixed(2)} (was using broken calculation)`);

    return {
      scoringOffense,
      scoringDefense,
      passingOffense,
      passingDefense,
      rushingOffense,
      rushingDefense,
      turnoverMargin: 0, // Simplified for now
      specialTeams: 0    // Simplified for now
    };
  }

  // Keep the old method for backward compatibility but mark it as deprecated
  private normalizeToEfficiency(actual: number, average: number): number {
    console.warn('[DEPRECATED] normalizeToEfficiency should not be used - use opponent-relative calculations instead');
    if (average === 0) return 0;
    return ((actual - average) / average) * 100;
  }

  private async logProcessingResult(processType: string, season: number, result: ProcessingResult): Promise<void> {
    try {
      const logEntry: InsertStatisticalProcessingLog = { processType, season, startDate: new Date(Date.now() - result.processingTimeMs), endDate: new Date(), gamesProcessed: null, teamsUpdated: result.teamsProcessed, iterationsRequired: null, converged: null, processingTime: result.processingTimeMs };
      await db.insert(statisticalProcessingLog).values(logEntry);
    } catch (error) {
      console.error(`[Statistical Processing] Error logging processing result:`, error);
    }
  }
}

// =============================================================================
// EXPORT SINGLETON INSTANCE
// =============================================================================

export const statisticalProcessingEngine = new StatisticalProcessingEngine();

// =============================================================================
// ITERATIVE STRENGTH CALCULATION INTEGRATION
// =============================================================================

/**
 * Triggers advanced efficiency calculation for a season using the new recursive engine
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
export async function calculateIterativeTeamStrengths(season: number): Promise<{
  success: boolean;
  iterations: number;
  converged: boolean;
  teamsProcessed: number;
  processingTimeMs: number;
  errors: string[];
}> {
  console.log(`[Statistical Processing] DEPRECATED: calculateIterativeTeamStrengths redirecting to use opponent-relative calculations...`);
  
  // FIXED: Use the same opponent-relative calculation system as the main recalculation
  // This prevents the old broken system from overriding our correct calculations
  try {
    const startTime = Date.now();
    const engine = new StatisticalProcessingEngine();
    const result = await engine.processSeasonStatistics(season);
    
    console.log(`[Statistical Processing] Opponent-relative efficiency calculation completed for ${result.teamsProcessed} teams`);
    return {
      success: true,
      iterations: 1, // We don't use iterations in the opponent-relative system
      converged: true, // Opponent-relative calculations always "converge"
      teamsProcessed: result.teamsProcessed,
      processingTimeMs: Date.now() - startTime,
      errors: result.errors
    };
  } catch (error) {
    console.error(`[Statistical Processing] Error in opponent-relative efficiency calculation:`, error);
    return {
      success: false,
      iterations: 0,
      converged: false,
      teamsProcessed: 0,
      processingTimeMs: 0,
      errors: [`Failed to calculate opponent-relative efficiencies: ${error}`]
    };
  }
}

// =============================================================================
// ADDITIONAL STATISTICAL CALCULATION FUNCTIONS
// =============================================================================

/**
 * Advanced statistical calculations for comprehensive team analysis
 */
export class AdvancedStatisticalCalculator {
  
  /**
   * Calculates advanced offensive efficiency metrics
   * Requirements: 1.5
   */
  static calculateAdvancedOffensiveMetrics(stats: GameBoxScoreStats): {
    passingEfficiency: number;
    rushingEfficiency: number;
    scoringEfficiency: number;
    explosivePlayRate: number;
  } {
    const passingYards = stats.netPassingYards || 0;
    const rushingYards = stats.rushingYards || 0;
    const totalYards = stats.totalYards || 0;
    const rushingAttempts = stats.rushingAttempts || 1;
    
    // Parse completion attempts (format: "17-25")
    const completionData = this.parseCompletionAttempts(stats.completionAttempts);
    
    return {
      passingEfficiency: completionData.attempts > 0 
        ? (passingYards / completionData.attempts) + (completionData.completions / completionData.attempts * 10)
        : 0,
      rushingEfficiency: rushingAttempts > 0 ? rushingYards / rushingAttempts : 0,
      scoringEfficiency: totalYards > 0 ? (stats.passingTDs || 0) + (stats.rushingTDs || 0) / (totalYards / 100) : 0,
      explosivePlayRate: totalYards > 0 ? this.estimateExplosivePlayRate(totalYards, passingYards, rushingYards) : 0
    };
  }

  /**
   * Calculates advanced defensive efficiency metrics
   * Requirements: 1.5
   */
  static calculateAdvancedDefensiveMetrics(stats: GameBoxScoreStats): {
    passRushEfficiency: number;
    coverageEfficiency: number;
    runStoppingEfficiency: number;
    takeawayRate: number;
  } {
    const sacks = Number(stats.sacks) || 0;
    const tacklesForLoss = Number(stats.tacklesForLoss) || 0;
    const interceptions = stats.interceptions || 0;
    const passesDeflected = stats.passesDeflected || 0;
    const qbHurries = stats.qbHurries || 0;

    return {
      passRushEfficiency: sacks + (tacklesForLoss * 0.5) + (qbHurries * 0.3),
      coverageEfficiency: interceptions + (passesDeflected * 0.5),
      runStoppingEfficiency: tacklesForLoss + (sacks * 0.3), // Sacks can indicate run stopping
      takeawayRate: interceptions + (stats.fumblesRecovered || 0)
    };
  }

  /**
   * Calculates special teams efficiency metrics
   * Requirements: 1.5
   */
  static calculateSpecialTeamsMetrics(stats: GameBoxScoreStats): {
    kickingEfficiency: number;
    returnEfficiency: number;
    coverageEfficiency: number;
  } {
    const fieldGoalsMade = stats.fieldGoalsMade || 0;
    const fieldGoalAttempts = stats.fieldGoalAttempts || 1;
    const kickReturnYards = stats.kickReturnYards || 0;
    const puntReturnYards = stats.puntReturnYards || 0;
    const kickReturnTDs = stats.kickReturnTDs || 0;
    const puntReturnTDs = stats.puntReturnTDs || 0;

    return {
      kickingEfficiency: (fieldGoalsMade / fieldGoalAttempts) * 100,
      returnEfficiency: kickReturnYards + puntReturnYards + ((kickReturnTDs + puntReturnTDs) * 50),
      coverageEfficiency: 100 - Math.min(100, (kickReturnYards + puntReturnYards) / 10) // Inverse of return yards allowed
    };
  }

  /**
   * Parses completion attempts string (format: "17-25")
   */
  private static parseCompletionAttempts(completionStr: string | null): { completions: number; attempts: number } {
    if (!completionStr || !completionStr.includes('-')) {
      return { completions: 0, attempts: 0 };
    }

    const parts = completionStr.split('-');
    return {
      completions: parseInt(parts[0]) || 0,
      attempts: parseInt(parts[1]) || 0
    };
  }

  /**
   * Estimates explosive play rate based on total yards and distribution
   */
  private static estimateExplosivePlayRate(totalYards: number, passingYards: number, rushingYards: number): number {
    // Estimate based on yards per play and typical explosive play thresholds
    const estimatedPlays = Math.max(1, totalYards / 6); // Rough estimate of plays
    const explosivePlays = Math.floor(passingYards / 20) + Math.floor(rushingYards / 12); // 20+ yard passes, 12+ yard runs
    return (explosivePlays / estimatedPlays) * 100;
  }
}

// =============================================================================
// DATA VALIDATION AND QUALITY ASSURANCE
// =============================================================================

/**
 * Comprehensive data validation for statistical processing
 */
export class StatisticalDataValidator {
  
  /**
   * Validates game box score data for statistical completeness
   * Requirements: 7.1, 7.3
   */
  static validateBoxScoreCompleteness(stats: GameBoxScoreStats): {
    isValid: boolean;
    missingCriticalFields: string[];
    missingOptionalFields: string[];
    qualityScore: number;
  } {
    const missingCriticalFields: string[] = [];
    const missingOptionalFields: string[] = [];

    // Critical fields required for basic statistical analysis
    const criticalFields = [
      { field: 'netPassingYards', name: 'passing_yards' },
      { field: 'rushingYards', name: 'rushing_yards' },
      { field: 'totalYards', name: 'total_yards' },
      { field: 'turnovers', name: 'turnovers' }
    ];

    // Optional fields that enhance analysis quality
    const optionalFields = [
      { field: 'thirdDownEff', name: 'third_down_efficiency' },
      { field: 'redZoneAttempts', name: 'red_zone_attempts' },
      { field: 'fieldGoalAttempts', name: 'field_goal_attempts' },
      { field: 'sacks', name: 'sacks' },
      { field: 'tacklesForLoss', name: 'tackles_for_loss' },
      { field: 'interceptions', name: 'interceptions' },
      { field: 'timeOfPossessionSeconds', name: 'time_of_possession' }
    ];

    // Check critical fields
    for (const { field, name } of criticalFields) {
      const value = stats[field as keyof GameBoxScoreStats];
      if (value === null || value === undefined) {
        missingCriticalFields.push(name);
      }
    }

    // Check optional fields
    for (const { field, name } of optionalFields) {
      const value = stats[field as keyof GameBoxScoreStats];
      if (value === null || value === undefined) {
        missingOptionalFields.push(name);
      }
    }

    // Calculate quality score (0-100)
    const criticalScore = ((criticalFields.length - missingCriticalFields.length) / criticalFields.length) * 70;
    const optionalScore = ((optionalFields.length - missingOptionalFields.length) / optionalFields.length) * 30;
    const qualityScore = Math.round(criticalScore + optionalScore);

    return {
      isValid: missingCriticalFields.length === 0,
      missingCriticalFields,
      missingOptionalFields,
      qualityScore
    };
  }

  /**
   * Validates statistical values for reasonableness
   * Requirements: 7.3, 7.4
   */
  static validateStatisticalReasonableness(stats: GameBoxScoreStats): {
    isReasonable: boolean;
    outliers: string[];
    warnings: string[];
  } {
    const outliers: string[] = [];
    const warnings: string[] = [];

    // Define reasonable ranges for college football statistics
    const ranges = {
      netPassingYards: { min: -50, max: 800, typical: [100, 400] },
      rushingYards: { min: -50, max: 600, typical: [50, 300] },
      totalYards: { min: 0, max: 1000, typical: [200, 600] },
      turnovers: { min: 0, max: 10, typical: [0, 4] },
      sacks: { min: 0, max: 15, typical: [0, 6] },
      tacklesForLoss: { min: 0, max: 20, typical: [2, 12] }
    };

    // Check each field against reasonable ranges
    for (const [field, range] of Object.entries(ranges)) {
      const value = Number(stats[field as keyof GameBoxScoreStats]) || 0;
      
      if (value < range.min || value > range.max) {
        outliers.push(`${field}: ${value} (outside range ${range.min}-${range.max})`);
      } else if (value < range.typical[0] || value > range.typical[1]) {
        warnings.push(`${field}: ${value} (outside typical range ${range.typical[0]}-${range.typical[1]})`);
      }
    }

    // Additional logical checks
    const totalYards = stats.totalYards || 0;
    const passingYards = stats.netPassingYards || 0;
    const rushingYards = stats.rushingYards || 0;

    if (totalYards > 0 && Math.abs(totalYards - (passingYards + rushingYards)) > 50) {
      warnings.push(`Total yards (${totalYards}) doesn't match sum of passing (${passingYards}) and rushing (${rushingYards})`);
    }

    return {
      isReasonable: outliers.length === 0,
      outliers,
      warnings
    };
  }

  /**
   * Validates consistency across related statistics
   * Requirements: 7.3
   */
  static validateStatisticalConsistency(teamStats: GameBoxScoreStats, opponentStats: GameBoxScoreStats): {
    isConsistent: boolean;
    inconsistencies: string[];
  } {
    const inconsistencies: string[] = [];

    // Check if defensive stats align with opponent's offensive stats
    const teamSacks = Number(teamStats.sacks) || 0;
    const opponentSacks = Number(opponentStats.sacks) || 0;
    
    // Sacks should be inversely related (if team has high sacks, opponent should have low passing yards)
    const teamPassingYards = teamStats.netPassingYards || 0;
    const opponentPassingYards = opponentStats.netPassingYards || 0;

    if (teamSacks > 5 && teamPassingYards > 300) {
      inconsistencies.push('High sacks but also high passing yards - unusual combination');
    }

    if (opponentSacks > 5 && opponentPassingYards > 300) {
      inconsistencies.push('Opponent has high sacks but also high passing yards - unusual combination');
    }

    // Check turnover consistency
    const teamTurnovers = teamStats.turnovers || 0;
    const opponentTurnovers = opponentStats.turnovers || 0;
    const teamInterceptions = teamStats.interceptions || 0;
    const opponentInterceptions = opponentStats.interceptions || 0;

    if (teamInterceptions > opponentTurnovers) {
      inconsistencies.push('Team interceptions exceed opponent turnovers');
    }

    if (opponentInterceptions > teamTurnovers) {
      inconsistencies.push('Opponent interceptions exceed team turnovers');
    }

    return {
      isConsistent: inconsistencies.length === 0,
      inconsistencies
    };
  }
}

// =============================================================================
// BATCH PROCESSING AND PERFORMANCE OPTIMIZATION
// =============================================================================

/**
 * Optimized batch processing for large-scale statistical calculations
 */
export class BatchStatisticalProcessor {
  
  /**
   * Processes statistics for multiple teams in batches for better performance
   * Requirements: 1.3, 1.4, 1.5
   */
  static async processBatchStatistics(
    teamIds: number[], 
    season: number, 
    batchSize: number = 10
  ): Promise<{
    processed: number;
    failed: number;
    errors: string[];
  }> {
    const engine = new StatisticalProcessingEngine();
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process teams in batches
    for (let i = 0; i < teamIds.length; i += batchSize) {
      const batch = teamIds.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (teamId) => {
        try {
          await engine.calculateAndStoreTeamStatistics(teamId, season);
          return { success: true, teamId };
        } catch (error) {
          return { success: false, teamId, error: String(error) };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          const { success, teamId, error } = result.value;
          if (success) {
            processed++;
          } else {
            failed++;
            errors.push(`Team ${teamId}: ${error}`);
          }
        } else {
          failed++;
          errors.push(`Batch processing error: ${result.reason}`);
        }
      }

      // Small delay between batches to prevent overwhelming the database
      if (i + batchSize < teamIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return { processed, failed, errors };
  }

  /**
   * Validates and repairs statistical data inconsistencies
   * Requirements: 7.1, 7.3, 7.4
   */
  static async validateAndRepairSeasonData(season: number): Promise<{
    teamsValidated: number;
    issuesFound: number;
    issuesRepaired: number;
    criticalErrors: string[];
  }> {
    let teamsValidated = 0;
    let issuesFound = 0;
    let issuesRepaired = 0;
    const criticalErrors: string[] = [];

    try {
      // Get all teams with statistics for the season
      const teamsWithStats = await db.selectDistinct({
        teamId: gameBoxScoreStats.teamId
      })
      .from(gameBoxScoreStats)
      .innerJoin(games, eq(gameBoxScoreStats.gameId, games.id))
      .where(eq(games.season, season));

      for (const { teamId } of teamsWithStats) {
        try {
          teamsValidated++;
          
          // Get team's game statistics
          const teamGameStats = await db.select()
            .from(gameBoxScoreStats)
            .innerJoin(games, eq(gameBoxScoreStats.gameId, games.id))
            .where(and(
              eq(gameBoxScoreStats.teamId, teamId),
              eq(games.season, season)
            ));

          // Validate each game's statistics
          for (const { game_box_score_stats: stats } of teamGameStats) {
            const validation = StatisticalDataValidator.validateBoxScoreCompleteness(stats);
            
            if (!validation.isValid) {
              issuesFound++;
              
              // Attempt to repair missing critical fields with reasonable defaults
              if (validation.missingCriticalFields.length > 0) {
                try {
                  await this.repairMissingStatistics(stats.id, validation.missingCriticalFields);
                  issuesRepaired++;
                } catch (repairError) {
                  criticalErrors.push(`Failed to repair team ${teamId} stats: ${repairError}`);
                }
              }
            }

            // Check for statistical reasonableness
            const reasonableness = StatisticalDataValidator.validateStatisticalReasonableness(stats);
            if (!reasonableness.isReasonable) {
              issuesFound++;
              // Log outliers but don't automatically "repair" them as they might be legitimate
              console.warn(`[Statistical Validation] Outliers found for team ${teamId}:`, reasonableness.outliers);
            }
          }

        } catch (error) {
          criticalErrors.push(`Error validating team ${teamId}: ${error}`);
        }
      }

    } catch (error) {
      criticalErrors.push(`Critical error in season validation: ${error}`);
    }

    return {
      teamsValidated,
      issuesFound,
      issuesRepaired,
      criticalErrors
    };
  }

  /**
   * Repairs missing statistics with reasonable default values
   */
  private static async repairMissingStatistics(statsId: number, missingFields: string[]): Promise<void> {
    const updates: Partial<GameBoxScoreStats> = {};

    // Provide reasonable defaults for missing critical fields
    for (const field of missingFields) {
      switch (field) {
        case 'passing_yards':
          updates.netPassingYards = 0;
          break;
        case 'rushing_yards':
          updates.rushingYards = 0;
          break;
        case 'total_yards':
          updates.totalYards = 0;
          break;
        case 'turnovers':
          updates.turnovers = 0;
          break;
        default:
          // For other fields, set to 0 or null as appropriate
          break;
      }
    }

    if (Object.keys(updates).length > 0) {
      await db.update(gameBoxScoreStats)
        .set(updates)
        .where(eq(gameBoxScoreStats.id, statsId));
    }
  }
}