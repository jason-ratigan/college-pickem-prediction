import { pgTable, unique, pgEnum, uuid, varchar, timestamp, uniqueIndex, foreignKey, serial, integer, numeric, index, boolean, text } from "drizzle-orm/pg-core"
  import { sql } from "drizzle-orm"

export const postseason_type_enum = pgEnum("postseason_type_enum", ['bowl', 'playoff', 'championship'])
export const season_type_enum = pgEnum("season_type_enum", ['regular', 'postseason'])
export const user_role_enum = pgEnum("user_role_enum", ['player', 'admin'])


export const users = pgTable("users", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	full_name: varchar("full_name", { length: 100 }),
	email: varchar("email", { length: 255 }).notNull(),
	password_hash: varchar("password_hash", { length: 255 }).notNull(),
	role: user_role_enum("role").default('player').notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		users_email_unique: unique("users_email_unique").on(table.email),
	}
});

export const team_strength_ratings = pgTable("team_strength_ratings", {
	id: serial("id").primaryKey().notNull(),
	season: integer("season").notNull(),
	week: integer("week").notNull(),
	team_id: integer("team_id").notNull().references(() => teams.id),
	offense_rating_adjusted: numeric("offense_rating_adjusted", { precision: 8, scale:  4 }),
	defense_rating_adjusted: numeric("defense_rating_adjusted", { precision: 8, scale:  4 }),
	pass_offense_rating: numeric("pass_offense_rating", { precision: 8, scale:  4 }),
	rush_offense_rating: numeric("rush_offense_rating", { precision: 8, scale:  4 }),
	pass_defense_rating: numeric("pass_defense_rating", { precision: 8, scale:  4 }),
	rush_defense_rating: numeric("rush_defense_rating", { precision: 8, scale:  4 }),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
},
(table) => {
	return {
		ratings_season_week_team_unique_idx: uniqueIndex("ratings_season_week_team_unique_idx").on(table.season, table.team_id, table.week),
	}
});

export const games = pgTable("games", {
	id: serial("id").primaryKey().notNull(),
	api_game_id: integer("api_game_id"),
	season: integer("season").notNull(),
	week: integer("week").notNull(),
	season_type: season_type_enum("season_type").default('regular').notNull(),
	postseason_type: postseason_type_enum("postseason_type"),
	game_time: timestamp("game_time", { withTimezone: true, mode: 'string' }),
	home_team_id: integer("home_team_id").notNull().references(() => teams.id),
	away_team_id: integer("away_team_id").notNull().references(() => teams.id),
	home_team_score: integer("home_team_score"),
	away_team_score: integer("away_team_score"),
	is_final: boolean("is_final").default(false),
	spread: numeric("spread", { precision: 4, scale:  1 }),
	over_under: numeric("over_under", { precision: 4, scale:  1 }),
	is_featured_game: boolean("is_featured_game").default(false),
},
(table) => {
	return {
		season_week_idx: index("games_season_week_idx").on(table.season, table.week),
		season_type_idx: index("games_season_type_idx").on(table.season_type),
		games_api_game_id_unique: unique("games_api_game_id_unique").on(table.api_game_id),
	}
});

export const picks = pgTable("picks", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	user_id: uuid("user_id").notNull().references(() => users.id),
	game_id: integer("game_id").notNull().references(() => games.id),
	picked_team_id: integer("picked_team_id").references(() => teams.id),
	is_correct: boolean("is_correct"),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	picked_against_spread: varchar("picked_against_spread", { length: 4 }),
},
(table) => {
	return {
		user_game_unique_idx: uniqueIndex("picks_user_game_unique_idx").on(table.game_id, table.user_id),
	}
});

export const teams = pgTable("teams", {
	id: serial("id").primaryKey().notNull(),
	api_team_id: integer("api_team_id"),
	name: varchar("name", { length: 255 }).notNull(),
	conference: varchar("conference", { length: 100 }),
	logo_url: text("logo_url"),
	classification: varchar("classification", { length: 10 }),
	data_quality: varchar("data_quality", { length: 20 }).default('Unknown'::character varying),
	last_synced: timestamp("last_synced", { withTimezone: true, mode: 'string' }),
	sync_errors: integer("sync_errors").default(0),
	conflict_resolution_notes: text("conflict_resolution_notes"),
},
(table) => {
	return {
		teams_api_team_id_unique: unique("teams_api_team_id_unique").on(table.api_team_id),
		teams_name_unique: unique("teams_name_unique").on(table.name),
	}
});

export const game_box_score_stats = pgTable("game_box_score_stats", {
	id: serial("id").primaryKey().notNull(),
	game_id: integer("game_id").notNull().references(() => games.id),
	team_id: integer("team_id").notNull().references(() => teams.id),
	completion_attempts: varchar("completion_attempts", { length: 15 }),
	net_passing_yards: integer("net_passing_yards"),
	passing_tds: integer("passing_tds"),
	rushing_yards: integer("rushing_yards"),
	rushing_attempts: integer("rushing_attempts"),
	rushing_tds: integer("rushing_tds"),
	total_yards: integer("total_yards"),
	first_downs: integer("first_downs"),
	turnovers: integer("turnovers"),
	fumbles_lost: integer("fumbles_lost"),
	interceptions_thrown: integer("interceptions_thrown"),
	possession_time: varchar("possession_time", { length: 15 }),
	sacks: numeric("sacks", { precision: 4, scale:  1 }),
	tackles_for_loss: numeric("tackles_for_loss", { precision: 4, scale:  1 }),
	fumbles_recovered: integer("fumbles_recovered"),
	interceptions: integer("interceptions"),
	passes_deflected: integer("passes_deflected"),
	qb_hurries: integer("qb_hurries"),
	defensive_tds: integer("defensive_tds"),
	kick_return_yards: integer("kick_return_yards"),
	punt_return_yards: integer("punt_return_yards"),
	third_down_eff: varchar("third_down_eff", { length: 15 }),
	fourth_down_eff: varchar("fourth_down_eff", { length: 15 }),
	total_penalties_yards: varchar("total_penalties_yards", { length: 15 }),
	off_plays: integer("off_plays"),
	off_drives: integer("off_drives"),
	off_ppa: numeric("off_ppa"),
	off_success_rate: numeric("off_success_rate"),
	off_explosiveness: numeric("off_explosiveness"),
	off_power_success: numeric("off_power_success"),
	off_stuff_rate: numeric("off_stuff_rate"),
	off_line_yards: numeric("off_line_yards"),
	off_second_level_yards: numeric("off_second_level_yards"),
	off_open_field_yards: numeric("off_open_field_yards"),
	def_plays: integer("def_plays"),
	def_drives: integer("def_drives"),
	def_ppa: numeric("def_ppa"),
	def_success_rate: numeric("def_success_rate"),
	def_explosiveness: numeric("def_explosiveness"),
	def_power_success: numeric("def_power_success"),
	def_stuff_rate: numeric("def_stuff_rate"),
	def_line_yards: numeric("def_line_yards"),
	def_second_level_yards: numeric("def_second_level_yards"),
	def_open_field_yards: numeric("def_open_field_yards"),
	red_zone_attempts: integer("red_zone_attempts"),
	red_zone_scores: integer("red_zone_scores"),
	field_goal_attempts: integer("field_goal_attempts"),
	field_goals_made: integer("field_goals_made"),
	punt_return_tds: integer("punt_return_tds"),
	kick_return_tds: integer("kick_return_tds"),
	time_of_possession_seconds: integer("time_of_possession_seconds"),
},
(table) => {
	return {
		box_score_game_team_unique_idx: uniqueIndex("box_score_game_team_unique_idx").on(table.game_id, table.team_id),
	}
});

export const data_quality_log = pgTable("data_quality_log", {
	id: serial("id").primaryKey().notNull(),
	season: integer("season").notNull(),
	check_type: varchar("check_type", { length: 50 }).notNull(),
	overall_score: integer("overall_score"),
	teams_checked: integer("teams_checked"),
	issues_found: integer("issues_found"),
	critical_issues: integer("critical_issues"),
	warning_issues: integer("warning_issues"),
	recommendations: text("recommendations"),
	check_details: text("check_details"),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const system_error_log = pgTable("system_error_log", {
	id: serial("id").primaryKey().notNull(),
	error_type: varchar("error_type", { length: 50 }).notNull(),
	severity: varchar("severity", { length: 20 }).notNull(),
	component: varchar("component", { length: 100 }),
	error_message: text("error_message").notNull(),
	error_stack: text("error_stack"),
	context_data: text("context_data"),
	user_id: uuid("user_id").references(() => users.id),
	session_id: varchar("session_id", { length: 100 }),
	resolved: boolean("resolved").default(false),
	resolved_at: timestamp("resolved_at", { withTimezone: true, mode: 'string' }),
	resolved_by: uuid("resolved_by").references(() => users.id),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
},
(table) => {
	return {
		error_log_type_idx: index("error_log_type_idx").on(table.error_type),
		error_log_severity_idx: index("error_log_severity_idx").on(table.severity),
		error_log_created_at_idx: index("error_log_created_at_idx").on(table.created_at),
	}
});

export const prediction_validation_log = pgTable("prediction_validation_log", {
	id: serial("id").primaryKey().notNull(),
	game_id: integer("game_id").notNull().references(() => games.id),
	original_home_score: integer("original_home_score"),
	original_away_score: integer("original_away_score"),
	corrected_home_score: integer("corrected_home_score"),
	corrected_away_score: integer("corrected_away_score"),
	validation_result: varchar("validation_result", { length: 20 }).notNull(),
	validation_issues: text("validation_issues"),
	correction_reason: text("correction_reason"),
	prediction_method: varchar("prediction_method", { length: 50 }),
	confidence: numeric("confidence", { precision: 3, scale:  2 }),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	confidence_interval_lower: numeric("confidence_interval_lower", { precision: 5, scale:  2 }),
	confidence_interval_upper: numeric("confidence_interval_upper", { precision: 5, scale:  2 }),
	prediction_reliability: varchar("prediction_reliability", { length: 10 }),
	model_r_squared: numeric("model_r_squared", { precision: 5, scale:  4 }),
	statistical_confidence: numeric("statistical_confidence", { precision: 5, scale:  4 }),
},
(table) => {
	return {
		prediction_validation_reliability_idx: index("prediction_validation_reliability_idx").on(table.prediction_reliability),
		prediction_validation_model_r_squared_idx: index("prediction_validation_model_r_squared_idx").on(table.model_r_squared),
	}
});

export const regression_analysis_results = pgTable("regression_analysis_results", {
	id: serial("id").primaryKey().notNull(),
	season: integer("season").notNull(),
	analysis_date: timestamp("analysis_date", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	overall_r_squared: numeric("overall_r_squared", { precision: 5, scale:  4 }),
	sample_size: integer("sample_size").notNull(),
	predictive_accuracy: numeric("predictive_accuracy", { precision: 5, scale:  4 }),
	residual_standard_error: numeric("residual_standard_error", { precision: 8, scale:  4 }),
	f_statistic: numeric("f_statistic", { precision: 8, scale:  4 }),
	f_p_value: numeric("f_p_value", { precision: 8, scale:  6 }),
	adjusted_r_squared: numeric("adjusted_r_squared", { precision: 5, scale:  4 }),
	analysis_duration_ms: integer("analysis_duration_ms"),
	significant_metrics_count: integer("significant_metrics_count"),
	warnings: text("warnings").array(),
	recommendations: text("recommendations").array(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		regression_analysis_season_idx: index("regression_analysis_season_idx").on(table.season),
		regression_analysis_date_idx: index("regression_analysis_date_idx").on(table.analysis_date),
	}
});

export const prediction_weight_history = pgTable("prediction_weight_history", {
	id: serial("id").primaryKey().notNull(),
	season: integer("season").notNull(),
	change_date: timestamp("change_date", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	passing_offense: numeric("passing_offense", { precision: 5, scale:  4 }).notNull(),
	rushing_offense: numeric("rushing_offense", { precision: 5, scale:  4 }).notNull(),
	scoring_efficiency: numeric("scoring_efficiency", { precision: 5, scale:  4 }).notNull(),
	passing_defense: numeric("passing_defense", { precision: 5, scale:  4 }).notNull(),
	rushing_defense: numeric("rushing_defense", { precision: 5, scale:  4 }).notNull(),
	turnover_margin: numeric("turnover_margin", { precision: 5, scale:  4 }).notNull(),
	special_teams: numeric("special_teams", { precision: 5, scale:  4 }).notNull(),
	home_field_advantage: numeric("home_field_advantage", { precision: 5, scale:  4 }).notNull(),
	change_reason: varchar("change_reason", { length: 100 }).notNull(),
	analysis_id: integer("analysis_id").references(() => regression_analysis_results.id),
	changed_by_user_id: uuid("changed_by_user_id").references(() => users.id),
	previous_weights: text("previous_weights"),
	regression_r_squared: numeric("regression_r_squared", { precision: 5, scale:  4 }),
	regression_sample_size: integer("regression_sample_size"),
	significant_metrics: text("significant_metrics").array(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		weight_history_season_idx: index("weight_history_season_idx").on(table.season),
		weight_history_date_idx: index("weight_history_date_idx").on(table.change_date),
	}
});

export const statistical_processing_log = pgTable("statistical_processing_log", {
	id: serial("id").primaryKey().notNull(),
	process_type: varchar("process_type", { length: 50 }),
	season: integer("season"),
	start_date: timestamp("start_date", { withTimezone: true, mode: 'string' }),
	end_date: timestamp("end_date", { withTimezone: true, mode: 'string' }),
	games_processed: integer("games_processed"),
	teams_updated: integer("teams_updated"),
	iterations_required: integer("iterations_required"),
	converged: boolean("converged"),
	processing_time_ms: integer("processing_time_ms"),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	status: varchar("status", { length: 20 }).default('completed'::character varying),
	error_count: integer("error_count").default(0),
	warning_count: integer("warning_count").default(0),
	error_details: text("error_details"),
});

export const regression_metric_results = pgTable("regression_metric_results", {
	id: serial("id").primaryKey().notNull(),
	analysis_id: integer("analysis_id").notNull().references(() => regression_analysis_results.id, { onDelete: "cascade" } ),
	metric_name: varchar("metric_name", { length: 50 }).notNull(),
	coefficient: numeric("coefficient", { precision: 8, scale:  4 }).notNull(),
	r_squared: numeric("r_squared", { precision: 5, scale:  4 }).notNull(),
	p_value: numeric("p_value", { precision: 8, scale:  6 }).notNull(),
	confidence_interval_lower: numeric("confidence_interval_lower", { precision: 8, scale:  4 }),
	confidence_interval_upper: numeric("confidence_interval_upper", { precision: 8, scale:  4 }),
	calculated_weight: numeric("calculated_weight", { precision: 5, scale:  4 }).notNull(),
	is_statistically_significant: boolean("is_statistically_significant").notNull(),
	created_at: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		regression_metric_analysis_idx: index("regression_metric_analysis_idx").on(table.analysis_id),
		regression_metric_name_idx: index("regression_metric_name_idx").on(table.metric_name),
	}
});

export const team_efficiency_ratings = pgTable("team_efficiency_ratings", {
	id: serial("id").primaryKey().notNull(),
	season: integer("season").notNull(),
	team_id: integer("team_id").notNull().references(() => teams.id),
	passing_offense_efficiency: numeric("passing_offense_efficiency", { precision: 8, scale:  4 }),
	rushing_offense_efficiency: numeric("rushing_offense_efficiency", { precision: 8, scale:  4 }),
	scoring_offense_efficiency: numeric("scoring_offense_efficiency", { precision: 8, scale:  4 }),
	passing_defense_efficiency: numeric("passing_defense_efficiency", { precision: 8, scale:  4 }),
	rushing_defense_efficiency: numeric("rushing_defense_efficiency", { precision: 8, scale:  4 }),
	scoring_defense_efficiency: numeric("scoring_defense_efficiency", { precision: 8, scale:  4 }),
	turnover_efficiency: numeric("turnover_efficiency", { precision: 8, scale:  4 }),
	special_teams_efficiency: numeric("special_teams_efficiency", { precision: 8, scale:  4 }),
	games_played: integer("games_played").notNull(),
	data_quality: varchar("data_quality", { length: 20 }),
	last_calculated: timestamp("last_calculated", { withTimezone: true, mode: 'string' }).defaultNow(),
	average_points_for: numeric("average_points_for", { precision: 5, scale:  2 }),
	average_points_against: numeric("average_points_against", { precision: 5, scale:  2 }),
	total_offense_efficiency: numeric("total_offense_efficiency", { precision: 8, scale:  4 }),
	total_defense_efficiency: numeric("total_defense_efficiency", { precision: 8, scale:  4 }),
	interception_efficiency: numeric("interception_efficiency", { precision: 8, scale:  4 }),
	interception_defense_efficiency: numeric("interception_defense_efficiency", { precision: 8, scale:  4 }),
	sack_offense_efficiency: numeric("sack_offense_efficiency", { precision: 8, scale:  4 }),
	sack_defense_efficiency: numeric("sack_defense_efficiency", { precision: 8, scale:  4 }),
	field_goal_efficiency: numeric("field_goal_efficiency", { precision: 8, scale:  4 }),
	convergence_score: numeric("convergence_score", { precision: 5, scale:  4 }),
	confidence_level: varchar("confidence_level", { length: 10 }),
	regression_metrics: text("regression_metrics"),
	scoring_r_squared: numeric("scoring_r_squared", { precision: 5, scale:  4 }),
	passing_r_squared: numeric("passing_r_squared", { precision: 5, scale:  4 }),
	rushing_r_squared: numeric("rushing_r_squared", { precision: 5, scale:  4 }),
	turnover_r_squared: numeric("turnover_r_squared", { precision: 5, scale:  4 }),
	overall_model_fit: numeric("overall_model_fit", { precision: 5, scale:  4 }),
	statistical_significance_score: numeric("statistical_significance_score", { precision: 5, scale:  4 }),
},
(table) => {
	return {
		efficiency_ratings_season_team_unique_idx: uniqueIndex("efficiency_ratings_season_team_unique_idx").on(table.season, table.team_id),
		team_efficiency_overall_model_fit_idx: index("team_efficiency_overall_model_fit_idx").on(table.overall_model_fit),
		team_efficiency_statistical_significance_idx: index("team_efficiency_statistical_significance_idx").on(table.statistical_significance_score),
	}
});