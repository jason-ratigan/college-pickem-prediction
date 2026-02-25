import { games, teams, picks, teamStrengthRatings } from './schema';
import type { TeamStrengthRatings } from './schema';

// Base types inferred from the database schema
export type TeamSelect = typeof teams.$inferSelect;
export type GameSelect = typeof games.$inferSelect;
export type PickSelect = typeof picks.$inferSelect;

// A game object with its related home and away team objects
export type GameWithTeams = GameSelect & {
  homeTeam: TeamSelect;
  awayTeam: TeamSelect;
};

// The fully enriched game object for the Games Hub, including predictions and user picks
export type TeamHeadlineStats = {
  pointsPerGame: number;
  pointsAllowedPerGame: number;
  totalYardsPerGame: number;
  totalYardsAllowedPerGame: number;
  passYardsPerGame: number;
  rushYardsPerGame: number;
  passYardsAllowedPerGame: number;
  rushYardsAllowedPerGame: number;
  turnoversLostPerGame: number;
  turnoversGainedPerGame: number;
  sacksPerGame: number;
  fgMadePerGame: number;
  fgAttPerGame: number;
};

// Enhanced prediction type with statistical confidence
export type EnhancedPrediction = {
  predictedWinner: number;
  confidence: number;
  expectedScore: { home: number; away: number; };
  winProbability: { home: number; away: number; };
  // Enhanced statistical confidence fields (Requirements: 5.5, 6.4)
  statisticalConfidence?: {
    modelRSquared: number;
    confidenceInterval: {
      home: [number, number];
      away: [number, number];
    };
    predictionReliability: 'High' | 'Medium' | 'Low';
    sampleSizeAdequate: boolean;
    weightsUsed?: Record<string, number>;
    weightsLastUpdated?: Date | null;
  };
  // Calculation breakdown for transparency
  calculationBreakdown?: {
    homeTeam: {
      opponentBaseline: number;
      efficiencyContributions: Record<string, number>;
      weightsUsed: Record<string, number>;
    };
    awayTeam: {
      opponentBaseline: number;
      efficiencyContributions: Record<string, number>;
      weightsUsed: Record<string, number>;
    };
  };
};

export type EnrichedGame = GameWithTeams & {
  prediction: {
    predictedWinner: number;
    confidence: number;
    expectedScore: { home: number; away: number; };
    winProbability: { home: number; away: number; };
    // Enhanced statistical confidence fields (Requirements: 5.5, 6.4)
    statisticalConfidence?: {
      modelRSquared: number;
      confidenceInterval: {
        home: [number, number];
        away: [number, number];
      };
      predictionReliability: 'High' | 'Medium' | 'Low';
      sampleSizeAdequate: boolean;
      weightsUsed?: Record<string, number>;
      weightsLastUpdated?: Date | null;
    };
    // Calculation breakdown for transparency
    calculationBreakdown?: {
      homeTeam: {
        opponentBaseline: number;
        efficiencyContributions: Record<string, number>;
        weightsUsed: Record<string, number>;
      };
      awayTeam: {
        opponentBaseline: number;
        efficiencyContributions: Record<string, number>;
        weightsUsed: Record<string, number>;
      };
    };
  } | null;
  userPick: PickSelect | null;
  headlineStats?: { home: TeamHeadlineStats; away: TeamHeadlineStats };
};

// Enhanced game type with predictions
export type GameWithPrediction = GameWithTeams & {
  prediction?: {
    winProbability: number;
    expectedScore: { team: number; opponent: number };
    confidence: number;
  };
};

// =============================================================================
// START: CORRECTED TYPES
// =============================================================================

// FIX: A new, complete, and reusable type for the statistical analysis data.
// This matches the data structure sent by the server and expected by the frontend.
export type StatisticalAnalysis = {
  offense: {
    passingYards: number;
    rushingYards: number;
    totalYards: number;
    pointsPerGame: number;
    thirdDownConversion: number;
    redZoneEfficiency: number;
  };
  defense: {
    passingYardsAllowed: number;
    rushingYardsAllowed: number;
    totalYardsAllowed: number;
    pointsAllowedPerGame: number;
    sacks: number;
    interceptions: number;
    tacklesForLoss: number;
  };
  strengths: string[];
  weaknesses: string[];
  // FIX: This crucial object was missing from the original inline type definition.
  efficiencyRatings?: {
    passOffense: number;
    rushOffense: number;
    scoringOffense: number;
    passDefense: number;
    rushDefense: number;
    scoringDefense: number;
    turnover: number;
    specialTeams: number;
    dataQuality: 'Excellent' | 'Good' | 'Limited' | 'Insufficient' | string;
  } | null;
};

// Team profile with complete information including schedule and statistics
export type TeamProfile = {
  team: TeamSelect;
  schedule: GameWithPrediction[];
  strengthRatings: TeamStrengthRatings | null;
  record: { wins: number; losses: number };
  nextGame: (GameWithTeams & { 
    winProbability: number;
    expectedScore?: { team: number; opponent: number };
    predictionConfidence?: number;
  }) | null;
  // FIX: Updated to use the new, complete StatisticalAnalysis type.
  statisticalAnalysis?: StatisticalAnalysis | null;
};

// =============================================================================
// TEAM STAT COMPARISON TYPES
// =============================================================================

// Offensive statistical categories
export type OffensiveStatCategory = 
  | 'passingOffense'
  | 'rushingOffense'
  | 'totalOffense'
  | 'scoringOffense'
  | 'thirdDownConversion'
  | 'redZoneEfficiency';

// Defensive statistical categories
export type DefensiveStatCategory = 
  | 'passingDefense'
  | 'rushingDefense'
  | 'totalDefense'
  | 'scoringDefense'
  | 'thirdDownDefense'
  | 'redZoneDefense';

// Combined type for all categories
export type StatCategory = OffensiveStatCategory | DefensiveStatCategory;

// Game-by-game comparison data
export interface StatComparisonData {
  gameId: number;
  week: number;
  opponent: {
    id: number;
    name: string;
    logoUrl: string | null;
  };
  isHomeGame: boolean;
  teamPerformance: number;
  opponentSeasonAverage: number;
  difference: number;
  percentageDifference: number;
  gameDate: string | null;
}

// Summary statistics
export interface StatComparisonSummary {
  averageTeamPerformance: number;
  averageOpponentDefense: number;
  overallDifference: number;
  gamesAboveAverage: number;
  gamesBelowAverage: number;
}

// Complete API response for stat comparison
export interface StatComparisonResponse {
  teamId: number;
  teamName: string;
  season: number;
  statCategory: string;
  games: StatComparisonData[];
  summary: StatComparisonSummary;
}