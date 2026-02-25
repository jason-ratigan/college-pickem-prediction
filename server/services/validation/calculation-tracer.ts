// server/services/validation/calculation-tracer.ts

import { 
  CalculationTrace, 
  CalculationStep, 
  StepValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationResult
} from './types.js';
import { ValidationLoggerImpl, ErrorHandlerImpl } from './core.js';
import { ValidationUtils } from './utils.js';

/**
 * Calculation Tracer - Provides detailed step-by-step tracking of prediction calculations
 * Requirements: 5.1, 5.2, 5.5
 */

export interface RawStatistics {
  teamId: number;
  season: number;
  passingYards: number;
  rushingYards: number;
  totalYards: number;
  pointsScored: number;
  passingYardsAllowed: number;
  rushingYardsAllowed: number;
  totalYardsAllowed: number;
  pointsAllowed: number;
  turnoversForced: number;
  turnoversCommitted: number;
  gamesPlayed: number;
}

export interface OpponentBaseline {
  teamId: number;
  season: number;
  avgPassingYardsAllowed: number;
  avgRushingYardsAllowed: number;
  avgTotalYardsAllowed: number;
  avgPointsAllowed: number;
  avgTurnoversForced: number;
  calculationSteps: string[];
}

export interface EfficiencyCalculation {
  teamId: number;
  season: number;
  passingEfficiency: number;
  rushingEfficiency: number;
  scoringEfficiency: number;
  defensiveEfficiency: number;
  turnoverEfficiency: number;
  overallEfficiency: number;
  calculationSteps: string[];
  iterationData?: {
    iteration: number;
    previousEfficiency: number;
    convergenceValue: number;
  };
}

export class CalculationTracer {
  private logger: ValidationLoggerImpl;
  private errorHandler: ErrorHandlerImpl;
  private activeTraces: Map<string, CalculationTrace> = new Map();

  constructor(logger: ValidationLoggerImpl, errorHandler: ErrorHandlerImpl) {
    this.logger = logger;
    this.errorHandler = errorHandler;
  }

  /**
   * Starts a new calculation trace for a prediction
   * Requirements: 5.1, 5.2
   */
  startTrace(
    homeTeamId: number, 
    awayTeamId: number, 
    season: number, 
    gameId?: number
  ): string {
    const traceId = this.generateTraceId();
    
    const trace: CalculationTrace = {
      traceId,
      gameId,
      homeTeamId,
      awayTeamId,
      season,
      steps: [],
      validationResults: [],
      startTime: new Date(),
      metadata: {
        version: '1.0.0',
        tracerComponent: 'calculation-tracer'
      }
    };
    
    this.activeTraces.set(traceId, trace);
    
    console.log(`[CALCULATION TRACER] Started trace ${traceId} for teams ${homeTeamId} vs ${awayTeamId} (season ${season})`);
    
    return traceId;
  }

  /**
   * Traces raw statistics extraction and validation
   * Requirements: 5.1, 5.2
   */
  traceRawStatisticsExtraction(
    traceId: string,
    teamId: number,
    rawStats: RawStatistics
  ): number {
    const description = `Extract raw statistics for team ${teamId}`;
    const inputs = { teamId, season: rawStats.season };
    
    const calculation = `
      Raw Statistics Extraction:
      - Passing Yards: ${rawStats.passingYards}
      - Rushing Yards: ${rawStats.rushingYards}
      - Total Yards: ${rawStats.totalYards}
      - Points Scored: ${rawStats.pointsScored}
      - Passing Yards Allowed: ${rawStats.passingYardsAllowed}
      - Rushing Yards Allowed: ${rawStats.rushingYardsAllowed}
      - Total Yards Allowed: ${rawStats.totalYardsAllowed}
      - Points Allowed: ${rawStats.pointsAllowed}
      - Turnovers Forced: ${rawStats.turnoversForced}
      - Turnovers Committed: ${rawStats.turnoversCommitted}
      - Games Played: ${rawStats.gamesPlayed}
    `;

    const output = {
      extractedStats: rawStats,
      extractionTimestamp: new Date(),
      dataCompleteness: this.calculateDataCompleteness(rawStats)
    };

    return this.addStep(traceId, 'data_extraction', description, inputs, calculation, output);
  }

  /**
   * Traces opponent baseline calculations with intermediate steps
   * Requirements: 5.1, 5.2
   */
  traceOpponentBaselineCalculation(
    traceId: string,
    teamId: number,
    opponentStats: RawStatistics[],
    baseline: OpponentBaseline
  ): number {
    const description = `Calculate opponent baseline for team ${teamId}`;
    const inputs = { 
      teamId, 
      opponentCount: opponentStats.length,
      opponentIds: opponentStats.map(s => s.teamId)
    };

    const calculationSteps = [
      `Step 1: Collect opponent statistics (${opponentStats.length} opponents)`,
      `Step 2: Calculate average passing yards allowed: ${baseline.avgPassingYardsAllowed.toFixed(2)}`,
      `Step 3: Calculate average rushing yards allowed: ${baseline.avgRushingYardsAllowed.toFixed(2)}`,
      `Step 4: Calculate average total yards allowed: ${baseline.avgTotalYardsAllowed.toFixed(2)}`,
      `Step 5: Calculate average points allowed: ${baseline.avgPointsAllowed.toFixed(2)}`,
      `Step 6: Calculate average turnovers forced: ${baseline.avgTurnoversForced.toFixed(2)}`
    ];

    const calculation = `
      Opponent Baseline Calculation:
      ${calculationSteps.join('\n      ')}
      
      Mathematical Operations:
      - Avg Passing Yards Allowed = Σ(opponent_passing_yards_allowed) / ${opponentStats.length}
      - Avg Rushing Yards Allowed = Σ(opponent_rushing_yards_allowed) / ${opponentStats.length}
      - Avg Total Yards Allowed = Σ(opponent_total_yards_allowed) / ${opponentStats.length}
      - Avg Points Allowed = Σ(opponent_points_allowed) / ${opponentStats.length}
      - Avg Turnovers Forced = Σ(opponent_turnovers_forced) / ${opponentStats.length}
    `;

    const output = {
      baseline,
      calculationSteps,
      intermediateValues: {
        totalPassingYardsAllowed: opponentStats.reduce((sum, s) => sum + s.passingYardsAllowed, 0),
        totalRushingYardsAllowed: opponentStats.reduce((sum, s) => sum + s.rushingYardsAllowed, 0),
        totalYardsAllowed: opponentStats.reduce((sum, s) => sum + s.totalYardsAllowed, 0),
        totalPointsAllowed: opponentStats.reduce((sum, s) => sum + s.pointsAllowed, 0),
        totalTurnoversForced: opponentStats.reduce((sum, s) => sum + s.turnoversForced, 0)
      }
    };

    return this.addStep(traceId, 'baseline_calculation', description, inputs, calculation, output);
  }

  /**
   * Records efficiency computations and mathematical operations
   * Requirements: 5.1, 5.2
   */
  traceEfficiencyCalculation(
    traceId: string,
    teamId: number,
    rawStats: RawStatistics,
    baseline: OpponentBaseline,
    efficiency: EfficiencyCalculation
  ): number {
    const description = `Calculate efficiency metrics for team ${teamId}`;
    const inputs = { 
      teamId, 
      rawStats: {
        passingYards: rawStats.passingYards,
        rushingYards: rawStats.rushingYards,
        pointsScored: rawStats.pointsScored,
        pointsAllowed: rawStats.pointsAllowed,
        turnoversNet: rawStats.turnoversForced - rawStats.turnoversCommitted
      },
      baseline: {
        avgPassingYardsAllowed: baseline.avgPassingYardsAllowed,
        avgRushingYardsAllowed: baseline.avgRushingYardsAllowed,
        avgPointsAllowed: baseline.avgPointsAllowed,
        avgTurnoversForced: baseline.avgTurnoversForced
      }
    };

    const calculationSteps = [
      `Step 1: Calculate passing efficiency = (${rawStats.passingYards} - ${baseline.avgPassingYardsAllowed.toFixed(2)}) = ${efficiency.passingEfficiency.toFixed(2)}`,
      `Step 2: Calculate rushing efficiency = (${rawStats.rushingYards} - ${baseline.avgRushingYardsAllowed.toFixed(2)}) = ${efficiency.rushingEfficiency.toFixed(2)}`,
      `Step 3: Calculate scoring efficiency = (${rawStats.pointsScored} - ${baseline.avgPointsAllowed.toFixed(2)}) = ${efficiency.scoringEfficiency.toFixed(2)}`,
      `Step 4: Calculate defensive efficiency = (${baseline.avgPointsAllowed.toFixed(2)} - ${rawStats.pointsAllowed}) = ${efficiency.defensiveEfficiency.toFixed(2)}`,
      `Step 5: Calculate turnover efficiency = ((${rawStats.turnoversForced} - ${rawStats.turnoversCommitted}) - ${baseline.avgTurnoversForced.toFixed(2)}) = ${efficiency.turnoverEfficiency.toFixed(2)}`,
      `Step 6: Calculate overall efficiency = weighted average = ${efficiency.overallEfficiency.toFixed(2)}`
    ];

    const calculation = `
      Efficiency Calculation:
      ${calculationSteps.join('\n      ')}
      
      Mathematical Formulas:
      - Passing Efficiency = Team Passing Yards - Opponent Avg Passing Yards Allowed
      - Rushing Efficiency = Team Rushing Yards - Opponent Avg Rushing Yards Allowed  
      - Scoring Efficiency = Team Points Scored - Opponent Avg Points Allowed
      - Defensive Efficiency = Opponent Avg Points Allowed - Team Points Allowed
      - Turnover Efficiency = (Team Turnovers Forced - Team Turnovers Committed) - Opponent Avg Turnovers Forced
      - Overall Efficiency = Weighted combination of all efficiency metrics
    `;

    const output = {
      efficiency,
      calculationSteps,
      intermediateCalculations: {
        passingDifferential: rawStats.passingYards - baseline.avgPassingYardsAllowed,
        rushingDifferential: rawStats.rushingYards - baseline.avgRushingYardsAllowed,
        scoringDifferential: rawStats.pointsScored - baseline.avgPointsAllowed,
        defensiveDifferential: baseline.avgPointsAllowed - rawStats.pointsAllowed,
        turnoverDifferential: (rawStats.turnoversForced - rawStats.turnoversCommitted) - baseline.avgTurnoversForced
      }
    };

    return this.addStep(traceId, 'efficiency_calculation', description, inputs, calculation, output);
  }

  /**
   * Traces iterative efficiency calculations for convergence
   * Requirements: 5.1, 5.2
   */
  traceIterativeEfficiencyCalculation(
    traceId: string,
    teamId: number,
    iteration: number,
    previousEfficiency: number,
    newEfficiency: number,
    convergenceValue: number,
    tolerance: number
  ): number {
    const description = `Iterative efficiency calculation - iteration ${iteration} for team ${teamId}`;
    const inputs = { 
      teamId, 
      iteration, 
      previousEfficiency, 
      tolerance,
      convergenceThreshold: tolerance
    };

    const calculation = `
      Iterative Efficiency Calculation (Iteration ${iteration}):
      - Previous Efficiency: ${previousEfficiency.toFixed(4)}
      - New Efficiency: ${newEfficiency.toFixed(4)}
      - Change: ${(newEfficiency - previousEfficiency).toFixed(4)}
      - Convergence Value: ${convergenceValue.toFixed(4)}
      - Tolerance: ${tolerance.toFixed(4)}
      - Converged: ${convergenceValue <= tolerance ? 'Yes' : 'No'}
      
      Mathematical Operation:
      convergence_value = |new_efficiency - previous_efficiency|
      converged = convergence_value <= tolerance
    `;

    const output = {
      iteration,
      previousEfficiency,
      newEfficiency,
      change: newEfficiency - previousEfficiency,
      convergenceValue,
      tolerance,
      hasConverged: convergenceValue <= tolerance,
      iterationTimestamp: new Date()
    };

    return this.addStep(traceId, 'efficiency_calculation', description, inputs, calculation, output);
  }

  /**
   * Adds a calculation step to an active trace
   * Requirements: 5.1, 5.2
   */
  public addStep(
    traceId: string,
    stepType: CalculationStep['stepType'],
    description: string,
    inputs: Record<string, any>,
    calculation: string,
    output: any
  ): number {
    const trace = this.activeTraces.get(traceId);
    if (!trace) {
      throw new Error(`No active trace found with ID: ${traceId}`);
    }

    const stepNumber = trace.steps.length + 1;
    const startTime = Date.now();
    
    const step: CalculationStep = {
      stepNumber,
      stepType,
      description,
      inputs,
      calculation,
      output,
      isValid: true, // Will be validated separately
      executionTime: 0,
      metadata: {
        timestamp: new Date(),
        traceId
      }
    };

    trace.steps.push(step);
    
    // Calculate execution time
    step.executionTime = Date.now() - startTime;
    
    console.log(`[CALCULATION TRACER] Added step ${stepNumber} to trace ${traceId}: ${description}`);
    
    return stepNumber;
  }

  /**
   * Gets an active trace
   * Requirements: 5.1, 5.2
   */
  getTrace(traceId: string): CalculationTrace | undefined {
    return this.activeTraces.get(traceId);
  }

  /**
   * Gets all steps for a trace
   * Requirements: 5.1, 5.2
   */
  getTraceSteps(traceId: string): CalculationStep[] {
    const trace = this.activeTraces.get(traceId);
    return trace ? trace.steps : [];
  }

  /**
   * Completes a trace and returns the final result
   * Requirements: 5.1, 5.2
   */
  completeTrace(traceId: string, finalPrediction?: any): CalculationTrace {
    const trace = this.activeTraces.get(traceId);
    if (!trace) {
      throw new Error(`No active trace found with ID: ${traceId}`);
    }

    trace.endTime = new Date();
    trace.finalPrediction = finalPrediction;

    // Log the completed trace
    this.logger.logTrace(trace);

    // Remove from active traces
    this.activeTraces.delete(traceId);

    console.log(`[CALCULATION TRACER] Completed trace ${traceId} with ${trace.steps.length} steps`);

    return trace;
  }

  /**
   * Calculates data completeness score for raw statistics
   * Requirements: 5.1, 5.2
   */
  private calculateDataCompleteness(stats: RawStatistics): number {
    const requiredFields = [
      'passingYards', 'rushingYards', 'totalYards', 'pointsScored',
      'passingYardsAllowed', 'rushingYardsAllowed', 'totalYardsAllowed', 
      'pointsAllowed', 'turnoversForced', 'turnoversCommitted', 'gamesPlayed'
    ];

    let completedFields = 0;
    for (const field of requiredFields) {
      const value = (stats as any)[field];
      if (value !== undefined && value !== null && !isNaN(value)) {
        completedFields++;
      }
    }

    return Math.round((completedFields / requiredFields.length) * 100);
  }

  /**
   * Generates a unique trace ID
   * Requirements: 5.1, 5.2
   */
  private generateTraceId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `trace_${timestamp}_${random}`;
  }

  /**
   * Gets summary of all active traces
   * Requirements: 5.1, 5.2
   */
  getActiveTracesSummary(): Array<{
    traceId: string;
    homeTeamId: number;
    awayTeamId: number;
    season: number;
    stepCount: number;
    startTime: Date;
    duration: number;
  }> {
    const summary: Array<{
      traceId: string;
      homeTeamId: number;
      awayTeamId: number;
      season: number;
      stepCount: number;
      startTime: Date;
      duration: number;
    }> = [];

    for (const [traceId, trace] of this.activeTraces) {
      summary.push({
        traceId,
        homeTeamId: trace.homeTeamId,
        awayTeamId: trace.awayTeamId,
        season: trace.season,
        stepCount: trace.steps.length,
        startTime: trace.startTime,
        duration: Date.now() - trace.startTime.getTime()
      });
    }

    return summary;
  }

  /**
   * Clears all active traces (useful for testing)
   * Requirements: 5.1, 5.2
   */
  clearActiveTraces(): void {
    this.activeTraces.clear();
    console.log('[CALCULATION TRACER] Cleared all active traces');
  }
}
/**

 * Mathematical Verification System - Validates calculation steps for correctness
 * Requirements: 5.3, 5.4, 5.5
 */

export class MathematicalVerifier {
  private logger: ValidationLoggerImpl;
  private errorHandler: ErrorHandlerImpl;

  constructor(logger: ValidationLoggerImpl, errorHandler: ErrorHandlerImpl) {
    this.logger = logger;
    this.errorHandler = errorHandler;
  }

  /**
   * Validates each calculation step for mathematical correctness
   * Requirements: 5.3, 5.4, 5.5
   */
  validateCalculationStep(
    traceId: string,
    step: CalculationStep
  ): StepValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let mathematicallyCorrect = true;
    let withinBounds = true;

    try {
      switch (step.stepType) {
        case 'data_extraction':
          const dataValidation = this.validateDataExtractionStep(step);
          if (!dataValidation.isValid) {
            mathematicallyCorrect = false;
            errors.push(...dataValidation.errors);
          }
          warnings.push(...dataValidation.warnings);
          break;

        case 'baseline_calculation':
          const baselineValidation = this.validateBaselineCalculationStep(step);
          if (!baselineValidation.isValid) {
            mathematicallyCorrect = false;
            errors.push(...baselineValidation.errors);
          }
          warnings.push(...baselineValidation.warnings);
          withinBounds = baselineValidation.withinBounds;
          break;

        case 'efficiency_calculation':
          const efficiencyValidation = this.validateEfficiencyCalculationStep(step);
          if (!efficiencyValidation.isValid) {
            mathematicallyCorrect = false;
            errors.push(...efficiencyValidation.errors);
          }
          warnings.push(...efficiencyValidation.warnings);
          withinBounds = efficiencyValidation.withinBounds;
          break;

        case 'weight_application':
          const weightValidation = this.validateWeightApplicationStep(step);
          if (!weightValidation.isValid) {
            mathematicallyCorrect = false;
            errors.push(...weightValidation.errors);
          }
          warnings.push(...weightValidation.warnings);
          break;

        case 'prediction_assembly':
          const predictionValidation = this.validatePredictionAssemblyStep(step);
          if (!predictionValidation.isValid) {
            mathematicallyCorrect = false;
            errors.push(...predictionValidation.errors);
          }
          warnings.push(...predictionValidation.warnings);
          withinBounds = predictionValidation.withinBounds;
          break;

        default:
          errors.push(this.errorHandler.createValidationError(
            'UNKNOWN_STEP_TYPE',
            `Unknown step type: ${step.stepType}`,
            'mathematical-verifier',
            'medium'
          ));
          mathematicallyCorrect = false;
      }

    } catch (error) {
      errors.push(this.errorHandler.createValidationError(
        'VALIDATION_ERROR',
        `Error validating step ${step.stepNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'mathematical-verifier',
        'high'
      ));
      mathematicallyCorrect = false;
    }

    const result: StepValidationResult = {
      stepNumber: step.stepNumber,
      isValid: mathematicallyCorrect && errors.length === 0,
      errors,
      warnings,
      mathematicallyCorrect,
      withinBounds,
      details: {
        stepType: step.stepType,
        validationTimestamp: new Date(),
        traceId
      }
    };

    // Log validation result
    if (!result.isValid) {
      console.log(`[MATHEMATICAL VERIFIER] Step ${step.stepNumber} validation failed: ${errors.length} errors`);
      errors.forEach(error => {
        this.logger.logError('mathematical-verifier', error);
      });
    }

    return result;
  }

  /**
   * Validates data extraction step
   * Requirements: 5.3, 5.4
   */
  private validateDataExtractionStep(step: CalculationStep): {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    withinBounds: boolean;
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let withinBounds = true;

    const extractedStats = step.output?.extractedStats as RawStatistics;
    if (!extractedStats) {
      errors.push(this.errorHandler.createValidationError(
        'MISSING_EXTRACTED_STATS',
        'No extracted statistics found in step output',
        'mathematical-verifier',
        'high'
      ));
      return { isValid: false, errors, warnings, withinBounds: false };
    }

    // Validate required fields are present and reasonable
    const requiredFields = [
      { field: 'passingYards', min: 0, max: 8000, name: 'Passing Yards' },
      { field: 'rushingYards', min: 0, max: 5000, name: 'Rushing Yards' },
      { field: 'totalYards', min: 0, max: 12000, name: 'Total Yards' },
      { field: 'pointsScored', min: 0, max: 1000, name: 'Points Scored' },
      { field: 'passingYardsAllowed', min: 0, max: 8000, name: 'Passing Yards Allowed' },
      { field: 'rushingYardsAllowed', min: 0, max: 5000, name: 'Rushing Yards Allowed' },
      { field: 'totalYardsAllowed', min: 0, max: 12000, name: 'Total Yards Allowed' },
      { field: 'pointsAllowed', min: 0, max: 1000, name: 'Points Allowed' },
      { field: 'turnoversForced', min: 0, max: 100, name: 'Turnovers Forced' },
      { field: 'turnoversCommitted', min: 0, max: 100, name: 'Turnovers Committed' },
      { field: 'gamesPlayed', min: 1, max: 20, name: 'Games Played' }
    ];

    for (const fieldDef of requiredFields) {
      const value = (extractedStats as any)[fieldDef.field];
      const validation = ValidationUtils.validateNumber(value, fieldDef.name, fieldDef.min, fieldDef.max);
      
      if (!validation.isValid) {
        errors.push(this.errorHandler.createValidationError(
          'INVALID_FIELD_VALUE',
          validation.error!,
          'mathematical-verifier',
          'medium'
        ));
        withinBounds = false;
      }
    }

    // Validate logical relationships
    if (extractedStats.totalYards !== extractedStats.passingYards + extractedStats.rushingYards) {
      const calculatedTotal = extractedStats.passingYards + extractedStats.rushingYards;
      const difference = Math.abs(extractedStats.totalYards - calculatedTotal);
      
      if (difference > 10) { // Allow small rounding differences
        errors.push(this.errorHandler.createValidationError(
          'TOTAL_YARDS_MISMATCH',
          `Total yards (${extractedStats.totalYards}) does not match passing + rushing (${calculatedTotal})`,
          'mathematical-verifier',
          'medium'
        ));
      } else {
        warnings.push(this.errorHandler.createValidationWarning(
          'MINOR_TOTAL_YARDS_DIFFERENCE',
          `Small difference in total yards calculation: ${difference} yards`,
          'mathematical-verifier'
        ));
      }
    }

    // Check data completeness
    const completeness = step.output?.dataCompleteness;
    if (completeness && completeness < 90) {
      warnings.push(this.errorHandler.createValidationWarning(
        'LOW_DATA_COMPLETENESS',
        `Data completeness is ${completeness}%, below recommended 90%`,
        'mathematical-verifier'
      ));
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      withinBounds
    };
  }

  /**
   * Validates baseline calculation step
   * Requirements: 5.3, 5.4
   */
  private validateBaselineCalculationStep(step: CalculationStep): {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    withinBounds: boolean;
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let withinBounds = true;

    const baseline = step.output?.baseline as OpponentBaseline;
    const intermediateValues = step.output?.intermediateValues;

    if (!baseline || !intermediateValues) {
      errors.push(this.errorHandler.createValidationError(
        'MISSING_BASELINE_DATA',
        'Missing baseline or intermediate values in step output',
        'mathematical-verifier',
        'high'
      ));
      return { isValid: false, errors, warnings, withinBounds: false };
    }

    const opponentCount = step.inputs?.opponentCount;
    if (!opponentCount || opponentCount <= 0) {
      errors.push(this.errorHandler.createValidationError(
        'INVALID_OPPONENT_COUNT',
        `Invalid opponent count: ${opponentCount}`,
        'mathematical-verifier',
        'high'
      ));
      return { isValid: false, errors, warnings, withinBounds: false };
    }

    // Validate mathematical calculations
    const calculations = [
      {
        field: 'avgPassingYardsAllowed',
        expected: intermediateValues.totalPassingYardsAllowed / opponentCount,
        actual: baseline.avgPassingYardsAllowed,
        name: 'Average Passing Yards Allowed'
      },
      {
        field: 'avgRushingYardsAllowed',
        expected: intermediateValues.totalRushingYardsAllowed / opponentCount,
        actual: baseline.avgRushingYardsAllowed,
        name: 'Average Rushing Yards Allowed'
      },
      {
        field: 'avgTotalYardsAllowed',
        expected: intermediateValues.totalYardsAllowed / opponentCount,
        actual: baseline.avgTotalYardsAllowed,
        name: 'Average Total Yards Allowed'
      },
      {
        field: 'avgPointsAllowed',
        expected: intermediateValues.totalPointsAllowed / opponentCount,
        actual: baseline.avgPointsAllowed,
        name: 'Average Points Allowed'
      },
      {
        field: 'avgTurnoversForced',
        expected: intermediateValues.totalTurnoversForced / opponentCount,
        actual: baseline.avgTurnoversForced,
        name: 'Average Turnovers Forced'
      }
    ];

    for (const calc of calculations) {
      const difference = Math.abs(calc.expected - calc.actual);
      const tolerance = Math.max(0.01, Math.abs(calc.expected) * 0.001); // 0.1% tolerance or 0.01 minimum

      if (difference > tolerance) {
        errors.push(this.errorHandler.createValidationError(
          'CALCULATION_ERROR',
          `${calc.name} calculation error: expected ${calc.expected.toFixed(4)}, got ${calc.actual.toFixed(4)} (difference: ${difference.toFixed(4)})`,
          'mathematical-verifier',
          'medium'
        ));
      }

      // Check if values are within reasonable bounds
      const bounds = this.getReasonableBounds(calc.field);
      if (calc.actual < bounds.min || calc.actual > bounds.max) {
        warnings.push(this.errorHandler.createValidationWarning(
          'VALUE_OUT_OF_BOUNDS',
          `${calc.name} (${calc.actual.toFixed(2)}) is outside typical range [${bounds.min}, ${bounds.max}]`,
          'mathematical-verifier'
        ));
        withinBounds = false;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      withinBounds
    };
  }

  /**
   * Validates efficiency calculation step
   * Requirements: 5.3, 5.4
   */
  private validateEfficiencyCalculationStep(step: CalculationStep): {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    withinBounds: boolean;
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let withinBounds = true;

    const efficiency = step.output?.efficiency as EfficiencyCalculation;
    const intermediateCalcs = step.output?.intermediateCalculations;

    if (!efficiency || !intermediateCalcs) {
      errors.push(this.errorHandler.createValidationError(
        'MISSING_EFFICIENCY_DATA',
        'Missing efficiency or intermediate calculations in step output',
        'mathematical-verifier',
        'high'
      ));
      return { isValid: false, errors, warnings, withinBounds: false };
    }

    // Validate efficiency calculations against intermediate values
    const efficiencyChecks = [
      {
        field: 'passingEfficiency',
        expected: intermediateCalcs.passingDifferential,
        actual: efficiency.passingEfficiency,
        name: 'Passing Efficiency'
      },
      {
        field: 'rushingEfficiency',
        expected: intermediateCalcs.rushingDifferential,
        actual: efficiency.rushingEfficiency,
        name: 'Rushing Efficiency'
      },
      {
        field: 'scoringEfficiency',
        expected: intermediateCalcs.scoringDifferential,
        actual: efficiency.scoringEfficiency,
        name: 'Scoring Efficiency'
      },
      {
        field: 'defensiveEfficiency',
        expected: intermediateCalcs.defensiveDifferential,
        actual: efficiency.defensiveEfficiency,
        name: 'Defensive Efficiency'
      },
      {
        field: 'turnoverEfficiency',
        expected: intermediateCalcs.turnoverDifferential,
        actual: efficiency.turnoverEfficiency,
        name: 'Turnover Efficiency'
      }
    ];

    for (const check of efficiencyChecks) {
      const difference = Math.abs(check.expected - check.actual);
      const tolerance = Math.max(0.01, Math.abs(check.expected) * 0.001);

      if (difference > tolerance) {
        errors.push(this.errorHandler.createValidationError(
          'EFFICIENCY_CALCULATION_ERROR',
          `${check.name} calculation error: expected ${check.expected.toFixed(4)}, got ${check.actual.toFixed(4)}`,
          'mathematical-verifier',
          'medium'
        ));
      }

      // Check bounds for efficiency values (-50 to +50 typical range)
      const efficiencyValidation = ValidationUtils.validateEfficiencyValue(
        check.actual,
        check.name,
        -50,
        50
      );

      if (!efficiencyValidation.isValid) {
        errors.push(this.errorHandler.createValidationError(
          'EFFICIENCY_OUT_OF_BOUNDS',
          efficiencyValidation.error!,
          'mathematical-verifier',
          'medium'
        ));
        withinBounds = false;
      } else if (efficiencyValidation.warning) {
        warnings.push(this.errorHandler.createValidationWarning(
          'EFFICIENCY_EXTREME_VALUE',
          efficiencyValidation.warning,
          'mathematical-verifier'
        ));
      }
    }

    // Validate overall efficiency is reasonable combination
    const efficiencyValues = [
      efficiency.passingEfficiency,
      efficiency.rushingEfficiency,
      efficiency.scoringEfficiency,
      efficiency.defensiveEfficiency,
      efficiency.turnoverEfficiency
    ];

    const avgEfficiency = efficiencyValues.reduce((sum, val) => sum + val, 0) / efficiencyValues.length;
    const overallDifference = Math.abs(efficiency.overallEfficiency - avgEfficiency);

    // Allow for weighted average differences
    if (overallDifference > 20) {
      warnings.push(this.errorHandler.createValidationWarning(
        'OVERALL_EFFICIENCY_DEVIATION',
        `Overall efficiency (${efficiency.overallEfficiency.toFixed(2)}) significantly differs from simple average (${avgEfficiency.toFixed(2)})`,
        'mathematical-verifier'
      ));
    }

    // Check for iterative calculation data if present
    if (efficiency.iterationData) {
      const iterationValidation = this.validateIterationData(efficiency.iterationData);
      if (!iterationValidation.isValid) {
        errors.push(...iterationValidation.errors);
        warnings.push(...iterationValidation.warnings);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      withinBounds
    };
  }

  /**
   * Validates weight application step
   * Requirements: 5.3, 5.4
   */
  private validateWeightApplicationStep(step: CalculationStep): {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // This will be implemented in the next subtask (6.3)
    // For now, return basic validation
    return {
      isValid: true,
      errors,
      warnings
    };
  }

  /**
   * Validates prediction assembly step
   * Requirements: 5.3, 5.4
   */
  private validatePredictionAssemblyStep(step: CalculationStep): {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    withinBounds: boolean;
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let withinBounds = true;

    // This will be implemented in the next subtask (6.3)
    // For now, return basic validation
    return {
      isValid: true,
      errors,
      warnings,
      withinBounds
    };
  }

  /**
   * Validates iteration data for convergence
   * Requirements: 5.3, 5.4
   */
  private validateIterationData(iterationData: {
    iteration: number;
    previousEfficiency: number;
    convergenceValue: number;
  }): {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (iterationData.iteration < 1) {
      errors.push(this.errorHandler.createValidationError(
        'INVALID_ITERATION_NUMBER',
        `Iteration number must be >= 1, got ${iterationData.iteration}`,
        'mathematical-verifier',
        'medium'
      ));
    }

    if (iterationData.convergenceValue < 0) {
      errors.push(this.errorHandler.createValidationError(
        'NEGATIVE_CONVERGENCE_VALUE',
        `Convergence value must be >= 0, got ${iterationData.convergenceValue}`,
        'mathematical-verifier',
        'medium'
      ));
    }

    if (iterationData.iteration > 100) {
      warnings.push(this.errorHandler.createValidationWarning(
        'HIGH_ITERATION_COUNT',
        `High iteration count (${iterationData.iteration}) may indicate convergence issues`,
        'mathematical-verifier'
      ));
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Gets reasonable bounds for different baseline fields
   * Requirements: 5.3, 5.4
   */
  private getReasonableBounds(field: string): { min: number; max: number } {
    const bounds: Record<string, { min: number; max: number }> = {
      avgPassingYardsAllowed: { min: 100, max: 500 },
      avgRushingYardsAllowed: { min: 50, max: 300 },
      avgTotalYardsAllowed: { min: 200, max: 700 },
      avgPointsAllowed: { min: 10, max: 60 },
      avgTurnoversForced: { min: 0.5, max: 4.0 }
    };

    return bounds[field] || { min: -1000, max: 1000 };
  }

  /**
   * Identifies specific steps where calculation errors occur
   * Requirements: 5.3, 5.4, 5.5
   */
  identifyCalculationErrors(trace: CalculationTrace): {
    errorSteps: number[];
    errorSummary: string[];
    criticalErrors: number;
    totalErrors: number;
  } {
    const errorSteps: number[] = [];
    const errorSummary: string[] = [];
    let criticalErrors = 0;
    let totalErrors = 0;

    for (const validation of trace.validationResults) {
      if (!validation.isValid || validation.errors.length > 0) {
        errorSteps.push(validation.stepNumber);
        
        for (const error of validation.errors) {
          totalErrors++;
          if (error.severity === 'critical' || error.severity === 'high') {
            criticalErrors++;
          }
          
          const step = trace.steps.find(s => s.stepNumber === validation.stepNumber);
          const stepDescription = step ? step.description : `Step ${validation.stepNumber}`;
          errorSummary.push(`${stepDescription}: ${error.message}`);
        }
      }
    }

    return {
      errorSteps,
      errorSummary,
      criticalErrors,
      totalErrors
    };
  }

  /**
   * Checks intermediate results for reasonableness and bounds
   * Requirements: 5.3, 5.4, 5.5
   */
  checkIntermediateResults(trace: CalculationTrace): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const recommendations: string[] = [];

    let totalSteps = 0;
    let validSteps = 0;
    let stepsWithWarnings = 0;

    for (const step of trace.steps) {
      totalSteps++;
      
      const validation = trace.validationResults.find(v => v.stepNumber === step.stepNumber);
      if (validation) {
        if (validation.isValid && validation.errors.length === 0) {
          validSteps++;
        }
        
        if (validation.warnings.length > 0) {
          stepsWithWarnings++;
        }
        
        errors.push(...validation.errors);
        warnings.push(...validation.warnings);
      }
    }

    // Calculate overall score
    const validityScore = totalSteps > 0 ? (validSteps / totalSteps) * 100 : 0;
    const warningPenalty = Math.min(stepsWithWarnings * 5, 30);
    const errorPenalty = Math.min(errors.length * 10, 50);
    const finalScore = Math.max(0, validityScore - warningPenalty - errorPenalty);

    // Add recommendations
    if (validSteps < totalSteps) {
      recommendations.push(`${totalSteps - validSteps} calculation steps failed validation and need review`);
    }
    
    if (stepsWithWarnings > 0) {
      recommendations.push(`${stepsWithWarnings} steps have warnings that should be investigated`);
    }
    
    if (errors.some(e => e.severity === 'critical' || e.severity === 'high')) {
      recommendations.push('Critical calculation errors detected - manual review required');
    }

    return {
      isValid: errors.length === 0,
      score: Math.round(finalScore),
      errors,
      warnings,
      recommendations,
      timestamp: new Date(),
      metadata: {
        totalSteps,
        validSteps,
        stepsWithWarnings,
        traceId: trace.traceId
      }
    };
  }
}
/**
 * P
rediction Assembly Tracer - Tracks weight application and final prediction calculations
 * Requirements: 5.1, 5.2, 5.5
 */

export interface WeightApplication {
  category: string;
  weight: number;
  homeTeamValue: number;
  awayTeamValue: number;
  homeTeamContribution: number;
  awayTeamContribution: number;
  netAdvantage: number;
}

export interface PredictionAssembly {
  homeTeamId: number;
  awayTeamId: number;
  season: number;
  weightApplications: WeightApplication[];
  rawScoreCalculation: {
    homeTeamRawScore: number;
    awayTeamRawScore: number;
    calculationSteps: string[];
  };
  confidenceCalculation: {
    confidence: number;
    confidenceFactors: Array<{
      factor: string;
      value: number;
      impact: number;
    }>;
    calculationSteps: string[];
  };
  probabilityCalculation: {
    homeWinProbability: number;
    awayWinProbability: number;
    calculationMethod: string;
    calculationSteps: string[];
  };
  boundaryValidation: {
    homeScoreAdjusted: number;
    awayScoreAdjusted: number;
    adjustmentsMade: Array<{
      type: string;
      originalValue: number;
      adjustedValue: number;
      reason: string;
    }>;
  };
  finalPrediction: {
    homeScore: number;
    awayScore: number;
    confidence: number;
    homeWinProbability: number;
    awayWinProbability: number;
  };
}

export class PredictionAssemblyTracer {
  private calculationTracer: CalculationTracer;
  private mathematicalVerifier: MathematicalVerifier;

  constructor(calculationTracer: CalculationTracer, mathematicalVerifier: MathematicalVerifier) {
    this.calculationTracer = calculationTracer;
    this.mathematicalVerifier = mathematicalVerifier;
  }

  /**
   * Tracks weight application in final prediction calculations
   * Requirements: 5.1, 5.2, 5.5
   */
  traceWeightApplication(
    traceId: string,
    homeTeamEfficiencies: Record<string, number>,
    awayTeamEfficiencies: Record<string, number>,
    weights: Record<string, number>
  ): number {
    const description = 'Apply statistical weights to team efficiency values';
    const inputs = {
      homeTeamEfficiencies,
      awayTeamEfficiencies,
      weights,
      weightCategories: Object.keys(weights)
    };

    const weightApplications: WeightApplication[] = [];
    const calculationSteps: string[] = [];

    // Calculate weight applications for each category
    for (const [category, weight] of Object.entries(weights)) {
      const homeValue = homeTeamEfficiencies[category] || 0;
      const awayValue = awayTeamEfficiencies[category] || 0;
      
      const homeContribution = homeValue * weight;
      const awayContribution = awayValue * weight;
      const netAdvantage = homeContribution - awayContribution;

      weightApplications.push({
        category,
        weight,
        homeTeamValue: homeValue,
        awayTeamValue: awayValue,
        homeTeamContribution: homeContribution,
        awayTeamContribution: awayContribution,
        netAdvantage
      });

      calculationSteps.push(
        `${category}: Home(${homeValue.toFixed(2)} × ${weight.toFixed(3)} = ${homeContribution.toFixed(2)}) vs Away(${awayValue.toFixed(2)} × ${weight.toFixed(3)} = ${awayContribution.toFixed(2)}) → Net: ${netAdvantage.toFixed(2)}`
      );
    }

    const calculation = `
      Weight Application Process:
      ${calculationSteps.join('\n      ')}
      
      Mathematical Formula:
      For each category: contribution = efficiency_value × weight
      Net advantage = home_contribution - away_contribution
      Total score = Σ(all_contributions)
    `;

    const output = {
      weightApplications,
      calculationSteps,
      totalHomeContribution: weightApplications.reduce((sum, wa) => sum + wa.homeTeamContribution, 0),
      totalAwayContribution: weightApplications.reduce((sum, wa) => sum + wa.awayTeamContribution, 0),
      netAdvantageSum: weightApplications.reduce((sum, wa) => sum + wa.netAdvantage, 0)
    };

    return this.calculationTracer.addStep(traceId, 'weight_application', description, inputs, calculation, output);
  }

  /**
   * Records confidence and probability calculations
   * Requirements: 5.1, 5.2, 5.5
   */
  traceConfidenceCalculation(
    traceId: string,
    modelRSquared: number,
    sampleSize: number,
    predictionVariance: number,
    teamStrengthDifference: number
  ): number {
    const description = 'Calculate prediction confidence based on model reliability and team differences';
    const inputs = {
      modelRSquared,
      sampleSize,
      predictionVariance,
      teamStrengthDifference
    };

    const confidenceFactors = [
      {
        factor: 'Model R-squared',
        value: modelRSquared,
        impact: modelRSquared * 0.4 // 40% weight
      },
      {
        factor: 'Sample Size Adequacy',
        value: Math.min(sampleSize / 100, 1.0), // Normalize to 0-1
        impact: Math.min(sampleSize / 100, 1.0) * 0.2 // 20% weight
      },
      {
        factor: 'Prediction Stability',
        value: Math.max(0, 1 - predictionVariance), // Lower variance = higher stability
        impact: Math.max(0, 1 - predictionVariance) * 0.2 // 20% weight
      },
      {
        factor: 'Team Strength Clarity',
        value: Math.min(Math.abs(teamStrengthDifference) / 20, 1.0), // Normalize large differences
        impact: Math.min(Math.abs(teamStrengthDifference) / 20, 1.0) * 0.2 // 20% weight
      }
    ];

    const baseConfidence = confidenceFactors.reduce((sum, factor) => sum + factor.impact, 0);
    const confidence = Math.max(0.1, Math.min(0.95, baseConfidence)); // Bound between 10% and 95%

    const calculationSteps = [
      `Step 1: Model reliability factor = ${modelRSquared.toFixed(3)} × 0.4 = ${confidenceFactors[0].impact.toFixed(3)}`,
      `Step 2: Sample size factor = min(${sampleSize}/100, 1.0) × 0.2 = ${confidenceFactors[1].impact.toFixed(3)}`,
      `Step 3: Prediction stability factor = max(0, 1-${predictionVariance.toFixed(3)}) × 0.2 = ${confidenceFactors[2].impact.toFixed(3)}`,
      `Step 4: Team strength clarity = min(${Math.abs(teamStrengthDifference).toFixed(2)}/20, 1.0) × 0.2 = ${confidenceFactors[3].impact.toFixed(3)}`,
      `Step 5: Base confidence = ${baseConfidence.toFixed(3)}`,
      `Step 6: Final confidence = max(0.1, min(0.95, ${baseConfidence.toFixed(3)})) = ${confidence.toFixed(3)}`
    ];

    const calculation = `
      Confidence Calculation Process:
      ${calculationSteps.join('\n      ')}
      
      Mathematical Formula:
      confidence = max(0.1, min(0.95, Σ(factor_value × factor_weight)))
      Factors: Model R² (40%), Sample Size (20%), Stability (20%), Team Difference (20%)
    `;

    const output = {
      confidence,
      confidenceFactors,
      calculationSteps,
      baseConfidence,
      boundedConfidence: confidence
    };

    return this.calculationTracer.addStep(traceId, 'prediction_assembly', description, inputs, calculation, output);
  }

  /**
   * Traces probability calculations (win probability)
   * Requirements: 5.1, 5.2, 5.5
   */
  traceProbabilityCalculation(
    traceId: string,
    homeScore: number,
    awayScore: number,
    confidence: number,
    historicalAccuracy: number = 0.65
  ): number {
    const description = 'Calculate win probabilities based on predicted scores and confidence';
    const inputs = {
      homeScore,
      awayScore,
      confidence,
      historicalAccuracy
    };

    const scoreDifference = homeScore - awayScore;
    const absScoreDifference = Math.abs(scoreDifference);
    
    // Use logistic function for probability calculation
    // P(win) = 1 / (1 + e^(-k * score_difference))
    // where k is adjusted based on confidence and historical accuracy
    const k = 0.1 * confidence * historicalAccuracy; // Scaling factor
    const rawProbability = 1 / (1 + Math.exp(-k * scoreDifference));
    
    // Adjust for confidence - less confident predictions should be closer to 50%
    const confidenceAdjustment = 0.5 + (rawProbability - 0.5) * confidence;
    const homeWinProbability = Math.max(0.05, Math.min(0.95, confidenceAdjustment));
    const awayWinProbability = 1 - homeWinProbability;

    const calculationSteps = [
      `Step 1: Score difference = ${homeScore.toFixed(1)} - ${awayScore.toFixed(1)} = ${scoreDifference.toFixed(1)}`,
      `Step 2: Scaling factor k = 0.1 × ${confidence.toFixed(3)} × ${historicalAccuracy.toFixed(3)} = ${k.toFixed(4)}`,
      `Step 3: Raw probability = 1 / (1 + e^(-${k.toFixed(4)} × ${scoreDifference.toFixed(1)})) = ${rawProbability.toFixed(4)}`,
      `Step 4: Confidence adjustment = 0.5 + (${rawProbability.toFixed(4)} - 0.5) × ${confidence.toFixed(3)} = ${confidenceAdjustment.toFixed(4)}`,
      `Step 5: Home win probability = max(0.05, min(0.95, ${confidenceAdjustment.toFixed(4)})) = ${homeWinProbability.toFixed(4)}`,
      `Step 6: Away win probability = 1 - ${homeWinProbability.toFixed(4)} = ${awayWinProbability.toFixed(4)}`
    ];

    const calculation = `
      Win Probability Calculation:
      ${calculationSteps.join('\n      ')}
      
      Mathematical Formula:
      raw_prob = 1 / (1 + e^(-k × score_difference))
      adjusted_prob = 0.5 + (raw_prob - 0.5) × confidence
      final_prob = max(0.05, min(0.95, adjusted_prob))
    `;

    const output = {
      homeWinProbability,
      awayWinProbability,
      calculationMethod: 'logistic_with_confidence_adjustment',
      calculationSteps,
      intermediateValues: {
        scoreDifference,
        scalingFactor: k,
        rawProbability,
        confidenceAdjustment
      }
    };

    return this.calculationTracer.addStep(traceId, 'prediction_assembly', description, inputs, calculation, output);
  }

  /**
   * Traces boundary validation and adjustments
   * Requirements: 5.1, 5.2, 5.5
   */
  traceBoundaryValidation(
    traceId: string,
    rawHomeScore: number,
    rawAwayScore: number,
    minScore: number = 0,
    maxScore: number = 100,
    maxPointDifferential: number = 70
  ): number {
    const description = 'Validate and adjust prediction scores within reasonable bounds';
    const inputs = {
      rawHomeScore,
      rawAwayScore,
      minScore,
      maxScore,
      maxPointDifferential
    };

    const adjustmentsMade: Array<{
      type: string;
      originalValue: number;
      adjustedValue: number;
      reason: string;
    }> = [];

    let adjustedHomeScore = rawHomeScore;
    let adjustedAwayScore = rawAwayScore;

    // Check minimum score bounds
    if (adjustedHomeScore < minScore) {
      adjustmentsMade.push({
        type: 'home_score_minimum',
        originalValue: adjustedHomeScore,
        adjustedValue: minScore,
        reason: `Score below minimum allowed (${minScore})`
      });
      adjustedHomeScore = minScore;
    }

    if (adjustedAwayScore < minScore) {
      adjustmentsMade.push({
        type: 'away_score_minimum',
        originalValue: adjustedAwayScore,
        adjustedValue: minScore,
        reason: `Score below minimum allowed (${minScore})`
      });
      adjustedAwayScore = minScore;
    }

    // Check maximum score bounds
    if (adjustedHomeScore > maxScore) {
      adjustmentsMade.push({
        type: 'home_score_maximum',
        originalValue: adjustedHomeScore,
        adjustedValue: maxScore,
        reason: `Score above maximum allowed (${maxScore})`
      });
      adjustedHomeScore = maxScore;
    }

    if (adjustedAwayScore > maxScore) {
      adjustmentsMade.push({
        type: 'away_score_maximum',
        originalValue: adjustedAwayScore,
        adjustedValue: maxScore,
        reason: `Score above maximum allowed (${maxScore})`
      });
      adjustedAwayScore = maxScore;
    }

    // Check point differential bounds
    const pointDifferential = Math.abs(adjustedHomeScore - adjustedAwayScore);
    if (pointDifferential > maxPointDifferential) {
      const midpoint = (adjustedHomeScore + adjustedAwayScore) / 2;
      const halfMaxDiff = maxPointDifferential / 2;
      
      const newHomeScore = adjustedHomeScore > adjustedAwayScore 
        ? midpoint + halfMaxDiff 
        : midpoint - halfMaxDiff;
      const newAwayScore = adjustedAwayScore > adjustedHomeScore 
        ? midpoint + halfMaxDiff 
        : midpoint - halfMaxDiff;

      adjustmentsMade.push({
        type: 'point_differential',
        originalValue: pointDifferential,
        adjustedValue: maxPointDifferential,
        reason: `Point differential (${pointDifferential.toFixed(1)}) exceeds maximum (${maxPointDifferential})`
      });

      adjustedHomeScore = newHomeScore;
      adjustedAwayScore = newAwayScore;
    }

    const calculationSteps = [
      `Step 1: Check home score bounds: ${rawHomeScore.toFixed(1)} → ${adjustedHomeScore.toFixed(1)}`,
      `Step 2: Check away score bounds: ${rawAwayScore.toFixed(1)} → ${adjustedAwayScore.toFixed(1)}`,
      `Step 3: Check point differential: ${pointDifferential.toFixed(1)} (max: ${maxPointDifferential})`,
      `Step 4: Applied ${adjustmentsMade.length} adjustments`,
      `Step 5: Final scores: Home ${adjustedHomeScore.toFixed(1)}, Away ${adjustedAwayScore.toFixed(1)}`
    ];

    const calculation = `
      Boundary Validation Process:
      ${calculationSteps.join('\n      ')}
      
      Validation Rules:
      - Minimum score: ${minScore}
      - Maximum score: ${maxScore}
      - Maximum point differential: ${maxPointDifferential}
      
      Adjustments Made: ${adjustmentsMade.length}
      ${adjustmentsMade.map(adj => `- ${adj.type}: ${adj.reason}`).join('\n      ')}
    `;

    const output = {
      homeScoreAdjusted: adjustedHomeScore,
      awayScoreAdjusted: adjustedAwayScore,
      adjustmentsMade,
      calculationSteps,
      validationSummary: {
        originalScores: { home: rawHomeScore, away: rawAwayScore },
        adjustedScores: { home: adjustedHomeScore, away: adjustedAwayScore },
        adjustmentCount: adjustmentsMade.length,
        finalPointDifferential: Math.abs(adjustedHomeScore - adjustedAwayScore)
      }
    };

    return this.calculationTracer.addStep(traceId, 'prediction_assembly', description, inputs, calculation, output);
  }

  /**
   * Assembles complete prediction with all components
   * Requirements: 5.1, 5.2, 5.5
   */
  assembleFinalPrediction(
    traceId: string,
    homeTeamId: number,
    awayTeamId: number,
    season: number,
    weightApplications: WeightApplication[],
    confidence: number,
    homeWinProbability: number,
    awayWinProbability: number,
    finalHomeScore: number,
    finalAwayScore: number
  ): PredictionAssembly {
    const description = 'Assemble final prediction from all calculated components';
    const inputs = {
      homeTeamId,
      awayTeamId,
      season,
      componentCount: weightApplications.length
    };

    const rawScoreCalculation = {
      homeTeamRawScore: weightApplications.reduce((sum, wa) => sum + wa.homeTeamContribution, 0),
      awayTeamRawScore: weightApplications.reduce((sum, wa) => sum + wa.awayTeamContribution, 0),
      calculationSteps: [
        'Raw scores calculated from weighted efficiency contributions',
        `Home raw score: ${weightApplications.reduce((sum, wa) => sum + wa.homeTeamContribution, 0).toFixed(2)}`,
        `Away raw score: ${weightApplications.reduce((sum, wa) => sum + wa.awayTeamContribution, 0).toFixed(2)}`
      ]
    };

    const predictionAssembly: PredictionAssembly = {
      homeTeamId,
      awayTeamId,
      season,
      weightApplications,
      rawScoreCalculation,
      confidenceCalculation: {
        confidence,
        confidenceFactors: [], // This would be populated from the confidence calculation step
        calculationSteps: ['Confidence calculated from model reliability and prediction factors']
      },
      probabilityCalculation: {
        homeWinProbability,
        awayWinProbability,
        calculationMethod: 'logistic_with_confidence_adjustment',
        calculationSteps: ['Win probabilities calculated using logistic function with confidence adjustment']
      },
      boundaryValidation: {
        homeScoreAdjusted: finalHomeScore,
        awayScoreAdjusted: finalAwayScore,
        adjustmentsMade: [] // This would be populated from the boundary validation step
      },
      finalPrediction: {
        homeScore: finalHomeScore,
        awayScore: finalAwayScore,
        confidence,
        homeWinProbability,
        awayWinProbability
      }
    };

    const calculation = `
      Final Prediction Assembly:
      - Home Team: ${homeTeamId} → Score: ${finalHomeScore.toFixed(1)}, Win Prob: ${(homeWinProbability * 100).toFixed(1)}%
      - Away Team: ${awayTeamId} → Score: ${finalAwayScore.toFixed(1)}, Win Prob: ${(awayWinProbability * 100).toFixed(1)}%
      - Confidence: ${(confidence * 100).toFixed(1)}%
      - Weight Applications: ${weightApplications.length} categories
      - Point Differential: ${Math.abs(finalHomeScore - finalAwayScore).toFixed(1)}
    `;

    const stepNumber = this.calculationTracer.addStep(traceId, 'prediction_assembly', description, inputs, calculation, predictionAssembly);

    return predictionAssembly;
  }

  /**
   * Updates weight application validation in mathematical verifier
   * Requirements: 5.3, 5.4
   */
  private updateWeightApplicationValidation(): void {
    // Update the validateWeightApplicationStep method in MathematicalVerifier
    const originalValidateWeightApplicationStep = this.mathematicalVerifier['validateWeightApplicationStep'];
    
    this.mathematicalVerifier['validateWeightApplicationStep'] = (step: CalculationStep): {
      isValid: boolean;
      errors: ValidationError[];
      warnings: ValidationWarning[];
    } => {
      const errors: ValidationError[] = [];
      const warnings: ValidationWarning[] = [];

      const weightApplications = step.output?.weightApplications as WeightApplication[];
      if (!weightApplications || !Array.isArray(weightApplications)) {
        errors.push(this.mathematicalVerifier['errorHandler'].createValidationError(
          'MISSING_WEIGHT_APPLICATIONS',
          'No weight applications found in step output',
          'mathematical-verifier',
          'high'
        ));
        return { isValid: false, errors, warnings };
      }

      // Validate each weight application
      for (const wa of weightApplications) {
        // Check weight bounds
        const weightValidation = ValidationUtils.validateNumber(wa.weight, `Weight for ${wa.category}`, 0, 2.0);
        if (!weightValidation.isValid) {
          errors.push(this.mathematicalVerifier['errorHandler'].createValidationError(
            'INVALID_WEIGHT_VALUE',
            weightValidation.error!,
            'mathematical-verifier',
            'medium'
          ));
        }

        // Validate calculation: contribution = value × weight
        const expectedHomeContribution = wa.homeTeamValue * wa.weight;
        const expectedAwayContribution = wa.awayTeamValue * wa.weight;
        const expectedNetAdvantage = expectedHomeContribution - expectedAwayContribution;

        const homeDiff = Math.abs(wa.homeTeamContribution - expectedHomeContribution);
        const awayDiff = Math.abs(wa.awayTeamContribution - expectedAwayContribution);
        const netDiff = Math.abs(wa.netAdvantage - expectedNetAdvantage);

        const tolerance = 0.001;
        if (homeDiff > tolerance) {
          errors.push(this.mathematicalVerifier['errorHandler'].createValidationError(
            'WEIGHT_CALCULATION_ERROR',
            `Home contribution calculation error for ${wa.category}: expected ${expectedHomeContribution.toFixed(4)}, got ${wa.homeTeamContribution.toFixed(4)}`,
            'mathematical-verifier',
            'medium'
          ));
        }

        if (awayDiff > tolerance) {
          errors.push(this.mathematicalVerifier['errorHandler'].createValidationError(
            'WEIGHT_CALCULATION_ERROR',
            `Away contribution calculation error for ${wa.category}: expected ${expectedAwayContribution.toFixed(4)}, got ${wa.awayTeamContribution.toFixed(4)}`,
            'mathematical-verifier',
            'medium'
          ));
        }

        if (netDiff > tolerance) {
          errors.push(this.mathematicalVerifier['errorHandler'].createValidationError(
            'NET_ADVANTAGE_ERROR',
            `Net advantage calculation error for ${wa.category}: expected ${expectedNetAdvantage.toFixed(4)}, got ${wa.netAdvantage.toFixed(4)}`,
            'mathematical-verifier',
            'medium'
          ));
        }
      }

      // Check total weight sum
      const totalWeight = weightApplications.reduce((sum, wa) => sum + wa.weight, 0);
      if (totalWeight < 0.5 || totalWeight > 10.0) {
        warnings.push(this.mathematicalVerifier['errorHandler'].createValidationWarning(
          'UNUSUAL_TOTAL_WEIGHT',
          `Total weight sum (${totalWeight.toFixed(3)}) is outside typical range [0.5, 10.0]`,
          'mathematical-verifier'
        ));
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    };
  }

  /**
   * Updates prediction assembly validation in mathematical verifier
   * Requirements: 5.3, 5.4
   */
  private updatePredictionAssemblyValidation(): void {
    // Update the validatePredictionAssemblyStep method in MathematicalVerifier
    const originalValidatePredictionAssemblyStep = this.mathematicalVerifier['validatePredictionAssemblyStep'];
    
    this.mathematicalVerifier['validatePredictionAssemblyStep'] = (step: CalculationStep): {
      isValid: boolean;
      errors: ValidationError[];
      warnings: ValidationWarning[];
      withinBounds: boolean;
    } => {
      const errors: ValidationError[] = [];
      const warnings: ValidationWarning[] = [];
      let withinBounds = true;

      const predictionData = step.output as PredictionAssembly;
      if (!predictionData || !predictionData.finalPrediction) {
        errors.push(this.mathematicalVerifier['errorHandler'].createValidationError(
          'MISSING_PREDICTION_DATA',
          'No prediction data found in step output',
          'mathematical-verifier',
          'high'
        ));
        return { isValid: false, errors, warnings, withinBounds: false };
      }

      const prediction = predictionData.finalPrediction;

      // Validate prediction values
      const predictionValidation = ValidationUtils.validatePredictionValues(
        prediction.homeScore,
        prediction.awayScore,
        prediction.confidence
      );

      if (!predictionValidation.isValid) {
        predictionValidation.errors.forEach(errorMsg => {
          errors.push(this.mathematicalVerifier['errorHandler'].createValidationError(
            'INVALID_PREDICTION_VALUE',
            errorMsg,
            'mathematical-verifier',
            'medium'
          ));
        });
        withinBounds = false;
      }

      predictionValidation.warnings.forEach(warningMsg => {
        warnings.push(this.mathematicalVerifier['errorHandler'].createValidationWarning(
          'PREDICTION_WARNING',
          warningMsg,
          'mathematical-verifier'
        ));
      });

      // Validate win probabilities sum to 1
      const probSum = prediction.homeWinProbability + prediction.awayWinProbability;
      if (Math.abs(probSum - 1.0) > 0.001) {
        errors.push(this.mathematicalVerifier['errorHandler'].createValidationError(
          'PROBABILITY_SUM_ERROR',
          `Win probabilities sum to ${probSum.toFixed(4)}, should be 1.0`,
          'mathematical-verifier',
          'medium'
        ));
      }

      // Validate probability bounds
      const homeProb = ValidationUtils.validateProbability(prediction.homeWinProbability, 'Home win probability');
      const awayProb = ValidationUtils.validateProbability(prediction.awayWinProbability, 'Away win probability');

      if (!homeProb.isValid) {
        errors.push(this.mathematicalVerifier['errorHandler'].createValidationError(
          'INVALID_PROBABILITY',
          homeProb.error!,
          'mathematical-verifier',
          'medium'
        ));
      }

      if (!awayProb.isValid) {
        errors.push(this.mathematicalVerifier['errorHandler'].createValidationError(
          'INVALID_PROBABILITY',
          awayProb.error!,
          'mathematical-verifier',
          'medium'
        ));
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        withinBounds
      };
    };
  }
}