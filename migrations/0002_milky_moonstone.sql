CREATE TABLE IF NOT EXISTS "data_quality_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"check_type" varchar(50) NOT NULL,
	"overall_score" integer,
	"teams_checked" integer,
	"issues_found" integer,
	"critical_issues" integer,
	"warning_issues" integer,
	"recommendations" text,
	"check_details" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prediction_validation_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"original_home_score" integer,
	"original_away_score" integer,
	"corrected_home_score" integer,
	"corrected_away_score" integer,
	"validation_result" varchar(20) NOT NULL,
	"validation_issues" text,
	"correction_reason" text,
	"prediction_method" varchar(50),
	"confidence" numeric(3, 2),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_error_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"error_type" varchar(50) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"component" varchar(100),
	"error_message" text NOT NULL,
	"error_stack" text,
	"context_data" text,
	"user_id" uuid,
	"session_id" varchar(100),
	"resolved" boolean DEFAULT false,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "statistical_processing_log" ADD COLUMN "status" varchar(20) DEFAULT 'completed';--> statement-breakpoint
ALTER TABLE "statistical_processing_log" ADD COLUMN "error_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "statistical_processing_log" ADD COLUMN "warning_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "statistical_processing_log" ADD COLUMN "error_details" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "data_quality" varchar(20) DEFAULT 'Unknown';--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "last_synced" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "sync_errors" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "conflict_resolution_notes" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prediction_validation_log" ADD CONSTRAINT "prediction_validation_log_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "system_error_log" ADD CONSTRAINT "system_error_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "system_error_log" ADD CONSTRAINT "system_error_log_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_log_type_idx" ON "system_error_log" ("error_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_log_severity_idx" ON "system_error_log" ("severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_log_created_at_idx" ON "system_error_log" ("created_at");