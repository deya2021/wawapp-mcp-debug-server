/**
 * Kit 9: Scenario Atoms - Cloud Functions Domain (Phase 3)
 *
 * Atomic diagnostic tools for Cloud Function execution tracing.
 * Returns standardized results with rule IDs and evidence paths.
 *
 * @author WawApp Development Team
 * @date 2025-12-13
 * @version 3.0 (Phase 3)
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { DiagnosticResultBuilder } from '../../utils/result-builder.js';
import type { StandardDiagnosticResult } from '../../types/standard-output.js';

// ===== FUNCTIONS INVOCATION TRACE =====

const FunctionsInvocationTraceInputSchema = z.object({
  functionName: z.string().min(1),
  orderId: z.string().min(1).optional(),
  correlationId: z.string().min(1).optional(),
  lookbackMinutes: z.number().positive().optional().default(60),
});

/**
 * Best-effort Cloud Function invocation tracing.
 *
 * Detects:
 * - Function timeout (FUNCTION_TIMEOUT:<name>)
 * - Function error (FUNCTION_ERROR:<name>)
 * - No trace found (FUNCTION_TRACE_NOT_FOUND)
 *
 * Returns rule IDs:
 * - FUNCTION_TIMEOUT:<name> (CRITICAL)
 * - FUNCTION_ERROR:<name> (WARNING)
 * - FUNCTION_TRACE_NOT_FOUND (WARNING)
 */
export async function functionsInvocationTrace(
  params: unknown
): Promise<StandardDiagnosticResult> {
  const input = FunctionsInvocationTraceInputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const builder = new DiagnosticResultBuilder('functions_invocation_trace');
  const startTime = new Date();

  // Best-effort approach: Check if function_logs collection exists
  let logsExist = false;
  let functionLogs: any[] = [];

  try {
    // Build query filters
    const filters: any[] = [
      { field: 'functionName', operator: '==', value: input.functionName },
    ];

    if (input.orderId) {
      filters.push({ field: 'orderId', operator: '==', value: input.orderId });
    }

    if (input.correlationId) {
      filters.push({ field: 'correlationId', operator: '==', value: input.correlationId });
    }

    // Time filter
    const cutoffTime = new Date(Date.now() - input.lookbackMinutes * 60 * 1000);
    filters.push({ field: 'timestamp', operator: '>=', value: cutoffTime });

    // Query function_logs collection (if it exists)
    const logs = await firestore.queryDocuments(
      'function_logs',
      filters,
      {
        orderBy: { field: 'timestamp', direction: 'desc' },
        limit: 50,
      }
    );

    if (logs && logs.length > 0) {
      logsExist = true;
      functionLogs = logs;
    }
  } catch (error: any) {
    // Collection doesn't exist or query failed
    logsExist = false;
  }

  if (!logsExist) {
    // No logging infrastructure - return INCONCLUSIVE with suggestion
    builder
      .setStatus('INCONCLUSIVE')
      .setSummary(
        `Cannot trace function ${input.functionName}: no logging infrastructure detected`
      )
      .addEvidence({
        key: 'function_logs.collection',
        expected: 'collection exists with logs',
        actual: 'collection not found or empty',
        sourcePath: '/function_logs',
        timestamp: new Date().toISOString(),
      })
      .addSuggestedFix({
        fixId: 'FIX_ADD_FUNCTION_LOGGING',
        description: `Add minimal function execution logging to ${input.functionName}:

1. At function entry:
   const startTime = Date.now();
   const correlationId = context.eventId || uuid();

2. At function exit (success):
   await firestore.collection('function_logs').add({
     functionName: '${input.functionName}',
     orderId: orderId,
     correlationId: correlationId,
     status: 'success',
     durationMs: Date.now() - startTime,
     timestamp: admin.firestore.FieldValue.serverTimestamp()
   });

3. At function exit (error):
   await firestore.collection('function_logs').add({
     functionName: '${input.functionName}',
     orderId: orderId,
     correlationId: correlationId,
     status: 'error',
     error: error.message,
     durationMs: Date.now() - startTime,
     timestamp: admin.firestore.FieldValue.serverTimestamp()
   });

4. Query this collection for execution tracing`,
        action: 'MANUAL',
      })
      .addBlockingReason({
        ruleId: 'FUNCTION_TRACE_NOT_FOUND',
        severity: 'WARNING',
        message: `No execution trace found for function ${input.functionName} (no logging infrastructure)`,
        evidencePath: '/function_logs',
      })
      .linkFailure('FAIL-006', 'Function timeout or error', 'MEDIUM');

    return builder.build(startTime);
  }

  // Logs exist - analyze them
  const evidencePath = `/function_logs (${functionLogs.length} entries for ${input.functionName})`;

  if (functionLogs.length === 0) {
    builder
      .addBlockingReason({
        ruleId: 'FUNCTION_TRACE_NOT_FOUND',
        severity: 'WARNING',
        message: `No execution trace found for function ${input.functionName} in last ${input.lookbackMinutes} minutes`,
        evidencePath,
      })
      .addEvidence({
        key: 'function.invocations',
        expected: '> 0',
        actual: 0,
        sourcePath: evidencePath,
        timestamp: new Date().toISOString(),
      })
      .addSuggestedFix({
        fixId: 'FIX_VERIFY_FUNCTION_DEPLOYMENT',
        description: `Verify Cloud Function ${input.functionName} is deployed and triggering:
1. Check deployment: firebase functions:list
2. Check trigger configuration in functions/index.ts
3. Review Firebase Console > Functions for errors
4. Check Cloud Scheduler for scheduled functions`,
        action: 'MANUAL',
      })
      .linkFailure('FAIL-006', 'Function timeout or error', 'MEDIUM');
  } else {
    // Analyze logs for timeouts and errors
    const timeoutLogs = functionLogs.filter(
      (log) => log.status === 'timeout' || log.timedOut === true
    );

    const errorLogs = functionLogs.filter(
      (log) => log.status === 'error' || log.error
    );

    const successfulLogs = functionLogs.filter(
      (log) => log.status === 'success' || log.status === 'completed'
    );

    // Check for timeouts
    if (timeoutLogs.length > 0) {
      const ruleId = `FUNCTION_TIMEOUT:${input.functionName}`;
      builder
        .addBlockingReason({
          ruleId,
          severity: 'CRITICAL',
          message: `Function ${input.functionName} timed out ${timeoutLogs.length} time(s) in last ${input.lookbackMinutes} minutes`,
          evidencePath,
        })
        .addEvidence({
          key: 'function.timeouts',
          expected: '0 timeouts',
          actual: `${timeoutLogs.length} timeouts out of ${functionLogs.length} invocations`,
          sourcePath: evidencePath,
          timestamp: new Date().toISOString(),
        })
        .addSuggestedFix({
          fixId: 'FIX_INCREASE_FUNCTION_TIMEOUT',
          description: `Increase timeout for ${input.functionName}:
1. In functions/index.ts, set: { timeoutSeconds: 540, memory: '1GB' }
2. Review function logic for long-running operations
3. Consider breaking into smaller functions
4. Add progress logging to identify bottlenecks`,
          action: 'MANUAL',
        })
        .linkFailure('FAIL-006', 'Function timeout or error', 'HIGH');
    }

    // Check for errors
    if (errorLogs.length > 0) {
      const ruleId = `FUNCTION_ERROR:${input.functionName}`;
      const sampleErrors = errorLogs
        .slice(0, 3)
        .map((log) => log.error || 'Unknown error')
        .join('; ');

      builder
        .addBlockingReason({
          ruleId,
          severity: 'WARNING',
          message: `Function ${input.functionName} failed ${errorLogs.length} time(s) in last ${input.lookbackMinutes} minutes`,
          evidencePath,
        })
        .addEvidence({
          key: 'function.errors',
          expected: '0 errors',
          actual: `${errorLogs.length} errors out of ${functionLogs.length} invocations. Sample: ${sampleErrors}`,
          sourcePath: evidencePath,
          timestamp: new Date().toISOString(),
        })
        .addSuggestedFix({
          fixId: 'FIX_INVESTIGATE_FUNCTION_ERROR',
          description: `Investigate errors in ${input.functionName}:
1. Review error messages in function_logs collection
2. Check Cloud Function logs: firebase functions:log --only ${input.functionName}
3. Verify all dependencies are available
4. Add try-catch blocks with detailed error logging
5. Check Firestore security rules if accessing data`,
          action: 'MANUAL',
        })
        .linkFailure('FAIL-006', 'Function timeout or error', 'MEDIUM');
    }

    // Add overall statistics evidence
    builder.addEvidence({
      key: 'function.invocations',
      expected: 'successful executions',
      actual: `${successfulLogs.length} successful, ${errorLogs.length} errors, ${timeoutLogs.length} timeouts out of ${functionLogs.length} total`,
      sourcePath: evidencePath,
      timestamp: new Date().toISOString(),
    });

    // Add correlation ID if found
    if (input.correlationId && functionLogs.length > 0) {
      const correlatedLog = functionLogs.find(
        (log) => log.correlationId === input.correlationId
      );
      if (correlatedLog) {
        builder.addEvidence({
          key: 'function.correlationId',
          expected: input.correlationId,
          actual: `Found log entry with correlationId ${input.correlationId}`,
          sourcePath: evidencePath,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  const hasIssues = builder['blockingReasons'].length > 0;
  const status = hasIssues ? 'FAIL' : 'PASS';
  const summary = hasIssues
    ? `Function ${input.functionName} has ${builder['blockingReasons'].length} issue(s)`
    : `Function ${input.functionName} executed successfully (${functionLogs.length} invocation(s) traced)`;

  return builder.setStatus(status).setSummary(summary).build(startTime);
}
