import { db } from './db.js';
import { teamEfficiencyRatings, teams } from '@college-pickem/shared';
import { eq, desc } from 'drizzle-orm';

const results = await db.select({
  teamName: teams.name,
  scoringOffense: teamEfficiencyRatings.scoringOffenseEfficiency,
  scoringDefense: teamEfficiencyRatings.scoringDefenseEfficiency,
  passingOffense: teamEfficiencyRatings.passingOffenseEfficiency,
  rushingOffense: teamEfficiencyRatings.rushingOffenseEfficiency,
  gamesPlayed: teamEfficiencyRatings.gamesPlayed
}).from(teamEfficiencyRatings)
.innerJoin(teams, eq(teams.id, teamEfficiencyRatings.teamId))
.where(eq(teamEfficiencyRatings.season, 2024))
.orderBy(desc(teamEfficiencyRatings.scoringOffenseEfficiency))
.limit(10);

console.log('Top 10 teams by scoring offense efficiency:');
results.forEach(r => {
  console.log(`${r.teamName}: Scoring O: ${r.scoringOffense}, Scoring D: ${r.scoringDefense}, Passing O: ${r.passingOffense}, Rushing O: ${r.rushingOffense}, Games: ${r.gamesPlayed}`);
});

process.exit(0);