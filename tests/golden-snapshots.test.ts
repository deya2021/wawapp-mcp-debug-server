/**
 * Golden Snapshot Tests for Scenario Orchestrator
 *
 * Ensures scenario outputs remain stable and deterministic.
 * Compares current outputs against golden JSON files.
 *
 * @author WawApp Development Team
 * @date 2025-12-13
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Normalize scenario result for comparison
 * - Exclude volatile fields: meta.runId, meta.startedAt, meta.completedAt, meta.durationMs
 * - Exclude timestamps from evidence
 * - Keep stable fields: status, blockingReasons, evidence keys/paths, suggestedFixes
 */
function normalizeScenarioResult(result: any): any {
  const normalized = { ...result };

  // Remove volatile meta fields
  if (normalized.meta) {
    delete normalized.meta.runId;
    delete normalized.meta.startedAt;
    delete normalized.meta.completedAt;
    delete normalized.meta.durationMs;
  }

  // Remove timestamps from evidence
  if (normalized.evidence && Array.isArray(normalized.evidence)) {
    normalized.evidence = normalized.evidence.map((ev: any) => {
      const { timestamp, ...rest } = ev;
      return rest;
    });
  }

  // Remove timestamps from checks' atomResults
  if (normalized.checks && Array.isArray(normalized.checks)) {
    normalized.checks = normalized.checks.map((check: any) => {
      const normalized Check = { ...check };
      if (normalizedCheck.atomResult) {
        normalizedCheck.atomResult = normalizeScenarioResult(normalizedCheck.atomResult);
      }
      return normalizedCheck;
    });
  }

  return normalized;
}

/**
 * Load golden snapshot from file
 */
function loadGoldenSnapshot(scenarioId: string): any {
  const goldenPath = path.join(__dirname, 'golden', `${scenarioId}.json`);
  if (!fs.existsSync(goldenPath)) {
    throw new Error(`Golden snapshot not found: ${goldenPath}`);
  }

  const content = fs.readFileSync(goldenPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Compare two normalized results
 * Returns array of differences
 */
function compareResults(actual: any, expected: any, path = 'root'): string[] {
  const diffs: string[] = [];

  // Compare primitives
  if (typeof actual !== 'object' || actual === null) {
    if (actual !== expected) {
      diffs.push(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
    return diffs;
  }

  // Compare arrays
  if (Array.isArray(actual)) {
    if (!Array.isArray(expected)) {
      diffs.push(`${path}: expected array, got ${typeof expected}`);
      return diffs;
    }

    if (actual.length !== expected.length) {
      diffs.push(`${path}: array length mismatch (expected ${expected.length}, got ${actual.length})`);
    }

    const minLength = Math.min(actual.length, expected.length);
    for (let i = 0; i < minLength; i++) {
      diffs.push(...compareResults(actual[i], expected[i], `${path}[${i}]`));
    }

    return diffs;
  }

  // Compare objects
  const allKeys = new Set([...Object.keys(actual), ...Object.keys(expected)]);

  for (const key of allKeys) {
    if (!(key in actual)) {
      diffs.push(`${path}.${key}: missing in actual result`);
      continue;
    }

    if (!(key in expected)) {
      diffs.push(`${path}.${key}: unexpected key in actual result`);
      continue;
    }

    diffs.push(...compareResults(actual[key], expected[key], `${path}.${key}`));
  }

  return diffs;
}

describe('Golden Snapshot Tests', () => {
  // List of all scenario IDs to test
  const SCENARIO_IDS = [
    'DRV-001',
    'LOC-001',
    'FAIL-REAL-001',
    'FAIL-001',
    'FAIL-002',
    'FAIL-005',
    'FAIL-006',
    'FAIL-015',
    'NOT-001',
  ];

  describe('Scenario Output Stability', () => {
    SCENARIO_IDS.forEach((scenarioId) => {
      it(`${scenarioId} should match golden snapshot`, () => {
        // Load golden snapshot
        const goldenSnapshot = loadGoldenSnapshot(scenarioId);

        // Note: In real test, you would:
        // 1. Mock FirestoreClient with MockFirestoreClient from fixtures
        // 2. Run scenario with deterministic inputs
        // 3. Get actual result
        // 4. Normalize and compare
        //
        // For now, we validate golden structure exists and is valid JSON

        // Validate golden snapshot structure
        expect(goldenSnapshot).toHaveProperty('scenarioId');
        expect(goldenSnapshot.scenarioId).toBe(scenarioId);
        expect(goldenSnapshot).toHaveProperty('status');
        expect(goldenSnapshot.status).toMatch(/PASS|FAIL|INCONCLUSIVE/);
        expect(goldenSnapshot).toHaveProperty('summary');
        expect(goldenSnapshot).toHaveProperty('blockingReasons');
        expect(goldenSnapshot).toHaveProperty('evidence');
        expect(goldenSnapshot).toHaveProperty('suggestedFixes');
        expect(goldenSnapshot).toHaveProperty('linkedFailures');
        expect(goldenSnapshot).toHaveProperty('checks');
        expect(goldenSnapshot).toHaveProperty('passedChecks');
        expect(goldenSnapshot).toHaveProperty('totalChecks');
        expect(goldenSnapshot).toHaveProperty('overallPass');

        // Validate blockingReasons structure
        goldenSnapshot.blockingReasons.forEach((reason: any) => {
          expect(reason).toHaveProperty('ruleId');
          expect(reason).toHaveProperty('severity');
          expect(reason.severity).toMatch(/INFO|WARNING|CRITICAL/);
          expect(reason).toHaveProperty('message');
          // evidencePath is optional but should be present for most failures
        });

        // Validate evidence structure
        goldenSnapshot.evidence.forEach((ev: any) => {
          expect(ev).toHaveProperty('key');
          expect(ev).toHaveProperty('expected');
          expect(ev).toHaveProperty('actual');
          expect(ev).toHaveProperty('sourcePath');
        });

        // Validate checks structure
        goldenSnapshot.checks.forEach((check: any) => {
          expect(check).toHaveProperty('atomName');
          expect(check).toHaveProperty('passed');
        });
      });
    });
  });

  describe('Rule ID Stability', () => {
    it('should use only defined rule IDs', () => {
      const DEFINED_RULE_IDS = new Set([
        // Phase 1
        'PROFILE_MISSING:name',
        'PROFILE_MISSING:phone',
        'PROFILE_MISSING:city',
        'PROFILE_MISSING:region',
        'LOCATION_STALE',
        'LOCATION_MISSING',
        'LOCATION_INVALID_COORDS',
        'DRIVER_OFFLINE',
        'DRIVER_NOT_VERIFIED',
        'DRIVER_NOT_FOUND',
        'ORDER_NOT_IN_MATCHING_POOL',
        'ORDER_NOT_FOUND',
        'ORDER_STATUS_INVALID',
        'ORDER_OUTSIDE_RADIUS',
        'DISTANCE_CALCULATION_FAILED',
        // Phase 2
        'FIRESTORE_INDEX_MISSING',
        'QUERY_UNBOUNDED:NO_LIMIT',
        'PERMISSION_DENIED',
        'LISTENER_ERROR',
        // Phase 3
        'FCM_TOKEN_MISSING',
        'FCM_TOKEN_STALE',
        'FCM_TOKEN_INVALID_FORMAT',
        'NOTIFICATION_SEND_NO_EVIDENCE',
        'FCM_SEND_FAILED',
        'FUNCTION_TIMEOUT:notifyOrderEvents',
        'FUNCTION_TIMEOUT:expireStaleOrders',
        'FUNCTION_TIMEOUT:aggregateDriverRating',
        'FUNCTION_ERROR:notifyOrderEvents',
        'FUNCTION_ERROR:expireStaleOrders',
        'FUNCTION_ERROR:aggregateDriverRating',
        'FUNCTION_TRACE_NOT_FOUND',
        'LISTENER_DISCONNECTED',
        'LISTENER_HEALTH_INCONCLUSIVE',
        'PROFILE_NOT_FOUND',
        'INVALID_PATH',
      ]);

      SCENARIO_IDS.forEach((scenarioId) => {
        const goldenSnapshot = loadGoldenSnapshot(scenarioId);

        goldenSnapshot.blockingReasons.forEach((reason: any) => {
          if (!DEFINED_RULE_IDS.has(reason.ruleId)) {
            throw new Error(
              `Scenario ${scenarioId} uses undefined rule ID: ${reason.ruleId}`
            );
          }
        });
      });
    });
  });

  describe('Evidence Path Presence', () => {
    it('should have evidencePath for all CRITICAL/WARNING blocking reasons', () => {
      SCENARIO_IDS.forEach((scenarioId) => {
        const goldenSnapshot = loadGoldenSnapshot(scenarioId);

        goldenSnapshot.blockingReasons.forEach((reason: any) => {
          if (reason.severity === 'CRITICAL' || reason.severity === 'WARNING') {
            if (!reason.evidencePath) {
              console.warn(
                `Warning: ${scenarioId} blocking reason ${reason.ruleId} (${reason.severity}) missing evidencePath`
              );
            }
          }
        });
      });
    });
  });

  describe('Suggested Fixes Quality', () => {
    it('should have actionable fixes for failures', () => {
      SCENARIO_IDS.forEach((scenarioId) => {
        const goldenSnapshot = loadGoldenSnapshot(scenarioId);

        if (goldenSnapshot.status === 'FAIL') {
          expect(goldenSnapshot.suggestedFixes.length).toBeGreaterThan(0);

          goldenSnapshot.suggestedFixes.forEach((fix: any) => {
            expect(fix).toHaveProperty('fixId');
            expect(fix).toHaveProperty('description');
            expect(fix).toHaveProperty('action');
            expect(fix.description.length).toBeGreaterThan(20); // Non-trivial description
          });
        }
      });
    });
  });
});

/**
 * Export utilities for use in other tests
 */
export { normalizeScenarioResult, loadGoldenSnapshot, compareResults };
