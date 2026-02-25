// server/services/validation/prediction-accuracy-tester.ts

import { BaseValidator, validationLogger, errorHandler, DEFAULT_VALIDATION_CONFIG } from './core.js';
import { 
  ValidationResult, 
  AccuracyTestResult, 
  WinAccuracyMetrics, 
  ScoreAccuracyMetrics, 
  CalibrationMetrics, 
  BiasAnalysis, 
  ReliabilityAnalysis 
} from './types.js';
import { ValidationUtils } from './utils.js';
import { db } from '../../db.js';
import { games, teams } from '@college-pickem/shared';
import { eq, and, isNotNull, gte, lte, sql } from 'drizzle-orm';
import { getGamePrediction, GamePrediction } from '../predictionService.js';

/**
 * Prediction Accuracy Tester - Tests prediction accuracy against actual game outcomes
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
export class PredictionAccuracyTester extends BaseValidator {
  
  constructor() {
    super('prediction_accuracy', validationLogger, errorHandler, DEFAULT_VALIDATION_CONFIG);
  }

  /**
   * Main validation method - runs comprehensive accuracy testing
   * Requirements: 4.1, 4.2, 4.5
   */
  async validate(season: number, sampleSize?: number): Promise<AccuracyTestResult> {
    console.log(`[Prediction Accuracy Tester] Starting accuracy testing for season ${season}`);
    
    try {
      // Task 5.1: Select representative games and generate test predictions
      const testGames = await this.selectSampleGames(season, sampleSize);
      const testPredictions = await this.generateTestPredictions(testGames);
      
      // Task 5.2: Calculate accuracy metrics
      const winAccuracy = await this.calculateWinProbabilityAccuracy(testPredictions);
      const scoreAccuracy = await this.calculateScorePredictionAccuracy(testPredictions);
      const calibration = await this.calculateConfidenceCalibration(testPredictions);
      
      // Task 5.3: Detect systematic biases
      const biases = await this.detectSystematicBiases(testPredictions);
      const reliability = await this.analyzeReliabilityByConfidence(testPredictions);
      
      // Create comprehensive result
      const result = this.createBaseResult(true, 100) as AccuracyTestResult;
      result.sampleSize = testPredictions.length;
      result.testPeriod = {
        startDate: new Date(Math.min(...testGames.map(g => g.gameTime?.getTime() || 0))),
        endDate: new Date(Math.max(...testGames.map(g => g.gameTime?.getTime() || 0))),
        season
      };
      result.winProbabilityAccuracy = winAccuracy;
      result.scorePredictionAccuracy = scoreAccuracy;
      result.confidenceCalibration = calibration;
      result.systematicBiases = biases;
      result.predictionReliability = reliability;
      
      // Calculate overall score based on accuracy metrics
      const overallScore = this.calculateOverallAccuracyScore(winAccuracy, scoreAccuracy, calibration, biases);
      result.score = overallScore;
      result.isValid = overallScore >= this.config.thresholds.accuracy.minimumAccuracy;
      
      // Add recommendations
      this.addAccuracyRecommendations(result, winAccuracy, scoreAccuracy, calibration, biases);
      
      this.logResult(result);
      return result;
      
    } catch (error) {
      console.error(`[Prediction Accuracy Tester] Error during accuracy testing:`, error);
      const result = this.createBaseResult(false, 0) as AccuracyTestResult;
      this.addError(result, 'ACCURACY_TEST_FAILED', `Accuracy testing failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'critical');
      return result;
    }
  }

  /**
   * Task 5.1: Select representative games with complete data and known outcomes
   * Requirements: 4.1, 4.2, 4.5
   */
  async selectSampleGames(season: number, sampleSize: number = 100): Promise<Array<{
    id: number;
    homeTeamId: number;
    awayTeamId: number;
    homeTeamScore: number;
    awayTeamScore: number;
    gameTime: Date | null;
    week: number;
    homeTeam: { id: number; name: string; };
    awayTeam: { id: number; name: string; };
  }>> {
    console.log(`[Prediction Accuracy Tester] Selecting sample games for season ${season}, target size: ${sampleSize}`);
    
    try {
      // Get completed games with final scores
      const completedGames = await db.query.games.findMany({
        where: and(
          eq(games.season, season),
          eq(games.isFinal, true),
          isNotNull(games.homeTeamScore),
          isNotNull(games.awayTeamScore)
        ),
        with: {
          homeTeam: {
            columns: { id: true, name: true }
          },
          awayTeam: {
            columns: { id: true, name: true }
          }
        },
        orderBy: sql`RANDOM()`, // Random sampling for representative selection
        limit: Math.min(sampleSize * 2, 500) // Get more than needed to filter for quality
      });
      
      if (completedGames.length === 0) {
        throw new Error(`No completed games found for season ${season}`);
      }
      
      console.log(`[Prediction Accuracy Tester] Found ${completedGames.length} completed games`);
      
      // Filter for games with complete data and diverse scenarios
      const qualityGames = completedGames.filter(game => {
        // Must have valid scores
        if (!game.homeTeamScore || !game.awayTeamScore) return false;
        if (game.homeTeamScore < 0 || game.awayTeamScore < 0) return false;
        if (game.homeTeamScore > 200 || game.awayTeamScore > 200) return false;
        
        // Must have team information
        if (!game.homeTeam || !game.awayTeam) return false;
        
        return true;
      });
      
      // Ensure diverse sample representing different game types
      const diverseSample = this.selectDiverseGameSample(qualityGames, sampleSize);
      
      console.log(`[Prediction Accuracy Tester] Selected ${diverseSample.length} representative games`);
      
      return diverseSample.map(game => ({
        id: game.id,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        homeTeamScore: game.homeTeamScore!,
        awayTeamScore: game.awayTeamScore!,
        gameTime: game.gameTime,
        week: game.week,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam
      }));
      
    } catch (error) {
      console.error(`[Prediction Accuracy Tester] Error selecting sample games:`, error);
      throw new Error(`Failed to select sample games: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Select diverse game sample representing different scenarios
   * Requirements: 4.1 - Representative games with different scenarios
   */
  private selectDiverseGameSample(games: any[], targetSize: number): any[] {
    if (games.length <= targetSize) return games;
    
    const sample: any[] = [];
    const gamesByType = {
      close: games.filter(g => Math.abs(g.homeTeamScore - g.awayTeamScore) <= 7),
      moderate: games.filter(g => {
        const diff = Math.abs(g.homeTeamScore - g.awayTeamScore);
        return diff > 7 && diff <= 21;
      }),
      blowout: games.filter(g => Math.abs(g.homeTeamScore - g.awayTeamScore) > 21),
      highScoring: games.filter(g => (g.homeTeamScore + g.awayTeamScore) > 60),
      lowScoring: games.filter(g => (g.homeTeamScore + g.awayTeamScore) < 35),
      homeWins: games.filter(g => g.homeTeamScore > g.awayTeamScore),
      awayWins: games.filter(g => g.awayTeamScore > g.homeTeamScore)
    };
    
    // Allocate samples proportionally but ensure representation
    const minPerType = Math.max(1, Math.floor(targetSize * 0.1)); // At least 10% of each type
    const remainingSlots = targetSize - (Object.keys(gamesByType).length * minPerType);
    
    // Add minimum samples from each type
    for (const [type, typeGames] of Object.entries(gamesByType)) {
      const shuffled = [...typeGames].sort(() => Math.random() - 0.5);
      sample.push(...shuffled.slice(0, Math.min(minPerType, typeGames.length)));
    }
    
    // Fill remaining slots randomly from all games
    const usedGameIds = new Set(sample.map(g => g.id));
    const remainingGames = games.filter(g => !usedGameIds.has(g.id));
    const shuffledRemaining = [...remainingGames].sort(() => Math.random() - 0.5);
    sample.push(...shuffledRemaining.slice(0, Math.min(remainingSlots, shuffledRemaining.length)));
    
    return sample.slice(0, targetSize);
  }

  /**
   * Task 5.1: Generate predictions using the same process as live predictions
   * Requirements: 4.2, 4.5 - Generate predictions with full traceability
   */
  async generateTestPredictions(testGames: Array<{
    id: number;
    homeTeamId: number;
    awayTeamId: number;
    homeTeamScore: number;
    awayTeamScore: number;
    gameTime: Date | null;
    week: number;
    homeTeam: { id: number; name: string; };
    awayTeam: { id: number; name: string; };
  }>): Promise<Array<{
    gameId: number;
    prediction: GamePrediction;
    actual: {
      homeScore: number;
      awayScore: number;
      homeTeamId: number;
      awayTeamId: number;
      winner: number;
    };
    metadata: {
      gameTime: Date | null;
      week: number;
      homeTeamName: string;
      awayTeamName: string;
    };
  }>> {
    console.log(`[Prediction Accuracy Tester] Generating test predictions for ${testGames.length} games`);
    
    const testPredictions: Array<{
      gameId: number;
      prediction: GamePrediction;
      actual: {
        homeScore: number;
        awayScore: number;
        homeTeamId: number;
        awayTeamId: number;
        winner: number;
      };
      metadata: {
        gameTime: Date | null;
        week: number;
        homeTeamName: string;
        awayTeamName: string;
      };
    }> = [];
    
    let successCount = 0;
    let failureCount = 0;
    
    for (const game of testGames) {
      try {
        console.log(`[Prediction Accuracy Tester] Generating prediction for game ${game.id}: ${game.homeTeam.name} vs ${game.awayTeam.name}`);
        
        // Generate prediction using the same process as live predictions
        const prediction = await getGamePrediction(
          game.homeTeamId,
          game.awayTeamId,
          testGames[0]?.gameTime ? new Date(testGames[0].gameTime).getFullYear() : new Date().getFullYear(),
          game.id
        );
        
        // Determine actual winner
        const actualWinner = game.homeTeamScore > game.awayTeamScore ? game.homeTeamId : game.awayTeamId;
        
        testPredictions.push({
          gameId: game.id,
          prediction,
          actual: {
            homeScore: game.homeTeamScore,
            awayScore: game.awayTeamScore,
            homeTeamId: game.homeTeamId,
            awayTeamId: game.awayTeamId,
            winner: actualWinner
          },
          metadata: {
            gameTime: game.gameTime,
            week: game.week,
            homeTeamName: game.homeTeam.name,
            awayTeamName: game.awayTeam.name
          }
        });
        
        successCount++;
        
      } catch (error) {
        console.error(`[Prediction Accuracy Tester] Failed to generate prediction for game ${game.id}:`, error);
        failureCount++;
        
        // Continue with other games rather than failing completely
        continue;
      }
    }
    
    console.log(`[Prediction Accuracy Tester] Generated ${successCount} predictions successfully, ${failureCount} failures`);
    
    if (testPredictions.length === 0) {
      throw new Error('No test predictions could be generated');
    }
    
    if (testPredictions.length < testGames.length * 0.5) {
      console.warn(`[Prediction Accuracy Tester] Low success rate: ${successCount}/${testGames.length} predictions generated`);
    }
    
    return testPredictions;
  }

  /**
   * Task 5.2: Calculate win probability accuracy using Brier score and log-loss
   * Requirements: 4.3, 4.4, 4.5
   */
  async calculateWinProbabilityAccuracy(testPredictions: Array<{
    prediction: GamePrediction;
    actual: { winner: number; homeTeamId: number; };
  }>): Promise<WinAccuracyMetrics> {
    console.log(`[Prediction Accuracy Tester] Calculating win probability accuracy for ${testPredictions.length} predictions`);
    
    let brierScoreSum = 0;
    let logLossSum = 0;
    let correctPredictions = 0;
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    let trueNegatives = 0;
    
    for (const test of testPredictions) {
      const predictedHomeWinProb = test.prediction.winProbability / 100; // Convert to 0-1
      const actualHomeWin = test.actual.winner === test.actual.homeTeamId ? 1 : 0;
      
      // Brier Score: (predicted_probability - actual_outcome)^2
      const brierScore = Math.pow(predictedHomeWinProb - actualHomeWin, 2);
      brierScoreSum += brierScore;
      
      // Log Loss: -[actual * log(predicted) + (1-actual) * log(1-predicted)]
      const clampedProb = Math.max(0.001, Math.min(0.999, predictedHomeWinProb)); // Avoid log(0)
      const logLoss = -(actualHomeWin * Math.log(clampedProb) + (1 - actualHomeWin) * Math.log(1 - clampedProb));
      logLossSum += logLoss;
      
      // Accuracy: correct winner prediction
      const predictedWinner = predictedHomeWinProb > 0.5 ? test.actual.homeTeamId : 
                             (test.prediction.awayTeam.id || (test.actual.homeTeamId === 1 ? 2 : 1));
      if (predictedWinner === test.actual.winner) {
        correctPredictions++;
      }
      
      // Confusion matrix for precision/recall
      if (predictedHomeWinProb > 0.5 && actualHomeWin === 1) truePositives++;
      else if (predictedHomeWinProb > 0.5 && actualHomeWin === 0) falsePositives++;
      else if (predictedHomeWinProb <= 0.5 && actualHomeWin === 1) falseNegatives++;
      else if (predictedHomeWinProb <= 0.5 && actualHomeWin === 0) trueNegatives++;
    }
    
    const count = testPredictions.length;
    const brierScore = brierScoreSum / count;
    const logLoss = logLossSum / count;
    const accuracy = (correctPredictions / count) * 100;
    
    const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
    const recall = truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0;
    const f1Score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
    
    // ROC AUC approximation (simplified)
    const rocAuc = this.calculateROCAUC(testPredictions);
    
    console.log(`[Prediction Accuracy Tester] Win probability metrics - Accuracy: ${accuracy.toFixed(1)}%, Brier: ${brierScore.toFixed(3)}, LogLoss: ${logLoss.toFixed(3)}`);
    
    return {
      brierScore,
      logLoss,
      accuracy,
      precision,
      recall,
      f1Score,
      rocAuc
    };
  }

  /**
   * Calculate ROC AUC for win probability predictions
   */
  private calculateROCAUC(testPredictions: Array<{
    prediction: GamePrediction;
    actual: { winner: number; homeTeamId: number; };
  }>): number {
    // Sort predictions by probability
    const sorted = testPredictions
      .map(test => ({
        prob: test.prediction.winProbability / 100,
        actual: test.actual.winner === test.actual.homeTeamId ? 1 : 0
      }))
      .sort((a, b) => b.prob - a.prob);
    
    let auc = 0;
    let positives = 0;
    let negatives = 0;
    
    // Count positives and negatives
    for (const item of sorted) {
      if (item.actual === 1) positives++;
      else negatives++;
    }
    
    if (positives === 0 || negatives === 0) return 0.5; // No discrimination possible
    
    // Calculate AUC using trapezoidal rule
    let truePositiveRate = 0;
    let falsePositiveRate = 0;
    let prevTPR = 0;
    let prevFPR = 0;
    
    let currentPositives = 0;
    let currentNegatives = 0;
    
    for (const item of sorted) {
      if (item.actual === 1) currentPositives++;
      else currentNegatives++;
      
      truePositiveRate = currentPositives / positives;
      falsePositiveRate = currentNegatives / negatives;
      
      // Add area of trapezoid
      auc += (falsePositiveRate - prevFPR) * (truePositiveRate + prevTPR) / 2;
      
      prevTPR = truePositiveRate;
      prevFPR = falsePositiveRate;
    }
    
    return Math.max(0, Math.min(1, auc));
  }

  /**
   * Calculate overall accuracy score based on all metrics
   */
  private calculateOverallAccuracyScore(
    winAccuracy: WinAccuracyMetrics,
    scoreAccuracy: ScoreAccuracyMetrics,
    calibration: CalibrationMetrics,
    biases: BiasAnalysis[]
  ): number {
    // Start with base score
    let score = 50;
    
    // Win probability accuracy (40% weight)
    score += (winAccuracy.accuracy - 50) * 0.4; // 50% is baseline
    score += (0.25 - winAccuracy.brierScore) * 100; // Lower Brier is better
    score += (winAccuracy.rocAuc - 0.5) * 40; // 0.5 is baseline
    
    // Score prediction accuracy (30% weight)
    const avgMAE = (scoreAccuracy.homeTeamAccuracy.mae + scoreAccuracy.awayTeamAccuracy.mae) / 2;
    score += Math.max(-20, (14 - avgMAE) * 2); // 14 points MAE is baseline
    
    // Calibration (20% weight)
    score += (calibration.calibrationScore - 50) * 0.2;
    
    // Bias penalty (10% weight)
    const significantBiases = biases.filter(b => b.significance > 0.05).length;
    score -= significantBiases * 5;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Add recommendations based on accuracy results
   */
  private addAccuracyRecommendations(
    result: AccuracyTestResult,
    winAccuracy: WinAccuracyMetrics,
    scoreAccuracy: ScoreAccuracyMetrics,
    calibration: CalibrationMetrics,
    biases: BiasAnalysis[]
  ): void {
    if (winAccuracy.accuracy < 60) {
      this.addRecommendation(result, `Win prediction accuracy (${winAccuracy.accuracy.toFixed(1)}%) is below target - review prediction model`);
    }
    
    if (winAccuracy.brierScore > 0.25) {
      this.addRecommendation(result, `Brier score (${winAccuracy.brierScore.toFixed(3)}) indicates poor probability calibration`);
    }
    
    const avgMAE = (scoreAccuracy.homeTeamAccuracy.mae + scoreAccuracy.awayTeamAccuracy.mae) / 2;
    if (avgMAE > 14) {
      this.addRecommendation(result, `Score prediction error (${avgMAE.toFixed(1)} points MAE) is high - review scoring model`);
    }
    
    if (calibration.calibrationScore < 70) {
      this.addRecommendation(result, `Confidence calibration (${calibration.calibrationScore.toFixed(1)}) needs improvement`);
    }
    
    const significantBiases = biases.filter(b => b.significance > 0.05);
    if (significantBiases.length > 0) {
      this.addRecommendation(result, `${significantBiases.length} significant biases detected - review prediction methodology`);
    }
    
    if (result.score >= 80) {
      this.addRecommendation(result, 'Prediction accuracy is excellent - maintain current methodology');
    } else if (result.score >= 70) {
      this.addRecommendation(result, 'Prediction accuracy is good - minor improvements possible');
    } else {
      this.addRecommendation(result, 'Prediction accuracy needs significant improvement - review entire prediction pipeline');
    }
  }

  /**
   * Task 5.2: Measure score prediction error with MAE and RMSE
   * Requirements: 4.3, 4.4, 4.5
   */
  async calculateScorePredictionAccuracy(testPredictions: Array<{
    prediction: GamePrediction;
    actual: { homeScore: number; awayScore: number; };
  }>): Promise<ScoreAccuracyMetrics> {
    console.log(`[Prediction Accuracy Tester] Calculating score prediction accuracy for ${testPredictions.length} predictions`);
    
    let homeErrors: number[] = [];
    let awayErrors: number[] = [];
    let homeAbsErrors: number[] = [];
    let awayAbsErrors: number[] = [];
    let homeSquaredErrors: number[] = [];
    let awaySquaredErrors: number[] = [];
    let totalAbsErrors: number[] = [];
    let percentageErrors: number[] = [];
    
    for (const test of testPredictions) {
      const homeError = test.prediction.expectedScore.home - test.actual.homeScore;
      const awayError = test.prediction.expectedScore.away - test.actual.awayScore;
      
      homeErrors.push(homeError);
      awayErrors.push(awayError);
      homeAbsErrors.push(Math.abs(homeError));
      awayAbsErrors.push(Math.abs(awayError));
      homeSquaredErrors.push(homeError * homeError);
      awaySquaredErrors.push(awayError * awayError);
      
      const totalError = Math.abs(homeError) + Math.abs(awayError);
      totalAbsErrors.push(totalError);
      
      // Percentage error based on actual total score
      const actualTotal = test.actual.homeScore + test.actual.awayScore;
      if (actualTotal > 0) {
        const percentageError = (totalError / actualTotal) * 100;
        percentageErrors.push(percentageError);
      }
    }
    
    // Calculate metrics
    const homeMae = homeAbsErrors.reduce((sum, err) => sum + err, 0) / homeAbsErrors.length;
    const awayMae = awayAbsErrors.reduce((sum, err) => sum + err, 0) / awayAbsErrors.length;
    const homeRmse = Math.sqrt(homeSquaredErrors.reduce((sum, err) => sum + err, 0) / homeSquaredErrors.length);
    const awayRmse = Math.sqrt(awaySquaredErrors.reduce((sum, err) => sum + err, 0) / awaySquaredErrors.length);
    
    const overallMae = totalAbsErrors.reduce((sum, err) => sum + err, 0) / totalAbsErrors.length;
    const overallRmse = Math.sqrt(
      (homeSquaredErrors.reduce((sum, err) => sum + err, 0) + awaySquaredErrors.reduce((sum, err) => sum + err, 0)) / 
      (homeSquaredErrors.length + awaySquaredErrors.length)
    );
    
    // Calculate median absolute error
    const sortedTotalErrors = [...totalAbsErrors].sort((a, b) => a - b);
    const medianAbsoluteError = sortedTotalErrors.length % 2 === 0
      ? (sortedTotalErrors[sortedTotalErrors.length / 2 - 1] + sortedTotalErrors[sortedTotalErrors.length / 2]) / 2
      : sortedTotalErrors[Math.floor(sortedTotalErrors.length / 2)];
    
    // Calculate mean percentage error
    const meanPercentageError = percentageErrors.length > 0 
      ? percentageErrors.reduce((sum, err) => sum + err, 0) / percentageErrors.length
      : 0;
    
    // Calculate bias (systematic over/under prediction)
    const homeBias = homeErrors.reduce((sum, err) => sum + err, 0) / homeErrors.length;
    const awayBias = awayErrors.reduce((sum, err) => sum + err, 0) / awayErrors.length;
    
    console.log(`[Prediction Accuracy Tester] Score accuracy - Overall MAE: ${overallMae.toFixed(1)}, RMSE: ${overallRmse.toFixed(1)}`);
    
    return {
      meanAbsoluteError: overallMae,
      rootMeanSquareError: overallRmse,
      medianAbsoluteError,
      meanPercentageError,
      homeTeamAccuracy: {
        mae: homeMae,
        rmse: homeRmse,
        bias: homeBias
      },
      awayTeamAccuracy: {
        mae: awayMae,
        rmse: awayRmse,
        bias: awayBias
      }
    };
  }

  /**
   * Task 5.2: Implement confidence calibration analysis
   * Requirements: 4.3, 4.4, 4.5
   */
  async calculateConfidenceCalibration(testPredictions: Array<{
    prediction: GamePrediction;
    actual: { winner: number; homeTeamId: number; };
  }>): Promise<CalibrationMetrics> {
    console.log(`[Prediction Accuracy Tester] Calculating confidence calibration for ${testPredictions.length} predictions`);
    
    const bins = 10;
    const calibrationBins: Array<{
      predictedProbability: number;
      actualProbability: number;
      sampleSize: number;
      predictions: number[];
      outcomes: number[];
    }> = [];
    
    // Initialize bins
    for (let i = 0; i < bins; i++) {
      calibrationBins.push({
        predictedProbability: (i + 0.5) / bins, // Bin center
        actualProbability: 0,
        sampleSize: 0,
        predictions: [],
        outcomes: []
      });
    }
    
    // Assign predictions to bins
    for (const test of testPredictions) {
      const predictedProb = test.prediction.winProbability / 100;
      const actualOutcome = test.actual.winner === test.actual.homeTeamId ? 1 : 0;
      
      const binIndex = Math.min(bins - 1, Math.floor(predictedProb * bins));
      calibrationBins[binIndex].predictions.push(predictedProb);
      calibrationBins[binIndex].outcomes.push(actualOutcome);
      calibrationBins[binIndex].sampleSize++;
    }
    
    // Calculate actual probabilities for each bin
    let totalCalibrationError = 0;
    let maxCalibrationError = 0;
    let overconfidentCount = 0;
    let underconfidentCount = 0;
    
    const calibrationCurve: Array<{
      predictedProbability: number;
      actualProbability: number;
      sampleSize: number;
    }> = [];
    
    for (const bin of calibrationBins) {
      if (bin.sampleSize > 0) {
        bin.actualProbability = bin.outcomes.reduce((sum, outcome) => sum + outcome, 0) / bin.sampleSize;
        
        const avgPredicted = bin.predictions.reduce((sum, pred) => sum + pred, 0) / bin.predictions.length;
        const calibrationError = Math.abs(avgPredicted - bin.actualProbability);
        
        totalCalibrationError += calibrationError * bin.sampleSize;
        maxCalibrationError = Math.max(maxCalibrationError, calibrationError);
        
        // Count over/under confidence
        if (avgPredicted > bin.actualProbability) {
          overconfidentCount += bin.sampleSize;
        } else if (avgPredicted < bin.actualProbability) {
          underconfidentCount += bin.sampleSize;
        }
        
        calibrationCurve.push({
          predictedProbability: avgPredicted,
          actualProbability: bin.actualProbability,
          sampleSize: bin.sampleSize
        });
      }
    }
    
    const expectedCalibrationError = totalCalibrationError / testPredictions.length;
    const calibrationScore = Math.max(0, 100 - (expectedCalibrationError * 200)); // Scale to 0-100
    
    const overconfidenceRate = overconfidentCount / testPredictions.length;
    const underconfidenceRate = underconfidentCount / testPredictions.length;
    
    console.log(`[Prediction Accuracy Tester] Calibration - Score: ${calibrationScore.toFixed(1)}, ECE: ${expectedCalibrationError.toFixed(3)}`);
    
    return {
      calibrationScore,
      overconfidenceRate,
      underconfidenceRate,
      calibrationCurve,
      reliabilityDiagram: {
        bins,
        expectedCalibrationError,
        maximumCalibrationError: maxCalibrationError
      }
    };
  }

  /**
   * Task 5.3: Identify patterns in prediction errors (home team bias, score range bias)
   * Requirements: 4.4, 4.5
   */
  async detectSystematicBiases(testPredictions: Array<{
    gameId: number;
    prediction: GamePrediction;
    actual: { homeScore: number; awayScore: number; winner: number; homeTeamId: number; awayTeamId: number; };
    metadata: { homeTeamName: string; awayTeamName: string; };
  }>): Promise<BiasAnalysis[]> {
    console.log(`[Prediction Accuracy Tester] Detecting systematic biases in ${testPredictions.length} predictions`);
    
    const biases: BiasAnalysis[] = [];
    
    // Home team bias analysis
    const homeTeamBias = await this.analyzeHomeTeamBias(testPredictions);
    if (homeTeamBias) biases.push(homeTeamBias);
    
    // Score range bias analysis
    const scoreRangeBias = await this.analyzeScoreRangeBias(testPredictions);
    if (scoreRangeBias) biases.push(scoreRangeBias);
    
    // Game type bias analysis
    const gameTypeBias = await this.analyzeGameTypeBias(testPredictions);
    if (gameTypeBias) biases.push(gameTypeBias);
    
    // Team strength bias analysis
    const teamStrengthBias = await this.analyzeTeamStrengthBias(testPredictions);
    if (teamStrengthBias) biases.push(teamStrengthBias);
    
    console.log(`[Prediction Accuracy Tester] Detected ${biases.length} systematic biases`);
    
    return biases;
  }

  /**
   * Analyze home team prediction bias
   */
  private async analyzeHomeTeamBias(testPredictions: Array<{
    prediction: GamePrediction;
    actual: { homeScore: number; awayScore: number; winner: number; homeTeamId: number; awayTeamId: number; };
    gameId: number;
    metadata: { homeTeamName: string; awayTeamName: string; };
  }>): Promise<BiasAnalysis | null> {
    let homeWinPredictions = 0;
    let homeWinActual = 0;
    let homeScoreBias = 0;
    let homeWinProbBias = 0;
    
    const examples: Array<{
      gameId: number;
      predicted: any;
      actual: any;
      bias: number;
    }> = [];
    
    for (const test of testPredictions) {
      const predictedHomeWin = test.prediction.winProbability > 50;
      const actualHomeWin = test.actual.winner === test.actual.homeTeamId;
      
      if (predictedHomeWin) homeWinPredictions++;
      if (actualHomeWin) homeWinActual++;
      
      const scoreBias = test.prediction.expectedScore.home - test.actual.homeScore;
      homeScoreBias += scoreBias;
      
      const probBias = (test.prediction.winProbability / 100) - (actualHomeWin ? 1 : 0);
      homeWinProbBias += probBias;
      
      // Collect examples of significant bias
      if (Math.abs(scoreBias) > 10 || Math.abs(probBias) > 0.3) {
        examples.push({
          gameId: test.gameId,
          predicted: {
            homeScore: test.prediction.expectedScore.home,
            winProbability: test.prediction.winProbability,
            homeTeam: test.metadata.homeTeamName
          },
          actual: {
            homeScore: test.actual.homeScore,
            winner: actualHomeWin ? 'home' : 'away',
            homeTeam: test.metadata.homeTeamName
          },
          bias: scoreBias
        });
      }
    }
    
    const avgScoreBias = homeScoreBias / testPredictions.length;
    const avgProbBias = homeWinProbBias / testPredictions.length;
    const winRateBias = (homeWinPredictions / testPredictions.length) - (homeWinActual / testPredictions.length);
    
    // Calculate statistical significance (simplified t-test)
    const biasVariance = testPredictions.reduce((sum, test) => {
      const scoreBias = test.prediction.expectedScore.home - test.actual.homeScore;
      return sum + Math.pow(scoreBias - avgScoreBias, 2);
    }, 0) / testPredictions.length;
    
    const standardError = Math.sqrt(biasVariance / testPredictions.length);
    const tStatistic = Math.abs(avgScoreBias) / (standardError + 0.001); // Avoid division by zero
    const significance = tStatistic > 2 ? 0.05 : tStatistic > 1.5 ? 0.1 : 0.2; // Simplified p-value
    
    // Only report if bias is significant
    if (Math.abs(avgScoreBias) > 2 || Math.abs(winRateBias) > 0.05) {
      return {
        biasType: 'home_team',
        description: `Home team scoring bias: ${avgScoreBias > 0 ? 'over' : 'under'}-predicting by ${Math.abs(avgScoreBias).toFixed(1)} points on average`,
        magnitude: Math.abs(avgScoreBias),
        significance,
        affectedGames: testPredictions.length,
        examples: examples.slice(0, 5) // Top 5 examples
      };
    }
    
    return null;
  }

  /**
   * Analyze score range prediction bias
   */
  private async analyzeScoreRangeBias(testPredictions: Array<{
    prediction: GamePrediction;
    actual: { homeScore: number; awayScore: number; };
    gameId: number;
    metadata: { homeTeamName: string; awayTeamName: string; };
  }>): Promise<BiasAnalysis | null> {
    const scoreRanges = [
      { name: 'Low Scoring', min: 0, max: 35, predictions: [] as typeof testPredictions, biases: [] as number[] },
      { name: 'Medium Scoring', min: 36, max: 60, predictions: [] as typeof testPredictions, biases: [] as number[] },
      { name: 'High Scoring', min: 61, max: 200, predictions: [] as typeof testPredictions, biases: [] as number[] }
    ];
    
    // Categorize predictions by actual total score
    for (const test of testPredictions) {
      const actualTotal = test.actual.homeScore + test.actual.awayScore;
      const predictedTotal = test.prediction.expectedScore.home + test.prediction.expectedScore.away;
      const bias = predictedTotal - actualTotal;
      
      for (const range of scoreRanges) {
        if (actualTotal >= range.min && actualTotal <= range.max) {
          range.predictions.push(test);
          range.biases.push(bias);
          break;
        }
      }
    }
    
    // Find the range with the most significant bias
    let maxBias = 0;
    let maxBiasRange: typeof scoreRanges[0] | null = null;
    
    for (const range of scoreRanges) {
      if (range.biases.length > 5) { // Need sufficient sample size
        const avgBias = range.biases.reduce((sum, bias) => sum + bias, 0) / range.biases.length;
        if (Math.abs(avgBias) > Math.abs(maxBias)) {
          maxBias = avgBias;
          maxBiasRange = range;
        }
      }
    }
    
    if (maxBiasRange && Math.abs(maxBias) > 3) {
      const examples = maxBiasRange.predictions.slice(0, 3).map(test => ({
        gameId: test.gameId,
        predicted: {
          total: test.prediction.expectedScore.home + test.prediction.expectedScore.away,
          homeScore: test.prediction.expectedScore.home,
          awayScore: test.prediction.expectedScore.away
        },
        actual: {
          total: test.actual.homeScore + test.actual.awayScore,
          homeScore: test.actual.homeScore,
          awayScore: test.actual.awayScore
        },
        bias: (test.prediction.expectedScore.home + test.prediction.expectedScore.away) - (test.actual.homeScore + test.actual.awayScore)
      }));
      
      return {
        biasType: 'score_range',
        description: `${maxBiasRange.name} games: ${maxBias > 0 ? 'over' : 'under'}-predicting total score by ${Math.abs(maxBias).toFixed(1)} points on average`,
        magnitude: Math.abs(maxBias),
        significance: Math.abs(maxBias) > 5 ? 0.05 : 0.1,
        affectedGames: maxBiasRange.predictions.length,
        examples
      };
    }
    
    return null;
  }

  /**
   * Analyze game type bias (close games, blowouts, etc.)
   */
  private async analyzeGameTypeBias(testPredictions: Array<{
    prediction: GamePrediction;
    actual: { homeScore: number; awayScore: number; winner: number; homeTeamId: number; awayTeamId: number; };
    gameId: number;
    metadata: { homeTeamName: string; awayTeamName: string; };
  }>): Promise<BiasAnalysis | null> {
    const gameTypes = [
      { name: 'Close Games', filter: (test: any) => Math.abs(test.actual.homeScore - test.actual.awayScore) <= 7, predictions: [] as typeof testPredictions, accuracies: [] as number[] },
      { name: 'Blowouts', filter: (test: any) => Math.abs(test.actual.homeScore - test.actual.awayScore) > 21, predictions: [] as typeof testPredictions, accuracies: [] as number[] },
      { name: 'Moderate Wins', filter: (test: any) => {
        const diff = Math.abs(test.actual.homeScore - test.actual.awayScore);
        return diff > 7 && diff <= 21;
      }, predictions: [] as typeof testPredictions, accuracies: [] as number[] }
    ];
    
    // Categorize predictions by game type
    for (const test of testPredictions) {
      for (const gameType of gameTypes) {
        if (gameType.filter(test)) {
          gameType.predictions.push(test);
          
          // Calculate prediction accuracy for this game
          const predictedWinner = test.prediction.winProbability > 50 ? test.actual.homeTeamId : test.actual.awayTeamId;
          const correct = predictedWinner === test.actual.winner;
          gameType.accuracies.push(correct ? 1 : 0);
          break;
        }
      }
    }
    
    // Find game type with worst accuracy
    let worstAccuracy = 1;
    let worstGameType: typeof gameTypes[0] | null = null;
    
    for (const gameType of gameTypes) {
      if (gameType.accuracies.length > 5) { // Need sufficient sample size
        const accuracy = gameType.accuracies.reduce((sum, acc) => sum + acc, 0) / gameType.accuracies.length;
        if (accuracy < worstAccuracy) {
          worstAccuracy = accuracy;
          worstGameType = gameType;
        }
      }
    }
    
    if (worstGameType && worstAccuracy < 0.6) {
      const examples = worstGameType.predictions.slice(0, 3).map(test => ({
        gameId: test.gameId,
        predicted: {
          winner: test.prediction.winProbability > 50 ? 'home' : 'away',
          winProbability: test.prediction.winProbability,
          homeScore: test.prediction.expectedScore.home,
          awayScore: test.prediction.expectedScore.away
        },
        actual: {
          winner: test.actual.winner === test.actual.homeTeamId ? 'home' : 'away',
          homeScore: test.actual.homeScore,
          awayScore: test.actual.awayScore
        },
        bias: test.prediction.winProbability > 50 ? (test.actual.winner === test.actual.homeTeamId ? 0 : 1) : (test.actual.winner !== test.actual.homeTeamId ? 0 : 1)
      }));
      
      return {
        biasType: 'game_type',
        description: `${worstGameType.name}: Poor prediction accuracy (${(worstAccuracy * 100).toFixed(1)}%)`,
        magnitude: 1 - worstAccuracy,
        significance: worstAccuracy < 0.5 ? 0.05 : 0.1,
        affectedGames: worstGameType.predictions.length,
        examples
      };
    }
    
    return null;
  }

  /**
   * Analyze team strength bias
   */
  private async analyzeTeamStrengthBias(testPredictions: Array<{
    prediction: GamePrediction;
    actual: { homeScore: number; awayScore: number; winner: number; homeTeamId: number; awayTeamId: number; };
    gameId: number;
  }>): Promise<BiasAnalysis | null> {
    // This is a simplified analysis - in a full implementation, you'd categorize teams by strength
    // For now, we'll analyze based on predicted win probability as a proxy for perceived strength
    
    const strongFavorites = testPredictions.filter(test => test.prediction.winProbability > 75 || test.prediction.winProbability < 25);
    
    if (strongFavorites.length < 5) return null;
    
    let correctPredictions = 0;
    for (const test of strongFavorites) {
      const predictedWinner = test.prediction.winProbability > 50 ? test.actual.homeTeamId : test.actual.awayTeamId;
      if (predictedWinner === test.actual.winner) {
        correctPredictions++;
      }
    }
    
    const accuracy = correctPredictions / strongFavorites.length;
    
    if (accuracy < 0.7) { // Strong favorites should be predicted correctly more often
      return {
        biasType: 'team_strength',
        description: `Strong favorites: Lower than expected accuracy (${(accuracy * 100).toFixed(1)}%)`,
        magnitude: 0.8 - accuracy, // Expected accuracy minus actual
        significance: accuracy < 0.6 ? 0.05 : 0.1,
        affectedGames: strongFavorites.length,
        examples: strongFavorites.slice(0, 3).map(test => ({
          gameId: test.gameId,
          predicted: {
            winProbability: test.prediction.winProbability,
            expectedScore: test.prediction.expectedScore
          },
          actual: {
            homeScore: test.actual.homeScore,
            awayScore: test.actual.awayScore,
            winner: test.actual.winner === test.actual.homeTeamId ? 'home' : 'away'
          },
          bias: test.prediction.winProbability > 50 ? (test.actual.winner === test.actual.homeTeamId ? 0 : 1) : (test.actual.winner !== test.actual.homeTeamId ? 0 : 1)
        }))
      };
    }
    
    return null;
  }

  /**
   * Task 5.3: Analyze prediction accuracy by confidence level and game type
   * Requirements: 4.4, 4.5
   */
  async analyzeReliabilityByConfidence(testPredictions: Array<{
    prediction: GamePrediction;
    actual: { homeScore: number; awayScore: number; winner: number; homeTeamId: number; awayTeamId: number; };
  }>): Promise<ReliabilityAnalysis> {
    console.log(`[Prediction Accuracy Tester] Analyzing reliability by confidence level`);
    
    // Analyze by confidence ranges
    const confidenceRanges = [
      { range: [0, 60] as [number, number], predictions: [] as typeof testPredictions, accuracies: [] as number[] },
      { range: [60, 75] as [number, number], predictions: [] as typeof testPredictions, accuracies: [] as number[] },
      { range: [75, 85] as [number, number], predictions: [] as typeof testPredictions, accuracies: [] as number[] },
      { range: [85, 100] as [number, number], predictions: [] as typeof testPredictions, accuracies: [] as number[] }
    ];
    
    for (const test of testPredictions) {
      const confidence = test.prediction.confidence;
      const predictedWinner = test.prediction.winProbability > 50 ? test.actual.homeTeamId : test.actual.awayTeamId;
      const correct = predictedWinner === test.actual.winner;
      
      for (const range of confidenceRanges) {
        if (confidence >= range.range[0] && confidence < range.range[1]) {
          range.predictions.push(test);
          range.accuracies.push(correct ? 1 : 0);
          break;
        }
      }
    }
    
    const reliabilityByConfidence = confidenceRanges.map(range => {
      const accuracy = range.accuracies.length > 0 
        ? range.accuracies.reduce((sum, acc) => sum + acc, 0) / range.accuracies.length * 100
        : 0;
      
      let reliability: 'high' | 'medium' | 'low' = 'low';
      if (accuracy >= 75) reliability = 'high';
      else if (accuracy >= 60) reliability = 'medium';
      
      return {
        confidenceRange: range.range,
        accuracy,
        sampleSize: range.predictions.length,
        reliability
      };
    });
    
    // Analyze by game type (simplified)
    const gameTypes = [
      { name: 'Close Games', predictions: [] as typeof testPredictions, accuracies: [] as number[] },
      { name: 'Clear Favorites', predictions: [] as typeof testPredictions, accuracies: [] as number[] },
      { name: 'Toss-ups', predictions: [] as typeof testPredictions, accuracies: [] as number[] }
    ];
    
    for (const test of testPredictions) {
      const winProb = test.prediction.winProbability;
      const predictedWinner = winProb > 50 ? test.actual.homeTeamId : test.actual.awayTeamId;
      const correct = predictedWinner === test.actual.winner;
      
      if (winProb >= 45 && winProb <= 55) {
        gameTypes[2].predictions.push(test); // Toss-ups
        gameTypes[2].accuracies.push(correct ? 1 : 0);
      } else if (winProb > 70 || winProb < 30) {
        gameTypes[1].predictions.push(test); // Clear favorites
        gameTypes[1].accuracies.push(correct ? 1 : 0);
      } else {
        gameTypes[0].predictions.push(test); // Close games
        gameTypes[0].accuracies.push(correct ? 1 : 0);
      }
    }
    
    const reliabilityByGameType = gameTypes.map(gameType => {
      const accuracy = gameType.accuracies.length > 0 
        ? gameType.accuracies.reduce((sum, acc) => sum + acc, 0) / gameType.accuracies.length * 100
        : 0;
      
      let reliability: 'high' | 'medium' | 'low' = 'low';
      if (accuracy >= 75) reliability = 'high';
      else if (accuracy >= 60) reliability = 'medium';
      
      return {
        gameType: gameType.name,
        accuracy,
        sampleSize: gameType.predictions.length,
        reliability
      };
    });
    
    // Determine overall reliability
    const overallAccuracy = testPredictions.reduce((sum, test) => {
      const predictedWinner = test.prediction.winProbability > 50 ? test.actual.homeTeamId : test.actual.awayTeamId;
      return sum + (predictedWinner === test.actual.winner ? 1 : 0);
    }, 0) / testPredictions.length * 100;
    
    let overallReliability: 'high' | 'medium' | 'low' = 'low';
    if (overallAccuracy >= 75) overallReliability = 'high';
    else if (overallAccuracy >= 60) overallReliability = 'medium';
    
    return {
      overallReliability,
      reliabilityByConfidence,
      reliabilityByGameType
    };
  }
}

// Export singleton instance
export const predictionAccuracyTester = new PredictionAccuracyTester();