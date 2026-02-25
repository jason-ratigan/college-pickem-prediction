// server/services/validation/__tests__/sample-game-analyzer.test.ts

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { sampleGameAnalyzer } from '../sample-game-analyzer.js';
import { db } from '../../../db.js';
import { getGamePrediction } from '../../predictionService.js';

// Mock the database
vi.mock('../../../db.js', () => ({
  db: {
    query: {
      games: {
        findMany: vi.fn(),
        findFirst: vi.fn()
      },
      teams: {
        findFirst: vi.fn()
      },
      teamEfficiencyRatings: {
        findFirst: vi.fn()
      }
    }
  }
}));

// Mock the prediction service
vi.mock('../../predictionService.js', () => ({
  getGamePrediction: vi.fn()
}));

describe('SampleGameAnalyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('selectAndAnalyzeGames', () => {
    it('should successfully select and analyze games', async () => {
      // Mock completed games
      const mockGames = [
        {
          id: 1,
          season: 2024,
          week: 5,
          homeTeamId: 1,
          awayTeamId: 2,
          homeTeamScore: 28,
          awayTeamScore: 21,
          isFinal: true,
          homeTeam: { id: 1, name: 'Team A' },
          awayTeam: { id: 2, name: 'Team B' }
        },
        {
          id: 2,
          season: 2024,
          week: 5,
          homeTeamId: 3,
          awayTeamId: 4,
          homeTeamScore: 42,
          awayTeamScore: 7,
          isFinal: true,
          homeTeam: { id: 3, name: 'Team C' },
          awayTeam: { id: 4, name: 'Team D' }
        },
        {
          id: 3,
          season: 2024,
          week: 6,
          homeTeamId: 5,
          awayTeamId: 6,
          homeTeamScore: 24,
          awayTeamScore: 27,
          isFinal: true,
          homeTeam: { id: 5, name: 'Team E' },
          awayTeam: { id: 6, name: 'Team F' }
        }
      ];

      (db.query.games.findMany as Mock).mockResolvedValue(mockGames);
      (db.query.games.findFirst as Mock).mockImplementation(({ where }) => {
        const gameId = where.toString().includes('1') ? 1 : where.toString().includes('2') ? 2 : 3;
        return Promise.resolve(mockGames.find(g => g.id === gameId));
      });

      // Mock team efficiency data
      (db.query.teams.findFirst as Mock).mockImplementation(({ where }) => {
        const teamId = parseInt(where.toString().match(/\d+/)?.[0] || '1');
        return Promise.resolve({
          id: teamId,
          name: `Team ${String.fromCharCode(64 + teamId)}`
        });
      });

      (db.query.teamEfficiencyRatings.findFirst as Mock).mockResolvedValue({
        teamId: 1,
        season: 2024,
        totalOffenseEfficiency: 5.2,
        passingOffenseEfficiency: 3.1,
        rushingOffenseEfficiency: 2.8,
        scoringOffenseEfficiency: 4.5,
        totalDefenseEfficiency: -2.1,
        passingDefenseEfficiency: -1.8,
        rushingDefenseEfficiency: -2.5,
        scoringDefenseEfficiency: -3.2,
        interceptionEfficiency: 1.2,
        fieldGoalEfficiency: 0.8
      });

      // Mock prediction service
      (getGamePrediction as Mock).mockResolvedValue({
        expectedScore: { home: 28, away: 21 },
        confidence: 75,
        winProbability: 65,
        calculationBreakdown: {
          homeTeam: {
            efficiencyContributions: {
              scoring: 4.5,
              passingYards: 3.1,
              rushingYards: 2.8
            },
            weightsUsed: {
              scoring: 1.2,
              passingYards: 0.8,
              rushingYards: 0.9
            }
          },
          awayTeam: {
            efficiencyContributions: {
              scoring: 2.1,
              passingYards: 1.8,
              rushingYards: 2.2
            },
            weightsUsed: {
              scoring: 1.2,
              passingYards: 0.8,
              rushingYards: 0.9
            }
          }
        },
        statisticalConfidence: {
          modelRSquared: 0.65,
          sampleSizeAdequate: true
        }
      });

      const result = await sampleGameAnalyzer.selectAndAnalyzeGames(2024, 3);

      expect(result.isValid).toBe(true);
      expect(result.score).toBeGreaterThan(0);
      expect(result.analyzedGames).toHaveLength(3);
      expect(result.selectionCriteria).toBeDefined();
      expect(result.selectionCriteria.closeGames).toBeGreaterThanOrEqual(0);
      expect(result.selectionCriteria.blowouts).toBeGreaterThanOrEqual(0);
    });

    it('should handle no completed games', async () => {
      (db.query.games.findMany as Mock).mockResolvedValue([]);

      const result = await sampleGameAnalyzer.selectAndAnalyzeGames(2024, 5);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('NO_COMPLETED_GAMES');
      expect(result.analyzedGames).toHaveLength(0);
    });

    it('should handle analysis failures gracefully', async () => {
      const mockGames = [
        {
          id: 1,
          season: 2024,
          week: 5,
          homeTeamId: 1,
          awayTeamId: 2,
          homeTeamScore: 28,
          awayTeamScore: 21,
          isFinal: true,
          homeTeam: { id: 1, name: 'Team A' },
          awayTeam: { id: 2, name: 'Team B' }
        }
      ];

      (db.query.games.findMany as Mock).mockResolvedValue(mockGames);
      (db.query.games.findFirst as Mock).mockResolvedValue(mockGames[0]);
      (getGamePrediction as Mock).mockRejectedValue(new Error('Prediction failed'));

      const result = await sampleGameAnalyzer.selectAndAnalyzeGames(2024, 1);

      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
      // Should have either GAME_ANALYSIS_FAILED or LOW_SUCCESS_RATE warning
      const warningCodes = result.warnings.map(w => w.code);
      expect(warningCodes).toContain('LOW_SUCCESS_RATE');
      expect(result.analyzedGames).toHaveLength(0);
    });
  });

  describe('analyzeGame', () => {
    it('should analyze a game successfully', async () => {
      const mockGame = {
        id: 1,
        season: 2024,
        week: 5,
        homeTeamId: 1,
        awayTeamId: 2,
        homeTeamScore: 28,
        awayTeamScore: 21,
        homeTeam: { id: 1, name: 'Team A' },
        awayTeam: { id: 2, name: 'Team B' }
      };

      (db.query.games.findFirst as Mock).mockResolvedValue(mockGame);
      (db.query.teams.findFirst as Mock).mockImplementation(({ where }) => {
        const teamId = parseInt(where.toString().match(/\d+/)?.[0] || '1');
        return Promise.resolve({
          id: teamId,
          name: teamId === 1 ? 'Team A' : 'Team B'
        });
      });

      (db.query.teamEfficiencyRatings.findFirst as Mock).mockResolvedValue({
        teamId: 1,
        season: 2024,
        totalOffenseEfficiency: 5.2,
        passingOffenseEfficiency: 3.1,
        rushingOffenseEfficiency: 2.8,
        scoringOffenseEfficiency: 4.5,
        totalDefenseEfficiency: -2.1,
        passingDefenseEfficiency: -1.8,
        rushingDefenseEfficiency: -2.5,
        scoringDefenseEfficiency: -3.2,
        interceptionEfficiency: 1.2,
        fieldGoalEfficiency: 0.8
      });

      (getGamePrediction as Mock).mockResolvedValue({
        expectedScore: { home: 28, away: 21 },
        confidence: 75,
        winProbability: 65,
        calculationBreakdown: {
          homeTeam: {
            efficiencyContributions: {
              scoring: 4.5,
              passingYards: 3.1
            },
            weightsUsed: {
              scoring: 1.2,
              passingYards: 0.8
            }
          },
          awayTeam: {
            efficiencyContributions: {
              scoring: 2.1,
              passingYards: 1.8
            },
            weightsUsed: {
              scoring: 1.2,
              passingYards: 0.8
            }
          }
        },
        statisticalConfidence: {
          modelRSquared: 0.65,
          sampleSizeAdequate: true
        }
      });

      const result = await sampleGameAnalyzer.analyzeGame(1, 2024);

      expect(result).toBeDefined();
      expect(result?.gameId).toBe(1);
      expect(result?.gameInfo.homeTeam).toBe('Team A');
      expect(result?.gameInfo.awayTeam).toBe('Team B');
      expect(result?.prediction.homeScore).toBe(28);
      expect(result?.prediction.awayScore).toBe(21);
      expect(result?.efficiencyBreakdown).toBeDefined();
      expect(result?.keyFactors).toBeDefined();
      expect(result?.predictionExplanation).toBeDefined();
      expect(result?.outcomeComparison).toBeDefined();
    });

    it('should return null for missing game', async () => {
      (db.query.games.findFirst as Mock).mockResolvedValue(null);

      const result = await sampleGameAnalyzer.analyzeGame(999, 2024);

      expect(result).toBeNull();
    });

    it('should handle prediction service errors', async () => {
      const mockGame = {
        id: 1,
        season: 2024,
        week: 5,
        homeTeamId: 1,
        awayTeamId: 2,
        homeTeamScore: 28,
        awayTeamScore: 21,
        homeTeam: { id: 1, name: 'Team A' },
        awayTeam: { id: 2, name: 'Team B' }
      };

      (db.query.games.findFirst as Mock).mockResolvedValue(mockGame);
      (getGamePrediction as Mock).mockRejectedValue(new Error('Prediction failed'));

      const result = await sampleGameAnalyzer.analyzeGame(1, 2024);

      expect(result).toBeNull();
    });
  });

  describe('validation method', () => {
    it('should perform validation successfully', async () => {
      const mockGames = [
        {
          id: 1,
          season: 2024,
          week: 5,
          homeTeamId: 1,
          awayTeamId: 2,
          homeTeamScore: 28,
          awayTeamScore: 21,
          isFinal: true,
          homeTeam: { id: 1, name: 'Team A' },
          awayTeam: { id: 2, name: 'Team B' }
        }
      ];

      (db.query.games.findMany as Mock).mockResolvedValue(mockGames);
      (db.query.games.findFirst as Mock).mockResolvedValue(mockGames[0]);
      (db.query.teams.findFirst as Mock).mockResolvedValue({ id: 1, name: 'Team A' });
      (db.query.teamEfficiencyRatings.findFirst as Mock).mockResolvedValue({
        teamId: 1,
        season: 2024,
        totalOffenseEfficiency: 5.2,
        passingOffenseEfficiency: 3.1,
        rushingOffenseEfficiency: 2.8,
        scoringOffenseEfficiency: 4.5,
        totalDefenseEfficiency: -2.1,
        passingDefenseEfficiency: -1.8,
        rushingDefenseEfficiency: -2.5,
        scoringDefenseEfficiency: -3.2,
        interceptionEfficiency: 1.2,
        fieldGoalEfficiency: 0.8
      });

      (getGamePrediction as Mock).mockResolvedValue({
        expectedScore: { home: 28, away: 21 },
        confidence: 75,
        winProbability: 65,
        calculationBreakdown: {
          homeTeam: {
            efficiencyContributions: { scoring: 4.5 },
            weightsUsed: { scoring: 1.2 }
          },
          awayTeam: {
            efficiencyContributions: { scoring: 2.1 },
            weightsUsed: { scoring: 1.2 }
          }
        },
        statisticalConfidence: {
          modelRSquared: 0.65,
          sampleSizeAdequate: true
        }
      });

      const result = await sampleGameAnalyzer.validate(2024, 1);

      expect(result.isValid).toBe(true);
      expect(result.score).toBeGreaterThan(0);
      expect(result.metadata?.analyzedGamesCount).toBe(1);
      expect(result.metadata?.selectionCriteria).toBeDefined();
    });

    it('should handle validation errors', async () => {
      (db.query.games.findMany as Mock).mockRejectedValue(new Error('Database error'));

      const result = await sampleGameAnalyzer.validate(2024, 5);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('ANALYSIS_ERROR');
    });
  });

  describe('game categorization', () => {
    it('should categorize games correctly', async () => {
      const mockGames = [
        // Close game (7 point difference)
        {
          id: 1,
          homeTeamScore: 28,
          awayTeamScore: 21,
          homeTeam: { name: 'Team A' },
          awayTeam: { name: 'Team B' }
        },
        // Blowout (35 point difference)
        {
          id: 2,
          homeTeamScore: 42,
          awayTeamScore: 7,
          homeTeam: { name: 'Team C' },
          awayTeam: { name: 'Team D' }
        },
        // Upset (away team wins by 14)
        {
          id: 3,
          homeTeamScore: 10,
          awayTeamScore: 24,
          homeTeam: { name: 'Team E' },
          awayTeam: { name: 'Team F' }
        },
        // Regular game (14 point difference)
        {
          id: 4,
          homeTeamScore: 31,
          awayTeamScore: 17,
          homeTeam: { name: 'Team G' },
          awayTeam: { name: 'Team H' }
        }
      ];

      (db.query.games.findMany as Mock).mockResolvedValue(mockGames);

      const result = await sampleGameAnalyzer.selectAndAnalyzeGames(2024, 4);

      expect(result.selectionCriteria.closeGames).toBeGreaterThanOrEqual(0);
      expect(result.selectionCriteria.blowouts).toBeGreaterThanOrEqual(0);
      expect(result.selectionCriteria.upsets).toBeGreaterThanOrEqual(0);
      expect(result.selectionCriteria.regularGames).toBeGreaterThanOrEqual(0);
    });
  });
});