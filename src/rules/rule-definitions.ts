/**
 * Rule ID Taxonomy (Phase 1 + Phase 2 + Phase 3)
 *
 * Defines stable rule identifiers for failure scenarios.
 * Phase 1: Order visibility incident
 * Phase 2: Firestore reliability (index, permissions, queries)
 * Phase 3: Notifications, Functions, Listener health
 *
 * @author WawApp Development Team
 * @date 2025-12-13
 * @version 3.0 (Phase 3)
 */

import type { Severity } from '../types/standard-output.js';

export interface RuleDefinition {
  ruleId: string;
  severity: Severity;
  category: string;
  title: string;
  description: string;
}

/**
 * Phase 1 Rule Definitions
 * Focused on: driver profile, location, online state, order visibility
 */
export const RULE_DEFINITIONS: Record<string, RuleDefinition> = {
  // ===== DRIVER PROFILE =====
  'PROFILE_MISSING:name': {
    ruleId: 'PROFILE_MISSING:name',
    severity: 'CRITICAL',
    category: 'DRIVER',
    title: 'Driver name missing',
    description: 'Driver profile does not have a name field. Required for order matching.',
  },
  'PROFILE_MISSING:phone': {
    ruleId: 'PROFILE_MISSING:phone',
    severity: 'CRITICAL',
    category: 'DRIVER',
    title: 'Driver phone missing',
    description: 'Driver profile does not have a phone number.',
  },
  'PROFILE_MISSING:city': {
    ruleId: 'PROFILE_MISSING:city',
    severity: 'CRITICAL',
    category: 'DRIVER',
    title: 'Driver city missing',
    description: 'Driver profile does not have a city field.',
  },
  'PROFILE_MISSING:region': {
    ruleId: 'PROFILE_MISSING:region',
    severity: 'CRITICAL',
    category: 'DRIVER',
    title: 'Driver region missing',
    description: 'Driver profile does not have a region field.',
  },

  // ===== LOCATION =====
  'LOCATION_STALE': {
    ruleId: 'LOCATION_STALE',
    severity: 'CRITICAL',
    category: 'LOCATION',
    title: 'Location data stale',
    description: 'Driver location has not been updated recently (exceeds threshold).',
  },
  'LOCATION_MISSING': {
    ruleId: 'LOCATION_MISSING',
    severity: 'CRITICAL',
    category: 'LOCATION',
    title: 'Location data missing',
    description: 'Driver location document does not exist.',
  },
  'LOCATION_INVALID_COORDS': {
    ruleId: 'LOCATION_INVALID_COORDS',
    severity: 'CRITICAL',
    category: 'LOCATION',
    title: 'Invalid GPS coordinates',
    description: 'Location coordinates are invalid (0,0 or out of range).',
  },

  // ===== DRIVER STATE =====
  'DRIVER_OFFLINE': {
    ruleId: 'DRIVER_OFFLINE',
    severity: 'CRITICAL',
    category: 'DRIVER',
    title: 'Driver offline',
    description: 'Driver isOnline=false. Cannot receive orders.',
  },
  'DRIVER_NOT_VERIFIED': {
    ruleId: 'DRIVER_NOT_VERIFIED',
    severity: 'CRITICAL',
    category: 'DRIVER',
    title: 'Driver not verified',
    description: 'Driver isVerified=false. Admin verification required.',
  },
  'DRIVER_NOT_FOUND': {
    ruleId: 'DRIVER_NOT_FOUND',
    severity: 'CRITICAL',
    category: 'DRIVER',
    title: 'Driver document not found',
    description: 'Driver does not exist in /drivers collection.',
  },

  // ===== ORDER =====
  'ORDER_NOT_IN_MATCHING_POOL': {
    ruleId: 'ORDER_NOT_IN_MATCHING_POOL',
    severity: 'WARNING',
    category: 'ORDER',
    title: 'Order not in matching status',
    description: 'Order status is not "matching", so not visible to drivers.',
  },
  'ORDER_NOT_FOUND': {
    ruleId: 'ORDER_NOT_FOUND',
    severity: 'CRITICAL',
    category: 'ORDER',
    title: 'Order not found',
    description: 'Order does not exist in /orders collection.',
  },
  'ORDER_STATUS_INVALID': {
    ruleId: 'ORDER_STATUS_INVALID',
    severity: 'CRITICAL',
    category: 'ORDER',
    title: 'Order has invalid status',
    description: 'Order status field contains an unrecognized value.',
  },

  // ===== MATCHING =====
  'ORDER_OUTSIDE_RADIUS': {
    ruleId: 'ORDER_OUTSIDE_RADIUS',
    severity: 'WARNING',
    category: 'MATCHING',
    title: 'Order outside driver radius',
    description: 'Order pickup location is outside driver search radius.',
  },
  'DISTANCE_CALCULATION_FAILED': {
    ruleId: 'DISTANCE_CALCULATION_FAILED',
    severity: 'CRITICAL',
    category: 'MATCHING',
    title: 'Distance calculation failed',
    description: 'Cannot calculate distance between driver and order (missing coordinates).',
  },

  // ===== FIRESTORE RELIABILITY (Phase 2) =====
  'FIRESTORE_INDEX_MISSING': {
    ruleId: 'FIRESTORE_INDEX_MISSING',
    severity: 'CRITICAL',
    category: 'RELIABILITY',
    title: 'Firestore composite index missing',
    description: 'Required Firestore composite index does not exist. Query will fail.',
  },
  'QUERY_UNBOUNDED:NO_LIMIT': {
    ruleId: 'QUERY_UNBOUNDED:NO_LIMIT',
    severity: 'WARNING',
    category: 'RELIABILITY',
    title: 'Unbounded query (no limit)',
    description: 'Firestore query executed without a limit, may cause performance issues or runaway costs.',
  },
  'PERMISSION_DENIED': {
    ruleId: 'PERMISSION_DENIED',
    severity: 'CRITICAL',
    category: 'RELIABILITY',
    title: 'Permission denied',
    description: 'Firestore security rules denied access to path.',
  },
  'LISTENER_ERROR': {
    ruleId: 'LISTENER_ERROR',
    severity: 'CRITICAL',
    category: 'RELIABILITY',
    title: 'Firestore listener error',
    description: 'Real-time listener encountered an error (permissions, index, or network issue).',
  },

  // ===== NOTIFICATIONS (Phase 3) =====
  'FCM_TOKEN_MISSING': {
    ruleId: 'FCM_TOKEN_MISSING',
    severity: 'CRITICAL',
    category: 'NOTIFICATIONS',
    title: 'FCM token missing',
    description: 'User has no FCM token stored. Cannot receive push notifications.',
  },
  'FCM_TOKEN_STALE': {
    ruleId: 'FCM_TOKEN_STALE',
    severity: 'WARNING',
    category: 'NOTIFICATIONS',
    title: 'FCM token is stale',
    description: 'FCM token has not been updated recently (older than threshold). May cause delivery failures.',
  },
  'FCM_TOKEN_INVALID_FORMAT': {
    ruleId: 'FCM_TOKEN_INVALID_FORMAT',
    severity: 'WARNING',
    category: 'NOTIFICATIONS',
    title: 'FCM token invalid format',
    description: 'FCM token format appears invalid (wrong length or invalid characters).',
  },
  'NOTIFICATION_SEND_NO_EVIDENCE': {
    ruleId: 'NOTIFICATION_SEND_NO_EVIDENCE',
    severity: 'WARNING',
    category: 'NOTIFICATIONS',
    title: 'No evidence of notification send',
    description: 'No logs found indicating notification was sent to recipient.',
  },
  'FCM_SEND_FAILED': {
    ruleId: 'FCM_SEND_FAILED',
    severity: 'WARNING',
    category: 'NOTIFICATIONS',
    title: 'FCM send failed',
    description: 'FCM reported failure when attempting to send notification.',
  },

  // ===== CLOUD FUNCTIONS (Phase 3) =====
  'FUNCTION_TIMEOUT:notifyOrderEvents': {
    ruleId: 'FUNCTION_TIMEOUT:notifyOrderEvents',
    severity: 'CRITICAL',
    category: 'FUNCTIONS',
    title: 'Function timeout: notifyOrderEvents',
    description: 'Cloud Function notifyOrderEvents exceeded timeout limit.',
  },
  'FUNCTION_TIMEOUT:expireStaleOrders': {
    ruleId: 'FUNCTION_TIMEOUT:expireStaleOrders',
    severity: 'CRITICAL',
    category: 'FUNCTIONS',
    title: 'Function timeout: expireStaleOrders',
    description: 'Cloud Function expireStaleOrders exceeded timeout limit.',
  },
  'FUNCTION_TIMEOUT:aggregateDriverRating': {
    ruleId: 'FUNCTION_TIMEOUT:aggregateDriverRating',
    severity: 'CRITICAL',
    category: 'FUNCTIONS',
    title: 'Function timeout: aggregateDriverRating',
    description: 'Cloud Function aggregateDriverRating exceeded timeout limit.',
  },
  'FUNCTION_ERROR:notifyOrderEvents': {
    ruleId: 'FUNCTION_ERROR:notifyOrderEvents',
    severity: 'WARNING',
    category: 'FUNCTIONS',
    title: 'Function error: notifyOrderEvents',
    description: 'Cloud Function notifyOrderEvents failed with error.',
  },
  'FUNCTION_ERROR:expireStaleOrders': {
    ruleId: 'FUNCTION_ERROR:expireStaleOrders',
    severity: 'WARNING',
    category: 'FUNCTIONS',
    title: 'Function error: expireStaleOrders',
    description: 'Cloud Function expireStaleOrders failed with error.',
  },
  'FUNCTION_ERROR:aggregateDriverRating': {
    ruleId: 'FUNCTION_ERROR:aggregateDriverRating',
    severity: 'WARNING',
    category: 'FUNCTIONS',
    title: 'Function error: aggregateDriverRating',
    description: 'Cloud Function aggregateDriverRating failed with error.',
  },
  'FUNCTION_TRACE_NOT_FOUND': {
    ruleId: 'FUNCTION_TRACE_NOT_FOUND',
    severity: 'WARNING',
    category: 'FUNCTIONS',
    title: 'Function execution trace not found',
    description: 'No execution logs found for Cloud Function. May indicate function not triggered.',
  },

  // ===== TELEMETRY (Phase 3) =====
  'LISTENER_DISCONNECTED': {
    ruleId: 'LISTENER_DISCONNECTED',
    severity: 'WARNING',
    category: 'TELEMETRY',
    title: 'Firestore listener disconnected',
    description: 'Real-time listener is disconnected or in error state.',
  },
  'LISTENER_HEALTH_INCONCLUSIVE': {
    ruleId: 'LISTENER_HEALTH_INCONCLUSIVE',
    severity: 'INFO',
    category: 'TELEMETRY',
    title: 'Listener health inconclusive',
    description: 'Cannot determine listener health without telemetry infrastructure.',
  },

  // ===== GENERAL =====
  'PROFILE_NOT_FOUND': {
    ruleId: 'PROFILE_NOT_FOUND',
    severity: 'CRITICAL',
    category: 'GENERAL',
    title: 'User profile not found',
    description: 'User or driver profile does not exist in Firestore.',
  },
  'INVALID_PATH': {
    ruleId: 'INVALID_PATH',
    severity: 'CRITICAL',
    category: 'GENERAL',
    title: 'Invalid Firestore path',
    description: 'Firestore path format is invalid.',
  },
};

/**
 * Get rule definition by ID
 */
export function getRuleDefinition(ruleId: string): RuleDefinition | undefined {
  return RULE_DEFINITIONS[ruleId];
}

/**
 * Get severity for a rule ID
 */
export function getRuleSeverity(ruleId: string): Severity {
  return RULE_DEFINITIONS[ruleId]?.severity || 'WARNING';
}
