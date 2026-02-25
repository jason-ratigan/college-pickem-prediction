// server/services/__tests__/statisticalImpactAnalyzer.test.ts

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { StatisticalImpactAnalyzer, StatisticalImpactWeights, MetricCorrelationAnalysis, PredictionAccuracyMetrics, RegressionAnalysisResult, EnhancedStatisticalAnalysis } from '../statisticalImpactAnalyzer.js';
import { db } from '../../db';

// Mock the database
vi.mock('../../db', () => ({
  db: {
    select: vi.fn(),
  }
}));

describe('StatisticalImpactAnalyzer', () => {
  let analyzer: StatisticalImpactAnalyzer;
  let mockDb: any;

  beforeEach(() => {
    analyzer = new StatisticalImpactAnalyzer();
    mockDb = db as any;
    vi.clearAllMocks();
  });

  describe('Constructor and Initial State', () => {
    it('should initialize with default weights', () => {
      const weights = analyzer.getCurrentWeightsSync();
      
      expect(weights).toEqual({
        passingOffense: 0.25,
        rushingOffense: 0.20,
        scoringEfficiency: 0.30,
        passingDefense: 0.25,
        rushingDefense: 0.20,
        turnoverMargin: 0.35,
        specialTeams: 0.15,
        homeFieldAdvantage: 0.10
      });
    });

    it('should have no last analysis date initially', () => {
      expect(analyzer.getLastAnalysisDate()).toBeNull();
    });
  });

  describe('analyzeMetricImpact', () => {
    it('should analyze correlation between efficiency metric and game outcomes', async () => {
      // Mock completed games data - need at least 10 games for analysis
      const mockGames = [];
      for (let i = 1; i <= 12; i++) {
        mockGames.push({
          gameId: i,
          homeTeamId: (i % 4) + 1,
          awayTeamId: ((i + 1) % 4) + 1,
          homeScore: 20 + (i % 20),
          awayScore: 15 + ((i + 2) % 25)
        });
      }

      // Mock efficiency ratings for all teams
      const mockEfficiencyRatings = [
        {
          teamId: 1,
          season: 2024,
          passingOffenseEfficiency: 15.5,
          gamesPlayed: 8,
          confidenceLevel: 'High',
          lastCalculated: new Date()
        },
        {
          teamId: 2,
          season: 2024,
          passingOffenseEfficiency: -8.2,
          gamesPlayed: 8,
          confidenceLevel: 'High',
          lastCalculated: new Date()
        },
        {
          teamId: 3,
          season: 2024,
          passingOffenseEfficiency: 22.1,
          gamesPlayed: 8,
          confidenceLevel: 'High',
          lastCalculated: new Date()
        },
        {
          teamId: 4,
          season: 2024,
          passingOffenseEfficiency: -12.7,
          gamesPlayed: 8,
          confidenceLevel: 'High',
          lastCalculated: new Date()
        }
      ];

      // Setup mock database responses
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockGames)
        })
      });

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockEfficiencyRatings)
        })
      });

      const result = await analyzer.analyzeMetricImpact('passingOffenseEfficiency', 2024);

      expect(result).toEqual({
        metric: 'passingOffenseEfficiency',
        correlationWithWins: expect.any(Number),
        correlationWithPointDifferential: expect.any(Number),
        predictivePower: expect.any(Number),
        sampleSize: expect.any(Number),
        confidenceLevel: expect.any(Number)
      });

      expect(result.sampleSize).toBeGreaterThan(0);
      expect(result.confidenceLevel).toBeGreaterThan(0);
      expect(result.confidenceLevel).toBeLessThanOrEqual(1);
    });

    it('should throw error with insufficient data', async () => {
      // Mock empty games data
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([])
        })
      });

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([])
        })
      });

      await expect(
        analyzer.analyzeMetricImpact('passingOffenseEfficiency', 2024)
      ).rejects.toThrow('Insufficient data for analysis');
    });
  });

  describe('calculateOptimalWeights', () => {
    it('should calculate weights based on metric predictive power', async () => {
      // Mock the analyzeMetricImpact method to return consistent results
      const mockAnalyzeMetricImpact = vi.spyOn(analyzer, 'analyzeMetricImpact');
      
      mockAnalyzeMetricImpact.mockImplementation(async (metric: string) => {
        const mockResults: Record<string, MetricCorrelationAnalysis> = {
          'passingOffenseEfficiency': {
            metric: 'passingOffenseEfficiency',
            correlationWithWins: 0.65,
            correlationWithPointDifferential: 0.72,
            predictivePower: 0.69,
            sampleSize: 50,
            confidenceLevel: 0.90
          },
          'rushingOffenseEfficiency': {
            metric: 'rushingOffenseEfficiency',
            correlationWithWins: 0.58,
            correlationWithPointDifferential: 0.61,
            predictivePower: 0.60,
            sampleSize: 50,
            confidenceLevel: 0.90
          },
          'scoringOffenseEfficiency': {
            metric: 'scoringOffenseEfficiency',
            correlationWithWins: 0.78,
            correlationWithPointDifferential: 0.82,
            predictivePower: 0.80,
            sampleSize: 50,
            confidenceLevel: 0.90
          }
        };
        
        return mockResults[metric] || {
          metric,
          correlationWithWins: 0.40,
          correlationWithPointDifferential: 0.35,
          predictivePower: 0.38,
          sampleSize: 50,
          confidenceLevel: 0.90
        };
      });

      const weights = await analyzer.calculateOptimalWeights(2024);

      expect(weights).toBeDefined();
      expect(typeof weights.passingOffense).toBe('number');
      expect(typeof weights.rushingOffense).toBe('number');
      expect(typeof weights.scoringEfficiency).toBe('number');
      expect(weights.homeFieldAdvantage).toBeCloseTo(0.10, 1); // Should remain close to static value

      // Verify weights are reasonable (not negative, not too extreme)
      Object.values(weights).forEach(weight => {
        expect(weight).toBeGreaterThan(0);
        expect(weight).toBeLessThan(1);
      });

      mockAnalyzeMetricImpact.mockRestore();
    });

    it('should update last analysis date after calculating weights', async () => {
      const mockAnalyzeMetricImpact = vi.spyOn(analyzer, 'analyzeMetricImpact');
      mockAnalyzeMetricImpact.mockResolvedValue({
        metric: 'test',
        correlationWithWins: 0.5,
        correlationWithPointDifferential: 0.5,
        predictivePower: 0.5,
        sampleSize: 25,
        confidenceLevel: 0.80
      });

      const beforeDate = new Date();
      await analyzer.calculateOptimalWeights(2024);
      const afterDate = analyzer.getLastAnalysisDate();

      expect(afterDate).not.toBeNull();
      expect(afterDate!.getTime()).toBeGreaterThanOrEqual(beforeDate.getTime());

      mockAnalyzeMetricImpact.mockRestore();
    });
  });

  describe('validatePredictionAccuracy', () => {
    it('should calculate prediction accuracy metrics', async () => {
      const mockPredictions = [
        {
          gameId: 1,
          predictedWinner: 1,
          confidence: 0.75,
          expectedScore: { home: 28, away: 21 }
        },
        {
          gameId: 2,
          predictedWinner: 4,
          confidence: 0.60,
          expectedScore: { home: 14, away: 24 }
        },
        {
          gameId: 3,
          predictedWinner: 1,
          confidence: 0.85,
          expectedScore: { home: 35, away: 17 }
        }
      ];

      const mockActualResults = [
        { gameId: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 28, awayScore: 21 },
        { gameId: 2, homeTeamId: 3, awayTeamId: 4, homeScore: 14, awayScore: 35 },
        { gameId: 3, homeTeamId: 1, awayTeamId: 3, homeScore: 42, awayScore: 17 }
      ];

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockActualResults)
        })
      });

      const metrics = await analyzer.validatePredictionAccuracy(mockPredictions, 2024);

      expect(metrics).toEqual({
        totalPredictions: 3,
        correctPredictions: expect.any(Number),
        accuracy: expect.any(Number),
        averageConfidenceError: expect.any(Number),
        calibrationScore: expect.any(Number),
        meanAbsoluteError: expect.any(Number),
        rootMeanSquareError: expect.any(Number)
      });

      expect(metrics.accuracy).toBeGreaterThanOrEqual(0);
      expect(metrics.accuracy).toBeLessThanOrEqual(1);
      expect(metrics.correctPredictions).toBeLessThanOrEqual(metrics.totalPredictions);
    });

    it('should throw error with no valid predictions', async () => {
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([])
        })
      });

      await expect(
        analyzer.validatePredictionAccuracy([], 2024)
      ).rejects.toThrow('No valid predictions found for accuracy analysis');
    });
  });

  describe('Weight Management', () => {
    it('should update weights manually', () => {
      const newWeights: Partial<StatisticalImpactWeights> = {
        passingOffense: 0.35,
        scoringEfficiency: 0.40
      };

      analyzer.updateWeights(newWeights);
      const currentWeights = analyzer.getCurrentWeightsSync();

      expect(currentWeights.passingOffense).toBe(0.35);
      expect(currentWeights.scoringEfficiency).toBe(0.40);
      expect(currentWeights.rushingOffense).toBe(0.20); // Should remain unchanged
    });

    it('should update last analysis date when manually updating weights', () => {
      const beforeDate = new Date();
      analyzer.updateWeights({ passingOffense: 0.30 });
      const afterDate = analyzer.getLastAnalysisDate();

      expect(afterDate).not.toBeNull();
      expect(afterDate!.getTime()).toBeGreaterThanOrEqual(beforeDate.getTime());
    });

    it('should return copy of weights to prevent external modification', () => {
      const weights1 = analyzer.getCurrentWeightsSync();
      const weights2 = analyzer.getCurrentWeightsSync();

      weights1.passingOffense = 0.99;
      expect(weights2.passingOffense).not.toBe(0.99);
      expect(analyzer.getCurrentWeightsSync().passingOffense).not.toBe(0.99);
    });

    it('should throw error when updating with invalid weights', () => {
      expect(() => {
        analyzer.updateWeights({ passingOffense: -0.5 });
      }).toThrow('Invalid weight update: negative values are not allowed');
    });

    it('should warn when updating with weights exceeding expected range', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      analyzer.updateWeights({ passingOffense: 2.5 });
      
      expect(consoleSpy).toHaveBeenCalledWith('Warning: Some updated weights exceed expected range (>2.0)');
      consoleSpy.mockRestore();
    });
  });

  describe('Correlation Calculations', () => {
    it('should handle edge cases in correlation calculations', async () => {
      // Test with minimal data
      const mockGames = [
        { gameId: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 21, awayScore: 21 } // Tie game
      ];

      const mockEfficiencyRatings = [
        {
          teamId: 1,
          season: 2024,
          passingOffenseEfficiency: 0,
          gamesPlayed: 5,
          confidenceLevel: 'Medium',
          lastCalculated: new Date()
        },
        {
          teamId: 2,
          season: 2024,
          passingOffenseEfficiency: 0,
          gamesPlayed: 5,
          confidenceLevel: 'Medium',
          lastCalculated: new Date()
        }
      ];

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockGames)
        })
      });

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockEfficiencyRatings)
        })
      });

      // Should handle minimal data gracefully
      await expect(
        analyzer.analyzeMetricImpact('passingOffenseEfficiency', 2024)
      ).rejects.toThrow('Insufficient data for analysis');
    });
  });

  describe('Confidence Level Calculation', () => {
    it('should calculate appropriate confidence levels based on sample size', () => {
      // Access private method through type assertion for testing
      const calculateConfidenceLevel = (analyzer as any).calculateConfidenceLevel.bind(analyzer);

      expect(calculateConfidenceLevel(150)).toBe(0.95);
      expect(calculateConfidenceLevel(75)).toBe(0.90);
      expect(calculateConfidenceLevel(30)).toBe(0.80);
      expect(calculateConfidenceLevel(15)).toBe(0.70);
      expect(calculateConfidenceLevel(5)).toBe(0.60);
    });
  });

  describe('Regression Analysis', () => {
    beforeEach(() => {
      // Mock the getRegressionDataPoints method directly for regression tests
      const mockDataPoints = [];
      for (let i = 1; i <= 100; i++) {
        mockDataPoints.push({
          gameId: i,
          teamId: (i % 4) + 1,
          opponentId: ((i + 1) % 4) + 1,
          actualPointsScored: 20 + (i % 30),
          actualPassingYards: 200 + (i % 100),
          actualRushingYards: 100 + (i % 80),
          scoringEfficiency: 5 + (i % 10),
          passingEfficiency: 10 + (i % 15),
          rushingEfficiency: 8 + (i % 12),
          turnoverEfficiency: 2 + (i % 5),
          opponentPointsBaseline: 18 + (i % 8),
          opponentPassingBaseline: 180 + (i % 60),
          opponentRushingBaseline: 90 + (i % 40)
        });
      }

      // Mock the getRegressionDataPoints method
      vi.spyOn(analyzer as any, 'getRegressionDataPoints').mockResolvedValue(mockDataPoints);
    });

    it('should perform regression analysis with sufficient data', async () => {
      const analysis = await analyzer.performRegressionAnalysis(2024);

      expect(analysis).toBeDefined();
      expect(analysis.regressionResults).toBeInstanceOf(Array);
      expect(analysis.regressionResults.length).toBeGreaterThan(0);
      expect(analysis.overallModelRSquared).toBeGreaterThanOrEqual(0);
      expect(analysis.overallModelRSquared).toBeLessThanOrEqual(1);
      expect(analysis.sampleSize).toBeGreaterThanOrEqual(30);
      expect(analysis.recommendedWeights).toBeDefined();
      expect(analysis.modelValidation).toBeDefined();
    });

    it('should throw error with insufficient data for regression', async () => {
      // Mock insufficient data by overriding the mock from beforeEach
      vi.spyOn(analyzer as any, 'getRegressionDataPoints').mockResolvedValue([]);

      await expect(
        analyzer.performRegressionAnalysis(2024)
      ).rejects.toThrow('Insufficient data for regression analysis');
    });

    it('should calculate regression results with proper statistical metrics', async () => {
      const analysis = await analyzer.performRegressionAnalysis(2024);

      for (const result of analysis.regressionResults) {
        expect(result.metric).toBeDefined();
        expect(typeof result.coefficient).toBe('number');
        expect(typeof result.rSquared).toBe('number');
        expect(typeof result.pValue).toBe('number');
        expect(result.confidenceInterval).toHaveLength(2);
        expect(typeof result.weight).toBe('number');
        expect(typeof result.isStatisticallySignificant).toBe('boolean');
        
        // Validate ranges
        expect(result.rSquared).toBeGreaterThanOrEqual(0);
        expect(result.rSquared).toBeLessThanOrEqual(1);
        expect(result.pValue).toBeGreaterThanOrEqual(0);
        expect(result.pValue).toBeLessThanOrEqual(1);
        expect(result.weight).toBeGreaterThanOrEqual(0);
      }
    });

    it('should update weights based on regression analysis', async () => {
      const analysis = await analyzer.performRegressionAnalysis(2024);
      const originalWeights = analyzer.getCurrentWeightsSync();
      
      analyzer.updateWeightsFromRegressionSync(analysis);
      const updatedWeights = analyzer.getCurrentWeightsSync();

      // Weights should have changed
      expect(updatedWeights).not.toEqual(originalWeights);
      
      // All weights should be valid numbers
      Object.values(updatedWeights).forEach(weight => {
        expect(typeof weight).toBe('number');
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThan(2);
      });
    });

    it('should validate regression model and provide diagnostics', async () => {
      const analysis = await analyzer.performRegressionAnalysis(2024);
      const validation = analyzer.validateRegressionModel(analysis);

      expect(validation).toBeDefined();
      expect(typeof validation.isValid).toBe('boolean');
      expect(validation.warnings).toBeInstanceOf(Array);
      expect(validation.recommendations).toBeInstanceOf(Array);
    });

    it('should calculate prediction confidence intervals', async () => {
      const analysis = await analyzer.performRegressionAnalysis(2024);
      const predictedScore = 28;
      
      const confidenceInterval = analyzer.calculatePredictionConfidenceInterval(
        predictedScore,
        analysis.regressionResults,
        0.95
      );

      expect(confidenceInterval).toHaveLength(2);
      expect(confidenceInterval[0]).toBeLessThanOrEqual(predictedScore);
      expect(confidenceInterval[1]).toBeGreaterThanOrEqual(predictedScore);
      expect(confidenceInterval[0]).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Linear Regression Mathematics', () => {
    it('should calculate linear regression correctly', () => {
      const calculateLinearRegression = (analyzer as any).calculateLinearRegression.bind(analyzer);
      
      // Simple test data with known correlation
      const X = [1, 2, 3, 4, 5];
      const Y = [2, 4, 6, 8, 10]; // Perfect positive correlation
      
      const result = calculateLinearRegression(X, Y);
      
      expect(result.slope).toBeCloseTo(2, 1);
      expect(result.intercept).toBeCloseTo(0, 1);
      expect(result.rSquared).toBeCloseTo(1, 1);
    });

    it('should calculate R² correctly', () => {
      const calculateRSquared = (analyzer as any).calculateRSquared.bind(analyzer);
      
      const actual = [10, 20, 30, 40, 50];
      const predicted = [12, 18, 32, 38, 52]; // Close predictions
      
      const rSquared = calculateRSquared(actual, predicted);
      
      expect(rSquared).toBeGreaterThan(0.8);
      expect(rSquared).toBeLessThanOrEqual(1);
    });

    it('should handle edge cases in regression calculations', () => {
      const calculateLinearRegression = (analyzer as any).calculateLinearRegression.bind(analyzer);
      
      // Test with no variance in X
      expect(() => {
        calculateLinearRegression([5, 5, 5, 5], [1, 2, 3, 4]);
      }).toThrow('Cannot perform regression: no variance in X values');
      
      // Test with empty data
      expect(() => {
        calculateLinearRegression([], []);
      }).toThrow('No data points for regression');
    });
  });

  describe('Statistical Significance Testing', () => {
    it('should calculate p-values appropriately', () => {
      const calculatePValue = (analyzer as any).calculatePValue.bind(analyzer);
      
      const mockRegression = {
        slope: 2.5,
        residualSumSquares: 10
      };
      
      const pValue = calculatePValue(mockRegression, 50);
      
      expect(typeof pValue).toBe('number');
      expect(pValue).toBeGreaterThanOrEqual(0);
      expect(pValue).toBeLessThanOrEqual(1);
    });

    it('should calculate confidence intervals', () => {
      const calculateConfidenceInterval = (analyzer as any).calculateConfidenceInterval.bind(analyzer);
      
      const mockRegression = {
        slope: 1.5,
        residualSumSquares: 5
      };
      
      const interval = calculateConfidenceInterval(mockRegression, 30);
      
      expect(interval).toHaveLength(2);
      expect(interval[0]).toBeLessThanOrEqual(interval[1]);
    });
  });

  describe('Weight Calculation Based on Statistical Significance', () => {
    it('should assign higher weights to statistically significant metrics', () => {
      const calculateMetricWeight = (analyzer as any).calculateMetricWeight.bind(analyzer);
      
      // Significant metric with high R²
      const significantWeight = calculateMetricWeight(0.7, 0.01, true);
      
      // Non-significant metric
      const nonSignificantWeight = calculateMetricWeight(0.3, 0.15, false);
      
      expect(significantWeight).toBeGreaterThan(nonSignificantWeight);
      expect(significantWeight).toBeLessThanOrEqual(0.5);
      expect(nonSignificantWeight).toBeGreaterThanOrEqual(0.05);
    });



    it('should calculate regression-based weights correctly', () => {
      // Test the weight calculation logic directly
      const mockResults: RegressionAnalysisResult[] = [
        {
          metric: 'scoringEfficiency',
          coefficient: 1.5,
          rSquared: 0.7,
          pValue: 0.01,
          confidenceInterval: [1.0, 2.0],
          weight: 0.35,
          isStatisticallySignificant: true
        },
        {
          metric: 'passingEfficiency',
          coefficient: 0.8,
          rSquared: 0.4,
          pValue: 0.03,
          confidenceInterval: [0.5, 1.1],
          weight: 0.2,
          isStatisticallySignificant: true
        },
        {
          metric: 'rushingEfficiency',
          coefficient: 0.3,
          rSquared: 0.15,
          pValue: 0.15,
          confidenceInterval: [0.1, 0.5],
          weight: 0.075,
          isStatisticallySignificant: false
        }
      ];

      const calculateRegressionBasedWeights = (analyzer as any).calculateRegressionBasedWeights.bind(analyzer);
      const weights = calculateRegressionBasedWeights(mockResults);

      expect(weights).toBeDefined();
      expect(typeof weights.scoring).toBe('number');
      expect(typeof weights.passingYards).toBe('number');
      expect(typeof weights.rushingYards).toBe('number');
      
      // Check that weights sum to 1.0
      const totalWeight = (Object.values(weights) as number[]).reduce((sum, w) => sum + w, 0);
      expect(totalWeight).toBeCloseTo(1.0, 2);
      
      // Significant metrics should have higher weights than non-significant ones
      expect(weights.scoring).toBeGreaterThan(weights.rushingYards);
    });
  });
});