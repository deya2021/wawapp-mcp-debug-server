/**
 * Kit 5: Notification Delivery Tracker
 * Tool: wawapp_notification_trace
 *
 * Traces notifications sent for a specific order.
 * Shows notification timeline, delivery status, and user interactions.
 *
 * @author WawApp Development Team
 * @date 2025-01-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import type { Order } from '../../types/firestore-models.js';

const InputSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
});

interface NotificationEvent {
  timestamp: string;
  type: string;
  recipient: 'client' | 'driver';
  userId: string;
  title: string;
  body: string;
  status: 'sent' | 'delivered' | 'failed' | 'unknown';
  failureReason?: string;
  orderStatus: string;
}

interface NotificationTrace {
  orderId: string;
  orderStatus: string;
  ownerId: string;
  driverId?: string;
  notifications: NotificationEvent[];
  summary: {
    totalSent: number;
    totalDelivered: number;
    totalFailed: number;
    clientNotifications: number;
    driverNotifications: number;
  };
  issues: string[];
  recommendation?: string;
}

/**
 * Generates expected notifications based on order status transitions
 */
function getExpectedNotifications(
  order: Order,
  orderTimeline: any[]
): NotificationEvent[] {
  const expected: NotificationEvent[] = [];

  for (let i = 1; i < orderTimeline.length; i++) {
    const fromStatus = orderTimeline[i - 1].status;
    const toStatus = orderTimeline[i].status;
    const timestamp = orderTimeline[i].timestamp;

    // Client notifications
    if (fromStatus === 'matching' && toStatus === 'accepted') {
      expected.push({
        timestamp,
        type: 'driver_accepted',
        recipient: 'client',
        userId: order.ownerId,
        title: 'تم قبول طلبك',
        body: 'قبل السائق طلبك وهو في الطريق إليك',
        status: 'unknown', // Will be determined by checking logs
        orderStatus: toStatus,
      });
    }

    if (fromStatus === 'accepted' && toStatus === 'onRoute') {
      expected.push({
        timestamp,
        type: 'driver_on_route',
        recipient: 'client',
        userId: order.ownerId,
        title: 'السائق في الطريق',
        body: 'السائق الآن في طريقه لموقع الانطلاق',
        status: 'unknown',
        orderStatus: toStatus,
      });
    }

    if (fromStatus === 'onRoute' && toStatus === 'completed') {
      expected.push({
        timestamp,
        type: 'trip_completed',
        recipient: 'client',
        userId: order.ownerId,
        title: 'اكتملت الرحلة',
        body: 'وصلت إلى وجهتك. قيّم تجربتك مع السائق',
        status: 'unknown',
        orderStatus: toStatus,
      });
    }

    if (fromStatus === 'matching' && toStatus === 'expired') {
      expected.push({
        timestamp,
        type: 'order_expired',
        recipient: 'client',
        userId: order.ownerId,
        title: 'انتهت مهلة الطلب',
        body: 'لم يتم العثور على سائق. جرب مرة أخرى؟',
        status: 'unknown',
        orderStatus: toStatus,
      });
    }
  }

  return expected;
}

export async function notificationTrace(params: unknown): Promise<NotificationTrace> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const issues: string[] = [];

  // Fetch order document
  const orderDoc = await firestore.getDocument('orders', input.orderId);

  if (!orderDoc) {
    throw new Error(`Order ${input.orderId} not found in /orders collection`);
  }

  const order: Order = {
    ...orderDoc,
    createdAt: firestore.timestampToDate(orderDoc.createdAt) || new Date(),
    updatedAt: firestore.timestampToDate(orderDoc.updatedAt) || new Date(),
  };

  // Build order timeline from order document
  // Note: In v1, we don't have history subcollection support in FirestoreClient
  // So we'll create a minimal timeline from the order document itself
  const timeline: any[] = [];

  // If no history subcollection, create minimal timeline from order doc
  if (timeline.length === 0) {
    timeline.push({
      timestamp: order.createdAt.toISOString(),
      status: order.status,
      event: 'order_created',
    });
  }

  // Generate expected notifications based on status transitions
  const expectedNotifications = getExpectedNotifications(order, timeline);

  // Note: In v1, we cannot query Cloud Function logs or FCM delivery reports
  // So notification status will be 'unknown' unless we add a notificationLogs collection
  // For now, we'll show expected notifications and recommend manual verification

  if (expectedNotifications.length === 0) {
    issues.push('No status transitions that trigger notifications');
    issues.push('Order may still be in initial "matching" status');
  } else {
    issues.push(
      'Notification delivery status cannot be verified automatically in v1'
    );
    issues.push('Manual verification required:');
    issues.push('- Check Firebase Console > Cloud Messaging > Reports');
    issues.push('- Check Cloud Function logs: firebase functions:log --only notifyOrderEvents');
    issues.push(
      '- Ask user if they received notifications at the timestamps shown'
    );
  }

  const summary = {
    totalSent: expectedNotifications.length,
    totalDelivered: 0, // Cannot determine without FCM reports
    totalFailed: 0, // Cannot determine without FCM reports
    clientNotifications: expectedNotifications.filter((n) => n.recipient === 'client')
      .length,
    driverNotifications: expectedNotifications.filter((n) => n.recipient === 'driver')
      .length,
  };

  const recommendation = `Notification Trace for Order ${input.orderId}:

Expected Notifications: ${expectedNotifications.length}
${expectedNotifications.map((n, i) => `${i + 1}. [${n.timestamp}] ${n.type} → ${n.recipient} (${n.userId})`).join('\n')}

⚠️ Delivery status cannot be verified automatically.

Manual Verification Steps:
1. Check if client (${order.ownerId}) has valid FCM token:
   → Use wawapp_fcm_token_status tool

${order.driverId ? `2. Check if driver (${order.driverId}) has valid FCM token:
   → Use wawapp_fcm_token_status tool
` : ''}
3. Check Cloud Function execution:
   → firebase functions:log --only notifyOrderEvents --lines 50

4. Check FCM delivery reports:
   → Firebase Console > Cloud Messaging > Reports
   → Filter by time range: ${timeline[0]?.timestamp || 'N/A'}

5. Ask user directly if they received notifications at expected times`;

  return {
    orderId: input.orderId,
    orderStatus: order.status,
    ownerId: order.ownerId,
    driverId: order.driverId,
    notifications: expectedNotifications,
    summary,
    issues,
    recommendation,
  };
}
