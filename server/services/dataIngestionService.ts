// server/services/dataIngestionService.ts

import { db } from '../db.js';
import { teams, games, gameBoxScoreStats, picks } from '@college-pickem/shared';
import { sql, inArray, eq, and } from 'drizzle-orm';
import axios from 'axios';

// Type definitions
type TeamToUpsert = {
  apiTeamId: number;
  name: string;
  conference: string | null;
  logoUrl: string | null;
  classification: string | null;
  dataQuality: 'Good';
  lastSynced: Date;
  syncErrors: number;
  isUpdate: boolean;
  existingId?: number;
};

type ApiGame = {
  id: number;
  season: number;
  week: number;
  seasonType: string;
  startDate: string | null;
  homeId: number;
  awayId: number;
  homePoints: number | null;
  awayPoints: number | null;
  completed: boolean;
  homeClassification?: string;
  awayClassification?: string;
  homeTeam?: string;
  awayTeam?: string;
};
type GameBoxScoreStatsInsert = typeof gameBoxScoreStats.$inferInsert;
type MappedGame = {
  apiGameId: number;
  season: number;
  week: number;
  seasonType: 'regular' | 'postseason';
  postseasonType?: 'bowl' | 'playoff' | 'championship';
  gameTime: Date | null;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamScore: number | null;
  awayTeamScore: number | null;
  isFinal: boolean;
};

type IngestionSummary = {
  season: number;
  teamsProcessed: number;
  regularSeasonGames: number;
  postseasonGames: number;
  statisticsRecords: number;
  errors: string[];
  duration: number;
};

const cfbdApi = axios.create({
  baseURL: 'https://api.collegefootballdata.com',
  headers: { 'Authorization': process.env.CFBD_API_KEY }
});

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// Retry mechanism with exponential backoff
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      if (attempt === maxRetries) break;

      const shouldRetry = error.response?.status === 429 ||
                         error.code === 'ECONNRESET' ||
                         error.code === 'ETIMEDOUT' ||
                         !error.response;

      if (!shouldRetry) break;

      const delayMs = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      console.log(`[Ingestion] Attempt ${attempt + 1} failed, retrying in ${Math.round(delayMs)}ms...`);
      await delay(delayMs);
    }
  }

  throw lastError;
}

// Helper function to determine postseason type
function determinePostseasonType(week: number, seasonType: string): 'bowl' | 'playoff' | 'championship' | undefined {
  if (seasonType !== 'postseason') return undefined;
  if (week >= 16 && week <= 17) return 'bowl';
  if (week >= 18) return 'playoff';
  return 'bowl';
}

export async function syncAllTeams() {
  console.log('[Ingestion] Syncing ALL teams (FBS and FCS)...');
  
  // Import validation services
  const { dataValidationService } = await import('./dataValidationService.js');
  
  // Use a transaction to ensure atomicity
  return await db.transaction(async (tx) => {
    try {
      const response = await cfbdApi.get('/teams');
      const apiTeams = response.data;

      if (!apiTeams || !Array.isArray(apiTeams) || apiTeams.length === 0) {
        console.log('[Ingestion] No teams found from API or invalid format. Sync complete.');
        return;
      }

      // Step 1: Validate and pre-process the API data
      console.log(`[Ingestion] Validating ${apiTeams.length} teams from API...`);
      const validationResult = dataValidationService.batchValidate(
        apiTeams,
        (team) => dataValidationService.validateTeamData(team)
      );
      
      console.log(`[Ingestion] Validation complete: ${validationResult.validItems.length} valid, ${validationResult.invalidItems.length} invalid`);
      
      if (validationResult.totalErrors > 0) {
        console.warn(`[Ingestion] Found ${validationResult.totalErrors} validation errors`);
      }
      
      const uniqueTeamMap = new Map<number, any>();
      const teamNameCounts = new Map<string, number>();
      
      // Use validated teams only
      for (const team of validationResult.validItems) {
        if (team && team.id && team.school) {
          uniqueTeamMap.set(team.id, team);
          // Track team name frequency to handle duplicates
          const count = teamNameCounts.get(team.school) || 0;
          teamNameCounts.set(team.school, count + 1);
        }
      }

      if (uniqueTeamMap.size === 0) {
          console.log('[Ingestion] No valid teams with an ID and name found after validation.');
          return;
      }

      // Step 2: Get existing teams from database to avoid conflicts
      const existingTeams = await tx.query.teams.findMany();
      const existingNameSet = new Set<string>();
      const existingApiIdMap = new Map<number, any>();
      
      for (const existingTeam of existingTeams) {
        existingNameSet.add(existingTeam.name);
        if (existingTeam.apiTeamId) {
          existingApiIdMap.set(existingTeam.apiTeamId, existingTeam);
        }
      }

      // Step 3: Filter and map teams, skipping duplicates
      const teamsToUpsert = Array.from(uniqueTeamMap.values())
        .map((team) => {
          const teamName = dataValidationService.normalizeTeamName(team.school);
          
          // Check if this exact API team already exists - if so, we'll update it
          const existingByApiId = existingApiIdMap.get(team.id);
          if (existingByApiId) {
            return {
              apiTeamId: team.id,
              name: existingByApiId.name, // Keep existing name
              conference: team.conference || null,
              logoUrl: team.logos?.[0] || null,
              classification: team.classification || null,
              dataQuality: 'Good' as const,
              lastSynced: new Date(),
              syncErrors: 0,
              isUpdate: true,
              existingId: existingByApiId.id,
            };
          }
          
          // Check if name already exists - if so, skip this team
          if (existingNameSet.has(teamName)) {
            console.log(`[Ingestion] Skipping team "${teamName}" (API ID: ${team.id}) - name already exists`);
            return null;
          }
          
          // Check for duplicates within current batch
          const duplicateInBatch = teamNameCounts.get(team.school)! > 1;
          if (duplicateInBatch) {
            console.log(`[Ingestion] Skipping team "${teamName}" (API ID: ${team.id}) - duplicate in current batch`);
            return null;
          }
          
          return {
            apiTeamId: team.id,
            name: teamName,
            conference: team.conference || null,
            logoUrl: team.logos?.[0] || null,
            classification: team.classification || null,
            dataQuality: 'Good' as const,
            lastSynced: new Date(),
            syncErrors: 0,
            isUpdate: false,
          };
        })
        .filter((team): team is TeamToUpsert => team !== null);

      console.log(`[Ingestion] Processing ${teamsToUpsert.length} validated teams from API payload.`);

      // Step 4: Process teams in batches within the transaction
      let successCount = 0;
      let conflictCount = 0;
      const batchSize = 50; // Process in smaller batches to avoid long-running transactions
      
      for (let i = 0; i < teamsToUpsert.length; i += batchSize) {
        const batch = teamsToUpsert.slice(i, i + batchSize);
        
        for (const teamData of batch) {
          try {
            if (teamData.isUpdate && teamData.existingId) {
              // Update existing team
              await tx.update(teams)
                .set({
                  conference: teamData.conference,
                  logoUrl: teamData.logoUrl,
                  classification: teamData.classification,
                  dataQuality: teamData.dataQuality,
                  lastSynced: teamData.lastSynced,
                  syncErrors: 0,
                })
                .where(eq(teams.id, teamData.existingId));
              successCount++;
            } else {
              // Insert new team - should not conflict since we pre-filtered
              const { isUpdate, existingId, ...insertData } = teamData;
              await tx.insert(teams).values(insertData);
              successCount++;
            }
          } catch (error: any) {
            // If we still get a conflict, just skip this team
            if (error.code === '23505' && error.constraint_name === 'teams_name_unique') {
              console.log(`[Ingestion] Skipping team "${teamData.name}" due to name conflict - not a major team`);
              conflictCount++;
            } else {
              console.error(`[Ingestion] Failed to sync team "${teamData.name}":`, error);
              conflictCount++;
            }
          }
        }
      }

      console.log(`[Ingestion] Team sync completed: ${successCount} successful, ${conflictCount} conflicts resolved`);
      console.log(`[Ingestion] Validation summary: ${validationResult.totalErrors} errors, ${validationResult.totalWarnings} warnings`);
      
      return { 
        successCount, 
        conflictCount, 
        validationErrors: validationResult.totalErrors,
        validationWarnings: validationResult.totalWarnings 
      };

    } catch (error) {
      console.error('[Ingestion] A critical error occurred during team sync:', error);
      // Transaction will automatically rollback on error
      throw error;
    }
  });
}

function transformTraditionalStats(statsArray: { category: string, stat: string }[]): Partial<GameBoxScoreStatsInsert> {
  const statMap: { [key: string]: string | number | null } = {};
  const apiToSchemaMapping: { [key: string]: string } = {
    completionAttempts: 'completionAttempts', netPassingYards: 'netPassingYards', passingTDs: 'passingTDs',
    rushingYards: 'rushingYards', rushingAttempts: 'rushingAttempts', rushingTDs: 'rushingTDs',
    totalYards: 'totalYards', firstDowns: 'firstDowns', turnovers: 'turnovers', fumblesLost: 'fumblesLost',
    interceptions: 'interceptionsThrown', possessionTime: 'possessionTime', sacks: 'sacks',
    tacklesForLoss: 'tacklesForLoss', fumblesRecovered: 'fumblesRecovered', passesIntercepted: 'interceptions',
    passesDeflected: 'passesDeflected', qbHurries: 'qbHurries', defensiveTDs: 'defensiveTDs',
    kickReturnYards: 'kickReturnYards', puntReturnYards: 'puntReturnYards', thirdDownEff: 'thirdDownEff',
    fourthDownEff: 'fourthDownEff', totalPenaltiesYards: 'totalPenaltiesYards',
  };
  for (const item of statsArray) {
    const schemaKey = apiToSchemaMapping[item.category];
    if (schemaKey) {
      const numericValue = Number(item.stat);
      statMap[schemaKey] = !isNaN(numericValue) && item.stat.indexOf('-') === -1 ? numericValue : item.stat;
    }
  }
  return statMap as Partial<GameBoxScoreStatsInsert>;
}

export async function ingestWeekData(season: number, week: number, seasonType: 'regular' | 'postseason', teamApiToDbIdMap: Map<number, number>) {
  console.log(`[Ingestion] Starting EFFICIENT ingestion for Season ${season}, Week ${week}, Type: ${seasonType}...`);

  const apiGames = await retryWithBackoff(async () => {
    const response = await cfbdApi.get<ApiGame[]>('/games', {
      params: { year: season, week: week, seasonType: seasonType }
    });
    return response.data;
  });

  if (!apiGames || apiGames.length === 0) {
    console.log(`[Ingestion] No games found for S${season} W${week} (${seasonType}).`);
    return;
  }

  const boxScoreData = await retryWithBackoff(async () => {
    const response = await cfbdApi.get('/games/teams', {
      params: { year: season, week: week, seasonType: seasonType }
    });
    return response.data;
  });

  const advancedStatsData = await retryWithBackoff(async () => {
    const response = await cfbdApi.get('/stats/game/advanced', {
      params: { year: season, week: week, seasonType: seasonType }
    });
    return response.data;
  });

  const boxScoreMap = new Map<number, any>();
  if (boxScoreData) {
    for (const gameBox of boxScoreData) boxScoreMap.set(gameBox.id, gameBox);
  }

  const advancedStatsMap = new Map<number, any[]>();
  if (advancedStatsData) {
    for (const advStat of advancedStatsData) {
      if (!advancedStatsMap.has(advStat.gameId)) advancedStatsMap.set(advStat.gameId, []);
      advancedStatsMap.get(advStat.gameId)!.push(advStat);
    }
  }

  const mappedGames = apiGames.map((game): MappedGame | null => {
    const homeTeamDbId = teamApiToDbIdMap.get(game.homeId);
    const awayTeamDbId = teamApiToDbIdMap.get(game.awayId);
    if (!homeTeamDbId || !awayTeamDbId) {
      if (game.homeClassification === 'fbs' || game.awayClassification === 'fbs' || (!game.homeClassification && !game.awayClassification)) {
        console.warn(`[Ingestion] Skipping game ${game.id} - missing team mapping (home: ${game.homeId}/${game.homeTeam}, away: ${game.awayId}/${game.awayTeam})`);
      }
      return null;
    }
    return {
      apiGameId: game.id, season: game.season, week: game.week,
      seasonType: game.seasonType === 'postseason' ? 'postseason' : 'regular',
      postseasonType: determinePostseasonType(game.week, game.seasonType),
      gameTime: game.startDate ? new Date(game.startDate) : null,
      homeTeamId: homeTeamDbId, awayTeamId: awayTeamDbId,
      homeTeamScore: game.homePoints, awayTeamScore: game.awayPoints,
      isFinal: game.completed === true,
    };
  }).filter((g): g is MappedGame => g !== null);

  if (mappedGames.length > 0) {
    await db
      .insert(games)
      .values(mappedGames)
      .onConflictDoUpdate({
        target: games.apiGameId,
        set: {
          season: sql`excluded.season`,
          week: sql`excluded.week`,
          seasonType: sql`excluded.season_type`,
          postseasonType: sql`excluded.postseason_type`,
          gameTime: sql`excluded.game_time`,
          homeTeamId: sql`excluded.home_team_id`,
          awayTeamId: sql`excluded.away_team_id`,
          homeTeamScore: sql`excluded.home_team_score`,
          awayTeamScore: sql`excluded.away_team_score`,
          isFinal: sql`excluded.is_final`,
        },
      });
  }

  const completedApiGameIds = apiGames
    .filter(g => g.completed === true)
    .map(g => g.id);
  
  // =============================================================================
  // START: CRITICAL FIX
  // This step is vital. It guarantees that any game marked as 'completed' in the API
  // has its `is_final` flag set to `true` in our database *before* any other
  // logic attempts to read it.
  // =============================================================================
  if (completedApiGameIds.length > 0) {
    await db.update(games)
      .set({ isFinal: true })
      .where(inArray(games.apiGameId, completedApiGameIds));
    console.log(`[Ingestion]   Ensured 'isFinal' is true for ${completedApiGameIds.length} completed games.`);
  }
  // =============================================================================
  // END: CRITICAL FIX
  // =============================================================================

  const processedApiGameIds = mappedGames.map(g => g.apiGameId);
  if (processedApiGameIds.length === 0) return;

  const dbGames = await db.query.games.findMany({ where: inArray(games.apiGameId, processedApiGameIds) });
  const gameApiToDbIdMap = new Map<number, number>();
  dbGames.forEach(g => { if (g.apiGameId) gameApiToDbIdMap.set(g.apiGameId, g.id); });

  const finalStatsToUpsert: GameBoxScoreStatsInsert[] = [];
  const completedGames = apiGames.filter(g => g.completed === true);
  console.log(`[Ingestion]   Combining stats for ${completedGames.length} completed games...`);

  for (const game of completedGames) {
    const gameDbId = gameApiToDbIdMap.get(game.id);
    if (!gameDbId) continue;

    const combinedStatsMap = new Map<number, Partial<GameBoxScoreStatsInsert>>();

    const gameBox = boxScoreMap.get(game.id);
    if (gameBox?.teams) {
      for (const teamBox of gameBox.teams) {
        combinedStatsMap.set(teamBox.teamId, { ...transformTraditionalStats(teamBox.stats) });
      }
    }

    const gameAdvStats = advancedStatsMap.get(game.id);
    if (gameAdvStats) {
      for (const teamAdvStats of gameAdvStats) {
        const teamId = teamAdvStats.teamId;
        const existingStats = combinedStatsMap.get(teamId) || {};
        Object.assign(existingStats, {
          off_plays: teamAdvStats.offense?.plays, off_drives: teamAdvStats.offense?.drives,
          off_ppa: teamAdvStats.offense?.ppa, off_success_rate: teamAdvStats.offense?.successRate,
          off_explosiveness: teamAdvStats.offense?.explosiveness, off_power_success: teamAdvStats.offense?.powerSuccess,
          off_stuff_rate: teamAdvStats.offense?.stuffRate, off_line_yards: teamAdvStats.offense?.lineYards,
          off_second_level_yards: teamAdvStats.offense?.secondLevelYards, off_open_field_yards: teamAdvStats.offense?.openFieldYards,
          def_plays: teamAdvStats.defense?.plays, def_drives: teamAdvStats.defense?.drives,
          def_ppa: teamAdvStats.defense?.ppa, def_success_rate: teamAdvStats.defense?.successRate,
          def_explosiveness: teamAdvStats.defense?.explosiveness, def_power_success: teamAdvStats.defense?.powerSuccess,
          def_stuff_rate: teamAdvStats.defense?.stuffRate, def_line_yards: teamAdvStats.defense?.lineYards,
          def_second_level_yards: teamAdvStats.defense?.secondLevelYards, def_open_field_yards: teamAdvStats.defense?.openFieldYards,
        });
        combinedStatsMap.set(teamId, existingStats);
      }
    }

    combinedStatsMap.forEach((stats, apiTeamId) => {
      const teamDbId = teamApiToDbIdMap.get(apiTeamId);
      if (teamDbId) {
      finalStatsToUpsert.push({ ...stats, gameId: gameDbId, teamId: teamDbId } as GameBoxScoreStatsInsert);
        }
      });
  }

  if (finalStatsToUpsert.length > 0) {
    console.log(`[Ingestion]   Upserting ${finalStatsToUpsert.length} box score records for the week.`);
    await db.insert(gameBoxScoreStats)
      .values(finalStatsToUpsert)
      .onConflictDoUpdate({
        target: [gameBoxScoreStats.gameId, gameBoxScoreStats.teamId],
        set: {
          completionAttempts: sql`excluded.completion_attempts`, netPassingYards: sql`excluded.net_passing_yards`,
          passingTDs: sql`excluded.passing_tds`, rushingYards: sql`excluded.rushing_yards`,
          rushingAttempts: sql`excluded.rushing_attempts`, rushingTDs: sql`excluded.rushing_tds`,
          totalYards: sql`excluded.total_yards`, firstDowns: sql`excluded.first_downs`,
          turnovers: sql`excluded.turnovers`, fumblesLost: sql`excluded.fumbles_lost`,
          interceptionsThrown: sql`excluded.interceptions_thrown`, possessionTime: sql`excluded.possession_time`,
          sacks: sql`excluded.sacks`, tacklesForLoss: sql`excluded.tackles_for_loss`,
          fumblesRecovered: sql`excluded.fumbles_recovered`, interceptions: sql`excluded.interceptions`,
          passesDeflected: sql`excluded.passes_deflected`, qbHurries: sql`excluded.qb_hurries`,
          defensiveTDs: sql`excluded.defensive_tds`, kickReturnYards: sql`excluded.kick_return_yards`,
          puntReturnYards: sql`excluded.punt_return_yards`, thirdDownEff: sql`excluded.third_down_eff`,
          fourthDownEff: sql`excluded.fourth_down_eff`, totalPenaltiesYards: sql`excluded.total_penalties_yards`,
          off_plays: sql`excluded.off_plays`, off_drives: sql`excluded.off_drives`,
          off_ppa: sql`excluded.off_ppa`, off_success_rate: sql`excluded.off_success_rate`,
          off_explosiveness: sql`excluded.off_explosiveness`, off_power_success: sql`excluded.off_power_success`,
          off_stuff_rate: sql`excluded.off_stuff_rate`, off_line_yards: sql`excluded.off_line_yards`,
          off_second_level_yards: sql`excluded.off_second_level_yards`, off_open_field_yards: sql`excluded.off_open_field_yards`,
          def_plays: sql`excluded.def_plays`, def_drives: sql`excluded.def_drives`,
          def_ppa: sql`excluded.def_ppa`, def_success_rate: sql`excluded.def_success_rate`,
          def_explosiveness: sql`excluded.def_explosiveness`, def_power_success: sql`excluded.def_power_success`,
          def_stuff_rate: sql`excluded.def_stuff_rate`, def_line_yards: sql`excluded.def_line_yards`,
          def_second_level_yards: sql`excluded.def_second_level_yards`, def_open_field_yards: sql`excluded.def_open_field_yards`,
        }
      });
  }

  // The original "Safety net" block was here and has been removed as its logic was moved up.

  console.log(`[Ingestion] Finished ingestion for S${season} W${week}. Processed ${mappedGames.length} games with just 3 API calls.`);
}

export async function repopulateGamesByApiIds(apiGameIds: number[]): Promise<{ processed: number; upserted: number; missingTeamMappings: Array<{ apiGameId: number; homeId: number; awayId: number }>; errors: string[]; }> {
  const result = { processed: 0, upserted: 0, missingTeamMappings: [] as Array<{ apiGameId: number; homeId: number; awayId: number }>, errors: [] as string[] };
  try {
    if (!apiGameIds || apiGameIds.length === 0) {
      return result;
    }

    // Build team mapping once
    const allTeams = await db.query.teams.findMany();
    const teamApiToDbIdMap = new Map<number, number>();
    for (const team of allTeams) {
      if (team.apiTeamId) teamApiToDbIdMap.set(team.apiTeamId, team.id);
    }

    const mappedGames: MappedGame[] = [];

    for (const apiGameId of apiGameIds) {
      try {
        const resp = await retryWithBackoff(async () => {
          const response = await cfbdApi.get<ApiGame[]>('/games', { params: { id: apiGameId } });
          return response.data;
        });
        const apiGame = Array.isArray(resp) ? resp[0] : null;
        if (!apiGame) {
          result.errors.push(`Game ${apiGameId} not found in API`);
          continue;
        }

        const homeTeamDbId = teamApiToDbIdMap.get(apiGame.homeId);
        const awayTeamDbId = teamApiToDbIdMap.get(apiGame.awayId);
        if (!homeTeamDbId || !awayTeamDbId) {
          result.missingTeamMappings.push({ apiGameId, homeId: apiGame.homeId, awayId: apiGame.awayId });
          continue;
        }

        mappedGames.push({
          apiGameId: apiGame.id,
          season: apiGame.season,
          week: apiGame.week,
          seasonType: apiGame.seasonType === 'postseason' ? 'postseason' : 'regular',
          postseasonType: determinePostseasonType(apiGame.week, apiGame.seasonType),
          gameTime: apiGame.startDate ? new Date(apiGame.startDate) : null,
          homeTeamId: homeTeamDbId,
          awayTeamId: awayTeamDbId,
          homeTeamScore: apiGame.homePoints,
          awayTeamScore: apiGame.awayPoints,
          isFinal: apiGame.completed === true,
        });
        result.processed++;
      } catch (err: any) {
        const msg = `Error fetching game ${apiGameId}: ${err?.message || String(err)}`;
        console.error('[Ingestion] repopulateGamesByApiIds:', msg, err?.stack || '');
        result.errors.push(msg);
      }
    }

    if (mappedGames.length > 0) {
      await db
        .insert(games)
        .values(mappedGames)
        .onConflictDoUpdate({
          target: games.apiGameId,
          set: {
            season: sql`excluded.season`,
            week: sql`excluded.week`,
            seasonType: sql`excluded.season_type`,
            postseasonType: sql`excluded.postseason_type`,
            gameTime: sql`excluded.game_time`,
            homeTeamId: sql`excluded.home_team_id`,
            awayTeamId: sql`excluded.away_team_id`,
            homeTeamScore: sql`excluded.home_team_score`,
            awayTeamScore: sql`excluded.away_team_score`,
            isFinal: sql`excluded.is_final`,
          },
        });
      result.upserted = mappedGames.length;

      const completedApiGameIds = mappedGames.filter(g => g.isFinal).map(g => g.apiGameId);
      if (completedApiGameIds.length > 0) {
        await db.update(games).set({ isFinal: true }).where(inArray(games.apiGameId, completedApiGameIds));
      }
    }

    return result;
  } catch (error: any) {
    result.errors.push(error?.message || String(error));
    return result;
  }
}

export async function reconcileSeasonSchedule(season: number, options?: { destructiveReset?: boolean }): Promise<{ season: number; apiGames: number; upserted: number; removed: number; errors: string[]; }> {
  console.log(`[Ingestion] Reconciling season schedule for ${season}. options=`, options);

  console.log(`[Ingestion] Reconciling season schedule for ${season}. options=`, options);

  const result = { season, apiGames: 0, upserted: 0, removed: 0, errors: [] as string[] };
  try {
    // Fetch all teams and build map
    const allTeams = await db.query.teams.findMany();
    const teamApiToDbIdMap = new Map<number, number>();
    for (const team of allTeams) {
      if (team.apiTeamId) teamApiToDbIdMap.set(team.apiTeamId, team.id);
    }

    // Fetch all games for the season from API
    const apiGames = await retryWithBackoff(async () => {
      console.log('[Ingestion] Fetching all games from API for year', season);

      const response = await cfbdApi.get<ApiGame[]>('/games', { params: { year: season } });
      return response.data as ApiGame[];
    });
    result.apiGames = apiGames.length;

    // Map valid games to DB insertable rows
    const mappedGames = apiGames.map((game): MappedGame | null => {
      const homeTeamDbId = teamApiToDbIdMap.get(game.homeId);
      const awayTeamDbId = teamApiToDbIdMap.get(game.awayId);
      if (!homeTeamDbId || !awayTeamDbId) return null;
      return {
        apiGameId: game.id, season: game.season, week: game.week,
        seasonType: game.seasonType === 'postseason' ? 'postseason' : 'regular',
        postseasonType: determinePostseasonType(game.week, game.seasonType),
        gameTime: game.startDate ? new Date(game.startDate) : null,
        homeTeamId: homeTeamDbId, awayTeamId: awayTeamDbId,
        homeTeamScore: game.homePoints, awayTeamScore: game.awayPoints,
        isFinal: game.completed === true,
      };
    }).filter((g): g is MappedGame => g !== null);

    if (options?.destructiveReset) {
      console.warn('[Ingestion] Destructive reset enabled for season', season);

      // Remove existing season games and dependent picks/stats to start fresh
      const seasonGameIds = (await db.query.games.findMany({ where: eq(games.season, season), columns: { id: true } })).map(g => g.id);
      if (seasonGameIds.length > 0) {
        await db.delete(picks).where(inArray(picks.gameId, seasonGameIds));
        await db.delete(gameBoxScoreStats).where(inArray(gameBoxScoreStats.gameId, seasonGameIds));
        await db.delete(games).where(inArray(games.id, seasonGameIds));
      }
    }

    if (mappedGames.length > 0) {
      await db.insert(games)
        .values(mappedGames)
        .onConflictDoUpdate({
          target: games.apiGameId,
          set: {
            season: sql`excluded.season`,
            week: sql`excluded.week`,
            seasonType: sql`excluded.season_type`,
            postseasonType: sql`excluded.postseason_type`,
            gameTime: sql`excluded.game_time`,
            homeTeamId: sql`excluded.home_team_id`,
            awayTeamId: sql`excluded.away_team_id`,
            homeTeamScore: sql`excluded.home_team_score`,
            awayTeamScore: sql`excluded.away_team_score`,
            isFinal: sql`excluded.is_final`,
          }
        });
      result.upserted = mappedGames.length;

      // Ensure all completed games have isFinal true
      const completedApiGameIds = mappedGames.filter(g => g.isFinal).map(g => g.apiGameId);
      if (completedApiGameIds.length > 0) {
        await db.update(games).set({ isFinal: true }).where(inArray(games.apiGameId, completedApiGameIds));
      }
    }

    // If not destructive, optionally remove games no longer in API (rescheduled/canceled)
    if (!options?.destructiveReset) {
      const currentApiIds = new Set(mappedGames.map(g => g.apiGameId));
      const dbSeasonGames = await db.query.games.findMany({ where: eq(games.season, season) });
      const toRemove = dbSeasonGames.filter(g => g.apiGameId !== null && !currentApiIds.has(g.apiGameId!));
      if (toRemove.length > 0) {
        const toRemoveIds = toRemove.map(g => g.id);
        await db.delete(picks).where(inArray(picks.gameId, toRemoveIds));
        await db.delete(gameBoxScoreStats).where(inArray(gameBoxScoreStats.gameId, toRemoveIds));
        await db.delete(games).where(inArray(games.id, toRemoveIds));
        result.removed = toRemove.length;
      }
    }

    return result;
  } catch (error: any) {
    result.errors.push(error?.message || String(error));
    return result;
  }
}

export const ingestFullSeasonData = async (season: number): Promise<IngestionSummary> => {
  const startTime = Date.now();
  console.log(`[Ingestion] STARTING FULL DATA INGESTION FOR ${season} SEASON.`);

  const summary: IngestionSummary = {
    season,
    teamsProcessed: 0,
    regularSeasonGames: 0,
    postseasonGames: 0,
    statisticsRecords: 0,
    errors: [],
    duration: 0
  };

  try {
    await syncAllTeams();
    const allTeams = await db.query.teams.findMany();
    const teamApiToDbIdMap = new Map<number, number>();
    for (const team of allTeams) {
      if (team.apiTeamId) teamApiToDbIdMap.set(team.apiTeamId, team.id);
    }
    summary.teamsProcessed = teamApiToDbIdMap.size;
    console.log(`[Ingestion] Created a lookup map for ${summary.teamsProcessed} teams.`);
    await delay(1000);

    console.log(`[Ingestion] Starting regular season ingestion...`);
    for (let week = 1; week <= 15; week++) {
      try {
        await ingestWeekData(season, week, 'regular', teamApiToDbIdMap);
        await delay(250); // Reduced delay for faster processing
      } catch (error) {
        const errorMsg = `Failed to ingest regular season week ${week}: ${error}`;
        console.error(`[Ingestion] ${errorMsg}`);
        summary.errors.push(errorMsg);
      }
    }

    console.log(`[Ingestion] Starting postseason ingestion...`);
    for (let week = 16; week <= 20; week++) {
      try {
        await ingestWeekData(season, week, 'postseason', teamApiToDbIdMap);
        await delay(250); // Reduced delay for faster processing
      } catch (error) {
        const errorMsg = `Failed to ingest postseason week ${week}: ${error}`;
        console.error(`[Ingestion] ${errorMsg}`);
        summary.errors.push(errorMsg);
      }
    }

    const regularSeasonCount = await db.select({ count: sql<number>`count(*)` }).from(games).where(and(eq(games.season, season), eq(games.seasonType, 'regular')));
    const postseasonCount = await db.select({ count: sql<number>`count(*)` }).from(games).where(and(eq(games.season, season), eq(games.seasonType, 'postseason')));

    const seasonGames = await db.query.games.findMany({ where: eq(games.season, season), columns: { id: true } });
    const gameIds = seasonGames.map(g => g.id);
    const statsCount = gameIds.length > 0 ? await db.select({ count: sql<number>`count(*)` }).from(gameBoxScoreStats).where(inArray(gameBoxScoreStats.gameId, gameIds)) : [{ count: 0 }];

    summary.regularSeasonGames = Number(regularSeasonCount[0].count);
    summary.postseasonGames = Number(postseasonCount[0].count);
    summary.statisticsRecords = Number(statsCount[0].count);
    summary.duration = Date.now() - startTime;

    console.log(`[Ingestion] COMPLETED FULL DATA INGESTION FOR ${season} SEASON.`);
    console.log(`[Ingestion] Summary:`, {
      teamsProcessed: summary.teamsProcessed,
      regularSeasonGames: summary.regularSeasonGames,
      postseasonGames: summary.postseasonGames,
      statisticsRecords: summary.statisticsRecords,
      errors: summary.errors.length,
      duration: `${Math.round(summary.duration / 1000)}s`
    });

    return summary;
  } catch (error) {
    const errorMsg = `Critical error in data ingestion: ${error}`;
    console.error(`[Ingestion] ${errorMsg}`);
    summary.errors.push(errorMsg);
    summary.duration = Date.now() - startTime;
    throw error;
  }
};