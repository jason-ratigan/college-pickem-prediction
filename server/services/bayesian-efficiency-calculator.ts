// server/services/bayesian-efficiency-calculator.ts

import { db } from '../db.js';
import { games, gameBoxScoreStats, teams, teamEfficiencyRatings } from '@college-pickem/shared';
import { eq, and, sql, isNotNull } from 'drizzle-orm';

/**
 * Bayesian Efficiency Calculator
 * 
 * Implements Bayesian shrinkage to handle teams with insufficient sample sizes
 * Particularly useful for FCS teams and teams early in the season
 */

export interface BayesianEfficiencyConfig {
  minGamesForReliability: {
    fullSeason: number;    // 2024: 5 games minimum
    midSeason: number;     // 2025: 4 games minimum
  };
  shrinkageParameters: {
    noShrinkage: number;      // Games needed for no shrinkage (12+)
    lightShrinkage: number;   // Games for light shrinkage (8-11)
    moderateShrinkage: number; // Games for moderate shrinkage (5-7)
    heavyShrinkage: number;   // Games for heavy shrinkage (2-4)
    veryHeavyShrinkage: number; // Games for very heavy shrinkage (1)
  };
  maxEfficiencyBounds: {
    scoring: { min: -30, max: 30 };
    passing: { min: -40, max: 40 };
    rushing: { min: -40, max: 40 };
    defense: { min: -30, max: 30 };
    turnover: { min: -10, max: 10 };
    specialTeams: { min: -15, max: 15 };
  };
}

export interface NationalAverages {
  season: number;
  scoringOffense: number;
  passingOffense: number;
  rushingOffense: number;
  scoringDefense: number;
  passingDefense: number;
  rushingDefense: number;
  turnoverMargin: number;
  specialTeams: number;
  sampleSize: number; // Number of reliable teams used for averages
}

export interface AdjustedEfficiencyResult {
  teamId: number;
  season: number;
  gamesPlayed: number;
  
  // Raw efficiencies (before shrinkage)
  rawEfficiencies: {
    scoringOffense: number;
    passingOffense: number;
    rushingOffense: number;
    scoringDefense: number;
    passingDefense: number;
    rushingDefense: number;
    turnoverMargin: number;
    specialTeams: number;
  };
  
  // Adjusted efficiencies (after Bayesian shrinkage)
  adjustedEfficiencies: {
    scoringOffense: number;
    passingOffense: number;
    rushingOffense: number;
    scoringDefense: number;
    passingDefense: number;
    rushingDefense: number;
    turnoverMargin: number;
    specialTeams: number;
  };
  
  // Shrinkage metadata
  shrinkageApplied: {
    shrinkageParameter: number;
    confidenceLevel: 'very_high' | 'high' | 'medium' | 'low' | 'very_low';
    adjustmentReason: string;
  };
}

export class BayesianEfficiencyCalculator {
  private config: BayesianEfficiencyConfig;

  constructor() {
    this.config = {
      minGamesForReliability: {
        fullSeason: 5,  // 2024 needs 5+ games
        midSeason: 4    // 2025 needs 4+ games
      },
      shrinkageParameters: {
        noShrinkage: 0,        // 12+ games: no shrinkage
        lightShrinkage: 2,     // 8-11 games: light shrinkage
        moderateShrinkage: 5,  // 5-7 games: moderate shrinkage
        heavyShrinkage: 10,    // 2-4 games: heavy shrinkage
        veryHeavyShrinkage: 20 // 1 game: very heavy shrinkage
      },
      maxEfficiencyBounds: {
        scoring: { min: -30, max: 30 },
        passing: { min: -40, max: 40 },
        rushing: { min: -40, max: 40 },
        defense: { min: -30, max: 30 },
        turnover: { min: -10, max: 10 },
        specialTeams: { min: -15, max: 15 }
      }
    };
  }

  /**
   * Calculate national averages from reliable teams only
   */
  async calculateNationalAverages(season: number): Promise<NationalAverages> {
    console.log(`[Bayesian Calculator] Calculating national averages for season ${season}`);
    
    const minGames = this.getMinGamesThreshold(season);
    
    // Get efficiency ratings from teams with sufficient games only
    const reliableTeams = await db.query.teamEfficiencyRatings.findMany({
      where: and(
        eq(teamEfficiencyRatings.season, season),
        sql`${teamEfficiencyRatings.gamesPlayed} >= ${minGames * 1.5}` // Use teams with 1.5x minimum games
      )
    });

    if (reliableTeams.length < 20) {
      console.warn(`[Bayesian Calculator] Only ${reliableTeams.length} reliable teams found for national averages`);
    }

    const averages = {
      scoringOffense: 0,
      passingOffense: 0,
      rushingOffense: 0,
      scoringDefense: 0,
      passingDefense: 0,
      rushingDefense: 0,
      turnoverMargin: 0,
      specialTeams: 0
    };

    // Calculate averages from reliable teams
    reliableTeams.forEach(team => {
      averages.scoringOffense += Number(team.scoringOffenseEfficiency) || 0;
      averages.passingOffense += Number(team.passingOffenseEfficiency) || 0;
      averages.rushingOffense += Number(team.rushingOffenseEfficiency) || 0;
      averages.scoringDefense += Number(team.scoringDefenseEfficiency) || 0;
      averages.passingDefense += Number(team.passingDefenseEfficiency) || 0;
      averages.rushingDefense += Number(team.rushingDefenseEfficiency) || 0;
      averages.turnoverMargin += Number(team.turnoverEfficiency) || 0;
      averages.specialTeams += Number(team.specialTeamsEfficiency) || 0;
    });

    const count = reliableTeams.length;
    Object.keys(averages).forEach(key => {
      averages[key as keyof typeof averages] /= count;
    });

    console.log(`[Bayesian Calculator] National averages calculated from ${count} reliable teams`);

    return {
      season,
      ...averages,
      sampleSize: count
    };
  }

  /**
   * Apply Bayesian shrinkage to efficiency ratings
   */
  async applyBayesianShrinkage(season: number): Promise<{
    teamsAdjusted: number;
    averageAdjustment: number;
    teamsWithHeavyShrinkage: number;
  }> {
    console.log(`[Bayesian Calculator] Applying Bayesian shrinkage for season ${season}`);
    
    // Calculate national averages
    const nationalAverages = await this.calculateNationalAverages(season);
    
    // Get all teams with efficiency ratings
    const allTeams = await db.query.teamEfficiencyRatings.findMany({
      where: eq(teamEfficiencyRatings.season, season),
      with: {
        team: {
          columns: { id: true, name: true, classification: true }
        }
      }
    });

    let teamsAdjusted = 0;
    let totalAdjustment = 0;
    let teamsWithHeavyShrinkage = 0;

    for (const teamRating of allTeams) {
      const gamesPlayed = teamRating.gamesPlayed || 0;
      const shrinkageParam = this.getShrinkageParameter(gamesPlayed, season);
      
      if (shrinkageParam === 0) continue; // No adjustment needed
      
      // Apply shrinkage to each efficiency metric
      const adjustedEfficiencies = this.calculateAdjustedEfficiencies(
        {
          scoringOffense: Number(teamRating.scoringOffenseEfficiency) || 0,
          passingOffense: Number(teamRating.passingOffenseEfficiency) || 0,
          rushingOffense: Number(teamRating.rushingOffenseEfficiency) || 0,
          scoringDefense: Number(teamRating.scoringDefenseEfficiency) || 0,
          passingDefense: Number(teamRating.passingDefenseEfficiency) || 0,
          rushingDefense: Number(teamRating.rushingDefenseEfficiency) || 0,
          turnoverMargin: Number(teamRating.turnoverEfficiency) || 0,
          specialTeams: Number(teamRating.specialTeamsEfficiency) || 0
        },
        nationalAverages,
        gamesPlayed,
        shrinkageParam
      );

      // Apply bounds to prevent extreme values
      const boundedEfficiencies = this.applyEfficiencyBounds(adjustedEfficiencies);

      // Update database with adjusted values
      await db.update(teamEfficiencyRatings)
        .set({
          scoringOffenseEfficiency: boundedEfficiencies.scoringOffense.toString(),
          passingOffenseEfficiency: boundedEfficiencies.passingOffense.toString(),
          rushingOffenseEfficiency: boundedEfficiencies.rushingOffense.toString(),
          scoringDefenseEfficiency: boundedEfficiencies.scoringDefense.toString(),
          passingDefenseEfficiency: boundedEfficiencies.passingDefense.toString(),
          rushingDefenseEfficiency: boundedEfficiencies.rushingDefense.toString(),
          turnoverEfficiency: boundedEfficiencies.turnoverMargin.toString(),
          specialTeamsEfficiency: boundedEfficiencies.specialTeams.toString(),
          confidenceLevel: this.getConfidenceLevel(gamesPlayed, season),
          lastCalculated: new Date()
        })
        .where(and(
          eq(teamEfficiencyRatings.teamId, teamRating.teamId),
          eq(teamEfficiencyRatings.season, season)
        ));

      // Track adjustments
      const adjustment = this.calculateTotalAdjustment(
        {
          scoringOffense: Number(teamRating.scoringOffenseEfficiency) || 0,
          passingOffense: Number(teamRating.passingOffenseEfficiency) || 0,
          rushingOffense: Number(teamRating.rushingOffenseEfficiency) || 0,
          scoringDefense: Number(teamRating.scoringDefenseEfficiency) || 0,
          passingDefense: Number(teamRating.passingDefenseEfficiency) || 0,
          rushingDefense: Number(teamRating.rushingDefenseEfficiency) || 0,
          turnoverMargin: Number(teamRating.turnoverEfficiency) || 0,
          specialTeams: Number(teamRating.specialTeamsEfficiency) || 0
        },
        boundedEfficiencies
      );

      totalAdjustment += adjustment;
      teamsAdjusted++;
      
      if (shrinkageParam >= this.config.shrinkageParameters.heavyShrinkage) {
        teamsWithHeavyShrinkage++;
      }
    }

    const averageAdjustment = teamsAdjusted > 0 ? totalAdjustment / teamsAdjusted : 0;

    console.log(`[Bayesian Calculator] Shrinkage applied to ${teamsAdjusted} teams, ${teamsWithHeavyShrinkage} with heavy shrinkage`);
    console.log(`[Bayesian Calculator] Average adjustment magnitude: ${averageAdjustment.toFixed(2)}`);

    return {
      teamsAdjusted,
      averageAdjustment,
      teamsWithHeavyShrinkage
    };
  }

  /**
   * Get minimum games threshold based on season
   */
  private getMinGamesThreshold(season: number): number {
    const currentYear = new Date().getFullYear();
    return season === currentYear ? this.config.minGamesForReliability.midSeason : this.config.minGamesForReliability.fullSeason;
  }

  /**
   * Determine shrinkage parameter based on games played
   */
  private getShrinkageParameter(gamesPlayed: number, season: number): number {
    const minGames = this.getMinGamesThreshold(season);
    
    if (gamesPlayed >= minGames * 2.4) return this.config.shrinkageParameters.noShrinkage;        // 12+ games: no shrinkage
    if (gamesPlayed >= minGames * 1.6) return this.config.shrinkageParameters.lightShrinkage;     // 8+ games: light shrinkage
    if (gamesPlayed >= minGames) return this.config.shrinkageParameters.moderateShrinkage;        // 5+ games: moderate shrinkage
    if (gamesPlayed >= minGames - 2) return this.config.shrinkageParameters.heavyShrinkage;       // 3+ games: heavy shrinkage
    return this.config.shrinkageParameters.veryHeavyShrinkage;                                    // 1-2 games: very heavy shrinkage
  }

  /**
   * Calculate adjusted efficiencies using Bayesian shrinkage
   */
  private calculateAdjustedEfficiencies(
    rawEfficiencies: Record<string, number>,
    nationalAverages: NationalAverages,
    gamesPlayed: number,
    shrinkageParameter: number
  ): Record<string, number> {
    const adjusted: Record<string, number> = {};

    // Apply Bayesian shrinkage formula: (n * team_value + k * national_avg) / (n + k)
    adjusted.scoringOffense = this.applyShrinkage(
      rawEfficiencies.scoringOffense, 
      nationalAverages.scoringOffense, 
      gamesPlayed, 
      shrinkageParameter
    );
    
    adjusted.passingOffense = this.applyShrinkage(
      rawEfficiencies.passingOffense, 
      nationalAverages.passingOffense, 
      gamesPlayed, 
      shrinkageParameter
    );
    
    adjusted.rushingOffense = this.applyShrinkage(
      rawEfficiencies.rushingOffense, 
      nationalAverages.rushingOffense, 
      gamesPlayed, 
      shrinkageParameter
    );
    
    adjusted.scoringDefense = this.applyShrinkage(
      rawEfficiencies.scoringDefense, 
      nationalAverages.scoringDefense, 
      gamesPlayed, 
      shrinkageParameter
    );
    
    adjusted.passingDefense = this.applyShrinkage(
      rawEfficiencies.passingDefense, 
      nationalAverages.passingDefense, 
      gamesPlayed, 
      shrinkageParameter
    );
    
    adjusted.rushingDefense = this.applyShrinkage(
      rawEfficiencies.rushingDefense, 
      nationalAverages.rushingDefense, 
      gamesPlayed, 
      shrinkageParameter
    );
    
    adjusted.turnoverMargin = this.applyShrinkage(
      rawEfficiencies.turnoverMargin, 
      nationalAverages.turnoverMargin, 
      gamesPlayed, 
      shrinkageParameter
    );
    
    adjusted.specialTeams = this.applyShrinkage(
      rawEfficiencies.specialTeams, 
      nationalAverages.specialTeams, 
      gamesPlayed, 
      shrinkageParameter
    );

    return adjusted;
  }

  /**
   * Apply Bayesian shrinkage formula to a single efficiency metric
   */
  private applyShrinkage(
    teamValue: number, 
    nationalAverage: number, 
    gamesPlayed: number, 
    shrinkageParameter: number
  ): number {
    if (shrinkageParameter === 0) return teamValue; // No shrinkage
    
    // Bayesian shrinkage formula
    return (gamesPlayed * teamValue + shrinkageParameter * nationalAverage) / (gamesPlayed + shrinkageParameter);
  }

  /**
   * Apply efficiency bounds to prevent extreme values
   */
  private applyEfficiencyBounds(efficiencies: Record<string, number>): Record<string, number> {
    const bounded: Record<string, number> = {};

    bounded.scoringOffense = this.clamp(
      efficiencies.scoringOffense, 
      this.config.maxEfficiencyBounds.scoring.min, 
      this.config.maxEfficiencyBounds.scoring.max
    );
    
    bounded.passingOffense = this.clamp(
      efficiencies.passingOffense, 
      this.config.maxEfficiencyBounds.passing.min, 
      this.config.maxEfficiencyBounds.passing.max
    );
    
    bounded.rushingOffense = this.clamp(
      efficiencies.rushingOffense, 
      this.config.maxEfficiencyBounds.rushing.min, 
      this.config.maxEfficiencyBounds.rushing.max
    );
    
    bounded.scoringDefense = this.clamp(
      efficiencies.scoringDefense, 
      this.config.maxEfficiencyBounds.defense.min, 
      this.config.maxEfficiencyBounds.defense.max
    );
    
    bounded.passingDefense = this.clamp(
      efficiencies.passingDefense, 
      this.config.maxEfficiencyBounds.defense.min, 
      this.config.maxEfficiencyBounds.defense.max
    );
    
    bounded.rushingDefense = this.clamp(
      efficiencies.rushingDefense, 
      this.config.maxEfficiencyBounds.defense.min, 
      this.config.maxEfficiencyBounds.defense.max
    );
    
    bounded.turnoverMargin = this.clamp(
      efficiencies.turnoverMargin, 
      this.config.maxEfficiencyBounds.turnover.min, 
      this.config.maxEfficiencyBounds.turnover.max
    );
    
    bounded.specialTeams = this.clamp(
      efficiencies.specialTeams, 
      this.config.maxEfficiencyBounds.specialTeams.min, 
      this.config.maxEfficiencyBounds.specialTeams.max
    );

    return bounded;
  }

  /**
   * Clamp value between min and max
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Get confidence level based on games played
   */
  private getConfidenceLevel(gamesPlayed: number, season: number): 'High' | 'Medium' | 'Low' {
    const minGames = this.getMinGamesThreshold(season);
    
    if (gamesPlayed >= minGames * 2) return 'High';
    if (gamesPlayed >= minGames) return 'Medium';
    return 'Low';
  }

  /**
   * Calculate total adjustment magnitude for tracking
   */
  private calculateTotalAdjustment(
    original: Record<string, number>, 
    adjusted: Record<string, number>
  ): number {
    let totalAdjustment = 0;
    
    Object.keys(original).forEach(key => {
      totalAdjustment += Math.abs(original[key] - adjusted[key]);
    });
    
    return totalAdjustment;
  }

  /**
   * Handle FCS teams specifically
   */
  async handleFCSTeams(season: number): Promise<{
    fcsTeamsProcessed: number;
    averageAdjustment: number;
  }> {
    console.log(`[Bayesian Calculator] Applying special handling for FCS teams in season ${season}`);
    
    // Get FCS teams
    const fcsTeams = await db.query.teamEfficiencyRatings.findMany({
      where: eq(teamEfficiencyRatings.season, season),
      with: {
        team: {
          columns: { id: true, name: true, classification: true }
        }
      }
    });

    const fcsTeamsFiltered = fcsTeams.filter(t => 
      t.team?.classification === 'fcs' || 
      (t.gamesPlayed || 0) <= 3 // Assume teams with very few games might be FCS
    );

    let fcsTeamsProcessed = 0;
    let totalAdjustment = 0;

    for (const fcsTeam of fcsTeamsFiltered) {
      const gamesPlayed = fcsTeam.gamesPlayed || 0;
      
      // FCS teams get very heavy shrinkage toward 0 (neutral)
      const shrinkageParam = Math.max(15, this.config.shrinkageParameters.veryHeavyShrinkage);
      
      const adjustedEfficiencies = this.calculateAdjustedEfficiencies(
        {
          scoringOffense: Number(fcsTeam.scoringOffenseEfficiency) || 0,
          passingOffense: Number(fcsTeam.passingOffenseEfficiency) || 0,
          rushingOffense: Number(fcsTeam.rushingOffenseEfficiency) || 0,
          scoringDefense: Number(fcsTeam.scoringDefenseEfficiency) || 0,
          passingDefense: Number(fcsTeam.passingDefenseEfficiency) || 0,
          rushingDefense: Number(fcsTeam.rushingDefenseEfficiency) || 0,
          turnoverMargin: Number(fcsTeam.turnoverEfficiency) || 0,
          specialTeams: Number(fcsTeam.specialTeamsEfficiency) || 0
        },
        { season, scoringOffense: 0, passingOffense: 0, rushingOffense: 0, scoringDefense: 0, passingDefense: 0, rushingDefense: 0, turnoverMargin: 0, specialTeams: 0, sampleSize: 0 }, // Shrink toward 0 for FCS
        gamesPlayed,
        shrinkageParam
      );

      const boundedEfficiencies = this.applyEfficiencyBounds(adjustedEfficiencies);

      // Update database
      await db.update(teamEfficiencyRatings)
        .set({
          scoringOffenseEfficiency: boundedEfficiencies.scoringOffense.toString(),
          passingOffenseEfficiency: boundedEfficiencies.passingOffense.toString(),
          rushingOffenseEfficiency: boundedEfficiencies.rushingOffense.toString(),
          scoringDefenseEfficiency: boundedEfficiencies.scoringDefense.toString(),
          passingDefenseEfficiency: boundedEfficiencies.passingDefense.toString(),
          rushingDefenseEfficiency: boundedEfficiencies.rushingDefense.toString(),
          turnoverEfficiency: boundedEfficiencies.turnoverMargin.toString(),
          specialTeamsEfficiency: boundedEfficiencies.specialTeams.toString(),
          confidenceLevel: 'Low', // FCS teams always get low confidence
          lastCalculated: new Date()
        })
        .where(and(
          eq(teamEfficiencyRatings.teamId, fcsTeam.teamId),
          eq(teamEfficiencyRatings.season, season)
        ));

      const adjustment = this.calculateTotalAdjustment(
        {
          scoringOffense: Number(fcsTeam.scoringOffenseEfficiency) || 0,
          passingOffense: Number(fcsTeam.passingOffenseEfficiency) || 0,
          rushingOffense: Number(fcsTeam.rushingOffenseEfficiency) || 0,
          scoringDefense: Number(fcsTeam.scoringDefenseEfficiency) || 0,
          passingDefense: Number(fcsTeam.passingDefenseEfficiency) || 0,
          rushingDefense: Number(fcsTeam.rushingDefenseEfficiency) || 0,
          turnoverMargin: Number(fcsTeam.turnoverEfficiency) || 0,
          specialTeams: Number(fcsTeam.specialTeamsEfficiency) || 0
        },
        boundedEfficiencies
      );

      totalAdjustment += adjustment;
      fcsTeamsProcessed++;
    }

    const averageAdjustment = fcsTeamsProcessed > 0 ? totalAdjustment / fcsTeamsProcessed : 0;

    console.log(`[Bayesian Calculator] Processed ${fcsTeamsProcessed} FCS teams with average adjustment of ${averageAdjustment.toFixed(2)}`);

    return {
      fcsTeamsProcessed,
      averageAdjustment
    };
  }

  /**
   * Remove teams with insufficient data entirely
   */
  async removeInsufficientDataTeams(season: number): Promise<{
    teamsRemoved: number;
    remainingTeams: number;
  }> {
    console.log(`[Bayesian Calculator] Removing teams with insufficient data for season ${season}`);
    
    const minGames = this.getMinGamesThreshold(season);
    
    // Count teams to be removed
    const teamsToRemove = await db.query.teamEfficiencyRatings.findMany({
      where: and(
        eq(teamEfficiencyRatings.season, season),
        sql`${teamEfficiencyRatings.gamesPlayed} < ${Math.max(1, minGames - 2)}` // Remove teams with < 3 games (2024) or < 2 games (2025)
      )
    });

    // Remove teams with insufficient data
    const deleteResult = await db.delete(teamEfficiencyRatings)
      .where(and(
        eq(teamEfficiencyRatings.season, season),
        sql`${teamEfficiencyRatings.gamesPlayed} < ${Math.max(1, minGames - 2)}`
      ));

    // Count remaining teams
    const remainingTeams = await db.query.teamEfficiencyRatings.findMany({
      where: eq(teamEfficiencyRatings.season, season)
    });

    console.log(`[Bayesian Calculator] Removed ${teamsToRemove.length} teams with insufficient data, ${remainingTeams.length} teams remaining`);

    return {
      teamsRemoved: teamsToRemove.length,
      remainingTeams: remainingTeams.length
    };
  }
}

// Export singleton instance
export const bayesianEfficiencyCalculator = new BayesianEfficiencyCalculator();