// server/services/__tests__/predictionBoundaryValidator.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PredictionBoundaryValidator } from '../predictionBoundaryValidator.js';
import { AdvancedTeamEfficiencyProfile } from '../deprecated/recursiveEfficiencyEngine.js';

// Mock the database
vi.mock('../../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([]))
        }))
      }))
    }))
  }
}));

describe('PredictionBoundaryValidator', () => {
  let validator: PredictionBoundaryValidator;
  let mockHomeProfile: AdvancedTeamEfficiencyProfile;
  let mockAwayProfile: AdvancedTeamEfficiencyProfile;

  beforeEach(() => {
    validator = new PredictionBoundaryValidator();
    
    // Create mock team profiles
    mockHomeProfile = {
      teamId: 1,
      season: 2024,
      totalOffenseEfficiency: 0.15,
      passingOffenseEfficiency: 0.12,
      rushingOffenseEfficiency: 0.18,
      scoringOffenseEfficiency: 0.20,
      totalDefenseEfficiency: 0.10,
      passingDefenseEfficiency: 0.08,
      rushingDefenseEfficiency: 0.12,
      scoringDefenseEfficiency: 0.15,
      interceptionEfficiency: 0.05,
      interceptionDefenseEfficiency: 0.10,
      sackOffenseEfficiency: 0.08,
      sackDefenseEfficiency: 0.12,
      fieldGoalEfficiency: 0.10,
      gamesPlayed: 8,
      convergenceScore: 0.85,
      confidenceLevel: 'High',
      lastCalculated: new Date()
    };

    mockAwayProfile = {
      teamId: 2,
      season: 2024,
      totalOffenseEfficiency: -0.05,
      passingOffenseEfficiency: -0.08,
      rushingOffenseEfficiency: -0.02,
      scoringOffenseEfficiency: -0.10,
      totalDefenseEfficiency: -0.12,
      passingDefenseEfficiency: -0.15,
      rushingDefenseEfficiency: -0.08,
      scoringDefenseEfficiency: -0.18,
      interceptionEfficiency: -0.08,
      interceptionDefenseEfficiency: -0.05,
      sackOffenseEfficiency: -0.10,
      sackDefenseEfficiency: -0.15,
      fieldGoalEfficiency: -0.05,
      gamesPlayed: 7,
      convergenceScore: 0.75,
      confidenceLevel: 'Medium',
      lastCalculated: new Date()
    };
  });

  describe('validateGamePrediction', () => {
    it('should validate normal predictions without adjustments', async () => {
      const predictions = {
        homeTeamScore: 32,
        awayTeamScore: 24,
        homeTeamStats: {
          totalYards: 420,
          passingYards: 260,
          rushingYards: 160,
          turnovers: 1,
          sacks: 2,
          fieldGoals: 2
        },
        awayTeamStats: {
          totalYards: 380,
          passingYards: 240,
          rushingYards: 140,
          turnovers: 1,
          sacks: 2,
          fieldGoals: 1
        }
      };

      const result = await validator.validateGamePrediction(
        1, 2, 2024, predictions, mockHomeProfile, mockAwayProfile
      );

      expect(result).toBeDefined();
      expect(result.homeTeamScore).toBeDefined();
      expect(result.awayTeamScore).toBeDefined();
      expect(result.homeTeamStats).toBeDefined();
      expect(result.awayTeamStats).toBeDefined();
      expect(result.overallConfidenceReduction).toBeGreaterThanOrEqual(0);
      expect(result.validationFlags).toBeDefined();
    });

    it('should handle extreme circumstances for low scores', async () => {
      // Create profile with extreme weaknesses
      const extremeProfile = {
        ...mockHomeProfile,
        totalOffenseEfficiency: -0.85, // Extreme weakness
        scoringOffenseEfficiency: -0.90,
        confidenceLevel: 'High' as const
      };

      const predictions = {
        homeTeamScore: 10, // Below normal threshold but extreme circumstances
        awayTeamScore: 35,
        homeTeamStats: {
          totalYards: 150,
          passingYards: 80,
          rushingYards: 70,
          turnovers: 4,
          sacks: 6,
          fieldGoals: 0
        },
        awayTeamStats: {
          totalYards: 500,
          passingYards: 300,
          rushingYards: 200,
          turnovers: 0,
          sacks: 1,
          fieldGoals: 2
        }
      };

      const result = await validator.validateGamePrediction(
        1, 2, 2024, predictions, extremeProfile, mockAwayProfile
      );

      expect(result.homeTeamScore.isAdjusted).toBe(true);
      expect(result.homeTeamScore.adjustmentReason).toContain('Extreme circumstances');
      expect(result.homeTeamScore.confidenceReduction).toBeGreaterThan(0.4);
    });

    it('should apply regression to mean for extremely high scores', async () => {
      const predictions = {
        homeTeamScore: 70, // Extremely high score
        awayTeamScore: 14,
        homeTeamStats: {
          totalYards: 800,
          passingYards: 500,
          rushingYards: 300,
          turnovers: 0,
          sacks: 0,
          fieldGoals: 3
        },
        awayTeamStats: {
          totalYards: 200,
          passingYards: 100,
          rushingYards: 100,
          turnovers: 5,
          sacks: 8,
          fieldGoals: 0
        }
      };

      const result = await validator.validateGamePrediction(
        1, 2, 2024, predictions, mockHomeProfile, mockAwayProfile
      );

      expect(result.homeTeamScore.isAdjusted).toBe(true);
      expect(result.homeTeamScore.adjustedValue).toBeLessThan(70);
      expect(result.homeTeamScore.adjustmentReason).toContain('regression');
    });

    it('should validate statistical predictions against team averages', async () => {
      const predictions = {
        homeTeamScore: 32,
        awayTeamScore: 24,
        homeTeamStats: {
          totalYards: 1200, // Extremely high, should be adjusted
          passingYards: 260,
          rushingYards: 160,
          turnovers: 1,
          sacks: 2,
          fieldGoals: 2
        },
        awayTeamStats: {
          totalYards: 380,
          passingYards: 240,
          rushingYards: 140,
          turnovers: 1,
          sacks: 2,
          fieldGoals: 1
        }
      };

      const result = await validator.validateGamePrediction(
        1, 2, 2024, predictions, mockHomeProfile, mockAwayProfile
      );

      expect(result.homeTeamStats.totalYards.isAdjusted).toBe(true);
      expect(result.homeTeamStats.totalYards.adjustedValue).toBeLessThan(1200);
      expect(result.homeTeamStats.totalYards.adjustmentReason).toMatch(/historical patterns|Excessive deviation/);
    });

    it('should calculate appropriate confidence reductions', async () => {
      const predictions = {
        homeTeamScore: 5, // Very low score requiring adjustment
        awayTeamScore: 80, // Very high score requiring adjustment
        homeTeamStats: {
          totalYards: 100,
          passingYards: 50,
          rushingYards: 50,
          turnovers: 5,
          sacks: 8,
          fieldGoals: 0
        },
        awayTeamStats: {
          totalYards: 800,
          passingYards: 500,
          rushingYards: 300,
          turnovers: 0,
          sacks: 0,
          fieldGoals: 5
        }
      };

      const result = await validator.validateGamePrediction(
        1, 2, 2024, predictions, mockHomeProfile, mockAwayProfile
      );

      expect(result.overallConfidenceReduction).toBeGreaterThan(0.3);
      expect(result.validationFlags.length).toBeGreaterThan(2);
      expect(result.homeTeamScore.confidenceReduction).toBeGreaterThan(0);
      expect(result.awayTeamScore.confidenceReduction).toBeGreaterThan(0);
    });

    it('should handle very low confidence profiles', async () => {
      const lowConfidenceProfile = {
        ...mockHomeProfile,
        confidenceLevel: 'Low' as const,
        convergenceScore: 0.3
      };

      const predictions = {
        homeTeamScore: 10, // Low score
        awayTeamScore: 35,
        homeTeamStats: {
          totalYards: 200,
          passingYards: 120,
          rushingYards: 80,
          turnovers: 3,
          sacks: 5,
          fieldGoals: 1
        },
        awayTeamStats: {
          totalYards: 450,
          passingYards: 280,
          rushingYards: 170,
          turnovers: 1,
          sacks: 1,
          fieldGoals: 2
        }
      };

      const result = await validator.validateGamePrediction(
        1, 2, 2024, predictions, lowConfidenceProfile, mockAwayProfile
      );

      // Low confidence should allow more extreme predictions
      expect(result.homeTeamScore.adjustmentReason).toContain('Extreme circumstances');
    });
  });
});