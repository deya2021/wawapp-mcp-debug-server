/**
 * Kit 7: System Health Dashboard
 * Tool: wawapp_active_users
 *
 * Shows active users (drivers and clients) in the system.
 * Helps understand current system load and user engagement.
 *
 * @author WawApp Development Team
 * @date 2025-01-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { getAge } from '../../utils/time-helpers.js';

const InputSchema = z.object({
  timeRangeMinutes: z.number().min(1).max(1440).optional().default(60),
  userType: z.enum(['all', 'drivers', 'clients']).optional().default('all'),
});

interface ActiveUser {
  id: string;
  type: 'driver' | 'client';
  lastActive: string;
  lastActiveAge: string;
  isOnline?: boolean;
  isVerified?: boolean;
  currentStatus?: string;
}

interface ActiveUsersReport {
  timestamp: string;
  timeRange: string;
  userType: string;
  summary: {
    totalActiveDrivers: number;
    totalActiveClients: number;
    totalActive: number;
    onlineDrivers: number;
    verifiedDrivers: number;
  };
  activeUsers: ActiveUser[];
  insights: string[];
  recommendations: string[];
}

export async function activeUsers(params: unknown): Promise<ActiveUsersReport> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const now = new Date();
  const timeRangeMs = input.timeRangeMinutes * 60 * 1000;
  const thresholdDate = new Date(now.getTime() - timeRangeMs);
  const insights: string[] = [];
  const recommendations: string[] = [];
  const activeUsersList: ActiveUser[] = [];

  let totalActiveDrivers = 0;
  let totalActiveClients = 0;
  let onlineDrivers = 0;
  let verifiedDrivers = 0;

  // === FETCH DRIVERS ===
  if (input.userType === 'all' || input.userType === 'drivers') {
    try {
      const drivers = await firestore.queryDocuments(
        'drivers',
        [],
        { orderBy: { field: 'updatedAt', direction: 'desc' }, limit: 200 }
      );

      const activeDriversList = drivers.filter((driver) => {
        const updatedAt = firestore.timestampToDate(driver.updatedAt);
        return updatedAt && updatedAt > thresholdDate;
      });

      totalActiveDrivers = activeDriversList.length;

      activeDriversList.forEach((driver) => {
        const updatedAt = firestore.timestampToDate(driver.updatedAt);
        if (!updatedAt) return;

        const lastActiveAge = getAge(updatedAt);
        const isOnline = driver.isOnline === true;
        const isVerified = driver.isVerified === true;

        if (isOnline) onlineDrivers++;
        if (isVerified) verifiedDrivers++;

        activeUsersList.push({
          id: driver.id,
          type: 'driver',
          lastActive: updatedAt.toISOString(),
          lastActiveAge,
          isOnline,
          isVerified,
          currentStatus: isOnline ? 'online' : 'offline',
        });
      });

      // Driver insights
      if (totalActiveDrivers === 0) {
        insights.push('⚠️ No drivers active in the specified time range');
        recommendations.push('Check driver engagement and app usage patterns');
      } else {
        insights.push(`✅ ${totalActiveDrivers} driver(s) active recently`);

        const onlineRate =
          totalActiveDrivers > 0
            ? Math.round((onlineDrivers / totalActiveDrivers) * 100)
            : 0;
        insights.push(`📊 ${onlineRate}% of active drivers are currently online`);

        if (onlineRate < 30) {
          recommendations.push(
            'Low online rate - consider driver incentives during peak hours'
          );
        }

        const verifiedRate =
          totalActiveDrivers > 0
            ? Math.round((verifiedDrivers / totalActiveDrivers) * 100)
            : 0;
        if (verifiedRate < 70) {
          insights.push(
            `⚠️ Only ${verifiedRate}% of active drivers are verified`
          );
          recommendations.push('Review driver verification process');
        }
      }
    } catch (error) {
      insights.push(`❌ Error fetching drivers: ${error}`);
    }
  }

  // === FETCH CLIENTS ===
  if (input.userType === 'all' || input.userType === 'clients') {
    try {
      const clients = await firestore.queryDocuments(
        'users',
        [],
        { orderBy: { field: 'updatedAt', direction: 'desc' }, limit: 200 }
      );

      const activeClientsList = clients.filter((client) => {
        const updatedAt = firestore.timestampToDate(client.updatedAt);
        return updatedAt && updatedAt > thresholdDate;
      });

      totalActiveClients = activeClientsList.length;

      activeClientsList.forEach((client) => {
        const updatedAt = firestore.timestampToDate(client.updatedAt);
        if (!updatedAt) return;

        const lastActiveAge = getAge(updatedAt);

        activeUsersList.push({
          id: client.id,
          type: 'client',
          lastActive: updatedAt.toISOString(),
          lastActiveAge,
        });
      });

      // Client insights
      if (totalActiveClients === 0) {
        insights.push('⚠️ No clients active in the specified time range');
        recommendations.push(
          'Low client activity - check marketing campaigns and app engagement'
        );
      } else {
        insights.push(`✅ ${totalActiveClients} client(s) active recently`);
      }
    } catch (error) {
      insights.push(`❌ Error fetching clients: ${error}`);
    }
  }

  // === OVERALL INSIGHTS ===
  const totalActive = totalActiveDrivers + totalActiveClients;

  if (totalActive === 0) {
    insights.push('🚨 No active users in the system!');
    recommendations.push(
      'Critical: System appears inactive. Check:\n' +
        '1. App deployment status\n' +
        '2. Firebase connectivity\n' +
        '3. User authentication issues'
    );
  } else {
    insights.push(`📈 Total active users: ${totalActive}`);

    // Driver-to-client ratio
    if (totalActiveDrivers > 0 && totalActiveClients > 0) {
      const ratio = (totalActiveClients / totalActiveDrivers).toFixed(1);
      insights.push(`👥 Client-to-driver ratio: ${ratio}:1`);

      if (parseFloat(ratio) > 10) {
        recommendations.push(
          `High client-to-driver ratio (${ratio}:1) - consider recruiting more drivers`
        );
      } else if (parseFloat(ratio) < 2) {
        recommendations.push(
          `Low client-to-driver ratio (${ratio}:1) - focus on client acquisition`
        );
      }
    }
  }

  // Final recommendations
  if (recommendations.length === 0) {
    recommendations.push(
      '✅ User activity levels are healthy',
      'Continue monitoring engagement trends'
    );
  }

  recommendations.push(
    '',
    '📊 User Engagement Tips:',
    '- Monitor daily active users (DAU) trends',
    '- Track user retention rates',
    '- Analyze peak usage hours',
    '- Review onboarding completion rates'
  );

  return {
    timestamp: now.toISOString(),
    timeRange: `Last ${input.timeRangeMinutes} minutes`,
    userType: input.userType,
    summary: {
      totalActiveDrivers,
      totalActiveClients,
      totalActive,
      onlineDrivers,
      verifiedDrivers,
    },
    activeUsers: activeUsersList.slice(0, 50), // Limit to 50 for readability
    insights,
    recommendations,
  };
}
