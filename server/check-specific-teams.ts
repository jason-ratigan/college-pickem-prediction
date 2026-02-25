import { db } from './db.js';
import { teamEfficiencyRatings, teams } from '@college-pickem/shared';
import { eq, inArray } from 'drizzle-orm';

const teamNames = ['Oklahoma', 'Ole Miss', 'Auburn', 'Arkansas', 'Alabama', 'South Carolina', 'Missouri', 'Vanderbilt', 'Texas', 'Mississippi State', 'Texas A&M', 'LSU', 'Tennessee', 'Kentucky'];

const results = await db.select({
  teamName: teams.name,
  scoringOffense: teamEfficiencyRatings.scoringOffenseEfficiency,
  scoringDefense: teamEfficiencyRatings.scoringDefenseEfficiency,
  passingOffense: teamEfficiencyRatings.passingOffenseEfficiency,
  rushingOffense: teamEfficiencyRatings.rushingOffenseEfficiency,
  gamesPlayed: teamEfficiencyRatings.gamesPlayed
}).from(teamEfficiencyRatings)
.innerJoin(teams, eq(teams.id, teamEfficiencyRatings.teamId))
.where(eq(teamEfficiencyRatings.season, 2024));

const filteredResults = results.filter(r => teamNames.includes(r.teamName));

console.log('SEC teams efficiency ratings:');
filteredResults.forEach((r: typeof results[0]) => {
  console.log(`${r.teamName}: Scoring O: ${r.scoringOffense}, Scoring D: ${r.scoringDefense}, Passing O: ${r.passingOffense}, Rushing O: ${r.rushingOffense}, Games: ${r.gamesPlayed}`);
});

process.exit(0);