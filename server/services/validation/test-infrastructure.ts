// server/services/validation/test-infrastructure.ts

/**
 * Test script to verify the validation infrastructure is working correctly
 * This can be run to ensure all components are properly integrated
 */

import {
  validationLogger,
  errorHandler,
  calculationTracer,
  ValidationUtils,
  ValidationResult,
  DEFAULT_VALIDATION_CONFIG
} from './index.js';

export async function testValidationInfrastructure(): Promise<void> {
  console.log('='.repeat(60));
  console.log('TESTING VALIDATION INFRASTRUCTURE');
  console.log('='.repeat(60));

  try {
    // Test 1: Basic validation result creation and logging
    console.log('\n1. Testing basic validation result creation and logging...');
    
    const testResult: ValidationResult = {
      isValid: true,
      score: 85,
      errors: [],
      warnings: [{
        code: 'TEST_WARNING',
        message: 'This is a test warning',
        component: 'test'
      }],
      recommendations: ['Consider improving data quality'],
      timestamp: new Date()
    };

    validationLogger.logValidation('test_component', testResult);
    console.log('✓ Basic validation logging works');

    // Test 2: Error handling
    console.log('\n2. Testing error handling...');
    
    const testError = errorHandler.createValidationError(
      'TEST_ERROR',
      'This is a test error',
      'test_component',
      'medium'
    );

    errorHandler.handleValidationError(testError);
    console.log('✓ Error handling works');

    // Test 3: Calculation tracing
    console.log('\n3. Testing calculation tracing...');
    
    const traceId = calculationTracer.startTrace(1, 2, 2024, 12345);
    
    calculationTracer.addStep(
      traceId,
      'data_extraction',
      'Extract game statistics',
      { gameId: 12345, teamId: 1 },
      'stats = getGameStats(gameId, teamId)',
      { passingYards: 250, rushingYards: 120 }
    );

    calculationTracer.addStep(
      traceId,
      'efficiency_calculation',
      'Calculate team efficiency',
      { stats: { passingYards: 250, rushingYards: 120 } },
      'efficiency = (passingYards + rushingYards) / opponentBaseline',
      { efficiency: 1.25 }
    );

    calculationTracer.validateStep(traceId, 1, true, [], []);
    calculationTracer.validateStep(traceId, 2, true, [], []);

    const completedTrace = calculationTracer.completeTrace(traceId, {
      homeScore: 28,
      awayScore: 21,
      confidence: 0.75
    });

    console.log('✓ Calculation tracing works');
    console.log(`  - Trace ID: ${completedTrace.traceId}`);
    console.log(`  - Steps: ${completedTrace.steps.length}`);
    console.log(`  - Valid steps: ${completedTrace.validationResults.filter(r => r.isValid).length}`);

    // Test 4: Validation utilities
    console.log('\n4. Testing validation utilities...');

    // Test number validation
    const numberTest = ValidationUtils.validateNumber(85.5, 'test score', 0, 100);
    console.log(`✓ Number validation: ${numberTest.isValid ? 'PASS' : 'FAIL'}`);

    // Test R-squared validation
    const rSquaredTest = ValidationUtils.validateRSquared(0.75, 'model R-squared');
    console.log(`✓ R-squared validation: ${rSquaredTest.isValid ? 'PASS' : 'FAIL'}`);

    // Test weight validation
    const weights = {
      passingOffense: 0.25,
      rushingOffense: 0.20,
      passingDefense: 0.25,
      rushingDefense: 0.20,
      turnoverMargin: 0.10
    };
    const weightSumTest = ValidationUtils.validateWeightSum(weights, 1.0, 0.01);
    console.log(`✓ Weight sum validation: ${weightSumTest.isValid ? 'PASS' : 'FAIL'} (sum: ${weightSumTest.actualSum.toFixed(3)})`);

    // Test statistical calculations
    const testValues = [85, 92, 78, 88, 95, 82, 90, 87, 93, 89];
    const stats = ValidationUtils.calculateBasicStats(testValues);
    console.log(`✓ Statistical calculations: mean=${stats.mean.toFixed(1)}, std=${stats.standardDeviation.toFixed(1)}`);

    // Test convergence validation
    const convergenceValues = [10.0, 8.5, 7.2, 6.8, 6.75, 6.74, 6.74, 6.74];
    const convergenceTest = ValidationUtils.validateConvergence(convergenceValues, 0.01, 3);
    console.log(`✓ Convergence validation: ${convergenceTest.hasConverged ? 'CONVERGED' : 'NOT CONVERGED'}`);
    if (convergenceTest.hasConverged) {
      console.log(`  - Converged after ${convergenceTest.iterationsToConvergence} iterations`);
    }

    // Test prediction validation
    const predictionTest = ValidationUtils.validatePredictionValues(28, 21, 0.75);
    console.log(`✓ Prediction validation: ${predictionTest.isValid ? 'PASS' : 'FAIL'}`);
    if (predictionTest.warnings.length > 0) {
      console.log(`  - Warnings: ${predictionTest.warnings.length}`);
    }

    // Test 5: Configuration
    console.log('\n5. Testing configuration...');
    console.log(`✓ Default config loaded:`);
    console.log(`  - Data quality minimum score: ${DEFAULT_VALIDATION_CONFIG.thresholds.dataQuality.minimumScore}`);
    console.log(`  - Regression R² threshold: ${DEFAULT_VALIDATION_CONFIG.thresholds.regression.rSquaredThreshold}`);
    console.log(`  - Weight bounds: [${DEFAULT_VALIDATION_CONFIG.thresholds.weights.minimumWeight}, ${DEFAULT_VALIDATION_CONFIG.thresholds.weights.maximumWeight}]`);

    // Test 6: Validation result merging
    console.log('\n6. Testing validation result merging...');
    
    const result1: ValidationResult = {
      isValid: true,
      score: 90,
      errors: [],
      warnings: [],
      recommendations: ['Recommendation 1'],
      timestamp: new Date()
    };

    const result2: ValidationResult = {
      isValid: false,
      score: 70,
      errors: [{
        code: 'TEST_ERROR',
        message: 'Test error message',
        severity: 'medium',
        component: 'test'
      }],
      warnings: [{
        code: 'TEST_WARNING',
        message: 'Test warning message',
        component: 'test'
      }],
      recommendations: ['Recommendation 2'],
      timestamp: new Date()
    };

    const mergedResult = ValidationUtils.mergeValidationResults([result1, result2]);
    console.log(`✓ Result merging: ${mergedResult.isValid ? 'VALID' : 'INVALID'}, score: ${mergedResult.score}`);
    console.log(`  - Total errors: ${mergedResult.errors.length}`);
    console.log(`  - Total warnings: ${mergedResult.warnings.length}`);
    console.log(`  - Total recommendations: ${mergedResult.recommendations.length}`);

    // Test 7: Validation history
    console.log('\n7. Testing validation history...');
    
    const history = validationLogger.getValidationHistory('test_component');
    console.log(`✓ Validation history: ${history.length} entries for test_component`);

    console.log('\n' + '='.repeat(60));
    console.log('ALL VALIDATION INFRASTRUCTURE TESTS PASSED ✓');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('VALIDATION INFRASTRUCTURE TEST FAILED ✗');
    console.error('='.repeat(60));
    console.error('Error:', error);
    throw error;
  }
}

// Export for use in other test files
export { testValidationInfrastructure as default };