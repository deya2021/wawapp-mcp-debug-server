/**
 * Kit 2: Driver Matching Diagnostics
 * Tool: wawapp_nearby_drivers
 *
 * Find all drivers near a specific location.
 * Useful for debugging "no drivers available" scenarios.
 *
 * @author WawApp Development Team
 * @date 2025-11-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { calculateDistance } from '../../utils/haversine.js';
import { getAge } from '../../utils/time-helpers.js';

const InputSchema = z.object({
  latitude: z
    .number()
    .min(-90)
    .max(90)
    .describe('Search center latitude'),
  longitude: z
    .number()
    .min(-180)
    .max(180)
    .describe('Search center longitude'),
  radiusKm: z
    .number()
    .positive()
    .default(6.0)
    .describe('Search radius in kilometers (default: 6.0)'),
  onlineOnly: z
    .boolean()
    .default(true)
    .describe('Only return online drivers (default: true)'),
  verifiedOnly: z
    .boolean()
    .default(true)
    .describe('Only return verified drivers (default: true)'),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(50)
    .describe('Maximum drivers to return (default: 50)'),
});

type NearbyDriversInput = z.infer<typeof InputSchema>;

interface DriverInfo {
  driverId: string;
  name: string;
  distance: {
    km: number;
    description: string;
  };
  location: {
    lat: number;
    lng: number;
    age: string;
    fresh: boolean;
  };
  status: {
    online: boolean;
    verified: boolean;
    profileComplete: boolean;
  };
  eligibility: {
    eligible: boolean;
    reason?: string;
  };
}

interface NearbyDriversResult {
  summary: string;
  searchLocation: {
    lat: number;
    lng: number;
  };
  radiusKm: number;
  filters: {
    onlineOnly: boolean;
    verifiedOnly: boolean;
  };
  results: {
    total: number;
    eligible: number;
    ineligible: number;
    drivers: DriverInfo[];
  };
  breakdown: {
    byEligibility: {
      eligible: number;
      offline: number;
      notVerified: number;
      incompleteProfile: number;
      staleLocation: number;
    };
  };
  recommendations: string[];
}

export async function nearbyDrivers(
  params: unknown
): Promise<NearbyDriversResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  try {
    // Fetch all drivers
    const drivers = await firestore.queryDocuments('drivers', [], {
      limit: 1000,
    });

    // Apply filters
    let filteredDrivers = drivers;

    if (input.onlineOnly) {
      filteredDrivers = filteredDrivers.filter((d) => d.isOnline === true);
    }

    if (input.verifiedOnly) {
      filteredDrivers = filteredDrivers.filter((d) => d.isVerified === true);
    }

    // Collect driver info with locations
    const driversWithLocations: DriverInfo[] = [];
    const breakdown = {
      eligible: 0,
      offline: 0,
      notVerified: 0,
      incompleteProfile: 0,
      staleLocation: 0,
    };

    for (const driver of filteredDrivers) {
      // Get driver location
      const locationDoc = await firestore.getDocument(
        'driver_locations',
        driver.id
      );

      if (!locationDoc) {
        if (!input.onlineOnly) {
          breakdown.staleLocation++;
        }
        continue;
      }

      const lat = locationDoc.latitude || locationDoc.lat;
      const lng = locationDoc.longitude || locationDoc.lng;
      const timestamp = locationDoc.timestamp || locationDoc.updatedAt;

      // Validate coordinates
      if (
        !lat ||
        !lng ||
        lat === 0 ||
        lng === 0 ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        breakdown.staleLocation++;
        continue;
      }

      // Calculate distance
      const distance = calculateDistance(
        input.latitude,
        input.longitude,
        lat,
        lng
      );

      // Filter by radius
      if (distance > input.radiusKm) {
        continue;
      }

      // Check location freshness
      let locationAge = 'unknown';
      let isFresh = false;

      if (timestamp) {
        const timestampDate = firestore.timestampToDate(timestamp);
        if (timestampDate) {
          locationAge = getAge(timestampDate);
          const ageMs = Date.now() - timestampDate.getTime();
          isFresh = ageMs < 5 * 60 * 1000; // Fresh if <5 minutes
        }
      }

      // Check profile completeness
      const requiredFields = ['name', 'phone', 'city', 'region'];
      const missingFields = requiredFields.filter(
        (field) => !driver[field] || driver[field] === ''
      );
      const profileComplete = missingFields.length === 0;

      // Determine eligibility
      let eligible = true;
      let ineligibilityReason: string | undefined;

      if (!driver.isOnline) {
        eligible = false;
        ineligibilityReason = 'Driver is offline';
        breakdown.offline++;
      } else if (!driver.isVerified) {
        eligible = false;
        ineligibilityReason = 'Driver is not verified';
        breakdown.notVerified++;
      } else if (!profileComplete) {
        eligible = false;
        ineligibilityReason = `Profile incomplete (missing: ${missingFields.join(', ')})`;
        breakdown.incompleteProfile++;
      } else if (!isFresh) {
        eligible = false;
        ineligibilityReason = `Location is stale (${locationAge})`;
        breakdown.staleLocation++;
      } else {
        breakdown.eligible++;
      }

      driversWithLocations.push({
        driverId: driver.id,
        name: driver.name || 'Unknown',
        distance: {
          km: Math.round(distance * 100) / 100,
          description: `${distance.toFixed(2)}km from search location`,
        },
        location: {
          lat: Math.round(lat * 10000) / 10000, // Round to 4 decimals
          lng: Math.round(lng * 10000) / 10000,
          age: locationAge,
          fresh: isFresh,
        },
        status: {
          online: driver.isOnline === true,
          verified: driver.isVerified === true,
          profileComplete,
        },
        eligibility: {
          eligible,
          reason: ineligibilityReason,
        },
      });
    }

    // Sort by distance
    driversWithLocations.sort((a, b) => a.distance.km - b.distance.km);

    // Limit results
    const limitedDrivers = driversWithLocations.slice(0, input.limit);

    // Generate recommendations
    const recommendations: string[] = [];
    const eligibleCount = breakdown.eligible;
    const totalWithinRadius = driversWithLocations.length;

    if (eligibleCount === 0 && totalWithinRadius > 0) {
      recommendations.push(
        `⚠️ ${totalWithinRadius} driver(s) found within ${input.radiusKm}km but NONE are eligible.`
      );

      if (breakdown.offline > 0) {
        recommendations.push(
          `- ${breakdown.offline} driver(s) are offline. Encourage drivers to go online.`
        );
      }
      if (breakdown.notVerified > 0) {
        recommendations.push(
          `- ${breakdown.notVerified} driver(s) are not verified. Admin must verify them.`
        );
      }
      if (breakdown.incompleteProfile > 0) {
        recommendations.push(
          `- ${breakdown.incompleteProfile} driver(s) have incomplete profiles. Remind drivers to complete onboarding.`
        );
      }
      if (breakdown.staleLocation > 0) {
        recommendations.push(
          `- ${breakdown.staleLocation} driver(s) have stale locations. Drivers should restart app.`
        );
      }
    } else if (eligibleCount === 0 && totalWithinRadius === 0) {
      recommendations.push(
        `🚨 No drivers found within ${input.radiusKm}km radius. Consider:`
      );
      recommendations.push(`- Expanding search radius`);
      recommendations.push(`- Recruiting more drivers in this area`);
      recommendations.push(`- Offering incentives for drivers to serve this area`);
    } else if (eligibleCount > 0) {
      recommendations.push(
        `✅ ${eligibleCount} eligible driver(s) found within ${input.radiusKm}km. Orders should be visible to them.`
      );

      if (eligibleCount < 3) {
        recommendations.push(
          `⚠️ Only ${eligibleCount} eligible driver(s). Consider recruiting more for better coverage.`
        );
      }
    }

    // Build summary
    let summary = `Found ${totalWithinRadius} driver(s) within ${input.radiusKm}km of location (${input.latitude.toFixed(4)}, ${input.longitude.toFixed(4)}). `;

    if (eligibleCount === 0) {
      summary += `NONE are eligible to see orders.`;
    } else {
      summary += `${eligibleCount} are eligible, ${totalWithinRadius - eligibleCount} are ineligible.`;
    }

    if (limitedDrivers.length > 0) {
      const closest = limitedDrivers[0];
      summary += ` Closest driver: ${closest.driverId} at ${closest.distance.km}km.`;
    }

    return {
      summary,
      searchLocation: {
        lat: input.latitude,
        lng: input.longitude,
      },
      radiusKm: input.radiusKm,
      filters: {
        onlineOnly: input.onlineOnly,
        verifiedOnly: input.verifiedOnly,
      },
      results: {
        total: totalWithinRadius,
        eligible: eligibleCount,
        ineligible: totalWithinRadius - eligibleCount,
        drivers: limitedDrivers,
      },
      breakdown: {
        byEligibility: breakdown,
      },
      recommendations,
    };
  } catch (error: any) {
    throw new Error(
      `[nearby-drivers] Failed to find nearby drivers: ${error.message}`
    );
  }
}

export const nearbyDriversSchema = {
  name: 'wawapp_nearby_drivers',
  description:
    'Find all drivers near a specific location (coordinates). Useful for debugging "no drivers available" scenarios. Returns drivers within specified radius, sorted by distance, with eligibility status (online, verified, profile complete, location fresh). Includes breakdown of ineligibility reasons and actionable recommendations.',
  inputSchema: {
    type: 'object',
    properties: {
      latitude: {
        type: 'number',
        description: 'Search center latitude (-90 to 90)',
      },
      longitude: {
        type: 'number',
        description: 'Search center longitude (-180 to 180)',
      },
      radiusKm: {
        type: 'number',
        description: 'Search radius in kilometers (default: 6.0)',
        default: 6.0,
      },
      onlineOnly: {
        type: 'boolean',
        description: 'Only return online drivers (default: true)',
        default: true,
      },
      verifiedOnly: {
        type: 'boolean',
        description: 'Only return verified drivers (default: true)',
        default: true,
      },
      limit: {
        type: 'number',
        description: 'Maximum drivers to return (default: 50, max: 100)',
        default: 50,
      },
    },
    required: ['latitude', 'longitude'],
  },
};
