// server/services/validation/examples/intuitive-analysis-report-example.ts

/**
 * Example usage of the Intuitive Analysis Report functionality
 * Demonstrates task 7.4: Create intuitive analysis reports
 * Requirements: 6.5 - Generate clear explanations that build confidence in the system
 */

import { sampleGameAnalyzer } from '../sample-game-analyzer.js';
import { predictionAccuracyTester } from '../prediction-accuracy-tester.js';
import { analysisReporter } from '../analysis-reporter.js';
import { 
  AccuracyTestResult, 
  SystemHealthStatus
} from '../types.js';
import type { IntuitiveAnalysisReport } from '../analysis-reporter.js';

/**
 * Example: Generate a comprehensive intuitive analysis report
 */
export async function generateComprehensiveAnalysisReport(season: number = 2024): Promise<void> {
  console.log('='.repeat(80));
  console.log('INTUITIVE ANALYSIS REPORT EXAMPLE');
  console.log('='.repeat(80));

  try {
    // Step 1: Get accuracy test results (normally from prediction accuracy tester)
    console.log('\n1. Gathering accuracy test results...');
    const mockAccuracyResults: AccuracyTestResult = {
      isValid: true,
      score: 78,
      errors: [],
      warnings: [],
      recommendations: [],
      timestamp: new Date(),
      sampleSize: 45,
      testPeriod: {
        startDate: new Date('2024-09-01'),
        endDate: new Date('2024-11-30'),
        season: season
      },
      winProbabilityAccuracy: {
        brierScore: 0.21,
        logLoss: 0.62,
        accuracy: 74.5,
        precision: 0.76,
        recall: 0.74,
        f1Score: 0.75,
        rocAuc: 0.81
      },
      scorePredictionAccuracy: {
        meanAbsoluteError: 11.8,
        rootMeanSquareError: 15.4,
        medianAbsoluteError: 9.2,
        meanPercentageError: 17.2,
        homeTeamAccuracy: {
          mae: 11.5,
          rmse: 15.1,
          bias: 0.8
        },
        awayTeamAccuracy: {
          mae: 12.1,
          rmse: 15.7,
          bias: -0.5
        }
      },
      confidenceCalibration: {
        calibrationScore: 81,
        overconfidenceRate: 0.12,
        underconfidenceRate: 0.09,
        calibrationCurve: [
          { predictedProbability: 0.6, actualProbability: 0.58, sampleSize: 12 },
          { predictedProbability: 0.7, actualProbability: 0.72, sampleSize: 18 },
          { predictedProbability: 0.8, actualProbability: 0.78, sampleSize: 15 }
        ],
        reliabilityDiagram: {
          bins: 10,
          expectedCalibrationError: 0.06,
          maximumCalibrationError: 0.12
        }
      },
      systematicBiases: [
        {
          biasType: 'home_team',
          description: 'Slight bias favoring home teams in close games',
          magnitude: 0.04,
          significance: 0.06,
          affectedGames: 6,
          examples: []
        }
      ],
      predictionReliability: {
        overallReliability: 'medium',
        reliabilityByConfidence: [
          {
            confidenceRange: [60, 70],
            accuracy: 68,
            sampleSize: 15,
            reliability: 'medium'
          },
          {
            confidenceRange: [70, 80],
            accuracy: 76,
            sampleSize: 20,
            reliability: 'high'
          },
          {
            confidenceRange: [80, 90],
            accuracy: 82,
            sampleSize: 10,
            reliability: 'high'
          }
        ],
        reliabilityByGameType: [
          {
            gameType: 'conference',
            accuracy: 76,
            sampleSize: 30,
            reliability: 'medium'
          },
          {
            gameType: 'non-conference',
            accuracy: 71,
            sampleSize: 15,
            reliability: 'medium'
          }
        ]
      }
    };

    // Step 2: Get system health status (normally from system health monitor)
    console.log('2. Gathering system health status...');
    const mockSystemHealth: SystemHealthStatus = {
      overallHealth: 'good',
      healthScore: 84,
      dataQuality: {
        score: 87,
        status: 'good',
        completeness: 91,
        consistency: 85,
        validity: 89,
        timeliness: 94,
        issueCount: 2,
        criticalIssues: 0
      },
      modelHealth: {
        score: 81,
        status: 'good',
        regressionModelFit: 0.48,
        statisticalSignificance: 85,
        convergenceStability: 90,
        weightStability: 88,
        lastSuccessfulAnalysis: new Date('2024-11-30T10:30:00Z')
      },
      predictionReliability: {
        score: 78,
        status: 'good',
        accuracy: 74.5,
        calibration: 81,
        consistency: 82,
        biasLevel: 8,
        confidenceReliability: 79
      },
      alerts: [
        {
          id: 'alert-001',
          type: 'warning',
          component: 'data_quality',
          message: 'Minor data completeness issues in advanced statistics',
          details: 'Some games missing detailed defensive statistics',
          timestamp: new Date('2024-11-29T14:20:00Z'),
          resolved: false,
          actionRequired: false,
          recommendations: ['Improve data collection for defensive metrics', 'Implement fallback calculations for missing data']
        }
      ],
      lastUpdated: new Date(),
      trends: {
        dataQualityTrend: {
          direction: 'improving',
          magnitude: 0.08,
          significance: 0.12,
          dataPoints: [
            { timestamp: new Date('2024-11-01'), value: 85 },
            { timestamp: new Date('2024-11-15'), value: 86 },
            { timestamp: new Date('2024-11-30'), value: 87 }
          ]
        },
        modelHealthTrend: {
          direction: 'stable',
          magnitude: 0.02,
          significance: 0.04,
          dataPoints: [
            { timestamp: new Date('2024-11-01'), value: 80 },
            { timestamp: new Date('2024-11-15'), value: 81 },
            { timestamp: new Date('2024-11-30'), value: 81 }
          ]
        },
        predictionAccuracyTrend: {
          direction: 'improving',
          magnitude: 0.12,
          significance: 0.15,
          dataPoints: [
            { timestamp: new Date('2024-11-01'), value: 76 },
            { timestamp: new Date('2024-11-15'), value: 77 },
            { timestamp: new Date('2024-11-30'), value: 78 }
          ]
        },
        timeRange: {
          start: new Date('2024-11-01'),
          end: new Date('2024-11-30'),
          dataPoints: 30
        }
      }
    };

    // Step 3: Generate the comprehensive intuitive analysis report
    console.log('3. Generating comprehensive intuitive analysis report...');
    const report = await sampleGameAnalyzer.generateIntuitiveAnalysisReport(
      season,
      mockAccuracyResults,
      mockSystemHealth,
      15 // Sample size for game analysis
    );

    // Step 4: Display the report sections
    displayIntuitiveAnalysisReport(report);

  } catch (error) {
    console.error('Error generating comprehensive analysis report:', error);
  }
}

/**
 * Example: Generate just the confidence interpretation guide
 */
export async function generateConfidenceGuideExample(season: number = 2024): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('CONFIDENCE INTERPRETATION GUIDE EXAMPLE');
  console.log('='.repeat(60));

  try {
    // Get some sample game analyses
    const analysisResult = await sampleGameAnalyzer.selectAndAnalyzeGames(season, 10);
    
    if (!analysisResult.isValid) {
      console.log('Unable to generate confidence guide - no valid game analyses available');
      return;
    }

    // Mock accuracy results for the guide
    const mockAccuracyResults: AccuracyTestResult = {
      isValid: true,
      score: 75,
      errors: [],
      warnings: [],
      recommendations: [],
      timestamp: new Date(),
      sampleSize: 30,
      testPeriod: {
        startDate: new Date('2024-09-01'),
        endDate: new Date('2024-11-30'),
        season: season
      },
      winProbabilityAccuracy: {
        brierScore: 0.23,
        logLoss: 0.68,
        accuracy: 71,
        precision: 0.73,
        recall: 0.71,
        f1Score: 0.72,
        rocAuc: 0.77
      },
      scorePredictionAccuracy: {
        meanAbsoluteError: 13.2,
        rootMeanSquareError: 17.1,
        medianAbsoluteError: 11.5,
        meanPercentageError: 19.8,
        homeTeamAccuracy: { mae: 13.0, rmse: 16.8, bias: 1.1 },
        awayTeamAccuracy: { mae: 13.4, rmse: 17.4, bias: -0.7 }
      },
      confidenceCalibration: {
        calibrationScore: 76,
        overconfidenceRate: 0.18,
        underconfidenceRate: 0.14,
        calibrationCurve: [],
        reliabilityDiagram: {
          bins: 10,
          expectedCalibrationError: 0.09,
          maximumCalibrationError: 0.16
        }
      },
      systematicBiases: [],
      predictionReliability: {
        overallReliability: 'medium',
        reliabilityByConfidence: [],
        reliabilityByGameType: []
      }
    };

    // Generate the confidence interpretation guide
    const guide = sampleGameAnalyzer.generateConfidenceInterpretationGuide(
      analysisResult.analyzedGames,
      mockAccuracyResults
    );

    displayConfidenceGuide(guide);

  } catch (error) {
    console.error('Error generating confidence guide:', error);
  }
}

/**
 * Example: Generate prediction examples with explanations
 */
export async function generatePredictionExamplesDemo(season: number = 2024): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('PREDICTION EXAMPLES DEMONSTRATION');
  console.log('='.repeat(60));

  try {
    // Get sample game analyses
    const analysisResult = await sampleGameAnalyzer.selectAndAnalyzeGames(season, 12);
    
    if (!analysisResult.isValid) {
      console.log('Unable to generate examples - no valid game analyses available');
      return;
    }

    // Generate prediction examples
    const examples = sampleGameAnalyzer.generatePredictionExamples(analysisResult.analyzedGames);

    displayPredictionExamples(examples);

  } catch (error) {
    console.error('Error generating prediction examples:', error);
  }
}

/**
 * Display the complete intuitive analysis report
 */
function displayIntuitiveAnalysisReport(report: IntuitiveAnalysisReport): void {
  console.log('\n📊 EXECUTIVE SUMMARY');
  console.log('-'.repeat(40));
  console.log(`Overall System Health: ${report.executiveSummary.overallSystemHealth.toUpperCase()}`);
  console.log(`System Confidence: ${report.executiveSummary.confidenceInSystem}%`);
  console.log(`\nPrediction Accuracy: ${report.executiveSummary.predictionAccuracySummary}`);
  
  console.log('\n🔍 Key Findings:');
  report.executiveSummary.keyFindings.forEach((finding: string, i: number) => {
    console.log(`  ${i + 1}. ${finding}`);
  });

  console.log('\n📈 SYSTEM CONFIDENCE ASSESSMENT');
  console.log('-'.repeat(40));
  const confidence = report.systemConfidenceAssessment;
  console.log(`Overall Confidence: ${confidence.overallSystemConfidence.score}% (${confidence.overallSystemConfidence.level})`);
  console.log(`Data Quality: ${confidence.dataQualityConfidence.score}% (${confidence.dataQualityConfidence.level})`);
  console.log(`Model Performance: ${confidence.statisticalModelConfidence.score}% (${confidence.statisticalModelConfidence.level})`);
  console.log(`Prediction Accuracy: ${confidence.predictionAccuracyConfidence.score}% (${confidence.predictionAccuracyConfidence.level})`);

  console.log('\n✅ Confidence Strengthening Factors:');
  confidence.confidenceFactors.strengthening.slice(0, 3).forEach((factor: string, i: number) => {
    console.log(`  ${i + 1}. ${factor}`);
  });

  if (confidence.confidenceFactors.weakening.length > 0) {
    console.log('\n⚠️  Confidence Weakening Factors:');
    confidence.confidenceFactors.weakening.slice(0, 3).forEach((factor: string, i: number) => {
      console.log(`  ${i + 1}. ${factor}`);
    });
  }

  console.log('\n🎯 PREDICTION EXAMPLES');
  console.log('-'.repeat(40));
  
  if (report.predictionExamples.successfulPredictions.length > 0) {
    console.log('\n✅ Successful Predictions:');
    report.predictionExamples.successfulPredictions.slice(0, 2).forEach((example: any, i: number) => {
      console.log(`\n  ${i + 1}. ${example.gameInfo.homeTeam} vs ${example.gameInfo.awayTeam} (Week ${example.gameInfo.week})`);
      console.log(`     Predicted: ${example.prediction.expectedScore.home}-${example.prediction.expectedScore.away} (${example.prediction.confidence}% confidence)`);
      if (example.actualOutcome) {
        console.log(`     Actual: ${example.actualOutcome.score.home}-${example.actualOutcome.score.away} (${example.actualOutcome.accuracy})`);
      }
      if (example.whyItWorked) {
        console.log(`     Why it worked: ${example.whyItWorked}`);
      }
    });
  }

  if (report.predictionExamples.failedPredictions.length > 0) {
    console.log('\n❌ Failed Predictions:');
    report.predictionExamples.failedPredictions.slice(0, 2).forEach((example: any, i: number) => {
      console.log(`\n  ${i + 1}. ${example.gameInfo.homeTeam} vs ${example.gameInfo.awayTeam} (Week ${example.gameInfo.week})`);
      console.log(`     Predicted: ${example.prediction.expectedScore.home}-${example.prediction.expectedScore.away} (${example.prediction.confidence}% confidence)`);
      if (example.actualOutcome) {
        console.log(`     Actual: ${example.actualOutcome.score.home}-${example.actualOutcome.score.away} (${example.actualOutcome.accuracy})`);
      }
      if (example.whyItFailed) {
        console.log(`     Why it failed: ${example.whyItFailed}`);
      }
    });
  }

  console.log('\n📚 CONFIDENCE INTERPRETATION GUIDE');
  console.log('-'.repeat(40));
  
  console.log('\nConfidence Levels:');
  report.confidenceInterpretationGuide.confidenceLevels.forEach(level => {
    console.log(`\n  ${level.range[0]}-${level.range[1]}%: ${level.label.toUpperCase()}`);
    console.log(`    ${level.description}`);
    console.log(`    Typical Accuracy: ${level.typicalAccuracy}`);
    console.log(`    Recommended Use: ${level.recommendedUse}`);
  });

  console.log('\n💡 Interpretation Tips:');
  report.confidenceInterpretationGuide.interpretationTips.slice(0, 3).forEach((tip: string, i: number) => {
    console.log(`  ${i + 1}. ${tip}`);
  });

  console.log('\n🚀 TOP RECOMMENDATIONS');
  console.log('-'.repeat(40));
  
  const allRecommendations = [
    ...report.recommendationsAndInsights.immediateActions,
    ...report.recommendationsAndInsights.longTermImprovements
  ].sort((a, b) => {
    const priorityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });

  allRecommendations.slice(0, 5).forEach((rec: any, i: number) => {
    console.log(`\n  ${i + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`);
    console.log(`     ${rec.description}`);
    console.log(`     Expected Impact: ${rec.expectedImpact}`);
    console.log(`     Timeline: ${rec.timeline}`);
  });

  console.log('\n📋 TECHNICAL SUMMARY');
  console.log('-'.repeat(40));
  
  console.log('\nKey Metrics:');
  report.technicalAppendix.statisticalMetrics.slice(0, 4).forEach((metric: any) => {
    console.log(`  • ${metric.metric}: ${metric.value} - ${metric.interpretation}`);
  });

  console.log(`\nReport Generated: ${report.generatedAt.toLocaleString()}`);
}

/**
 * Display the confidence interpretation guide
 */
function displayConfidenceGuide(guide: IntuitiveAnalysisReport['confidenceInterpretationGuide']): void {
  console.log('\n📊 CONFIDENCE LEVEL BREAKDOWN');
  console.log('-'.repeat(50));
  
  guide.confidenceLevels.forEach((level: any) => {
    console.log(`\n🎯 ${level.range[0]}-${level.range[1]}%: ${level.label.replace('_', ' ').toUpperCase()} CONFIDENCE`);
    console.log(`   Description: ${level.description}`);
    console.log(`   Typical Accuracy: ${level.typicalAccuracy}`);
    console.log(`   Recommended Use: ${level.recommendedUse}`);
    
    if (level.cautionaryNotes.length > 0) {
      console.log(`   ⚠️  Cautions: ${level.cautionaryNotes.join(', ')}`);
    }
    
    if (level.exampleScenarios.length > 0) {
      console.log(`   📝 Examples: ${level.exampleScenarios.join(', ')}`);
    }
  });

  console.log('\n💡 INTERPRETATION BEST PRACTICES');
  console.log('-'.repeat(50));
  
  guide.interpretationTips.forEach((tip: string, i: number) => {
    console.log(`  ${i + 1}. ${tip}`);
  });

  console.log('\n❌ COMMON MISCONCEPTIONS');
  console.log('-'.repeat(50));
  
  guide.commonMisconceptions.forEach((misconception: string, i: number) => {
    console.log(`  ${i + 1}. ${misconception}`);
  });

  console.log('\n🎯 CONTEXTUAL FACTORS TO CONSIDER');
  console.log('-'.repeat(50));
  
  guide.contextualFactors.forEach((factor: any) => {
    console.log(`\n  📊 ${factor.factor}`);
    console.log(`     Impact: ${factor.impact}`);
    console.log(`     Guidance: ${factor.guidance}`);
  });
}

/**
 * Display prediction examples
 */
function displayPredictionExamples(examples: IntuitiveAnalysisReport['predictionExamples']): void {
  console.log('\n✅ SUCCESSFUL PREDICTION EXAMPLES');
  console.log('-'.repeat(50));
  
  examples.successfulPredictions.forEach((example: any, i: number) => {
    console.log(`\n${i + 1}. ${example.gameInfo.homeTeam} vs ${example.gameInfo.awayTeam}`);
    console.log(`   Week ${example.gameInfo.week}, ${example.gameInfo.season}`);
    console.log(`   Predicted: ${example.prediction.expectedScore.home}-${example.prediction.expectedScore.away}`);
    console.log(`   Confidence: ${example.prediction.confidence}%`);
    
    if (example.actualOutcome) {
      console.log(`   Actual: ${example.actualOutcome.score.home}-${example.actualOutcome.score.away}`);
      console.log(`   Quality: ${example.actualOutcome.accuracy}`);
    }
    
    console.log(`   Key Factors: ${example.prediction.keyFactors.join(', ')}`);
    console.log(`   Confidence Justification: ${example.confidenceJustification}`);
    
    if (example.whyItWorked) {
      console.log(`   ✅ Success Reason: ${example.whyItWorked}`);
    }
  });

  if (examples.failedPredictions.length > 0) {
    console.log('\n❌ FAILED PREDICTION EXAMPLES');
    console.log('-'.repeat(50));
    
    examples.failedPredictions.forEach((example: any, i: number) => {
      console.log(`\n${i + 1}. ${example.gameInfo.homeTeam} vs ${example.gameInfo.awayTeam}`);
      console.log(`   Week ${example.gameInfo.week}, ${example.gameInfo.season}`);
      console.log(`   Predicted: ${example.prediction.expectedScore.home}-${example.prediction.expectedScore.away}`);
      console.log(`   Confidence: ${example.prediction.confidence}%`);
      
      if (example.actualOutcome) {
        console.log(`   Actual: ${example.actualOutcome.score.home}-${example.actualOutcome.score.away}`);
        console.log(`   Quality: ${example.actualOutcome.accuracy}`);
      }
      
      if (example.whyItFailed) {
        console.log(`   ❌ Failure Reason: ${example.whyItFailed}`);
      }
      
      console.log(`   Lessons Learned: ${example.lessonsLearned.join(', ')}`);
    });
  }

  console.log('\n📊 PATTERN ANALYSIS');
  console.log('-'.repeat(50));
  
  if (examples.exampleAnalysis.successPatterns.length > 0) {
    console.log('\n✅ Success Patterns:');
    examples.exampleAnalysis.successPatterns.forEach((pattern: string, i: number) => {
      console.log(`  ${i + 1}. ${pattern}`);
    });
  }
  
  if (examples.exampleAnalysis.failurePatterns.length > 0) {
    console.log('\n❌ Failure Patterns:');
    examples.exampleAnalysis.failurePatterns.forEach((pattern: string, i: number) => {
      console.log(`  ${i + 1}. ${pattern}`);
    });
  }
  
  console.log('\n💡 Lessons Learned:');
  examples.exampleAnalysis.lessonsLearned.forEach((lesson: string, i: number) => {
    console.log(`  ${i + 1}. ${lesson}`);
  });
}

// Example usage
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running Intuitive Analysis Report Examples...\n');
  
  // Run all examples
  (async () => {
    await generateComprehensiveAnalysisReport(2024);
    await generateConfidenceGuideExample(2024);
    await generatePredictionExamplesDemo(2024);
    
    console.log('\n' + '='.repeat(80));
    console.log('All examples completed successfully!');
    console.log('='.repeat(80));
  })().catch(console.error);
}