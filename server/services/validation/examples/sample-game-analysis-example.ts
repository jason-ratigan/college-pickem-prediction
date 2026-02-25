// server/services/validation/examples/sample-game-analysis-example.ts

/**
 * Example usage of the Sample Game Analyzer
 * Demonstrates how to analyze games and validate prediction logic
 */

import { sampleGameAnalyzer } from '../sample-game-analyzer.js';

/**
 * Example: Analyze a sample of games from the 2024 season
 */
export async function analyzeSampleGames() {
  console.log('=== Sample Game Analysis Example ===');
  
  try {
    // Analyze 10 games from the 2024 season
    const result = await sampleGameAnalyzer.selectAndAnalyzeGames(2024, 10);
    
    console.log(`\nAnalysis Results:`);
    console.log(`- Valid: ${result.isValid}`);
    console.log(`- Score: ${result.score}/100`);
    console.log(`- Games Analyzed: ${result.analyzedGames.length}`);
    console.log(`- Errors: ${result.errors.length}`);
    console.log(`- Warnings: ${result.warnings.length}`);
    
    console.log(`\nGame Selection Breakdown:`);
    console.log(`- Close Games: ${result.selectionCriteria.closeGames}`);
    console.log(`- Blowouts: ${result.selectionCriteria.blowouts}`);
    console.log(`- Upsets: ${result.selectionCriteria.upsets}`);
    console.log(`- Regular Games: ${result.selectionCriteria.regularGames}`);
    
    // Show details for first analyzed game
    if (result.analyzedGames.length > 0) {
      const firstGame = result.analyzedGames[0];
      console.log(`\nDetailed Analysis - Game ${firstGame.gameId}:`);
      console.log(`${firstGame.gameInfo.homeTeam} vs ${firstGame.gameInfo.awayTeam}`);
      console.log(`Predicted: ${firstGame.prediction.homeScore}-${firstGame.prediction.awayScore}`);
      
      if (firstGame.gameInfo.actualScore) {
        console.log(`Actual: ${firstGame.gameInfo.actualScore.home}-${firstGame.gameInfo.actualScore.away}`);
        console.log(`Prediction Quality: ${firstGame.outcomeComparison?.predictionQuality}`);
      }
      
      console.log(`Confidence: ${firstGame.prediction.confidence}%`);
      console.log(`Key Factors:`);
      firstGame.keyFactors.slice(0, 3).forEach((factor, index) => {
        console.log(`  ${index + 1}. ${factor.factor}: ${factor.advantage} team advantage`);
      });
      
      console.log(`\nPrediction Explanation:`);
      console.log(`${firstGame.predictionExplanation.humanReadableExplanation}`);
    }
    
    // Show recommendations
    if (result.recommendations.length > 0) {
      console.log(`\nRecommendations:`);
      result.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }
    
    return result;
    
  } catch (error) {
    console.error('Error in sample game analysis:', error);
    throw error;
  }
}

/**
 * Example: Analyze a specific game in detail
 */
export async function analyzeSpecificGame(gameId: number, season: number) {
  console.log(`\n=== Specific Game Analysis: Game ${gameId} ===`);
  
  try {
    const analysis = await sampleGameAnalyzer.analyzeGame(gameId, season);
    
    if (!analysis) {
      console.log('Game analysis failed - game not found or insufficient data');
      return null;
    }
    
    console.log(`\nGame: ${analysis.gameInfo.homeTeam} vs ${analysis.gameInfo.awayTeam}`);
    console.log(`Season: ${analysis.gameInfo.season}, Week: ${analysis.gameInfo.week}`);
    
    console.log(`\nPrediction:`);
    console.log(`- Score: ${analysis.prediction.homeScore}-${analysis.prediction.awayScore}`);
    console.log(`- Confidence: ${analysis.prediction.confidence}%`);
    console.log(`- Win Probability: ${analysis.prediction.winProbability.home}% home, ${analysis.prediction.winProbability.away}% away`);
    
    if (analysis.gameInfo.actualScore) {
      console.log(`\nActual Result:`);
      console.log(`- Score: ${analysis.gameInfo.actualScore.home}-${analysis.gameInfo.actualScore.away}`);
      
      if (analysis.outcomeComparison) {
        console.log(`- Winner Predicted Correctly: ${analysis.outcomeComparison.predictionAccuracy.winnerCorrect}`);
        console.log(`- Score Error: ${analysis.outcomeComparison.predictionAccuracy.scoreError.total} total points`);
        console.log(`- Prediction Quality: ${analysis.outcomeComparison.predictionQuality}`);
        console.log(`- Error Type: ${analysis.outcomeComparison.errorAnalysis.errorType}`);
      }
    }
    
    console.log(`\nTeam Efficiency Breakdown:`);
    console.log(`${analysis.efficiencyBreakdown.homeTeam.teamName}:`);
    console.log(`- Overall Efficiency: ${analysis.efficiencyBreakdown.homeTeam.overallEfficiency.toFixed(2)}`);
    console.log(`- Strengths: ${analysis.efficiencyBreakdown.homeTeam.strengthsAndWeaknesses.strengths.join(', ')}`);
    console.log(`- Weaknesses: ${analysis.efficiencyBreakdown.homeTeam.strengthsAndWeaknesses.weaknesses.join(', ')}`);
    
    console.log(`${analysis.efficiencyBreakdown.awayTeam.teamName}:`);
    console.log(`- Overall Efficiency: ${analysis.efficiencyBreakdown.awayTeam.overallEfficiency.toFixed(2)}`);
    console.log(`- Strengths: ${analysis.efficiencyBreakdown.awayTeam.strengthsAndWeaknesses.strengths.join(', ')}`);
    console.log(`- Weaknesses: ${analysis.efficiencyBreakdown.awayTeam.strengthsAndWeaknesses.weaknesses.join(', ')}`);
    
    console.log(`\nKey Matchup Factors:`);
    analysis.keyFactors.forEach((factor, index) => {
      console.log(`${index + 1}. ${factor.factor}`);
      console.log(`   ${factor.description}`);
      console.log(`   Impact: ${factor.impactOnPrediction.toFixed(2)}, Weight: ${factor.weight.toFixed(2)}`);
    });
    
    console.log(`\nMatchup Advantages:`);
    analysis.efficiencyBreakdown.matchupAdvantages.slice(0, 5).forEach((advantage, index) => {
      if (advantage.impact !== 'low') {
        console.log(`${index + 1}. ${advantage.category}: ${advantage.advantage} team (${advantage.impact} impact)`);
        console.log(`   Home: ${advantage.homeTeamValue.toFixed(2)}, Away: ${advantage.awayTeamValue.toFixed(2)}`);
      }
    });
    
    return analysis;
    
  } catch (error) {
    console.error(`Error analyzing game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Example: Validate the sample game analyzer itself
 */
export async function validateSampleGameAnalyzer(season: number) {
  console.log(`\n=== Sample Game Analyzer Validation ===`);
  
  try {
    const validationResult = await sampleGameAnalyzer.validate(season, 5);
    
    console.log(`\nValidation Results:`);
    console.log(`- Valid: ${validationResult.isValid}`);
    console.log(`- Score: ${validationResult.score}/100`);
    console.log(`- Timestamp: ${validationResult.timestamp.toISOString()}`);
    
    if (validationResult.errors.length > 0) {
      console.log(`\nErrors:`);
      validationResult.errors.forEach((error, index) => {
        console.log(`${index + 1}. [${error.severity}] ${error.code}: ${error.message}`);
      });
    }
    
    if (validationResult.warnings.length > 0) {
      console.log(`\nWarnings:`);
      validationResult.warnings.forEach((warning, index) => {
        console.log(`${index + 1}. ${warning.code}: ${warning.message}`);
      });
    }
    
    if (validationResult.recommendations.length > 0) {
      console.log(`\nRecommendations:`);
      validationResult.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }
    
    if (validationResult.metadata) {
      console.log(`\nMetadata:`);
      console.log(`- Component: ${validationResult.metadata.component}`);
      console.log(`- Analyzed Games: ${validationResult.metadata.analyzedGamesCount}`);
      if (validationResult.metadata.selectionCriteria) {
        console.log(`- Selection Criteria:`, validationResult.metadata.selectionCriteria);
      }
    }
    
    return validationResult;
    
  } catch (error) {
    console.error('Error validating sample game analyzer:', error);
    throw error;
  }
}

// Example usage (commented out to avoid execution during import)
/*
async function runExamples() {
  try {
    // Analyze sample games
    await analyzeSampleGames();
    
    // Analyze a specific game (replace with actual game ID)
    // await analyzeSpecificGame(123, 2024);
    
    // Validate the analyzer
    await validateSampleGameAnalyzer(2024);
    
  } catch (error) {
    console.error('Example execution failed:', error);
  }
}

// Uncomment to run examples
// runExamples();
*/