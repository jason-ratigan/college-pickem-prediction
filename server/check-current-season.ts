import { db } from './db.js';
import { teamEfficiencyRatings, teams } from '@college-pickem/shared';
import { eq, desc } from 'drizzle-orm';

// Check what seasons we have data for
const seasons = await db.selectDistinct({
  season: teamEfficiencyRatings.season
}).from(teamEfficiencyRatings)
.orderBy(desc(teamEfficiencyRatings.season));

console.log('Available seasons:', seasons);

// Check 2025 data specifically
const results2025 = await db.select({
  teamName: teams.name,
  scoringOffense: teamEfficiencyRatings.scoringOffenseEfficiency,
  gamesPlayed: teamEfficiencyRatings.gamesPlayed
}).from(teamEfficiencyRatings)
.innerJoin(teams, eq(teams.id, teamEfficiencyRatings.teamId))
.where(eq(teamEfficiencyRatings.season, 2025))
.limit(10);

console.log('\n2025 season data (first 10 teams):');
results2025.forEach(r => {
  console.log(`${r.teamName}: Games: ${r.gamesPlayed}, Scoring O: ${r.scoringOffense}`);
});

process.exit(0);