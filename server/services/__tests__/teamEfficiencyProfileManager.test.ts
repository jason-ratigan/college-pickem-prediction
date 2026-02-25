// server/services/__tests__/teamEfficiencyProfileManager.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TeamEfficiencyProfileManager } from '../deprecated/teamEfficiencyProfileManager.js';
import { GamePerformanceRecord, AdvancedTeamEfficiencyProfile } from '../deprecated/recursiveEfficiencyEngine.js';

// Mock the database module completely
vi.mock('../../db', () => ({
  db: {
    query: {
      teamEfficiencyRatings: {
        findFirst: vi.fn(),
        findMany: vi.fn()
      }
    },
    insert: vi.fn().mockReturnValue({ values: vi.fn() }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) })
  }
}));

// Mock the schema imports
vi.mock('@college-pickem/shared', () => ({
  teamEfficiencyRatings: {},
  games: {},
  gameBoxScoreStats: {},
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn()
}));

describe('TeamEfficiencyProfileManager', () => {
  let profileManager: TeamEfficiencyProfileManager;
  let mockGamePerformances: GamePerformanceRecord[];

  beforeEach(() => {
    profileManager = new TeamEfficiencyProfileManager();
    
    // Create mock game performance data
    mockGamePerformances = [
      {
        gameId: 1,
        teamId: 1,
        opponentId: 2,
        totalYards: 450,
        passingYards: 300,
        rushingYards: 150,
        pointsScored: 35,
        turnovers: 1,
        sacks: 2,
        fieldGoalsMade: 2,
        fieldGoalsAttempted: 3,
        opponentTypicalYardsAllowed: 400,
        opponentTypicalPassingYardsAllowed: 250,
        opponentTypicalRushingYardsAllowed: 150,
        opponentTypicalPointsAllowed: 28,
        totalYardsEfficiency: 0.125,
        passingYardsEfficiency: 0.2,
        rushingYardsEfficiency: 0,
        scoringEfficiency: 0.25,
        opponentStrengthAdjustment: 0.05,
        recursiveQualityScore: 0.8
      },
      {
        gameId: 2,
        teamId: 1,
        opponentId: 3,
        totalYards: 380,
        passingYards: 220,
        rushingYards: 160,
        pointsScored: 28,
        turnovers: 2,
        sacks: 1,
        fieldGoalsMade: 1,
        fieldGoalsAttempted: 2,
        opponentTypicalYardsAllowed: 350,
        opponentTypicalPassingYardsAllowed: 200,
        opponentTypicalRushingYardsAllowed: 150,
        opponentTypicalPointsAllowed: 24,
        totalYardsEfficiency: 0.086,
        passingYardsEfficiency: 0.1,
        rushingYardsEfficiency: 0.067,
        scoringEfficiency: 0.167,
        opponentStrengthAdjustment: 0.02,
        recursiveQualityScore: 0.75
      }
    ];
  });

  describe('generateTeamEfficiencyProfile', () => {
    it('should generate comprehensive efficiency profile with all statistical categories', async () => {
      const profile = await profileManager.generateTeamEfficiencyProfile(1, 2024, mockGamePerformances);

      // Verify all required efficiency metrics are calculated
      expect(profile.teamId).toBe(1);
      expect(profile.season).toBe(2024);
      expect(profile.gamesPlayed).toBe(2);
      
      // Offensive efficiency metrics
      expect(typeof profile.totalOffenseEfficiency).toBe('number');
      expect(typeof profile.passingOffenseEfficiency).toBe('number');
      expect(typeof profile.rushingOffenseEfficiency).toBe('number');
      expect(typeof profile.scoringOffenseEfficiency).toBe('number');
      
      // Defensive efficiency metrics
      expect(typeof profile.totalDefenseEfficiency).toBe('number');
      expect(typeof profile.passingDefenseEfficiency).toBe('number');
      expect(typeof profile.rushingDefenseEfficiency).toBe('number');
      expect(typeof profile.scoringDefenseEfficiency).toBe('number');
      
      // Turnover and special teams metrics
      expect(typeof profile.interceptionEfficiency).toBe('number');
      expect(typeof profile.interceptionDefenseEfficiency).toBe('number');
      expect(typeof profile.sackOffenseEfficiency).toBe('number');
      expect(typeof profile.sackDefenseEfficiency).toBe('number');
      expect(typeof profile.fieldGoalEfficiency).toBe('number');
      
      // Metadata
      expect(typeof profile.convergenceScore).toBe('number');
      expect(['High', 'Medium', 'Low']).toContain(profile.confidenceLevel);
      expect(profile.lastCalculated).toBeInstanceOf(Date);
    });

    it('should calculate opponent-adjusted offensive efficiency correctly', async () => {
      const profile = await profileManager.generateTeamEfficiencyProfile(1, 2024, mockGamePerformances);

      // Total offense efficiency should be positive (team performed above opponent's typical allowance)
      expect(profile.totalOffenseEfficiency).toBeGreaterThan(0);
      
      // Passing offense should be positive (300 vs 250, 220 vs 200)
      expect(profile.passingOffenseEfficiency).toBeGreaterThan(0);
      
      // Scoring offense should be positive (35 vs 28, 28 vs 24)
      expect(profile.scoringOffenseEfficiency).toBeGreaterThan(0);
    });

    it('should determine confidence level based on games played', async () => {
      // Test with few games (Low confidence)
      const lowConfidenceProfile = await profileManager.generateTeamEfficiencyProfile(1, 2024, [mockGamePerformances[0]]);
      expect(lowConfidenceProfile.confidenceLevel).toBe('Low');
      
      // Test with medium games (Medium confidence)
      const mediumGames = Array(6).fill(null).map((_, i) => ({
        ...mockGamePerformances[0],
        gameId: i + 1
      }));
      const mediumConfidenceProfile = await profileManager.generateTeamEfficiencyProfile(1, 2024, mediumGames);
      expect(mediumConfidenceProfile.confidenceLevel).toBe('Medium');
      
      // Test with many games (High confidence)
      const highGames = Array(10).fill(null).map((_, i) => ({
        ...mockGamePerformances[0],
        gameId: i + 1
      }));
      const highConfidenceProfile = await profileManager.generateTeamEfficiencyProfile(1, 2024, highGames);
      expect(highConfidenceProfile.confidenceLevel).toBe('High');
    });

    it('should calculate field goal efficiency correctly', async () => {
      const profile = await profileManager.generateTeamEfficiencyProfile(1, 2024, mockGamePerformances);
      
      // Team made 3/5 field goals = 60% vs national average of ~75%
      // Should result in negative efficiency
      expect(profile.fieldGoalEfficiency).toBeLessThan(0);
    });

    it('should calculate convergence score based on performance consistency', async () => {
      const profile = await profileManager.generateTeamEfficiencyProfile(1, 2024, mockGamePerformances);
      
      // Convergence score should be between 0.1 and 1.0
      expect(profile.convergenceScore).toBeGreaterThanOrEqual(0.1);
      expect(profile.convergenceScore).toBeLessThanOrEqual(1.0);
    });
  });

  describe('blendWithPriorSeason', () => {
    it('should blend current and prior season data when team has fewer than 4 games', async () => {
      // Mock prior season profile
      const mockPriorProfile: AdvancedTeamEfficiencyProfile = {
        teamId: 1,
        season: 2023,
        totalOffenseEfficiency: 0.1,
        passingOffenseEfficiency: 0.15,
        rushingOffenseEfficiency: 0.05,
        scoringOffenseEfficiency: 0.12,
        totalDefenseEfficiency: -0.08,
        passingDefenseEfficiency: -0.1,
        rushingDefenseEfficiency: -0.06,
        scoringDefenseEfficiency: -0.09,
        interceptionEfficiency: -0.05,
        interceptionDefenseEfficiency: 0.03,
        sackOffenseEfficiency: -0.02,
        sackDefenseEfficiency: 0.04,
        fieldGoalEfficiency: 0.08,
        gamesPlayed: 12,
        convergenceScore: 0.95,
        confidenceLevel: 'High',
        lastCalculated: new Date('2023-12-01')
      };

      // Mock the database call to return prior season data
      const { db } = await import('../../db');
      vi.mocked(db.query.teamEfficiencyRatings.findFirst).mockResolvedValueOnce({
        id: 1,
        teamId: 1,
        season: 2023,
        totalOffenseEfficiency: '0.1',
        passingOffenseEfficiency: '0.15',
        rushingOffenseEfficiency: '0.05',
        scoringOffenseEfficiency: '0.12',
        totalDefenseEfficiency: '-0.08',
        passingDefenseEfficiency: '-0.1',
        rushingDefenseEfficiency: '-0.06',
        scoringDefenseEfficiency: '-0.09',
        interceptionEfficiency: '-0.05',
        interceptionDefenseEfficiency: '0.03',
        sackOffenseEfficiency: '-0.02',
        sackDefenseEfficiency: '0.04',
        fieldGoalEfficiency: '0.08',
        turnoverEfficiency: '-0.05',
        specialTeamsEfficiency: '0.08',
        averagePointsFor: '28.5',
        averagePointsAgainst: '21.2',
        gamesPlayed: 12,
        convergenceScore: '0.95',
        confidenceLevel: 'High',
        dataQuality: 'Excellent',
        lastCalculated: new Date('2023-12-01'),
        regressionMetrics: null,
        scoringRSquared: null,
        passingRSquared: null,
        rushingRSquared: null,
        turnoverRSquared: null,
        overallModelFit: null,
        statisticalSignificanceScore: null
      });

      // Test with only 2 games (should trigger blending)
      const limitedGames = mockGamePerformances.slice(0, 2);
      const profile = await profileManager.generateTeamEfficiencyProfile(1, 2024, limitedGames);

      // The profile should be a blend of current and prior season
      // Current season weight = 85%, prior season weight = 15%
      expect(profile.confidenceLevel).toBe('Medium'); // Adjusted due to blending
    });
  });

  describe('saveEfficiencyProfile', () => {
    it('should save comprehensive efficiency profile to database', async () => {
      const mockProfile: AdvancedTeamEfficiencyProfile = {
        teamId: 1,
        season: 2024,
        totalOffenseEfficiency: 0.15,
        passingOffenseEfficiency: 0.2,
        rushingOffenseEfficiency: 0.1,
        scoringOffenseEfficiency: 0.18,
        totalDefenseEfficiency: -0.05,
        passingDefenseEfficiency: -0.08,
        rushingDefenseEfficiency: -0.02,
        scoringDefenseEfficiency: -0.06,
        interceptionEfficiency: -0.03,
        interceptionDefenseEfficiency: 0.04,
        sackOffenseEfficiency: -0.01,
        sackDefenseEfficiency: 0.02,
        fieldGoalEfficiency: 0.05,
        gamesPlayed: 8,
        convergenceScore: 0.85,
        confidenceLevel: 'High',
        lastCalculated: new Date()
      };

      const { db } = await import('../../db');
      vi.mocked(db.query.teamEfficiencyRatings.findFirst).mockResolvedValueOnce(undefined);

      await profileManager.saveEfficiencyProfile(mockProfile);

      // Verify database insert was called
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('getTeamEfficiencyProfile', () => {
    it('should retrieve and parse comprehensive efficiency profile from database', async () => {
      const mockDbProfile = {
        id: 1,
        teamId: 1,
        season: 2024,
        totalOffenseEfficiency: '0.15',
        passingOffenseEfficiency: '0.2',
        rushingOffenseEfficiency: '0.1',
        scoringOffenseEfficiency: '0.18',
        totalDefenseEfficiency: '-0.05',
        passingDefenseEfficiency: '-0.08',
        rushingDefenseEfficiency: '-0.02',
        scoringDefenseEfficiency: '-0.06',
        interceptionEfficiency: '-0.03',
        interceptionDefenseEfficiency: '0.04',
        sackOffenseEfficiency: '-0.01',
        sackDefenseEfficiency: '0.02',
        fieldGoalEfficiency: '0.05',
        turnoverEfficiency: '-0.03',
        specialTeamsEfficiency: '0.05',
        averagePointsFor: '32.5',
        averagePointsAgainst: '18.2',
        gamesPlayed: 8,
        convergenceScore: '0.85',
        confidenceLevel: 'High',
        dataQuality: 'Excellent',
        lastCalculated: new Date(),
        regressionMetrics: null,
        scoringRSquared: null,
        passingRSquared: null,
        rushingRSquared: null,
        turnoverRSquared: null,
        overallModelFit: null,
        statisticalSignificanceScore: null
      };

      const { db } = await import('../../db');
      vi.mocked(db.query.teamEfficiencyRatings.findFirst).mockResolvedValueOnce(mockDbProfile);

      const profile = await profileManager.getTeamEfficiencyProfile(1, 2024);

      expect(profile).not.toBeNull();
      expect(profile!.teamId).toBe(1);
      expect(profile!.season).toBe(2024);
      expect(profile!.totalOffenseEfficiency).toBe(0.15);
      expect(profile!.passingOffenseEfficiency).toBe(0.2);
      expect(profile!.confidenceLevel).toBe('High');
      expect(profile!.convergenceScore).toBe(0.85);
    });

    it('should return null when no profile exists', async () => {
      const { db } = await import('../../db');
      vi.mocked(db.query.teamEfficiencyRatings.findFirst).mockResolvedValueOnce(undefined);

      const profile = await profileManager.getTeamEfficiencyProfile(999, 2024);
      expect(profile).toBeNull();
    });
  });
});