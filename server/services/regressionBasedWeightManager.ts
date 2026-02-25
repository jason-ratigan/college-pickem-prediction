// server/services/regressionBasedWeightManager.ts

import { db } from '../db.js';
import { 
  predictionWeightHistory, 
  regressionAnalysisResults, 
  regressionMetricResults,
  users
} from '@college-pickem/shared';
import { eq, desc, and, sql } from 'drizzle-orm';
import { 
  StatisticalImpactWeights, 
  EnhancedStatisticalAnalysis,
  RegressionAnalysisResult 
} from './statisticalImpactAnalyzer.js';

/**
 * Weight change log entry for tracking weight modifications
 * Requirements: 6.2 - Weight history tracking and logging functionality
 */
export interface WeightChangeLog {
  id: number;
  season: number;
  timestamp: Date;
  previousWeights: StatisticalImpactWeights;
  newWeights: StatisticalImpactWeights;
  reason: string;
  regressionMetrics: {
    rSquared: number;
    sampleSize: number;
    significantMetrics: string[];
  };
  changedByUserId?: string;
}

/**
 * Weight validation result
 * Requirements: 6.3 - Weight validation and fallback mechanisms
 */
export interface WeightValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  normalizedWeights?: StatisticalImpactWeights;
}

/**
 * Regression-Based Weight Manager
 * Manages dynamic weight calculation and adjustment based on regression analysis results
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
export class RegressionBasedWeightManager {
  private currentWeights: StatisticalImpactWeights;
  private fallbackWeights: StatisticalImpactWeights;

  constructor() {
    // Initialize with baseline fallback weights
    // Requirements: 6.3 - Fallback mechanisms
    this.fallbackWeights = {
      passingOffense: 0.25,
      rushingOffense: 0.20,
      scoringEfficiency: 0.30,
      passingDefense: 0.25,
      rushingDefense: 0.20,
      turnoverMargin: 0.35,
      specialTeams: 0.15,
      homeFieldAdvantage: 0.10
    };

    this.currentWeights = { ...this.fallbackWeights };
  }

  /**
   * Gets current weights for the specified season
   * Requirements: 6.4 - Integrate with enhanced StatisticalImpactAnalyzer
   */
  async getCurrentWeights(season: number): Promise<StatisticalImpactWeights> {
    try {
      // Get the most recent weights for this season
      const latestWeights = await db
        .select()
        .from(predictionWeightHistory)
        .where(eq(predictionWeightHistory.season, season))
        .orderBy(desc(predictionWeightHistory.changeDate))
        .limit(1);

      if (latestWeights.length === 0) {
        // No weights found for this season, initialize with fallback
        await this.initializeWeightsForSeason(season);
        return { ...this.fallbackWeights };
      }

      const weights = latestWeights[0];
      const currentWeights: StatisticalImpactWeights = {
        passingOffense: parseFloat(weights.passingOffense || '0.25'),
        rushingOffense: parseFloat(weights.rushingOffense || '0.20'),
        scoringEfficiency: parseFloat(weights.scoringEfficiency || '0.30'),
        passingDefense: parseFloat(weights.passingDefense || '0.25'),
        rushingDefense: parseFloat(weights.rushingDefense || '0.20'),
        turnoverMargin: parseFloat(weights.turnoverMargin || '0.35'),
        specialTeams: parseFloat(weights.specialTeams || '0.15'),
        homeFieldAdvantage: parseFloat(weights.homeFieldAdvantage || '0.10')
      };

      this.currentWeights = currentWeights;
      return currentWeights;
    } catch (error) {
      console.error('Error getting current weights, using fallback:', error);
      return { ...this.fallbackWeights };
    }
  }

  /**
   * Updates weights based on regression analysis results
   * Requirements: 6.1 - Dynamic weight calculation based on regression results
   */
  async updateWeightsFromRegression(
    season: number,
    analysis: EnhancedStatisticalAnalysis,
    userId?: string
  ): Promise<WeightChangeLog> {
    console.log(`Updating weights for season ${season} based on regression analysis`);

    // Get current weights for comparison
    const previousWeights = await this.getCurrentWeights(season);

    // Calculate new weights from regression analysis
    const newWeights = this.calculateWeightsFromRegression(analysis);

    // Validate the new weights
    const validation = this.validateWeights(newWeights);
    if (!validation.isValid) {
      throw new Error(`Invalid weights from regression analysis: ${validation.errors.join(', ')}`);
    }

    // Use normalized weights if validation provided them
    const finalWeights = validation.normalizedWeights || newWeights;

    // Store the weight change in database
    const changeLog = await this.storeWeightChange(
      season,
      previousWeights,
      finalWeights,
      'regression_analysis',
      analysis,
      userId
    );

    // Update current weights
    this.currentWeights = finalWeights;

    console.log('Weight update completed:', {
      season,
      previousWeights,
      newWeights: finalWeights,
      rSquared: analysis.overallModelRSquared,
      sampleSize: analysis.sampleSize
    });

    return changeLog;
  }

  /**
   * Manually updates weights with validation
   * Requirements: 6.5 - Manual weight overrides with logging
   */
  async updateWeightsManually(
    season: number,
    newWeights: Partial<StatisticalImpactWeights>,
    reason: string,
    userId?: string
  ): Promise<WeightChangeLog> {
    console.log(`Manually updating weights for season ${season}:`, newWeights);

    // Get current weights
    const previousWeights = await this.getCurrentWeights(season);

    // Merge with current weights
    const mergedWeights: StatisticalImpactWeights = {
      ...previousWeights,
      ...newWeights
    };

    // Validate the merged weights
    const validation = this.validateWeights(mergedWeights);
    if (!validation.isValid) {
      throw new Error(`Invalid manual weight update: ${validation.errors.join(', ')}`);
    }

    const finalWeights = validation.normalizedWeights || mergedWeights;

    // Store the weight change
    const changeLog = await this.storeWeightChange(
      season,
      previousWeights,
      finalWeights,
      `manual_override: ${reason}`,
      null,
      userId
    );

    // Update current weights
    this.currentWeights = finalWeights;

    console.log('Manual weight update completed:', {
      season,
      previousWeights,
      newWeights: finalWeights,
      reason
    });

    return changeLog;
  }

  /**
   * Gets weight change history for a season
   * Requirements: 6.2 - Weight history tracking and logging functionality
   */
  async getWeightHistory(season: number, limit: number = 50): Promise<WeightChangeLog[]> {
    const history = await db
      .select({
        id: predictionWeightHistory.id,
        season: predictionWeightHistory.season,
        changeDate: predictionWeightHistory.changeDate,
        passingOffense: predictionWeightHistory.passingOffense,
        rushingOffense: predictionWeightHistory.rushingOffense,
        scoringEfficiency: predictionWeightHistory.scoringEfficiency,
        passingDefense: predictionWeightHistory.passingDefense,
        rushingDefense: predictionWeightHistory.rushingDefense,
        turnoverMargin: predictionWeightHistory.turnoverMargin,
        specialTeams: predictionWeightHistory.specialTeams,
        homeFieldAdvantage: predictionWeightHistory.homeFieldAdvantage,
        changeReason: predictionWeightHistory.changeReason,
        previousWeights: predictionWeightHistory.previousWeights,
        regressionRSquared: predictionWeightHistory.regressionRSquared,
        regressionSampleSize: predictionWeightHistory.regressionSampleSize,
        significantMetrics: predictionWeightHistory.significantMetrics,
        changedByUserId: predictionWeightHistory.changedByUserId
      })
      .from(predictionWeightHistory)
      .where(eq(predictionWeightHistory.season, season))
      .orderBy(desc(predictionWeightHistory.changeDate))
      .limit(limit);

    return history.map(entry => ({
      id: entry.id,
      season: entry.season,
      timestamp: entry.changeDate,
      previousWeights: entry.previousWeights ? 
        JSON.parse(entry.previousWeights) : 
        this.fallbackWeights,
      newWeights: {
        passingOffense: parseFloat(entry.passingOffense || '0.25'),
        rushingOffense: parseFloat(entry.rushingOffense || '0.20'),
        scoringEfficiency: parseFloat(entry.scoringEfficiency || '0.30'),
        passingDefense: parseFloat(entry.passingDefense || '0.25'),
        rushingDefense: parseFloat(entry.rushingDefense || '0.20'),
        turnoverMargin: parseFloat(entry.turnoverMargin || '0.35'),
        specialTeams: parseFloat(entry.specialTeams || '0.15'),
        homeFieldAdvantage: parseFloat(entry.homeFieldAdvantage || '0.10')
      },
      reason: entry.changeReason,
      regressionMetrics: {
        rSquared: parseFloat(entry.regressionRSquared || '0'),
        sampleSize: entry.regressionSampleSize || 0,
        significantMetrics: entry.significantMetrics || []
      },
      changedByUserId: entry.changedByUserId || undefined
    }));
  }

  /**
   * Validates weights and provides normalization if needed
   * Requirements: 6.3 - Weight validation and fallback mechanisms
   */
  validateWeights(weights: StatisticalImpactWeights): WeightValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for required properties
    const requiredProps: (keyof StatisticalImpactWeights)[] = [
      'passingOffense', 'rushingOffense', 'scoringEfficiency',
      'passingDefense', 'rushingDefense', 'turnoverMargin',
      'specialTeams', 'homeFieldAdvantage'
    ];

    for (const prop of requiredProps) {
      if (typeof weights[prop] !== 'number' || isNaN(weights[prop])) {
        errors.push(`Invalid ${prop}: must be a valid number`);
      }
    }

    if (errors.length > 0) {
      return { isValid: false, errors, warnings };
    }

    // Check for negative weights
    for (const [key, value] of Object.entries(weights)) {
      if (value < 0) {
        errors.push(`Negative weight not allowed: ${key} = ${value}`);
      }
    }

    // Check for extremely high weights
    for (const [key, value] of Object.entries(weights)) {
      if (value > 2.0) {
        warnings.push(`Unusually high weight: ${key} = ${value}`);
      }
    }

    // Check total weight sum
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    if (totalWeight === 0) {
      errors.push('Total weight sum cannot be zero');
    }

    if (errors.length > 0) {
      return { isValid: false, errors, warnings };
    }

    // Normalize weights if they don't sum to a reasonable total
    let normalizedWeights: StatisticalImpactWeights | undefined;
    if (totalWeight < 0.5 || totalWeight > 3.0) {
      warnings.push(`Total weight sum (${totalWeight.toFixed(3)}) is outside normal range, normalizing`);
      
      const normalizedTotal = 1.5; // Target total weight
      normalizedWeights = {} as StatisticalImpactWeights;
      
      for (const [key, value] of Object.entries(weights)) {
        normalizedWeights[key as keyof StatisticalImpactWeights] = (value / totalWeight) * normalizedTotal;
      }
    }

    return {
      isValid: true,
      errors,
      warnings,
      normalizedWeights
    };
  }

  /**
   * Resets weights to fallback values for a season
   * Requirements: 6.3 - Fallback mechanisms
   */
  async resetToFallbackWeights(season: number, reason: string, userId?: string): Promise<WeightChangeLog> {
    console.log(`Resetting weights to fallback for season ${season}: ${reason}`);

    const previousWeights = await this.getCurrentWeights(season);

    const changeLog = await this.storeWeightChange(
      season,
      previousWeights,
      this.fallbackWeights,
      `fallback_reset: ${reason}`,
      null,
      userId
    );

    this.currentWeights = { ...this.fallbackWeights };

    return changeLog;
  }

  /**
   * Gets the latest regression analysis for a season
   */
  async getLatestRegressionAnalysis(season: number): Promise<EnhancedStatisticalAnalysis | null> {
    try {
      const latestAnalysis = await db
        .select()
        .from(regressionAnalysisResults)
        .where(eq(regressionAnalysisResults.season, season))
        .orderBy(desc(regressionAnalysisResults.analysisDate))
        .limit(1);

      if (latestAnalysis.length === 0) {
        return null;
      }

      const analysis = latestAnalysis[0];

      // Get metric results for this analysis
      const metricResults = await db
        .select()
        .from(regressionMetricResults)
        .where(eq(regressionMetricResults.analysisId, analysis.id));

      const regressionResults: RegressionAnalysisResult[] = metricResults.map(metric => ({
        metric: metric.metricName,
        coefficient: parseFloat(metric.coefficient || '0'),
        rSquared: parseFloat(metric.rSquared || '0'),
        pValue: parseFloat(metric.pValue || '1'),
        confidenceInterval: [
          parseFloat(metric.confidenceIntervalLower || '0'),
          parseFloat(metric.confidenceIntervalUpper || '0')
        ] as [number, number],
        weight: parseFloat(metric.calculatedWeight || '0'),
        isStatisticallySignificant: metric.isStatisticallySignificant
      }));

      return {
        regressionResults,
        overallModelRSquared: parseFloat(analysis.overallRSquared || '0'),
        predictiveAccuracy: parseFloat(analysis.predictiveAccuracy || '0'),
        recommendedWeights: this.extractRecommendedWeights(regressionResults),
        sampleSize: analysis.sampleSize,
        modelValidation: {
          residualStandardError: parseFloat(analysis.residualStandardError || '0'),
          fStatistic: parseFloat(analysis.fStatistic || '0'),
          fPValue: parseFloat(analysis.fPValue || '1'),
          adjustedRSquared: parseFloat(analysis.adjustedRSquared || '0')
        }
      };
    } catch (error) {
      console.error('Error getting latest regression analysis:', error);
      return null;
    }
  }

  // Private helper methods

  /**
   * Initializes weights for a new season
   */
  private async initializeWeightsForSeason(season: number): Promise<void> {
    await this.storeWeightChange(
      season,
      this.fallbackWeights, // Previous weights same as new for initialization
      this.fallbackWeights,
      'initialization',
      null,
      undefined
    );
  }

  /**
   * Calculates weights from regression analysis results
   * Requirements: 6.1 - Dynamic weight calculation based on regression results
   */
  private calculateWeightsFromRegression(analysis: EnhancedStatisticalAnalysis): StatisticalImpactWeights {
    // Start with fallback weights as base
    const weights: StatisticalImpactWeights = { ...this.fallbackWeights };

    // Map regression recommended weights to StatisticalImpactWeights structure
    weights.passingOffense = analysis.recommendedWeights.passingYards;
    weights.rushingOffense = analysis.recommendedWeights.rushingYards;
    weights.scoringEfficiency = analysis.recommendedWeights.scoring;
    weights.passingDefense = analysis.recommendedWeights.passingYards * 0.8; // Defensive weights slightly lower
    weights.rushingDefense = analysis.recommendedWeights.rushingYards * 0.8;
    weights.turnoverMargin = analysis.recommendedWeights.turnovers;
    weights.specialTeams = analysis.recommendedWeights.specialTeams;
    // Keep homeFieldAdvantage static
    weights.homeFieldAdvantage = 0.10;

    // Adjust weights based on statistical significance
    for (const result of analysis.regressionResults) {
      if (!result.isStatisticallySignificant) {
        // Reduce weight for non-significant metrics
        switch (result.metric) {
          case 'scoringEfficiency':
            weights.scoringEfficiency *= 0.5;
            break;
          case 'passingEfficiency':
            weights.passingOffense *= 0.5;
            weights.passingDefense *= 0.5;
            break;
          case 'rushingEfficiency':
            weights.rushingOffense *= 0.5;
            weights.rushingDefense *= 0.5;
            break;
          case 'turnoverEfficiency':
            weights.turnoverMargin *= 0.5;
            break;
        }
      } else if (result.rSquared > 0.6) {
        // Boost weight for highly predictive metrics
        switch (result.metric) {
          case 'scoringEfficiency':
            weights.scoringEfficiency *= 1.3;
            break;
          case 'passingEfficiency':
            weights.passingOffense *= 1.2;
            weights.passingDefense *= 1.2;
            break;
          case 'rushingEfficiency':
            weights.rushingOffense *= 1.2;
            weights.rushingDefense *= 1.2;
            break;
          case 'turnoverEfficiency':
            weights.turnoverMargin *= 1.3;
            break;
        }
      }
    }

    return weights;
  }

  /**
   * Stores weight change in database
   * Requirements: 6.2 - Weight history tracking and logging functionality
   */
  private async storeWeightChange(
    season: number,
    previousWeights: StatisticalImpactWeights,
    newWeights: StatisticalImpactWeights,
    reason: string,
    analysis: EnhancedStatisticalAnalysis | null,
    userId?: string
  ): Promise<WeightChangeLog> {
    const changeEntry = await db
      .insert(predictionWeightHistory)
      .values({
        season,
        passingOffense: newWeights.passingOffense.toString(),
        rushingOffense: newWeights.rushingOffense.toString(),
        scoringEfficiency: newWeights.scoringEfficiency.toString(),
        passingDefense: newWeights.passingDefense.toString(),
        rushingDefense: newWeights.rushingDefense.toString(),
        turnoverMargin: newWeights.turnoverMargin.toString(),
        specialTeams: newWeights.specialTeams.toString(),
        homeFieldAdvantage: newWeights.homeFieldAdvantage.toString(),
        changeReason: reason,
        previousWeights: JSON.stringify(previousWeights),
        regressionRSquared: analysis?.overallModelRSquared?.toString(),
        regressionSampleSize: analysis?.sampleSize,
        significantMetrics: analysis?.regressionResults
          .filter(r => r.isStatisticallySignificant)
          .map(r => r.metric) || [],
        changedByUserId: userId || null
      })
      .returning();

    if (!changeEntry || changeEntry.length === 0) {
      throw new Error('Failed to store weight change in database');
    }

    return {
      id: changeEntry[0].id,
      season,
      timestamp: changeEntry[0].changeDate,
      previousWeights,
      newWeights,
      reason,
      regressionMetrics: {
        rSquared: analysis?.overallModelRSquared || 0,
        sampleSize: analysis?.sampleSize || 0,
        significantMetrics: analysis?.regressionResults
          .filter(r => r.isStatisticallySignificant)
          .map(r => r.metric) || []
      },
      changedByUserId: userId
    };
  }

  /**
   * Extracts recommended weights from regression results
   */
  private extractRecommendedWeights(results: RegressionAnalysisResult[]): {
    scoring: number;
    passingYards: number;
    rushingYards: number;
    turnovers: number;
    specialTeams: number;
  } {
    const weights = {
      scoring: 0.2,
      passingYards: 0.2,
      rushingYards: 0.2,
      turnovers: 0.2,
      specialTeams: 0.2
    };

    for (const result of results) {
      if (result.isStatisticallySignificant) {
        switch (result.metric) {
          case 'scoringEfficiency':
            weights.scoring = result.weight;
            break;
          case 'passingEfficiency':
            weights.passingYards = result.weight;
            break;
          case 'rushingEfficiency':
            weights.rushingYards = result.weight;
            break;
          case 'turnoverEfficiency':
            weights.turnovers = result.weight;
            break;
        }
      }
    }

    // Normalize weights
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    if (total > 0) {
      for (const key in weights) {
        weights[key as keyof typeof weights] /= total;
      }
    }

    return weights;
  }
}