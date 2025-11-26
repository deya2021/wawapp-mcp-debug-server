import { currentEnv } from './environment.js';

// Time range limits
export const MAX_TIME_RANGE_DAYS = currentEnv.maxTimeRangeDays;
export const DEFAULT_LOOKBACK_HOURS = 24;

// Matching logic constants (MUST match production values in orders_service.dart)
export const NEARBY_RADIUS_KM = 6.0;
export const STALE_LOCATION_THRESHOLD_MINUTES = 5;
export const STUCK_ORDER_MATCHING_THRESHOLD_MINUTES = 10;
export const STUCK_ORDER_ACCEPTED_THRESHOLD_MINUTES = 30;
export const STUCK_ORDER_ON_ROUTE_THRESHOLD_MINUTES = 120;

// Rate limiting
export const RATE_LIMIT_PER_TOOL = currentEnv.rateLimit.perTool;
export const RATE_LIMIT_GLOBAL = currentEnv.rateLimit.global;

// PII masking
export const GPS_PRECISION_DECIMALS = 4;
export const MASK_PHONE_NUMBERS = true;
export const MASK_NAMES = true;
export const ROUND_GPS_COORDINATES = true;

// Cloud Functions
export const CLOUD_FUNCTIONS = {
  EXPIRE_STALE_ORDERS: 'expireStaleOrders',
  NOTIFY_ORDER_EVENTS: 'notifyOrderEvents',
  AGGREGATE_DRIVER_RATING: 'aggregateDriverRating',
} as const;
