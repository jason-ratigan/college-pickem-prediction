import { getGamePrediction } from './services/predictionService.js';

// Test the Ole Miss vs Oklahoma prediction
try {
  console.log('Testing Ole Miss (596) vs Oklahoma (591) prediction...');
  const prediction = await getGamePrediction(596, 591, 2025); // Ole Miss home vs Oklahoma away
  
  console.log('\n=== PREDICTION RESULT ===');
  console.log(`Home Team: ${prediction.homeTeam.name}`);
  console.log(`Away Team: ${prediction.awayTeam.name}`);
  console.log(`Expected Score: ${prediction.expectedScore.home} - ${prediction.expectedScore.away}`);
  console.log(`Win Probability: ${prediction.winProbability}%`);
  console.log(`Confidence: ${prediction.confidence}%`);
  console.log(`Spread: ${prediction.spread}`);
  
  console.log('\n=== CALCULATION BREAKDOWN ===');
  console.log('Home Team (Ole Miss):');
  console.log(`  Opponent Baseline: ${prediction.calculationBreakdown.homeTeam.opponentBaseline}`);
  console.log(`  Efficiency Contributions:`, prediction.calculationBreakdown.homeTeam.efficiencyContributions);
  
  console.log('Away Team (Oklahoma):');
  console.log(`  Opponent Baseline: ${prediction.calculationBreakdown.awayTeam.opponentBaseline}`);
  console.log(`  Efficiency Contributions:`, prediction.calculationBreakdown.awayTeam.efficiencyContributions);
  
  console.log('\n=== EFFICIENCY ANALYSIS ===');
  console.log('Final Predictions:');
  console.log(`  Home Score: ${prediction.efficiencyAnalysis.finalPredictions.homeTeamScore}`);
  console.log(`  Away Score: ${prediction.efficiencyAnalysis.finalPredictions.awayTeamScore}`);
  
} catch (error) {
  console.error('Error testing prediction:', error);
}

process.exit(0);