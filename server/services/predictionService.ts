// server/services/predictionService.ts

import { db } from '../db.js';
import { games, teams } from '@college-pickem/shared';
import { eq, and, sql } from 'drizzle-orm';
import { teamEfficiencyProfileManager } from './deprecated/teamEfficiencyProfileManager.js';
import { additiveEfficiencyInteractionModel, OpponentRelativeMatchupAnalysis } from './additiveEfficiencyInteractionModel.js';
import { predictionBoundaryValidator, BoundaryValidationResult } from './predictionBoundaryValidator.js';
import { AdvancedTeamEfficiencyProfile } from './deprecated/recursiveEfficiencyEngine.js';
import { StatisticalImpactAnalyzer, StatisticalImpactWeights, EnhancedStatisticalAnalysis } from './statisticalImpactAnalyzer.js';
import { RegressionBasedWeightManager } from './regressionBasedWeightManager.js';

/**
 * Enhanced Game Prediction interface using point-differential system with regression-based weights
 * Requirements: 1.1, 6.4, 6.5 - Point-differential system with statistical confidence
 */
export interface GamePrediction {
  gameId?: number;
  homeTeam: {
    id: number;
    name: string;
    logoUrl?: string;
  };
  awayTeam: {
    id: number;
    name: string;
    logoUrl?: string;
  };
  expectedScore: {
    home: number;
    away: number;
  };
  winProbability: number; // Home team win probability (0-100)
  confidence: number; // Prediction confidence (0-100)
  spread: number; // Positive means home team favored
  total: number; // Over/under total points
  keyMatchups: string[];
  
  // Enhanced prediction details with point-differential system
  efficiencyAnalysis: OpponentRelativeMatchupAnalysis;
  boundaryValidation: BoundaryValidationResult;
  
  // Statistical confidence information (Requirements: 6.4, 6.5)
  statisticalConfidence: {
    modelRSquared: number;
    confidenceInterval: {
      home: [number, number];
      away: [number, number];
    };
    predictionReliability: 'High' | 'Medium' | 'Low';
    sampleSizeAdequate: boolean;
    weightsUsed: StatisticalImpactWeights;
    weightsLastUpdated: Date | null;
  };
  
  // Calculation breakdown for transparency
  calculationBreakdown: {
    homeTeam: {
      opponentBaseline: number;
      efficiencyContributions: Record<string, number>;
      weightsUsed: Record<string, number>;
    };
    awayTeam: {
      opponentBaseline: number;
      efficiencyContributions: Record<string, number>;
      weightsUsed: Record<string, number>;
    };
  };
  
  predictionMetadata: {
    homeTeamProfile: AdvancedTeamEfficiencyProfile;
    awayTeamProfile: AdvancedTeamEfficiencyProfile;
    calculationTimestamp: Date;
    systemVersion: string;
  };
}

/**
 * Fetches all upcoming games for a given week and generates advanced predictions using the new efficiency system.
 * Implements Requirements 2.4, 3.1, 5.4 from the advanced statistical efficiency system.
 *
 * @param season - The season year (e.g., 2024).
 * @param week - The week number.
 * @returns An array of detailed game prediction objects using the new prediction system.
 */
export const getWeeklyPredictions = async (season: number, week: number): Promise<GamePrediction[]> => {
    try {
        console.log(`Generating advanced predictions for S${season} W${week}`);
        
        // Get all upcoming games for the week
        const upcomingGames = await db.query.games.findMany({
            where: and(
                eq(games.season, season),
                eq(games.week, week),
                eq(games.isFinal, false)
            ),
            with: {
                homeTeam: true,
                awayTeam: true
            }
        });
        
        if (upcomingGames.length === 0) {
            console.log(`No upcoming games found for S${season} W${week}`);
            return [];
        }
        
        // Generate predictions for each game
        const predictions = await Promise.all(
            upcomingGames.map(game => 
                generateAdvancedGamePrediction(
                    game.homeTeamId,
                    game.awayTeamId,
                    season,
                    game.id,
                    false // isNeutralSite - could be enhanced to read from game data
                )
            )
        );
        
        return predictions.filter(p => p !== null) as GamePrediction[];
        
    } catch (error) {
        console.error(`[Advanced Prediction Service] Critical error generating weekly predictions for S${season} W${week}:`, error);
        throw new Error('Failed to generate weekly predictions using advanced efficiency system.');
    }
};

/**
 * Gets a prediction for a single upcoming game between two specific teams using the advanced efficiency system.
 * Implements the complete prediction pipeline with efficiency interactions and boundary validation.
 *
 * @param homeTeamId - The database ID of the home team.
 * @param awayTeamId - The database ID of the away team.
 * @param season - The season year.
 * @param gameId - (Optional) The database ID of the game.
 * @param isNeutralSite - (Optional) Flag for neutral site games.
 * @returns A single detailed game prediction object using the new prediction system.
 */
export const getGamePrediction = async (
    homeTeamId: number,
    awayTeamId: number,
    season: number,
    gameId?: number,
    isNeutralSite: boolean = false
): Promise<GamePrediction> => {
    try {
        const prediction = await generateAdvancedGamePrediction(
            homeTeamId,
            awayTeamId,
            season,
            gameId,
            isNeutralSite
        );
        
        if (!prediction) {
            throw new Error(`Unable to generate prediction for teams ${homeTeamId} vs ${awayTeamId}`);
        }
        
        return prediction;
    } catch (error) {
        console.error(`[Advanced Prediction Service] Critical error generating prediction for teams ${homeTeamId} vs ${awayTeamId}:`, error);
        throw new Error('Failed to generate game prediction using advanced efficiency system.');
    }
};

/**
 * Core prediction generation function using point-differential system with regression-based weights
 * Requirements: 1.1, 6.4, 6.5 - Point-differential system with statistical confidence
 */
async function generateAdvancedGamePrediction(
    homeTeamId: number,
    awayTeamId: number,
    season: number,
    gameId?: number,
    isNeutralSite: boolean = false
): Promise<GamePrediction | null> {
    
    console.log(`Generating point-differential prediction: Team ${homeTeamId} vs Team ${awayTeamId}, Season ${season}`);
    
    try {
        // Get team information
        const [homeTeam, awayTeam] = await Promise.all([
            db.query.teams.findFirst({ where: eq(teams.id, homeTeamId) }),
            db.query.teams.findFirst({ where: eq(teams.id, awayTeamId) })
        ]);
        
        if (!homeTeam || !awayTeam) {
            console.error(`Teams not found: Home ${homeTeamId}, Away ${awayTeamId}`);
            return null;
        }
        
        // Get team efficiency profiles (Requirements: 1.1 - Point-differential system)
        const [homeProfile, awayProfile] = await Promise.all([
            teamEfficiencyProfileManager.getTeamEfficiencyProfile(homeTeamId, season),
            teamEfficiencyProfileManager.getTeamEfficiencyProfile(awayTeamId, season)
        ]);
        
        if (!homeProfile || !awayProfile) {
            console.error(`Efficiency profiles not found for teams ${homeTeamId}, ${awayTeamId} in season ${season}`);
            return null;
        }
        
        // Initialize statistical analyzer and weight manager
        const statisticalAnalyzer = new StatisticalImpactAnalyzer();
        const weightManager = new RegressionBasedWeightManager();
        
        // Get current regression-based weights (Requirements: 6.4 - Integrate regression-based weights)
        const currentWeights = await weightManager.getCurrentWeights(season);
        
        // Calculate opponent-relative matchup analysis using point differentials (Requirements: 1.1)
        const efficiencyAnalysis = await additiveEfficiencyInteractionModel.calculateMatchupAnalysis(
            homeProfile,
            awayProfile
        );
        
        // Generate initial predictions using point-differential formula: opponentTypicallyAllows + teamEfficiency
        const initialPredictions = {
            homeTeamScore: Math.round(efficiencyAnalysis.finalPredictions.homeTeamScore),
            awayTeamScore: Math.round(efficiencyAnalysis.finalPredictions.awayTeamScore),
            homeTeamStats: {
                totalYards: Math.round(efficiencyAnalysis.homeTeamPredictions.totalYards.predictedValue),
                passingYards: Math.round(efficiencyAnalysis.homeTeamPredictions.passingYards.predictedValue),
                rushingYards: Math.round(efficiencyAnalysis.homeTeamPredictions.rushingYards.predictedValue),
                turnovers: Math.round(efficiencyAnalysis.homeTeamPredictions.turnovers.predictedValue * 10) / 10,
                sacks: Math.round(efficiencyAnalysis.homeTeamPredictions.sacks.predictedValue * 10) / 10,
                fieldGoals: Math.round(efficiencyAnalysis.homeTeamPredictions.fieldGoals.predictedValue * 10) / 10
            },
            awayTeamStats: {
                totalYards: Math.round(efficiencyAnalysis.awayTeamPredictions.totalYards.predictedValue),
                passingYards: Math.round(efficiencyAnalysis.awayTeamPredictions.passingYards.predictedValue),
                rushingYards: Math.round(efficiencyAnalysis.awayTeamPredictions.rushingYards.predictedValue),
                turnovers: Math.round(efficiencyAnalysis.awayTeamPredictions.turnovers.predictedValue * 10) / 10,
                sacks: Math.round(efficiencyAnalysis.awayTeamPredictions.sacks.predictedValue * 10) / 10,
                fieldGoals: Math.round(efficiencyAnalysis.awayTeamPredictions.fieldGoals.predictedValue * 10) / 10
            }
        };
        
        // Apply boundary validation
        const boundaryValidation = await predictionBoundaryValidator.validateGamePrediction(
            homeTeamId,
            awayTeamId,
            season,
            initialPredictions,
            homeProfile,
            awayProfile
        );
        
        // Use validated predictions
        const finalHomeScore = boundaryValidation.homeTeamScore.adjustedValue;
        const finalAwayScore = boundaryValidation.awayTeamScore.adjustedValue;
        
        // Calculate confidence intervals (Requirements: 6.5 - Add confidence interval calculation)
        const homeConfidenceInterval = efficiencyAnalysis.finalPredictions.homeTeamConfidenceInterval;
        const awayConfidenceInterval = efficiencyAnalysis.finalPredictions.awayTeamConfidenceInterval;
        
        // Calculate statistical confidence information (Requirements: 6.4, 6.5)
        const statisticalConfidence = {
            modelRSquared: efficiencyAnalysis.regressionMetadata.modelRSquared,
            confidenceInterval: {
                home: homeConfidenceInterval,
                away: awayConfidenceInterval
            },
            predictionReliability: efficiencyAnalysis.confidenceLevel,
            sampleSizeAdequate: (homeProfile.gamesPlayed + awayProfile.gamesPlayed) >= 8,
            weightsUsed: currentWeights,
            weightsLastUpdated: efficiencyAnalysis.regressionMetadata.weightsLastUpdated
        };
        
        // Create calculation breakdown for transparency
        const calculationBreakdown = {
            homeTeam: {
                opponentBaseline: efficiencyAnalysis.awayTeamPredictions.scoring.opponentBaseline,
                efficiencyContributions: {
                    scoring: efficiencyAnalysis.homeTeamPredictions.scoring.teamOffensiveEfficiency,
                    passingYards: efficiencyAnalysis.homeTeamPredictions.passingYards.teamOffensiveEfficiency,
                    rushingYards: efficiencyAnalysis.homeTeamPredictions.rushingYards.teamOffensiveEfficiency,
                    turnovers: efficiencyAnalysis.homeTeamPredictions.turnovers.teamOffensiveEfficiency
                },
                weightsUsed: {
                    scoring: currentWeights.scoringEfficiency,
                    passingYards: currentWeights.passingOffense,
                    rushingYards: currentWeights.rushingOffense,
                    turnovers: currentWeights.turnoverMargin
                }
            },
            awayTeam: {
                opponentBaseline: efficiencyAnalysis.homeTeamPredictions.scoring.opponentBaseline,
                efficiencyContributions: {
                    scoring: efficiencyAnalysis.awayTeamPredictions.scoring.teamOffensiveEfficiency,
                    passingYards: efficiencyAnalysis.awayTeamPredictions.passingYards.teamOffensiveEfficiency,
                    rushingYards: efficiencyAnalysis.awayTeamPredictions.rushingYards.teamOffensiveEfficiency,
                    turnovers: efficiencyAnalysis.awayTeamPredictions.turnovers.teamOffensiveEfficiency
                },
                weightsUsed: {
                    scoring: currentWeights.scoringEfficiency,
                    passingYards: currentWeights.passingOffense,
                    rushingYards: currentWeights.rushingOffense,
                    turnovers: currentWeights.turnoverMargin
                }
            }
        };
        
        // Calculate win probability and confidence using statistical confidence
        const scoreDifference = finalHomeScore - finalAwayScore;
        const winProbability = calculateWinProbabilityWithConfidence(
            scoreDifference, 
            efficiencyAnalysis.confidenceLevel,
            statisticalConfidence.modelRSquared
        );
        const confidence = calculatePredictionConfidenceWithRegression(
            efficiencyAnalysis,
            boundaryValidation,
            homeProfile,
            awayProfile,
            statisticalConfidence
        );
        
        // Generate key matchups based on point differentials
        const keyMatchups = generateKeyMatchupsFromPointDifferentials(
            efficiencyAnalysis, 
            homeTeam.name, 
            awayTeam.name
        );
        
        // Apply home field advantage if not neutral site (using regression weight)
        const homeFieldAdjustment = isNeutralSite ? 0 : (currentWeights.homeFieldAdvantage * 30); // Scale to points
        const adjustedHomeScore = finalHomeScore + homeFieldAdjustment;
        
        return {
            gameId,
            homeTeam: {
                id: homeTeam.id,
                name: homeTeam.name,
                logoUrl: homeTeam.logoUrl || undefined
            },
            awayTeam: {
                id: awayTeam.id,
                name: awayTeam.name,
                logoUrl: awayTeam.logoUrl || undefined
            },
            expectedScore: {
                home: Math.round(adjustedHomeScore),
                away: Math.round(finalAwayScore)
            },
            winProbability: Math.round(winProbability),
            confidence: Math.round(confidence),
            spread: Math.round(adjustedHomeScore - finalAwayScore),
            total: Math.round(adjustedHomeScore + finalAwayScore),
            keyMatchups,
            efficiencyAnalysis,
            boundaryValidation,
            statisticalConfidence,
            calculationBreakdown,
            predictionMetadata: {
                homeTeamProfile: homeProfile,
                awayTeamProfile: awayProfile,
                calculationTimestamp: new Date(),
                systemVersion: 'Point-Differential System with Regression Weights v2.0'
            }
        };
        
    } catch (error) {
        console.error(`Error generating point-differential prediction for ${homeTeamId} vs ${awayTeamId}:`, error);
        return null;
    }
}

/**
 * Calculates away team scoring using efficiency interactions
 */
function calculateAwayTeamScoring(awayProfile: AdvancedTeamEfficiencyProfile, homeProfile: AdvancedTeamEfficiencyProfile): number {
    const netEfficiency = awayProfile.scoringOffenseEfficiency - homeProfile.scoringDefenseEfficiency;
    const baseline = 28; // National average points
    // Use point-differential system: baseline + efficiency (not baseline * efficiency)
    return baseline + netEfficiency;
}

/**
 * Calculates away team statistics using efficiency interactions
 */
function calculateAwayTeamStat(offensiveEff: number, defensiveEff: number, baseline: number): number {
    const netEfficiency = offensiveEff - defensiveEff;
    // Use point-differential system: baseline + efficiency (not baseline * efficiency)
    return baseline + netEfficiency;
}

/**
 * Calculates win probability based on score difference, confidence level, and regression model quality
 * Requirements: 6.4, 6.5 - Statistical confidence integration
 */
function calculateWinProbabilityWithConfidence(
    scoreDifference: number, 
    confidenceLevel: 'High' | 'Medium' | 'Low',
    modelRSquared: number
): number {
    // Base probability calculation using logistic function
    const baseProbability = 50 + (scoreDifference * 3.5); // ~3.5% per point difference
    
    // Adjust for confidence level
    const confidenceMultiplier = confidenceLevel === 'High' ? 1.0 : confidenceLevel === 'Medium' ? 0.85 : 0.7;
    
    // Adjust for regression model quality (Requirements: 6.4)
    const rSquaredMultiplier = Math.max(0.5, Math.min(1.0, modelRSquared + 0.3)); // Boost weak models slightly
    
    const adjustedProbability = 50 + ((baseProbability - 50) * confidenceMultiplier * rSquaredMultiplier);
    
    // Clamp between 5% and 95%
    return Math.max(5, Math.min(95, adjustedProbability));
}

/**
 * Legacy function for backward compatibility
 */
function calculateWinProbability(scoreDifference: number, confidenceLevel: 'High' | 'Medium' | 'Low'): number {
    return calculateWinProbabilityWithConfidence(scoreDifference, confidenceLevel, 0.5);
}

/**
 * Calculates overall prediction confidence with regression analysis integration
 * Requirements: 6.4, 6.5 - Statistical confidence information
 */
function calculatePredictionConfidenceWithRegression(
    efficiencyAnalysis: OpponentRelativeMatchupAnalysis,
    boundaryValidation: BoundaryValidationResult,
    homeProfile: AdvancedTeamEfficiencyProfile,
    awayProfile: AdvancedTeamEfficiencyProfile,
    statisticalConfidence: any
): number {
    // Start with efficiency analysis confidence
    let confidence = efficiencyAnalysis.confidenceLevel === 'High' ? 85 : 
                    efficiencyAnalysis.confidenceLevel === 'Medium' ? 70 : 50;
    
    // Boost confidence based on regression model quality (Requirements: 6.4)
    const rSquaredBoost = statisticalConfidence.modelRSquared * 20; // Up to +20 points for perfect model
    confidence += rSquaredBoost;
    
    // Reduce confidence based on boundary adjustments
    confidence -= (boundaryValidation.overallConfidenceReduction * 30);
    
    // Adjust based on team profile quality and sample size adequacy
    const avgGamesPlayed = (homeProfile.gamesPlayed + awayProfile.gamesPlayed) / 2;
    if (!statisticalConfidence.sampleSizeAdequate) {
        confidence -= 20; // Significant penalty for inadequate sample size
    } else if (avgGamesPlayed < 4) {
        confidence -= 15;
    } else if (avgGamesPlayed < 6) {
        confidence -= 8;
    }
    
    // Adjust based on convergence scores
    const avgConvergence = (homeProfile.convergenceScore + awayProfile.convergenceScore) / 2;
    confidence += (avgConvergence - 0.5) * 20; // +/- 10 points based on convergence
    
    // Boost confidence if weights were recently updated with good regression results
    if (statisticalConfidence.weightsLastUpdated) {
        const daysSinceUpdate = (Date.now() - statisticalConfidence.weightsLastUpdated.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate < 7 && statisticalConfidence.modelRSquared > 0.6) {
            confidence += 10; // Recent, high-quality weight update
        }
    }
    
    return Math.max(20, Math.min(95, confidence));
}

/**
 * Legacy function for backward compatibility
 */
function calculatePredictionConfidence(
    efficiencyAnalysis: any,
    boundaryValidation: BoundaryValidationResult,
    homeProfile: AdvancedTeamEfficiencyProfile,
    awayProfile: AdvancedTeamEfficiencyProfile
): number {
    // Create mock statistical confidence for legacy calls
    const mockStatisticalConfidence = {
        modelRSquared: 0.5,
        sampleSizeAdequate: true,
        weightsLastUpdated: null
    };
    
    return calculatePredictionConfidenceWithRegression(
        efficiencyAnalysis,
        boundaryValidation,
        homeProfile,
        awayProfile,
        mockStatisticalConfidence
    );
}

/**
 * Generates key matchups based on point-differential efficiency analysis
 * Requirements: 1.1 - Point-differential system insights
 */
function generateKeyMatchupsFromPointDifferentials(
    analysis: OpponentRelativeMatchupAnalysis,
    homeTeamName: string,
    awayTeamName: string
): string[] {
    const matchups: string[] = [];
    
    // Find the most significant point-differential advantages
    const efficiencies = [
        { 
            category: 'Passing Game', 
            home: analysis.homeTeamPredictions.passingYards.teamOffensiveEfficiency - analysis.awayTeamPredictions.passingYards.teamOffensiveEfficiency,
            type: 'passing',
            weight: analysis.regressionMetadata.weightsUsed.passingOffense
        },
        { 
            category: 'Rushing Attack', 
            home: analysis.homeTeamPredictions.rushingYards.teamOffensiveEfficiency - analysis.awayTeamPredictions.rushingYards.teamOffensiveEfficiency,
            type: 'rushing',
            weight: analysis.regressionMetadata.weightsUsed.rushingOffense
        },
        { 
            category: 'Scoring Efficiency', 
            home: analysis.homeTeamPredictions.scoring.teamOffensiveEfficiency - analysis.awayTeamPredictions.scoring.teamOffensiveEfficiency,
            type: 'scoring',
            weight: analysis.regressionMetadata.weightsUsed.scoringEfficiency
        },
        { 
            category: 'Turnover Battle', 
            home: -(analysis.homeTeamPredictions.turnovers.teamOffensiveEfficiency - analysis.awayTeamPredictions.turnovers.teamOffensiveEfficiency), // Negative because fewer turnovers is better
            type: 'turnovers',
            weight: analysis.regressionMetadata.weightsUsed.turnoverMargin
        }
    ];
    
    // Sort by weighted advantage (point differential * regression weight)
    efficiencies.sort((a, b) => Math.abs(b.home * b.weight) - Math.abs(a.home * a.weight));
    
    for (let i = 0; i < Math.min(3, efficiencies.length); i++) {
        const eff = efficiencies[i];
        const advantage = Math.abs(eff.home);
        const weightedAdvantage = Math.abs(eff.home * eff.weight);
        
        if (advantage > 2 && weightedAdvantage > 0.5) { // Meaningful point differential and weighted impact
            const favoredTeam = eff.home > 0 ? homeTeamName : awayTeamName;
            const advantageLevel = advantage > 10 ? 'significant' : advantage > 5 ? 'moderate' : 'slight';
            const pointsText = advantage > 1 ? `${advantage.toFixed(1)} points` : `${advantage.toFixed(1)} point`;
            
            matchups.push(`${eff.category}: ${favoredTeam} averages ${pointsText} better (${advantageLevel} advantage)`);
        }
    }
    
    // Add regression model confidence information
    if (analysis.regressionMetadata.statisticalSignificance) {
        matchups.push(`Predictions based on statistically significant model (R² = ${analysis.regressionMetadata.modelRSquared.toFixed(2)})`);
    } else {
        matchups.push(`Model has limited statistical significance - predictions should be interpreted cautiously`);
    }
    
    // Add overall matchup summary if no specific advantages
    if (matchups.length <= 1) { // Only regression info added
        matchups.push(`Even matchup with ${analysis.confidenceLevel.toLowerCase()} confidence in point-differential predictions`);
    }
    
    return matchups;
}

/**
 * Legacy function for backward compatibility
 */
function generateKeyMatchups(
    analysis: any,
    homeTeamName: string,
    awayTeamName: string
): string[] {
    // If it's the new analysis type, use the new function
    if (analysis.regressionMetadata) {
        return generateKeyMatchupsFromPointDifferentials(analysis, homeTeamName, awayTeamName);
    }
    
    // Legacy fallback for old analysis format
    const matchups: string[] = [];
    matchups.push(`Legacy analysis - consider updating to point-differential system`);
    return matchups;
}