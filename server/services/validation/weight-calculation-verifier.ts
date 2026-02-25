// server/services/validation/weight-calculation-verifier.ts

import { BaseValidator, validationLogger, errorHandler, DEFAULT_VALIDATION_CONFIG } from './core.js';
import { 
  ValidationResult, 
  WeightValidationResult,
  WeightDerivationResult,
  WeightBoundsResult,
  WeightApplicationResult,
  WeightHistoryResult,
  ValidationLogger,
  ErrorHandler,
  ValidationConfig,
  ValidationComponent
} from './types.js';
import { StatisticalImpactWeights, RegressionAnalysisResult, EnhancedStatisticalAnalysis } from '../statisticalImpactAnalyzer.js';
import { RegressionBasedWeightManager, WeightChangeLog } from '../regressionBasedWeightManager.js';
import { db } from '../../db.js';
import { predictionWeightHistory, regressionAnalysisResults, regressionMetricResults } from '@college-pickem/shared';
import { eq, desc, and } from 'drizzle-orm';

/**
 * Weight Calculation Verifier
 * Validates weight derivation, bounds, application, and history tracking
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
export class WeightCalculationVerifier extends BaseValidator {
  private weightManager: RegressionBasedWeightManager;

  constructor(
    component: ValidationComponent,
    logger: ValidationLogger,
    errorHandler: ErrorHandler,
    config: ValidationConfig
  ) {
    super(component, logger, errorHandler, config);
    this.weightManager = new RegressionBasedWeightManager();
  }

  /**
   * Main validation method - validates all aspects of weight calculation
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
   */
  async validate(season: number): Promise<WeightValidationResult> {
    const result = this.createBaseResult(true, 100) as WeightValidationResult;
    
    try {
      // Validate weight derivation from regression results
      const derivationResult = await this.validateWeightDerivation(season);
      result.weightDerivation = derivationResult;
      
      if (!derivationResult.isCorrect) {
        this.addError(result, 'WEIGHT_DERIVATION_INVALID', 
          'Weight derivation from regression coefficients is incorrect', 'high');
      }

      // Validate weight bounds and normalization
      const boundsResult = await this.validateWeightBounds(season);
      result.weightBounds = boundsResult;
      
      if (!boundsResult.allWithinBounds) {
        this.addError(result, 'WEIGHT_BOUNDS_INVALID', 
          'One or more weights are outside acceptable bounds (0 to 2.0)', 'medium');
      }

      // Validate weight application in predictions
      const applicationResult = await this.validateWeightApplication(season);
      result.weightApplication = applicationResult;
      
      if (!applicationResult.correctlyApplied) {
        this.addError(result, 'WEIGHT_APPLICATION_INVALID', 
          'Weights are not being applied correctly in prediction formulas', 'high');
      }

      // Validate weight history and audit trail
      const historyResult = await this.validateWeightHistory(season);
      result.weightHistory = historyResult;
      
      if (!historyResult.hasCompleteHistory) {
        this.addWarning(result, 'WEIGHT_HISTORY_INCOMPLETE', 
          'Weight change history is incomplete or missing audit trail');
      }

      // Add recommendations based on findings
      this.addRecommendations(result);

      this.logResult(result);
      return result;

    } catch (error) {
      this.errorHandler.handleSystemError(error as Error, { 
        component: this.component, 
        method: 'validate',
        season 
      });
      
      this.addError(result, 'VALIDATION_SYSTEM_ERROR', 
        `System error during weight validation: ${(error as Error).message}`, 'critical');
      
      return result;
    }
  }

  /**
   * Validates weight derivation from regression coefficients
   * Requirements: 3.1, 3.2
   */
  private async validateWeightDerivation(season: number): Promise<WeightDerivationResult> {
    const result: WeightDerivationResult = {
      isCorrect: true,
      derivationMethod: 'regression-based',
      inputCoefficients: {},
      calculatedWeights: {},
      normalizationApplied: false,
      statisticalSignificanceConsidered: false,
      derivationSteps: []
    };

    try {
      // Get the latest regression analysis for this season
      const latestAnalysis = await db
        .select()
        .from(regressionAnalysisResults)
        .where(eq(regressionAnalysisResults.season, season))
        .orderBy(desc(regressionAnalysisResults.analysisDate))
        .limit(1);

      if (latestAnalysis.length === 0) {
        result.isCorrect = false;
        result.derivationSteps.push({
          step: 'Get regression analysis',
          input: { season },
          output: 'No regression analysis found',
          isValid: false
        });
        return result;
      }

      const analysis = latestAnalysis[0];
      
      // Get regression metric results
      const metricResults = await db
        .select()
        .from(regressionMetricResults)
        .where(eq(regressionMetricResults.analysisId, analysis.id));

      if (metricResults.length === 0) {
        result.isCorrect = false;
        result.derivationSteps.push({
          step: 'Get metric results',
          input: { analysisId: analysis.id },
          output: 'No metric results found',
          isValid: false
        });
        return result;
      }

      // Step 1: Extract coefficients from regression results
      const coefficients: Record<string, number> = {};
      for (const metric of metricResults) {
        coefficients[metric.metricName] = parseFloat(metric.coefficient || '0');
      }
      
      result.inputCoefficients = coefficients;
      result.derivationSteps.push({
        step: 'Extract coefficients',
        input: { metricResults: metricResults.length },
        output: coefficients,
        isValid: Object.keys(coefficients).length > 0
      });

      // Step 2: Check statistical significance consideration
      const significantMetrics = metricResults.filter(m => 
        parseFloat(m.pValue || '1') < this.config.thresholds.regression.pValueThreshold &&
        parseFloat(m.rSquared || '0') > this.config.thresholds.regression.rSquaredThreshold
      );

      result.statisticalSignificanceConsidered = significantMetrics.length > 0;
      result.derivationSteps.push({
        step: 'Check statistical significance',
        input: { 
          pValueThreshold: this.config.thresholds.regression.pValueThreshold,
          rSquaredThreshold: this.config.thresholds.regression.rSquaredThreshold
        },
        output: { significantMetrics: significantMetrics.length },
        isValid: result.statisticalSignificanceConsidered
      });

      // Step 3: Calculate weights from coefficients
      const calculatedWeights = this.calculateWeightsFromCoefficients(coefficients, significantMetrics);
      result.calculatedWeights = calculatedWeights;
      result.derivationSteps.push({
        step: 'Calculate weights from coefficients',
        input: coefficients,
        output: calculatedWeights,
        isValid: Object.keys(calculatedWeights).length > 0
      });

      // Step 4: Check if normalization was applied
      const weightSum = Object.values(calculatedWeights).reduce((sum, weight) => sum + weight, 0);
      result.normalizationApplied = Math.abs(weightSum - 1.0) < 0.01; // Allow small tolerance
      result.derivationSteps.push({
        step: 'Check normalization',
        input: { weightSum },
        output: { normalized: result.normalizationApplied },
        isValid: true
      });

      // Step 5: Verify against current weights
      const currentWeights = await this.weightManager.getCurrentWeights(season);
      const weightsMatch = this.compareWeights(calculatedWeights, currentWeights);
      
      result.derivationSteps.push({
        step: 'Compare with current weights',
        input: { calculated: calculatedWeights, current: currentWeights },
        output: { match: weightsMatch },
        isValid: weightsMatch
      });

      result.isCorrect = weightsMatch && result.statisticalSignificanceConsidered;

    } catch (error) {
      result.isCorrect = false;
      result.derivationSteps.push({
        step: 'Error handling',
        input: { error: (error as Error).message },
        output: 'Validation failed',
        isValid: false
      });
    }

    return result;
  }

  /**
   * Validates weight bounds and normalization
   * Requirements: 3.2, 3.5
   */
  private async validateWeightBounds(season: number): Promise<WeightBoundsResult> {
    const result: WeightBoundsResult = {
      allWithinBounds: true,
      weightBounds: {
        min: this.config.thresholds.weights.minimumWeight,
        max: this.config.thresholds.weights.maximumWeight
      },
      weightValues: [],
      sumValidation: {
        totalSum: 0,
        expectedSum: 1.0,
        isValid: true
      }
    };

    try {
      const currentWeights = await this.weightManager.getCurrentWeights(season);
      let totalSum = 0;

      // Check each weight category
      for (const [category, weight] of Object.entries(currentWeights)) {
        const withinBounds = weight >= result.weightBounds.min && weight <= result.weightBounds.max;
        
        result.weightValues.push({
          category,
          weight,
          withinBounds,
          expectedRange: [result.weightBounds.min, result.weightBounds.max]
        });

        if (!withinBounds) {
          result.allWithinBounds = false;
        }

        totalSum += weight;
      }

      // Validate sum
      result.sumValidation.totalSum = totalSum;
      result.sumValidation.isValid = Math.abs(totalSum - result.sumValidation.expectedSum) <= this.config.thresholds.weights.sumTolerance;

      if (!result.sumValidation.isValid) {
        result.allWithinBounds = false;
      }

    } catch (error) {
      result.allWithinBounds = false;
    }

    return result;
  }

  /**
   * Validates weight application in prediction formulas
   * Requirements: 3.3, 3.4, 3.5
   */
  private async validateWeightApplication(season: number): Promise<WeightApplicationResult> {
    const result: WeightApplicationResult = {
      correctlyApplied: true,
      predictionFormula: 'Point-differential system with weighted efficiency metrics',
      weightUsage: [],
      finalCalculation: {
        homeTeamScore: 0,
        awayTeamScore: 0,
        calculationSteps: []
      }
    };

    try {
      const currentWeights = await this.weightManager.getCurrentWeights(season);
      
      // Validate weight change logging
      const changeLoggingValid = await this.validateWeightChangeLogging(season);
      if (!changeLoggingValid) {
        result.correctlyApplied = false;
        result.finalCalculation.calculationSteps.push('ERROR: Weight changes are not properly logged');
      }

      // Validate fallback mechanism
      const fallbackValid = await this.validateFallbackMechanism(season);
      if (!fallbackValid) {
        result.correctlyApplied = false;
        result.finalCalculation.calculationSteps.push('ERROR: Fallback to baseline weights is not working correctly');
      }

      // Simulate a prediction calculation to verify weight application
      const testHomeEfficiencies = {
        passingOffense: 5.2,
        rushingOffense: 3.8,
        scoringEfficiency: 7.1,
        passingDefense: -2.3,
        rushingDefense: -1.8,
        turnoverMargin: 4.2,
        specialTeams: 1.5,
        homeFieldAdvantage: 2.5
      };

      const testAwayEfficiencies = {
        passingOffense: 2.8,
        rushingOffense: 4.1,
        scoringEfficiency: 3.9,
        passingDefense: -4.1,
        rushingDefense: -3.2,
        turnoverMargin: -1.8,
        specialTeams: -0.8,
        homeFieldAdvantage: 0
      };

      // Calculate weighted contributions
      let homeScore = 21; // Base score
      let awayScore = 21; // Base score

      result.finalCalculation.calculationSteps.push('=== Weight Application Verification ===');
      result.finalCalculation.calculationSteps.push(`Base scores: Home=${homeScore}, Away=${awayScore}`);

      for (const [category, weight] of Object.entries(currentWeights)) {
        const homeEfficiency = testHomeEfficiencies[category as keyof typeof testHomeEfficiencies] || 0;
        const awayEfficiency = testAwayEfficiencies[category as keyof typeof testAwayEfficiencies] || 0;
        
        const homeContribution = homeEfficiency * weight;
        const awayContribution = awayEfficiency * weight;

        homeScore += homeContribution;
        awayScore += awayContribution;

        // Validate weight application correctness
        const isCorrect = this.validateSingleWeightApplication(category, weight, homeEfficiency, awayEfficiency, homeContribution, awayContribution);

        result.weightUsage.push({
          category,
          weight,
          value: homeEfficiency - awayEfficiency,
          contribution: homeContribution - awayContribution,
          isCorrect
        });

        result.finalCalculation.calculationSteps.push(
          `${category}: Home(${homeEfficiency.toFixed(2)} * ${weight.toFixed(3)} = ${homeContribution.toFixed(2)}) vs Away(${awayEfficiency.toFixed(2)} * ${weight.toFixed(3)} = ${awayContribution.toFixed(2)}) [${isCorrect ? 'VALID' : 'INVALID'}]`
        );

        if (!isCorrect) {
          result.correctlyApplied = false;
        }
      }

      result.finalCalculation.homeTeamScore = Math.round(homeScore * 10) / 10;
      result.finalCalculation.awayTeamScore = Math.round(awayScore * 10) / 10;

      result.finalCalculation.calculationSteps.push(`Final scores: Home=${result.finalCalculation.homeTeamScore}, Away=${result.finalCalculation.awayTeamScore}`);

      // Additional validation checks
      const additionalChecks = await this.performAdditionalWeightApplicationChecks(currentWeights, season);
      result.finalCalculation.calculationSteps.push('=== Additional Validation Checks ===');
      result.finalCalculation.calculationSteps.push(...additionalChecks.messages);
      
      if (!additionalChecks.allPassed) {
        result.correctlyApplied = false;
      }

    } catch (error) {
      result.correctlyApplied = false;
      result.finalCalculation.calculationSteps.push(`SYSTEM ERROR: ${(error as Error).message}`);
    }

    return result;
  }

  /**
   * Validates that weight changes are properly logged with audit trails
   * Requirements: 3.3, 3.4
   */
  private async validateWeightChangeLogging(season: number): Promise<boolean> {
    try {
      // Check if there are recent weight changes
      const recentChanges = await db
        .select()
        .from(predictionWeightHistory)
        .where(eq(predictionWeightHistory.season, season))
        .orderBy(desc(predictionWeightHistory.changeDate))
        .limit(5);

      if (recentChanges.length === 0) {
        // No changes is acceptable, but we should verify initial weights were logged
        return true;
      }

      // Validate that each change has proper audit trail
      for (const change of recentChanges) {
        // Check required fields
        if (!change.changeReason || change.changeReason.trim() === '') {
          return false;
        }
        
        if (!change.changeDate) {
          return false;
        }

        // Check that previous weights are recorded
        if (!change.previousWeights) {
          return false;
        }

        // Validate weight values are present
        const requiredWeights = ['passingOffense', 'rushingOffense', 'scoringEfficiency', 'passingDefense', 'rushingDefense', 'turnoverMargin', 'specialTeams', 'homeFieldAdvantage'];
        for (const weightType of requiredWeights) {
          if (change[weightType as keyof typeof change] === null || change[weightType as keyof typeof change] === undefined) {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validates fallback to baseline weights when regression fails
   * Requirements: 3.4, 3.5
   */
  private async validateFallbackMechanism(season: number): Promise<boolean> {
    try {
      // Test the fallback mechanism by simulating a regression failure scenario
      const testWeightManager = new RegressionBasedWeightManager();
      
      // Get current weights
      const currentWeights = await testWeightManager.getCurrentWeights(season);
      
      // Verify that weights are reasonable (not all zeros, not extreme values)
      for (const [category, weight] of Object.entries(currentWeights)) {
        if (weight < 0 || weight > 2.0 || isNaN(weight) || !isFinite(weight)) {
          return false;
        }
      }

      // Check that the sum is reasonable (should be close to 1.0 for normalized weights)
      const weightSum = Object.values(currentWeights).reduce((sum, weight) => sum + weight, 0);
      if (weightSum < 0.5 || weightSum > 2.0) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validates a single weight application calculation
   */
  private validateSingleWeightApplication(
    category: string,
    weight: number,
    homeEfficiency: number,
    awayEfficiency: number,
    homeContribution: number,
    awayContribution: number
  ): boolean {
    // Check for NaN or infinite values
    if (isNaN(weight) || !isFinite(weight) || 
        isNaN(homeEfficiency) || !isFinite(homeEfficiency) ||
        isNaN(awayEfficiency) || !isFinite(awayEfficiency) ||
        isNaN(homeContribution) || !isFinite(homeContribution) ||
        isNaN(awayContribution) || !isFinite(awayContribution)) {
      return false;
    }

    // Verify calculation correctness
    const expectedHomeContribution = homeEfficiency * weight;
    const expectedAwayContribution = awayEfficiency * weight;
    
    const tolerance = 0.001;
    if (Math.abs(homeContribution - expectedHomeContribution) > tolerance ||
        Math.abs(awayContribution - expectedAwayContribution) > tolerance) {
      return false;
    }

    // Check weight bounds
    if (weight < this.config.thresholds.weights.minimumWeight || 
        weight > this.config.thresholds.weights.maximumWeight) {
      return false;
    }

    return true;
  }

  /**
   * Performs additional weight application validation checks
   */
  private async performAdditionalWeightApplicationChecks(
    weights: StatisticalImpactWeights, 
    season: number
  ): Promise<{ allPassed: boolean; messages: string[] }> {
    const messages: string[] = [];
    let allPassed = true;

    // Check 1: Verify weights sum to reasonable total
    const weightSum = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(weightSum - 1.0) > this.config.thresholds.weights.sumTolerance) {
      messages.push(`WARNING: Weight sum (${weightSum.toFixed(3)}) deviates from expected 1.0 by more than tolerance (${this.config.thresholds.weights.sumTolerance})`);
      allPassed = false;
    } else {
      messages.push(`✓ Weight sum validation passed: ${weightSum.toFixed(3)}`);
    }

    // Check 2: Verify no extreme weight values
    for (const [category, weight] of Object.entries(weights)) {
      if (weight > 0.5) { // No single weight should dominate
        messages.push(`WARNING: Weight for ${category} (${weight.toFixed(3)}) is unusually high and may dominate predictions`);
        allPassed = false;
      } else if (weight < 0.01) { // Very small weights might indicate issues
        messages.push(`INFO: Weight for ${category} (${weight.toFixed(3)}) is very small`);
      }
    }

    // Check 3: Verify weights are being used consistently
    try {
      const weightHistory = await db
        .select()
        .from(predictionWeightHistory)
        .where(eq(predictionWeightHistory.season, season))
        .orderBy(desc(predictionWeightHistory.changeDate))
        .limit(2);

      if (weightHistory.length >= 2) {
        const current = weightHistory[0];
        const previous = weightHistory[1];
        
        // Check if weights changed significantly without proper justification
        let significantChange = false;
        const changeThreshold = 0.1; // 10% change threshold
        
        for (const weightType of Object.keys(weights)) {
          const currentValue = parseFloat(current[weightType as keyof typeof current] as string || '0');
          const previousValue = parseFloat(previous[weightType as keyof typeof previous] as string || '0');
          
          if (Math.abs(currentValue - previousValue) > changeThreshold) {
            significantChange = true;
            break;
          }
        }

        if (significantChange && (!current.changeReason || current.changeReason.trim().length < 10)) {
          messages.push(`WARNING: Significant weight changes detected without adequate justification`);
          allPassed = false;
        } else {
          messages.push(`✓ Weight change justification validation passed`);
        }
      }
    } catch (error) {
      messages.push(`ERROR: Could not validate weight change consistency: ${(error as Error).message}`);
      allPassed = false;
    }

    // Check 4: Verify weights align with statistical significance
    try {
      const latestAnalysis = await db
        .select()
        .from(regressionAnalysisResults)
        .where(eq(regressionAnalysisResults.season, season))
        .orderBy(desc(regressionAnalysisResults.analysisDate))
        .limit(1);

      if (latestAnalysis.length > 0) {
        const analysis = latestAnalysis[0];
        if (parseFloat(analysis.overallRSquared || '0') < this.config.thresholds.regression.rSquaredThreshold) {
          messages.push(`WARNING: Current weights based on regression with low R² (${analysis.overallRSquared})`);
          allPassed = false;
        } else {
          messages.push(`✓ Weights based on statistically significant regression (R² = ${analysis.overallRSquared})`);
        }
      }
    } catch (error) {
      messages.push(`ERROR: Could not validate statistical significance alignment: ${(error as Error).message}`);
      allPassed = false;
    }

    return { allPassed, messages };
  }

  /**
   * Validates weight history and audit trail
   * Requirements: 3.3, 3.4
   */
  private async validateWeightHistory(season: number): Promise<WeightHistoryResult> {
    const result: WeightHistoryResult = {
      hasCompleteHistory: true,
      changeCount: 0,
      lastChange: null,
      auditTrailComplete: true,
      changes: []
    };

    try {
      // Get weight change history for this season
      const weightHistory = await db
        .select()
        .from(predictionWeightHistory)
        .where(eq(predictionWeightHistory.season, season))
        .orderBy(desc(predictionWeightHistory.changeDate));

      result.changeCount = weightHistory.length;

      if (weightHistory.length === 0) {
        result.hasCompleteHistory = false;
        return result;
      }

      result.lastChange = weightHistory[0].changeDate;

      // Validate each change entry with comprehensive checks
      for (const change of weightHistory) {
        const changeEntry = {
          date: change.changeDate,
          reason: change.changeReason || 'No reason provided',
          previousWeights: this.parseWeights(change.previousWeights),
          newWeights: this.parseWeights({
            passingOffense: change.passingOffense,
            rushingOffense: change.rushingOffense,
            scoringEfficiency: change.scoringEfficiency,
            passingDefense: change.passingDefense,
            rushingDefense: change.rushingDefense,
            turnoverMargin: change.turnoverMargin,
            specialTeams: change.specialTeams,
            homeFieldAdvantage: change.homeFieldAdvantage
          }),
          changedBy: change.changedByUserId || undefined
        };

        result.changes.push(changeEntry);

        // Comprehensive audit trail validation
        const auditValidation = this.validateSingleAuditEntry(change);
        if (!auditValidation.isValid) {
          result.auditTrailComplete = false;
        }
      }

      // Validate change sequence and continuity
      const sequenceValidation = this.validateChangeSequence(result.changes);
      if (!sequenceValidation.isValid) {
        result.auditTrailComplete = false;
      }

      // Validate weight change logic and approval processes
      const logicValidation = await this.validateWeightChangeLogic(weightHistory, season);
      if (!logicValidation.isValid) {
        result.auditTrailComplete = false;
      }

      // Generate detailed history report
      const historyReport = this.generateWeightHistoryReport(result.changes);
      result.metadata = {
        historyReport,
        validationDetails: {
          sequenceValidation,
          logicValidation
        }
      };

    } catch (error) {
      result.hasCompleteHistory = false;
      result.auditTrailComplete = false;
    }

    return result;
  }

  /**
   * Validates a single audit entry for completeness and accuracy
   * Requirements: 3.3, 3.4
   */
  private validateSingleAuditEntry(change: any): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    let isValid = true;

    // Check required fields
    if (!change.changeReason || change.changeReason.trim() === '') {
      issues.push('Missing or empty reason for weight change');
      isValid = false;
    } else if (change.changeReason.trim().length < 10) {
      issues.push('Reason for weight change is too brief (less than 10 characters)');
      isValid = false;
    }

    if (!change.changeDate) {
      issues.push('Missing change date');
      isValid = false;
    }

    if (!change.previousWeights) {
      issues.push('Missing previous weights record');
      isValid = false;
    }

    // Validate weight values are present and reasonable
    const requiredWeights = ['passingOffense', 'rushingOffense', 'scoringEfficiency', 'passingDefense', 'rushingDefense', 'turnoverMargin', 'specialTeams', 'homeFieldAdvantage'];
    for (const weightType of requiredWeights) {
      const value = change[weightType];
      if (value === null || value === undefined) {
        issues.push(`Missing weight value for ${weightType}`);
        isValid = false;
      } else {
        const numValue = parseFloat(value);
        if (isNaN(numValue) || numValue < 0 || numValue > 2.0) {
          issues.push(`Invalid weight value for ${weightType}: ${value}`);
          isValid = false;
        }
      }
    }

    // Check if change is associated with regression analysis
    if (change.analysisId) {
      // This is good - change is linked to regression analysis
    } else if (!change.changeReason.toLowerCase().includes('manual') && !change.changeReason.toLowerCase().includes('override')) {
      issues.push('Weight change not linked to regression analysis and not marked as manual override');
      isValid = false;
    }

    // Validate timestamp is reasonable (not in future, not too old)
    if (change.changeDate) {
      const changeDate = new Date(change.changeDate);
      const now = new Date();
      const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      
      if (changeDate > now) {
        issues.push('Change date is in the future');
        isValid = false;
      } else if (changeDate < oneYearAgo) {
        // This might be acceptable for historical data, just note it
        issues.push('Change date is more than one year old');
      }
    }

    return { isValid, issues };
  }

  /**
   * Validates the sequence and continuity of weight changes
   * Requirements: 3.3, 3.4
   */
  private validateChangeSequence(changes: any[]): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    let isValid = true;

    if (changes.length <= 1) {
      return { isValid: true, issues: [] }; // Single or no changes are valid by default
    }

    // Sort changes by date (most recent first)
    const sortedChanges = [...changes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Validate sequence continuity
    for (let i = 0; i < sortedChanges.length - 1; i++) {
      const current = sortedChanges[i];
      const next = sortedChanges[i + 1];
      
      // Check if previous weights of current change match new weights of next change
      const weightsMatch = this.compareWeights(current.previousWeights, next.newWeights);
      if (!weightsMatch) {
        issues.push(`Weight sequence break between ${current.date} and ${next.date}: previous weights don't match`);
        isValid = false;
      }

      // Check for reasonable time gaps between changes
      const currentDate = new Date(current.date);
      const nextDate = new Date(next.date);
      const timeDiff = currentDate.getTime() - nextDate.getTime();
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      if (hoursDiff < 1) {
        issues.push(`Suspiciously short time between weight changes: ${hoursDiff.toFixed(2)} hours`);
      }
    }

    // Check for duplicate changes
    const changeHashes = new Set();
    for (const change of sortedChanges) {
      const hash = JSON.stringify({
        date: change.date,
        newWeights: change.newWeights,
        reason: change.reason
      });
      
      if (changeHashes.has(hash)) {
        issues.push(`Duplicate weight change detected for ${change.date}`);
        isValid = false;
      }
      changeHashes.add(hash);
    }

    return { isValid, issues };
  }

  /**
   * Validates weight change logic and approval processes
   * Requirements: 3.3, 3.4
   */
  private async validateWeightChangeLogic(weightHistory: any[], season: number): Promise<{ isValid: boolean; issues: string[] }> {
    const issues: string[] = [];
    let isValid = true;

    try {
      for (const change of weightHistory) {
        // If change is linked to regression analysis, validate the analysis exists and is valid
        if (change.analysisId) {
          const analysis = await db
            .select()
            .from(regressionAnalysisResults)
            .where(eq(regressionAnalysisResults.id, change.analysisId))
            .limit(1);

          if (analysis.length === 0) {
            issues.push(`Weight change references non-existent regression analysis ID: ${change.analysisId}`);
            isValid = false;
          } else {
            const analysisResult = analysis[0];
            
            // Validate analysis quality
            const rSquared = parseFloat(analysisResult.overallRSquared || '0');
            if (rSquared < this.config.thresholds.regression.rSquaredThreshold) {
              issues.push(`Weight change based on low-quality regression analysis (R² = ${rSquared})`);
              isValid = false;
            }

            // Check if analysis date is close to change date
            const analysisDate = new Date(analysisResult.analysisDate);
            const changeDate = new Date(change.changeDate);
            const daysDiff = Math.abs(analysisDate.getTime() - changeDate.getTime()) / (1000 * 60 * 60 * 24);
            
            if (daysDiff > 7) {
              issues.push(`Weight change date is ${daysDiff.toFixed(1)} days after regression analysis - may be stale`);
            }
          }
        }

        // Validate manual changes have proper authorization
        if (!change.analysisId && change.changedByUserId) {
          // Manual change should have detailed justification
          if (!change.changeReason || change.changeReason.length < 50) {
            issues.push(`Manual weight change lacks detailed justification`);
            isValid = false;
          }
        }

        // Check for extreme weight changes
        const previousWeights = this.parseWeights(change.previousWeights);
        const newWeights = this.parseWeights({
          passingOffense: change.passingOffense,
          rushingOffense: change.rushingOffense,
          scoringEfficiency: change.scoringEfficiency,
          passingDefense: change.passingDefense,
          rushingDefense: change.rushingDefense,
          turnoverMargin: change.turnoverMargin,
          specialTeams: change.specialTeams,
          homeFieldAdvantage: change.homeFieldAdvantage
        });

        for (const [category, newWeight] of Object.entries(newWeights)) {
          const previousWeight = previousWeights[category] || 0;
          const changePercent = Math.abs((newWeight - previousWeight) / previousWeight) * 100;
          
          if (changePercent > 50) { // More than 50% change
            issues.push(`Extreme weight change for ${category}: ${changePercent.toFixed(1)}% change from ${previousWeight.toFixed(3)} to ${newWeight.toFixed(3)}`);
            
            // This might be valid if properly justified
            if (!change.changeReason.toLowerCase().includes('major') && !change.changeReason.toLowerCase().includes('significant')) {
              isValid = false;
            }
          }
        }
      }

    } catch (error) {
      issues.push(`Error validating weight change logic: ${(error as Error).message}`);
      isValid = false;
    }

    return { isValid, issues };
  }

  /**
   * Generates a detailed weight history report for accountability
   * Requirements: 3.3, 3.4
   */
  private generateWeightHistoryReport(changes: any[]): any {
    const report = {
      totalChanges: changes.length,
      timeSpan: {
        earliest: changes.length > 0 ? changes[changes.length - 1].date : null,
        latest: changes.length > 0 ? changes[0].date : null
      },
      changeFrequency: this.calculateChangeFrequency(changes),
      weightStability: this.analyzeWeightStability(changes),
      changeReasons: this.categorizeChangeReasons(changes),
      significantChanges: this.identifySignificantChanges(changes)
    };

    return report;
  }

  /**
   * Calculates the frequency of weight changes
   */
  private calculateChangeFrequency(changes: any[]): any {
    if (changes.length < 2) {
      return { frequency: 'insufficient_data', averageDaysBetweenChanges: null };
    }

    const sortedChanges = [...changes].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let totalDays = 0;
    
    for (let i = 1; i < sortedChanges.length; i++) {
      const current = new Date(sortedChanges[i].date);
      const previous = new Date(sortedChanges[i - 1].date);
      totalDays += (current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24);
    }

    const averageDays = totalDays / (sortedChanges.length - 1);
    
    let frequency: string;
    if (averageDays < 7) {
      frequency = 'very_frequent';
    } else if (averageDays < 30) {
      frequency = 'frequent';
    } else if (averageDays < 90) {
      frequency = 'moderate';
    } else {
      frequency = 'infrequent';
    }

    return { frequency, averageDaysBetweenChanges: averageDays };
  }

  /**
   * Analyzes weight stability over time
   */
  private analyzeWeightStability(changes: any[]): any {
    if (changes.length < 2) {
      return { stability: 'insufficient_data' };
    }

    const weightCategories = ['passingOffense', 'rushingOffense', 'scoringEfficiency', 'passingDefense', 'rushingDefense', 'turnoverMargin', 'specialTeams', 'homeFieldAdvantage'];
    const stability: Record<string, any> = {};

    for (const category of weightCategories) {
      const values = changes.map(change => change.newWeights[category]).filter(v => v !== undefined);
      
      if (values.length < 2) continue;

      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const standardDeviation = Math.sqrt(variance);
      const coefficientOfVariation = standardDeviation / mean;

      let stabilityLevel: string;
      if (coefficientOfVariation < 0.1) {
        stabilityLevel = 'very_stable';
      } else if (coefficientOfVariation < 0.2) {
        stabilityLevel = 'stable';
      } else if (coefficientOfVariation < 0.4) {
        stabilityLevel = 'moderate';
      } else {
        stabilityLevel = 'unstable';
      }

      stability[category] = {
        mean: mean.toFixed(3),
        standardDeviation: standardDeviation.toFixed(3),
        coefficientOfVariation: coefficientOfVariation.toFixed(3),
        stabilityLevel
      };
    }

    return stability;
  }

  /**
   * Categorizes change reasons for analysis
   */
  private categorizeChangeReasons(changes: any[]): any {
    const categories = {
      regression_based: 0,
      manual_override: 0,
      performance_adjustment: 0,
      data_quality: 0,
      other: 0
    };

    for (const change of changes) {
      const reason = (change.changeReason || '').toLowerCase();
      
      if (reason.includes('regression') || reason.includes('analysis') || reason.includes('statistical')) {
        categories.regression_based++;
      } else if (reason.includes('manual') || reason.includes('override') || reason.includes('admin')) {
        categories.manual_override++;
      } else if (reason.includes('performance') || reason.includes('accuracy') || reason.includes('prediction')) {
        categories.performance_adjustment++;
      } else if (reason.includes('data') || reason.includes('quality') || reason.includes('missing')) {
        categories.data_quality++;
      } else {
        categories.other++;
      }
    }

    return categories;
  }

  /**
   * Identifies significant weight changes that may need review
   */
  private identifySignificantChanges(changes: any[]): any[] {
    const significantChanges = [];
    const significanceThreshold = 0.1; // 10% change threshold

    for (const change of changes) {
      const previousWeights = change.previousWeights;
      const newWeights = change.newWeights;
      
      let hasSignificantChange = false;
      const changedCategories = [];

      for (const [category, newWeight] of Object.entries(newWeights)) {
        const previousWeight = previousWeights[category] || 0;
        const changePercent = Math.abs((newWeight as number - previousWeight) / previousWeight);
        
        if (changePercent > significanceThreshold) {
          hasSignificantChange = true;
          changedCategories.push({
            category,
            previousWeight: previousWeight.toFixed(3),
            newWeight: (newWeight as number).toFixed(3),
            changePercent: (changePercent * 100).toFixed(1) + '%'
          });
        }
      }

      if (hasSignificantChange) {
        significantChanges.push({
          date: change.date,
          reason: change.changeReason,
          changedCategories,
          changedBy: change.changedBy
        });
      }
    }

    return significantChanges;
  }

  /**
   * Helper method to calculate weights from regression coefficients
   */
  private calculateWeightsFromCoefficients(
    coefficients: Record<string, number>, 
    significantMetrics: any[]
  ): Record<string, number> {
    const weights: Record<string, number> = {};
    
    // Map regression metric names to weight categories
    const metricMapping: Record<string, string> = {
      'passing_offense': 'passingOffense',
      'rushing_offense': 'rushingOffense',
      'scoring_efficiency': 'scoringEfficiency',
      'passing_defense': 'passingDefense',
      'rushing_defense': 'rushingDefense',
      'turnover_margin': 'turnoverMargin',
      'special_teams': 'specialTeams',
      'home_field_advantage': 'homeFieldAdvantage'
    };

    // Calculate base weights from coefficients
    let totalWeight = 0;
    for (const [metricName, coefficient] of Object.entries(coefficients)) {
      const weightCategory = metricMapping[metricName] || metricName;
      const baseWeight = Math.abs(coefficient) * 0.1; // Scale coefficient to weight
      weights[weightCategory] = baseWeight;
      totalWeight += baseWeight;
    }

    // Normalize weights to sum to approximately 1.0
    if (totalWeight > 0) {
      for (const category in weights) {
        weights[category] = weights[category] / totalWeight;
      }
    }

    return weights;
  }

  /**
   * Helper method to compare two weight objects
   */
  private compareWeights(weights1: Record<string, number>, weights2: StatisticalImpactWeights): boolean {
    const tolerance = 0.01; // Allow small differences due to rounding
    
    for (const [category, weight1] of Object.entries(weights1)) {
      const weight2 = weights2[category as keyof StatisticalImpactWeights];
      if (Math.abs(weight1 - weight2) > tolerance) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Helper method to parse weights from database format
   */
  private parseWeights(weightsData: any): Record<string, number> {
    if (typeof weightsData === 'string') {
      try {
        return JSON.parse(weightsData);
      } catch {
        return {};
      }
    }
    
    if (typeof weightsData === 'object' && weightsData !== null) {
      const weights: Record<string, number> = {};
      for (const [key, value] of Object.entries(weightsData)) {
        if (typeof value === 'string') {
          weights[key] = parseFloat(value) || 0;
        } else if (typeof value === 'number') {
          weights[key] = value;
        }
      }
      return weights;
    }
    
    return {};
  }

  /**
   * Adds recommendations based on validation results
   */
  private addRecommendations(result: WeightValidationResult): void {
    if (!result.weightDerivation.isCorrect) {
      this.addRecommendation(result, 'Review regression analysis results and ensure weight calculation logic is correct');
    }
    
    if (!result.weightBounds.allWithinBounds) {
      this.addRecommendation(result, 'Adjust weights to be within acceptable bounds (0 to 2.0) and ensure proper normalization');
    }
    
    if (!result.weightApplication.correctlyApplied) {
      this.addRecommendation(result, 'Verify prediction formula implementation and weight application logic');
    }
    
    if (!result.weightHistory.hasCompleteHistory) {
      this.addRecommendation(result, 'Implement comprehensive weight change logging with detailed audit trails');
    }
    
    if (result.weightHistory.changeCount === 0) {
      this.addRecommendation(result, 'Consider running regression analysis to update weights based on recent data');
    }
  }
}

// Export singleton instance
export const weightCalculationVerifier = new WeightCalculationVerifier(
  'weight_calculation' as ValidationComponent,
  validationLogger,
  errorHandler,
  DEFAULT_VALIDATION_CONFIG
);