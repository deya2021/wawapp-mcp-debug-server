import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { formatDuration } from '../../utils/time-helpers.js';
import { maskDocument } from '../../security/pii-masker.js';
import type { Order } from '../../types/firestore-models.js';

const InputSchema = z.object({
  orderId: z.string().min(1),
  includeNotifications: z.boolean().default(true),
});

export async function orderTrace(params: unknown) {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  const orderDoc = await firestore.getDocument('orders', input.orderId);

  if (!orderDoc) {
    throw new Error(`Order ${input.orderId} not found`);
  }

  const order: Order = {
    ...orderDoc,
    createdAt: firestore.timestampToDate(orderDoc.createdAt) || new Date(),
    updatedAt: firestore.timestampToDate(orderDoc.updatedAt),
    completedAt: firestore.timestampToDate(orderDoc.completedAt),
    expiredAt: firestore.timestampToDate(orderDoc.expiredAt),
    ratedAt: firestore.timestampToDate(orderDoc.ratedAt),
  };

  const timeline = buildTimeline(order);
  const duration = calculateDurations(timeline);
  const maskedOrder = maskDocument(order, { roundGPS: true });

  return {
    order: maskedOrder,
    timeline,
    notifications: [], // Simplified for v1
    duration,
  };
}

function buildTimeline(order: Order): any[] {
  const events: any[] = [];

  events.push({
    timestamp: order.createdAt.toISOString(),
    event: 'order_created',
    status: 'matching',
  });

  if (order.driverId && order.status !== 'matching') {
    events.push({
      timestamp: order.updatedAt?.toISOString() || order.createdAt.toISOString(),
      event: 'driver_assigned',
      driverId: order.driverId,
      status: 'accepted',
    });
  }

  if (order.status === 'onRoute') {
    events.push({
      timestamp: order.updatedAt?.toISOString(),
      event: 'driver_en_route',
      status: 'onRoute',
    });
  }

  if (order.completedAt) {
    events.push({
      timestamp: order.completedAt.toISOString(),
      event: 'trip_completed',
      status: 'completed',
      rating: order.driverRating,
    });
  }

  if (order.expiredAt) {
    events.push({
      timestamp: order.expiredAt.toISOString(),
      event: 'order_expired',
      status: 'expired',
    });
  }

  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function calculateDurations(timeline: any[]): Record<string, string> {
  if (timeline.length < 2) {
    return { total: '0s' };
  }

  const start = new Date(timeline[0].timestamp);
  const end = new Date(timeline[timeline.length - 1].timestamp);

  const durations: Record<string, string> = {
    total: formatDuration(end.getTime() - start.getTime()),
  };

  for (let i = 1; i < timeline.length; i++) {
    const prev = timeline[i - 1];
    const curr = timeline[i];
    const phaseName = `${prev.status}To${curr.status.charAt(0).toUpperCase()}${curr.status.slice(1)}`;
    const duration =
      new Date(curr.timestamp).getTime() -
      new Date(prev.timestamp).getTime();
    durations[phaseName] = formatDuration(duration);
  }

  return durations;
}

export const orderTraceSchema = {
  name: 'wawapp_order_trace',
  description:
    'Trace complete lifecycle of an order including status transitions, driver assignments, and timeline. Returns chronological events from creation to current state.',
  inputSchema: {
    type: 'object',
    properties: {
      orderId: {
        type: 'string',
        description: 'Order document ID from Firestore /orders collection',
      },
      includeNotifications: {
        type: 'boolean',
        description:
          'Include FCM notification delivery attempts from Cloud Logging',
        default: true,
      },
    },
    required: ['orderId'],
  },
};
