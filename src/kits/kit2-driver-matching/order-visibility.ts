/**
 * Kit 2: Driver Matching Diagnostics
 * Tool: wawapp_order_visibility
 *
 * Debug why a specific order is not visible to a specific driver.
 * Performs comprehensive visibility checks.
 *
 * @author WawApp Development Team
 * @date 2025-11-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { calculateDistance } from '../../utils/haversine.js';
import { getAge } from '../../utils/time-helpers.js';

const InputSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  driverId: z.string().min(1, 'Driver ID is required'),
  radiusKm: z
    .number()
    .positive()
    .default(6.0)
    .describe('Search radius in kilometers (default: 6.0)'),
});

interface VisibilityCheck {
  criterion: string;
  pass: boolean;
  value: any;
  expected: any;
  reason?: string;
}

interface OrderVisibilityResult {
  summary: string;
  orderId: string;
  driverId: string;
  visible: boolean;
  checks: {
    orderStatus: VisibilityCheck;
    orderExists: VisibilityCheck;
    driverExists: VisibilityCheck;
    driverVerified: VisibilityCheck;
    driverProfileComplete: VisibilityCheck;
    driverOnline: VisibilityCheck;
    driverLocationValid: VisibilityCheck;
    withinRadius: VisibilityCheck;
  };
  distance?: {
    km: number;
    description: string;
  };
  recommendations: string[];
}

export async function orderVisibility(
  params: unknown
): Promise<OrderVisibilityResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  const checks: OrderVisibilityResult['checks'] = {
    orderStatus: {
      criterion: 'Order Status',
      pass: false,
      value: null,
      expected: 'matching',
    },
    orderExists: {
      criterion: 'Order Exists',
      pass: false,
      value: null,
      expected: true,
    },
    driverExists: {
      criterion: 'Driver Exists',
      pass: false,
      value: null,
      expected: true,
    },
    driverVerified: {
      criterion: 'Driver Verified',
      pass: false,
      value: null,
      expected: true,
    },
    driverProfileComplete: {
      criterion: 'Driver Profile Complete',
      pass: false,
      value: null,
      expected: true,
    },
    driverOnline: {
      criterion: 'Driver Online',
      pass: false,
      value: null,
      expected: true,
    },
    driverLocationValid: {
      criterion: 'Driver Location Valid',
      pass: false,
      value: null,
      expected: true,
    },
    withinRadius: {
      criterion: 'Within Radius',
      pass: false,
      value: null,
      expected: `<=${input.radiusKm}km`,
    },
  };

  const recommendations: string[] = [];
  let distanceKm: number | undefined;

  try {
    // Check 1: Order exists
    const orderDoc = await firestore.getDocument('orders', input.orderId);
    checks.orderExists.pass = !!orderDoc;
    checks.orderExists.value = !!orderDoc;

    if (!orderDoc) {
      checks.orderExists.reason = `Order ${input.orderId} not found in /orders collection`;
      recommendations.push('❌ Order does not exist. Check order ID.');

      return {
        summary: `Order ${input.orderId} not found. Cannot determine visibility.`,
        orderId: input.orderId,
        driverId: input.driverId,
        visible: false,
        checks,
        recommendations,
      };
    }

    // Check 2: Order status is "matching"
    checks.orderStatus.value = orderDoc.status;
    checks.orderStatus.pass = orderDoc.status === 'matching';

    if (!checks.orderStatus.pass) {
      checks.orderStatus.reason = `Order status is "${orderDoc.status}", not "matching"`;
      recommendations.push(
        `❌ Order is in "${orderDoc.status}" status. Only orders in "matching" status are visible to drivers.`
      );
    }

    // Check 3: Driver exists
    const driverDoc = await firestore.getDocument('drivers', input.driverId);
    checks.driverExists.pass = !!driverDoc;
    checks.driverExists.value = !!driverDoc;

    if (!driverDoc) {
      checks.driverExists.reason = `Driver ${input.driverId} not found in /drivers collection`;
      recommendations.push('❌ Driver does not exist. Check driver ID.');

      return {
        summary: `Driver ${input.driverId} not found. Cannot determine visibility.`,
        orderId: input.orderId,
        driverId: input.driverId,
        visible: false,
        checks,
        recommendations,
      };
    }

    // Check 4: Driver is verified
    checks.driverVerified.value = driverDoc.isVerified;
    checks.driverVerified.pass = driverDoc.isVerified === true;

    if (!checks.driverVerified.pass) {
      checks.driverVerified.reason = `isVerified=${driverDoc.isVerified} in /drivers/${input.driverId}`;
      recommendations.push(
        `❌ Driver is not verified. Admin must set isVerified=true in Firestore.`
      );
    }

    // Check 5: Driver profile is complete
    const requiredFields = ['name', 'phone', 'city', 'region'];
    const missingFields = requiredFields.filter(
      (field) => !driverDoc[field] || driverDoc[field] === ''
    );

    checks.driverProfileComplete.pass = missingFields.length === 0;
    checks.driverProfileComplete.value = missingFields.length === 0;

    if (!checks.driverProfileComplete.pass) {
      checks.driverProfileComplete.reason = `Missing fields: ${missingFields.join(', ')}`;
      recommendations.push(
        `❌ Driver profile incomplete. Missing: ${missingFields.join(', ')}. Driver must complete onboarding.`
      );
    }

    // Check 6: Driver is online
    checks.driverOnline.value = driverDoc.isOnline;
    checks.driverOnline.pass = driverDoc.isOnline === true;

    if (!checks.driverOnline.pass) {
      checks.driverOnline.reason = `isOnline=${driverDoc.isOnline} in /drivers/${input.driverId}`;
      recommendations.push(
        `❌ Driver is offline. Driver must open app and toggle online.`
      );
    }

    // Check 7: Driver location is valid
    const locationDoc = await firestore.getDocument(
      'driver_locations',
      input.driverId
    );

    if (!locationDoc) {
      checks.driverLocationValid.pass = false;
      checks.driverLocationValid.value = null;
      checks.driverLocationValid.reason = 'No location document found';
      recommendations.push(
        `❌ Driver location not found in /driver_locations collection. Driver must enable location services.`
      );
    } else {
      const lat = locationDoc.latitude || locationDoc.lat;
      const lng = locationDoc.longitude || locationDoc.lng;
      const timestamp = locationDoc.timestamp || locationDoc.updatedAt;

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

      let locationAge: string | undefined;
      let isFresh = false;

      if (timestamp) {
        const timestampDate = firestore.timestampToDate(timestamp);
        if (timestampDate) {
          locationAge = getAge(timestampDate);
          const ageMs = Date.now() - timestampDate.getTime();
          isFresh = ageMs < 5 * 60 * 1000; // Fresh if <5 minutes old
        }
      }

      checks.driverLocationValid.pass = hasValidCoords && isFresh;
      checks.driverLocationValid.value = {
        lat,
        lng,
        age: locationAge,
        fresh: isFresh,
      };

      if (!hasValidCoords) {
        checks.driverLocationValid.reason = 'Invalid coordinates';
        recommendations.push(
          `❌ Driver location has invalid coordinates. Driver must enable GPS.`
        );
      } else if (!isFresh) {
        checks.driverLocationValid.reason = `Location is stale (${locationAge})`;
        recommendations.push(
          `⚠️ Driver location is stale (${locationAge}). Driver should restart app.`
        );
      }

      // Check 8: Within radius
      if (hasValidCoords && orderDoc.pickup) {
        const orderLat = orderDoc.pickup.lat || orderDoc.pickup.latitude;
        const orderLng = orderDoc.pickup.lng || orderDoc.pickup.longitude;

        if (orderLat && orderLng) {
          distanceKm = calculateDistance(lat, lng, orderLat, orderLng);

          checks.withinRadius.value = `${distanceKm.toFixed(2)}km`;
          checks.withinRadius.pass = distanceKm <= input.radiusKm;

          if (!checks.withinRadius.pass) {
            checks.withinRadius.reason = `Distance ${distanceKm.toFixed(2)}km > ${input.radiusKm}km`;
            recommendations.push(
              `❌ Order is ${distanceKm.toFixed(2)}km away, outside ${input.radiusKm}km radius.`
            );
          }
        } else {
          checks.withinRadius.reason = 'Order has invalid pickup coordinates';
          recommendations.push(
            `❌ Order has invalid pickup coordinates. Data quality issue.`
          );
        }
      } else {
        checks.withinRadius.reason = 'Cannot calculate distance';
      }
    }

    // Determine overall visibility
    const allChecks = Object.values(checks);
    const allPass = allChecks.every((check) => check.pass);

    // Build summary
    const failedChecks = allChecks.filter((check) => !check.pass);
    let summary: string;

    if (allPass) {
      summary = `Order ${input.orderId} IS visible to driver ${input.driverId}. All checks passed. Distance: ${distanceKm?.toFixed(2)}km.`;
      recommendations.push(
        '✅ Order should be visible to driver. If driver cannot see it, check app refresh or client-side filtering.'
      );
    } else {
      summary = `Order ${input.orderId} is NOT visible to driver ${input.driverId}. ${failedChecks.length} check(s) failed: ${failedChecks.map((c) => c.criterion).join(', ')}.`;
    }

    return {
      summary,
      orderId: input.orderId,
      driverId: input.driverId,
      visible: allPass,
      checks,
      distance: distanceKm
        ? {
            km: Math.round(distanceKm * 100) / 100,
            description: `${distanceKm.toFixed(2)}km from driver to order pickup`,
          }
        : undefined,
      recommendations,
    };
  } catch (error: any) {
    throw new Error(
      `[order-visibility] Failed to check visibility: ${error.message}`
    );
  }
}

export const orderVisibilitySchema = {
  name: 'wawapp_order_visibility',
  description:
    'Debug why a specific order is not visible to a specific driver. Performs comprehensive visibility checks including order status (must be "matching"), driver eligibility (verified, profile complete, online), driver location (valid, fresh), and distance (within radius). Returns detailed pass/fail for each criterion with actionable recommendations.',
  inputSchema: {
    type: 'object',
    properties: {
      orderId: {
        type: 'string',
        description: 'Order ID to check visibility for',
      },
      driverId: {
        type: 'string',
        description: 'Driver ID to check visibility against',
      },
      radiusKm: {
        type: 'number',
        description: 'Search radius in kilometers (default: 6.0)',
        default: 6.0,
      },
    },
    required: ['orderId', 'driverId'],
  },
};
