import { relations } from "drizzle-orm/relations";
import { teams, team_strength_ratings, games, users, picks, game_box_score_stats, system_error_log, prediction_validation_log, prediction_weight_history, regression_analysis_results, regression_metric_results, team_efficiency_ratings } from "./schema";

export const team_strength_ratingsRelations = relations(team_strength_ratings, ({one}) => ({
	team: one(teams, {
		fields: [team_strength_ratings.team_id],
		references: [teams.id]
	}),
}));

export const teamsRelations = relations(teams, ({many}) => ({
	team_strength_ratings: many(team_strength_ratings),
	games_home_team_id: many(games, {
		relationName: "games_home_team_id_teams_id"
	}),
	games_away_team_id: many(games, {
		relationName: "games_away_team_id_teams_id"
	}),
	picks: many(picks),
	game_box_score_stats: many(game_box_score_stats),
	team_efficiency_ratings: many(team_efficiency_ratings),
}));

export const gamesRelations = relations(games, ({one, many}) => ({
	team_home_team_id: one(teams, {
		fields: [games.home_team_id],
		references: [teams.id],
		relationName: "games_home_team_id_teams_id"
	}),
	team_away_team_id: one(teams, {
		fields: [games.away_team_id],
		references: [teams.id],
		relationName: "games_away_team_id_teams_id"
	}),
	picks: many(picks),
	game_box_score_stats: many(game_box_score_stats),
	prediction_validation_logs: many(prediction_validation_log),
}));

export const picksRelations = relations(picks, ({one}) => ({
	user: one(users, {
		fields: [picks.user_id],
		references: [users.id]
	}),
	game: one(games, {
		fields: [picks.game_id],
		references: [games.id]
	}),
	team: one(teams, {
		fields: [picks.picked_team_id],
		references: [teams.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	picks: many(picks),
	system_error_logs_user_id: many(system_error_log, {
		relationName: "system_error_log_user_id_users_id"
	}),
	system_error_logs_resolved_by: many(system_error_log, {
		relationName: "system_error_log_resolved_by_users_id"
	}),
	prediction_weight_histories: many(prediction_weight_history),
}));

export const game_box_score_statsRelations = relations(game_box_score_stats, ({one}) => ({
	game: one(games, {
		fields: [game_box_score_stats.game_id],
		references: [games.id]
	}),
	team: one(teams, {
		fields: [game_box_score_stats.team_id],
		references: [teams.id]
	}),
}));

export const system_error_logRelations = relations(system_error_log, ({one}) => ({
	user_user_id: one(users, {
		fields: [system_error_log.user_id],
		references: [users.id],
		relationName: "system_error_log_user_id_users_id"
	}),
	user_resolved_by: one(users, {
		fields: [system_error_log.resolved_by],
		references: [users.id],
		relationName: "system_error_log_resolved_by_users_id"
	}),
}));

export const prediction_validation_logRelations = relations(prediction_validation_log, ({one}) => ({
	game: one(games, {
		fields: [prediction_validation_log.game_id],
		references: [games.id]
	}),
}));

export const prediction_weight_historyRelations = relations(prediction_weight_history, ({one}) => ({
	user: one(users, {
		fields: [prediction_weight_history.changed_by_user_id],
		references: [users.id]
	}),
	regression_analysis_result: one(regression_analysis_results, {
		fields: [prediction_weight_history.analysis_id],
		references: [regression_analysis_results.id]
	}),
}));

export const regression_analysis_resultsRelations = relations(regression_analysis_results, ({many}) => ({
	prediction_weight_histories: many(prediction_weight_history),
	regression_metric_results: many(regression_metric_results),
}));

export const regression_metric_resultsRelations = relations(regression_metric_results, ({one}) => ({
	regression_analysis_result: one(regression_analysis_results, {
		fields: [regression_metric_results.analysis_id],
		references: [regression_analysis_results.id]
	}),
}));

export const team_efficiency_ratingsRelations = relations(team_efficiency_ratings, ({one}) => ({
	team: one(teams, {
		fields: [team_efficiency_ratings.team_id],
		references: [teams.id]
	}),
}));