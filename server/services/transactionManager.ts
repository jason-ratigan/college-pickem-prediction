// server/services/transactionManager.ts

import { db } from '../db.js';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import { ExtractTablesWithRelations } from 'drizzle-orm';
import * as schema from '@college-pickem/shared';

export type Transaction = PgTransaction<PostgresJsQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export interface TransactionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  rollbackReason?: string;
}

export class TransactionManager {
  
  /**
   * Executes a function within a database transaction
   */
  static async executeInTransaction<T>(
    operation: (tx: Transaction) => Promise<T>,
    operationName: string = 'Unknown Operation'
  ): Promise<TransactionResult<T>> {
    const startTime = Date.now();
    console.log(`[Transaction] Starting transaction for: ${operationName}`);
    
    try {
      const result = await db.transaction(async (tx) => {
        return await operation(tx);
      });
      
      const duration = Date.now() - startTime;
      console.log(`[Transaction] Successfully completed ${operationName} in ${duration}ms`);
      
      return {
        success: true,
        data: result
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error(`[Transaction] Failed ${operationName} after ${duration}ms:`, errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        rollbackReason: `Transaction rolled back due to error: ${errorMessage}`
      };
    }
  }
  
  /**
   * Executes multiple operations in a single transaction with savepoints
   */
  static async executeWithSavepoints<T>(
    operations: Array<{
      name: string;
      operation: (tx: Transaction) => Promise<any>;
      critical?: boolean; // If true, failure will rollback entire transaction
    }>,
    operationName: string = 'Batch Operations'
  ): Promise<TransactionResult<T[]>> {
    const startTime = Date.now();
    console.log(`[Transaction] Starting batch transaction for: ${operationName}`);
    
    try {
      const results = await db.transaction(async (tx) => {
        const operationResults: any[] = [];
        
        for (const { name, operation, critical = false } of operations) {
          try {
            console.log(`[Transaction] Executing operation: ${name}`);
            const result = await operation(tx);
            operationResults.push({ name, success: true, result });
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[Transaction] Operation ${name} failed:`, errorMessage);
            
            if (critical) {
              // Critical operation failed - rollback entire transaction
              throw new Error(`Critical operation ${name} failed: ${errorMessage}`);
            } else {
              // Non-critical operation failed - continue with others
              operationResults.push({ 
                name, 
                success: false, 
                error: errorMessage 
              });
            }
          }
        }
        
        return operationResults;
      });
      
      const duration = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      console.log(`[Transaction] Batch operation completed in ${duration}ms: ${successCount} successful, ${failureCount} failed`);
      
      return {
        success: true,
        data: results
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error(`[Transaction] Batch operation failed after ${duration}ms:`, errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        rollbackReason: `Batch transaction rolled back due to critical error: ${errorMessage}`
      };
    }
  }
  
  /**
   * Executes an operation with retry logic and transaction management
   */
  static async executeWithRetry<T>(
    operation: (tx: Transaction) => Promise<T>,
    operationName: string,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<TransactionResult<T>> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`[Transaction] Attempt ${attempt}/${maxRetries} for: ${operationName}`);
      
      const result = await this.executeInTransaction(operation, `${operationName} (Attempt ${attempt})`);
      
      if (result.success) {
        if (attempt > 1) {
          console.log(`[Transaction] ${operationName} succeeded on attempt ${attempt}`);
        }
        return result;
      }
      
      lastError = result.error;
      
      // Check if this is a retryable error
      const isRetryable = this.isRetryableError(result.error || '');
      
      if (!isRetryable || attempt === maxRetries) {
        console.error(`[Transaction] ${operationName} failed permanently after ${attempt} attempts`);
        return result;
      }
      
      // Wait before retrying with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.log(`[Transaction] Retrying ${operationName} in ${Math.round(delay)}ms...`);
      await this.delay(delay);
    }
    
    return {
      success: false,
      error: lastError,
      rollbackReason: `All ${maxRetries} attempts failed`
    };
  }
  
  /**
   * Determines if an error is retryable
   */
  private static isRetryableError(error: string): boolean {
    const retryablePatterns = [
      'connection',
      'timeout',
      'network',
      'temporary',
      'deadlock',
      'lock_timeout'
    ];
    
    const errorLower = error.toLowerCase();
    return retryablePatterns.some(pattern => errorLower.includes(pattern));
  }
  
  /**
   * Simple delay utility
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Validates transaction state and provides diagnostics
   */
  static async validateTransactionState(
    tx: Transaction,
    operationName: string
  ): Promise<{ isValid: boolean; diagnostics: string[] }> {
    const diagnostics: string[] = [];
    let isValid = true;
    
    try {
      // Test basic transaction functionality
      await tx.execute(sql`SELECT 1 as test`);
      diagnostics.push('Transaction connection is active');
      
    } catch (error) {
      isValid = false;
      diagnostics.push(`Transaction connection failed: ${error}`);
    }
    
    return { isValid, diagnostics };
  }
}

import { sql } from 'drizzle-orm';

// Re-export the sql template for convenience
export { sql };