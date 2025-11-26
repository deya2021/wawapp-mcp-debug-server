/**
 * Kit 5: Notification Delivery Tracker
 * Tool: wawapp_notification_batch_check
 *
 * Bulk notification health check for multiple users.
 * Aggregated health report across drivers or clients.
 *
 * @author WawApp Development Team
 * @date 2025-11-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { getAge } from '../../utils/time-helpers.js';

const InputSchema = z.object({
  userType: z
    .enum(['driver', 'client', 'all'])
    .describe('User type to check (driver, client, or all)'),
  region: z.string().optional().describe('Filter by region (optional)'),
  city: z.string().optional().describe('Filter by city (optional)'),
  onlineOnly: z
    .boolean()
    .default(false)
    .describe('Only check online users (drivers only, default: false)'),
  limit: z
    .number()
    .min(1)
    .max(1000)
    .default(100)
    .describe('Maximum users to check (default: 100, max: 1000)'),
});

type NotificationBatchCheckInput = z.infer<typeof InputSchema>;

interface NotificationBatchCheckResult {
  summary: string;
  filters: {
    userType: string;
    region?: string;
    city?: string;
    onlineOnly: boolean;
  };
  overall: {
    totalUsers: number;
    withValidTokens: number;
    withStaleTokens: number;
    withoutTokens: number;
    healthRate: string;
  };
  breakdown: {
    byHealth: {
      healthy: number;
      warning: number;
      critical: number;
    };
    byUserType?: {
      drivers?: {
        total: number;
        withTokens: number;
        withoutTokens: number;
      };
      clients?: {
        total: number;
        withTokens: number;
        withoutTokens: number;
      };
    };
  };
  issues: Array<{
    userId: string;
    userType: string;
    issue: string;
    severity: 'warning' | 'critical';
  }>;
  recommendations: string[];
}

export async function notificationBatchCheck(
  params: unknown
): Promise<NotificationBatchCheckResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  const issues: NotificationBatchCheckResult['issues'] = [];
  let totalUsers = 0;
  let withValidTokens = 0;
  let withStaleTokens = 0;
  let withoutTokens = 0;

  const breakdown = {
    byHealth: {
      healthy: 0,
      warning: 0,
      critical: 0,
    },
    byUserType: {
      drivers: {
        total: 0,
        withTokens: 0,
        withoutTokens: 0,
      },
      clients: {
        total: 0,
        withTokens: 0,
        withoutTokens: 0,
      },
    },
  };

  try {
    // Check drivers if requested
    if (input.userType === 'driver' || input.userType === 'all') {
      let drivers = await firestore.queryDocuments('drivers', [], {
        limit: input.limit,
      });

      // Apply filters
      if (input.region) {
        drivers = drivers.filter((d) => d.region === input.region);
      }
      if (input.city) {
        drivers = drivers.filter((d) => d.city === input.city);
      }
      if (input.onlineOnly) {
        drivers = drivers.filter((d) => d.isOnline === true);
      }

      breakdown.byUserType.drivers!.total = drivers.length;

      for (const driver of drivers) {
        totalUsers++;
        const result = await checkUserToken(
          driver.id,
          'driver',
          driver,
          firestore
        );

        if (result.hasValidToken) {
          withValidTokens++;
          breakdown.byUserType.drivers!.withTokens++;
        } else if (result.hasStaleToken) {
          withStaleTokens++;
          breakdown.byUserType.drivers!.withTokens++;
        } else {
          withoutTokens++;
          breakdown.byUserType.drivers!.withoutTokens++;
        }

        if (result.health === 'healthy') {
          breakdown.byHealth.healthy++;
        } else if (result.health === 'warning') {
          breakdown.byHealth.warning++;
          issues.push({
            userId: driver.id,
            userType: 'driver',
            issue: result.issue || 'Token health warning',
            severity: 'warning',
          });
        } else {
          breakdown.byHealth.critical++;
          issues.push({
            userId: driver.id,
            userType: 'driver',
            issue: result.issue || 'No FCM token',
            severity: 'critical',
          });
        }
      }
    }

    // Check clients if requested
    if (input.userType === 'client' || input.userType === 'all') {
      let clients = await firestore.queryDocuments('users', [], {
        limit: input.limit,
      });

      // Apply filters
      if (input.region) {
        clients = clients.filter((c) => c.region === input.region);
      }
      if (input.city) {
        clients = clients.filter((c) => c.city === input.city);
      }

      breakdown.byUserType.clients!.total = clients.length;

      for (const client of clients) {
        totalUsers++;
        const result = await checkUserToken(
          client.id,
          'client',
          client,
          firestore
        );

        if (result.hasValidToken) {
          withValidTokens++;
          breakdown.byUserType.clients!.withTokens++;
        } else if (result.hasStaleToken) {
          withStaleTokens++;
          breakdown.byUserType.clients!.withTokens++;
        } else {
          withoutTokens++;
          breakdown.byUserType.clients!.withoutTokens++;
        }

        if (result.health === 'healthy') {
          breakdown.byHealth.healthy++;
        } else if (result.health === 'warning') {
          breakdown.byHealth.warning++;
          issues.push({
            userId: client.id,
            userType: 'client',
            issue: result.issue || 'Token health warning',
            severity: 'warning',
          });
        } else {
          breakdown.byHealth.critical++;
          issues.push({
            userId: client.id,
            userType: 'client',
            issue: result.issue || 'No FCM token',
            severity: 'critical',
          });
        }
      }
    }

    // Calculate health rate
    const healthRate =
      totalUsers > 0
        ? `${Math.round((withValidTokens / totalUsers) * 100)}%`
        : '0%';

    // Generate recommendations
    const recommendations: string[] = [];

    const healthPct = parseFloat(healthRate);

    if (healthPct < 50) {
      recommendations.push(
        `🚨 CRITICAL: Only ${healthRate} of users have valid FCM tokens. Major notification delivery issues expected.`
      );
      recommendations.push(
        `- ${withoutTokens} users have no token at all. They need to reinstall or grant notification permissions.`
      );
      recommendations.push(
        `- ${withStaleTokens} users have stale tokens (>60 days). Encourage logout/login to refresh.`
      );
    } else if (healthPct < 80) {
      recommendations.push(
        `⚠️ ${healthRate} of users have valid FCM tokens. Some notification issues may occur.`
      );
      recommendations.push(
        `- ${withoutTokens} users without tokens need to grant notification permissions.`
      );
    } else {
      recommendations.push(
        `✅ Good FCM token health (${healthRate}). Most users can receive notifications.`
      );
    }

    if (breakdown.byHealth.critical > 0) {
      recommendations.push(
        `- ${breakdown.byHealth.critical} users have critical issues (no token or very stale).`
      );
    }

    if (breakdown.byHealth.warning > 0) {
      recommendations.push(
        `- ${breakdown.byHealth.warning} users have warnings (stale tokens).`
      );
    }

    // Build summary
    const userTypeDesc =
      input.userType === 'all'
        ? 'all users'
        : input.userType === 'driver'
          ? 'drivers'
          : 'clients';

    const summary = `Checked ${totalUsers} ${userTypeDesc}. ${withValidTokens} have valid tokens (${healthRate}), ${withStaleTokens} have stale tokens, ${withoutTokens} have no tokens. ${breakdown.byHealth.critical} critical issues, ${breakdown.byHealth.warning} warnings.`;

    return {
      summary,
      filters: {
        userType: input.userType,
        region: input.region,
        city: input.city,
        onlineOnly: input.onlineOnly,
      },
      overall: {
        totalUsers,
        withValidTokens,
        withStaleTokens,
        withoutTokens,
        healthRate,
      },
      breakdown,
      issues: issues.slice(0, 20), // Limit to top 20 issues
      recommendations,
    };
  } catch (error: any) {
    throw new Error(
      `[notification-batch-check] Failed to check notifications: ${error.message}`
    );
  }
}

async function checkUserToken(
  userId: string,
  userType: 'driver' | 'client',
  userDoc: any,
  firestore: FirestoreClient
): Promise<{
  hasValidToken: boolean;
  hasStaleToken: boolean;
  health: 'healthy' | 'warning' | 'critical';
  issue?: string;
}> {
  const fcmToken = userDoc.fcmToken as string | undefined;

  if (!fcmToken || fcmToken === '') {
    return {
      hasValidToken: false,
      hasStaleToken: false,
      health: 'critical',
      issue: 'No FCM token',
    };
  }

  // Check token age
  const fcmTokenUpdatedAt = userDoc.fcmTokenUpdatedAt;

  if (fcmTokenUpdatedAt) {
    const updatedDate = firestore.timestampToDate(fcmTokenUpdatedAt);
    if (updatedDate) {
      const daysSinceUpdate = Math.floor(
        (Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceUpdate > 60) {
        return {
          hasValidToken: false,
          hasStaleToken: true,
          health: 'warning',
          issue: `Token is ${daysSinceUpdate} days old`,
        };
      }
    }
  }

  return {
    hasValidToken: true,
    hasStaleToken: false,
    health: 'healthy',
  };
}

export const notificationBatchCheckSchema = {
  name: 'wawapp_notification_batch_check',
  description:
    'Bulk notification health check for multiple users (drivers, clients, or all). Returns aggregated health report: total users, users with valid/stale/no tokens, health rate percentage, breakdown by user type, and list of issues. Useful for proactive monitoring of notification delivery capability across the user base.',
  inputSchema: {
    type: 'object',
    properties: {
      userType: {
        type: 'string',
        enum: ['driver', 'client', 'all'],
        description: 'User type to check (driver, client, or all)',
      },
      region: {
        type: 'string',
        description: 'Filter by region (optional)',
      },
      city: {
        type: 'string',
        description: 'Filter by city (optional)',
      },
      onlineOnly: {
        type: 'boolean',
        description: 'Only check online users (drivers only, default: false)',
        default: false,
      },
      limit: {
        type: 'number',
        description: 'Maximum users to check (default: 100, max: 1000)',
        default: 100,
      },
    },
    required: ['userType'],
  },
};
