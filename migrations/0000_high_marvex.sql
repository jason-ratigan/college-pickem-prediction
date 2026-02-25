DO $$ BEGIN
 CREATE TYPE "public"."postseason_type_enum" AS ENUM('bowl', 'playoff', 'championship');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."season_type_enum" AS ENUM('regular', 'postseason');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."user_role_enum" AS ENUM('player', 'admin');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game_box_score_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"completion_attempts" varchar(15),
	"net_passing_yards" integer,
	"passing_tds" integer,
	"rushing_yards" integer,
	"rushing_attempts" integer,
	"rushing_tds" integer,
	"total_yards" integer,
	"first_downs" integer,
	"turnovers" integer,
	"fumbles_lost" integer,
	"interceptions_thrown" integer,
	"possession_time" varchar(15),
	"sacks" numeric(4, 1),
	"tackles_for_loss" numeric(4, 1),
	"fumbles_recovered" integer,
	"interceptions" integer,
	"passes_deflected" integer,
	"qb_hurries" integer,
	"defensive_tds" integer,
	"kick_return_yards" integer,
	"punt_return_yards" integer,
	"third_down_eff" varchar(15),
	"fourth_down_eff" varchar(15),
	"total_penalties_yards" varchar(15),
	"red_zone_attempts" integer,
	"red_zone_scores" integer,
	"field_goal_attempts" integer,
	"field_goals_made" integer,
	"punt_return_tds" integer,
	"kick_return_tds" integer,
	"time_of_possession_seconds" integer,
	"off_plays" integer,
	"off_drives" integer,
	"off_ppa" numeric,
	"off_success_rate" numeric,
	"off_explosiveness" numeric,
	"off_power_success" numeric,
	"off_stuff_rate" numeric,
	"off_line_yards" numeric,
	"off_second_level_yards" numeric,
	"off_open_field_yards" numeric,
	"def_plays" integer,
	"def_drives" integer,
	"def_ppa" numeric,
	"def_success_rate" numeric,
	"def_explosiveness" numeric,
	"def_power_success" numeric,
	"def_stuff_rate" numeric,
	"def_line_yards" numeric,
	"def_second_level_yards" numeric,
	"def_open_field_yards" numeric
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_game_id" integer,
	"season" integer NOT NULL,
	"week" integer NOT NULL,
	"season_type" "season_type_enum" DEFAULT 'regular' NOT NULL,
	"postseason_type" "postseason_type_enum",
	"game_time" timestamp with time zone,
	"home_team_id" integer NOT NULL,
	"away_team_id" integer NOT NULL,
	"home_team_score" integer,
	"away_team_score" integer,
	"spread" numeric(4, 1),
	"over_under" numeric(4, 1),
	"is_final" boolean DEFAULT false,
	"is_featured_game" boolean DEFAULT false,
	CONSTRAINT "games_api_game_id_unique" UNIQUE("api_game_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"game_id" integer NOT NULL,
	"picked_team_id" integer,
	"is_correct" boolean,
	"created_at" timestamp with time zone DEFAULT now(),
	"picked_against_spread" varchar(4)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "statistical_processing_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"process_type" varchar(50),
	"season" integer,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"games_processed" integer,
	"teams_updated" integer,
	"iterations_required" integer,
	"converged" boolean,
	"processing_time_ms" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_efficiency_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"team_id" integer NOT NULL,
	"pass_offense_efficiency" numeric(8, 4),
	"rush_offense_efficiency" numeric(8, 4),
	"scoring_offense_efficiency" numeric(8, 4),
	"pass_defense_efficiency" numeric(8, 4),
	"rush_defense_efficiency" numeric(8, 4),
	"scoring_defense_efficiency" numeric(8, 4),
	"turnover_efficiency" numeric(8, 4),
	"special_teams_efficiency" numeric(8, 4),
	"average_points_for" numeric(5, 2),
	"average_points_against" numeric(5, 2),
	"games_played" integer NOT NULL,
	"data_quality" varchar(20),
	"last_calculated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_strength_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"week" integer NOT NULL,
	"team_id" integer NOT NULL,
	"offense_rating_adjusted" numeric(8, 4),
	"defense_rating_adjusted" numeric(8, 4),
	"pass_offense_rating" numeric(8, 4),
	"rush_offense_rating" numeric(8, 4),
	"pass_defense_rating" numeric(8, 4),
	"rush_defense_rating" numeric(8, 4),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_team_id" integer,
	"name" varchar(255) NOT NULL,
	"conference" varchar(100),
	"logo_url" text,
	"classification" varchar(10),
	CONSTRAINT "teams_api_team_id_unique" UNIQUE("api_team_id"),
	CONSTRAINT "teams_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(100),
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" "user_role_enum" DEFAULT 'player' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_box_score_stats" ADD CONSTRAINT "game_box_score_stats_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_box_score_stats" ADD CONSTRAINT "game_box_score_stats_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "games" ADD CONSTRAINT "games_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "games" ADD CONSTRAINT "games_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "picks" ADD CONSTRAINT "picks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "picks" ADD CONSTRAINT "picks_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "picks" ADD CONSTRAINT "picks_picked_team_id_teams_id_fk" FOREIGN KEY ("picked_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_efficiency_ratings" ADD CONSTRAINT "team_efficiency_ratings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_strength_ratings" ADD CONSTRAINT "team_strength_ratings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "box_score_game_team_unique_idx" ON "game_box_score_stats" ("game_id","team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "games_season_week_idx" ON "games" ("season","week");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "games_season_type_idx" ON "games" ("season_type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "picks_user_game_unique_idx" ON "picks" ("user_id","game_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "efficiency_ratings_season_team_unique_idx" ON "team_efficiency_ratings" ("season","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ratings_season_week_team_unique_idx" ON "team_strength_ratings" ("season","week","team_id");