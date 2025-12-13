/**
 * Kit 9: Scenario Atoms - Driver Domain (Phase 1 MVP)
 *
 * Atomic diagnostic tools for driver-related checks.
 * Returns standardized results with rule IDs and evidence paths.
 *
 * @author WawApp Development Team
 * @date 2025-12-13
 * @version 2.0 (Phase 1)
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { DiagnosticResultBuilder } from '../../utils/result-builder.js';
import { getAge } from '../../utils/time-helpers.js';
import type { StandardDiagnosticResult } from '../../types/standard-output.js';

// ===== DRIVER PROFILE AUDIT =====

const DriverProfileAuditInputSchema = z.object({
  driverId: z.string().min(1),
});

/**
 * Audit driver profile for completeness and verification.
 * Checks: name, phone, city, region, isVerified.
 *
 * Returns rule IDs:
 * - PROFILE_MISSING:name
 * - PROFILE_MISSING:phone
 * - PROFILE_MISSING:city
 * - PROFILE_MISSING:region
 * - DRIVER_NOT_VERIFIED
 * - DRIVER_NOT_FOUND
 */
export async function driverProfileAudit(
  params: unknown
): Promise<StandardDiagnosticResult> {
  const input = DriverProfileAuditInputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const builder = new DiagnosticResultBuilder('driver_profile_audit');
  const startTime = new Date();

  const driverDoc = await firestore.getDocument('drivers', input.driverId);
  const driverPath = `/drivers/${input.driverId}`;

  if (!driverDoc) {
    builder
      .setStatus('FAIL')
      .setSummary(`Driver profile not found: ${input.driverId}`)
      .addBlockingReason({
        ruleId: 'DRIVER_NOT_FOUND',
        severity: 'CRITICAL',
        message: `Driver document does not exist`,
        evidencePath: driverPath,
      })
      .addEvidence({
        key: 'driver.exists',
        expected: true,
        actual: false,
        sourcePath: driverPath,
        timestamp: new Date().toISOString(),
      })
      .linkFailure('FAIL-004', 'Driver document missing', 'HIGH');

    return builder.build(startTime);
  }

  // Check required fields
  const requiredFields = ['name', 'phone', 'city', 'region'];
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (!driverDoc[field] || driverDoc[field] === '') {
      missingFields.push(field);
      builder
        .addBlockingReason({
          ruleId: `PROFILE_MISSING:${field}`,
          severity: 'CRITICAL',
          message: `Driver profile missing required field: ${field}`,
          evidencePath: driverPath,
          field,
        })
        .addEvidence({
          key: `driver.${field}`,
          expected: '<non-empty string>',
          actual: driverDoc[field] || null,
          sourcePath: driverPath,
          field,
          timestamp: new Date().toISOString(),
        })
        .addSuggestedFix({
          fixId: `FIX_PROFILE_MISSING_${field.toUpperCase()}`,
          description: `Driver must complete onboarding and set ${field} field`,
          targetPath: driverPath,
          field,
          action: 'SET',
        });

      // Link to specific failure scenarios
      const failureMap: Record<string, string> = {
        name: 'FAIL-005',
        phone: 'FAIL-006',
        city: 'FAIL-007',
        region: 'FAIL-007',
      };
      builder.linkFailure(
        failureMap[field] || 'FAIL-005',
        `Profile incomplete: missing ${field}`,
        'HIGH'
      );
    }
  }

  // Check verification
  if (!driverDoc.isVerified) {
    builder
      .addBlockingReason({
        ruleId: 'DRIVER_NOT_VERIFIED',
        severity: 'CRITICAL',
        message: 'Driver is not verified by admin',
        evidencePath: driverPath,
        field: 'isVerified',
      })
      .addEvidence({
        key: 'driver.isVerified',
        expected: true,
        actual: driverDoc.isVerified || false,
        sourcePath: driverPath,
        field: 'isVerified',
        timestamp: new Date().toISOString(),
      })
      .addSuggestedFix({
        fixId: 'FIX_DRIVER_VERIFY',
        description: 'Admin must set isVerified=true after verification process',
        targetPath: driverPath,
        field: 'isVerified',
        value: true,
        action: 'SET',
      })
      .linkFailure('FAIL-003', 'Driver not verified', 'HIGH');
  }

  const status = builder['blockingReasons'].length === 0 ? 'PASS' : 'FAIL';
  const summary =
    status === 'PASS'
      ? `Driver profile complete and verified`
      : `Driver profile has ${builder['blockingReasons'].length} issue(s): ${missingFields.length > 0 ? 'missing fields [' + missingFields.join(', ') + ']' : ''}${!driverDoc.isVerified ? ' not verified' : ''}`;

  return builder.setStatus(status).setSummary(summary).build(startTime);
}

// ===== DRIVER LOCATION FRESHNESS =====

const DriverLocationFreshnessInputSchema = z.object({
  driverId: z.string().min(1),
  maxAgeMinutes: z.number().positive().default(5),
});

/**
 * Check driver location freshness and validity.
 * Adapter around existing wawapp_driver_location_status with rule IDs.
 *
 * Returns rule IDs:
 * - LOCATION_MISSING
 * - LOCATION_STALE
 * - LOCATION_INVALID_COORDS
 */
export async function driverLocationFreshness(
  params: unknown
): Promise<StandardDiagnosticResult> {
  const input = DriverLocationFreshnessInputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const builder = new DiagnosticResultBuilder('driver_location_freshness');
  const startTime = new Date();

  const locationPath = `/driver_locations/${input.driverId}`;
  const locationDoc = await firestore.getDocument(
    'driver_locations',
    input.driverId
  );

  if (!locationDoc) {
    builder
      .setStatus('FAIL')
      .setSummary('Driver location document not found')
      .addBlockingReason({
        ruleId: 'LOCATION_MISSING',
        severity: 'CRITICAL',
        message: 'Driver location data not found',
        evidencePath: locationPath,
      })
      .addEvidence({
        key: 'location.exists',
        expected: true,
        actual: false,
        sourcePath: locationPath,
        timestamp: new Date().toISOString(),
      })
      .addSuggestedFix({
        fixId: 'FIX_LOCATION_ENABLE',
        description:
          'Driver must enable location permissions and open app to create location document',
        targetPath: locationPath,
        action: 'MANUAL',
      })
      .linkFailure('FAIL-009', 'Location data missing', 'HIGH');

    return builder.build(startTime);
  }

  // Check coordinate validity
  const lat = locationDoc.latitude || locationDoc.lat;
  const lng = locationDoc.longitude || locationDoc.lng;

  const hasValidCoords =
    lat !== null &&
    lat !== undefined &&
    lng !== null &&
    lng !== undefined &&
    lat !== 0 &&
    lng !== 0 &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  if (!hasValidCoords) {
    builder
      .setStatus('FAIL')
      .setSummary('Driver location has invalid coordinates')
      .addBlockingReason({
        ruleId: 'LOCATION_INVALID_COORDS',
        severity: 'CRITICAL',
        message: `Invalid GPS coordinates: (${lat}, ${lng})`,
        evidencePath: locationPath,
      })
      .addEvidence({
        key: 'location.coordinates',
        expected: 'valid lat/lng within bounds',
        actual: { lat, lng },
        sourcePath: locationPath,
        timestamp: new Date().toISOString(),
      })
      .addSuggestedFix({
        fixId: 'FIX_GPS_ENABLE',
        description: 'Driver must enable GPS and ensure device has location signal',
        action: 'MANUAL',
      })
      .linkFailure('FAIL-016', 'GPS coordinates invalid', 'HIGH');

    return builder.build(startTime);
  }

  // Check freshness
  const timestamp = locationDoc.timestamp || locationDoc.updatedAt || locationDoc.lastUpdate;
  let locationAge: string | undefined;
  let ageMinutes = 0;

  if (timestamp) {
    const timestampDate = firestore.timestampToDate(timestamp);
    if (timestampDate) {
      locationAge = getAge(timestampDate);
      ageMinutes = (Date.now() - timestampDate.getTime()) / (1000 * 60);
    }
  }

  const isFresh = ageMinutes < input.maxAgeMinutes;

  if (!isFresh) {
    builder
      .setStatus('FAIL')
      .setSummary(
        `Driver location stale (${Math.round(ageMinutes)} minutes old, threshold: ${input.maxAgeMinutes} minutes)`
      )
      .addBlockingReason({
        ruleId: 'LOCATION_STALE',
        severity: 'CRITICAL',
        message: `Location stale: ${locationAge} (${Math.round(ageMinutes)} minutes > ${input.maxAgeMinutes} minutes threshold)`,
        evidencePath: locationPath,
      })
      .addEvidence({
        key: 'location.age',
        expected: `< ${input.maxAgeMinutes} minutes`,
        actual: `${Math.round(ageMinutes)} minutes (${locationAge})`,
        sourcePath: locationPath,
        field: 'timestamp',
        timestamp: new Date().toISOString(),
      })
      .addSuggestedFix({
        fixId: 'FIX_LOCATION_REFRESH',
        description: 'Driver should restart app or toggle airplane mode to refresh location',
        action: 'MANUAL',
      })
      .linkFailure('FAIL-008', 'Location data stale', 'HIGH');

    return builder.build(startTime);
  }

  builder
    .setStatus('PASS')
    .setSummary(
      `Driver location valid and fresh (${locationAge}, coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)})`
    );

  return builder.build(startTime);
}

// ===== DRIVER ONLINE STATE =====

const DriverOnlineStateInputSchema = z.object({
  driverId: z.string().min(1),
});

/**
 * Check if driver is currently online.
 *
 * Returns rule IDs:
 * - DRIVER_OFFLINE
 * - DRIVER_NOT_FOUND
 */
export async function driverOnlineState(
  params: unknown
): Promise<StandardDiagnosticResult> {
  const input = DriverOnlineStateInputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const builder = new DiagnosticResultBuilder('driver_online_state');
  const startTime = new Date();

  const driverPath = `/drivers/${input.driverId}`;
  const driverDoc = await firestore.getDocument('drivers', input.driverId);

  if (!driverDoc) {
    builder
      .setStatus('FAIL')
      .setSummary('Driver not found')
      .addBlockingReason({
        ruleId: 'DRIVER_NOT_FOUND',
        severity: 'CRITICAL',
        message: 'Driver document does not exist',
        evidencePath: driverPath,
      })
      .linkFailure('FAIL-004', 'Driver document missing', 'HIGH');

    return builder.build(startTime);
  }

  const isOnline = driverDoc.isOnline === true;

  if (!isOnline) {
    builder
      .setStatus('FAIL')
      .setSummary('Driver is offline')
      .addBlockingReason({
        ruleId: 'DRIVER_OFFLINE',
        severity: 'CRITICAL',
        message: 'Driver isOnline=false. Cannot receive orders.',
        evidencePath: driverPath,
        field: 'isOnline',
      })
      .addEvidence({
        key: 'driver.isOnline',
        expected: true,
        actual: driverDoc.isOnline || false,
        sourcePath: driverPath,
        field: 'isOnline',
        timestamp: new Date().toISOString(),
      })
      .addSuggestedFix({
        fixId: 'FIX_DRIVER_GO_ONLINE',
        description: 'Driver must open app and toggle to online status',
        action: 'MANUAL',
      })
      .linkFailure('FAIL-012', 'Driver offline', 'HIGH');

    return builder.build(startTime);
  }

  builder
    .setStatus('PASS')
    .setSummary('Driver is online and can receive orders');

  return builder.build(startTime);
}
