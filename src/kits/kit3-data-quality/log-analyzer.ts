/**
 * Log Analyzer Tool
 * Analyzes Flutter/Dart logs and backend logs to diagnose issues
 */

import { z } from 'zod';

const InputSchema = z.object({
  logText: z
    .string()
    .min(1)
    .describe('Log text to analyze (Flutter logcat, backend logs, etc.)'),
});

interface LogDiagnosis {
  errorType: string;
  severity: 'critical' | 'warning' | 'info';
  location?: string;
  probableSource?: string;
  rootCause: string;
  suggestedFix: string;
  stackTrace?: string[];
}

/**
 * Main log analyzer function
 */
export async function logAnalyzer(params: unknown): Promise<any> {
  const input = InputSchema.parse(params);

  const diagnoses: LogDiagnosis[] = [];
  const lines = input.logText.split('\n');

  // Pattern matching for common errors
  analyzeNullCheckErrors(lines, diagnoses);
  analyzeTypeErrors(lines, diagnoses);
  analyzeBadStateErrors(lines, diagnoses);
  analyzeFirestoreErrors(lines, diagnoses);
  analyzeMapErrors(lines, diagnoses);
  analyzeAsyncErrors(lines, diagnoses);

  // Generate summary
  const summary = generateSummary(diagnoses);

  return {
    summary,
    totalIssuesFound: diagnoses.length,
    criticalIssues: diagnoses.filter((d) => d.severity === 'critical').length,
    warnings: diagnoses.filter((d) => d.severity === 'warning').length,
    diagnoses,
  };
}

/**
 * Analyze null check operator errors
 */
function analyzeNullCheckErrors(lines: string[], diagnoses: LogDiagnosis[]): void {
  const nullCheckPattern = /Null check operator used on a null value/i;
  const stackFramePattern = /^\s*#\d+\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (nullCheckPattern.test(line)) {
      // Extract stack trace
      const stackTrace: string[] = [];
      let location: string | undefined;
      let probableSource: string | undefined;

      for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
        const stackLine = lines[j];
        const match = stackLine.match(stackFramePattern);

        if (match) {
          stackTrace.push(stackLine.trim());

          // First frame is usually the most relevant
          if (!location) {
            location = `${match[2]}:${match[3]}`;
            probableSource = match[1].trim();
          }
        } else if (stackTrace.length > 0) {
          break; // End of stack trace
        }
      }

      diagnoses.push({
        errorType: 'Null Check Operator Error',
        severity: 'critical',
        location,
        probableSource,
        rootCause:
          'Attempted to use the ! operator (null assertion) on a value that was null. ' +
          'This commonly occurs when accessing Firestore fields that are not guaranteed to exist, ' +
          'such as createdAt, pickup.lat, or nested objects.',
        suggestedFix:
          '1. Add null checks before accessing the field (e.g., order.createdAt != null)\n' +
          '2. Use null-safe operators (?.) instead of assertions (!)\n' +
          '3. Provide default values for optional fields\n' +
          '4. Run wawapp_data_audit to find documents with missing fields',
        stackTrace: stackTrace.length > 0 ? stackTrace : undefined,
      });
    }
  }
}

/**
 * Analyze type mismatch errors
 */
function analyzeTypeErrors(lines: string[], diagnoses: LogDiagnosis[]): void {
  const typeErrorPattern =
    /type '([^']+)' is not a subtype of type '([^']+)'/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(typeErrorPattern);

    if (match) {
      const actualType = match[1];
      const expectedType = match[2];

      let rootCause = `Type mismatch: Expected ${expectedType} but got ${actualType}.`;
      let suggestedFix = 'Ensure data types match between Firestore and Flutter models.';

      // Specific diagnosis for Timestamp errors
      if (
        actualType === 'String' &&
        (expectedType.includes('Timestamp') || expectedType.includes('DateTime'))
      ) {
        rootCause =
          'A Firestore field that should be a Timestamp is stored as a String. ' +
          'This typically happens when using DateTime.now().toString() instead of ' +
          'FieldValue.serverTimestamp() or Timestamp.now().';
        suggestedFix =
          '1. Fix Firestore documents: Convert String timestamps to Firestore Timestamp type\n' +
          '2. In Flutter: Use FieldValue.serverTimestamp() when creating/updating documents\n' +
          '3. Add type validation before saving to Firestore\n' +
          '4. Run wawapp_data_audit to find all documents with this issue';
      }

      // Specific diagnosis for int/double errors
      if (
        (actualType === 'int' && expectedType === 'double') ||
        (actualType === 'double' && expectedType === 'int')
      ) {
        rootCause =
          'Numeric type mismatch between int and double. ' +
          'Firestore may return numbers as int or double depending on the value.';
        suggestedFix =
          '1. Use .toDouble() or .toInt() to explicitly convert\n' +
          '2. Declare numeric fields as num in Dart models to accept both types\n' +
          '3. Use type-safe parsing: (value as num).toDouble()';
      }

      diagnoses.push({
        errorType: 'Type Mismatch Error',
        severity: 'critical',
        rootCause,
        suggestedFix,
      });
    }
  }
}

/**
 * Analyze "Bad state" errors
 */
function analyzeBadStateErrors(lines: string[], diagnoses: LogDiagnosis[]): void {
  const badStatePattern = /Bad state:\s*(.+)/i;

  for (const line of lines) {
    const match = line.match(badStatePattern);

    if (match) {
      const message = match[1].trim();
      let rootCause = `Bad state error: ${message}`;
      let suggestedFix = 'Review the state management logic and ensure proper initialization.';

      if (message.toLowerCase().includes('field') && message.toLowerCase().includes('null')) {
        rootCause =
          'Attempted to access a field that is null. This often occurs when Firestore ' +
          'documents are missing required fields or when accessing nested fields without null checks.';
        suggestedFix =
          '1. Add null checks before accessing fields\n' +
          '2. Run wawapp_data_audit to identify documents with missing fields\n' +
          '3. Provide default values in your model constructors\n' +
          '4. Use null-safe operators (?.) when accessing nested fields';
      }

      diagnoses.push({
        errorType: 'Bad State Error',
        severity: 'critical',
        rootCause,
        suggestedFix,
      });
    }
  }
}

/**
 * Analyze Firestore-specific errors
 */
function analyzeFirestoreErrors(lines: string[], diagnoses: LogDiagnosis[]): void {
  const firestoreErrorPattern =
    /\[cloud_firestore\/([a-z-]+)\]\s*(.+)/i;
  const permissionDeniedPattern = /PERMISSION[_\s]DENIED/i;
  const notFoundPattern = /NOT[_\s]FOUND/i;

  for (const line of lines) {
    // Check for Firestore error codes
    const match = line.match(firestoreErrorPattern);
    if (match) {
      const errorCode = match[1];
      const errorMessage = match[2];

      diagnoses.push({
        errorType: `Firestore Error: ${errorCode}`,
        severity: 'critical',
        rootCause: errorMessage,
        suggestedFix: getFirestoreErrorFix(errorCode),
      });
    }

    // Check for permission denied
    if (permissionDeniedPattern.test(line)) {
      diagnoses.push({
        errorType: 'Firestore Permission Denied',
        severity: 'critical',
        rootCause:
          'Firestore security rules are blocking this operation. ' +
          'The user does not have permission to read/write this document or collection.',
        suggestedFix:
          '1. Review Firestore security rules in Firebase Console\n' +
          '2. Ensure user is authenticated if rules require authentication\n' +
          '3. Check that the user has the correct role/permissions\n' +
          '4. Verify document paths are correct',
      });
    }

    // Check for not found
    if (notFoundPattern.test(line) && line.toLowerCase().includes('firestore')) {
      diagnoses.push({
        errorType: 'Firestore Document Not Found',
        severity: 'warning',
        rootCause:
          'Attempted to access a Firestore document that does not exist. ' +
          'This may be expected behavior or indicate a broken reference.',
        suggestedFix:
          '1. Add null checks after fetching documents\n' +
          '2. Verify document IDs are correct\n' +
          '3. Handle missing documents gracefully in the UI\n' +
          '4. Check for broken references between collections',
      });
    }
  }
}

/**
 * Analyze map/list access errors
 */
function analyzeMapErrors(lines: string[], diagnoses: LogDiagnosis[]): void {
  const mapKeyPattern = /Invalid argument.*key.*not found/i;
  const indexErrorPattern = /RangeError.*Index out of range/i;

  for (const line of lines) {
    if (mapKeyPattern.test(line)) {
      diagnoses.push({
        errorType: 'Map Key Not Found',
        severity: 'warning',
        rootCause:
          'Attempted to access a map key that does not exist. ' +
          'This commonly occurs when Firestore documents have missing fields.',
        suggestedFix:
          '1. Use containsKey() to check if key exists before accessing\n' +
          '2. Use null-safe access: map["key"] ?? defaultValue\n' +
          '3. Run wawapp_data_audit to find documents with missing fields',
      });
    }

    if (indexErrorPattern.test(line)) {
      diagnoses.push({
        errorType: 'List Index Out of Range',
        severity: 'warning',
        rootCause:
          'Attempted to access a list index that does not exist. ' +
          'The list may be empty or shorter than expected.',
        suggestedFix:
          '1. Check list length before accessing: if (list.length > index)\n' +
          '2. Use .isEmpty or .isNotEmpty checks\n' +
          '3. Handle empty lists gracefully in the UI',
      });
    }
  }
}

/**
 * Analyze async/await errors
 */
function analyzeAsyncErrors(lines: string[], diagnoses: LogDiagnosis[]): void {
  const futureErrorPattern = /Unhandled exception.*Future/i;

  for (const line of lines) {
    if (futureErrorPattern.test(line)) {
      diagnoses.push({
        errorType: 'Unhandled Future Error',
        severity: 'critical',
        rootCause:
          'An async operation threw an error that was not caught. ' +
          'This typically happens when Firestore operations fail without try-catch.',
        suggestedFix:
          '1. Wrap Firestore operations in try-catch blocks\n' +
          '2. Use .catchError() on Futures\n' +
          '3. Add error handling for network failures\n' +
          '4. Show user-friendly error messages in the UI',
      });
    }
  }
}

/**
 * Get specific fix for Firestore error codes
 */
function getFirestoreErrorFix(errorCode: string): string {
  const fixes: Record<string, string> = {
    'permission-denied':
      'Review Firestore security rules and ensure user has proper permissions',
    'not-found':
      'Verify document path and ID are correct, add null checks for missing documents',
    'already-exists':
      'Document already exists, use update() instead of set() or check before creating',
    'unavailable':
      'Firestore service is temporarily unavailable, implement retry logic with exponential backoff',
    'deadline-exceeded':
      'Operation timed out, check network connection or reduce query complexity',
    'invalid-argument':
      'Invalid query or document data, verify field types and query syntax',
  };

  return (
    fixes[errorCode] ||
    'Check Firebase documentation for this error code and verify your implementation'
  );
}

/**
 * Generate summary of findings
 */
function generateSummary(diagnoses: LogDiagnosis[]): string {
  if (diagnoses.length === 0) {
    return 'No recognizable errors found in the log. The log may be incomplete or contain different types of issues.';
  }

  const critical = diagnoses.filter((d) => d.severity === 'critical').length;
  const warnings = diagnoses.filter((d) => d.severity === 'warning').length;

  let summary = `Found ${diagnoses.length} issue(s): ${critical} critical, ${warnings} warning(s).\n\n`;

  // Group by error type
  const errorTypes = new Map<string, number>();
  for (const diagnosis of diagnoses) {
    errorTypes.set(
      diagnosis.errorType,
      (errorTypes.get(diagnosis.errorType) || 0) + 1
    );
  }

  summary += 'Error breakdown:\n';
  for (const [type, count] of errorTypes.entries()) {
    summary += `  • ${type}: ${count}\n`;
  }

  // Top recommendations
  const hasNullErrors = diagnoses.some((d) =>
    d.errorType.includes('Null Check')
  );
  const hasTypeErrors = diagnoses.some((d) => d.errorType.includes('Type'));

  if (hasNullErrors || hasTypeErrors) {
    summary +=
      '\n🔴 RECOMMENDED ACTION: Run wawapp_data_audit to identify and fix problematic Firestore documents.';
  }

  return summary;
}

/**
 * Schema for MCP tool registration
 */
export const logAnalyzerSchema = {
  name: 'wawapp_log_analyzer',
  description:
    'Analyze Flutter/Dart logs or backend logs to diagnose issues. Detects common error patterns (null checks, type mismatches, Firestore errors, bad state) and provides root cause analysis with actionable fixes. Paste logcat output, crash logs, or error messages for detailed diagnosis.',
  inputSchema: {
    type: 'object',
    properties: {
      logText: {
        type: 'string',
        description:
          'Log text to analyze (Flutter logcat, backend logs, crash reports, etc.)',
      },
    },
    required: ['logText'],
  },
};
