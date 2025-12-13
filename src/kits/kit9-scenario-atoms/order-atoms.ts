/**
 * Kit 9: Scenario Atoms - Order Domain (Phase 1 MVP)
 *
 * Atomic diagnostic tools for order-related checks and matching logic.
 * Returns standardized results with rule IDs and evidence paths.
 *
 * @author WawApp Development Team
 * @date 2025-12-13
 * @version 2.0 (Phase 1)
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { DiagnosticResultBuilder } from '../../utils/result-builder.js';
import { calculateDistance } from '../../utils/haversine.js';
import { NEARBY_RADIUS_KM } from '../../config/constants.js';
import type { StandardDiagnosticResult } from '../../types/standard-output.js';

// ===== ORDER STATE AUDIT =====

const OrderStateAuditInputSchema = z.object({
  orderId: z.string().min(1),
});

/**
 * Audit order state and validity.
 * Enhanced version of wawapp_order_trace with rule IDs.
 *
 * Returns rule IDs:
 * - ORDER_NOT_FOUND
 * - ORDER_NOT_IN_MATCHING_POOL
 * - ORDER_STATUS_INVALID
 */
export async function orderStateAudit(
  params: unknown
): Promise<StandardDiagnosticResult> {
  const input = OrderStateAuditInputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const builder = new DiagnosticResultBuilder('order_state_audit');
  const startTime = new Date();

  const orderPath = `/orders/${input.orderId}`;
  const orderDoc = await firestore.getDocument('orders', input.orderId);

  if (!orderDoc) {
    builder
      .setStatus('FAIL')
      .setSummary(`Order not found: ${input.orderId}`)
      .addBlockingReason({
        ruleId: 'ORDER_NOT_FOUND',
        severity: 'CRITICAL',
        message: 'Order does not exist',
        evidencePath: orderPath,
      })
      .addEvidence({
        key: 'order.exists',
        expected: true,
        actual: false,
        sourcePath: orderPath,
        timestamp: new Date().toISOString(),
      })
      .linkFailure('FAIL-010', 'Order not found', 'HIGH');

    return builder.build(startTime);
  }

  // Check valid status
  const validStatuses = ['matching', 'accepted', 'onRoute', 'completed', 'cancelled', 'expired'];
  const status = orderDoc.status;

  if (!status || !validStatuses.includes(status)) {
    builder
      .setStatus('FAIL')
      .setSummary(`Order has invalid status: ${status}`)
      .addBlockingReason({
        ruleId: 'ORDER_STATUS_INVALID',
        severity: 'CRITICAL',
        message: `Order status "${status}" is not a valid status`,
        evidencePath: orderPath,
        field: 'status',
      })
      .addEvidence({
        key: 'order.status',
        expected: `one of: ${validStatuses.join(', ')}`,
        actual: status,
        sourcePath: orderPath,
        field: 'status',
        timestamp: new Date().toISOString(),
      })
      .linkFailure('FAIL-011', 'Order status invalid', 'HIGH');

    return builder.build(startTime);
  }

  // Check if in matching pool
  if (status !== 'matching') {
    builder
      .setStatus('FAIL')
      .setSummary(`Order not in matching pool (status: ${status})`)
      .addBlockingReason({
        ruleId: 'ORDER_NOT_IN_MATCHING_POOL',
        severity: 'WARNING',
        message: `Order status is "${status}", not "matching". Only matching orders are visible to drivers.`,
        evidencePath: orderPath,
        field: 'status',
      })
      .addEvidence({
        key: 'order.status',
        expected: 'matching',
        actual: status,
        sourcePath: orderPath,
        field: 'status',
        timestamp: new Date().toISOString(),
      });

    return builder.build(startTime);
  }

  // Order is valid and in matching pool
  builder
    .setStatus('PASS')
    .setSummary(`Order is in matching pool and available to drivers`);

  return builder.build(startTime);
}

// ===== MATCHING RULE TRACE =====

const MatchingRuleTraceInputSchema = z.object({
  orderId: z.string().min(1),
  driverId: z.string().min(1),
  radiusKm: z.number().positive().default(NEARBY_RADIUS_KM),
});

/**
 * Trace matching rules to determine why order is/isn't visible to driver.
 * Combines order state, driver state, and distance checks.
 * This is the core diagnostic for order visibility incidents.
 *
 * Returns rule IDs:
 * - ORDER_OUTSIDE_RADIUS
 * - DISTANCE_CALCULATION_FAILED
 * (Plus all rule IDs from order_state_audit)
 */
export async function matchingRuleTrace(
  params: unknown
): Promise<StandardDiagnosticResult> {
  const input = MatchingRuleTraceInputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const builder = new DiagnosticResultBuilder('matching_rule_trace');
  const startTime = new Date();

  // Get order
  const orderPath = `/orders/${input.orderId}`;
  const orderDoc = await firestore.getDocument('orders', input.orderId);

  if (!orderDoc) {
    builder
      .setStatus('FAIL')
      .setSummary('Order not found')
      .addBlockingReason({
        ruleId: 'ORDER_NOT_FOUND',
        severity: 'CRITICAL',
        message: 'Order does not exist',
        evidencePath: orderPath,
      })
      .linkFailure('FAIL-010', 'Order not found', 'HIGH');

    return builder.build(startTime);
  }

  // Get driver location
  const locationPath = `/driver_locations/${input.driverId}`;
  const locationDoc = await firestore.getDocument(
    'driver_locations',
    input.driverId
  );

  if (!locationDoc) {
    builder
      .setStatus('FAIL')
      .setSummary('Cannot calculate distance: driver location missing')
      .addBlockingReason({
        ruleId: 'LOCATION_MISSING',
        severity: 'CRITICAL',
        message: 'Driver location data not found',
        evidencePath: locationPath,
      })
      .linkFailure('FAIL-009', 'Location data missing', 'HIGH');

    return builder.build(startTime);
  }

  // Calculate distance
  const driverLat = locationDoc.latitude || locationDoc.lat;
  const driverLng = locationDoc.longitude || locationDoc.lng;
  const orderLat = orderDoc.pickup?.lat || orderDoc.pickup?.latitude;
  const orderLng = orderDoc.pickup?.lng || orderDoc.pickup?.longitude;

  if (!driverLat || !driverLng || !orderLat || !orderLng) {
    builder
      .setStatus('FAIL')
      .setSummary('Cannot calculate distance: missing coordinates')
      .addBlockingReason({
        ruleId: 'DISTANCE_CALCULATION_FAILED',
        severity: 'CRITICAL',
        message: 'Missing coordinates for distance calculation',
        evidencePath: `${orderPath} or ${locationPath}`,
      })
      .addEvidence({
        key: 'coordinates',
        expected: 'valid lat/lng for both driver and order',
        actual: {
          driver: { lat: driverLat, lng: driverLng },
          order: { lat: orderLat, lng: orderLng },
        },
        sourcePath: `${orderPath}, ${locationPath}`,
        timestamp: new Date().toISOString(),
      });

    return builder.build(startTime);
  }

  const distanceKm = calculateDistance(driverLat, driverLng, orderLat, orderLng);

  // Check radius
  if (distanceKm > input.radiusKm) {
    builder
      .setStatus('FAIL')
      .setSummary(
        `Order outside driver radius: ${distanceKm.toFixed(2)}km > ${input.radiusKm}km`
      )
      .addBlockingReason({
        ruleId: 'ORDER_OUTSIDE_RADIUS',
        severity: 'WARNING',
        message: `Order is ${distanceKm.toFixed(2)}km away, outside ${input.radiusKm}km radius`,
        evidencePath: orderPath,
      })
      .addEvidence({
        key: 'distance',
        expected: `<= ${input.radiusKm}km`,
        actual: `${distanceKm.toFixed(2)}km`,
        sourcePath: `${orderPath}, ${locationPath}`,
        timestamp: new Date().toISOString(),
      })
      .addSuggestedFix({
        fixId: 'FIX_DRIVER_MOVE_CLOSER',
        description: `Driver needs to move closer to order pickup location (currently ${distanceKm.toFixed(2)}km away)`,
        action: 'MANUAL',
      });

    return builder.build(startTime);
  }

  // Order is within radius
  builder
    .setStatus('PASS')
    .setSummary(
      `Order within driver radius: ${distanceKm.toFixed(2)}km <= ${input.radiusKm}km`
    );

  return builder.build(startTime);
}
