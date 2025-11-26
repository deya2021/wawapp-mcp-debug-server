/**
 * Kit 5: Notification Delivery Tracker
 *
 * Tools for debugging FCM notifications and delivery issues.
 *
 * @author WawApp Development Team
 * @date 2025-01-26
 */

import { fcmTokenStatus } from './fcm-token-status.js';
import { notificationTrace } from './notification-trace.js';
import { notificationDeliveryCheck } from './notification-delivery-check.js';

// Tool: wawapp_fcm_token_status
export const fcmTokenStatusSchema = {
  name: 'wawapp_fcm_token_status',
  description: `Check FCM token status for a user (client or driver).

Verifies:
- Token exists in Firestore
- Token is fresh (not stale)
- Token last update timestamp

Use cases:
- User not receiving notifications
- Verify token after app reinstall
- Check token health after logout/login

Example:
{
  "userId": "user_abc123",
  "userType": "client"
}`,
  inputSchema: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'User ID (UID from Firebase Auth)',
      },
      userType: {
        type: 'string',
        enum: ['client', 'driver'],
        description: 'Type of user (client or driver)',
      },
    },
    required: ['userId', 'userType'],
  },
};

// Tool: wawapp_notification_trace
export const notificationTraceSchema = {
  name: 'wawapp_notification_trace',
  description: `Trace all notifications sent for a specific order.

Shows:
- Expected notifications based on order status transitions
- Notification timeline (when each should have been sent)
- Recipient (client or driver)
- Notification type and content

Note: In v1, actual delivery status cannot be verified automatically.
Manual verification via Firebase Console is required.

Use cases:
- User claims they didn't receive notification
- Verify notification timeline for order
- Debug notification logic

Example:
{
  "orderId": "order_xyz789"
}`,
  inputSchema: {
    type: 'object',
    properties: {
      orderId: {
        type: 'string',
        description: 'Order ID to trace notifications for',
      },
    },
    required: ['orderId'],
  },
};

// Tool: wawapp_notification_delivery_check
export const notificationDeliveryCheckSchema = {
  name: 'wawapp_notification_delivery_check',
  description: `Comprehensive notification delivery diagnostics for a user.

Checks:
- FCM token exists
- FCM token is fresh (not expired)
- User profile exists
- Device recently active (connectivity)
- App version supports FCM

Returns:
- Overall delivery capability (can/cannot receive)
- Individual check results (pass/fail/warning)
- Actionable recommendations

Use cases:
- User reports "not receiving any notifications"
- Proactive notification health check
- Debug notification setup after app install

Example:
{
  "userId": "driver_abc123",
  "userType": "driver"
}`,
  inputSchema: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'User ID (UID from Firebase Auth)',
      },
      userType: {
        type: 'string',
        enum: ['client', 'driver'],
        description: 'Type of user (client or driver)',
      },
    },
    required: ['userId', 'userType'],
  },
};

// Export tool handlers
export { fcmTokenStatus, notificationTrace, notificationDeliveryCheck };
