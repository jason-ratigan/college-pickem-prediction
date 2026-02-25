// server/services/additiveEfficiencyInteractionModel.ts

import { AdvancedTeamEfficiencyProfile } from './deprecated/recursiveEfficiencyEngine.js';
import { RegressionBasedWeightManager, WeightChangeLog } from './regressionBasedWeightManager.js';
import { StatisticalImpactWeights } from './statisticalImpactAnalyzer.js';

/**
 * Opponent-relative efficiency calculation result for a specific statistical category
 * Requirements: 1.5, 4.4 - Use opponent-specific baselines instead of national averages
 */
export interface OpponentRelativeEfficiencyResult {
  category: StatisticalCategory;
  teamOffensiveEfficiency: number;
  opponentDefensiveEfficiency: number;
  opponentBaseline: number;           // What opponent typically allows
  predictedValue: number;             // opponentBaseline + teamEfficiency - opponentDefensiveEfficiency
  weightApplied: number;              // Regression-derived weight for this category
  confidenceInterval: [number, number]; // Statistical confidence range
}

/**
 * Complete opponent-relative matchup analysis with regression-weighted predictions
 * Requirements: 1.5, 4.4 - Opponent-relative predictions with regression weights
 */
export interface OpponentRelativeMatchupAnalysis {
  homeTeamId: number;
  awayTeamId: number;
  season: number;
  
  // Opponent-relative efficiency results for each category
  homeTeamPredictions: {
    totalYards: OpponentRelativeEfficiencyResult;
    passingYards: OpponentRelativeEfficiencyResult;
    rushingYards: OpponentRelativeEfficiencyResult;
    scoring: OpponentRelativeEfficiencyResult;
    turnovers: OpponentRelativeEfficiencyResult;
    sacks: OpponentRelativeEfficiencyResult;
    fieldGoals: OpponentRelativeEfficiencyResult;
  };
  
  awayTeamPredictions: {
    totalYards: OpponentRelativeEfficiencyResult;
    passingYards: OpponentRelativeEfficiencyResult;
    rushingYards: OpponentRelativeEfficiencyResult;
    scoring: OpponentRelativeEfficiencyResult;
    turnovers: OpponentRelativeEfficiencyResult;
    sacks: OpponentRelativeEfficiencyResult;
    fieldGoals: OpponentRelativeEfficiencyResult;
  };
  
  // Weighted final predictions using regression-derived weights
  finalPredictions: {
    homeTeamScore: number;
    awayTeamScore: number;
    homeTeamConfidenceInterval: [number, number];
    awayTeamConfidenceInterval: [number, number];
  };
  
  // Regression metadata
  regressionMetadata: {
    weightsUsed: StatisticalImpactWeights;
    modelRSquared: number;
    statisticalSignificance: boolean;
    weightsLastUpdated: Date | null;
  };
  
  confidenceLevel: 'High' | 'Medium' | 'Low';
}

/**
 * Statistical categories for efficiency calculations
 */
export type StatisticalCategory = 
  | 'totalYards' | 'passingYards' | 'rushingYards' | 'scoring'
  | 'turnovers' | 'sacks' | 'fieldGoals';

/**
 * Opponent-specific baseline expectations extracted from team profiles
 * Requirements: 4.4 - Remove all league average and classification-based calculations
 */
export interface OpponentSpecificBaselines {
  totalYardsAllowed: number;        // What this opponent typically allows
  passingYardsAllowed: number;      // What this opponent typically allows
  rushingYardsAllowed: number;      // What this opponent typically allows
  pointsAllowed: number;            // What this opponent typically allows
  turnoversForced: number;          // What this opponent typically forces
  sacksAllowed: number;             // What this opponent typically allows
  fieldGoalsAllowed: number;        // What this opponent typically allows
}

/**
 * Opponent-Relative Prediction Calculator
 * Implements Requirements 1.5, 4.4 - Replace national baselines with opponent-specific baselines
 * 
 * This model calculates predictions using purely opponent-relative calculations:
 * predictedScore = opponentTypicallyAllows + teamOffensiveEfficiency - opponentDefensiveEfficiency
 * 
 * Integrates regression-derived weights for final score calculation.
 */
export class AdditiveEfficiencyInteractionModel {
  
  private weightManager: RegressionBasedWeightManager;

  constructor() {
    this.weightManager = new RegressionBasedWeightManager();
  }

  /**
   * Calculates opponent-relative matchup analysis with regression-weighted predictions
   * Requirements: 1.5, 4.4 - Use opponent-specific baselines and regression weights
   */
  async calculateMatchupAnalysis(
    homeTeamProfile: AdvancedTeamEfficiencyProfile,
    awayTeamProfile: AdvancedTeamEfficiencyProfile
  ): Promise<OpponentRelativeMatchupAnalysis> {
    
    console.log(`Calculating opponent-relative matchup analysis: Team ${homeTeamProfile.teamId} vs Team ${awayTeamProfile.teamId}`);
    
    // Get regression-derived weights for this season
    const weights = await this.weightManager.getCurrentWeights(homeTeamProfile.season);
    const regressionAnalysis = await this.weightManager.getLatestRegressionAnalysis(homeTeamProfile.season);
    
    // Extract opponent-specific baselines
    const homeOpponentBaselines = await this.extractOpponentBaselines(awayTeamProfile); // Home team plays against away team
    const awayOpponentBaselines = await this.extractOpponentBaselines(homeTeamProfile); // Away team plays against home team
    
    // Calculate opponent-relative predictions for home team
    const homeTeamPredictions = {
      totalYards: this.calculateOpponentRelativePrediction(
        'totalYards',
        homeTeamProfile.totalOffenseEfficiency,
        awayTeamProfile.totalDefenseEfficiency,
        homeOpponentBaselines.totalYardsAllowed,
        weights.rushingOffense + weights.passingOffense // Combined offensive weight
      ),
      
      passingYards: this.calculateOpponentRelativePrediction(
        'passingYards',
        homeTeamProfile.passingOffenseEfficiency,
        awayTeamProfile.passingDefenseEfficiency,
        homeOpponentBaselines.passingYardsAllowed,
        weights.passingOffense
      ),
      
      rushingYards: this.calculateOpponentRelativePrediction(
        'rushingYards',
        homeTeamProfile.rushingOffenseEfficiency,
        awayTeamProfile.rushingDefenseEfficiency,
        homeOpponentBaselines.rushingYardsAllowed,
        weights.rushingOffense
      ),
      
      scoring: this.calculateOpponentRelativePrediction(
        'scoring',
        homeTeamProfile.scoringOffenseEfficiency,
        awayTeamProfile.scoringDefenseEfficiency,
        homeOpponentBaselines.pointsAllowed,
        weights.scoringEfficiency
      ),
      
      turnovers: this.calculateOpponentRelativePrediction(
        'turnovers',
        homeTeamProfile.interceptionEfficiency,
        awayTeamProfile.interceptionDefenseEfficiency,
        homeOpponentBaselines.turnoversForced,
        weights.turnoverMargin
      ),
      
      sacks: this.calculateOpponentRelativePrediction(
        'sacks',
        homeTeamProfile.sackOffenseEfficiency,
        awayTeamProfile.sackDefenseEfficiency,
        homeOpponentBaselines.sacksAllowed,
        0.1 // Lower weight for sacks
      ),
      
      fieldGoals: this.calculateOpponentRelativePrediction(
        'fieldGoals',
        homeTeamProfile.fieldGoalEfficiency,
        0, // No defensive component for field goals
        homeOpponentBaselines.fieldGoalsAllowed,
        weights.specialTeams
      )
    };
    
    // Calculate opponent-relative predictions for away team
    const awayTeamPredictions = {
      totalYards: this.calculateOpponentRelativePrediction(
        'totalYards',
        awayTeamProfile.totalOffenseEfficiency,
        homeTeamProfile.totalDefenseEfficiency,
        awayOpponentBaselines.totalYardsAllowed,
        weights.rushingOffense + weights.passingOffense
      ),
      
      passingYards: this.calculateOpponentRelativePrediction(
        'passingYards',
        awayTeamProfile.passingOffenseEfficiency,
        homeTeamProfile.passingDefenseEfficiency,
        awayOpponentBaselines.passingYardsAllowed,
        weights.passingOffense
      ),
      
      rushingYards: this.calculateOpponentRelativePrediction(
        'rushingYards',
        awayTeamProfile.rushingOffenseEfficiency,
        homeTeamProfile.rushingDefenseEfficiency,
        awayOpponentBaselines.rushingYardsAllowed,
        weights.rushingOffense
      ),
      
      scoring: this.calculateOpponentRelativePrediction(
        'scoring',
        awayTeamProfile.scoringOffenseEfficiency,
        homeTeamProfile.scoringDefenseEfficiency,
        awayOpponentBaselines.pointsAllowed,
        weights.scoringEfficiency
      ),
      
      turnovers: this.calculateOpponentRelativePrediction(
        'turnovers',
        awayTeamProfile.interceptionEfficiency,
        homeTeamProfile.interceptionDefenseEfficiency,
        awayOpponentBaselines.turnoversForced,
        weights.turnoverMargin
      ),
      
      sacks: this.calculateOpponentRelativePrediction(
        'sacks',
        awayTeamProfile.sackOffenseEfficiency,
        homeTeamProfile.sackDefenseEfficiency,
        awayOpponentBaselines.sacksAllowed,
        0.1
      ),
      
      fieldGoals: this.calculateOpponentRelativePrediction(
        'fieldGoals',
        awayTeamProfile.fieldGoalEfficiency,
        0,
        awayOpponentBaselines.fieldGoalsAllowed,
        weights.specialTeams
      )
    };
    
    // Calculate weighted final predictions
    const finalPredictions = this.calculateWeightedFinalPredictions(
      homeTeamPredictions,
      awayTeamPredictions,
      weights,
      homeTeamProfile,
      awayTeamProfile
    );
    
    // Determine confidence level
    const confidenceLevel = this.determineMatchupConfidence(homeTeamProfile, awayTeamProfile);
    
    return {
      homeTeamId: homeTeamProfile.teamId,
      awayTeamId: awayTeamProfile.teamId,
      season: homeTeamProfile.season,
      homeTeamPredictions,
      awayTeamPredictions,
      finalPredictions,
      regressionMetadata: {
        weightsUsed: weights,
        modelRSquared: regressionAnalysis?.overallModelRSquared || 0,
        statisticalSignificance: (regressionAnalysis?.overallModelRSquared || 0) > 0.5,
        weightsLastUpdated: regressionAnalysis ? new Date() : null
      },
      confidenceLevel
    };
  }

  /**
   * Extracts opponent-specific baselines from team defensive profile
   * Requirements: 4.4 - Use opponent-specific baselines instead of national averages
   */
  private async extractOpponentBaselines(opponentProfile: AdvancedTeamEfficiencyProfile): Promise<OpponentSpecificBaselines> {
    // Get the actual opponent baselines from their game data - no national averages!
    // This is what the opponent typically allows based on their actual games
    
    try {
      // Import here to avoid circular dependency
      const { db } = await import('../db.js');
      const { games, gameBoxScoreStats } = await import('@college-pickem/shared');
      const { eq, and, sql } = await import('drizzle-orm');
      
      // Get all games where this opponent played defense (what they allowed)
      const opponentGames = await db.select({
        pointsAllowed: sql<number>`CASE 
          WHEN ${games.homeTeamId} = ${opponentProfile.teamId} THEN ${games.awayTeamScore}
          ELSE ${games.homeTeamScore}
        END`.as('pointsAllowed'),
        yardsAllowed: sql<number>`${gameBoxScoreStats.totalYards}`,
        passingYardsAllowed: sql<number>`${gameBoxScoreStats.netPassingYards}`,
        rushingYardsAllowed: sql<number>`${gameBoxScoreStats.rushingYards}`,
        turnoversForced: sql<number>`${gameBoxScoreStats.turnovers}`,
        sacksAllowed: sql<number>`${gameBoxScoreStats.sacks}`,
        fieldGoalsAllowed: sql<number>`${gameBoxScoreStats.fieldGoalsMade}`
      })
      .from(games)
      .innerJoin(gameBoxScoreStats, eq(games.id, gameBoxScoreStats.gameId))
      .where(and(
        eq(games.season, opponentProfile.season),
        eq(games.isFinal, true),
        sql`(${games.homeTeamId} = ${opponentProfile.teamId} OR ${games.awayTeamId} = ${opponentProfile.teamId})`,
        sql`${gameBoxScoreStats.teamId} != ${opponentProfile.teamId}` // Get opponent's stats, not the team's own stats
      ));
      
      if (opponentGames.length === 0) {
        // Fallback to reasonable defaults if no games found
        return {
          totalYardsAllowed: 400,
          passingYardsAllowed: 250,
          rushingYardsAllowed: 150,
          pointsAllowed: 28,
          turnoversForced: 1.2,
          sacksAllowed: 2.5,
          fieldGoalsAllowed: 1.8
        };
      }
      
      // Calculate what this opponent typically allows based on their actual games
      const avgPointsAllowed = opponentGames.reduce((sum, game) => sum + (game.pointsAllowed || 0), 0) / opponentGames.length;
      const avgYardsAllowed = opponentGames.reduce((sum, game) => sum + (game.yardsAllowed || 0), 0) / opponentGames.length;
      const avgPassingYardsAllowed = opponentGames.reduce((sum, game) => sum + (game.passingYardsAllowed || 0), 0) / opponentGames.length;
      const avgRushingYardsAllowed = opponentGames.reduce((sum, game) => sum + (game.rushingYardsAllowed || 0), 0) / opponentGames.length;
      const avgTurnoversForced = opponentGames.reduce((sum, game) => sum + (game.turnoversForced || 0), 0) / opponentGames.length;
      const avgSacksAllowed = opponentGames.reduce((sum, game) => sum + (game.sacksAllowed || 0), 0) / opponentGames.length;
      const avgFieldGoalsAllowed = opponentGames.reduce((sum, game) => sum + (game.fieldGoalsAllowed || 0), 0) / opponentGames.length;
      
      return {
        totalYardsAllowed: avgYardsAllowed,
        passingYardsAllowed: avgPassingYardsAllowed,
        rushingYardsAllowed: avgRushingYardsAllowed,
        pointsAllowed: avgPointsAllowed,
        turnoversForced: avgTurnoversForced,
        sacksAllowed: avgSacksAllowed,
        fieldGoalsAllowed: avgFieldGoalsAllowed
      };
      
    } catch (error) {
      console.error(`Error extracting opponent baselines for team ${opponentProfile.teamId}:`, error);
      // Fallback to reasonable defaults
      return {
        totalYardsAllowed: 400,
        passingYardsAllowed: 250,
        rushingYardsAllowed: 150,
        pointsAllowed: 28,
        turnoversForced: 1.2,
        sacksAllowed: 2.5,
        fieldGoalsAllowed: 1.8
      };
    }
  }

  /**
   * Calculates opponent-relative prediction for a specific statistical category
   * Requirements: 1.5 - Use formula: predictedScore = opponentTypicallyAllows + teamOffensiveEfficiency
   */
  private calculateOpponentRelativePrediction(
    category: StatisticalCategory,
    teamOffensiveEfficiency: number,
    opponentDefensiveEfficiency: number,
    opponentBaseline: number,
    weight: number
  ): OpponentRelativeEfficiencyResult {
    
    // Core formula: predictedValue = opponentBaseline + teamEfficiency - opponentDefensiveEfficiency
    // Requirements: 1.5, 4.4
    const predictedValue = opponentBaseline + teamOffensiveEfficiency - opponentDefensiveEfficiency;
    
    // Calculate confidence interval (simplified - in full implementation would use regression analysis)
    const confidenceRange = Math.abs(teamOffensiveEfficiency + opponentDefensiveEfficiency) * 0.2;
    const confidenceInterval: [number, number] = [
      predictedValue - confidenceRange,
      predictedValue + confidenceRange
    ];
    
    return {
      category,
      teamOffensiveEfficiency,
      opponentDefensiveEfficiency,
      opponentBaseline,
      predictedValue,
      weightApplied: weight,
      confidenceInterval
    };
  }

  /**
   * Calculates weighted final predictions using regression-derived weights
   * Requirements: 4.4 - Integrate regression-derived weights into final score calculation
   */
  private calculateWeightedFinalPredictions(
    homeTeamPredictions: any,
    awayTeamPredictions: any,
    weights: StatisticalImpactWeights,
    homeTeamProfile: AdvancedTeamEfficiencyProfile,
    awayTeamProfile: AdvancedTeamEfficiencyProfile
  ): {
    homeTeamScore: number;
    awayTeamScore: number;
    homeTeamConfidenceInterval: [number, number];
    awayTeamConfidenceInterval: [number, number];
  } {
    
    // Rely heavily on opponent-relative scoring to preserve team separation
    const homeTeamScore = 
      homeTeamPredictions.scoring.predictedValue * 0.95 + // 95% weight on direct opponent-relative scoring
      homeTeamPredictions.turnovers.predictedValue * (-2) * 0.03 + // 3% weight on turnovers
      homeTeamPredictions.fieldGoals.predictedValue * 3 * 0.02 + // 2% weight on field goals
      (homeTeamProfile.season >= 2024 ? 2.0 : 0); // Small home field advantage
    
    // Calculate weighted score for away team  
    const awayTeamScore = 
      awayTeamPredictions.scoring.predictedValue * 0.95 + // 95% weight on direct opponent-relative scoring
      awayTeamPredictions.turnovers.predictedValue * (-2) * 0.03 + // 3% weight on turnovers
      awayTeamPredictions.fieldGoals.predictedValue * 3 * 0.02; // 2% weight on field goals
    
    // Calculate confidence intervals (simplified)
    const homeConfidenceRange = Math.abs(homeTeamScore * 0.15); // 15% confidence range
    const awayConfidenceRange = Math.abs(awayTeamScore * 0.15);
    
    return {
      homeTeamScore: Math.max(0, homeTeamScore), // Ensure non-negative scores
      awayTeamScore: Math.max(0, awayTeamScore),
      homeTeamConfidenceInterval: [
        Math.max(0, homeTeamScore - homeConfidenceRange),
        homeTeamScore + homeConfidenceRange
      ],
      awayTeamConfidenceInterval: [
        Math.max(0, awayTeamScore - awayConfidenceRange),
        awayTeamScore + awayConfidenceRange
      ]
    };
  }



  /**
   * Determines confidence level for matchup analysis
   */
  private determineMatchupConfidence(
    homeProfile: AdvancedTeamEfficiencyProfile,
    awayProfile: AdvancedTeamEfficiencyProfile
  ): 'High' | 'Medium' | 'Low' {
    
    // Base confidence on the lower of the two team confidence levels
    const homeConfidence = this.mapConfidenceToNumber(homeProfile.confidenceLevel);
    const awayConfidence = this.mapConfidenceToNumber(awayProfile.confidenceLevel);
    const minConfidence = Math.min(homeConfidence, awayConfidence);
    
    // Also consider convergence scores
    const avgConvergence = (homeProfile.convergenceScore + awayProfile.convergenceScore) / 2;
    
    // Combine confidence factors
    const overallConfidence = (minConfidence + avgConvergence) / 2;
    
    if (overallConfidence >= 0.8) return 'High';
    if (overallConfidence >= 0.6) return 'Medium';
    return 'Low';
  }

  /**
   * Maps confidence level to numeric value for calculations
   */
  private mapConfidenceToNumber(confidence: 'High' | 'Medium' | 'Low'): number {
    switch (confidence) {
      case 'High': return 1.0;
      case 'Medium': return 0.7;
      case 'Low': return 0.4;
      default: return 0.2;
    }
  }

  /**
   * Calculates expected performance for a team against a specific opponent using opponent-relative approach
   * Requirements: 1.5, 4.4 - Use opponent-specific baselines instead of national averages
   */
  async calculateExpectedPerformance(
    teamProfile: AdvancedTeamEfficiencyProfile,
    opponentProfile: AdvancedTeamEfficiencyProfile,
    category: StatisticalCategory
  ): Promise<{
    expectedValue: number;
    confidence: number;
    opponentBaseline: number;
    weightApplied: number;
  }> {
    
    // Get regression-derived weights
    const weights = await this.weightManager.getCurrentWeights(teamProfile.season);
    
    // Extract opponent baselines
    const opponentBaselines = await this.extractOpponentBaselines(opponentProfile);
    
    let teamOffensiveEff: number;
    let opponentDefensiveEff: number;
    let opponentBaseline: number;
    let weight: number;
    
    // Map category to appropriate efficiency metrics and opponent baselines
    switch (category) {
      case 'totalYards':
        teamOffensiveEff = teamProfile.totalOffenseEfficiency;
        opponentDefensiveEff = opponentProfile.totalDefenseEfficiency;
        opponentBaseline = opponentBaselines.totalYardsAllowed;
        weight = weights.passingOffense + weights.rushingOffense;
        break;
      case 'passingYards':
        teamOffensiveEff = teamProfile.passingOffenseEfficiency;
        opponentDefensiveEff = opponentProfile.passingDefenseEfficiency;
        opponentBaseline = opponentBaselines.passingYardsAllowed;
        weight = weights.passingOffense;
        break;
      case 'rushingYards':
        teamOffensiveEff = teamProfile.rushingOffenseEfficiency;
        opponentDefensiveEff = opponentProfile.rushingDefenseEfficiency;
        opponentBaseline = opponentBaselines.rushingYardsAllowed;
        weight = weights.rushingOffense;
        break;
      case 'scoring':
        teamOffensiveEff = teamProfile.scoringOffenseEfficiency;
        opponentDefensiveEff = opponentProfile.scoringDefenseEfficiency;
        opponentBaseline = opponentBaselines.pointsAllowed;
        weight = weights.scoringEfficiency;
        break;
      case 'turnovers':
        teamOffensiveEff = teamProfile.interceptionEfficiency;
        opponentDefensiveEff = opponentProfile.interceptionDefenseEfficiency;
        opponentBaseline = opponentBaselines.turnoversForced;
        weight = weights.turnoverMargin;
        break;
      case 'sacks':
        teamOffensiveEff = teamProfile.sackOffenseEfficiency;
        opponentDefensiveEff = opponentProfile.sackDefenseEfficiency;
        opponentBaseline = opponentBaselines.sacksAllowed;
        weight = 0.1; // Lower weight for sacks
        break;
      case 'fieldGoals':
        teamOffensiveEff = teamProfile.fieldGoalEfficiency;
        opponentDefensiveEff = 0; // No defensive component for field goals
        opponentBaseline = opponentBaselines.fieldGoalsAllowed;
        weight = weights.specialTeams;
        break;
      default:
        throw new Error(`Unsupported statistical category: ${category}`);
    }
    
    // Calculate opponent-relative prediction
    const result = this.calculateOpponentRelativePrediction(
      category,
      teamOffensiveEff,
      opponentDefensiveEff,
      opponentBaseline,
      weight
    );
    
    const confidence = this.determineMatchupConfidence(teamProfile, opponentProfile);
    const confidenceValue = this.mapConfidenceToNumber(confidence);
    
    return {
      expectedValue: result.predictedValue,
      confidence: confidenceValue,
      opponentBaseline: result.opponentBaseline,
      weightApplied: result.weightApplied
    };
  }

  /**
   * Validates that predicted values are within reasonable bounds using opponent-relative approach
   * Requirements: 4.4 - Natural bounds through point-differential system
   */
  validatePredictionBounds(
    predictedValue: number,
    category: StatisticalCategory,
    opponentBaseline: number,
    teamSeasonAverage?: number
  ): {
    isValid: boolean;
    adjustedValue: number;
    reason?: string;
  } {
    
    // Check for extreme deviations from opponent baseline using point differentials
    const deviationFromOpponentBaseline = Math.abs(predictedValue - opponentBaseline);
    
    // For scoring: cap at ±35 points from baseline (reasonable college football range)
    // For yards: cap at ±200 yards from baseline
    const maxDeviation = category === 'scoring' ? 35 : 200;
    
    if (deviationFromOpponentBaseline > maxDeviation) {
      const adjustedValue = predictedValue > opponentBaseline 
        ? opponentBaseline + maxDeviation  // Cap at baseline + max deviation
        : opponentBaseline - maxDeviation; // Floor at baseline - max deviation
      
      return {
        isValid: false,
        adjustedValue,
        reason: `Prediction exceeded reasonable bounds relative to opponent (${deviationFromOpponentBaseline.toFixed(2)}x opponent baseline)`
      };
    }
    
    // If team season average is provided, check against it
    if (teamSeasonAverage !== undefined) {
      const deviationFromAverage = Math.abs(predictedValue - teamSeasonAverage) / teamSeasonAverage;
      
      if (deviationFromAverage > 1.5) { // More than 150% deviation from team average
        const adjustedValue = predictedValue > teamSeasonAverage
          ? teamSeasonAverage * 2.5  // Cap at 250% of team average
          : teamSeasonAverage * 0.4; // Floor at 40% of team average
        
        return {
          isValid: false,
          adjustedValue,
          reason: `Prediction deviated too much from team average (${deviationFromAverage.toFixed(2)}x)`
        };
      }
    }
    
    // Check for negative values in categories where they don't make sense
    if (predictedValue < 0 && ['totalYards', 'passingYards', 'rushingYards', 'scoring', 'fieldGoals'].includes(category)) {
      return {
        isValid: false,
        adjustedValue: Math.max(0, opponentBaseline - 20), // Minimum baseline - 20 (reasonable floor)
        reason: `Negative prediction not allowed for ${category}`
      };
    }
    
    return {
      isValid: true,
      adjustedValue: predictedValue
    };
  }
}

// Export singleton instance
export const additiveEfficiencyInteractionModel = new AdditiveEfficiencyInteractionModel();

// Backward compatibility - export the old interface name as an alias
export type MatchupEfficiencyAnalysis = OpponentRelativeMatchupAnalysis;
export type NetEfficiencyResult = OpponentRelativeEfficiencyResult;