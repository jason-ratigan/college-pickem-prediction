// shared/schema.ts

import { relations } from 'drizzle-orm';
import {
  index,
  pgTable,
  timestamp,
  varchar,
  integer,
  boolean,
  decimal,
  text,
  serial,
  uuid,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// =============================================================================
// ENUMS & CORE TABLES
// =============================================================================

export const userRoleEnum = pgEnum('user_role_enum', ['player', 'admin']);
export const seasonTypeEnum = pgEnum('season_type_enum', ['regular', 'postseason']);
export const postseasonTypeEnum = pgEnum('postseason_type_enum', ['bowl', 'playoff', 'championship']);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: varchar("full_name", { length: 100 }),
  email: varchar("email", { length: 255 }).unique().notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull().default('player'),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  apiTeamId: integer("api_team_id").unique(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  conference: varchar("conference", { length: 100 }),
  logoUrl: text("logo_url"),
  classification: varchar('classification', { length: 10 }),
  dataQuality: varchar("data_quality", { length: 20 }).default('Unknown'), // "Excellent", "Good", "Limited", "Insufficient", "Unknown"
  lastSynced: timestamp("last_synced", { withTimezone: true }),
  syncErrors: integer("sync_errors").default(0),
  conflictResolutionNotes: text("conflict_resolution_notes"),
});

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  apiGameId: integer("api_game_id").unique(),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  seasonType: seasonTypeEnum("season_type").notNull().default('regular'),
  postseasonType: postseasonTypeEnum("postseason_type"),
  gameTime: timestamp("game_time", { withTimezone: true }),
  homeTeamId: integer("home_team_id").notNull().references(() => teams.id),
  awayTeamId: integer("away_team_id").notNull().references(() => teams.id),
  homeTeamScore: integer("home_team_score"),
  awayTeamScore: integer("away_team_score"),
  spread: decimal("spread", { precision: 4, scale: 1 }),
  overUnder: decimal("over_under", { precision: 4, scale: 1 }),
  isFinal: boolean("is_final").default(false),
  isFeaturedGame: boolean("is_featured_game").default(false),
}, (table) => ({
  seasonWeekIdx: index("games_season_week_idx").on(table.season, table.week),
  seasonTypeIdx: index("games_season_type_idx").on(table.seasonType),
}));

export const picks = pgTable("picks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  gameId: integer("game_id").notNull().references(() => games.id),
  pickedTeamId: integer("picked_team_id").references(() => teams.id),
  isCorrect: boolean("is_correct"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  pickedAgainstSpread: varchar('picked_against_spread', { 
    length: 4, 
    enum: ['home', 'away'] 
  }),
}, (table) => ({
  userGameUnique: uniqueIndex("picks_user_game_unique_idx").on(table.userId, table.gameId),
}));

// =============================================================================
// EXPANDED ANALYTICS TABLES
// =============================================================================

export const gameBoxScoreStats = pgTable("game_box_score_stats", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => games.id),
  teamId: integer("team_id").notNull().references(() => teams.id),

  // === Traditional Offensive Stats ===
  completionAttempts: varchar("completion_attempts", { length: 15 }), // e.g., "17-25"
  netPassingYards: integer("net_passing_yards"),
  passingTDs: integer("passing_tds"),
  rushingYards: integer("rushing_yards"),
  rushingAttempts: integer("rushing_attempts"),
  rushingTDs: integer("rushing_tds"),
  totalYards: integer("total_yards"),
  firstDowns: integer("first_downs"),
  turnovers: integer("turnovers"),
  fumblesLost: integer("fumbles_lost"),
  interceptionsThrown: integer("interceptions_thrown"),
  possessionTime: varchar("possession_time", { length: 15 }), // e.g., "31:45"
  
  // === Traditional Defensive Stats ===
  sacks: decimal("sacks", { precision: 4, scale: 1 }),
  tacklesForLoss: decimal("tackles_for_loss", { precision: 4, scale: 1 }),
  fumblesRecovered: integer("fumbles_recovered"),
  interceptions: integer("interceptions"),
  passesDeflected: integer("passes_deflected"),
  qbHurries: integer("qb_hurries"),
  defensiveTDs: integer("defensive_tds"),

  // === Traditional Special Teams Stats ===
  kickReturnYards: integer("kick_return_yards"),
  puntReturnYards: integer("punt_return_yards"),
  
  // === Other Traditional Stats ===
  thirdDownEff: varchar("third_down_eff", { length: 15 }), // e.g., "4-12"
  fourthDownEff: varchar("fourth_down_eff", { length: 15 }), // e.g., "1-2"
  totalPenaltiesYards: varchar("total_penalties_yards", { length: 15 }), // e.g., "5-50"

  // === Additional Required Fields for Statistical Analysis ===
  redZoneAttempts: integer("red_zone_attempts"),
  redZoneScores: integer("red_zone_scores"),
  fieldGoalAttempts: integer("field_goal_attempts"),
  fieldGoalsMade: integer("field_goals_made"),
  puntReturnTDs: integer("punt_return_tds"),
  kickReturnTDs: integer("kick_return_tds"),
  timeOfPossessionSeconds: integer("time_of_possession_seconds"),

  // === Advanced Offensive Stats (/stats/game/advanced) ===
  off_plays: integer("off_plays"),
  off_drives: integer("off_drives"),
  off_ppa: decimal("off_ppa"),
  off_success_rate: decimal("off_success_rate"),
  off_explosiveness: decimal("off_explosiveness"),
  off_power_success: decimal("off_power_success"),
  off_stuff_rate: decimal("off_stuff_rate"),
  off_line_yards: decimal("off_line_yards"),
  off_second_level_yards: decimal("off_second_level_yards"),
  off_open_field_yards: decimal("off_open_field_yards"),

  // === Advanced Defensive Stats (/stats/game/advanced) ===
  def_plays: integer("def_plays"),
  def_drives: integer("def_drives"),
  def_ppa: decimal("def_ppa"),
  def_success_rate: decimal("def_success_rate"),
  def_explosiveness: decimal("def_explosiveness"),
  def_power_success: decimal("def_power_success"),
  def_stuff_rate: decimal("def_stuff_rate"),
  def_line_yards: decimal("def_line_yards"),
  def_second_level_yards: decimal("def_second_level_yards"),
  def_open_field_yards: decimal("def_open_field_yards"),
  
}, (table) => ({
  gameTeamUnique: uniqueIndex("box_score_game_team_unique_idx").on(table.gameId, table.teamId),
}));

export const teamStrengthRatings = pgTable("team_strength_ratings", {
  id: serial("id").primaryKey(),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  teamId: integer("team_id").notNull().references(() => teams.id),
  // These are the OUTPUT of your model
  offenseRatingAdjusted: decimal("offense_rating_adjusted", { precision: 8, scale: 4 }),
  defenseRatingAdjusted: decimal("defense_rating_adjusted", { precision: 8, scale: 4 }),
  passOffenseRating: decimal("pass_offense_rating", { precision: 8, scale: 4 }),
  rushOffenseRating: decimal("rush_offense_rating", { precision: 8, scale: 4 }),
  passDefenseRating: decimal("pass_defense_rating", { precision: 8, scale: 4 }),
  rushDefenseRating: decimal("rush_defense_rating", { precision: 8, scale: 4 }),
  calculatedAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  seasonWeekTeamUnique: uniqueIndex("ratings_season_week_team_unique_idx").on(table.season, table.week, table.teamId),
}));

export const teamEfficiencyRatings = pgTable("team_efficiency_ratings", {
  id: serial("id").primaryKey(),
  season: integer("season").notNull(),
  teamId: integer("team_id").notNull().references(() => teams.id),
  
  // Offensive Efficiency (opponent-adjusted, positive = above average, negative = below average)
  totalOffenseEfficiency: decimal("total_offense_efficiency", { precision: 8, scale: 4 }),
  passingOffenseEfficiency: decimal("passing_offense_efficiency", { precision: 8, scale: 4 }),
  rushingOffenseEfficiency: decimal("rushing_offense_efficiency", { precision: 8, scale: 4 }),
  scoringOffenseEfficiency: decimal("scoring_offense_efficiency", { precision: 8, scale: 4 }),
  
  // Defensive Efficiency (opponent-adjusted, positive = better than average, negative = worse than average)
  totalDefenseEfficiency: decimal("total_defense_efficiency", { precision: 8, scale: 4 }),
  passingDefenseEfficiency: decimal("passing_defense_efficiency", { precision: 8, scale: 4 }),
  rushingDefenseEfficiency: decimal("rushing_defense_efficiency", { precision: 8, scale: 4 }),
  scoringDefenseEfficiency: decimal("scoring_defense_efficiency", { precision: 8, scale: 4 }),
  
  // Turnover & Special Teams Efficiency
  interceptionEfficiency: decimal("interception_efficiency", { precision: 8, scale: 4 }), // Thrown vs typical
  interceptionDefenseEfficiency: decimal("interception_defense_efficiency", { precision: 8, scale: 4 }), // Caught vs typical
  sackOffenseEfficiency: decimal("sack_offense_efficiency", { precision: 8, scale: 4 }), // Allowed vs typical
  sackDefenseEfficiency: decimal("sack_defense_efficiency", { precision: 8, scale: 4 }), // Made vs typical
  fieldGoalEfficiency: decimal("field_goal_efficiency", { precision: 8, scale: 4 }),

  // Legacy fields for backward compatibility
  turnoverEfficiency: decimal("turnover_efficiency", { precision: 8, scale: 4 }),
  specialTeamsEfficiency: decimal("special_teams_efficiency", { precision: 8, scale: 4 }),
  averagePointsFor: decimal('average_points_for', { precision: 5, scale: 2 }),
  averagePointsAgainst: decimal('average_points_against', { precision: 5, scale: 2 }),
  
  // Statistical validation metrics
  regressionMetrics: text("regression_metrics"), // JSON object containing detailed regression analysis results
  scoringRSquared: decimal("scoring_r_squared", { precision: 5, scale: 4 }),
  passingRSquared: decimal("passing_r_squared", { precision: 5, scale: 4 }),
  rushingRSquared: decimal("rushing_r_squared", { precision: 5, scale: 4 }),
  turnoverRSquared: decimal("turnover_r_squared", { precision: 5, scale: 4 }),
  overallModelFit: decimal("overall_model_fit", { precision: 5, scale: 4 }),
  statisticalSignificanceScore: decimal("statistical_significance_score", { precision: 5, scale: 4 }),
  
  // Metadata
  gamesPlayed: integer("games_played").notNull(),
  convergenceScore: decimal("convergence_score", { precision: 5, scale: 4 }), // How stable the ratings are (0-1)
  confidenceLevel: varchar("confidence_level", { length: 10 }), // "High", "Medium", "Low"
  dataQuality: varchar("data_quality", { length: 20 }), // "Excellent", "Good", "Limited", "Insufficient"
  lastCalculated: timestamp("last_calculated", { withTimezone: true }).defaultNow(),
}, (table) => ({
  seasonTeamUnique: uniqueIndex("efficiency_ratings_season_team_unique_idx").on(table.season, table.teamId),
  overallModelFitIdx: index("team_efficiency_overall_model_fit_idx").on(table.overallModelFit),
  statisticalSignificanceIdx: index("team_efficiency_statistical_significance_idx").on(table.statisticalSignificanceScore),
}));

export const statisticalProcessingLog = pgTable("statistical_processing_log", {
  id: serial("id").primaryKey(),
  processType: varchar("process_type", { length: 50 }), // "recent_update", "full_season", "strength_calculation"
  season: integer("season"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  gamesProcessed: integer("games_processed"),
  teamsUpdated: integer("teams_updated"),
  iterationsRequired: integer("iterations_required"),
  converged: boolean("converged"),
  processingTime: integer("processing_time_ms"),
  status: varchar("status", { length: 20 }).default('completed'), // "running", "completed", "failed", "rolled_back"
  errorCount: integer("error_count").default(0),
  warningCount: integer("warning_count").default(0),
  errorDetails: text("error_details"), // JSON string of error details
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const dataQualityLog = pgTable("data_quality_log", {
  id: serial("id").primaryKey(),
  season: integer("season").notNull(),
  checkType: varchar("check_type", { length: 50 }).notNull(), // "completeness", "consistency", "validation"
  overallScore: integer("overall_score"), // 0-100
  teamsChecked: integer("teams_checked"),
  issuesFound: integer("issues_found"),
  criticalIssues: integer("critical_issues"),
  warningIssues: integer("warning_issues"),
  recommendations: text("recommendations"), // JSON string
  checkDetails: text("check_details"), // JSON string of detailed results
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const predictionValidationLog = pgTable("prediction_validation_log", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => games.id),
  originalHomeScore: integer("original_home_score"),
  originalAwayScore: integer("original_away_score"),
  correctedHomeScore: integer("corrected_home_score"),
  correctedAwayScore: integer("corrected_away_score"),
  validationResult: varchar("validation_result", { length: 20 }).notNull(), // "valid", "corrected", "flagged"
  validationIssues: text("validation_issues"), // JSON string of issues
  correctionReason: text("correction_reason"),
  predictionMethod: varchar("prediction_method", { length: 50 }),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  confidenceIntervalLower: decimal("confidence_interval_lower", { precision: 5, scale: 2 }),
  confidenceIntervalUpper: decimal("confidence_interval_upper", { precision: 5, scale: 2 }),
  predictionReliability: varchar("prediction_reliability", { length: 10 }), // "High", "Medium", "Low"
  modelRSquared: decimal("model_r_squared", { precision: 5, scale: 4 }),
  statisticalConfidence: decimal("statistical_confidence", { precision: 5, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  predictionReliabilityIdx: index("prediction_validation_reliability_idx").on(table.predictionReliability),
  modelRSquaredIdx: index("prediction_validation_model_r_squared_idx").on(table.modelRSquared),
}));

export const systemErrorLog = pgTable("system_error_log", {
  id: serial("id").primaryKey(),
  errorType: varchar("error_type", { length: 50 }).notNull(), // "database", "api", "processing", "validation"
  severity: varchar("severity", { length: 20 }).notNull(), // "critical", "warning", "info"
  component: varchar("component", { length: 100 }), // Which service/function caused the error
  errorMessage: text("error_message").notNull(),
  errorStack: text("error_stack"),
  contextData: text("context_data"), // JSON string of relevant context
  userId: uuid("user_id").references(() => users.id),
  sessionId: varchar("session_id", { length: 100 }),
  resolved: boolean("resolved").default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  errorTypeIdx: index("error_log_type_idx").on(table.errorType),
  severityIdx: index("error_log_severity_idx").on(table.severity),
  createdAtIdx: index("error_log_created_at_idx").on(table.createdAt),
}));

export const regressionAnalysisResults = pgTable("regression_analysis_results", {
  id: serial("id").primaryKey(),
  season: integer("season").notNull(),
  analysisDate: timestamp("analysis_date", { withTimezone: true }).notNull().defaultNow(),
  
  // Overall model metrics
  overallRSquared: decimal("overall_r_squared", { precision: 5, scale: 4 }),
  sampleSize: integer("sample_size").notNull(),
  predictiveAccuracy: decimal("predictive_accuracy", { precision: 5, scale: 4 }),
  
  // Model validation metrics
  residualStandardError: decimal("residual_standard_error", { precision: 8, scale: 4 }),
  fStatistic: decimal("f_statistic", { precision: 8, scale: 4 }),
  fPValue: decimal("f_p_value", { precision: 8, scale: 6 }),
  adjustedRSquared: decimal("adjusted_r_squared", { precision: 5, scale: 4 }),
  
  // Analysis metadata
  analysisDurationMs: integer("analysis_duration_ms"),
  significantMetricsCount: integer("significant_metrics_count"),
  warnings: text("warnings").array(), // Array of warning messages
  recommendations: text("recommendations").array(), // Array of recommendations
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  seasonIdx: index("regression_analysis_season_idx").on(table.season),
  analysisDateIdx: index("regression_analysis_date_idx").on(table.analysisDate),
}));

export const regressionMetricResults = pgTable("regression_metric_results", {
  id: serial("id").primaryKey(),
  analysisId: integer("analysis_id").notNull().references(() => regressionAnalysisResults.id, { onDelete: 'cascade' }),
  
  // Metric identification
  metricName: varchar("metric_name", { length: 50 }).notNull(),
  
  // Regression coefficients and statistics
  coefficient: decimal("coefficient", { precision: 8, scale: 4 }).notNull(),
  rSquared: decimal("r_squared", { precision: 5, scale: 4 }).notNull(),
  pValue: decimal("p_value", { precision: 8, scale: 6 }).notNull(),
  confidenceIntervalLower: decimal("confidence_interval_lower", { precision: 8, scale: 4 }),
  confidenceIntervalUpper: decimal("confidence_interval_upper", { precision: 8, scale: 4 }),
  
  // Calculated weight and significance
  calculatedWeight: decimal("calculated_weight", { precision: 5, scale: 4 }).notNull(),
  isStatisticallySignificant: boolean("is_statistically_significant").notNull(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  analysisIdIdx: index("regression_metric_analysis_idx").on(table.analysisId),
  metricNameIdx: index("regression_metric_name_idx").on(table.metricName),
}));

export const predictionWeightHistory = pgTable("prediction_weight_history", {
  id: serial("id").primaryKey(),
  season: integer("season").notNull(),
  changeDate: timestamp("change_date", { withTimezone: true }).notNull().defaultNow(),
  
  // Weight values
  passingOffense: decimal("passing_offense", { precision: 5, scale: 4 }).notNull(),
  rushingOffense: decimal("rushing_offense", { precision: 5, scale: 4 }).notNull(),
  scoringEfficiency: decimal("scoring_efficiency", { precision: 5, scale: 4 }).notNull(),
  passingDefense: decimal("passing_defense", { precision: 5, scale: 4 }).notNull(),
  rushingDefense: decimal("rushing_defense", { precision: 5, scale: 4 }).notNull(),
  turnoverMargin: decimal("turnover_margin", { precision: 5, scale: 4 }).notNull(),
  specialTeams: decimal("special_teams", { precision: 5, scale: 4 }).notNull(),
  homeFieldAdvantage: decimal("home_field_advantage", { precision: 5, scale: 4 }).notNull(),
  
  // Change metadata
  changeReason: varchar("change_reason", { length: 100 }).notNull(), // 'regression_analysis', 'manual_override', 'initialization'
  analysisId: integer("analysis_id").references(() => regressionAnalysisResults.id),
  changedByUserId: uuid("changed_by_user_id").references(() => users.id),
  
  // Previous weights for comparison (JSON)
  previousWeights: text("previous_weights"), // JSON string
  
  // Regression metrics that drove the change
  regressionRSquared: decimal("regression_r_squared", { precision: 5, scale: 4 }),
  regressionSampleSize: integer("regression_sample_size"),
  significantMetrics: text("significant_metrics").array(), // Array of significant metric names
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  seasonIdx: index("weight_history_season_idx").on(table.season),
  changeDateIdx: index("weight_history_date_idx").on(table.changeDate),
}));

// =============================================================================
// DRIZZLE RELATIONS
// =============================================================================
export const usersRelations = relations(users, ({ many }) => ({ picks: many(picks) }));
export const teamsRelations = relations(teams, ({ many }) => ({
  homeGames: many(games, { relationName: "homeTeam" }),
  awayGames: many(games, { relationName: "awayTeam" }),
  boxScoreStats: many(gameBoxScoreStats),
  strengthRatings: many(teamStrengthRatings),
  efficiencyRatings: many(teamEfficiencyRatings),
}));
export const gamesRelations = relations(games, ({ one, many }) => ({
  homeTeam: one(teams, { fields: [games.homeTeamId], references: [teams.id], relationName: "homeTeam" }),
  // === FIX IS HERE === Changed games.awayId to games.awayTeamId
  awayTeam: one(teams, { fields: [games.awayTeamId], references: [teams.id], relationName: "awayTeam" }),
  picks: many(picks),
  boxScoreStats: many(gameBoxScoreStats),
}));
export const picksRelations = relations(picks, ({ one }) => ({
  user: one(users, { fields: [picks.userId], references: [users.id] }),
  game: one(games, { fields: [picks.gameId], references: [games.id] }),
  pickedTeam: one(teams, { fields: [picks.pickedTeamId], references: [teams.id] }),
}));
export const gameBoxScoreStatsRelations = relations(gameBoxScoreStats, ({ one }) => ({
  game: one(games, { fields: [gameBoxScoreStats.gameId], references: [games.id] }),
  team: one(teams, { fields: [gameBoxScoreStats.teamId], references: [teams.id] }),
}));
export const teamStrengthRatingsRelations = relations(teamStrengthRatings, ({ one }) => ({
  team: one(teams, { fields: [teamStrengthRatings.teamId], references: [teams.id] }),
}));
export const teamEfficiencyRatingsRelations = relations(teamEfficiencyRatings, ({ one }) => ({
  team: one(teams, { fields: [teamEfficiencyRatings.teamId], references: [teams.id] }),
}));
export const predictionValidationLogRelations = relations(predictionValidationLog, ({ one }) => ({
  game: one(games, { fields: [predictionValidationLog.gameId], references: [games.id] }),
}));
export const systemErrorLogRelations = relations(systemErrorLog, ({ one }) => ({
  user: one(users, { fields: [systemErrorLog.userId], references: [users.id] }),
  resolvedByUser: one(users, { fields: [systemErrorLog.resolvedBy], references: [users.id] }),
}));

export const regressionAnalysisResultsRelations = relations(regressionAnalysisResults, ({ many }) => ({
  metricResults: many(regressionMetricResults),
  weightHistoryEntries: many(predictionWeightHistory),
}));

export const regressionMetricResultsRelations = relations(regressionMetricResults, ({ one }) => ({
  analysis: one(regressionAnalysisResults, { fields: [regressionMetricResults.analysisId], references: [regressionAnalysisResults.id] }),
}));

export const predictionWeightHistoryRelations = relations(predictionWeightHistory, ({ one }) => ({
  analysis: one(regressionAnalysisResults, { fields: [predictionWeightHistory.analysisId], references: [regressionAnalysisResults.id] }),
  changedByUser: one(users, { fields: [predictionWeightHistory.changedByUserId], references: [users.id] }),
}));

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type InsertTeam = typeof teams.$inferInsert;
export type Game = typeof games.$inferSelect;
export type InsertGame = typeof games.$inferInsert;
export type Pick = typeof picks.$inferSelect;
export type InsertPick = typeof picks.$inferInsert;
export type GameBoxScoreStats = typeof gameBoxScoreStats.$inferSelect;
export type InsertGameBoxScoreStats = typeof gameBoxScoreStats.$inferInsert;
export type TeamStrengthRatings = typeof teamStrengthRatings.$inferSelect;
export type InsertTeamStrengthRatings = typeof teamStrengthRatings.$inferInsert;
export type TeamEfficiencyRatings = typeof teamEfficiencyRatings.$inferSelect;
export type InsertTeamEfficiencyRatings = typeof teamEfficiencyRatings.$inferInsert;
export type StatisticalProcessingLog = typeof statisticalProcessingLog.$inferSelect;
export type InsertStatisticalProcessingLog = typeof statisticalProcessingLog.$inferInsert;
export type DataQualityLog = typeof dataQualityLog.$inferSelect;
export type InsertDataQualityLog = typeof dataQualityLog.$inferInsert;
export type PredictionValidationLog = typeof predictionValidationLog.$inferSelect;
export type InsertPredictionValidationLog = typeof predictionValidationLog.$inferInsert;
export type SystemErrorLog = typeof systemErrorLog.$inferSelect;
export type InsertSystemErrorLog = typeof systemErrorLog.$inferInsert;
export type RegressionAnalysisResults = typeof regressionAnalysisResults.$inferSelect;
export type InsertRegressionAnalysisResults = typeof regressionAnalysisResults.$inferInsert;
export type RegressionMetricResults = typeof regressionMetricResults.$inferSelect;
export type InsertRegressionMetricResults = typeof regressionMetricResults.$inferInsert;
export type PredictionWeightHistory = typeof predictionWeightHistory.$inferSelect;
export type InsertPredictionWeightHistory = typeof predictionWeightHistory.$inferInsert;