#!/usr/bin/env npx tsx

/**
 * Quick Regression Analysis Validation Demo
 * 
 * A simplified version that runs validation with minimal output
 * and writes detailed results to a file.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';
import { writeFileSync } from 'fs';

// Setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..', '..');
config({ path: join(rootDir, '.env') });
process.chdir(join(__dirname, '..'));

// Suppress all console output except our summary
const originalConsole = { ...console };
console.log = () => {};
console.error = () => {};
console.warn = () => {};
console.info = () => {};

async function runQuickValidation() {
  const startTime = Date.now();
  const season = 2024;
  
  originalConsole.log('🎯 Running Regression Analysis Validation (Quick Mode)...');
  originalConsole.log(`📅 Season: ${season}`);
  
  try {
    // Import validation services
    const { dataPipelineValidator } = await import('../services/validation/data-pipeline-validator.js');
    const { regressionAnalysisAuditor } = await import('../services/validation/regression-analysis-auditor.js');
    const { weightCalculationVerifier } = await import('../services/validation/weight-calculation-verifier.js');
    const { predictionAccuracyTester } = await import('../services/validation/prediction-accuracy-tester.js');
    const { sampleGameAnalyzer } = await import('../services/validation/sample-game-analyzer.js');

    const validators = [
      { name: 'Data Pipeline', validator: dataPipelineValidator },
      { name: 'Regression Analysis', validator: regressionAnalysisAuditor },
      { name: 'Weight Calculation', validator: weightCalculationVerifier },
      { name: 'Prediction Accuracy', validator: predictionAccuracyTester },
      { name: 'Sample Game Analysis', validator: sampleGameAnalyzer }
    ];

    const results: any[] = [];
    let completedCount = 0;

    // Run validations with progress indicator
    for (const { name, validator } of validators) {
      try {
        const result = await validator.validate(season);
        results.push({ name, result, success: true });
        completedCount++;
        originalConsole.log(`✅ ${completedCount}/${validators.length} - ${name}`);
      } catch (error) {
        results.push({ name, result: { isValid: false, error: String(error) }, success: false });
        originalConsole.log(`❌ ${completedCount + 1}/${validators.length} - ${name} (Failed)`);
      }
    }

    // Calculate summary
    const validComponents = results.filter(r => r.result.isValid).length;
    const totalComponents = results.length;
    const overallScore = Math.round((validComponents / totalComponents) * 100);
    const duration = Date.now() - startTime;

    // Display summary
    originalConsole.log('\n📊 VALIDATION SUMMARY');
    originalConsole.log('='.repeat(40));
    originalConsole.log(`Overall Health Score: ${overallScore}%`);
    originalConsole.log(`Valid Components: ${validComponents}/${totalComponents}`);
    originalConsole.log(`Total Runtime: ${duration}ms`);

    // Component status
    originalConsole.log('\n📋 Component Status:');
    results.forEach(({ name, result }) => {
      const status = result.isValid ? '✅' : '❌';
      const score = result.score ? ` (${result.score})` : '';
      originalConsole.log(`   ${status} ${name}${score}`);
    });

    // Health assessment
    let healthStatus: string;
    let recommendations: string[] = [];

    if (overallScore >= 85) {
      healthStatus = '🟢 EXCELLENT';
      recommendations.push('System is performing optimally');
      recommendations.push('Continue regular monitoring');
    } else if (overallScore >= 70) {
      healthStatus = '🟡 GOOD';
      recommendations.push('System is performing well');
      recommendations.push('Address any warnings to improve further');
    } else if (overallScore >= 50) {
      healthStatus = '🟠 NEEDS ATTENTION';
      recommendations.push('System requires investigation');
      recommendations.push('Review failed components immediately');
    } else {
      healthStatus = '🔴 CRITICAL';
      recommendations.push('System requires immediate attention');
      recommendations.push('Multiple critical issues detected');
    }

    originalConsole.log(`\n🎯 System Status: ${healthStatus}`);
    originalConsole.log('\n💡 Recommendations:');
    recommendations.forEach((rec, i) => {
      originalConsole.log(`   ${i + 1}. ${rec}`);
    });

    // Write detailed report to file
    const reportPath = join(__dirname, '..', 'validation-quick-results.json');
    const detailedReport = {
      timestamp: new Date().toISOString(),
      season,
      summary: {
        overallScore,
        healthStatus: healthStatus.replace(/🟢|🟡|🟠|🔴/, '').trim(),
        validComponents,
        totalComponents,
        duration
      },
      components: results.map(({ name, result, success }) => ({
        name,
        status: result.isValid ? 'PASSED' : 'FAILED',
        score: result.score || 0,
        errorCount: result.errors?.length || 0,
        warningCount: result.warnings?.length || 0,
        recommendationCount: result.recommendations?.length || 0,
        success
      })),
      recommendations,
      apiEndpoints: {
        comprehensive: `POST /api/v1/admin/validation/comprehensive/${season}`,
        analysisReport: `GET /api/v1/admin/validation/analysis-report/${season}`,
        individual: `POST /api/v1/admin/validation/{component}/${season}`,
        status: 'GET /api/v1/admin/validation/status'
      }
    };

    writeFileSync(reportPath, JSON.stringify(detailedReport, null, 2));
    originalConsole.log(`\n📄 Detailed results: ${reportPath}`);

    // Write human-readable report
    const txtReportPath = join(__dirname, '..', 'validation-quick-results.txt');
    const humanReport = [
      'REGRESSION ANALYSIS VALIDATION RESULTS',
      '=' .repeat(50),
      `Generated: ${new Date().toLocaleString()}`,
      `Season: ${season}`,
      '',
      'SUMMARY:',
      `Overall Health Score: ${overallScore}%`,
      `System Status: ${healthStatus}`,
      `Valid Components: ${validComponents}/${totalComponents}`,
      `Runtime: ${duration}ms`,
      '',
      'COMPONENT RESULTS:',
      ...results.map(({ name, result }) => {
        const status = result.isValid ? 'PASSED' : 'FAILED';
        const score = result.score ? ` (Score: ${result.score}/100)` : '';
        return `  ${status}: ${name}${score}`;
      }),
      '',
      'RECOMMENDATIONS:',
      ...recommendations.map((rec, i) => `  ${i + 1}. ${rec}`),
      '',
      'API ENDPOINTS:',
      `  Comprehensive: POST /api/v1/admin/validation/comprehensive/${season}`,
      `  Analysis Report: GET /api/v1/admin/validation/analysis-report/${season}`,
      `  Individual: POST /api/v1/admin/validation/{component}/${season}`,
      `  Status: GET /api/v1/admin/validation/status`,
      '',
      'NEXT STEPS:',
      '1. Integrate validation endpoints into your admin interface',
      '2. Set up regular monitoring schedule',
      '3. Address any failed components',
      '4. Review detailed component results for specific issues'
    ].join('\n');

    writeFileSync(txtReportPath, humanReport);
    originalConsole.log(`📄 Human-readable report: ${txtReportPath}`);

    originalConsole.log('\n✅ Quick validation completed successfully!');

  } catch (error) {
    originalConsole.error('\n❌ Validation failed:', error);
    
    const errorPath = join(__dirname, '..', 'validation-quick-error.txt');
    writeFileSync(errorPath, `Validation Error: ${error}\nTimestamp: ${new Date().toISOString()}`);
    originalConsole.error(`📄 Error log: ${errorPath}`);
    
    process.exit(1);
  }
}

// Run the quick validation
runQuickValidation().catch(originalConsole.error);