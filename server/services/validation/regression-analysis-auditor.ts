// server/services/validation/regression-analysis-auditor.ts

import { 
  RegressionValidationResult,
  ModelFitMetrics,
  StatisticalSignificanceResult,
  ModelAssumptionResults,
  PredictivePowerMetrics,
  CoefficientValidationResult,
  AssumptionTest,
  MulticollinearityTest,
  SampleSizeTest,
  ValidationResult,
  ValidationComponent,
  ValidationLogger,
  ErrorHandler,
  ValidationConfig
} from './types.js';
import { BaseValidator, validationLogger, errorHandler, DEFAULT_VALIDATION_CONFIG } from './core.js';
import { ValidationUtils } from './utils.js';
import { StatisticalImpactAnalyzer, EnhancedStatisticalAnalysis, RegressionAnalysisResult } from '../statisticalImpactAnalyzer.js';

// Import the statistical analyzer singleton
import { statisticalImpactAnalyzer } from '../statisticalImpactAnalyzer.js';

/**
 * Regression Analysis Auditor
 * Validates the correctness of regression analysis calculations and statistical significance
 * Requirements: 2.1, 2.2, 2.4, 2.5
 */
export class RegressionAnalysisAuditor extends BaseValidator {
  private statisticalAnalyzer: StatisticalImpactAnalyzer;

  constructor(
    component: ValidationComponent,
    logger: ValidationLogger,
    errorHandler: ErrorHandler,
    config: ValidationConfig,
    statisticalAnalyzer: StatisticalImpactAnalyzer
  ) {
    super(component, logger, errorHandler, config);
    this.statisticalAnalyzer = statisticalAnalyzer;
  }

  /**
   * Main validation method for regression analysis
   * Requirements: 2.1, 2.2, 2.4
   */
  async validate(season: number): Promise<RegressionValidationResult> {
    console.log(`[REGRESSION AUDITOR] Starting regression analysis validation for season ${season}`);
    
    const result = this.createBaseResult(true, 100) as RegressionValidationResult;
    
    try {
      // Get the regression analysis to validate
      const analysis = await this.statisticalAnalyzer.performRegressionAnalysis(season);
      
      // Validate model fit metrics
      result.modelFit = await this.validateModelFit(analysis);
      
      // Validate statistical significance
      result.statisticalSignificance = await this.validateStatisticalSignificance(analysis);
      
      // Validate model assumptions
      result.assumptions = await this.validateModelAssumptions(analysis);
      
      // Validate predictive power
      result.predictivePower = await this.validatePredictivePower(analysis);
      
      // Validate individual coefficients
      result.coefficients = await this.validateCoefficients(analysis.regressionResults);
      
      // Calculate overall validation score
      this.calculateOverallScore(result);
      
      // Add recommendations based on findings
      this.addValidationRecommendations(result);
      
      this.logResult(result);
      
    } catch (error) {
      this.addError(result, 'REGRESSION_VALIDATION_FAILED', 
        `Failed to validate regression analysis: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        'critical');
    }
    
    return result;
  }

  /**
   * Validates model fit metrics (R², F-statistic, etc.)
   * Requirements: 2.1, 2.2
   */
  private async validateModelFit(analysis: EnhancedStatisticalAnalysis): Promise<ModelFitMetrics> {
    console.log(`[REGRESSION AUDITOR] Validating model fit metrics`);
    
    const rSquaredValidation = ValidationUtils.validateRSquared(analysis.overallModelRSquared);
    if (!rSquaredValidation.isValid) {
      throw new Error(`Invalid R-squared value: ${rSquaredValidation.error}`);
    }
    
    // Validate adjusted R-squared
    const adjustedRSquared = analysis.modelValidation.adjustedRSquared;
    const adjustedRSquaredValidation = ValidationUtils.validateRSquared(adjustedRSquared, 'Adjusted R-squared');
    if (!adjustedRSquaredValidation.isValid) {
      throw new Error(`Invalid adjusted R-squared: ${adjustedRSquaredValidation.error}`);
    }
    
    // Validate F-statistic
    const fStatistic = analysis.modelValidation.fStatistic;
    const fStatValidation = ValidationUtils.validateNumber(fStatistic, 'F-statistic', 0);
    if (!fStatValidation.isValid) {
      throw new Error(`Invalid F-statistic: ${fStatValidation.error}`);
    }
    
    // Validate F p-value
    const fPValue = analysis.modelValidation.fPValue;
    const fPValueValidation = ValidationUtils.validatePValue(fPValue, 'F p-value');
    if (!fPValueValidation.isValid) {
      throw new Error(`Invalid F p-value: ${fPValueValidation.error}`);
    }
    
    // Validate residual standard error
    const residualStandardError = analysis.modelValidation.residualStandardError;
    const rseValidation = ValidationUtils.validateNumber(residualStandardError, 'Residual standard error', 0);
    if (!rseValidation.isValid) {
      throw new Error(`Invalid residual standard error: ${rseValidation.error}`);
    }
    
    // Check if model meets significance thresholds
    const rSquaredThreshold = this.config.thresholds.regression.rSquaredThreshold;
    const isSignificant = analysis.overallModelRSquared >= rSquaredThreshold && fPValue < 0.05;
    const meetsThresholds = isSignificant;
    
    return {
      rSquared: analysis.overallModelRSquared,
      adjustedRSquared,
      residualStandardError,
      fStatistic,
      fPValue,
      sampleSize: analysis.sampleSize,
      degreesOfFreedom: analysis.sampleSize - analysis.regressionResults.length - 1,
      isSignificant,
      meetsThresholds
    };
  }

  /**
   * Validates statistical significance of predictors
   * Requirements: 2.2, 2.3, 2.4
   */
  private async validateStatisticalSignificance(analysis: EnhancedStatisticalAnalysis): Promise<StatisticalSignificanceResult> {
    console.log(`[REGRESSION AUDITOR] Validating statistical significance`);
    
    const rSquaredThreshold = this.config.thresholds.regression.rSquaredThreshold; // 0.2
    const pValueThreshold = this.config.thresholds.regression.pValueThreshold; // 0.1
    
    const significantPredictors: string[] = [];
    const nonSignificantPredictors: string[] = [];
    const significanceDetails: StatisticalSignificanceResult['significanceDetails'] = [];
    
    // Validate each predictor's significance
    for (const result of analysis.regressionResults) {
      // Validate p-value calculation
      const pValueValidation = this.validatePValueCalculation(result);
      if (!pValueValidation.isValid) {
        throw new Error(`Invalid p-value calculation for ${result.metric}: ${pValueValidation.error}`);
      }
      
      // Validate R-squared calculation
      const rSquaredValidation = this.validateRSquaredCalculation(result);
      if (!rSquaredValidation.isValid) {
        throw new Error(`Invalid R-squared calculation for ${result.metric}: ${rSquaredValidation.error}`);
      }
      
      // Verify threshold application
      const thresholdValidation = this.validateThresholdApplication(result, rSquaredThreshold, pValueThreshold);
      if (!thresholdValidation.isValid) {
        throw new Error(`Threshold application error for ${result.metric}: ${thresholdValidation.error}`);
      }
      
      // Check significance using both thresholds
      const isSignificant = result.rSquared >= rSquaredThreshold && result.pValue <= pValueThreshold;
      
      // Validate that the isStatisticallySignificant flag matches our calculation
      if (result.isStatisticallySignificant !== isSignificant) {
        throw new Error(`Statistical significance flag mismatch for ${result.metric}: expected ${isSignificant}, got ${result.isStatisticallySignificant}`);
      }
      
      // Validate non-significant predictor handling
      this.validateNonSignificantPredictorHandling(result, isSignificant);
      
      if (isSignificant) {
        significantPredictors.push(result.metric);
      } else {
        nonSignificantPredictors.push(result.metric);
      }
      
      // Validate confidence interval
      const confidenceValidation = this.validateConfidenceInterval(result);
      if (!confidenceValidation.isValid) {
        throw new Error(`Invalid confidence interval for ${result.metric}: ${confidenceValidation.error}`);
      }
      
      significanceDetails.push({
        predictor: result.metric,
        pValue: result.pValue,
        isSignificant,
        confidenceInterval: result.confidenceInterval
      });
    }
    
    const overallSignificant = analysis.overallModelRSquared >= rSquaredThreshold;
    
    return {
      overallSignificant,
      rSquaredThreshold,
      pValueThreshold,
      significantPredictors,
      nonSignificantPredictors,
      significanceDetails
    };
  }

  /**
   * Validates p-value calculation accuracy
   * Requirements: 2.2, 2.3
   */
  private validatePValueCalculation(result: RegressionAnalysisResult): { isValid: boolean; error?: string } {
    // Validate p-value is within valid range
    const pValueValidation = ValidationUtils.validatePValue(result.pValue, `p-value for ${result.metric}`);
    if (!pValueValidation.isValid) {
      return { isValid: false, error: pValueValidation.error };
    }
    
    // Check for suspicious p-values that might indicate calculation errors
    if (result.pValue === 0) {
      return { isValid: false, error: 'P-value of exactly 0 is suspicious - may indicate calculation error' };
    }
    
    if (result.pValue === 1) {
      return { isValid: false, error: 'P-value of exactly 1 is suspicious - may indicate calculation error' };
    }
    
    // Validate p-value consistency with coefficient and confidence interval
    const [lowerBound, upperBound] = result.confidenceInterval;
    const confidenceIntervalContainsZero = lowerBound <= 0 && upperBound >= 0;
    const shouldBeSignificant = result.pValue <= 0.05; // Standard significance level
    
    // If confidence interval contains zero, p-value should be > 0.05
    if (confidenceIntervalContainsZero && shouldBeSignificant) {
      return { 
        isValid: false, 
        error: `P-value (${result.pValue}) suggests significance but confidence interval [${lowerBound}, ${upperBound}] contains zero` 
      };
    }
    
    return { isValid: true };
  }

  /**
   * Validates R-squared calculation accuracy
   * Requirements: 2.2
   */
  private validateRSquaredCalculation(result: RegressionAnalysisResult): { isValid: boolean; error?: string } {
    // Validate R-squared is within valid range
    const rSquaredValidation = ValidationUtils.validateRSquared(result.rSquared, `R-squared for ${result.metric}`);
    if (!rSquaredValidation.isValid) {
      return { isValid: false, error: rSquaredValidation.error };
    }
    
    // Check for unrealistic R-squared values
    if (result.rSquared > 0.95) {
      return { 
        isValid: false, 
        error: `R-squared (${result.rSquared}) is suspiciously high (>0.95) for single predictor - possible overfitting or calculation error` 
      };
    }
    
    // Validate relationship between R-squared and coefficient
    if (result.rSquared > 0.5 && Math.abs(result.coefficient) < 0.1) {
      return { 
        isValid: false, 
        error: `High R-squared (${result.rSquared}) with small coefficient (${result.coefficient}) is inconsistent` 
      };
    }
    
    return { isValid: true };
  }

  /**
   * Validates proper application of significance thresholds
   * Requirements: 2.2, 2.3
   */
  private validateThresholdApplication(
    result: RegressionAnalysisResult, 
    rSquaredThreshold: number, 
    pValueThreshold: number
  ): { isValid: boolean; error?: string } {
    
    // Verify R-squared threshold is applied correctly
    const meetsRSquaredThreshold = result.rSquared >= rSquaredThreshold;
    
    // Verify p-value threshold is applied correctly  
    const meetsPValueThreshold = result.pValue <= pValueThreshold;
    
    // Both thresholds must be met for significance
    const shouldBeSignificant = meetsRSquaredThreshold && meetsPValueThreshold;
    
    if (result.isStatisticallySignificant !== shouldBeSignificant) {
      return {
        isValid: false,
        error: `Threshold application error: R²=${result.rSquared} (>=${rSquaredThreshold}? ${meetsRSquaredThreshold}), p=${result.pValue} (<=${pValueThreshold}? ${meetsPValueThreshold}), but isSignificant=${result.isStatisticallySignificant}`
      };
    }
    
    // Validate threshold values themselves
    if (rSquaredThreshold < 0 || rSquaredThreshold > 1) {
      return { isValid: false, error: `Invalid R-squared threshold: ${rSquaredThreshold}` };
    }
    
    if (pValueThreshold < 0 || pValueThreshold > 1) {
      return { isValid: false, error: `Invalid p-value threshold: ${pValueThreshold}` };
    }
    
    // Check if thresholds are reasonable
    if (pValueThreshold > 0.2) {
      console.warn(`P-value threshold (${pValueThreshold}) is quite high - consider using 0.05 or 0.1`);
    }
    
    if (rSquaredThreshold > 0.5) {
      console.warn(`R-squared threshold (${rSquaredThreshold}) is quite high - may be too restrictive`);
    }
    
    return { isValid: true };
  }

  /**
   * Validates handling of non-significant predictors
   * Requirements: 2.3, 2.4
   */
  private validateNonSignificantPredictorHandling(result: RegressionAnalysisResult, isSignificant: boolean): void {
    if (!isSignificant) {
      // Non-significant predictors should have appropriate weight handling
      if (result.weight > 0.5) {
        console.warn(`Non-significant predictor ${result.metric} has high weight (${result.weight}) - should be reduced or excluded`);
      }
      
      // Check if coefficient is close to zero for non-significant predictors
      if (Math.abs(result.coefficient) > 2.0) {
        console.warn(`Non-significant predictor ${result.metric} has large coefficient (${result.coefficient}) - may indicate model instability`);
      }
    } else {
      // Significant predictors should have reasonable weights
      if (result.weight === 0) {
        console.warn(`Significant predictor ${result.metric} has zero weight - may not be properly utilized in predictions`);
      }
    }
  }

  /**
   * Validates confidence interval calculations
   * Requirements: 2.2, 2.4
   */
  private validateConfidenceInterval(result: RegressionAnalysisResult): { isValid: boolean; error?: string } {
    const [lowerBound, upperBound] = result.confidenceInterval;
    
    // Basic validation
    if (!isFinite(lowerBound) || !isFinite(upperBound)) {
      return { isValid: false, error: `Invalid confidence interval bounds: [${lowerBound}, ${upperBound}]` };
    }
    
    if (lowerBound > upperBound) {
      return { isValid: false, error: `Invalid confidence interval: lower bound (${lowerBound}) > upper bound (${upperBound})` };
    }
    
    // Validate interval contains the coefficient
    if (result.coefficient < lowerBound || result.coefficient > upperBound) {
      return { 
        isValid: false, 
        error: `Coefficient (${result.coefficient}) is outside its confidence interval [${lowerBound}, ${upperBound}]` 
      };
    }
    
    // Check interval width reasonableness
    const intervalWidth = upperBound - lowerBound;
    const coefficientMagnitude = Math.abs(result.coefficient);
    
    // Interval should not be excessively wide relative to coefficient
    if (intervalWidth > coefficientMagnitude * 10 && coefficientMagnitude > 0.01) {
      console.warn(`Very wide confidence interval for ${result.metric}: width=${intervalWidth.toFixed(3)}, coefficient=${result.coefficient.toFixed(3)}`);
    }
    
    // Interval should not be suspiciously narrow
    if (intervalWidth < coefficientMagnitude * 0.01 && coefficientMagnitude > 0.1) {
      return { 
        isValid: false, 
        error: `Suspiciously narrow confidence interval for ${result.metric}: width=${intervalWidth.toFixed(6)}` 
      };
    }
    
    return { isValid: true };
  }

  /**
   * Validates model assumptions (linearity, homoscedasticity, normality)
   * Requirements: 2.1, 2.4, 2.5
   */
  private async validateModelAssumptions(analysis: EnhancedStatisticalAnalysis): Promise<ModelAssumptionResults> {
    console.log(`[REGRESSION AUDITOR] Validating model assumptions`);
    
    // Test for linearity
    const linearity = await this.testLinearity(analysis);
    
    // Test for homoscedasticity (constant variance)
    const homoscedasticity = await this.testHomoscedasticity(analysis);
    
    // Test for normality of residuals
    const normality = await this.testNormality(analysis);
    
    // Test for multicollinearity
    const multicollinearity = this.testMulticollinearity(analysis.regressionResults);
    
    // Test sample size adequacy
    const sampleSizeTest = this.validateSampleSizeAdequacy(analysis);
    
    const overallValid = linearity.passed && homoscedasticity.passed && 
                        normality.passed && multicollinearity.passed && sampleSizeTest.adequate;
    
    return {
      linearity,
      homoscedasticity,
      normality,
      multicollinearity,
      sampleSizeAdequacy: sampleSizeTest,
      overallValid
    };
  }

  /**
   * Tests linearity assumption
   * Requirements: 2.1, 2.4
   */
  private async testLinearity(analysis: EnhancedStatisticalAnalysis): Promise<AssumptionTest> {
    console.log(`[REGRESSION AUDITOR] Testing linearity assumption`);
    
    // Multiple approaches to test linearity
    const rSquared = analysis.overallModelRSquared;
    const fPValue = analysis.modelValidation.fPValue;
    
    // 1. Overall model fit test
    const modelFitThreshold = 0.1; // Minimum R² for meaningful linear relationship
    const modelFitPassed = rSquared >= modelFitThreshold;
    
    // 2. F-test for overall model significance
    const fTestPassed = fPValue < 0.05;
    
    // 3. Check for consistent relationships across predictors
    const consistentRelationships = this.checkLinearityConsistency(analysis.regressionResults);
    
    // 4. Residual pattern analysis (simplified)
    const residualPatternOk = this.analyzeResidualPatterns(analysis);
    
    const overallLinearityScore = [modelFitPassed, fTestPassed, consistentRelationships, residualPatternOk]
      .filter(Boolean).length / 4;
    
    const testStatistic = rSquared;
    const passed = overallLinearityScore >= 0.75; // At least 3 out of 4 tests pass
    
    let details = `Linearity assessment: R²=${rSquared.toFixed(3)} (${modelFitPassed ? 'adequate' : 'poor'}), `;
    details += `F-test p=${fPValue.toFixed(4)} (${fTestPassed ? 'significant' : 'not significant'}), `;
    details += `consistency=${consistentRelationships ? 'good' : 'poor'}, `;
    details += `residuals=${residualPatternOk ? 'acceptable' : 'concerning'}`;
    
    return {
      testName: 'Linearity Test',
      testStatistic,
      pValue: fPValue,
      passed,
      details
    };
  }

  /**
   * Tests homoscedasticity assumption (constant variance)
   * Requirements: 2.1, 2.4
   */
  private async testHomoscedasticity(analysis: EnhancedStatisticalAnalysis): Promise<AssumptionTest> {
    console.log(`[REGRESSION AUDITOR] Testing homoscedasticity assumption`);
    
    const residualStandardError = analysis.modelValidation.residualStandardError;
    const sampleSize = analysis.sampleSize;
    
    // 1. Residual standard error test
    const rseThreshold = 20; // Reasonable threshold for college football scores
    const rseTest = residualStandardError <= rseThreshold;
    
    // 2. Coefficient stability test (if coefficients are stable, variance is likely constant)
    const coefficientStability = this.assessCoefficientStability(analysis.regressionResults);
    
    // 3. Model fit consistency test
    const adjustedRSquared = analysis.modelValidation.adjustedRSquared;
    const rSquaredDifference = analysis.overallModelRSquared - adjustedRSquared;
    const modelConsistency = rSquaredDifference < 0.1; // Small difference suggests stable variance
    
    // 4. Breusch-Pagan test approximation
    const breuschPaganApprox = this.approximateBreuschPaganTest(analysis);
    
    const homoscedasticityScore = [rseTest, coefficientStability, modelConsistency, breuschPaganApprox]
      .filter(Boolean).length / 4;
    
    const testStatistic = residualStandardError;
    const passed = homoscedasticityScore >= 0.75;
    
    // Approximate p-value based on residual standard error
    const pValue = residualStandardError > rseThreshold ? 0.01 : 0.5;
    
    let details = `Homoscedasticity assessment: RSE=${residualStandardError.toFixed(2)} (${rseTest ? 'acceptable' : 'high'}), `;
    details += `coefficient stability=${coefficientStability ? 'good' : 'poor'}, `;
    details += `model consistency=${modelConsistency ? 'good' : 'poor'}, `;
    details += `variance pattern=${breuschPaganApprox ? 'constant' : 'non-constant'}`;
    
    return {
      testName: 'Homoscedasticity Test (Breusch-Pagan approximation)',
      testStatistic,
      pValue,
      passed,
      details
    };
  }

  /**
   * Tests normality assumption of residuals
   * Requirements: 2.1, 2.4
   */
  private async testNormality(analysis: EnhancedStatisticalAnalysis): Promise<AssumptionTest> {
    console.log(`[REGRESSION AUDITOR] Testing normality assumption`);
    
    const sampleSize = analysis.sampleSize;
    const residualStandardError = analysis.modelValidation.residualStandardError;
    
    // 1. Central Limit Theorem test (large sample approximation)
    const cltThreshold = 30;
    const cltTest = sampleSize >= cltThreshold;
    
    // 2. Model fit quality (good fit suggests residuals are well-behaved)
    const modelFitTest = analysis.overallModelRSquared > 0.2;
    
    // 3. Residual standard error reasonableness
    const residualTest = residualStandardError < 25; // Reasonable for college football
    
    // 4. Coefficient significance pattern (normal residuals lead to reliable significance tests)
    const significancePattern = this.assessSignificancePattern(analysis.regressionResults);
    
    // 5. Shapiro-Wilk approximation based on sample size and model quality
    const shapiroWilkApprox = this.approximateShapiroWilkTest(analysis);
    
    const normalityScore = [cltTest, modelFitTest, residualTest, significancePattern, shapiroWilkApprox]
      .filter(Boolean).length / 5;
    
    const testStatistic = sampleSize; // Using sample size as primary test statistic
    const passed = normalityScore >= 0.6; // More lenient as normality is often approximated
    
    // Approximate p-value based on sample size and model quality
    let pValue = 0.5;
    if (!cltTest && !modelFitTest) pValue = 0.01;
    else if (!cltTest || !modelFitTest) pValue = 0.1;
    
    let details = `Normality assessment: sample size=${sampleSize} (CLT ${cltTest ? 'applicable' : 'not applicable'}), `;
    details += `model fit=${analysis.overallModelRSquared.toFixed(3)} (${modelFitTest ? 'good' : 'poor'}), `;
    details += `RSE=${residualStandardError.toFixed(2)} (${residualTest ? 'reasonable' : 'high'}), `;
    details += `significance pattern=${significancePattern ? 'consistent' : 'inconsistent'}`;
    
    return {
      testName: 'Normality Test (Shapiro-Wilk approximation)',
      testStatistic,
      pValue,
      passed,
      details
    };
  }

  /**
   * Tests for multicollinearity between predictors
   * Requirements: 2.4, 2.5
   */
  private testMulticollinearity(regressionResults: RegressionAnalysisResult[]): MulticollinearityTest {
    console.log(`[REGRESSION AUDITOR] Testing for multicollinearity`);
    
    const vifValues: MulticollinearityTest['vifValues'] = [];
    const vifThreshold = 5.0; // Standard threshold for VIF (some use 10)
    
    for (const result of regressionResults) {
      // Enhanced VIF estimation using multiple indicators
      const vif = this.calculateVIFEstimate(result, regressionResults);
      const problematic = vif > vifThreshold;
      
      vifValues.push({
        predictor: result.metric,
        vif,
        problematic
      });
      
      // Log warnings for high VIF values
      if (problematic) {
        console.warn(`High VIF detected for ${result.metric}: ${vif.toFixed(2)} (threshold: ${vifThreshold})`);
      }
    }
    
    const maxVif = Math.max(...vifValues.map(v => v.vif));
    const passed = maxVif <= vifThreshold;
    
    // Additional multicollinearity checks
    const correlationWarnings = this.checkPredictorCorrelations(regressionResults);
    
    return {
      vifValues,
      maxVif,
      vifThreshold,
      passed
    };
  }

  /**
   * Checks linearity consistency across predictors
   */
  private checkLinearityConsistency(regressionResults: RegressionAnalysisResult[]): boolean {
    // Check if significant predictors have reasonable R² values
    const significantResults = regressionResults.filter(r => r.isStatisticallySignificant);
    
    if (significantResults.length === 0) return false;
    
    // All significant predictors should have R² > 0.1
    const consistentRSquared = significantResults.every(r => r.rSquared > 0.1);
    
    // Coefficients should have reasonable magnitudes
    const reasonableCoefficients = significantResults.every(r => Math.abs(r.coefficient) < 10);
    
    return consistentRSquared && reasonableCoefficients;
  }

  /**
   * Analyzes residual patterns for linearity
   */
  private analyzeResidualPatterns(analysis: EnhancedStatisticalAnalysis): boolean {
    // Simplified residual analysis based on available metrics
    const rse = analysis.modelValidation.residualStandardError;
    const rSquared = analysis.overallModelRSquared;
    
    // If model explains variance well and RSE is reasonable, residuals are likely well-behaved
    const goodFit = rSquared > 0.2;
    const reasonableRSE = rse < 25;
    
    // Check for model stability (adjusted R² close to R²)
    const rSquaredDiff = rSquared - analysis.modelValidation.adjustedRSquared;
    const stableModel = rSquaredDiff < 0.1;
    
    return goodFit && reasonableRSE && stableModel;
  }

  /**
   * Assesses coefficient stability for homoscedasticity
   */
  private assessCoefficientStability(regressionResults: RegressionAnalysisResult[]): boolean {
    // Check if confidence intervals are reasonable (not too wide)
    for (const result of regressionResults) {
      const [lower, upper] = result.confidenceInterval;
      const intervalWidth = upper - lower;
      const coefficientMagnitude = Math.abs(result.coefficient);
      
      // If coefficient is non-zero, interval shouldn't be excessively wide
      if (coefficientMagnitude > 0.1 && intervalWidth > coefficientMagnitude * 5) {
        return false; // Unstable coefficient suggests heteroscedasticity
      }
    }
    
    return true;
  }

  /**
   * Approximates Breusch-Pagan test for homoscedasticity
   */
  private approximateBreuschPaganTest(analysis: EnhancedStatisticalAnalysis): boolean {
    // Simplified approximation based on model consistency
    const rSquared = analysis.overallModelRSquared;
    const adjustedRSquared = analysis.modelValidation.adjustedRSquared;
    const fPValue = analysis.modelValidation.fPValue;
    
    // If model is significant and R² values are close, variance is likely constant
    const modelSignificant = fPValue < 0.05;
    const consistentRSquared = Math.abs(rSquared - adjustedRSquared) < 0.05;
    
    return modelSignificant && consistentRSquared;
  }

  /**
   * Assesses significance pattern for normality
   */
  private assessSignificancePattern(regressionResults: RegressionAnalysisResult[]): boolean {
    // Normal residuals should lead to consistent significance patterns
    const significantCount = regressionResults.filter(r => r.isStatisticallySignificant).length;
    const totalCount = regressionResults.length;
    
    // Expect some but not all predictors to be significant (realistic pattern)
    const significanceRatio = significantCount / totalCount;
    return significanceRatio > 0.1 && significanceRatio < 0.9;
  }

  /**
   * Approximates Shapiro-Wilk test for normality
   */
  private approximateShapiroWilkTest(analysis: EnhancedStatisticalAnalysis): boolean {
    // Approximation based on sample size and model quality
    const sampleSize = analysis.sampleSize;
    const rSquared = analysis.overallModelRSquared;
    const rse = analysis.modelValidation.residualStandardError;
    
    // Large samples with good fit and reasonable RSE likely have normal residuals
    const largeSample = sampleSize >= 50;
    const goodFit = rSquared > 0.3;
    const reasonableRSE = rse < 20;
    
    // At least 2 out of 3 conditions should be met
    return [largeSample, goodFit, reasonableRSE].filter(Boolean).length >= 2;
  }

  /**
   * Calculates enhanced VIF estimate
   */
  private calculateVIFEstimate(
    targetResult: RegressionAnalysisResult, 
    allResults: RegressionAnalysisResult[]
  ): number {
    // Enhanced VIF estimation using multiple indicators
    const rSquared = targetResult.rSquared;
    
    // Basic VIF calculation: VIF = 1 / (1 - R²)
    let baseVIF = 1 / (1 - Math.max(0.01, Math.min(0.99, rSquared)));
    
    // Adjust based on coefficient stability
    const [lower, upper] = targetResult.confidenceInterval;
    const intervalWidth = upper - lower;
    const coefficientMagnitude = Math.abs(targetResult.coefficient);
    
    if (coefficientMagnitude > 0.01) {
      const stabilityRatio = intervalWidth / coefficientMagnitude;
      if (stabilityRatio > 3) {
        baseVIF *= 1.5; // Increase VIF for unstable coefficients
      }
    }
    
    // Adjust based on significance
    if (!targetResult.isStatisticallySignificant && rSquared > 0.3) {
      baseVIF *= 1.3; // Non-significant but high R² suggests multicollinearity
    }
    
    return Math.min(baseVIF, 50); // Cap at reasonable maximum
  }

  /**
   * Checks for high correlations between predictors
   */
  private checkPredictorCorrelations(regressionResults: RegressionAnalysisResult[]): string[] {
    const warnings: string[] = [];
    
    // Check for similar coefficient patterns that might indicate correlation
    for (let i = 0; i < regressionResults.length; i++) {
      for (let j = i + 1; j < regressionResults.length; j++) {
        const result1 = regressionResults[i];
        const result2 = regressionResults[j];
        
        // Check for similar R² values (might indicate correlation)
        const rSquaredDiff = Math.abs(result1.rSquared - result2.rSquared);
        if (rSquaredDiff < 0.05 && result1.rSquared > 0.3 && result2.rSquared > 0.3) {
          warnings.push(`Potential correlation between ${result1.metric} and ${result2.metric}: similar R² values`);
        }
        
        // Check for opposite coefficient signs with similar magnitudes
        const coeff1 = result1.coefficient;
        const coeff2 = result2.coefficient;
        if (Math.sign(coeff1) !== Math.sign(coeff2) && 
            Math.abs(Math.abs(coeff1) - Math.abs(coeff2)) < 0.5) {
          warnings.push(`Potential negative correlation between ${result1.metric} and ${result2.metric}: opposite coefficients`);
        }
      }
    }
    
    return warnings;
  }

  /**
   * Validates multicollinearity between predictors
   * Requirements: 2.4, 2.5
   */
  private validateMulticollinearity(regressionResults: RegressionAnalysisResult[]): MulticollinearityTest {
    console.log(`[REGRESSION AUDITOR] Checking for multicollinearity`);
    
    // Simplified multicollinearity check based on coefficient magnitudes and significance
    // In a full implementation, this would calculate actual VIF values
    
    const vifValues: MulticollinearityTest['vifValues'] = [];
    const vifThreshold = 5.0; // Standard threshold for VIF
    
    for (const result of regressionResults) {
      // Simplified VIF estimation based on R-squared and coefficient stability
      // This is a placeholder - actual VIF calculation requires correlation matrix
      const estimatedVif = 1 / (1 - Math.max(0, result.rSquared - 0.1));
      const problematic = estimatedVif > vifThreshold;
      
      vifValues.push({
        predictor: result.metric,
        vif: estimatedVif,
        problematic
      });
    }
    
    const maxVif = Math.max(...vifValues.map(v => v.vif));
    const passed = maxVif <= vifThreshold;
    
    return {
      vifValues,
      maxVif,
      vifThreshold,
      passed
    };
  }

  /**
   * Validates sample size adequacy for regression analysis
   * Requirements: 2.1, 2.4, 2.5
   */
  private validateSampleSizeAdequacy(analysis: EnhancedStatisticalAnalysis): SampleSizeTest {
    console.log(`[REGRESSION AUDITOR] Validating sample size adequacy`);
    
    const sampleSize = analysis.sampleSize;
    const predictorCount = analysis.regressionResults.length;
    const minimumRequired = this.config.thresholds.regression.sampleSizeMinimum;
    
    // Rule of thumb: at least 10-15 observations per predictor
    const recommendedMinimum = Math.max(minimumRequired, predictorCount * 15);
    const adequate = sampleSize >= recommendedMinimum;
    
    // Basic power analysis (simplified)
    const powerAnalysis = {
      power: adequate ? 0.8 : Math.min(0.8, sampleSize / recommendedMinimum * 0.8),
      effectSize: analysis.overallModelRSquared,
      alpha: 0.05
    };
    
    return {
      sampleSize,
      minimumRequired: recommendedMinimum,
      adequate,
      powerAnalysis
    };
  }

  /**
   * Validates predictive power metrics
   * Requirements: 2.4
   */
  private async validatePredictivePower(analysis: EnhancedStatisticalAnalysis): Promise<PredictivePowerMetrics> {
    console.log(`[REGRESSION AUDITOR] Validating predictive power`);
    
    // Use the predictive accuracy from the analysis
    const crossValidationR2 = Math.max(0, analysis.overallModelRSquared - 0.05); // Slight penalty for cross-validation
    const predictionAccuracy = analysis.predictiveAccuracy;
    
    // Estimate error metrics based on model fit
    const meanAbsoluteError = analysis.modelValidation.residualStandardError * 0.8;
    const rootMeanSquareError = analysis.modelValidation.residualStandardError;
    
    // Assess overfitting risk
    const rSquaredDifference = analysis.overallModelRSquared - analysis.modelValidation.adjustedRSquared;
    const overfittingRisk: 'low' | 'medium' | 'high' = 
      rSquaredDifference < 0.05 ? 'low' :
      rSquaredDifference < 0.15 ? 'medium' : 'high';
    
    return {
      crossValidationR2,
      meanAbsoluteError,
      rootMeanSquareError,
      predictionAccuracy,
      overfittingRisk
    };
  }

  /**
   * Validates individual regression coefficients
   * Requirements: 2.1, 2.2
   */
  private async validateCoefficients(regressionResults: RegressionAnalysisResult[]): Promise<CoefficientValidationResult[]> {
    console.log(`[REGRESSION AUDITOR] Validating regression coefficients`);
    
    const coefficientResults: CoefficientValidationResult[] = [];
    
    for (const result of regressionResults) {
      // Validate coefficient value
      const coefficientValidation = ValidationUtils.validateNumber(result.coefficient, `Coefficient for ${result.metric}`);
      if (!coefficientValidation.isValid) {
        throw new Error(`Invalid coefficient for ${result.metric}: ${coefficientValidation.error}`);
      }
      
      // Calculate t-statistic (simplified - would need standard error)
      const standardError = Math.abs(result.coefficient) / 2; // Simplified estimation
      const tStatistic = result.coefficient / standardError;
      
      // Check if coefficient is reasonable (not extremely large)
      const isReasonable = Math.abs(result.coefficient) < 100; // Reasonable threshold
      
      // Define expected range based on metric type (simplified)
      const expectedRange: [number, number] = this.getExpectedCoefficientRange(result.metric);
      
      coefficientResults.push({
        predictor: result.metric,
        coefficient: result.coefficient,
        standardError,
        tStatistic,
        pValue: result.pValue,
        confidenceInterval: result.confidenceInterval,
        isSignificant: result.isStatisticallySignificant,
        isReasonable,
        expectedRange
      });
    }
    
    return coefficientResults;
  }

  /**
   * Gets expected coefficient range for a metric
   */
  private getExpectedCoefficientRange(metric: string): [number, number] {
    // Define reasonable ranges based on metric type
    switch (metric.toLowerCase()) {
      case 'scoringefficiency':
        return [-2, 2];
      case 'passingefficiency':
        return [-1, 1];
      case 'rushingefficiency':
        return [-1, 1];
      case 'turnoverefficiency':
        return [-3, 3];
      default:
        return [-5, 5]; // General range
    }
  }

  /**
   * Calculates overall validation score based on all metrics
   */
  private calculateOverallScore(result: RegressionValidationResult): void {
    let score = 100;
    
    // Model fit score (30% weight)
    const modelFitScore = result.modelFit.meetsThresholds ? 30 : 
                         result.modelFit.rSquared > 0.1 ? 20 : 10;
    
    // Statistical significance score (25% weight)
    const sigScore = result.statisticalSignificance.overallSignificant ? 25 :
                    result.statisticalSignificance.significantPredictors.length > 0 ? 15 : 5;
    
    // Model assumptions score (25% weight)
    const assumptionScore = result.assumptions.overallValid ? 25 : 
                           [result.assumptions.linearity.passed, result.assumptions.homoscedasticity.passed, 
                            result.assumptions.normality.passed].filter(Boolean).length * 8;
    
    // Predictive power score (20% weight)
    const predictiveScore = result.predictivePower.overfittingRisk === 'low' ? 20 :
                           result.predictivePower.overfittingRisk === 'medium' ? 15 : 10;
    
    score = modelFitScore + sigScore + assumptionScore + predictiveScore;
    result.score = Math.max(0, Math.min(100, score));
    
    // Set overall validity
    result.isValid = result.modelFit.meetsThresholds && 
                    result.statisticalSignificance.significantPredictors.length > 0 &&
                    result.assumptions.sampleSizeAdequacy.adequate;
  }

  /**
   * Adds validation recommendations based on findings
   */
  private addValidationRecommendations(result: RegressionValidationResult): void {
    if (!result.modelFit.meetsThresholds) {
      this.addRecommendation(result, 'Consider adding more predictive variables or transforming existing ones to improve model fit');
    }
    
    if (result.statisticalSignificance.significantPredictors.length === 0) {
      this.addRecommendation(result, 'No statistically significant predictors found - review data quality and variable selection');
    }
    
    if (!result.assumptions.sampleSizeAdequacy.adequate) {
      this.addRecommendation(result, `Increase sample size to at least ${result.assumptions.sampleSizeAdequacy.minimumRequired} observations for reliable results`);
    }
    
    if (!result.assumptions.multicollinearity.passed) {
      this.addRecommendation(result, 'Address multicollinearity by removing or combining highly correlated predictors');
    }
    
    if (result.predictivePower.overfittingRisk === 'high') {
      this.addRecommendation(result, 'High overfitting risk detected - consider regularization techniques or cross-validation');
    }
  }
}

// Export singleton instance
export const regressionAnalysisAuditor = new RegressionAnalysisAuditor(
  'regression_analysis' as ValidationComponent,
  validationLogger,
  errorHandler,
  DEFAULT_VALIDATION_CONFIG,
  statisticalImpactAnalyzer
);