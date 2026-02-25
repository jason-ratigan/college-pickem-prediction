// server/services/__tests__/additiveEfficiencyInteractionModel.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdditiveEfficiencyInteractionModel } from '../additiveEfficiencyInteractionModel.js';
import { AdvancedTeamEfficiencyProfile } from '../deprecated/recursiveEfficiencyEngine.js';

// Mock the RegressionBasedWeightManager
vi.mock('../regressionBasedWeightManager.js', () => ({
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
    }),
    getLatestRegressionAnalysis: vi.fn().mockResolvedValue({
      overallModelRSquared: 0.75,
      regressionResults: []
    })
  }))
}));

describe('AdditiveEfficiencyInteractionModel', () => {
  let model: AdditiveEfficiencyInteractionModel;
  let strongOffenseProfile: AdvancedTeamEfficiencyProfile;
  let strongDefenseProfile: AdvancedTeamEfficiencyProfile;
  let averageProfile: AdvancedTeamEfficiencyProfile;

  beforeEach(() => {
    model = new AdditiveEfficiencyInteractionModel();

    // Strong offensive team profile
    strongOffenseProfile = {
      teamId: 1,
      season: 2024,
      totalOffenseEfficiency: 0.25,      // 25% above average
      passingOffenseEfficiency: 0.30,    // 30% above average
      rushingOffenseEfficiency: 0.20,    // 20% above average
      scoringOffenseEfficiency: 0.35,    // 35% above average
      totalDefenseEfficiency: -0.05,     // 5% below average defense
      passingDefenseEfficiency: -0.10,   // 10% below average defense
      rushingDefenseEfficiency: 0.00,    // Average defense
      scoringDefenseEfficiency: -0.15,   // 15% below average defense
      interceptionEfficiency: 0.10,      // 10% fewer interceptions thrown
      interceptionDefenseEfficiency: 0.15, // 15% more interceptions caught
      sackOffenseEfficiency: 0.05,       // 5% fewer sacks allowed
      sackDefenseEfficiency: 0.20,       // 20% more sacks made
      fieldGoalEfficiency: 0.15,         // 15% better field goal percentage
      gamesPlayed: 8,
      convergenceScore: 0.85,
      confidenceLevel: 'High',
      lastCalculated: new Date()
    };

    // Strong defensive team profile
    strongDefenseProfile = {
      teamId: 2,
      season: 2024,
      totalOffenseEfficiency: -0.10,     // 10% below average offense
      passingOffenseEfficiency: -0.15,   // 15% below average offense
      rushingOffenseEfficiency: -0.05,   // 5% below average offense
      scoringOffenseEfficiency: -0.20,   // 20% below average offense
      totalDefenseEfficiency: 0.30,      // 30% above average defense
      passingDefenseEfficiency: 0.35,    // 35% above average defense
      rushingDefenseEfficiency: 0.25,    // 25% above average defense
      scoringDefenseEfficiency: 0.40,    // 40% above average defense
      interceptionEfficiency: -0.05,     // 5% more interceptions thrown
      interceptionDefenseEfficiency: 0.25, // 25% more interceptions caught
      sackOffenseEfficiency: -0.10,      // 10% more sacks allowed
      sackDefenseEfficiency: 0.30,       // 30% more sacks made
      fieldGoalEfficiency: -0.05,        // 5% worse field goal percentage
      gamesPlayed: 9,
      convergenceScore: 0.90,
      confidenceLevel: 'High',
      lastCalculated: new Date()
    };

    // Average team profile
    averageProfile = {
      teamId: 3,
      season: 2024,
      totalOffenseEfficiency: 0.00,
      passingOffenseEfficiency: 0.00,
      rushingOffenseEfficiency: 0.00,
      scoringOffenseEfficiency: 0.00,
      totalDefenseEfficiency: 0.00,
      passingDefenseEfficiency: 0.00,
      rushingDefenseEfficiency: 0.00,
      scoringDefenseEfficiency: 0.00,
      interceptionEfficiency: 0.00,
      interceptionDefenseEfficiency: 0.00,
      sackOffenseEfficiency: 0.00,
      sackDefenseEfficiency: 0.00,
      fieldGoalEfficiency: 0.00,
      gamesPlayed: 6,
      convergenceScore: 0.70,
      confidenceLevel: 'Medium',
      lastCalculated: new Date()
    };
  });

  describe('calculateMatchupAnalysis', () => {
    it('should calculate comprehensive opponent-relative matchup analysis', async () => {
      const analysis = await model.calculateMatchupAnalysis(strongOffenseProfile, strongDefenseProfile);

      expect(analysis.homeTeamId).toBe(1);
      expect(analysis.awayTeamId).toBe(2);
      expect(analysis.season).toBe(2024);
      expect(analysis.confidenceLevel).toBe('High');
      
      // Verify all statistical categories are included for both teams
      expect(analysis.homeTeamPredictions.totalYards).toBeDefined();
      expect(analysis.homeTeamPredictions.passingYards).toBeDefined();
      expect(analysis.homeTeamPredictions.rushingYards).toBeDefined();
      expect(analysis.homeTeamPredictions.scoring).toBeDefined();
      expect(analysis.awayTeamPredictions.totalYards).toBeDefined();
      expect(analysis.awayTeamPredictions.passingYards).toBeDefined();
      expect(analysis.awayTeamPredictions.rushingYards).toBeDefined();
      expect(analysis.awayTeamPredictions.scoring).toBeDefined();
      
      // Verify final predictions and regression metadata
      expect(analysis.finalPredictions.homeTeamScore).toBeTypeOf('number');
      expect(analysis.finalPredictions.awayTeamScore).toBeTypeOf('number');
      expect(analysis.regressionMetadata.weightsUsed).toBeDefined();
      expect(analysis.regressionMetadata.modelRSquared).toBe(0.75);
    });

    it('should calculate opponent-relative predictions correctly for passing yards', async () => {
      const analysis = await model.calculateMatchupAnalysis(strongOffenseProfile, strongDefenseProfile);
      
      // Verify home team passing prediction uses opponent-relative calculation
      const homePassingPrediction = analysis.homeTeamPredictions.passingYards;
      expect(homePassingPrediction.teamOffensiveEfficiency).toBe(0.30);
      expect(homePassingPrediction.opponentDefensiveEfficiency).toBe(0.35);
      expect(homePassingPrediction.opponentBaseline).toBeTypeOf('number');
      expect(homePassingPrediction.predictedValue).toBeTypeOf('number');
      expect(homePassingPrediction.weightApplied).toBe(0.25); // From mocked weights
    });

    it('should handle extreme efficiency values with opponent-relative approach', async () => {
      // Create extreme efficiency profiles
      const extremeOffense: AdvancedTeamEfficiencyProfile = {
        ...strongOffenseProfile,
        passingOffenseEfficiency: 0.80  // 80% above average
      };
      
      const weakDefense: AdvancedTeamEfficiencyProfile = {
        ...averageProfile,
        passingDefenseEfficiency: -0.30  // 30% below average defense
      };

      const analysis = await model.calculateMatchupAnalysis(extremeOffense, weakDefense);
      
      // Should still calculate predictions using opponent-relative approach
      expect(analysis.homeTeamPredictions.passingYards.teamOffensiveEfficiency).toBe(0.80);
      expect(analysis.homeTeamPredictions.passingYards.opponentDefensiveEfficiency).toBe(-0.30);
      expect(analysis.homeTeamPredictions.passingYards.predictedValue).toBeTypeOf('number');
    });
  });

  describe('calculateExpectedPerformance', () => {
    it('should calculate expected performance for scoring using opponent-relative approach', async () => {
      const result = await model.calculateExpectedPerformance(
        strongOffenseProfile,
        strongDefenseProfile,
        'scoring'
      );

      // Should use opponent-relative calculation: opponentBaseline + teamEfficiency - opponentDefensiveEfficiency
      expect(result.expectedValue).toBeTypeOf('number');
      expect(result.opponentBaseline).toBeTypeOf('number');
      expect(result.weightApplied).toBe(0.30); // From mocked weights
      expect(result.confidence).toBeGreaterThan(0.8); // High confidence
    });

    it('should handle opponent-relative calculations correctly', async () => {
      const result = await model.calculateExpectedPerformance(
        strongOffenseProfile,
        averageProfile,
        'totalYards'
      );

      // Should use opponent baseline + team efficiency - opponent defensive efficiency
      expect(result.expectedValue).toBeTypeOf('number');
      expect(result.opponentBaseline).toBeTypeOf('number');
      expect(result.weightApplied).toBe(0.45); // passingOffense + rushingOffense from mocked weights
    });

    it('should throw error for unsupported category', async () => {
      await expect(async () => {
        await model.calculateExpectedPerformance(
          strongOffenseProfile,
          averageProfile,
          'unsupported' as any
        );
      }).rejects.toThrow('Unsupported statistical category');
    });
  });

  describe('validatePredictionBounds', () => {
    it('should validate reasonable predictions', () => {
      const opponentBaseline = 400;
      const result = model.validatePredictionBounds(450, 'totalYards', opponentBaseline);
      
      expect(result.isValid).toBe(true);
      expect(result.adjustedValue).toBe(450);
      expect(result.reason).toBeUndefined();
    });

    it('should flag extreme predictions above opponent baseline', () => {
      const opponentBaseline = 400;
      // 1300 yards vs 400 opponent baseline = 900 difference / 400 = 2.25 deviation (exceeds 2.0 threshold)
      const result = model.validatePredictionBounds(1300, 'totalYards', opponentBaseline);
      
      expect(result.isValid).toBe(false);
      expect(result.adjustedValue).toBe(1200); // 3x opponent baseline cap
      expect(result.reason).toContain('exceeded reasonable bounds relative to opponent');
    });

    it('should flag negative predictions for positive categories', () => {
      const opponentBaseline = 400;
      // Negative yards should not be allowed
      const result = model.validatePredictionBounds(-100, 'totalYards', opponentBaseline);
      
      expect(result.isValid).toBe(false);
      expect(result.adjustedValue).toBe(40); // 10% of opponent baseline minimum
      expect(result.reason).toContain('Negative prediction not allowed');
    });

    it('should validate against team season average when provided', () => {
      const opponentBaseline = 400;
      const result = model.validatePredictionBounds(500, 'totalYards', opponentBaseline, 450);
      
      // 500 vs 450 average is reasonable deviation
      expect(result.isValid).toBe(true);
      expect(result.adjustedValue).toBe(500);
    });

    it('should flag predictions that deviate too much from team average', () => {
      const opponentBaseline = 400;
      // 1000 vs 400 average = 600 difference / 400 = 1.5 deviation (exactly at threshold)
      // Let's use 1100 to exceed the threshold: 700 difference / 400 = 1.75 deviation
      const result = model.validatePredictionBounds(1100, 'totalYards', opponentBaseline, 400);
      
      expect(result.isValid).toBe(false);
      expect(result.adjustedValue).toBe(1000); // 250% of team average cap
      expect(result.reason).toContain('deviated too much from team average');
    });
  });

  describe('Opponent-Relative Calculation Requirements', () => {
    it('should use opponent-specific baselines instead of national averages', async () => {
      // Create profiles with different defensive capabilities
      const teamWith15PassingOffense: AdvancedTeamEfficiencyProfile = {
        ...averageProfile,
        passingOffenseEfficiency: 0.15  // +15% efficiency
      };
      
      const teamWith10PassingDefense: AdvancedTeamEfficiencyProfile = {
        ...averageProfile,
        passingDefenseEfficiency: 0.10  // +10% defensive efficiency
      };

      const result = await model.calculateExpectedPerformance(
        teamWith15PassingOffense,
        teamWith10PassingDefense,
        'passingYards'
      );

      // Should use opponent baseline + team efficiency - opponent defensive efficiency
      expect(result.opponentBaseline).toBeTypeOf('number');
      expect(result.expectedValue).toBeTypeOf('number');
      expect(result.weightApplied).toBe(0.25); // From mocked weights
    });
  });

  describe('Regression Weight Integration', () => {
    it('should use regression-derived weights in predictions', async () => {
      const analysis = await model.calculateMatchupAnalysis(strongOffenseProfile, strongDefenseProfile);

      // Verify that regression weights are being used
      expect(analysis.regressionMetadata.weightsUsed.scoringEfficiency).toBe(0.30);
      expect(analysis.regressionMetadata.weightsUsed.passingOffense).toBe(0.25);
      expect(analysis.regressionMetadata.weightsUsed.rushingOffense).toBe(0.20);
      expect(analysis.regressionMetadata.modelRSquared).toBe(0.75);
    });

    it('should calculate weighted final scores', async () => {
      const analysis = await model.calculateMatchupAnalysis(strongOffenseProfile, strongDefenseProfile);

      // Final predictions should be weighted combinations
      expect(analysis.finalPredictions.homeTeamScore).toBeGreaterThan(0);
      expect(analysis.finalPredictions.awayTeamScore).toBeGreaterThan(0);
      expect(analysis.finalPredictions.homeTeamConfidenceInterval).toHaveLength(2);
      expect(analysis.finalPredictions.awayTeamConfidenceInterval).toHaveLength(2);
    });
  });

  describe('Confidence Level Determination', () => {
    it('should return High confidence for high-quality profiles', async () => {
      const analysis = await model.calculateMatchupAnalysis(strongOffenseProfile, strongDefenseProfile);
      expect(analysis.confidenceLevel).toBe('High');
    });

    it('should return Medium confidence when one profile has medium confidence', async () => {
      const mediumProfile = { ...strongOffenseProfile, confidenceLevel: 'Medium' as const };
      const analysis = await model.calculateMatchupAnalysis(mediumProfile, strongDefenseProfile);
      expect(analysis.confidenceLevel).toBe('Medium');
    });

    it('should return Low confidence for low-quality profiles', async () => {
      const lowProfile = { 
        ...averageProfile, 
        confidenceLevel: 'Low' as const,
        convergenceScore: 0.3
      };
      const analysis = await model.calculateMatchupAnalysis(lowProfile, averageProfile);
      expect(analysis.confidenceLevel).toBe('Low');
    });
  });
});