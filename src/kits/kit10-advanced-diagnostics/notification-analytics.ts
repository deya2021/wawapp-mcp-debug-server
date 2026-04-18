/**
 * Kit 10: Advanced Diagnostics
 * Tool: wawapp_notification_analytics
 *
 * Deep analytics on FCM notification delivery — WHO got notified, WHEN,
 * on WHICH device, HOW MANY succeeded/failed, and HOW LONG delivery took.
 *
 * @author WawApp Development Team
 * @date 2025-01-27
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { CloudLoggingClient } from '../../data-access/cloud-logging-client.js';
import { maskPhone, maskName } from '../../security/pii-masker.js';
import { MAX_TIME_RANGE_DAYS } from '../../config/constants.js';

const MAX_TIME_RANGE_MINUTES = MAX_TIME_RANGE_DAYS * 24 * 60;

const InputSchema = z.object({
  timeRangeMinutes: z
    .number()
    .min(1)
    .max(MAX_TIME_RANGE_MINUTES)
    .default(1440)
    .describe('How far back to look (default: 1440 = 24h)'),
  orderId: z
    .string()
    .optional()
    .describe('Filter by specific order'),
  userId: z
    .string()
    .optional()
    .describe('Filter by specific user'),
  userType: z
    .enum(['driver', 'client', 'all'])
    .default('all')
    .describe('Filter by user type'),
  notificationType: z
    .string()
    .optional()
    .describe('Filter by notification type (e.g. "new_order", "status_update")'),
  limit: z
    .number()
    .min(1)
    .max(500)
    .default(200)
    .describe('Max records to analyze'),
});

interface PlatformStats {
  sent: number;
  delivered: number;
  failed: number;
  rate: string;
}

interface NotificationAnalyticsResult {
  summary: {
    totalSent: number;
    totalDelivered: number;
    totalFailed: number;
    deliveryRate: string;
    avgDeliveryTimeMs: number;
    p95DeliveryTimeMs: number;
  };
  byPlatform: Record<string, PlatformStats>;
  byNotificationType: Array<{
    type: string;
    sent: number;
    delivered: number;
    failRate: string;
  }>;
  topFailureReasons: Array<{
    errorCode: string;
    count: number;
    affectedUsers: number;
  }>;
  devicesPerUser: {
    multiDeviceUsers: number;
    avgDevicesPerUser: number;
    maxDevicesForOneUser: number;
  };
  timeline: Array<{
    hour: string;
    sent: number;
    delivered: number;
    failed: number;
  }>;
  problematicUsers: Array<{
    userId: string;
    userType: string;
    failedNotifications: number;
    lastFailureReason: string;
    platform: string;
  }>;
  dataWarnings: string[];
  metadata: {
    timeRangeMinutes: number;
    analyzedAt: string;
    dataSource: string;
  };
}

interface NotificationRecord {
  userId: string;
  userType: string;
  fcmToken?: string;
  platform: string;
  type: string;
  sentAt: Date | null;
  deliveredAt: Date | null;
  status: string;
  orderId?: string;
  errorCode?: string;
}

function pct(num: number, den: number): string {
  return den > 0 ? `${Math.round((num / den) * 100)}%` : '0%';
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function hourBucket(date: Date): string {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

function inferPlatform(token?: string): string {
  if (!token) return 'unknown';
  // iOS tokens are typically shorter hex strings; Android FCM tokens contain ':'
  if (token.includes(':')) return 'android';
  if (/^[a-f0-9]{64}$/i.test(token)) return 'ios';
  return 'unknown';
}

async function fetchFromFirestore(
  firestore: FirestoreClient,
  startDate: Date,
  input: z.infer<typeof InputSchema>
): Promise<{ records: NotificationRecord[]; warnings: string[] }> {
  const warnings: string[] = [];
  const records: NotificationRecord[] = [];

  // Try notification_logs first, then notifications
  for (const collName of ['notification_logs', 'notifications']) {
    try {
      const filters: Array<{ field: string; operator: any; value: any }> = [];

      if (input.orderId) {
        filters.push({ field: 'orderId', operator: '==', value: input.orderId });
      }
      if (input.userId) {
        filters.push({ field: 'userId', operator: '==', value: input.userId });
      }
      if (input.userType !== 'all') {
        filters.push({ field: 'userType', operator: '==', value: input.userType });
      }

      const docs = await firestore.queryDocuments(collName, filters, {
        limit: input.limit,
        orderBy: { field: 'sentAt', direction: 'desc' },
      });

      if (docs.length === 0) continue;

      for (const doc of docs) {
        const sentAt = firestore.timestampToDate(doc.sentAt || doc.createdAt);
        if (sentAt && sentAt < startDate) continue;

        const deliveredAt = firestore.timestampToDate(doc.deliveredAt);
        const platform = doc.platform || inferPlatform(doc.fcmToken);

        records.push({
          userId: doc.userId || '',
          userType: doc.userType || 'unknown',
          fcmToken: doc.fcmToken,
          platform,
          type: doc.type || doc.notificationType || 'unknown',
          sentAt,
          deliveredAt,
          status: doc.status || (deliveredAt ? 'delivered' : sentAt ? 'sent' : 'unknown'),
          orderId: doc.orderId,
          errorCode: doc.errorCode,
        });
      }

      if (records.length > 0) return { records, warnings };
    } catch {
      // Collection doesn't exist or query failed — try next
    }
  }

  if (records.length === 0) {
    warnings.push(
      'No notification_logs or notifications collection found in Firestore. Falling back to Cloud Logging.'
    );
  }

  return { records, warnings };
}

async function fetchFromCloudLogs(
  startDate: Date,
  endDate: Date,
  input: z.infer<typeof InputSchema>,
  limit: number
): Promise<{ records: NotificationRecord[]; warnings: string[] }> {
  const warnings: string[] = [];
  const records: NotificationRecord[] = [];

  try {
    const logging = CloudLoggingClient.getInstance();

    let filter = 'resource.type="cloud_function" AND (textPayload:"fcm" OR textPayload:"notification" OR jsonPayload.type:"notification")';
    if (input.orderId) {
      filter += ` AND (textPayload:"${input.orderId}" OR jsonPayload.orderId="${input.orderId}")`;
    }
    if (input.userId) {
      filter += ` AND (textPayload:"${input.userId}" OR jsonPayload.userId="${input.userId}")`;
    }

    const entries = await logging.queryLogs(filter, startDate, endDate, limit);

    for (const entry of entries) {
      const msg = typeof entry.message === 'string' ? entry.message : '';
      const payload = typeof entry.message === 'object' ? entry.message : {};

      const isFailed =
        entry.severity === 'ERROR' ||
        msg.includes('UNREGISTERED') ||
        msg.includes('INVALID') ||
        msg.includes('error') ||
        payload.status === 'failed';

      let errorCode: string | undefined;
      if (isFailed) {
        const match = msg.match(/(UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND|SENDER_ID_MISMATCH|QUOTA_EXCEEDED|UNAVAILABLE|INTERNAL)/i);
        errorCode = match?.[1]?.toUpperCase() || payload.errorCode || 'UNKNOWN_ERROR';
      }

      records.push({
        userId: payload.userId || payload.recipientId || '',
        userType: payload.userType || 'unknown',
        platform: payload.platform || 'unknown',
        type: payload.type || payload.notificationType || 'unknown',
        sentAt: new Date(entry.timestamp),
        deliveredAt: payload.status === 'delivered' ? new Date(entry.timestamp) : null,
        status: isFailed ? 'failed' : (payload.status || 'sent'),
        orderId: payload.orderId,
        errorCode,
      });
    }

    if (entries.length === 0) {
      warnings.push('No FCM-related entries found in Cloud Logging for the given time range.');
    }
  } catch {
    warnings.push('Cloud Logging query failed. Notification analytics may be incomplete.');
  }

  return { records, warnings };
}

function buildAnalytics(
  records: NotificationRecord[],
  dataWarnings: string[],
  dataSource: string,
  timeRangeMinutes: number
): NotificationAnalyticsResult {
  // --- Summary ---
  const totalSent = records.length;
  const delivered = records.filter((r) => r.status === 'delivered');
  const failed = records.filter((r) => r.status === 'failed');

  const deliveryTimes: number[] = [];
  for (const r of delivered) {
    if (r.sentAt && r.deliveredAt) {
      deliveryTimes.push(r.deliveredAt.getTime() - r.sentAt.getTime());
    }
  }
  deliveryTimes.sort((a, b) => a - b);

  const avgDeliveryTimeMs =
    deliveryTimes.length > 0
      ? Math.round(deliveryTimes.reduce((s, v) => s + v, 0) / deliveryTimes.length)
      : 0;

  // --- By platform ---
  const platforms: Record<string, PlatformStats> = {};
  for (const r of records) {
    const p = r.platform || 'unknown';
    if (!platforms[p]) platforms[p] = { sent: 0, delivered: 0, failed: 0, rate: '0%' };
    platforms[p].sent++;
    if (r.status === 'delivered') platforms[p].delivered++;
    if (r.status === 'failed') platforms[p].failed++;
  }
  for (const p of Object.values(platforms)) {
    p.rate = pct(p.delivered, p.sent);
  }

  // --- By notification type ---
  const typeMap = new Map<string, { sent: number; delivered: number; failed: number }>();
  for (const r of records) {
    const t = r.type;
    if (!typeMap.has(t)) typeMap.set(t, { sent: 0, delivered: 0, failed: 0 });
    const entry = typeMap.get(t)!;
    entry.sent++;
    if (r.status === 'delivered') entry.delivered++;
    if (r.status === 'failed') entry.failed++;
  }
  const byNotificationType = [...typeMap.entries()].map(([type, s]) => ({
    type,
    sent: s.sent,
    delivered: s.delivered,
    failRate: pct(s.failed, s.sent),
  }));

  // --- Top failure reasons ---
  const errorMap = new Map<string, { count: number; users: Set<string> }>();
  for (const r of failed) {
    const code = r.errorCode || 'UNKNOWN';
    if (!errorMap.has(code)) errorMap.set(code, { count: 0, users: new Set() });
    const e = errorMap.get(code)!;
    e.count++;
    if (r.userId) e.users.add(r.userId);
  }
  const topFailureReasons = [...errorMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([errorCode, v]) => ({
      errorCode,
      count: v.count,
      affectedUsers: v.users.size,
    }));

  // --- Devices per user ---
  const userTokens = new Map<string, Set<string>>();
  for (const r of records) {
    if (!r.userId || !r.fcmToken) continue;
    if (!userTokens.has(r.userId)) userTokens.set(r.userId, new Set());
    userTokens.get(r.userId)!.add(r.fcmToken);
  }
  const tokenCounts = [...userTokens.values()].map((s) => s.size);
  const multiDeviceUsers = tokenCounts.filter((c) => c > 1).length;
  const avgDevicesPerUser =
    tokenCounts.length > 0
      ? Math.round((tokenCounts.reduce((s, v) => s + v, 0) / tokenCounts.length) * 10) / 10
      : 0;
  const maxDevicesForOneUser = tokenCounts.length > 0 ? Math.max(...tokenCounts) : 0;

  // --- Timeline (hourly buckets) ---
  const hourMap = new Map<string, { sent: number; delivered: number; failed: number }>();
  for (const r of records) {
    if (!r.sentAt) continue;
    const h = hourBucket(r.sentAt);
    if (!hourMap.has(h)) hourMap.set(h, { sent: 0, delivered: 0, failed: 0 });
    const bucket = hourMap.get(h)!;
    bucket.sent++;
    if (r.status === 'delivered') bucket.delivered++;
    if (r.status === 'failed') bucket.failed++;
  }
  const timeline = [...hourMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, s]) => ({ hour, ...s }));

  // --- Problematic users (top 10 by failures) ---
  const userFailures = new Map<string, { count: number; lastReason: string; userType: string; platform: string }>();
  for (const r of failed) {
    if (!r.userId) continue;
    const existing = userFailures.get(r.userId);
    if (!existing) {
      userFailures.set(r.userId, {
        count: 1,
        lastReason: r.errorCode || 'UNKNOWN',
        userType: r.userType,
        platform: r.platform,
      });
    } else {
      existing.count++;
      existing.lastReason = r.errorCode || existing.lastReason;
    }
  }
  const problematicUsers = [...userFailures.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([userId, v]) => ({
      userId: maskName(userId),
      userType: v.userType,
      failedNotifications: v.count,
      lastFailureReason: v.lastReason,
      platform: v.platform,
    }));

  return {
    summary: {
      totalSent,
      totalDelivered: delivered.length,
      totalFailed: failed.length,
      deliveryRate: pct(delivered.length, totalSent),
      avgDeliveryTimeMs,
      p95DeliveryTimeMs: percentile(deliveryTimes, 95),
    },
    byPlatform: platforms,
    byNotificationType,
    topFailureReasons,
    devicesPerUser: { multiDeviceUsers, avgDevicesPerUser, maxDevicesForOneUser },
    timeline,
    problematicUsers,
    dataWarnings,
    metadata: {
      timeRangeMinutes,
      analyzedAt: new Date().toISOString(),
      dataSource,
    },
  };
}

export async function notificationAnalytics(
  params: unknown
): Promise<NotificationAnalyticsResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  const now = new Date();
  const startDate = new Date(now.getTime() - input.timeRangeMinutes * 60 * 1000);

  // 1. Try Firestore first
  const firestoreResult = await fetchFromFirestore(firestore, startDate, input);
  let records = firestoreResult.records;
  const dataWarnings = [...firestoreResult.warnings];
  let dataSource = 'firestore';

  // 2. Fall back to or supplement with Cloud Logging
  if (records.length === 0) {
    const logResult = await fetchFromCloudLogs(startDate, now, input, input.limit);
    records = logResult.records;
    dataWarnings.push(...logResult.warnings);
    dataSource = 'cloudlogs';
  } else {
    // Supplement with Cloud Logging for failed deliveries
    try {
      const logResult = await fetchFromCloudLogs(startDate, now, input, Math.min(50, input.limit));
      if (logResult.records.length > 0) {
        // Merge only failed records not already present
        const existingIds = new Set(records.map((r) => `${r.userId}-${r.sentAt?.getTime()}`));
        for (const lr of logResult.records) {
          const key = `${lr.userId}-${lr.sentAt?.getTime()}`;
          if (!existingIds.has(key)) {
            records.push(lr);
          }
        }
        dataSource = 'firestore+cloudlogs';
      }
    } catch {
      // Cloud Logging supplement failed — continue with Firestore data only
    }
  }

  if (records.length === 0) {
    dataWarnings.push('No notification data found in any source for the given filters and time range.');
  }

  return buildAnalytics(records, dataWarnings, dataSource, input.timeRangeMinutes);
}

export const notificationAnalyticsSchema = {
  name: 'wawapp_notification_analytics',
  description: `Deep analytics on FCM notification delivery.

Answers: WHO got notified, WHEN, on WHICH device, HOW MANY succeeded/failed, and HOW LONG delivery took.

Provides:
- Delivery rate, avg/p95 delivery time
- Breakdown by platform (Android/iOS) and notification type
- Top failure reasons with affected user counts
- Multi-device detection per user
- Hourly timeline of sent/delivered/failed
- Problematic users with highest failure rates

Data sources: Firestore notification_logs/notifications collection + Cloud Logging fallback.

Use cases:
- "Why aren't notifications reaching users?"
- "What's our notification delivery rate?"
- "Which devices/platforms have the most failures?"
- "Are there users with stale FCM tokens?"

Example:
{
  "timeRangeMinutes": 1440,
  "userType": "driver",
  "notificationType": "new_order"
}`,
  inputSchema: {
    type: 'object',
    properties: {
      timeRangeMinutes: {
        type: 'number',
        description: 'How far back to look in minutes (default: 1440 = 24h, max: 7 days)',
        default: 1440,
      },
      orderId: {
        type: 'string',
        description: 'Filter by specific order (optional)',
      },
      userId: {
        type: 'string',
        description: 'Filter by specific user (optional)',
      },
      userType: {
        type: 'string',
        enum: ['driver', 'client', 'all'],
        description: 'Filter by user type (default: "all")',
        default: 'all',
      },
      notificationType: {
        type: 'string',
        description: 'Filter by notification type e.g. "new_order", "status_update" (optional)',
      },
      limit: {
        type: 'number',
        description: 'Max records to analyze (default: 200, max: 500)',
        default: 200,
      },
    },
  },
};
