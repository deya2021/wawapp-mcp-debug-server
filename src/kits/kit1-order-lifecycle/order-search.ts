/**
 * Kit 1: Order Lifecycle Inspector
 * Tool: wawapp_order_search
 *
 * Search and filter orders by various criteria.
 * Supports multi-field filtering with pagination.
 *
 * @author WawApp Development Team
 * @date 2025-11-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { maskDocument } from '../../security/pii-masker.js';
import type { Order } from '../../types/firestore-models.js';

const InputSchema = z.object({
  status: z
    .enum([
      'matching',
      'requested',
      'assigning',
      'accepted',
      'onRoute',
      'completed',
      'expired',
      'cancelled',
      'all',
    ])
    .optional()
    .describe('Order status filter'),
  driverId: z.string().optional().describe('Filter by assigned driver ID'),
  ownerId: z.string().optional().describe('Filter by client/owner user ID'),
  minPrice: z.number().optional().describe('Minimum price filter'),
  maxPrice: z.number().optional().describe('Maximum price filter'),
  city: z.string().optional().describe('Filter by city (pickup location)'),
  region: z.string().optional().describe('Filter by region (pickup location)'),
  timeRangeMinutes: z
    .number()
    .min(1)
    .max(10080)
    .default(1440)
    .describe('Time range to search (default: 24 hours, max: 7 days)'),
  limit: z
    .number()
    .min(1)
    .max(500)
    .default(50)
    .describe('Maximum number of orders to return'),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'price'])
    .default('createdAt')
    .describe('Field to sort by'),
  sortDirection: z
    .enum(['asc', 'desc'])
    .default('desc')
    .describe('Sort direction'),
});

type OrderSearchInput = z.infer<typeof InputSchema>;

interface OrderSearchResult {
  summary: string;
  filters: {
    applied: string[];
    timeRange: string;
  };
  results: {
    total: number;
    returned: number;
    orders: any[];
  };
  breakdown: {
    byStatus: Record<string, number>;
    avgPrice: number;
    totalValue: number;
  };
}

export async function orderSearch(
  params: unknown
): Promise<OrderSearchResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  // Calculate time threshold
  const now = new Date();
  const timeRangeMs = input.timeRangeMinutes * 60 * 1000;
  const thresholdDate = new Date(now.getTime() - timeRangeMs);

  // Build filters
  const filters: any[] = [];
  const appliedFilters: string[] = [];

  // Status filter
  if (input.status && input.status !== 'all') {
    filters.push({
      field: 'status',
      operator: '==' as const,
      value: input.status,
    });
    appliedFilters.push(`status=${input.status}`);
  }

  // Driver filter
  if (input.driverId) {
    filters.push({
      field: 'driverId',
      operator: '==' as const,
      value: input.driverId,
    });
    appliedFilters.push(`driverId=${input.driverId}`);
  }

  // Owner filter
  if (input.ownerId) {
    filters.push({
      field: 'ownerId',
      operator: '==' as const,
      value: input.ownerId,
    });
    appliedFilters.push(`ownerId=${input.ownerId}`);
  }

  // Query options
  const options: any = {
    limit: input.limit,
    orderBy: {
      field: input.sortBy,
      direction: input.sortDirection,
    },
  };

  try {
    // Execute query
    let orders = await firestore.queryDocuments('orders', filters, options);

    // Apply client-side filters (price, time range, city, region)
    orders = orders.filter((order) => {
      // Time range filter
      const createdAt = firestore.timestampToDate(order.createdAt);
      if (createdAt && createdAt < thresholdDate) {
        return false;
      }

      // Price filters
      if (input.minPrice !== undefined && order.price < input.minPrice) {
        return false;
      }
      if (input.maxPrice !== undefined && order.price > input.maxPrice) {
        return false;
      }

      // City filter
      if (input.city && order.pickup?.city !== input.city) {
        return false;
      }

      // Region filter
      if (input.region && order.pickup?.region !== input.region) {
        return false;
      }

      return true;
    });

    // Apply limit after client-side filtering
    orders = orders.slice(0, input.limit);

    // Calculate breakdown
    const byStatus: Record<string, number> = {};
    let totalPrice = 0;

    for (const order of orders) {
      const status = order.status || 'unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;
      totalPrice += order.price || 0;
    }

    const avgPrice = orders.length > 0 ? totalPrice / orders.length : 0;

    // Mask PII
    const maskedOrders = orders.map((order) =>
      maskDocument(order, { roundGPS: true })
    );

    // Build summary
    const filterDesc =
      appliedFilters.length > 0
        ? appliedFilters.join(', ')
        : 'no specific filters';
    const timeRangeDesc =
      input.timeRangeMinutes >= 1440
        ? `${Math.floor(input.timeRangeMinutes / 1440)} day(s)`
        : `${input.timeRangeMinutes} minute(s)`;

    let summary = `Found ${orders.length} order(s) matching criteria: ${filterDesc} in last ${timeRangeDesc}.`;

    if (orders.length === 0) {
      summary += ' No orders found matching the specified criteria.';
    } else {
      const topStatus = Object.entries(byStatus).sort(
        ([, a], [, b]) => b - a
      )[0];
      summary += ` Most common status: ${topStatus[0]} (${topStatus[1]} orders). Average price: ${Math.round(avgPrice)} MRU.`;
    }

    // Add recommendations
    if (input.minPrice !== undefined) {
      appliedFilters.push(`minPrice=${input.minPrice}`);
    }
    if (input.maxPrice !== undefined) {
      appliedFilters.push(`maxPrice=${input.maxPrice}`);
    }
    if (input.city) {
      appliedFilters.push(`city=${input.city}`);
    }
    if (input.region) {
      appliedFilters.push(`region=${input.region}`);
    }

    return {
      summary,
      filters: {
        applied: appliedFilters,
        timeRange: timeRangeDesc,
      },
      results: {
        total: orders.length,
        returned: orders.length,
        orders: maskedOrders,
      },
      breakdown: {
        byStatus,
        avgPrice: Math.round(avgPrice),
        totalValue: Math.round(totalPrice),
      },
    };
  } catch (error: any) {
    throw new Error(`[order-search] Failed to search orders: ${error.message}`);
  }
}

export const orderSearchSchema = {
  name: 'wawapp_order_search',
  description:
    'Search and filter orders by various criteria including status, driver, client, price range, location, and time range. Returns matching orders with statistical breakdown.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: [
          'matching',
          'requested',
          'assigning',
          'accepted',
          'onRoute',
          'completed',
          'expired',
          'cancelled',
          'all',
        ],
        description: 'Filter by order status (optional)',
      },
      driverId: {
        type: 'string',
        description: 'Filter by assigned driver ID (optional)',
      },
      ownerId: {
        type: 'string',
        description: 'Filter by client/owner user ID (optional)',
      },
      minPrice: {
        type: 'number',
        description: 'Minimum price filter in MRU (optional)',
      },
      maxPrice: {
        type: 'number',
        description: 'Maximum price filter in MRU (optional)',
      },
      city: {
        type: 'string',
        description: 'Filter by city (pickup location, optional)',
      },
      region: {
        type: 'string',
        description: 'Filter by region (pickup location, optional)',
      },
      timeRangeMinutes: {
        type: 'number',
        description:
          'Time range to search in minutes (default: 1440 = 24 hours, max: 10080 = 7 days)',
        default: 1440,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of orders to return (default: 50, max: 500)',
        default: 50,
      },
      sortBy: {
        type: 'string',
        enum: ['createdAt', 'updatedAt', 'price'],
        description: 'Field to sort by (default: createdAt)',
        default: 'createdAt',
      },
      sortDirection: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort direction (default: desc)',
        default: 'desc',
      },
    },
  },
};
