import { db } from './db.js';
import { games, gameBoxScoreStats, teams } from '@college-pickem/shared';
import { eq, and, sql } from 'drizzle-orm';

// Let's manually calculate what Ole Miss's scoring efficiency should be
const oleMissId = 596;
const season = 2025;

// Get Ole Miss games and their actual scoring
const oleMissGames = await db.select({
  gameId: games.id,
  homeTeamId: games.homeTeamId,
  awayTeamId: games.awayTeamId,
  homeScore: games.homeTeamScore,
  awayScore: games.awayTeamScore,
  oleMissScore: sql<number>`CASE 
    WHEN ${games.homeTeamId} = ${oleMissId} THEN ${games.homeTeamScore}
    ELSE ${games.awayTeamScore}
  END`.as('oleMissScore'),
  opponentScore: sql<number>`CASE 
    WHEN ${games.homeTeamId} = ${oleMissId} THEN ${games.awayTeamScore}
    ELSE ${games.homeTeamScore}
  END`.as('opponentScore'),
  opponentId: sql<number>`CASE 
    WHEN ${games.homeTeamId} = ${oleMissId} THEN ${games.awayTeamId}
    ELSE ${games.homeTeamId}
  END`.as('opponentId')
})
.from(games)
.where(and(
  eq(games.season, season),
  eq(games.isFinal, true),
  sql`(${games.homeTeamId} = ${oleMissId} OR ${games.awayTeamId} = ${oleMissId})`
));

console.log(`Ole Miss 2025 games (${oleMissGames.length} games):`);
let totalOleMissPoints = 0;
let totalOpponentPoints = 0;

oleMissGames.forEach((game, i) => {
  console.log(`Game ${i+1}: Ole Miss ${game.oleMissScore}, Opponent ${game.opponentScore}`);
  totalOleMissPoints += game.oleMissScore || 0;
  totalOpponentPoints += game.opponentScore || 0;
});

const avgOleMissPoints = totalOleMissPoints / oleMissGames.length;
const avgOpponentPoints = totalOpponentPoints / oleMissGames.length;

console.log(`\nOle Miss averages:`);
console.log(`Points scored per game: ${avgOleMissPoints.toFixed(2)}`);
console.log(`Points allowed per game: ${avgOpponentPoints.toFixed(2)}`);

// Now let's calculate what the efficiency SHOULD be
// National average is probably around 28 points per game
const nationalAvgPoints = 28;
const oleMissOffenseEfficiency = avgOleMissPoints - nationalAvgPoints;
const oleMissDefenseEfficiency = nationalAvgPoints - avgOpponentPoints; // Positive = good defense

console.log(`\nWhat efficiency SHOULD be:`);
console.log(`Ole Miss offense efficiency: ${oleMissOffenseEfficiency.toFixed(2)} points above/below average`);
console.log(`Ole Miss defense efficiency: ${oleMissDefenseEfficiency.toFixed(2)} points better/worse than average`);

// Compare to what the system calculated
console.log(`\nWhat system calculated:`);
console.log(`Ole Miss offense efficiency: 33.67 (way too high!)`);
console.log(`Ole Miss defense efficiency: -75.24 (way too negative!)`);

process.exit(0);