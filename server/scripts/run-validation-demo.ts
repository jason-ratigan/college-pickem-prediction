#!/usr/bin/env npx tsx

/**
 * Regression Analysis Validation System Demo Script
 * 
 * This script demonstrates how to use the validation system to:
 * 1. Run comprehensive validation
 * 2. Generate intuitive analysis reports
 * 3. Test individual components
 * 4. Monitor system health
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';
import { writeFileSync } from 'fs';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from root .env file
const rootDir = join(__dirname, '..', '..');
config({ path: join(rootDir, '.env') });

// Add the parent directory to the module path so we can import validation services
process.chdir(join(__dirname, '..'));

// Capture console output for file writing
let outputLog: string[] = [];
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

function logToFile(message: string) {
  outputLog.push(message);
  originalConsoleLog(message);
}

function errorToFile(message: string) {
  outputLog.push(`ERROR: ${message}`);
  originalConsoleError(message);
}

// Override console methods to reduce noise
console.log = (...args) => {
  const message = args.join(' ');
  // Filter out verbose database queries and detailed logging
  if (message.includes('Query:') || 
      message.includes('[Sample Game Analyzer]') ||
      message.includes('[Prediction Accuracy Tester]') ||
      message.includes('[Weight Calculation Verifier]') ||
      message.includes('[Regression Analysis Auditor]') ||
      message.includes('[Data Pipeline Validator]') ||
      message.includes('Calculating opponent-relative') ||
      message.includes('VALIDATION]')) {
    return; // Skip verbose logging
  }
  logToFile(message);
};

console.error = (...args) => {
  const message = args.join(' ');
  errorToFile(message);
};

async function runValidationDemo() {
  console.log('🎯 REGRESSION ANALYSIS VALIDATION SYSTEM DEMO');
  console.log('=' .repeat(60));
  
  try {
    // Import validation services
    console.log('\n📦 Loading validation services...');
    const { dataPipelineValidator } = await import('../services/validation/data-pipeline-validator.js');
    const { regressionAnalysisAuditor } = await import('../services/validation/regression-analysis-auditor.js');
    const { weightCalculationVerifier } = await import('../services/validation/weight-calculation-verifier.js');
    const { predictionAccuracyTester } = await import('../services/validation/prediction-accuracy-tester.js');
    const { sampleGameAnalyzer } = await import('../services/validation/sample-game-analyzer.js');
    
    const season = 2024;
    console.log(`✅ Validation services loaded successfully for season ${season}`);

    // 1. Run Individual Component Validations
    console.log('\n🔍 STEP 1: Running Individual Component Validations');
    console.log('-'.repeat(50));
    
    const validationPromises = [
      { name: 'Data Pipeline', validator: dataPipelineValidator },
      { name: 'Regression Analysis', validator: regressionAnalysisAuditor },
      { name: 'Weight Calculation', validator: weightCalculationVerifier },
      { name: 'Prediction Accuracy', validator: predictionAccuracyTester },
      { name: 'Sample Game Analysis', validator: sampleGameAnalyzer }
    ];

    const results: any[] = [];
    
    for (const { name, validator } of validationPromises) {
      try {
        console.log(`\n🔄 Running ${name} validation...`);
        const startTime = Date.now();
        
        const result = await validator.validate(season);
        const duration = Date.now() - startTime;
        
        results.push({ name, result, duration });
        
        const status = result.isValid ? '✅ PASSED' : '❌ FAILED';
        const score = result.score ? ` (Score: ${result.score}/100)` : '';
        console.log(`   ${status}${score} - ${duration}ms`);
        
        if (result.errors && result.errors.length > 0) {
          console.log(`   ⚠️  Errors: ${result.errors.length}`);
          result.errors.slice(0, 2).forEach((error: any) => {
            console.log(`      • ${error.message || error}`);
          });
        }
        
        if (result.warnings && result.warnings.length > 0) {
          console.log(`   ⚠️  Warnings: ${result.warnings.length}`);
        }
        
      } catch (error) {
        console.log(`   ❌ ERROR: ${error}`);
        results.push({ name, result: { isValid: false, error: error }, duration: 0 });
      }
    }

    // 2. Generate Comprehensive Summary
    console.log('\n📊 STEP 2: Comprehensive Validation Summary');
    console.log('-'.repeat(50));
    
    const validComponents = results.filter(r => r.result.isValid).length;
    const totalComponents = results.length;
    const overallScore = Math.round((validComponents / totalComponents) * 100);
    
    console.log(`\n🎯 Overall System Health: ${overallScore}%`);
    console.log(`✅ Valid Components: ${validComponents}/${totalComponents}`);
    
    const totalErrors = results.reduce((sum, r) => sum + (r.result.errors?.length || 0), 0);
    const totalWarnings = results.reduce((sum, r) => sum + (r.result.warnings?.length || 0), 0);
    
    console.log(`❌ Total Errors: ${totalErrors}`);
    console.log(`⚠️  Total Warnings: ${totalWarnings}`);
    
    // Component breakdown
    console.log('\n📋 Component Breakdown:');
    results.forEach(({ name, result, duration }) => {
      const status = result.isValid ? '✅' : '❌';
      const score = result.score ? ` (${result.score})` : '';
      console.log(`   ${status} ${name}${score} - ${duration}ms`);
    });

    // 3. Generate Sample Game Analysis
    console.log('\n🎮 STEP 3: Sample Game Analysis');
    console.log('-'.repeat(50));
    
    try {
      console.log('\n🔄 Analyzing sample games...');
      const gameAnalysisResult = await sampleGameAnalyzer.selectAndAnalyzeGames(season, 5);
      
      if (gameAnalysisResult.isValid && gameAnalysisResult.analyzedGames.length > 0) {
        console.log(`✅ Analyzed ${gameAnalysisResult.analyzedGames.length} games successfully`);
        
        // Show a sample game analysis
        const sampleGame = gameAnalysisResult.analyzedGames[0];
        console.log('\n📝 Sample Game Analysis:');
        console.log(`   Game: ${sampleGame.gameInfo.homeTeam} vs ${sampleGame.gameInfo.awayTeam}`);
        console.log(`   Predicted: ${sampleGame.prediction.homeScore}-${sampleGame.prediction.awayScore}`);
        console.log(`   Confidence: ${sampleGame.prediction.confidence}%`);
        
        if (sampleGame.gameInfo.actualScore) {
          console.log(`   Actual: ${sampleGame.gameInfo.actualScore.home}-${sampleGame.gameInfo.actualScore.away}`);
        }
        
        console.log(`   Key Factors: ${sampleGame.keyFactors.length} identified`);
        console.log(`   Explanation: ${sampleGame.predictionExplanation.summary}`);
        
      } else {
        console.log('⚠️  No games available for analysis');
      }
      
    } catch (error) {
      console.log(`❌ Sample game analysis failed: ${error}`);
    }

    // 4. Generate Confidence Interpretation Guide
    console.log('\n📚 STEP 4: Confidence Interpretation Guide');
    console.log('-'.repeat(50));
    
    try {
      // Use mock data for demonstration
      const mockAccuracyResults = {
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
          overallReliability: 'medium' as const,
          reliabilityByConfidence: [],
          reliabilityByGameType: []
        }
      };
      
      const guide = sampleGameAnalyzer.generateConfidenceInterpretationGuide(
        results.find(r => r.name === 'Sample Game Analysis')?.result?.analyzedGames || [],
        mockAccuracyResults
      );
      
      console.log('\n📊 Confidence Level Guide:');
      guide.confidenceLevels.slice(0, 3).forEach(level => {
        console.log(`\n   ${level.range[0]}-${level.range[1]}%: ${level.label.toUpperCase()}`);
        console.log(`   ${level.description}`);
        console.log(`   Typical Accuracy: ${level.typicalAccuracy}`);
      });
      
      console.log('\n💡 Key Interpretation Tips:');
      guide.interpretationTips.slice(0, 3).forEach((tip, i) => {
        console.log(`   ${i + 1}. ${tip}`);
      });
      
    } catch (error) {
      console.log(`❌ Confidence guide generation failed: ${error}`);
    }

    // 5. Final Recommendations
    console.log('\n🚀 STEP 5: System Recommendations');
    console.log('-'.repeat(50));
    
    const recommendations: string[] = [];
    
    if (overallScore >= 85) {
      recommendations.push('✅ System is performing excellently - continue monitoring');
      recommendations.push('📈 Consider expanding validation to additional metrics');
    } else if (overallScore >= 70) {
      recommendations.push('✅ System is performing well with room for improvement');
      recommendations.push('🔧 Address any warnings to improve system health');
    } else if (overallScore >= 50) {
      recommendations.push('⚠️  System needs attention - investigate failed components');
      recommendations.push('🔍 Review data quality and model parameters');
    } else {
      recommendations.push('❌ System requires immediate attention');
      recommendations.push('🚨 Critical issues detected - review all components');
    }
    
    if (totalErrors > 0) {
      recommendations.push(`🔧 Address ${totalErrors} error(s) to improve system reliability`);
    }
    
    if (totalWarnings > 5) {
      recommendations.push(`⚠️  Review ${totalWarnings} warning(s) for potential improvements`);
    }
    
    console.log('\n📋 Recommendations:');
    recommendations.forEach((rec, i) => {
      console.log(`   ${i + 1}. ${rec}`);
    });

    // 6. Next Steps
    console.log('\n🎯 NEXT STEPS');
    console.log('-'.repeat(50));
    console.log('\n1. 🌐 Use the API endpoints in your admin interface:');
    console.log('   POST /api/v1/admin/validation/comprehensive/2024');
    console.log('   GET  /api/v1/admin/validation/analysis-report/2024');
    
    console.log('\n2. 📊 Set up regular monitoring:');
    console.log('   - Daily: prediction accuracy tests');
    console.log('   - Weekly: comprehensive validation');
    console.log('   - Monthly: detailed analysis reports');
    
    console.log('\n3. 🔧 Integrate with your workflow:');
    console.log('   - Add validation buttons to admin interface');
    console.log('   - Set up automated alerts for low scores');
    console.log('   - Create dashboards for key metrics');
    
    console.log('\n✅ VALIDATION DEMO COMPLETED SUCCESSFULLY!');
    console.log(`📊 Overall System Health: ${overallScore}%`);
    console.log(`⏱️  Total Runtime: ${Date.now() - startTime}ms`);
    
    // Write detailed results to file
    const reportPath = join(__dirname, '..', 'validation-demo-results.txt');
    const timestamp = new Date().toISOString();
    const detailedReport = [
      `REGRESSION ANALYSIS VALIDATION SYSTEM DEMO RESULTS`,
      `Generated: ${timestamp}`,
      `Season: ${season}`,
      `=`.repeat(80),
      '',
      `SUMMARY:`,
      `Overall System Health: ${overallScore}%`,
      `Valid Components: ${validComponents}/${totalComponents}`,
      `Total Errors: ${totalErrors}`,
      `Total Warnings: ${totalWarnings}`,
      `Total Runtime: ${Date.now() - startTime}ms`,
      '',
      `COMPONENT RESULTS:`,
      ...results.map(({ name, result, duration }) => {
        const status = result.isValid ? '✅ PASSED' : '❌ FAILED';
        const score = result.score ? ` (Score: ${result.score}/100)` : '';
        let details = `${status} ${name}${score} - ${duration}ms`;
        
        if (result.errors && result.errors.length > 0) {
          details += `\n  Errors: ${result.errors.length}`;
          result.errors.slice(0, 3).forEach((error: any) => {
            details += `\n    • ${error.message || error}`;
          });
        }
        
        if (result.warnings && result.warnings.length > 0) {
          details += `\n  Warnings: ${result.warnings.length}`;
        }
        
        if (result.recommendations && result.recommendations.length > 0) {
          details += `\n  Recommendations: ${result.recommendations.length}`;
          result.recommendations.slice(0, 2).forEach((rec: string) => {
            details += `\n    • ${rec}`;
          });
        }
        
        return details;
      }),
      '',
      `RECOMMENDATIONS:`,
      ...recommendations.map((rec, i) => `${i + 1}. ${rec}`),
      '',
      `NEXT STEPS:`,
      '1. Use API endpoints: POST /api/v1/admin/validation/comprehensive/2024',
      '2. Set up regular monitoring (daily/weekly/monthly)',
      '3. Integrate with admin interface',
      '',
      `FULL LOG:`,
      ...outputLog
    ].join('\n');
    
    writeFileSync(reportPath, detailedReport);
    console.log(`\n📄 Detailed results written to: ${reportPath}`);
    
  } catch (error) {
    console.error('\n❌ DEMO FAILED:', error);
    console.error('\nTroubleshooting tips:');
    console.error('1. Ensure the database is running and accessible');
    console.error('2. Verify that game data exists for the specified season');
    console.error('3. Check that statistical processing has been completed');
    console.error('4. Review the error logs for specific issues');
    
    // Write error log to file
    const errorPath = join(__dirname, '..', 'validation-demo-error.txt');
    const errorReport = [
      `VALIDATION DEMO ERROR LOG`,
      `Generated: ${new Date().toISOString()}`,
      `=`.repeat(50),
      '',
      `ERROR: ${error}`,
      '',
      `FULL LOG:`,
      ...outputLog
    ].join('\n');
    
    writeFileSync(errorPath, errorReport);
    console.error(`\n📄 Error log written to: ${errorPath}`);
    
    process.exit(1);
  } finally {
    // Restore original console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  }
}

// Run the demo
const startTime = Date.now();
runValidationDemo().catch(console.error);