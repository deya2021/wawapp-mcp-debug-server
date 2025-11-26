/**
 * Kit 4: Real-time Location Intelligence
 * Tool: wawapp_location_density_heatmap
 *
 * Analyze geographic distribution of drivers and orders.
 * Provides supply/demand ratio and density insights.
 *
 * @author WawApp Development Team
 * @date 2025-11-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { calculateDistance } from '../../utils/haversine.js';

const InputSchema = z.object({
  centerLat: z
    .number()
    .min(-90)
    .max(90)
    .optional()
    .describe('Center latitude for analysis (optional)'),
  centerLng: z
    .number()
    .min(-180)
    .max(180)
    .optional()
    .describe('Center longitude for analysis (optional)'),
  radiusKm: z
    .number()
    .positive()
    .default(10.0)
    .describe('Analysis radius in km (default: 10.0)'),
  region: z.string().optional().describe('Filter by region name (optional)'),
  city: z.string().optional().describe('Filter by city name (optional)'),
  timeRangeMinutes: z
    .number()
    .min(1)
    .max(1440)
    .default(60)
    .describe('Time range for order analysis (default: 60 min)'),
});

type LocationDensityInput = z.infer<typeof InputSchema>;

interface DensityZone {
  zone: string;
  center: { lat: number; lng: number };
  driverCount: number;
  onlineDriverCount: number;
  orderCount: number;
  activeOrderCount: number;
  supplyDemandRatio: number;
  status: 'oversupply' | 'balanced' | 'undersupply' | 'critical';
}

interface LocationDensityResult {
  summary: string;
  analysisArea: {
    center?: { lat: number; lng: number };
    radiusKm: number;
    region?: string;
    city?: string;
  };
  overall: {
    totalDrivers: number;
    onlineDrivers: number;
    totalOrders: number;
    activeOrders: number;
    supplyDemandRatio: number;
    status: string;
  };
  zones?: DensityZone[];
  hotspots: {
    highDemand: Array<{ location: string; orderCount: number }>;
    lowSupply: Array<{ location: string; onlineDrivers: number }>;
  };
  recommendations: string[];
}

export async function locationDensityHeatmap(
  params: unknown
): Promise<LocationDensityResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  // Calculate time threshold for orders
  const now = new Date();
  const timeRangeMs = input.timeRangeMinutes * 60 * 1000;
  const thresholdDate = new Date(now.getTime() - timeRangeMs);

  try {
    // Fetch drivers
    let drivers = await firestore.queryDocuments('drivers', [], {
      limit: 1000,
    });

    // Filter by region/city if specified
    if (input.region) {
      drivers = drivers.filter((d) => d.region === input.region);
    }
    if (input.city) {
      drivers = drivers.filter((d) => d.city === input.city);
    }

    // Fetch driver locations
    const driversWithLocations: any[] = [];

    for (const driver of drivers) {
      const locationDoc = await firestore.getDocument(
        'driver_locations',
        driver.id
      );

      if (!locationDoc) continue;

      const lat = locationDoc.latitude || locationDoc.lat;
      const lng = locationDoc.longitude || locationDoc.lng;

      if (!lat || !lng || lat === 0 || lng === 0) continue;

      // Filter by radius if center is specified
      if (input.centerLat !== undefined && input.centerLng !== undefined) {
        const distance = calculateDistance(
          input.centerLat,
          input.centerLng,
          lat,
          lng
        );

        if (distance > input.radiusKm) continue;
      }

      driversWithLocations.push({
        ...driver,
        location: { lat, lng },
      });
    }

    // Fetch orders
    let orders = await firestore.queryDocuments('orders', [], {
      limit: 1000,
      orderBy: {
        field: 'createdAt',
        direction: 'desc',
      },
    });

    // Filter by time range
    orders = orders.filter((order) => {
      const createdAt = firestore.timestampToDate(order.createdAt);
      return createdAt && createdAt >= thresholdDate;
    });

    // Filter by region/city if specified
    if (input.region) {
      orders = orders.filter((o) => o.pickup?.region === input.region);
    }
    if (input.city) {
      orders = orders.filter((o) => o.pickup?.city === input.city);
    }

    // Filter by radius if center is specified
    if (input.centerLat !== undefined && input.centerLng !== undefined) {
      orders = orders.filter((order) => {
        const pickupLat = order.pickup?.lat || order.pickup?.latitude;
        const pickupLng = order.pickup?.lng || order.pickup?.longitude;

        if (!pickupLat || !pickupLng) return false;

        const distance = calculateDistance(
          input.centerLat!,
          input.centerLng!,
          pickupLat,
          pickupLng
        );

        return distance <= input.radiusKm;
      });
    }

    // Calculate overall metrics
    const totalDrivers = driversWithLocations.length;
    const onlineDrivers = driversWithLocations.filter(
      (d) => d.isOnline === true
    ).length;
    const totalOrders = orders.length;
    const activeOrders = orders.filter(
      (o) =>
        o.status === 'matching' ||
        o.status === 'accepted' ||
        o.status === 'onRoute'
    ).length;

    const supplyDemandRatio =
      activeOrders > 0 ? onlineDrivers / activeOrders : onlineDrivers;

    let status: string;
    if (supplyDemandRatio >= 2) {
      status = 'oversupply';
    } else if (supplyDemandRatio >= 1) {
      status = 'balanced';
    } else if (supplyDemandRatio >= 0.5) {
      status = 'undersupply';
    } else {
      status = 'critical';
    }

    // Identify hotspots
    const ordersByLocation: Record<string, number> = {};
    const driversByLocation: Record<string, number> = {};

    for (const order of orders) {
      const city = order.pickup?.city || 'Unknown';
      ordersByLocation[city] = (ordersByLocation[city] || 0) + 1;
    }

    for (const driver of driversWithLocations) {
      if (driver.isOnline) {
        const city = driver.city || 'Unknown';
        driversByLocation[city] = (driversByLocation[city] || 0) + 1;
      }
    }

    // High demand areas (most orders)
    const highDemand = Object.entries(ordersByLocation)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([location, orderCount]) => ({ location, orderCount }));

    // Low supply areas (fewest online drivers)
    const lowSupply = Object.entries(driversByLocation)
      .sort(([, a], [, b]) => a - b)
      .slice(0, 5)
      .map(([location, onlineDrivers]) => ({ location, onlineDrivers }));

    // Generate recommendations
    const recommendations: string[] = [];

    if (status === 'critical') {
      recommendations.push(
        `🚨 CRITICAL: Supply/demand ratio is ${supplyDemandRatio.toFixed(2)} (${onlineDrivers} drivers vs ${activeOrders} active orders). Urgent driver recruitment needed.`
      );
    } else if (status === 'undersupply') {
      recommendations.push(
        `⚠️ UNDERSUPPLY: Supply/demand ratio is ${supplyDemandRatio.toFixed(2)}. Consider incentives to bring more drivers online.`
      );
    } else if (status === 'balanced') {
      recommendations.push(
        `✅ Supply/demand is balanced (ratio: ${supplyDemandRatio.toFixed(2)}).`
      );
    } else {
      recommendations.push(
        `ℹ️ OVERSUPPLY: More drivers than active orders (ratio: ${supplyDemandRatio.toFixed(2)}). Drivers may experience idle time.`
      );
    }

    if (highDemand.length > 0) {
      const top = highDemand[0];
      recommendations.push(
        `📍 Highest demand area: ${top.location} (${top.orderCount} orders in ${input.timeRangeMinutes} min).`
      );
    }

    if (lowSupply.length > 0) {
      const top = lowSupply[0];
      recommendations.push(
        `🚗 Lowest driver supply: ${top.location} (${top.onlineDrivers} online drivers). Recruit drivers in this area.`
      );
    }

    // Build summary
    const areaDesc = input.region
      ? `region "${input.region}"`
      : input.city
        ? `city "${input.city}"`
        : input.centerLat !== undefined
          ? `${input.radiusKm}km radius from (${input.centerLat.toFixed(2)}, ${input.centerLng?.toFixed(2)})`
          : 'all areas';

    const summary = `Analyzed ${areaDesc}. Found ${onlineDrivers} online drivers and ${activeOrders} active orders. Supply/demand ratio: ${supplyDemandRatio.toFixed(2)} (${status}).${highDemand.length > 0 ? ` Highest demand: ${highDemand[0].location}.` : ''}`;

    return {
      summary,
      analysisArea: {
        center:
          input.centerLat !== undefined && input.centerLng !== undefined
            ? { lat: input.centerLat, lng: input.centerLng }
            : undefined,
        radiusKm: input.radiusKm,
        region: input.region,
        city: input.city,
      },
      overall: {
        totalDrivers,
        onlineDrivers,
        totalOrders,
        activeOrders,
        supplyDemandRatio: Math.round(supplyDemandRatio * 100) / 100,
        status,
      },
      hotspots: {
        highDemand,
        lowSupply,
      },
      recommendations,
    };
  } catch (error: any) {
    throw new Error(
      `[location-density-heatmap] Failed to analyze density: ${error.message}`
    );
  }
}

export const locationDensityHeatmapSchema = {
  name: 'wawapp_location_density_heatmap',
  description:
    'Analyze geographic distribution of drivers and orders. Provides supply/demand ratio, density insights, hotspots (high demand areas, low supply areas), and actionable recommendations. Can filter by region, city, or coordinates+radius. Returns overall metrics and identifies areas needing attention.',
  inputSchema: {
    type: 'object',
    properties: {
      centerLat: {
        type: 'number',
        description: 'Center latitude for analysis (optional, -90 to 90)',
      },
      centerLng: {
        type: 'number',
        description: 'Center longitude for analysis (optional, -180 to 180)',
      },
      radiusKm: {
        type: 'number',
        description: 'Analysis radius in kilometers (default: 10.0)',
        default: 10.0,
      },
      region: {
        type: 'string',
        description: 'Filter by region name (optional)',
      },
      city: {
        type: 'string',
        description: 'Filter by city name (optional)',
      },
      timeRangeMinutes: {
        type: 'number',
        description:
          'Time range for order analysis in minutes (default: 60, max: 1440)',
        default: 60,
      },
    },
  },
};
