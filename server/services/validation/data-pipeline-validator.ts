// server/services/validation/data-pipeline-validator.ts

import { 
  DataValidationResult, 
  DataQualityMetrics,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  EfficiencyValidationResult,
  ValidationComponent
} from './types.js';
import { BaseValidator, validationLogger, errorHandler, DEFAULT_VALIDATION_CONFIG } from './core.js';
import { ValidationUtils } from './utils.js';
import { db } from '../../db.js';
import { games, gameBoxScoreStats, teams, teamEfficiencyRatings, statisticalProcessingLog } from '../../../shared/schema.js';
import { eq, and, or, desc } from 'drizzle-orm';

/**
 * Data Pipeline Validator - Validates raw game data and efficiency calculations
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

export class DataPipelineValidator extends BaseValidator {
  
  /**
   * Validates completeness of game statistics for a specific game
   * Requirements: 1.1, 1.4
   */
  async validateRawGameData(gameId: number): Promise<DataValidationResult> {
    const result = this.createBaseResult(true, 100) as DataValidationResult;
    
    try {
      // Initialize data validation specific fields
      result.dataCompleteness = 0;
      result.dataConsistency = 0;
      result.missingFields = [];
      result.invalidValues = [];
      result.qualityMetrics = {
        completenessScore: 0,
        consistencyScore: 0,
        validityScore: 0,
        timelinessScore: 0,
        overallScore: 0,
        gamesAnalyzed: 1,
        fieldsChecked: 0,
        issuesFound: 0
      };

      // Get game data
      const gameData = await db
        .select()
        .from(games)
        .where(eq(games.id, gameId))
        .limit(1);

      if (gameData.length === 0) {
        this.addError(result, 'GAME_NOT_FOUND', `Game with ID ${gameId} not found`, 'critical');
        return result;
      }

      const game = gameData[0];

      // Get box score stats for both teams
      const boxScoreStats = await db
        .select()
        .from(gameBoxScoreStats)
        .where(eq(gameBoxScoreStats.gameId, gameId));

      // Validate basic game information
      this.validateBasicGameInfo(game, result);
      
      // Validate box score completeness
      this.validateBoxScoreCompleteness(boxScoreStats, game, result);
      
      // Validate statistical field consistency
      this.validateStatisticalConsistency(boxScoreStats, result);
      
      // Calculate overall quality metrics
      this.calculateDataQualityMetrics(result);
      
      this.logResult(result);
      return result;

    } catch (error) {
      this.errorHandler.handleSystemError(error as Error, { 
        component: this.component, 
        gameId 
      });
      
      this.addError(result, 'VALIDATION_ERROR', 
        `Failed to validate game data: ${(error as Error).message}`, 'critical');
      return result;
    }
  }

  /**
   * Validates basic game information fields
   */
  private validateBasicGameInfo(game: any, result: DataValidationResult): void {
    const requiredFields = ['season', 'week', 'homeTeamId', 'awayTeamId'];
    const fieldValidation = this.validateRequiredFields(game, requiredFields);
    
    if (!fieldValidation.isValid) {
      fieldValidation.missingFields.forEach(field => {
        result.missingFields.push(field);
        this.addError(result, 'MISSING_FIELD', 
          `Required field '${field}' is missing from game data`, 'high');
      });
    }

    // Validate season is reasonable
    if (game.season) {
      const currentYear = new Date().getFullYear();
      if (game.season < 2000 || game.season > currentYear + 1) {
        result.invalidValues.push({
          field: 'season',
          value: game.season,
          reason: `Season ${game.season} is outside reasonable range (2000-${currentYear + 1})`
        });
        this.addError(result, 'INVALID_SEASON', 
          `Season ${game.season} is outside reasonable range`, 'medium');
      }
    }

    // Validate week is reasonable
    if (game.week) {
      const weekValidation = ValidationUtils.validateNumber(game.week, 'week', 1, 20);
      if (!weekValidation.isValid) {
        result.invalidValues.push({
          field: 'week',
          value: game.week,
          reason: weekValidation.error || 'Invalid week'
        });
        this.addError(result, 'INVALID_WEEK', weekValidation.error || 'Invalid week', 'medium');
      }
    }

    // Validate team IDs are different
    if (game.homeTeamId && game.awayTeamId && game.homeTeamId === game.awayTeamId) {
      result.invalidValues.push({
        field: 'teamIds',
        value: { home: game.homeTeamId, away: game.awayTeamId },
        reason: 'Home and away team IDs are the same'
      });
      this.addError(result, 'DUPLICATE_TEAMS', 
        'Home and away team cannot be the same', 'critical');
    }
  }

  /**
   * Validates completeness of box score statistics
   */
  private validateBoxScoreCompleteness(boxScoreStats: any[], game: any, result: DataValidationResult): void {
    // Should have stats for both teams
    if (boxScoreStats.length !== 2) {
      this.addError(result, 'INCOMPLETE_BOX_SCORE', 
        `Expected box score stats for 2 teams, found ${boxScoreStats.length}`, 'critical');
      return;
    }

    // Check that we have stats for both home and away teams
    const teamIds = boxScoreStats.map(stat => stat.teamId);
    if (!teamIds.includes(game.homeTeamId)) {
      this.addError(result, 'MISSING_HOME_STATS', 
        'Box score statistics missing for home team', 'critical');
    }
    if (!teamIds.includes(game.awayTeamId)) {
      this.addError(result, 'MISSING_AWAY_STATS', 
        'Box score statistics missing for away team', 'critical');
    }

    // Define critical statistical fields that must be present
    const criticalFields = [
      'netPassingYards', 'rushingYards', 'totalYards', 'firstDowns',
      'turnovers', 'possessionTime', 'thirdDownEff'
    ];

    const importantFields = [
      'completionAttempts', 'passingTDs', 'rushingAttempts', 'rushingTDs',
      'fumblesLost', 'interceptionsThrown', 'sacks', 'tacklesForLoss'
    ];

    const advancedFields = [
      'off_ppa', 'off_success_rate', 'off_explosiveness',
      'def_ppa', 'def_success_rate', 'def_explosiveness'
    ];

    let totalFields = 0;
    let presentFields = 0;
    let criticalMissing = 0;

    boxScoreStats.forEach((teamStats, index) => {
      const teamType = teamStats.teamId === game.homeTeamId ? 'home' : 'away';
      
      // Check critical fields
      criticalFields.forEach(field => {
        totalFields++;
        if (teamStats[field] !== null && teamStats[field] !== undefined) {
          presentFields++;
        } else {
          result.missingFields.push(`${teamType}_${field}`);
          criticalMissing++;
          this.addError(result, 'MISSING_CRITICAL_STAT', 
            `Critical statistic '${field}' missing for ${teamType} team`, 'high');
        }
      });

      // Check important fields
      importantFields.forEach(field => {
        totalFields++;
        if (teamStats[field] !== null && teamStats[field] !== undefined) {
          presentFields++;
        } else {
          result.missingFields.push(`${teamType}_${field}`);
          this.addWarning(result, 'MISSING_IMPORTANT_STAT', 
            `Important statistic '${field}' missing for ${teamType} team`);
        }
      });

      // Check advanced fields (warnings only)
      advancedFields.forEach(field => {
        totalFields++;
        if (teamStats[field] !== null && teamStats[field] !== undefined) {
          presentFields++;
        } else {
          this.addWarning(result, 'MISSING_ADVANCED_STAT', 
            `Advanced statistic '${field}' missing for ${teamType} team`);
        }
      });
    });

    // Calculate completeness percentage
    result.dataCompleteness = totalFields > 0 ? Math.round((presentFields / totalFields) * 100) : 0;
    result.qualityMetrics.fieldsChecked = totalFields;
    result.qualityMetrics.completenessScore = result.dataCompleteness;

    // Add recommendations based on completeness
    if (result.dataCompleteness < 80) {
      this.addRecommendation(result, 
        'Data completeness is below 80%. Consider improving data collection processes.');
    }
    if (criticalMissing > 0) {
      this.addRecommendation(result, 
        `${criticalMissing} critical statistics are missing. These are required for accurate predictions.`);
    }
  }

  /**
   * Validates consistency and reasonableness of statistical values
   */
  private validateStatisticalConsistency(boxScoreStats: any[], result: DataValidationResult): void {
    let consistencyIssues = 0;
    let totalChecks = 0;

    boxScoreStats.forEach((teamStats, index) => {
      const teamType = teamStats.teamId ? 'team' : 'unknown';

      // Validate passing statistics
      if (teamStats.netPassingYards !== null) {
        totalChecks++;
        const passingValidation = ValidationUtils.validateNumber(
          teamStats.netPassingYards, 'netPassingYards', -50, 800
        );
        if (!passingValidation.isValid) {
          consistencyIssues++;
          result.invalidValues.push({
            field: 'netPassingYards',
            value: teamStats.netPassingYards,
            reason: passingValidation.error || 'Invalid passing yards'
          });
          this.addError(result, 'INVALID_PASSING_YARDS', 
            `${teamType} passing yards (${teamStats.netPassingYards}) is unreasonable`, 'medium');
        }
      }

      // Validate rushing statistics
      if (teamStats.rushingYards !== null) {
        totalChecks++;
        const rushingValidation = ValidationUtils.validateNumber(
          teamStats.rushingYards, 'rushingYards', -50, 600
        );
        if (!rushingValidation.isValid) {
          consistencyIssues++;
          result.invalidValues.push({
            field: 'rushingYards',
            value: teamStats.rushingYards,
            reason: rushingValidation.error || 'Invalid rushing yards'
          });
          this.addError(result, 'INVALID_RUSHING_YARDS', 
            `${teamType} rushing yards (${teamStats.rushingYards}) is unreasonable`, 'medium');
        }
      }

      // Validate total yards consistency
      if (teamStats.totalYards !== null && teamStats.netPassingYards !== null && teamStats.rushingYards !== null) {
        totalChecks++;
        const expectedTotal = teamStats.netPassingYards + teamStats.rushingYards;
        const difference = Math.abs(teamStats.totalYards - expectedTotal);
        
        if (difference > 50) { // Allow some tolerance for special teams, penalties, etc.
          consistencyIssues++;
          result.invalidValues.push({
            field: 'totalYards',
            value: teamStats.totalYards,
            reason: `Total yards (${teamStats.totalYards}) doesn't match sum of passing (${teamStats.netPassingYards}) and rushing (${teamStats.rushingYards})`
          });
          this.addWarning(result, 'INCONSISTENT_TOTAL_YARDS', 
            `${teamType} total yards may be inconsistent with passing + rushing yards`);
        }
      }

      // Validate turnover statistics
      if (teamStats.turnovers !== null) {
        totalChecks++;
        const turnoverValidation = ValidationUtils.validateNumber(
          teamStats.turnovers, 'turnovers', 0, 10
        );
        if (!turnoverValidation.isValid) {
          consistencyIssues++;
          result.invalidValues.push({
            field: 'turnovers',
            value: teamStats.turnovers,
            reason: turnoverValidation.error || 'Invalid turnover count'
          });
          this.addError(result, 'INVALID_TURNOVERS', 
            `${teamType} turnovers (${teamStats.turnovers}) is unreasonable`, 'medium');
        }
      }

      // Validate first downs
      if (teamStats.firstDowns !== null) {
        totalChecks++;
        const firstDownValidation = ValidationUtils.validateNumber(
          teamStats.firstDowns, 'firstDowns', 0, 50
        );
        if (!firstDownValidation.isValid) {
          consistencyIssues++;
          result.invalidValues.push({
            field: 'firstDowns',
            value: teamStats.firstDowns,
            reason: firstDownValidation.error || 'Invalid first downs count'
          });
          this.addError(result, 'INVALID_FIRST_DOWNS', 
            `${teamType} first downs (${teamStats.firstDowns}) is unreasonable`, 'medium');
        }
      }

      // Validate advanced statistics if present
      if (teamStats.off_ppa !== null) {
        totalChecks++;
        const ppaValidation = ValidationUtils.validateNumber(
          teamStats.off_ppa, 'off_ppa', -2.0, 2.0
        );
        if (!ppaValidation.isValid) {
          consistencyIssues++;
          this.addWarning(result, 'INVALID_PPA', 
            `${teamType} offensive PPA (${teamStats.off_ppa}) is outside typical range`);
        }
      }

      if (teamStats.off_success_rate !== null) {
        totalChecks++;
        const successRateValidation = ValidationUtils.validatePercentage(
          teamStats.off_success_rate * 100, 'off_success_rate'
        );
        if (!successRateValidation.isValid) {
          consistencyIssues++;
          this.addWarning(result, 'INVALID_SUCCESS_RATE', 
            `${teamType} offensive success rate (${teamStats.off_success_rate}) is outside valid range`);
        }
      }
    });

    // Calculate consistency score
    result.dataConsistency = totalChecks > 0 ? 
      Math.round(((totalChecks - consistencyIssues) / totalChecks) * 100) : 100;
    result.qualityMetrics.consistencyScore = result.dataConsistency;
    result.qualityMetrics.issuesFound += consistencyIssues;

    // Add recommendations for consistency issues
    if (result.dataConsistency < 90) {
      this.addRecommendation(result, 
        'Statistical consistency is below 90%. Review data collection and validation processes.');
    }
  }

  /**
   * Calculates overall data quality metrics
   */
  private calculateDataQualityMetrics(result: DataValidationResult): void {
    const metrics = result.qualityMetrics;
    
    // Validity score based on error count
    const errorCount = result.errors.length;
    const warningCount = result.warnings.length;
    metrics.validityScore = Math.max(0, 100 - (errorCount * 10) - (warningCount * 2));
    
    // Timeliness score (simplified - assume good if data exists)
    metrics.timelinessScore = result.dataCompleteness > 0 ? 95 : 0;
    
    // Overall score is weighted average
    metrics.overallScore = this.calculateQualityScore(
      metrics.completenessScore,
      metrics.validityScore,
      metrics.consistencyScore
    );
    
    // Update main result score
    result.score = metrics.overallScore;
  }

  /**
   * Main validation method required by BaseValidator
   */
  async validate(season: number): Promise<ValidationResult> {
    return this.validateSeasonDataQuality(season);
  }

  /**
   * Validates data quality for an entire season
   */
  async validateSeasonDataQuality(season: number): Promise<DataValidationResult> {
    const result = this.createBaseResult(true, 100) as DataValidationResult;
    
    try {
      console.log(`[Data Pipeline Validator] Validating data quality for season ${season}`);
      
      // Get all games for the season
      const seasonGames = await db.query.games.findMany({
        where: eq(games.season, season),
        limit: 100 // Sample for validation
      });

      if (seasonGames.length === 0) {
        this.addError(result, 'NO_SEASON_DATA', `No games found for season ${season}`, 'critical');
        return result;
      }

      console.log(`[Data Pipeline Validator] Found ${seasonGames.length} games for season ${season}`);

      // Validate a sample of games
      const sampleSize = Math.min(10, seasonGames.length);
      const sampleGames = seasonGames.slice(0, sampleSize);
      
      let validGames = 0;
      let totalDataQuality = 0;

      for (const game of sampleGames) {
        try {
          const gameValidation = await this.validateRawGameData(game.id);
          if (gameValidation.isValid) {
            validGames++;
          }
          totalDataQuality += gameValidation.score;
        } catch (error) {
          console.warn(`[Data Pipeline Validator] Failed to validate game ${game.id}:`, error);
        }
      }

      // Calculate overall metrics
      const validationRate = (validGames / sampleSize) * 100;
      const avgDataQuality = totalDataQuality / sampleSize;
      
      result.score = Math.round(avgDataQuality);
      result.isValid = validationRate >= 70; // At least 70% of games should be valid

      // Set data validation specific fields
      result.dataCompleteness = validationRate;
      result.dataConsistency = avgDataQuality;
      result.qualityMetrics = {
        completenessScore: validationRate,
        consistencyScore: avgDataQuality,
        validityScore: avgDataQuality,
        timelinessScore: 90, // Assume good timeliness
        overallScore: avgDataQuality,
        gamesAnalyzed: sampleSize,
        fieldsChecked: sampleSize * 10, // Approximate fields per game
        issuesFound: sampleSize - validGames
      };

      if (result.isValid) {
        this.addRecommendation(result, `Data quality validation passed for ${validGames}/${sampleSize} sample games`);
      } else {
        this.addError(result, 'LOW_DATA_QUALITY', `Only ${validGames}/${sampleSize} games passed validation`, 'high');
      }

      console.log(`[Data Pipeline Validator] Season validation complete: ${validationRate}% valid games, ${avgDataQuality} avg quality`);
      
      this.logResult(result);
      return result;

    } catch (error) {
      console.error('[Data Pipeline Validator] Season validation error:', error);
      this.addError(result, 'SEASON_VALIDATION_ERROR', 
        `Failed to validate season data: ${(error as Error).message}`, 'critical');
      
      this.logResult(result);
      return result;
    }
  }
}

// Export singleton instance
export const dataPipelineValidator = new DataPipelineValidator(
  'data_pipeline' as ValidationComponent,
  validationLogger,
  errorHandler,
  DEFAULT_VALIDATION_CONFIG
);