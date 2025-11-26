/**
 * Kit 7: System Health Dashboard
 * Tool: wawapp_system_health
 *
 * Comprehensive system health overview for WawApp.
 * Combines metrics from orders, drivers, clients, and Cloud Functions.
 *
 * @author WawApp Development Team
 * @date 2025-01-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';

const InputSchema = z.object({
  timeRangeMinutes: z.number().min(1).max(1440).optional().default(60),
});

interface HealthMetric {
  metric: string;
  value: string | number;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  trend?: 'up' | 'down' | 'stable';
  details?: string;
}

interface SystemHealth {
  timestamp: string;
  timeRange: string;
  overallHealth: 'healthy' | 'degraded' | 'critical';
  metrics: {
    orders: {
      total: HealthMetric;
      active: HealthMetric;
      completed: HealthMetric;
      expired: HealthMetric;
      staleMatching: HealthMetric;
    };
    drivers: {
      total: HealthMetric;
      online: HealthMetric;
      verified: HealthMetric;
    };
    clients: {
      total: HealthMetric;
      activeToday: HealthMetric;
    };
    performance: {
      avgMatchingTime: HealthMetric;
      completionRate: HealthMetric;
      ratingRate: HealthMetric;
    };
  };
  alerts: string[];
  recommendations: string[];
}

export async function systemHealth(params: unknown): Promise<SystemHealth> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const now = new Date();
  const timeRangeMs = input.timeRangeMinutes * 60 * 1000;
  const thresholdDate = new Date(now.getTime() - timeRangeMs);
  const alerts: string[] = [];
  const recommendations: string[] = [];

  // Initialize metrics
  const metrics: SystemHealth['metrics'] = {
    orders: {
      total: { metric: 'Total Orders', value: 0, status: 'unknown' },
      active: { metric: 'Active Orders', value: 0, status: 'unknown' },
      completed: { metric: 'Completed Orders', value: 0, status: 'unknown' },
      expired: { metric: 'Expired Orders', value: 0, status: 'unknown' },
      staleMatching: { metric: 'Stale Matching Orders', value: 0, status: 'unknown' },
    },
    drivers: {
      total: { metric: 'Total Drivers', value: 0, status: 'unknown' },
      online: { metric: 'Online Drivers', value: 0, status: 'unknown' },
      verified: { metric: 'Verified Drivers', value: 0, status: 'unknown' },
    },
    clients: {
      total: { metric: 'Total Clients', value: 0, status: 'unknown' },
      activeToday: { metric: 'Active Today', value: 0, status: 'unknown' },
    },
    performance: {
      avgMatchingTime: {
        metric: 'Avg Matching Time',
        value: 'N/A',
        status: 'unknown',
      },
      completionRate: { metric: 'Completion Rate', value: 'N/A', status: 'unknown' },
      ratingRate: { metric: 'Rating Rate', value: 'N/A', status: 'unknown' },
    },
  };

  // === ORDER METRICS ===
  try {
    // Get recent orders
    const recentOrders = await firestore.queryDocuments(
      'orders',
      [],
      { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 100 }
    );

    const ordersInRange = recentOrders.filter((order) => {
      const createdAt = firestore.timestampToDate(order.createdAt);
      return createdAt && createdAt > thresholdDate;
    });

    metrics.orders.total = {
      metric: 'Total Orders',
      value: ordersInRange.length,
      status: ordersInRange.length > 0 ? 'healthy' : 'warning',
      details: `${ordersInRange.length} orders in last ${input.timeRangeMinutes} minutes`,
    };

    // Active orders (matching, accepted, onRoute)
    const activeOrders = ordersInRange.filter(
      (o) =>
        o.status === 'matching' || o.status === 'accepted' || o.status === 'onRoute'
    );
    metrics.orders.active = {
      metric: 'Active Orders',
      value: activeOrders.length,
      status: 'healthy',
      details: `${activeOrders.length} orders currently in progress`,
    };

    // Completed orders
    const completedOrders = ordersInRange.filter((o) => o.status === 'completed');
    metrics.orders.completed = {
      metric: 'Completed Orders',
      value: completedOrders.length,
      status: completedOrders.length > 0 ? 'healthy' : 'warning',
      details: `${completedOrders.length} completed successfully`,
    };

    // Expired orders
    const expiredOrders = ordersInRange.filter((o) => o.status === 'expired');
    const expiredRate =
      ordersInRange.length > 0
        ? Math.round((expiredOrders.length / ordersInRange.length) * 100)
        : 0;

    metrics.orders.expired = {
      metric: 'Expired Orders',
      value: `${expiredOrders.length} (${expiredRate}%)`,
      status: expiredRate > 30 ? 'critical' : expiredRate > 15 ? 'warning' : 'healthy',
      details: `${expiredRate}% expiration rate`,
    };

    if (expiredRate > 30) {
      alerts.push(`🚨 High expiration rate: ${expiredRate}%`);
      recommendations.push(
        'Critical: Too many orders expiring. Check driver availability and matching algorithm.'
      );
    }

    // Stale matching orders (>10 minutes)
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const staleOrders = ordersInRange.filter((order) => {
      const createdAt = firestore.timestampToDate(order.createdAt);
      return (
        order.status === 'matching' &&
        order.assignedDriverId === null &&
        createdAt &&
        createdAt < tenMinutesAgo
      );
    });

    metrics.orders.staleMatching = {
      metric: 'Stale Matching Orders',
      value: staleOrders.length,
      status: staleOrders.length > 0 ? 'critical' : 'healthy',
      details:
        staleOrders.length > 0
          ? `${staleOrders.length} orders >10 minutes old in matching`
          : 'No stale orders',
    };

    if (staleOrders.length > 0) {
      alerts.push(`🚨 ${staleOrders.length} stale orders detected`);
      recommendations.push(
        'Critical: expireStaleOrders function may not be running. Check Cloud Scheduler.'
      );
    }

    // Performance: Completion rate
    const totalNonMatching = ordersInRange.filter((o) => o.status !== 'matching')
      .length;
    const completionRate =
      totalNonMatching > 0
        ? Math.round((completedOrders.length / totalNonMatching) * 100)
        : 0;

    metrics.performance.completionRate = {
      metric: 'Completion Rate',
      value: `${completionRate}%`,
      status: completionRate >= 70 ? 'healthy' : completionRate >= 50 ? 'warning' : 'critical',
      details: `${completedOrders.length}/${totalNonMatching} orders completed`,
    };

    // Performance: Rating rate
    const ordersWithRating = completedOrders.filter(
      (o) => o.rating !== undefined && o.rating !== null
    );
    const ratingRate =
      completedOrders.length > 0
        ? Math.round((ordersWithRating.length / completedOrders.length) * 100)
        : 0;

    metrics.performance.ratingRate = {
      metric: 'Rating Rate',
      value: `${ratingRate}%`,
      status: ratingRate >= 70 ? 'healthy' : ratingRate >= 40 ? 'warning' : 'critical',
      details: `${ordersWithRating.length}/${completedOrders.length} orders rated`,
    };

    if (ratingRate < 40 && completedOrders.length > 0) {
      alerts.push(`⚠️ Low rating rate: ${ratingRate}%`);
      recommendations.push('Check rating UI/UX and aggregateDriverRating function.');
    }
  } catch (error) {
    alerts.push(`❌ Error fetching order metrics: ${error}`);
  }

  // === DRIVER METRICS ===
  try {
    const allDrivers = await firestore.queryDocuments(
      'drivers',
      [],
      { limit: 1000 }
    );

    metrics.drivers.total = {
      metric: 'Total Drivers',
      value: allDrivers.length,
      status: allDrivers.length > 0 ? 'healthy' : 'warning',
      details: `${allDrivers.length} drivers registered`,
    };

    const onlineDrivers = allDrivers.filter((d) => d.isOnline === true);
    metrics.drivers.online = {
      metric: 'Online Drivers',
      value: onlineDrivers.length,
      status: onlineDrivers.length > 0 ? 'healthy' : 'critical',
      details: `${onlineDrivers.length} drivers currently online`,
    };

    if (onlineDrivers.length === 0 && allDrivers.length > 0) {
      alerts.push('🚨 No drivers online!');
      recommendations.push('Critical: No drivers available to accept orders.');
    }

    const verifiedDrivers = allDrivers.filter((d) => d.isVerified === true);
    const verificationRate =
      allDrivers.length > 0
        ? Math.round((verifiedDrivers.length / allDrivers.length) * 100)
        : 0;

    metrics.drivers.verified = {
      metric: 'Verified Drivers',
      value: `${verifiedDrivers.length} (${verificationRate}%)`,
      status: verificationRate >= 50 ? 'healthy' : verificationRate >= 25 ? 'warning' : 'critical',
      details: `${verificationRate}% verification rate`,
    };
  } catch (error) {
    alerts.push(`❌ Error fetching driver metrics: ${error}`);
  }

  // === CLIENT METRICS ===
  try {
    const allClients = await firestore.queryDocuments(
      'users',
      [],
      { limit: 1000 }
    );

    metrics.clients.total = {
      metric: 'Total Clients',
      value: allClients.length,
      status: allClients.length > 0 ? 'healthy' : 'warning',
      details: `${allClients.length} clients registered`,
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeToday = allClients.filter((client) => {
      const updatedAt = firestore.timestampToDate(client.updatedAt);
      return updatedAt && updatedAt > today;
    });

    metrics.clients.activeToday = {
      metric: 'Active Today',
      value: activeToday.length,
      status: activeToday.length > 0 ? 'healthy' : 'warning',
      details: `${activeToday.length} clients active today`,
    };
  } catch (error) {
    alerts.push(`❌ Error fetching client metrics: ${error}`);
  }

  // === OVERALL HEALTH ASSESSMENT ===
  const allMetrics = [
    ...Object.values(metrics.orders),
    ...Object.values(metrics.drivers),
    ...Object.values(metrics.clients),
    ...Object.values(metrics.performance),
  ];

  const criticalCount = allMetrics.filter((m) => m.status === 'critical').length;
  const warningCount = allMetrics.filter((m) => m.status === 'warning').length;

  let overallHealth: 'healthy' | 'degraded' | 'critical';
  if (criticalCount > 0) {
    overallHealth = 'critical';
  } else if (warningCount > 2) {
    overallHealth = 'degraded';
  } else {
    overallHealth = 'healthy';
  }

  // Final recommendations
  if (alerts.length === 0) {
    recommendations.push('✅ System is healthy - all metrics within normal range');
  }

  recommendations.push(
    '',
    '📊 Monitoring Dashboard:',
    '- Firebase Console: https://console.firebase.google.com',
    '- Cloud Functions: https://console.cloud.google.com/functions',
    '- Cloud Scheduler: https://console.cloud.google.com/cloudscheduler'
  );

  return {
    timestamp: now.toISOString(),
    timeRange: `Last ${input.timeRangeMinutes} minutes`,
    overallHealth,
    metrics,
    alerts,
    recommendations,
  };
}
