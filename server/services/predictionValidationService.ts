// server/services/predictionValidationService.ts

import { db } from '../db.js';
import { teams, games, teamEfficiencyRatings } from '@college-pickem/shared';
import { eq, and, sql, desc } from 'drizzle-orm';

export interface GamePrediction {
  gameId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  confidence: number; // 0-1
  method: string; // e.g., "efficiency-based", "fallback"
}

export interface PredictionValidationResult {
  isValid: boolean;
  originalPrediction: GamePrediction;
  correctedPrediction?: GamePrediction;
  validationIssues: string[];
  validationWarnings: string[];
  correctionReason?: string;
}

export interface TeamPerformanceBaseline {
  teamId: number;
  teamName: string;
  avgPointsFor: number;
  avgPointsAgainst: number;
  minScore: number;
  maxScore: number;
  gamesPlayed: number;
  standardDeviation: number;
}

export interface PredictionBounds {
  homeTeamMin: number;
  homeTeamMax: number;
  awayTeamMin: number;
  awayTeamMax: number;
  maxPointDifferential: number;
  reasoning: string[];
}

export class PredictionValidationService {
  
  /**
   * Validates a game prediction for sanity and realism
   */
  async validatePrediction(prediction: GamePrediction): Promise<PredictionValidationResult> {
    console.log(`[Prediction Validation] Validating prediction for game ${prediction.gameId}...`);
    
    const validationIssues: string[] = [];
    const validationWarnings: string[] = [];
    let correctedPrediction: GamePrediction | undefined;
    let correctionReason: string | undefined;
    
    // Get team baselines for validation
    const homeBaseline = await this.getTeamPerformanceBaseline(prediction.homeTeamId);
    const awayBaseline = await this.getTeamPerformanceBaseline(prediction.awayTeamId);
    
    // Basic validation checks
    if (prediction.homeScore < 0) {
      validationIssues.push('Home team score cannot be negative');
    }
    
    if (prediction.awayScore < 0) {
      validationIssues.push('Away team score cannot be negative');
    }
    
    // Extreme score validation
    if (prediction.homeScore > 200) {
      validationIssues.push(`Home team score (${prediction.homeScore}) exceeds realistic maximum (200)`);
    }
    
    if (prediction.awayScore > 200) {
      validationIssues.push(`Away team score (${prediction.awayScore}) exceeds realistic maximum (200)`);
    }
    
    // Point differential validation
    const pointDifferential = Math.abs(prediction.homeScore - prediction.awayScore);
    if (pointDifferential > 100) {
      validationIssues.push(`Point differential (${pointDifferential}) is unrealistically high`);
    }
    
    // Team performance baseline validation
    if (homeBaseline && homeBaseline.gamesPlayed > 0) {
      const homeDeviation = Math.abs(prediction.homeScore - homeBaseline.avgPointsFor);
      const homeThreshold = homeBaseline.standardDeviation * 4; // 4 standard deviations
      
      if (homeDeviation > homeThreshold) {
        validationWarnings.push(`Home team predicted score (${prediction.homeScore}) deviates significantly from average (${homeBaseline.avgPointsFor.toFixed(1)})`);
      }
      
      // Check minimum performance threshold
      const minThreshold = Math.max(homeBaseline.avgPointsFor * 0.3, 3); // At least 30% of average or 3 points
      if (prediction.homeScore < minThreshold) {
        validationIssues.push(`Home team predicted score (${prediction.homeScore}) is below minimum threshold (${minThreshold.toFixed(1)})`);
      }
    }
    
    if (awayBaseline && awayBaseline.gamesPlayed > 0) {
      const awayDeviation = Math.abs(prediction.awayScore - awayBaseline.avgPointsFor);
      const awayThreshold = awayBaseline.standardDeviation * 4;
      
      if (awayDeviation > awayThreshold) {
        validationWarnings.push(`Away team predicted score (${prediction.awayScore}) deviates significantly from average (${awayBaseline.avgPointsFor.toFixed(1)})`);
      }
      
      const minThreshold = Math.max(awayBaseline.avgPointsFor * 0.3, 3);
      if (prediction.awayScore < minThreshold) {
        validationIssues.push(`Away team predicted score (${prediction.awayScore}) is below minimum threshold (${minThreshold.toFixed(1)})`);
      }
    }
    
    // If there are validation issues, attempt to correct the prediction
    if (validationIssues.length > 0) {
      correctedPrediction = await this.correctPrediction(prediction, homeBaseline || undefined, awayBaseline || undefined);
      correctionReason = `Applied corrections due to validation issues: ${validationIssues.join(', ')}`;
    }
    
    const isValid = validationIssues.length === 0;
    
    return {
      isValid,
      originalPrediction: prediction,
      correctedPrediction,
      validationIssues,
      validationWarnings,
      correctionReason
    };
  }
  
  /**
   * Corrects an invalid prediction using fallback methods
   */
  async correctPrediction(
    prediction: GamePrediction,
    homeBaseline?: TeamPerformanceBaseline,
    awayBaseline?: TeamPerformanceBaseline
  ): Promise<GamePrediction> {
    console.log(`[Prediction Validation] Correcting prediction for game ${prediction.gameId}...`);
    
    let correctedHomeScore = prediction.homeScore;
    let correctedAwayScore = prediction.awayScore;
    
    // Apply bounds based on team baselines
    if (homeBaseline && homeBaseline.gamesPlayed > 0) {
      const homeMin = Math.max(homeBaseline.avgPointsFor * 0.4, 3);
      const homeMax = Math.min(homeBaseline.avgPointsFor * 2.5, 80);
      
      correctedHomeScore = Math.max(homeMin, Math.min(homeMax, correctedHomeScore));
    } else {
      // Fallback bounds when no baseline available
      correctedHomeScore = Math.max(7, Math.min(70, correctedHomeScore));
    }
    
    if (awayBaseline && awayBaseline.gamesPlayed > 0) {
      const awayMin = Math.max(awayBaseline.avgPointsFor * 0.4, 3);
      const awayMax = Math.min(awayBaseline.avgPointsFor * 2.5, 80);
      
      correctedAwayScore = Math.max(awayMin, Math.min(awayMax, correctedAwayScore));
    } else {
      // Fallback bounds when no baseline available
      correctedAwayScore = Math.max(7, Math.min(70, correctedAwayScore));
    }
    
    // Ensure point differential is reasonable
    const pointDiff = Math.abs(correctedHomeScore - correctedAwayScore);
    if (pointDiff > 50) {
      // Apply regression to the mean to reduce extreme differentials
      const avgScore = (correctedHomeScore + correctedAwayScore) / 2;
      const maxDiff = 35; // Maximum reasonable point differential
      
      if (correctedHomeScore > correctedAwayScore) {
        correctedHomeScore = avgScore + (maxDiff / 2);
        correctedAwayScore = avgScore - (maxDiff / 2);
      } else {
        correctedAwayScore = avgScore + (maxDiff / 2);
        correctedHomeScore = avgScore - (maxDiff / 2);
      }
    }
    
    return {
      ...prediction,
      homeScore: Math.round(correctedHomeScore),
      awayScore: Math.round(correctedAwayScore),
      confidence: Math.max(0.1, prediction.confidence * 0.5), // Reduce confidence for corrected predictions
      method: `${prediction.method}-corrected`
    };
  }
  
  /**
   * Gets performance baseline for a team based on recent games
   */
  async getTeamPerformanceBaseline(teamId: number): Promise<TeamPerformanceBaseline | null> {
    // Get team info
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId)
    });
    
    if (!team) return null;
    
    // Get recent games for this team (current season)
    const currentSeason = new Date().getFullYear();
    
    const teamGames = await db.select({
      gameId: games.id,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeScore: games.homeTeamScore,
      awayScore: games.awayTeamScore,
      isFinal: games.isFinal
    })
    .from(games)
    .where(and(
      eq(games.season, currentSeason),
      sql`(${games.homeTeamId} = ${teamId} OR ${games.awayTeamId} = ${teamId})`,
      eq(games.isFinal, true)
    ))
    .orderBy(desc(games.gameTime));
    
    if (teamGames.length === 0) {
      return {
        teamId,
        teamName: team.name,
        avgPointsFor: 0,
        avgPointsAgainst: 0,
        minScore: 0,
        maxScore: 0,
        gamesPlayed: 0,
        standardDeviation: 0
      };
    }
    
    // Calculate statistics
    const scores: number[] = [];
    const opponentScores: number[] = [];
    
    for (const game of teamGames) {
      if (game.homeScore !== null && game.awayScore !== null) {
        if (game.homeTeamId === teamId) {
          scores.push(game.homeScore);
          opponentScores.push(game.awayScore);
        } else {
          scores.push(game.awayScore);
          opponentScores.push(game.homeScore);
        }
      }
    }
    
    if (scores.length === 0) {
      return {
        teamId,
        teamName: team.name,
        avgPointsFor: 0,
        avgPointsAgainst: 0,
        minScore: 0,
        maxScore: 0,
        gamesPlayed: 0,
        standardDeviation: 0
      };
    }
    
    const avgPointsFor = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const avgPointsAgainst = opponentScores.reduce((sum, score) => sum + score, 0) / opponentScores.length;
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    
    // Calculate standard deviation
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgPointsFor, 2), 0) / scores.length;
    const standardDeviation = Math.sqrt(variance);
    
    return {
      teamId,
      teamName: team.name,
      avgPointsFor,
      avgPointsAgainst,
      minScore,
      maxScore,
      gamesPlayed: scores.length,
      standardDeviation
    };
  }
  
  /**
   * Calculates reasonable prediction bounds for a matchup
   */
  async calculatePredictionBounds(homeTeamId: number, awayTeamId: number): Promise<PredictionBounds> {
    const homeBaseline = await this.getTeamPerformanceBaseline(homeTeamId);
    const awayBaseline = await this.getTeamPerformanceBaseline(awayTeamId);
    
    const reasoning: string[] = [];
    
    // Default bounds
    let homeTeamMin = 7;
    let homeTeamMax = 70;
    let awayTeamMin = 7;
    let awayTeamMax = 70;
    
    // Adjust based on team performance
    if (homeBaseline && homeBaseline.gamesPlayed > 0) {
      homeTeamMin = Math.max(homeBaseline.avgPointsFor * 0.4, 3);
      homeTeamMax = Math.min(homeBaseline.avgPointsFor * 2.5, 80);
      reasoning.push(`Home team bounds based on ${homeBaseline.gamesPlayed} games (avg: ${homeBaseline.avgPointsFor.toFixed(1)})`);
    } else {
      reasoning.push('Home team bounds using default values (no game history)');
    }
    
    if (awayBaseline && awayBaseline.gamesPlayed > 0) {
      awayTeamMin = Math.max(awayBaseline.avgPointsFor * 0.4, 3);
      awayTeamMax = Math.min(awayBaseline.avgPointsFor * 2.5, 80);
      reasoning.push(`Away team bounds based on ${awayBaseline.gamesPlayed} games (avg: ${awayBaseline.avgPointsFor.toFixed(1)})`);
    } else {
      reasoning.push('Away team bounds using default values (no game history)');
    }
    
    // Maximum reasonable point differential
    const maxPointDifferential = 50;
    reasoning.push(`Maximum point differential capped at ${maxPointDifferential}`);
    
    return {
      homeTeamMin: Math.round(homeTeamMin),
      homeTeamMax: Math.round(homeTeamMax),
      awayTeamMin: Math.round(awayTeamMin),
      awayTeamMax: Math.round(awayTeamMax),
      maxPointDifferential,
      reasoning
    };
  }
  
  /**
   * Validates multiple predictions in batch
   */
  async validatePredictionBatch(predictions: GamePrediction[]): Promise<{
    validPredictions: GamePrediction[];
    invalidPredictions: PredictionValidationResult[];
    correctedPredictions: GamePrediction[];
    summary: {
      total: number;
      valid: number;
      corrected: number;
      failed: number;
    };
  }> {
    console.log(`[Prediction Validation] Validating batch of ${predictions.length} predictions...`);
    
    const validPredictions: GamePrediction[] = [];
    const invalidPredictions: PredictionValidationResult[] = [];
    const correctedPredictions: GamePrediction[] = [];
    
    for (const prediction of predictions) {
      const result = await this.validatePrediction(prediction);
      
      if (result.isValid) {
        validPredictions.push(prediction);
      } else {
        invalidPredictions.push(result);
        if (result.correctedPrediction) {
          correctedPredictions.push(result.correctedPrediction);
        }
      }
    }
    
    const summary = {
      total: predictions.length,
      valid: validPredictions.length,
      corrected: correctedPredictions.length,
      failed: invalidPredictions.length - correctedPredictions.length
    };
    
    console.log(`[Prediction Validation] Batch validation complete: ${summary.valid} valid, ${summary.corrected} corrected, ${summary.failed} failed`);
    
    return {
      validPredictions,
      invalidPredictions,
      correctedPredictions,
      summary
    };
  }
  
  /**
   * Generates a fallback prediction when primary prediction fails
   */
  async generateFallbackPrediction(homeTeamId: number, awayTeamId: number, gameId: number): Promise<GamePrediction> {
    console.log(`[Prediction Validation] Generating fallback prediction for game ${gameId}...`);
    
    const homeBaseline = await this.getTeamPerformanceBaseline(homeTeamId);
    const awayBaseline = await this.getTeamPerformanceBaseline(awayTeamId);
    
    // Use team averages with home field advantage
    let homeScore = homeBaseline?.avgPointsFor || 24;
    let awayScore = awayBaseline?.avgPointsFor || 21;
    
    // Apply home field advantage (typically 3-7 points)
    homeScore += 3;
    
    // Add some variance based on defensive performance
    if (homeBaseline && awayBaseline) {
      // Adjust based on opponent's defensive performance
      const homeAdjustment = (awayBaseline.avgPointsAgainst - 24) * 0.3; // 30% of defensive difference
      const awayAdjustment = (homeBaseline.avgPointsAgainst - 24) * 0.3;
      
      homeScore += homeAdjustment;
      awayScore += awayAdjustment;
    }
    
    // Ensure reasonable bounds
    homeScore = Math.max(10, Math.min(60, homeScore));
    awayScore = Math.max(7, Math.min(55, awayScore));
    
    return {
      gameId,
      homeTeamId,
      awayTeamId,
      homeScore: Math.round(homeScore),
      awayScore: Math.round(awayScore),
      confidence: 0.3, // Low confidence for fallback predictions
      method: 'fallback-baseline'
    };
  }
}

// Export singleton instance
export const predictionValidationService = new PredictionValidationService();