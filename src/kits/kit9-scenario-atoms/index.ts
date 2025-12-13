/**
 * Kit 9: Scenario Atoms (Phase 1 + Phase 2 + Phase 3)
 *
 * Atomic diagnostic tools for scenario orchestration.
 * Phase 1: Order visibility diagnosis (5 atoms)
 * Phase 2: Firestore reliability (2 atoms)
 * Phase 3: Notifications, Functions, Telemetry (4 atoms)
 *
 * @author WawApp Development Team
 * @date 2025-12-13
 * @version 3.0 (Phase 3)
 */

// Driver atoms
export {
  driverProfileAudit,
  driverLocationFreshness,
  driverOnlineState,
} from './driver-atoms.js';

// Order atoms
export {
  orderStateAudit,
  matchingRuleTrace,
} from './order-atoms.js';

// Reliability atoms (Phase 2)
export {
  nearbyOrdersQuerySimulator,
  permissionRuleProbe,
} from './reliability-atoms.js';

// Notifications atoms (Phase 3)
export {
  fcmTokenHealth,
  notificationDeliveryAudit,
} from './notifications-atoms.js';

// Functions atoms (Phase 3)
export {
  functionsInvocationTrace,
} from './functions-atoms.js';

// Telemetry atoms (Phase 3)
export {
  firestoreListenerHealth,
} from './telemetry-atoms.js';

/**
 * Atom registry for orchestrator
 */
export const ATOM_REGISTRY = {
  // Phase 1 atoms
  driver_profile_audit: 'driverProfileAudit',
  driver_location_freshness: 'driverLocationFreshness',
  driver_online_state: 'driverOnlineState',
  order_state_audit: 'orderStateAudit',
  matching_rule_trace: 'matchingRuleTrace',
  // Phase 2 atoms
  nearby_orders_query_simulator: 'nearbyOrdersQuerySimulator',
  permission_rule_probe: 'permissionRuleProbe',
  // Phase 3 atoms
  fcm_token_health: 'fcmTokenHealth',
  notification_delivery_audit: 'notificationDeliveryAudit',
  functions_invocation_trace: 'functionsInvocationTrace',
  firestore_listener_health: 'firestoreListenerHealth',
} as const;

/**
 * MCP tool schemas for atoms
 * Note: Atoms are primarily used by orchestrator, not exposed directly as MCP tools in Phase 1
 */
export const atomSchemas = {
  driver_profile_audit: {
    name: 'wawapp_driver_profile_audit',
    description:
      'Audit driver profile for completeness and verification. Returns rule IDs for missing fields (PROFILE_MISSING:name, PROFILE_MISSING:phone, etc.) and verification status (DRIVER_NOT_VERIFIED).',
    inputSchema: {
      type: 'object',
      properties: {
        driverId: { type: 'string', description: 'Driver UID' },
      },
      required: ['driverId'],
    },
  },
  driver_location_freshness: {
    name: 'wawapp_driver_location_freshness',
    description:
      'Check driver location freshness and validity. Returns rule IDs: LOCATION_MISSING, LOCATION_STALE, LOCATION_INVALID_COORDS.',
    inputSchema: {
      type: 'object',
      properties: {
        driverId: { type: 'string', description: 'Driver UID' },
        maxAgeMinutes: {
          type: 'number',
          description: 'Maximum age in minutes (default: 5)',
          default: 5,
        },
      },
      required: ['driverId'],
    },
  },
  driver_online_state: {
    name: 'wawapp_driver_online_state',
    description:
      'Check if driver is currently online. Returns rule IDs: DRIVER_OFFLINE, DRIVER_NOT_FOUND.',
    inputSchema: {
      type: 'object',
      properties: {
        driverId: { type: 'string', description: 'Driver UID' },
      },
      required: ['driverId'],
    },
  },
  order_state_audit: {
    name: 'wawapp_order_state_audit',
    description:
      'Audit order state and validity. Returns rule IDs: ORDER_NOT_FOUND, ORDER_NOT_IN_MATCHING_POOL, ORDER_STATUS_INVALID.',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID' },
      },
      required: ['orderId'],
    },
  },
  matching_rule_trace: {
    name: 'wawapp_matching_rule_trace',
    description:
      'Trace matching rules to determine why order is/isn\'t visible to driver. Returns rule IDs: ORDER_OUTSIDE_RADIUS, DISTANCE_CALCULATION_FAILED, plus all order/location rule IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID' },
        driverId: { type: 'string', description: 'Driver ID' },
        radiusKm: {
          type: 'number',
          description: 'Search radius in km (default: 6.0)',
          default: 6.0,
        },
      },
      required: ['orderId', 'driverId'],
    },
  },
};
