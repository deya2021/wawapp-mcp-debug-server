import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import type { DriverProfile, DriverLocation } from '../../types/firestore-models.js';
import { STALE_LOCATION_THRESHOLD_MINUTES } from '../../config/constants.js';
import { getAge } from '../../utils/time-helpers.js';

const InputSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
});

export async function driverEligibility(params: unknown) {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  const checks: any = {
    authenticated: { pass: true },
    profileExists: { pass: false },
    isVerified: { pass: false },
    profileComplete: { pass: false },
    isOnline: { pass: false },
    hasValidLocation: { pass: false },
  };

  // Fetch driver profile
  const driverDoc = await firestore.getDocument('drivers', input.driverId);

  if (!driverDoc) {
    return {
      driverId: input.driverId,
      eligible: false,
      checks,
      summary: 'Driver profile not found in /drivers collection',
    };
  }

  checks.profileExists = { pass: true };

  // Convert Firestore timestamps to Dates
  const driver: DriverProfile = {
    ...driverDoc,
    createdAt: firestore.timestampToDate(driverDoc.createdAt) || new Date(),
    updatedAt: firestore.timestampToDate(driverDoc.updatedAt) || new Date(),
  };

  // Check verification
  checks.isVerified = {
    pass: driver.isVerified === true,
    reason: driver.isVerified
      ? undefined
      : `isVerified=false in /drivers/${input.driverId}`,
  };

  // Check profile completeness
  const requiredFields = [
    'city',
    'region',
    'vehicleType',
    'vehiclePlate',
    'vehicleColor',
  ];
  const missingFields = requiredFields.filter(
    (field) => !driver[field as keyof DriverProfile] || driver[field as keyof DriverProfile] === ''
  );

  checks.profileComplete = {
    pass: missingFields.length === 0,
    reason:
      missingFields.length > 0
        ? `Missing required fields: ${missingFields.join(', ')}`
        : undefined,
    missing: missingFields.length > 0 ? missingFields : undefined,
  };

  // Check online status
  checks.isOnline = {
    pass: driver.isOnline === true,
    lastSeen: driver.updatedAt ? driver.updatedAt.toISOString() : undefined,
  };

  // Check location validity
  const locationDoc = await firestore.getDocument(
    'driverLocations',
    input.driverId
  );

  if (locationDoc) {
    const location: DriverLocation = {
      ...locationDoc,
      driverId: input.driverId,
      timestamp: firestore.timestampToDate(locationDoc.timestamp) || new Date(),
    };

    const ageMinutes =
      (Date.now() - location.timestamp.getTime()) / 60000;
    const isStale = ageMinutes > STALE_LOCATION_THRESHOLD_MINUTES;

    checks.hasValidLocation = {
      pass: !isStale,
      location: { lat: location.lat, lng: location.lng },
      age: getAge(location.timestamp),
    };

    if (isStale) {
      checks.hasValidLocation.reason = `Location is stale (${ageMinutes.toFixed(1)} minutes old, threshold is ${STALE_LOCATION_THRESHOLD_MINUTES} minutes)`;
    }
  } else {
    checks.hasValidLocation = {
      pass: false,
      reason: `No location found in /driver_locations/${input.driverId}`,
    };
  }

  // Determine eligibility
  const eligible = Object.values(checks).every((check: any) => check.pass);

  // Build summary
  const failures = Object.entries(checks)
    .filter(([_, check]: any) => !check.pass)
    .map(([name, check]: any) => {
      if (check.reason) return check.reason;
      return name;
    });

  const summary = eligible
    ? 'Driver is eligible to receive nearby orders'
    : `Driver cannot see orders due to: ${failures.join(', ')}`;

  return {
    driverId: input.driverId,
    eligible,
    checks,
    summary,
  };
}

export const driverEligibilitySchema = {
  name: 'wawapp_driver_eligibility',
  description:
    'Comprehensive check of driver eligibility for order matching: verification status, profile completeness, online status, location validity. Returns detailed pass/fail for each requirement.',
  inputSchema: {
    type: 'object',
    properties: {
      driverId: {
        type: 'string',
        description: 'Driver UID from Firebase Auth / /drivers collection',
      },
    },
    required: ['driverId'],
  },
};
