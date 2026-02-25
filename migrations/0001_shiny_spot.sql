ALTER TABLE "team_efficiency_ratings" RENAME COLUMN "pass_offense_efficiency" TO "passing_offense_efficiency";--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" RENAME COLUMN "rush_offense_efficiency" TO "rushing_offense_efficiency";--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" RENAME COLUMN "pass_defense_efficiency" TO "passing_defense_efficiency";--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" RENAME COLUMN "rush_defense_efficiency" TO "rushing_defense_efficiency";--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" ADD COLUMN "total_offense_efficiency" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" ADD COLUMN "total_defense_efficiency" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" ADD COLUMN "interception_efficiency" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" ADD COLUMN "interception_defense_efficiency" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" ADD COLUMN "sack_offense_efficiency" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" ADD COLUMN "sack_defense_efficiency" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" ADD COLUMN "field_goal_efficiency" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" ADD COLUMN "convergence_score" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "team_efficiency_ratings" ADD COLUMN "confidence_level" varchar(10);