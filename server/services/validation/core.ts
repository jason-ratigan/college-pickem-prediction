// server/services/validation/core.ts

import { 
  ValidationResult, 
  ValidationError, 
  ValidationWarning, 
  CalculationTrace,
  ValidationLogger,
  ErrorHandler,
  ValidationComponent,
  ValidationConfig
} from './types.js';

/**
 * Core validation infrastructure providing logging, error handling, and base functionality
 * Requirements: 1.4, 7.2
 */

// =============================================================================
// VALIDATION LOGGER IMPLEMENTATION
// =============================================================================

export class ValidationLoggerImpl implements ValidationLogger {
  private validationHistory: Map<string, ValidationResult[]> = new Map();
  private maxHistorySize = 1000;

  logValidation(component: string, result: ValidationResult): void {
    const timestamp = new Date().toISOString();
    console.log(`[VALIDATION] ${timestamp} [${component}] Score: ${result.score}/100, Valid: ${result.isValid}`);
    
    if (result.errors.length > 0) {
      console.log(`[VALIDATION] ${timestamp} [${component}] Errors: ${result.errors.length}`);
      result.errors.forEach(error => {
        console.log(`[VALIDATION] ${timestamp} [${component}] ERROR [${error.severity}] ${error.code}: ${error.message}`);
      });
    }

    if (result.warnings.length > 0) {
      console.log(`[VALIDATION] ${timestamp} [${component}] Warnings: ${result.warnings.length}`);
      result.warnings.forEach(warning => {
        console.log(`[VALIDATION] ${timestamp} [${component}] WARNING ${warning.code}: ${warning.message}`);
      });
    }

    // Store in history
    if (!this.validationHistory.has(component)) {
      this.validationHistory.set(component, []);
    }
    
    const history = this.validationHistory.get(component)!;
    history.push(result);
    
    // Trim history if too large
    if (history.length > this.maxHistorySize) {
      history.splice(0, history.length - this.maxHistorySize);
    }
  }

  logError(component: string, error: ValidationError): void {
    const timestamp = new Date().toISOString();
    console.error(`[VALIDATION ERROR] ${timestamp} [${component}] [${error.severity}] ${error.code}: ${error.message}`);
    
    if (error.details) {
      console.error(`[VALIDATION ERROR] ${timestamp} [${component}] Details:`, error.details);
    }
  }

  logWarning(component: string, warning: ValidationWarning): void {
    const timestamp = new Date().toISOString();
    console.warn(`[VALIDATION WARNING] ${timestamp} [${component}] ${warning.code}: ${warning.message}`);
    
    if (warning.details) {
      console.warn(`[VALIDATION WARNING] ${timestamp} [${component}] Details:`, warning.details);
    }
  }

  logTrace(trace: CalculationTrace): void {
    const timestamp = new Date().toISOString();
    console.log(`[CALCULATION TRACE] ${timestamp} Trace ID: ${trace.traceId}`);
    console.log(`[CALCULATION TRACE] ${timestamp} Game: ${trace.gameId || 'N/A'}, Teams: ${trace.homeTeamId} vs ${trace.awayTeamId}`);
    console.log(`[CALCULATION TRACE] ${timestamp} Steps: ${trace.steps.length}, Valid Steps: ${trace.validationResults.filter(r => r.isValid).length}`);
    
    trace.steps.forEach((step, index) => {
      const validation = trace.validationResults[index];
      const status = validation?.isValid ? 'VALID' : 'INVALID';
      console.log(`[CALCULATION TRACE] ${timestamp} Step ${step.stepNumber}: ${step.stepType} - ${status}`);
      
      if (validation && !validation.isValid) {
        validation.errors.forEach(error => {
          console.log(`[CALCULATION TRACE] ${timestamp} Step ${step.stepNumber} ERROR: ${error.message}`);
        });
      }
    });
  }

  getValidationHistory(component: string, limit?: number): ValidationResult[] {
    const history = this.validationHistory.get(component) || [];
    if (limit && limit > 0) {
      return history.slice(-limit);
    }
    return [...history];
  }

  clearHistory(component?: string): void {
    if (component) {
      this.validationHistory.delete(component);
    } else {
      this.validationHistory.clear();
    }
  }
}

// =============================================================================
// ERROR HANDLER IMPLEMENTATION
// =============================================================================

export class ErrorHandlerImpl implements ErrorHandler {
  private logger: ValidationLogger;

  constructor(logger: ValidationLogger) {
    this.logger = logger;
  }

  handleValidationError(error: ValidationError): void {
    this.logger.logError(error.component, error);
    
    // Handle critical errors
    if (error.severity === 'critical') {
      console.error(`[CRITICAL VALIDATION ERROR] Component: ${error.component}, Code: ${error.code}`);
      console.error(`[CRITICAL VALIDATION ERROR] Message: ${error.message}`);
      
      // In a production system, this might trigger alerts, notifications, etc.
      // For now, we'll just log it prominently
    }
  }

  handleSystemError(error: Error, context: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    console.error(`[SYSTEM ERROR] ${timestamp} ${error.name}: ${error.message}`);
    console.error(`[SYSTEM ERROR] ${timestamp} Context:`, context);
    console.error(`[SYSTEM ERROR] ${timestamp} Stack:`, error.stack);
    
    // Create a validation error for system errors
    const validationError = this.createValidationError(
      'SYSTEM_ERROR',
      `System error: ${error.message}`,
      context.component || 'unknown',
      'critical'
    );
    
    validationError.details = {
      originalError: error.name,
      stack: error.stack,
      context
    };
    
    this.handleValidationError(validationError);
  }

  createValidationError(
    code: string, 
    message: string, 
    component: string, 
    severity: ValidationError['severity'] = 'medium'
  ): ValidationError {
    return {
      code,
      message,
      severity,
      component,
      details: {}
    };
  }

  createValidationWarning(code: string, message: string, component: string): ValidationWarning {
    return {
      code,
      message,
      component,
      details: {}
    };
  }
}

// =============================================================================
// BASE VALIDATOR CLASS
// =============================================================================

export abstract class BaseValidator {
  protected logger: ValidationLogger;
  protected errorHandler: ErrorHandler;
  protected config: ValidationConfig;
  protected component: ValidationComponent;

  constructor(
    component: ValidationComponent,
    logger: ValidationLogger,
    errorHandler: ErrorHandler,
    config: ValidationConfig
  ) {
    this.component = component;
    this.logger = logger;
    this.errorHandler = errorHandler;
    this.config = config;
  }

  /**
   * Creates a base validation result with common fields
   */
  protected createBaseResult(isValid: boolean, score: number): ValidationResult {
    return {
      isValid,
      score: Math.max(0, Math.min(100, score)),
      errors: [],
      warnings: [],
      recommendations: [],
      timestamp: new Date(),
      metadata: {
        component: this.component,
        version: '1.0.0'
      }
    };
  }

  /**
   * Adds an error to a validation result
   */
  protected addError(
    result: ValidationResult, 
    code: string, 
    message: string, 
    severity: ValidationError['severity'] = 'medium',
    details?: Record<string, any>
  ): void {
    const error = this.errorHandler.createValidationError(code, message, this.component, severity);
    if (details) {
      error.details = details;
    }
    
    result.errors.push(error);
    result.isValid = false;
    
    // Adjust score based on error severity
    const scoreReduction = this.getScoreReduction(severity);
    result.score = Math.max(0, result.score - scoreReduction);
  }

  /**
   * Adds a warning to a validation result
   */
  protected addWarning(
    result: ValidationResult, 
    code: string, 
    message: string, 
    details?: Record<string, any>
  ): void {
    const warning = this.errorHandler.createValidationWarning(code, message, this.component);
    if (details) {
      warning.details = details;
    }
    
    result.warnings.push(warning);
    
    // Slightly reduce score for warnings
    result.score = Math.max(0, result.score - 2);
  }

  /**
   * Adds a recommendation to a validation result
   */
  protected addRecommendation(result: ValidationResult, recommendation: string): void {
    result.recommendations.push(recommendation);
  }

  /**
   * Gets score reduction based on error severity
   */
  private getScoreReduction(severity: ValidationError['severity']): number {
    switch (severity) {
      case 'critical': return 50;
      case 'high': return 25;
      case 'medium': return 10;
      case 'low': return 5;
      default: return 10;
    }
  }

  /**
   * Validates that a number is within expected bounds
   */
  protected validateNumberBounds(
    value: number, 
    min: number, 
    max: number, 
    fieldName: string
  ): { isValid: boolean; message?: string } {
    if (isNaN(value) || !isFinite(value)) {
      return { isValid: false, message: `${fieldName} is not a valid number` };
    }
    
    if (value < min) {
      return { isValid: false, message: `${fieldName} (${value}) is below minimum (${min})` };
    }
    
    if (value > max) {
      return { isValid: false, message: `${fieldName} (${value}) is above maximum (${max})` };
    }
    
    return { isValid: true };
  }

  /**
   * Validates that required fields are present
   */
  protected validateRequiredFields(
    data: Record<string, any>, 
    requiredFields: string[]
  ): { isValid: boolean; missingFields: string[] } {
    const missingFields: string[] = [];
    
    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        missingFields.push(field);
      }
    }
    
    return {
      isValid: missingFields.length === 0,
      missingFields
    };
  }

  /**
   * Calculates a quality score based on various factors
   */
  protected calculateQualityScore(
    completeness: number, 
    accuracy: number, 
    consistency: number
  ): number {
    // Weighted average: completeness 30%, accuracy 50%, consistency 20%
    return Math.round(completeness * 0.3 + accuracy * 0.5 + consistency * 0.2);
  }

  /**
   * Logs the validation result
   */
  protected logResult(result: ValidationResult): void {
    this.logger.logValidation(this.component, result);
  }

  /**
   * Abstract method that subclasses must implement
   */
  abstract validate(...args: any[]): Promise<ValidationResult>;
}

// =============================================================================
// CALCULATION TRACER IMPLEMENTATION
// =============================================================================

export class CalculationTracer {
  private logger: ValidationLogger;
  private errorHandler: ErrorHandler;
  private activeTraces: Map<string, CalculationTrace> = new Map();

  constructor(logger: ValidationLogger, errorHandler: ErrorHandler) {
    this.logger = logger;
    this.errorHandler = errorHandler;
  }

  /**
   * Starts a new calculation trace
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
      metadata: {}
    };
    
    this.activeTraces.set(traceId, trace);
    
    console.log(`[CALCULATION TRACER] Started trace ${traceId} for teams ${homeTeamId} vs ${awayTeamId}`);
    
    return traceId;
  }

  /**
   * Adds a step to an active trace
   */
  addStep(
    traceId: string,
    stepType: CalculationTrace['steps'][0]['stepType'],
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
    
    const step: CalculationTrace['steps'][0] = {
      stepNumber,
      stepType,
      description,
      inputs,
      calculation,
      output,
      isValid: true, // Will be validated separately
      executionTime: 0,
      metadata: {}
    };

    trace.steps.push(step);
    
    // Calculate execution time (this is a simplified version)
    step.executionTime = Date.now() - startTime;
    
    console.log(`[CALCULATION TRACER] Added step ${stepNumber} to trace ${traceId}: ${description}`);
    
    return stepNumber;
  }

  /**
   * Validates a step in the trace
   */
  validateStep(
    traceId: string, 
    stepNumber: number, 
    isValid: boolean, 
    errors: ValidationError[] = [], 
    warnings: ValidationWarning[] = []
  ): void {
    const trace = this.activeTraces.get(traceId);
    if (!trace) {
      throw new Error(`No active trace found with ID: ${traceId}`);
    }

    const step = trace.steps.find(s => s.stepNumber === stepNumber);
    if (!step) {
      throw new Error(`No step found with number ${stepNumber} in trace ${traceId}`);
    }

    step.isValid = isValid;

    const validationResult = {
      stepNumber,
      isValid,
      errors,
      warnings,
      mathematicallyCorrect: isValid && errors.length === 0,
      withinBounds: isValid,
      details: {}
    };

    trace.validationResults.push(validationResult);
    
    if (!isValid) {
      console.log(`[CALCULATION TRACER] Step ${stepNumber} in trace ${traceId} failed validation`);
      errors.forEach(error => {
        console.log(`[CALCULATION TRACER] Step ${stepNumber} error: ${error.message}`);
      });
    }
  }

  /**
   * Completes a trace and returns the final result
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
   * Gets an active trace
   */
  getTrace(traceId: string): CalculationTrace | undefined {
    return this.activeTraces.get(traceId);
  }

  /**
   * Generates a unique trace ID
   */
  private generateTraceId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `trace_${timestamp}_${random}`;
  }
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  thresholds: {
    dataQuality: {
      minimumScore: 70,
      completenessThreshold: 80,
      consistencyThreshold: 85
    },
    regression: {
      rSquaredThreshold: 0.2,
      pValueThreshold: 0.1,
      sampleSizeMinimum: 30
    },
    weights: {
      minimumWeight: 0.0,
      maximumWeight: 2.0,
      sumTolerance: 0.1
    },
    accuracy: {
      minimumAccuracy: 60,
      maximumBias: 0.1,
      calibrationThreshold: 0.8
    }
  },
  alerts: {
    enabledComponents: [
      'data_pipeline',
      'regression_analysis',
      'weight_calculation',
      'prediction_accuracy',
      'system_health_monitor'
    ],
    severityLevels: ['critical', 'warning', 'info'],
    notificationMethods: ['console', 'log']
  }
};

// =============================================================================
// SINGLETON INSTANCES
// =============================================================================

export const validationLogger = new ValidationLoggerImpl();
export const errorHandler = new ErrorHandlerImpl(validationLogger);
export const calculationTracer = new CalculationTracer(validationLogger, errorHandler);