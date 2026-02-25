// server/services/predictionBoundaryValidator.ts

import { db } from '../db.js';
import { games, gameBoxScoreStats } from '@college-pickem/shared';
import { eq, and, sql, desc } from 'drizzle-orm';
import { AdvancedTeamEfficiencyProfile } from './deprecated/recursiveEfficiencyEngine.js';

/**
 * Team season statistics for boundary validation
 */
export interface TeamSeasonStats {
  teamId: number;
  season: number;
  gamesPlayed: number;
  
  // Scoring statistics
  averagePointsScored: number;
  minPointsScored: number;
  maxPointsScored: number;
  scoringStandardDeviation: number;
  
  // Yardage statistics
  averageTotalYards: number;
  averagePassingYards: number;
  averageRushingYards: number;
  
  // Other statistics
  averageTurnovers: number;
  averageSacks: number;
  averageFieldGoals: number;
}

/**
 * Historical pattern for validation
 */
export interface HistoricalPattern {
  category: string;
  minValue: number;
  maxValue: number;
  averageValue: number;
  standardDeviation: number;
  sampleSize: number;
}

/**
 * Prediction validation result
 */
export interface PredictionValidationResult {
  originalValue: number;
  adjustedValue: number;
  isAdjusted: boolean;
  adjustmentReason?: string;
  confidenceReduction: number; // 0-1, how much confidence should be reduced
}

/**
 * Comprehensive prediction boundary validation result
 */
export interface BoundaryValidationResult {
  homeTeamScore: PredictionValidationResult;
  awayTeamScore: PredictionValidationResult;
  homeTeamStats: {
    totalYards: PredictionValidationResult;
    passingYards: PredictionValidationResult;
    rushingYards: PredictionValidationResult;
    turnovers: PredictionValidationResult;
    sacks: PredictionValidationResult;
    fieldGoals: PredictionValidationResult;
  };
  awayTeamStats: {
    totalYards: PredictionValidationResult;
    passingYards: PredictionValidationResult;
    rushingYards: PredictionValidationResult;
    turnovers: PredictionValidationResult;
    sacks: PredictionValidationResult;
    fieldGoals: PredictionValidationResult;
  };
  overallConfidenceReduction: number;
  validationFlags: string[];
}

/**
 * Realistic Prediction Boundary System
 * Implements Requirements 5.1, 5.2, 5.3, 5.4
 * 
 * This system ensures game predictions remain realistic and plausible by:
 * - Establishing scoring floors/ceilings based on team averages
 * - Applying regression to the mean for extreme efficiency advantages
 * - Validating against historical performance patterns
 */
export class PredictionBoundaryValidator {
  
  // Boundary configuration constants - minimal validation to preserve opponent-relative calculations
  private readonly SCORING_FLOOR_PERCENTAGE = 0.05; // 5% of season average minimum (extremely permissive)
  private readonly SCORING_CEILING_PERCENTAGE = 6.0; // 600% of season average maximum (extremely permissive)
  private readonly EXTREME_CIRCUMSTANCE_THRESHOLD = 0.8; // 80% efficiency advantage
  private readonly REGRESSION_FACTOR = 0.01; // 1% regression toward mean (almost no adjustment)
  private readonly HISTORICAL_VALIDATION_THRESHOLD = 3.0; // 3 standard deviations
  
  /**
   * Validates and adjusts comprehensive game predictions
   * Implements all requirements for realistic prediction boundaries
   */
  async validateGamePrediction(
    homeTeamId: number,
    awayTeamId: number,
    season: number,
    predictions: {
      homeTeamScore: number;
      awayTeamScore: number;
      homeTeamStats: any;
      awayTeamStats: any;
    },
    homeProfile: AdvancedTeamEfficiencyProfile,
    awayProfile: AdvancedTeamEfficiencyProfile
  ): Promise<BoundaryValidationResult> {
    
    console.log(`Validating prediction boundaries for Team ${homeTeamId} vs Team ${awayTeamId}`);
    
    // Get team season statistics
    const homeSeasonStats = await this.getTeamSeasonStats(homeTeamId, season);
    const awaySeasonStats = await this.getTeamSeasonStats(awayTeamId, season);
    
    // Get historical patterns for validation
    const historicalPatterns = await this.getHistoricalPatterns(season);
    
    const validationFlags: string[] = [];
    
    // Validate scoring predictions (Requirements 5.1, 5.2)
    const homeScoreValidation = this.validateScoringPrediction(
      predictions.homeTeamScore,
      homeSeasonStats,
      homeProfile,
      'home'
    );
    
    const awayScoreValidation = this.validateScoringPrediction(
      predictions.awayTeamScore,
      awaySeasonStats,
      awayProfile,
      'away'
    );
    
    if (homeScoreValidation.isAdjusted) {
      validationFlags.push(`Home team scoring: ${homeScoreValidation.adjustmentReason}`);
    }
    
    if (awayScoreValidation.isAdjusted) {
      validationFlags.push(`Away team scoring: ${awayScoreValidation.adjustmentReason}`);
    }
    
    // Validate statistical predictions (Requirements 5.3, 5.4)
    const homeStatsValidation = await this.validateTeamStatistics(
      predictions.homeTeamStats,
      homeSeasonStats,
      homeProfile,
      historicalPatterns,
      'home'
    );
    
    const awayStatsValidation = await this.validateTeamStatistics(
      predictions.awayTeamStats,
      awaySeasonStats,
      awayProfile,
      historicalPatterns,
      'away'
    );
    
    // Collect validation flags from statistical validations
    this.collectValidationFlags(homeStatsValidation, 'home', validationFlags);
    this.collectValidationFlags(awayStatsValidation, 'away', validationFlags);
    
    // Calculate overall confidence reduction
    const overallConfidenceReduction = this.calculateOverallConfidenceReduction([
      homeScoreValidation,
      awayScoreValidation,
      ...Object.values(homeStatsValidation),
      ...Object.values(awayStatsValidation)
    ]);
    
    return {
      homeTeamScore: homeScoreValidation,
      awayTeamScore: awayScoreValidation,
      homeTeamStats: homeStatsValidation,
      awayTeamStats: awayStatsValidation,
      overallConfidenceReduction,
      validationFlags
    };
  }

  /**
   * Validates scoring predictions against team averages and extreme circumstances
   * Implements Requirements 5.1, 5.2
   */
  private validateScoringPrediction(
    predictedScore: number,
    seasonStats: TeamSeasonStats,
    profile: AdvancedTeamEfficiencyProfile,
    teamType: 'home' | 'away'
  ): PredictionValidationResult {
    
    const seasonAverage = seasonStats.averagePointsScored;
    
    // Use very permissive bounds for opponent-relative predictions to allow team separation
    const isHighConfidence = profile.confidenceLevel === 'High' || profile.confidenceLevel === 'Medium';
    const floorMultiplier = isHighConfidence ? this.SCORING_FLOOR_PERCENTAGE * 0.2 : this.SCORING_FLOOR_PERCENTAGE * 0.5; // Extremely permissive for high confidence
    const ceilingMultiplier = isHighConfidence ? this.SCORING_CEILING_PERCENTAGE * 2.0 : this.SCORING_CEILING_PERCENTAGE * 1.5; // Allow much higher scores
    
    const minAllowed = seasonAverage * floorMultiplier;
    const maxAllowed = seasonAverage * ceilingMultiplier;
    
    let adjustedScore = predictedScore;
    let isAdjusted = false;
    let adjustmentReason: string | undefined;
    let confidenceReduction = 0;
    
    // Requirement 5.1: Establish minimum and maximum scoring boundaries
    if (predictedScore < minAllowed) {
      // Check for extreme circumstances (Requirement 5.2)
      const hasExtremeCircumstances = this.checkExtremeCircumstances(profile);
      
      if (!hasExtremeCircumstances) {
        adjustedScore = minAllowed;
        isAdjusted = true;
        adjustmentReason = `Score below ${this.SCORING_FLOOR_PERCENTAGE * 100}% of season average (${seasonAverage.toFixed(1)})`;
        confidenceReduction = 0.3;
      } else {
        // Allow lower scores in extreme circumstances but apply regression
        const regressionTarget = (minAllowed + predictedScore) / 2;
        adjustedScore = predictedScore + (regressionTarget - predictedScore) * this.REGRESSION_FACTOR;
        isAdjusted = true;
        adjustmentReason = `Extreme circumstances detected, applied regression to mean`;
        confidenceReduction = 0.5;
      }
    } else if (predictedScore > maxAllowed) {
      // Apply regression to the mean for extremely high predictions
      const regressionTarget = (maxAllowed + seasonAverage) / 2;
      adjustedScore = predictedScore - (predictedScore - regressionTarget) * this.REGRESSION_FACTOR;
      isAdjusted = true;
      adjustmentReason = `Score above ${this.SCORING_CEILING_PERCENTAGE * 100}% of season average, applied regression`;
      confidenceReduction = 0.2;
    }
    
    // Minimal additional validation - only prevent truly impossible scores (< 0)
    if (predictedScore < 0) {
      adjustedScore = Math.max(adjustedScore, 3); // Minimum 3 points (field goal)
      isAdjusted = true;
      adjustmentReason = adjustmentReason || `Negative score not allowed`;
      confidenceReduction = Math.max(confidenceReduction, 0.2);
    }
    
    return {
      originalValue: predictedScore,
      adjustedValue: Math.round(adjustedScore),
      isAdjusted,
      adjustmentReason,
      confidenceReduction
    };
  }

  /**
   * Validates team statistical predictions against historical patterns
   * Implements Requirements 5.3, 5.4
   */
  private async validateTeamStatistics(
    predictedStats: any,
    seasonStats: TeamSeasonStats,
    profile: AdvancedTeamEfficiencyProfile,
    historicalPatterns: Map<string, HistoricalPattern>,
    teamType: 'home' | 'away'
  ): Promise<{
    totalYards: PredictionValidationResult;
    passingYards: PredictionValidationResult;
    rushingYards: PredictionValidationResult;
    turnovers: PredictionValidationResult;
    sacks: PredictionValidationResult;
    fieldGoals: PredictionValidationResult;
  }> {
    
    const validations = {
      totalYards: this.validateStatistic(
        predictedStats.totalYards,
        seasonStats.averageTotalYards,
        historicalPatterns.get('totalYards'),
        'totalYards'
      ),
      passingYards: this.validateStatistic(
        predictedStats.passingYards,
        seasonStats.averagePassingYards,
        historicalPatterns.get('passingYards'),
        'passingYards'
      ),
      rushingYards: this.validateStatistic(
        predictedStats.rushingYards,
        seasonStats.averageRushingYards,
        historicalPatterns.get('rushingYards'),
        'rushingYards'
      ),
      turnovers: this.validateStatistic(
        predictedStats.turnovers,
        seasonStats.averageTurnovers,
        historicalPatterns.get('turnovers'),
        'turnovers'
      ),
      sacks: this.validateStatistic(
        predictedStats.sacks,
        seasonStats.averageSacks,
        historicalPatterns.get('sacks'),
        'sacks'
      ),
      fieldGoals: this.validateStatistic(
        predictedStats.fieldGoals,
        seasonStats.averageFieldGoals,
        historicalPatterns.get('fieldGoals'),
        'fieldGoals'
      )
    };
    
    return validations;
  }

  /**
   * Validates individual statistic against historical patterns
   * Implements Requirement 5.4
   */
  private validateStatistic(
    predictedValue: number,
    teamAverage: number,
    historicalPattern: HistoricalPattern | undefined,
    statName: string
  ): PredictionValidationResult {
    
    let adjustedValue = predictedValue;
    let isAdjusted = false;
    let adjustmentReason: string | undefined;
    let confidenceReduction = 0;
    
    // Validate against team average (basic bounds)
    const teamDeviationRatio = Math.abs(predictedValue - teamAverage) / teamAverage;
    if (teamDeviationRatio > 1.5) { // More than 150% deviation
      const regressionTarget = (predictedValue + teamAverage) / 2;
      adjustedValue = predictedValue + (regressionTarget - predictedValue) * this.REGRESSION_FACTOR;
      isAdjusted = true;
      adjustmentReason = `Excessive deviation from team average (${teamDeviationRatio.toFixed(2)}x)`;
      confidenceReduction = 0.3;
    }
    
    // Validate against historical patterns if available
    if (historicalPattern) {
      const standardDeviations = Math.abs(predictedValue - historicalPattern.averageValue) / historicalPattern.standardDeviation;
      
      if (standardDeviations > this.HISTORICAL_VALIDATION_THRESHOLD) {
        // Apply regression toward historical mean
        const historicalRegressionTarget = historicalPattern.averageValue + 
          (predictedValue > historicalPattern.averageValue ? 1 : -1) * 
          (historicalPattern.standardDeviation * 2.5);
        
        adjustedValue = predictedValue + (historicalRegressionTarget - predictedValue) * this.REGRESSION_FACTOR;
        isAdjusted = true;
        adjustmentReason = adjustmentReason || `Implausible vs historical patterns (${standardDeviations.toFixed(1)} std devs)`;
        confidenceReduction = Math.max(confidenceReduction, 0.4);
      }
    }
    
    return {
      originalValue: predictedValue,
      adjustedValue: Math.round(adjustedValue * 10) / 10, // Round to 1 decimal
      isAdjusted,
      adjustmentReason,
      confidenceReduction
    };
  }

  /**
   * Checks for extreme circumstances that might justify unusual predictions
   * Implements Requirement 5.2
   */
  private checkExtremeCircumstances(profile: AdvancedTeamEfficiencyProfile): boolean {
    // Check if team has extreme efficiency disadvantages
    const offensiveEfficiencies = [
      profile.totalOffenseEfficiency,
      profile.passingOffenseEfficiency,
      profile.rushingOffenseEfficiency,
      profile.scoringOffenseEfficiency
    ];
    
    const defensiveEfficiencies = [
      profile.totalDefenseEfficiency,
      profile.passingDefenseEfficiency,
      profile.rushingDefenseEfficiency,
      profile.scoringDefenseEfficiency
    ];
    
    // Check for extreme negative efficiency (very poor performance)
    const hasExtremeOffensiveWeakness = offensiveEfficiencies.some(eff => eff < -this.EXTREME_CIRCUMSTANCE_THRESHOLD);
    const hasExtremeDefensiveWeakness = defensiveEfficiencies.some(eff => eff < -this.EXTREME_CIRCUMSTANCE_THRESHOLD);
    
    // Check for very low confidence in the data
    const hasLowConfidence = profile.confidenceLevel === 'Low' && profile.convergenceScore < 0.5;
    
    return hasExtremeOffensiveWeakness || hasExtremeDefensiveWeakness || hasLowConfidence;
  }

  /**
   * Gets team season statistics for boundary validation
   */
  private async getTeamSeasonStats(teamId: number, season: number): Promise<TeamSeasonStats> {
    try {
      // Query team's games for the season with box score stats
      const teamGames = await db
        .select({
          gameId: games.id,
          homeTeamId: games.homeTeamId,
          awayTeamId: games.awayTeamId,
          homeTeamScore: games.homeTeamScore,
          awayTeamScore: games.awayTeamScore,
          teamId: gameBoxScoreStats.teamId,
          totalYards: gameBoxScoreStats.totalYards,
          netPassingYards: gameBoxScoreStats.netPassingYards,
          rushingYards: gameBoxScoreStats.rushingYards,
          turnovers: gameBoxScoreStats.turnovers,
          sacks: gameBoxScoreStats.sacks,
          fieldGoalsMade: gameBoxScoreStats.fieldGoalsMade
        })
        .from(games)
        .innerJoin(gameBoxScoreStats, eq(games.id, gameBoxScoreStats.gameId))
        .where(
          and(
            eq(games.season, season),
            eq(gameBoxScoreStats.teamId, teamId),
            sql`${games.homeTeamScore} IS NOT NULL AND ${games.awayTeamScore} IS NOT NULL`
          )
        );
      
      if (teamGames.length === 0) {
        // Return default stats if no games found
        return this.getDefaultSeasonStats(teamId, season);
      }
      
      // Extract team-specific stats from games (now using box score stats)
      const teamStats = teamGames.map(game => {
        const isHome = game.homeTeamId === teamId;
        return {
          pointsScored: isHome ? game.homeTeamScore : game.awayTeamScore,
          totalYards: game.totalYards || 0,
          passingYards: game.netPassingYards || 0,
          rushingYards: game.rushingYards || 0,
          turnovers: game.turnovers || 0,
          sacks: Number(game.sacks) || 0, // Sacks made by this team
          fieldGoals: game.fieldGoalsMade || 0
        };
      }).filter(stat => stat.pointsScored !== null); // Filter out incomplete games
      
      if (teamStats.length === 0) {
        return this.getDefaultSeasonStats(teamId, season);
      }
      
      // Calculate statistics
      const scores = teamStats.map(s => s.pointsScored!);
      const totalYards = teamStats.map(s => s.totalYards || 0);
      const passingYards = teamStats.map(s => s.passingYards || 0);
      const rushingYards = teamStats.map(s => s.rushingYards || 0);
      const turnovers = teamStats.map(s => s.turnovers || 0);
      const sacks = teamStats.map(s => s.sacks || 0);
      const fieldGoals = teamStats.map(s => s.fieldGoals || 0);
      
      return {
        teamId,
        season,
        gamesPlayed: teamStats.length,
        averagePointsScored: this.calculateAverage(scores),
        minPointsScored: Math.min(...scores),
        maxPointsScored: Math.max(...scores),
        scoringStandardDeviation: this.calculateStandardDeviation(scores),
        averageTotalYards: this.calculateAverage(totalYards),
        averagePassingYards: this.calculateAverage(passingYards),
        averageRushingYards: this.calculateAverage(rushingYards),
        averageTurnovers: this.calculateAverage(turnovers),
        averageSacks: this.calculateAverage(sacks),
        averageFieldGoals: this.calculateAverage(fieldGoals)
      };
      
    } catch (error) {
      console.error(`Error getting season stats for team ${teamId}:`, error);
      return this.getDefaultSeasonStats(teamId, season);
    }
  }

  /**
   * Gets historical patterns for validation
   */
  private async getHistoricalPatterns(season: number): Promise<Map<string, HistoricalPattern>> {
    try {
      // Query historical data from previous seasons using box score stats
      const historicalGames = await db
        .select({
          homeTeamScore: games.homeTeamScore,
          awayTeamScore: games.awayTeamScore,
          totalYards: gameBoxScoreStats.totalYards,
          netPassingYards: gameBoxScoreStats.netPassingYards,
          rushingYards: gameBoxScoreStats.rushingYards,
          turnovers: gameBoxScoreStats.turnovers,
          sacks: gameBoxScoreStats.sacks,
          fieldGoalsMade: gameBoxScoreStats.fieldGoalsMade
        })
        .from(games)
        .innerJoin(gameBoxScoreStats, eq(games.id, gameBoxScoreStats.gameId))
        .where(
          and(
            sql`${games.season} >= ${season - 3} AND ${games.season} < ${season}`, // Last 3 seasons
            sql`${games.homeTeamScore} IS NOT NULL AND ${games.awayTeamScore} IS NOT NULL`
          )
        )
        .limit(1000); // Limit for performance
      
      const patterns = new Map<string, HistoricalPattern>();
      
      if (historicalGames.length > 0) {
        // Extract all values for each category from box score stats
        const allScores = [...historicalGames.map(g => g.homeTeamScore!), ...historicalGames.map(g => g.awayTeamScore!)];
        const allTotalYards = historicalGames.map(g => g.totalYards || 0);
        const allPassingYards = historicalGames.map(g => g.netPassingYards || 0);
        const allRushingYards = historicalGames.map(g => g.rushingYards || 0);
        const allTurnovers = historicalGames.map(g => g.turnovers || 0);
        const allSacks = historicalGames.map(g => Number(g.sacks) || 0);
        const allFieldGoals = historicalGames.map(g => g.fieldGoalsMade || 0);
        
        // Create patterns for each category
        patterns.set('scoring', this.createHistoricalPattern('scoring', allScores));
        patterns.set('totalYards', this.createHistoricalPattern('totalYards', allTotalYards));
        patterns.set('passingYards', this.createHistoricalPattern('passingYards', allPassingYards));
        patterns.set('rushingYards', this.createHistoricalPattern('rushingYards', allRushingYards));
        patterns.set('turnovers', this.createHistoricalPattern('turnovers', allTurnovers));
        patterns.set('sacks', this.createHistoricalPattern('sacks', allSacks));
        patterns.set('fieldGoals', this.createHistoricalPattern('fieldGoals', allFieldGoals));
      }
      
      return patterns;
      
    } catch (error) {
      console.error('Error getting historical patterns:', error);
      return new Map(); // Return empty map if error
    }
  }

  /**
   * Creates historical pattern from data array
   */
  private createHistoricalPattern(category: string, values: number[]): HistoricalPattern {
    const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
    
    if (validValues.length === 0) {
      // Return default pattern if no data
      return {
        category,
        minValue: 0,
        maxValue: 100,
        averageValue: 50,
        standardDeviation: 20,
        sampleSize: 0
      };
    }
    
    return {
      category,
      minValue: Math.min(...validValues),
      maxValue: Math.max(...validValues),
      averageValue: this.calculateAverage(validValues),
      standardDeviation: this.calculateStandardDeviation(validValues),
      sampleSize: validValues.length
    };
  }

  /**
   * Returns default season stats when no data is available
   */
  private getDefaultSeasonStats(teamId: number, season: number): TeamSeasonStats {
    return {
      teamId,
      season,
      gamesPlayed: 0,
      averagePointsScored: 28, // National average
      minPointsScored: 14,
      maxPointsScored: 42,
      scoringStandardDeviation: 10,
      averageTotalYards: 400,
      averagePassingYards: 250,
      averageRushingYards: 150,
      averageTurnovers: 1.2,
      averageSacks: 2.5,
      averageFieldGoals: 1.8
    };
  }

  /**
   * Utility methods for statistical calculations
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.calculateAverage(values);
    const squaredDiffs = values.map(val => Math.pow(val - avg, 2));
    const avgSquaredDiff = this.calculateAverage(squaredDiffs);
    return Math.sqrt(avgSquaredDiff);
  }

  /**
   * Collects validation flags from statistical validations
   */
  private collectValidationFlags(
    statsValidation: any,
    teamType: 'home' | 'away',
    flags: string[]
  ): void {
    Object.entries(statsValidation).forEach(([statName, validation]: [string, any]) => {
      if (validation.isAdjusted) {
        flags.push(`${teamType} team ${statName}: ${validation.adjustmentReason}`);
      }
    });
  }

  /**
   * Calculates overall confidence reduction from all validations
   */
  private calculateOverallConfidenceReduction(validations: PredictionValidationResult[]): number {
    const reductions = validations.map(v => v.confidenceReduction);
    const maxReduction = Math.max(...reductions);
    const avgReduction = reductions.reduce((sum, r) => sum + r, 0) / reductions.length;
    
    // Use weighted combination of max and average reduction
    return Math.min(maxReduction * 0.7 + avgReduction * 0.3, 0.8); // Cap at 80% reduction
  }
}

// Export singleton instance
export const predictionBoundaryValidator = new PredictionBoundaryValidator();