// server/services/__tests__/regressionBasedWeightManager.test.ts

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RegressionBasedWeightManager, WeightChangeLog, WeightValidationResult } from '../regressionBasedWeightManager.js';
import { StatisticalImpactWeights, EnhancedStatisticalAnalysis, RegressionAnalysisResult } from '../statisticalImpactAnalyzer.js';
import { db } from '../../db.js';

// Mock the database
vi.mock('../../db.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    values: vi.fn(),
    returning: vi.fn()
  }
}));

// Mock drizzle-orm functions
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  desc: vi.fn(),
  and: vi.fn(),
  sql: vi.fn()
}));

// Mock shared schema
vi.mock('@college-pickem/shared', () => ({
  predictionWeightHistory: {
    id: 'id',
    season: 'season',
    changeDate: 'changeDate',
    passingOffense: 'passingOffense',
    rushingOffense: 'rushingOffense',
    scoringEfficiency: 'scoringEfficiency',
    passingDefense: 'passingDefense',
    rushingDefense: 'rushingDefense',
    turnoverMargin: 'turnoverMargin',
    specialTeams: 'specialTeams',
    homeFieldAdvantage: 'homeFieldAdvantage',
    changeReason: 'changeReason',
    previousWeights: 'previousWeights',
    regressionRSquared: 'regressionRSquared',
    regressionSampleSize: 'regressionSampleSize',
    significantMetrics: 'significantMetrics',
    changedByUserId: 'changedByUserId'
  },
  regressionAnalysisResults: {
    id: 'id',
    season: 'season',
    analysisDate: 'analysisDate',
    overallRSquared: 'overallRSquared',
    sampleSize: 'sampleSize',
    predictiveAccuracy: 'predictiveAccuracy',
    residualStandardError: 'residualStandardError',
    fStatistic: 'fStatistic',
    fPValue: 'fPValue',
    adjustedRSquared: 'adjustedRSquared'
  },
  regressionMetricResults: {
    id: 'id',
    analysisId: 'analysisId',
    metricName: 'metricName',
    coefficient: 'coefficient',
    rSquared: 'rSquared',
    pValue: 'pValue',
    confidenceIntervalLower: 'confidenceIntervalLower',
    confidenceIntervalUpper: 'confidenceIntervalUpper',
    calculatedWeight: 'calculatedWeight',
    isStatisticallySignificant: 'isStatisticallySignificant'
  },
  users: { id: 'id' }
}));

describe('RegressionBasedWeightManager', () => {
  let weightManager: RegressionBasedWeightManager;
  let mockDbChain: any;

  const mockFallbackWeights: StatisticalImpactWeights = {
    passingOffense: 0.25,
    rushingOffense: 0.20,
    scoringEfficiency: 0.30,
    passingDefense: 0.25,
    rushingDefense: 0.20,
    turnoverMargin: 0.35,
    specialTeams: 0.15,
    homeFieldAdvantage: 0.10
  };

  const mockEnhancedAnalysis: EnhancedStatisticalAnalysis = {
    regressionResults: [
      {
        metric: 'scoringEfficiency',
        coefficient: 1.5,
        rSquared: 0.75,
        pValue: 0.001,
        confidenceInterval: [1.2, 1.8],
        weight: 0.4,
        isStatisticallySignificant: true
      },
      {
        metric: 'passingEfficiency',
        coefficient: 0.8,
        rSquared: 0.45,
        pValue: 0.02,
        confidenceInterval: [0.5, 1.1],
        weight: 0.25,
        isStatisticallySignificant: true
      },
      {
        metric: 'rushingEfficiency',
        coefficient: 0.3,
        rSquared: 0.15,
        pValue: 0.15,
        confidenceInterval: [0.1, 0.5],
        weight: 0.1,
        isStatisticallySignificant: false
      }
    ],
    overallModelRSquared: 0.68,
    predictiveAccuracy: 0.72,
    recommendedWeights: {
      scoring: 0.4,
      passingYards: 0.25,
      rushingYards: 0.15,
      turnovers: 0.15,
      specialTeams: 0.05
    },
    sampleSize: 150,
    modelValidation: {
      residualStandardError: 8.5,
      fStatistic: 45.2,
      fPValue: 0.001,
      adjustedRSquared: 0.65
    }
  };

  beforeEach(() => {
    weightManager = new RegressionBasedWeightManager();
    
    // Setup mock database chain
    mockDbChain = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn()
    };

    // Mock db to return the chain
    (db.select as any).mockReturnValue(mockDbChain);
    (db.insert as any).mockReturnValue(mockDbChain);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with fallback weights', () => {
      const manager = new RegressionBasedWeightManager();
      expect(manager).toBeDefined();
    });
  });

  describe('getCurrentWeights', () => {
    it('should return fallback weights when no weights exist for season', async () => {
      // Mock empty result from database
      mockDbChain.limit.mockResolvedValue([]);

      const weights = await weightManager.getCurrentWeights(2024);

      expect(weights).toEqual(mockFallbackWeights);
    });

    it('should return stored weights when they exist', async () => {
      const storedWeights = {
        id: 1,
        season: 2024,
        changeDate: new Date(),
        passingOffense: '0.30',
        rushingOffense: '0.25',
        scoringEfficiency: '0.35',
        passingDefense: '0.20',
        rushingDefense: '0.18',
        turnoverMargin: '0.40',
        specialTeams: '0.12',
        homeFieldAdvantage: '0.10',
        changeReason: 'regression_analysis'
      };

      mockDbChain.limit.mockResolvedValue([storedWeights]);

      const weights = await weightManager.getCurrentWeights(2024);

      expect(weights.passingOffense).toBe(0.30);
      expect(weights.scoringEfficiency).toBe(0.35);
      expect(weights.turnoverMargin).toBe(0.40);
    });

    it('should handle database errors gracefully', async () => {
      mockDbChain.limit.mockRejectedValue(new Error('Database error'));

      const weights = await weightManager.getCurrentWeights(2024);

      expect(weights).toEqual(mockFallbackWeights);
    });
  });

  describe('updateWeightsFromRegression', () => {
    it('should update weights based on regression analysis', async () => {
      // Mock getCurrentWeights to return fallback weights
      mockDbChain.limit.mockResolvedValueOnce([]); // No existing weights

      // Mock successful weight storage
      const mockChangeLog = {
        id: 1,
        changeDate: new Date(),
        season: 2024
      };
      mockDbChain.returning.mockResolvedValue([mockChangeLog]);

      const result = await weightManager.updateWeightsFromRegression(2024, mockEnhancedAnalysis, 'user123');

      expect(result).toBeDefined();
      expect(result.season).toBe(2024);
      expect(result.reason).toBe('regression_analysis');
    });

    it('should validate weights before updating', async () => {
      // Mock getCurrentWeights
      mockDbChain.limit.mockResolvedValueOnce([]);

      // Create analysis with invalid weights (negative values)
      const invalidAnalysis: EnhancedStatisticalAnalysis = {
        ...mockEnhancedAnalysis,
        recommendedWeights: {
          scoring: -0.1, // Invalid negative weight
          passingYards: 0.25,
          rushingYards: 0.15,
          turnovers: 0.15,
          specialTeams: 0.05
        }
      };

      await expect(
        weightManager.updateWeightsFromRegression(2024, invalidAnalysis)
      ).rejects.toThrow('Invalid weights from regression analysis');
    });

    it('should log weight changes with regression metadata', async () => {
      mockDbChain.limit.mockResolvedValueOnce([]);
      
      const mockChangeLog = {
        id: 1,
        changeDate: new Date(),
        season: 2024
      };
      mockDbChain.returning.mockResolvedValue([mockChangeLog]);

      const result = await weightManager.updateWeightsFromRegression(2024, mockEnhancedAnalysis);

      expect(result.regressionMetrics.rSquared).toBe(0.68);
      expect(result.regressionMetrics.sampleSize).toBe(150);
      expect(result.regressionMetrics.significantMetrics).toContain('scoringEfficiency');
      expect(result.regressionMetrics.significantMetrics).toContain('passingEfficiency');
      expect(result.regressionMetrics.significantMetrics).not.toContain('rushingEfficiency');
    });
  });

  describe('updateWeightsManually', () => {
    it('should update weights manually with validation', async () => {
      mockDbChain.limit.mockResolvedValueOnce([]);
      
      const mockChangeLog = {
        id: 1,
        changeDate: new Date(),
        season: 2024
      };
      mockDbChain.returning.mockResolvedValue([mockChangeLog]);

      const partialWeights = {
        scoringEfficiency: 0.45,
        turnoverMargin: 0.25
      };

      const result = await weightManager.updateWeightsManually(
        2024,
        partialWeights,
        'Manual adjustment for better accuracy',
        'admin123'
      );

      expect(result).toBeDefined();
      expect(result.reason).toContain('manual_override');
      expect(result.changedByUserId).toBe('admin123');
    });

    it('should reject invalid manual weight updates', async () => {
      mockDbChain.limit.mockResolvedValueOnce([]);

      const invalidWeights = {
        scoringEfficiency: -0.5, // Invalid negative weight
        turnoverMargin: 2.5 // Unusually high but not invalid
      };

      await expect(
        weightManager.updateWeightsManually(2024, invalidWeights, 'Test update')
      ).rejects.toThrow('Invalid manual weight update');
    });
  });

  describe('getWeightHistory', () => {
    it('should return weight change history for a season', async () => {
      const mockHistory = [
        {
          id: 1,
          season: 2024,
          changeDate: new Date('2024-01-15'),
          passingOffense: '0.30',
          rushingOffense: '0.25',
          scoringEfficiency: '0.35',
          passingDefense: '0.20',
          rushingDefense: '0.18',
          turnoverMargin: '0.40',
          specialTeams: '0.12',
          homeFieldAdvantage: '0.10',
          changeReason: 'regression_analysis',
          previousWeights: JSON.stringify(mockFallbackWeights),
          regressionRSquared: '0.68',
          regressionSampleSize: 150,
          significantMetrics: ['scoringEfficiency', 'passingEfficiency'],
          changedByUserId: 'user123'
        }
      ];

      mockDbChain.limit.mockResolvedValue(mockHistory);

      const history = await weightManager.getWeightHistory(2024);

      expect(history).toHaveLength(1);
      expect(history[0].season).toBe(2024);
      expect(history[0].reason).toBe('regression_analysis');
      expect(history[0].regressionMetrics.rSquared).toBe(0.68);
      expect(history[0].regressionMetrics.sampleSize).toBe(150);
      expect(history[0].regressionMetrics.significantMetrics).toContain('scoringEfficiency');
    });

    it('should handle empty history gracefully', async () => {
      mockDbChain.limit.mockResolvedValue([]);

      const history = await weightManager.getWeightHistory(2024);

      expect(history).toHaveLength(0);
    });
  });

  describe('validateWeights', () => {
    it('should validate correct weights', () => {
      const validWeights: StatisticalImpactWeights = {
        passingOffense: 0.25,
        rushingOffense: 0.20,
        scoringEfficiency: 0.30,
        passingDefense: 0.25,
        rushingDefense: 0.20,
        turnoverMargin: 0.35,
        specialTeams: 0.15,
        homeFieldAdvantage: 0.10
      };

      const result = weightManager.validateWeights(validWeights);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject weights with negative values', () => {
      const invalidWeights: StatisticalImpactWeights = {
        ...mockFallbackWeights,
        scoringEfficiency: -0.1
      };

      const result = weightManager.validateWeights(invalidWeights);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Negative weight not allowed: scoringEfficiency = -0.1');
    });

    it('should reject weights with NaN values', () => {
      const invalidWeights: StatisticalImpactWeights = {
        ...mockFallbackWeights,
        passingOffense: NaN
      };

      const result = weightManager.validateWeights(invalidWeights);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid passingOffense: must be a valid number');
    });

    it('should warn about unusually high weights', () => {
      const highWeights: StatisticalImpactWeights = {
        ...mockFallbackWeights,
        scoringEfficiency: 2.5 // Very high weight
      };

      const result = weightManager.validateWeights(highWeights);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Unusually high weight: scoringEfficiency = 2.5');
    });

    it('should normalize weights when total is outside normal range', () => {
      const unnormalizedWeights: StatisticalImpactWeights = {
        passingOffense: 0.05,
        rushingOffense: 0.04,
        scoringEfficiency: 0.06,
        passingDefense: 0.05,
        rushingDefense: 0.04,
        turnoverMargin: 0.07,
        specialTeams: 0.03,
        homeFieldAdvantage: 0.02
      };

      const result = weightManager.validateWeights(unnormalizedWeights);

      expect(result.isValid).toBe(true);
      expect(result.normalizedWeights).toBeDefined();
      expect(result.warnings.some(w => w.includes('normalizing'))).toBe(true);
      
      if (result.normalizedWeights) {
        const total = Object.values(result.normalizedWeights).reduce((sum, w) => sum + w, 0);
        expect(total).toBeCloseTo(1.5, 2); // Target normalized total
      }
    });

    it('should reject weights with zero total', () => {
      const zeroWeights: StatisticalImpactWeights = {
        passingOffense: 0,
        rushingOffense: 0,
        scoringEfficiency: 0,
        passingDefense: 0,
        rushingDefense: 0,
        turnoverMargin: 0,
        specialTeams: 0,
        homeFieldAdvantage: 0
      };

      const result = weightManager.validateWeights(zeroWeights);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Total weight sum cannot be zero');
    });
  });

  describe('resetToFallbackWeights', () => {
    it('should reset weights to fallback values', async () => {
      mockDbChain.limit.mockResolvedValueOnce([]);
      
      const mockChangeLog = {
        id: 1,
        changeDate: new Date(),
        season: 2024
      };
      mockDbChain.returning.mockResolvedValue([mockChangeLog]);

      const result = await weightManager.resetToFallbackWeights(2024, 'System reset', 'admin123');

      expect(result).toBeDefined();
      expect(result.reason).toContain('fallback_reset');
      expect(result.newWeights).toEqual(mockFallbackWeights);
    });
  });

  describe('getLatestRegressionAnalysis', () => {
    it('should return null when no analysis exists', async () => {
      mockDbChain.limit.mockResolvedValue([]);

      const result = await weightManager.getLatestRegressionAnalysis(2024);

      expect(result).toBeNull();
    });

    it('should return latest analysis with metric results', async () => {
      const mockAnalysisRecord = {
        id: 1,
        season: 2024,
        analysisDate: new Date(),
        overallRSquared: '0.68',
        sampleSize: 150,
        predictiveAccuracy: '0.72',
        residualStandardError: '8.5',
        fStatistic: '45.2',
        fPValue: '0.001',
        adjustedRSquared: '0.65'
      };

      const mockMetricResults = [
        {
          metricName: 'scoringEfficiency',
          coefficient: '1.5',
          rSquared: '0.75',
          pValue: '0.001',
          confidenceIntervalLower: '1.2',
          confidenceIntervalUpper: '1.8',
          calculatedWeight: '0.4',
          isStatisticallySignificant: true
        }
      ];

      // Mock the analysis query
      mockDbChain.limit.mockResolvedValueOnce([mockAnalysisRecord]);
      
      // Mock the metric results query
      const mockMetricChain = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(mockMetricResults)
      };
      (db.select as any).mockReturnValueOnce(mockDbChain).mockReturnValueOnce(mockMetricChain);

      const result = await weightManager.getLatestRegressionAnalysis(2024);

      expect(result).toBeDefined();
      expect(result?.overallModelRSquared).toBe(0.68);
      expect(result?.sampleSize).toBe(150);
      expect(result?.regressionResults).toHaveLength(1);
      expect(result?.regressionResults[0].metric).toBe('scoringEfficiency');
      expect(result?.regressionResults[0].isStatisticallySignificant).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      mockDbChain.limit.mockRejectedValue(new Error('Database error'));

      const result = await weightManager.getLatestRegressionAnalysis(2024);

      expect(result).toBeNull();
    });
  });

  describe('Weight Calculation from Regression', () => {
    it('should boost weights for highly predictive metrics', async () => {
      mockDbChain.limit.mockResolvedValueOnce([]);
      
      const mockChangeLog = {
        id: 1,
        changeDate: new Date(),
        season: 2024
      };
      mockDbChain.returning.mockResolvedValue([mockChangeLog]);

      // Analysis with high R² for scoring efficiency
      const highPredictiveAnalysis: EnhancedStatisticalAnalysis = {
        ...mockEnhancedAnalysis,
        regressionResults: [
          {
            metric: 'scoringEfficiency',
            coefficient: 2.0,
            rSquared: 0.85, // Very high R²
            pValue: 0.001,
            confidenceInterval: [1.8, 2.2],
            weight: 0.4,
            isStatisticallySignificant: true
          }
        ]
      };

      const result = await weightManager.updateWeightsFromRegression(2024, highPredictiveAnalysis);

      // The scoring efficiency weight should be boosted due to high R²
      expect(result.newWeights.scoringEfficiency).toBeGreaterThan(0.4);
    });

    it('should reduce weights for non-significant metrics', async () => {
      mockDbChain.limit.mockResolvedValueOnce([]);
      
      const mockChangeLog = {
        id: 1,
        changeDate: new Date(),
        season: 2024
      };
      mockDbChain.returning.mockResolvedValue([mockChangeLog]);

      // Analysis with non-significant metrics
      const nonSignificantAnalysis: EnhancedStatisticalAnalysis = {
        ...mockEnhancedAnalysis,
        regressionResults: [
          {
            metric: 'rushingEfficiency',
            coefficient: 0.1,
            rSquared: 0.05, // Very low R²
            pValue: 0.8, // Not significant
            confidenceInterval: [-0.2, 0.4],
            weight: 0.2,
            isStatisticallySignificant: false
          }
        ]
      };

      const result = await weightManager.updateWeightsFromRegression(2024, nonSignificantAnalysis);

      // The rushing weights should be reduced due to lack of significance
      expect(result.newWeights.rushingOffense).toBeLessThan(0.2);
      expect(result.newWeights.rushingDefense).toBeLessThan(0.2);
    });
  });

  describe('Integration with StatisticalImpactAnalyzer', () => {
    it('should properly integrate with enhanced statistical analysis', async () => {
      mockDbChain.limit.mockResolvedValueOnce([]);
      
      const mockChangeLog = {
        id: 1,
        changeDate: new Date(),
        season: 2024
      };
      mockDbChain.returning.mockResolvedValue([mockChangeLog]);

      // Test with complete enhanced analysis
      const result = await weightManager.updateWeightsFromRegression(2024, mockEnhancedAnalysis);

      expect(result).toBeDefined();
      expect(result.regressionMetrics.rSquared).toBe(mockEnhancedAnalysis.overallModelRSquared);
      expect(result.regressionMetrics.sampleSize).toBe(mockEnhancedAnalysis.sampleSize);
      
      // Should include only statistically significant metrics
      const significantMetrics = mockEnhancedAnalysis.regressionResults
        .filter(r => r.isStatisticallySignificant)
        .map(r => r.metric);
      
      expect(result.regressionMetrics.significantMetrics).toEqual(significantMetrics);
    });
  });
});