/**
 * Kit 8: Auth & App Flow Diagnostics
 * Tool: wawapp_auth_flow_audit
 *
 * Build a timeline view of the auth flow for a user over a time window.
 * Tracks key auth flow steps: OTP, PIN, profile creation, onboarding.
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
    .describe('User ID to audit'),
  timeRangeMinutes: z
    .number()
    .min(1)
    .max(10080)
    .default(1440)
    .describe('Time range to analyze (default: 1440 = 24 hours, max: 7 days)'),
  limit: z
    .number()
    .min(1)
    .max(1000)
    .default(200)
    .describe('Maximum log entries to scan'),
});

type AuthFlowAuditInput = z.infer<typeof InputSchema>;

interface AuthFlowEvent {
  timestamp: string;
  eventType: string;
  description: string;
  metadata?: Record<string, any>;
  source: 'firestore' | 'logs' | 'inferred';
}

interface Breakpoint {
  step: string;
  description: string;
  possibleCauses: string[];
}

interface AuthFlowAuditResult {
  summary: string;
  data: {
    timeline: AuthFlowEvent[];
    detectedBreakpoints: Breakpoint[];
    flowStatus: 'completed' | 'incomplete' | 'stuck' | 'unknown';
    lastSuccessfulStep?: string;
  };
  recommendations: string[];
  debug?: Record<string, any>;
}

export async function authFlowAudit(
  params: unknown
): Promise<AuthFlowAuditResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const cloudLogging = CloudLoggingClient.getInstance();

  const timeline: AuthFlowEvent[] = [];
  const breakpoints: Breakpoint[] = [];
  const recommendations: string[] = [];

  try {
    const now = new Date();
    const timeRangeMs = input.timeRangeMinutes * 60 * 1000;
    const startTime = new Date(now.getTime() - timeRangeMs);

    // 1. Check Firestore for user/driver documents and timestamps
    const userDoc = await firestore.getDocument('users', input.uid);
    const driverDoc = await firestore.getDocument('drivers', input.uid);

    // Add events from Firestore timestamps
    if (userDoc && userDoc.createdAt) {
      const createdAt = firestore.timestampToDate(userDoc.createdAt);
      if (createdAt && createdAt >= startTime) {
        timeline.push({
          timestamp: createdAt.toISOString(),
          eventType: 'user_created',
          description: 'User document created in Firestore',
          metadata: {
            role: userDoc.role,
          },
          source: 'firestore',
        });
      }
    }

    if (driverDoc && driverDoc.createdAt) {
      const createdAt = firestore.timestampToDate(driverDoc.createdAt);
      if (createdAt && createdAt >= startTime) {
        timeline.push({
          timestamp: createdAt.toISOString(),
          eventType: 'driver_profile_created',
          description: 'Driver profile created in Firestore',
          metadata: {
            isVerified: driverDoc.isVerified,
            hasProfileComplete:
              !!driverDoc.name &&
              !!driverDoc.phone &&
              !!driverDoc.city &&
              !!driverDoc.region,
          },
          source: 'firestore',
        });
      }
    }

    // Check PIN-related timestamps
    if (driverDoc) {
      if (driverDoc.pinCreatedAt) {
        const pinCreatedAt = firestore.timestampToDate(driverDoc.pinCreatedAt);
        if (pinCreatedAt && pinCreatedAt >= startTime) {
          timeline.push({
            timestamp: pinCreatedAt.toISOString(),
            eventType: 'pin_created',
            description: 'PIN created successfully',
            metadata: {
              hasPin: driverDoc.hasPin,
            },
            source: 'firestore',
          });
        }
      }

      if (driverDoc.lastPinVerifiedAt) {
        const lastPinVerified = firestore.timestampToDate(
          driverDoc.lastPinVerifiedAt
        );
        if (lastPinVerified && lastPinVerified >= startTime) {
          timeline.push({
            timestamp: lastPinVerified.toISOString(),
            eventType: 'pin_verified',
            description: 'PIN verified successfully',
            source: 'firestore',
          });
        }
      }
    }

    // Check onboarding completion
    if (driverDoc && driverDoc.onboardingCompletedAt) {
      const onboardingCompleted = firestore.timestampToDate(
        driverDoc.onboardingCompletedAt
      );
      if (onboardingCompleted && onboardingCompleted >= startTime) {
        timeline.push({
          timestamp: onboardingCompleted.toISOString(),
          eventType: 'onboarding_completed',
          description: 'Driver onboarding completed',
          source: 'firestore',
        });
      }
    }

    // 2. Query Cloud Logs for auth-related events
    try {
      // Look for auth-related log entries
      const authFilter = `jsonPayload.uid="${input.uid}" OR textPayload:"${input.uid}"`;
      const logs = await cloudLogging.queryLogs(
        authFilter,
        startTime,
        now,
        input.limit
      );

      for (const log of logs) {
        const message =
          typeof log.message === 'string'
            ? log.message
            : JSON.stringify(log.message);

        // Detect OTP events
        if (
          message.toLowerCase().includes('otp') ||
          message.toLowerCase().includes('verification code')
        ) {
          let eventType = 'otp_event';
          let description = 'OTP-related event';

          if (message.toLowerCase().includes('sent')) {
            eventType = 'otp_requested';
            description = 'OTP verification code sent';
          } else if (
            message.toLowerCase().includes('verified') ||
            message.toLowerCase().includes('success')
          ) {
            eventType = 'otp_verified';
            description = 'OTP verified successfully';
          } else if (
            message.toLowerCase().includes('failed') ||
            message.toLowerCase().includes('invalid')
          ) {
            eventType = 'otp_failed';
            description = 'OTP verification failed';
          }

          timeline.push({
            timestamp: log.timestamp,
            eventType,
            description,
            metadata: {
              severity: log.severity,
              logMessage: message.substring(0, 100),
            },
            source: 'logs',
          });
        }

        // Detect PIN events
        if (message.toLowerCase().includes('pin')) {
          let eventType = 'pin_event';
          let description = 'PIN-related event';

          if (message.toLowerCase().includes('created')) {
            eventType = 'pin_created';
            description = 'PIN created';
          } else if (message.toLowerCase().includes('verified')) {
            eventType = 'pin_verified';
            description = 'PIN verified';
          } else if (message.toLowerCase().includes('failed')) {
            eventType = 'pin_failed';
            description = 'PIN verification failed';
          }

          timeline.push({
            timestamp: log.timestamp,
            eventType,
            description,
            metadata: {
              severity: log.severity,
            },
            source: 'logs',
          });
        }

        // Detect login/auth events
        if (
          message.toLowerCase().includes('login') ||
          message.toLowerCase().includes('signin')
        ) {
          timeline.push({
            timestamp: log.timestamp,
            eventType: 'login_attempt',
            description: 'Login/signin attempt',
            metadata: {
              severity: log.severity,
            },
            source: 'logs',
          });
        }

        // Detect onboarding events
        if (message.toLowerCase().includes('onboarding')) {
          let eventType = 'onboarding_event';
          let description = 'Onboarding-related event';

          if (message.toLowerCase().includes('started')) {
            eventType = 'onboarding_started';
            description = 'Onboarding flow started';
          } else if (message.toLowerCase().includes('completed')) {
            eventType = 'onboarding_completed';
            description = 'Onboarding flow completed';
          }

          timeline.push({
            timestamp: log.timestamp,
            eventType,
            description,
            metadata: {
              severity: log.severity,
            },
            source: 'logs',
          });
        }
      }
    } catch (error) {
      // Cloud Logging might not be accessible or logs might not exist
      recommendations.push(
        'ℹ️ Cloud Logging not accessible or no logs found. Consider adding structured logging for auth events.'
      );
    }

    // 3. Sort timeline chronologically
    timeline.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // 4. Detect breakpoints in the flow
    const eventTypes = timeline.map((e) => e.eventType);

    // Expected flow: user_created → [otp_requested → otp_verified] → driver_profile_created → pin_created → onboarding_completed

    if (eventTypes.includes('user_created')) {
      if (!eventTypes.includes('driver_profile_created') && driverDoc) {
        breakpoints.push({
          step: 'driver_profile_creation',
          description: 'User created but driver profile not properly created',
          possibleCauses: [
            'Driver profile creation failed in backend',
            'Race condition between user creation and profile setup',
          ],
        });
      }
    }

    if (eventTypes.includes('driver_profile_created')) {
      if (!eventTypes.includes('pin_created') && !driverDoc?.hasPin) {
        breakpoints.push({
          step: 'pin_creation',
          description: 'Driver profile exists but PIN not created',
          possibleCauses: [
            'User did not complete PIN setup screen',
            'PIN creation flow skipped or broken',
            'Navigation issue from profile to PIN screen',
          ],
        });
      }
    }

    if (eventTypes.includes('pin_created')) {
      if (!eventTypes.includes('onboarding_completed')) {
        breakpoints.push({
          step: 'onboarding_completion',
          description: 'PIN created but onboarding not completed',
          possibleCauses: [
            'User stuck on verification screen waiting for admin approval',
            'Onboarding completion flag not set in Firestore',
            'User navigated away before completing',
          ],
        });
      }
    }

    // Check for repeated OTP failures
    const otpFailed = timeline.filter((e) => e.eventType === 'otp_failed');
    if (otpFailed.length > 3) {
      breakpoints.push({
        step: 'otp_verification',
        description: `Multiple OTP verification failures (${otpFailed.length})`,
        possibleCauses: [
          'User entering wrong OTP code',
          'OTP expiration time too short',
          'SMS delivery delay causing code expiration',
        ],
      });
    }

    // 5. Determine flow status
    let flowStatus: 'completed' | 'incomplete' | 'stuck' | 'unknown' = 'unknown';
    let lastSuccessfulStep: string | undefined;

    if (eventTypes.includes('onboarding_completed')) {
      flowStatus = 'completed';
      lastSuccessfulStep = 'onboarding_completed';
    } else if (eventTypes.includes('pin_created')) {
      flowStatus = 'incomplete';
      lastSuccessfulStep = 'pin_created';
    } else if (eventTypes.includes('driver_profile_created')) {
      flowStatus = 'incomplete';
      lastSuccessfulStep = 'driver_profile_created';
    } else if (eventTypes.includes('user_created')) {
      flowStatus = 'incomplete';
      lastSuccessfulStep = 'user_created';
    } else if (timeline.length > 0) {
      flowStatus = 'stuck';
      lastSuccessfulStep = timeline[timeline.length - 1].eventType;
    }

    // 6. Generate recommendations
    if (breakpoints.length === 0 && flowStatus === 'completed') {
      recommendations.push(
        '✅ Auth flow completed successfully. No issues detected.'
      );
    } else {
      if (breakpoints.length > 0) {
        recommendations.push(
          `⚠️ Detected ${breakpoints.length} breakpoint(s) in auth flow.`
        );

        for (const bp of breakpoints) {
          recommendations.push(
            `- ${bp.step}: ${bp.description}. Possible causes: ${bp.possibleCauses.join(', ')}.`
          );
        }
      }

      if (flowStatus === 'incomplete') {
        recommendations.push(
          `ℹ️ Flow is incomplete. Last successful step: ${lastSuccessfulStep}. User may need to complete remaining steps.`
        );
      } else if (flowStatus === 'stuck') {
        recommendations.push(
          `🚨 Flow appears stuck. Last event: ${lastSuccessfulStep}. Review logs and Firestore documents for errors.`
        );
      }
    }

    // Build summary
    const summary = `Auth flow audit for uid="${input.uid}" over last ${input.timeRangeMinutes} minutes. Found ${timeline.length} event(s). Flow status: ${flowStatus}. ${breakpoints.length > 0 ? `Detected ${breakpoints.length} breakpoint(s).` : 'No breakpoints detected.'}${lastSuccessfulStep ? ` Last successful step: ${lastSuccessfulStep}.` : ''}`;

    return {
      summary,
      data: {
        timeline,
        detectedBreakpoints: breakpoints,
        flowStatus,
        lastSuccessfulStep,
      },
      recommendations,
    };
  } catch (error: any) {
    throw new Error(
      `[auth-flow-audit] Failed to audit auth flow: ${error.message}`
    );
  }
}

export const authFlowAuditSchema = {
  name: 'wawapp_auth_flow_audit',
  description:
    'Build timeline view of auth flow for a user over a time window. Tracks key auth steps: OTP requested/verified, PIN created, profile creation, onboarding completion. Detects breakpoints where flow stopped unexpectedly. Returns chronological timeline with flow status and actionable recommendations.',
  inputSchema: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'User ID to audit',
      },
      timeRangeMinutes: {
        type: 'number',
        description:
          'Time range to analyze in minutes (default: 1440 = 24 hours, max: 10080 = 7 days)',
        default: 1440,
      },
      limit: {
        type: 'number',
        description: 'Maximum log entries to scan (default: 200, max: 1000)',
        default: 200,
      },
    },
    required: ['uid'],
  },
};
