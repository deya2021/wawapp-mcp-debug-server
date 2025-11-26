/**
 * Kit 5: Notification Delivery Tracker
 * Tool: wawapp_notification_delivery_check
 *
 * Comprehensive notification delivery diagnostics for a user.
 * Checks all factors that could prevent notifications from being delivered.
 *
 * @author WawApp Development Team
 * @date 2025-01-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { getAge } from '../../utils/time-helpers.js';

const InputSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  userType: z.enum(['client', 'driver'], {
    errorMap: () => ({ message: 'userType must be "client" or "driver"' }),
  }),
});

interface DeliveryCheck {
  check: string;
  status: 'pass' | 'fail' | 'warning' | 'unknown';
  details?: string;
  recommendation?: string;
}

interface NotificationDeliveryCheck {
  userId: string;
  userType: 'client' | 'driver';
  canReceiveNotifications: boolean;
  checks: {
    fcmTokenExists: DeliveryCheck;
    fcmTokenFresh: DeliveryCheck;
    userProfileExists: DeliveryCheck;
    deviceConnectivity: DeliveryCheck;
    appVersion: DeliveryCheck;
  };
  summary: string;
  recommendations: string[];
}

export async function notificationDeliveryCheck(
  params: unknown
): Promise<NotificationDeliveryCheck> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  const collection = input.userType === 'client' ? 'users' : 'drivers';
  const recommendations: string[] = [];

  // Initialize checks
  const checks: NotificationDeliveryCheck['checks'] = {
    fcmTokenExists: {
      check: 'FCM Token Exists',
      status: 'unknown',
    },
    fcmTokenFresh: {
      check: 'FCM Token is Fresh',
      status: 'unknown',
    },
    userProfileExists: {
      check: 'User Profile Exists',
      status: 'unknown',
    },
    deviceConnectivity: {
      check: 'Device Recently Active',
      status: 'unknown',
    },
    appVersion: {
      check: 'App Version Supports FCM',
      status: 'unknown',
    },
  };

  // Fetch user document
  const userDoc = await firestore.getDocument(collection, input.userId);

  // Check 1: User Profile Exists
  if (!userDoc) {
    checks.userProfileExists = {
      check: 'User Profile Exists',
      status: 'fail',
      details: `No ${input.userType} profile found in /${collection} collection`,
      recommendation: 'User account does not exist. Verify userId is correct.',
    };

    recommendations.push('User profile not found - cannot receive notifications');

    return {
      userId: input.userId,
      userType: input.userType,
      canReceiveNotifications: false,
      checks,
      summary: 'Cannot receive notifications: User profile does not exist',
      recommendations,
    };
  }

  checks.userProfileExists = {
    check: 'User Profile Exists',
    status: 'pass',
    details: `Profile found in /${collection}/${input.userId}`,
  };

  // Check 2: FCM Token Exists
  const fcmToken = userDoc.fcmToken as string | undefined;

  if (!fcmToken || fcmToken === '') {
    checks.fcmTokenExists = {
      check: 'FCM Token Exists',
      status: 'fail',
      details: 'No fcmToken field in user document',
      recommendation: 'User has not granted notification permissions or app did not initialize FCM',
    };

    recommendations.push('User needs to grant notification permissions in device settings');
    recommendations.push('User should restart the app to trigger FCM token registration');
  } else {
    checks.fcmTokenExists = {
      check: 'FCM Token Exists',
      status: 'pass',
      details: `Token: ${fcmToken.substring(0, 20)}... (${fcmToken.length} chars)`,
    };
  }

  // Check 3: FCM Token Freshness
  const fcmTokenUpdatedAt = userDoc.fcmTokenUpdatedAt;

  if (!fcmTokenUpdatedAt) {
    checks.fcmTokenFresh = {
      check: 'FCM Token is Fresh',
      status: 'warning',
      details: 'fcmTokenUpdatedAt field is missing - cannot determine token age',
      recommendation: 'Token exists but update timestamp is missing',
    };

    recommendations.push('Token age unknown - consider asking user to logout and login again');
  } else {
    const updatedDate = firestore.timestampToDate(fcmTokenUpdatedAt);

    if (updatedDate) {
      const tokenAge = getAge(updatedDate);
      const daysSinceUpdate = Math.floor(
        (Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceUpdate > 60) {
        checks.fcmTokenFresh = {
          check: 'FCM Token is Fresh',
          status: 'warning',
          details: `Token is ${daysSinceUpdate} days old (last updated: ${tokenAge})`,
          recommendation: 'Token is stale. FCM tokens should refresh automatically every ~60 days.',
        };

        recommendations.push(
          `Token is stale (${daysSinceUpdate} days old) - ask user to logout and login to refresh token`
        );
      } else {
        checks.fcmTokenFresh = {
          check: 'FCM Token is Fresh',
          status: 'pass',
          details: `Token is ${daysSinceUpdate} days old (updated ${tokenAge})`,
        };
      }
    }
  }

  // Check 4: Device Connectivity (based on updatedAt timestamp)
  const updatedAt = userDoc.updatedAt;

  if (updatedAt) {
    const lastActiveDate = firestore.timestampToDate(updatedAt);

    if (lastActiveDate) {
      const lastActiveAge = getAge(lastActiveDate);
      const hoursSinceActive = Math.floor(
        (Date.now() - lastActiveDate.getTime()) / (1000 * 60 * 60)
      );

      if (hoursSinceActive < 1) {
        checks.deviceConnectivity = {
          check: 'Device Recently Active',
          status: 'pass',
          details: `User was active ${lastActiveAge}`,
        };
      } else if (hoursSinceActive < 24) {
        checks.deviceConnectivity = {
          check: 'Device Recently Active',
          status: 'warning',
          details: `User was last active ${lastActiveAge} (${hoursSinceActive}h ago)`,
          recommendation: 'Device may be offline or app not running',
        };

        recommendations.push(
          `User has not been active for ${hoursSinceActive}h - notifications may be delayed`
        );
      } else {
        checks.deviceConnectivity = {
          check: 'Device Recently Active',
          status: 'fail',
          details: `User was last active ${lastActiveAge} (${Math.floor(hoursSinceActive / 24)} days ago)`,
          recommendation: 'Device likely offline - notifications will be queued',
        };

        recommendations.push(
          `User inactive for ${Math.floor(hoursSinceActive / 24)} days - notifications will be queued until device comes online`
        );
      }
    }
  }

  // Check 5: App Version (if buildNumber exists)
  const buildNumber = userDoc.buildNumber as string | undefined;

  if (!buildNumber) {
    checks.appVersion = {
      check: 'App Version Supports FCM',
      status: 'unknown',
      details: 'buildNumber field not found - cannot verify app version',
    };
  } else {
    // Assume buildNumbers >= 1 support FCM
    checks.appVersion = {
      check: 'App Version Supports FCM',
      status: 'pass',
      details: `User is on build ${buildNumber}`,
    };
  }

  // Determine overall delivery capability
  const canReceiveNotifications =
    checks.userProfileExists.status === 'pass' &&
    checks.fcmTokenExists.status === 'pass' &&
    checks.fcmTokenFresh.status !== 'fail';

  // Generate summary
  let summary: string;

  if (canReceiveNotifications) {
    if (recommendations.length === 0) {
      summary = '✅ User can receive notifications - all checks passed';
    } else {
      summary = '⚠️ User can receive notifications but has some warnings';
    }
  } else {
    summary = '❌ User CANNOT receive notifications - critical issues found';
  }

  // Add final recommendations
  if (!canReceiveNotifications) {
    recommendations.push('Fix critical issues before notifications can be delivered');
  }

  if (recommendations.length === 0) {
    recommendations.push('All checks passed - notifications should be delivered successfully');
    recommendations.push(
      'If user still not receiving notifications, check Firebase Console > Cloud Messaging for delivery failures'
    );
  }

  return {
    userId: input.userId,
    userType: input.userType,
    canReceiveNotifications,
    checks,
    summary,
    recommendations,
  };
}
