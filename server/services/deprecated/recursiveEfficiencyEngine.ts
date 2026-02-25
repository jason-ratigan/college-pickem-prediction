// server/services/recursiveEfficiencyEngine.ts

import { db } from '../../db.js';
import { games } from '@college-pickem/shared';
import { eq, and, sql } from 'drizzle-orm';

// Statistical metrics that we calculate efficiency for
export type StatisticalMetric = 
  | 'totalOffense' | 'passingOffense' | 'rushingOffense' | 'scoringOffense'
  | 'totalDefense' | 'passingDefense' | 'rushingDefense' | 'scoringDefense'
  | 'interceptionsTaken' | 'interceptionsThrown' | 'sacksMade' | 'sacksAllowed'
  | 'fieldGoalsMade' | 'fieldGoalsAttempted';

// Core data structure for efficiency calculations
export interface EfficiencyCalculation {
  teamId: number;
  metric: StatisticalMetric;
  rawPerformance: number;
  opponentBaseline: number;
  opponentQualityAdjustment: number;
  finalEfficiency: number;
}

// Team performance data for a single game
export interface GamePerformanceRecord {
  gameId: number;
  teamId: number;
  opponentId: number;
  
  // Raw Performance
  totalYards: number;
  passingYards: number;
  rushingYards: number;
  pointsScored: number;
  turnovers: number;
  sacks: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  
  // Opponent Baselines (what opponent typically allows/produces)
  opponentTypicalYardsAllowed: number;
  opponentTypicalPassingYardsAllowed: number;
  opponentTypicalRushingYardsAllowed: number;
  opponentTypicalPointsAllowed: number;
  
  // Efficiency Calculations
  totalYardsEfficiency: number;
  passingYardsEfficiency: number;
  rushingYardsEfficiency: number;
  scoringEfficiency: number;
  
  // Quality Adjustments
  opponentStrengthAdjustment: number;
  recursiveQualityScore: number;
}

// Advanced team efficiency profile with recursive calculations
export interface AdvancedTeamEfficiencyProfile {
  teamId: number;
  season: number;
  
  // Offensive Efficiency (opponent-adjusted)
  totalOffenseEfficiency: number;
  passingOffenseEfficiency: number;
  rushingOffenseEfficiency: number;
  scoringOffenseEfficiency: number;
  
  // Defensive Efficiency (opponent-adjusted)
  totalDefenseEfficiency: number;
  passingDefenseEfficiency: number;
  rushingDefenseEfficiency: number;
  scoringDefenseEfficiency: number;
  
  // Turnover & Special Teams
  interceptionEfficiency: number; // Thrown vs typical
  interceptionDefenseEfficiency: number; // Caught vs typical
  sackOffenseEfficiency: number; // Allowed vs typical
  sackDefenseEfficiency: number; // Made vs typical
  fieldGoalEfficiency: number;
  
  // Metadata
  gamesPlayed: number;
  convergenceScore: number; // How stable the ratings are
  confidenceLevel: 'High' | 'Medium' | 'Low';
  lastCalculated: Date;
}

// State tracking for iterative calculations
export interface CalculationIteration {
  iterationNumber: number;
  teamEfficiencies: Map<number, AdvancedTeamEfficiencyProfile>;
  convergenceMetrics: {
    maxChange: number;
    averageChange: number;
    teamsConverged: number;
    totalTeams: number;
  };
  isConverged: boolean;
}

/**
 * Core recursive efficiency calculation engine
 * Implements iterative opponent-adjusted performance analysis
 */
export class RecursiveEfficiencyEngine {
  private readonly maxIterations: number = 50; // Increased to allow full convergence
  private readonly convergenceThreshold: number = 0.001; // Tighter convergence for more accuracy
  private readonly minGamesForCalculation: number = 1; // Allow teams with even 1 game

  constructor(maxIterations?: number, convergenceThreshold?: number) {
    if (maxIterations) this.maxIterations = maxIterations;
    if (convergenceThreshold) this.convergenceThreshold = convergenceThreshold;
  }

  /**
   * Main entry point for calculating recursive efficiency for all teams in a season
   */
  async calculateSeasonEfficiencies(season: number): Promise<Map<number, AdvancedTeamEfficiencyProfile>> {
    console.log(`Starting recursive efficiency calculation for season ${season}`);
    
    // Get all teams that played games in this season
    const seasonTeams = await this.getSeasonTeams(season);
    console.log(`Found ${seasonTeams.length} teams for season ${season}`);
    
    // Get all game performance data for the season
    const gamePerformances = await this.getSeasonGamePerformances(season);
    console.log(`Loaded ${gamePerformances.length} game performances`);
    
    // Initialize team efficiency profiles
    let currentProfiles = this.initializeTeamProfiles(seasonTeams, season);
    
    // Perform iterative calculations until convergence
    const iterations: CalculationIteration[] = [];
    let converged = false;
    
    for (let i = 0; i < this.maxIterations && !converged; i++) {
      console.log(`Starting iteration ${i + 1}/${this.maxIterations}`);
      
      const newProfiles = await this.performCalculationIteration(
        currentProfiles,
        gamePerformances,
        season
      );
      
      const iteration = this.assessConvergence(i + 1, currentProfiles, newProfiles);
      iterations.push(iteration);
      
      converged = iteration.isConverged;
      currentProfiles = newProfiles;
      
      console.log(`Iteration ${i + 1}: Max change = ${iteration.convergenceMetrics.maxChange.toFixed(4)}, ` +
                  `Converged teams = ${iteration.convergenceMetrics.teamsConverged}/${iteration.convergenceMetrics.totalTeams}`);
    }
    
    if (!converged) {
      console.warn(`Efficiency calculations did not converge after ${this.maxIterations} iterations`);
    } else {
      console.log(`Efficiency calculations converged after ${iterations.length} iterations`);
    }
    
    return currentProfiles;
  }

  /**
   * Gets all teams that played games in a given season
   */
  private async getSeasonTeams(season: number): Promise<number[]> {
    const result = await db.select({
      teamId: sql<number>`DISTINCT CASE 
        WHEN ${games.homeTeamId} IS NOT NULL THEN ${games.homeTeamId}
        WHEN ${games.awayTeamId} IS NOT NULL THEN ${games.awayTeamId}
      END`.as('teamId')
    })
    .from(games)
    .where(and(
      eq(games.season, season),
      eq(games.isFinal, true)
    ));

    // Get unique team IDs from both home and away games
    const homeTeams = await db.select({ teamId: games.homeTeamId })
      .from(games)
      .where(and(eq(games.season, season), eq(games.isFinal, true)));
    
    const awayTeams = await db.select({ teamId: games.awayTeamId })
      .from(games)
      .where(and(eq(games.season, season), eq(games.isFinal, true)));
    
    const allTeamIds = new Set([
      ...homeTeams.map(t => t.teamId),
      ...awayTeams.map(t => t.teamId)
    ]);
    
    return Array.from(allTeamIds);
  }

  /**
   * Loads all game performance data for a season
   */
  private async getSeasonGamePerformances(season: number): Promise<GamePerformanceRecord[]> {
    const seasonGames = await db.query.games.findMany({
      where: and(
        eq(games.season, season),
        eq(games.isFinal, true)
      ),
      with: {
        boxScoreStats: {
          with: {
            team: true
          }
        }
      }
    });

    const performances: GamePerformanceRecord[] = [];

    for (const game of seasonGames) {
      if (!game.boxScoreStats || game.boxScoreStats.length < 2) {
        continue; // Skip games without complete box score data
      }

      const homeStats = game.boxScoreStats.find(s => s.teamId === game.homeTeamId);
      const awayStats = game.boxScoreStats.find(s => s.teamId === game.awayTeamId);

      if (!homeStats || !awayStats) continue;

      // Create performance records for both teams
      performances.push(
        this.createGamePerformanceRecord(game, homeStats, awayStats, true),
        this.createGamePerformanceRecord(game, awayStats, homeStats, false)
      );
    }

    return performances;
  }

  /**
   * Creates a game performance record for a team
   */
  private createGamePerformanceRecord(
    game: any,
    teamStats: any,
    opponentStats: any,
    isHome: boolean
  ): GamePerformanceRecord {
    return {
      gameId: game.id,
      teamId: teamStats.teamId,
      opponentId: opponentStats.teamId,
      
      // Raw Performance
      totalYards: teamStats.totalYards || 0,
      passingYards: teamStats.netPassingYards || 0,
      rushingYards: teamStats.rushingYards || 0,
      pointsScored: isHome ? (game.homeTeamScore || 0) : (game.awayTeamScore || 0),
      turnovers: teamStats.turnovers || 0,
      sacks: parseFloat(teamStats.sacks || '0'),
      fieldGoalsMade: teamStats.fieldGoalsMade || 0,
      fieldGoalsAttempted: teamStats.fieldGoalAttempts || 0,
      
      // Opponent Baselines (will be calculated during iterations)
      opponentTypicalYardsAllowed: 0,
      opponentTypicalPassingYardsAllowed: 0,
      opponentTypicalRushingYardsAllowed: 0,
      opponentTypicalPointsAllowed: 0,
      
      // Efficiency Calculations (will be calculated during iterations)
      totalYardsEfficiency: 0,
      passingYardsEfficiency: 0,
      rushingYardsEfficiency: 0,
      scoringEfficiency: 0,
      
      // Quality Adjustments (will be calculated during iterations)
      opponentStrengthAdjustment: 0,
      recursiveQualityScore: 0
    };
  }

  /**
   * Initializes team efficiency profiles with default values
   */
  private initializeTeamProfiles(teamIds: number[], season: number): Map<number, AdvancedTeamEfficiencyProfile> {
    const profiles = new Map<number, AdvancedTeamEfficiencyProfile>();
    
    for (const teamId of teamIds) {
      profiles.set(teamId, {
        teamId,
        season,
        
        // Initialize all efficiencies to 0 (average)
        totalOffenseEfficiency: 0,
        passingOffenseEfficiency: 0,
        rushingOffenseEfficiency: 0,
        scoringOffenseEfficiency: 0,
        
        totalDefenseEfficiency: 0,
        passingDefenseEfficiency: 0,
        rushingDefenseEfficiency: 0,
        scoringDefenseEfficiency: 0,
        
        interceptionEfficiency: 0,
        interceptionDefenseEfficiency: 0,
        sackOffenseEfficiency: 0,
        sackDefenseEfficiency: 0,
        fieldGoalEfficiency: 0,
        
        gamesPlayed: 0,
        convergenceScore: 0,
        confidenceLevel: 'Low',
        lastCalculated: new Date()
      });
    }
    
    return profiles;
  }

  /**
   * Performs a single iteration of efficiency calculations
   * Enhanced to use comprehensive profile generation
   */
  private async performCalculationIteration(
    currentProfiles: Map<number, AdvancedTeamEfficiencyProfile>,
    gamePerformances: GamePerformanceRecord[],
    season: number
  ): Promise<Map<number, AdvancedTeamEfficiencyProfile>> {
    
    // Import profile manager here to avoid circular dependency
    const { TeamEfficiencyProfileManager } = await import('./teamEfficiencyProfileManager.js');
    const profileManager = new TeamEfficiencyProfileManager();
    
    // Step 1: Calculate opponent baselines using current efficiency profiles
    const updatedPerformances = this.calculateOpponentBaselines(gamePerformances, currentProfiles);
    
    // Step 2: Generate comprehensive efficiency profiles for each team
    const newProfiles = new Map<number, AdvancedTeamEfficiencyProfile>();
    
    for (const [teamId, profile] of currentProfiles) {
      const teamPerformances = updatedPerformances.filter(p => p.teamId === teamId);
      
      if (teamPerformances.length < this.minGamesForCalculation) {
        // Keep existing profile if insufficient data
        newProfiles.set(teamId, { ...profile });
        continue;
      }
      
      // Use comprehensive profile generation
      const newProfile = await profileManager.generateTeamEfficiencyProfile(teamId, season, updatedPerformances);
      newProfiles.set(teamId, newProfile);
    }
    
    return newProfiles;
  }

  /**
   * Calculates opponent baselines for all game performances
   */
  private calculateOpponentBaselines(
    performances: GamePerformanceRecord[],
    currentProfiles: Map<number, AdvancedTeamEfficiencyProfile>
  ): GamePerformanceRecord[] {
    
    // Calculate average performance allowed by each team (defensive baselines)
    const teamDefensiveBaselines = new Map<number, {
      yardsAllowed: number;
      passingYardsAllowed: number;
      rushingYardsAllowed: number;
      pointsAllowed: number;
      gamesPlayed: number;
    }>();
    
    // First pass: calculate raw averages
    for (const performance of performances) {
      const opponentId = performance.opponentId;
      
      if (!teamDefensiveBaselines.has(opponentId)) {
        teamDefensiveBaselines.set(opponentId, {
          yardsAllowed: 0,
          passingYardsAllowed: 0,
          rushingYardsAllowed: 0,
          pointsAllowed: 0,
          gamesPlayed: 0
        });
      }
      
      const baseline = teamDefensiveBaselines.get(opponentId)!;
      baseline.yardsAllowed += performance.totalYards;
      baseline.passingYardsAllowed += performance.passingYards;
      baseline.rushingYardsAllowed += performance.rushingYards;
      baseline.pointsAllowed += performance.pointsScored;
      baseline.gamesPlayed += 1;
    }
    
    // Convert totals to averages
    for (const [teamId, baseline] of teamDefensiveBaselines) {
      if (baseline.gamesPlayed > 0) {
        baseline.yardsAllowed /= baseline.gamesPlayed;
        baseline.passingYardsAllowed /= baseline.gamesPlayed;
        baseline.rushingYardsAllowed /= baseline.gamesPlayed;
        baseline.pointsAllowed /= baseline.gamesPlayed;
      }
    }
    
    // Second pass: apply baselines to performances and adjust for opponent quality
    return performances.map(performance => {
      const opponentBaseline = teamDefensiveBaselines.get(performance.opponentId);
      const opponentProfile = currentProfiles.get(performance.opponentId);
      
      if (!opponentBaseline) {
        return performance; // Return unchanged if no baseline available
      }
      
      // Apply opponent quality adjustment based on their defensive efficiency
      const qualityAdjustment = opponentProfile ? 
        (opponentProfile.totalDefenseEfficiency * 0.1) : 0;
      
      return {
        ...performance,
        opponentTypicalYardsAllowed: opponentBaseline.yardsAllowed + qualityAdjustment,
        opponentTypicalPassingYardsAllowed: opponentBaseline.passingYardsAllowed + qualityAdjustment,
        opponentTypicalRushingYardsAllowed: opponentBaseline.rushingYardsAllowed + qualityAdjustment,
        opponentTypicalPointsAllowed: opponentBaseline.pointsAllowed + qualityAdjustment,
        opponentStrengthAdjustment: qualityAdjustment,
        recursiveQualityScore: opponentProfile?.convergenceScore || 0
      };
    });
  }

  /**
   * Calculates efficiency ratings for a single team based on their game performances
   */
  private calculateTeamEfficiencies(
    currentProfile: AdvancedTeamEfficiencyProfile,
    teamPerformances: GamePerformanceRecord[]
  ): AdvancedTeamEfficiencyProfile {
    
    if (teamPerformances.length === 0) {
      return currentProfile;
    }
    
    // Calculate efficiency for each metric
    const totalOffenseEfficiency = this.calculateMetricEfficiency(
      teamPerformances,
      'totalOffense'
    );
    
    const passingOffenseEfficiency = this.calculateMetricEfficiency(
      teamPerformances,
      'passingOffense'
    );
    
    const rushingOffenseEfficiency = this.calculateMetricEfficiency(
      teamPerformances,
      'rushingOffense'
    );
    
    const scoringOffenseEfficiency = this.calculateMetricEfficiency(
      teamPerformances,
      'scoringOffense'
    );
    
    // Determine confidence level based on games played and data quality
    const confidenceLevel = this.determineConfidenceLevel(teamPerformances.length);
    
    return {
      ...currentProfile,
      totalOffenseEfficiency,
      passingOffenseEfficiency,
      rushingOffenseEfficiency,
      scoringOffenseEfficiency,
      
      // For now, defensive efficiencies are calculated as inverse of what opponents achieved
      // This will be enhanced in future iterations
      totalDefenseEfficiency: -totalOffenseEfficiency * 0.5,
      passingDefenseEfficiency: -passingOffenseEfficiency * 0.5,
      rushingDefenseEfficiency: -rushingOffenseEfficiency * 0.5,
      scoringDefenseEfficiency: -scoringOffenseEfficiency * 0.5,
      
      gamesPlayed: teamPerformances.length,
      confidenceLevel,
      lastCalculated: new Date()
    };
  }

  /**
   * Calculates efficiency for a specific metric using point differentials
   */
  private calculateMetricEfficiency(
    performances: GamePerformanceRecord[],
    metric: StatisticalMetric
  ): number {
    
    let totalEfficiency = 0;
    let validPerformances = 0;
    
    for (const performance of performances) {
      let actualValue: number;
      let baselineValue: number;
      
      switch (metric) {
        case 'totalOffense':
          actualValue = performance.totalYards;
          baselineValue = performance.opponentTypicalYardsAllowed;
          break;
        case 'passingOffense':
          actualValue = performance.passingYards;
          baselineValue = performance.opponentTypicalPassingYardsAllowed;
          break;
        case 'rushingOffense':
          actualValue = performance.rushingYards;
          baselineValue = performance.opponentTypicalRushingYardsAllowed;
          break;
        case 'scoringOffense':
          actualValue = performance.pointsScored;
          baselineValue = performance.opponentTypicalPointsAllowed;
          break;
        default:
          continue; // Skip unsupported metrics for now
      }
      
      // Calculate efficiency as point differential from baseline
      // This naturally bounds the values and prevents multiplicative explosion
      const efficiency = actualValue - baselineValue;
      totalEfficiency += efficiency;
      validPerformances++;
    }
    
    const averageEfficiency = validPerformances > 0 ? totalEfficiency / validPerformances : 0;
    
    // Log warning for extreme efficiency values as per requirement 3.5
    if (Math.abs(averageEfficiency) > 35) {
      console.warn(`[RecursiveEfficiencyEngine] Extreme efficiency detected for ${metric}: ${averageEfficiency.toFixed(2)} points per game. This is mathematically sound but unusually high.`);
    }
    
    return averageEfficiency;
  }

  /**
   * Determines confidence level based on sample size and data quality
   */
  private determineConfidenceLevel(gamesPlayed: number): 'High' | 'Medium' | 'Low' {
    if (gamesPlayed >= 8) return 'High';
    if (gamesPlayed >= 5) return 'Medium';
    return 'Low';
  }

  /**
   * Assesses convergence between iterations
   */
  private assessConvergence(
    iterationNumber: number,
    previousProfiles: Map<number, AdvancedTeamEfficiencyProfile>,
    currentProfiles: Map<number, AdvancedTeamEfficiencyProfile>
  ): CalculationIteration {
    
    let maxChange = 0;
    let totalChange = 0;
    let teamsConverged = 0;
    let totalTeams = 0;
    
    for (const [teamId, currentProfile] of currentProfiles) {
      const previousProfile = previousProfiles.get(teamId);
      if (!previousProfile) continue;
      
      totalTeams++;
      
      // Calculate change in key efficiency metrics
      const changes = [
        Math.abs(currentProfile.totalOffenseEfficiency - previousProfile.totalOffenseEfficiency),
        Math.abs(currentProfile.passingOffenseEfficiency - previousProfile.passingOffenseEfficiency),
        Math.abs(currentProfile.rushingOffenseEfficiency - previousProfile.rushingOffenseEfficiency),
        Math.abs(currentProfile.scoringOffenseEfficiency - previousProfile.scoringOffenseEfficiency)
      ];
      
      const teamMaxChange = Math.max(...changes);
      const teamAvgChange = changes.reduce((sum, change) => sum + change, 0) / changes.length;
      
      maxChange = Math.max(maxChange, teamMaxChange);
      totalChange += teamAvgChange;
      
      if (teamMaxChange < this.convergenceThreshold) {
        teamsConverged++;
      }
      
      // Update convergence score for the team
      currentProfile.convergenceScore = 1 - teamMaxChange;
    }
    
    const averageChange = totalTeams > 0 ? totalChange / totalTeams : 0;
    const convergenceRatio = totalTeams > 0 ? teamsConverged / totalTeams : 1;
    
    // More stringent convergence: require 98% of teams to converge AND max change to be small
    const isConverged = (maxChange < this.convergenceThreshold && convergenceRatio >= 0.98) ||
                       (maxChange < this.convergenceThreshold * 0.1); // Or extremely small max change
    
    return {
      iterationNumber,
      teamEfficiencies: new Map(currentProfiles),
      convergenceMetrics: {
        maxChange,
        averageChange,
        teamsConverged,
        totalTeams
      },
      isConverged
    };
  }

  /**
   * Calculates opponent-adjusted efficiency for a specific team and metric
   */
  async calculateOpponentAdjustedEfficiency(
    teamId: number,
    season: number,
    metric: StatisticalMetric
  ): Promise<EfficiencyCalculation | null> {
    
    // Get team's game performances for the season
    const teamGames = await db.query.games.findMany({
      where: and(
        eq(games.season, season),
        eq(games.isFinal, true),
        sql`${games.homeTeamId} = ${teamId} OR ${games.awayTeamId} = ${teamId}`
      ),
      with: {
        boxScoreStats: true
      }
    });
    
    if (teamGames.length < this.minGamesForCalculation) {
      return null;
    }
    
    // This is a simplified version - full implementation would use the iterative process
    const performances = teamGames.map(game => {
      const teamStats = game.boxScoreStats?.find(s => s.teamId === teamId);
      const opponentId = game.homeTeamId === teamId ? game.awayTeamId : game.homeTeamId;
      
      if (!teamStats) return null;
      
      return this.createGamePerformanceRecord(
        game,
        teamStats,
        game.boxScoreStats?.find(s => s.teamId === opponentId),
        game.homeTeamId === teamId
      );
    }).filter(p => p !== null) as GamePerformanceRecord[];
    
    if (performances.length === 0) {
      return null;
    }
    
    const efficiency = this.calculateMetricEfficiency(performances, metric);
    
    return {
      teamId,
      metric,
      rawPerformance: performances.reduce((sum, p) => {
        switch (metric) {
          case 'totalOffense': return sum + p.totalYards;
          case 'passingOffense': return sum + p.passingYards;
          case 'rushingOffense': return sum + p.rushingYards;
          case 'scoringOffense': return sum + p.pointsScored;
          default: return sum;
        }
      }, 0) / performances.length,
      opponentBaseline: performances.reduce((sum, p) => {
        switch (metric) {
          case 'totalOffense': return sum + p.opponentTypicalYardsAllowed;
          case 'passingOffense': return sum + p.opponentTypicalPassingYardsAllowed;
          case 'rushingOffense': return sum + p.opponentTypicalRushingYardsAllowed;
          case 'scoringOffense': return sum + p.opponentTypicalPointsAllowed;
          default: return sum;
        }
      }, 0) / performances.length,
      opponentQualityAdjustment: performances.reduce((sum, p) => sum + p.opponentStrengthAdjustment, 0) / performances.length,
      finalEfficiency: efficiency
    };
  }

  /**
   * Determines if calculations have converged based on change thresholds
   */
  determineConvergence(
    previousRatings: Map<number, AdvancedTeamEfficiencyProfile>,
    currentRatings: Map<number, AdvancedTeamEfficiencyProfile>
  ): boolean {
    
    let maxChange = 0;
    
    for (const [teamId, currentProfile] of currentRatings) {
      const previousProfile = previousRatings.get(teamId);
      if (!previousProfile) continue;
      
      const changes = [
        Math.abs(currentProfile.totalOffenseEfficiency - previousProfile.totalOffenseEfficiency),
        Math.abs(currentProfile.passingOffenseEfficiency - previousProfile.passingOffenseEfficiency),
        Math.abs(currentProfile.rushingOffenseEfficiency - previousProfile.rushingOffenseEfficiency),
        Math.abs(currentProfile.scoringOffenseEfficiency - previousProfile.scoringOffenseEfficiency)
      ];
      
      maxChange = Math.max(maxChange, ...changes);
    }
    
    return maxChange < this.convergenceThreshold;
  }
}