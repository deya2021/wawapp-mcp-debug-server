/**
 * Kit 10: Advanced Diagnostics
 * Tool: wawapp_race_condition_detector
 *
 * Detect race conditions: concurrent writes, duplicate assignments,
 * conflicting status transitions, and Firestore transaction failures.
 *
 * @author WawApp Development Team
 * @date 2025-01-27
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { CloudLoggingClient } from '../../data-access/cloud-logging-client.js';
import { MAX_TIME_RANGE_DAYS } from '../../config/constants.js';

const MAX_TIME_RANGE_MINUTES = MAX_TIME_RANGE_DAYS * 24 * 60;

const InputSchema = z.object({
  timeRangeMinutes: z
    .number()
    .min(1)
    .max(MAX_TIME_RANGE_MINUTES)
    .default(60)
    .describe('How far back to look (default: 60)'),
  orderId: z
    .string()
    .optional()
    .describe('Focus on specific order'),
  driverId: z
    .string()
    .optional()
    .describe('Focus on specific driver'),
  sensitivityMs: z
    .number()
    .min(100)
    .max(30000)
    .default(2000)
    .describe('Time window to consider "concurrent" (default: 2000ms)'),
  includeResolved: z
    .boolean()
    .default(false)
    .describe('Include race conditions that self-resolved'),
});

type Severity = 'CRITICAL' | 'WARNING' | 'INFO';
type RaceType =
  | 'DUPLICATE_DRIVER_ASSIGNMENT'
  | 'CONCURRENT_STATUS_TRANSITION'
  | 'TRANSACTION_FAILURE'
  | 'SIMULTANEOUS_CANCEL_ACCEPT'
  | 'DUAL_LOCATION_UPDATE';

interface RaceCondition {
  id: string;
  severity: Severity;
  type: RaceType;
  orderId?: string;
  driverId?: string;
  description: string;
  timestamp: string;
  timeDeltaMs: number;
  evidence: Record<string, unknown>;
  resolved: boolean;
  recommendation: string;
}

interface RaceConditionResult {
  summary: {
    totalRaceConditionsDetected: number;
    critical: number;
    warning: number;
    info: number;
    timeRangeMinutes: number;
    sensitivityMs: number;
  };
  raceConditions: RaceCondition[];
  patternAnalysis: {
    mostCommonType: string;
    mostAffectedOrderId: string;
    peakRaceConditionHour: string;
    affectedOrders: number;
    affectedDrivers: number;
  };
  codeRecommendations: Array<{
    issue: string;
    file: string;
    fix: string;
  }>;
  dataWarnings: string[];
  metadata: {
    analyzedAt: string;
    dataSource: string;
  };
}

let rcCounter = 0;
function nextId(): string {
  return `rc_${String(++rcCounter).padStart(3, '0')}`;
}

/**
 * A) Duplicate Driver Assignments
 * Orders that had driverId change to a different driver within sensitivityMs,
 * or have a driverAssignments array with multiple entries close together.
 */
async function detectDuplicateAssignments(
  firestore: FirestoreClient,
  orders: Array<Record<string, any>>,
  sensitivityMs: number
): Promise<RaceCondition[]> {
  const results: RaceCondition[] = [];

  for (const order of orders) {
    // Check driverAssignments array if it exists
    const assignments: Array<Record<string, any>> = order.driverAssignments || [];
    if (assignments.length >= 2) {
      for (let i = 1; i < assignments.length; i++) {
        const t1 = firestore.timestampToDate(assignments[i - 1].assignedAt || assignments[i - 1].timestamp);
        const t2 = firestore.timestampToDate(assignments[i].assignedAt || assignments[i].timestamp);
        if (!t1 || !t2) continue;

        const delta = Math.abs(t2.getTime() - t1.getTime());
        if (delta <= sensitivityMs) {
          const resolved = order.driverId === (assignments[assignments.length - 1].driverId || assignments[assignments.length - 1].id);
          results.push({
            id: nextId(),
            severity: 'CRITICAL',
            type: 'DUPLICATE_DRIVER_ASSIGNMENT',
            orderId: order.id,
            driverId: order.driverId,
            description: `Two drivers assigned within ${delta}ms: ${assignments[i - 1].driverId || 'unknown'} and ${assignments[i].driverId || 'unknown'}`,
            timestamp: t2.toISOString(),
            timeDeltaMs: delta,
            evidence: {
              assignment1: { driverId: assignments[i - 1].driverId, at: t1.toISOString() },
              assignment2: { driverId: assignments[i].driverId, at: t2.toISOString() },
            },
            resolved,
            recommendation: 'Wrap driver assignment in a Firestore transaction with status pre-check to prevent concurrent acceptance.',
          });
        }
      }
    }

    // Check statusHistory for rapid accepted transitions
    const history: Array<Record<string, any>> = order.statusHistory || [];
    const acceptedEntries = history.filter((h) => h.status === 'accepted' || h.toStatus === 'accepted');
    if (acceptedEntries.length >= 2) {
      for (let i = 1; i < acceptedEntries.length; i++) {
        const t1 = firestore.timestampToDate(acceptedEntries[i - 1].timestamp || acceptedEntries[i - 1].at);
        const t2 = firestore.timestampToDate(acceptedEntries[i].timestamp || acceptedEntries[i].at);
        if (!t1 || !t2) continue;

        const delta = Math.abs(t2.getTime() - t1.getTime());
        if (delta <= sensitivityMs) {
          results.push({
            id: nextId(),
            severity: 'CRITICAL',
            type: 'DUPLICATE_DRIVER_ASSIGNMENT',
            orderId: order.id,
            description: `Multiple "accepted" transitions within ${delta}ms`,
            timestamp: t2.toISOString(),
            timeDeltaMs: delta,
            evidence: {
              transition1: { at: t1.toISOString(), entry: acceptedEntries[i - 1] },
              transition2: { at: t2.toISOString(), entry: acceptedEntries[i] },
            },
            resolved: false,
            recommendation: 'Use Firestore transaction: read status → verify still "matching" → write "accepted" atomically.',
          });
        }
      }
    }
  }

  return results;
}

/**
 * B) Concurrent Status Transitions
 * Any two status changes within sensitivityMs on the same order.
 */
function detectConcurrentTransitions(
  firestore: FirestoreClient,
  orders: Array<Record<string, any>>,
  sensitivityMs: number
): RaceCondition[] {
  const results: RaceCondition[] = [];

  for (const order of orders) {
    const history: Array<Record<string, any>> = order.statusHistory || [];
    if (history.length < 2) continue;

    for (let i = 1; i < history.length; i++) {
      const t1 = firestore.timestampToDate(history[i - 1].timestamp || history[i - 1].at);
      const t2 = firestore.timestampToDate(history[i].timestamp || history[i].at);
      if (!t1 || !t2) continue;

      const delta = Math.abs(t2.getTime() - t1.getTime());
      if (delta > sensitivityMs) continue;

      const s1 = history[i - 1].status || history[i - 1].toStatus || 'unknown';
      const s2 = history[i].status || history[i].toStatus || 'unknown';

      // Skip if same status (idempotent write, not a race)
      if (s1 === s2) continue;

      const dangerousStatuses = ['accepted', 'completed', 'cancelled'];
      const isDangerous = dangerousStatuses.includes(s1) || dangerousStatuses.includes(s2);

      results.push({
        id: nextId(),
        severity: isDangerous ? 'CRITICAL' : 'WARNING',
        type: 'CONCURRENT_STATUS_TRANSITION',
        orderId: order.id,
        description: `Status changed from "${s1}" to "${s2}" within ${delta}ms`,
        timestamp: t2.toISOString(),
        timeDeltaMs: delta,
        evidence: {
          transition1: { status: s1, at: t1.toISOString() },
          transition2: { status: s2, at: t2.toISOString() },
          timeBetweenMs: delta,
        },
        resolved: false,
        recommendation: isDangerous
          ? 'Critical status transitions must use Firestore transactions with optimistic locking.'
          : 'Consider adding a debounce or queue for rapid status updates.',
      });
    }
  }

  return results;
}

/**
 * C) Firestore Transaction Failures from Cloud Logging
 */
async function detectTransactionFailures(
  startDate: Date,
  endDate: Date,
  limit: number
): Promise<{ conditions: RaceCondition[]; warnings: string[] }> {
  const conditions: RaceCondition[] = [];
  const warnings: string[] = [];

  try {
    const logging = CloudLoggingClient.getInstance();
    const filter =
      'resource.type="cloud_function" AND (textPayload:"ABORTED" OR textPayload:"contention" OR textPayload:"transaction" OR textPayload:"conflict")';

    const entries = await logging.queryLogs(filter, startDate, endDate, limit);

    for (const entry of entries) {
      const msg = typeof entry.message === 'string' ? entry.message : JSON.stringify(entry.message);
      const funcName = entry.resource?.labels?.function_name || 'unknown';

      // Extract document path if present
      const pathMatch = msg.match(/(?:document|path)[:\s]+["']?([/\w-]+)["']?/i);

      conditions.push({
        id: nextId(),
        severity: 'WARNING',
        type: 'TRANSACTION_FAILURE',
        description: `Firestore transaction failure in ${funcName}: ${msg.substring(0, 150)}`,
        timestamp: entry.timestamp,
        timeDeltaMs: 0,
        evidence: {
          functionName: funcName,
          logSeverity: entry.severity,
          documentPath: pathMatch?.[1] || 'unknown',
          rawMessage: msg.substring(0, 300),
        },
        resolved: false,
        recommendation: 'Review transaction retry logic. Ensure exponential backoff on ABORTED errors.',
      });
    }
  } catch {
    warnings.push('Cloud Logging query for transaction failures failed. This check was skipped.');
  }

  return { conditions, warnings };
}

/**
 * D) Client cancelled AND driver accepted within sensitivityMs
 */
function detectSimultaneousCancelAccept(
  firestore: FirestoreClient,
  orders: Array<Record<string, any>>,
  sensitivityMs: number
): RaceCondition[] {
  const results: RaceCondition[] = [];

  for (const order of orders) {
    const cancelledAt = firestore.timestampToDate(order.cancelledAt);
    const acceptedAt = firestore.timestampToDate(order.acceptedAt);
    if (!cancelledAt || !acceptedAt) continue;

    const delta = Math.abs(cancelledAt.getTime() - acceptedAt.getTime());
    if (delta > sensitivityMs) continue;

    const cancelledFirst = cancelledAt.getTime() < acceptedAt.getTime();

    results.push({
      id: nextId(),
      severity: 'CRITICAL',
      type: 'SIMULTANEOUS_CANCEL_ACCEPT',
      orderId: order.id,
      driverId: order.driverId,
      description: `Client ${cancelledFirst ? 'cancelled' : 'accepted'} and driver ${cancelledFirst ? 'accepted' : 'cancelled'} within ${delta}ms — potential ghost trip`,
      timestamp: (cancelledFirst ? acceptedAt : cancelledAt).toISOString(),
      timeDeltaMs: delta,
      evidence: {
        cancelledAt: cancelledAt.toISOString(),
        acceptedAt: acceptedAt.toISOString(),
        finalStatus: order.status,
        driverId: order.driverId,
      },
      resolved: order.status === 'cancelled' || order.status === 'cancelledByClient',
      recommendation:
        'Before accepting, re-read order status in a transaction. If cancelled, abort acceptance and notify driver.',
    });
  }

  return results;
}

/**
 * E) Location Update Conflicts — same driver updated from 2 sources within sensitivityMs
 * We detect this by checking if a driver has multiple location docs or rapid timestamp changes.
 */
async function detectDualLocationUpdates(
  firestore: FirestoreClient,
  startDate: Date,
  driverIds: string[],
  sensitivityMs: number
): Promise<RaceCondition[]> {
  const results: RaceCondition[] = [];

  // For each driver, check their location document for signs of dual-source updates
  for (const driverId of driverIds.slice(0, 50)) {
    try {
      const locDoc = await firestore.getDocument('driverLocations', driverId);
      if (!locDoc) continue;

      // Check if there's a lastUpdatedBy or source array indicating multiple sources
      const sources: Array<Record<string, any>> = locDoc.recentUpdates || locDoc.updateHistory || [];
      if (sources.length < 2) continue;

      for (let i = 1; i < sources.length; i++) {
        const t1 = firestore.timestampToDate(sources[i - 1].timestamp || sources[i - 1].at);
        const t2 = firestore.timestampToDate(sources[i].timestamp || sources[i].at);
        if (!t1 || !t2) continue;
        if (t1 < startDate) continue;

        const delta = Math.abs(t2.getTime() - t1.getTime());
        if (delta > sensitivityMs) continue;

        const src1 = sources[i - 1].source || sources[i - 1].deviceId || 'unknown';
        const src2 = sources[i].source || sources[i].deviceId || 'unknown';
        if (src1 === src2) continue;

        results.push({
          id: nextId(),
          severity: 'WARNING',
          type: 'DUAL_LOCATION_UPDATE',
          driverId,
          description: `Location updated from 2 sources within ${delta}ms: "${src1}" and "${src2}"`,
          timestamp: t2.toISOString(),
          timeDeltaMs: delta,
          evidence: {
            source1: { source: src1, at: t1.toISOString() },
            source2: { source: src2, at: t2.toISOString() },
          },
          resolved: false,
          recommendation:
            'Driver may be logged in on multiple devices. Enforce single-active-session policy.',
        });
      }
    } catch {
      // Skip individual driver failures
    }
  }

  return results;
}

function buildPatternAnalysis(conditions: RaceCondition[]): RaceConditionResult['patternAnalysis'] {
  if (conditions.length === 0) {
    return {
      mostCommonType: 'none',
      mostAffectedOrderId: 'none',
      peakRaceConditionHour: 'none',
      affectedOrders: 0,
      affectedDrivers: 0,
    };
  }

  // Most common type
  const typeCounts = new Map<string, number>();
  for (const c of conditions) {
    typeCounts.set(c.type, (typeCounts.get(c.type) || 0) + 1);
  }
  const mostCommonType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // Most affected order
  const orderCounts = new Map<string, number>();
  for (const c of conditions) {
    if (c.orderId) orderCounts.set(c.orderId, (orderCounts.get(c.orderId) || 0) + 1);
  }
  const mostAffectedOrderId =
    orderCounts.size > 0
      ? [...orderCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : 'none';

  // Peak hour
  const hourCounts = new Map<string, number>();
  for (const c of conditions) {
    const d = new Date(c.timestamp);
    const h = `${d.getUTCHours().toString().padStart(2, '0')}:00 UTC`;
    hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
  }
  const peakRaceConditionHour =
    hourCounts.size > 0
      ? [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : 'none';

  const affectedOrders = new Set(conditions.filter((c) => c.orderId).map((c) => c.orderId)).size;
  const affectedDrivers = new Set(conditions.filter((c) => c.driverId).map((c) => c.driverId)).size;

  return { mostCommonType, mostAffectedOrderId, peakRaceConditionHour, affectedOrders, affectedDrivers };
}

function buildCodeRecommendations(conditions: RaceCondition[]): RaceConditionResult['codeRecommendations'] {
  const recs: RaceConditionResult['codeRecommendations'] = [];
  const types = new Set(conditions.map((c) => c.type));

  if (types.has('DUPLICATE_DRIVER_ASSIGNMENT')) {
    recs.push({
      issue: 'Missing Firestore transaction in acceptOrder function',
      file: 'functions/src/orders/accept.ts (estimated)',
      fix: 'Wrap status check + update in runTransaction() to prevent duplicate acceptance.',
    });
  }
  if (types.has('CONCURRENT_STATUS_TRANSITION')) {
    recs.push({
      issue: 'Status updates not guarded by optimistic locking',
      file: 'functions/src/orders/updateStatus.ts (estimated)',
      fix: 'Add a version/sequence field and use transaction with version check before writing new status.',
    });
  }
  if (types.has('TRANSACTION_FAILURE')) {
    recs.push({
      issue: 'Transaction retry logic may be insufficient',
      file: 'functions/src/utils/firestore-helpers.ts (estimated)',
      fix: 'Implement exponential backoff with max 5 retries on ABORTED errors.',
    });
  }
  if (types.has('SIMULTANEOUS_CANCEL_ACCEPT')) {
    recs.push({
      issue: 'Cancel and accept operations not mutually exclusive',
      file: 'functions/src/orders/accept.ts + cancel.ts (estimated)',
      fix: 'Both operations must read current status inside a transaction before proceeding.',
    });
  }
  if (types.has('DUAL_LOCATION_UPDATE')) {
    recs.push({
      issue: 'No single-active-session enforcement',
      file: 'lib/src/services/auth_service.dart (estimated)',
      fix: 'On login, invalidate previous sessions. Store active sessionId in Firestore and validate on each location write.',
    });
  }

  return recs;
}

export async function raceConditionDetector(
  params: unknown
): Promise<RaceConditionResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  const now = new Date();
  const startDate = new Date(now.getTime() - input.timeRangeMinutes * 60 * 1000);
  const dataWarnings: string[] = [];

  // Reset counter per invocation
  rcCounter = 0;

  // Fetch orders in time range
  const filters: Array<{ field: string; operator: any; value: any }> = [];
  if (input.orderId) {
    filters.push({ field: '__name__', operator: '==', value: input.orderId });
  }
  if (input.driverId) {
    filters.push({ field: 'driverId', operator: '==', value: input.driverId });
  }

  let orders: Array<Record<string, any>>;
  if (input.orderId) {
    const doc = await firestore.getDocument('orders', input.orderId);
    orders = doc ? [doc] : [];
  } else {
    orders = await firestore.queryDocuments('orders', filters, {
      limit: 500,
      orderBy: { field: 'updatedAt', direction: 'desc' },
    });
  }

  // Filter to time range
  orders = orders.filter((o) => {
    const updated = firestore.timestampToDate(o.updatedAt || o.createdAt);
    return updated && updated >= startDate;
  });

  if (orders.length === 0 && !input.orderId) {
    dataWarnings.push('No orders found in the given time range.');
  }

  // Collect unique driver IDs for location check
  const driverIds = [...new Set(orders.map((o) => o.driverId).filter(Boolean))] as string[];
  if (input.driverId && !driverIds.includes(input.driverId)) {
    driverIds.push(input.driverId);
  }

  // Run all detectors in parallel
  const [
    duplicateAssignments,
    concurrentTransitions,
    transactionFailures,
    cancelAccept,
    dualLocation,
  ] = await Promise.all([
    detectDuplicateAssignments(firestore, orders, input.sensitivityMs),
    Promise.resolve(detectConcurrentTransitions(firestore, orders, input.sensitivityMs)),
    detectTransactionFailures(startDate, now, 100),
    Promise.resolve(detectSimultaneousCancelAccept(firestore, orders, input.sensitivityMs)),
    detectDualLocationUpdates(firestore, startDate, driverIds, input.sensitivityMs),
  ]);

  dataWarnings.push(...transactionFailures.warnings);

  // Combine all conditions
  let allConditions: RaceCondition[] = [
    ...duplicateAssignments,
    ...concurrentTransitions,
    ...transactionFailures.conditions,
    ...cancelAccept,
    ...dualLocation,
  ];

  // Filter out resolved if not requested
  if (!input.includeResolved) {
    allConditions = allConditions.filter((c) => !c.resolved);
  }

  // Sort by severity then timestamp
  const severityOrder: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  allConditions.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.timestamp.localeCompare(a.timestamp)
  );

  const critical = allConditions.filter((c) => c.severity === 'CRITICAL').length;
  const warning = allConditions.filter((c) => c.severity === 'WARNING').length;
  const info = allConditions.filter((c) => c.severity === 'INFO').length;

  return {
    summary: {
      totalRaceConditionsDetected: allConditions.length,
      critical,
      warning,
      info,
      timeRangeMinutes: input.timeRangeMinutes,
      sensitivityMs: input.sensitivityMs,
    },
    raceConditions: allConditions,
    patternAnalysis: buildPatternAnalysis(allConditions),
    codeRecommendations: buildCodeRecommendations(allConditions),
    dataWarnings,
    metadata: {
      analyzedAt: new Date().toISOString(),
      dataSource: 'firestore+cloudlogs',
    },
  };
}

export const raceConditionDetectorSchema = {
  name: 'wawapp_race_condition_detector',
  description: `Detect race conditions in the WawApp system.

Checks for:
- Duplicate driver assignments (two drivers accepted same order simultaneously)
- Concurrent status transitions (rapid conflicting status changes)
- Firestore transaction failures (ABORTED, contention errors in Cloud Logging)
- Simultaneous cancel+accept (client cancelled while driver accepted)
- Dual location updates (same driver updated from multiple devices)

Returns severity-ranked race conditions with evidence, pattern analysis,
and specific code fix recommendations.

Use cases:
- "Why was this order assigned to two drivers?"
- "Are there concurrent update bugs?"
- "Detect Firestore transaction contention"
- "Find ghost trips from cancel/accept races"

Example:
{
  "timeRangeMinutes": 60,
  "sensitivityMs": 2000,
  "orderId": "order_abc123"
}`,
  inputSchema: {
    type: 'object',
    properties: {
      timeRangeMinutes: {
        type: 'number',
        description: 'How far back to look in minutes (default: 60, max: 7 days)',
        default: 60,
      },
      orderId: {
        type: 'string',
        description: 'Focus on specific order (optional)',
      },
      driverId: {
        type: 'string',
        description: 'Focus on specific driver (optional)',
      },
      sensitivityMs: {
        type: 'number',
        description: 'Time window in ms to consider "concurrent" (default: 2000)',
        default: 2000,
      },
      includeResolved: {
        type: 'boolean',
        description: 'Include race conditions that self-resolved (default: false)',
        default: false,
      },
    },
  },
};
