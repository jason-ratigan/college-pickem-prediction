// server/scripts/calculate-efficiency.ts
// CLI script to run efficiency calculations

import { efficiencyCalculationService } from './efficiencyCalculationService.js';

async function main() {
  const args = process.argv.slice(2);
  const season = args[0] ? parseInt(args[0]) : new Date().getFullYear();

  console.log(`Starting efficiency calculation for season ${season}...`);
  console.log('This may take several minutes for a full season of data.\n');

  try {
    const result = await efficiencyCalculationService.updateSeasonEfficiencies(season);
    
    console.log('\n✅ Efficiency calculation completed successfully!');
    console.log(`📊 Results:`);
    console.log(`   - Teams updated: ${result.teamsUpdated}`);
    console.log(`   - Iterations required: ${result.iterationsRequired}`);
    console.log(`   - Converged: ${result.converged ? 'Yes' : 'No'}`);
    console.log(`   - Processing time: ${result.processingTime}ms`);
    
  } catch (error) {
    console.error('❌ Efficiency calculation failed:', error);
    process.exit(1);
  }
}

// Handle command line usage
if (process.argv.length > 3) {
  console.log('Usage: npx tsx scripts/calculate-efficiency.ts [season]');
  console.log('Example: npx tsx scripts/calculate-efficiency.ts 2024');
  process.exit(1);
}

main().catch(console.error);