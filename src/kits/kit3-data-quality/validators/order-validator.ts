/**
 * Order document validation
 * Detects data issues that would crash Flutter apps
 */

import type { OrderStatus } from '../../../types/firestore-models.js';
import {
  ValidationResult,
  ValidationError,
  createValidationError,
} from './validation-types.js';

const VALID_ORDER_STATUSES: OrderStatus[] = [
  'matching',
  'requested',
  'assigning',
  'accepted',
  'onRoute',
  'completed',
  'expired',
  'cancelled',
  'cancelledByClient',
  'cancelledByDriver',
];

/**
 * Validate order document for Flutter app compatibility
 */
export function validateOrder(orderDoc: any): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Check createdAt field
  if (!orderDoc.createdAt) {
    errors.push(
      createValidationError(
        'createdAt',
        'Missing createdAt field - Flutter will crash on null check',
        'critical'
      )
    );
  } else if (typeof orderDoc.createdAt === 'string') {
    errors.push(
      createValidationError(
        'createdAt',
        'createdAt is String instead of Timestamp',
        'critical',
        {
          expectedType: 'Timestamp',
          actualType: 'String',
          actualValue: orderDoc.createdAt,
        }
      )
    );
  } else if (
    !orderDoc.createdAt._seconds &&
    typeof orderDoc.createdAt.toDate !== 'function'
  ) {
    errors.push(
      createValidationError(
        'createdAt',
        'createdAt is not a valid Firestore Timestamp',
        'critical',
        {
          expectedType: 'Timestamp',
          actualType: typeof orderDoc.createdAt,
        }
      )
    );
  }

  // 2. Check status field
  if (!orderDoc.status) {
    errors.push(
      createValidationError(
        'status',
        'Missing status field',
        'critical'
      )
    );
  } else if (!VALID_ORDER_STATUSES.includes(orderDoc.status)) {
    errors.push(
      createValidationError(
        'status',
        `Invalid status value: "${orderDoc.status}"`,
        'critical',
        {
          actualValue: orderDoc.status,
          expectedType: `One of: ${VALID_ORDER_STATUSES.join(', ')}`,
        }
      )
    );
  }

  // 3. Check pickup location
  if (!orderDoc.pickup) {
    errors.push(
      createValidationError(
        'pickup',
        'Missing pickup location object',
        'critical'
      )
    );
  } else {
    if (orderDoc.pickup.lat === undefined || orderDoc.pickup.lat === null) {
      errors.push(
        createValidationError(
          'pickup.lat',
          'Missing pickup latitude',
          'critical'
        )
      );
    } else if (typeof orderDoc.pickup.lat !== 'number') {
      errors.push(
        createValidationError(
          'pickup.lat',
          'pickup.lat is not a number',
          'critical',
          {
            expectedType: 'number',
            actualType: typeof orderDoc.pickup.lat,
            actualValue: orderDoc.pickup.lat,
          }
        )
      );
    } else if (
      orderDoc.pickup.lat < -90 ||
      orderDoc.pickup.lat > 90
    ) {
      errors.push(
        createValidationError(
          'pickup.lat',
          `Invalid latitude value: ${orderDoc.pickup.lat}`,
          'critical',
          {
            actualValue: orderDoc.pickup.lat,
          }
        )
      );
    }

    if (orderDoc.pickup.lng === undefined || orderDoc.pickup.lng === null) {
      errors.push(
        createValidationError(
          'pickup.lng',
          'Missing pickup longitude',
          'critical'
        )
      );
    } else if (typeof orderDoc.pickup.lng !== 'number') {
      errors.push(
        createValidationError(
          'pickup.lng',
          'pickup.lng is not a number',
          'critical',
          {
            expectedType: 'number',
            actualType: typeof orderDoc.pickup.lng,
            actualValue: orderDoc.pickup.lng,
          }
        )
      );
    } else if (
      orderDoc.pickup.lng < -180 ||
      orderDoc.pickup.lng > 180
    ) {
      errors.push(
        createValidationError(
          'pickup.lng',
          `Invalid longitude value: ${orderDoc.pickup.lng}`,
          'critical',
          {
            actualValue: orderDoc.pickup.lng,
          }
        )
      );
    }
  }

  // 4. Check dropoff location
  if (!orderDoc.dropoff) {
    errors.push(
      createValidationError(
        'dropoff',
        'Missing dropoff location object',
        'critical'
      )
    );
  } else {
    if (orderDoc.dropoff.lat === undefined || orderDoc.dropoff.lat === null) {
      errors.push(
        createValidationError(
          'dropoff.lat',
          'Missing dropoff latitude',
          'critical'
        )
      );
    } else if (typeof orderDoc.dropoff.lat !== 'number') {
      errors.push(
        createValidationError(
          'dropoff.lat',
          'dropoff.lat is not a number',
          'critical',
          {
            expectedType: 'number',
            actualType: typeof orderDoc.dropoff.lat,
            actualValue: orderDoc.dropoff.lat,
          }
        )
      );
    }

    if (orderDoc.dropoff.lng === undefined || orderDoc.dropoff.lng === null) {
      errors.push(
        createValidationError(
          'dropoff.lng',
          'Missing dropoff longitude',
          'critical'
        )
      );
    } else if (typeof orderDoc.dropoff.lng !== 'number') {
      errors.push(
        createValidationError(
          'dropoff.lng',
          'dropoff.lng is not a number',
          'critical',
          {
            expectedType: 'number',
            actualType: typeof orderDoc.dropoff.lng,
            actualValue: orderDoc.dropoff.lng,
          }
        )
      );
    }
  }

  // 5. Check required string fields
  if (!orderDoc.ownerId || typeof orderDoc.ownerId !== 'string') {
    errors.push(
      createValidationError(
        'ownerId',
        'Missing or invalid ownerId',
        'critical',
        {
          expectedType: 'string',
          actualType: typeof orderDoc.ownerId,
        }
      )
    );
  }

  if (!orderDoc.pickupAddress || typeof orderDoc.pickupAddress !== 'string') {
    errors.push(
      createValidationError(
        'pickupAddress',
        'Missing or invalid pickupAddress',
        'warning',
        {
          expectedType: 'string',
          actualType: typeof orderDoc.pickupAddress,
        }
      )
    );
  }

  if (!orderDoc.dropoffAddress || typeof orderDoc.dropoffAddress !== 'string') {
    errors.push(
      createValidationError(
        'dropoffAddress',
        'Missing or invalid dropoffAddress',
        'warning',
        {
          expectedType: 'string',
          actualType: typeof orderDoc.dropoffAddress,
        }
      )
    );
  }

  // 6. Check numeric fields
  if (orderDoc.price !== undefined && typeof orderDoc.price !== 'number') {
    errors.push(
      createValidationError(
        'price',
        'price should be a number',
        'warning',
        {
          expectedType: 'number',
          actualType: typeof orderDoc.price,
          actualValue: orderDoc.price,
        }
      )
    );
  }

  if (orderDoc.distanceKm !== undefined && typeof orderDoc.distanceKm !== 'number') {
    errors.push(
      createValidationError(
        'distanceKm',
        'distanceKm should be a number',
        'warning',
        {
          expectedType: 'number',
          actualType: typeof orderDoc.distanceKm,
          actualValue: orderDoc.distanceKm,
        }
      )
    );
  }

  return {
    isValid: errors.filter((e) => e.severity === 'critical').length === 0,
    errors,
  };
}
