/**
 * Kit 6: Cloud Function Execution Observer
 * Tool: wawapp_scheduler_status
 *
 * Check Cloud Scheduler jobs status.
 * Provides insights on scheduled function execution health.
 *
 * @author WawApp Development Team
 * @date 2025-11-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';

const InputSchema = z.object({
  includeInactive: z
    .boolean()
    .default(false)
    .describe('Include disabled/paused jobs (default: false)'),
});

type SchedulerStatusInput = z.infer<typeof InputSchema>;

interface SchedulerJob {
  jobName: string;
  description: string;
  schedule: string;
  functionName: string;
  enabled: boolean;
  lastRunExpected: string;
  nextRunExpected: string;
  healthStatus: 'healthy' | 'warning' | 'unknown';
  healthReason?: string;
}

interface SchedulerStatusResult {
  summary: string;
  jobs: SchedulerJob[];
  overall: {
    totalJobs: number;
    enabledJobs: number;
    disabledJobs: number;
    healthyJobs: number;
    warningJobs: number;
  };
  recommendations: string[];
  note: string;
}

export async function schedulerStatus(
  params: unknown
): Promise<SchedulerStatusResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  // Since we cannot directly query Cloud Scheduler via API from here,
  // we'll infer scheduler status based on system behavior

  // Define known scheduled jobs
  const knownJobs: Omit<SchedulerJob, 'healthStatus' | 'healthReason'>[] = [
    {
      jobName: 'expireStaleOrders',
      description: 'Expire orders stuck in matching for >10 minutes',
      schedule: 'Every 2 minutes',
      functionName: 'expireStaleOrders',
      enabled: true,
      lastRunExpected: '< 2 minutes ago',
      nextRunExpected: 'Within 2 minutes',
    },
    {
      jobName: 'cleanupExpiredSessions',
      description: 'Clean up expired user sessions',
      schedule: 'Every 1 hour',
      functionName: 'cleanupExpiredSessions',
      enabled: true,
      lastRunExpected: '< 1 hour ago',
      nextRunExpected: 'Within 1 hour',
    },
    {
      jobName: 'aggregateDriverRatings',
      description: 'Calculate driver rating averages',
      schedule: 'Every 15 minutes',
      functionName: 'aggregateDriverRatings',
      enabled: true,
      lastRunExpected: '< 15 minutes ago',
      nextRunExpected: 'Within 15 minutes',
    },
  ];

  const recommendations: string[] = [];
  let healthyJobs = 0;
  let warningJobs = 0;

  const jobs: SchedulerJob[] = [];

  try {
    // Infer health of expireStaleOrders job
    const expireStaleOrdersJob = knownJobs[0];
    const orders = await firestore.queryDocuments('orders', [], {
      limit: 100,
      orderBy: {
        field: 'createdAt',
        direction: 'desc',
      },
    });

    const now = new Date();
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

    let expireHealthStatus: 'healthy' | 'warning' | 'unknown' = 'healthy';
    let expireHealthReason: string | undefined;

    if (staleOrders.length > 0) {
      expireHealthStatus = 'warning';
      expireHealthReason = `${staleOrders.length} orders stuck in matching >10 min. Job may not be running.`;
      warningJobs++;
      recommendations.push(
        `⚠️ expireStaleOrders job may not be running. ${staleOrders.length} stale orders detected.`
      );
      recommendations.push(
        `  → Check Cloud Scheduler: https://console.cloud.google.com/cloudscheduler`
      );
      recommendations.push(`  → Verify function is enabled and not rate-limited.`);
    } else {
      expireHealthReason = 'No stale orders detected. Job appears to be working.';
      healthyJobs++;
      recommendations.push(
        `✅ expireStaleOrders job appears healthy (no stale orders detected).`
      );
    }

    jobs.push({
      ...expireStaleOrdersJob,
      healthStatus: expireHealthStatus,
      healthReason: expireHealthReason,
    });

    // Other jobs - mark as unknown since we can't infer without API access
    for (let i = 1; i < knownJobs.length; i++) {
      jobs.push({
        ...knownJobs[i],
        healthStatus: 'unknown',
        healthReason:
          'Cannot verify health automatically. Manual check required via GCP Console.',
      });
    }

    // General recommendations
    recommendations.push(
      '',
      '📋 Manual Verification Steps:',
      '1. Open Cloud Scheduler: https://console.cloud.google.com/cloudscheduler',
      '2. Check each job status (enabled/disabled)',
      '3. View execution history for recent runs',
      '4. Check Cloud Functions logs: https://console.cloud.google.com/functions'
    );

    // Build summary
    const summary = `Found ${jobs.length} known scheduled jobs. ${healthyJobs} appear healthy, ${warningJobs} have warnings. Note: This tool cannot directly access Cloud Scheduler API. Health is inferred from system behavior. Manual verification recommended.`;

    return {
      summary,
      jobs,
      overall: {
        totalJobs: jobs.length,
        enabledJobs: jobs.filter((j) => j.enabled).length,
        disabledJobs: jobs.filter((j) => !j.enabled).length,
        healthyJobs,
        warningJobs,
      },
      recommendations,
      note: 'This tool infers scheduler health from Firestore data. For definitive status, use GCP Console → Cloud Scheduler.',
    };
  } catch (error: any) {
    throw new Error(
      `[scheduler-status] Failed to check scheduler status: ${error.message}`
    );
  }
}

export const schedulerStatusSchema = {
  name: 'wawapp_scheduler_status',
  description:
    'Check Cloud Scheduler jobs status. Lists known scheduled jobs (expireStaleOrders, cleanupExpiredSessions, aggregateDriverRatings) with their schedules and inferred health status. Note: Cannot directly access Cloud Scheduler API, so health is inferred from system behavior (e.g., presence of stale orders indicates expireStaleOrders may not be running). Provides manual verification steps via GCP Console.',
  inputSchema: {
    type: 'object',
    properties: {
      includeInactive: {
        type: 'boolean',
        description: 'Include disabled/paused jobs (default: false)',
        default: false,
      },
    },
  },
};
