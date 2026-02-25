import { db } from './db.js';
import { games, gameBoxScoreStats, teams } from '@college-pickem/shared';
import { eq, and, sql } from 'drizzle-orm';

// Let's calculate Oklahoma's defensive efficiency the RIGHT way (opponent-relative)
const oklahomaId = 591;
const season = 2025;

// Step 1: Get Oklahoma's games and who they played
const oklahomaGames = await db.select({
  gameId: games.id,
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

console.log('Oklahoma 2025 games:');
let totalOpponentTypicalScoring = 0;
let totalOpponentActualScoring = 0;

// Step 2: For each opponent, calculate what they typically score
for (let i = 0; i < oklahomaGames.length; i++) {
  const game = oklahomaGames[i];
  
  // Get this opponent's other games (not against Oklahoma)
  const opponentOtherGames = await db.select({
    opponentScore: sql<number>`CASE 
      WHEN ${games.homeTeamId} = ${game.opponentId} THEN ${games.homeTeamScore}
      ELSE ${games.awayTeamScore}
    END`.as('opponentScore')
  })
  .from(games)
  .where(and(
    eq(games.season, season),
    eq(games.isFinal, true),
    sql`(${games.homeTeamId} = ${game.opponentId} OR ${games.awayTeamId} = ${game.opponentId})`,
    sql`${games.id} != ${game.gameId}` // Exclude the game against Oklahoma
  ));
  
  // Calculate opponent's typical scoring (excluding Oklahoma game)
  const opponentTypicalScore = opponentOtherGames.length > 0 
    ? opponentOtherGames.reduce((sum, g) => sum + (g.opponentScore || 0), 0) / opponentOtherGames.length
    : 28; // fallback if no other games
  
  console.log(`Game ${i+1}: Opponent typically scores ${opponentTypicalScore.toFixed(1)}, but scored ${game.opponentScore} vs Oklahoma`);
  
  totalOpponentTypicalScoring += opponentTypicalScore;
  totalOpponentActualScoring += game.opponentScore || 0;
}

const avgOpponentTypicalScoring = totalOpponentTypicalScoring / oklahomaGames.length;
const avgOpponentActualScoring = totalOpponentActualScoring / oklahomaGames.length;

console.log(`\n=== OPPONENT-RELATIVE CALCULATION ===`);
console.log(`Oklahoma's opponents typically score: ${avgOpponentTypicalScoring.toFixed(2)} points per game`);
console.log(`Oklahoma's opponents actually scored: ${avgOpponentActualScoring.toFixed(2)} points vs Oklahoma`);

const oklahomaDefensiveEfficiency = avgOpponentTypicalScoring - avgOpponentActualScoring;
console.log(`Oklahoma defensive efficiency: +${oklahomaDefensiveEfficiency.toFixed(2)} points (they hold opponents ${oklahomaDefensiveEfficiency.toFixed(2)} points below their typical scoring)`);

console.log(`\nSystem calculated: -31.43 (completely wrong!)`);
console.log(`Should be: +${oklahomaDefensiveEfficiency.toFixed(2)}`);

process.exit(0);