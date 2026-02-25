// server/services/validation/__tests__/analysis-reporter.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { analysisReporter, AnalysisReporter } from '../analysis-reporter.js';
import { 
  GameAnalysisResult, 
  AccuracyTestResult, 
  SystemHealthStatus
} from '../types.js';
import type { IntuitiveAnalysisReport } from '../analysis-reporter.js';

describe('AnalysisReporter', () => {
  let mockGameAnalyses: GameAnalysisResult[];
  let mockAccuracyResults: AccuracyTestResult;
  let mockSystemHealth: SystemHealthStatus;

  beforeEach(() => {
    // Mock game analyses with successful and failed predictions
    mockGameAnalyses = [
      {
        gameId: 1,
        gameInfo: {
          homeTeam: 'Alabama',
          awayTeam: 'Auburn',
          season: 2024,
          week: 13,
          actualScore: { home: 28, away: 14 }
        },
        prediction: {
          homeScore: 31,
          awayScore: 17,
          confidence: 85,
          winProbability: { home: 78, away: 22 }
        },
        efficiencyBreakdown: {
          homeTeam: {
            teamId: 1,
            teamName: 'Alabama',
            overallEfficiency: 12.5,
            categoryEfficiencies: {
              totalOffense: 15.2,
              passingOffense: 8.7,
              rushingOffense: 12.1,
              totalDefense: 9.8
            },
            opponentBaseline: 0,
            adjustedEfficiencies: {
              totalOffense: 15.2,
              passingOffense: 8.7,
              rushingOffense: 12.1,
              totalDefense: 9.8
            },
            strengthsAndWeaknesses: {
              strengths: ['Total Offense', 'Rushing Offense'],
              weaknesses: ['Passing Defense']
            }
          },
          awayTeam: {
            teamId: 2,
            teamName: 'Auburn',
            overallEfficiency: -3.2,
            categoryEfficiencies: {
              totalOffense: -2.1,
              passingOffense: -5.3,
              rushingOffense: 1.2,
              totalDefense: -4.3
            },
            opponentBaseline: 0,
            adjustedEfficiencies: {
              totalOffense: -2.1,
              passingOffense: -5.3,
              rushingOffense: 1.2,
              totalDefense: -4.3
            },
            strengthsAndWeaknesses: {
              strengths: ['Rushing Offense'],
              weaknesses: ['Passing Offense', 'Total Defense']
            }
          },
          matchupAdvantages: [
            {
              category: 'Total Offense',
              homeTeamValue: 15.2,
              awayTeamValue: -2.1,
              advantage: 'home',
              magnitude: 17.3,
              impact: 'high'
            }
          ]
        },
        keyFactors: [
          {
            factor: 'Total Offense',
            description: 'Total Offense: home team has 17.3 point advantage',
            homeTeamRating: 15.2,
            awayTeamRating: -2.1,
            advantage: 'home',
            impactOnPrediction: 2.5,
            weight: 0.8
          }
        ],
        predictionExplanation: {
          summary: 'Alabama is favored by 14 points with 85% confidence',
          keyAdvantages: ['Total Offense: Alabama advantage', 'Rushing Offense: Alabama advantage'],
          riskFactors: [],
          confidenceFactors: ['Strong statistical model (R² > 0.6)', 'Multiple significant matchup advantages identified'],
          statisticalBasis: {
            modelRSquared: 0.65,
            sampleSize: 25,
            significantPredictors: ['Total Offense', 'Rushing Offense']
          },
          humanReadableExplanation: 'Our analysis predicts Alabama will defeat Auburn by 14 points. This prediction is based on Alabama\'s advantages in: Total Offense, Rushing Offense. We have high confidence in this prediction due to strong statistical indicators.'
        },
        outcomeComparison: {
          predictionAccuracy: {
            winnerCorrect: true,
            scoreError: { home: 3, away: 3, total: 6 },
            withinConfidenceInterval: true
          },
          errorAnalysis: {
            errorType: 'statistical_noise',
            errorMagnitude: 6,
            possibleCauses: ['Normal game-to-game variation'],
            lessons: ['Error within expected range for statistical models']
          },
          predictionQuality: 'excellent'
        }
      },
      {
        gameId: 2,
        gameInfo: {
          homeTeam: 'Georgia',
          awayTeam: 'Florida',
          season: 2024,
          week: 11,
          actualScore: { home: 21, away: 35 }
        },
        prediction: {
          homeScore: 28,
          awayScore: 17,
          confidence: 72,
          winProbability: { home: 68, away: 32 }
        },
        efficiencyBreakdown: {
          homeTeam: {
            teamId: 3,
            teamName: 'Georgia',
            overallEfficiency: 8.1,
            categoryEfficiencies: {
              totalOffense: 6.5,
              totalDefense: 9.7
            },
            opponentBaseline: 0,
            adjustedEfficiencies: {
              totalOffense: 6.5,
              totalDefense: 9.7
            },
            strengthsAndWeaknesses: {
              strengths: ['Total Defense'],
              weaknesses: ['Passing Offense']
            }
          },
          awayTeam: {
            teamId: 4,
            teamName: 'Florida',
            overallEfficiency: 2.3,
            categoryEfficiencies: {
              totalOffense: 4.1,
              totalDefense: 0.5
            },
            opponentBaseline: 0,
            adjustedEfficiencies: {
              totalOffense: 4.1,
              totalDefense: 0.5
            },
            strengthsAndWeaknesses: {
              strengths: ['Total Offense'],
              weaknesses: ['Total Defense']
            }
          },
          matchupAdvantages: [
            {
              category: 'Total Defense',
              homeTeamValue: 9.7,
              awayTeamValue: 0.5,
              advantage: 'home',
              magnitude: 9.2,
              impact: 'high'
            }
          ]
        },
        keyFactors: [
          {
            factor: 'Total Defense',
            description: 'Total Defense: home team has 9.2 point advantage',
            homeTeamRating: 9.7,
            awayTeamRating: 0.5,
            advantage: 'home',
            impactOnPrediction: 1.8,
            weight: 0.7
          }
        ],
        predictionExplanation: {
          summary: 'Georgia is favored by 11 points with 72% confidence',
          keyAdvantages: ['Total Defense: Georgia advantage'],
          riskFactors: ['Limited statistical significance in some predictors'],
          confidenceFactors: ['Adequate sample size for analysis'],
          statisticalBasis: {
            modelRSquared: 0.42,
            sampleSize: 18,
            significantPredictors: ['Total Defense']
          },
          humanReadableExplanation: 'Our analysis predicts Georgia will defeat Florida by 11 points. We have moderate confidence in this prediction.'
        },
        outcomeComparison: {
          predictionAccuracy: {
            winnerCorrect: false,
            scoreError: { home: 7, away: 18, total: 25 },
            withinConfidenceInterval: false
          },
          errorAnalysis: {
            errorType: 'systematic_bias',
            errorMagnitude: 25,
            possibleCauses: ['Potential bias in prediction methodology', 'Unaccounted factors affecting game outcome'],
            lessons: ['Review prediction methodology for systematic issues']
          },
          predictionQuality: 'poor'
        }
      }
    ];

    mockAccuracyResults = {
      isValid: true,
      score: 75,
      errors: [],
      warnings: [],
      recommendations: [],
      timestamp: new Date(),
      sampleSize: 50,
      testPeriod: {
        startDate: new Date('2024-09-01'),
        endDate: new Date('2024-11-30'),
        season: 2024
      },
      winProbabilityAccuracy: {
        brierScore: 0.22,
        logLoss: 0.65,
        accuracy: 72,
        precision: 0.74,
        recall: 0.72,
        f1Score: 0.73,
        rocAuc: 0.78
      },
      scorePredictionAccuracy: {
        meanAbsoluteError: 12.5,
        rootMeanSquareError: 16.2,
        medianAbsoluteError: 10.8,
        meanPercentageError: 18.5,
        homeTeamAccuracy: {
          mae: 12.2,
          rmse: 15.8,
          bias: 1.2
        },
        awayTeamAccuracy: {
          mae: 12.8,
          rmse: 16.6,
          bias: -0.8
        }
      },
      confidenceCalibration: {
        calibrationScore: 78,
        overconfidenceRate: 0.15,
        underconfidenceRate: 0.12,
        calibrationCurve: [
          { predictedProbability: 0.6, actualProbability: 0.58, sampleSize: 10 },
          { predictedProbability: 0.8, actualProbability: 0.75, sampleSize: 15 }
        ],
        reliabilityDiagram: {
          bins: 10,
          expectedCalibrationError: 0.08,
          maximumCalibrationError: 0.15
        }
      },
      systematicBiases: [
        {
          biasType: 'home_team',
          description: 'Slight bias favoring home teams',
          magnitude: 0.05,
          significance: 0.08,
          affectedGames: 8,
          examples: []
        }
      ],
      predictionReliability: {
        overallReliability: 'medium',
        reliabilityByConfidence: [
          {
            confidenceRange: [70, 80],
            accuracy: 75,
            sampleSize: 20,
            reliability: 'medium'
          }
        ],
        reliabilityByGameType: [
          {
            gameType: 'conference',
            accuracy: 74,
            sampleSize: 30,
            reliability: 'medium'
          }
        ]
      }
    };

    mockSystemHealth = {
      overallHealth: 'good',
      healthScore: 82,
      dataQuality: {
        score: 85,
        status: 'good',
        completeness: 88,
        consistency: 82,
        validity: 87,
        timeliness: 92,
        issueCount: 3,
        criticalIssues: 0
      },
      modelHealth: {
        score: 78,
        status: 'good',
        regressionModelFit: 0.45,
        statisticalSignificance: 82,
        convergenceStability: 88,
        weightStability: 85,
        lastSuccessfulAnalysis: new Date('2024-11-30')
      },
      predictionReliability: {
        score: 75,
        status: 'good',
        accuracy: 72,
        calibration: 78,
        consistency: 80,
        biasLevel: 12,
        confidenceReliability: 76
      },
      alerts: [
        {
          id: 'alert-1',
          type: 'warning',
          component: 'data_quality',
          message: 'Minor data completeness issues detected',
          details: 'Some games missing advanced statistics',
          timestamp: new Date(),
          resolved: false,
          actionRequired: false,
          recommendations: ['Improve data collection for advanced metrics']
        }
      ],
      lastUpdated: new Date(),
      trends: {
        dataQualityTrend: {
          direction: 'stable',
          magnitude: 0.1,
          significance: 0.05,
          dataPoints: [
            { timestamp: new Date('2024-11-01'), value: 84 },
            { timestamp: new Date('2024-11-15'), value: 85 },
            { timestamp: new Date('2024-11-30'), value: 85 }
          ]
        },
        modelHealthTrend: {
          direction: 'improving',
          magnitude: 0.15,
          significance: 0.12,
          dataPoints: [
            { timestamp: new Date('2024-11-01'), value: 76 },
            { timestamp: new Date('2024-11-15'), value: 77 },
            { timestamp: new Date('2024-11-30'), value: 78 }
          ]
        },
        predictionAccuracyTrend: {
          direction: 'stable',
          magnitude: 0.05,
          significance: 0.03,
          dataPoints: [
            { timestamp: new Date('2024-11-01'), value: 74 },
            { timestamp: new Date('2024-11-15'), value: 75 },
            { timestamp: new Date('2024-11-30'), value: 75 }
          ]
        },
        timeRange: {
          start: new Date('2024-11-01'),
          end: new Date('2024-11-30'),
          dataPoints: 30
        }
      }
    };
  });

  describe('generateIntuitiveReport', () => {
    it('should generate a comprehensive intuitive analysis report', () => {
      const report = analysisReporter.generateIntuitiveReport(
        mockGameAnalyses,
        mockAccuracyResults,
        mockSystemHealth
      );

      expect(report).toBeDefined();
      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.executiveSummary).toBeDefined();
      expect(report.systemConfidenceAssessment).toBeDefined();
      expect(report.predictionExamples).toBeDefined();
      expect(report.confidenceInterpretationGuide).toBeDefined();
      expect(report.recommendationsAndInsights).toBeDefined();
      expect(report.technicalAppendix).toBeDefined();
    });

    it('should create executive summary with key findings', () => {
      const report = analysisReporter.generateIntuitiveReport(
        mockGameAnalyses,
        mockAccuracyResults,
        mockSystemHealth
      );

      const summary = report.executiveSummary;
      expect(summary.overallSystemHealth).toBe('good');
      expect(summary.keyFindings).toBeInstanceOf(Array);
      expect(summary.keyFindings.length).toBeGreaterThan(0);
      expect(summary.predictionAccuracySummary).toContain('50.0%'); // 1 out of 2 correct
      expect(summary.confidenceInSystem).toBeGreaterThan(0);
      expect(summary.mainRecommendations).toBeInstanceOf(Array);
    });

    it('should assess system confidence across components', () => {
      const report = analysisReporter.generateIntuitiveReport(
        mockGameAnalyses,
        mockAccuracyResults,
        mockSystemHealth
      );

      const confidence = report.systemConfidenceAssessment;
      expect(confidence.dataQualityConfidence.score).toBeGreaterThan(0);
      expect(confidence.statisticalModelConfidence.score).toBeGreaterThan(0);
      expect(confidence.predictionAccuracyConfidence.score).toBeGreaterThan(0);
      expect(confidence.overallSystemConfidence.score).toBeGreaterThan(0);
      
      expect(confidence.confidenceFactors.strengthening).toBeInstanceOf(Array);
      expect(confidence.confidenceFactors.weakening).toBeInstanceOf(Array);
    });

    it('should provide specific prediction examples', () => {
      const report = analysisReporter.generateIntuitiveReport(
        mockGameAnalyses,
        mockAccuracyResults,
        mockSystemHealth
      );

      const examples = report.predictionExamples;
      expect(examples.successfulPredictions).toBeInstanceOf(Array);
      expect(examples.failedPredictions).toBeInstanceOf(Array);
      expect(examples.insightfulPredictions).toBeInstanceOf(Array);
      expect(examples.exampleAnalysis).toBeDefined();
      
      // Should have at least one successful and one failed prediction from our mock data
      expect(examples.successfulPredictions.length).toBeGreaterThan(0);
      expect(examples.failedPredictions.length).toBeGreaterThan(0);
    });

    it('should create confidence interpretation guide', () => {
      const report = analysisReporter.generateIntuitiveReport(
        mockGameAnalyses,
        mockAccuracyResults,
        mockSystemHealth
      );

      const guide = report.confidenceInterpretationGuide;
      expect(guide.confidenceLevels).toBeInstanceOf(Array);
      expect(guide.confidenceLevels.length).toBe(5); // Should have 5 confidence levels
      
      expect(guide.interpretationTips).toBeInstanceOf(Array);
      expect(guide.commonMisconceptions).toBeInstanceOf(Array);
      expect(guide.bestPractices).toBeInstanceOf(Array);
      expect(guide.contextualFactors).toBeInstanceOf(Array);
      
      // Check confidence level structure
      const veryHighLevel = guide.confidenceLevels.find(l => l.label === 'very_high');
      expect(veryHighLevel).toBeDefined();
      expect(veryHighLevel?.range).toEqual([90, 100]);
      expect(veryHighLevel?.description).toBeDefined();
      expect(veryHighLevel?.typicalAccuracy).toBeDefined();
      expect(veryHighLevel?.recommendedUse).toBeDefined();
    });

    it('should generate actionable recommendations', () => {
      const report = analysisReporter.generateIntuitiveReport(
        mockGameAnalyses,
        mockAccuracyResults,
        mockSystemHealth
      );

      const recommendations = report.recommendationsAndInsights;
      expect(recommendations.immediateActions).toBeInstanceOf(Array);
      expect(recommendations.longTermImprovements).toBeInstanceOf(Array);
      expect(recommendations.dataCollectionRecommendations).toBeInstanceOf(Array);
      expect(recommendations.modelEnhancements).toBeInstanceOf(Array);
      expect(recommendations.userGuidance).toBeInstanceOf(Array);
      
      // Check recommendation structure
      if (recommendations.immediateActions.length > 0) {
        const action = recommendations.immediateActions[0];
        expect(action.priority).toBeDefined();
        expect(action.category).toBeDefined();
        expect(action.title).toBeDefined();
        expect(action.description).toBeDefined();
        expect(action.expectedImpact).toBeDefined();
        expect(action.implementationEffort).toBeDefined();
        expect(action.timeline).toBeDefined();
        expect(action.successMetrics).toBeInstanceOf(Array);
      }
    });

    it('should include technical appendix with detailed metrics', () => {
      const report = analysisReporter.generateIntuitiveReport(
        mockGameAnalyses,
        mockAccuracyResults,
        mockSystemHealth
      );

      const appendix = report.technicalAppendix;
      expect(appendix.methodologyOverview).toBeDefined();
      expect(appendix.statisticalMetrics).toBeInstanceOf(Array);
      expect(appendix.dataQualityMetrics).toBeDefined();
      expect(appendix.modelPerformanceMetrics).toBeDefined();
      expect(appendix.limitationsAndAssumptions).toBeInstanceOf(Array);
      
      // Check statistical metrics structure
      expect(appendix.statisticalMetrics.length).toBeGreaterThan(0);
      const metric = appendix.statisticalMetrics[0];
      expect(metric.metric).toBeDefined();
      expect(metric.value).toBeDefined();
      expect(metric.interpretation).toBeDefined();
    });
  });

  describe('prediction examples analysis', () => {
    it('should correctly categorize successful predictions', () => {
      const report = analysisReporter.generateIntuitiveReport(
        mockGameAnalyses,
        mockAccuracyResults,
        mockSystemHealth
      );

      const successfulPredictions = report.predictionExamples.successfulPredictions;
      expect(successfulPredictions.length).toBe(1); // Alabama vs Auburn should be successful
      
      const successful = successfulPredictions[0];
      expect(successful.gameInfo.homeTeam).toBe('Alabama');
      expect(successful.actualOutcome?.accuracy).toBe('excellent');
      expect(successful.whyItWorked).toBeDefined();
      expect(successful.lessonsLearned).toBeInstanceOf(Array);
    });

    it('should correctly categorize failed predictions', () => {
      const report = analysisReporter.generateIntuitiveReport(
        mockGameAnalyses,
        mockAccuracyResults,
        mockSystemHealth
      );

      const failedPredictions = report.predictionExamples.failedPredictions;
      expect(failedPredictions.length).toBe(1); // Georgia vs Florida should be failed
      
      const failed = failedPredictions[0];
      expect(failed.gameInfo.homeTeam).toBe('Georgia');
      expect(failed.actualOutcome?.accuracy).toBe('poor');
      expect(failed.whyItFailed).toBeDefined();
      expect(failed.lessonsLearned).toBeInstanceOf(Array);
    });

    it('should analyze prediction patterns', () => {
      const report = analysisReporter.generateIntuitiveReport(
        mockGameAnalyses,
        mockAccuracyResults,
        mockSystemHealth
      );

      const analysis = report.predictionExamples.exampleAnalysis;
      expect(analysis.successPatterns).toBeInstanceOf(Array);
      expect(analysis.failurePatterns).toBeInstanceOf(Array);
      expect(analysis.lessonsLearned).toBeInstanceOf(Array);
      
      expect(analysis.successPatterns.length).toBeGreaterThan(0);
      expect(analysis.failurePatterns.length).toBeGreaterThan(0);
      expect(analysis.lessonsLearned.length).toBeGreaterThan(0);
    });
  });

  describe('confidence level assessment', () => {
    it('should correctly assess data quality confidence', () => {
      const report = analysisReporter.generateIntuitiveReport(
        mockGameAnalyses,
        mockAccuracyResults,
        mockSystemHealth
      );

      const dataConfidence = report.systemConfidenceAssessment.dataQualityConfidence;
      expect(dataConfidence.score).toBe(85); // Should match mock data quality score
      expect(dataConfidence.level).toBe('high'); // 85 should be high confidence
      expect(dataConfidence.explanation).toBeDefined();
      expect(dataConfidence.supportingEvidence).toBeInstanceOf(Array);
      expect(dataConfidence.concerns).toBeInstanceOf(Array);
    });

    it('should correctly assess model confidence', () => {
      const report = analysisReporter.generateIntuitiveReport(
        mockGameAnalyses,
        mockAccuracyResults,
        mockSystemHealth
      );

      const modelConfidence = report.systemConfidenceAssessment.statisticalModelConfidence;
      expect(modelConfidence.score).toBe(78); // Should match mock model health score
      expect(modelConfidence.level).toBe('high'); // 78 should be high confidence
      expect(modelConfidence.explanation).toBeDefined();
    });

    it('should correctly assess prediction accuracy confidence', () => {
      const report = analysisReporter.generateIntuitiveReport(
        mockGameAnalyses,
        mockAccuracyResults,
        mockSystemHealth
      );

      const accuracyConfidence = report.systemConfidenceAssessment.predictionAccuracyConfidence;
      expect(accuracyConfidence.score).toBeGreaterThan(0);
      expect(accuracyConfidence.level).toBeDefined();
      expect(accuracyConfidence.explanation).toBeDefined();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty game analyses gracefully', () => {
      const report = analysisReporter.generateIntuitiveReport(
        [],
        mockAccuracyResults,
        mockSystemHealth
      );

      expect(report).toBeDefined();
      expect(report.predictionExamples.successfulPredictions).toEqual([]);
      expect(report.predictionExamples.failedPredictions).toEqual([]);
      expect(report.executiveSummary.keyFindings).toBeInstanceOf(Array);
    });

    it('should handle games without outcome comparisons', () => {
      const gamesWithoutOutcomes = mockGameAnalyses.map(g => ({
        ...g,
        outcomeComparison: undefined
      }));

      const report = analysisReporter.generateIntuitiveReport(
        gamesWithoutOutcomes,
        mockAccuracyResults,
        mockSystemHealth
      );

      expect(report).toBeDefined();
      expect(report.predictionExamples.successfulPredictions).toEqual([]);
      expect(report.predictionExamples.failedPredictions).toEqual([]);
    });

    it('should handle poor system health appropriately', () => {
      const poorSystemHealth = {
        ...mockSystemHealth,
        overallHealth: 'poor' as const,
        healthScore: 35,
        dataQuality: {
          ...mockSystemHealth.dataQuality,
          score: 40,
          status: 'poor' as const,
          criticalIssues: 5
        }
      };

      const report = analysisReporter.generateIntuitiveReport(
        mockGameAnalyses,
        mockAccuracyResults,
        poorSystemHealth
      );

      expect(report.executiveSummary.overallSystemHealth).toBe('poor');
      expect(report.systemConfidenceAssessment.dataQualityConfidence.level).toBe('low');
      expect(report.recommendationsAndInsights.immediateActions.length).toBeGreaterThan(0);
    });
  });
});