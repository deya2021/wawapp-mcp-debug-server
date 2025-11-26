/**
 * Kit 4: Real-time Location Intelligence
 * Tool: wawapp_trip_route_analyzer
 *
 * Analyze completed trip routes for anomalies.
 * Compare expected vs actual distance and duration.
 *
 * @author WawApp Development Team
 * @date 2025-11-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { calculateDistance } from '../../utils/haversine.js';
import { formatDuration } from '../../utils/time-helpers.js';

const InputSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
});

interface RouteAnalysisResult {
  summary: string;
  orderId: string;
  order: {
    status: string;
    pickup: { lat: number; lng: number; label?: string };
    dropoff: { lat: number; lng: number; label?: string };
    driverId?: string;
    price: number;
  };
  route: {
    directDistance: {
      km: number;
      description: string;
    };
    estimatedDuration: string;
    actualDuration?: string;
    efficiency?: string;
  };
  analysis: {
    distanceAnomaly: boolean;
    durationAnomaly: boolean;
    detourLikely: boolean;
    unusuallyFast: boolean;
    unusuallySlow: boolean;
  };
  flags: string[];
  recommendations: string[];
}

export async function tripRouteAnalyzer(
  params: unknown
): Promise<RouteAnalysisResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  try {
    // Fetch order
    const orderDoc = await firestore.getDocument('orders', input.orderId);

    if (!orderDoc) {
      throw new Error(`Order ${input.orderId} not found`);
    }

    const flags: string[] = [];
    const recommendations: string[] = [];

    // Extract coordinates
    const pickupLat = orderDoc.pickup?.lat || orderDoc.pickup?.latitude;
    const pickupLng = orderDoc.pickup?.lng || orderDoc.pickup?.longitude;
    const dropoffLat = orderDoc.dropoff?.lat || orderDoc.dropoff?.latitude;
    const dropoffLng = orderDoc.dropoff?.lng || orderDoc.dropoff?.longitude;

    if (!pickupLat || !pickupLng) {
      throw new Error('Order has invalid pickup coordinates');
    }

    if (!dropoffLat || !dropoffLng) {
      throw new Error('Order has invalid dropoff coordinates');
    }

    // Calculate direct distance
    const directDistanceKm = calculateDistance(
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng
    );

    // Estimate duration based on distance
    // Assumptions:
    // - Average speed in city: 20 km/h (includes traffic, stops)
    // - Base time: 5 minutes (pickup/dropoff time)
    const avgSpeedKmh = 20;
    const baseTravelTimeMinutes = 5;
    const estimatedTravelMinutes = (directDistanceKm / avgSpeedKmh) * 60;
    const totalEstimatedMinutes = baseTravelTimeMinutes + estimatedTravelMinutes;

    const estimatedDuration = formatDuration(totalEstimatedMinutes * 60 * 1000);

    // Calculate actual duration if order is completed
    let actualDuration: string | undefined;
    let actualDurationMs: number | undefined;
    let efficiency: string | undefined;

    const createdAt = firestore.timestampToDate(orderDoc.createdAt);
    const completedAt = firestore.timestampToDate(orderDoc.completedAt);

    if (createdAt && completedAt) {
      actualDurationMs = completedAt.getTime() - createdAt.getTime();
      actualDuration = formatDuration(actualDurationMs);

      const estimatedDurationMs = totalEstimatedMinutes * 60 * 1000;
      const efficiencyPct = (estimatedDurationMs / actualDurationMs) * 100;
      efficiency = `${Math.round(efficiencyPct)}%`;
    }

    // Analyze for anomalies
    const analysis = {
      distanceAnomaly: false,
      durationAnomaly: false,
      detourLikely: false,
      unusuallyFast: false,
      unusuallySlow: false,
    };

    // Distance anomalies
    if (directDistanceKm < 0.5) {
      analysis.distanceAnomaly = true;
      flags.push('Very short distance (<0.5km). Possible test order.');
      recommendations.push(
        'ℹ️ Trip distance is unusually short. Verify this is a legitimate order.'
      );
    } else if (directDistanceKm > 50) {
      analysis.distanceAnomaly = true;
      flags.push('Very long distance (>50km). Unusual for city delivery.');
      recommendations.push(
        '⚠️ Trip distance is unusually long. Verify pickup/dropoff coordinates are correct.'
      );
    }

    // Duration anomalies (if order is completed)
    if (actualDurationMs) {
      const actualMinutes = actualDurationMs / (1000 * 60);
      const expectedMinutes = totalEstimatedMinutes;

      if (actualMinutes < expectedMinutes * 0.5) {
        analysis.unusuallyFast = true;
        analysis.durationAnomaly = true;
        flags.push(
          `Completed unusually fast (${actualDuration} vs expected ${estimatedDuration})`
        );
        recommendations.push(
          '⚠️ Trip completed much faster than expected. Possible issues: wrong status update, driver skipped pickup/dropoff, or test order.'
        );
      } else if (actualMinutes > expectedMinutes * 2) {
        analysis.unusuallySlow = true;
        analysis.durationAnomaly = true;
        flags.push(
          `Completed unusually slow (${actualDuration} vs expected ${estimatedDuration})`
        );
        recommendations.push(
          '⚠️ Trip took much longer than expected. Possible issues: traffic, driver took detour, multiple stops, or driver delay.'
        );
      } else if (actualMinutes > expectedMinutes * 1.5) {
        analysis.detourLikely = true;
        flags.push('Took 50% longer than expected. Possible detour.');
        recommendations.push(
          'ℹ️ Trip took notably longer. Driver may have taken an indirect route or encountered traffic.'
        );
      } else if (actualMinutes <= expectedMinutes * 1.2) {
        recommendations.push(
          `✅ Trip duration was within normal range (${actualDuration}).`
        );
      }
    } else if (orderDoc.status === 'completed') {
      flags.push('Order marked completed but missing completedAt timestamp');
      recommendations.push(
        '⚠️ Data integrity issue: completedAt timestamp is missing.'
      );
    } else {
      recommendations.push(
        `ℹ️ Order is in "${orderDoc.status}" status. Cannot analyze actual duration yet.`
      );
    }

    // Price analysis
    if (orderDoc.price) {
      const pricePerKm = orderDoc.price / directDistanceKm;

      if (pricePerKm < 50) {
        flags.push(`Low price per km (${Math.round(pricePerKm)} MRU/km)`);
        recommendations.push(
          `ℹ️ Price seems low for distance. Review pricing algorithm.`
        );
      } else if (pricePerKm > 200) {
        flags.push(`High price per km (${Math.round(pricePerKm)} MRU/km)`);
        recommendations.push(
          `ℹ️ Price seems high for distance. May be due to surge pricing or special circumstances.`
        );
      }
    }

    // Build summary
    let summary = `Trip analysis for order ${input.orderId}. Direct distance: ${directDistanceKm.toFixed(2)}km. Estimated duration: ${estimatedDuration}.`;

    if (actualDuration) {
      summary += ` Actual duration: ${actualDuration} (efficiency: ${efficiency}).`;
    }

    if (flags.length > 0) {
      summary += ` Flags: ${flags.length} issue(s) detected.`;
    } else {
      summary += ` No anomalies detected.`;
    }

    return {
      summary,
      orderId: input.orderId,
      order: {
        status: orderDoc.status,
        pickup: {
          lat: Math.round(pickupLat * 10000) / 10000,
          lng: Math.round(pickupLng * 10000) / 10000,
          label: orderDoc.pickup?.label,
        },
        dropoff: {
          lat: Math.round(dropoffLat * 10000) / 10000,
          lng: Math.round(dropoffLng * 10000) / 10000,
          label: orderDoc.dropoff?.label,
        },
        driverId: orderDoc.driverId,
        price: orderDoc.price || 0,
      },
      route: {
        directDistance: {
          km: Math.round(directDistanceKm * 100) / 100,
          description: `${directDistanceKm.toFixed(2)}km direct distance (Haversine)`,
        },
        estimatedDuration,
        actualDuration,
        efficiency,
      },
      analysis,
      flags,
      recommendations,
    };
  } catch (error: any) {
    throw new Error(
      `[trip-route-analyzer] Failed to analyze route: ${error.message}`
    );
  }
}

export const tripRouteAnalyzerSchema = {
  name: 'wawapp_trip_route_analyzer',
  description:
    'Analyze completed trip routes for anomalies. Calculates direct distance (Haversine) between pickup and dropoff, estimates expected duration based on average city speed, compares with actual duration if order is completed. Detects anomalies: unusually short/long distances, unusually fast/slow trips, likely detours. Returns detailed route analysis with flags and recommendations.',
  inputSchema: {
    type: 'object',
    properties: {
      orderId: {
        type: 'string',
        description: 'Order ID to analyze trip route for',
      },
    },
    required: ['orderId'],
  },
};
