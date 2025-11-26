/**
 * Kit 8: Auth & App Flow Diagnostics
 * Tool: wawapp_multi_device_session_audit
 *
 * Check for multi-device session issues for a given uid.
 * Detects conflicting states between multiple active devices.
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
});

type MultiDeviceSessionAuditInput = z.infer<typeof InputSchema>;

interface DeviceSession {
  deviceId: string;
  platform?: string;
  lastActivity: string;
  activityCount: number;
  events: string[];
}

interface Conflict {
  type: string;
  description: string;
  devices: string[];
  timestamps: string[];
}

interface MultiDeviceSessionAuditResult {
  summary: string;
  data: {
    devices: DeviceSession[];
    conflicts: Conflict[];
    hasMultipleActiveSessions: boolean;
    totalDevices: number;
  };
  recommendations: string[];
  debug?: Record<string, any>;
}

export async function multiDeviceSessionAudit(
  params: unknown
): Promise<MultiDeviceSessionAuditResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const cloudLogging = CloudLoggingClient.getInstance();

  const recommendations: string[] = [];
  const deviceSessions: Map<string, DeviceSession> = new Map();
  const conflicts: Conflict[] = [];

  try {
    const now = new Date();
    const timeRangeMs = input.timeRangeMinutes * 60 * 1000;
    const startTime = new Date(now.getTime() - timeRangeMs);

    // 1. Check for session data in Firestore (if exists)
    // Look for user sessions collection or device tokens
    let sessionsData: any[] = [];

    try {
      // Try to query sessions subcollection if it exists
      const db = firestore['db']; // Access private db property
      const sessionsRef = db
        .collection('users')
        .doc(input.uid)
        .collection('sessions');
      const sessionsSnapshot = await sessionsRef.get();

      if (!sessionsSnapshot.empty) {
        sessionsData = sessionsSnapshot.docs.map((doc: any) => ({
          id: doc.id,
          ...doc.data(),
        }));
      }
    } catch (error) {
      // Sessions subcollection might not exist
    }

    // Add sessions from Firestore
    for (const session of sessionsData) {
      const deviceId = session.deviceId || session.id;
      const lastActivity = session.lastActivity
        ? firestore.timestampToDate(session.lastActivity)
        : null;

      if (lastActivity && lastActivity >= startTime) {
        deviceSessions.set(deviceId, {
          deviceId,
          platform: session.platform || 'unknown',
          lastActivity: lastActivity.toISOString(),
          activityCount: 1,
          events: ['session_active'],
        });
      }
    }

    // 2. Query Cloud Logs for device activity
    try {
      const deviceFilter = `jsonPayload.uid="${input.uid}" OR textPayload:"${input.uid}"`;
      const logs = await cloudLogging.queryLogs(
        deviceFilter,
        startTime,
        now,
        500
      );

      for (const log of logs) {
        const message =
          typeof log.message === 'string'
            ? log.message
            : JSON.stringify(log.message);

        // Extract device ID from logs
        let deviceId: string | null = null;

        // Try to extract deviceId from jsonPayload
        if (typeof log.message === 'object' && log.message.deviceId) {
          deviceId = log.message.deviceId;
        } else if (typeof log.message === 'object' && log.message.device_id) {
          deviceId = log.message.device_id;
        }

        // Try to extract from text
        if (!deviceId) {
          const deviceMatch = message.match(/device[_\s]?id[:\s]+([a-zA-Z0-9_-]+)/i);
          if (deviceMatch) {
            deviceId = deviceMatch[1];
          }
        }

        // If no deviceId found, try to extract from FCM token or other identifiers
        if (!deviceId && message.includes('fcm')) {
          const tokenMatch = message.match(/token[:\s]+([a-zA-Z0-9_-]{20,})/i);
          if (tokenMatch) {
            deviceId = `device_${tokenMatch[1].substring(0, 8)}`;
          }
        }

        // Default to 'unknown' if no device ID found
        if (!deviceId) {
          deviceId = 'unknown_device';
        }

        // Extract platform if available
        let platform = 'unknown';
        if (message.toLowerCase().includes('android')) {
          platform = 'android';
        } else if (message.toLowerCase().includes('ios')) {
          platform = 'ios';
        } else if (message.toLowerCase().includes('web')) {
          platform = 'web';
        }

        // Extract event type
        let eventType = 'activity';
        if (message.toLowerCase().includes('login') || message.toLowerCase().includes('signin')) {
          eventType = 'login';
        } else if (message.toLowerCase().includes('logout')) {
          eventType = 'logout';
        } else if (message.toLowerCase().includes('profile')) {
          eventType = 'profile_update';
        } else if (message.toLowerCase().includes('order')) {
          eventType = 'order_activity';
        }

        // Add or update device session
        if (!deviceSessions.has(deviceId)) {
          deviceSessions.set(deviceId, {
            deviceId,
            platform,
            lastActivity: log.timestamp,
            activityCount: 0,
            events: [],
          });
        }

        const session = deviceSessions.get(deviceId)!;
        session.activityCount++;
        session.lastActivity = log.timestamp; // Update to latest
        session.events.push(eventType);

        if (session.platform === 'unknown' && platform !== 'unknown') {
          session.platform = platform;
        }
      }
    } catch (error) {
      recommendations.push(
        'ℹ️ Cloud Logging not accessible. Cannot retrieve device activity logs.'
      );
    }

    // 3. Detect conflicts
    const devices = Array.from(deviceSessions.values());
    const activeDevices = devices.filter((d) => {
      const lastActivity = new Date(d.lastActivity);
      const minutesSinceActivity =
        (now.getTime() - lastActivity.getTime()) / (1000 * 60);
      return minutesSinceActivity < 30; // Active if activity in last 30 minutes
    });

    const hasMultipleActiveSessions = activeDevices.length > 1;

    if (hasMultipleActiveSessions) {
      // Check for simultaneous profile updates
      const profileUpdateDevices = devices.filter((d) =>
        d.events.includes('profile_update')
      );

      if (profileUpdateDevices.length > 1) {
        conflicts.push({
          type: 'concurrent_profile_updates',
          description: 'Multiple devices updating profile simultaneously',
          devices: profileUpdateDevices.map((d) => d.deviceId),
          timestamps: profileUpdateDevices.map((d) => d.lastActivity),
        });
      }

      // Check for conflicting auth states (one login, one logout)
      const loginDevices = devices.filter((d) => d.events.includes('login'));
      const logoutDevices = devices.filter((d) => d.events.includes('logout'));

      if (loginDevices.length > 0 && logoutDevices.length > 0) {
        conflicts.push({
          type: 'conflicting_auth_states',
          description: 'Some devices logging in while others logging out',
          devices: [...loginDevices.map((d) => d.deviceId), ...logoutDevices.map((d) => d.deviceId)],
          timestamps: [...loginDevices.map((d) => d.lastActivity), ...logoutDevices.map((d) => d.lastActivity)],
        });
      }

      // Check for platform conflicts (same user on different platforms simultaneously)
      const platforms = new Set(activeDevices.map((d) => d.platform));
      if (platforms.size > 1) {
        conflicts.push({
          type: 'multi_platform_activity',
          description: `User active on ${platforms.size} different platforms simultaneously`,
          devices: activeDevices.map((d) => d.deviceId),
          timestamps: activeDevices.map((d) => d.lastActivity),
        });
      }
    }

    // 4. Generate recommendations
    if (hasMultipleActiveSessions) {
      recommendations.push(
        `⚠️ User has ${activeDevices.length} active sessions on different devices.`
      );

      if (conflicts.length > 0) {
        recommendations.push(
          `🚨 Detected ${conflicts.length} potential conflict(s) between devices.`
        );

        for (const conflict of conflicts) {
          recommendations.push(`- ${conflict.type}: ${conflict.description}`);

          if (conflict.type === 'concurrent_profile_updates') {
            recommendations.push(
              '  → Implement optimistic locking or last-write-wins strategy for profile updates.'
            );
            recommendations.push(
              '  → Add version field to user document and check before updates.'
            );
          } else if (conflict.type === 'conflicting_auth_states') {
            recommendations.push(
              '  → Consider implementing single-active-session policy.'
            );
            recommendations.push(
              '  → Invalidate other sessions when user logs out from one device.'
            );
          } else if (conflict.type === 'multi_platform_activity') {
            recommendations.push(
              '  → This is normal if user legitimately uses multiple devices.'
            );
            recommendations.push(
              '  → Add device management UI to let users see and revoke sessions.'
            );
          }
        }
      } else {
        recommendations.push(
          'ℹ️ Multiple sessions detected but no conflicts. User may be using multiple devices legitimately.'
        );
      }

      recommendations.push(
        '- Consider implementing session management: list active sessions, revoke sessions, single-active-session mode.'
      );
    } else {
      if (devices.length === 0) {
        recommendations.push(
          '⚠️ No device activity found in time range. User may be inactive or logs not available.'
        );
      } else if (devices.length === 1) {
        recommendations.push(
          `✅ Single device session detected. No multi-device conflicts.`
        );
      } else {
        recommendations.push(
          `✅ ${devices.length} device(s) found but only 1 active recently. No conflicts detected.`
        );
      }
    }

    // Build summary
    let summary = `Multi-device session audit for uid="${input.uid}" in last ${input.timeRangeMinutes} minutes. `;
    summary += `Found ${devices.length} device(s), ${activeDevices.length} active recently. `;

    if (hasMultipleActiveSessions) {
      summary += `MULTIPLE ACTIVE SESSIONS detected. `;
      if (conflicts.length > 0) {
        summary += `${conflicts.length} conflict(s) found.`;
      } else {
        summary += 'No conflicts detected.';
      }
    } else {
      summary += 'Single or no active session. No multi-device issues.';
    }

    return {
      summary,
      data: {
        devices,
        conflicts,
        hasMultipleActiveSessions,
        totalDevices: devices.length,
      },
      recommendations,
    };
  } catch (error: any) {
    throw new Error(
      `[multi-device-session-audit] Failed to audit sessions: ${error.message}`
    );
  }
}

export const multiDeviceSessionAuditSchema = {
  name: 'wawapp_multi_device_session_audit',
  description:
    'Check for multi-device session issues for a user. Analyzes device activity from Firestore sessions and Cloud Logs to detect multiple active sessions, concurrent profile updates, conflicting auth states, and multi-platform activity. Returns list of active devices with activity counts, detected conflicts with timestamps, and actionable recommendations for session management, conflict resolution, and single-active-session policies.',
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
    },
    required: ['uid'],
  },
};
