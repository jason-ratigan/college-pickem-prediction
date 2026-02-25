// server/services/validation/__tests__/calculation-tracer.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  CalculationTracer, 
  MathematicalVerifier, 
  PredictionAssemblyTracer,
  RawStatistics,
  OpponentBaseline,
  EfficiencyCalculation,
  WeightApplication
} from '../calculation-tracer.js';
import { ValidationLoggerImpl, ErrorHandlerImpl } from '../core.js';
import { CalculationTrace, CalculationStep } from '../types.js';

/**
 * Tests for Calculation Tracer implementation
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

describe('CalculationTracer', () => {
  let logger: ValidationLoggerImpl;
  let errorHandler: ErrorHandlerImpl;
  let tracer: CalculationTracer;

  beforeEach(() => {
    logger = new ValidationLoggerImpl();
    errorHandler = new ErrorHandlerImpl(logger);
    tracer = new CalculationTracer(logger, errorHandler);
  });

  describe('Trace Management', () => {
    it('should start a new trace successfully', () => {
      const traceId = tracer.startTrace(1, 2, 2023, 12345);
      
      expect(traceId).toMatch(/^trace_[a-z0-9]+_[a-z0-9]+$/);
      
      const trace = tracer.getTrace(traceId);
      expect(trace).toBeDefined();
      expect(trace!.homeTeamId).toBe(1);
      expect(trace!.awayTeamId).toBe(2);
      expect(trace!.season).toBe(2023);
      expect(trace!.gameId).toBe(12345);
      expect(trace!.steps).toHaveLength(0);
    });

    it('should complete a trace and remove it from active traces', () => {
      const traceId = tracer.startTrace(1, 2, 2023);
      
      const finalPrediction = { homeScore: 28, awayScore: 21 };
      const completedTrace = tracer.completeTrace(traceId, finalPrediction);
      
      expect(completedTrace.finalPrediction).toEqual(finalPrediction);
      expect(completedTrace.endTime).toBeDefined();
      expect(tracer.getTrace(traceId)).toBeUndefined();
    });

    it('should get active traces summary', () => {
      const traceId1 = tracer.startTrace(1, 2, 2023);
      const traceId2 = tracer.startTrace(3, 4, 2023);
      
      const summary = tracer.getActiveTracesSummary();
      
      expect(summary).toHaveLength(2);
      expect(summary[0].traceId).toBe(traceId1);
      expect(summary[1].traceId).toBe(traceId2);
      expect(summary[0].stepCount).toBe(0);
    });
  });

  describe('Raw Statistics Tracing', () => {
    it('should trace raw statistics extraction correctly', () => {
      const traceId = tracer.startTrace(1, 2, 2023);
      
      const rawStats: RawStatistics = {
        teamId: 1,
        season: 2023,
        passingYards: 3500,
        rushingYards: 1800,
        totalYards: 5300,
        pointsScored: 420,
        passingYardsAllowed: 3200,
        rushingYardsAllowed: 1600,
        totalYardsAllowed: 4800,
        pointsAllowed: 280,
        turnoversForced: 25,
        turnoversCommitted: 18,
        gamesPlayed: 12
      };

      const stepNumber = tracer.traceRawStatisticsExtraction(traceId, 1, rawStats);
      
      expect(stepNumber).toBe(1);
      
      const trace = tracer.getTrace(traceId);
      expect(trace!.steps).toHaveLength(1);
      
      const step = trace!.steps[0];
      expect(step.stepType).toBe('data_extraction');
      expect(step.description).toContain('Extract raw statistics for team 1');
      expect(step.output.extractedStats).toEqual(rawStats);
      expect(step.output.dataCompleteness).toBe(100); // All fields present
    });

    it('should calculate data completeness correctly', () => {
      const traceId = tracer.startTrace(1, 2, 2023);
      
      const incompleteStats: RawStatistics = {
        teamId: 1,
        season: 2023,
        passingYards: 3500,
        rushingYards: 1800,
        totalYards: 5300,
        pointsScored: 420,
        passingYardsAllowed: NaN, // Missing data
        rushingYardsAllowed: 1600,
        totalYardsAllowed: 4800,
        pointsAllowed: 280,
        turnoversForced: 25,
        turnoversCommitted: 18,
        gamesPlayed: 12
      };

      tracer.traceRawStatisticsExtraction(traceId, 1, incompleteStats);
      
      const trace = tracer.getTrace(traceId);
      const step = trace!.steps[0];
      
      // Should be less than 100% due to missing passingYardsAllowed
      expect(step.output.dataCompleteness).toBeLessThan(100);
      expect(step.output.dataCompleteness).toBeGreaterThan(90);
    });
  });

  describe('Opponent Baseline Tracing', () => {
    it('should trace opponent baseline calculation correctly', () => {
      const traceId = tracer.startTrace(1, 2, 2023);
      
      const opponentStats: RawStatistics[] = [
        {
          teamId: 3, season: 2023, passingYards: 3000, rushingYards: 1500,
          totalYards: 4500, pointsScored: 350, passingYardsAllowed: 3100,
          rushingYardsAllowed: 1700, totalYardsAllowed: 4800, pointsAllowed: 300,
          turnoversForced: 20, turnoversCommitted: 15, gamesPlayed: 12
        },
        {
          teamId: 4, season: 2023, passingYards: 3200, rushingYards: 1600,
          totalYards: 4800, pointsScored: 380, passingYardsAllowed: 2900,
          rushingYardsAllowed: 1500, totalYardsAllowed: 4400, pointsAllowed: 250,
          turnoversForced: 22, turnoversCommitted: 12, gamesPlayed: 12
        }
      ];

      const baseline: OpponentBaseline = {
        teamId: 1,
        season: 2023,
        avgPassingYardsAllowed: 3000, // (3100 + 2900) / 2
        avgRushingYardsAllowed: 1600, // (1700 + 1500) / 2
        avgTotalYardsAllowed: 4600,   // (4800 + 4400) / 2
        avgPointsAllowed: 275,        // (300 + 250) / 2
        avgTurnoversForced: 21,       // (20 + 22) / 2
        calculationSteps: []
      };

      const stepNumber = tracer.traceOpponentBaselineCalculation(traceId, 1, opponentStats, baseline);
      
      expect(stepNumber).toBe(1);
      
      const trace = tracer.getTrace(traceId);
      const step = trace!.steps[0];
      
      expect(step.stepType).toBe('baseline_calculation');
      expect(step.description).toContain('Calculate opponent baseline for team 1');
      expect(step.output.baseline).toEqual(baseline);
      expect(step.output.intermediateValues.totalPassingYardsAllowed).toBe(6000);
      expect(step.output.intermediateValues.totalRushingYardsAllowed).toBe(3200);
    });
  });

  describe('Efficiency Calculation Tracing', () => {
    it('should trace efficiency calculation correctly', () => {
      const traceId = tracer.startTrace(1, 2, 2023);
      
      const rawStats: RawStatistics = {
        teamId: 1, season: 2023, passingYards: 3500, rushingYards: 1800,
        totalYards: 5300, pointsScored: 420, passingYardsAllowed: 3200,
        rushingYardsAllowed: 1600, totalYardsAllowed: 4800, pointsAllowed: 280,
        turnoversForced: 25, turnoversCommitted: 18, gamesPlayed: 12
      };

      const baseline: OpponentBaseline = {
        teamId: 1, season: 2023, avgPassingYardsAllowed: 3000,
        avgRushingYardsAllowed: 1600, avgTotalYardsAllowed: 4600,
        avgPointsAllowed: 275, avgTurnoversForced: 21, calculationSteps: []
      };

      const efficiency: EfficiencyCalculation = {
        teamId: 1, season: 2023,
        passingEfficiency: 15.5,   // Realistic efficiency value
        rushingEfficiency: 8.2,    // Realistic efficiency value
        scoringEfficiency: 12.1,   // Realistic efficiency value
        defensiveEfficiency: -2.5, // 275 - 280 (realistic)
        turnoverEfficiency: -1.4,  // Realistic efficiency value
        overallEfficiency: 8.2,    // Weighted average
        calculationSteps: []
      };

      const stepNumber = tracer.traceEfficiencyCalculation(traceId, 1, rawStats, baseline, efficiency);
      
      expect(stepNumber).toBe(1);
      
      const trace = tracer.getTrace(traceId);
      const step = trace!.steps[0];
      
      expect(step.stepType).toBe('efficiency_calculation');
      expect(step.output.efficiency).toEqual(efficiency);
      expect(step.output.intermediateCalculations.passingDifferential).toBe(500);
      expect(step.output.intermediateCalculations.rushingDifferential).toBe(200);
      expect(step.output.intermediateCalculations.scoringDifferential).toBe(145);
    });

    it('should trace iterative efficiency calculation', () => {
      const traceId = tracer.startTrace(1, 2, 2023);
      
      const stepNumber = tracer.traceIterativeEfficiencyCalculation(
        traceId, 1, 3, 15.5, 15.52, 0.02, 0.01
      );
      
      expect(stepNumber).toBe(1);
      
      const trace = tracer.getTrace(traceId);
      const step = trace!.steps[0];
      
      expect(step.stepType).toBe('efficiency_calculation');
      expect(step.description).toContain('Iterative efficiency calculation - iteration 3');
      expect(step.output.hasConverged).toBe(false); // 0.02 > 0.01 tolerance
      expect(step.output.change).toBeCloseTo(0.02);
    });
  });
});

describe('MathematicalVerifier', () => {
  let logger: ValidationLoggerImpl;
  let errorHandler: ErrorHandlerImpl;
  let verifier: MathematicalVerifier;

  beforeEach(() => {
    logger = new ValidationLoggerImpl();
    errorHandler = new ErrorHandlerImpl(logger);
    verifier = new MathematicalVerifier(logger, errorHandler);
  });

  describe('Data Extraction Validation', () => {
    it('should validate correct data extraction step', () => {
      const step: CalculationStep = {
        stepNumber: 1,
        stepType: 'data_extraction',
        description: 'Extract raw statistics',
        inputs: { teamId: 1 },
        calculation: 'Data extraction',
        output: {
          extractedStats: {
            teamId: 1, season: 2023, passingYards: 3500, rushingYards: 1800,
            totalYards: 5300, pointsScored: 420, passingYardsAllowed: 3200,
            rushingYardsAllowed: 1600, totalYardsAllowed: 4800, pointsAllowed: 280,
            turnoversForced: 25, turnoversCommitted: 18, gamesPlayed: 12
          },
          dataCompleteness: 100
        },
        isValid: true
      };

      const result = verifier.validateCalculationStep('trace_123', step);
      
      expect(result.isValid).toBe(true);
      expect(result.mathematicallyCorrect).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect total yards mismatch', () => {
      const step: CalculationStep = {
        stepNumber: 1,
        stepType: 'data_extraction',
        description: 'Extract raw statistics',
        inputs: { teamId: 1 },
        calculation: 'Data extraction',
        output: {
          extractedStats: {
            teamId: 1, season: 2023, passingYards: 3500, rushingYards: 1800,
            totalYards: 5400, // Should be 5300 (3500 + 1800)
            pointsScored: 420, passingYardsAllowed: 3200,
            rushingYardsAllowed: 1600, totalYardsAllowed: 4800, pointsAllowed: 280,
            turnoversForced: 25, turnoversCommitted: 18, gamesPlayed: 12
          },
          dataCompleteness: 100
        },
        isValid: true
      };

      const result = verifier.validateCalculationStep('trace_123', step);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'TOTAL_YARDS_MISMATCH')).toBe(true);
    });

    it('should detect invalid field values', () => {
      const step: CalculationStep = {
        stepNumber: 1,
        stepType: 'data_extraction',
        description: 'Extract raw statistics',
        inputs: { teamId: 1 },
        calculation: 'Data extraction',
        output: {
          extractedStats: {
            teamId: 1, season: 2023, passingYards: -100, // Invalid negative value
            rushingYards: 1800, totalYards: 1700, pointsScored: 420,
            passingYardsAllowed: 3200, rushingYardsAllowed: 1600,
            totalYardsAllowed: 4800, pointsAllowed: 280,
            turnoversForced: 25, turnoversCommitted: 18, gamesPlayed: 0 // Invalid zero games
          },
          dataCompleteness: 100
        },
        isValid: true
      };

      const result = verifier.validateCalculationStep('trace_123', step);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Passing Yards'))).toBe(true);
      expect(result.errors.some(e => e.message.includes('Games Played'))).toBe(true);
    });
  });

  describe('Baseline Calculation Validation', () => {
    it('should validate correct baseline calculation', () => {
      const step: CalculationStep = {
        stepNumber: 1,
        stepType: 'baseline_calculation',
        description: 'Calculate baseline',
        inputs: { teamId: 1, opponentCount: 2 },
        calculation: 'Baseline calculation',
        output: {
          baseline: {
            teamId: 1, season: 2023, avgPassingYardsAllowed: 3000,
            avgRushingYardsAllowed: 1600, avgTotalYardsAllowed: 4600,
            avgPointsAllowed: 275, avgTurnoversForced: 21, calculationSteps: []
          },
          intermediateValues: {
            totalPassingYardsAllowed: 6000,
            totalRushingYardsAllowed: 3200,
            totalYardsAllowed: 9200,
            totalPointsAllowed: 550,
            totalTurnoversForced: 42
          }
        },
        isValid: true
      };

      const result = verifier.validateCalculationStep('trace_123', step);
      
      expect(result.isValid).toBe(true);
      expect(result.mathematicallyCorrect).toBe(true);
    });

    it('should detect calculation errors in baseline', () => {
      const step: CalculationStep = {
        stepNumber: 1,
        stepType: 'baseline_calculation',
        description: 'Calculate baseline',
        inputs: { teamId: 1, opponentCount: 2 },
        calculation: 'Baseline calculation',
        output: {
          baseline: {
            teamId: 1, season: 2023, avgPassingYardsAllowed: 3100, // Should be 3000
            avgRushingYardsAllowed: 1600, avgTotalYardsAllowed: 4600,
            avgPointsAllowed: 275, avgTurnoversForced: 21, calculationSteps: []
          },
          intermediateValues: {
            totalPassingYardsAllowed: 6000,
            totalRushingYardsAllowed: 3200,
            totalYardsAllowed: 9200,
            totalPointsAllowed: 550,
            totalTurnoversForced: 42
          }
        },
        isValid: true
      };

      const result = verifier.validateCalculationStep('trace_123', step);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'CALCULATION_ERROR')).toBe(true);
    });
  });

  describe('Efficiency Calculation Validation', () => {
    it('should validate correct efficiency calculation', () => {
      const step: CalculationStep = {
        stepNumber: 1,
        stepType: 'efficiency_calculation',
        description: 'Calculate efficiency',
        inputs: { teamId: 1 },
        calculation: 'Efficiency calculation',
        output: {
          efficiency: {
            teamId: 1, season: 2023, passingEfficiency: 15.5, rushingEfficiency: 8.2,
            scoringEfficiency: 12.1, defensiveEfficiency: -2.5, turnoverEfficiency: -1.4,
            overallEfficiency: 8.2, calculationSteps: []
          },
          intermediateCalculations: {
            passingDifferential: 15.5,
            rushingDifferential: 8.2,
            scoringDifferential: 12.1,
            defensiveDifferential: -2.5,
            turnoverDifferential: -1.4
          }
        },
        isValid: true
      };

      const result = verifier.validateCalculationStep('trace_123', step);
      
      expect(result.isValid).toBe(true);
      expect(result.mathematicallyCorrect).toBe(true);
    });

    it('should detect efficiency values out of bounds', () => {
      const step: CalculationStep = {
        stepNumber: 1,
        stepType: 'efficiency_calculation',
        description: 'Calculate efficiency',
        inputs: { teamId: 1 },
        calculation: 'Efficiency calculation',
        output: {
          efficiency: {
            teamId: 1, season: 2023, passingEfficiency: 42, // Extreme but within bounds
            rushingEfficiency: 8.2, scoringEfficiency: 12.1,
            defensiveEfficiency: -2.5, turnoverEfficiency: -1.4,
            overallEfficiency: 8.2, calculationSteps: []
          },
          intermediateCalculations: {
            passingDifferential: 42,
            rushingDifferential: 8.2,
            scoringDifferential: 12.1,
            defensiveDifferential: -2.5,
            turnoverDifferential: -1.4
          }
        },
        isValid: true
      };

      const result = verifier.validateCalculationStep('trace_123', step);
      
      expect(result.warnings.some(w => w.code === 'EFFICIENCY_EXTREME_VALUE')).toBe(true);
    });
  });

  describe('Error Identification', () => {
    it('should identify calculation errors in trace', () => {
      const trace: CalculationTrace = {
        traceId: 'trace_123',
        homeTeamId: 1,
        awayTeamId: 2,
        season: 2023,
        steps: [
          { stepNumber: 1, stepType: 'data_extraction', description: 'Step 1', inputs: {}, calculation: '', output: {}, isValid: true },
          { stepNumber: 2, stepType: 'baseline_calculation', description: 'Step 2', inputs: {}, calculation: '', output: {}, isValid: false }
        ],
        validationResults: [
          { stepNumber: 1, isValid: true, errors: [], warnings: [], mathematicallyCorrect: true, withinBounds: true },
          { 
            stepNumber: 2, 
            isValid: false, 
            errors: [{ code: 'CALC_ERROR', message: 'Calculation error', severity: 'high', component: 'test' }], 
            warnings: [], 
            mathematicallyCorrect: false, 
            withinBounds: true 
          }
        ],
        startTime: new Date()
      };

      const errorAnalysis = verifier.identifyCalculationErrors(trace);
      
      expect(errorAnalysis.errorSteps).toEqual([2]);
      expect(errorAnalysis.totalErrors).toBe(1);
      expect(errorAnalysis.criticalErrors).toBe(1);
      expect(errorAnalysis.errorSummary).toHaveLength(1);
    });
  });
});

describe('PredictionAssemblyTracer', () => {
  let logger: ValidationLoggerImpl;
  let errorHandler: ErrorHandlerImpl;
  let calculationTracer: CalculationTracer;
  let mathematicalVerifier: MathematicalVerifier;
  let predictionTracer: PredictionAssemblyTracer;

  beforeEach(() => {
    logger = new ValidationLoggerImpl();
    errorHandler = new ErrorHandlerImpl(logger);
    calculationTracer = new CalculationTracer(logger, errorHandler);
    mathematicalVerifier = new MathematicalVerifier(logger, errorHandler);
    predictionTracer = new PredictionAssemblyTracer(calculationTracer, mathematicalVerifier);
  });

  describe('Weight Application Tracing', () => {
    it('should trace weight application correctly', () => {
      const traceId = calculationTracer.startTrace(1, 2, 2023);
      
      const homeEfficiencies = {
        passing: 15.5,
        rushing: 8.2,
        scoring: 12.1,
        defense: -3.4,
        turnovers: 2.1
      };

      const awayEfficiencies = {
        passing: 10.2,
        rushing: 12.8,
        scoring: 8.9,
        defense: 1.2,
        turnovers: -1.5
      };

      const weights = {
        passing: 1.2,
        rushing: 0.8,
        scoring: 1.5,
        defense: 1.1,
        turnovers: 0.6
      };

      const stepNumber = predictionTracer.traceWeightApplication(
        traceId, homeEfficiencies, awayEfficiencies, weights
      );

      expect(stepNumber).toBe(1);

      const trace = calculationTracer.getTrace(traceId);
      const step = trace!.steps[0];

      expect(step.stepType).toBe('weight_application');
      expect(step.output.weightApplications).toHaveLength(5);
      
      const passingApp = step.output.weightApplications.find((wa: WeightApplication) => wa.category === 'passing');
      expect(passingApp.homeTeamContribution).toBeCloseTo(15.5 * 1.2);
      expect(passingApp.awayTeamContribution).toBeCloseTo(10.2 * 1.2);
      expect(passingApp.netAdvantage).toBeCloseTo((15.5 * 1.2) - (10.2 * 1.2));
    });
  });

  describe('Confidence Calculation Tracing', () => {
    it('should trace confidence calculation correctly', () => {
      const traceId = calculationTracer.startTrace(1, 2, 2023);
      
      const stepNumber = predictionTracer.traceConfidenceCalculation(
        traceId, 0.75, 120, 0.15, 8.5
      );

      expect(stepNumber).toBe(1);

      const trace = calculationTracer.getTrace(traceId);
      const step = trace!.steps[0];

      expect(step.stepType).toBe('prediction_assembly');
      expect(step.output.confidence).toBeGreaterThan(0.1);
      expect(step.output.confidence).toBeLessThan(0.95);
      expect(step.output.confidenceFactors).toHaveLength(4);
    });
  });

  describe('Probability Calculation Tracing', () => {
    it('should trace probability calculation correctly', () => {
      const traceId = calculationTracer.startTrace(1, 2, 2023);
      
      const stepNumber = predictionTracer.traceProbabilityCalculation(
        traceId, 28.5, 21.2, 0.75, 0.65
      );

      expect(stepNumber).toBe(1);

      const trace = calculationTracer.getTrace(traceId);
      const step = trace!.steps[0];

      expect(step.stepType).toBe('prediction_assembly');
      expect(step.output.homeWinProbability).toBeGreaterThan(0.5); // Home team favored
      expect(step.output.awayWinProbability).toBeLessThan(0.5);
      expect(step.output.homeWinProbability + step.output.awayWinProbability).toBeCloseTo(1.0);
    });
  });

  describe('Boundary Validation Tracing', () => {
    it('should trace boundary validation with no adjustments needed', () => {
      const traceId = calculationTracer.startTrace(1, 2, 2023);
      
      const stepNumber = predictionTracer.traceBoundaryValidation(
        traceId, 28.5, 21.2, 0, 100, 70
      );

      expect(stepNumber).toBe(1);

      const trace = calculationTracer.getTrace(traceId);
      const step = trace!.steps[0];

      expect(step.output.homeScoreAdjusted).toBe(28.5);
      expect(step.output.awayScoreAdjusted).toBe(21.2);
      expect(step.output.adjustmentsMade).toHaveLength(0);
    });

    it('should trace boundary validation with score adjustments', () => {
      const traceId = calculationTracer.startTrace(1, 2, 2023);
      
      const stepNumber = predictionTracer.traceBoundaryValidation(
        traceId, 105, -5, 0, 100, 70 // Scores out of bounds
      );

      expect(stepNumber).toBe(1);

      const trace = calculationTracer.getTrace(traceId);
      const step = trace!.steps[0];

      expect(step.output.homeScoreAdjusted).toBeLessThanOrEqual(100);
      expect(step.output.awayScoreAdjusted).toBeGreaterThanOrEqual(0);
      expect(step.output.adjustmentsMade.length).toBeGreaterThan(0);
    });

    it('should trace boundary validation with point differential adjustment', () => {
      const traceId = calculationTracer.startTrace(1, 2, 2023);
      
      const stepNumber = predictionTracer.traceBoundaryValidation(
        traceId, 90, 10, 0, 100, 70 // Point differential = 80 > 70
      );

      expect(stepNumber).toBe(1);

      const trace = calculationTracer.getTrace(traceId);
      const step = trace!.steps[0];

      const finalDiff = Math.abs(step.output.homeScoreAdjusted - step.output.awayScoreAdjusted);
      expect(finalDiff).toBeLessThanOrEqual(70);
      expect(step.output.adjustmentsMade.some((adj: any) => adj.type === 'point_differential')).toBe(true);
    });
  });

  describe('Final Prediction Assembly', () => {
    it('should assemble final prediction correctly', () => {
      const traceId = calculationTracer.startTrace(1, 2, 2023);
      
      const weightApplications: WeightApplication[] = [
        {
          category: 'passing',
          weight: 1.2,
          homeTeamValue: 15.5,
          awayTeamValue: 10.2,
          homeTeamContribution: 18.6,
          awayTeamContribution: 12.24,
          netAdvantage: 6.36
        }
      ];

      const prediction = predictionTracer.assembleFinalPrediction(
        traceId, 1, 2, 2023, weightApplications, 0.75, 0.65, 0.35, 28.5, 21.2
      );

      expect(prediction.homeTeamId).toBe(1);
      expect(prediction.awayTeamId).toBe(2);
      expect(prediction.season).toBe(2023);
      expect(prediction.finalPrediction.homeScore).toBe(28.5);
      expect(prediction.finalPrediction.awayScore).toBe(21.2);
      expect(prediction.finalPrediction.confidence).toBe(0.75);
      expect(prediction.finalPrediction.homeWinProbability).toBe(0.65);
      expect(prediction.weightApplications).toEqual(weightApplications);
    });
  });
});