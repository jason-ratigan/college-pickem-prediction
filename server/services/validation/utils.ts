// server/services/validation/utils.ts

import { ValidationResult, ValidationError, ValidationWarning } from './types.js';

/**
 * Utility functions for validation operations
 * Requirements: 1.4, 7.2
 */

export class ValidationUtils {
  
  /**
   * Validates that a value is a finite number within bounds
   */
  static validateNumber(
    value: any, 
    fieldName: string, 
    min?: number, 
    max?: number
  ): { isValid: boolean; error?: string } {
    if (typeof value !== 'number') {
      return { isValid: false, error: `${fieldName} must be a number, got ${typeof value}` };
    }
    
    if (!isFinite(value)) {
      return { isValid: false, error: `${fieldName} must be a finite number` };
    }
    
    if (min !== undefined && value < min) {
      return { isValid: false, error: `${fieldName} (${value}) must be >= ${min}` };
    }
    
    if (max !== undefined && value > max) {
      return { isValid: false, error: `${fieldName} (${value}) must be <= ${max}` };
    }
    
    return { isValid: true };
  }

  /**
   * Validates that a percentage is between 0 and 100
   */
  static validatePercentage(value: any, fieldName: string): { isValid: boolean; error?: string } {
    return this.validateNumber(value, fieldName, 0, 100);
  }

  /**
   * Validates that a probability is between 0 and 1
   */
  static validateProbability(value: any, fieldName: string): { isValid: boolean; error?: string } {
    return this.validateNumber(value, fieldName, 0, 1);
  }

  /**
   * Validates that an R-squared value is reasonable (0 to 1)
   */
  static validateRSquared(value: any, fieldName: string = 'R-squared'): { isValid: boolean; error?: string } {
    const result = this.validateNumber(value, fieldName, 0, 1);
    if (!result.isValid) return result;
    
    // Additional validation for R-squared
    if (value > 0.99) {
      return { isValid: false, error: `${fieldName} (${value}) is suspiciously high (>0.99), possible overfitting` };
    }
    
    return { isValid: true };
  }

  /**
   * Validates that a p-value is reasonable (0 to 1)
   */
  static validatePValue(value: any, fieldName: string = 'p-value'): { isValid: boolean; error?: string } {
    return this.validateNumber(value, fieldName, 0, 1);
  }

  /**
   * Validates statistical significance based on p-value threshold
   */
  static validateStatisticalSignificance(
    pValue: number, 
    threshold: number = 0.1
  ): { isSignificant: boolean; message: string } {
    if (pValue <= threshold) {
      return { 
        isSignificant: true, 
        message: `Statistically significant (p=${pValue.toFixed(4)} <= ${threshold})` 
      };
    } else {
      return { 
        isSignificant: false, 
        message: `Not statistically significant (p=${pValue.toFixed(4)} > ${threshold})` 
      };
    }
  }

  /**
   * Validates that efficiency values are within reasonable bounds
   */
  static validateEfficiencyValue(
    value: number, 
    fieldName: string,
    expectedMin: number = -50,
    expectedMax: number = 50
  ): { isValid: boolean; error?: string; warning?: string } {
    const numberValidation = this.validateNumber(value, fieldName);
    if (!numberValidation.isValid) {
      return { isValid: false, error: numberValidation.error };
    }

    // Check if within expected bounds
    if (value < expectedMin || value > expectedMax) {
      return { 
        isValid: false, 
        error: `${fieldName} (${value}) is outside expected range [${expectedMin}, ${expectedMax}]` 
      };
    }

    // Check for extreme values that might indicate calculation errors
    const extremeThreshold = Math.max(Math.abs(expectedMin), Math.abs(expectedMax)) * 0.8;
    if (Math.abs(value) > extremeThreshold) {
      return {
        isValid: true,
        warning: `${fieldName} (${value}) is at extreme end of range, verify calculation`
      };
    }

    return { isValid: true };
  }

  /**
   * Validates that weights sum to expected total within tolerance
   */
  static validateWeightSum(
    weights: Record<string, number>,
    expectedSum: number = 1.0,
    tolerance: number = 0.1
  ): { isValid: boolean; actualSum: number; error?: string } {
    const actualSum = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    const difference = Math.abs(actualSum - expectedSum);
    
    if (difference > tolerance) {
      return {
        isValid: false,
        actualSum,
        error: `Weight sum (${actualSum.toFixed(4)}) differs from expected (${expectedSum}) by ${difference.toFixed(4)} (tolerance: ${tolerance})`
      };
    }

    return { isValid: true, actualSum };
  }

  /**
   * Validates that all weights are within reasonable bounds
   */
  static validateWeightBounds(
    weights: Record<string, number>,
    minWeight: number = 0.0,
    maxWeight: number = 2.0
  ): { isValid: boolean; violations: Array<{ category: string; weight: number; issue: string }> } {
    const violations: Array<{ category: string; weight: number; issue: string }> = [];

    for (const [category, weight] of Object.entries(weights)) {
      const validation = this.validateNumber(weight, `weight for ${category}`, minWeight, maxWeight);
      if (!validation.isValid) {
        violations.push({
          category,
          weight,
          issue: validation.error || 'Invalid weight'
        });
      }
    }

    return {
      isValid: violations.length === 0,
      violations
    };
  }

  /**
   * Calculates basic statistical measures for an array of numbers
   */
  static calculateBasicStats(values: number[]): {
    count: number;
    mean: number;
    median: number;
    standardDeviation: number;
    min: number;
    max: number;
    range: number;
  } {
    if (values.length === 0) {
      return {
        count: 0,
        mean: 0,
        median: 0,
        standardDeviation: 0,
        min: 0,
        max: 0,
        range: 0
      };
    }

    const count = values.length;
    const mean = values.reduce((sum, val) => sum + val, 0) / count;
    
    const sortedValues = [...values].sort((a, b) => a - b);
    const median = count % 2 === 0 
      ? (sortedValues[count / 2 - 1] + sortedValues[count / 2]) / 2
      : sortedValues[Math.floor(count / 2)];
    
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / count;
    const standardDeviation = Math.sqrt(variance);
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    return {
      count,
      mean,
      median,
      standardDeviation,
      min,
      max,
      range
    };
  }

  /**
   * Validates that a sample size is adequate for statistical analysis
   */
  static validateSampleSize(
    sampleSize: number,
    minimumRequired: number = 30,
    predictorCount?: number
  ): { isAdequate: boolean; message: string; recommendedMinimum?: number } {
    if (sampleSize < minimumRequired) {
      return {
        isAdequate: false,
        message: `Sample size (${sampleSize}) is below minimum required (${minimumRequired})`,
        recommendedMinimum: minimumRequired
      };
    }

    // Rule of thumb: at least 10-15 observations per predictor
    if (predictorCount && predictorCount > 0) {
      const recommendedForPredictors = predictorCount * 15;
      if (sampleSize < recommendedForPredictors) {
        return {
          isAdequate: false,
          message: `Sample size (${sampleSize}) may be inadequate for ${predictorCount} predictors (recommended: ${recommendedForPredictors})`,
          recommendedMinimum: recommendedForPredictors
        };
      }
    }

    return {
      isAdequate: true,
      message: `Sample size (${sampleSize}) is adequate`
    };
  }

  /**
   * Validates convergence of iterative calculations
   */
  static validateConvergence(
    values: number[],
    tolerance: number = 0.001,
    minIterations: number = 3
  ): { 
    hasConverged: boolean; 
    iterationsToConvergence?: number; 
    finalValue?: number;
    convergenceRate?: number;
    message: string;
  } {
    if (values.length < minIterations) {
      return {
        hasConverged: false,
        message: `Insufficient iterations (${values.length}) for convergence check (minimum: ${minIterations})`
      };
    }

    // Check if the last few values are within tolerance
    const lastValue = values[values.length - 1];
    let convergedAt = -1;

    for (let i = minIterations - 1; i < values.length; i++) {
      const recentValues = values.slice(Math.max(0, i - minIterations + 1), i + 1);
      const maxDiff = Math.max(...recentValues) - Math.min(...recentValues);
      
      if (maxDiff <= tolerance) {
        convergedAt = i + 1;
        break;
      }
    }

    if (convergedAt === -1) {
      return {
        hasConverged: false,
        message: `No convergence achieved within tolerance (${tolerance}) after ${values.length} iterations`
      };
    }

    // Calculate convergence rate (how quickly it converged)
    const convergenceRate = convergedAt / values.length;

    return {
      hasConverged: true,
      iterationsToConvergence: convergedAt,
      finalValue: lastValue,
      convergenceRate,
      message: `Converged after ${convergedAt} iterations (rate: ${(convergenceRate * 100).toFixed(1)}%)`
    };
  }

  /**
   * Validates that prediction values are reasonable
   */
  static validatePredictionValues(
    homeScore: number,
    awayScore: number,
    confidence: number
  ): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate scores
    const homeValidation = this.validateNumber(homeScore, 'Home team score', 0, 200);
    if (!homeValidation.isValid) {
      errors.push(homeValidation.error!);
    }

    const awayValidation = this.validateNumber(awayScore, 'Away team score', 0, 200);
    if (!awayValidation.isValid) {
      errors.push(awayValidation.error!);
    }

    // Validate confidence
    const confidenceValidation = this.validateProbability(confidence, 'Confidence');
    if (!confidenceValidation.isValid) {
      errors.push(confidenceValidation.error!);
    }

    // Check for unrealistic scores
    if (homeScore > 100) {
      warnings.push(`Home team score (${homeScore}) is unusually high`);
    }
    if (awayScore > 100) {
      warnings.push(`Away team score (${awayScore}) is unusually high`);
    }

    // Check for unrealistic point differential
    const pointDiff = Math.abs(homeScore - awayScore);
    if (pointDiff > 70) {
      warnings.push(`Point differential (${pointDiff}) is unusually large`);
    }

    // Check for very low scores
    if (homeScore < 3) {
      warnings.push(`Home team score (${homeScore}) is unusually low`);
    }
    if (awayScore < 3) {
      warnings.push(`Away team score (${awayScore}) is unusually low`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Merges multiple validation results into a summary
   */
  static mergeValidationResults(results: ValidationResult[]): ValidationResult {
    if (results.length === 0) {
      return {
        isValid: true,
        score: 100,
        errors: [],
        warnings: [],
        recommendations: [],
        timestamp: new Date()
      };
    }

    const allErrors = results.flatMap(r => r.errors);
    const allWarnings = results.flatMap(r => r.warnings);
    const allRecommendations = results.flatMap(r => r.recommendations);
    
    // Calculate overall score as weighted average
    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    const averageScore = totalScore / results.length;
    
    // Reduce score based on error count
    const errorPenalty = Math.min(allErrors.length * 5, 50);
    const warningPenalty = Math.min(allWarnings.length * 2, 20);
    const finalScore = Math.max(0, averageScore - errorPenalty - warningPenalty);

    return {
      isValid: allErrors.length === 0,
      score: Math.round(finalScore),
      errors: allErrors,
      warnings: allWarnings,
      recommendations: [...new Set(allRecommendations)], // Remove duplicates
      timestamp: new Date(),
      metadata: {
        mergedFrom: results.length,
        componentResults: results.map(r => ({
          score: r.score,
          isValid: r.isValid,
          errorCount: r.errors.length,
          warningCount: r.warnings.length
        }))
      }
    };
  }

  /**
   * Formats a validation result for human-readable output
   */
  static formatValidationResult(result: ValidationResult): string {
    const lines: string[] = [];
    
    lines.push(`Validation Result: ${result.isValid ? 'VALID' : 'INVALID'}`);
    lines.push(`Score: ${result.score}/100`);
    lines.push(`Timestamp: ${result.timestamp.toISOString()}`);
    
    if (result.errors.length > 0) {
      lines.push(`\nErrors (${result.errors.length}):`);
      result.errors.forEach((error, index) => {
        lines.push(`  ${index + 1}. [${error.severity.toUpperCase()}] ${error.code}: ${error.message}`);
      });
    }
    
    if (result.warnings.length > 0) {
      lines.push(`\nWarnings (${result.warnings.length}):`);
      result.warnings.forEach((warning, index) => {
        lines.push(`  ${index + 1}. ${warning.code}: ${warning.message}`);
      });
    }
    
    if (result.recommendations.length > 0) {
      lines.push(`\nRecommendations (${result.recommendations.length}):`);
      result.recommendations.forEach((rec, index) => {
        lines.push(`  ${index + 1}. ${rec}`);
      });
    }
    
    return lines.join('\n');
  }

  /**
   * Creates a simple validation result for quick checks
   */
  static createSimpleResult(
    isValid: boolean, 
    score: number, 
    message?: string
  ): ValidationResult {
    const result: ValidationResult = {
      isValid,
      score: Math.max(0, Math.min(100, score)),
      errors: [],
      warnings: [],
      recommendations: [],
      timestamp: new Date()
    };

    if (message && !isValid) {
      result.errors.push({
        code: 'VALIDATION_FAILED',
        message,
        severity: 'medium',
        component: 'utils'
      });
    } else if (message) {
      result.recommendations.push(message);
    }

    return result;
  }
}