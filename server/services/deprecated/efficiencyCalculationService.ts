// server/services/efficiencyCalculationService.ts

import { db } from '../../db.js';
import { statisticalProcessingLog } from '@college-pickem/shared';
import { RecursiveEfficiencyEngine, AdvancedTeamEfficiencyProfile } from './recursiveEfficiencyEngine.js';
import { TeamEfficiencyProfileManager } from './teamEfficiencyProfileManager.js';

/**
 * Service for managing efficiency calculations and database updates
 * Enhanced to use comprehensive team efficiency profile system
 */
export class EfficiencyCalculationService {
  private engine: RecursiveEfficiencyEngine;
  private profileManager: TeamEfficiencyProfileManager;

  constructor() {
    this.engine = new RecursiveEfficiencyEngine();
    this.profileManager = new TeamEfficiencyProfileManager();
  }

  /**
   * FIXED: Now uses the correct opponent-relative efficiency calculations
   * Redirects to the statisticalProcessingService to prevent broken calculations
   */
  async updateSeasonEfficiencies(season: number): Promise<{
    teamsUpdated: number;
    iterationsRequired: number;
    converged: boolean;
    processingTime: number;
  }> {
    const startTime = Date.now();
    console.log(`[FIXED] EfficiencyCalculationService redirecting to use opponent-relative calculations for season ${season}`);

    try {
      // FIXED: Use the correct opponent-relative calculation system
      const { statisticalProcessingEngine } = await import('../statisticalProcessingService.js');
      const engine = new (await import('../statisticalProcessingService.js')).StatisticalProcessingEngine();
      const result = await engine.processSeasonStatistics(season);
      
      const processingTime = Date.now() - startTime;

      // Log the processing results
      await this.logProcessingResults({
        processType: 'opponent_relative_efficiency_calculation',
        season,
        teamsUpdated: result.teamsProcessed,
        iterationsRequired: 1, // Opponent-relative calculations don't use iterations
        converged: true, // Always "converged" since we don't iterate
        processingTime
      });

      console.log(`[FIXED] Opponent-relative efficiency calculation completed: ${result.teamsProcessed} teams updated in ${processingTime}ms`);

      return {
        teamsUpdated: result.teamsProcessed,
        iterationsRequired: 1,
        converged: true,
        processingTime
      };

    } catch (error) {
      console.error('Error during comprehensive efficiency calculation:', error);
      throw error;
    }
  }

  /**
   * Gets comprehensive efficiency profile for a team
   * Uses enhanced profile manager with full statistical coverage
   */
  async getTeamEfficiencyProfile(teamId: number, season: number): Promise<AdvancedTeamEfficiencyProfile | null> {
    return await this.profileManager.getTeamEfficiencyProfile(teamId, season);
  }

  /**
   * Gets all team efficiency profiles for a season
   */
  async getSeasonEfficiencyProfiles(season: number): Promise<Map<number, AdvancedTeamEfficiencyProfile>> {
    return await this.profileManager.getSeasonEfficiencyProfiles(season);
  }



  /**
   * Logs processing results to the database
   */
  private async logProcessingResults(logData: {
    processType: string;
    season: number;
    teamsUpdated: number;
    iterationsRequired: number;
    converged: boolean;
    processingTime: number;
  }): Promise<void> {
    await db.insert(statisticalProcessingLog).values({
      processType: logData.processType,
      season: logData.season,
      startDate: new Date(Date.now() - logData.processingTime),
      endDate: new Date(),
      gamesProcessed: null, // Not applicable for efficiency calculations
      teamsUpdated: logData.teamsUpdated,
      iterationsRequired: logData.iterationsRequired,
      converged: logData.converged,
      processingTime: logData.processingTime
    });
  }



  /**
   * Calculates efficiency for a specific team and metric
   */
  async calculateTeamMetricEfficiency(
    teamId: number,
    season: number,
    metric: 'totalOffense' | 'passingOffense' | 'rushingOffense' | 'scoringOffense'
  ): Promise<number | null> {
    const calculation = await this.engine.calculateOpponentAdjustedEfficiency(teamId, season, metric);
    return calculation?.finalEfficiency || null;
  }
}

// Export a singleton instance
export const efficiencyCalculationService = new EfficiencyCalculationService();