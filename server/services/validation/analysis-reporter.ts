// server/services/validation/analysis-reporter.ts

import { 
  GameAnalysisResult, 
  ValidationResult,
  AccuracyTestResult,
  SystemHealthStatus,
  OutcomeComparison,
  PredictionExplanation,
  KeyMatchupFactor,
  EfficiencyBreakdown
} from './types.js';

/**
 * Analysis Reporter - Implements task 7.4
 * Creates intuitive analysis reports that build confidence in the system
 * Requirements: 6.5
 */

export interface IntuitiveAnalysisReport {
  executiveSummary: ExecutiveSummary;
  systemConfidenceAssessment: SystemConfidenceAssessment;
  predictionExamples: PredictionExampleSection;
  confidenceInterpretationGuide: ConfidenceInterpretationGuide;
  recommendationsAndInsights: RecommendationsSection;
  technicalAppendix: TechnicalAppendix;
  generatedAt: Date;
}

export interface ExecutiveSummary {
  overallSystemHealth: 'excellent' | 'good' | 'fair' | 'poor';
  keyFindings: string[];
  predictionAccuracySummary: string;
  confidenceInSystem: number; // 0-100
  mainRecommendations: string[];
}

export interface SystemConfidenceAssessment {
  dataQualityConfidence: ConfidenceMetric;
  statisticalModelConfidence: ConfidenceMetric;
  predictionAccuracyConfidence: ConfidenceMetric;
  overallSystemConfidence: ConfidenceMetric;
  confidenceFactors: {
    strengthening: string[];
    weakening: string[];
  };
}

export interface ConfidenceMetric {
  score: number; // 0-100
  level: 'very_high' | 'high' | 'moderate' | 'low' | 'very_low';
  explanation: string;
  supportingEvidence: string[];
  concerns: string[];
}

export interface PredictionExampleSection {
  successfulPredictions: PredictionExample[];
  failedPredictions: PredictionExample[];
  insightfulPredictions: PredictionExample[];
  exampleAnalysis: {
    successPatterns: string[];
    failurePatterns: string[];
    lessonsLearned: string[];
  };
}

export interface PredictionExample {
  gameInfo: {
    homeTeam: string;
    awayTeam: string;
    week: number;
    season: number;
  };
  prediction: {
    expectedScore: { home: number; away: number };
    confidence: number;
    keyFactors: string[];
  };
  actualOutcome?: {
    score: { home: number; away: number };
    accuracy: 'excellent' | 'good' | 'fair' | 'poor';
  };
  whyItWorked?: string;
  whyItFailed?: string;
  lessonsLearned: string[];
  confidenceJustification: string;
}

export interface ConfidenceInterpretationGuide {
  confidenceLevels: ConfidenceLevelGuide[];
  interpretationTips: string[];
  commonMisconceptions: string[];
  bestPractices: string[];
  contextualFactors: {
    factor: string;
    impact: string;
    guidance: string;
  }[];
}

export interface ConfidenceLevelGuide {
  range: [number, number];
  label: 'very_high' | 'high' | 'moderate' | 'low' | 'very_low';
  description: string;
  typicalAccuracy: string;
  recommendedUse: string;
  cautionaryNotes: string[];
  exampleScenarios: string[];
}

export interface RecommendationsSection {
  immediateActions: Recommendation[];
  longTermImprovements: Recommendation[];
  dataCollectionRecommendations: Recommendation[];
  modelEnhancements: Recommendation[];
  userGuidance: Recommendation[];
}

export interface Recommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  expectedImpact: string;
  implementationEffort: 'low' | 'medium' | 'high';
  timeline: string;
  successMetrics: string[];
}

export interface TechnicalAppendix {
  methodologyOverview: string;
  statisticalMetrics: {
    metric: string;
    value: number;
    interpretation: string;
  }[];
  dataQualityMetrics: {
    completeness: number;
    consistency: number;
    validity: number;
    timeliness: number;
  };
  modelPerformanceMetrics: {
    rSquared: number;
    meanAbsoluteError: number;
    brierScore: number;
    calibrationScore: number;
  };
  limitationsAndAssumptions: string[];
}

export class AnalysisReporter {
  /**
   * Generates a comprehensive intuitive analysis report
   * Requirements: 6.5 - Generate clear explanations that build confidence in the system
   */
  generateIntuitiveReport(
    gameAnalyses: GameAnalysisResult[],
    accuracyResults: AccuracyTestResult,
    systemHealth: SystemHealthStatus
  ): IntuitiveAnalysisReport {
    console.log('[Analysis Reporter] Generating intuitive analysis report...');

    const executiveSummary = this.createExecutiveSummary(gameAnalyses, accuracyResults, systemHealth);
    const systemConfidenceAssessment = this.assessSystemConfidence(accuracyResults, systemHealth);
    const predictionExamples = this.createPredictionExamples(gameAnalyses);
    const confidenceInterpretationGuide = this.createConfidenceGuide(gameAnalyses, accuracyResults);
    const recommendationsAndInsights = this.generateRecommendations(gameAnalyses, accuracyResults, systemHealth);
    const technicalAppendix = this.createTechnicalAppendix(accuracyResults, systemHealth);

    return {
      executiveSummary,
      systemConfidenceAssessment,
      predictionExamples,
      confidenceInterpretationGuide,
      recommendationsAndInsights,
      technicalAppendix,
      generatedAt: new Date()
    };
  }

  /**
   * Creates executive summary with key findings
   */
  private createExecutiveSummary(
    gameAnalyses: GameAnalysisResult[],
    accuracyResults: AccuracyTestResult,
    systemHealth: SystemHealthStatus
  ): ExecutiveSummary {
    const completedPredictions = gameAnalyses.filter(g => g.outcomeComparison);
    const accurateWinners = completedPredictions.filter(g => 
      g.outcomeComparison?.predictionAccuracy.winnerCorrect
    ).length;
    const winnerAccuracy = completedPredictions.length > 0 
      ? (accurateWinners / completedPredictions.length) * 100 
      : 0;

    const avgScoreError = completedPredictions.length > 0
      ? completedPredictions.reduce((sum, g) => 
          sum + (g.outcomeComparison?.predictionAccuracy.scoreError.total || 0), 0
        ) / completedPredictions.length
      : 0;

    const keyFindings: string[] = [];
    
    // System health findings
    if (systemHealth.overallHealth === 'excellent' || systemHealth.overallHealth === 'good') {
      keyFindings.push(`System is operating at ${systemHealth.overallHealth} health with ${systemHealth.healthScore}% overall score`);
    } else {
      keyFindings.push(`System health needs attention (${systemHealth.overallHealth}, ${systemHealth.healthScore}% score)`);
    }

    // Accuracy findings
    if (winnerAccuracy >= 70) {
      keyFindings.push(`Strong prediction accuracy: ${winnerAccuracy.toFixed(1)}% of game winners predicted correctly`);
    } else if (winnerAccuracy >= 60) {
      keyFindings.push(`Moderate prediction accuracy: ${winnerAccuracy.toFixed(1)}% of game winners predicted correctly`);
    } else {
      keyFindings.push(`Prediction accuracy needs improvement: ${winnerAccuracy.toFixed(1)}% of game winners predicted correctly`);
    }

    // Score prediction findings
    if (avgScoreError <= 14) {
      keyFindings.push(`Excellent score prediction accuracy with average error of ${avgScoreError.toFixed(1)} points`);
    } else if (avgScoreError <= 21) {
      keyFindings.push(`Good score prediction accuracy with average error of ${avgScoreError.toFixed(1)} points`);
    } else {
      keyFindings.push(`Score prediction accuracy could be improved (average error: ${avgScoreError.toFixed(1)} points)`);
    }

    // Data quality findings
    if (systemHealth.dataQuality.score >= 85) {
      keyFindings.push(`High data quality (${systemHealth.dataQuality.score}%) supports reliable predictions`);
    } else if (systemHealth.dataQuality.score >= 70) {
      keyFindings.push(`Adequate data quality (${systemHealth.dataQuality.score}%) with room for improvement`);
    } else {
      keyFindings.push(`Data quality concerns (${systemHealth.dataQuality.score}%) may impact prediction reliability`);
    }

    const predictionAccuracySummary = `The system correctly predicted ${winnerAccuracy.toFixed(1)}% of game winners with an average score error of ${avgScoreError.toFixed(1)} points across ${completedPredictions.length} analyzed games.`;

    // Calculate overall confidence in system
    let confidenceInSystem = 0;
    confidenceInSystem += Math.min(winnerAccuracy, 100) * 0.4; // 40% weight on accuracy
    confidenceInSystem += systemHealth.healthScore * 0.3; // 30% weight on system health
    confidenceInSystem += systemHealth.dataQuality.score * 0.2; // 20% weight on data quality
    confidenceInSystem += Math.min(100 - avgScoreError * 3, 100) * 0.1; // 10% weight on score accuracy

    const mainRecommendations = this.getTopRecommendations(gameAnalyses, accuracyResults, systemHealth);

    return {
      overallSystemHealth: systemHealth.overallHealth,
      keyFindings,
      predictionAccuracySummary,
      confidenceInSystem: Math.round(confidenceInSystem),
      mainRecommendations
    };
  }

  /**
   * Assesses confidence in different system components
   */
  private assessSystemConfidence(
    accuracyResults: AccuracyTestResult,
    systemHealth: SystemHealthStatus
  ): SystemConfidenceAssessment {
    const dataQualityConfidence = this.assessDataQualityConfidence(systemHealth.dataQuality);
    const statisticalModelConfidence = this.assessModelConfidence(systemHealth.modelHealth, accuracyResults);
    const predictionAccuracyConfidence = this.assessAccuracyConfidence(accuracyResults);
    
    // Calculate overall confidence
    const overallScore = Math.round(
      (dataQualityConfidence.score * 0.3 + 
       statisticalModelConfidence.score * 0.4 + 
       predictionAccuracyConfidence.score * 0.3)
    );

    const overallSystemConfidence: ConfidenceMetric = {
      score: overallScore,
      level: this.getConfidenceLevel(overallScore),
      explanation: `Overall system confidence based on data quality (${dataQualityConfidence.score}%), model performance (${statisticalModelConfidence.score}%), and prediction accuracy (${predictionAccuracyConfidence.score}%)`,
      supportingEvidence: [
        ...dataQualityConfidence.supportingEvidence,
        ...statisticalModelConfidence.supportingEvidence,
        ...predictionAccuracyConfidence.supportingEvidence
      ],
      concerns: [
        ...dataQualityConfidence.concerns,
        ...statisticalModelConfidence.concerns,
        ...predictionAccuracyConfidence.concerns
      ]
    };

    const confidenceFactors = this.identifyConfidenceFactors(
      dataQualityConfidence,
      statisticalModelConfidence,
      predictionAccuracyConfidence
    );

    return {
      dataQualityConfidence,
      statisticalModelConfidence,
      predictionAccuracyConfidence,
      overallSystemConfidence,
      confidenceFactors
    };
  }

  /**
   * Assesses confidence in data quality
   */
  private assessDataQualityConfidence(dataQuality: SystemHealthStatus['dataQuality']): ConfidenceMetric {
    const score = dataQuality.score;
    const level = this.getConfidenceLevel(score);
    
    const supportingEvidence: string[] = [];
    const concerns: string[] = [];

    if (dataQuality.completeness >= 90) {
      supportingEvidence.push(`Excellent data completeness (${dataQuality.completeness}%)`);
    } else if (dataQuality.completeness >= 80) {
      supportingEvidence.push(`Good data completeness (${dataQuality.completeness}%)`);
    } else {
      concerns.push(`Data completeness below optimal (${dataQuality.completeness}%)`);
    }

    if (dataQuality.consistency >= 85) {
      supportingEvidence.push(`High data consistency (${dataQuality.consistency}%)`);
    } else {
      concerns.push(`Data consistency issues detected (${dataQuality.consistency}%)`);
    }

    if (dataQuality.criticalIssues === 0) {
      supportingEvidence.push('No critical data quality issues identified');
    } else {
      concerns.push(`${dataQuality.criticalIssues} critical data quality issues require attention`);
    }

    let explanation = '';
    if (score >= 85) {
      explanation = 'High confidence in data quality. Data is complete, consistent, and reliable for analysis.';
    } else if (score >= 70) {
      explanation = 'Moderate confidence in data quality. Some improvements needed but data is generally reliable.';
    } else {
      explanation = 'Low confidence in data quality. Significant improvements needed to ensure reliable predictions.';
    }

    return {
      score,
      level,
      explanation,
      supportingEvidence,
      concerns
    };
  }

  /**
   * Assesses confidence in statistical models
   */
  private assessModelConfidence(
    modelHealth: SystemHealthStatus['modelHealth'],
    accuracyResults: AccuracyTestResult
  ): ConfidenceMetric {
    const score = modelHealth.score;
    const level = this.getConfidenceLevel(score);
    
    const supportingEvidence: string[] = [];
    const concerns: string[] = [];

    if (modelHealth.regressionModelFit >= 0.6) {
      supportingEvidence.push(`Strong regression model fit (R² = ${modelHealth.regressionModelFit.toFixed(3)})`);
    } else if (modelHealth.regressionModelFit >= 0.3) {
      supportingEvidence.push(`Moderate regression model fit (R² = ${modelHealth.regressionModelFit.toFixed(3)})`);
    } else {
      concerns.push(`Weak regression model fit (R² = ${modelHealth.regressionModelFit.toFixed(3)})`);
    }

    if (modelHealth.statisticalSignificance >= 80) {
      supportingEvidence.push(`High statistical significance in model predictors`);
    } else {
      concerns.push(`Limited statistical significance in model predictors`);
    }

    if (modelHealth.weightStability >= 85) {
      supportingEvidence.push('Stable weight calculations over time');
    } else {
      concerns.push('Weight calculations show instability');
    }

    let explanation = '';
    if (score >= 85) {
      explanation = 'High confidence in statistical models. Strong predictive power and stable performance.';
    } else if (score >= 70) {
      explanation = 'Moderate confidence in statistical models. Generally reliable with some areas for improvement.';
    } else {
      explanation = 'Low confidence in statistical models. Significant improvements needed for reliable predictions.';
    }

    return {
      score,
      level,
      explanation,
      supportingEvidence,
      concerns
    };
  }

  /**
   * Assesses confidence in prediction accuracy
   */
  private assessAccuracyConfidence(accuracyResults: AccuracyTestResult): ConfidenceMetric {
    const winAccuracy = accuracyResults.winProbabilityAccuracy.accuracy;
    const brierScore = accuracyResults.winProbabilityAccuracy.brierScore;
    const calibrationScore = accuracyResults.confidenceCalibration.calibrationScore;
    
    // Calculate composite score
    const score = Math.round(
      (winAccuracy * 0.5) + 
      ((1 - brierScore) * 100 * 0.3) + 
      (calibrationScore * 0.2)
    );
    
    const level = this.getConfidenceLevel(score);
    
    const supportingEvidence: string[] = [];
    const concerns: string[] = [];

    if (winAccuracy >= 70) {
      supportingEvidence.push(`Strong win prediction accuracy (${winAccuracy.toFixed(1)}%)`);
    } else if (winAccuracy >= 60) {
      supportingEvidence.push(`Moderate win prediction accuracy (${winAccuracy.toFixed(1)}%)`);
    } else {
      concerns.push(`Win prediction accuracy below expectations (${winAccuracy.toFixed(1)}%)`);
    }

    if (brierScore <= 0.2) {
      supportingEvidence.push(`Excellent probability calibration (Brier score: ${brierScore.toFixed(3)})`);
    } else if (brierScore <= 0.25) {
      supportingEvidence.push(`Good probability calibration (Brier score: ${brierScore.toFixed(3)})`);
    } else {
      concerns.push(`Probability calibration needs improvement (Brier score: ${brierScore.toFixed(3)})`);
    }

    if (calibrationScore >= 80) {
      supportingEvidence.push(`Well-calibrated confidence levels (${calibrationScore.toFixed(1)}%)`);
    } else {
      concerns.push(`Confidence calibration issues detected (${calibrationScore.toFixed(1)}%)`);
    }

    let explanation = '';
    if (score >= 80) {
      explanation = 'High confidence in prediction accuracy. Consistently reliable predictions with good calibration.';
    } else if (score >= 65) {
      explanation = 'Moderate confidence in prediction accuracy. Generally reliable with room for improvement.';
    } else {
      explanation = 'Low confidence in prediction accuracy. Significant improvements needed for reliable forecasting.';
    }

    return {
      score,
      level,
      explanation,
      supportingEvidence,
      concerns
    };
  }

  /**
   * Converts numeric score to confidence level
   */
  private getConfidenceLevel(score: number): ConfidenceMetric['level'] {
    if (score >= 90) return 'very_high';
    if (score >= 75) return 'high';
    if (score >= 60) return 'moderate';
    if (score >= 40) return 'low';
    return 'very_low';
  }

  /**
   * Identifies factors that strengthen or weaken confidence
   */
  private identifyConfidenceFactors(
    dataQuality: ConfidenceMetric,
    modelHealth: ConfidenceMetric,
    accuracy: ConfidenceMetric
  ): { strengthening: string[]; weakening: string[] } {
    const strengthening: string[] = [];
    const weakening: string[] = [];

    // Collect strengthening factors
    strengthening.push(...dataQuality.supportingEvidence);
    strengthening.push(...modelHealth.supportingEvidence);
    strengthening.push(...accuracy.supportingEvidence);

    // Collect weakening factors
    weakening.push(...dataQuality.concerns);
    weakening.push(...modelHealth.concerns);
    weakening.push(...accuracy.concerns);

    return { strengthening, weakening };
  }

  /**
   * Creates prediction examples section with successful and failed predictions
   * Requirements: 6.5 - Provide specific examples of successful and failed predictions
   */
  private createPredictionExamples(gameAnalyses: GameAnalysisResult[]): PredictionExampleSection {
    const completedGames = gameAnalyses.filter(g => g.outcomeComparison);
    
    // Categorize predictions
    const successful = completedGames.filter(g => 
      g.outcomeComparison?.predictionQuality === 'excellent' || 
      g.outcomeComparison?.predictionQuality === 'good'
    );
    
    const failed = completedGames.filter(g => 
      g.outcomeComparison?.predictionQuality === 'poor'
    );
    
    const insightful = completedGames.filter(g => 
      g.predictionExplanation.keyAdvantages.length >= 2 &&
      g.prediction.confidence >= 70
    );

    // Create examples
    const successfulPredictions = successful.slice(0, 3).map(g => this.createPredictionExample(g, 'successful'));
    const failedPredictions = failed.slice(0, 3).map(g => this.createPredictionExample(g, 'failed'));
    const insightfulPredictions = insightful.slice(0, 2).map(g => this.createPredictionExample(g, 'insightful'));

    // Analyze patterns
    const exampleAnalysis = this.analyzePredictionPatterns(successful, failed);

    return {
      successfulPredictions,
      failedPredictions,
      insightfulPredictions,
      exampleAnalysis
    };
  }

  /**
   * Creates a prediction example with detailed explanation
   */
  private createPredictionExample(
    gameAnalysis: GameAnalysisResult,
    type: 'successful' | 'failed' | 'insightful'
  ): PredictionExample {
    const example: PredictionExample = {
      gameInfo: {
        homeTeam: gameAnalysis.gameInfo.homeTeam,
        awayTeam: gameAnalysis.gameInfo.awayTeam,
        week: gameAnalysis.gameInfo.week,
        season: gameAnalysis.gameInfo.season
      },
      prediction: {
        expectedScore: {
          home: gameAnalysis.prediction.homeScore,
          away: gameAnalysis.prediction.awayScore
        },
        confidence: gameAnalysis.prediction.confidence,
        keyFactors: gameAnalysis.keyFactors.slice(0, 3).map(f => f.description)
      },
      actualOutcome: gameAnalysis.outcomeComparison ? {
        score: {
          home: gameAnalysis.gameInfo.actualScore?.home || 0,
          away: gameAnalysis.gameInfo.actualScore?.away || 0
        },
        accuracy: gameAnalysis.outcomeComparison.predictionQuality
      } : undefined,
      lessonsLearned: [],
      confidenceJustification: this.createConfidenceJustification(gameAnalysis)
    };

    // Add type-specific analysis
    if (type === 'successful' && gameAnalysis.outcomeComparison) {
      example.whyItWorked = this.explainSuccessfulPrediction(gameAnalysis);
      example.lessonsLearned = [
        'Strong statistical indicators correctly identified key matchup advantages',
        'Confidence level was appropriately calibrated to prediction accuracy',
        'Multiple significant factors aligned to support the prediction'
      ];
    } else if (type === 'failed' && gameAnalysis.outcomeComparison) {
      example.whyItFailed = this.explainFailedPrediction(gameAnalysis);
      example.lessonsLearned = gameAnalysis.outcomeComparison.errorAnalysis.lessons;
    } else if (type === 'insightful') {
      example.lessonsLearned = [
        'Clear statistical advantages were identified and explained',
        'Prediction methodology provided actionable insights',
        'Confidence level reflected the strength of available evidence'
      ];
    }

    return example;
  }

  /**
   * Creates confidence justification for a prediction
   */
  private createConfidenceJustification(gameAnalysis: GameAnalysisResult): string {
    const confidence = gameAnalysis.prediction.confidence;
    const keyFactors = gameAnalysis.keyFactors.length;
    const explanation = gameAnalysis.predictionExplanation;

    let justification = `${confidence}% confidence based on `;

    const factors: string[] = [];
    
    if (keyFactors >= 3) {
      factors.push(`${keyFactors} significant matchup advantages`);
    } else if (keyFactors >= 1) {
      factors.push(`${keyFactors} key matchup factor${keyFactors > 1 ? 's' : ''}`);
    }

    if (explanation.statisticalBasis.modelRSquared > 0.6) {
      factors.push('strong statistical model (R² > 0.6)');
    } else if (explanation.statisticalBasis.modelRSquared > 0.3) {
      factors.push('moderate statistical model');
    }

    if (explanation.confidenceFactors.length > 0) {
      factors.push('multiple supporting indicators');
    }

    if (explanation.riskFactors.length > 0) {
      factors.push(`${explanation.riskFactors.length} identified risk factor${explanation.riskFactors.length > 1 ? 's' : ''}`);
    }

    justification += factors.join(', ');

    return justification;
  }

  /**
   * Explains why a prediction was successful
   */
  private explainSuccessfulPrediction(gameAnalysis: GameAnalysisResult): string {
    const outcome = gameAnalysis.outcomeComparison!;
    const explanation = gameAnalysis.predictionExplanation;
    
    let reason = 'This prediction succeeded because ';
    
    const reasons: string[] = [];
    
    if (outcome.predictionAccuracy.winnerCorrect) {
      reasons.push('the correct winner was identified');
    }
    
    if (outcome.predictionAccuracy.scoreError.total <= 14) {
      reasons.push('score predictions were highly accurate');
    }
    
    if (explanation.keyAdvantages.length >= 2) {
      reasons.push('multiple key advantages were correctly identified');
    }
    
    if (outcome.errorAnalysis.errorType === 'statistical_noise') {
      reasons.push('any errors were within expected statistical variation');
    }

    reason += reasons.join(', ') + '.';
    
    return reason;
  }

  /**
   * Explains why a prediction failed
   */
  private explainFailedPrediction(gameAnalysis: GameAnalysisResult): string {
    const outcome = gameAnalysis.outcomeComparison!;
    const explanation = gameAnalysis.predictionExplanation;
    
    let reason = 'This prediction failed because ';
    
    const reasons: string[] = [];
    
    if (!outcome.predictionAccuracy.winnerCorrect) {
      reasons.push('the wrong winner was predicted');
    }
    
    if (outcome.predictionAccuracy.scoreError.total > 21) {
      reasons.push('score predictions were significantly inaccurate');
    }
    
    if (outcome.errorAnalysis.errorType === 'systematic_bias') {
      reasons.push('systematic bias affected the prediction methodology');
    } else if (outcome.errorAnalysis.errorType === 'model_limitation') {
      reasons.push('the statistical model had insufficient predictive power');
    } else if (outcome.errorAnalysis.errorType === 'data_quality') {
      reasons.push('data quality issues impacted the analysis');
    }
    
    if (explanation.riskFactors.length >= 2) {
      reasons.push('multiple risk factors were present but not adequately accounted for');
    }

    reason += reasons.join(', ') + '.';
    
    return reason;
  }

  /**
   * Analyzes patterns in successful and failed predictions
   */
  private analyzePredictionPatterns(
    successful: GameAnalysisResult[],
    failed: GameAnalysisResult[]
  ): PredictionExampleSection['exampleAnalysis'] {
    const successPatterns: string[] = [];
    const failurePatterns: string[] = [];
    const lessonsLearned: string[] = [];

    // Analyze success patterns
    if (successful.length > 0) {
      const avgSuccessConfidence = successful.reduce((sum, g) => sum + g.prediction.confidence, 0) / successful.length;
      const avgSuccessFactors = successful.reduce((sum, g) => sum + g.keyFactors.length, 0) / successful.length;
      
      successPatterns.push(`Successful predictions averaged ${avgSuccessConfidence.toFixed(1)}% confidence`);
      successPatterns.push(`Average of ${avgSuccessFactors.toFixed(1)} key matchup factors identified`);
      
      const commonSuccessFactors = this.findCommonFactors(successful);
      if (commonSuccessFactors.length > 0) {
        successPatterns.push(`Common success factors: ${commonSuccessFactors.join(', ')}`);
      }
    }

    // Analyze failure patterns
    if (failed.length > 0) {
      const avgFailureConfidence = failed.reduce((sum, g) => sum + g.prediction.confidence, 0) / failed.length;
      const commonErrorTypes = this.findCommonErrorTypes(failed);
      
      failurePatterns.push(`Failed predictions averaged ${avgFailureConfidence.toFixed(1)}% confidence`);
      if (commonErrorTypes.length > 0) {
        failurePatterns.push(`Common error types: ${commonErrorTypes.join(', ')}`);
      }
    }

    // Generate lessons learned
    if (successful.length > failed.length) {
      lessonsLearned.push('System performs well when multiple statistical advantages align');
      lessonsLearned.push('Higher confidence predictions tend to be more accurate');
    }
    
    if (failed.length > 0) {
      lessonsLearned.push('Failed predictions often involve systematic biases or model limitations');
      lessonsLearned.push('Risk factors should be weighted more heavily in confidence calculations');
    }
    
    lessonsLearned.push('Prediction quality correlates with the number of significant matchup factors identified');

    return {
      successPatterns,
      failurePatterns,
      lessonsLearned
    };
  }

  /**
   * Finds common factors in successful predictions
   */
  private findCommonFactors(predictions: GameAnalysisResult[]): string[] {
    const factorCounts: Record<string, number> = {};
    
    predictions.forEach(p => {
      p.keyFactors.forEach(f => {
        const factor = f.factor;
        factorCounts[factor] = (factorCounts[factor] || 0) + 1;
      });
    });
    
    const threshold = Math.ceil(predictions.length * 0.5); // Appear in at least 50% of cases
    return Object.entries(factorCounts)
      .filter(([_, count]) => count >= threshold)
      .map(([factor, _]) => factor);
  }

  /**
   * Finds common error types in failed predictions
   */
  private findCommonErrorTypes(predictions: GameAnalysisResult[]): string[] {
    const errorCounts: Record<string, number> = {};
    
    predictions.forEach(p => {
      if (p.outcomeComparison) {
        const errorType = p.outcomeComparison.errorAnalysis.errorType;
        errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
      }
    });
    
    return Object.entries(errorCounts)
      .sort(([_, a], [__, b]) => b - a)
      .map(([errorType, _]) => errorType.replace('_', ' '));
  }

  /**
   * Creates confidence interpretation guide
   * Requirements: 6.5 - Include recommendations for interpreting prediction confidence levels
   */
  private createConfidenceGuide(
    gameAnalyses: GameAnalysisResult[],
    accuracyResults: AccuracyTestResult
  ): ConfidenceInterpretationGuide {
    const confidenceLevels: ConfidenceLevelGuide[] = [
      {
        range: [90, 100],
        label: 'very_high',
        description: 'Extremely high confidence with strong statistical support',
        typicalAccuracy: '85-95% winner accuracy, ±8 points score accuracy',
        recommendedUse: 'Suitable for high-stakes decisions and public predictions',
        cautionaryNotes: [
          'Even high-confidence predictions can fail due to unpredictable factors',
          'Overconfidence bias may still affect some predictions'
        ],
        exampleScenarios: [
          'Strong team vs weak team with multiple statistical advantages',
          'Clear matchup advantages supported by large sample sizes'
        ]
      },
      {
        range: [75, 89],
        label: 'high',
        description: 'High confidence with good statistical indicators',
        typicalAccuracy: '75-85% winner accuracy, ±12 points score accuracy',
        recommendedUse: 'Reliable for most decision-making purposes',
        cautionaryNotes: [
          'Consider additional context not captured in statistics',
          'Monitor for systematic biases in this confidence range'
        ],
        exampleScenarios: [
          'Evenly matched teams with clear statistical edges',
          'Historical patterns strongly favor one outcome'
        ]
      },
      {
        range: [60, 74],
        label: 'moderate',
        description: 'Moderate confidence with some statistical support',
        typicalAccuracy: '65-75% winner accuracy, ±16 points score accuracy',
        recommendedUse: 'Use with caution and additional analysis',
        cautionaryNotes: [
          'Higher uncertainty requires careful interpretation',
          'Consider multiple predictions or additional data sources'
        ],
        exampleScenarios: [
          'Close matchups with limited statistical differentiation',
          'Teams with inconsistent performance patterns'
        ]
      },
      {
        range: [45, 59],
        label: 'low',
        description: 'Low confidence with limited statistical support',
        typicalAccuracy: '55-65% winner accuracy, ±20 points score accuracy',
        recommendedUse: 'Informational only, not suitable for important decisions',
        cautionaryNotes: [
          'Predictions are only slightly better than random chance',
          'High risk of significant prediction errors'
        ],
        exampleScenarios: [
          'Insufficient data for reliable analysis',
          'Highly unpredictable matchups or circumstances'
        ]
      },
      {
        range: [0, 44],
        label: 'very_low',
        description: 'Very low confidence with minimal statistical support',
        typicalAccuracy: '45-55% winner accuracy, ±25+ points score accuracy',
        recommendedUse: 'Not recommended for any decision-making',
        cautionaryNotes: [
          'Predictions may be no better than random guessing',
          'Indicates fundamental issues with data or methodology'
        ],
        exampleScenarios: [
          'Severe data quality problems',
          'Model breakdown or systematic failures'
        ]
      }
    ];

    const interpretationTips = [
      'Higher confidence generally correlates with better accuracy, but exceptions exist',
      'Consider the number and strength of key matchup factors when interpreting confidence',
      'Look for risk factors that might not be fully captured in the confidence score',
      'Confidence levels are calibrated based on historical performance patterns',
      'Multiple predictions with similar confidence can be compared for relative strength'
    ];

    const commonMisconceptions = [
      'High confidence does not guarantee accuracy - upsets can still occur',
      'Low confidence does not mean the prediction is wrong - it indicates uncertainty',
      'Confidence percentages are not the same as win probabilities',
      'Score predictions have different accuracy patterns than winner predictions',
      'Confidence levels account for statistical factors but not all real-world variables'
    ];

    const bestPractices = [
      'Use confidence levels as one factor among many in decision-making',
      'Pay attention to the key factors and risk factors, not just the confidence number',
      'Consider the context and stakes when interpreting confidence levels',
      'Track prediction accuracy over time to calibrate your interpretation',
      'Combine multiple predictions or sources when confidence is moderate or low'
    ];

    const contextualFactors = [
      {
        factor: 'Sample Size',
        impact: 'Larger sample sizes generally increase confidence reliability',
        guidance: 'Be more cautious with early-season predictions when sample sizes are small'
      },
      {
        factor: 'Data Quality',
        impact: 'Poor data quality reduces confidence reliability',
        guidance: 'Check data quality metrics before relying on confidence levels'
      },
      {
        factor: 'Model Performance',
        impact: 'Strong model R² values support confidence calibration',
        guidance: 'Lower model performance may indicate overconfident predictions'
      },
      {
        factor: 'Historical Patterns',
        impact: 'Consistent historical patterns increase prediction reliability',
        guidance: 'Be cautious when predictions contradict strong historical trends'
      },
      {
        factor: 'Matchup Complexity',
        impact: 'Complex matchups may have hidden factors not captured in confidence',
        guidance: 'Consider additional analysis for unusual or complex matchups'
      }
    ];

    return {
      confidenceLevels,
      interpretationTips,
      commonMisconceptions,
      bestPractices,
      contextualFactors
    };
  }

  /**
   * Generates recommendations and insights
   */
  private generateRecommendations(
    gameAnalyses: GameAnalysisResult[],
    accuracyResults: AccuracyTestResult,
    systemHealth: SystemHealthStatus
  ): RecommendationsSection {
    const immediateActions = this.generateImmediateActions(systemHealth);
    const longTermImprovements = this.generateLongTermImprovements(accuracyResults, systemHealth);
    const dataCollectionRecommendations = this.generateDataRecommendations(systemHealth.dataQuality);
    const modelEnhancements = this.generateModelRecommendations(systemHealth.modelHealth, accuracyResults);
    const userGuidance = this.generateUserGuidance(gameAnalyses, accuracyResults);

    return {
      immediateActions,
      longTermImprovements,
      dataCollectionRecommendations,
      modelEnhancements,
      userGuidance
    };
  }

  /**
   * Gets top recommendations for executive summary
   */
  private getTopRecommendations(
    gameAnalyses: GameAnalysisResult[],
    accuracyResults: AccuracyTestResult,
    systemHealth: SystemHealthStatus
  ): string[] {
    const recommendations: string[] = [];

    // Data quality recommendations
    if (systemHealth.dataQuality.score < 80) {
      recommendations.push('Improve data collection processes to enhance prediction reliability');
    }

    // Model performance recommendations
    if (systemHealth.modelHealth.regressionModelFit < 0.4) {
      recommendations.push('Enhance statistical models to improve predictive power');
    }

    // Accuracy recommendations
    if (accuracyResults.winProbabilityAccuracy.accuracy < 70) {
      recommendations.push('Investigate and address systematic prediction biases');
    }

    // Confidence calibration recommendations
    if (accuracyResults.confidenceCalibration.calibrationScore < 75) {
      recommendations.push('Recalibrate confidence levels to better reflect actual accuracy');
    }

    // System health recommendations
    if (systemHealth.overallHealth === 'fair' || systemHealth.overallHealth === 'poor') {
      recommendations.push('Address critical system health issues to maintain prediction quality');
    }

    return recommendations.slice(0, 3); // Top 3 recommendations
  }

  /**
   * Generates immediate action recommendations
   */
  private generateImmediateActions(systemHealth: SystemHealthStatus): Recommendation[] {
    const actions: Recommendation[] = [];

    // Critical alerts
    const criticalAlerts = systemHealth.alerts.filter(a => a.type === 'critical' && !a.resolved);
    if (criticalAlerts.length > 0) {
      actions.push({
        priority: 'critical',
        category: 'System Health',
        title: 'Address Critical System Alerts',
        description: `${criticalAlerts.length} critical alerts require immediate attention`,
        expectedImpact: 'Prevent system degradation and maintain prediction reliability',
        implementationEffort: 'medium',
        timeline: 'Within 24 hours',
        successMetrics: ['All critical alerts resolved', 'System health score improvement']
      });
    }

    // Data quality issues
    if (systemHealth.dataQuality.criticalIssues > 0) {
      actions.push({
        priority: 'high',
        category: 'Data Quality',
        title: 'Resolve Critical Data Quality Issues',
        description: `${systemHealth.dataQuality.criticalIssues} critical data issues affecting predictions`,
        expectedImpact: 'Improve prediction accuracy and system reliability',
        implementationEffort: 'medium',
        timeline: 'Within 48 hours',
        successMetrics: ['Zero critical data issues', 'Data quality score > 80%']
      });
    }

    // Model health issues
    if (systemHealth.modelHealth.score < 60) {
      actions.push({
        priority: 'high',
        category: 'Model Performance',
        title: 'Investigate Model Performance Degradation',
        description: 'Statistical models showing poor performance metrics',
        expectedImpact: 'Restore prediction accuracy and confidence',
        implementationEffort: 'high',
        timeline: 'Within 1 week',
        successMetrics: ['Model health score > 70%', 'Improved R² values']
      });
    }

    return actions;
  }

  /**
   * Generates long-term improvement recommendations
   */
  private generateLongTermImprovements(
    accuracyResults: AccuracyTestResult,
    systemHealth: SystemHealthStatus
  ): Recommendation[] {
    const improvements: Recommendation[] = [];

    // Prediction accuracy improvements
    if (accuracyResults.winProbabilityAccuracy.accuracy < 75) {
      improvements.push({
        priority: 'high',
        category: 'Prediction Accuracy',
        title: 'Enhance Prediction Methodology',
        description: 'Develop advanced statistical techniques to improve prediction accuracy',
        expectedImpact: 'Increase win prediction accuracy by 5-10 percentage points',
        implementationEffort: 'high',
        timeline: '2-3 months',
        successMetrics: ['Win accuracy > 75%', 'Reduced systematic biases', 'Better calibration']
      });
    }

    // Data infrastructure improvements
    improvements.push({
      priority: 'medium',
      category: 'Data Infrastructure',
      title: 'Implement Advanced Data Validation',
      description: 'Build automated data quality monitoring and correction systems',
      expectedImpact: 'Maintain consistently high data quality and reduce manual intervention',
      implementationEffort: 'high',
      timeline: '3-4 months',
      successMetrics: ['Automated quality checks', 'Data quality score > 90%', 'Reduced manual corrections']
    });

    // Model sophistication improvements
    improvements.push({
      priority: 'medium',
      category: 'Model Enhancement',
      title: 'Develop Ensemble Prediction Models',
      description: 'Combine multiple statistical approaches for more robust predictions',
      expectedImpact: 'Improve prediction stability and handle edge cases better',
      implementationEffort: 'high',
      timeline: '4-6 months',
      successMetrics: ['Improved model R²', 'Reduced prediction variance', 'Better handling of outliers']
    });

    return improvements;
  }

  /**
   * Generates data collection recommendations
   */
  private generateDataRecommendations(dataQuality: SystemHealthStatus['dataQuality']): Recommendation[] {
    const recommendations: Recommendation[] = [];

    if (dataQuality.completeness < 90) {
      recommendations.push({
        priority: 'high',
        category: 'Data Completeness',
        title: 'Improve Data Collection Coverage',
        description: 'Address gaps in statistical data collection to ensure comprehensive analysis',
        expectedImpact: 'More reliable predictions with fewer data-related uncertainties',
        implementationEffort: 'medium',
        timeline: '1-2 months',
        successMetrics: ['Data completeness > 95%', 'Reduced missing data warnings']
      });
    }

    if (dataQuality.consistency < 85) {
      recommendations.push({
        priority: 'medium',
        category: 'Data Consistency',
        title: 'Standardize Data Collection Processes',
        description: 'Implement consistent data formats and validation rules across all sources',
        expectedImpact: 'Improved data reliability and reduced processing errors',
        implementationEffort: 'medium',
        timeline: '6-8 weeks',
        successMetrics: ['Data consistency > 90%', 'Standardized data formats']
      });
    }

    return recommendations;
  }

  /**
   * Generates model enhancement recommendations
   */
  private generateModelRecommendations(
    modelHealth: SystemHealthStatus['modelHealth'],
    accuracyResults: AccuracyTestResult
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    if (modelHealth.regressionModelFit < 0.5) {
      recommendations.push({
        priority: 'high',
        category: 'Statistical Models',
        title: 'Enhance Regression Model Performance',
        description: 'Investigate and improve statistical model fit through feature engineering and selection',
        expectedImpact: 'Stronger predictive relationships and more reliable coefficients',
        implementationEffort: 'high',
        timeline: '2-3 months',
        successMetrics: ['Model R² > 0.5', 'Improved coefficient significance', 'Better cross-validation results']
      });
    }

    if (accuracyResults.confidenceCalibration.calibrationScore < 80) {
      recommendations.push({
        priority: 'medium',
        category: 'Confidence Calibration',
        title: 'Recalibrate Confidence Calculations',
        description: 'Adjust confidence calculation methodology to better reflect actual prediction accuracy',
        expectedImpact: 'More reliable confidence levels for decision-making',
        implementationEffort: 'medium',
        timeline: '4-6 weeks',
        successMetrics: ['Calibration score > 85%', 'Reduced overconfidence', 'Better reliability curves']
      });
    }

    return recommendations;
  }

  /**
   * Generates user guidance recommendations
   */
  private generateUserGuidance(
    gameAnalyses: GameAnalysisResult[],
    accuracyResults: AccuracyTestResult
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    recommendations.push({
      priority: 'medium',
      category: 'User Education',
      title: 'Develop Prediction Interpretation Training',
      description: 'Create educational materials to help users properly interpret predictions and confidence levels',
      expectedImpact: 'Better decision-making and more appropriate use of predictions',
      implementationEffort: 'low',
      timeline: '2-3 weeks',
      successMetrics: ['User training materials created', 'Improved user feedback', 'Reduced misinterpretation']
    });

    recommendations.push({
      priority: 'low',
      category: 'User Interface',
      title: 'Enhance Prediction Presentation',
      description: 'Improve how predictions and explanations are displayed to users',
      expectedImpact: 'Clearer communication of prediction reliability and reasoning',
      implementationEffort: 'medium',
      timeline: '4-6 weeks',
      successMetrics: ['Improved user interface', 'Better explanation clarity', 'Enhanced user experience']
    });

    return recommendations;
  }

  /**
   * Creates technical appendix with detailed metrics
   */
  private createTechnicalAppendix(
    accuracyResults: AccuracyTestResult,
    systemHealth: SystemHealthStatus
  ): TechnicalAppendix {
    const methodologyOverview = `
This analysis uses a comprehensive validation framework that evaluates the entire prediction pipeline from raw data through final predictions. The methodology includes:

1. Data Pipeline Validation: Ensures raw statistics are complete, consistent, and properly processed
2. Statistical Model Validation: Verifies regression analysis correctness and significance
3. Weight Calculation Validation: Confirms proper derivation and application of statistical weights
4. Prediction Accuracy Testing: Measures performance against actual game outcomes
5. Calculation Tracing: Provides step-by-step verification of mathematical operations
6. Sample Game Analysis: Analyzes specific predictions for insights and explanations

The validation process uses established statistical metrics and best practices to ensure reliable assessment of prediction quality.
    `.trim();

    const statisticalMetrics = [
      {
        metric: 'Win Prediction Accuracy',
        value: accuracyResults.winProbabilityAccuracy.accuracy,
        interpretation: 'Percentage of games where the predicted winner was correct'
      },
      {
        metric: 'Brier Score',
        value: accuracyResults.winProbabilityAccuracy.brierScore,
        interpretation: 'Probability prediction accuracy (lower is better, 0-1 scale)'
      },
      {
        metric: 'Mean Absolute Error (Score)',
        value: accuracyResults.scorePredictionAccuracy.meanAbsoluteError,
        interpretation: 'Average points difference between predicted and actual scores'
      },
      {
        metric: 'Calibration Score',
        value: accuracyResults.confidenceCalibration.calibrationScore,
        interpretation: 'How well confidence levels match actual accuracy (0-100 scale)'
      },
      {
        metric: 'Log Loss',
        value: accuracyResults.winProbabilityAccuracy.logLoss,
        interpretation: 'Probability prediction quality (lower is better)'
      }
    ];

    const dataQualityMetrics = {
      completeness: systemHealth.dataQuality.completeness,
      consistency: systemHealth.dataQuality.consistency,
      validity: systemHealth.dataQuality.validity,
      timeliness: systemHealth.dataQuality.timeliness
    };

    const modelPerformanceMetrics = {
      rSquared: systemHealth.modelHealth.regressionModelFit,
      meanAbsoluteError: accuracyResults.scorePredictionAccuracy.meanAbsoluteError,
      brierScore: accuracyResults.winProbabilityAccuracy.brierScore,
      calibrationScore: accuracyResults.confidenceCalibration.calibrationScore
    };

    const limitationsAndAssumptions = [
      'Predictions assume historical statistical relationships will continue to hold',
      'Model performance may vary with sample size and data quality',
      'Confidence levels are calibrated based on historical accuracy patterns',
      'Unpredictable factors (injuries, weather, motivation) are not directly modeled',
      'Statistical significance thresholds may need adjustment based on domain expertise',
      'Cross-validation results may not fully represent future performance',
      'Systematic biases may exist that are not captured in current validation methods'
    ];

    return {
      methodologyOverview,
      statisticalMetrics,
      dataQualityMetrics,
      modelPerformanceMetrics,
      limitationsAndAssumptions
    };
  }
}

// Export singleton instance
export const analysisReporter = new AnalysisReporter();