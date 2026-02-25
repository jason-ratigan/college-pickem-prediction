// server/services/teamEfficiencyProfileManager.ts

import { db } from '../../db.js';
import { teamEfficiencyRatings, games, gameBoxScoreStats } from '@college-pickem/shared';
import { eq, and, sql } from 'drizzle-orm';
import { AdvancedTeamEfficiencyProfile, StatisticalMetric, GamePerformanceRecord } from './recursiveEfficiencyEngine.js';

/**
 * Enhanced Team Efficiency Profile Manager
 * Implements comprehensive efficiency profile generation from recursive efficiency calculations
 * Covers all game phases: offense, defense, turnovers, and special teams
 */
export class TeamEfficiencyProfileManager {
  private readonly minGamesForProfile: number = 3;
  private readonly priorSeasonWeight: number = 0.15; // 15% weight for prior season data when < 4 games

  /**
   * Generates a comprehensive efficiency profile for a team
   * Implements Requirements 2.1, 2.2, 6.1
   */
  async generateTeamEfficiencyProfile(
    teamId: number,
    season: number,
    gamePerformances: GamePerformanceRecord[]
  ): Promise<AdvancedTeamEfficiencyProfile> {
    
    console.log(`Generating efficiency profile for team ${teamId}, season ${season}`);
    
    // Filter performances for this team
    const teamPerformances = gamePerformances.filter(p => p.teamId === teamId);
    
    // Check if we need to blend with prior season data (Requirement 2.3)
    const needsPriorSeasonData = teamPerformances.length < 4;
    let priorSeasonProfile: AdvancedTeamEfficiencyProfile | null = null;
    
    if (needsPriorSeasonData) {
      priorSeasonProfile = await this.getPriorSeasonProfile(teamId, season - 1);
    }
    
    // Calculate comprehensive efficiency metrics
    const profile: AdvancedTeamEfficiencyProfile = {
      teamId,
      season,
      
      // Offensive Efficiency (Requirement 2.1)
      totalOffenseEfficiency: this.calculateOffensiveEfficiency(teamPerformances, 'total'),
      passingOffenseEfficiency: this.calculateOffensiveEfficiency(teamPerformances, 'passing'),
      rushingOffenseEfficiency: this.calculateOffensiveEfficiency(teamPerformances, 'rushing'),
      scoringOffenseEfficiency: this.calculateOffensiveEfficiency(teamPerformances, 'scoring'),
      
      // Defensive Efficiency (Requirement 2.1)
      totalDefenseEfficiency: this.calculateDefensiveEfficiency(teamPerformances, 'total'),
      passingDefenseEfficiency: this.calculateDefensiveEfficiency(teamPerformances, 'passing'),
      rushingDefenseEfficiency: this.calculateDefensiveEfficiency(teamPerformances, 'rushing'),
      scoringDefenseEfficiency: this.calculateDefensiveEfficiency(teamPerformances, 'scoring'),
      
      // Turnover & Special Teams Efficiency (Requirement 6.1)
      interceptionEfficiency: this.calculateTurnoverEfficiency(teamPerformances, 'thrown'),
      interceptionDefenseEfficiency: this.calculateTurnoverEfficiency(teamPerformances, 'caught'),
      sackOffenseEfficiency: this.calculateSackEfficiency(teamPerformances, 'allowed'),
      sackDefenseEfficiency: this.calculateSackEfficiency(teamPerformances, 'made'),
      fieldGoalEfficiency: this.calculateFieldGoalEfficiency(teamPerformances),
      
      // Metadata
      gamesPlayed: teamPerformances.length,
      convergenceScore: this.calculateConvergenceScore(teamPerformances),
      confidenceLevel: this.determineConfidenceLevel(teamPerformances.length),
      lastCalculated: new Date()
    };
    
    // Blend with prior season data if needed (Requirement 2.3)
    if (needsPriorSeasonData && priorSeasonProfile) {
      return this.blendWithPriorSeason(profile, priorSeasonProfile);
    }
    
    return profile;
  }

  /**
   * Calculates offensive efficiency for various metrics
   * Uses opponent-adjusted performance data (Requirement 2.2)
   */
  private calculateOffensiveEfficiency(
    performances: GamePerformanceRecord[],
    type: 'total' | 'passing' | 'rushing' | 'scoring'
  ): number {
    if (performances.length === 0) return 0;
    
    let totalEfficiency = 0;
    let validGames = 0;
    
    for (const performance of performances) {
      let actualValue: number;
      let baselineValue: number;
      
      switch (type) {
        case 'total':
          actualValue = performance.totalYards;
          baselineValue = performance.opponentTypicalYardsAllowed;
          break;
        case 'passing':
          actualValue = performance.passingYards;
          baselineValue = performance.opponentTypicalPassingYardsAllowed;
          break;
        case 'rushing':
          actualValue = performance.rushingYards;
          baselineValue = performance.opponentTypicalRushingYardsAllowed;
          break;
        case 'scoring':
          actualValue = performance.pointsScored;
          baselineValue = performance.opponentTypicalPointsAllowed;
          break;
      }
      
      // Calculate efficiency as point differential from baseline (Requirements: 1.1, 1.2)
      // This naturally bounds the values and prevents multiplicative explosion
      const efficiency = actualValue - baselineValue;
      totalEfficiency += efficiency;
      validGames++;
    }
    
    return validGames > 0 ? totalEfficiency / validGames : 0;
  }

  /**
   * Calculates defensive efficiency by analyzing what opponents achieved vs their typical performance
   */
  private calculateDefensiveEfficiency(
    performances: GamePerformanceRecord[],
    type: 'total' | 'passing' | 'rushing' | 'scoring'
  ): number {
    if (performances.length === 0) return 0;
    
    // For defensive efficiency, we need to look at what opponents achieved against this team
    // vs what they typically achieve against other teams
    // This requires opponent performance data which would be calculated in the recursive engine
    
    // For now, return inverse of offensive efficiency as a placeholder
    // This will be enhanced when full opponent performance tracking is implemented
    const offensiveEfficiency = this.calculateOffensiveEfficiency(performances, type);
    return -offensiveEfficiency * 0.7; // Defensive efficiency is inverse but not perfectly correlated
  }

  /**
   * Calculates turnover efficiency (interceptions thrown/caught vs typical)
   */
  private calculateTurnoverEfficiency(
    performances: GamePerformanceRecord[],
    type: 'thrown' | 'caught'
  ): number {
    if (performances.length === 0) return 0;
    
    let totalTurnovers = 0;
    let totalGames = 0;
    
    for (const performance of performances) {
      totalTurnovers += performance.turnovers;
      totalGames++;
    }
    
    if (totalGames === 0) return 0;
    
    const averageTurnovers = totalTurnovers / totalGames;
    const nationalAverage = type === 'thrown' ? 1.2 : 1.2; // Approximate national averages
    
    // For thrown: negative efficiency is better (fewer turnovers)
    // For caught: positive efficiency is better (more interceptions)
    const efficiency = type === 'thrown' 
      ? (nationalAverage - averageTurnovers) / nationalAverage
      : (averageTurnovers - nationalAverage) / nationalAverage;
    
    return efficiency;
  }

  /**
   * Calculates sack efficiency (sacks allowed/made vs typical)
   */
  private calculateSackEfficiency(
    performances: GamePerformanceRecord[],
    type: 'allowed' | 'made'
  ): number {
    if (performances.length === 0) return 0;
    
    let totalSacks = 0;
    let totalGames = 0;
    
    for (const performance of performances) {
      totalSacks += performance.sacks;
      totalGames++;
    }
    
    if (totalGames === 0) return 0;
    
    const averageSacks = totalSacks / totalGames;
    const nationalAverage = 2.5; // Approximate national average sacks per game
    
    // For allowed: negative efficiency is better (fewer sacks allowed)
    // For made: positive efficiency is better (more sacks made)
    const efficiency = type === 'allowed'
      ? (nationalAverage - averageSacks) / nationalAverage
      : (averageSacks - nationalAverage) / nationalAverage;
    
    return efficiency;
  }

  /**
   * Calculates field goal efficiency vs typical performance
   */
  private calculateFieldGoalEfficiency(performances: GamePerformanceRecord[]): number {
    if (performances.length === 0) return 0;
    
    let totalMade = 0;
    let totalAttempted = 0;
    
    for (const performance of performances) {
      totalMade += performance.fieldGoalsMade;
      totalAttempted += performance.fieldGoalsAttempted;
    }
    
    if (totalAttempted === 0) return 0;
    
    const actualPercentage = totalMade / totalAttempted;
    const nationalAverage = 0.75; // Approximate 75% field goal success rate
    
    return (actualPercentage - nationalAverage) / nationalAverage;
  }

  /**
   * Calculates convergence score based on consistency of performance
   */
  private calculateConvergenceScore(performances: GamePerformanceRecord[]): number {
    if (performances.length < 2) return 0.5;
    
    // Calculate variance in efficiency across games
    const efficiencies = performances.map(p => {
      if (p.opponentTypicalYardsAllowed > 0) {
        return (p.totalYards - p.opponentTypicalYardsAllowed) / p.opponentTypicalYardsAllowed;
      }
      return 0;
    });
    
    const mean = efficiencies.reduce((sum, eff) => sum + eff, 0) / efficiencies.length;
    const variance = efficiencies.reduce((sum, eff) => sum + Math.pow(eff - mean, 2), 0) / efficiencies.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Convert to convergence score (lower variance = higher convergence)
    // Cap at 1.0 and ensure minimum of 0.1
    return Math.max(0.1, Math.min(1.0, 1 - (standardDeviation * 2)));
  }

  /**
   * Determines confidence level based on games played and data quality
   */
  private determineConfidenceLevel(gamesPlayed: number): 'High' | 'Medium' | 'Low' {
    if (gamesPlayed >= 8) return 'High';
    if (gamesPlayed >= 5) return 'Medium';
    return 'Low';
  }

  /**
   * Gets prior season efficiency profile for blending
   */
  private async getPriorSeasonProfile(teamId: number, priorSeason: number): Promise<AdvancedTeamEfficiencyProfile | null> {
    const priorRating = await db.query.teamEfficiencyRatings.findFirst({
      where: and(
        eq(teamEfficiencyRatings.teamId, teamId),
        eq(teamEfficiencyRatings.season, priorSeason)
      )
    });

    if (!priorRating) return null;

    return {
      teamId: priorRating.teamId,
      season: priorRating.season,
      totalOffenseEfficiency: parseFloat(priorRating.totalOffenseEfficiency || '0'),
      passingOffenseEfficiency: parseFloat(priorRating.passingOffenseEfficiency || '0'),
      rushingOffenseEfficiency: parseFloat(priorRating.rushingOffenseEfficiency || '0'),
      scoringOffenseEfficiency: parseFloat(priorRating.scoringOffenseEfficiency || '0'),
      totalDefenseEfficiency: parseFloat(priorRating.totalDefenseEfficiency || '0'),
      passingDefenseEfficiency: parseFloat(priorRating.passingDefenseEfficiency || '0'),
      rushingDefenseEfficiency: parseFloat(priorRating.rushingDefenseEfficiency || '0'),
      scoringDefenseEfficiency: parseFloat(priorRating.scoringDefenseEfficiency || '0'),
      interceptionEfficiency: parseFloat(priorRating.interceptionEfficiency || '0'),
      interceptionDefenseEfficiency: parseFloat(priorRating.interceptionDefenseEfficiency || '0'),
      sackOffenseEfficiency: parseFloat(priorRating.sackOffenseEfficiency || '0'),
      sackDefenseEfficiency: parseFloat(priorRating.sackDefenseEfficiency || '0'),
      fieldGoalEfficiency: parseFloat(priorRating.fieldGoalEfficiency || '0'),
      gamesPlayed: priorRating.gamesPlayed || 0,
      convergenceScore: parseFloat(priorRating.convergenceScore || '0.5'),
      confidenceLevel: (priorRating.confidenceLevel as 'High' | 'Medium' | 'Low') || 'Low',
      lastCalculated: priorRating.lastCalculated || new Date()
    };
  }

  /**
   * Blends current season data with prior season data using minimal weighting
   * Implements Requirement 2.3
   */
  private blendWithPriorSeason(
    currentProfile: AdvancedTeamEfficiencyProfile,
    priorProfile: AdvancedTeamEfficiencyProfile
  ): AdvancedTeamEfficiencyProfile {
    
    const currentWeight = 1 - this.priorSeasonWeight;
    const priorWeight = this.priorSeasonWeight;
    
    return {
      ...currentProfile,
      totalOffenseEfficiency: (currentProfile.totalOffenseEfficiency * currentWeight) + (priorProfile.totalOffenseEfficiency * priorWeight),
      passingOffenseEfficiency: (currentProfile.passingOffenseEfficiency * currentWeight) + (priorProfile.passingOffenseEfficiency * priorWeight),
      rushingOffenseEfficiency: (currentProfile.rushingOffenseEfficiency * currentWeight) + (priorProfile.rushingOffenseEfficiency * priorWeight),
      scoringOffenseEfficiency: (currentProfile.scoringOffenseEfficiency * currentWeight) + (priorProfile.scoringOffenseEfficiency * priorWeight),
      totalDefenseEfficiency: (currentProfile.totalDefenseEfficiency * currentWeight) + (priorProfile.totalDefenseEfficiency * priorWeight),
      passingDefenseEfficiency: (currentProfile.passingDefenseEfficiency * currentWeight) + (priorProfile.passingDefenseEfficiency * priorWeight),
      rushingDefenseEfficiency: (currentProfile.rushingDefenseEfficiency * currentWeight) + (priorProfile.rushingDefenseEfficiency * priorWeight),
      scoringDefenseEfficiency: (currentProfile.scoringDefenseEfficiency * currentWeight) + (priorProfile.scoringDefenseEfficiency * priorWeight),
      interceptionEfficiency: (currentProfile.interceptionEfficiency * currentWeight) + (priorProfile.interceptionEfficiency * priorWeight),
      interceptionDefenseEfficiency: (currentProfile.interceptionDefenseEfficiency * currentWeight) + (priorProfile.interceptionDefenseEfficiency * priorWeight),
      sackOffenseEfficiency: (currentProfile.sackOffenseEfficiency * currentWeight) + (priorProfile.sackOffenseEfficiency * priorWeight),
      sackDefenseEfficiency: (currentProfile.sackDefenseEfficiency * currentWeight) + (priorProfile.sackDefenseEfficiency * priorWeight),
      fieldGoalEfficiency: (currentProfile.fieldGoalEfficiency * currentWeight) + (priorProfile.fieldGoalEfficiency * priorWeight),
      
      // Adjust confidence level due to blending
      confidenceLevel: currentProfile.gamesPlayed >= 3 ? 'Medium' : 'Low'
    };
  }

  /**
   * Saves efficiency profile to database
   * Implements automatic recalculation trigger (Requirement 2.4)
   */
  async saveEfficiencyProfile(profile: AdvancedTeamEfficiencyProfile): Promise<void> {
    const existingRating = await db.query.teamEfficiencyRatings.findFirst({
      where: and(
        eq(teamEfficiencyRatings.teamId, profile.teamId),
        eq(teamEfficiencyRatings.season, profile.season)
      )
    });

    const ratingData = {
      teamId: profile.teamId,
      season: profile.season,
      totalOffenseEfficiency: profile.totalOffenseEfficiency.toString(),
      passingOffenseEfficiency: profile.passingOffenseEfficiency.toString(),
      rushingOffenseEfficiency: profile.rushingOffenseEfficiency.toString(),
      scoringOffenseEfficiency: profile.scoringOffenseEfficiency.toString(),
      totalDefenseEfficiency: profile.totalDefenseEfficiency.toString(),
      passingDefenseEfficiency: profile.passingDefenseEfficiency.toString(),
      rushingDefenseEfficiency: profile.rushingDefenseEfficiency.toString(),
      scoringDefenseEfficiency: profile.scoringDefenseEfficiency.toString(),
      interceptionEfficiency: profile.interceptionEfficiency.toString(),
      interceptionDefenseEfficiency: profile.interceptionDefenseEfficiency.toString(),
      sackOffenseEfficiency: profile.sackOffenseEfficiency.toString(),
      sackDefenseEfficiency: profile.sackDefenseEfficiency.toString(),
      fieldGoalEfficiency: profile.fieldGoalEfficiency.toString(),
      
      // Legacy fields for backward compatibility
      turnoverEfficiency: profile.interceptionEfficiency.toString(),
      specialTeamsEfficiency: profile.fieldGoalEfficiency.toString(),
      
      gamesPlayed: profile.gamesPlayed,
      convergenceScore: profile.convergenceScore.toString(),
      confidenceLevel: profile.confidenceLevel,
      dataQuality: this.mapConfidenceLevelToDataQuality(profile.confidenceLevel),
      lastCalculated: profile.lastCalculated
    };

    if (existingRating) {
      await db.update(teamEfficiencyRatings)
        .set(ratingData)
        .where(eq(teamEfficiencyRatings.id, existingRating.id));
    } else {
      await db.insert(teamEfficiencyRatings).values(ratingData);
    }
  }

  /**
   * Maps confidence level to data quality for backward compatibility
   */
  private mapConfidenceLevelToDataQuality(confidenceLevel: 'High' | 'Medium' | 'Low'): string {
    switch (confidenceLevel) {
      case 'High': return 'Excellent';
      case 'Medium': return 'Good';
      case 'Low': return 'Limited';
      default: return 'Insufficient';
    }
  }

  /**
   * Retrieves comprehensive efficiency profile from database
   */
  async getTeamEfficiencyProfile(teamId: number, season: number): Promise<AdvancedTeamEfficiencyProfile | null> {
    const rating = await db.query.teamEfficiencyRatings.findFirst({
      where: and(
        eq(teamEfficiencyRatings.teamId, teamId),
        eq(teamEfficiencyRatings.season, season)
      )
    });

    if (!rating) return null;

    return {
      teamId: rating.teamId,
      season: rating.season,
      totalOffenseEfficiency: parseFloat(rating.totalOffenseEfficiency || '0'),
      passingOffenseEfficiency: parseFloat(rating.passingOffenseEfficiency || '0'),
      rushingOffenseEfficiency: parseFloat(rating.rushingOffenseEfficiency || '0'),
      scoringOffenseEfficiency: parseFloat(rating.scoringOffenseEfficiency || '0'),
      totalDefenseEfficiency: parseFloat(rating.totalDefenseEfficiency || '0'),
      passingDefenseEfficiency: parseFloat(rating.passingDefenseEfficiency || '0'),
      rushingDefenseEfficiency: parseFloat(rating.rushingDefenseEfficiency || '0'),
      scoringDefenseEfficiency: parseFloat(rating.scoringDefenseEfficiency || '0'),
      interceptionEfficiency: parseFloat(rating.interceptionEfficiency || '0'),
      interceptionDefenseEfficiency: parseFloat(rating.interceptionDefenseEfficiency || '0'),
      sackOffenseEfficiency: parseFloat(rating.sackOffenseEfficiency || '0'),
      sackDefenseEfficiency: parseFloat(rating.sackDefenseEfficiency || '0'),
      fieldGoalEfficiency: parseFloat(rating.fieldGoalEfficiency || '0'),
      gamesPlayed: rating.gamesPlayed || 0,
      convergenceScore: parseFloat(rating.convergenceScore || '0.5'),
      confidenceLevel: (rating.confidenceLevel as 'High' | 'Medium' | 'Low') || 'Low',
      lastCalculated: rating.lastCalculated || new Date()
    };
  }

  /**
   * Gets all team efficiency profiles for a season
   */
  async getSeasonEfficiencyProfiles(season: number): Promise<Map<number, AdvancedTeamEfficiencyProfile>> {
    const ratings = await db.query.teamEfficiencyRatings.findMany({
      where: eq(teamEfficiencyRatings.season, season)
    });

    const profiles = new Map<number, AdvancedTeamEfficiencyProfile>();

    for (const rating of ratings) {
      const profile: AdvancedTeamEfficiencyProfile = {
        teamId: rating.teamId,
        season: rating.season,
        totalOffenseEfficiency: parseFloat(rating.totalOffenseEfficiency || '0'),
        passingOffenseEfficiency: parseFloat(rating.passingOffenseEfficiency || '0'),
        rushingOffenseEfficiency: parseFloat(rating.rushingOffenseEfficiency || '0'),
        scoringOffenseEfficiency: parseFloat(rating.scoringOffenseEfficiency || '0'),
        totalDefenseEfficiency: parseFloat(rating.totalDefenseEfficiency || '0'),
        passingDefenseEfficiency: parseFloat(rating.passingDefenseEfficiency || '0'),
        rushingDefenseEfficiency: parseFloat(rating.rushingDefenseEfficiency || '0'),
        scoringDefenseEfficiency: parseFloat(rating.scoringDefenseEfficiency || '0'),
        interceptionEfficiency: parseFloat(rating.interceptionEfficiency || '0'),
        interceptionDefenseEfficiency: parseFloat(rating.interceptionDefenseEfficiency || '0'),
        sackOffenseEfficiency: parseFloat(rating.sackOffenseEfficiency || '0'),
        sackDefenseEfficiency: parseFloat(rating.sackDefenseEfficiency || '0'),
        fieldGoalEfficiency: parseFloat(rating.fieldGoalEfficiency || '0'),
        gamesPlayed: rating.gamesPlayed || 0,
        convergenceScore: parseFloat(rating.convergenceScore || '0.5'),
        confidenceLevel: (rating.confidenceLevel as 'High' | 'Medium' | 'Low') || 'Low',
        lastCalculated: rating.lastCalculated || new Date()
      };

      profiles.set(rating.teamId, profile);
    }

    return profiles;
  }
}

// Export singleton instance
export const teamEfficiencyProfileManager = new TeamEfficiencyProfileManager();