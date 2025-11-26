/**
 * Kit 7: System Health Dashboard
 * Tool: wawapp_incident_report
 *
 * Unified incident diagnostics tool that aggregates signals from multiple
 * subsystems to provide comprehensive root cause analysis and recommendations.
 *
 * @author WawApp Development Team
 * @date 2025-11-26
 */

import { z } from 'zod';
import { getAuth } from '../../data-access/firebase-admin.js';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { CloudLoggingClient } from '../../data-access/cloud-logging-client.js';
import { maskDocument } from '../../security/pii-masker.js';

const InputSchema = z.object({
  uid: z
    .string()
    .min(1)
    .describe('User/driver ID to diagnose'),
  orderId: z
    .string()
    .optional()
    .describe('Optional order ID for order-specific diagnostics'),
  timeRangeMinutes: z
    .number()
    .min(5)
    .max(10080)
    .default(1440)
    .describe('Time range for analysis (default: 1440 = 24 hours, max: 7 days)'),
  includeDeepDiagnostics: z
    .boolean()
    .default(true)
    .describe('Include detailed diagnostics from all subsystems'),
});

type IncidentReportInput = z.infer<typeof InputSchema>;

interface RootCauseCandidate {
  area: string;
  description: string;
  likelihood: 'low' | 'medium' | 'high';
  details?: Record<string, any>;
}

interface IncidentReportResult {
  summary: string;
  rootCauseCandidates: RootCauseCandidate[];
  sections: {
    auth?: Record<string, any>;
    appFlow?: Record<string, any>;
    pin?: Record<string, any>;
    location?: Record<string, any>;
    matching?: Record<string, any>;
    notifications?: Record<string, any>;
    order?: Record<string, any>;
    systemHealth?: Record<string, any>;
  };
  recommendations: string[];
  debug?: Record<string, any>;
}

export async function incidentReport(
  params: unknown
): Promise<IncidentReportResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const auth = getAuth();
  const cloudLogging = CloudLoggingClient.getInstance();

  const rootCauses: RootCauseCandidate[] = [];
  const recommendations: string[] = [];
  const sections: IncidentReportResult['sections'] = {};

  try {
    const now = new Date();
    const timeRangeMs = input.timeRangeMinutes * 60 * 1000;
    const startTime = new Date(now.getTime() - timeRangeMs);

    // ===== 1. AUTH & PROFILE CHECKS =====
    let authUser: any = null;
    let claims: Record<string, any> = {};
    const authIssues: string[] = [];

    try {
      authUser = await auth.getUser(input.uid);
      claims = authUser.customClaims || {};
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        authIssues.push('Firebase Auth user does not exist');
        rootCauses.push({
          area: 'auth',
          description: 'User not found in Firebase Auth',
          likelihood: 'high',
          details: { error: 'auth/user-not-found' },
        });
      }
    }

    const userDoc = await firestore.getDocument('users', input.uid);
    const driverDoc = await firestore.getDocument('drivers', input.uid);

    if (!userDoc) {
      authIssues.push('User document missing in /users collection');
      rootCauses.push({
        area: 'auth',
        description: 'User document missing in Firestore',
        likelihood: 'high',
      });
    }

    const role = claims.role || userDoc?.role;

    if (role === 'driver' && !driverDoc) {
      authIssues.push('Driver document missing despite driver role');
      rootCauses.push({
        area: 'auth',
        description: 'Driver document missing for user with driver role',
        likelihood: 'high',
      });
    }

    // Check profile completeness
    if (driverDoc) {
      const requiredFields = ['name', 'phone', 'city', 'region'];
      const missingFields = requiredFields.filter(
        (field) => !driverDoc[field] || driverDoc[field] === ''
      );

      if (missingFields.length > 0) {
        authIssues.push(`Incomplete driver profile: ${missingFields.join(', ')}`);
        rootCauses.push({
          area: 'auth',
          description: `Driver profile incomplete (missing: ${missingFields.join(', ')})`,
          likelihood: 'medium',
          details: { missingFields },
        });
      }

      if (typeof driverDoc.isVerified !== 'boolean' || !driverDoc.isVerified) {
        authIssues.push('Driver not verified');
        rootCauses.push({
          area: 'auth',
          description: 'Driver is not verified by admin',
          likelihood: 'high',
        });
      }
    }

    sections.auth = {
      authUserExists: !!authUser,
      firestoreUserExists: !!userDoc,
      driverDocExists: !!driverDoc,
      role,
      isVerified: driverDoc?.isVerified || false,
      profileComplete: authIssues.length === 0,
      issues: authIssues,
    };

    // ===== 2. APP FLOW & LOOP CHECKS =====
    const flowIssues: string[] = [];
    let loopDetected = false;

    try {
      // Check for auth flow completion
      const hasOnboardingCompleted = driverDoc?.onboardingCompletedAt !== undefined;
      const hasPinCreated = driverDoc?.pinCreatedAt !== undefined;

      if (driverDoc && !hasOnboardingCompleted) {
        flowIssues.push('Onboarding not completed');
        rootCauses.push({
          area: 'appFlow',
          description: 'Driver onboarding flow incomplete',
          likelihood: 'medium',
        });
      }

      // Check for loops in app_logs
      const appLogFilters: any[] = [
        { field: 'uid', operator: '==', value: input.uid },
        { field: 'createdAt', operator: '>=', value: startTime },
      ];

      const appLogs = await firestore.queryDocuments('app_logs', appLogFilters, {
        orderBy: { field: 'createdAt', direction: 'desc' },
        limit: 200,
      });

      // Simple pattern detection
      const messageFrequency = new Map<string, number>();
      for (const log of appLogs) {
        const message = log.message || '';
        const normalized = message.toLowerCase().substring(0, 50);
        messageFrequency.set(normalized, (messageFrequency.get(normalized) || 0) + 1);
      }

      // Check for repeated patterns (>50 repetitions = likely loop)
      for (const [pattern, count] of messageFrequency.entries()) {
        if (count > 50) {
          loopDetected = true;
          flowIssues.push(`Potential loop detected: pattern repeated ${count} times`);
          rootCauses.push({
            area: 'appFlow',
            description: `App loop detected: "${pattern.substring(0, 30)}..." repeated ${count} times`,
            likelihood: 'high',
            details: { repetitions: count, pattern: pattern.substring(0, 50) },
          });
          break;
        }
      }
    } catch (error) {
      // app_logs might not exist
    }

    sections.appFlow = {
      onboardingCompleted: driverDoc?.onboardingCompletedAt !== undefined,
      loopDetected,
      issues: flowIssues,
    };

    // ===== 3. PIN FLOW CHECKS =====
    const pinIssues: string[] = [];

    if (driverDoc) {
      const hasPin = driverDoc.hasPin;
      const hasPinHash = !!driverDoc.pinHash || !!driverDoc.pin_hash;
      const hasPinSalt = !!driverDoc.pinSalt || !!driverDoc.pin_salt;

      if (hasPin === true && (!hasPinHash || !hasPinSalt)) {
        pinIssues.push('Inconsistent PIN state: hasPin=true but missing hash/salt');
        rootCauses.push({
          area: 'pin',
          description: 'PIN state inconsistent (hasPin=true without hash/salt)',
          likelihood: 'high',
        });
      }

      if (hasPin === false && (hasPinHash || hasPinSalt)) {
        pinIssues.push('Inconsistent PIN state: hasPin=false but hash/salt exist');
        rootCauses.push({
          area: 'pin',
          description: 'PIN state inconsistent (hasPin=false with hash/salt)',
          likelihood: 'medium',
        });
      }

      sections.pin = {
        hasPin,
        hasPinHash,
        hasPinSalt,
        consistent: pinIssues.length === 0,
        issues: pinIssues,
      };
    }

    // ===== 4. LOCATION CHECKS =====
    const locationIssues: string[] = [];

    if (driverDoc) {
      // Check driver location
      let locationDoc: any = null;
      try {
        locationDoc = await firestore.getDocument('driver_locations', input.uid);
      } catch (error) {
        // Collection might not exist
      }

      if (!locationDoc) {
        locationIssues.push('Driver location document missing');
        rootCauses.push({
          area: 'location',
          description: 'Driver location data not found',
          likelihood: 'medium',
        });
      } else {
        const lastUpdate = locationDoc.lastUpdate
          ? firestore.timestampToDate(locationDoc.lastUpdate)
          : null;

        if (lastUpdate) {
          const ageMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);

          if (ageMinutes > 5) {
            locationIssues.push(`Location data stale (${Math.round(ageMinutes)} minutes old)`);
            rootCauses.push({
              area: 'location',
              description: `Driver location stale (${Math.round(ageMinutes)} minutes old)`,
              likelihood: ageMinutes > 30 ? 'high' : 'medium',
              details: { ageMinutes: Math.round(ageMinutes) },
            });
          }
        }

        // Check coordinate validity
        const lat = locationDoc.lat || locationDoc.latitude;
        const lng = locationDoc.lng || locationDoc.longitude;

        if (!lat || !lng || lat === 0 || lng === 0) {
          locationIssues.push('Invalid or missing GPS coordinates');
          rootCauses.push({
            area: 'location',
            description: 'Invalid GPS coordinates (0,0 or missing)',
            likelihood: 'high',
          });
        }
      }

      sections.location = {
        locationExists: !!locationDoc,
        isOnline: driverDoc.isOnline || false,
        issues: locationIssues,
      };
    }

    // ===== 5. MATCHING & VISIBILITY CHECKS =====
    if (input.orderId && driverDoc) {
      const matchingIssues: string[] = [];
      const orderDoc = await firestore.getDocument('orders', input.orderId);

      if (orderDoc) {
        // Check order status
        if (orderDoc.status !== 'matching') {
          matchingIssues.push(`Order status is "${orderDoc.status}", not "matching"`);
        }

        // Check if driver is eligible
        if (!driverDoc.isVerified) {
          matchingIssues.push('Driver not verified');
        }

        if (!driverDoc.isOnline) {
          matchingIssues.push('Driver is offline');
        }

        if (matchingIssues.length > 0) {
          rootCauses.push({
            area: 'matching',
            description: `Order visibility blocked: ${matchingIssues.join(', ')}`,
            likelihood: 'high',
            details: { orderId: input.orderId, issues: matchingIssues },
          });
        }

        sections.matching = {
          orderExists: true,
          orderStatus: orderDoc.status,
          driverEligible: matchingIssues.length === 0,
          issues: matchingIssues,
        };
      } else {
        sections.matching = {
          orderExists: false,
          issues: ['Order not found'],
        };
      }
    }

    // ===== 6. NOTIFICATION CHECKS =====
    const notificationIssues: string[] = [];

    if (driverDoc) {
      const fcmToken = driverDoc.fcmToken;

      if (!fcmToken || fcmToken === '') {
        notificationIssues.push('FCM token missing');
        rootCauses.push({
          area: 'notifications',
          description: 'Driver has no FCM token for push notifications',
          likelihood: 'medium',
        });
      }

      sections.notifications = {
        hasFcmToken: !!fcmToken,
        issues: notificationIssues,
      };
    }

    // ===== 7. SYSTEM HEALTH CONTEXT =====
    // Quick system health check
    try {
      const recentOrders = await firestore.queryDocuments(
        'orders',
        [
          {
            field: 'createdAt',
            operator: '>=',
            value: new Date(now.getTime() - 60 * 60 * 1000), // Last hour
          },
        ],
        { limit: 100 }
      );

      const stuckOrders = recentOrders.filter((order) => {
        const createdAt = firestore.timestampToDate(order.createdAt);
        if (!createdAt) return false;
        const ageMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);
        return order.status === 'matching' && !order.driverId && ageMinutes > 10;
      });

      if (stuckOrders.length > 5) {
        rootCauses.push({
          area: 'systemHealth',
          description: `System-wide issue: ${stuckOrders.length} orders stuck in matching`,
          likelihood: 'low',
          details: { stuckOrdersCount: stuckOrders.length },
        });
      }

      sections.systemHealth = {
        recentOrdersCount: recentOrders.length,
        stuckOrdersCount: stuckOrders.length,
        systemHealthy: stuckOrders.length < 3,
      };
    } catch (error) {
      sections.systemHealth = {
        error: 'Unable to assess system health',
      };
    }

    // ===== 8. GENERATE RECOMMENDATIONS =====
    // Sort root causes by likelihood
    const sortedCauses = rootCauses.sort((a, b) => {
      const likelihoodOrder = { high: 3, medium: 2, low: 1 };
      return likelihoodOrder[b.likelihood] - likelihoodOrder[a.likelihood];
    });

    if (sortedCauses.length === 0) {
      recommendations.push(
        '✅ No critical issues detected. All subsystems appear healthy for this user.'
      );
    } else {
      recommendations.push(
        `🚨 Detected ${sortedCauses.length} potential root cause(s). Prioritized by likelihood:`
      );

      for (const cause of sortedCauses.slice(0, 5)) {
        recommendations.push(`\n[${cause.likelihood.toUpperCase()}] ${cause.area}: ${cause.description}`);

        // Add specific recommendations per area
        switch (cause.area) {
          case 'auth':
            if (cause.description.includes('not found')) {
              recommendations.push(
                '  → User needs to re-register via Firebase Auth.'
              );
            } else if (cause.description.includes('Driver document missing')) {
              recommendations.push(
                `  → Create driver document at /drivers/${input.uid} with required fields.`
              );
            } else if (cause.description.includes('incomplete')) {
              recommendations.push(
                `  → Complete driver profile: set missing fields in /drivers/${input.uid}.`
              );
            } else if (cause.description.includes('not verified')) {
              recommendations.push(
                `  → Set isVerified=true in /drivers/${input.uid} after verification.`
              );
            }
            break;

          case 'appFlow':
            if (cause.description.includes('loop')) {
              recommendations.push(
                '  → Check app_logs for repeated patterns. Add circuit breaker or navigation guards.'
              );
              recommendations.push(
                '  → Review AuthGate implementation: avoid navigation in build() methods.'
              );
            } else if (cause.description.includes('onboarding')) {
              recommendations.push(
                `  → Set onboardingCompletedAt timestamp in /drivers/${input.uid}.`
              );
            }
            break;

          case 'pin':
            recommendations.push(
              `  → Reset PIN state: set hasPin=false in /drivers/${input.uid} and ask user to recreate PIN.`
            );
            break;

          case 'location':
            if (cause.description.includes('not found')) {
              recommendations.push(
                '  → Driver needs to enable location permissions and open the app.'
              );
            } else if (cause.description.includes('stale')) {
              recommendations.push(
                '  → Ask driver to refresh location by reopening app or toggling airplane mode.'
              );
            } else if (cause.description.includes('Invalid')) {
              recommendations.push(
                '  → Driver GPS not working. Check device settings and location permissions.'
              );
            }
            break;

          case 'notifications':
            recommendations.push(
              '  → Driver needs to grant notification permissions and restart app to get FCM token.'
            );
            break;

          case 'matching':
            recommendations.push(
              '  → Address blocking issues: verify driver, bring online, check order status.'
            );
            break;

          case 'systemHealth':
            recommendations.push(
              '  → System-wide issue detected. Check Cloud Scheduler, expireStaleOrders function.'
            );
            break;
        }
      }
    }

    // ===== 9. BUILD SUMMARY =====
    let summary = `Incident report for uid="${input.uid}"`;
    if (input.orderId) {
      summary += ` (order: ${input.orderId})`;
    }
    summary += ` over last ${input.timeRangeMinutes} minutes. `;

    const highPriority = sortedCauses.filter((c) => c.likelihood === 'high');
    const mediumPriority = sortedCauses.filter((c) => c.likelihood === 'medium');

    if (highPriority.length > 0) {
      summary += `CRITICAL: ${highPriority.length} high-priority issue(s) detected. `;
      summary += `Most likely root cause: ${highPriority[0].description}. `;
    } else if (mediumPriority.length > 0) {
      summary += `${mediumPriority.length} medium-priority issue(s) detected. `;
      summary += `Primary concern: ${mediumPriority[0].description}. `;
    } else if (sortedCauses.length > 0) {
      summary += `${sortedCauses.length} low-priority issue(s) detected. System appears mostly healthy.`;
    } else {
      summary += 'No significant issues detected. All subsystems appear healthy.';
    }

    return {
      summary,
      rootCauseCandidates: sortedCauses,
      sections,
      recommendations,
      debug: input.includeDeepDiagnostics
        ? {
            timeRange: `${startTime.toISOString()} to ${now.toISOString()}`,
            authUserExists: !!authUser,
            driverDocExists: !!driverDoc,
            totalRootCauses: sortedCauses.length,
          }
        : undefined,
    };
  } catch (error: any) {
    throw new Error(
      `[incident-report] Failed to generate incident report: ${error.message}`
    );
  }
}

export const incidentReportSchema = {
  name: 'wawapp_incident_report',
  description:
    'Unified incident diagnostics tool that aggregates signals from multiple subsystems (auth, app flow, PIN, location, matching, notifications, system health) to provide comprehensive root cause analysis. Returns prioritized root cause candidates with likelihood ratings, detailed subsystem diagnostics, and actionable recommendations. Use this as a first-line diagnostic tool to quickly identify why a user/driver is experiencing issues.',
  inputSchema: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'User/driver ID to diagnose',
      },
      orderId: {
        type: 'string',
        description: 'Optional order ID for order-specific diagnostics',
      },
      timeRangeMinutes: {
        type: 'number',
        description:
          'Time range for analysis in minutes (default: 1440 = 24 hours, max: 10080 = 7 days)',
        default: 1440,
      },
      includeDeepDiagnostics: {
        type: 'boolean',
        description: 'Include detailed diagnostics from all subsystems (default: true)',
        default: true,
      },
    },
    required: ['uid'],
  },
};
