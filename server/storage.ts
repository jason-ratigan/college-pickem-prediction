import {
  users,
  teams,
  games,
  picks,
  gameBoxScoreStats,
  teamStrengthRatings,
  type User,
  type UpsertUser,
  type Team,
  type Game,
  type Pick,
  type GameBoxScoreStats,
  type TeamStrengthRatings,
  type InsertTeam,
  type InsertGame,
  type InsertPick,
  type InsertGameBoxScoreStats,
  type InsertTeamStrengthRatings,
} from "@college-pickem/shared";
import { db } from "./db";
import { eq, and, desc, asc, sql, like, inArray } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Team operations
  getAllTeams(): Promise<Team[]>;
  getTeamById(id: number): Promise<Team | undefined>;
  getTeamByName(name: string): Promise<Team | undefined>;
  searchTeams(query: string, conference?: string): Promise<Team[]>;
  createTeam(team: InsertTeam): Promise<Team>;
  
  // Game operations
  getGamesByWeek(season: number, week: number): Promise<(Game & { homeTeam: Team; awayTeam: Team })[]>;
  getGameById(id: number): Promise<(Game & { homeTeam: Team; awayTeam: Team }) | undefined>;
  getTeamSchedule(teamId: number, season: number): Promise<(Game & { homeTeam: Team; awayTeam: Team })[]>;
  createGame(game: InsertGame): Promise<Game>;
  updateGameScore(gameId: number, homeScore: number, awayScore: number, isFinal: boolean): Promise<void>;
  
  // Pick operations
  getUserPicks(userId: string, season: number, week: number): Promise<(Pick & { game: Game & { homeTeam: Team; awayTeam: Team }; pickedTeam: Team })[]>;
  createPick(pick: InsertPick): Promise<Pick>;
  updatePick(userId: string, gameId: number, pickedTeamId: number): Promise<Pick>;
  updatePickResults(gameId: number): Promise<void>;
  getLeaderboard(season: number, week?: number): Promise<{ user: User; correctPicks: number; totalPicks: number; percentage: number }[]>;
  
  // Box score operations
  createBoxScoreStats(stats: InsertGameBoxScoreStats): Promise<GameBoxScoreStats>;
  getBoxScoreStatsByGame(gameId: number): Promise<(GameBoxScoreStats & { team: Team })[]>;
  
  // Strength rating operations
  createStrengthRatings(ratings: InsertTeamStrengthRatings): Promise<TeamStrengthRatings>;
  getLatestStrengthRatings(teamId: number, season: number): Promise<TeamStrengthRatings | undefined>;
  getAllLatestStrengthRatings(season: number, week: number): Promise<(TeamStrengthRatings & { team: Team })[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
        },
      })
      .returning();
    return user;
  }

  // Team operations
  async getAllTeams(): Promise<Team[]> {
    return await db.select().from(teams).orderBy(asc(teams.name));
  }

  async getTeamById(id: number): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    return team;
  }

  async getTeamByName(name: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.name, name));
    return team;
  }

  async searchTeams(query: string, conference?: string): Promise<Team[]> {
    let whereClause = like(teams.name, `%${query}%`);
    
    if (conference) {
      whereClause = and(whereClause, eq(teams.conference, conference)) as any;
    }
    
    return await db.select().from(teams).where(whereClause).orderBy(asc(teams.name));
  }

  async createTeam(team: InsertTeam): Promise<Team> {
    const [newTeam] = await db.insert(teams).values(team).returning();
    return newTeam;
  }

  // Game operations
  async getGamesByWeek(season: number, week: number): Promise<(Game & { homeTeam: Team; awayTeam: Team })[]> {
    return await db
      .select()
      .from(games)
      .leftJoin(teams, eq(games.homeTeamId, teams.id))
      .leftJoin(teams, eq(games.awayTeamId, teams.id))
      .where(and(eq(games.season, season), eq(games.week, week)))
      .orderBy(asc(games.gameTime))
      .then(rows => rows.map(row => ({
        ...row.games,
        homeTeam: row.teams!,
        awayTeam: row.teams!,
      })));
  }

  async getGameById(id: number): Promise<(Game & { homeTeam: Team; awayTeam: Team }) | undefined> {
    const result = await db
      .select({
        game: games,
        homeTeam: teams,
        awayTeam: teams,
      })
      .from(games)
      .leftJoin(teams, eq(games.homeTeamId, teams.id))
      .leftJoin(teams, eq(games.awayTeamId, teams.id))
      .where(eq(games.id, id));
    
    if (result.length === 0) return undefined;
    
    return {
      ...result[0].game,
      homeTeam: result[0].homeTeam!,
      awayTeam: result[0].awayTeam!,
    };
  }

  async getTeamSchedule(teamId: number, season: number): Promise<(Game & { homeTeam: Team; awayTeam: Team })[]> {
    const result = await db
      .select({
        game: games,
        homeTeam: teams,
        awayTeam: teams,
      })
      .from(games)
      .leftJoin(teams, eq(games.homeTeamId, teams.id))
      .leftJoin(teams, eq(games.awayTeamId, teams.id))
      .where(
        and(
          eq(games.season, season),
          sql`(${games.homeTeamId} = ${teamId} OR ${games.awayTeamId} = ${teamId})`
        )
      )
      .orderBy(asc(games.week));
    
    return result.map(row => ({
      ...row.game,
      homeTeam: row.homeTeam!,
      awayTeam: row.awayTeam!,
    }));
  }

  async createGame(game: InsertGame): Promise<Game> {
    const [newGame] = await db.insert(games).values(game).returning();
    return newGame;
  }

  async updateGameScore(gameId: number, homeScore: number, awayScore: number, isFinal: boolean): Promise<void> {
    await db
      .update(games)
      .set({
        homeTeamScore: homeScore,
        awayTeamScore: awayScore,
        isFinal,
      })
      .where(eq(games.id, gameId));
  }

  // Pick operations
  async getUserPicks(userId: string, season: number, week: number): Promise<(Pick & { game: Game & { homeTeam: Team; awayTeam: Team }; pickedTeam: Team })[]> {
    const result = await db
      .select({
        pick: picks,
        game: games,
        homeTeam: teams,
        awayTeam: teams,
        pickedTeam: teams,
      })
      .from(picks)
      .leftJoin(games, eq(picks.gameId, games.id))
      .leftJoin(teams, eq(games.homeTeamId, teams.id))
      .leftJoin(teams, eq(games.awayTeamId, teams.id))
      .leftJoin(teams, eq(picks.pickedTeamId, teams.id))
      .where(
        and(
          eq(picks.userId, userId),
          eq(games.season, season),
          eq(games.week, week)
        )
      );
    
    return result.map(row => ({
      ...row.pick,
      game: {
        ...row.game!,
        homeTeam: row.homeTeam!,
        awayTeam: row.awayTeam!,
      },
      pickedTeam: row.pickedTeam!,
    }));
  }

  async createPick(pick: InsertPick): Promise<Pick> {
    const [newPick] = await db.insert(picks).values(pick).returning();
    return newPick;
  }

  async updatePick(userId: string, gameId: number, pickedTeamId: number): Promise<Pick> {
    const [updatedPick] = await db
      .update(picks)
      .set({ pickedTeamId })
      .where(and(eq(picks.userId, userId), eq(picks.gameId, gameId)))
      .returning();
    
    if (!updatedPick) {
      // Create new pick if it doesn't exist
      return this.createPick({ userId, gameId, pickedTeamId });
    }
    
    return updatedPick;
  }

  async updatePickResults(gameId: number): Promise<void> {
    const game = await this.getGameById(gameId);
    if (!game || !game.isFinal || game.homeTeamScore === null || game.awayTeamScore === null) {
      return;
    }
    
    const winnerId = game.homeTeamScore > game.awayTeamScore ? game.homeTeamId : game.awayTeamId;
    
    await db
      .update(picks)
      .set({
        isCorrect: sql`CASE WHEN ${picks.pickedTeamId} = ${winnerId} THEN true ELSE false END`,
      })
      .where(eq(picks.gameId, gameId));
  }

  async getLeaderboard(season: number, week?: number): Promise<{ user: User; correctPicks: number; totalPicks: number; percentage: number }[]> {
    let whereClause = eq(games.season, season);
    
    if (week !== undefined) {
      whereClause = and(whereClause, eq(games.week, week)) as any;
    }
    
    const result = await db
      .select({
        user: users,
        correctPicks: sql<number>`COUNT(CASE WHEN ${picks.isCorrect} = true THEN 1 END)`,
        totalPicks: sql<number>`COUNT(${picks.id})`,
      })
      .from(users)
      .leftJoin(picks, eq(users.id, picks.userId))
      .leftJoin(games, eq(picks.gameId, games.id))
      .where(whereClause)
      .groupBy(users.id)
      .orderBy(desc(sql`COUNT(CASE WHEN ${picks.isCorrect} = true THEN 1 END)::float / NULLIF(COUNT(${picks.id}), 0)`));
    
    return result.map(row => ({
      user: row.user,
      correctPicks: row.correctPicks,
      totalPicks: row.totalPicks,
      percentage: row.totalPicks > 0 ? (row.correctPicks / row.totalPicks) * 100 : 0,
    }));
  }

  // Box score operations
  async createBoxScoreStats(stats: InsertGameBoxScoreStats): Promise<GameBoxScoreStats> {
    const [newStats] = await db.insert(gameBoxScoreStats).values(stats).returning();
    return newStats;
  }

  async getBoxScoreStatsByGame(gameId: number): Promise<(GameBoxScoreStats & { team: Team })[]> {
    const result = await db
      .select({
        stats: gameBoxScoreStats,
        team: teams,
      })
      .from(gameBoxScoreStats)
      .leftJoin(teams, eq(gameBoxScoreStats.teamId, teams.id))
      .where(eq(gameBoxScoreStats.gameId, gameId));
    
    return result.map(row => ({
      ...row.stats,
      team: row.team!,
    }));
  }

  // Strength rating operations
  async createStrengthRatings(ratings: InsertTeamStrengthRatings): Promise<TeamStrengthRatings> {
    const [newRatings] = await db.insert(teamStrengthRatings).values(ratings).returning();
    return newRatings;
  }

  async getLatestStrengthRatings(teamId: number, season: number): Promise<TeamStrengthRatings | undefined> {
    const [ratings] = await db
      .select()
      .from(teamStrengthRatings)
      .where(and(eq(teamStrengthRatings.teamId, teamId), eq(teamStrengthRatings.season, season)))
      .orderBy(desc(teamStrengthRatings.week))
      .limit(1);
    
    return ratings;
  }

  async getAllLatestStrengthRatings(season: number, week: number): Promise<(TeamStrengthRatings & { team: Team })[]> {
    const result = await db
      .select({
        ratings: teamStrengthRatings,
        team: teams,
      })
      .from(teamStrengthRatings)
      .leftJoin(teams, eq(teamStrengthRatings.teamId, teams.id))
      .where(and(eq(teamStrengthRatings.season, season), eq(teamStrengthRatings.week, week)))
      .orderBy(desc(teamStrengthRatings.offenseRatingAdjusted));
    
    return result.map(row => ({
      ...row.ratings,
      team: row.team!,
    }));
  }
}

export const storage = new DatabaseStorage();
