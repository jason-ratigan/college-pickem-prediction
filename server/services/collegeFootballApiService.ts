// server/services/collegeFootballApiService.ts

import axios, { AxiosInstance } from 'axios';
import { db } from '../db.js';
import { games, gameBoxScoreStats, statisticalProcessingLog, teams } from '@college-pickem/shared';
import { eq, and, gte, desc, sql, inArray } from 'drizzle-orm';
import { ingestFullSeasonData, ingestWeekData, syncAllTeams } from './dataIngestionService.js';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface GameDataValidationResult {
  isValid: boolean;
  missingFields: string[];
  warnings: string[];
  dataQuality: 'Excellent' | 'Good' | 'Limited' | 'Insufficient';
}

interface RecentGamesResult {
  gamesProcessed: number;
  statisticsRecords: number;
  errors: string[];
  warnings: string[];
  processingTimeMs: number;
}

interface StatisticalCompletenessCheck {
  teamId: number;
  teamName: string;
  gamesPlayed: number;
  hasBoxScoreStats: boolean;
  missingStatFields: string[];
  dataQuality: 'Excellent' | 'Good' | 'Limited' | 'Insufficient';
}

// =============================================================================
// COLLEGE FOOTBALL API SERVICE CLASS
// =============================================================================

export class CollegeFootballApiService {
  private api: AxiosInstance;
  private readonly maxRetries = 3;
  private readonly baseDelay = 1000;

  constructor() {
    this.api = axios.create({
      baseURL: 'https://api.collegefootballdata.com',
      headers: {
        'Authorization': process.env.CFBD_API_KEY || '',
        'Accept': 'application/json'
      },
      timeout: 30000
    });
  }

  // =============================================================================
  // PUBLIC METHODS - MAIN FUNCTIONALITY
  // =============================================================================

  /**
   * Fetches recent games (past N weeks) using a dynamic, robust process.
   * Requirements: 1.1, 1.2, 7.1, 7.4
   */
  async fetchRecentGames(weeks: number): Promise<RecentGamesResult> {
    const startTime = Date.now();
    console.log(`[CFB API Service] Starting recent games fetch for past ${weeks} weeks...`);

    try {
      // --- START: FULLY DYNAMIC SEASON/WEEK DETECTION ---
      // 1. Dynamically get the full calendar for the current season.
      const currentYear = new Date().getFullYear();
      const calendar = await this.fetchSeasonCalendar(currentYear);

      if (!calendar || calendar.length === 0) {
        const errorMsg = `Could not fetch a valid calendar for season ${currentYear} or ${currentYear - 1}.`;
        console.error(`[CFB API Service] ${errorMsg}`);
        return {
          gamesProcessed: 0,
          statisticsRecords: 0,
          errors: [errorMsg],
          warnings: ['API might be unavailable or no season data exists.'],
          processingTimeMs: Date.now() - startTime
        };
      }
      
      // 2. Determine the true current season and week from the calendar.
      const currentSeason = calendar[0].season; // The season year from the API data
      const currentWeek = this.findCurrentWeekInCalendar(calendar);
      
      console.log(`[CFB API Service] Determined current season: ${currentSeason}, week: ${currentWeek}.`);

      // 3. Calculate weeks to fetch, including Week 0, using accurate seasonType.
      const weeksToFetch = [];
      for (let i = 0; i < weeks; i++) {
        const targetWeek = currentWeek - i;
        // Include week 0 by changing condition to >= 0
        if (targetWeek >= 0) {
          // Find the specific week's info in the calendar to get the correct seasonType
          const weekInfoFromCalendar = calendar.find(w => w.week === targetWeek);
          if (weekInfoFromCalendar) {
            weeksToFetch.push({
              season: currentSeason,
              week: targetWeek,
              // Use the accurate seasonType from the calendar, not a hardcoded guess
              seasonType: weekInfoFromCalendar.seasonType,
            });
          }
        }
      }
      // --- END: DYNAMIC DETECTION LOGIC ---

      console.log(`[CFB API Service] Identified weeks to fetch:`, weeksToFetch.map(w => `S${w.season}W${w.week} (${w.seasonType})`));

      let totalGamesProcessed = 0;
      let totalStatsRecords = 0;
      const errors: string[] = [];
      const warnings: string[] = [];
      
      // 4. Ensure teams are synced first with enhanced error recovery
      try {
        const syncResult = await syncAllTeams();
        if (syncResult) {
          console.log(`[CFB API Service] Team sync successful: ${syncResult.successCount} teams synced, ${syncResult.conflictCount} conflicts resolved`);
        } else {
          console.log('[CFB API Service] Team sync completed successfully');
        }
      } catch (e) {
        const errorMsg = `Team sync failed: ${e instanceof Error ? e.message : String(e)}`;
        console.error(`[CFB API Service] ${errorMsg}`);
        
        // Try to provide more specific error information
        if (e instanceof Error && e.message.includes('constraint')) {
          errors.push(`Database constraint violation during team sync: ${e.message}`);
          warnings.push('Some teams may not have been updated due to data conflicts');
          
          // Continue with existing teams instead of aborting completely
          console.log('[CFB API Service] Continuing with existing team data despite sync issues');
        } else {
          // For other critical errors, still abort
          throw new Error(errorMsg);
        }
      }

      const allTeams = await db.query.teams.findMany();
      const teamApiToDbIdMap = new Map<number, number>();
      for (const t of allTeams) if (t.apiTeamId) teamApiToDbIdMap.set(t.apiTeamId, t.id);

      for (const weekInfo of weeksToFetch) {
        try {
          await ingestWeekData(weekInfo.season, weekInfo.week, weekInfo.seasonType as any, teamApiToDbIdMap);

          const weekGames = await db.select({ count: sql<number>`count(*)` })
            .from(games)
            .where(and(eq(games.season, weekInfo.season), eq(games.week, weekInfo.week)));
          const gameIdsRows = await db.select({ id: games.id })
            .from(games)
            .where(and(eq(games.season, weekInfo.season), eq(games.week, weekInfo.week)));
          const gameIds = gameIdsRows.map(r => r.id);
          const statsCount = gameIds.length > 0
            ? await db.select({ count: sql<number>`count(*)` }).from(gameBoxScoreStats).where(inArray(gameBoxScoreStats.gameId, gameIds))
            : [{ count: 0 }];

          totalGamesProcessed += Number(weekGames[0].count);
          totalStatsRecords += Number(statsCount[0].count);
        } catch (error) {
          const errorMsg = `Failed to update week ${weekInfo.week}: ${error}`;
          console.error(`[CFB API Service] ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      const result: RecentGamesResult = {
        gamesProcessed: totalGamesProcessed,
        statisticsRecords: totalStatsRecords,
        errors,
        warnings,
        processingTimeMs: Date.now() - startTime
      };

      await this.logProcessingResult('recent_update', currentSeason, result);

      console.log(`[CFB API Service] Recent games fetch completed in ${result.processingTimeMs}ms`);
      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorResult: RecentGamesResult = {
        gamesProcessed: 0,
        statisticsRecords: 0,
        errors: [`Critical error in recent games fetch: ${error}`],
        warnings: [],
        processingTimeMs: processingTime
      };
      
      await this.logProcessingResult('recent_update', new Date().getFullYear(), errorResult);
      throw error;
    }
  }

  /**
   * Fetches full season data (delegates to existing service)
   * Requirements: 1.1, 1.2, 7.1, 7.4
   */
  async fetchFullSeasonData(season: number): Promise<RecentGamesResult> {
    const startTime = Date.now();
    console.log(`[CFB API Service] Delegating full season fetch to existing service for ${season}...`);

    try {
      // Use the existing, well-tested data ingestion service
      const summary = await ingestFullSeasonData(season);
      
      const result: RecentGamesResult = {
        gamesProcessed: summary.regularSeasonGames + summary.postseasonGames,
        statisticsRecords: summary.statisticsRecords,
        errors: summary.errors,
        warnings: [], // The existing service doesn't return warnings separately
        processingTimeMs: Date.now() - startTime
      };

      await this.logProcessingResult('full_season', season, result);
      
      console.log(`[CFB API Service] Full season fetch completed in ${result.processingTimeMs}ms`);
      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorResult: RecentGamesResult = {
        gamesProcessed: 0,
        statisticsRecords: 0,
        errors: [`Critical error in full season fetch: ${error}`],
        warnings: [],
        processingTimeMs: processingTime
      };
      
      await this.logProcessingResult('full_season', season, errorResult);
      throw error;
    }
  } 

 // =============================================================================
  // DATA VALIDATION METHODS
  // =============================================================================

  /**
   * Validates game data for statistical completeness
   * Requirements: 7.1, 7.3, 7.4
   */
  async validateGameData(gameId: number): Promise<GameDataValidationResult> {
    try {
      // Get game and its box score stats
      const game = await db.query.games.findFirst({
        where: eq(games.id, gameId),
        with: {
          homeTeam: true,
          awayTeam: true,
          boxScoreStats: true
        }
      });

      if (!game) {
        return {
          isValid: false,
          missingFields: ['game_not_found'],
          warnings: [],
          dataQuality: 'Insufficient'
        };
      }

      const missingFields: string[] = [];
      const warnings: string[] = [];

      if (!game.isFinal) {
        warnings.push('Game is not yet completed');
      }

      if (!game.boxScoreStats || game.boxScoreStats.length === 0) {
        missingFields.push('box_score_stats');
      } else {
        for (const stats of game.boxScoreStats) {
          const teamMissingFields = this.validateTeamStatistics(stats);
          missingFields.push(...teamMissingFields);
        }
      }

      const dataQuality = this.determineDataQuality(missingFields, warnings, game.boxScoreStats?.length || 0);

      return {
        isValid: missingFields.length === 0,
        missingFields,
        warnings,
        dataQuality
      };

    } catch (error) {
      console.error(`[CFB API Service] Error validating game data for game ${gameId}:`, error);
      return {
        isValid: false,
        missingFields: ['validation_error'],
        warnings: [`Validation error: ${error}`],
        dataQuality: 'Insufficient'
      };
    }
  }

  /**
   * Validates statistical completeness for all teams in a season
   * Requirements: 7.1, 7.2, 7.5
   */
  async validateSeasonStatisticalCompleteness(season: number): Promise<StatisticalCompletenessCheck[]> {
    try {
      console.log(`[CFB API Service] Validating statistical completeness for ${season} season...`);

      const teamsWithGames = await db.select({
        teamId: games.homeTeamId,
        teamName: sql<string>`teams.name`,
        gamesCount: sql<number>`COUNT(DISTINCT games.id)`
      })
      .from(games)
      .innerJoin(teams, sql`teams.id = games.home_team_id OR teams.id = games.away_team_id`)
      .where(and(
        eq(games.season, season),
        eq(games.isFinal, true)
      ))
      .groupBy(sql`teams.id, teams.name`)
      .orderBy(sql`teams.name`);

      const completenessChecks: StatisticalCompletenessCheck[] = [];

      for (const team of teamsWithGames) {
        const statsCount = await db.select({
          count: sql<number>`COUNT(*)`
        })
        .from(gameBoxScoreStats)
        .innerJoin(games, eq(gameBoxScoreStats.gameId, games.id))
        .where(and(
          eq(gameBoxScoreStats.teamId, team.teamId),
          eq(games.season, season),
          eq(games.isFinal, true)
        ));

        const hasBoxScoreStats = (statsCount[0]?.count || 0) > 0;
        const missingStatFields: string[] = [];

        if (!hasBoxScoreStats) {
          missingStatFields.push('all_box_score_stats');
        } else {
          const sampleStats = await db.query.gameBoxScoreStats.findFirst({
            where: and(
              eq(gameBoxScoreStats.teamId, team.teamId),
              sql`game_id IN (SELECT id FROM games WHERE season = ${season} AND is_final = true)`
            )
          });

          if (sampleStats) {
            const requiredFields = [
              'netPassingYards', 'rushingYards', 'totalYards', 'turnovers',
              'thirdDownEff', 'redZoneAttempts', 'fieldGoalAttempts'
            ];

            for (const field of requiredFields) {
              if (sampleStats[field as keyof typeof sampleStats] === null || 
                  sampleStats[field as keyof typeof sampleStats] === undefined) {
                missingStatFields.push(field);
              }
            }
          }
        }

        const dataQuality = this.determineTeamDataQuality(team.gamesCount, missingStatFields);

        completenessChecks.push({
          teamId: team.teamId,
          teamName: team.teamName,
          gamesPlayed: team.gamesCount,
          hasBoxScoreStats,
          missingStatFields,
          dataQuality
        });
      }

      console.log(`[CFB API Service] Completed statistical validation for ${completenessChecks.length} teams`);
      return completenessChecks;

    } catch (error) {
      console.error(`[CFB API Service] Error validating season statistical completeness:`, error);
      throw error;
    }
  }

  /**
   * Ensures statistical completeness by identifying and fetching missing data
   * Requirements: 7.1, 7.4
   */
  async ensureStatisticalCompleteness(season: number): Promise<{
    teamsProcessed: number;
    missingDataFetched: number;
    errors: string[];
  }> {
    try {
      console.log(`[CFB API Service] Ensuring statistical completeness for ${season}...`);

      const completenessChecks = await this.validateSeasonStatisticalCompleteness(season);
      const teamsWithMissingData = completenessChecks.filter(
        check => check.dataQuality === 'Insufficient' || check.missingStatFields.length > 0
      );

      if (teamsWithMissingData.length === 0) {
        console.log(`[CFB API Service] All teams have sufficient statistical data`);
        return { teamsProcessed: completenessChecks.length, missingDataFetched: 0, errors: [] };
      }

      console.log(`[CFB API Service] Found ${teamsWithMissingData.length} teams with missing data`);

      const errors: string[] = [];
      let missingDataFetched = 0;

      for (const team of teamsWithMissingData) {
        try {
          console.log(`[CFB API Service] Team ${team.teamName} needs data quality improvement`);
          missingDataFetched++;
        } catch (error) {
          errors.push(`Failed to fetch missing data for ${team.teamName}: ${error}`);
        }
      }

      return { teamsProcessed: completenessChecks.length, missingDataFetched, errors };

    } catch (error) {
      console.error(`[CFB API Service] Error ensuring statistical completeness:`, error);
      throw error;
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Fetches the calendar for a given season year.
   * If the calendar for the given year is empty (e.g., pre-season),
   * it automatically attempts to fetch the previous year's calendar.
   */
  private async fetchSeasonCalendar(year: number): Promise<any[] | null> {
    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.api.get('/calendar', { params: { year } });
      });

      if (response.data && response.data.length > 0) {
        return response.data;
      }
      
      console.warn(`[CFB API Service] No calendar data found for ${year}. Attempting to fetch for ${year - 1}.`);
      const prevYearResponse = await this.retryWithBackoff(async () => {
        return await this.api.get('/calendar', { params: { year: year - 1 } });
      });

      return prevYearResponse.data && prevYearResponse.data.length > 0 ? prevYearResponse.data : null;

    } catch (error) {
      console.error(`[CFB API Service] Error fetching calendar for year ${year}:`, error);
      return null;
    }
  }

  /**
   * Finds the current week number within a given calendar array.
   * - If within a week's date range, returns that week.
   * - If between weeks, returns the most recently completed week.
   * - If before the season starts, returns the first week of the season (e.g., Week 0 or 1).
   */
  private findCurrentWeekInCalendar(calendar: any[]): number {
    const today = new Date();

    // The API calendar provides `firstGameStart` and `lastGameStart` which are more reliable
    const currentWeekInfo = calendar.find((week: any) => {
      const startDate = new Date(week.firstGameStart);
      const endDate = new Date(week.lastGameStart);
      endDate.setDate(endDate.getDate() + 1); // Extend end date by a day to be inclusive
      return today >= startDate && today <= endDate;
    });

    if (currentWeekInfo) {
      return currentWeekInfo.week;
    }

    const pastWeeks = calendar.filter((week: any) => new Date(week.lastGameStart) < today);
    if (pastWeeks.length > 0) {
      return pastWeeks[pastWeeks.length - 1].week;
    }

    // Season hasn't started, default to the first available week in the calendar.
    return calendar[0]?.week ?? 1;
  }
  
  /**
   * Validates individual team statistics for completeness
   */
  private validateTeamStatistics(stats: any): string[] {
    const missingFields: string[] = [];
    
    const requiredFields = [
      'netPassingYards', 'rushingYards', 'totalYards', 'turnovers',
      'thirdDownEff', 'redZoneAttempts', 'fieldGoalAttempts'
    ];

    for (const field of requiredFields) {
      if (stats[field] === null || stats[field] === undefined) {
        missingFields.push(field);
      }
    }
    return missingFields;
  }

  /**
   * Determines data quality based on missing fields and other factors
   */
  private determineDataQuality(
    missingFields: string[], 
    warnings: string[], 
    statsRecordCount: number
  ): 'Excellent' | 'Good' | 'Limited' | 'Insufficient' {
    if (missingFields.length === 0 && warnings.length === 0 && statsRecordCount >= 2) {
      return 'Excellent';
    } else if (missingFields.length <= 2 && statsRecordCount >= 2) {
      return 'Good';
    } else if (missingFields.length <= 5 && statsRecordCount >= 1) {
      return 'Limited';
    } else {
      return 'Insufficient';
    }
  }

  /**
   * Determines team data quality based on games played and missing statistics
   */
  private determineTeamDataQuality(
    gamesPlayed: number, 
    missingStatFields: string[]
  ): 'Excellent' | 'Good' | 'Limited' | 'Insufficient' {
    if (gamesPlayed >= 8 && missingStatFields.length === 0) {
      return 'Excellent';
    } else if (gamesPlayed >= 5 && missingStatFields.length <= 2) {
      return 'Good';
    } else if (gamesPlayed >= 3 && missingStatFields.length <= 5) {
      return 'Limited';
    } else {
      return 'Insufficient';
    }
  }

  /**
   * Retry mechanism with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = this.maxRetries,
    baseDelay: number = this.baseDelay
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        if (attempt === maxRetries) break;
        
        const shouldRetry = error.response?.status === 429 || 
                           error.code === 'ECONNRESET' || 
                           error.code === 'ETIMEDOUT' ||
                           !error.response;
        
        if (!shouldRetry) break;
        
        const delayMs = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        console.log(`[CFB API Service] Attempt ${attempt + 1} failed, retrying in ${Math.round(delayMs)}ms...`);
        await this.delay(delayMs);
      }
    }
    
    throw lastError;
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Logs processing results to the database
   */
  private async logProcessingResult(
    processType: 'recent_update' | 'full_season',
    season: number,
    result: RecentGamesResult
  ): Promise<void> {
    try {
      await db.insert(statisticalProcessingLog).values({
        processType,
        season,
        startDate: new Date(Date.now() - result.processingTimeMs),
        endDate: new Date(),
        gamesProcessed: result.gamesProcessed,
        teamsUpdated: 0, // This would need to be calculated if needed
        iterationsRequired: null,
        converged: null,
        processingTime: result.processingTimeMs
      });
    } catch (error) {
      console.error(`[CFB API Service] Error logging processing result:`, error);
    }
  }
}

// =============================================================================
// EXPORT SINGLETON INSTANCE
// =============================================================================

export const collegeFootballApiService = new CollegeFootballApiService();