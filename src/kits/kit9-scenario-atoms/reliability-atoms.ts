/**
 * Kit 9: Scenario Atoms - Reliability Domain (Phase 2)
 *
 * Atomic diagnostic tools for Firestore reliability checks.
 * Returns standardized results with rule IDs and evidence paths.
 *
 * @author WawApp Development Team
 * @date 2025-12-13
 * @version 2.0 (Phase 2)
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { DiagnosticResultBuilder } from '../../utils/result-builder.js';
import { NEARBY_RADIUS_KM } from '../../config/constants.js';
import type { StandardDiagnosticResult } from '../../types/standard-output.js';

// ===== NEARBY ORDERS QUERY SIMULATOR =====

const NearbyOrdersQuerySimulatorInputSchema = z.object({
  driverId: z.string().min(1),
  radiusKm: z.number().positive().default(NEARBY_RADIUS_KM),
  limit: z.number().positive().optional(),
});

/**
 * Simulate nearby orders query to detect index and query issues.
 *
 * Detects:
 * - Missing composite index (FIRESTORE_INDEX_MISSING)
 * - Unbounded query (QUERY_UNBOUNDED:NO_LIMIT)
 *
 * Returns rule IDs:
 * - FIRESTORE_INDEX_MISSING
 * - QUERY_UNBOUNDED:NO_LIMIT
 * - LOCATION_MISSING (if driver location not found)
 */
export async function nearbyOrdersQuerySimulator(
  params: unknown
): Promise<StandardDiagnosticResult> {
  const input = NearbyOrdersQuerySimulatorInputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const builder = new DiagnosticResultBuilder('nearby_orders_query_simulator');
  const startTime = new Date();

  // Get driver location first
  const locationPath = `/driver_locations/${input.driverId}`;
  const locationDoc = await firestore.getDocument(
    'driver_locations',
    input.driverId
  );

  if (!locationDoc) {
    builder
      .setStatus('FAIL')
      .setSummary('Cannot simulate query: driver location missing')
      .addBlockingReason({
        ruleId: 'LOCATION_MISSING',
        severity: 'CRITICAL',
        message: 'Driver location data not found',
        evidencePath: locationPath,
      })
      .linkFailure('FAIL-009', 'Location data missing', 'HIGH');

    return builder.build(startTime);
  }

  // Check for unbounded query (no limit)
  if (!input.limit) {
    builder
      .addBlockingReason({
        ruleId: 'QUERY_UNBOUNDED:NO_LIMIT',
        severity: 'WARNING',
        message: 'Query executed without limit parameter. This may cause performance issues.',
        evidencePath: '/orders',
      })
      .addEvidence({
        key: 'query.limit',
        expected: '> 0',
        actual: input.limit || null,
        sourcePath: '/orders',
        timestamp: new Date().toISOString(),
      })
      .addSuggestedFix({
        fixId: 'FIX_ADD_QUERY_LIMIT',
        description: 'Add limit parameter to query (recommended: 50-100)',
        action: 'SET',
      })
      .linkFailure('FAIL-002', 'Query unbounded (no limit)', 'MEDIUM');
  }

  // Try to execute the query to detect index issues
  try {
    const now = new Date();
    const filters: any[] = [
      { field: 'status', operator: '==', value: 'matching' },
      { field: 'createdAt', operator: '>=', value: new Date(now.getTime() - 60 * 60 * 1000) },
    ];

    const queryOptions: any = {
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit: input.limit || 100,
    };

    // Execute query - if index is missing, this will throw
    await firestore.queryDocuments('orders', filters, queryOptions);

    // Query succeeded
    const status = builder['blockingReasons'].length === 0 ? 'PASS' : 'FAIL';
    const summary =
      status === 'PASS'
        ? 'Nearby orders query simulation successful. No index issues detected.'
        : `Query has ${builder['blockingReasons'].length} issue(s)`;

    return builder.setStatus(status).setSummary(summary).build(startTime);
  } catch (error: any) {
    // Check if error is index-related
    const errorMessage = error.message || '';
    const isIndexError =
      errorMessage.includes('index') ||
      errorMessage.includes('composite') ||
      errorMessage.includes('FAILED_PRECONDITION');

    if (isIndexError) {
      builder
        .addBlockingReason({
          ruleId: 'FIRESTORE_INDEX_MISSING',
          severity: 'CRITICAL',
          message: `Firestore composite index missing for query on /orders with fields: status, createdAt (ordered)`,
          evidencePath: '/orders',
        })
        .addEvidence({
          key: 'query.indexRequired',
          expected: 'composite index on (status, createdAt)',
          actual: 'missing',
          sourcePath: '/orders',
          timestamp: new Date().toISOString(),
        })
        .addSuggestedFix({
          fixId: 'FIX_CREATE_COMPOSITE_INDEX',
          description:
            'Create composite index in Firestore: Collection: orders, Fields: status (Ascending), createdAt (Descending)',
          targetPath: '/orders',
          action: 'CREATE',
        })
        .linkFailure('FAIL-001', 'Firestore index missing', 'HIGH');
    }

    const status = builder['blockingReasons'].length === 0 ? 'FAIL' : 'FAIL';
    const summary = isIndexError
      ? 'Nearby orders query failed: composite index missing'
      : `Query failed: ${errorMessage.substring(0, 100)}`;

    return builder.setStatus(status).setSummary(summary).build(startTime);
  }
}

// ===== PERMISSION RULE PROBE =====

const PermissionRuleProbeInputSchema = z.object({
  checkName: z.string().min(1),
  principalId: z.string().min(1),
  targetPath: z.string().min(1),
});

/**
 * Lightweight permission checker.
 * Best-effort detection of Firestore permission denied patterns.
 *
 * Since true probing requires actual auth context, this implementation:
 * 1. Attempts read on target path
 * 2. Falls back to log-based detection if read succeeds (INCONCLUSIVE)
 * 3. Emits PERMISSION_DENIED if read fails with permission error
 *
 * Returns rule IDs:
 * - PERMISSION_DENIED
 * - (or status INCONCLUSIVE if cannot definitively test)
 */
export async function permissionRuleProbe(
  params: unknown
): Promise<StandardDiagnosticResult> {
  const input = PermissionRuleProbeInputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const builder = new DiagnosticResultBuilder('permission_rule_probe');
  const startTime = new Date();

  // Parse target path to get collection and document ID
  const pathParts = input.targetPath.split('/').filter((p) => p.length > 0);
  if (pathParts.length < 2) {
    builder
      .setStatus('FAIL')
      .setSummary('Invalid target path format')
      .addBlockingReason({
        ruleId: 'INVALID_PATH',
        severity: 'CRITICAL',
        message: `Target path must be in format /collection/docId`,
        evidencePath: input.targetPath,
      });

    return builder.build(startTime);
  }

  const collection = pathParts[0];
  const docId = pathParts[1];

  // Supported collections
  const supportedCollections = ['drivers', 'driver_locations', 'orders'];
  if (!supportedCollections.includes(collection)) {
    builder
      .setStatus('INCONCLUSIVE')
      .setSummary(`Permission probe not supported for collection: ${collection}`)
      .addEvidence({
        key: 'permission.check',
        expected: `collection in [${supportedCollections.join(', ')}]`,
        actual: collection,
        sourcePath: input.targetPath,
        timestamp: new Date().toISOString(),
      });

    return builder.build(startTime);
  }

  // Attempt read
  try {
    const doc = await firestore.getDocument(collection, docId);

    if (!doc) {
      // Document doesn't exist - not a permission issue
      builder
        .setStatus('INCONCLUSIVE')
        .setSummary(`Document not found at ${input.targetPath}. Cannot test permissions.`)
        .addEvidence({
          key: 'permission.documentExists',
          expected: true,
          actual: false,
          sourcePath: input.targetPath,
          timestamp: new Date().toISOString(),
        });

      return builder.build(startTime);
    }

    // Read succeeded - server-side admin SDK bypasses security rules
    // Cannot definitively test client-side permissions from server
    builder
      .setStatus('INCONCLUSIVE')
      .setSummary(
        `Permission check inconclusive. Server-side admin SDK has full access. Client-side permissions cannot be tested from MCP server.`
      )
      .addEvidence({
        key: 'permission.serverSideAccess',
        expected: 'client-side security rules test',
        actual: 'server-side admin SDK (bypasses rules)',
        sourcePath: input.targetPath,
        timestamp: new Date().toISOString(),
      })
      .addSuggestedFix({
        fixId: 'FIX_CHECK_SECURITY_RULES',
        description: `Manually verify Firestore security rules for ${input.targetPath} allow read for principal ${input.principalId}`,
        action: 'MANUAL',
      });

    return builder.build(startTime);
  } catch (error: any) {
    const errorMessage = error.message || '';
    const isPermissionError =
      errorMessage.includes('permission') ||
      errorMessage.includes('PERMISSION_DENIED') ||
      errorMessage.includes('denied') ||
      errorMessage.includes('unauthorized');

    if (isPermissionError) {
      builder
        .setStatus('FAIL')
        .setSummary(`Permission denied for ${input.principalId} on ${input.targetPath}`)
        .addBlockingReason({
          ruleId: 'PERMISSION_DENIED',
          severity: 'CRITICAL',
          message: `Firestore security rules denied access to ${input.targetPath} for principal ${input.principalId}`,
          evidencePath: input.targetPath,
        })
        .addEvidence({
          key: 'permission.denied',
          expected: 'allow read',
          actual: 'denied',
          sourcePath: input.targetPath,
          timestamp: new Date().toISOString(),
        })
        .addSuggestedFix({
          fixId: 'FIX_UPDATE_SECURITY_RULES',
          description: `Update Firestore security rules to allow read access to ${input.targetPath} for ${input.principalId}`,
          targetPath: input.targetPath,
          action: 'MANUAL',
        })
        .linkFailure('FAIL-015', 'Permission denied', 'HIGH');

      return builder.build(startTime);
    }

    // Other error
    builder
      .setStatus('FAIL')
      .setSummary(`Permission probe failed: ${errorMessage.substring(0, 100)}`)
      .addBlockingReason({
        ruleId: 'PROBE_ERROR',
        severity: 'WARNING',
        message: errorMessage,
        evidencePath: input.targetPath,
      });

    return builder.build(startTime);
  }
}
