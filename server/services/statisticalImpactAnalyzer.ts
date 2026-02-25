// server/services/statisticalImpactAnalyzer.ts

import { db } from '../db.js';
import { games, gameBoxScoreStats, teamEfficiencyRatings } from '@college-pickem/shared';
import { eq, and, sql, isNotNull } from 'drizzle-orm';
import { AdvancedTeamEfficiencyProfile } from './deprecated/recursiveEfficiencyEngine.js';
import { RegressionBasedWeightManager } from './regressionBasedWeightManager.js';

/**
 * Statistical Impact Weights for different efficiency metrics
 * Based on empirical analysis of correlation with game outcomes
 */
export interface StatisticalImpactWeights {
  passingOffense: number;
  rushingOffense: number;
  scoringEfficiency: number;
  passingDefense: number;
  rushingDefense: number;
  turnoverMargin: number;
  specialTeams: number;
  homeFieldAdvantage: number;
}

/**
 * Type guard function to validate weight object structure
 * Ensures all required StatisticalImpactWeights properties are present
 */
function isValidWeightObject(obj: any): obj is StatisticalImpactWeights {
  return typeof obj === 'object' &&
    obj !== null &&
    typeof obj.passingOffense === 'number' &&
    typeof obj.rushingOffense === 'number' &&
    typeof obj.scoringEfficiency === 'number' &&
    typeof obj.passingDefense === 'number' &&
    typeof obj.rushingDefense === 'number' &&
    typeof obj.turnoverMargin === 'number' &&
    typeof obj.specialTeams === 'number' &&
    typeof obj.homeFieldAdvantage === 'number' &&
    !isNaN(obj.passingOffense) &&
    !isNaN(obj.rushingOffense) &&
    !isNaN(obj.scoringEfficiency) &&
    !isNaN(obj.passingDefense) &&
    !isNaN(obj.rushingDefense) &&
    !isNaN(obj.turnoverMargin) &&
    !isNaN(obj.specialTeams) &&
    !isNaN(obj.homeFieldAdvantage);
}

/**
 * Correlation analysis result for a specific metric
 */
export interface MetricCorrelationAnalysis {
  metric: string;
  correlationWithWins: number;
  correlationWithPointDifferential: number;
  predictivePower: number;
  sampleSize: number;
  confidenceLevel: number;
}

/**
 * Regression analysis result for a specific metric
 * Requirements: 5.1, 5.2 - Multiple linear regression with R² and p-values
 */
export interface RegressionAnalysisResult {
  metric: string;
  coefficient: number;           // β value from regression
  rSquared: number;             // Variance explained
  pValue: number;               // Statistical significance
  confidenceInterval: [number, number];
  weight: number;               // Calculated weight for predictions
  isStatisticallySignificant: boolean;
}

/**
 * Enhanced statistical analysis with regression results
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */
export interface EnhancedStatisticalAnalysis {
  regressionResults: RegressionAnalysisResult[];
  overallModelRSquared: number;
  predictiveAccuracy: number;
  recommendedWeights: {
    scoring: number;
    passingYards: number;
    rushingYards: number;
    turnovers: number;
    specialTeams: number;
  };
  sampleSize: number;
  modelValidation: {
    residualStandardError: number;
    fStatistic: number;
    fPValue: number;
    adjustedRSquared: number;
  };
}

/**
 * Data point for regression analysis
 */
export interface RegressionDataPoint {
  gameId: number;
  teamId: number;
  opponentId: number;
  
  // Actual outcomes
  actualPointsScored: number;
  actualPassingYards: number;
  actualRushingYards: number;
  
  // Efficiency values at time of game
  scoringEfficiency: number;
  passingEfficiency: number;
  rushingEfficiency: number;
  turnoverEfficiency: number;
  
  // Opponent baselines at time of game
  opponentPointsBaseline: number;
  opponentPassingBaseline: number;
  opponentRushingBaseline: number;
}

/**
 * Prediction accuracy measurement for model calibration
 */
export interface PredictionAccuracyMetrics {
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;
  averageConfidenceError: number;
  calibrationScore: number;
  meanAbsoluteError: number;
  rootMeanSquareError: number;
}

/**
 * Game outcome data for analysis
 */
export interface GameOutcomeData {
  gameId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  pointDifferential: number;
  winner: number;
  homeTeamEfficiency: AdvancedTeamEfficiencyProfile | null;
  awayTeamEfficiency: AdvancedTeamEfficiencyProfile | null;
}

/**
 * Statistical Impact Analyzer
 * Measures correlation between efficiency metrics and game outcomes
 * Implements dynamic weighting system based on empirical evidence
 */
export class StatisticalImpactAnalyzer {
  private currentWeights: StatisticalImpactWeights;
  private lastAnalysisDate: Date | null = null;
  private weightManager: RegressionBasedWeightManager;

  constructor() {
    // Initialize with baseline weights
    this.currentWeights = {
      passingOffense: 0.25,
      rushingOffense: 0.20,
      scoringEfficiency: 0.30,
      passingDefense: 0.25,
      rushingDefense: 0.20,
      turnoverMargin: 0.35,
      specialTeams: 0.15,
      homeFieldAdvantage: 0.10
    };

    // Initialize the regression-based weight manager
    // Requirements: 6.4 - Integrate with enhanced StatisticalImpactAnalyzer
    this.weightManager = new RegressionBasedWeightManager();
  }

  /**
   * Analyzes correlation between a specific efficiency metric and game outcomes
   * Requirements: 4.1 - Measure correlation between each efficiency metric and actual game outcomes
   */
  async analyzeMetricImpact(
    metric: keyof AdvancedTeamEfficiencyProfile,
    season: number,
    minGames: number = 5
  ): Promise<MetricCorrelationAnalysis> {
    console.log(`Analyzing impact of ${metric} for season ${season}`);

    // Get completed games with efficiency data
    const gameOutcomes = await this.getGameOutcomesWithEfficiency(season, minGames);
    
    if (gameOutcomes.length < 10) {
      throw new Error(`Insufficient data for analysis: ${gameOutcomes.length} games found`);
    }

    // Calculate correlations
    const winCorrelation = this.calculateWinCorrelation(gameOutcomes, metric);
    const pointDiffCorrelation = this.calculatePointDifferentialCorrelation(gameOutcomes, metric);
    
    // Calculate predictive power (combination of both correlations)
    const predictivePower = Math.sqrt(
      (winCorrelation * winCorrelation + pointDiffCorrelation * pointDiffCorrelation) / 2
    );

    // Calculate confidence level based on sample size
    const confidenceLevel = this.calculateConfidenceLevel(gameOutcomes.length);

    return {
      metric: metric.toString(),
      correlationWithWins: winCorrelation,
      correlationWithPointDifferential: pointDiffCorrelation,
      predictivePower,
      sampleSize: gameOutcomes.length,
      confidenceLevel
    };
  }

  /**
   * Calculates optimal weights for all efficiency metrics
   * Requirements: 4.2 - Provide weighting factors and automatically adjust prediction formulas
   */
  async calculateOptimalWeights(season: number): Promise<StatisticalImpactWeights> {
    console.log(`Calculating optimal weights for season ${season}`);

    const metrics: (keyof AdvancedTeamEfficiencyProfile)[] = [
      'passingOffenseEfficiency',
      'rushingOffenseEfficiency', 
      'scoringOffenseEfficiency',
      'passingDefenseEfficiency',
      'rushingDefenseEfficiency',
      'interceptionEfficiency',
      'fieldGoalEfficiency'
    ];

    const correlationResults: MetricCorrelationAnalysis[] = [];
    
    // Analyze each metric
    for (const metric of metrics) {
      try {
        const analysis = await this.analyzeMetricImpact(metric, season);
        correlationResults.push(analysis);
      } catch (error) {
        console.warn(`Failed to analyze ${metric}:`, error);
      }
    }

    // Calculate weights based on predictive power
    const totalPredictivePower = correlationResults.reduce(
      (sum, result) => sum + result.predictivePower, 0
    );

    const newWeights: StatisticalImpactWeights = {
      passingOffense: this.getWeightForMetric(correlationResults, 'passingOffenseEfficiency', totalPredictivePower),
      rushingOffense: this.getWeightForMetric(correlationResults, 'rushingOffenseEfficiency', totalPredictivePower),
      scoringEfficiency: this.getWeightForMetric(correlationResults, 'scoringOffenseEfficiency', totalPredictivePower),
      passingDefense: this.getWeightForMetric(correlationResults, 'passingDefenseEfficiency', totalPredictivePower),
      rushingDefense: this.getWeightForMetric(correlationResults, 'rushingDefenseEfficiency', totalPredictivePower),
      turnoverMargin: this.getWeightForMetric(correlationResults, 'interceptionEfficiency', totalPredictivePower),
      specialTeams: this.getWeightForMetric(correlationResults, 'fieldGoalEfficiency', totalPredictivePower),
      homeFieldAdvantage: 0.10 // Static weight for home field advantage
    };

    // Normalize weights to sum to reasonable total
    const weightSum = Object.values(newWeights).reduce((sum, weight) => sum + weight, 0);
    
    if (weightSum === 0) {
      throw new Error('Cannot normalize weights: total weight sum is zero');
    }

    const normalizedWeights = this.createSafeStatisticalImpactWeights(newWeights, weightSum);

    this.currentWeights = normalizedWeights;
    this.lastAnalysisDate = new Date();

    console.log('Updated statistical impact weights:', normalizedWeights);
    return normalizedWeights;
  }

  /**
   * Validates prediction accuracy against actual game results
   * Requirements: 4.3 - Update impact analysis and recalibrate weightings
   */
  async validatePredictionAccuracy(
    predictions: Array<{
      gameId: number;
      predictedWinner: number;
      confidence: number;
      expectedScore: { home: number; away: number };
    }>,
    season: number
  ): Promise<PredictionAccuracyMetrics> {
    console.log(`Validating prediction accuracy for ${predictions.length} predictions`);

    // Get actual game results
    const actualResults = await db
      .select({
        gameId: games.id,
        homeTeamId: games.homeTeamId,
        awayTeamId: games.awayTeamId,
        homeScore: games.homeTeamScore,
        awayScore: games.awayTeamScore
      })
      .from(games)
      .where(
        and(
          eq(games.season, season),
          isNotNull(games.homeTeamScore),
          isNotNull(games.awayTeamScore),
          eq(games.isFinal, true)
        )
      );

    const actualResultsMap = new Map(
      actualResults.map(result => [result.gameId, result])
    );

    let correctPredictions = 0;
    let totalConfidenceError = 0;
    let totalScoreError = 0;
    let totalSquaredError = 0;
    let validPredictions = 0;

    for (const prediction of predictions) {
      const actual = actualResultsMap.get(prediction.gameId);
      if (!actual || actual.homeScore === null || actual.awayScore === null) {
        continue;
      }

      validPredictions++;

      // Check winner prediction accuracy
      const actualWinner = actual.homeScore > actual.awayScore ? actual.homeTeamId : actual.awayTeamId;
      if (prediction.predictedWinner === actualWinner) {
        correctPredictions++;
      }

      // Calculate confidence error
      const actualConfidence = Math.abs(actual.homeScore - actual.awayScore) / 
        Math.max(actual.homeScore, actual.awayScore);
      totalConfidenceError += Math.abs(prediction.confidence - actualConfidence);

      // Calculate score prediction errors
      const homeScoreError = Math.abs(prediction.expectedScore.home - actual.homeScore);
      const awayScoreError = Math.abs(prediction.expectedScore.away - actual.awayScore);
      const avgScoreError = (homeScoreError + awayScoreError) / 2;
      
      totalScoreError += avgScoreError;
      totalSquaredError += avgScoreError * avgScoreError;
    }

    if (validPredictions === 0) {
      throw new Error('No valid predictions found for accuracy analysis');
    }

    const accuracy = correctPredictions / validPredictions;
    const averageConfidenceError = totalConfidenceError / validPredictions;
    const meanAbsoluteError = totalScoreError / validPredictions;
    const rootMeanSquareError = Math.sqrt(totalSquaredError / validPredictions);
    
    // Calibration score: how well confidence matches actual accuracy
    const calibrationScore = 1 - averageConfidenceError;

    return {
      totalPredictions: validPredictions,
      correctPredictions,
      accuracy,
      averageConfidenceError,
      calibrationScore,
      meanAbsoluteError,
      rootMeanSquareError
    };
  }

  /**
   * Gets current statistical impact weights for a specific season
   * Requirements: 6.4 - Integrate with enhanced StatisticalImpactAnalyzer
   */
  async getCurrentWeights(season?: number): Promise<StatisticalImpactWeights> {
    if (season) {
      // Get weights from the weight manager for the specific season
      return await this.weightManager.getCurrentWeights(season);
    }
    return { ...this.currentWeights };
  }

  /**
   * Gets current statistical impact weights (synchronous version for backward compatibility)
   */
  getCurrentWeightsSync(): StatisticalImpactWeights {
    return { ...this.currentWeights };
  }

  /**
   * Updates weights manually (for testing or manual calibration)
   * Uses safe type conversion with validation
   */
  updateWeights(newWeights: Partial<StatisticalImpactWeights>): void {
    const updatedWeights = { ...this.currentWeights, ...newWeights };
    
    // Validate the updated weights object
    if (!isValidWeightObject(updatedWeights)) {
      throw new Error('Invalid weight update: resulting weights object does not match StatisticalImpactWeights interface');
    }

    // Additional validation for reasonable weight values
    const weightValues = Object.values(updatedWeights);
    if (weightValues.some(weight => weight < 0)) {
      throw new Error('Invalid weight update: negative values are not allowed');
    }

    if (weightValues.some(weight => weight > 2.0)) {
      console.warn('Warning: Some updated weights exceed expected range (>2.0)');
    }

    this.currentWeights = updatedWeights;
    this.lastAnalysisDate = new Date();
  }

  /**
   * Updates weights based on regression analysis results
   * Requirements: 6.1, 6.2, 6.3 - Dynamic weight adjustment based on statistical analysis
   */
  async updateWeightsFromRegression(season: number, analysis: EnhancedStatisticalAnalysis, userId?: string): Promise<void> {
    console.log('Updating weights based on regression analysis');
    
    // Use the weight manager to update weights with full logging and validation
    const changeLog = await this.weightManager.updateWeightsFromRegression(season, analysis, userId);
    
    // Update local weights for backward compatibility
    this.currentWeights = changeLog.newWeights;
    this.lastAnalysisDate = new Date();
    
    // Log the changes with reasoning
    console.log('Weight update summary:');
    console.log('Previous weights:', changeLog.previousWeights);
    console.log('New weights:', changeLog.newWeights);
    console.log('Regression analysis R²:', analysis.overallModelRSquared);
    console.log('Sample size:', analysis.sampleSize);
    console.log('Significant metrics:', analysis.regressionResults.filter(r => r.isStatisticallySignificant).map(r => r.metric));
  }

  /**
   * Updates weights based on regression analysis results (legacy synchronous version)
   * Requirements: 6.1, 6.2, 6.3 - Dynamic weight adjustment based on statistical analysis
   */
  updateWeightsFromRegressionSync(analysis: EnhancedStatisticalAnalysis): void {
    console.log('Updating weights based on regression analysis (sync)');
    
    // Log the weight changes for audit trail
    const previousWeights = { ...this.currentWeights };
    
    // Map regression-based weights to StatisticalImpactWeights structure
    const newWeights: StatisticalImpactWeights = {
      passingOffense: analysis.recommendedWeights.passingYards,
      rushingOffense: analysis.recommendedWeights.rushingYards,
      scoringEfficiency: analysis.recommendedWeights.scoring,
      passingDefense: analysis.recommendedWeights.passingYards * 0.8, // Defensive weights slightly lower
      rushingDefense: analysis.recommendedWeights.rushingYards * 0.8,
      turnoverMargin: analysis.recommendedWeights.turnovers,
      specialTeams: analysis.recommendedWeights.specialTeams,
      homeFieldAdvantage: 0.10 // Keep static
    };

    // Validate and update weights
    if (isValidWeightObject(newWeights)) {
      this.currentWeights = newWeights;
      this.lastAnalysisDate = new Date();
      
      // Log the changes with reasoning
      console.log('Weight update summary:');
      console.log('Previous weights:', previousWeights);
      console.log('New weights:', newWeights);
      console.log('Regression analysis R²:', analysis.overallModelRSquared);
      console.log('Sample size:', analysis.sampleSize);
      console.log('Significant metrics:', analysis.regressionResults.filter(r => r.isStatisticallySignificant).map(r => r.metric));
    } else {
      throw new Error('Failed to update weights: regression analysis produced invalid weight values');
    }
  }

  /**
   * Validates regression model assumptions and diagnostics
   * Requirements: 5.4 - Model validation and diagnostic methods
   */
  validateRegressionModel(analysis: EnhancedStatisticalAnalysis): {
    isValid: boolean;
    warnings: string[];
    recommendations: string[];
  } {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    let isValid = true;

    // Check sample size adequacy
    if (analysis.sampleSize < 30) {
      warnings.push(`Small sample size (${analysis.sampleSize}). Minimum 30 observations recommended for reliable regression.`);
      isValid = false;
    }

    // Check overall model fit
    if (analysis.overallModelRSquared < 0.3) {
      warnings.push(`Low overall model R² (${analysis.overallModelRSquared.toFixed(3)}). Model explains less than 30% of variance.`);
      recommendations.push('Consider adding more predictive variables or transforming existing ones.');
    }

    // Check for statistically significant predictors
    const significantMetrics = analysis.regressionResults.filter(r => r.isStatisticallySignificant);
    if (significantMetrics.length === 0) {
      warnings.push('No statistically significant predictors found.');
      isValid = false;
      recommendations.push('Review data quality and consider different metrics or transformations.');
    }

    // Check for multicollinearity (simplified check)
    const highCorrelationPairs = this.checkMulticollinearity(analysis.regressionResults);
    if (highCorrelationPairs.length > 0) {
      warnings.push(`Potential multicollinearity detected between: ${highCorrelationPairs.join(', ')}`);
      recommendations.push('Consider removing or combining highly correlated predictors.');
    }

    // Check residual standard error
    if (analysis.modelValidation.residualStandardError > 20) {
      warnings.push(`High residual standard error (${analysis.modelValidation.residualStandardError.toFixed(2)}). Predictions may be imprecise.`);
      recommendations.push('Investigate outliers and consider robust regression methods.');
    }

    // Check F-statistic significance
    if (analysis.modelValidation.fPValue > 0.05) {
      warnings.push(`Overall model not statistically significant (F p-value: ${analysis.modelValidation.fPValue.toFixed(3)})`);
      isValid = false;
    }

    return { isValid, warnings, recommendations };
  }

  /**
   * Calculates confidence intervals for predictions
   * Requirements: 5.2 - Confidence interval calculation for predictions
   */
  calculatePredictionConfidenceInterval(
    predictedScore: number,
    regressionResults: RegressionAnalysisResult[],
    confidenceLevel: number = 0.95
  ): [number, number] {
    // Calculate prediction standard error based on regression results
    const significantResults = regressionResults.filter(r => r.isStatisticallySignificant);
    
    if (significantResults.length === 0) {
      // No significant predictors - use wide interval
      const margin = predictedScore * 0.3; // 30% margin
      return [predictedScore - margin, predictedScore + margin];
    }

    // Calculate combined standard error from significant predictors
    const combinedVariance = significantResults.reduce((sum, result) => {
      const intervalWidth = result.confidenceInterval[1] - result.confidenceInterval[0];
      const standardError = intervalWidth / (2 * 1.96); // Approximate SE from CI
      return sum + standardError * standardError;
    }, 0);

    const combinedStandardError = Math.sqrt(combinedVariance);
    
    // Calculate margin of error for desired confidence level
    const zScore = confidenceLevel === 0.95 ? 1.96 : 
                   confidenceLevel === 0.90 ? 1.645 : 
                   confidenceLevel === 0.99 ? 2.576 : 1.96;
    
    const marginOfError = zScore * combinedStandardError;
    
    return [
      Math.max(0, predictedScore - marginOfError),
      predictedScore + marginOfError
    ];
  }

  /**
   * Gets the last analysis date
   */
  getLastAnalysisDate(): Date | null {
    return this.lastAnalysisDate;
  }

  /**
   * Gets the weight manager instance for direct access
   * Requirements: 6.4 - Integrate with enhanced StatisticalImpactAnalyzer
   */
  getWeightManager(): RegressionBasedWeightManager {
    return this.weightManager;
  }

  /**
   * Gets weight change history for a season
   * Requirements: 6.2 - Weight history tracking and logging functionality
   */
  async getWeightHistory(season: number, limit?: number) {
    return await this.weightManager.getWeightHistory(season, limit);
  }

  /**
   * Manually updates weights with validation and logging
   * Requirements: 6.5 - Manual weight overrides with logging
   */
  async updateWeightsManually(
    season: number,
    newWeights: Partial<StatisticalImpactWeights>,
    reason: string,
    userId?: string
  ) {
    const changeLog = await this.weightManager.updateWeightsManually(season, newWeights, reason, userId);
    
    // Update local weights for backward compatibility
    this.currentWeights = changeLog.newWeights;
    this.lastAnalysisDate = new Date();
    
    return changeLog;
  }

  /**
   * Resets weights to fallback values
   * Requirements: 6.3 - Fallback mechanisms
   */
  async resetToFallbackWeights(season: number, reason: string, userId?: string) {
    const changeLog = await this.weightManager.resetToFallbackWeights(season, reason, userId);
    
    // Update local weights for backward compatibility
    this.currentWeights = changeLog.newWeights;
    this.lastAnalysisDate = new Date();
    
    return changeLog;
  }

  /**
   * Performs multiple linear regression analysis on efficiency metrics
   * Requirements: 5.1 - Multiple linear regression: actualScore = β₀ + β₁×offensiveEff + β₂×defensiveEff + β₃×turnovers + ε
   */
  async performRegressionAnalysis(season: number): Promise<EnhancedStatisticalAnalysis> {
    console.log(`Performing regression analysis for season ${season}`);

    // Get regression data points
    const dataPoints = await this.getRegressionDataPoints(season);
    
    if (dataPoints.length < 30) {
      throw new Error(`Insufficient data for regression analysis: ${dataPoints.length} games found (minimum 30 required)`);
    }

    // Prepare data matrices for regression
    const metrics: (keyof Pick<RegressionDataPoint, 'scoringEfficiency' | 'passingEfficiency' | 'rushingEfficiency' | 'turnoverEfficiency'>)[] = 
      ['scoringEfficiency', 'passingEfficiency', 'rushingEfficiency', 'turnoverEfficiency'];
    const regressionResults: RegressionAnalysisResult[] = [];

    // Perform regression for each metric
    for (const metric of metrics) {
      try {
        const result = await this.performSingleMetricRegression(dataPoints, metric);
        regressionResults.push(result);
      } catch (error) {
        console.warn(`Failed to perform regression for ${metric}:`, error);
      }
    }

    // Perform multiple regression with all significant metrics
    const significantMetrics = regressionResults.filter(r => r.isStatisticallySignificant);
    const multipleRegressionResult = this.performMultipleRegression(dataPoints, significantMetrics);

    // Calculate recommended weights based on statistical significance
    const recommendedWeights = this.calculateRegressionBasedWeights(regressionResults);

    return {
      regressionResults,
      overallModelRSquared: multipleRegressionResult.rSquared,
      predictiveAccuracy: this.calculatePredictiveAccuracy(dataPoints, regressionResults),
      recommendedWeights,
      sampleSize: dataPoints.length,
      modelValidation: multipleRegressionResult.validation
    };
  }

  /**
   * Performs single metric regression analysis
   * Requirements: 5.2 - Calculate R² values, p-values, and confidence intervals
   */
  private async performSingleMetricRegression(
    dataPoints: RegressionDataPoint[],
    metric: keyof Pick<RegressionDataPoint, 'scoringEfficiency' | 'passingEfficiency' | 'rushingEfficiency' | 'turnoverEfficiency'>
  ): Promise<RegressionAnalysisResult> {
    // Extract X (efficiency values) and Y (actual scores)
    const X = dataPoints.map(point => point[metric]);
    const Y = dataPoints.map(point => point.actualPointsScored);

    // Perform simple linear regression using least squares
    const regression = this.calculateLinearRegression(X, Y);
    
    // Calculate statistical significance
    const pValue = this.calculatePValue(regression, X.length);
    const isSignificant = regression.rSquared > 0.2 && pValue < 0.1;
    
    // Calculate confidence interval for coefficient
    const confidenceInterval = this.calculateConfidenceInterval(regression, X.length);
    
    // Calculate weight based on statistical significance and effect size
    const weight = this.calculateMetricWeight(regression.rSquared, pValue, isSignificant);

    return {
      metric,
      coefficient: regression.slope,
      rSquared: regression.rSquared,
      pValue,
      confidenceInterval,
      weight,
      isStatisticallySignificant: isSignificant
    };
  }

  /**
   * Performs multiple linear regression with all metrics
   * Requirements: 5.1 - Multiple linear regression analysis
   */
  private performMultipleRegression(
    dataPoints: RegressionDataPoint[],
    significantMetrics: RegressionAnalysisResult[]
  ): { rSquared: number; validation: any } {
    if (significantMetrics.length === 0) {
      return {
        rSquared: 0,
        validation: {
          residualStandardError: 0,
          fStatistic: 0,
          fPValue: 1,
          adjustedRSquared: 0
        }
      };
    }

    // Prepare design matrix X (n x p) where n = observations, p = predictors
    const n = dataPoints.length;
    const p = significantMetrics.length + 1; // +1 for intercept
    
    // Create design matrix with intercept column
    const X: number[][] = [];
    const Y: number[] = dataPoints.map(point => point.actualPointsScored);

    for (let i = 0; i < n; i++) {
      const row = [1]; // Intercept term
      for (const metric of significantMetrics) {
        const metricKey = metric.metric as keyof Pick<RegressionDataPoint, 'scoringEfficiency' | 'passingEfficiency' | 'rushingEfficiency' | 'turnoverEfficiency'>;
        row.push(dataPoints[i][metricKey]);
      }
      X.push(row);
    }

    // Calculate coefficients using normal equation: β = (X'X)^(-1)X'Y
    const coefficients = this.solveNormalEquation(X, Y);
    
    // Calculate predictions and R²
    const predictions = X.map(row => 
      row.reduce((sum, x, j) => sum + x * coefficients[j], 0)
    );
    
    const rSquared = this.calculateRSquared(Y, predictions);
    const adjustedRSquared = this.calculateAdjustedRSquared(rSquared, n, p - 1);
    
    // Calculate residual standard error
    const residuals = Y.map((y, i) => y - predictions[i]);
    const residualSumSquares = residuals.reduce((sum, r) => sum + r * r, 0);
    const residualStandardError = Math.sqrt(residualSumSquares / (n - p));
    
    // Calculate F-statistic for overall model significance
    const totalSumSquares = this.calculateTotalSumSquares(Y);
    const regressionSumSquares = totalSumSquares - residualSumSquares;
    const fStatistic = (regressionSumSquares / (p - 1)) / (residualSumSquares / (n - p));
    const fPValue = this.calculateFPValue(fStatistic, p - 1, n - p);

    return {
      rSquared,
      validation: {
        residualStandardError,
        fStatistic,
        fPValue,
        adjustedRSquared
      }
    };
  }

  /**
   * Calculates regression-based weights for predictions
   * Requirements: 5.3, 5.4 - Weight adjustment based on statistical significance
   */
  private calculateRegressionBasedWeights(results: RegressionAnalysisResult[]): {
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

    // Map regression results to weight categories
    for (const result of results) {
      let weightKey: keyof typeof weights;
      
      switch (result.metric) {
        case 'scoringEfficiency':
          weightKey = 'scoring';
          break;
        case 'passingEfficiency':
          weightKey = 'passingYards';
          break;
        case 'rushingEfficiency':
          weightKey = 'rushingYards';
          break;
        case 'turnoverEfficiency':
          weightKey = 'turnovers';
          break;
        default:
          continue;
      }

      // Adjust weight based on statistical significance and effect size
      if (result.isStatisticallySignificant) {
        if (result.rSquared > 0.6) {
          // Strong correlation - increase weight significantly
          weights[weightKey] = Math.min(0.5, result.weight * 1.5);
        } else if (result.rSquared > 0.5) {
          // Good correlation - increase weight moderately
          weights[weightKey] = Math.min(0.4, result.weight * 1.2);
        } else {
          // Weak but significant correlation - use calculated weight
          weights[weightKey] = result.weight;
        }
      } else {
        // Not statistically significant - reduce weight
        if (result.rSquared < 0.2 || result.pValue > 0.1) {
          weights[weightKey] = Math.max(0.05, result.weight * 0.5);
        }
      }
    }

    // Normalize weights to sum to 1.0
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    if (totalWeight > 0) {
      for (const key in weights) {
        weights[key as keyof typeof weights] /= totalWeight;
      }
    }

    return weights;
  }

  // Private helper methods

  /**
   * Creates a safe StatisticalImpactWeights object with proper type validation
   * Replaces unsafe type assertion with type-safe conversion
   */
  private createSafeStatisticalImpactWeights(
    weights: StatisticalImpactWeights, 
    weightSum: number
  ): StatisticalImpactWeights {
    const normalizedWeights: StatisticalImpactWeights = {
      passingOffense: (weights.passingOffense || 0) / weightSum * 1.5,
      rushingOffense: (weights.rushingOffense || 0) / weightSum * 1.5,
      scoringEfficiency: (weights.scoringEfficiency || 0) / weightSum * 1.5,
      passingDefense: (weights.passingDefense || 0) / weightSum * 1.5,
      rushingDefense: (weights.rushingDefense || 0) / weightSum * 1.5,
      turnoverMargin: (weights.turnoverMargin || 0) / weightSum * 1.5,
      specialTeams: (weights.specialTeams || 0) / weightSum * 1.5,
      homeFieldAdvantage: (weights.homeFieldAdvantage || 0) / weightSum * 1.5
    };

    // Validate the created object using type guard
    if (!isValidWeightObject(normalizedWeights)) {
      throw new Error('Failed to create valid StatisticalImpactWeights object: invalid weight values detected');
    }

    // Additional validation: ensure no negative weights and reasonable ranges
    const weightValues = Object.values(normalizedWeights);
    if (weightValues.some(weight => weight < 0)) {
      throw new Error('Invalid weights: negative values detected');
    }

    if (weightValues.some(weight => weight > 2.0)) {
      console.warn('Warning: Some weights exceed expected range (>2.0), this may indicate calculation issues');
    }

    return normalizedWeights;
  }

  private async getGameOutcomesWithEfficiency(
    season: number, 
    minGames: number
  ): Promise<GameOutcomeData[]> {
    const completedGames = await db
      .select({
        gameId: games.id,
        homeTeamId: games.homeTeamId,
        awayTeamId: games.awayTeamId,
        homeScore: games.homeTeamScore,
        awayScore: games.awayTeamScore
      })
      .from(games)
      .where(
        and(
          eq(games.season, season),
          isNotNull(games.homeTeamScore),
          isNotNull(games.awayTeamScore),
          eq(games.isFinal, true)
        )
      );

    // Get efficiency ratings for all teams
    const efficiencyRatings = await db
      .select()
      .from(teamEfficiencyRatings)
      .where(eq(teamEfficiencyRatings.season, season));

    const efficiencyMap = new Map(
      efficiencyRatings.map(rating => [rating.teamId, rating])
    );

    const gameOutcomes: GameOutcomeData[] = [];

    for (const game of completedGames) {
      if (game.homeScore === null || game.awayScore === null) continue;

      const homeEfficiency = efficiencyMap.get(game.homeTeamId);
      const awayEfficiency = efficiencyMap.get(game.awayTeamId);

      // Skip games where teams don't have enough games played
      if (homeEfficiency && homeEfficiency.gamesPlayed < minGames) continue;
      if (awayEfficiency && awayEfficiency.gamesPlayed < minGames) continue;

      gameOutcomes.push({
        gameId: game.gameId,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        pointDifferential: game.homeScore - game.awayScore,
        winner: game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId,
        homeTeamEfficiency: homeEfficiency ? this.convertToAdvancedProfile(homeEfficiency) : null,
        awayTeamEfficiency: awayEfficiency ? this.convertToAdvancedProfile(awayEfficiency) : null
      });
    }

    return gameOutcomes;
  }

  private convertToAdvancedProfile(rating: any): AdvancedTeamEfficiencyProfile {
    return {
      teamId: rating.teamId,
      season: rating.season,
      totalOffenseEfficiency: Number(rating.totalOffenseEfficiency) || 0,
      passingOffenseEfficiency: Number(rating.passingOffenseEfficiency) || 0,
      rushingOffenseEfficiency: Number(rating.rushingOffenseEfficiency) || 0,
      scoringOffenseEfficiency: Number(rating.scoringOffenseEfficiency) || 0,
      totalDefenseEfficiency: Number(rating.totalDefenseEfficiency) || 0,
      passingDefenseEfficiency: Number(rating.passingDefenseEfficiency) || 0,
      rushingDefenseEfficiency: Number(rating.rushingDefenseEfficiency) || 0,
      scoringDefenseEfficiency: Number(rating.scoringDefenseEfficiency) || 0,
      interceptionEfficiency: Number(rating.interceptionEfficiency) || 0,
      interceptionDefenseEfficiency: Number(rating.interceptionDefenseEfficiency) || 0,
      sackOffenseEfficiency: Number(rating.sackOffenseEfficiency) || 0,
      sackDefenseEfficiency: Number(rating.sackDefenseEfficiency) || 0,
      fieldGoalEfficiency: Number(rating.fieldGoalEfficiency) || 0,
      gamesPlayed: rating.gamesPlayed,
      convergenceScore: Number(rating.convergenceScore) || 0,
      confidenceLevel: rating.confidenceLevel as 'High' | 'Medium' | 'Low',
      lastCalculated: rating.lastCalculated
    };
  }

  private calculateWinCorrelation(
    gameOutcomes: GameOutcomeData[], 
    metric: keyof AdvancedTeamEfficiencyProfile
  ): number {
    const validGames = gameOutcomes.filter(game => 
      game.homeTeamEfficiency && game.awayTeamEfficiency
    );

    if (validGames.length < 5) return 0;

    const correlationData: Array<{ efficiencyDiff: number; homeWin: number }> = [];

    for (const game of validGames) {
      if (!game.homeTeamEfficiency || !game.awayTeamEfficiency) continue;

      const homeMetricValue = game.homeTeamEfficiency[metric] as number;
      const awayMetricValue = game.awayTeamEfficiency[metric] as number;
      
      if (typeof homeMetricValue !== 'number' || typeof awayMetricValue !== 'number') continue;

      const efficiencyDiff = homeMetricValue - awayMetricValue;
      const homeWin = game.winner === game.homeTeamId ? 1 : 0;

      correlationData.push({ efficiencyDiff, homeWin });
    }

    return this.calculatePearsonCorrelation(
      correlationData.map(d => d.efficiencyDiff),
      correlationData.map(d => d.homeWin)
    );
  }

  private calculatePointDifferentialCorrelation(
    gameOutcomes: GameOutcomeData[], 
    metric: keyof AdvancedTeamEfficiencyProfile
  ): number {
    const validGames = gameOutcomes.filter(game => 
      game.homeTeamEfficiency && game.awayTeamEfficiency
    );

    if (validGames.length < 5) return 0;

    const correlationData: Array<{ efficiencyDiff: number; pointDiff: number }> = [];

    for (const game of validGames) {
      if (!game.homeTeamEfficiency || !game.awayTeamEfficiency) continue;

      const homeMetricValue = game.homeTeamEfficiency[metric] as number;
      const awayMetricValue = game.awayTeamEfficiency[metric] as number;
      
      if (typeof homeMetricValue !== 'number' || typeof awayMetricValue !== 'number') continue;

      const efficiencyDiff = homeMetricValue - awayMetricValue;
      correlationData.push({ efficiencyDiff, pointDiff: game.pointDifferential });
    }

    return this.calculatePearsonCorrelation(
      correlationData.map(d => d.efficiencyDiff),
      correlationData.map(d => d.pointDiff)
    );
  }

  private calculatePearsonCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0;

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateConfidenceLevel(sampleSize: number): number {
    // Simple confidence calculation based on sample size
    if (sampleSize >= 100) return 0.95;
    if (sampleSize >= 50) return 0.90;
    if (sampleSize >= 25) return 0.80;
    if (sampleSize >= 10) return 0.70;
    return 0.60;
  }

  private getWeightForMetric(
    correlationResults: MetricCorrelationAnalysis[],
    metricName: string,
    totalPredictivePower: number
  ): number {
    const result = correlationResults.find(r => r.metric === metricName);
    if (!result || totalPredictivePower === 0) return 0.1; // Default weight
    
    return result.predictivePower / totalPredictivePower;
  }

  // Regression analysis helper methods

  /**
   * Gets regression data points for analysis
   * Requirements: 5.1 - Prepare data for regression analysis
   */
  private async getRegressionDataPoints(season: number): Promise<RegressionDataPoint[]> {
    const gameOutcomes = await this.getGameOutcomesWithEfficiency(season, 5);
    const dataPoints: RegressionDataPoint[] = [];

    for (const game of gameOutcomes) {
      if (!game.homeTeamEfficiency || !game.awayTeamEfficiency) continue;

      // Add data point for home team
      dataPoints.push({
        gameId: game.gameId,
        teamId: game.homeTeamId,
        opponentId: game.awayTeamId,
        actualPointsScored: game.homeScore,
        actualPassingYards: 0, // Would need to get from box score stats
        actualRushingYards: 0, // Would need to get from box score stats
        scoringEfficiency: game.homeTeamEfficiency.scoringOffenseEfficiency,
        passingEfficiency: game.homeTeamEfficiency.passingOffenseEfficiency,
        rushingEfficiency: game.homeTeamEfficiency.rushingOffenseEfficiency,
        turnoverEfficiency: game.homeTeamEfficiency.interceptionEfficiency,
        opponentPointsBaseline: game.awayTeamEfficiency.scoringDefenseEfficiency,
        opponentPassingBaseline: game.awayTeamEfficiency.passingDefenseEfficiency,
        opponentRushingBaseline: game.awayTeamEfficiency.rushingDefenseEfficiency
      });

      // Add data point for away team
      dataPoints.push({
        gameId: game.gameId,
        teamId: game.awayTeamId,
        opponentId: game.homeTeamId,
        actualPointsScored: game.awayScore,
        actualPassingYards: 0, // Would need to get from box score stats
        actualRushingYards: 0, // Would need to get from box score stats
        scoringEfficiency: game.awayTeamEfficiency.scoringOffenseEfficiency,
        passingEfficiency: game.awayTeamEfficiency.passingOffenseEfficiency,
        rushingEfficiency: game.awayTeamEfficiency.rushingOffenseEfficiency,
        turnoverEfficiency: game.awayTeamEfficiency.interceptionEfficiency,
        opponentPointsBaseline: game.homeTeamEfficiency.scoringDefenseEfficiency,
        opponentPassingBaseline: game.homeTeamEfficiency.passingDefenseEfficiency,
        opponentRushingBaseline: game.homeTeamEfficiency.rushingDefenseEfficiency
      });
    }

    return dataPoints;
  }

  /**
   * Calculates simple linear regression using least squares
   * Requirements: 5.1 - Least squares regression analysis
   */
  private calculateLinearRegression(X: number[], Y: number[]): {
    slope: number;
    intercept: number;
    rSquared: number;
    residualSumSquares: number;
  } {
    const n = X.length;
    if (n === 0) throw new Error('No data points for regression');

    const sumX = X.reduce((a, b) => a + b, 0);
    const sumY = Y.reduce((a, b) => a + b, 0);
    const sumXY = X.reduce((sum, x, i) => sum + x * Y[i], 0);
    const sumX2 = X.reduce((sum, x) => sum + x * x, 0);

    const meanX = sumX / n;
    const meanY = sumY / n;

    // Calculate slope and intercept using least squares
    const numerator = sumXY - n * meanX * meanY;
    const denominator = sumX2 - n * meanX * meanX;
    
    if (Math.abs(denominator) < 1e-10) {
      throw new Error('Cannot perform regression: no variance in X values');
    }

    const slope = numerator / denominator;
    const intercept = meanY - slope * meanX;

    // Calculate R²
    const predictions = X.map(x => intercept + slope * x);
    const rSquared = this.calculateRSquared(Y, predictions);
    
    // Calculate residual sum of squares
    const residuals = Y.map((y, i) => y - predictions[i]);
    const residualSumSquares = residuals.reduce((sum, r) => sum + r * r, 0);

    return { slope, intercept, rSquared, residualSumSquares };
  }

  /**
   * Calculates R² (coefficient of determination)
   * Requirements: 5.2 - R² calculation
   */
  private calculateRSquared(actual: number[], predicted: number[]): number {
    if (actual.length !== predicted.length || actual.length === 0) return 0;

    const meanActual = actual.reduce((a, b) => a + b, 0) / actual.length;
    
    const totalSumSquares = actual.reduce((sum, y) => sum + Math.pow(y - meanActual, 2), 0);
    const residualSumSquares = actual.reduce((sum, y, i) => sum + Math.pow(y - predicted[i], 2), 0);
    
    if (totalSumSquares === 0) return 0;
    
    return 1 - (residualSumSquares / totalSumSquares);
  }

  /**
   * Calculates adjusted R² for multiple regression
   */
  private calculateAdjustedRSquared(rSquared: number, n: number, p: number): number {
    if (n <= p + 1) return 0;
    return 1 - ((1 - rSquared) * (n - 1)) / (n - p - 1);
  }

  /**
   * Calculates total sum of squares
   */
  private calculateTotalSumSquares(Y: number[]): number {
    const mean = Y.reduce((a, b) => a + b, 0) / Y.length;
    return Y.reduce((sum, y) => sum + Math.pow(y - mean, 2), 0);
  }

  /**
   * Calculates p-value for regression coefficient
   * Requirements: 5.2 - Statistical significance testing (p-values)
   */
  private calculatePValue(regression: any, sampleSize: number): number {
    // Simplified p-value calculation based on t-statistic
    // In a full implementation, this would use proper t-distribution
    const degreesOfFreedom = sampleSize - 2;
    
    if (degreesOfFreedom <= 0 || regression.residualSumSquares === 0) return 1.0;
    
    // Estimate standard error of slope
    const standardError = Math.sqrt(regression.residualSumSquares / degreesOfFreedom);
    
    if (standardError === 0) return 0.0;
    
    // Calculate t-statistic
    const tStatistic = Math.abs(regression.slope) / standardError;
    
    // Simplified p-value approximation (would use proper t-distribution in production)
    if (tStatistic > 2.576) return 0.01;  // 99% confidence
    if (tStatistic > 1.96) return 0.05;   // 95% confidence
    if (tStatistic > 1.645) return 0.10;  // 90% confidence
    if (tStatistic > 1.282) return 0.20;  // 80% confidence
    
    return 0.5; // Not significant
  }

  /**
   * Calculates confidence interval for regression coefficient
   * Requirements: 5.2 - Confidence intervals for each efficiency metric
   */
  private calculateConfidenceInterval(regression: any, sampleSize: number): [number, number] {
    const degreesOfFreedom = sampleSize - 2;
    
    if (degreesOfFreedom <= 0 || regression.residualSumSquares === 0) {
      return [regression.slope, regression.slope];
    }
    
    // Estimate standard error
    const standardError = Math.sqrt(regression.residualSumSquares / degreesOfFreedom);
    
    // Use t-critical value for 95% confidence (approximation)
    const tCritical = 1.96; // Would use proper t-distribution lookup in production
    const marginOfError = tCritical * standardError;
    
    return [
      regression.slope - marginOfError,
      regression.slope + marginOfError
    ];
  }

  /**
   * Calculates weight for metric based on statistical significance
   * Requirements: 5.3, 5.4 - Weight adjustment based on significance
   */
  private calculateMetricWeight(rSquared: number, pValue: number, isSignificant: boolean): number {
    if (!isSignificant) {
      return 0.05; // Minimal weight for non-significant metrics
    }
    
    // Base weight on R² value
    let weight = rSquared * 0.5; // Scale R² to reasonable weight range
    
    // Adjust based on p-value (lower p-value = higher confidence = higher weight)
    if (pValue < 0.01) {
      weight *= 1.3; // High confidence boost
    } else if (pValue < 0.05) {
      weight *= 1.1; // Moderate confidence boost
    }
    
    // Ensure weight is within reasonable bounds
    return Math.max(0.05, Math.min(0.5, weight));
  }

  /**
   * Solves normal equation for multiple regression: β = (X'X)^(-1)X'Y
   * Requirements: 5.1 - Multiple linear regression using least squares
   */
  private solveNormalEquation(X: number[][], Y: number[]): number[] {
    const n = X.length;
    const p = X[0].length;
    
    // Calculate X'X (p x p matrix)
    const XTX: number[][] = [];
    for (let i = 0; i < p; i++) {
      XTX[i] = [];
      for (let j = 0; j < p; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += X[k][i] * X[k][j];
        }
        XTX[i][j] = sum;
      }
    }
    
    // Calculate X'Y (p x 1 vector)
    const XTY: number[] = [];
    for (let i = 0; i < p; i++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += X[k][i] * Y[k];
      }
      XTY[i] = sum;
    }
    
    // Solve XTX * β = XTY using Gaussian elimination
    return this.gaussianElimination(XTX, XTY);
  }

  /**
   * Solves linear system using Gaussian elimination
   */
  private gaussianElimination(A: number[][], b: number[]): number[] {
    const n = A.length;
    const augmented: number[][] = A.map((row, i) => [...row, b[i]]);
    
    // Forward elimination
    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }
      
      // Swap rows
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
      
      // Make all rows below this one 0 in current column
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[i][i]) < 1e-10) continue; // Skip if pivot is too small
        
        const factor = augmented[k][i] / augmented[i][i];
        for (let j = i; j <= n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }
    
    // Back substitution
    const solution: number[] = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      solution[i] = augmented[i][n];
      for (let j = i + 1; j < n; j++) {
        solution[i] -= augmented[i][j] * solution[j];
      }
      
      if (Math.abs(augmented[i][i]) < 1e-10) {
        solution[i] = 0; // Handle singular matrix
      } else {
        solution[i] /= augmented[i][i];
      }
    }
    
    return solution;
  }

  /**
   * Calculates F-statistic p-value (simplified approximation)
   */
  private calculateFPValue(fStatistic: number, df1: number, df2: number): number {
    // Simplified F-distribution p-value approximation
    // In production, would use proper F-distribution calculation
    if (fStatistic > 10) return 0.001;
    if (fStatistic > 5) return 0.01;
    if (fStatistic > 3) return 0.05;
    if (fStatistic > 2) return 0.10;
    return 0.5;
  }

  /**
   * Calculates predictive accuracy of regression model
   */
  private calculatePredictiveAccuracy(dataPoints: RegressionDataPoint[], results: RegressionAnalysisResult[]): number {
    if (dataPoints.length === 0 || results.length === 0) return 0;
    
    let correctPredictions = 0;
    
    for (const point of dataPoints) {
      // Calculate predicted score using regression coefficients
      let predictedScore = 0;
      for (const result of results) {
        if (result.isStatisticallySignificant) {
          const metricKey = result.metric as keyof Pick<RegressionDataPoint, 'scoringEfficiency' | 'passingEfficiency' | 'rushingEfficiency' | 'turnoverEfficiency'>;
          predictedScore += result.coefficient * point[metricKey];
        }
      }
      
      // Check if prediction is within reasonable range of actual score
      const error = Math.abs(predictedScore - point.actualPointsScored);
      const relativeError = error / Math.max(point.actualPointsScored, 1);
      
      if (relativeError < 0.3) { // Within 30% is considered correct
        correctPredictions++;
      }
    }
    
    return correctPredictions / dataPoints.length;
  }

  /**
   * Checks for multicollinearity between regression predictors
   */
  private checkMulticollinearity(results: RegressionAnalysisResult[]): string[] {
    const highCorrelationPairs: string[] = [];
    
    // Simple check based on coefficient magnitudes and significance
    // In production, would calculate VIF (Variance Inflation Factor)
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const result1 = results[i];
        const result2 = results[j];
        
        // Check if both metrics have similar coefficients and high significance
        if (result1.isStatisticallySignificant && result2.isStatisticallySignificant) {
          const coeffRatio = Math.abs(result1.coefficient / result2.coefficient);
          if (coeffRatio > 0.7 && coeffRatio < 1.3) {
            highCorrelationPairs.push(`${result1.metric} and ${result2.metric}`);
          }
        }
      }
    }
    
    return highCorrelationPairs;
  }
}

// Export singleton instance
export const statisticalImpactAnalyzer = new StatisticalImpactAnalyzer();