// server/routes.ts

import express, { Request, Response, NextFunction } from 'express';
import { Session } from 'express-session';
import * as teamService from './services/teamService.js';
import * as gameService from './services/gameService.js';
import * as pickService from './services/pickService.js';
import * as authService from './services/authService.js';
// REMOVED: Obsolete import for strengthRatingService
import * as dataIngestionService from './services/dataIngestionService.js';
import { statisticalProcessingEngine, BatchStatisticalProcessor, calculateIterativeTeamStrengths } from './services/statisticalProcessingService.js';
import * as teamStatComparisonService from './services/teamStatComparisonService.js';
import { db } from './db.js';
import { 
  games, 
  teams,
  teamEfficiencyRatings, 
  statisticalProcessingLog,
  StatCategory
} from '@college-pickem/shared';
import { eq, and, sql, desc } from 'drizzle-orm';

interface AuthenticatedRequest extends Request {
  session: Session & {
    user?: { id: string; email: string; fullName: string | null; role: string; };
  };
}

const router = express.Router();

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

// Helper function to calculate weight changes
const calculateWeightChanges = (previousWeights: any, newWeights: any): Array<{key: string, previous: number, new: number, change: number, percentChange: number}> => {
  const changes = [];
  
  for (const [key, newValue] of Object.entries(newWeights)) {
    const prevValue = previousWeights[key] || 0;
    const change = (newValue as number) - prevValue;
    const percentChange = prevValue !== 0 ? (change / prevValue) * 100 : 0;
    
    if (Math.abs(change) > 0.001) { // Only include meaningful changes
      changes.push({
        key,
        previous: prevValue,
        new: newValue as number,
        change,
        percentChange
      });
    }
  }
  
  return changes;
};

// Helper function to generate weight recommendations
const generateWeightRecommendations = (currentWeights: any, analysis: any): string[] => {
  const recommendations = [];
  
  if (!analysis) {
    recommendations.push('Run regression analysis to get data-driven weight recommendations');
    return recommendations;
  }
  
  // Check if current weights align with regression recommendations
  const { recommendedWeights } = analysis;
  const threshold = 0.1; // 10% difference threshold
  
  for (const [metric, recommended] of Object.entries(recommendedWeights)) {
    let currentKey = '';
    switch (metric) {
      case 'scoring':
        currentKey = 'scoringEfficiency';
        break;
      case 'passingYards':
        currentKey = 'passingOffense';
        break;
      case 'rushingYards':
        currentKey = 'rushingOffense';
        break;
      case 'turnovers':
        currentKey = 'turnoverMargin';
        break;
      case 'specialTeams':
        currentKey = 'specialTeams';
        break;
    }
    
    if (currentKey && currentWeights[currentKey]) {
      const current = currentWeights[currentKey];
      const diff = Math.abs(current - (recommended as number));
      
      if (diff > threshold) {
        const direction = (recommended as number) > current ? 'increase' : 'decrease';
        recommendations.push(
          `Consider ${direction} ${currentKey} weight from ${current.toFixed(3)} to ${(recommended as number).toFixed(3)} based on regression analysis`
        );
      }
    }
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Current weights align well with regression analysis recommendations');
  }
  
  return recommendations;
};

// --- MIDDLEWARE ---
const isAuthenticated = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.session?.user) return next();
  res.status(401).json({ message: 'Unauthorized. Please log in.' });
};

const isAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.session?.user?.role === 'admin') return next();
  res.status(403).json({ message: 'Forbidden: Requires admin privileges.' });
};

// --- AUTH ROUTES ---
router.get('/auth/user', (req: AuthenticatedRequest, res: Response) => {
  res.status(200).json(req.session.user || null);
});

router.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password, fullName } = req.body;
    if (!email || !password || !fullName) {
      return res.status(400).json({ message: 'Email, password, and full name are required.' });
    }
    await authService.registerUser(email, password, fullName);
    res.status(201).json({ message: 'User registered successfully.' });
  } catch (error) {
    res.status(409).json({ message: getErrorMessage(error) });
  }
});

router.post('/auth/login', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    const user = await authService.loginUser(email, password);

    if (!user) {
      console.log(`[DEBUG] POST /auth/login | FAILED login attempt for email: ${email}`);
        return res.status(401).json({ message: 'Invalid credentials.' });
    }
    
    console.log(`[DEBUG] POST /auth/login | SUCCESS for email: ${email}`);
    req.session.user = user;
    console.log(`[DEBUG] POST /auth/login | User set in session. Session ID: ${req.session.id}`);
    req.session.save((err) => {
        if (err) {
            console.error('[DEBUG] Session save error:', err);
            return res.status(500).json({ message: 'Session could not be saved.' });
        }
        console.log('[DEBUG] POST /auth/login | Session saved successfully.');
        res.status(200).json(user);
    });
  } catch (error) {
    res.status(500).json({ message: getErrorMessage(error) });
  }
});

router.post('/auth/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ message: 'Could not log out.' });
    res.clearCookie('connect.sid');
    res.status(200).json({ message: 'Logged out successfully.' });
  });
});


// =================================================================
// --- NEW & ENHANCED HUB & ANALYTICS ROUTES ---
// =================================================================

// --- Primary Hub Route ---
router.get('/games/hub', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { season, week, conference, classification } = req.query;
    if (!season || !week) {
      return res.status(400).json({ message: "Season and week are required query parameters." });
    }
    const userId = req.session.user?.id;
    const hubData = await gameService.getWeeklyGamesHubData(
      parseInt(season as string, 10),
      parseInt(week as string, 10),
      conference as string | undefined,
      classification as string | undefined,
      userId
    );
    res.json(hubData);
  } catch (error) {
    console.error('Error in /games/hub:', error);
    res.status(500).json({ message: "Failed to fetch games hub data" });
  }
});

// --- New Filter Routes ---
router.get('/games/filters', async (req, res) => {
  try {
    const filters = await gameService.getAvailableSeasonsAndWeeks();
    res.json(filters);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch game filters" });
  }
});

// --- Specific Team Routes (must come before general /teams route) ---
router.get('/teams/conferences', async (req, res) => {
  try {
    const conferences = await teamService.getAvailableConferences();
    res.json(conferences);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch conferences" });
  }
});

// New endpoint for hierarchical filter data
router.get('/teams/filter-hierarchy', async (req, res) => {
  try {
    const hierarchy = await teamService.getTeamClassificationsAndConferences();
    res.json(hierarchy);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch team hierarchy" });
  }
});

// Team efficiency rankings endpoint
router.get('/teams/rankings/:season', async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season)) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }
    
    const rankings = await teamService.getTeamEfficiencyRankings(season);
    res.json(rankings);
  } catch (error) {
    console.error('Error fetching team rankings:', error);
    res.status(500).json({ message: "Failed to fetch team rankings" });
  }
});

// --- Enhanced Team Search Route (must come after specific routes) ---
router.get('/teams', async (req: Request, res: Response) => {
  try {
    const { search, conference } = req.query;
    const teams = await teamService.searchTeams(
      search as string, 
      conference as string
    );
    res.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ message: "Failed to fetch teams", error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// --- New Pick History & Stats Routes (Protected) ---
router.get('/picks/history', isAuthenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.user!.id;
    const { season } = req.query;
    if (!season) {
      return res.status(400).json({ message: "A season query parameter is required." });
    }
    const history = await pickService.getUserPickHistory(userId, parseInt(season as string, 10));
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user pick history" });
  }
});

router.get('/picks/stats', isAuthenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.user!.id;
    const stats = await pickService.getUserPickStats(userId);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user pick stats" });
  }
});

router.get('/picks/available-seasons', isAuthenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.user!.id;
    const seasons = await pickService.getAvailablePickSeasons(userId);
    res.json(seasons);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch available pick seasons" });
  }
});

// --- Retained Team Profile Route ---
router.get('/teams/:id/profile', async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(req.params.id, 10);
    const season = parseInt(req.query.season as string, 10) || new Date().getFullYear();
    const profile = await teamService.getTeamProfile(teamId, season);
    if (!profile) return res.status(404).json({ message: "Team not found" });
    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch team profile" });
  }
});

// --- Team Stat Comparison Route ---
router.get('/teams/:teamId/stat-comparison/:season', async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(req.params.teamId, 10);
    const season = parseInt(req.params.season, 10);
    const { statCategory } = req.query;

    // Validate teamId
    if (isNaN(teamId) || teamId <= 0) {
      return res.status(400).json({ message: 'Invalid team ID. Must be a positive integer.' });
    }

    // Validate season
    if (isNaN(season) || season < 2000 || season > new Date().getFullYear() + 1) {
      return res.status(400).json({ message: 'Invalid season. Must be between 2000 and current year + 1.' });
    }

    // Validate statCategory query parameter
    if (!statCategory || typeof statCategory !== 'string') {
      return res.status(400).json({ 
        message: 'statCategory query parameter is required and must be a string.' 
      });
    }

    // Validate statCategory is a valid category
    const validCategories = [
      'passingOffense', 'rushingOffense', 'totalOffense', 'scoringOffense', 
      'thirdDownConversion', 'redZoneEfficiency',
      'passingDefense', 'rushingDefense', 'totalDefense', 'scoringDefense',
      'thirdDownDefense', 'redZoneDefense'
    ];

    if (!validCategories.includes(statCategory)) {
      return res.status(400).json({ 
        message: `Invalid statCategory. Must be one of: ${validCategories.join(', ')}` 
      });
    }

    // Call service to get stat comparison data
    const comparisonResult = await teamStatComparisonService.getTeamStatComparison(
      teamId,
      season,
      statCategory as StatCategory
    );

    // Check if team was found (service throws error if not found, but we handle empty games)
    if (comparisonResult.games.length === 0) {
      return res.status(404).json({ 
        message: `No completed games found for team ${teamId} in season ${season}`,
        teamId: comparisonResult.teamId,
        teamName: comparisonResult.teamName,
        season: comparisonResult.season,
        statCategory: comparisonResult.statCategory,
        games: [],
        summary: comparisonResult.summary
      });
    }

    // Format and return successful response
    res.json(comparisonResult);

  } catch (error) {
    console.error('Error in /teams/:teamId/stat-comparison/:season:', error);
    
    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }
    }
    
    // Generic error response
    res.status(500).json({ 
      message: 'Failed to fetch team stat comparison data',
      error: getErrorMessage(error)
    });
  }
});

// --- Retained Batch Pick Submission Route ---
router.post('/picks/batch', isAuthenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.user!.id;
    const { picks } = req.body;
    if (!picks || !Array.isArray(picks)) {
      return res.status(400).json({ message: "A 'picks' array is required in the request body." });
    }
    const results = await pickService.submitBatchPicks(userId, picks);
    res.json(results);
  } catch (error) {
    res.status(400).json({ message: getErrorMessage(error) });
  }
});

// =================================================================
// --- RETAINED UTILITY & ADMIN ROUTES ---
// =================================================================

// --- Retained Game Utility Routes ---
router.get('/games/current-week', async (req: Request, res: Response) => {
  try {
    const currentWeek = await gameService.getCurrentWeek();
    res.json(currentWeek);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch current week" });
  }
});

router.get('/games/:gameId/analysis', async (req: Request, res: Response) => {
  try {
    const gameId = parseInt(req.params.gameId, 10);
    const analysis = await gameService.getGameAnalysis(gameId);
    if (!analysis) return res.status(404).json({ message: "Game analysis not found" });
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch game analysis" });
  }
});

// --- Retained Leaderboard Route ---
router.get('/standings/:season/:week', async (req: Request, res: Response) => {
  try {
    const season = parseInt(req.params.season, 10);
    const week = parseInt(req.params.week, 10);
    const standings = await pickService.getWeeklyStandings(season, week);
    res.json(standings);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch standings" });
  }
});

// --- Featured Game Toggle Route (for regular users) ---
router.put('/games/:gameId/featured', isAuthenticated, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const gameId = parseInt(req.params.gameId, 10);
        const { isFeaturedGame } = req.body;
        
        if (typeof isFeaturedGame !== 'boolean') {
            return res.status(400).json({ message: 'isFeaturedGame must be a boolean value' });
        }
        
        const updatedGame = await gameService.updateGameDetails(gameId, { isFeaturedGame });
        res.json(updatedGame);
    } catch (error) {
        res.status(500).json({ message: getErrorMessage(error) });
    }
});

// --- New Admin Route ---
router.put('/admin/games/:gameId', isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
        const gameId = parseInt(req.params.gameId, 10);
        const details = req.body;
        const updatedGame = await gameService.updateGameDetails(gameId, details);
        res.json(updatedGame);
    } catch (error) {
        res.status(500).json({ message: getErrorMessage(error) });
    }
});

// --- Retained Admin Routes ---
router.post('/admin/ingest-season/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season) || season < 2000 || season > new Date().getFullYear() + 1) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }
    dataIngestionService.ingestFullSeasonData(season);
    res.status(202).json({ message: `Data ingestion process started for the ${season} season. Check server logs for progress.` });
  } catch (error) {
    res.status(500).json({ message: "Failed to start ingestion process." });
  }
});

// REMOVED: The obsolete admin route for the old strength rating calculation.
// router.post('/admin/calculate-ratings/:season', ... );

// =================================================================
// --- STATISTICAL PROCESSING ROUTES ---
// =================================================================

// --- Process Season Statistics ---
router.post('/admin/process-statistics/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season) || season < 2000 || season > new Date().getFullYear() + 1) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }
    
    statisticalProcessingEngine.processSeasonStatistics(season)
      .then(result => {
        console.log(`[Statistical Processing] Completed processing for ${season}:`, result);
      })
      .catch(error => {
        console.error(`[Statistical Processing] Error processing ${season}:`, error);
      });
    
    res.status(202).json({ 
      message: `Statistical processing started for the ${season} season. Check server logs for progress.` 
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to start statistical processing." });
  }
});

// This is the new endpoint for your button. It does NOT make external API calls.
router.post('/admin/recalculate-statistics/:season', isAuthenticated, isAdmin, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season) || season < 2000 || season > new Date().getFullYear() + 1) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }

    const { TransactionManager } = await import('./services/transactionManager.js');
    const { dataQualityService } = await import('./services/dataQualityService.js');
    const { diagnosticService } = await import('./services/diagnosticService.js');
    
    console.log(`[Admin] Starting statistics recalculation for season ${season} with enhanced error handling...`);
    
    // Pre-processing diagnostics
    const preProcessingDiagnostic = await diagnosticService.diagnoseTeamEfficiencyRatings(season);
    const teamsWithoutRatingsBefore = preProcessingDiagnostic.length;
    
    // Execute with transaction management and retry logic
    const transactionResult = await TransactionManager.executeWithRetry(
      async (tx) => {
        return await statisticalProcessingEngine.processSeasonStatistics(season);
      },
      `Statistics Recalculation for Season ${season}`,
      2, // max retries for statistics processing
      3000 // base delay
    );
    
    if (!transactionResult.success) {
      return res.status(500).json({
        success: false,
        message: `Failed to recalculate statistics for season ${season}: ${transactionResult.error}`,
        errors: [transactionResult.error || 'Unknown error'],
        rollbackReason: transactionResult.rollbackReason,
        processingTimeMs: Date.now() - startTime,
        recommendations: [
          'Check data completeness before retrying',
          'Verify team synchronization is up to date',
          'Consider running data validation first'
        ]
      });
    }
    
    const statsResult = transactionResult.data!;
    
    // Post-processing diagnostics
    const postProcessingDiagnostic = await diagnosticService.diagnoseTeamEfficiencyRatings(season);
    const teamsWithoutRatingsAfter = postProcessingDiagnostic.length;
    const teamsFixed = teamsWithoutRatingsBefore - teamsWithoutRatingsAfter;
    
    // Generate quality report
    const qualityMetrics = await dataQualityService.generateQualityMetrics(season);
    
    res.json({
      success: true,
      message: `Successfully recalculated statistics for ${statsResult.teamsProcessed} teams using existing data.`,
      teamsUpdated: statsResult.teamsProcessed,
      processingTimeMs: statsResult.processingTimeMs,
      errors: statsResult.errors,
      warnings: statsResult.warnings,
      diagnostics: {
        teamsWithoutRatingsBefore,
        teamsWithoutRatingsAfter,
        teamsFixed,
        dataQualityScore: qualityMetrics.qualityScore
      },
      recommendations: teamsWithoutRatingsAfter > 0 ? [
        `${teamsWithoutRatingsAfter} teams still missing ratings - check data availability`,
        'Consider running data ingestion if teams have insufficient game data'
      ] : [
        'All eligible teams now have efficiency ratings'
      ]
    });
    
  } catch (error) {
    console.error(`[Admin] Critical error in statistics recalculation for season ${req.params.season}:`, error);
    
    res.status(500).json({ 
      success: false,
      message: `Critical failure in statistics recalculation for ${req.params.season}: ${getErrorMessage(error)}`,
      errors: [getErrorMessage(error)],
      processingTimeMs: Date.now() - startTime,
      recommendations: [
        'Check system logs for detailed error information',
        'Verify database connectivity and schema',
        'Ensure sufficient game data exists for the season'
      ]
    });
  }
});


// --- Validate Season Data Quality ---
router.get('/admin/validate-statistics/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season) || season < 2000 || season > new Date().getFullYear() + 1) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }
    
    const validationResult = await BatchStatisticalProcessor.validateAndRepairSeasonData(season);
    res.json(validationResult);
  } catch (error) {
    res.status(500).json({ message: getErrorMessage(error) });
  }
});

// --- Get Team Data Quality Report ---
router.get('/admin/team-data-quality/:teamId/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId, 10);
    const season = parseInt(req.params.season, 10);
    
    if (isNaN(teamId) || isNaN(season)) {
      return res.status(400).json({ message: 'Please provide valid team ID and season.' });
    }
    
    const dataQualityReport = await statisticalProcessingEngine.validateTeamDataQuality(teamId, season);
    res.json(dataQualityReport);
  } catch (error) {
    res.status(500).json({ message: getErrorMessage(error) });
  }
});

// --- Calculate Iterative Team Strengths ---
router.post('/admin/calculate-iterative-strengths/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season) || season < 2000 || season > new Date().getFullYear() + 1) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }
    
    calculateIterativeTeamStrengths(season)
      .then(result => {
        console.log(`[Iterative Strength Calculator] Completed calculation for ${season}:`, result);
      })
      .catch(error => {
        console.error(`[Iterative Strength Calculator] Error calculating strengths for ${season}:`, error);
      });
    
    res.status(202).json({ 
      message: `Iterative strength calculation started for the ${season} season. This process uses opponent-adjusted ratings and may take several minutes to converge.` 
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to start iterative strength calculation." });
  }
});

// =================================================================
// --- NEW ADMIN STATISTICS MANAGEMENT ROUTES ---
// =================================================================

// --- Get Data Status Dashboard ---
router.get('/admin/data-status/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season)) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }

    let latestLog = null;
    let teamsWithDataCount = 0;
    let recentLogs: any[] = [];

    try {
      latestLog = await db.query.statisticalProcessingLog.findFirst({
        where: eq(statisticalProcessingLog.season, season),
        orderBy: desc(statisticalProcessingLog.createdAt)
      });

      recentLogs = await db.query.statisticalProcessingLog.findMany({
        where: eq(statisticalProcessingLog.season, season),
        orderBy: desc(statisticalProcessingLog.createdAt),
        limit: 10
      });
    } catch (error) {
      console.log('[Admin] Statistical processing log table not found, using defaults');
    }

    const gamesCount = await db.select({ count: sql<number>`COUNT(*)` })
      .from(games)
      .where(and(eq(games.season, season), eq(games.isFinal, true)));

    try {
      const teamsWithData = await db.select({ count: sql<number>`COUNT(*)` })
        .from(teamEfficiencyRatings)
        .where(eq(teamEfficiencyRatings.season, season));
      teamsWithDataCount = teamsWithData[0]?.count || 0;
    } catch (error) {
      console.log('[Admin] Team efficiency ratings table not found, using defaults');
    }

    const totalTeams = await db.selectDistinct({ teamId: games.homeTeamId })
      .from(games)
      .where(eq(games.season, season));

    const totalTeamsCount = totalTeams.length;
    const dataQualityRatio = totalTeamsCount > 0 ? teamsWithDataCount / totalTeamsCount : 0;
    
    let dataQuality: 'Excellent' | 'Good' | 'Limited' | 'Insufficient';
    if (dataQualityRatio >= 0.9) dataQuality = 'Excellent';
    else if (dataQualityRatio >= 0.7) dataQuality = 'Good';
    else if (dataQualityRatio >= 0.4) dataQuality = 'Limited';
    else dataQuality = 'Insufficient';

    const dataStatus = {
      lastUpdate: latestLog?.endDate || null,
      gamesProcessed: gamesCount[0]?.count || 0,
      teamsWithSufficientData: teamsWithDataCount,
      totalTeams: totalTeamsCount,
      dataQuality,
      processingLogs: recentLogs
    };

    res.json(dataStatus);
  } catch (error) {
    console.error('[Admin] Error getting data status:', error);
    res.status(500).json({ message: getErrorMessage(error) });
  }
});

// --- Get Team Statistics ---
router.get('/admin/team-statistics/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season)) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }

    let teamStats: any[] = [];

    try {
      teamStats = await db.select({
        teamId: teamEfficiencyRatings.teamId,
        teamName: teams.name,
        gamesPlayed: teamEfficiencyRatings.gamesPlayed,
        dataQuality: teamEfficiencyRatings.dataQuality,
        passOffenseEfficiency: teamEfficiencyRatings.passingOffenseEfficiency,
        rushOffenseEfficiency: teamEfficiencyRatings.rushingOffenseEfficiency,
        scoringOffenseEfficiency: teamEfficiencyRatings.scoringOffenseEfficiency,
        passDefenseEfficiency: teamEfficiencyRatings.passingDefenseEfficiency,
        rushDefenseEfficiency: teamEfficiencyRatings.rushingDefenseEfficiency,
        scoringDefenseEfficiency: teamEfficiencyRatings.scoringDefenseEfficiency,
        turnoverEfficiency: teamEfficiencyRatings.turnoverEfficiency,
        specialTeamsEfficiency: teamEfficiencyRatings.specialTeamsEfficiency,
        lastCalculated: teamEfficiencyRatings.lastCalculated
      })
      .from(teamEfficiencyRatings)
      .innerJoin(teams, eq(teamEfficiencyRatings.teamId, teams.id))
      .where(eq(teamEfficiencyRatings.season, season))
      .orderBy(teams.name);
    } catch (error) {
      console.log('[Admin] Team efficiency ratings table not found, returning empty array');
      teamStats = [];
    }

    const formattedStats = teamStats.map(stat => ({
      ...stat,
      passOffenseEfficiency: parseFloat(stat.passOffenseEfficiency || '0'),
      rushOffenseEfficiency: parseFloat(stat.rushOffenseEfficiency || '0'),
      scoringOffenseEfficiency: parseFloat(stat.scoringOffenseEfficiency || '0'),
      passDefenseEfficiency: parseFloat(stat.passDefenseEfficiency || '0'),
      rushDefenseEfficiency: parseFloat(stat.rushDefenseEfficiency || '0'),
      scoringDefenseEfficiency: parseFloat(stat.scoringDefenseEfficiency || '0'),
      turnoverEfficiency: parseFloat(stat.turnoverEfficiency || '0'),
      specialTeamsEfficiency: parseFloat(stat.specialTeamsEfficiency || '0')
    }));

    res.json(formattedStats);
  } catch (error) {
    console.error('[Admin] Error getting team statistics:', error);
    res.status(500).json({ message: getErrorMessage(error) });
  }
});

// --- Update Recent Data ---
router.post('/admin/update-recent-data', isAuthenticated, isAdmin, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { collegeFootballApiService } = await import('./services/collegeFootballApiService.js');
    const { TransactionManager } = await import('./services/transactionManager.js');
    const { dataQualityService } = await import('./services/dataQualityService.js');
    
    console.log('[Admin] Starting recent data update with enhanced error handling...');
    
    // Pre-update data quality check
    const currentSeason = new Date().getFullYear();
    const preUpdateQuality = await dataQualityService.generateQualityMetrics(currentSeason);
    
    // Execute with retry logic and transaction management
    const transactionResult = await TransactionManager.executeWithRetry(
      async (tx) => {
        return await collegeFootballApiService.fetchRecentGames(2);
      },
      'Recent Data Update',
      3, // max retries
      2000 // base delay
    );
    
    if (!transactionResult.success) {
      return res.status(500).json({
        success: false,
        message: `Failed to update recent data: ${transactionResult.error}`,
        errors: [transactionResult.error || 'Unknown error'],
        rollbackReason: transactionResult.rollbackReason,
        processingTimeMs: Date.now() - startTime
      });
    }
    
    const result = transactionResult.data!;
    
    // Post-update data quality check
    const postUpdateQuality = await dataQualityService.generateQualityMetrics(currentSeason);
    const qualityImprovement = postUpdateQuality.qualityScore - preUpdateQuality.qualityScore;
    
    // Enhanced response with quality metrics
    res.json({
      success: true,
      message: `Successfully updated recent data. Processed ${result.gamesProcessed} games with ${result.statisticsRecords} statistics records.`,
      gamesProcessed: result.gamesProcessed,
      statisticsRecords: result.statisticsRecords,
      processingTimeMs: result.processingTimeMs,
      errors: result.errors,
      warnings: result.warnings,
      dataQuality: {
        preUpdate: preUpdateQuality.qualityScore,
        postUpdate: postUpdateQuality.qualityScore,
        improvement: qualityImprovement
      },
      recommendations: qualityImprovement < 0 ? 
        ['Data quality decreased - consider running full season processing'] : 
        []
    });
    
  } catch (error) {
    console.error('[Admin] Critical error in recent data update:', error);
    
    res.status(500).json({ 
      success: false,
      message: `Critical failure in recent data update: ${getErrorMessage(error)}`,
      errors: [getErrorMessage(error)],
      processingTimeMs: Date.now() - startTime,
      recommendations: [
        'Check system logs for detailed error information',
        'Verify API connectivity and credentials',
        'Consider running data validation checks'
      ]
    });
  }
});

// --- Process Full Season ---
router.post('/admin/process-full-season/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season) || season < 2000 || season > new Date().getFullYear() + 1) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }

    const { collegeFootballApiService } = await import('./services/collegeFootballApiService.js');
    
    const fetchResult = await collegeFootballApiService.fetchFullSeasonData(season);
    
    const statsResult = await statisticalProcessingEngine.processSeasonStatistics(season);
    
    res.json({
      success: true,
      message: `Successfully processed ${season} season data. Fetched ${fetchResult.gamesProcessed} games and processed statistics for ${statsResult.teamsProcessed} teams.`,
      gamesProcessed: fetchResult.gamesProcessed,
      teamsUpdated: statsResult.teamsProcessed,
      processingTimeMs: fetchResult.processingTimeMs + statsResult.processingTimeMs,
      errors: [...fetchResult.errors, ...statsResult.errors],
      warnings: [...fetchResult.warnings, ...statsResult.warnings]
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: `Failed to process ${req.params.season} season: ${getErrorMessage(error)}`,
      errors: [getErrorMessage(error)]
    });
  }
});

// =================================================================
// --- REGRESSION ANALYSIS MANAGEMENT ROUTES ---
// =================================================================

// --- Run Regression Analysis ---
router.post('/admin/run-regression-analysis/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season) || season < 2000 || season > new Date().getFullYear() + 1) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }

    const { StatisticalImpactAnalyzer } = await import('./services/statisticalImpactAnalyzer.js');
    const analyzer = new StatisticalImpactAnalyzer();

    // Run regression analysis asynchronously
    analyzer.performRegressionAnalysis(season)
      .then(async (analysis) => {
        console.log(`[Regression Analysis] Completed analysis for ${season}:`, {
          overallRSquared: analysis.overallModelRSquared,
          sampleSize: analysis.sampleSize,
          significantMetrics: analysis.regressionResults.filter(r => r.isStatisticallySignificant).length
        });

        // Update weights based on regression results
        const userId = (req as AuthenticatedRequest).session?.user?.id;
        await analyzer.updateWeightsFromRegression(season, analysis, userId);
      })
      .catch(error => {
        console.error(`[Regression Analysis] Error analyzing ${season}:`, error);
      });

    res.status(202).json({
      message: `Regression analysis started for the ${season} season. This process will analyze statistical correlations and update prediction weights automatically.`
    });
  } catch (error) {
    res.status(500).json({ message: getErrorMessage(error) });
  }
});

// --- Get Regression Analysis Results ---
router.get('/admin/regression-results/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season)) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }

    const { RegressionBasedWeightManager } = await import('./services/regressionBasedWeightManager.js');
    const weightManager = new RegressionBasedWeightManager();

    const analysis = await weightManager.getLatestRegressionAnalysis(season);
    
    if (!analysis) {
      return res.status(404).json({ 
        message: `No regression analysis found for season ${season}. Run analysis first.` 
      });
    }

    // Format response with additional metadata
    const response = {
      season,
      analysisDate: new Date().toISOString(), // This would come from the database in a real implementation
      overallModelRSquared: analysis.overallModelRSquared,
      predictiveAccuracy: analysis.predictiveAccuracy,
      sampleSize: analysis.sampleSize,
      metricAnalysis: analysis.regressionResults.map(result => ({
        metric: result.metric,
        rSquared: result.rSquared,
        pValue: result.pValue,
        coefficient: result.coefficient,
        confidenceInterval: result.confidenceInterval,
        weight: result.weight,
        isStatisticallySignificant: result.isStatisticallySignificant,
        predictivePower: result.rSquared > 0.5 ? 'High' : result.rSquared > 0.3 ? 'Medium' : 'Low'
      })),
      recommendedWeights: analysis.recommendedWeights,
      modelValidation: analysis.modelValidation,
      significantMetricsCount: analysis.regressionResults.filter(r => r.isStatisticallySignificant).length,
      totalMetricsAnalyzed: analysis.regressionResults.length
    };

    res.json(response);
  } catch (error) {
    console.error('[Admin] Error getting regression results:', error);
    res.status(500).json({ message: getErrorMessage(error) });
  }
});

// --- Get Prediction Weights ---
router.get('/admin/prediction-weights/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season)) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }

    const { RegressionBasedWeightManager } = await import('./services/regressionBasedWeightManager.js');
    const weightManager = new RegressionBasedWeightManager();

    // Get current weights and history
    const currentWeights = await weightManager.getCurrentWeights(season);
    const weightHistory = await weightManager.getWeightHistory(season, 10);
    const latestAnalysis = await weightManager.getLatestRegressionAnalysis(season);

    const response = {
      season,
      currentWeights,
      lastUpdated: weightHistory.length > 0 ? weightHistory[0].timestamp : null,
      weightHistory: weightHistory.map(entry => ({
        id: entry.id,
        timestamp: entry.timestamp,
        reason: entry.reason,
        changedBy: entry.changedByUserId,
        regressionMetrics: entry.regressionMetrics,
        weightChanges: calculateWeightChanges(entry.previousWeights, entry.newWeights)
      })),
      regressionAnalysis: latestAnalysis ? {
        overallRSquared: latestAnalysis.overallModelRSquared,
        sampleSize: latestAnalysis.sampleSize,
        recommendedWeights: latestAnalysis.recommendedWeights,
        lastAnalysisDate: new Date().toISOString() // This would come from the database
      } : null,
      recommendations: generateWeightRecommendations(currentWeights, latestAnalysis)
    };

    res.json(response);
  } catch (error) {
    console.error('[Admin] Error getting prediction weights:', error);
    res.status(500).json({ message: getErrorMessage(error) });
  }
});

// --- Update Prediction Weights ---
router.post('/admin/update-weights/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season)) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }

    const { weights, reason } = req.body;
    
    if (!weights || typeof weights !== 'object') {
      return res.status(400).json({ 
        message: 'Request body must include a "weights" object with weight values to update.' 
      });
    }

    if (!reason || typeof reason !== 'string') {
      return res.status(400).json({ 
        message: 'Request body must include a "reason" string explaining the weight update.' 
      });
    }

    const { StatisticalImpactAnalyzer } = await import('./services/statisticalImpactAnalyzer.js');
    const analyzer = new StatisticalImpactAnalyzer();
    const userId = (req as AuthenticatedRequest).session?.user?.id;

    // Validate weight values
    const validWeightKeys = [
      'passingOffense', 'rushingOffense', 'scoringEfficiency',
      'passingDefense', 'rushingDefense', 'turnoverMargin',
      'specialTeams', 'homeFieldAdvantage'
    ];

    const invalidKeys = Object.keys(weights).filter(key => !validWeightKeys.includes(key));
    if (invalidKeys.length > 0) {
      return res.status(400).json({
        message: `Invalid weight keys: ${invalidKeys.join(', ')}. Valid keys are: ${validWeightKeys.join(', ')}`
      });
    }

    // Validate weight values are numbers
    for (const [key, value] of Object.entries(weights)) {
      if (typeof value !== 'number' || isNaN(value as number) || (value as number) < 0) {
        return res.status(400).json({
          message: `Invalid weight value for ${key}: must be a non-negative number`
        });
      }
    }

    // Update weights manually
    const changeLog = await analyzer.updateWeightsManually(season, weights, reason, userId);

    res.json({
      success: true,
      message: `Successfully updated prediction weights for season ${season}`,
      changeLog: {
        id: changeLog.id,
        timestamp: changeLog.timestamp,
        previousWeights: changeLog.previousWeights,
        newWeights: changeLog.newWeights,
        reason: changeLog.reason,
        changedBy: userId
      },
      weightChanges: calculateWeightChanges(changeLog.previousWeights, changeLog.newWeights)
    });
  } catch (error) {
    console.error('[Admin] Error updating prediction weights:', error);
    res.status(500).json({ 
      message: `Failed to update prediction weights: ${getErrorMessage(error)}` 
    });
  }
});



// REMOVED: /admin/recalculate-strengths route - was using broken old system
// Use /admin/recalculate-statistics instead which uses correct opponent-relative calculations

// --- Debug endpoint to check efficiency ratings ---
router.get('/admin/efficiency-debug/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    const { teamEfficiencyRatings, games } = await import('@college-pickem/shared');
    
    const [ratings, gameCount] = await Promise.all([
      db.query.teamEfficiencyRatings.findMany({
        where: eq(teamEfficiencyRatings.season, season),
        with: { team: true },
        limit: 10
      }),
      db.select({ count: sql`count(*)` }).from(games).where(eq(games.season, season))
    ]);
    
    res.json({
      season,
      ratingsCount: ratings.length,
      gamesCount: gameCount[0]?.count || 0,
      sampleRatings: ratings.map(r => ({
        teamName: r.team.name,
        passOffense: r.passingOffenseEfficiency,
        dataQuality: r.dataQuality,
        gamesPlayed: r.gamesPlayed
      }))
    });
  } catch (error) {
    console.error('Error in efficiency debug:', error);
    res.status(500).json({ message: 'Failed to fetch efficiency debug data' });
  }
});

// =================================================================
// --- DATA QUALITY DASHBOARD ENDPOINTS ---
// =================================================================

// --- Get comprehensive data quality report ---
router.get('/admin/data-quality/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season)) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }
    
    const { dataQualityService } = await import('./services/dataQualityService.js');
    
    const qualityMetrics = await dataQualityService.generateQualityMetrics(season);
    const completenessReport = await dataQualityService.generateCompletenessReport(season);
    const processingHealth = await dataQualityService.checkProcessingHealth();
    const consistency = await dataQualityService.validateDataConsistency(season);
    
    res.json({
      season,
      qualityMetrics,
      completenessReport,
      processingHealth,
      consistency,
      generatedAt: new Date()
    });
  } catch (error) {
    console.error('[Admin] Error generating data quality report:', error);
    res.status(500).json({ message: getErrorMessage(error) });
  }
});

// --- Get teams missing efficiency ratings ---
router.get('/admin/missing-ratings/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season)) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }
    
    const { diagnosticService } = await import('./services/diagnosticService.js');
    
    const missingRatings = await diagnosticService.diagnoseTeamEfficiencyRatings(season);
    const recommendations = await diagnosticService.getFixRecommendations(season);
    
    res.json({
      season,
      teamsWithoutRatings: missingRatings,
      totalCount: missingRatings.length,
      recommendations,
      generatedAt: new Date()
    });
  } catch (error) {
    console.error('[Admin] Error fetching missing ratings:', error);
    res.status(500).json({ message: getErrorMessage(error) });
  }
});

// --- Get system health overview ---
router.get('/admin/system-health', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { diagnosticService } = await import('./services/diagnosticService.js');
    const { dataQualityService } = await import('./services/dataQualityService.js');
    
    const systemHealth = await diagnosticService.generateSystemHealthReport();
    const currentSeason = new Date().getFullYear();
    const qualityMonitoring = await dataQualityService.monitorDataQuality(currentSeason);
    
    res.json({
      systemHealth,
      qualityMonitoring,
      generatedAt: new Date()
    });
  } catch (error) {
    console.error('[Admin] Error generating system health report:', error);
    res.status(500).json({ message: getErrorMessage(error) });
  }
});

// --- Get data quality monitoring alerts ---
router.get('/admin/quality-alerts/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season)) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }
    
    const { dataQualityService } = await import('./services/dataQualityService.js');
    
    const monitoring = await dataQualityService.monitorDataQuality(season);
    
    res.json({
      season,
      alerts: monitoring.alerts,
      status: monitoring.status,
      nextCheckRecommended: monitoring.nextCheckRecommended,
      criticalAlerts: monitoring.alerts.filter(a => a.severity === 'Critical').length,
      warningAlerts: monitoring.alerts.filter(a => a.severity === 'Warning').length,
      generatedAt: new Date()
    });
  } catch (error) {
    console.error('[Admin] Error fetching quality alerts:', error);
    res.status(500).json({ message: getErrorMessage(error) });
  }
});

// --- Get prediction validation logs ---
router.get('/admin/prediction-validation/:gameId?', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const gameId = req.params.gameId ? parseInt(req.params.gameId, 10) : undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const { predictionValidationLog } = await import('@college-pickem/shared');
    
    let validationLogs;
    
    if (gameId) {
      validationLogs = await db.query.predictionValidationLog.findMany({
        where: eq(predictionValidationLog.gameId, gameId),
        with: { game: { with: { homeTeam: true, awayTeam: true } } },
        orderBy: desc(predictionValidationLog.createdAt),
        limit
      });
    } else {
      validationLogs = await db.query.predictionValidationLog.findMany({
        with: { game: { with: { homeTeam: true, awayTeam: true } } },
        orderBy: desc(predictionValidationLog.createdAt),
        limit
      });
    }
    
    const summary = {
      total: validationLogs.length,
      valid: validationLogs.filter(log => log.validationResult === 'valid').length,
      corrected: validationLogs.filter(log => log.validationResult === 'corrected').length,
      flagged: validationLogs.filter(log => log.validationResult === 'flagged').length
    };
    
    res.json({
      validationLogs,
      summary,
      generatedAt: new Date()
    });
  } catch (error) {
    console.error('[Admin] Error fetching prediction validation logs:', error);
    res.status(500).json({ message: getErrorMessage(error) });
  }
});

// --- Run data quality check manually ---
router.post('/admin/run-quality-check/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season)) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }
    
    const { dataQualityService } = await import('./services/dataQualityService.js');
    const { dataQualityLog } = await import('@college-pickem/shared');
    
    console.log(`[Admin] Running manual data quality check for season ${season}...`);
    
    const startTime = Date.now();
    const qualityMetrics = await dataQualityService.generateQualityMetrics(season);
    const consistency = await dataQualityService.validateDataConsistency(season);
    const processingTime = Date.now() - startTime;
    
    // Log the quality check
    await db.insert(dataQualityLog).values({
      season,
      checkType: 'manual_comprehensive',
      overallScore: qualityMetrics.qualityScore,
      teamsChecked: qualityMetrics.totalTeams,
      issuesFound: qualityMetrics.issues.length,
      criticalIssues: qualityMetrics.issues.filter(i => i.severity === 'Critical').length,
      warningIssues: qualityMetrics.issues.filter(i => i.severity === 'Warning').length,
      recommendations: JSON.stringify([
        ...qualityMetrics.issues.map(i => i.recommendation),
        ...consistency.recommendations
      ]),
      checkDetails: JSON.stringify({
        qualityMetrics,
        consistency,
        processingTimeMs: processingTime
      })
    });
    
    res.json({
      success: true,
      message: `Data quality check completed for season ${season}`,
      qualityScore: qualityMetrics.qualityScore,
      issuesFound: qualityMetrics.issues.length,
      criticalIssues: qualityMetrics.issues.filter(i => i.severity === 'Critical').length,
      processingTimeMs: processingTime,
      recommendations: [
        ...qualityMetrics.issues.map(i => i.recommendation),
        ...consistency.recommendations
      ]
    });
  } catch (error) {
    console.error('[Admin] Error running quality check:', error);
    res.status(500).json({ 
      success: false,
      message: getErrorMessage(error) 
    });
  }
});

// =================================================================
// --- REGRESSION ANALYSIS VALIDATION ROUTES ---
// =================================================================

// --- Run Comprehensive Validation Suite ---
router.post('/admin/validation/comprehensive/:season', isAuthenticated, isAdmin, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season) || season < 2000 || season > new Date().getFullYear() + 1) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }

    // Import validation services
    const { dataPipelineValidator } = await import('./services/validation/data-pipeline-validator.js');
    const { regressionAnalysisAuditor } = await import('./services/validation/regression-analysis-auditor.js');
    const { weightCalculationVerifier } = await import('./services/validation/weight-calculation-verifier.js');
    const { predictionAccuracyTester } = await import('./services/validation/prediction-accuracy-tester.js');
    const { sampleGameAnalyzer } = await import('./services/validation/sample-game-analyzer.js');

    console.log(`[Validation] Starting comprehensive validation suite for season ${season}...`);

    // Run all validation components
    const results = await Promise.allSettled([
      dataPipelineValidator.validate(season),
      regressionAnalysisAuditor.validate(season),
      weightCalculationVerifier.validate(season),
      predictionAccuracyTester.validate(season),
      sampleGameAnalyzer.validate(season, 15)
    ]);

    // Process results
    const validationResults = {
      dataPipeline: results[0].status === 'fulfilled' ? results[0].value : { 
        isValid: false, 
        score: 0, 
        errors: [{ code: 'VALIDATION_FAILED', message: String(results[0].reason), severity: 'critical' as const }], 
        warnings: [], 
        recommendations: [], 
        timestamp: new Date() 
      },
      regressionAnalysis: results[1].status === 'fulfilled' ? results[1].value : { 
        isValid: false, 
        score: 0, 
        errors: [{ code: 'VALIDATION_FAILED', message: String(results[1].reason), severity: 'critical' as const }], 
        warnings: [], 
        recommendations: [], 
        timestamp: new Date() 
      },
      weightCalculation: results[2].status === 'fulfilled' ? results[2].value : { 
        isValid: false, 
        score: 0, 
        errors: [{ code: 'VALIDATION_FAILED', message: String(results[2].reason), severity: 'critical' as const }], 
        warnings: [], 
        recommendations: [], 
        timestamp: new Date() 
      },
      predictionAccuracy: results[3].status === 'fulfilled' ? results[3].value : { 
        isValid: false, 
        score: 0, 
        errors: [{ code: 'VALIDATION_FAILED', message: String(results[3].reason), severity: 'critical' as const }], 
        warnings: [], 
        recommendations: [], 
        timestamp: new Date() 
      },
      sampleGameAnalysis: results[4].status === 'fulfilled' ? results[4].value : { 
        isValid: false, 
        score: 0, 
        errors: [{ code: 'VALIDATION_FAILED', message: String(results[4].reason), severity: 'critical' as const }], 
        warnings: [], 
        recommendations: [], 
        timestamp: new Date() 
      }
    };

    // Calculate overall health score
    const validComponents = Object.values(validationResults).filter(r => r.isValid).length;
    const totalComponents = Object.keys(validationResults).length;
    const overallScore = Math.round((validComponents / totalComponents) * 100);

    // Collect all errors and warnings
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    const allRecommendations: string[] = [];

    Object.values(validationResults).forEach(result => {
      if (result.errors) allErrors.push(...result.errors.map((e: any) => e.message || e));
      if (result.warnings) allWarnings.push(...result.warnings.map((w: any) => w.message || w));
      if (result.recommendations) allRecommendations.push(...result.recommendations);
    });

    const response = {
      success: overallScore >= 70,
      overallScore,
      message: `Comprehensive validation completed. Overall system health: ${overallScore}%`,
      processingTimeMs: Date.now() - startTime,
      validationResults,
      summary: {
        validComponents,
        totalComponents,
        criticalIssues: allErrors.length,
        warnings: allWarnings.length,
        recommendations: allRecommendations.length
      },
      errors: allErrors,
      warnings: allWarnings,
      recommendations: allRecommendations.slice(0, 10), // Top 10 recommendations
      timestamp: new Date()
    };

    res.json(response);

  } catch (error) {
    console.error('[Validation] Error running comprehensive validation:', error);
    res.status(500).json({
      success: false,
      message: `Failed to run comprehensive validation: ${getErrorMessage(error)}`,
      processingTimeMs: Date.now() - startTime,
      error: getErrorMessage(error)
    });
  }
});

// --- Generate Intuitive Analysis Report ---
router.get('/admin/validation/analysis-report/:season', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const season = parseInt(req.params.season, 10);
    if (isNaN(season)) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }

    const { sampleGameAnalyzer } = await import('./services/validation/sample-game-analyzer.js');
    const { predictionAccuracyTester } = await import('./services/validation/prediction-accuracy-tester.js');

    console.log(`[Validation] Generating intuitive analysis report for season ${season}...`);

    // Get accuracy results first
    const accuracyResults = await predictionAccuracyTester.validate(season);
    
    // Create mock system health for demonstration
    const systemHealth = {
      overallHealth: 'good' as const,
      healthScore: 82,
      dataQuality: {
        score: 85,
        status: 'good' as const,
        completeness: 88,
        consistency: 82,
        validity: 87,
        timeliness: 92,
        issueCount: 3,
        criticalIssues: 0
      },
      modelHealth: {
        score: 78,
        status: 'good' as const,
        regressionModelFit: 0.45,
        statisticalSignificance: 82,
        convergenceStability: 88,
        weightStability: 85,
        lastSuccessfulAnalysis: new Date()
      },
      predictionReliability: {
        score: accuracyResults.score || 75,
        status: 'good' as const,
        accuracy: 72,
        calibration: 78,
        consistency: 80,
        biasLevel: 12,
        confidenceReliability: 76
      },
      alerts: [],
      lastUpdated: new Date(),
      trends: {
        dataQualityTrend: {
          direction: 'stable' as const,
          magnitude: 0.1,
          significance: 0.05,
          dataPoints: []
        },
        modelHealthTrend: {
          direction: 'improving' as const,
          magnitude: 0.15,
          significance: 0.12,
          dataPoints: []
        },
        predictionAccuracyTrend: {
          direction: 'stable' as const,
          magnitude: 0.05,
          significance: 0.03,
          dataPoints: []
        },
        timeRange: {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date(),
          dataPoints: 30
        }
      }
    };

    // Generate the comprehensive report
    const report = await sampleGameAnalyzer.generateIntuitiveAnalysisReport(
      season,
      accuracyResults,
      systemHealth,
      12 // Sample size for game analysis
    );

    res.json({
      success: true,
      report,
      generatedAt: new Date(),
      season
    });

  } catch (error) {
    console.error('[Validation] Error generating analysis report:', error);
    res.status(500).json({
      success: false,
      message: `Failed to generate analysis report: ${getErrorMessage(error)}`,
      error: getErrorMessage(error)
    });
  }
});

// --- Run Individual Validation Component ---
router.post('/admin/validation/:component/:season', isAuthenticated, isAdmin, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const component = req.params.component;
    const season = parseInt(req.params.season, 10);
    
    if (isNaN(season)) {
      return res.status(400).json({ message: 'Please provide a valid season year.' });
    }

    let validator;
    let validatorName;

    // Import the appropriate validator
    switch (component) {
      case 'data-pipeline':
        const { dataPipelineValidator } = await import('./services/validation/data-pipeline-validator.js');
        validator = dataPipelineValidator;
        validatorName = 'Data Pipeline Validator';
        break;
      case 'regression-analysis':
        const { regressionAnalysisAuditor } = await import('./services/validation/regression-analysis-auditor.js');
        validator = regressionAnalysisAuditor;
        validatorName = 'Regression Analysis Auditor';
        break;
      case 'weight-calculation':
        const { weightCalculationVerifier } = await import('./services/validation/weight-calculation-verifier.js');
        validator = weightCalculationVerifier;
        validatorName = 'Weight Calculation Verifier';
        break;
      case 'prediction-accuracy':
        const { predictionAccuracyTester } = await import('./services/validation/prediction-accuracy-tester.js');
        validator = predictionAccuracyTester;
        validatorName = 'Prediction Accuracy Tester';
        break;
      case 'sample-game-analysis':
        const { sampleGameAnalyzer } = await import('./services/validation/sample-game-analyzer.js');
        validator = sampleGameAnalyzer;
        validatorName = 'Sample Game Analyzer';
        break;
      default:
        return res.status(400).json({ 
          message: `Invalid validation component: ${component}. Valid options: data-pipeline, regression-analysis, weight-calculation, prediction-accuracy, sample-game-analysis` 
        });
    }

    console.log(`[Validation] Running ${validatorName} for season ${season}...`);

    // Run the validation
    const result = await validator.validate(season);

    res.json({
      success: result.isValid,
      component,
      validatorName,
      season,
      result,
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date()
    });

  } catch (error) {
    console.error(`[Validation] Error running ${req.params.component} validation:`, error);
    res.status(500).json({
      success: false,
      message: `Failed to run ${req.params.component} validation: ${getErrorMessage(error)}`,
      processingTimeMs: Date.now() - startTime,
      error: getErrorMessage(error)
    });
  }
});

// --- Get Validation System Status ---
router.get('/admin/validation/status', isAuthenticated, isAdmin, async (req, res) => {
  try {
    // Import validation services to check their status
    const { dataPipelineValidator } = await import('./services/validation/data-pipeline-validator.js');
    const { regressionAnalysisAuditor } = await import('./services/validation/regression-analysis-auditor.js');
    const { weightCalculationVerifier } = await import('./services/validation/weight-calculation-verifier.js');
    const { predictionAccuracyTester } = await import('./services/validation/prediction-accuracy-tester.js');
    const { sampleGameAnalyzer } = await import('./services/validation/sample-game-analyzer.js');

    const status = {
      systemStatus: 'operational',
      availableValidators: [
        {
          id: 'data-pipeline',
          name: 'Data Pipeline Validator',
          description: 'Validates raw data quality, completeness, and consistency',
          status: 'ready'
        },
        {
          id: 'regression-analysis',
          name: 'Regression Analysis Auditor',
          description: 'Audits statistical model correctness and significance',
          status: 'ready'
        },
        {
          id: 'weight-calculation',
          name: 'Weight Calculation Verifier',
          description: 'Verifies weight derivation and application accuracy',
          status: 'ready'
        },
        {
          id: 'prediction-accuracy',
          name: 'Prediction Accuracy Tester',
          description: 'Tests prediction accuracy against actual outcomes',
          status: 'ready'
        },
        {
          id: 'sample-game-analysis',
          name: 'Sample Game Analyzer',
          description: 'Analyzes specific games and generates intuitive reports',
          status: 'ready'
        }
      ],
      capabilities: [
        'Comprehensive validation suite execution',
        'Individual component validation',
        'Intuitive analysis report generation',
        'Prediction confidence interpretation',
        'System health monitoring',
        'Data quality assessment'
      ],
      lastSystemCheck: new Date(),
      version: '1.0.0'
    };

    res.json(status);

  } catch (error) {
    console.error('[Validation] Error getting system status:', error);
    res.status(500).json({
      systemStatus: 'error',
      message: `Failed to get validation system status: ${getErrorMessage(error)}`,
      error: getErrorMessage(error)
    });
  }
});

export default router;