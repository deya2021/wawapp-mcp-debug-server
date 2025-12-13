/**
 * Verdict Builder (Phase 1 MVP)
 *
 * Aggregates check results into final scenario verdict.
 * Merges blocking reasons, evidence, fixes, and failures.
 *
 * @author WawApp Development Team
 * @date 2025-12-13
 * @version 2.0 (Phase 1)
 */

import type { ScenarioDefinition } from './scenario-loader.js';
import type { CheckResult } from './scenario-executor.js';
import type { ScenarioResult } from '../types/standard-output.js';

/**
 * Build final verdict from check results
 */
export function buildVerdict(
  scenario: ScenarioDefinition,
  checkResults: CheckResult[],
  inputs: Record<string, any>,
  mode: 'diagnostic' | 'assert' | 'explain',
  startTime: Date
): ScenarioResult {
  const passedChecks = checkResults.filter((r) => r.passed).length;
  const totalChecks = checkResults.length;
  const overallPass = passedChecks === totalChecks;

  // Aggregate blocking reasons, evidence, fixes, failures
  const blockingReasons: any[] = [];
  const evidence: any[] = [];
  const suggestedFixes: any[] = [];
  const linkedFailures: any[] = [];

  for (const checkResult of checkResults) {
    blockingReasons.push(...checkResult.atomResult.blockingReasons);
    evidence.push(...checkResult.atomResult.evidence);
    suggestedFixes.push(...checkResult.atomResult.suggestedFixes);
    linkedFailures.push(...checkResult.atomResult.linkedFailures);
  }

  // Deduplicate linked failures by failureId
  const uniqueFailures = Array.from(
    new Map(linkedFailures.map((f) => [f.failureId, f])).values()
  );

  // Build summary
  const summary = overallPass
    ? `Scenario ${scenario.scenarioId} PASSED: All ${totalChecks} checks successful`
    : `Scenario ${scenario.scenarioId} FAILED: ${totalChecks - passedChecks} of ${totalChecks} checks failed`;

  const endTime = new Date();
  const runId = `scenario-${scenario.scenarioId}-${Date.now()}`;

  return {
    scenarioId: scenario.scenarioId,
    scenarioTitle: scenario.title,
    inputs,
    mode,
    status: overallPass ? 'PASS' : 'FAIL',
    summary,
    blockingReasons,
    evidence: mode === 'explain' ? evidence : [], // Only include in explain mode
    suggestedFixes,
    linkedFailures: uniqueFailures,
    checks: checkResults,
    passedChecks,
    totalChecks,
    overallPass,
    meta: {
      toolName: 'wawapp_scenario_run',
      toolVersion: '2.0',
      runId,
      startedAt: startTime.toISOString(),
      completedAt: endTime.toISOString(),
      durationMs: endTime.getTime() - startTime.getTime(),
    },
  };
}
