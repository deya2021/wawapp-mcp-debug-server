/**
 * Scenario Orchestrator (Phase 1 MVP)
 *
 * Main entry point for scenario execution.
 * Tool: wawapp_scenario_run
 *
 * @author WawApp Development Team
 * @date 2025-12-13
 * @version 2.0 (Phase 1)
 */

import { z } from 'zod';
import { loadScenario } from './scenario-loader.js';
import { executeScenario } from './scenario-executor.js';
import { buildVerdict } from './verdict-builder.js';
import type { ScenarioResult } from '../types/standard-output.js';

const InputSchema = z.object({
  scenarioId: z
    .string()
    .regex(
      /^(DRV|ORD|LOC|PAY|NOT|SUP|SAF|EDG|ADM|FAIL)-[0-9]{3}$|^FAIL-REAL-[0-9]{3}$/
    ),
  inputs: z.record(z.any()),
  mode: z.enum(['diagnostic', 'assert', 'explain']).default('diagnostic'),
  stopOnFirstFailure: z.boolean().default(false),
});

/**
 * Execute a scenario from the registry
 */
export async function scenarioRun(params: unknown): Promise<ScenarioResult> {
  const input = InputSchema.parse(params);
  const startTime = new Date();

  try {
    // 1. Load scenario definition from YAML registry
    const scenario = await loadScenario(input.scenarioId);

    // 2. Validate inputs against scenario requirements
    validateInputs(scenario, input.inputs);

    // 3. Execute scenario (run all atom checks)
    const checkResults = await executeScenario(
      scenario,
      input.inputs,
      input.mode,
      input.stopOnFirstFailure
    );

    // 4. Build verdict (merge results, determine overall status)
    const verdict = buildVerdict(
      scenario,
      checkResults,
      input.inputs,
      input.mode,
      startTime
    );

    return verdict;
  } catch (error: any) {
    throw new Error(`[wawapp_scenario_run] ${error.message}`);
  }
}

/**
 * Validate that required inputs are provided
 */
function validateInputs(
  scenario: any,
  inputs: Record<string, any>
): void {
  for (const [key, def] of Object.entries(scenario.inputs || {})) {
    const inputDef = def as any;
    if (inputDef.required && !inputs[key]) {
      throw new Error(
        `Required input "${key}" not provided for scenario ${scenario.scenarioId}`
      );
    }
  }
}

/**
 * MCP tool schema
 */
export const scenarioRunSchema = {
  name: 'wawapp_scenario_run',
  description:
    'Execute an end-to-end scenario by running a sequence of atom diagnostics and producing a unified verdict. ' +
    'Phase 1 supports order visibility diagnosis (FAIL-REAL-001), driver onboarding (DRV-001), and location validation (LOC-001). ' +
    'Modes: "diagnostic" (default, full report), "assert" (pass/fail only), "explain" (verbose with all evidence). ' +
    'Returns standardized output with rule IDs, Firestore evidence paths, suggested fixes, and linked failure scenarios.',
  inputSchema: {
    type: 'object',
    properties: {
      scenarioId: {
        type: 'string',
        description:
          'Scenario ID (e.g., FAIL-REAL-001, DRV-001, LOC-001). Must match a YAML file in specs/scenarios/',
        pattern:
          '^(DRV|ORD|LOC|PAY|NOT|SUP|SAF|EDG|ADM|FAIL)-[0-9]{3}$|^FAIL-REAL-[0-9]{3}$',
      },
      inputs: {
        type: 'object',
        description:
          'Inputs required by the scenario (e.g., { driverId: "abc123", orderId: "xyz789" })',
      },
      mode: {
        type: 'string',
        enum: ['diagnostic', 'assert', 'explain'],
        default: 'diagnostic',
        description:
          'Execution mode: "diagnostic" (full report, default), "assert" (pass/fail only), "explain" (verbose with all evidence)',
      },
      stopOnFirstFailure: {
        type: 'boolean',
        default: false,
        description:
          'Stop execution on first failed check (default: false, run all checks)',
      },
    },
    required: ['scenarioId', 'inputs'],
  },
};
