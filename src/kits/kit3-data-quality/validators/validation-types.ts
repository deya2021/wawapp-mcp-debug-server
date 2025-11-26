/**
 * Shared validation types for data audit
 */

export interface ValidationError {
  field: string;
  issue: string;
  severity: 'critical' | 'warning';
  expectedType?: string;
  actualType?: string;
  actualValue?: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface DocumentValidationResult {
  docId: string;
  collectionName: string;
  isValid: boolean;
  errors: ValidationError[];
}

export interface AuditSummary {
  totalScanned: number;
  validCount: number;
  invalidCount: number;
  problematicDocs: DocumentValidationResult[];
  collectionName: string;
  filters: Record<string, any>;
}

/**
 * Helper to create validation error
 */
export function createValidationError(
  field: string,
  issue: string,
  severity: 'critical' | 'warning' = 'critical',
  options?: {
    expectedType?: string;
    actualType?: string;
    actualValue?: any;
  }
): ValidationError {
  return {
    field,
    issue,
    severity,
    ...options,
  };
}
