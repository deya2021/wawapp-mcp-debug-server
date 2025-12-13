/**
 * Kit 2: Driver Matching Diagnostics
 * Tool: wawapp_order_visibility_v2
 *
 * Enhanced order visibility diagnostic using Phase 1 atoms.
 * Returns standardized output with rule IDs and evidence paths.
 * Original wawapp_order_visibility remains unchanged for backward compatibility.
 *
 * @author WawApp Development Team
 * @date 2025-12-13
 * @version 2.0 (Phase 1)
 */

import { z } from 'zod';
import { DiagnosticResultBuilder } from '../../utils/result-builder.js';
import { NEARBY_RADIUS_KM } from '../../config/constants.js';
import type { StandardDiagnosticResult } from '../../types/standard-output.js';

// Import atoms
import {
  driverProfileAudit,
  driverLocationFreshness,
  driverOnlineState,
} from '../kit9-scenario-atoms/driver-atoms.js';
import {
  orderStateAudit,
  matchingRuleTrace,
} from '../kit9-scenario-atoms/order-atoms.js';

const InputSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  driverId: z.string().min(1, 'Driver ID is required'),
  radiusKm: z
    .number()
    .positive()
    .default(NEARBY_RADIUS_KM)
    .describe('Search radius in kilometers (default: 6.0)'),
});

/**
 * Enhanced order visibility diagnostic using atoms
 */
export async function orderVisibilityV2(
  params: unknown
): Promise<StandardDiagnosticResult> {
  const input = InputSchema.parse(params);
  const builder = new DiagnosticResultBuilder('order_visibility_v2');
  const startTime = new Date();

  try {
    // Run all atom checks in parallel
    const [orderResult, profileResult, locationResult, onlineResult, matchingResult] =
      await Promise.all([
        orderStateAudit({ orderId: input.orderId }),
        driverProfileAudit({ driverId: input.driverId }),
        driverLocationFreshness({ driverId: input.driverId, maxAgeMinutes: 5 }),
        driverOnlineState({ driverId: input.driverId }),
        matchingRuleTrace({
          orderId: input.orderId,
          driverId: input.driverId,
          radiusKm: input.radiusKm,
        }),
      ]);

    // Aggregate all results
    const allResults = [
      orderResult,
      profileResult,
      locationResult,
      onlineResult,
      matchingResult,
    ];

    for (const result of allResults) {
      builder['blockingReasons'].push(...result.blockingReasons);
      builder['evidence'].push(...result.evidence);
      builder['suggestedFixes'].push(...result.suggestedFixes);
      builder['linkedFailures'].push(...result.linkedFailures);
    }

    // Determine overall visibility
    const visible = builder['blockingReasons'].length === 0;

    // Build summary
    let summary: string;
    if (visible) {
      summary = `Order ${input.orderId} IS visible to driver ${input.driverId}. All checks passed.`;
    } else {
      const criticalReasons = builder['blockingReasons'].filter(
        (r: any) => r.severity === 'CRITICAL'
      );
      const warningReasons = builder['blockingReasons'].filter(
        (r: any) => r.severity === 'WARNING'
      );

      summary = `Order ${input.orderId} is NOT visible to driver ${input.driverId}. `;
      if (criticalReasons.length > 0) {
        summary += `${criticalReasons.length} CRITICAL issue(s): `;
        summary += criticalReasons
          .map((r: any) => r.ruleId)
          .slice(0, 3)
          .join(', ');
        if (criticalReasons.length > 3) {
          summary += ` and ${criticalReasons.length - 3} more`;
        }
      }
      if (warningReasons.length > 0) {
        summary += `. ${warningReasons.length} warning(s)`;
      }
    }

    return builder
      .setStatus(visible ? 'PASS' : 'FAIL')
      .setSummary(summary)
      .build(startTime);
  } catch (error: any) {
    throw new Error(`[order-visibility-v2] ${error.message}`);
  }
}

export const orderVisibilityV2Schema = {
  name: 'wawapp_order_visibility_v2',
  description:
    'Enhanced order visibility diagnostic using Phase 1 atoms. ' +
    'Debug why a specific order is not visible to a specific driver. ' +
    'Performs comprehensive checks: order state (matching status), driver eligibility (verified, profile complete, online), ' +
    'driver location (valid, fresh), and distance (within radius). ' +
    'Returns standardized output with rule IDs (e.g., PROFILE_MISSING:name, LOCATION_STALE, DRIVER_OFFLINE), ' +
    'Firestore evidence paths, suggested fixes, and linked failure scenarios. ' +
    'Aggregates results from 5 atoms: order_state_audit, driver_profile_audit, driver_location_freshness, driver_online_state, matching_rule_trace.',
  inputSchema: {
    type: 'object',
    properties: {
      orderId: {
        type: 'string',
        description: 'Order ID to check visibility for',
      },
      driverId: {
        type: 'string',
        description: 'Driver ID to check visibility against',
      },
      radiusKm: {
        type: 'number',
        description: 'Search radius in kilometers (default: 6.0)',
        default: NEARBY_RADIUS_KM,
      },
    },
    required: ['orderId', 'driverId'],
  },
};
