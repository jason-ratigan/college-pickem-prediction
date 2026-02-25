// server/services/validation/index.ts

/**
 * Main entry point for the regression analysis validation infrastructure
 * Requirements: 1.4, 7.2
 */

// Export all types
export * from './types.js';

// Export core infrastructure
export * from './core.js';

// Export utility functions
export { ValidationUtils } from './utils.js';

// Export validators
export { RegressionAnalysisAuditor } from './regression-analysis-auditor.js';
export { WeightCalculationVerifier } from './weight-calculation-verifier.js';
export { SampleGameAnalyzer, sampleGameAnalyzer } from './sample-game-analyzer.js';

// Re-export commonly used instances
export {
  validationLogger,
  errorHandler,
  calculationTracer,
  DEFAULT_VALIDATION_CONFIG
} from './core.js';

/**
 * Validation Infrastructure Summary:
 * 
 * This module provides the core validation infrastructure for the regression analysis
 * validation system. It includes:
 * 
 * 1. Type Definitions (types.ts):
 *    - ValidationResult, ValidationError, ValidationWarning
 *    - CalculationTrace and related tracing types
 *    - Data pipeline, regression, weight, and accuracy validation types
 *    - System health monitoring types
 *    - Sample game analysis types
 * 
 * 2. Core Infrastructure (core.ts):
 *    - ValidationLoggerImpl: Comprehensive logging for all validation activities
 *    - ErrorHandlerImpl: Centralized error handling and reporting
 *    - BaseValidator: Abstract base class for all validators
 *    - CalculationTracer: Step-by-step calculation tracing
 *    - Default configuration and singleton instances
 * 
 * 3. Utility Functions (utils.ts):
 *    - Common validation utilities
 *    - Mathematical validation helpers
 *    - Statistical calculation utilities
 * 
 * Usage:
 * 
 * ```typescript
 * import { 
 *   ValidationResult, 
 *   validationLogger, 
 *   errorHandler,
 *   calculationTracer 
 * } from './validation/index.js';
 * 
 * // Start a calculation trace
 * const traceId = calculationTracer.startTrace(homeTeamId, awayTeamId, season);
 * 
 * // Add calculation steps
 * calculationTracer.addStep(traceId, 'data_extraction', 'Extract game stats', inputs, formula, output);
 * 
 * // Validate and log results
 * const result = await validator.validate(data);
 * validationLogger.logValidation('data_pipeline', result);
 * ```
 */