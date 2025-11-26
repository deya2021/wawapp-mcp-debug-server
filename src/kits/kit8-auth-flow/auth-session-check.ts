/**
 * Kit 8: Auth & App Flow Diagnostics
 * Tool: wawapp_auth_session_check
 *
 * Check auth session health for a user across layers:
 * Firebase Auth, custom claims, and Firestore documents.
 *
 * @author WawApp Development Team
 * @date 2025-11-26
 */

import { z } from 'zod';
import { getAuth } from '../../data-access/firebase-admin.js';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { maskDocument } from '../../security/pii-masker.js';

const InputSchema = z.object({
  uid: z
    .string()
    .min(1)
    .describe('User ID to check'),
  includeDetails: z
    .boolean()
    .default(true)
    .describe('Include detailed information'),
});

type AuthSessionCheckInput = z.infer<typeof InputSchema>;

interface AuthSessionIssue {
  type: 'critical' | 'warning' | 'info';
  field: string;
  description: string;
  expected?: string;
  actual?: string;
}

interface AuthSessionCheckResult {
  summary: string;
  data: {
    authUser: any;
    claims: Record<string, any>;
    firestoreUser: any;
    driverDoc: any;
    issues: AuthSessionIssue[];
  };
  recommendations: string[];
  debug?: Record<string, any>;
}

export async function authSessionCheck(
  params: unknown
): Promise<AuthSessionCheckResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const auth = getAuth();

  const issues: AuthSessionIssue[] = [];
  const recommendations: string[] = [];

  try {
    // 1. Check Firebase Auth user
    let authUser: any = null;
    let claims: Record<string, any> = {};

    try {
      authUser = await auth.getUser(input.uid);
      claims = authUser.customClaims || {};
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        issues.push({
          type: 'critical',
          field: 'firebase_auth',
          description: 'Firebase Auth user does not exist',
          expected: 'User exists in Firebase Auth',
          actual: 'User not found',
        });
      } else {
        throw error;
      }
    }

    // 2. Check Firestore /users/{uid}
    const firestoreUser = await firestore.getDocument('users', input.uid);

    if (!firestoreUser) {
      issues.push({
        type: 'critical',
        field: 'firestore_user',
        description: 'User document missing in /users collection',
        expected: 'Document exists at /users/{uid}',
        actual: 'Document not found',
      });
    }

    // 3. Check Firestore /drivers/{uid} (if role is driver)
    let driverDoc: any = null;
    const role = claims.role || firestoreUser?.role;

    if (role === 'driver') {
      driverDoc = await firestore.getDocument('drivers', input.uid);

      if (!driverDoc) {
        issues.push({
          type: 'critical',
          field: 'driver_document',
          description: 'User has driver role but /drivers/{uid} document missing',
          expected: 'Document exists at /drivers/{uid}',
          actual: 'Document not found',
        });
      }
    } else if (role !== 'driver') {
      // Check if driver doc exists when role is NOT driver
      driverDoc = await firestore.getDocument('drivers', input.uid);
      if (driverDoc) {
        issues.push({
          type: 'warning',
          field: 'role_mismatch',
          description: 'Driver document exists but user role is not "driver"',
          expected: 'No driver document or role="driver"',
          actual: `role="${role}" but driver doc exists`,
        });
      }
    }

    // 4. Check role consistency
    if (authUser && firestoreUser) {
      const claimRole = claims.role;
      const firestoreRole = firestoreUser.role;

      if (claimRole && firestoreRole && claimRole !== firestoreRole) {
        issues.push({
          type: 'warning',
          field: 'role_consistency',
          description: 'Role mismatch between custom claims and Firestore',
          expected: `Claims role matches Firestore role`,
          actual: `Claims: ${claimRole}, Firestore: ${firestoreRole}`,
        });
      }
    }

    // 5. Check email/phone verification (if applicable)
    if (authUser) {
      if (authUser.email && !authUser.emailVerified) {
        issues.push({
          type: 'info',
          field: 'email_verified',
          description: 'Email not verified',
          expected: 'emailVerified=true',
          actual: 'emailVerified=false',
        });
      }

      if (!authUser.phoneNumber && !authUser.email) {
        issues.push({
          type: 'warning',
          field: 'auth_method',
          description: 'User has no phone number or email',
          expected: 'At least one auth method (phone or email)',
          actual: 'Neither phone nor email present',
        });
      }
    }

    // 6. Check driver-specific fields if driver role
    if (driverDoc) {
      // Check isVerified
      if (typeof driverDoc.isVerified !== 'boolean') {
        issues.push({
          type: 'warning',
          field: 'driver.isVerified',
          description: 'Driver isVerified field missing or invalid',
          expected: 'boolean',
          actual: typeof driverDoc.isVerified,
        });
      }

      // Check required profile fields
      const requiredFields = ['name', 'phone', 'city', 'region'];
      for (const field of requiredFields) {
        if (!driverDoc[field] || driverDoc[field] === '') {
          issues.push({
            type: 'warning',
            field: `driver.${field}`,
            description: `Driver profile missing required field: ${field}`,
            expected: `${field} present and non-empty`,
            actual: 'missing or empty',
          });
        }
      }

      // Check online status
      if (typeof driverDoc.isOnline !== 'boolean') {
        issues.push({
          type: 'info',
          field: 'driver.isOnline',
          description: 'Driver isOnline field missing or invalid',
          expected: 'boolean',
          actual: typeof driverDoc.isOnline,
        });
      }
    }

    // 7. Generate recommendations
    if (issues.length === 0) {
      recommendations.push('✅ Auth session is healthy. All checks passed.');
    } else {
      const critical = issues.filter((i) => i.type === 'critical');
      const warnings = issues.filter((i) => i.type === 'warning');

      if (critical.length > 0) {
        recommendations.push(
          `🚨 CRITICAL: ${critical.length} critical issue(s) detected. Immediate action required.`
        );

        for (const issue of critical) {
          if (issue.field === 'firebase_auth') {
            recommendations.push(
              `- Firebase Auth user missing. Ensure user is registered via Firebase Auth. User may need to re-register.`
            );
          } else if (issue.field === 'firestore_user') {
            recommendations.push(
              `- Create user document at /users/${input.uid} with required fields (role, name, phone, etc.).`
            );
          } else if (issue.field === 'driver_document') {
            recommendations.push(
              `- Create driver document at /drivers/${input.uid} with required fields (isVerified, name, phone, city, region, isOnline).`
            );
          }
        }
      }

      if (warnings.length > 0) {
        recommendations.push(
          `⚠️ ${warnings.length} warning(s) detected. Review and address issues.`
        );

        for (const issue of warnings) {
          if (issue.field === 'role_mismatch') {
            recommendations.push(
              `- Sync role between custom claims and Firestore. Set custom claims with: admin.auth().setCustomUserClaims(uid, {role: "driver"}).`
            );
          } else if (issue.field === 'role_consistency') {
            recommendations.push(
              `- Fix role inconsistency. Update Firestore role or custom claims to match.`
            );
          } else if (issue.field.startsWith('driver.')) {
            const fieldName = issue.field.split('.')[1];
            recommendations.push(
              `- Complete driver profile: set ${fieldName} in /drivers/${input.uid}.`
            );
          }
        }
      }
    }

    // Build summary
    let summary = `Auth session check for uid="${input.uid}". `;

    if (!authUser) {
      summary += 'Firebase Auth user NOT FOUND. ';
    } else {
      summary += `Firebase Auth user exists (${authUser.email || authUser.phoneNumber || 'no email/phone'}). `;
    }

    if (!firestoreUser) {
      summary += 'Firestore user document NOT FOUND. ';
    } else {
      summary += `Firestore user exists (role: ${firestoreUser.role || 'unknown'}). `;
    }

    if (role === 'driver') {
      if (!driverDoc) {
        summary += 'Driver document NOT FOUND (expected for driver role). ';
      } else {
        summary += `Driver document exists (isVerified: ${driverDoc.isVerified || false}, isOnline: ${driverDoc.isOnline || false}). `;
      }
    }

    summary += `Found ${issues.length} issue(s): ${issues.filter((i) => i.type === 'critical').length} critical, ${issues.filter((i) => i.type === 'warning').length} warnings, ${issues.filter((i) => i.type === 'info').length} info.`;

    // Mask PII
    const maskedAuthUser = authUser
      ? {
          uid: authUser.uid,
          email: authUser.email ? '***@***.***' : null,
          phoneNumber: authUser.phoneNumber
            ? maskDocument({ phone: authUser.phoneNumber }).phone
            : null,
          emailVerified: authUser.emailVerified,
          disabled: authUser.disabled,
          metadata: authUser.metadata,
        }
      : null;

    const maskedFirestoreUser = firestoreUser
      ? maskDocument(firestoreUser)
      : null;

    const maskedDriverDoc = driverDoc ? maskDocument(driverDoc) : null;

    return {
      summary,
      data: {
        authUser: maskedAuthUser,
        claims,
        firestoreUser: maskedFirestoreUser,
        driverDoc: maskedDriverDoc,
        issues,
      },
      recommendations,
    };
  } catch (error: any) {
    throw new Error(
      `[auth-session-check] Failed to check auth session: ${error.message}`
    );
  }
}

export const authSessionCheckSchema = {
  name: 'wawapp_auth_session_check',
  description:
    'Check auth session health for a user across Firebase Auth, custom claims, and Firestore documents. Detects inconsistencies in role, missing documents, incomplete profiles, and verification status. Returns detailed diagnostics with actionable recommendations.',
  inputSchema: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'User ID to check',
      },
      includeDetails: {
        type: 'boolean',
        description: 'Include detailed information (default: true)',
        default: true,
      },
    },
    required: ['uid'],
  },
};
