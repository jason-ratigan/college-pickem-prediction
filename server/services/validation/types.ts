// server/services/validation/types.ts

/**
 * Core validation infrastructure types for regression analysis validation system
 * Requirements: 1.4, 7.2
 */

// =============================================================================
// CORE VALIDATION TYPES
// =============================================================================

export interface ValidationResult {
  isValid: boolean;
  score: number; // 0-100 quality score
  errors: ValidationError[];
  warnings: ValidationWarning[];
  recommendations: string[];
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ValidationError {
  code: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  component: string;
  details?: Record<string, any>;
}

export interface ValidationWarning {
  code: string;
  message: string;
  component: string;
  details?: Record<string, any>;
}

// =============================================================================
// CALCULATION TRACING TYPES
// =============================================================================

export interface CalculationTrace {
  traceId: string;
  gameId?: number;
  homeTeamId: number;
  awayTeamId: number;
  season: number;
  steps: CalculationStep[];
  finalPrediction?: any;
  validationResults: StepValidationResult[];
  startTime: Date;
  endTime?: Date;
  metadata?: Record<string, any>;
}

export interface CalculationStep {
  stepNumber: number;
  stepType: 'data_extraction' | 'baseline_calculation' | 'efficiency_calculation' | 'weight_application' | 'prediction_assembly';
  description: string;
  inputs: Record<string, any>;
  calculation: string;
  output: any;
  isValid: boolean;
  executionTime?: number; // milliseconds
  metadata?: Record<string, any>;
}

export interface StepValidationResult {
  stepNumber: number;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  mathematicallyCorrect: boolean;
  withinBounds: boolean;
  details?: Record<string, any>;
}

// =============================================================================
// DATA PIPELINE VALIDATION TYPES
// =============================================================================

export interface DataValidationResult extends ValidationResult {
  dataCompleteness: number; // 0-100 percentage
  dataConsistency: number; // 0-100 percentage
  missingFields: string[];
  invalidValues: Array<{
    field: string;
    value: any;
    reason: string;
  }>;
  qualityMetrics: DataQualityMetrics;
}

export interface DataQualityMetrics {
  completenessScore: number; // 0-100
  consistencyScore: number; // 0-100
  validityScore: number; // 0-100
  timelinessScore: number; // 0-100
  overallScore: number; // 0-100
  gamesAnalyzed: number;
  fieldsChecked: number;
  issuesFound: number;
}

export interface EfficiencyValidationResult extends ValidationResult {
  convergenceAchieved: boolean;
  iterationsRequired: number;
  maxIterations: number;
  convergenceTolerance: number;
  finalConvergenceScore: number;
  efficiencyBounds: {
    min: number;
    max: number;
    expectedRange: [number, number];
  };
  teamEfficiencies: Array<{
    teamId: number;
    efficiency: number;
    isWithinBounds: boolean;
    deviationFromExpected: number;
  }>;
}

// =============================================================================
// REGRESSION ANALYSIS VALIDATION TYPES
// =============================================================================

export interface RegressionValidationResult extends ValidationResult {
  modelFit: ModelFitMetrics;
  statisticalSignificance: StatisticalSignificanceResult;
  assumptions: ModelAssumptionResults;
  predictivePower: PredictivePowerMetrics;
  coefficients: CoefficientValidationResult[];
}

export interface ModelFitMetrics {
  rSquared: number;
  adjustedRSquared: number;
  residualStandardError: number;
  fStatistic: number;
  fPValue: number;
  sampleSize: number;
  degreesOfFreedom: number;
  isSignificant: boolean;
  meetsThresholds: boolean;
}

export interface StatisticalSignificanceResult {
  overallSignificant: boolean;
  rSquaredThreshold: number; // 0.2
  pValueThreshold: number; // 0.1
  significantPredictors: string[];
  nonSignificantPredictors: string[];
  significanceDetails: Array<{
    predictor: string;
    pValue: number;
    isSignificant: boolean;
    confidenceInterval: [number, number];
  }>;
}

export interface ModelAssumptionResults {
  linearity: AssumptionTest;
  homoscedasticity: AssumptionTest;
  normality: AssumptionTest;
  multicollinearity: MulticollinearityTest;
  sampleSizeAdequacy: SampleSizeTest;
  overallValid: boolean;
}

export interface AssumptionTest {
  testName: string;
  testStatistic: number;
  pValue: number;
  passed: boolean;
  details: string;
}

export interface MulticollinearityTest {
  vifValues: Array<{
    predictor: string;
    vif: number;
    problematic: boolean;
  }>;
  maxVif: number;
  vifThreshold: number; // typically 5 or 10
  passed: boolean;
}

export interface SampleSizeTest {
  sampleSize: number;
  minimumRequired: number;
  adequate: boolean;
  powerAnalysis?: {
    power: number;
    effectSize: number;
    alpha: number;
  };
}

export interface PredictivePowerMetrics {
  crossValidationR2: number;
  meanAbsoluteError: number;
  rootMeanSquareError: number;
  predictionAccuracy: number;
  overfittingRisk: 'low' | 'medium' | 'high';
}

export interface CoefficientValidationResult {
  predictor: string;
  coefficient: number;
  standardError: number;
  tStatistic: number;
  pValue: number;
  confidenceInterval: [number, number];
  isSignificant: boolean;
  isReasonable: boolean;
  expectedRange?: [number, number];
}

// =============================================================================
// WEIGHT CALCULATION VALIDATION TYPES
// =============================================================================

export interface WeightValidationResult extends ValidationResult {
  weightDerivation: WeightDerivationResult;
  weightBounds: WeightBoundsResult;
  weightApplication: WeightApplicationResult;
  weightHistory: WeightHistoryResult;
}

export interface WeightDerivationResult {
  isCorrect: boolean;
  derivationMethod: string;
  inputCoefficients: Record<string, number>;
  calculatedWeights: Record<string, number>;
  normalizationApplied: boolean;
  statisticalSignificanceConsidered: boolean;
  derivationSteps: Array<{
    step: string;
    input: any;
    output: any;
    isValid: boolean;
  }>;
}

export interface WeightBoundsResult {
  allWithinBounds: boolean;
  weightBounds: {
    min: number;
    max: number;
  };
  weightValues: Array<{
    category: string;
    weight: number;
    withinBounds: boolean;
    expectedRange: [number, number];
  }>;
  sumValidation: {
    totalSum: number;
    expectedSum: number;
    isValid: boolean;
  };
}

export interface WeightApplicationResult {
  correctlyApplied: boolean;
  predictionFormula: string;
  weightUsage: Array<{
    category: string;
    weight: number;
    value: number;
    contribution: number;
    isCorrect: boolean;
  }>;
  finalCalculation: {
    homeTeamScore: number;
    awayTeamScore: number;
    calculationSteps: string[];
  };
}

export interface WeightHistoryResult {
  hasCompleteHistory: boolean;
  changeCount: number;
  lastChange: Date | null;
  auditTrailComplete: boolean;
  changes: Array<{
    date: Date;
    reason: string;
    previousWeights: Record<string, number>;
    newWeights: Record<string, number>;
    changedBy?: string;
  }>;
  metadata?: Record<string, any>;
}

// =============================================================================
// PREDICTION ACCURACY TESTING TYPES
// =============================================================================

export interface AccuracyTestResult extends ValidationResult {
  sampleSize: number;
  testPeriod: {
    startDate: Date;
    endDate: Date;
    season: number;
  };
  winProbabilityAccuracy: WinAccuracyMetrics;
  scorePredictionAccuracy: ScoreAccuracyMetrics;
  confidenceCalibration: CalibrationMetrics;
  systematicBiases: BiasAnalysis[];
  predictionReliability: ReliabilityAnalysis;
}

export interface WinAccuracyMetrics {
  brierScore: number; // Lower is better (0-1)
  logLoss: number; // Lower is better
  accuracy: number; // Percentage correct (0-100)
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc: number;
}

export interface ScoreAccuracyMetrics {
  meanAbsoluteError: number;
  rootMeanSquareError: number;
  medianAbsoluteError: number;
  meanPercentageError: number;
  homeTeamAccuracy: {
    mae: number;
    rmse: number;
    bias: number;
  };
  awayTeamAccuracy: {
    mae: number;
    rmse: number;
    bias: number;
  };
}

export interface CalibrationMetrics {
  calibrationScore: number; // 0-100, higher is better
  overconfidenceRate: number; // 0-1
  underconfidenceRate: number; // 0-1
  calibrationCurve: Array<{
    predictedProbability: number;
    actualProbability: number;
    sampleSize: number;
  }>;
  reliabilityDiagram: {
    bins: number;
    expectedCalibrationError: number;
    maximumCalibrationError: number;
  };
}

export interface BiasAnalysis {
  biasType: 'home_team' | 'score_range' | 'conference' | 'team_strength' | 'game_type';
  description: string;
  magnitude: number;
  significance: number;
  affectedGames: number;
  examples: Array<{
    gameId: number;
    predicted: any;
    actual: any;
    bias: number;
  }>;
}

export interface ReliabilityAnalysis {
  overallReliability: 'high' | 'medium' | 'low';
  reliabilityByConfidence: Array<{
    confidenceRange: [number, number];
    accuracy: number;
    sampleSize: number;
    reliability: 'high' | 'medium' | 'low';
  }>;
  reliabilityByGameType: Array<{
    gameType: string;
    accuracy: number;
    sampleSize: number;
    reliability: 'high' | 'medium' | 'low';
  }>;
}

// =============================================================================
// SYSTEM HEALTH MONITORING TYPES
// =============================================================================

export interface SystemHealthStatus {
  overallHealth: 'excellent' | 'good' | 'fair' | 'poor';
  healthScore: number; // 0-100
  dataQuality: DataQualityStatus;
  modelHealth: ModelHealthStatus;
  predictionReliability: PredictionReliabilityStatus;
  alerts: SystemAlert[];
  lastUpdated: Date;
  trends: HealthTrends;
}

export interface DataQualityStatus {
  score: number; // 0-100
  status: 'excellent' | 'good' | 'fair' | 'poor';
  completeness: number;
  consistency: number;
  validity: number;
  timeliness: number;
  issueCount: number;
  criticalIssues: number;
}

export interface ModelHealthStatus {
  score: number; // 0-100
  status: 'excellent' | 'good' | 'fair' | 'poor';
  regressionModelFit: number;
  statisticalSignificance: number;
  convergenceStability: number;
  weightStability: number;
  lastSuccessfulAnalysis: Date | null;
}

export interface PredictionReliabilityStatus {
  score: number; // 0-100
  status: 'excellent' | 'good' | 'fair' | 'poor';
  accuracy: number;
  calibration: number;
  consistency: number;
  biasLevel: number;
  confidenceReliability: number;
}

export interface SystemAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  component: string;
  message: string;
  details: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  actionRequired: boolean;
  recommendations: string[];
}

export interface HealthTrends {
  dataQualityTrend: TrendData;
  modelHealthTrend: TrendData;
  predictionAccuracyTrend: TrendData;
  timeRange: {
    start: Date;
    end: Date;
    dataPoints: number;
  };
}

export interface TrendData {
  direction: 'improving' | 'stable' | 'declining';
  magnitude: number; // Rate of change
  significance: number; // Statistical significance of trend
  dataPoints: Array<{
    timestamp: Date;
    value: number;
  }>;
}

// =============================================================================
// SAMPLE GAME ANALYSIS TYPES
// =============================================================================

export interface GameAnalysisResult {
  gameId: number;
  gameInfo: {
    homeTeam: string;
    awayTeam: string;
    season: number;
    week: number;
    actualScore?: {
      home: number;
      away: number;
    };
  };
  prediction: {
    homeScore: number;
    awayScore: number;
    confidence: number;
    winProbability: {
      home: number;
      away: number;
    };
  };
  efficiencyBreakdown: EfficiencyBreakdown;
  keyFactors: KeyMatchupFactor[];
  predictionExplanation: PredictionExplanation;
  outcomeComparison?: OutcomeComparison;
}

export interface EfficiencyBreakdown {
  homeTeam: TeamEfficiencyBreakdown;
  awayTeam: TeamEfficiencyBreakdown;
  matchupAdvantages: MatchupAdvantage[];
}

export interface TeamEfficiencyBreakdown {
  teamId: number;
  teamName: string;
  overallEfficiency: number;
  categoryEfficiencies: Record<string, number>;
  opponentBaseline: number;
  adjustedEfficiencies: Record<string, number>;
  strengthsAndWeaknesses: {
    strengths: string[];
    weaknesses: string[];
  };
}

export interface MatchupAdvantage {
  category: string;
  homeTeamValue: number;
  awayTeamValue: number;
  advantage: 'home' | 'away' | 'neutral';
  magnitude: number;
  impact: 'high' | 'medium' | 'low';
}

export interface KeyMatchupFactor {
  factor: string;
  description: string;
  homeTeamRating: number;
  awayTeamRating: number;
  advantage: 'home' | 'away' | 'neutral';
  impactOnPrediction: number;
  weight: number;
}

export interface PredictionExplanation {
  summary: string;
  keyAdvantages: string[];
  riskFactors: string[];
  confidenceFactors: string[];
  statisticalBasis: {
    modelRSquared: number;
    sampleSize: number;
    significantPredictors: string[];
  };
  humanReadableExplanation: string;
}

export interface OutcomeComparison {
  predictionAccuracy: {
    winnerCorrect: boolean;
    scoreError: {
      home: number;
      away: number;
      total: number;
    };
    withinConfidenceInterval: boolean;
  };
  errorAnalysis: {
    errorType: 'statistical_noise' | 'systematic_bias' | 'model_limitation' | 'data_quality';
    errorMagnitude: number;
    possibleCauses: string[];
    lessons: string[];
  };
  predictionQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

// =============================================================================
// LOGGING AND ERROR HANDLING TYPES
// =============================================================================

export interface ValidationLogger {
  logValidation(component: string, result: ValidationResult): void;
  logError(component: string, error: ValidationError): void;
  logWarning(component: string, warning: ValidationWarning): void;
  logTrace(trace: CalculationTrace): void;
  getValidationHistory(component: string, limit?: number): ValidationResult[];
}

export interface ErrorHandler {
  handleValidationError(error: ValidationError): void;
  handleSystemError(error: Error, context: Record<string, any>): void;
  createValidationError(code: string, message: string, component: string, severity?: ValidationError['severity']): ValidationError;
  createValidationWarning(code: string, message: string, component: string): ValidationWarning;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export type ValidationComponent = 
  | 'data_pipeline'
  | 'regression_analysis'
  | 'weight_calculation'
  | 'prediction_accuracy'
  | 'calculation_tracer'
  | 'sample_game_analyzer'
  | 'system_health_monitor';

export type ValidationStatus = 'not_started' | 'in_progress' | 'completed' | 'failed';

export interface ValidationConfig {
  thresholds: {
    dataQuality: {
      minimumScore: number;
      completenessThreshold: number;
      consistencyThreshold: number;
    };
    regression: {
      rSquaredThreshold: number;
      pValueThreshold: number;
      sampleSizeMinimum: number;
    };
    weights: {
      minimumWeight: number;
      maximumWeight: number;
      sumTolerance: number;
    };
    accuracy: {
      minimumAccuracy: number;
      maximumBias: number;
      calibrationThreshold: number;
    };
  };
  alerts: {
    enabledComponents: ValidationComponent[];
    severityLevels: Array<'critical' | 'warning' | 'info'>;
    notificationMethods: string[];
  };
}