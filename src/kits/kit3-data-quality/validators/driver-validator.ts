/**
 * Driver profile validation
 * Detects incomplete or malformed driver profiles
 */

import {
  ValidationResult,
  ValidationError,
  createValidationError,
} from './validation-types.js';

/**
 * Validate driver profile for Flutter app compatibility
 */
export function validateDriver(driverDoc: any): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Check required string fields
  if (!driverDoc.name || typeof driverDoc.name !== 'string') {
    errors.push(
      createValidationError(
        'name',
        'Missing or invalid driver name',
        'critical',
        {
          expectedType: 'string',
          actualType: typeof driverDoc.name,
        }
      )
    );
  }

  if (!driverDoc.phone || typeof driverDoc.phone !== 'string') {
    errors.push(
      createValidationError(
        'phone',
        'Missing or invalid phone number',
        'critical',
        {
          expectedType: 'string',
          actualType: typeof driverDoc.phone,
        }
      )
    );
  }

  // 2. Check boolean fields
  if (driverDoc.isVerified === undefined || driverDoc.isVerified === null) {
    errors.push(
      createValidationError(
        'isVerified',
        'Missing isVerified field - required for eligibility checks',
        'critical'
      )
    );
  } else if (typeof driverDoc.isVerified !== 'boolean') {
    errors.push(
      createValidationError(
        'isVerified',
        'isVerified should be boolean',
        'critical',
        {
          expectedType: 'boolean',
          actualType: typeof driverDoc.isVerified,
          actualValue: driverDoc.isVerified,
        }
      )
    );
  }

  if (driverDoc.isOnline === undefined || driverDoc.isOnline === null) {
    errors.push(
      createValidationError(
        'isOnline',
        'Missing isOnline field',
        'warning'
      )
    );
  } else if (typeof driverDoc.isOnline !== 'boolean') {
    errors.push(
      createValidationError(
        'isOnline',
        'isOnline should be boolean',
        'warning',
        {
          expectedType: 'boolean',
          actualType: typeof driverDoc.isOnline,
          actualValue: driverDoc.isOnline,
        }
      )
    );
  }

  // 3. Check numeric fields
  if (driverDoc.rating !== undefined && typeof driverDoc.rating !== 'number') {
    errors.push(
      createValidationError(
        'rating',
        'rating should be a number',
        'warning',
        {
          expectedType: 'number',
          actualType: typeof driverDoc.rating,
          actualValue: driverDoc.rating,
        }
      )
    );
  } else if (
    driverDoc.rating !== undefined &&
    (driverDoc.rating < 0 || driverDoc.rating > 5)
  ) {
    errors.push(
      createValidationError(
        'rating',
        `Invalid rating value: ${driverDoc.rating} (should be 0-5)`,
        'warning',
        {
          actualValue: driverDoc.rating,
        }
      )
    );
  }

  if (driverDoc.totalTrips !== undefined && typeof driverDoc.totalTrips !== 'number') {
    errors.push(
      createValidationError(
        'totalTrips',
        'totalTrips should be a number',
        'warning',
        {
          expectedType: 'number',
          actualType: typeof driverDoc.totalTrips,
          actualValue: driverDoc.totalTrips,
        }
      )
    );
  } else if (
    driverDoc.totalTrips !== undefined &&
    driverDoc.totalTrips < 0
  ) {
    errors.push(
      createValidationError(
        'totalTrips',
        `Invalid totalTrips value: ${driverDoc.totalTrips} (should be >= 0)`,
        'warning',
        {
          actualValue: driverDoc.totalTrips,
        }
      )
    );
  }

  // 4. Check timestamps
  if (!driverDoc.createdAt) {
    errors.push(
      createValidationError(
        'createdAt',
        'Missing createdAt field',
        'warning'
      )
    );
  } else if (typeof driverDoc.createdAt === 'string') {
    errors.push(
      createValidationError(
        'createdAt',
        'createdAt is String instead of Timestamp',
        'warning',
        {
          expectedType: 'Timestamp',
          actualType: 'String',
          actualValue: driverDoc.createdAt,
        }
      )
    );
  }

  if (!driverDoc.updatedAt) {
    errors.push(
      createValidationError(
        'updatedAt',
        'Missing updatedAt field',
        'warning'
      )
    );
  } else if (typeof driverDoc.updatedAt === 'string') {
    errors.push(
      createValidationError(
        'updatedAt',
        'updatedAt is String instead of Timestamp',
        'warning',
        {
          expectedType: 'Timestamp',
          actualType: 'String',
          actualValue: driverDoc.updatedAt,
        }
      )
    );
  }

  // 5. Check location fields (optional but should be valid if present)
  if (driverDoc.city !== undefined && typeof driverDoc.city !== 'string') {
    errors.push(
      createValidationError(
        'city',
        'city should be a string if present',
        'warning',
        {
          expectedType: 'string',
          actualType: typeof driverDoc.city,
        }
      )
    );
  }

  if (driverDoc.region !== undefined && typeof driverDoc.region !== 'string') {
    errors.push(
      createValidationError(
        'region',
        'region should be a string if present',
        'warning',
        {
          expectedType: 'string',
          actualType: typeof driverDoc.region,
        }
      )
    );
  }

  return {
    isValid: errors.filter((e) => e.severity === 'critical').length === 0,
    errors,
  };
}
