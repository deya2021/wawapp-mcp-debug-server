/**
 * Kit 5: Notification Delivery Tracker
 * Tool: wawapp_fcm_token_status
 *
 * Checks FCM token status for a user (client or driver).
 * Verifies if token exists, is valid, and when it was last updated.
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

interface FCMTokenStatus {
  userId: string;
  userType: 'client' | 'driver';
  tokenExists: boolean;
  token?: string; // Masked
  tokenAge?: string;
  lastUpdated?: string;
  hasNotificationPermission?: boolean;
  issues: string[];
  recommendation?: string;
}

export async function fcmTokenStatus(params: unknown): Promise<FCMTokenStatus> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  const collection = input.userType === 'client' ? 'users' : 'drivers';
  const issues: string[] = [];

  // Fetch user document
  const userDoc = await firestore.getDocument(collection, input.userId);

  if (!userDoc) {
    return {
      userId: input.userId,
      userType: input.userType,
      tokenExists: false,
      issues: [`${input.userType} profile not found in /${collection} collection`],
      recommendation: 'User profile does not exist. Check if userId is correct.',
    };
  }

  const fcmToken = userDoc.fcmToken as string | undefined;
  const fcmTokenUpdatedAt = userDoc.fcmTokenUpdatedAt;

  // Check if token exists
  if (!fcmToken || fcmToken === '') {
    issues.push('No FCM token stored in Firestore');
    issues.push('User may not have granted notification permissions');

    return {
      userId: input.userId,
      userType: input.userType,
      tokenExists: false,
      issues,
      recommendation: `User needs to:
1. Grant notification permissions in device settings
2. Restart the app to trigger FCM token registration
3. Check app logs for FCM initialization errors`,
    };
  }

  // Token exists - analyze its health
  let tokenAge: string | undefined;
  let lastUpdated: string | undefined;

  if (fcmTokenUpdatedAt) {
    const updatedDate = firestore.timestampToDate(fcmTokenUpdatedAt);
    if (updatedDate) {
      lastUpdated = updatedDate.toISOString();
      tokenAge = getAge(updatedDate);

      // Check if token is stale (older than 60 days)
      const daysSinceUpdate = Math.floor(
        (Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceUpdate > 60) {
        issues.push(`Token is stale (${daysSinceUpdate} days old)`);
        issues.push('FCM tokens should refresh automatically every ~60 days');
      }
    }
  } else {
    issues.push('fcmTokenUpdatedAt field is missing - cannot determine token age');
  }

  // Mask token for security (show first 20 characters only)
  const maskedToken = `${fcmToken.substring(0, 20)}...(${fcmToken.length - 20} more chars)`;

  // Generate recommendation
  let recommendation: string | undefined;

  if (issues.length > 0) {
    recommendation = `Token exists but has issues:
${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

Actions:
- If token is stale, ask user to logout and login again
- Check Firebase Console > Cloud Messaging for delivery failures
- Verify app has latest FCM SDK version`;
  } else {
    recommendation = 'Token is healthy and up-to-date. Ready to receive notifications.';
  }

  return {
    userId: input.userId,
    userType: input.userType,
    tokenExists: true,
    token: maskedToken,
    tokenAge,
    lastUpdated,
    hasNotificationPermission: true, // Token exists implies permission granted
    issues: issues.length > 0 ? issues : [],
    recommendation,
  };
}
