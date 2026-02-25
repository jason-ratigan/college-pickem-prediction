import { db } from './db.js';
import { games, gameBoxScoreStats, teams } from '@college-pickem/shared';
import { eq, and, sql } from 'drizzle-orm';

// Let's manually calculate what Oklahoma's scoring efficiency should be
const oklahomaId = 591;
const season = 2025;

// Get Oklahoma games and their actual scoring
const oklahomaGames = await db.select({
  gameId: games.id,
  homeTeamId: games.homeTeamId,
  awayTeamId: games.awayTeamId,
  homeScore: games.homeTeamScore,
  awayScore: games.awayTeamScore,
  oklahomaScore: sql<number>`CASE 
    WHEN ${games.homeTeamId} = ${oklahomaId} THEN ${games.homeTeamScore}
    ELSE ${games.awayTeamScore}
  END`.as('oklahomaScore'),
  opponentScore: sql<number>`CASE 
    WHEN ${games.homeTeamId} = ${oklahomaId} THEN ${games.awayTeamScore}
    ELSE ${games.homeTeamScore}
  END`.as('opponentScore'),
  opponentId: sql<number>`CASE 
    WHEN ${games.homeTeamId} = ${oklahomaId} THEN ${games.awayTeamId}
    ELSE ${games.homeTeamId}
  END`.as('opponentId')
})
.from(games)
.where(and(
  eq(games.season, season),
  eq(games.isFinal, true),
  sql`(${games.homeTeamId} = ${oklahomaId} OR ${games.awayTeamId} = ${oklahomaId})`
));

console.log(`Oklahoma 2025 games (${oklahomaGames.length} games):`);
let totalOklahomaPoints = 0;
let totalOpponentPoints = 0;

oklahomaGames.forEach((game, i) => {
  console.log(`Game ${i+1}: Oklahoma ${game.oklahomaScore}, Opponent ${game.opponentScore}`);
  totalOklahomaPoints += game.oklahomaScore || 0;
  totalOpponentPoints += game.opponentScore || 0;
});

const avgOklahomaPoints = totalOklahomaPoints / oklahomaGames.length;
const avgOpponentPoints = totalOpponentPoints / oklahomaGames.length;

console.log(`\nOklahoma averages:`);
console.log(`Points scored per game: ${avgOklahomaPoints.toFixed(2)}`);
console.log(`Points allowed per game: ${avgOpponentPoints.toFixed(2)}`);

// Now let's calculate what the efficiency SHOULD be
const nationalAvgPoints = 28;
const oklahomaOffenseEfficiency = avgOklahomaPoints - nationalAvgPoints;
const oklahomaDefenseEfficiency = nationalAvgPoints - avgOpponentPoints; // Positive = good defense

console.log(`\nWhat efficiency SHOULD be:`);
console.log(`Oklahoma offense efficiency: ${oklahomaOffenseEfficiency.toFixed(2)} points above/below average`);
console.log(`Oklahoma defense efficiency: ${oklahomaDefenseEfficiency.toFixed(2)} points better/worse than average`);

// Compare to what the system calculated
console.log(`\nWhat system calculated:`);
console.log(`Oklahoma offense efficiency: 2.55 (close, but should be ${oklahomaOffenseEfficiency.toFixed(2)})`);
console.log(`Oklahoma defense efficiency: -31.43 (should be +${oklahomaDefenseEfficiency.toFixed(2)}!)`);

process.exit(0);