/**
 * Kit 1: Order Lifecycle Inspector
 * Tool: wawapp_order_stats
 *
 * Aggregate order statistics and analytics.
 * Provides comprehensive metrics for orders over a time range.
 *
 * @author WawApp Development Team
 * @date 2025-11-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { formatDuration } from '../../utils/time-helpers.js';

const InputSchema = z.object({
  timeRangeMinutes: z
    .number()
    .min(1)
    .max(10080)
    .default(1440)
    .describe('Time range for statistics (default: 24 hours, max: 7 days)'),
  groupBy: z
    .enum(['hour', 'day', 'status', 'region', 'all'])
    .default('all')
    .describe('Group statistics by time period or category'),
  includeBreakdown: z
    .boolean()
    .default(true)
    .describe('Include detailed breakdown by status and price range'),
});

type OrderStatsInput = z.infer<typeof InputSchema>;

interface OrderStatsResult {
  summary: string;
  timeRange: {
    minutes: number;
    description: string;
    start: string;
    end: string;
  };
  overview: {
    totalOrders: number;
    byStatus: Record<string, number>;
    completionRate: string;
    expirationRate: string;
    cancellationRate: string;
  };
  financials: {
    totalRevenue: number;
    avgOrderValue: number;
    minPrice: number;
    maxPrice: number;
    priceRanges: Record<string, number>;
  };
  timing: {
    avgMatchingTime: string;
    avgTripDuration: string;
    avgTotalTime: string;
  };
  engagement: {
    uniqueClients: number;
    uniqueDrivers: number;
    ordersPerClient: number;
    ordersPerDriver: number;
  };
  trends?: any;
  recommendations: string[];
}

export async function orderStats(
  params: unknown
): Promise<OrderStatsResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  // Calculate time range
  const now = new Date();
  const timeRangeMs = input.timeRangeMinutes * 60 * 1000;
  const startDate = new Date(now.getTime() - timeRangeMs);

  // Query orders
  const options: any = {
    limit: 1000,
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
      return createdAt && createdAt >= startDate;
    });

    if (orders.length === 0) {
      return {
        summary: `No orders found in the last ${input.timeRangeMinutes} minutes.`,
        timeRange: {
          minutes: input.timeRangeMinutes,
          description: formatTimeRange(input.timeRangeMinutes),
          start: startDate.toISOString(),
          end: now.toISOString(),
        },
        overview: {
          totalOrders: 0,
          byStatus: {},
          completionRate: '0%',
          expirationRate: '0%',
          cancellationRate: '0%',
        },
        financials: {
          totalRevenue: 0,
          avgOrderValue: 0,
          minPrice: 0,
          maxPrice: 0,
          priceRanges: {},
        },
        timing: {
          avgMatchingTime: 'N/A',
          avgTripDuration: 'N/A',
          avgTotalTime: 'N/A',
        },
        engagement: {
          uniqueClients: 0,
          uniqueDrivers: 0,
          ordersPerClient: 0,
          ordersPerDriver: 0,
        },
        recommendations: ['No orders in the specified time range to analyze.'],
      };
    }

    // Calculate overview statistics
    const byStatus: Record<string, number> = {};
    for (const order of orders) {
      const status = order.status || 'unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;
    }

    const completedCount = byStatus['completed'] || 0;
    const expiredCount = byStatus['expired'] || 0;
    const cancelledCount = byStatus['cancelled'] || 0;
    const totalNonMatching = orders.filter((o) => o.status !== 'matching').length;

    const completionRate =
      totalNonMatching > 0
        ? `${Math.round((completedCount / totalNonMatching) * 100)}%`
        : '0%';
    const expirationRate =
      orders.length > 0
        ? `${Math.round((expiredCount / orders.length) * 100)}%`
        : '0%';
    const cancellationRate =
      orders.length > 0
        ? `${Math.round((cancelledCount / orders.length) * 100)}%`
        : '0%';

    // Calculate financial statistics
    const prices = orders
      .map((o) => o.price || 0)
      .filter((p) => p > 0);
    const totalRevenue = prices.reduce((sum, p) => sum + p, 0);
    const avgOrderValue = prices.length > 0 ? totalRevenue / prices.length : 0;
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    // Price ranges
    const priceRanges: Record<string, number> = {
      '0-200': 0,
      '201-400': 0,
      '401-600': 0,
      '601-800': 0,
      '801+': 0,
    };

    for (const price of prices) {
      if (price <= 200) priceRanges['0-200']++;
      else if (price <= 400) priceRanges['201-400']++;
      else if (price <= 600) priceRanges['401-600']++;
      else if (price <= 800) priceRanges['601-800']++;
      else priceRanges['801+']++;
    }

    // Calculate timing statistics
    const matchingTimes: number[] = [];
    const tripDurations: number[] = [];
    const totalTimes: number[] = [];

    for (const order of orders) {
      const createdAt = firestore.timestampToDate(order.createdAt);
      const updatedAt = firestore.timestampToDate(order.updatedAt);
      const completedAt = firestore.timestampToDate(order.completedAt);

      if (createdAt && updatedAt && order.status !== 'matching') {
        const matchingTime = updatedAt.getTime() - createdAt.getTime();
        matchingTimes.push(matchingTime);
      }

      if (createdAt && completedAt) {
        const totalTime = completedAt.getTime() - createdAt.getTime();
        totalTimes.push(totalTime);

        if (updatedAt) {
          const tripDuration = completedAt.getTime() - updatedAt.getTime();
          tripDurations.push(tripDuration);
        }
      }
    }

    const avgMatchingTime =
      matchingTimes.length > 0
        ? formatDuration(
            matchingTimes.reduce((sum, t) => sum + t, 0) / matchingTimes.length
          )
        : 'N/A';

    const avgTripDuration =
      tripDurations.length > 0
        ? formatDuration(
            tripDurations.reduce((sum, t) => sum + t, 0) / tripDurations.length
          )
        : 'N/A';

    const avgTotalTime =
      totalTimes.length > 0
        ? formatDuration(
            totalTimes.reduce((sum, t) => sum + t, 0) / totalTimes.length
          )
        : 'N/A';

    // Calculate engagement statistics
    const uniqueClients = new Set(orders.map((o) => o.ownerId).filter(Boolean))
      .size;
    const uniqueDrivers = new Set(orders.map((o) => o.driverId).filter(Boolean))
      .size;
    const ordersPerClient =
      uniqueClients > 0 ? Math.round((orders.length / uniqueClients) * 10) / 10 : 0;
    const ordersPerDriver =
      uniqueDrivers > 0 ? Math.round((orders.length / uniqueDrivers) * 10) / 10 : 0;

    // Generate recommendations
    const recommendations: string[] = [];

    const completionPct = parseInt(completionRate);
    if (completionPct < 50) {
      recommendations.push(
        `🚨 Low completion rate (${completionRate}). Investigate driver availability and matching issues.`
      );
    } else if (completionPct >= 70) {
      recommendations.push(
        `✅ Good completion rate (${completionRate}). System performing well.`
      );
    }

    const expirationPct = parseInt(expirationRate);
    if (expirationPct > 20) {
      recommendations.push(
        `⚠️ High expiration rate (${expirationRate}). Check driver supply and expireStaleOrders function.`
      );
    }

    if (matchingTimes.length > 0) {
      const avgMatchingMs =
        matchingTimes.reduce((sum, t) => sum + t, 0) / matchingTimes.length;
      const avgMatchingMin = avgMatchingMs / (1000 * 60);

      if (avgMatchingMin > 5) {
        recommendations.push(
          `⚠️ Average matching time is ${avgMatchingTime}. Consider increasing driver availability or search radius.`
        );
      } else if (avgMatchingMin <= 3) {
        recommendations.push(
          `✅ Excellent matching time (${avgMatchingTime}). Drivers are responding quickly.`
        );
      }
    }

    if (avgOrderValue > 0) {
      recommendations.push(
        `💰 Average order value: ${Math.round(avgOrderValue)} MRU. Total revenue: ${Math.round(totalRevenue)} MRU.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('System metrics appear normal.');
    }

    // Build summary
    const timeRangeDesc = formatTimeRange(input.timeRangeMinutes);
    const summary = `Analyzed ${orders.length} orders from ${timeRangeDesc}. Completion rate: ${completionRate}, Expiration rate: ${expirationRate}. Average matching time: ${avgMatchingTime}. Total revenue: ${Math.round(totalRevenue)} MRU.`;

    return {
      summary,
      timeRange: {
        minutes: input.timeRangeMinutes,
        description: timeRangeDesc,
        start: startDate.toISOString(),
        end: now.toISOString(),
      },
      overview: {
        totalOrders: orders.length,
        byStatus,
        completionRate,
        expirationRate,
        cancellationRate,
      },
      financials: {
        totalRevenue: Math.round(totalRevenue),
        avgOrderValue: Math.round(avgOrderValue),
        minPrice: Math.round(minPrice),
        maxPrice: Math.round(maxPrice),
        priceRanges,
      },
      timing: {
        avgMatchingTime,
        avgTripDuration,
        avgTotalTime,
      },
      engagement: {
        uniqueClients,
        uniqueDrivers,
        ordersPerClient,
        ordersPerDriver,
      },
      recommendations,
    };
  } catch (error: any) {
    throw new Error(
      `[order-stats] Failed to calculate statistics: ${error.message}`
    );
  }
}

function formatTimeRange(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minute(s)`;
  } else if (minutes < 1440) {
    return `${Math.round(minutes / 60)} hour(s)`;
  } else {
    return `${Math.round(minutes / 1440)} day(s)`;
  }
}

export const orderStatsSchema = {
  name: 'wawapp_order_stats',
  description:
    'Aggregate order statistics and analytics over a time range. Provides comprehensive metrics including order counts by status, completion/expiration rates, financial statistics (revenue, avg order value), timing metrics (matching time, trip duration), and engagement metrics (unique clients/drivers). Returns detailed breakdown with actionable recommendations.',
  inputSchema: {
    type: 'object',
    properties: {
      timeRangeMinutes: {
        type: 'number',
        description:
          'Time range for statistics in minutes (default: 1440 = 24 hours, max: 10080 = 7 days)',
        default: 1440,
      },
      groupBy: {
        type: 'string',
        enum: ['hour', 'day', 'status', 'region', 'all'],
        description: 'Group statistics by time period or category (default: all)',
        default: 'all',
      },
      includeBreakdown: {
        type: 'boolean',
        description:
          'Include detailed breakdown by status and price range (default: true)',
        default: true,
      },
    },
  },
};
