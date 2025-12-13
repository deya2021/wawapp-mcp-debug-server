/**
 * Kit 9: Scenario Atoms - Notifications Domain (Phase 3)
 *
 * Atomic diagnostic tools for FCM and notification delivery checks.
 * Returns standardized results with rule IDs and evidence paths.
 *
 * @author WawApp Development Team
 * @date 2025-12-13
 * @version 3.0 (Phase 3)
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { DiagnosticResultBuilder } from '../../utils/result-builder.js';
import type { StandardDiagnosticResult } from '../../types/standard-output.js';

// ===== FCM TOKEN HEALTH =====

const FcmTokenHealthInputSchema = z.object({
  userId: z.string().min(1),
  userType: z.enum(['client', 'driver']).optional().default('driver'),
  staleThresholdDays: z.number().positive().optional().default(60),
});

/**
 * Check FCM token health for a user.
 *
 * Detects:
 * - Token missing (FCM_TOKEN_MISSING)
 * - Token stale (FCM_TOKEN_STALE)
 * - Token invalid format (FCM_TOKEN_INVALID_FORMAT)
 *
 * Returns rule IDs:
 * - FCM_TOKEN_MISSING (CRITICAL)
 * - FCM_TOKEN_STALE (WARNING)
 * - FCM_TOKEN_INVALID_FORMAT (WARNING)
 */
export async function fcmTokenHealth(
  params: unknown
): Promise<StandardDiagnosticResult> {
  const input = FcmTokenHealthInputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const builder = new DiagnosticResultBuilder('fcm_token_health');
  const startTime = new Date();

  // Determine collection
  const collection = input.userType === 'client' ? 'users' : 'drivers';
  const userPath = `/${collection}/${input.userId}`;

  // Fetch user document
  const userDoc = await firestore.getDocument(collection, input.userId);

  if (!userDoc) {
    builder
      .setStatus('FAIL')
      .setSummary(`User profile not found`)
      .addBlockingReason({
        ruleId: 'PROFILE_NOT_FOUND',
        severity: 'CRITICAL',
        message: `${input.userType} profile not found in ${collection} collection`,
        evidencePath: userPath,
      })
      .addEvidence({
        key: 'user.exists',
        expected: true,
        actual: false,
        sourcePath: userPath,
        timestamp: new Date().toISOString(),
      });

    return builder.build(startTime);
  }

  const fcmToken = userDoc.fcmToken as string | undefined;
  const fcmTokenUpdatedAt = userDoc.fcmTokenUpdatedAt;

  // Check 1: Token exists
  if (!fcmToken || fcmToken === '') {
    builder
      .addBlockingReason({
        ruleId: 'FCM_TOKEN_MISSING',
        severity: 'CRITICAL',
        message: `No FCM token stored in ${userPath}`,
        evidencePath: userPath,
        field: 'fcmToken',
      })
      .addEvidence({
        key: 'fcmToken',
        expected: 'non-empty string',
        actual: fcmToken || null,
        sourcePath: userPath,
        timestamp: new Date().toISOString(),
      })
      .addSuggestedFix({
        fixId: 'FIX_REQUEST_FCM_TOKEN',
        description: `User needs to grant notification permissions and restart app to register FCM token`,
        targetPath: userPath,
        action: 'MANUAL',
      })
      .linkFailure('FAIL-005', 'FCM token missing or invalid', 'HIGH');

    return builder
      .setStatus('FAIL')
      .setSummary('FCM token missing - user cannot receive notifications')
      .build(startTime);
  }

  // Check 2: Token format validity (basic check)
  const tokenLengthValid = fcmToken.length >= 100 && fcmToken.length <= 200;
  const tokenFormatValid = /^[A-Za-z0-9_:-]+$/.test(fcmToken);

  if (!tokenLengthValid || !tokenFormatValid) {
    builder
      .addBlockingReason({
        ruleId: 'FCM_TOKEN_INVALID_FORMAT',
        severity: 'WARNING',
        message: `FCM token has invalid format (length: ${fcmToken.length}, valid chars: ${tokenFormatValid})`,
        evidencePath: userPath,
        field: 'fcmToken',
      })
      .addEvidence({
        key: 'fcmToken.format',
        expected: 'length 100-200, alphanumeric with _:-',
        actual: `length ${fcmToken.length}, valid chars: ${tokenFormatValid}`,
        sourcePath: userPath,
        timestamp: new Date().toISOString(),
      })
      .addSuggestedFix({
        fixId: 'FIX_REFRESH_FCM_TOKEN',
        description: 'User should logout and login to refresh FCM token',
        targetPath: userPath,
        action: 'MANUAL',
      })
      .linkFailure('FAIL-005', 'FCM token missing or invalid', 'MEDIUM');
  }

  // Check 3: Token staleness
  if (fcmTokenUpdatedAt) {
    const updatedDate = firestore.timestampToDate(fcmTokenUpdatedAt);
    if (updatedDate) {
      const daysSinceUpdate = Math.floor(
        (Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceUpdate > input.staleThresholdDays) {
        builder
          .addBlockingReason({
            ruleId: 'FCM_TOKEN_STALE',
            severity: 'WARNING',
            message: `FCM token is ${daysSinceUpdate} days old (threshold: ${input.staleThresholdDays} days)`,
            evidencePath: userPath,
            field: 'fcmTokenUpdatedAt',
          })
          .addEvidence({
            key: 'fcmTokenUpdatedAt',
            expected: `updated within ${input.staleThresholdDays} days`,
            actual: `${daysSinceUpdate} days old (last updated: ${updatedDate.toISOString()})`,
            sourcePath: userPath,
            timestamp: new Date().toISOString(),
          })
          .addSuggestedFix({
            fixId: 'FIX_REFRESH_STALE_TOKEN',
            description: `Ask user to logout and login to refresh stale FCM token (last updated ${daysSinceUpdate} days ago)`,
            targetPath: userPath,
            action: 'MANUAL',
          })
          .linkFailure('FAIL-005', 'FCM token missing or invalid', 'MEDIUM');
      }

      // Add metadata evidence for healthy token
      if (daysSinceUpdate <= input.staleThresholdDays && tokenLengthValid && tokenFormatValid) {
        builder.addEvidence({
          key: 'fcmToken.health',
          expected: 'valid and fresh',
          actual: `valid, ${daysSinceUpdate} days old`,
          sourcePath: userPath,
          timestamp: new Date().toISOString(),
        });
      }
    }
  } else {
    // Missing timestamp - cannot determine age
    builder.addEvidence({
      key: 'fcmTokenUpdatedAt',
      expected: 'timestamp present',
      actual: null,
      sourcePath: userPath,
      timestamp: new Date().toISOString(),
    });
  }

  // Determine status
  const hasIssues = builder['blockingReasons'].length > 0;
  const status = hasIssues ? 'FAIL' : 'PASS';
  const summary = hasIssues
    ? `FCM token has ${builder['blockingReasons'].length} issue(s)`
    : 'FCM token is healthy and valid';

  return builder.setStatus(status).setSummary(summary).build(startTime);
}

// ===== NOTIFICATION DELIVERY AUDIT =====

const NotificationDeliveryAuditInputSchema = z.object({
  orderId: z.string().min(1),
  recipientId: z.string().min(1),
  recipientType: z.enum(['client', 'driver']).optional().default('client'),
});

/**
 * Best-effort notification delivery audit.
 *
 * Detects:
 * - No evidence of notification send attempt (NOTIFICATION_SEND_NO_EVIDENCE)
 * - FCM send failure if logs exist (FCM_SEND_FAILED)
 *
 * Returns rule IDs:
 * - NOTIFICATION_SEND_NO_EVIDENCE (WARNING)
 * - FCM_SEND_FAILED (WARNING)
 * - (or INCONCLUSIVE if no logging infrastructure exists)
 */
export async function notificationDeliveryAudit(
  params: unknown
): Promise<StandardDiagnosticResult> {
  const input = NotificationDeliveryAuditInputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const builder = new DiagnosticResultBuilder('notification_delivery_audit');
  const startTime = new Date();

  // Check if notification logs collection exists
  // This is best-effort - if no logging exists, return INCONCLUSIVE
  let logsExist = false;
  let notificationLogs: any[] = [];

  try {
    // Try to query notification_logs collection (if it exists)
    const logs = await firestore.queryDocuments(
      'notification_logs',
      [
        { field: 'orderId', operator: '==', value: input.orderId },
        { field: 'recipientId', operator: '==', value: input.recipientId },
      ],
      { limit: 10 }
    );

    if (logs && logs.length > 0) {
      logsExist = true;
      notificationLogs = logs;
    }
  } catch (error: any) {
    // Collection doesn't exist or query failed - proceed with INCONCLUSIVE
    logsExist = false;
  }

  if (!logsExist) {
    // No logging infrastructure - return INCONCLUSIVE
    builder
      .setStatus('INCONCLUSIVE')
      .setSummary(
        'Cannot verify notification delivery: no logging infrastructure detected'
      )
      .addEvidence({
        key: 'notification_logs.collection',
        expected: 'collection exists with logs',
        actual: 'collection not found or empty',
        sourcePath: '/notification_logs',
        timestamp: new Date().toISOString(),
      })
      .addSuggestedFix({
        fixId: 'FIX_ADD_NOTIFICATION_LOGGING',
        description: `Add minimal notification logging to Cloud Function:

1. In notifyOrderEvents function, add:
   await firestore.collection('notification_logs').add({
     orderId: orderId,
     recipientId: recipientId,
     recipientType: 'client',
     notificationType: 'order_status_changed',
     status: 'sent' | 'failed',
     fcmResponse: response,
     error: error?.message,
     timestamp: admin.firestore.FieldValue.serverTimestamp()
   });

2. Query this collection for delivery audit`,
        action: 'MANUAL',
      });

    return builder.build(startTime);
  }

  // Logs exist - analyze them
  const evidencePath = `/notification_logs (${notificationLogs.length} entries)`;

  if (notificationLogs.length === 0) {
    builder
      .addBlockingReason({
        ruleId: 'NOTIFICATION_SEND_NO_EVIDENCE',
        severity: 'WARNING',
        message: `No notification send attempts found for order ${input.orderId} to recipient ${input.recipientId}`,
        evidencePath,
      })
      .addEvidence({
        key: 'notification.sendAttempts',
        expected: '> 0',
        actual: 0,
        sourcePath: evidencePath,
        timestamp: new Date().toISOString(),
      })
      .addSuggestedFix({
        fixId: 'FIX_VERIFY_FUNCTION_TRIGGER',
        description: `Verify Cloud Function notifyOrderEvents is triggering correctly:
1. Check function logs: firebase functions:log --only notifyOrderEvents
2. Verify Firestore trigger is configured
3. Check order status transitions in /orders/${input.orderId}`,
        action: 'MANUAL',
      })
      .linkFailure('FAIL-006', 'Notification not sent or function timeout', 'MEDIUM');
  } else {
    // Check for failures in logs
    const failedLogs = notificationLogs.filter(
      (log) => log.status === 'failed' || log.error
    );

    if (failedLogs.length > 0) {
      builder
        .addBlockingReason({
          ruleId: 'FCM_SEND_FAILED',
          severity: 'WARNING',
          message: `${failedLogs.length} notification send failure(s) detected`,
          evidencePath,
        })
        .addEvidence({
          key: 'notification.failures',
          expected: '0 failures',
          actual: `${failedLogs.length} failures out of ${notificationLogs.length} attempts`,
          sourcePath: evidencePath,
          timestamp: new Date().toISOString(),
        })
        .addSuggestedFix({
          fixId: 'FIX_INVESTIGATE_FCM_FAILURE',
          description: `Investigate FCM send failures:
1. Check recipient FCM token health: use fcm_token_health atom
2. Review error messages in notification_logs
3. Verify FCM API key is valid in Firebase Console
4. Check Firebase Cloud Messaging quota`,
          targetPath: evidencePath,
          action: 'MANUAL',
        })
        .linkFailure('FAIL-005', 'FCM token missing or invalid', 'MEDIUM');
    }

    // Add success evidence
    const successfulLogs = notificationLogs.filter(
      (log) => log.status === 'sent' || log.status === 'delivered'
    );

    builder.addEvidence({
      key: 'notification.sendAttempts',
      expected: 'successful delivery',
      actual: `${successfulLogs.length} successful, ${failedLogs.length} failed out of ${notificationLogs.length} total`,
      sourcePath: evidencePath,
      timestamp: new Date().toISOString(),
    });
  }

  const hasIssues = builder['blockingReasons'].length > 0;
  const status = hasIssues ? 'FAIL' : 'PASS';
  const summary = hasIssues
    ? `Notification delivery audit found ${builder['blockingReasons'].length} issue(s)`
    : `Notification delivery audit passed (${notificationLogs.length} successful send(s))`;

  return builder.setStatus(status).setSummary(summary).build(startTime);
}
