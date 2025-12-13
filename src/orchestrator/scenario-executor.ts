/**
 * Scenario Executor (Phase 1 + Phase 2 + Phase 3)
 *
 * Executes scenario checks by calling atom functions.
 * Handles parameter interpolation and result collection.
 *
 * @author WawApp Development Team
 * @date 2025-12-13
 * @version 3.0 (Phase 3)
 */

import type { ScenarioDefinition } from './scenario-loader.js';
import type { StandardDiagnosticResult } from '../types/standard-output.js';
import {
  driverProfileAudit,
  driverLocationFreshness,
  driverOnlineState,
} from '../kits/kit9-scenario-atoms/driver-atoms.js';
import {
  orderStateAudit,
  matchingRuleTrace,
} from '../kits/kit9-scenario-atoms/order-atoms.js';
import {
  nearbyOrdersQuerySimulator,
  permissionRuleProbe,
} from '../kits/kit9-scenario-atoms/reliability-atoms.js';
import {
  fcmTokenHealth,
  notificationDeliveryAudit,
} from '../kits/kit9-scenario-atoms/notifications-atoms.js';
import {
  functionsInvocationTrace,
} from '../kits/kit9-scenario-atoms/functions-atoms.js';
import {
  firestoreListenerHealth,
} from '../kits/kit9-scenario-atoms/telemetry-atoms.js';

/**
 * Atom registry - maps atom names to functions
 */
const ATOM_REGISTRY: Record<string, Function> = {
  // Phase 1 atoms
  driver_profile_audit: driverProfileAudit,
  driver_location_freshness: driverLocationFreshness,
  driver_online_state: driverOnlineState,
  order_state_audit: orderStateAudit,
  matching_rule_trace: matchingRuleTrace,
  // Phase 2 atoms
  nearby_orders_query_simulator: nearbyOrdersQuerySimulator,
  permission_rule_probe: permissionRuleProbe,
  // Phase 3 atoms
  fcm_token_health: fcmTokenHealth,
  notification_delivery_audit: notificationDeliveryAudit,
  functions_invocation_trace: functionsInvocationTrace,
  firestore_listener_health: firestoreListenerHealth,
};

export interface CheckResult {
  atomName: string;
  atomResult: StandardDiagnosticResult;
  passed: boolean;
}

/**
 * Execute all checks in a scenario
 */
export async function executeScenario(
  scenario: ScenarioDefinition,
  inputs: Record<string, any>,
  mode: 'diagnostic' | 'assert' | 'explain',
  stopOnFirstFailure: boolean
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const check of scenario.checks) {
    const atomFn = ATOM_REGISTRY[check.atom];
    if (!atomFn) {
      throw new Error(
        `Atom "${check.atom}" not found in registry. Available atoms: ${Object.keys(ATOM_REGISTRY).join(', ')}`
      );
    }

    // Interpolate params (replace $inputs.* with actual values)
    const params = interpolateParams(check.params, inputs);

    try {
      // Execute atom
      const atomResult: StandardDiagnosticResult = await atomFn(params);

      // Determine if check passed
      const passed = atomResult.status === 'PASS';

      results.push({
        atomName: check.atom,
        atomResult,
        passed,
      });

      // Stop on first failure if requested
      if (!passed && stopOnFirstFailure) {
        break;
      }
    } catch (error: any) {
      // Atom threw error - treat as failed check
      results.push({
        atomName: check.atom,
        atomResult: {
          status: 'FAIL',
          summary: `Atom execution failed: ${error.message}`,
          blockingReasons: [
            {
              ruleId: 'ATOM_EXECUTION_ERROR',
              severity: 'CRITICAL',
              message: error.message,
            },
          ],
          evidence: [],
          suggestedFixes: [],
          linkedFailures: [],
        },
        passed: false,
      });

      if (stopOnFirstFailure) {
        break;
      }
    }
  }

  return results;
}

/**
 * Interpolate $inputs.* placeholders in params
 */
function interpolateParams(
  params: Record<string, any>,
  inputs: Record<string, any>
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.startsWith('$inputs.')) {
      const inputKey = value.substring('$inputs.'.length);
      result[key] = inputs[inputKey];
    } else {
      result[key] = value;
    }
  }

  return result;
}
