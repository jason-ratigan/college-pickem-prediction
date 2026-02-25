# App Architecture: College Pick'em

## Purpose

College Pick'em is a sophisticated statistical analysis platform for college football prediction, designed for data-driven analysts who want to make informed weekly picks. The core workflow centers around processing 10 weekly games (with spreads or straight up/down predictions plus a tiebreaker score) using advanced opponent-adjusted performance metrics.

The platform's core innovation is its **Relative Performance Analysis Engine**. The system analyzes how teams perform against opponents relative to those opponents' typical performance against other teams. For example: if Team A gains 300 passing yards against Team B's defense, and Team B typically allows 200 passing yards, then Team A "overperformed" by +100 yards while Team B "underperformed" by -100 yards. These relative strengths and weaknesses are tracked across all game phases (passing, rushing, scoring, field goals, special teams) and used to predict future matchup outcomes.

The platform provides comprehensive navigation through historical and future games, team-by-team analysis, and tools for incorporating personal judgment (injuries, situational factors) into the statistical foundation. Users can establish favorite teams and track their analytical process across seasons.

## Core User Journeys

### 1. Weekly Analysis Workflow: The Primary Use Case

This is the main workflow for making informed weekly picks.

1.  **Weekly Game Set Review:** User navigates to the current week's 10 games. Each game shows basic matchup info, spread/line, and the system's initial statistical prediction based on relative performance analysis.
2.  **Deep Dive Analysis:** For each game, user can drill down to see the detailed statistical breakdown:
    - How Team A's passing offense performed against previous opponents relative to those defenses' typical performance
    - How Team B's pass defense has performed relative to the offenses they've faced
    - Similar analysis across rushing, scoring, field goals, special teams, turnovers, etc.
3.  **Contextual Adjustment:** User reviews injury reports, weather, situational factors and can adjust the statistical prediction with their own judgment.
4.  **Pick Submission:** User submits their 10 picks (with spread considerations) plus tiebreaker score prediction.

### 2. Historical Analysis & Team Research

Supporting workflows for deeper understanding.

1.  **Team Performance Tracking:** Navigate to any team to see their season-long relative performance trends across all statistical categories. View how they've performed against different types of opponents.
2.  **Game-by-Game Analysis:** Review any historical game to see the detailed statistical breakdown and how it compared to pre-game predictions.
3.  **Opponent Strength Analysis:** Understand the quality of competition each team has faced to better contextualize their statistics.

### 3. Navigation & Data Management

Essential platform navigation capabilities.

1.  **Multi-Year/Week Navigation:** Seamlessly browse between any week of any season to review historical data or look ahead to future games.
2.  **Favorite Team Tracking:** Set and track favorite team(s) with enhanced visibility across all views.
3.  **Personal Notes & Tracking:** Add personal observations and track prediction accuracy over time.

## Scale Considerations

**Target Scale**: Designed to support **10,000+ users**, with a data backend capable of storing and analyzing decades of historical game data.

**Performance Requirements**:

- Sub-250ms response time for fetching team profiles and matchup predictions.
- Efficient, asynchronous background jobs for weekly data ingestion and strength model recalculation. The user-facing API should not be blocked by these intensive tasks.
- Scalable database design capable of querying millions of historical stats records.

# Tech Stack

- **Frontend**: React.js (with Tailwind CSS and shadcn/ui), React Router, Axios, React Query (TanStack Query)
- **Backend**: Node.js with Express.js (REST API) in **TypeScript**
- **Relational Database**: **PostgreSQL** (via `pg`) - Serves as the single System of Record for all user data, game schedules, picks, historical stats, and calculated strength ratings.
- **Caching & Job Queuing**: **Redis** for:
  1.  **API Caching**: Caching expensive or non-volatile API responses (e.g., weekly predictions, team profiles).
  2.  **Session Management**: Storing user sessions for stateless scaling.
  3.  **Background Job Queue**: Managing the queue for data ingestion and model calculation jobs to ensure they are processed asynchronously.
- **Authentication**: bcrypt with session-based auth (`express-session`) using a Redis session store.
- **External Data Source**: **College Football Data API** (or similar sports data provider) for game schedules, results, and box score statistics.

## Architecture

# Backend Architecture

The backend follows a strict, multi-layered Controller-Service-Repository (C-S-R) architecture to ensure separation of concerns, testability, and maintainability.

#### Data Layer (PostgreSQL & Schema)

PostgreSQL serves as the single source of truth for all application data. The schema is designed to separate raw, ingested data from calculated, analytical data for clarity and performance.

### Database Schema

First, the custom data types (ENUMs) used for consistency:

- **`user_role_enum`**: Defines the user's role (`'player'`, `'admin'`).

---

#### Core Entities

- **`users`**: `id` (uuid, PK, default: `gen_random_uuid()`), `full_name` (varchar), `email` (varchar, unique, NOT NULL), `password_hash` (varchar, NOT NULL), `role` (user_role_enum, NOT NULL, default: `'player'`), `favorite_team` (integer, FK to `teams.id`), `created_at` (timestamptz, default: `now()`) - User accounts.
  - _Indexes_:
    - **`users_pkey`**: `(id)` - Primary Key.
    - **`users_email_key`**: `(email)` - UNIQUE constraint for fast lookups by email.
- **`teams`**: `id` (serial, PK), `api_team_id` (integer, unique), `name` (varchar, unique, NOT NULL), `conference` (varchar), `logo_url` (text) - List of all college football teams.
  - _Indexes_:
    - **`teams_pkey`**: `(id)` - Primary Key.
    - **`teams_api_team_id_key`**: `(api_team_id)` - UNIQUE constraint for mapping to external data source.
- **`games`**: `id` (serial, PK), `api_game_id` (bigint, unique), `season` (integer, NOT NULL), `week` (integer, NOT NULL), `game_time` (timestamptz), `home_team_id` (integer, FK to `teams.id`), `away_team_id` (integer, FK to `teams.id`), `home_team_score` (integer), `away_team_score` (integer), `spread` (decimal), `over_under` (decimal), `is_final` (boolean, default: false), `is_featured_game` (boolean, default: false) - Game schedule, betting lines, and final results.
  - _Indexes_:
    - **`games_pkey`**: `(id)` - Primary Key.
    - **`games_season_week_idx`**: `(season, week)` - Composite index to quickly fetch all games for a specific week.
    - **`games_api_game_id_key`**: `(api_game_id)` - UNIQUE constraint for mapping to external data source.

#### User Interactions & Weekly Picks

- **`weekly_pick_sets`**: `id` (uuid, PK, default: `gen_random_uuid()`), `user_id` (uuid, NOT NULL, FK to `users.id`), `season` (integer, NOT NULL), `week` (integer, NOT NULL), `tiebreaker_score` (integer), `submitted_at` (timestamptz), `total_correct` (integer), `created_at` (timestamptz, default: `now()`) - Represents a user's complete set of 10 picks for a given week.

  - _Constraints_:
    - **`weekly_picks_user_season_week_unique`**: `UNIQUE (user_id, season, week)` - One pick set per user per week.
  - _Indexes_:
    - **`weekly_pick_sets_pkey`**: `(id)` - Primary Key.
    - **`weekly_pick_sets_user_season_week_idx`**: `(user_id, season, week)` - Quick lookup for user's weekly picks.

- **`picks`**: `id` (uuid, PK, default: `gen_random_uuid()`), `pick_set_id` (uuid, NOT NULL, FK to `weekly_pick_sets.id`), `game_id` (integer, NOT NULL, FK to `games.id`), `picked_team_id` (integer, NOT NULL, FK to `teams.id`), `confidence_level` (integer), `personal_notes` (text), `statistical_prediction` (jsonb), `is_correct` (boolean), `created_at` (timestamptz, default: `now()`) - Individual game picks within a weekly set.
  - _Constraints_:
    - **`picks_set_game_unique`**: `UNIQUE (pick_set_id, game_id)` - One pick per game per set.
  - _Indexes_:
    - **`picks_pkey`**: `(id)` - Primary Key.
    - **`picks_set_id_idx`**: `(pick_set_id)` - Fetch all picks in a set.

#### Analytics Engine Data

- **`game_box_score_stats`**: `id` (serial, PK), `game_id` (integer, NOT NULL, FK to `games.id`), `team_id` (integer, NOT NULL, FK to `teams.id`), `pass_yards` (integer), `pass_attempts` (integer), `pass_completions` (integer), `rush_yards` (integer), `rush_attempts` (integer), `total_yards` (integer), `points_scored` (integer), `turnovers` (integer), `fumbles_lost` (integer), `interceptions_thrown` (integer), `sacks_allowed` (integer), `sacks_made` (integer), `field_goals_made` (integer), `field_goals_attempted` (integer), `punts` (integer), `punt_yards` (integer), `penalties` (integer), `penalty_yards` (integer), `time_of_possession` (interval), `third_down_conversions` (integer), `third_down_attempts` (integer), `fourth_down_conversions` (integer), `fourth_down_attempts` (integer), `red_zone_scores` (integer), `red_zone_attempts` (integer) - Comprehensive box score statistics for detailed analysis.

  - _Constraints_:
    - **`box_score_game_team_unique`**: `UNIQUE (game_id, team_id)` - A team can only have one box score per game.
  - _Indexes_:
    - **`game_box_score_stats_pkey`**: `(id)` - Primary Key.
    - **`box_score_team_season_idx`**: `(team_id, season)` - Efficient team season lookups.

- **`relative_performance_metrics`**: `id` (serial, PK), `game_id` (integer, NOT NULL, FK to `games.id`), `team_id` (integer, NOT NULL, FK to `teams.id`), `opponent_id` (integer, NOT NULL, FK to `teams.id`), `pass_yards_vs_avg` (decimal), `rush_yards_vs_avg` (decimal), `points_vs_avg` (decimal), `turnovers_vs_avg` (decimal), `sacks_vs_avg` (decimal), `field_goal_pct_vs_avg` (decimal), `third_down_pct_vs_avg` (decimal), `red_zone_pct_vs_avg` (decimal), `calculated_at` (timestamptz, default: `now()`) - **Core analytical output.** Stores how each team performed relative to their opponent's typical performance against other teams.

  - _Constraints_:
    - **`relative_perf_game_team_unique`**: `UNIQUE (game_id, team_id)` - One relative performance record per team per game.
  - _Indexes_:
    - **`relative_performance_metrics_pkey`**: `(id)` - Primary Key.
    - **`relative_perf_team_season_idx`**: `(team_id, season)` - Team season performance tracking.

- **`team_strength_ratings`**: `id` (serial, PK), `season` (integer, NOT NULL), `week` (integer, NOT NULL), `team_id` (integer, NOT NULL, FK to `teams.id`), `pass_offense_strength` (decimal), `rush_offense_strength` (decimal), `pass_defense_strength` (decimal), `rush_defense_strength` (decimal), `scoring_offense_strength` (decimal), `scoring_defense_strength` (decimal), `turnover_margin_strength` (decimal), `special_teams_strength` (decimal), `overall_offensive_rating` (decimal), `overall_defensive_rating` (decimal), `strength_of_schedule` (decimal), `calculated_at` (timestamptz, default: `now()`) - **Aggregated strength ratings** derived from relative performance metrics, updated weekly.
  - _Constraints_:
    - **`ratings_season_week_team_unique`**: `UNIQUE (season, week, team_id)` - A team can only have one set of ratings per week.
  - _Indexes_:
    - **`team_strength_ratings_pkey`**: `(id)` - Primary Key.
    - **`ratings_team_id_season_week_idx`**: `(team_id, season, week)` - Composite index to efficiently fetch the latest ratings for a team.

---

### The C-S-R Pattern (Controller-Service-Repository)

- **Controllers (`/backend/src/controllers`)**: Handle HTTP requests and responses. They validate input, call services, and format the final JSON response. They contain zero business logic.
- **Services (`/backend/src/services`)**: Execute the core business logic. They orchestrate complex operations, perform calculations, and coordinate calls to repositories.
- **Repositories (`/backend/src/repositories`)**: The data access layer. They contain only the code necessary to query the PostgreSQL database.

### Repository Layer Breakdown

- **`userRepository.ts`**: Manages data access for the `users` table (create, find by email/ID).
- **`teamRepository.ts`**: Manages data for the `teams` table (find, search, get all).
- **`gameRepository.ts`**: Fetches game data, schedules for a week, and game details from the `games` table.
- **`pickRepository.ts`**: Manages all user pick operations (create, update, fetch for user).
- **`boxScoreRepository.ts`**: Handles writes and reads for the raw `game_box_score_stats` data.
- **`strengthRatingRepository.ts`**: Manages writes and reads for the calculated `team_strength_ratings` data. This is crucial for fetching data for the prediction engine.
- **`teamClassificationRepository.ts`**: Handles data access for team classifications, including retrieving classifications by various criteria and updating classification data.
- **`adminRepository.ts`**: Contains queries used exclusively by the administrative dashboard (e.g., get job statuses, user counts).

### Service Layer Breakdown

#### Analytical Engine Services

- **`dataIngestionService.ts`**: A background service responsible for all communication with the external sports data API. It fetches game schedules, final scores, betting lines, and comprehensive box scores. It then transforms and saves this raw data to the `games` and `game_box_score_stats` tables. This service is designed to be run as a scheduled job.
- **`relativePerformanceService.ts`**: **The core analytical engine.** This service calculates how each team performed relative to their opponent's typical performance. For each completed game, it determines the opponent's average performance against other teams, then calculates the variance from that average. These relative performance metrics are stored in the `relative_performance_metrics` table.
- **`strengthRatingService.ts`**: Aggregates relative performance metrics into weekly team strength ratings across all game phases (passing, rushing, scoring, defense, special teams). Updates the `team_strength_ratings` table with rolling averages and trend analysis.
- **`teamClassificationService.ts`**: Defines how teams are classified (e.g., tier 1, tier 2) based on statistical metrics, assigning and updating these classifications.
- **`predictionService.ts`**: Uses team strength ratings and relative performance history to generate game predictions. Analyzes matchup-specific advantages (e.g., strong passing offense vs weak pass defense) and produces expected outcomes with confidence intervals.
- **`gameAnalysisService.ts`**: Provides detailed breakdowns for individual games, showing statistical advantages, historical performance against similar opponents, and contextual factors that might influence the outcome.

#### Core Application Services

- **`authService.ts`**: Handles user registration, login, logout, session management, and favorite team preferences.
- **`pickService.ts`**: Manages weekly pick sets (10 games + tiebreaker), individual pick updates, personal notes, and confidence tracking. Includes validation for submission deadlines and pick set completeness.
- **`teamService.ts`**: Orchestrates comprehensive team data including profiles, strength ratings, relative performance trends, schedules, and historical analysis.
- **`navigationService.ts`**: Handles season/week navigation, game filtering, and historical data browsing across multiple years.
- **`adminService.ts`**: Contains logic for administrative functions, such as manually triggering data ingestion, relative performance calculations, and strength rating updates via Redis queues.
- **`cacheService.ts`**: A centralized service for interacting with the Redis cache to improve performance, especially for complex analytical queries.

---

# Frontend Architecture

The frontend is a modern, component-driven Single Page Application (SPA) built with React.

### Core Principles

- **State Management**: `React Query (TanStack Query)` is the default for all server state. `Zustand` or `Context API` will be used for global UI state like the logged-in user.
- **Styling**: `Tailwind CSS` with `shadcn/ui` for a library of accessible, pre-built components.
- **API Client**: A single, pre-configured `axios` instance is used for all backend communication to centralize error handling and authentication token management.

### Directory Structure

#### Reusable UI Components (`/frontend/src/components`)

- `/ui`: Base components from `shadcn/ui` (Button, Card, Dialog, etc.).
- `/admin`: Components used exclusively on the Admin Dashboard.
- `/` (Root): Application-specific reusable components.
  - `GameCard.tsx`: Displays a single game matchup on the pick sheet.
  - `LeaderboardRow.tsx`: A single row in the standings table.
  - `MatchupTaleOfTheTape.tsx`: A side-by-side comparison of two teams' strength ratings.
  - `PredictionCard.tsx`: Displays a game with the model's prediction.
  - `StatsChart.tsx`: A visual representation (e.g., bar chart) of a team's ratings.
  - `TeamHeader.tsx`: The header component for a team's profile page.

#### Application Pages (`/frontend/src/pages`)

- `LoginPage.tsx` -> `/login`
- `RegisterPage.tsx` -> `/register`
- `WeeklyPicksPage.tsx` -> `/picks/:season/:week` - Main weekly analysis and pick submission interface
- `GameAnalysisPage.tsx` -> `/games/:gameId/analysis` - Deep dive statistical analysis for individual games
- `TeamProfilePage.tsx` -> `/teams/:teamId` - Comprehensive team performance and trends
- `TeamComparisonPage.tsx` -> `/teams/:teamId/vs/:opponentId` - Head-to-head team comparison
- `HistoricalGamesPage.tsx` -> `/games/:season/:week?` - Navigate through historical games by season/week
- `PredictionsPage.tsx` -> `/predictions/:season/:week` - System predictions with statistical breakdowns
- `MyPicksHistoryPage.tsx` -> `/my-picks` - Personal pick tracking and accuracy analysis
- `AdminDashboardPage.tsx` -> `/admin` (Protected Route)

---

# Data Flow & Key Processes

### The Weekly Data Refresh & Calculation Flow (Background Job)

This is the core asynchronous process that powers the entire analytical engine.

1.  **Trigger**: The process is initiated either on a schedule (e.g., every Tuesday morning via a cron job) or by an admin via an API call.
2.  **Enqueue Job**: The `adminService` pushes a job (e.g., `{ type: 'INGEST_AND_CALCULATE', season: 2025, week: 5 }`) into a **Redis** queue.
3.  **Data Ingestion**: A background worker process consumes the job. It calls the `dataIngestionService`.
    a. The service makes API calls to the external data source to fetch results and box scores for the specified week.
    b. It saves all new data transactionally into the `games` and `game_box_score_stats` tables in **PostgreSQL**.
4.  **Strength Model Calculation**: Once ingestion is complete, the worker calls the `strengthRatingService`.
    a. The service reads all relevant historical data for the season from the PostgreSQL database.
    b. It runs the intensive **Opponent-Adjusted Strength Model** calculations in memory.
    c. It saves the newly calculated ratings for every team into the `team_strength_ratings` table.
5.  **Cache Invalidation**: The worker invalidates any relevant keys in the **Redis** cache (e.g., the cache for the weekly predictions page).
6.  **Completion**: The job is marked as complete. The platform is now ready with fresh data and predictions for the upcoming week.

---

# API Endpoints (RESTful Contract)

All endpoints are prefixed with `/api/v1`.

### Authentication

_Handled by: `authService`_

- **`POST /auth/register`**: Create a new user account.
- **`POST /auth/login`**: Authenticate a user and create a session.
- **`POST /auth/logout`**: Destroy the user's session.
- **`GET /auth/me`**: Get the profile of the currently authenticated user.
- **`PUT /auth/favorite-team`**: Set or update the user's favorite team.

### Weekly Picks & Analysis

_Handled by: `pickService`, `gameAnalysisService`_

- **`GET /games/week/:season/:week`**: Get the list of games for a specific week with basic matchup info and spreads.
- **`GET /games/:gameId/analysis`**: Get detailed statistical analysis for a specific game matchup.
- **`POST /picks/weekly`**: Submit a complete set of 10 weekly picks plus tiebreaker.
- **`GET /picks/my-picks/:season/:week`**: Get the current user's picks for a given week, including results and analysis.
- **`PUT /picks/:pickId/notes`**: Update personal notes and confidence level for a specific pick.
- **`GET /picks/history/:userId`**: Get historical pick performance and accuracy trends.

### Analytics & Predictions (The Engine)

_Handled by: `teamService`, `predictionService`, `relativePerformanceService`_

- **`GET /teams/:teamId/profile`**: Get comprehensive team profile with strength ratings, performance trends, and schedule.
- **`GET /teams/:teamId/relative-performance`**: Get detailed relative performance metrics across all games.
- **`GET /teams/:teamId/vs/:opponentId`**: Get head-to-head comparison with historical matchups and predictions.
- **`GET /predictions/week/:season/:week`**: Get statistical predictions for all games in a given week.
- **`GET /predictions/game/:gameId`**: Get detailed prediction breakdown for a specific game.
- **`GET /games/historical/:season/:week?`**: Navigate through historical games with filtering options.
- **`GET /teams/:teamId/strength-trends/:season`**: Get weekly strength rating progression throughout a season.

### Admin

_Handled by: `adminService`_

- **`GET /admin/dashboard-stats`**: Get statistics for the admin dashboard.
- **`POST /admin/jobs/ingest-data`**: Manually trigger a data ingestion job.
- **`POST /admin/jobs/calculate-ratings`**: Manually trigger a strength model calculation job.
- **`GET /admin/jobs/status`**: Check the status of running background jobs.

---

# Code Quality & Conventions

- **Architectural Pattern**: The **Controller-Service-Repository (C-S-R)** pattern is mandatory for all backend development.
- **Language**: **TypeScript** is required for all new code in both the frontend and backend. The `any` type is forbidden.
- **Code Style**: **Prettier** and **ESLint** will be used for automated code formatting and linting, enforced by pre-commit hooks.
- **Asynchronous Code**: **`async/await`** is the required standard.
- **API Design**: All API endpoints must be **RESTful**.
- **State Management**: Server state is managed by `React Query`. Do not use `useEffect` for data fetching. State should be colocated where possible. Lift state only when necessary.
