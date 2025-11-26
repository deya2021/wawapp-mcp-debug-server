/**
 * Kit 7: System Health Dashboard
 * Tool: wawapp_error_rate_monitor
 *
 * System-wide error detection and monitoring.
 * Scans for common issues across collections.
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
    .max(1440)
    .default(60)
    .describe('Time range for analysis (default: 60, max: 1440)'),
  limit: z
    .number()
    .min(1)
    .max(1000)
    .default(200)
    .describe('Maximum documents to scan per collection (default: 200)'),
});

type ErrorRateMonitorInput = z.infer<typeof InputSchema>;

interface ErrorCategory {
  category: string;
  severity: 'critical' | 'warning' | 'info';
  count: number;
  affectedEntities: string[];
  description: string;
  recommendation: string;
}

interface ErrorRateMonitorResult {
  summary: string;
  timeRange: string;
  overall: {
    totalErrors: number;
    criticalErrors: number;
    warningErrors: number;
    infoErrors: number;
    errorRate: string;
    healthStatus: 'healthy' | 'degraded' | 'critical';
  };
  errors: ErrorCategory[];
  topIssues: Array<{
    issue: string;
    count: number;
    severity: string;
  }>;
  recommendations: string[];
}

export async function errorRateMonitor(
  params: unknown
): Promise<ErrorRateMonitorResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  const now = new Date();
  const timeRangeMs = input.timeRangeMinutes * 60 * 1000;
  const thresholdDate = new Date(now.getTime() - timeRangeMs);

  const errors: ErrorCategory[] = [];
  const recommendations: string[] = [];

  try {
    // 1. Check orders for issues
    let orders = await firestore.queryDocuments('orders', [], {
      limit: input.limit,
      orderBy: { field: 'createdAt', direction: 'desc' },
    });

    orders = orders.filter((order) => {
      const createdAt = firestore.timestampToDate(order.createdAt);
      return createdAt && createdAt >= thresholdDate;
    });

    // Stale orders
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const staleOrders = orders.filter((order) => {
      const createdAt = firestore.timestampToDate(order.createdAt);
      return (
        order.status === 'matching' &&
        !order.driverId &&
        createdAt &&
        createdAt < tenMinutesAgo
      );
    });

    if (staleOrders.length > 0) {
      errors.push({
        category: 'Stale Orders',
        severity: 'critical',
        count: staleOrders.length,
        affectedEntities: staleOrders.map((o) => o.id),
        description: `${staleOrders.length} orders stuck in matching for >10 minutes`,
        recommendation:
          'Check expireStaleOrders Cloud Function and Cloud Scheduler.',
      });
    }

    // Orders with invalid coordinates
    const invalidCoordOrders = orders.filter((order) => {
      const pickupLat = order.pickup?.lat || order.pickup?.latitude;
      const pickupLng = order.pickup?.lng || order.pickup?.longitude;
      return (
        !pickupLat ||
        !pickupLng ||
        pickupLat === 0 ||
        pickupLng === 0 ||
        pickupLat < -90 ||
        pickupLat > 90 ||
        pickupLng < -180 ||
        pickupLng > 180
      );
    });

    if (invalidCoordOrders.length > 0) {
      errors.push({
        category: 'Invalid Coordinates',
        severity: 'critical',
        count: invalidCoordOrders.length,
        affectedEntities: invalidCoordOrders.slice(0, 10).map((o) => o.id),
        description: `${invalidCoordOrders.length} orders have invalid pickup/dropoff coordinates`,
        recommendation:
          'Add coordinate validation in order creation flow. Check map picker implementation.',
      });
    }

    // Orders with missing timestamps
    const missingTimestamps = orders.filter((order) => !order.createdAt);

    if (missingTimestamps.length > 0) {
      errors.push({
        category: 'Missing Timestamps',
        severity: 'critical',
        count: missingTimestamps.length,
        affectedEntities: missingTimestamps.slice(0, 10).map((o) => o.id),
        description: `${missingTimestamps.length} orders missing createdAt timestamp`,
        recommendation:
          'Ensure FieldValue.serverTimestamp() is used when creating orders.',
      });
    }

    // Orders with inconsistent status
    const inconsistentStatus = orders.filter(
      (order) =>
        (order.status === 'completed' && !order.completedAt) ||
        (order.status === 'accepted' && !order.driverId) ||
        (order.status === 'onRoute' && !order.driverId)
    );

    if (inconsistentStatus.length > 0) {
      errors.push({
        category: 'Inconsistent Status',
        severity: 'warning',
        count: inconsistentStatus.length,
        affectedEntities: inconsistentStatus.slice(0, 10).map((o) => o.id),
        description: `${inconsistentStatus.length} orders have status/field mismatches`,
        recommendation:
          'Review order state management logic. Ensure status updates include all required fields.',
      });
    }

    // 2. Check drivers for issues
    let drivers = await firestore.queryDocuments('drivers', [], {
      limit: input.limit,
    });

    // Drivers with incomplete profiles
    const incompleteProfiles = drivers.filter((driver) => {
      const requiredFields = ['name', 'phone', 'city', 'region'];
      return requiredFields.some(
        (field) => !driver[field] || driver[field] === ''
      );
    });

    if (incompleteProfiles.length > 0) {
      errors.push({
        category: 'Incomplete Driver Profiles',
        severity: 'warning',
        count: incompleteProfiles.length,
        affectedEntities: incompleteProfiles.slice(0, 10).map((d) => d.id),
        description: `${incompleteProfiles.length} drivers have incomplete profiles`,
        recommendation:
          'Enforce profile completion in driver onboarding flow.',
      });
    }

    // Drivers without FCM tokens
    const noFcmToken = drivers.filter(
      (driver) => !driver.fcmToken || driver.fcmToken === ''
    );

    if (noFcmToken.length > 0) {
      errors.push({
        category: 'Missing FCM Tokens',
        severity: 'warning',
        count: noFcmToken.length,
        affectedEntities: noFcmToken.slice(0, 10).map((d) => d.id),
        description: `${noFcmToken.length} drivers without FCM tokens`,
        recommendation:
          'Drivers need to grant notification permissions and reopen app.',
      });
    }

    // 3. Calculate overall error rate
    const totalEntities = orders.length + drivers.length;
    const totalErrors = errors.reduce((sum, e) => sum + e.count, 0);
    const errorRate =
      totalEntities > 0
        ? `${Math.round((totalErrors / totalEntities) * 100)}%`
        : '0%';

    const criticalErrors = errors
      .filter((e) => e.severity === 'critical')
      .reduce((sum, e) => sum + e.count, 0);
    const warningErrors = errors
      .filter((e) => e.severity === 'warning')
      .reduce((sum, e) => sum + e.count, 0);
    const infoErrors = errors
      .filter((e) => e.severity === 'info')
      .reduce((sum, e) => sum + e.count, 0);

    // Determine health status
    let healthStatus: 'healthy' | 'degraded' | 'critical';
    if (criticalErrors > 0) {
      healthStatus = 'critical';
    } else if (warningErrors > 10) {
      healthStatus = 'degraded';
    } else {
      healthStatus = 'healthy';
    }

    // Top issues
    const topIssues = errors
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((e) => ({
        issue: e.category,
        count: e.count,
        severity: e.severity,
      }));

    // Generate recommendations
    if (healthStatus === 'critical') {
      recommendations.push(
        `🚨 CRITICAL: ${criticalErrors} critical errors detected. Immediate action required.`
      );
    } else if (healthStatus === 'degraded') {
      recommendations.push(
        `⚠️ System is degraded with ${warningErrors} warnings. Review and address issues.`
      );
    } else {
      recommendations.push(
        `✅ System is healthy. No critical errors detected in ${input.timeRangeMinutes} minutes.`
      );
    }

    for (const error of errors.slice(0, 3)) {
      recommendations.push(`- ${error.category}: ${error.recommendation}`);
    }

    // Build summary
    const timeRangeDesc =
      input.timeRangeMinutes < 60
        ? `${input.timeRangeMinutes} minute(s)`
        : `${Math.round(input.timeRangeMinutes / 60)} hour(s)`;

    const summary = `Scanned ${totalEntities} entities in ${timeRangeDesc}. Found ${totalErrors} errors (${errorRate}): ${criticalErrors} critical, ${warningErrors} warnings. Health: ${healthStatus}.${topIssues.length > 0 ? ` Top issue: ${topIssues[0].issue} (${topIssues[0].count}).` : ''}`;

    return {
      summary,
      timeRange: timeRangeDesc,
      overall: {
        totalErrors,
        criticalErrors,
        warningErrors,
        infoErrors,
        errorRate,
        healthStatus,
      },
      errors,
      topIssues,
      recommendations,
    };
  } catch (error: any) {
    throw new Error(
      `[error-rate-monitor] Failed to monitor errors: ${error.message}`
    );
  }
}

export const errorRateMonitorSchema = {
  name: 'wawapp_error_rate_monitor',
  description:
    'System-wide error detection and monitoring. Scans orders and drivers for common issues: stale orders, invalid coordinates, missing timestamps, inconsistent status, incomplete profiles, missing FCM tokens. Returns categorized errors by severity (critical/warning/info), error rate percentage, health status, top issues, and actionable recommendations.',
  inputSchema: {
    type: 'object',
    properties: {
      timeRangeMinutes: {
        type: 'number',
        description: 'Time range for analysis (default: 60, max: 1440)',
        default: 60,
      },
      limit: {
        type: 'number',
        description: 'Maximum documents to scan per collection (default: 200, max: 1000)',
        default: 200,
      },
    },
  },
};
