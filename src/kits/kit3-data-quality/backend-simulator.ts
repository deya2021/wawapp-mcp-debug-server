/**
 * Backend Simulator Tool
 * Simulates backend logic that Flutter apps rely on
 * Helps uncover crashes before running the apps
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { calculateDistance } from '../../utils/haversine.js';

const InputSchema = z.object({
  mode: z
    .enum(['nearby_orders', 'matching', 'active_orders', 'earnings'])
    .describe('Simulation mode'),
  driverId: z
    .string()
    .optional()
    .describe('Driver ID for driver-specific simulations'),
  city: z
    .string()
    .optional()
    .describe('Filter by city'),
  region: z
    .string()
    .optional()
    .describe('Filter by region'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(20)
    .describe('Maximum results to return'),
  driverLat: z
    .number()
    .optional()
    .describe('Driver latitude (for distance calculations)'),
  driverLng: z
    .number()
    .optional()
    .describe('Driver longitude (for distance calculations)'),
});

type SimulatorInput = z.infer<typeof InputSchema>;

/**
 * Main simulator function
 */
export async function backendSimulator(params: unknown): Promise<any> {
  const input = InputSchema.parse(params);

  switch (input.mode) {
    case 'nearby_orders':
      return await simulateNearbyOrders(input);
    case 'matching':
      return await simulateMatching(input);
    case 'active_orders':
      return await simulateActiveOrders(input);
    case 'earnings':
      return await simulateEarnings(input);
    default:
      throw new Error(`Unknown simulation mode: ${input.mode}`);
  }
}

/**
 * Simulate "nearby orders" screen logic (common crash point)
 */
async function simulateNearbyOrders(input: SimulatorInput): Promise<any> {
  const firestore = FirestoreClient.getInstance();
  const warnings: string[] = [];
  const errors: string[] = [];

  // Get driver info if driverId provided
  let driver: any = null;
  if (input.driverId) {
    try {
      driver = await firestore.getDocument('drivers', input.driverId);
      if (!driver) {
        errors.push(`Driver ${input.driverId} not found`);
        return {
          mode: 'nearby_orders',
          success: false,
          errors,
          warnings,
          orders: [],
        };
      }
    } catch (error: any) {
      errors.push(`Failed to fetch driver: ${error.message}`);
      return {
        mode: 'nearby_orders',
        success: false,
        errors,
        warnings,
        orders: [],
      };
    }
  }

  // Build filters for nearby orders
  const filters = [
    { field: 'status', operator: '==' as const, value: 'matching' },
  ];

  // Add city/region filters if available
  const cityFilter = input.city || driver?.city;
  const regionFilter = input.region || driver?.region;

  if (cityFilter) {
    warnings.push(
      `Note: Filtering by city="${cityFilter}" - this may exclude valid nearby orders in adjacent areas`
    );
  }

  try {
    const orders = await firestore.queryDocuments('orders', filters, {
      limit: input.limit,
    });

    // Process orders with safety checks (mimicking Flutter logic)
    const processedOrders = [];
    for (const order of orders) {
      const issues: string[] = [];

      // Check createdAt (common crash point!)
      if (!order.createdAt) {
        issues.push('❌ Missing createdAt - Flutter will crash on null check');
        errors.push(`Order ${order.id}: Missing createdAt field`);
      } else if (typeof order.createdAt === 'string') {
        issues.push(
          '❌ createdAt is String, not Timestamp - Flutter will crash on .toDate()'
        );
        errors.push(
          `Order ${order.id}: createdAt is String instead of Timestamp`
        );
      }

      // Check pickup location (common crash point!)
      if (!order.pickup) {
        issues.push('❌ Missing pickup location - Flutter will crash');
        errors.push(`Order ${order.id}: Missing pickup object`);
      } else if (
        order.pickup.lat === null ||
        order.pickup.lat === undefined
      ) {
        issues.push('❌ Missing pickup.lat - Flutter will crash on distance calculation');
        errors.push(`Order ${order.id}: Missing pickup.lat`);
      } else if (
        order.pickup.lng === null ||
        order.pickup.lng === undefined
      ) {
        issues.push('❌ Missing pickup.lng - Flutter will crash on distance calculation');
        errors.push(`Order ${order.id}: Missing pickup.lng`);
      }

      // Check dropoff location
      if (!order.dropoff) {
        issues.push('❌ Missing dropoff location - Flutter will crash');
        errors.push(`Order ${order.id}: Missing dropoff object`);
      } else if (
        order.dropoff.lat === null ||
        order.dropoff.lat === undefined ||
        order.dropoff.lng === null ||
        order.dropoff.lng === undefined
      ) {
        issues.push('⚠️  Missing dropoff coordinates - may cause display issues');
        warnings.push(`Order ${order.id}: Incomplete dropoff coordinates`);
      }

      // Calculate distance if driver location provided
      let distance: number | null = null;
      if (
        input.driverLat !== undefined &&
        input.driverLng !== undefined &&
        order.pickup?.lat !== null &&
        order.pickup?.lat !== undefined &&
        order.pickup?.lng !== null &&
        order.pickup?.lng !== undefined
      ) {
        try {
          distance = calculateDistance(
            input.driverLat,
            input.driverLng,
            order.pickup.lat,
            order.pickup.lng
          );
        } catch (error: any) {
          warnings.push(
            `Order ${order.id}: Failed to calculate distance - ${error.message}`
          );
        }
      }

      // Convert timestamp safely
      let createdAt: string | null = null;
      try {
        const date = firestore.timestampToDate(order.createdAt);
        createdAt = date ? date.toISOString() : null;
      } catch (error: any) {
        issues.push(`⚠️  Failed to parse createdAt: ${error.message}`);
      }

      processedOrders.push({
        orderId: order.id,
        status: order.status,
        price: order.price,
        distanceKm: order.distanceKm,
        distanceFromDriver: distance ? `${distance.toFixed(2)} km` : null,
        createdAt,
        pickupAddress: order.pickupAddress,
        dropoffAddress: order.dropoffAddress,
        issues: issues.length > 0 ? issues : undefined,
      });
    }

    // Sort by createdAt (safeguard against null)
    const sortedOrders = sortOrdersByCreatedAt(processedOrders);

    return {
      mode: 'nearby_orders',
      success: errors.length === 0,
      driver: driver
        ? {
            id: driver.id,
            name: driver.name,
            city: driver.city,
            region: driver.region,
            isVerified: driver.isVerified,
          }
        : null,
      filters: {
        status: 'matching',
        city: cityFilter,
        region: regionFilter,
      },
      ordersFound: orders.length,
      ordersWithIssues: processedOrders.filter((o) => o.issues).length,
      orders: sortedOrders,
      errors,
      warnings,
      flutterCrashRisk: errors.length > 0 ? 'HIGH' : 'LOW',
    };
  } catch (error: any) {
    errors.push(`Firestore query failed: ${error.message}`);
    return {
      mode: 'nearby_orders',
      success: false,
      errors,
      warnings,
      orders: [],
      flutterCrashRisk: 'UNKNOWN',
    };
  }
}

/**
 * Simulate order matching logic
 */
async function simulateMatching(input: SimulatorInput): Promise<any> {
  const firestore = FirestoreClient.getInstance();
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!input.driverId) {
    errors.push('driverId is required for matching simulation');
    return { mode: 'matching', success: false, errors, warnings };
  }

  try {
    const driver = await firestore.getDocument('drivers', input.driverId);
    if (!driver) {
      errors.push(`Driver ${input.driverId} not found`);
      return { mode: 'matching', success: false, errors, warnings };
    }

    // Check driver eligibility
    if (!driver.isVerified) {
      warnings.push('Driver is not verified - cannot receive orders');
    }

    if (!driver.isOnline) {
      warnings.push('Driver is offline - will not receive order notifications');
    }

    // Get matching orders
    const filters = [
      { field: 'status', operator: '==' as const, value: 'matching' },
    ];

    const orders = await firestore.queryDocuments('orders', filters, {
      limit: input.limit,
    });

    // Filter orders for this driver (by city/region)
    const eligibleOrders = orders.filter((order: any) => {
      // Simple matching logic - in real app this would be more complex
      if (driver.city && order.city && driver.city !== order.city) {
        return false;
      }
      return true;
    });

    return {
      mode: 'matching',
      success: true,
      driver: {
        id: driver.id,
        name: driver.name,
        isVerified: driver.isVerified,
        isOnline: driver.isOnline,
        city: driver.city,
        region: driver.region,
      },
      totalMatchingOrders: orders.length,
      eligibleOrders: eligibleOrders.length,
      canReceiveOrders: driver.isVerified && driver.isOnline,
      warnings,
      errors,
    };
  } catch (error: any) {
    errors.push(`Matching simulation failed: ${error.message}`);
    return { mode: 'matching', success: false, errors, warnings };
  }
}

/**
 * Simulate active orders view
 */
async function simulateActiveOrders(input: SimulatorInput): Promise<any> {
  const firestore = FirestoreClient.getInstance();
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!input.driverId) {
    errors.push('driverId is required for active_orders simulation');
    return { mode: 'active_orders', success: false, errors, warnings };
  }

  try {
    const filters = [
      { field: 'driverId', operator: '==' as const, value: input.driverId },
      {
        field: 'status',
        operator: 'in' as const,
        value: ['accepted', 'onRoute'],
      },
    ];

    const orders = await firestore.queryDocuments('orders', filters, {
      limit: input.limit,
    });

    return {
      mode: 'active_orders',
      success: true,
      driverId: input.driverId,
      activeOrders: orders.map((o: any) => ({
        orderId: o.id,
        status: o.status,
        pickupAddress: o.pickupAddress,
        dropoffAddress: o.dropoffAddress,
        price: o.price,
      })),
      warnings,
      errors,
    };
  } catch (error: any) {
    errors.push(`Active orders query failed: ${error.message}`);
    return { mode: 'active_orders', success: false, errors, warnings };
  }
}

/**
 * Simulate earnings calculation
 */
async function simulateEarnings(input: SimulatorInput): Promise<any> {
  const firestore = FirestoreClient.getInstance();
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!input.driverId) {
    errors.push('driverId is required for earnings simulation');
    return { mode: 'earnings', success: false, errors, warnings };
  }

  try {
    const filters = [
      { field: 'driverId', operator: '==' as const, value: input.driverId },
      { field: 'status', operator: '==' as const, value: 'completed' },
    ];

    const orders = await firestore.queryDocuments('orders', filters, {
      limit: input.limit,
    });

    let totalEarnings = 0;
    let invalidPrices = 0;

    for (const order of orders) {
      if (typeof order.price === 'number' && order.price > 0) {
        totalEarnings += order.price;
      } else {
        invalidPrices++;
        warnings.push(
          `Order ${order.id} has invalid price: ${order.price}`
        );
      }
    }

    return {
      mode: 'earnings',
      success: true,
      driverId: input.driverId,
      completedTrips: orders.length,
      totalEarnings,
      invalidPrices,
      warnings,
      errors,
    };
  } catch (error: any) {
    errors.push(`Earnings calculation failed: ${error.message}`);
    return { mode: 'earnings', success: false, errors, warnings };
  }
}

/**
 * Helper: Sort orders by createdAt with null safety
 */
function sortOrdersByCreatedAt(orders: any[]): any[] {
  return orders.sort((a, b) => {
    if (!a.createdAt && !b.createdAt) return 0;
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/**
 * Schema for MCP tool registration
 */
export const backendSimulatorSchema = {
  name: 'wawapp_backend_simulator',
  description:
    'Simulate backend logic that Flutter apps rely on. Helps uncover crashes before running the apps. Modes: nearby_orders (driver nearby orders screen), matching (order assignment), active_orders (driver active trips), earnings (driver earnings calculation). Returns simulated results with warnings about potential Flutter crashes.',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['nearby_orders', 'matching', 'active_orders', 'earnings'],
        description: 'Simulation mode to run',
      },
      driverId: {
        type: 'string',
        description: 'Driver ID (required for most modes)',
      },
      city: {
        type: 'string',
        description: 'Filter by city (optional)',
      },
      region: {
        type: 'string',
        description: 'Filter by region (optional)',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 20, max: 100)',
        default: 20,
      },
      driverLat: {
        type: 'number',
        description: 'Driver latitude for distance calculations (optional)',
      },
      driverLng: {
        type: 'number',
        description: 'Driver longitude for distance calculations (optional)',
      },
    },
    required: ['mode'],
  },
};
