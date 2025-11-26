/**
 * Kit 8: Auth & App Flow Diagnostics
 * Tool: wawapp_pin_flow_checker
 *
 * Audit the PIN flow state for a given user/driver.
 * Checks PIN-related fields for consistency and validity.
 *
 * @author WawApp Development Team
 * @date 2025-11-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { CloudLoggingClient } from '../../data-access/cloud-logging-client.js';

const InputSchema = z.object({
  uid: z
    .string()
    .min(1)
    .describe('User ID to check'),
  includeAttempts: z
    .boolean()
    .default(true)
    .describe('Include recent PIN attempt logs'),
});

type PinFlowCheckerInput = z.infer<typeof InputSchema>;

interface PinStateIssue {
  type: 'critical' | 'warning' | 'info';
  field: string;
  description: string;
  expected?: string;
  actual?: string;
}

interface PinEvent {
  timestamp: string;
  eventType: 'created' | 'verified' | 'failed' | 'reset';
  description: string;
}

interface PinFlowCheckerResult {
  summary: string;
  data: {
    pinState: {
      hasPin: boolean | null;
      hasPinHash: boolean;
      hasPinSalt: boolean;
      pinCreatedAt: string | null;
      lastPinVerifiedAt: string | null;
    };
    recentPinEvents: PinEvent[];
    issues: PinStateIssue[];
  };
  recommendations: string[];
  debug?: Record<string, any>;
}

export async function pinFlowChecker(
  params: unknown
): Promise<PinFlowCheckerResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const cloudLogging = CloudLoggingClient.getInstance();

  const issues: PinStateIssue[] = [];
  const recommendations: string[] = [];
  const recentPinEvents: PinEvent[] = [];

  try {
    // 1. Get driver/user document
    const driverDoc = await firestore.getDocument('drivers', input.uid);
    const userDoc = await firestore.getDocument('users', input.uid);

    if (!driverDoc && !userDoc) {
      return {
        summary: `PIN flow check for uid="${input.uid}": User/driver document not found.`,
        data: {
          pinState: {
            hasPin: null,
            hasPinHash: false,
            hasPinSalt: false,
            pinCreatedAt: null,
            lastPinVerifiedAt: null,
          },
          recentPinEvents: [],
          issues: [
            {
              type: 'critical',
              field: 'user_document',
              description: 'No user or driver document found',
              expected: 'Document exists in /users or /drivers',
              actual: 'Not found',
            },
          ],
        },
        recommendations: [
          '🚨 User/driver document missing. Create document before checking PIN state.',
        ],
      };
    }

    // Use driver doc if available, otherwise user doc
    const doc = driverDoc || userDoc;

    // 2. Extract PIN state
    const hasPin = doc.hasPin;
    const hasPinHash = !!doc.pinHash || !!doc.pin_hash;
    const hasPinSalt = !!doc.pinSalt || !!doc.pin_salt;
    const pinCreatedAt = doc.pinCreatedAt
      ? firestore.timestampToDate(doc.pinCreatedAt)
      : null;
    const lastPinVerifiedAt = doc.lastPinVerifiedAt
      ? firestore.timestampToDate(doc.lastPinVerifiedAt)
      : null;

    // 3. Check for inconsistencies
    if (typeof hasPin !== 'boolean') {
      issues.push({
        type: 'warning',
        field: 'hasPin',
        description: 'hasPin field is missing or not a boolean',
        expected: 'boolean (true or false)',
        actual: typeof hasPin === 'undefined' ? 'undefined' : typeof hasPin,
      });
    }

    if (hasPin === true && !hasPinHash) {
      issues.push({
        type: 'critical',
        field: 'pinHash',
        description: 'hasPin is true but pinHash is missing',
        expected: 'pinHash present when hasPin=true',
        actual: 'pinHash missing',
      });
    }

    if (hasPin === true && !hasPinSalt) {
      issues.push({
        type: 'critical',
        field: 'pinSalt',
        description: 'hasPin is true but pinSalt is missing',
        expected: 'pinSalt present when hasPin=true',
        actual: 'pinSalt missing',
      });
    }

    if (hasPin === false && (hasPinHash || hasPinSalt)) {
      issues.push({
        type: 'warning',
        field: 'hasPin',
        description: 'hasPin is false but pinHash/pinSalt exist',
        expected: 'No hash/salt when hasPin=false',
        actual: 'Hash or salt present',
      });
    }

    if (hasPin === true && !pinCreatedAt) {
      issues.push({
        type: 'warning',
        field: 'pinCreatedAt',
        description: 'hasPin is true but pinCreatedAt timestamp missing',
        expected: 'pinCreatedAt timestamp when hasPin=true',
        actual: 'Missing',
      });
    }

    // Check if PIN is very old (created >90 days ago)
    if (pinCreatedAt) {
      const ageInDays =
        (new Date().getTime() - pinCreatedAt.getTime()) / (1000 * 60 * 60 * 24);

      if (ageInDays > 90) {
        issues.push({
          type: 'info',
          field: 'pinCreatedAt',
          description: `PIN is ${Math.round(ageInDays)} days old (may need refresh)`,
          expected: 'PIN refreshed periodically',
          actual: `Created ${Math.round(ageInDays)} days ago`,
        });
      }
    }

    // Check if last verification is very old
    if (lastPinVerifiedAt && hasPin === true) {
      const daysSinceVerification =
        (new Date().getTime() - lastPinVerifiedAt.getTime()) /
        (1000 * 60 * 60 * 24);

      if (daysSinceVerification > 30) {
        issues.push({
          type: 'info',
          field: 'lastPinVerifiedAt',
          description: `PIN not verified in ${Math.round(daysSinceVerification)} days`,
          expected: 'Recent PIN verification',
          actual: `Last verified ${Math.round(daysSinceVerification)} days ago`,
        });
      }
    }

    // 4. Query logs for recent PIN events if requested
    if (input.includeAttempts) {
      try {
        const now = new Date();
        const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

        const pinFilter = `(textPayload:"pin" OR jsonPayload:"pin") AND (jsonPayload.uid="${input.uid}" OR textPayload:"${input.uid}")`;
        const logs = await cloudLogging.queryLogs(pinFilter, startTime, now, 50);

        for (const log of logs) {
          const message =
            typeof log.message === 'string'
              ? log.message
              : JSON.stringify(log.message);

          const lowerMessage = message.toLowerCase();

          if (
            lowerMessage.includes('pin created') ||
            lowerMessage.includes('pin setup')
          ) {
            recentPinEvents.push({
              timestamp: log.timestamp,
              eventType: 'created',
              description: 'PIN created',
            });
          } else if (
            lowerMessage.includes('pin verified') ||
            lowerMessage.includes('pin success')
          ) {
            recentPinEvents.push({
              timestamp: log.timestamp,
              eventType: 'verified',
              description: 'PIN verified successfully',
            });
          } else if (
            lowerMessage.includes('pin failed') ||
            lowerMessage.includes('pin invalid') ||
            lowerMessage.includes('incorrect pin')
          ) {
            recentPinEvents.push({
              timestamp: log.timestamp,
              eventType: 'failed',
              description: 'PIN verification failed',
            });
          } else if (
            lowerMessage.includes('pin reset') ||
            lowerMessage.includes('pin changed')
          ) {
            recentPinEvents.push({
              timestamp: log.timestamp,
              eventType: 'reset',
              description: 'PIN reset or changed',
            });
          }
        }

        // Sort events chronologically
        recentPinEvents.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // Check for too many failed attempts
        const failedAttempts = recentPinEvents.filter(
          (e) => e.eventType === 'failed'
        );

        if (failedAttempts.length > 5) {
          issues.push({
            type: 'warning',
            field: 'pin_attempts',
            description: `${failedAttempts.length} failed PIN attempts in last 24 hours`,
            expected: 'Low failure rate',
            actual: `${failedAttempts.length} failures`,
          });
        }

        // Check if user is stuck in failed attempts (no success after many failures)
        const lastFiveEvents = recentPinEvents.slice(-5);
        const recentFailures = lastFiveEvents.filter(
          (e) => e.eventType === 'failed'
        );

        if (recentFailures.length >= 3 && recentFailures.length === lastFiveEvents.length) {
          issues.push({
            type: 'warning',
            field: 'pin_stuck',
            description: 'User may be stuck with incorrect PIN (consecutive failures)',
            expected: 'Mix of success and failure',
            actual: 'Only failures in recent attempts',
          });
        }
      } catch (error) {
        // Cloud Logging might not be accessible
        recommendations.push(
          'ℹ️ Cloud Logging not accessible. Cannot retrieve recent PIN attempt logs.'
        );
      }
    }

    // 5. Generate recommendations
    if (issues.length === 0) {
      recommendations.push('✅ PIN flow state is healthy. All checks passed.');
    } else {
      const critical = issues.filter((i) => i.type === 'critical');
      const warnings = issues.filter((i) => i.type === 'warning');

      if (critical.length > 0) {
        recommendations.push(
          `🚨 CRITICAL: ${critical.length} critical issue(s) detected.`
        );

        for (const issue of critical) {
          if (issue.field === 'pinHash' || issue.field === 'pinSalt') {
            recommendations.push(
              `- Inconsistent PIN state: Set hasPin=false in /${driverDoc ? 'drivers' : 'users'}/${input.uid} and force user to recreate PIN.`
            );
          }
        }
      }

      if (warnings.length > 0) {
        recommendations.push(
          `⚠️ ${warnings.length} warning(s) detected.`
        );

        for (const issue of warnings) {
          if (issue.field === 'hasPin' && hasPin === false) {
            recommendations.push(
              `- Clean up PIN data: Remove pinHash and pinSalt fields when hasPin=false.`
            );
          } else if (issue.field === 'pin_attempts') {
            recommendations.push(
              `- High failure rate: User may have forgotten PIN. Consider implementing PIN reset flow.`
            );
          } else if (issue.field === 'pin_stuck') {
            recommendations.push(
              `- User stuck with failed attempts: Implement account lockout after N failures, or PIN reset flow.`
            );
          }
        }
      }

      // General recommendations
      if (hasPin === null || typeof hasPin === 'undefined') {
        recommendations.push(
          `- Initialize hasPin field: Set hasPin=false for new users, hasPin=true after PIN creation.`
        );
      }

      if (hasPin === true && (!hasPinHash || !hasPinSalt)) {
        recommendations.push(
          `- Add migration to ensure pinHash and pinSalt are present whenever hasPin=true.`
        );
      }
    }

    // Build summary
    let summary = `PIN flow check for uid="${input.uid}". `;
    summary += `hasPin: ${hasPin === null ? 'null' : hasPin}. `;
    summary += `PIN state: ${hasPinHash && hasPinSalt ? 'hash+salt present' : 'incomplete'}. `;
    summary += `Found ${issues.length} issue(s): ${issues.filter((i) => i.type === 'critical').length} critical, ${issues.filter((i) => i.type === 'warning').length} warnings.`;

    if (recentPinEvents.length > 0) {
      summary += ` Recent events: ${recentPinEvents.length}.`;
    }

    return {
      summary,
      data: {
        pinState: {
          hasPin,
          hasPinHash,
          hasPinSalt,
          pinCreatedAt: pinCreatedAt ? pinCreatedAt.toISOString() : null,
          lastPinVerifiedAt: lastPinVerifiedAt
            ? lastPinVerifiedAt.toISOString()
            : null,
        },
        recentPinEvents,
        issues,
      },
      recommendations,
    };
  } catch (error: any) {
    throw new Error(
      `[pin-flow-checker] Failed to check PIN flow: ${error.message}`
    );
  }
}

export const pinFlowCheckerSchema = {
  name: 'wawapp_pin_flow_checker',
  description:
    'Audit PIN flow state for a user/driver. Checks PIN-related Firestore fields (hasPin, pinHash, pinSalt, pinCreatedAt) for consistency and validity. Detects invalid states like hasPin=true without hash/salt, or hasPin=false with hash existing. Optionally correlates with Cloud Logs to detect failed PIN attempts, consecutive failures, and stuck users. Returns PIN state, recent events, detected issues, and actionable recommendations.',
  inputSchema: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'User ID to check',
      },
      includeAttempts: {
        type: 'boolean',
        description: 'Include recent PIN attempt logs (default: true)',
        default: true,
      },
    },
    required: ['uid'],
  },
};
