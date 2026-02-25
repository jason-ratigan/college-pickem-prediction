import { teamEfficiencyProfileManager } from './services/deprecated/teamEfficiencyProfileManager.js';

// Check specific teams from the problematic predictions
const teams = [
  { name: 'Ole Miss', id: 596 },
  { name: 'Oklahoma', id: 591 }
];

for (const team of teams) {
  try {
    console.log(`\n=== ${team.name} 2025 Profile ===`);
    const profile = await teamEfficiencyProfileManager.getTeamEfficiencyProfile(team.id, 2025);
    if (profile) {
      console.log(`Games Played: ${profile.gamesPlayed}`);
      console.log(`Scoring Offense: ${profile.scoringOffenseEfficiency}`);
      console.log(`Scoring Defense: ${profile.scoringDefenseEfficiency}`);
      console.log(`Passing Offense: ${profile.passingOffenseEfficiency}`);
      console.log(`Rushing Offense: ${profile.rushingOffenseEfficiency}`);
      console.log(`Confidence Level: ${profile.confidenceLevel}`);
      console.log(`Convergence Score: ${profile.convergenceScore}`);
    } else {
      console.log('Profile not found');
    }
  } catch (error) {
    console.log(`Error getting profile: ${(error as Error).message}`);
  }
}

process.exit(0);