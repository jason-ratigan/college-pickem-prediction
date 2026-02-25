ALTER TABLE "prediction_validation_log" ADD COLUMN "confidence_interval_lower" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "prediction_validation_log" ADD COLUMN "confidence_interval_upper" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "prediction_validation_log" ADD COLUMN "prediction_reliability" varchar(10);--> statement-breakpoint
ALTER TABLE "prediction_validation_log" ADD COLUMN "model_r_squared" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "prediction_validation_log" ADD COLUMN "statistical_confidence" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" ADD COLUMN "regression_metrics" text;--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" ADD COLUMN "scoring_r_squared" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" ADD COLUMN "passing_r_squared" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" ADD COLUMN "rushing_r_squared" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" ADD COLUMN "turnover_r_squared" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" ADD COLUMN "overall_model_fit" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" ADD COLUMN "statistical_significance_score" numeric(5, 4);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prediction_validation_reliability_idx" ON "prediction_validation_log" ("prediction_reliability");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prediction_validation_model_r_squared_idx" ON "prediction_validation_log" ("model_r_squared");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_efficiency_overall_model_fit_idx" ON "team_efficiency_ratings" ("overall_model_fit");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_efficiency_statistical_significance_idx" ON "team_efficiency_ratings" ("statistical_significance_score");