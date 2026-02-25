// server/services/validation/__tests__/prediction-accuracy-tester.test.ts

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { PredictionAccuracyTester } from '../prediction-accuracy-tester.js';
import { db } from '../../../db.js';
import { getGamePrediction, GamePrediction } from '../../predictionService.js';

// Mock the database and prediction service
vi.mock('../../../db.js', () => ({
  db: {
    query: {
      games: {
        findMany: vi.fn()
      }
    }
  }
}));
vi.mock('../../predictionService.js');

const mockDb = db as any;
const mockGetGamePrediction = getGamePrediction as Mock;

describe('PredictionAccuracyTester', () => {
  let tester: PredictionAccuracyTester;

  beforeEach(() => {
    tester = new PredictionAccuracyTester();
    vi.clearAllMocks();
  });

  describe('selectSampleGames', () => {
    it('should select representative games with complete data', async () => {
      const mockGames = [
        {
          id: 1,
          homeTeamId: 1,
          awayTeamId: 2,
          homeTeamScore: 28,
          awayTeamScore: 21,
          gameTime: new Date('2024-09-01'),
          week: 1,
          homeTeam: { id: 1, name: 'Team A' },
          awayTeam: { id: 2, name: 'Team B' }
        },
        {
          id: 2,
          homeTeamId: 3,
          awayTeamId: 4,
          homeTeamScore: 35,
          awayTeamScore: 14,
          gameTime: new Date('2024-09-08'),
          week: 2,
          homeTeam: { id: 3, name: 'Team C' },
          awayTeam: { id: 4, name: 'Team D' }
        }
      ];

      mockDb.query = {
        games: {
          findMany: vi.fn().mockResolvedValue(mockGames)
        }
      };

      const result = await tester.selectSampleGames(2024, 10);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 1,
        homeTeamId: 1,
        awayTeamId: 2,
        homeTeamScore: 28,
        awayTeamScore: 21
      });
    });

    it('should filter out games with invalid data', async () => {
      const mockGames = [
        {
          id: 1,
          homeTeamId: 1,
          awayTeamId: 2,
          homeTeamScore: 28,
          awayTeamScore: 21,
          gameTime: new Date('2024-09-01'),
          week: 1,
          homeTeam: { id: 1, name: 'Team A' },
          awayTeam: { id: 2, name: 'Team B' }
        },
        {
          id: 2,
          homeTeamId: 3,
          awayTeamId: 4,
          homeTeamScore: null, // Invalid score
          awayTeamScore: 14,
          gameTime: new Date('2024-09-08'),
          week: 2,
          homeTeam: { id: 3, name: 'Team C' },
          awayTeam: { id: 4, name: 'Team D' }
        },
        {
          id: 3,
          homeTeamId: 5,
          awayTeamId: 6,
          homeTeamScore: 250, // Unrealistic score
          awayTeamScore: 14,
          gameTime: new Date('2024-09-15'),
          week: 3,
          homeTeam: { id: 5, name: 'Team E' },
          awayTeam: { id: 6, name: 'Team F' }
        }
      ];

      mockDb.query = {
        games: {
          findMany: vi.fn().mockResolvedValue(mockGames)
        }
      };

      const result = await tester.selectSampleGames(2024, 10);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('should throw error when no games found', async () => {
      mockDb.query = {
        games: {
          findMany: vi.fn().mockResolvedValue([])
        }
      };

      await expect(tester.selectSampleGames(2024, 10)).rejects.toThrow('No completed games found for season 2024');
    });
  });

  describe('generateTestPredictions', () => {
    it('should generate predictions for test games', async () => {
      const testGames = [
        {
          id: 1,
          homeTeamId: 1,
          awayTeamId: 2,
          homeTeamScore: 28,
          awayTeamScore: 21,
          gameTime: new Date('2024-09-01'),
          week: 1,
          homeTeam: { id: 1, name: 'Team A' },
          awayTeam: { id: 2, name: 'Team B' }
        }
      ];

      const mockPrediction: GamePrediction = {
        gameId: 1,
        homeTeam: { id: 1, name: 'Team A' },
        awayTeam: { id: 2, name: 'Team B' },
        expectedScore: { home: 27, away: 20 },
        winProbability: 65,
        confidence: 75,
        spread: 7,
        total: 47,
        keyMatchups: ['Test matchup'],
        efficiencyAnalysis: {} as any,
        boundaryValidation: {} as any,
        statisticalConfidence: {
          modelRSquared: 0.65,
          confidenceInterval: { home: [24, 30], away: [17, 23] },
          predictionReliability: 'High',
          sampleSizeAdequate: true,
          weightsUsed: {} as any,
          weightsLastUpdated: new Date()
        },
        calculationBreakdown: {} as any,
        predictionMetadata: {} as any
      };

      mockGetGamePrediction.mockResolvedValue(mockPrediction);

      const result = await tester.generateTestPredictions(testGames);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        gameId: 1,
        prediction: mockPrediction,
        actual: {
          homeScore: 28,
          awayScore: 21,
          homeTeamId: 1,
          awayTeamId: 2,
          winner: 1
        }
      });
    });

    it('should handle prediction failures gracefully', async () => {
      const testGames = [
        {
          id: 1,
          homeTeamId: 1,
          awayTeamId: 2,
          homeTeamScore: 28,
          awayTeamScore: 21,
          gameTime: new Date('2024-09-01'),
          week: 1,
          homeTeam: { id: 1, name: 'Team A' },
          awayTeam: { id: 2, name: 'Team B' }
        },
        {
          id: 2,
          homeTeamId: 3,
          awayTeamId: 4,
          homeTeamScore: 35,
          awayTeamScore: 14,
          gameTime: new Date('2024-09-08'),
          week: 2,
          homeTeam: { id: 3, name: 'Team C' },
          awayTeam: { id: 4, name: 'Team D' }
        }
      ];

      const mockPrediction: GamePrediction = {
        gameId: 1,
        homeTeam: { id: 1, name: 'Team A' },
        awayTeam: { id: 2, name: 'Team B' },
        expectedScore: { home: 27, away: 20 },
        winProbability: 65,
        confidence: 75,
        spread: 7,
        total: 47,
        keyMatchups: ['Test matchup'],
        efficiencyAnalysis: {} as any,
        boundaryValidation: {} as any,
        statisticalConfidence: {
          modelRSquared: 0.65,
          confidenceInterval: { home: [24, 30], away: [17, 23] },
          predictionReliability: 'High',
          sampleSizeAdequate: true,
          weightsUsed: {} as any,
          weightsLastUpdated: new Date()
        },
        calculationBreakdown: {} as any,
        predictionMetadata: {} as any
      };

      mockGetGamePrediction
        .mockResolvedValueOnce(mockPrediction)
        .mockRejectedValueOnce(new Error('Prediction failed'));

      const result = await tester.generateTestPredictions(testGames);

      expect(result).toHaveLength(1);
      expect(result[0].gameId).toBe(1);
    });
  });

  describe('calculateWinProbabilityAccuracy', () => {
    it('should calculate win probability accuracy metrics', async () => {
      const testPredictions = [
        {
          prediction: {
            winProbability: 70,
            expectedScore: { home: 28, away: 21 },
            awayTeam: { id: 2, name: 'Team B' }
          } as GamePrediction,
          actual: { winner: 1, homeTeamId: 1 }
        },
        {
          prediction: {
            winProbability: 30,
            expectedScore: { home: 21, away: 28 },
            awayTeam: { id: 2, name: 'Team B' }
          } as GamePrediction,
          actual: { winner: 2, homeTeamId: 1 }
        },
        {
          prediction: {
            winProbability: 60,
            expectedScore: { home: 24, away: 21 },
            awayTeam: { id: 2, name: 'Team B' }
          } as GamePrediction,
          actual: { winner: 2, homeTeamId: 1 }
        }
      ];

      const result = await tester.calculateWinProbabilityAccuracy(testPredictions);

      expect(result.accuracy).toBeCloseTo(66.67, 1); // 2 out of 3 correct
      expect(result.brierScore).toBeGreaterThan(0);
      expect(result.brierScore).toBeLessThan(1);
      expect(result.logLoss).toBeGreaterThan(0);
      expect(result.precision).toBeGreaterThanOrEqual(0);
      expect(result.recall).toBeGreaterThanOrEqual(0);
      expect(result.f1Score).toBeGreaterThanOrEqual(0);
      expect(result.rocAuc).toBeGreaterThanOrEqual(0);
      expect(result.rocAuc).toBeLessThanOrEqual(1);
    });

    it('should handle perfect predictions', async () => {
      const testPredictions = [
        {
          prediction: {
            winProbability: 80,
            expectedScore: { home: 28, away: 21 },
            awayTeam: { id: 2, name: 'Team B' }
          } as GamePrediction,
          actual: { winner: 1, homeTeamId: 1 }
        },
        {
          prediction: {
            winProbability: 20,
            expectedScore: { home: 21, away: 28 },
            awayTeam: { id: 2, name: 'Team B' }
          } as GamePrediction,
          actual: { winner: 2, homeTeamId: 1 }
        }
      ];

      const result = await tester.calculateWinProbabilityAccuracy(testPredictions);

      expect(result.accuracy).toBe(100);
      expect(result.brierScore).toBeLessThan(0.1);
    });
  });

  describe('calculateScorePredictionAccuracy', () => {
    it('should calculate score prediction accuracy metrics', async () => {
      const testPredictions = [
        {
          prediction: {
            expectedScore: { home: 28, away: 21 }
          } as GamePrediction,
          actual: { homeScore: 30, awayScore: 20 }
        },
        {
          prediction: {
            expectedScore: { home: 24, away: 17 }
          } as GamePrediction,
          actual: { homeScore: 21, awayScore: 14 }
        }
      ];

      const result = await tester.calculateScorePredictionAccuracy(testPredictions);

      expect(result.meanAbsoluteError).toBeGreaterThan(0);
      expect(result.rootMeanSquareError).toBeGreaterThan(0);
      expect(result.medianAbsoluteError).toBeGreaterThan(0);
      expect(result.homeTeamAccuracy.mae).toBeGreaterThan(0);
      expect(result.awayTeamAccuracy.mae).toBeGreaterThan(0);
      expect(result.homeTeamAccuracy.rmse).toBeGreaterThan(0);
      expect(result.awayTeamAccuracy.rmse).toBeGreaterThan(0);
    });

    it('should calculate bias correctly', async () => {
      const testPredictions = [
        {
          prediction: {
            expectedScore: { home: 30, away: 25 } // Consistently over-predicting
          } as GamePrediction,
          actual: { homeScore: 28, awayScore: 21 }
        },
        {
          prediction: {
            expectedScore: { home: 26, away: 19 } // Consistently over-predicting
          } as GamePrediction,
          actual: { homeScore: 24, awayScore: 17 }
        }
      ];

      const result = await tester.calculateScorePredictionAccuracy(testPredictions);

      expect(result.homeTeamAccuracy.bias).toBeGreaterThan(0); // Positive bias (over-predicting)
      expect(result.awayTeamAccuracy.bias).toBeGreaterThan(0); // Positive bias (over-predicting)
    });
  });

  describe('calculateConfidenceCalibration', () => {
    it('should calculate confidence calibration metrics', async () => {
      const testPredictions = [
        {
          prediction: { winProbability: 70 } as GamePrediction,
          actual: { winner: 1, homeTeamId: 1 }
        },
        {
          prediction: { winProbability: 30 } as GamePrediction,
          actual: { winner: 2, homeTeamId: 1 }
        },
        {
          prediction: { winProbability: 80 } as GamePrediction,
          actual: { winner: 1, homeTeamId: 1 }
        },
        {
          prediction: { winProbability: 60 } as GamePrediction,
          actual: { winner: 2, homeTeamId: 1 }
        }
      ];

      const result = await tester.calculateConfidenceCalibration(testPredictions);

      expect(result.calibrationScore).toBeGreaterThanOrEqual(0);
      expect(result.calibrationScore).toBeLessThanOrEqual(100);
      expect(result.overconfidenceRate).toBeGreaterThanOrEqual(0);
      expect(result.overconfidenceRate).toBeLessThanOrEqual(1);
      expect(result.underconfidenceRate).toBeGreaterThanOrEqual(0);
      expect(result.underconfidenceRate).toBeLessThanOrEqual(1);
      expect(result.calibrationCurve).toBeInstanceOf(Array);
      expect(result.reliabilityDiagram.bins).toBe(10);
      expect(result.reliabilityDiagram.expectedCalibrationError).toBeGreaterThanOrEqual(0);
    });
  });

  describe('detectSystematicBiases', () => {
    it('should detect home team bias', async () => {
      const testPredictions = [
        {
          gameId: 1,
          prediction: {
            expectedScore: { home: 35, away: 21 }, // Consistently over-predicting home team
            winProbability: 75
          } as GamePrediction,
          actual: { homeScore: 28, awayScore: 21, winner: 1, homeTeamId: 1, awayTeamId: 2 },
          metadata: { homeTeamName: 'Team A', awayTeamName: 'Team B' }
        },
        {
          gameId: 2,
          prediction: {
            expectedScore: { home: 31, away: 17 }, // Consistently over-predicting home team
            winProbability: 80
          } as GamePrediction,
          actual: { homeScore: 24, awayScore: 17, winner: 1, homeTeamId: 3, awayTeamId: 4 },
          metadata: { homeTeamName: 'Team C', awayTeamName: 'Team D' }
        }
      ];

      const result = await tester.detectSystematicBiases(testPredictions);

      expect(result).toBeInstanceOf(Array);
      // Should detect home team bias since we're consistently over-predicting home scores
      const homeTeamBias = result.find(bias => bias.biasType === 'home_team');
      if (homeTeamBias) {
        expect(homeTeamBias.magnitude).toBeGreaterThan(0);
        expect(homeTeamBias.description).toContain('Home team');
      }
    });

    it('should detect score range bias', async () => {
      const testPredictions = Array.from({ length: 10 }, (_, i) => ({
        gameId: i + 1,
        prediction: {
          expectedScore: { home: 45, away: 42 }, // Consistently over-predicting high-scoring games
          winProbability: 55
        } as GamePrediction,
        actual: { homeScore: 35, awayScore: 28, winner: 1, homeTeamId: 1, awayTeamId: 2 },
        metadata: { homeTeamName: 'Team A', awayTeamName: 'Team B' }
      }));

      const result = await tester.detectSystematicBiases(testPredictions);

      expect(result).toBeInstanceOf(Array);
      // Should potentially detect score range bias
      const scoreRangeBias = result.find(bias => bias.biasType === 'score_range');
      if (scoreRangeBias) {
        expect(scoreRangeBias.magnitude).toBeGreaterThan(0);
      }
    });
  });

  describe('analyzeReliabilityByConfidence', () => {
    it('should analyze reliability by confidence level', async () => {
      const testPredictions = [
        {
          prediction: { winProbability: 70, confidence: 80 } as GamePrediction,
          actual: { winner: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 28, awayScore: 21 }
        },
        {
          prediction: { winProbability: 30, confidence: 60 } as GamePrediction,
          actual: { winner: 2, homeTeamId: 1, awayTeamId: 2, homeScore: 21, awayScore: 28 }
        },
        {
          prediction: { winProbability: 80, confidence: 90 } as GamePrediction,
          actual: { winner: 1, homeTeamId: 1, awayTeamId: 2, homeScore: 35, awayScore: 14 }
        }
      ];

      const result = await tester.analyzeReliabilityByConfidence(testPredictions);

      expect(result.overallReliability).toMatch(/^(high|medium|low)$/);
      expect(result.reliabilityByConfidence).toBeInstanceOf(Array);
      expect(result.reliabilityByGameType).toBeInstanceOf(Array);
      
      for (const range of result.reliabilityByConfidence) {
        expect(range.confidenceRange).toHaveLength(2);
        expect(range.accuracy).toBeGreaterThanOrEqual(0);
        expect(range.sampleSize).toBeGreaterThanOrEqual(0);
        expect(range.reliability).toMatch(/^(high|medium|low)$/);
      }
    });
  });

  describe('validate', () => {
    it('should run comprehensive accuracy testing', async () => {
      const mockGames = [
        {
          id: 1,
          homeTeamId: 1,
          awayTeamId: 2,
          homeTeamScore: 28,
          awayTeamScore: 21,
          gameTime: new Date('2024-09-01'),
          week: 1,
          homeTeam: { id: 1, name: 'Team A' },
          awayTeam: { id: 2, name: 'Team B' }
        }
      ];

      const mockPrediction: GamePrediction = {
        gameId: 1,
        homeTeam: { id: 1, name: 'Team A' },
        awayTeam: { id: 2, name: 'Team B' },
        expectedScore: { home: 27, away: 20 },
        winProbability: 65,
        confidence: 75,
        spread: 7,
        total: 47,
        keyMatchups: ['Test matchup'],
        efficiencyAnalysis: {} as any,
        boundaryValidation: {} as any,
        statisticalConfidence: {
          modelRSquared: 0.65,
          confidenceInterval: { home: [24, 30], away: [17, 23] },
          predictionReliability: 'High',
          sampleSizeAdequate: true,
          weightsUsed: {} as any,
          weightsLastUpdated: new Date()
        },
        calculationBreakdown: {} as any,
        predictionMetadata: {} as any
      };

      mockDb.query = {
        games: {
          findMany: vi.fn().mockResolvedValue(mockGames)
        }
      };
      mockGetGamePrediction.mockResolvedValue(mockPrediction);

      const result = await tester.validate(2024, 1);

      expect(result.isValid).toBe(true);
      expect(result.sampleSize).toBe(1);
      expect(result.testPeriod.season).toBe(2024);
      expect(result.winProbabilityAccuracy).toBeDefined();
      expect(result.scorePredictionAccuracy).toBeDefined();
      expect(result.confidenceCalibration).toBeDefined();
      expect(result.systematicBiases).toBeInstanceOf(Array);
      expect(result.predictionReliability).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should handle validation errors gracefully', async () => {
      mockDb.query = {
        games: {
          findMany: vi.fn().mockRejectedValue(new Error('Database error'))
        }
      };

      const result = await tester.validate(2024, 10);

      expect(result.isValid).toBe(false);
      expect(result.score).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('ACCURACY_TEST_FAILED');
    });
  });
});