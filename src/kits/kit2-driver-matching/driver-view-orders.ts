import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { calculateDistance } from '../../utils/haversine.js';
import { NEARBY_RADIUS_KM } from '../../config/constants.js';
import { maskDocument } from '../../security/pii-masker.js';
import type { DriverLocation } from '../../types/firestore-models.js';

const InputSchema = z.object({
  driverId: z.string().min(1),
  radiusKm: z.number().positive().optional().default(NEARBY_RADIUS_KM),
});

export async function driverViewOrders(params: unknown) {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  // Get driver location
  const locationDoc = await firestore.getDocument('driverLocations', input.driverId);

  if (!locationDoc) {
    throw new Error(`Driver location not found for ${input.driverId}`);
  }

  const location: DriverLocation = {
    ...locationDoc,
    driverId: input.driverId,
    timestamp: firestore.timestampToDate(locationDoc.timestamp) || new Date(),
  };

  // Query orders
  const ordersQuery = await firestore.queryDocuments(
    'orders',
    [
      { field: 'assignedDriverId', operator: '==', value: null },
    ],
    { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 100 }
  );

  // Filter by status and distance
  const validStatuses = ['matching', 'requested', 'assigning'];
  const nearbyOrders: any[] = [];

  for (const orderDoc of ordersQuery) {
    if (!validStatuses.includes(orderDoc.status)) continue;
    if (!orderDoc.pickup) continue;

    const distance = calculateDistance(
      location.lat,
      location.lng,
      orderDoc.pickup.lat,
      orderDoc.pickup.lng
    );

    if (distance <= input.radiusKm) {
      nearbyOrders.push({
        ...maskDocument(orderDoc, { roundGPS: true }),
        distanceKm: Math.round(distance * 10) / 10,
      });
    }
  }

  // Sort by distance
  nearbyOrders.sort((a, b) => a.distanceKm - b.distanceKm);

  return {
    driverId: input.driverId,
    driverLocation: {
      lat: location.lat,
      lng: location.lng,
      timestamp: location.timestamp.toISOString(),
    },
    radiusKm: input.radiusKm,
    orders: nearbyOrders,
    summary: `Found ${nearbyOrders.length} orders within ${input.radiusKm}km`,
  };
}

export const driverViewOrdersSchema = {
  name: 'wawapp_driver_view_orders',
  description:
    'Simulate the exact orders a driver should see based on their current location and matching logic. Applies same filters as production: radiusKm, status=matching, assignedDriverId=null.',
  inputSchema: {
    type: 'object',
    properties: {
      driverId: { type: 'string', description: 'Driver UID' },
      radiusKm: {
        type: 'number',
        default: NEARBY_RADIUS_KM,
        description: `Search radius in kilometers (default production value: ${NEARBY_RADIUS_KM})`,
      },
    },
    required: ['driverId'],
  },
};
