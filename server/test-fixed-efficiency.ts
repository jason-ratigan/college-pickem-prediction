import { statisticalProcessingEngine } from './services/statisticalProcessingService.js';

console.log('Testing fixed efficiency calculation for Oklahoma (591) in 2025...');

try {
  // Recalculate Oklahoma's efficiency using the new method
  const result = await statisticalProcessingEngine.calculateAndStoreTeamStatistics(591, 2025);
  console.log(`Processed ${result} games for Oklahoma`);
  
  // Now check what the new efficiency values are
  const { teamEfficiencyProfileManager } = await import('./services/deprecated/teamEfficiencyProfileManager.js');
  const profile = await teamEfficiencyProfileManager.getTeamEfficiencyProfile(591, 2025);
  
  if (profile) {
    console.log('\n=== NEW EFFICIENCY VALUES ===');
    console.log(`Scoring Offense: ${profile.scoringOffenseEfficiency} (should be close to 0.71)`);
    console.log(`Scoring Defense: ${profile.scoringDefenseEfficiency} (should be close to +18.10)`);
    console.log(`Games Played: ${profile.gamesPlayed}`);
  } else {
    console.log('Profile not found after calculation');
  }
  
} catch (error) {
  console.error('Error testing efficiency calculation:', error);
}

process.exit(0);