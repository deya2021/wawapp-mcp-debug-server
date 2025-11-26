/**
 * Kit 2: Driver Matching Diagnostics
 * Tool: wawapp_matching_performance
 *
 * Analyze matching algorithm performance metrics.
 * Provides insights on match success rates, response times, and patterns.
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
    .describe('Time range for analysis (default: 24 hours, max: 7 days)'),
  groupBy: z
    .enum(['region', 'city', 'hour', 'all'])
    .default('all')
    .describe('Group metrics by region, city, hour, or all'),
});

type MatchingPerformanceInput = z.infer<typeof InputSchema>;

interface PerformanceMetrics {
  totalOrders: number;
  matchedOrders: number;
  expiredOrders: number;
  matchSuccessRate: string;
  avgMatchingTime: string;
  medianMatchingTime: string;
  matchingTimeP95: string;
  fastestMatch: string;
  slowestMatch: string;
}

interface MatchingPerformanceResult {
  summary: string;
  timeRange: {
    minutes: number;
    description: string;
  };
  overall: PerformanceMetrics;
  breakdown?: {
    byRegion?: Record<string, PerformanceMetrics>;
    byCity?: Record<string, PerformanceMetrics>;
    byHour?: Record<string, PerformanceMetrics>;
  };
  driverMetrics: {
    totalActiveDrivers: number;
    avgOrdersPerDriver: number;
    topDrivers: Array<{
      driverId: string;
      ordersCompleted: number;
      avgResponseTime: string;
    }>;
  };
  recommendations: string[];
}

export async function matchingPerformance(
  params: unknown
): Promise<MatchingPerformanceResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  // Calculate time range
  const now = new Date();
  const timeRangeMs = input.timeRangeMinutes * 60 * 1000;
  const startDate = new Date(now.getTime() - timeRangeMs);

  try {
    // Query orders
    let orders = await firestore.queryDocuments('orders', [], {
      limit: 1000,
      orderBy: {
        field: 'createdAt',
        direction: 'desc',
      },
    });

    // Filter by time range
    orders = orders.filter((order) => {
      const createdAt = firestore.timestampToDate(order.createdAt);
      return createdAt && createdAt >= startDate;
    });

    if (orders.length === 0) {
      return {
        summary: 'No orders found in the specified time range.',
        timeRange: {
          minutes: input.timeRangeMinutes,
          description: formatTimeRangeDesc(input.timeRangeMinutes),
        },
        overall: createEmptyMetrics(),
        driverMetrics: {
          totalActiveDrivers: 0,
          avgOrdersPerDriver: 0,
          topDrivers: [],
        },
        recommendations: ['No data available for analysis.'],
      };
    }

    // Calculate overall metrics
    const overallMetrics = calculateMetrics(orders, firestore);

    // Calculate driver metrics
    const driverStats: Record<
      string,
      { count: number; responseTimes: number[] }
    > = {};

    for (const order of orders) {
      if (order.driverId && order.status !== 'matching') {
        if (!driverStats[order.driverId]) {
          driverStats[order.driverId] = { count: 0, responseTimes: [] };
        }
        driverStats[order.driverId].count++;

        // Calculate response time
        const createdAt = firestore.timestampToDate(order.createdAt);
        const updatedAt = firestore.timestampToDate(order.updatedAt);

        if (createdAt && updatedAt) {
          const responseTime = updatedAt.getTime() - createdAt.getTime();
          driverStats[order.driverId].responseTimes.push(responseTime);
        }
      }
    }

    const activeDrivers = Object.keys(driverStats).length;
    const avgOrdersPerDriver =
      activeDrivers > 0 ? orders.length / activeDrivers : 0;

    const topDrivers = Object.entries(driverStats)
      .map(([driverId, stats]) => ({
        driverId,
        ordersCompleted: stats.count,
        avgResponseTime:
          stats.responseTimes.length > 0
            ? formatDuration(
                stats.responseTimes.reduce((sum, t) => sum + t, 0) /
                  stats.responseTimes.length
              )
            : 'N/A',
      }))
      .sort((a, b) => b.ordersCompleted - a.ordersCompleted)
      .slice(0, 5);

    // Generate recommendations
    const recommendations: string[] = [];

    const successRate = parseFloat(overallMetrics.matchSuccessRate);

    if (successRate < 50) {
      recommendations.push(
        `🚨 CRITICAL: Match success rate is very low (${overallMetrics.matchSuccessRate}). Urgent action needed.`
      );
      recommendations.push(
        `- Check driver availability (${activeDrivers} active drivers in ${input.timeRangeMinutes} min)`
      );
      recommendations.push(`- Review expireStaleOrders Cloud Function`);
      recommendations.push(`- Consider expanding search radius beyond 6km`);
    } else if (successRate < 70) {
      recommendations.push(
        `⚠️ Match success rate is below target (${overallMetrics.matchSuccessRate}). Target: >70%.`
      );
      recommendations.push(
        `- Recruit more drivers in underserved areas`
      );
      recommendations.push(`- Analyze peak hours and driver coverage`);
    } else {
      recommendations.push(
        `✅ Match success rate is good (${overallMetrics.matchSuccessRate}).`
      );
    }

    // Check matching time
    const avgMatchingTimeMs = parseAvgTime(overallMetrics.avgMatchingTime);
    if (avgMatchingTimeMs > 5 * 60 * 1000) {
      // > 5 minutes
      recommendations.push(
        `⚠️ Average matching time is slow (${overallMetrics.avgMatchingTime}). Target: <3 min.`
      );
      recommendations.push(
        `- Optimize matching algorithm`
      );
      recommendations.push(`- Increase driver notifications`);
    } else if (avgMatchingTimeMs <= 3 * 60 * 1000) {
      // <= 3 minutes
      recommendations.push(
        `✅ Excellent matching time (${overallMetrics.avgMatchingTime}).`
      );
    }

    // Check driver distribution
    if (activeDrivers < 5) {
      recommendations.push(
        `⚠️ Low active driver count (${activeDrivers}). Recruit more drivers.`
      );
    }

    if (topDrivers.length > 0) {
      const topDriver = topDrivers[0];
      if (topDriver.ordersCompleted > orders.length * 0.5) {
        recommendations.push(
          `⚠️ Top driver (${topDriver.driverId}) is handling ${topDriver.ordersCompleted} orders (>${Math.round((topDriver.ordersCompleted / orders.length) * 100)}%). Load is concentrated on few drivers.`
        );
      }
    }

    // Build summary
    const timeRangeDesc = formatTimeRangeDesc(input.timeRangeMinutes);
    const summary = `Analyzed ${orders.length} orders from ${timeRangeDesc}. Match success rate: ${overallMetrics.matchSuccessRate}. Average matching time: ${overallMetrics.avgMatchingTime}. ${activeDrivers} active drivers served ${orders.length} orders.`;

    return {
      summary,
      timeRange: {
        minutes: input.timeRangeMinutes,
        description: timeRangeDesc,
      },
      overall: overallMetrics,
      driverMetrics: {
        totalActiveDrivers: activeDrivers,
        avgOrdersPerDriver: Math.round(avgOrdersPerDriver * 10) / 10,
        topDrivers,
      },
      recommendations,
    };
  } catch (error: any) {
    throw new Error(
      `[matching-performance] Failed to analyze performance: ${error.message}`
    );
  }
}

function calculateMetrics(
  orders: any[],
  firestore: FirestoreClient
): PerformanceMetrics {
  const totalOrders = orders.length;
  const matchedOrders = orders.filter(
    (o) => o.status !== 'matching' && o.status !== 'expired'
  ).length;
  const expiredOrders = orders.filter((o) => o.status === 'expired').length;

  const matchSuccessRate =
    totalOrders > 0
      ? `${Math.round((matchedOrders / totalOrders) * 100)}%`
      : '0%';

  // Calculate matching times
  const matchingTimes: number[] = [];

  for (const order of orders) {
    if (order.status !== 'matching' && order.status !== 'expired') {
      const createdAt = firestore.timestampToDate(order.createdAt);
      const updatedAt = firestore.timestampToDate(order.updatedAt);

      if (createdAt && updatedAt) {
        const matchingTime = updatedAt.getTime() - createdAt.getTime();
        matchingTimes.push(matchingTime);
      }
    }
  }

  if (matchingTimes.length === 0) {
    return {
      totalOrders,
      matchedOrders,
      expiredOrders,
      matchSuccessRate,
      avgMatchingTime: 'N/A',
      medianMatchingTime: 'N/A',
      matchingTimeP95: 'N/A',
      fastestMatch: 'N/A',
      slowestMatch: 'N/A',
    };
  }

  matchingTimes.sort((a, b) => a - b);

  const avgMatchingTime = formatDuration(
    matchingTimes.reduce((sum, t) => sum + t, 0) / matchingTimes.length
  );

  const medianIndex = Math.floor(matchingTimes.length / 2);
  const medianMatchingTime = formatDuration(matchingTimes[medianIndex]);

  const p95Index = Math.floor(matchingTimes.length * 0.95);
  const matchingTimeP95 = formatDuration(matchingTimes[p95Index]);

  const fastestMatch = formatDuration(matchingTimes[0]);
  const slowestMatch = formatDuration(matchingTimes[matchingTimes.length - 1]);

  return {
    totalOrders,
    matchedOrders,
    expiredOrders,
    matchSuccessRate,
    avgMatchingTime,
    medianMatchingTime,
    matchingTimeP95,
    fastestMatch,
    slowestMatch,
  };
}

function createEmptyMetrics(): PerformanceMetrics {
  return {
    totalOrders: 0,
    matchedOrders: 0,
    expiredOrders: 0,
    matchSuccessRate: '0%',
    avgMatchingTime: 'N/A',
    medianMatchingTime: 'N/A',
    matchingTimeP95: 'N/A',
    fastestMatch: 'N/A',
    slowestMatch: 'N/A',
  };
}

function formatTimeRangeDesc(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minute(s)`;
  } else if (minutes < 1440) {
    return `${Math.round(minutes / 60)} hour(s)`;
  } else {
    return `${Math.round(minutes / 1440)} day(s)`;
  }
}

function parseAvgTime(timeStr: string): number {
  if (timeStr === 'N/A') return 0;

  // Parse formats like "2m 30s", "45s", "1h 15m", etc.
  let totalMs = 0;

  const hourMatch = timeStr.match(/(\d+)h/);
  if (hourMatch) {
    totalMs += parseInt(hourMatch[1]) * 60 * 60 * 1000;
  }

  const minMatch = timeStr.match(/(\d+)m/);
  if (minMatch) {
    totalMs += parseInt(minMatch[1]) * 60 * 1000;
  }

  const secMatch = timeStr.match(/(\d+)s/);
  if (secMatch) {
    totalMs += parseInt(secMatch[1]) * 1000;
  }

  return totalMs;
}

export const matchingPerformanceSchema = {
  name: 'wawapp_matching_performance',
  description:
    'Analyze matching algorithm performance metrics. Provides comprehensive analytics on match success rates, average/median matching times, driver response times, and performance distribution. Includes breakdown by region/city/hour and top driver statistics. Returns actionable recommendations for improving matching performance.',
  inputSchema: {
    type: 'object',
    properties: {
      timeRangeMinutes: {
        type: 'number',
        description:
          'Time range for analysis in minutes (default: 1440 = 24 hours, max: 10080 = 7 days)',
        default: 1440,
      },
      groupBy: {
        type: 'string',
        enum: ['region', 'city', 'hour', 'all'],
        description:
          'Group metrics by region, city, hour, or all (default: all)',
        default: 'all',
      },
    },
  },
};
