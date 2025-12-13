/**
 * Kit 9: Scenario Atoms - Telemetry Domain (Phase 3)
 *
 * Atomic diagnostic tools for listener health and real-time telemetry.
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

// ===== FIRESTORE LISTENER HEALTH =====

const FirestoreListenerHealthInputSchema = z.object({
  driverId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  maxAgeMinutes: z.number().positive().optional().default(10),
});

/**
 * Check Firestore listener health (telemetry-aware).
 *
 * Detects:
 * - Listener disconnected (LISTENER_DISCONNECTED)
 * - Listener health inconclusive if no telemetry (LISTENER_HEALTH_INCONCLUSIVE)
 *
 * Returns rule IDs:
 * - LISTENER_DISCONNECTED (WARNING)
 * - LISTENER_HEALTH_INCONCLUSIVE (INFO)
 */
export async function firestoreListenerHealth(
  params: unknown
): Promise<StandardDiagnosticResult> {
  const input = FirestoreListenerHealthInputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const builder = new DiagnosticResultBuilder('firestore_listener_health');
  const startTime = new Date();

  // Validate input - need either driverId or sessionId
  if (!input.driverId && !input.sessionId) {
    throw new Error('Either driverId or sessionId must be provided');
  }

  // Best-effort approach: Check if listener_telemetry collection exists
  let telemetryExist = false;
  let listenerTelemetry: any[] = [];

  try {
    // Build query filters
    const filters: any[] = [];

    if (input.driverId) {
      filters.push({ field: 'driverId', operator: '==', value: input.driverId });
    }

    if (input.sessionId) {
      filters.push({ field: 'sessionId', operator: '==', value: input.sessionId });
    }

    // Time filter - recent telemetry only
    const cutoffTime = new Date(Date.now() - input.maxAgeMinutes * 60 * 1000);
    filters.push({ field: 'timestamp', operator: '>=', value: cutoffTime });

    // Query listener_telemetry collection (if it exists)
    const telemetry = await firestore.queryDocuments(
      'listener_telemetry',
      filters,
      {
        orderBy: { field: 'timestamp', direction: 'desc' },
        limit: 20,
      }
    );

    if (telemetry && telemetry.length > 0) {
      telemetryExist = true;
      listenerTelemetry = telemetry;
    }
  } catch (error: any) {
    // Collection doesn't exist or query failed
    telemetryExist = false;
  }

  if (!telemetryExist) {
    // No telemetry infrastructure - return INCONCLUSIVE with suggestion
    builder
      .setStatus('INCONCLUSIVE')
      .setSummary(
        'Cannot verify listener health: no telemetry infrastructure detected'
      )
      .addBlockingReason({
        ruleId: 'LISTENER_HEALTH_INCONCLUSIVE',
        severity: 'INFO',
        message: 'Listener health cannot be determined without telemetry data',
        evidencePath: '/listener_telemetry',
      })
      .addEvidence({
        key: 'listener_telemetry.collection',
        expected: 'collection exists with recent telemetry',
        actual: 'collection not found or empty',
        sourcePath: '/listener_telemetry',
        timestamp: new Date().toISOString(),
      })
      .addSuggestedFix({
        fixId: 'FIX_ADD_LISTENER_TELEMETRY',
        description: `Add listener state machine markers to app code:

1. In Flutter app, add listener state tracking:

   // State enum
   enum ListenerState { CONNECTING, ACTIVE, ERROR, RETRYING, DISCONNECTED }

   // Telemetry logging
   Future<void> _logListenerState(ListenerState state, String? error) async {
     await FirebaseFirestore.instance.collection('listener_telemetry').add({
       'driverId': currentDriverId,
       'sessionId': sessionId,
       'listenerType': 'orders_stream', // or 'location_updates'
       'state': state.name,
       'error': error,
       'timestamp': FieldValue.serverTimestamp(),
       'appVersion': appVersion,
       'platform': Platform.operatingSystem,
     });
   }

2. Log state transitions:
   - CONNECTING: When listener is created
   - ACTIVE: When first data received
   - ERROR: On listener error
   - RETRYING: When reconnecting after error
   - DISCONNECTED: When listener disposed

3. Query this collection for listener health diagnostics`,
        action: 'MANUAL',
      });

    return builder.build(startTime);
  }

  // Telemetry exists - analyze listener health
  const evidencePath = `/listener_telemetry (${listenerTelemetry.length} entries in last ${input.maxAgeMinutes} minutes)`;

  if (listenerTelemetry.length === 0) {
    builder
      .addBlockingReason({
        ruleId: 'LISTENER_DISCONNECTED',
        severity: 'WARNING',
        message: `No listener telemetry found in last ${input.maxAgeMinutes} minutes`,
        evidencePath,
      })
      .addEvidence({
        key: 'listener.recentActivity',
        expected: 'telemetry within last 10 minutes',
        actual: `no telemetry in last ${input.maxAgeMinutes} minutes`,
        sourcePath: evidencePath,
        timestamp: new Date().toISOString(),
      })
      .addSuggestedFix({
        fixId: 'FIX_VERIFY_LISTENER_ACTIVE',
        description: `Verify listener is active:
1. Check if driver app is running and logged in
2. Check app network connectivity
3. Review app logs for listener disposal/recreation
4. Verify Firestore permissions allow listener subscription`,
        action: 'MANUAL',
      });
  } else {
    // Analyze telemetry data
    const latestTelemetry = listenerTelemetry[0];
    const latestState = latestTelemetry.state as string;
    const latestTimestamp = firestore.timestampToDate(latestTelemetry.timestamp);

    // Count states
    const statesByType = listenerTelemetry.reduce((acc: any, t: any) => {
      acc[t.state] = (acc[t.state] || 0) + 1;
      return acc;
    }, {});

    // Check latest state
    if (latestState === 'DISCONNECTED' || latestState === 'ERROR') {
      builder
        .addBlockingReason({
          ruleId: 'LISTENER_DISCONNECTED',
          severity: 'WARNING',
          message: `Listener is in ${latestState} state (last updated: ${latestTimestamp?.toISOString() || 'Unknown'})`,
          evidencePath,
        })
        .addEvidence({
          key: 'listener.state',
          expected: 'ACTIVE',
          actual: `${latestState} (error: ${latestTelemetry.error || 'none'})`,
          sourcePath: evidencePath,
          timestamp: new Date().toISOString(),
        })
        .addSuggestedFix({
          fixId: 'FIX_RESTART_LISTENER',
          description: `Listener is ${latestState}. Recovery actions:
1. Ask driver to close and reopen the app
2. Check network connectivity
3. Review error message: ${latestTelemetry.error || 'No error details'}
4. Verify Firestore security rules allow driver access
5. Check if listener disposed due to app lifecycle`,
          action: 'MANUAL',
        });
    } else if (latestState === 'RETRYING') {
      builder
        .addBlockingReason({
          ruleId: 'LISTENER_DISCONNECTED',
          severity: 'WARNING',
          message: `Listener is retrying connection (${statesByType['RETRYING'] || 0} retry attempts)`,
          evidencePath,
        })
        .addEvidence({
          key: 'listener.state',
          expected: 'ACTIVE',
          actual: `RETRYING (${statesByType['RETRYING'] || 0} attempts)`,
          sourcePath: evidencePath,
          timestamp: new Date().toISOString(),
        })
        .addSuggestedFix({
          fixId: 'FIX_CHECK_NETWORK',
          description: `Listener is retrying. Check:
1. Network connectivity and stability
2. Firestore service status
3. App logs for connection errors
4. Consider exponential backoff if retries excessive`,
          action: 'MANUAL',
        });
    } else if (latestState === 'ACTIVE' || latestState === 'CONNECTING') {
      // Healthy state - add positive evidence
      builder.addEvidence({
        key: 'listener.state',
        expected: 'ACTIVE',
        actual: `${latestState} (last updated: ${latestTimestamp?.toISOString() || 'Unknown'})`,
        sourcePath: evidencePath,
        timestamp: new Date().toISOString(),
      });
    }

    // Add state distribution evidence
    builder.addEvidence({
      key: 'listener.stateDistribution',
      expected: 'mostly ACTIVE',
      actual: Object.entries(statesByType)
        .map(([state, count]) => `${state}: ${count}`)
        .join(', '),
      sourcePath: evidencePath,
      timestamp: new Date().toISOString(),
    });

    // Check error frequency
    const errorCount = (statesByType['ERROR'] || 0) + (statesByType['DISCONNECTED'] || 0);
    if (errorCount > listenerTelemetry.length * 0.3) {
      // More than 30% errors
      builder.addEvidence({
        key: 'listener.errorRate',
        expected: '< 10% errors',
        actual: `${Math.round((errorCount / listenerTelemetry.length) * 100)}% errors (${errorCount}/${listenerTelemetry.length})`,
        sourcePath: evidencePath,
        timestamp: new Date().toISOString(),
      });
    }
  }

  const hasIssues = builder['blockingReasons'].some(
    (r) => r.ruleId !== 'LISTENER_HEALTH_INCONCLUSIVE'
  );
  const status = hasIssues ? 'FAIL' : 'PASS';
  const summary = hasIssues
    ? `Listener health check found ${builder['blockingReasons'].length} issue(s)`
    : `Listener is healthy (${listenerTelemetry.length} telemetry entries in last ${input.maxAgeMinutes} minutes)`;

  return builder.setStatus(status).setSummary(summary).build(startTime);
}
