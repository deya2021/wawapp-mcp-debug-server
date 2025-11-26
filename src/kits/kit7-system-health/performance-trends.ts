/**
 * Kit 7: System Health Dashboard
 * Tool: wawapp_performance_trends
 *
 * Historical performance analysis and trend detection.
 * Compare metrics over time periods.
 *
 * @author WawApp Development Team
 * @date 2025-11-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';

const InputSchema = z.object({
  timeRangeHours: z
    .number()
    .min(1)
    .max(168)
    .default(24)
    .describe('Time range for analysis in hours (default: 24, max: 168 = 7 days)'),
  compareWithPrevious: z
    .boolean()
    .default(true)
    .describe('Compare with previous time period (default: true)'),
});

type PerformanceTrendsInput = z.infer<typeof InputSchema>;

interface PeriodMetrics {
  totalOrders: number;
  completedOrders: number;
  expiredOrders: number;
  completionRate: string;
  avgMatchingTimeMinutes: number;
  onlineDriversAvg: number;
  ordersPerDriver: number;
}

interface PerformanceTrendsResult {
  summary: string;
  timeRange: {
    hours: number;
    description: string;
    currentPeriod: { start: string; end: string };
    previousPeriod?: { start: string; end: string };
  };
  current: PeriodMetrics;
  previous?: PeriodMetrics;
  trends: {
    orderVolume: { change: string; direction: 'up' | 'down' | 'stable' };
    completionRate: { change: string; direction: 'up' | 'down' | 'stable' };
    matchingTime: { change: string; direction: 'up' | 'down' | 'stable' };
    driverAvailability: { change: string; direction: 'up' | 'down' | 'stable' };
  };
  insights: string[];
  recommendations: string[];
}

export async function performanceTrends(
  params: unknown
): Promise<PerformanceTrendsResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  const now = new Date();
  const timeRangeMs = input.timeRangeHours * 60 * 60 * 1000;

  // Current period
  const currentStart = new Date(now.getTime() - timeRangeMs);
  const currentEnd = now;

  // Previous period (for comparison)
  const previousStart = new Date(currentStart.getTime() - timeRangeMs);
  const previousEnd = currentStart;

  const insights: string[] = [];
  const recommendations: string[] = [];

  try {
    // Fetch orders
    const allOrders = await firestore.queryDocuments('orders', [], {
      limit: 2000,
      orderBy: { field: 'createdAt', direction: 'desc' },
    });

    // Calculate current period metrics
    const current = await calculatePeriodMetrics(
      allOrders,
      currentStart,
      currentEnd,
      firestore
    );

    // Calculate previous period metrics if requested
    let previous: PeriodMetrics | undefined;
    let trends: PerformanceTrendsResult['trends'] | undefined;

    if (input.compareWithPrevious) {
      previous = await calculatePeriodMetrics(
        allOrders,
        previousStart,
        previousEnd,
        firestore
      );

      // Calculate trends
      trends = {
        orderVolume: calculateTrend(current.totalOrders, previous.totalOrders),
        completionRate: calculateTrend(
          parseFloat(current.completionRate),
          parseFloat(previous.completionRate)
        ),
        matchingTime: calculateTrend(
          previous.avgMatchingTimeMinutes,
          current.avgMatchingTimeMinutes
        ), // Reversed: lower is better
        driverAvailability: calculateTrend(
          current.onlineDriversAvg,
          previous.onlineDriversAvg
        ),
      };

      // Generate insights
      if (trends.orderVolume.direction === 'up') {
        insights.push(
          `📈 Order volume increased by ${trends.orderVolume.change} compared to previous period.`
        );
      } else if (trends.orderVolume.direction === 'down') {
        insights.push(
          `📉 Order volume decreased by ${trends.orderVolume.change} compared to previous period.`
        );
        recommendations.push(
          '⚠️ Order volume is declining. Consider marketing campaigns or promotions.'
        );
      }

      if (trends.completionRate.direction === 'down') {
        insights.push(
          `📉 Completion rate dropped by ${trends.completionRate.change}.`
        );
        recommendations.push(
          '🚨 Completion rate is declining. Review driver availability and matching algorithm.'
        );
      } else if (trends.completionRate.direction === 'up') {
        insights.push(
          `📈 Completion rate improved by ${trends.completionRate.change}.`
        );
      }

      if (trends.matchingTime.direction === 'up') {
        insights.push(
          `⚠️ Matching time increased by ${trends.matchingTime.change}.`
        );
        recommendations.push(
          'Review driver supply and matching algorithm performance.'
        );
      } else if (trends.matchingTime.direction === 'down') {
        insights.push(
          `✅ Matching time improved by ${trends.matchingTime.change}.`
        );
      }

      if (trends.driverAvailability.direction === 'down') {
        insights.push(
          `📉 Driver availability decreased by ${trends.driverAvailability.change}.`
        );
        recommendations.push(
          '⚠️ Driver availability is declining. Recruit more drivers or offer incentives.'
        );
      }
    }

    // General insights
    const completionPct = parseFloat(current.completionRate);
    if (completionPct < 50) {
      recommendations.push(
        `🚨 Current completion rate (${current.completionRate}) is critically low.`
      );
    } else if (completionPct >= 70) {
      insights.push(`✅ Strong completion rate (${current.completionRate}).`);
    }

    if (current.avgMatchingTimeMinutes > 5) {
      recommendations.push(
        `⚠️ Matching time (${current.avgMatchingTimeMinutes.toFixed(1)} min) is above target (<3 min).`
      );
    }

    // Build summary
    const timeRangeDesc =
      input.timeRangeHours < 24
        ? `${input.timeRangeHours} hour(s)`
        : `${Math.round(input.timeRangeHours / 24)} day(s)`;

    let summary = `Performance analysis for ${timeRangeDesc}. Current: ${current.totalOrders} orders, ${current.completionRate} completion rate, ${current.avgMatchingTimeMinutes.toFixed(1)} min avg matching time.`;

    if (input.compareWithPrevious && trends) {
      summary += ` Order volume ${trends.orderVolume.direction} ${trends.orderVolume.change}, completion rate ${trends.completionRate.direction} ${trends.completionRate.change}.`;
    }

    return {
      summary,
      timeRange: {
        hours: input.timeRangeHours,
        description: timeRangeDesc,
        currentPeriod: {
          start: currentStart.toISOString(),
          end: currentEnd.toISOString(),
        },
        previousPeriod: input.compareWithPrevious
          ? {
              start: previousStart.toISOString(),
              end: previousEnd.toISOString(),
            }
          : undefined,
      },
      current,
      previous,
      trends: trends!,
      insights,
      recommendations,
    };
  } catch (error: any) {
    throw new Error(
      `[performance-trends] Failed to analyze trends: ${error.message}`
    );
  }
}

async function calculatePeriodMetrics(
  allOrders: any[],
  start: Date,
  end: Date,
  firestore: FirestoreClient
): Promise<PeriodMetrics> {
  // Filter orders in period
  const orders = allOrders.filter((order) => {
    const createdAt = firestore.timestampToDate(order.createdAt);
    return createdAt && createdAt >= start && createdAt < end;
  });

  const totalOrders = orders.length;
  const completedOrders = orders.filter((o) => o.status === 'completed').length;
  const expiredOrders = orders.filter((o) => o.status === 'expired').length;

  const completionRate =
    totalOrders > 0
      ? `${Math.round((completedOrders / totalOrders) * 100)}%`
      : '0%';

  // Calculate avg matching time
  const matchingTimes: number[] = [];

  for (const order of orders) {
    if (order.status !== 'matching' && order.status !== 'expired') {
      const createdAt = firestore.timestampToDate(order.createdAt);
      const updatedAt = firestore.timestampToDate(order.updatedAt);

      if (createdAt && updatedAt) {
        const matchingTimeMs = updatedAt.getTime() - createdAt.getTime();
        matchingTimes.push(matchingTimeMs);
      }
    }
  }

  const avgMatchingTimeMinutes =
    matchingTimes.length > 0
      ? matchingTimes.reduce((sum, t) => sum + t, 0) /
        matchingTimes.length /
        (1000 * 60)
      : 0;

  // Estimate online drivers (rough estimate based on active orders)
  const uniqueDrivers = new Set(orders.map((o) => o.driverId).filter(Boolean))
    .size;
  const onlineDriversAvg = uniqueDrivers;

  const ordersPerDriver =
    onlineDriversAvg > 0 ? totalOrders / onlineDriversAvg : 0;

  return {
    totalOrders,
    completedOrders,
    expiredOrders,
    completionRate,
    avgMatchingTimeMinutes: Math.round(avgMatchingTimeMinutes * 10) / 10,
    onlineDriversAvg,
    ordersPerDriver: Math.round(ordersPerDriver * 10) / 10,
  };
}

function calculateTrend(
  current: number,
  previous: number
): { change: string; direction: 'up' | 'down' | 'stable' } {
  if (previous === 0) {
    return { change: 'N/A', direction: 'stable' };
  }

  const changePct = ((current - previous) / previous) * 100;

  let direction: 'up' | 'down' | 'stable';
  if (Math.abs(changePct) < 5) {
    direction = 'stable';
  } else if (changePct > 0) {
    direction = 'up';
  } else {
    direction = 'down';
  }

  return {
    change: `${Math.abs(Math.round(changePct))}%`,
    direction,
  };
}

export const performanceTrendsSchema = {
  name: 'wawapp_performance_trends',
  description:
    'Historical performance analysis and trend detection. Compares metrics (order volume, completion rate, matching time, driver availability) over time periods. Can compare current period with previous period of same length. Returns trends (up/down/stable), insights, and actionable recommendations.',
  inputSchema: {
    type: 'object',
    properties: {
      timeRangeHours: {
        type: 'number',
        description:
          'Time range for analysis in hours (default: 24, max: 168 = 7 days)',
        default: 24,
      },
      compareWithPrevious: {
        type: 'boolean',
        description: 'Compare with previous time period (default: true)',
        default: true,
      },
    },
  },
};
