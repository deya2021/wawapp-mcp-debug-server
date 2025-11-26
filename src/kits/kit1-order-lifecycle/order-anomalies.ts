/**
 * Kit 1: Order Lifecycle Inspector
 * Tool: wawapp_order_anomalies
 *
 * Detect stuck, problematic, or anomalous orders.
 * Proactive detection of data quality and lifecycle issues.
 *
 * @author WawApp Development Team
 * @date 2025-11-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';

const InputSchema = z.object({
  timeRangeMinutes: z
    .number()
    .min(1)
    .max(10080)
    .default(1440)
    .describe('Time range to scan (default: 24 hours, max: 7 days)'),
  includeExpired: z
    .boolean()
    .default(false)
    .describe('Include expired orders in scan'),
  includeCancelled: z
    .boolean()
    .default(false)
    .describe('Include cancelled orders in scan'),
  limit: z
    .number()
    .min(1)
    .max(1000)
    .default(200)
    .describe('Maximum orders to scan'),
});

type OrderAnomaliesInput = z.infer<typeof InputSchema>;

interface Anomaly {
  orderId: string;
  type: 'stuck_matching' | 'invalid_data' | 'unusual_timing' | 'data_inconsistency';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  details: Record<string, any>;
  createdAt: string;
}

interface OrderAnomaliesResult {
  summary: string;
  scanned: {
    total: number;
    timeRange: string;
  };
  anomalies: {
    total: number;
    critical: number;
    warning: number;
    info: number;
    list: Anomaly[];
  };
  breakdown: {
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  recommendations: string[];
}

export async function orderAnomalies(
  params: unknown
): Promise<OrderAnomaliesResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  // Calculate time threshold
  const now = new Date();
  const timeRangeMs = input.timeRangeMinutes * 60 * 1000;
  const thresholdDate = new Date(now.getTime() - timeRangeMs);

  // Query recent orders
  const options: any = {
    limit: input.limit,
    orderBy: {
      field: 'createdAt',
      direction: 'desc',
    },
  };

  try {
    let orders = await firestore.queryDocuments('orders', [], options);

    // Filter by time range
    orders = orders.filter((order) => {
      const createdAt = firestore.timestampToDate(order.createdAt);
      if (!createdAt || createdAt < thresholdDate) {
        return false;
      }

      // Filter out expired/cancelled if requested
      if (!input.includeExpired && order.status === 'expired') {
        return false;
      }
      if (!input.includeCancelled && order.status === 'cancelled') {
        return false;
      }

      return true;
    });

    // Detect anomalies
    const anomalies: Anomaly[] = [];

    for (const order of orders) {
      const createdAt = firestore.timestampToDate(order.createdAt);
      if (!createdAt) continue;

      const ageMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);

      // Anomaly 1: Stuck in matching >10 minutes
      if (
        order.status === 'matching' &&
        !order.driverId &&
        ageMinutes > 10
      ) {
        anomalies.push({
          orderId: order.id,
          type: 'stuck_matching',
          severity: 'critical',
          description: `Order stuck in matching for ${Math.round(ageMinutes)} minutes`,
          details: {
            status: order.status,
            ageMinutes: Math.round(ageMinutes),
            hasDriver: false,
            expectedExpireTime: '10 minutes',
          },
          createdAt: createdAt.toISOString(),
        });
      }

      // Anomaly 2: Invalid pickup/dropoff coordinates
      const pickup = order.pickup;
      const dropoff = order.dropoff;

      if (
        !pickup ||
        !pickup.lat ||
        !pickup.lng ||
        pickup.lat === 0 ||
        pickup.lng === 0
      ) {
        anomalies.push({
          orderId: order.id,
          type: 'invalid_data',
          severity: 'critical',
          description: 'Invalid or missing pickup coordinates',
          details: {
            pickup: pickup || null,
            issue: 'Pickup coordinates are null, undefined, or (0,0)',
          },
          createdAt: createdAt.toISOString(),
        });
      }

      if (
        !dropoff ||
        !dropoff.lat ||
        !dropoff.lng ||
        dropoff.lat === 0 ||
        dropoff.lng === 0
      ) {
        anomalies.push({
          orderId: order.id,
          type: 'invalid_data',
          severity: 'critical',
          description: 'Invalid or missing dropoff coordinates',
          details: {
            dropoff: dropoff || null,
            issue: 'Dropoff coordinates are null, undefined, or (0,0)',
          },
          createdAt: createdAt.toISOString(),
        });
      }

      // Anomaly 3: Out-of-range coordinates
      if (pickup && pickup.lat && pickup.lng) {
        if (
          pickup.lat < -90 ||
          pickup.lat > 90 ||
          pickup.lng < -180 ||
          pickup.lng > 180
        ) {
          anomalies.push({
            orderId: order.id,
            type: 'invalid_data',
            severity: 'critical',
            description: 'Pickup coordinates out of valid range',
            details: {
              pickup,
              validRange: 'lat: -90 to 90, lng: -180 to 180',
            },
            createdAt: createdAt.toISOString(),
          });
        }
      }

      // Anomaly 4: Missing createdAt timestamp
      if (!order.createdAt) {
        anomalies.push({
          orderId: order.id,
          type: 'invalid_data',
          severity: 'critical',
          description: 'Missing createdAt timestamp',
          details: {
            issue: 'createdAt field is null or undefined',
          },
          createdAt: now.toISOString(),
        });
      }

      // Anomaly 5: Status inconsistency
      if (order.status === 'completed' && !order.completedAt) {
        anomalies.push({
          orderId: order.id,
          type: 'data_inconsistency',
          severity: 'warning',
          description: 'Order marked completed but missing completedAt timestamp',
          details: {
            status: 'completed',
            completedAt: null,
          },
          createdAt: createdAt.toISOString(),
        });
      }

      if (
        (order.status === 'accepted' || order.status === 'onRoute' || order.status === 'completed') &&
        !order.driverId
      ) {
        anomalies.push({
          orderId: order.id,
          type: 'data_inconsistency',
          severity: 'critical',
          description: `Order in ${order.status} state but missing driverId`,
          details: {
            status: order.status,
            driverId: null,
            expectedDriverId: 'non-null',
          },
          createdAt: createdAt.toISOString(),
        });
      }

      // Anomaly 6: Unusual timing (completed very quickly)
      if (order.status === 'completed' && order.completedAt) {
        const completedAt = firestore.timestampToDate(order.completedAt);
        if (completedAt) {
          const durationMinutes =
            (completedAt.getTime() - createdAt.getTime()) / (1000 * 60);

          if (durationMinutes < 5) {
            anomalies.push({
              orderId: order.id,
              type: 'unusual_timing',
              severity: 'info',
              description: `Order completed unusually quickly (${Math.round(durationMinutes)} minutes)`,
              details: {
                durationMinutes: Math.round(durationMinutes),
                expectedMinimum: '5 minutes',
                possibleCause: 'Test order or data entry error',
              },
              createdAt: createdAt.toISOString(),
            });
          }
        }
      }

      // Anomaly 7: Invalid price
      if (!order.price || order.price <= 0) {
        anomalies.push({
          orderId: order.id,
          type: 'invalid_data',
          severity: 'warning',
          description: 'Invalid or zero price',
          details: {
            price: order.price || 0,
            expectedMinimum: 100,
          },
          createdAt: createdAt.toISOString(),
        });
      }
    }

    // Calculate breakdown
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const anomaly of anomalies) {
      byType[anomaly.type] = (byType[anomaly.type] || 0) + 1;
      bySeverity[anomaly.severity] = (bySeverity[anomaly.severity] || 0) + 1;
    }

    const critical = bySeverity['critical'] || 0;
    const warning = bySeverity['warning'] || 0;
    const info = bySeverity['info'] || 0;

    // Generate recommendations
    const recommendations: string[] = [];

    if (byType['stuck_matching'] && byType['stuck_matching'] > 0) {
      recommendations.push(
        `🚨 ${byType['stuck_matching']} order(s) stuck in matching >10 minutes. Check expireStaleOrders Cloud Function and Cloud Scheduler.`
      );
    }

    if (byType['invalid_data'] && byType['invalid_data'] > 0) {
      recommendations.push(
        `🔴 ${byType['invalid_data']} order(s) have invalid data (coordinates, timestamps). Add validation in order creation flow.`
      );
    }

    if (byType['data_inconsistency'] && byType['data_inconsistency'] > 0) {
      recommendations.push(
        `⚠️ ${byType['data_inconsistency']} order(s) have data inconsistencies (status vs fields). Review order state management logic.`
      );
    }

    if (byType['unusual_timing'] && byType['unusual_timing'] > 0) {
      recommendations.push(
        `ℹ️ ${byType['unusual_timing']} order(s) completed unusually quickly (<5 min). Possible test orders.`
      );
    }

    if (anomalies.length === 0) {
      recommendations.push('✅ No anomalies detected. All scanned orders appear healthy.');
    }

    // Build summary
    const timeRangeDesc =
      input.timeRangeMinutes >= 1440
        ? `${Math.floor(input.timeRangeMinutes / 1440)} day(s)`
        : `${input.timeRangeMinutes} minute(s)`;

    let summary = `Scanned ${orders.length} order(s) from last ${timeRangeDesc}. `;

    if (anomalies.length === 0) {
      summary += 'No anomalies detected - all orders appear healthy.';
    } else {
      summary += `Found ${anomalies.length} anomalie(s): ${critical} critical, ${warning} warning, ${info} info. Most common issue: ${Object.entries(byType).sort(([, a], [, b]) => b - a)[0][0]}.`;
    }

    return {
      summary,
      scanned: {
        total: orders.length,
        timeRange: timeRangeDesc,
      },
      anomalies: {
        total: anomalies.length,
        critical,
        warning,
        info,
        list: anomalies,
      },
      breakdown: {
        byType,
        bySeverity,
      },
      recommendations,
    };
  } catch (error: any) {
    throw new Error(
      `[order-anomalies] Failed to detect anomalies: ${error.message}`
    );
  }
}

export const orderAnomaliesSchema = {
  name: 'wawapp_order_anomalies',
  description:
    'Detect stuck, problematic, or anomalous orders. Identifies orders stuck in matching, invalid data (coordinates, timestamps), data inconsistencies, and unusual timings. Returns anomalies categorized by type and severity with actionable recommendations.',
  inputSchema: {
    type: 'object',
    properties: {
      timeRangeMinutes: {
        type: 'number',
        description:
          'Time range to scan in minutes (default: 1440 = 24 hours, max: 10080 = 7 days)',
        default: 1440,
      },
      includeExpired: {
        type: 'boolean',
        description: 'Include expired orders in scan (default: false)',
        default: false,
      },
      includeCancelled: {
        type: 'boolean',
        description: 'Include cancelled orders in scan (default: false)',
        default: false,
      },
      limit: {
        type: 'number',
        description: 'Maximum orders to scan (default: 200, max: 1000)',
        default: 200,
      },
    },
  },
};
