/**
 * Kit 8: Auth & App Flow Diagnostics
 * Tool: wawapp_route_loop_diagnoser
 *
 * Detect navigation/route loops around auth and onboarding flows.
 * Identifies sequences like: nearby → onboarding → nearby → onboarding.
 *
 * @author WawApp Development Team
 * @date 2025-11-26
 */

import { z } from 'zod';
import { CloudLoggingClient } from '../../data-access/cloud-logging-client.js';

const InputSchema = z.object({
  uid: z
    .string()
    .min(1)
    .describe('User ID to diagnose'),
  timeRangeMinutes: z
    .number()
    .min(1)
    .max(1440)
    .default(120)
    .describe('Time range to analyze (default: 120, max: 1440)'),
  maxSequenceLength: z
    .number()
    .min(5)
    .max(100)
    .default(50)
    .describe('Maximum navigation sequence length to analyze'),
});

type RouteLoopDiagnoserInput = z.infer<typeof InputSchema>;

interface NavigationEvent {
  timestamp: string;
  route: string;
  action: string;
}

interface LoopPattern {
  sequence: string[];
  occurrences: number;
  timestamps: string[];
}

interface RouteLoopDiagnoserResult {
  summary: string;
  data: {
    navigationEvents: NavigationEvent[];
    loops: LoopPattern[];
    loopDetected: boolean;
    routeSequence: string[];
  };
  recommendations: string[];
  debug?: Record<string, any>;
}

function detectLoopsInSequence(
  sequence: string[],
  minLoopLength: number = 2
): LoopPattern[] {
  const loops: LoopPattern[] = [];

  // Look for repeating subsequences
  for (let loopLen = minLoopLength; loopLen <= Math.floor(sequence.length / 2); loopLen++) {
    for (let i = 0; i <= sequence.length - loopLen * 2; i++) {
      const subsequence = sequence.slice(i, i + loopLen);
      const nextSubsequence = sequence.slice(i + loopLen, i + loopLen * 2);

      // Check if subsequence repeats
      if (JSON.stringify(subsequence) === JSON.stringify(nextSubsequence)) {
        // Count how many times this pattern repeats
        let occurrences = 1;
        let j = i + loopLen;

        while (j + loopLen <= sequence.length) {
          const checkSubsequence = sequence.slice(j, j + loopLen);
          if (JSON.stringify(subsequence) === JSON.stringify(checkSubsequence)) {
            occurrences++;
            j += loopLen;
          } else {
            break;
          }
        }

        if (occurrences >= 2) {
          loops.push({
            sequence: subsequence,
            occurrences,
            timestamps: [], // Will be filled later
          });

          // Skip ahead to avoid overlapping detections
          i = j - 1;
        }
      }
    }
  }

  // Remove duplicate loop patterns
  const uniqueLoops = loops.filter(
    (loop, index, self) =>
      index ===
      self.findIndex((l) => JSON.stringify(l.sequence) === JSON.stringify(loop.sequence))
  );

  return uniqueLoops;
}

export async function routeLoopDiagnoser(
  params: unknown
): Promise<RouteLoopDiagnoserResult> {
  const input = InputSchema.parse(params);
  const cloudLogging = CloudLoggingClient.getInstance();

  const recommendations: string[] = [];
  const navigationEvents: NavigationEvent[] = [];

  try {
    const now = new Date();
    const timeRangeMs = input.timeRangeMinutes * 60 * 1000;
    const startTime = new Date(now.getTime() - timeRangeMs);

    // Build filter for navigation/route logs
    const navigationKeywords = [
      'navigation',
      'navigate',
      'route',
      'screen',
      'page',
      'nearby',
      'onboarding',
      'auth',
      'home',
      'login',
    ];

    const keywordFilter = navigationKeywords
      .map((k) => `textPayload:"${k}" OR jsonPayload:"${k}"`)
      .join(' OR ');

    let filter = `resource.type="cloud_function" AND (${keywordFilter})`;

    // Add UID filter
    if (input.uid) {
      filter += ` AND (jsonPayload.uid="${input.uid}" OR textPayload:"${input.uid}")`;
    }

    // Query logs
    let logs: any[] = [];
    try {
      logs = await cloudLogging.queryLogs(
        filter,
        startTime,
        now,
        input.maxSequenceLength * 2
      );
    } catch (error) {
      // If Cloud Logging fails, return gracefully
      recommendations.push(
        '⚠️ Cloud Logging not accessible or no navigation logs found.'
      );
      recommendations.push(
        'ℹ️ To detect route loops, add navigation event logging to your app:'
      );
      recommendations.push(
        '  - Log navigation events with: logger.info("navigation", {uid, from: previousRoute, to: nextRoute})'
      );
      recommendations.push(
        '  - Include screen names and navigation triggers in logs'
      );

      return {
        summary: `Route loop detection failed: No navigation logs found for uid="${input.uid}" in last ${input.timeRangeMinutes} minutes. Add navigation logging to enable this diagnostic.`,
        data: {
          navigationEvents: [],
          loops: [],
          loopDetected: false,
          routeSequence: [],
        },
        recommendations,
      };
    }

    // Parse logs to extract navigation events
    for (const log of logs) {
      const message =
        typeof log.message === 'string'
          ? log.message
          : JSON.stringify(log.message);

      const lowerMessage = message.toLowerCase();

      // Extract route names from log messages
      let route = 'unknown';
      let action = 'navigate';

      // Detect common screen names
      if (lowerMessage.includes('nearby') || lowerMessage.includes('nearby_screen')) {
        route = 'nearby_screen';
      } else if (lowerMessage.includes('onboarding')) {
        route = 'onboarding_screen';
      } else if (lowerMessage.includes('auth') && !lowerMessage.includes('authgate')) {
        route = 'auth_screen';
      } else if (lowerMessage.includes('login') || lowerMessage.includes('signin')) {
        route = 'login_screen';
      } else if (lowerMessage.includes('pin')) {
        route = 'pin_screen';
      } else if (lowerMessage.includes('home') || lowerMessage.includes('home_screen')) {
        route = 'home_screen';
      } else if (lowerMessage.includes('verification')) {
        route = 'verification_screen';
      } else if (lowerMessage.includes('profile')) {
        route = 'profile_screen';
      } else {
        // Try to extract screen/route name from message
        const screenMatch = message.match(/(\w+_screen|\w+Screen|\w+Page)/i);
        if (screenMatch) {
          route = screenMatch[1].toLowerCase();
        }
      }

      // Detect action
      if (lowerMessage.includes('push')) {
        action = 'push';
      } else if (lowerMessage.includes('pop')) {
        action = 'pop';
      } else if (lowerMessage.includes('replace')) {
        action = 'replace';
      } else if (lowerMessage.includes('redirect')) {
        action = 'redirect';
      }

      navigationEvents.push({
        timestamp: log.timestamp,
        route,
        action,
      });
    }

    // Sort events chronologically
    navigationEvents.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Build route sequence
    const routeSequence = navigationEvents.map((e) => e.route);

    // Detect loops in the sequence
    const loops = detectLoopsInSequence(routeSequence, 2);

    // Add timestamps to loop patterns
    for (const loop of loops) {
      const loopTimestamps: string[] = [];
      for (let i = 0; i < routeSequence.length - loop.sequence.length + 1; i++) {
        const subsequence = routeSequence.slice(i, i + loop.sequence.length);
        if (JSON.stringify(subsequence) === JSON.stringify(loop.sequence)) {
          loopTimestamps.push(navigationEvents[i].timestamp);
        }
      }
      loop.timestamps = loopTimestamps;
    }

    const loopDetected = loops.length > 0;

    // Generate recommendations
    if (loopDetected) {
      recommendations.push(
        `🚨 ROUTE LOOP DETECTED: Found ${loops.length} navigation loop pattern(s).`
      );

      for (const loop of loops) {
        recommendations.push(
          `- Loop: [${loop.sequence.join(' → ')}] repeated ${loop.occurrences} times.`
        );

        // Specific recommendations based on loop pattern
        if (
          loop.sequence.includes('nearby_screen') &&
          loop.sequence.includes('onboarding_screen')
        ) {
          recommendations.push(
          '  → Review navigation conditions between nearby and onboarding screens.'
          );
          recommendations.push(
            '  → Ensure profile completeness check is correct before allowing access to nearby screen.'
          );
          recommendations.push(
            '  → Check onboardingCompletedAt flag is set properly.'
          );
        }

        if (
          loop.sequence.includes('auth_screen') ||
          loop.sequence.includes('login_screen')
        ) {
          recommendations.push(
            '  → Check auth state management. Ensure auth stream is stable.'
          );
          recommendations.push(
            '  → Verify route guards are not triggering conflicting navigation.'
          );
        }

        if (loop.sequence.includes('pin_screen')) {
          recommendations.push(
            '  → Verify PIN verification logic and hasPin flag.'
          );
          recommendations.push(
            '  → Check navigation conditions from PIN screen to next screen.'
          );
        }

        if (
          loop.sequence.includes('home_screen') &&
          loop.sequence.includes('auth_screen')
        ) {
          recommendations.push(
            '  → Auth session may be expiring or becoming invalid.'
          );
          recommendations.push(
            '  → Check token refresh logic and session persistence.'
          );
        }
      }

      recommendations.push(
        '- Add navigation guards with state validation before each transition.'
      );
      recommendations.push(
        '- Implement navigation history tracking to detect and break loops.'
      );
    } else {
      if (routeSequence.length === 0) {
        recommendations.push(
          '⚠️ No navigation events found in logs. Add navigation logging to enable route loop detection.'
        );
      } else {
        recommendations.push(
          `✅ No route loops detected in ${routeSequence.length} navigation event(s).`
        );
      }
    }

    // Build summary
    let summary = `Route loop diagnosis for uid="${input.uid}" in last ${input.timeRangeMinutes} minutes. `;
    summary += `Found ${navigationEvents.length} navigation event(s). `;

    if (loopDetected) {
      summary += `LOOP DETECTED: ${loops.length} loop pattern(s). `;
      if (loops[0]) {
        summary += `Main loop: [${loops[0].sequence.join(' → ')}] × ${loops[0].occurrences}.`;
      }
    } else {
      summary += navigationEvents.length > 0
        ? 'No loops detected.'
        : 'No navigation events found (add navigation logging).';
    }

    return {
      summary,
      data: {
        navigationEvents: navigationEvents.slice(0, input.maxSequenceLength),
        loops,
        loopDetected,
        routeSequence: routeSequence.slice(0, input.maxSequenceLength),
      },
      recommendations,
    };
  } catch (error: any) {
    throw new Error(
      `[route-loop-diagnoser] Failed to diagnose route loops: ${error.message}`
    );
  }
}

export const routeLoopDiagnoserSchema = {
  name: 'wawapp_route_loop_diagnoser',
  description:
    'Detect navigation/route loops around auth and onboarding flows using logs. Identifies repeated navigation sequences like [nearby_screen → onboarding_screen → nearby_screen]. Analyzes navigation event logs to detect loops in route transitions. Returns detected loop patterns with occurrences, timestamps, and specific recommendations for fixing navigation conditions, route guards, and state validation.',
  inputSchema: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'User ID to diagnose',
      },
      timeRangeMinutes: {
        type: 'number',
        description: 'Time range to analyze (default: 120, max: 1440)',
        default: 120,
      },
      maxSequenceLength: {
        type: 'number',
        description: 'Maximum navigation sequence length to analyze (default: 50, max: 100)',
        default: 50,
      },
    },
    required: ['uid'],
  },
};
