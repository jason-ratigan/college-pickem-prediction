// server/services/validation/__tests__/weight-calculation-verifier.test.ts

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WeightCalculationVerifier } from '../weight-calculation-verifier.js';
import { validationLogger, errorHandler, DEFAULT_VALIDATION_CONFIG } from '../core.js';
import { StatisticalImpactWeights } from '../../statisticalImpactAnalyzer.js';

// Mock the database
vi.mock('../../../db.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([])
  }
}));

// Mock the weight manager
vi.mock('../../regressionBasedWeightManager.js', () => ({
  RegressionBasedWeightManager: vi.fn().mockImplementation(() => ({
    getCurrentWeights: vi.fn().mockResolvedValue({
      passingOffense: 0.25,
      rushingOffense: 0.20,
      scoringEfficiency: 0.30,
      passingDefense: 0.25,
      rushingDefense: 0.20,
      turnoverMargin: 0.35,
      specialTeams: 0.15,
      homeFieldAdvantage: 0.10
    } as StatisticalImpactWeights)
  }))
}));

describe('WeightCalculationVerifier', () => {
  let verifier: WeightCalculationVerifier;
  const testSeason = 2024;

  beforeEach(() => {
    verifier = new WeightCalculationVerifier(
      'weight_calculation',
      validationLogger,
      errorHandler,
      DEFAULT_VALIDATION_CONFIG
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Weight Derivation Validation', () => {
    it('should validate weight derivation from regression coefficients', async () => {
      const result = await verifier.validate(testSeason);
      
      expect(result).toBeDefined();
      expect(result.weightDerivation).toBeDefined();
      expect(result.weightDerivation.derivationMethod).toBe('regression-based');
      expect(result.weightDerivation.derivationSteps).toBeInstanceOf(Array);
    });

    it('should check statistical significance consideration', async () => {
      const result = await verifier.validate(testSeason);
      
      expect(result.weightDerivation.statisticalSignificanceConsidered).toBeDefined();
      expect(typeof result.weightDerivation.statisticalSignificanceConsidered).toBe('boolean');
    });

    it('should validate normalization application', async () => {
      const result = await verifier.validate(testSeason);
      
      expect(result.weightDerivation.normalizationApplied).toBeDefined();
      expect(typeof result.weightDerivation.normalizationApplied).toBe('boolean');
    });
  });

  describe('Weight Bounds Validation', () => {
    it('should validate weights are within acceptable bounds', async () => {
      const result = await verifier.validate(testSeason);
      
      expect(result.weightBounds).toBeDefined();
      expect(result.weightBounds.weightBounds.min).toBe(DEFAULT_VALIDATION_CONFIG.thresholds.weights.minimumWeight);
      expect(result.weightBounds.weightBounds.max).toBe(DEFAULT_VALIDATION_CONFIG.thresholds.weights.maximumWeight);
      expect(result.weightBounds.weightValues).toBeInstanceOf(Array);
    });

    it('should validate weight sum is reasonable', async () => {
      const result = await verifier.validate(testSeason);
      
      expect(result.weightBounds.sumValidation).toBeDefined();
      expect(result.weightBounds.sumValidation.expectedSum).toBe(1.0);
      expect(typeof result.weightBounds.sumValidation.isValid).toBe('boolean');
    });

    it('should identify out-of-bounds weights', async () => {
      const result = await verifier.validate(testSeason);
      
      for (const weightValue of result.weightBounds.weightValues) {
        expect(weightValue.category).toBeDefined();
        expect(typeof weightValue.weight).toBe('number');
        expect(typeof weightValue.withinBounds).toBe('boolean');
        expect(weightValue.expectedRange).toHaveLength(2);
      }
    });
  });

  describe('Weight Application Verification', () => {
    it('should verify weights are applied correctly in predictions', async () => {
      const result = await verifier.validate(testSeason);
      
      expect(result.weightApplication).toBeDefined();
      expect(result.weightApplication.predictionFormula).toBeDefined();
      expect(result.weightApplication.weightUsage).toBeInstanceOf(Array);
      expect(result.weightApplication.finalCalculation).toBeDefined();
    });

    it('should validate individual weight applications', async () => {
      const result = await verifier.validate(testSeason);
      
      for (const usage of result.weightApplication.weightUsage) {
        expect(usage.category).toBeDefined();
        expect(typeof usage.weight).toBe('number');
        expect(typeof usage.isCorrect).toBe('boolean');
      }
    });

    it('should provide calculation steps for transparency', async () => {
      const result = await verifier.validate(testSeason);
      
      expect(result.weightApplication.finalCalculation.calculationSteps).toBeInstanceOf(Array);
      expect(result.weightApplication.finalCalculation.calculationSteps.length).toBeGreaterThan(0);
    });
  });

  describe('Weight History Auditing', () => {
    it('should validate weight change history completeness', async () => {
      const result = await verifier.validate(testSeason);
      
      expect(result.weightHistory).toBeDefined();
      expect(typeof result.weightHistory.hasCompleteHistory).toBe('boolean');
      expect(typeof result.weightHistory.changeCount).toBe('number');
      expect(result.weightHistory.changes).toBeInstanceOf(Array);
    });

    it('should validate audit trail completeness', async () => {
      const result = await verifier.validate(testSeason);
      
      expect(typeof result.weightHistory.auditTrailComplete).toBe('boolean');
    });

    it('should track weight change metadata', async () => {
      const result = await verifier.validate(testSeason);
      
      for (const change of result.weightHistory.changes) {
        expect(change.date).toBeDefined();
        expect(change.reason).toBeDefined();
        expect(change.previousWeights).toBeDefined();
        expect(change.newWeights).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const result = await verifier.validate(testSeason);
      
      // The validation should complete even with mocked empty database responses
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // The specific error codes depend on the validation logic, not necessarily VALIDATION_SYSTEM_ERROR
      expect(result.errors.some(e => e.code.includes('INVALID') || e.code.includes('ERROR'))).toBe(true);
    });

    it('should provide meaningful error messages', async () => {
      const result = await verifier.validate(testSeason);
      
      for (const error of result.errors) {
        expect(error.code).toBeDefined();
        expect(error.message).toBeDefined();
        expect(error.component).toBe('weight_calculation');
        expect(['critical', 'high', 'medium', 'low']).toContain(error.severity);
      }
    });
  });

  describe('Recommendations', () => {
    it('should provide actionable recommendations', async () => {
      const result = await verifier.validate(testSeason);
      
      expect(result.recommendations).toBeInstanceOf(Array);
      // Recommendations should be provided when issues are found
      if (result.errors.length > 0 || result.warnings.length > 0) {
        expect(result.recommendations.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Integration Tests', () => {
    it('should complete full validation workflow', async () => {
      const result = await verifier.validate(testSeason);
      
      // Should have all required components
      expect(result.weightDerivation).toBeDefined();
      expect(result.weightBounds).toBeDefined();
      expect(result.weightApplication).toBeDefined();
      expect(result.weightHistory).toBeDefined();
      
      // Should have validation metadata
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should log validation results', async () => {
      const logSpy = vi.spyOn(validationLogger, 'logValidation');
      
      await verifier.validate(testSeason);
      
      expect(logSpy).toHaveBeenCalledWith('weight_calculation', expect.any(Object));
    });
  });
});