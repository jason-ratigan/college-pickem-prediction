// server/services/pickService.ts

import { db } from '../db.js';
import { picks, games, users } from '@college-pickem/shared';
import { eq, and, sql, desc, count, inArray } from 'drizzle-orm';

// Define the shape of the new, more complex pick payload for the batch submission
type PickPayload = {
  gameId: number;
  // A user can submit a straight-up pick, a spread pick, both, or clear them by passing null
  pickedTeamId?: number | null;
  pickedAgainstSpread?: 'home' | 'away' | null;
};

/**
 * Submits a batch of picks for a user in a single, efficient transaction.
 * This replaces the old `submitPick` and `submitMultiplePicks` functions.
 * It performs an "upsert" (insert or update) for each pick.
 * Prerequisite: The `picks` table must have a `pickedAgainstSpread` column.
 * @param userId - The ID of the user submitting the picks.
 * @param userPicks - An array of pick payload objects.
 */
export const submitBatchPicks = async (userId: string, userPicks: PickPayload[]) => {
  if (!userPicks || userPicks.length === 0) {
    return [];
  }

  const gameIds = userPicks.map(p => p.gameId);

  const relevantGames = await db.query.games.findMany({
    where: inArray(games.id, gameIds),
  });
  const gameMap = new Map(relevantGames.map(g => [g.id, g]));

  for (const pick of userPicks) {
    const game = gameMap.get(pick.gameId);
    if (!game) throw new Error(`Game not found for ID: ${pick.gameId}`);
    if (game.isFinal) throw new Error(`Cannot make picks for completed game: ${game.id}`);
    if (game.gameTime && new Date() >= game.gameTime) throw new Error(`Picking is locked for game: ${game.id}`);
  }

  const valuesToInsert = userPicks.map(p => ({
    userId,
    gameId: p.gameId,
    pickedTeamId: p.pickedTeamId,
    pickedAgainstSpread: p.pickedAgainstSpread,
  }));

  return db.insert(picks)
    .values(valuesToInsert)
    .onConflictDoUpdate({
      target: [picks.userId, picks.gameId],
      set: {
        // These `sql` tagged templates tell Drizzle to use the value from the
        // row that was attempting to be inserted, which is exactly what we want for an upsert.
        pickedTeamId: sql`excluded.picked_team_id`,
        pickedAgainstSpread: sql`excluded.picked_against_spread`,
      }
    })
    .returning();
};


/**
 * Fetches a user's complete pick history for a given season, grouped by week.
 * Calculates weekly performance stats. This is the primary function for the new MyPicksHistoryPage.
 * @param userId - The ID of the user.
 * @param season - The season year to fetch history for.
 */
export const getUserPickHistory = async (userId: string, season: number) => {
    console.log(`Fetching pick history for user ${userId}, season ${season}`);
    
    const seasonGamesQuery = db.select({ id: games.id }).from(games).where(eq(games.season, season));
    
    const userPicks = await db.query.picks.findMany({
        where: and(
            eq(picks.userId, userId),
            inArray(picks.gameId, seasonGamesQuery)
        ),
        with: {
            game: { with: { homeTeam: true, awayTeam: true } },
            pickedTeam: true
        },
        orderBy: [desc(games.week), desc(picks.createdAt)]
    });

    // Group picks by week
    const historyByWeek = userPicks.reduce((acc, pick) => {
        const week = pick.game.week;
        if (!acc[week]) {
            acc[week] = {
                summary: { week, correctPicks: 0, totalPicks: 0, accuracy: 0 },
                picks: [] as typeof userPicks
            };
        }
        acc[week].picks.push(pick);
        acc[week].summary.totalPicks++;
        if (pick.isCorrect === true) {
            acc[week].summary.correctPicks++;
        }
        return acc;
    }, {} as Record<number, { summary: any, picks: any[] }>);

    // Calculate accuracy for each week
    Object.values(historyByWeek).forEach(weekData => {
        weekData.summary.accuracy = weekData.summary.totalPicks > 0 
            ? (weekData.summary.correctPicks / weekData.summary.totalPicks) * 100
            : 0;
    });

    return historyByWeek;
};

/**
 * Performs aggregate calculations across all of a user's picks to generate lifetime stats.
 * @param userId The ID of the user.
 */
export const getUserPickStats = async (userId: string) => {
    const weeklyPerformance = await db.select({
        week: games.week,
        season: games.season,
        correct: sql<number>`SUM(CASE WHEN ${picks.isCorrect} = true THEN 1 ELSE 0 END)`.as('correct'),
        total: count(picks.id).as('total')
    })
    .from(picks)
    .innerJoin(games, eq(picks.gameId, games.id))
    .where(eq(picks.userId, userId))
    .groupBy(games.season, games.week);

    if (weeklyPerformance.length === 0) {
        return {
            overallAccuracy: 0,
            totalPicks: 0,
            bestWeek: null,
            worstWeek: null,
        };
    }

    let bestWeek: any = null;
    let worstWeek: any = null;
    let maxAccuracy = -1;
    let minAccuracy = 101;

    weeklyPerformance.forEach(week => {
        const accuracy = (Number(week.correct) / week.total) * 100;
        if (accuracy > maxAccuracy) {
            maxAccuracy = accuracy;
            bestWeek = { ...week, accuracy };
        }
        // Ensure that a week with 0 correct picks isn't ignored
        if (accuracy < minAccuracy) {
            minAccuracy = accuracy;
            worstWeek = { ...week, accuracy };
        }
    });

    const totalCorrect = weeklyPerformance.reduce((sum, week) => sum + Number(week.correct), 0);
    const totalPicks = weeklyPerformance.reduce((sum, week) => sum + week.total, 0);

    return {
        overallAccuracy: totalPicks > 0 ? (totalCorrect / totalPicks) * 100 : 0,
        totalPicks,
        bestWeek,
        worstWeek,
    };
};

/**
 * Gets a list of seasons for which a user has at least one pick.
 * @param userId - The ID of the user.
 */
export const getAvailablePickSeasons = async (userId: string): Promise<number[]> => {
    const results = await db
        .selectDistinct({ season: games.season })
        .from(picks)
        .innerJoin(games, eq(picks.gameId, games.id))
        .where(eq(picks.userId, userId))
        .orderBy(desc(games.season));

    return results.map(r => r.season);
};


// --- RETAINED FUNCTIONS (for leaderboards and backward compatibility) ---

/**
 * Fetches a user's picks for a specific week, including detailed game and team info.
 * Note: Superseded by `getUserPickHistory` for the new history page, but retained for other potential uses.
 */
export const getUserPicks = async (userId: string, season: number, week: number) => {
  const gameIdsQuery = db.select({ id: games.id }).from(games)
    .where(and(eq(games.season, season), eq(games.week, week)));

  return db.query.picks.findMany({
    where: and(
      eq(picks.userId, userId),
      inArray(picks.gameId, gameIdsQuery)
    ),
    with: {
      game: { with: { homeTeam: true, awayTeam: true } },
      pickedTeam: true,
    },
    orderBy: [(desc(picks.createdAt))]
  });
};

/**
 * Calculates the leaderboard for a specific week.
 */
export const getWeeklyLeaderboard = async (season: number, week: number) => {
  const weeklyGamesQuery = db.select({ id: games.id }).from(games).where(and(eq(games.season, season), eq(games.week, week)));

  const leaderboardData = await db.select({
      userId: picks.userId,
      userFullName: users.fullName,
      userEmail: users.email,
      correctPicks: sql<number>`SUM(CASE WHEN ${picks.isCorrect} = true THEN 1 ELSE 0 END)`.as('correct_picks'),
      totalPicks: count(picks.id),
    })
    .from(picks)
    .leftJoin(users, eq(picks.userId, users.id))
    .where(inArray(picks.gameId, weeklyGamesQuery))
    .groupBy(picks.userId, users.fullName, users.email)
    .orderBy(desc(sql`correct_picks`));

  return leaderboardData.map((entry, index) => ({
      rank: index + 1,
      user: { fullName: entry.userFullName, email: entry.userEmail },
      correctPicks: Number(entry.correctPicks),
      totalPicks: entry.totalPicks,
      percentage: entry.totalPicks > 0 ? (Number(entry.correctPicks) / entry.totalPicks) * 100 : 0,
  }));
};

/**
 * Calculates the leaderboard for an entire season.
 */
export const getSeasonLeaderboard = async (season: number) => {
  const seasonGamesQuery = db.select({ id: games.id }).from(games).where(eq(games.season, season));

  const leaderboardData = await db.select({
      userId: picks.userId,
      userFullName: users.fullName,
      userEmail: users.email,
      correctPicks: sql<number>`SUM(CASE WHEN ${picks.isCorrect} = true THEN 1 ELSE 0 END)`.as('correct_picks'),
      totalPicks: count(picks.id),
    })
    .from(picks)
    .leftJoin(users, eq(picks.userId, users.id))
    .where(inArray(picks.gameId, seasonGamesQuery))
    .groupBy(picks.userId, users.fullName, users.email)
    .orderBy(desc(sql`correct_picks`));

    return leaderboardData.map((entry, index) => ({
      rank: index + 1,
      user: { fullName: entry.userFullName, email: entry.userEmail },
      correctPicks: Number(entry.correctPicks),
      totalPicks: entry.totalPicks,
      percentage: entry.totalPicks > 0 ? (Number(entry.correctPicks) / entry.totalPicks) * 100 : 0,
  }));
};

/**
 * Calculates the picking stats for a single user for a season.
 * Note: Superseded by the new `getUserPickStats` and `getUserPickHistory` but retained for compatibility.
 */
export const getUserStats = async (userId: string, season: number) => {
  const seasonGamesQuery = db.select({ id: games.id }).from(games).where(eq(games.season, season));

  const seasonStats = await db.select({
      correctPicks: sql<number>`SUM(CASE WHEN ${picks.isCorrect} = true THEN 1 ELSE 0 END)`.as('correct_picks'),
      totalPicks: count(picks.id),
    })
    .from(picks)
    .where(and(eq(picks.userId, userId), inArray(picks.gameId, seasonGamesQuery)))
    .groupBy(picks.userId);
  
  const seasonLeaderboard = await getSeasonLeaderboard(season);
  const userRankData = seasonLeaderboard.find(entry => (entry.user as any).id === userId); // May need to adjust based on user object structure
  const userRank = userRankData ? userRankData.rank : null;
  
  const seasonRecord = {
    wins: Number(seasonStats[0]?.correctPicks || 0),
    losses: (seasonStats[0]?.totalPicks || 0) - Number(seasonStats[0]?.correctPicks || 0),
  };

  return { weeklyRecord: null, seasonRecord, currentRank: userRank };
};

/**
 * Alias for getWeeklyLeaderboard to match the route naming
 */
export const getWeeklyStandings = getWeeklyLeaderboard;