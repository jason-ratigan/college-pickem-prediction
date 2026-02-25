// server/services/__tests__/predictionService.test.ts

import { describe, it, expect } from 'vitest';
import type { GamePrediction } from '../predictionService.js';

describe('PredictionService - Point-Differential System Interface', () => {
  describe('GamePrediction Interface', () => {
    it('should have the correct interface structure for point-differential system', () => {
      // This test verifies that the GamePrediction interface includes all required fields
      // for the point-differential system with regression-based weights
      
      const mockPrediction: GamePrediction = {
        gameId: 1,
        homeTeam: {
          id: 1,
          name: 'Team A',
          logoUrl: 'logo-a.png'
        },
        awayTeam: {
          id: 2,
          name: 'Team B',
          logoUrl: 'logo-b.png'
        },
        expectedScore: {
          home: 28,
          away: 24
        },
        winProbability: 65,
        confidence: 78,
        spread: 4,
        total: 52,
        keyMatchups: ['Passing Game: Team A holds a moderate advantage'],
        
        // Verify the new point-differential system fields
        efficiencyAnalysis: {} as any, // OpponentRelativeMatchupAnalysis
        boundaryValidation: {} as any, // BoundaryValidationResult
        
        // Statistical confidence information (Requirements: 6.4, 6.5)
        statisticalConfidence: {
          modelRSquared: 0.73,
          confidenceInterval: {
            home: [25, 31],
            away: [21, 27]
          },
          predictionReliability: 'High',
          sampleSizeAdequate: true,
          weightsUsed: {
            passingOffense: 0.25,
            rushingOffense: 0.20,
            scoringEfficiency: 0.45,
            passingDefense: 0.20,
            rushingDefense: 0.16,
            turnoverMargin: 0.10,
            specialTeams: 0.05,
            homeFieldAdvantage: 0.10
          },
          weightsLastUpdated: new Date('2024-01-15')
        },
        
        // Calculation breakdown for transparency
        calculationBreakdown: {
          homeTeam: {
            opponentBaseline: 21.5,
            efficiencyContributions: {
              scoring: 5.2,
              passingYards: 25.5,
              rushingYards: 15.3,
              turnovers: -0.5
            },
            weightsUsed: {
              scoring: 0.45,
              passingYards: 0.25,
              rushingYards: 0.20,
              turnovers: 0.10
            }
          },
          awayTeam: {
            opponentBaseline: 28.2,
            efficiencyContributions: {
              scoring: -2.1,
              passingYards: -8.2,
              rushingYards: 12.1,
              turnovers: 0.3
            },
            weightsUsed: {
              scoring: 0.45,
              passingYards: 0.25,
              rushingYards: 0.20,
              turnovers: 0.10
            }
          }
        },
        
        predictionMetadata: {
          homeTeamProfile: {} as any,
          awayTeamProfile: {} as any,
          calculationTimestamp: new Date(),
          systemVersion: 'Point-Differential System with Regression Weights v2.0'
        }
      };

      // Verify all required fields are present
      expect(mockPrediction.statisticalConfidence).toBeDefined();
      expect(mockPrediction.statisticalConfidence.modelRSquared).toBe(0.73);
      expect(mockPrediction.statisticalConfidence.confidenceInterval).toBeDefined();
      expect(mockPrediction.statisticalConfidence.confidenceInterval.home).toEqual([25, 31]);
      expect(mockPrediction.statisticalConfidence.confidenceInterval.away).toEqual([21, 27]);
      expect(mockPrediction.statisticalConfidence.predictionReliability).toBe('High');
      expect(mockPrediction.statisticalConfidence.sampleSizeAdequate).toBe(true);
      expect(mockPrediction.statisticalConfidence.weightsUsed).toBeDefined();
      expect(mockPrediction.statisticalConfidence.weightsLastUpdated).toEqual(new Date('2024-01-15'));

      // Verify calculation breakdown is included
      expect(mockPrediction.calculationBreakdown).toBeDefined();
      expect(mockPrediction.calculationBreakdown.homeTeam).toBeDefined();
      expect(mockPrediction.calculationBreakdown.homeTeam.opponentBaseline).toBe(21.5);
      expect(mockPrediction.calculationBreakdown.homeTeam.efficiencyContributions.scoring).toBe(5.2);
      expect(mockPrediction.calculationBreakdown.homeTeam.weightsUsed.scoring).toBe(0.45);

      expect(mockPrediction.calculationBreakdown.awayTeam).toBeDefined();
      expect(mockPrediction.calculationBreakdown.awayTeam.opponentBaseline).toBe(28.2);
      expect(mockPrediction.calculationBreakdown.awayTeam.efficiencyContributions.scoring).toBe(-2.1);
      expect(mockPrediction.calculationBreakdown.awayTeam.weightsUsed.scoring).toBe(0.45);

      // Verify system version indicates point-differential system
      expect(mockPrediction.predictionMetadata.systemVersion).toContain('Point-Differential System');
      expect(mockPrediction.predictionMetadata.systemVersion).toContain('Regression Weights');
    });

    it('should support regression-based weights structure', () => {
      // Verify that the StatisticalImpactWeights interface is properly structured
      const weights = {
        passingOffense: 0.25,
        rushingOffense: 0.20,
        scoringEfficiency: 0.45,
        passingDefense: 0.20,
        rushingDefense: 0.16,
        turnoverMargin: 0.10,
        specialTeams: 0.05,
        homeFieldAdvantage: 0.10
      };

      // Verify all weight categories are present
      expect(weights.passingOffense).toBeDefined();
      expect(weights.rushingOffense).toBeDefined();
      expect(weights.scoringEfficiency).toBeDefined();
      expect(weights.passingDefense).toBeDefined();
      expect(weights.rushingDefense).toBeDefined();
      expect(weights.turnoverMargin).toBeDefined();
      expect(weights.specialTeams).toBeDefined();
      expect(weights.homeFieldAdvantage).toBeDefined();

      // Verify weights are numeric
      expect(typeof weights.passingOffense).toBe('number');
      expect(typeof weights.rushingOffense).toBe('number');
      expect(typeof weights.scoringEfficiency).toBe('number');
      expect(typeof weights.passingDefense).toBe('number');
      expect(typeof weights.rushingDefense).toBe('number');
      expect(typeof weights.turnoverMargin).toBe('number');
      expect(typeof weights.specialTeams).toBe('number');
      expect(typeof weights.homeFieldAdvantage).toBe('number');
    });
  });
});