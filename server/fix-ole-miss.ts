import { statisticalProcessingEngine } from './services/statisticalProcessingService.js';

console.log('Recalculating Ole Miss (596) efficiency for 2025...');

try {
  // Recalculate Ole Miss efficiency using the new method
  const result = await statisticalProcessingEngine.calculateAndStoreTeamStatistics(596, 2025);
  console.log(`Processed ${result} games for Ole Miss`);
  
  // Check the new values
  const { teamEfficiencyProfileManager } = await import('./services/deprecated/teamEfficiencyProfileManager.js');
  const profile = await teamEfficiencyProfileManager.getTeamEfficiencyProfile(596, 2025);
  
  if (profile) {
    console.log('\n=== NEW OLE MISS EFFICIENCY VALUES ===');
    console.log(`Scoring Offense: ${profile.scoringOffenseEfficiency} (should be close to +9.43)`);
    console.log(`Scoring Defense: ${profile.scoringDefenseEfficiency} (should be close to +5.43)`);
    console.log(`Games Played: ${profile.gamesPlayed}`);
  } else {
    console.log('Profile not found after calculation');
  }
  
} catch (error) {
  console.error('Error recalculating Ole Miss efficiency:', error);
}

process.exit(0);