/**
 * Kit 4: Real-time Location Intelligence
 * Tool: wawapp_driver_location_status
 *
 * Check driver location health status.
 * Verifies location exists, is fresh, and has valid coordinates.
 *
 * @author WawApp Development Team
 * @date 2025-11-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { getAge } from '../../utils/time-helpers.js';

const InputSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
});

interface LocationCheck {
  criterion: string;
  pass: boolean;
  value: any;
  reason?: string;
}

interface DriverLocationStatusResult {
  summary: string;
  driverId: string;
  locationHealth: 'healthy' | 'warning' | 'critical';
  checks: {
    locationExists: LocationCheck;
    hasValidCoordinates: LocationCheck;
    isFresh: LocationCheck;
    isAccurate: LocationCheck;
  };
  location?: {
    lat: number;
    lng: number;
    accuracy?: number;
    altitude?: number;
    speed?: number;
    heading?: number;
    timestamp: string;
    age: string;
  };
  recommendations: string[];
}

export async function driverLocationStatus(
  params: unknown
): Promise<DriverLocationStatusResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  const checks: DriverLocationStatusResult['checks'] = {
    locationExists: {
      criterion: 'Location Document Exists',
      pass: false,
      value: null,
    },
    hasValidCoordinates: {
      criterion: 'Valid Coordinates',
      pass: false,
      value: null,
    },
    isFresh: {
      criterion: 'Location Freshness (<5 min)',
      pass: false,
      value: null,
    },
    isAccurate: {
      criterion: 'Accurate Location',
      pass: false,
      value: null,
    },
  };

  const recommendations: string[] = [];

  try {
    // Check 1: Location document exists
    const locationDoc = await firestore.getDocument(
      'driver_locations',
      input.driverId
    );

    checks.locationExists.pass = !!locationDoc;
    checks.locationExists.value = !!locationDoc;

    if (!locationDoc) {
      checks.locationExists.reason = `No document found in /driver_locations/${input.driverId}`;
      recommendations.push(
        '❌ Location document not found. Driver must enable location services and open the app.'
      );

      return {
        summary: `Location not found for driver ${input.driverId}. Driver must enable location services.`,
        driverId: input.driverId,
        locationHealth: 'critical',
        checks,
        recommendations,
      };
    }

    // Extract coordinates
    const lat = locationDoc.latitude || locationDoc.lat;
    const lng = locationDoc.longitude || locationDoc.lng;
    const timestamp = locationDoc.timestamp || locationDoc.updatedAt;
    const accuracy = locationDoc.accuracy;
    const altitude = locationDoc.altitude;
    const speed = locationDoc.speed;
    const heading = locationDoc.heading;

    // Check 2: Valid coordinates
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

    checks.hasValidCoordinates.pass = hasValidCoords;
    checks.hasValidCoordinates.value = { lat, lng };

    if (!hasValidCoords) {
      if (lat === 0 && lng === 0) {
        checks.hasValidCoordinates.reason = 'Coordinates are (0,0) - invalid';
        recommendations.push(
          '❌ Location is (0,0). GPS is not working. Driver must enable GPS and restart app.'
        );
      } else if (!lat || !lng) {
        checks.hasValidCoordinates.reason = 'Coordinates are null or undefined';
        recommendations.push(
          '❌ Coordinates are missing. Driver must enable location services.'
        );
      } else {
        checks.hasValidCoordinates.reason = 'Coordinates out of valid range';
        recommendations.push(
          '❌ Coordinates are out of valid range. Data integrity issue.'
        );
      }

      return {
        summary: `Invalid location coordinates for driver ${input.driverId}.`,
        driverId: input.driverId,
        locationHealth: 'critical',
        checks,
        recommendations,
      };
    }

    // Check 3: Location freshness
    let locationAge = 'unknown';
    let isFresh = false;
    let locationTimestamp: string | undefined;

    if (timestamp) {
      const timestampDate = firestore.timestampToDate(timestamp);
      if (timestampDate) {
        locationTimestamp = timestampDate.toISOString();
        locationAge = getAge(timestampDate);
        const ageMs = Date.now() - timestampDate.getTime();
        isFresh = ageMs < 5 * 60 * 1000; // Fresh if <5 minutes

        checks.isFresh.pass = isFresh;
        checks.isFresh.value = {
          age: locationAge,
          ageMs,
          threshold: '5 minutes',
        };

        if (!isFresh) {
          const ageMinutes = Math.floor(ageMs / (1000 * 60));

          if (ageMinutes > 60) {
            checks.isFresh.reason = `Location is stale (${locationAge} old)`;
            recommendations.push(
              `🚨 Location is very stale (${locationAge}). Driver must restart app and enable location services.`
            );
          } else if (ageMinutes > 10) {
            checks.isFresh.reason = `Location is stale (${locationAge} old)`;
            recommendations.push(
              `⚠️ Location is stale (${locationAge}). Driver should restart app.`
            );
          } else {
            checks.isFresh.reason = `Location is slightly stale (${locationAge} old)`;
            recommendations.push(
              `⚠️ Location is slightly stale (${locationAge}). Acceptable but not ideal.`
            );
          }
        } else {
          recommendations.push(`✅ Location is fresh (${locationAge} old).`);
        }
      } else {
        checks.isFresh.reason = 'Could not parse timestamp';
        recommendations.push('⚠️ Location timestamp cannot be parsed.');
      }
    } else {
      checks.isFresh.reason = 'No timestamp field found';
      recommendations.push(
        '⚠️ Location has no timestamp. Cannot determine freshness.'
      );
    }

    // Check 4: Location accuracy
    if (accuracy !== null && accuracy !== undefined) {
      // Good accuracy is < 50 meters
      const isAccurate = accuracy < 50;

      checks.isAccurate.pass = isAccurate;
      checks.isAccurate.value = `${accuracy}m`;

      if (!isAccurate) {
        if (accuracy > 200) {
          checks.isAccurate.reason = `Poor accuracy (${accuracy}m > 200m)`;
          recommendations.push(
            `⚠️ Location accuracy is poor (${accuracy}m). Driver may be indoors or GPS signal is weak.`
          );
        } else {
          checks.isAccurate.reason = `Moderate accuracy (${accuracy}m)`;
          recommendations.push(
            `ℹ️ Location accuracy is moderate (${accuracy}m). Acceptable but not ideal.`
          );
        }
      } else {
        recommendations.push(`✅ Location accuracy is good (${accuracy}m).`);
      }
    } else {
      checks.isAccurate.pass = true; // Assume accurate if no accuracy field
      checks.isAccurate.value = 'unknown';
      checks.isAccurate.reason = 'No accuracy field available';
    }

    // Determine overall health
    const criticalFailed = !checks.locationExists.pass || !checks.hasValidCoordinates.pass;
    const warningFailed = !checks.isFresh.pass || !checks.isAccurate.pass;

    let locationHealth: 'healthy' | 'warning' | 'critical';
    if (criticalFailed) {
      locationHealth = 'critical';
    } else if (warningFailed) {
      locationHealth = 'warning';
    } else {
      locationHealth = 'healthy';
    }

    // Build summary
    let summary: string;

    if (locationHealth === 'healthy') {
      summary = `Driver ${input.driverId} location is healthy. Coordinates: (${lat.toFixed(4)}, ${lng.toFixed(4)}), Age: ${locationAge}, Accuracy: ${accuracy ? `${accuracy}m` : 'unknown'}.`;
    } else if (locationHealth === 'warning') {
      summary = `Driver ${input.driverId} location has warnings. ${!checks.isFresh.pass ? 'Location is stale.' : ''} ${!checks.isAccurate.pass ? 'Accuracy is suboptimal.' : ''}`;
    } else {
      summary = `Driver ${input.driverId} location is critical. Location is ${!checks.locationExists.pass ? 'missing' : 'invalid'}.`;
    }

    return {
      summary,
      driverId: input.driverId,
      locationHealth,
      checks,
      location: {
        lat: Math.round(lat * 10000) / 10000,
        lng: Math.round(lng * 10000) / 10000,
        accuracy,
        altitude,
        speed,
        heading,
        timestamp: locationTimestamp || 'unknown',
        age: locationAge,
      },
      recommendations,
    };
  } catch (error: any) {
    throw new Error(
      `[driver-location-status] Failed to check location status: ${error.message}`
    );
  }
}

export const driverLocationStatusSchema = {
  name: 'wawapp_driver_location_status',
  description:
    'Check driver location health status. Verifies location document exists, has valid coordinates (not null, not 0,0, within range), is fresh (<5 minutes old), and has good accuracy (<50m). Returns overall health (healthy/warning/critical), detailed checks, and actionable recommendations.',
  inputSchema: {
    type: 'object',
    properties: {
      driverId: {
        type: 'string',
        description: 'Driver ID to check location status for',
      },
    },
    required: ['driverId'],
  },
};
