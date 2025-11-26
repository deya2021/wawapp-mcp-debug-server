/**
 * Kit 8: Auth & App Flow Diagnostics
 * Tool: wawapp_auth_loop_detector
 *
 * Detect potential auth-related infinite loops from logs.
 * Focuses on highly repeated patterns (AuthGate rebuild loops, etc.).
 *
 * @author WawApp Development Team
 * @date 2025-11-26
 */

import { z } from 'zod';
import { CloudLoggingClient } from '../../data-access/cloud-logging-client.js';
import { FirestoreClient } from '../../data-access/firestore-client.js';

const InputSchema = z.object({
  timeRangeMinutes: z
    .number()
    .min(1)
    .max(1440)
    .default(60)
    .describe('Time range to analyze (default: 60, max: 1440)'),
  uid: z
    .string()
    .optional()
    .describe('Optional: Filter by specific user ID'),
  minRepetitions: z
    .number()
    .min(10)
    .default(100)
    .describe(
      'Minimum repetitions to consider a loop (default: 100, min: 10)'
    ),
  limit: z
    .number()
    .min(1)
    .max(1000)
    .default(500)
    .describe('Maximum log entries to scan'),
});

type AuthLoopDetectorInput = z.infer<typeof InputSchema>;

interface LogPattern {
  signature: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  sample: string;
  severity: string;
  source: string;
  uid?: string;
}

interface AuthLoopDetectorResult {
  summary: string;
  data: {
    patterns: LogPattern[];
    topPattern: LogPattern | null;
    totalLogsScanned: number;
    loopDetected: boolean;
    cloudLogsCount: number;
    firestoreLogsCount: number;
  };
  recommendations: string[];
  debug?: Record<string, any>;
}

function normalizeLogMessage(message: string): string {
  // Normalize log messages to detect patterns
  // Remove timestamps, UIDs, dynamic values
  let normalized = message
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, 'TIMESTAMP')
    .replace(/\b[0-9a-f]{20,}\b/gi, 'ID')
    .replace(/\b\w+_[0-9a-zA-Z]{15,}\b/g, 'ID')
    .replace(/\d+ms/g, 'Xms')
    .replace(/\d+ seconds?/g, 'X seconds')
    .replace(/\d+ minutes?/g, 'X minutes')
    .replace(/\d+/g, 'N')
    .toLowerCase();

  // Keep only first 100 chars for signature
  return normalized.substring(0, 100);
}

export async function authLoopDetector(
  params: unknown
): Promise<AuthLoopDetectorResult> {
  const input = InputSchema.parse(params);
  const cloudLogging = CloudLoggingClient.getInstance();
  const firestore = FirestoreClient.getInstance();

  const recommendations: string[] = [];
  const patternCounts = new Map<
    string,
    { count: number; sample: string; firstSeen: string; lastSeen: string; severity: string; source: string; uid?: string }
  >();

  let cloudLogsCount = 0;
  let firestoreLogsCount = 0;

  try {
    const now = new Date();
    const timeRangeMs = input.timeRangeMinutes * 60 * 1000;
    const startTime = new Date(now.getTime() - timeRangeMs);

    // Build filter for auth-related logs
    let filter = 'resource.type="cloud_function"';

    // Add auth-related keywords
    const authKeywords = [
      'auth',
      'authgate',
      'login',
      'pin',
      'onboarding',
      'otp',
      'verification',
      'signin',
    ];

    const keywordFilter = authKeywords
      .map((k) => `textPayload:"${k}" OR jsonPayload:"${k}"`)
      .join(' OR ');
    filter += ` AND (${keywordFilter})`;

    // Add UID filter if provided
    if (input.uid) {
      filter += ` AND (jsonPayload.uid="${input.uid}" OR textPayload:"${input.uid}")`;
    }

    // Query Cloud Logs
    let cloudLogs: any[] = [];
    try {
      cloudLogs = await cloudLogging.queryLogs(
        filter,
        startTime,
        now,
        Math.floor(input.limit / 2) // Reserve half for Firestore logs
      );
      cloudLogsCount = cloudLogs.length;
    } catch (error) {
      recommendations.push(
        '⚠️ Cloud Logging not accessible. Falling back to Firestore app_logs only.'
      );
    }

    // Query Firestore app_logs collection
    let firestoreLogs: any[] = [];
    try {
      const firestoreFilters = [
        {
          field: 'createdAt',
          operator: '>=' as const,
          value: startTime,
        },
        {
          field: 'source',
          operator: '==' as const,
          value: 'driver_app',
        },
      ];

      // Add UID filter if provided
      if (input.uid) {
        firestoreFilters.push({
          field: 'uid',
          operator: '==' as const,
          value: input.uid,
        });
      }

      firestoreLogs = await firestore.queryDocuments(
        'app_logs',
        firestoreFilters,
        {
          orderBy: { field: 'createdAt', direction: 'desc' },
          limit: Math.floor(input.limit / 2), // Reserve half for Firestore logs
        }
      );
      firestoreLogsCount = firestoreLogs.length;
    } catch (error) {
      recommendations.push(
        '⚠️ Firestore app_logs collection not accessible. Using Cloud Logs only.'
      );
    }

    // Combine logs from both sources
    const allLogs = [...cloudLogs, ...firestoreLogs];

    if (allLogs.length === 0) {
      recommendations.push(
        '⚠️ No logs found from either Cloud Logging or Firestore. Cannot detect loops without logs.'
      );

      return {
        summary: `Loop detection failed: No logs accessible for uid="${input.uid || 'all'}" in last ${input.timeRangeMinutes} minutes.`,
        data: {
          patterns: [],
          topPattern: null,
          totalLogsScanned: 0,
          loopDetected: false,
          cloudLogsCount: 0,
          firestoreLogsCount: 0,
        },
        recommendations,
      };
    }

    // Analyze logs for patterns
    for (const log of allLogs) {
      let message: string;
      let timestamp: string;
      let severity: string;
      let source: string;
      let uid: string | undefined;

      // Handle different log formats (Cloud Logs vs Firestore)
      if (log.message !== undefined) {
        // Cloud Logs format
        message = typeof log.message === 'string' ? log.message : JSON.stringify(log.message);
        timestamp = log.timestamp;
        severity = log.severity || 'DEFAULT';
        source = 'cloud_logs';
        uid = log.uid;
      } else {
        // Firestore app_logs format
        message = log.message || '';
        timestamp = firestore.timestampToDate(log.createdAt)?.toISOString() || new Date().toISOString();
        severity = log.level || 'info';
        source = 'firestore';
        uid = log.uid;
      }

      // Normalize message to detect patterns
      const signature = normalizeLogMessage(message);

      if (!patternCounts.has(signature)) {
        patternCounts.set(signature, {
          count: 0,
          sample: message.substring(0, 200),
          firstSeen: timestamp,
          lastSeen: timestamp,
          severity,
          source,
          uid,
        });
      }

      const pattern = patternCounts.get(signature)!;
      pattern.count++;
      pattern.lastSeen = timestamp;
      
      // Update source to show mixed if from multiple sources
      if (pattern.source !== source) {
        pattern.source = 'mixed';
      }
    }

    // Convert to array and sort by count
    const patterns: LogPattern[] = Array.from(patternCounts.entries())
      .map(([signature, data]) => ({
        signature,
        count: data.count,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
        sample: data.sample,
        severity: data.severity,
        source: data.source,
        uid: data.uid,
      }))
      .sort((a, b) => b.count - a.count);

    // Filter patterns that meet minimum repetition threshold
    const significantPatterns = patterns.filter(
      (p) => p.count >= input.minRepetitions
    );

    const loopDetected = significantPatterns.length > 0;
    const topPattern = significantPatterns[0] || null;

    // Generate recommendations
    if (loopDetected) {
      recommendations.push(
        `🚨 LOOP DETECTED: Found ${significantPatterns.length} pattern(s) with >=${input.minRepetitions} repetitions.`
      );

      if (topPattern) {
        const durationMs =
          new Date(topPattern.lastSeen).getTime() -
          new Date(topPattern.firstSeen).getTime();
        const durationMinutes = Math.round(durationMs / (1000 * 60));

        recommendations.push(
          `Top pattern: ${topPattern.count} repetitions in ${durationMinutes} minute(s).`
        );

        // Specific recommendations based on pattern content
        if (
          topPattern.sample.toLowerCase().includes('authgate') ||
          topPattern.sample.toLowerCase().includes('auth gate')
        ) {
          recommendations.push(
            '- AUTHGATE REBUILD LOOP: Add build guard to AuthGate widget. Check if auth state stream is emitting duplicate events. Ensure Provider dependencies are stable.'
          );
        }

        if (
          topPattern.sample.toLowerCase().includes('rebuild') ||
          topPattern.sample.toLowerCase().includes('build')
        ) {
          recommendations.push(
            '- Widget rebuild loop detected. Check for unstable dependencies in Provider/Riverpod. Ensure streams are not emitting duplicate events. Add const constructors where possible.'
          );
        }

        if (topPattern.sample.toLowerCase().includes('pin')) {
          recommendations.push(
            '- PIN-related loop detected. Check PIN verification logic. Ensure PIN screen navigation conditions are correct. Verify hasPin flag is set properly after PIN creation.'
          );
        }

        if (topPattern.sample.toLowerCase().includes('onboarding')) {
          recommendations.push(
            '- Onboarding loop detected. Check onboarding completion conditions. Ensure onboardingCompletedAt timestamp is set. Verify navigation from onboarding to main app.'
          );
        }

        if (topPattern.sample.toLowerCase().includes('navigation')) {
          recommendations.push(
            '- Navigation loop detected. Review navigation conditions between screens. Check if route guards are working correctly. Ensure state changes trigger proper navigation.'
          );
        }

        // General recommendations
        // Enhanced recommendations for Firestore-based logging
        if (firestoreLogsCount > 0) {
          recommendations.push(
            '- Check Firestore app_logs collection for detailed auth flow events with structured data.'
          );
          recommendations.push(
            '- Use AppLogger.logEvent() to add more granular logging at suspected loop points.'
          );
        }
        
        recommendations.push(
          '- Add logging to identify the exact code path causing the loop.'
        );
        recommendations.push(
          '- Implement circuit breaker pattern to stop loops after N iterations.'
        );
        recommendations.push(
          '- Review recent code changes related to auth flow and state management.'
        );
        recommendations.push(
          '- Use ref.listen() instead of navigation in build() methods to prevent rebuild loops.'
        );
        recommendations.push(
          '- Add state guards to prevent duplicate screen transitions in AuthGate.'
        );
      }
    } else {
      recommendations.push(
        `✅ No loops detected with >=${input.minRepetitions} repetitions in last ${input.timeRangeMinutes} minutes.`
      );

      if (patterns.length > 0) {
        recommendations.push(
          `ℹ️ Found ${patterns.length} unique log pattern(s), but none exceed threshold. Max repetitions: ${patterns[0].count}.`
        );
      }
    }

    // Build summary
    let summary = `Loop detection for ${input.uid ? `uid="${input.uid}"` : 'all users'} in last ${input.timeRangeMinutes} minutes. `;
    summary += `Scanned ${allLogs.length} log(s) (${cloudLogsCount} Cloud + ${firestoreLogsCount} Firestore). `;

    if (loopDetected) {
      summary += `LOOP DETECTED: ${significantPatterns.length} pattern(s) with >=${input.minRepetitions} repetitions. `;
      if (topPattern) {
        summary += `Top pattern: ${topPattern.count} repetitions from ${topPattern.source}.`;
      }
    } else {
      summary += `No loops detected (threshold: ${input.minRepetitions} repetitions).`;
    }

    return {
      summary,
      data: {
        patterns: significantPatterns.slice(0, 10), // Return top 10 patterns
        topPattern,
        totalLogsScanned: allLogs.length,
        loopDetected,
        cloudLogsCount,
        firestoreLogsCount,
      },
      recommendations,
    };
  } catch (error: any) {
    throw new Error(
      `[auth-loop-detector] Failed to detect loops: ${error.message}`
    );
  }
}

export const authLoopDetectorSchema = {
  name: 'wawapp_auth_loop_detector',
  description:
    'Detect potential auth-related infinite loops from both Cloud Logs and Firestore app_logs collection. Identifies highly repeated log patterns (AuthGate rebuild loops, widget rebuild loops, etc.). Analyzes auth-related log messages from multiple sources and detects patterns repeated beyond threshold. Returns detected loop patterns with repetition counts, duration analysis, source information, and specific recommendations for fixing AuthGate, PIN, onboarding, or navigation loops.',
  inputSchema: {
    type: 'object',
    properties: {
      timeRangeMinutes: {
        type: 'number',
        description: 'Time range to analyze (default: 60, max: 1440)',
        default: 60,
      },
      uid: {
        type: 'string',
        description: 'Optional: Filter by specific user ID',
      },
      minRepetitions: {
        type: 'number',
        description:
          'Minimum repetitions to consider a loop (default: 100, min: 10)',
        default: 100,
      },
      limit: {
        type: 'number',
        description: 'Maximum log entries to scan (default: 500, max: 1000)',
        default: 500,
      },
    },
  },
};
