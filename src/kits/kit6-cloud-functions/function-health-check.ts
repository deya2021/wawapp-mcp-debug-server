/**
 * Kit 6: Cloud Function Execution Observer
 * Tool: wawapp_function_health_check
 *
 * Checks overall health of Cloud Functions deployment.
 * Identifies common issues and configuration problems.
 *
 * @author WawApp Development Team
 * @date 2025-01-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';

const InputSchema = z.object({
  timeRangeMinutes: z.number().min(1).max(1440).optional().default(60),
});

interface HealthCheck {
  check: string;
  status: 'healthy' | 'warning' | 'unhealthy' | 'unknown';
  details: string;
  recommendation?: string;
}

interface FunctionHealthCheck {
  timestamp: string;
  timeRange: string;
  checks: {
    expireStaleOrdersScheduler: HealthCheck;
    staleOrdersPresence: HealthCheck;
    recentOrdersActivity: HealthCheck;
    completedOrdersWithRatings: HealthCheck;
  };
  summary: {
    healthy: number;
    warnings: number;
    unhealthy: number;
    unknown: number;
  };
  overallHealth: 'healthy' | 'degraded' | 'unhealthy';
  recommendations: string[];
}

export async function functionHealthCheck(
  params: unknown
): Promise<FunctionHealthCheck> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const now = new Date();
  const timeRangeMs = input.timeRangeMinutes * 60 * 1000;
  const thresholdDate = new Date(now.getTime() - timeRangeMs);
  const recommendations: string[] = [];

  const checks: FunctionHealthCheck['checks'] = {
    expireStaleOrdersScheduler: {
      check: 'expireStaleOrders Scheduler Active',
      status: 'unknown',
      details: 'Cannot verify Cloud Scheduler status via Firestore',
      recommendation:
        'Manually verify in Cloud Console: https://console.cloud.google.com/cloudscheduler',
    },
    staleOrdersPresence: {
      check: 'No Stale Orders (>10 min in matching)',
      status: 'unknown',
      details: 'Checking...',
    },
    recentOrdersActivity: {
      check: 'Recent Orders Activity',
      status: 'unknown',
      details: 'Checking...',
    },
    completedOrdersWithRatings: {
      check: 'Completed Orders Have Ratings',
      status: 'unknown',
      details: 'Checking...',
    },
  };

  // Check 1: Stale orders presence (indicates expireStaleOrders may not be running)
  try {
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const staleOrders = await firestore.queryDocuments(
      'orders',
      [
        { field: 'status', operator: '==', value: 'matching' },
        { field: 'assignedDriverId', operator: '==', value: null },
      ],
      { limit: 10 }
    );

    const veryStaleOrders = staleOrders.filter((order) => {
      const createdAt = firestore.timestampToDate(order.createdAt);
      return createdAt && createdAt < tenMinutesAgo;
    });

    if (veryStaleOrders.length === 0) {
      checks.staleOrdersPresence = {
        check: 'No Stale Orders (>10 min in matching)',
        status: 'healthy',
        details: 'No orders older than 10 minutes in "matching" status',
      };
    } else {
      checks.staleOrdersPresence = {
        check: 'No Stale Orders (>10 min in matching)',
        status: 'unhealthy',
        details: `Found ${veryStaleOrders.length} order(s) >10 minutes old still in "matching" status`,
        recommendation:
          'expireStaleOrders function may not be running. Check:\n' +
          '1. Cloud Scheduler is enabled\n' +
          '2. Cloud Function is deployed\n' +
          '3. Function logs for errors: firebase functions:log --only expireStaleOrders',
      };

      recommendations.push(
        `🚨 ${veryStaleOrders.length} stale orders detected - expireStaleOrders may not be running`
      );
    }
  } catch (error) {
    checks.staleOrdersPresence = {
      check: 'No Stale Orders (>10 min in matching)',
      status: 'unknown',
      details: `Error checking stale orders: ${error}`,
    };
  }

  // Check 2: Recent orders activity (indicates system is being used)
  try {
    const recentOrders = await firestore.queryDocuments(
      'orders',
      [],
      {
        orderBy: { field: 'createdAt', direction: 'desc' },
        limit: 10,
      }
    );

    const veryRecentOrders = recentOrders.filter((order) => {
      const createdAt = firestore.timestampToDate(order.createdAt);
      return createdAt && createdAt > thresholdDate;
    });

    if (veryRecentOrders.length > 0) {
      checks.recentOrdersActivity = {
        check: 'Recent Orders Activity',
        status: 'healthy',
        details: `${veryRecentOrders.length} order(s) created in last ${input.timeRangeMinutes} minutes`,
      };
    } else {
      checks.recentOrdersActivity = {
        check: 'Recent Orders Activity',
        status: 'warning',
        details: `No orders created in last ${input.timeRangeMinutes} minutes`,
        recommendation: 'Low activity - this may be normal during off-peak hours',
      };
    }
  } catch (error) {
    checks.recentOrdersActivity = {
      check: 'Recent Orders Activity',
      status: 'unknown',
      details: `Error checking recent orders: ${error}`,
    };
  }

  // Check 3: Completed orders have ratings (indicates aggregateDriverRating is working)
  try {
    const completedOrders = await firestore.queryDocuments(
      'orders',
      [{ field: 'status', operator: '==', value: 'completed' }],
      { limit: 20, orderBy: { field: 'updatedAt', direction: 'desc' } }
    );

    const recentCompletedOrders = completedOrders.filter((order) => {
      const updatedAt = firestore.timestampToDate(order.updatedAt);
      return updatedAt && updatedAt > thresholdDate;
    });

    if (recentCompletedOrders.length === 0) {
      checks.completedOrdersWithRatings = {
        check: 'Completed Orders Have Ratings',
        status: 'warning',
        details: `No orders completed in last ${input.timeRangeMinutes} minutes`,
        recommendation: 'Cannot verify aggregateDriverRating - no recent completions',
      };
    } else {
      const ordersWithRatings = recentCompletedOrders.filter(
        (order) => order.rating !== undefined && order.rating !== null
      );
      const ratingPercentage = Math.round(
        (ordersWithRatings.length / recentCompletedOrders.length) * 100
      );

      if (ratingPercentage >= 70) {
        checks.completedOrdersWithRatings = {
          check: 'Completed Orders Have Ratings',
          status: 'healthy',
          details: `${ordersWithRatings.length}/${recentCompletedOrders.length} completed orders have ratings (${ratingPercentage}%)`,
        };
      } else if (ratingPercentage >= 30) {
        checks.completedOrdersWithRatings = {
          check: 'Completed Orders Have Ratings',
          status: 'warning',
          details: `Only ${ordersWithRatings.length}/${recentCompletedOrders.length} completed orders have ratings (${ratingPercentage}%)`,
          recommendation:
            'Low rating rate - may indicate:\n' +
            '1. Clients not submitting ratings\n' +
            '2. Rating UI/UX issues\n' +
            '3. aggregateDriverRating function issues',
        };

        recommendations.push(
          `⚠️ Low rating rate: ${ratingPercentage}% - investigate rating flow`
        );
      } else {
        checks.completedOrdersWithRatings = {
          check: 'Completed Orders Have Ratings',
          status: 'unhealthy',
          details: `Very low rating rate: ${ordersWithRatings.length}/${recentCompletedOrders.length} (${ratingPercentage}%)`,
          recommendation:
            'Critical: Very few ratings being submitted. Check:\n' +
            '1. Rating screen accessibility\n' +
            '2. aggregateDriverRating function logs\n' +
            '3. Client app rating flow',
        };

        recommendations.push(
          `🚨 Critical: Only ${ratingPercentage}% of orders have ratings`
        );
      }
    }
  } catch (error) {
    checks.completedOrdersWithRatings = {
      check: 'Completed Orders Have Ratings',
      status: 'unknown',
      details: `Error checking completed orders: ${error}`,
    };
  }

  // Calculate summary
  const allChecks = Object.values(checks);
  const summary = {
    healthy: allChecks.filter((c) => c.status === 'healthy').length,
    warnings: allChecks.filter((c) => c.status === 'warning').length,
    unhealthy: allChecks.filter((c) => c.status === 'unhealthy').length,
    unknown: allChecks.filter((c) => c.status === 'unknown').length,
  };

  // Determine overall health
  let overallHealth: 'healthy' | 'degraded' | 'unhealthy';
  if (summary.unhealthy > 0) {
    overallHealth = 'unhealthy';
  } else if (summary.warnings > 0 || summary.unknown > 1) {
    overallHealth = 'degraded';
  } else {
    overallHealth = 'healthy';
  }

  // Add general recommendations
  if (recommendations.length === 0) {
    recommendations.push('✅ All checks passed - Cloud Functions appear healthy');
  }

  recommendations.push(
    '',
    '📋 Manual Verification Steps:',
    '',
    '1. Check Cloud Scheduler status:',
    '   https://console.cloud.google.com/cloudscheduler',
    '',
    '2. View all function logs:',
    '   firebase functions:log --lines 100',
    '',
    '3. Check Cloud Functions deployment status:',
    '   firebase functions:list',
    '',
    '4. Monitor function execution metrics:',
    '   https://console.cloud.google.com/functions/list'
  );

  return {
    timestamp: now.toISOString(),
    timeRange: `Last ${input.timeRangeMinutes} minutes`,
    checks,
    summary,
    overallHealth,
    recommendations,
  };
}
