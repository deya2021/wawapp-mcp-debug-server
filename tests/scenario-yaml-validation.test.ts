/**
 * Scenario YAML Validation Tests
 *
 * Validates all scenario YAMLs for correct schema and references.
 * Fails fast with clear error messages.
 *
 * @author WawApp Development Team
 * @date 2025-12-13
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

const SCENARIOS_DIR = path.join(__dirname, '..', 'specs', 'scenarios');

/**
 * Valid atom names (from orchestrator registry)
 */
const VALID_ATOM_NAMES = new Set([
  // Phase 1
  'driver_profile_audit',
  'driver_location_freshness',
  'driver_online_state',
  'order_state_audit',
  'matching_rule_trace',
  // Phase 2
  'nearby_orders_query_simulator',
  'permission_rule_probe',
  // Phase 3
  'fcm_token_health',
  'notification_delivery_audit',
  'functions_invocation_trace',
  'firestore_listener_health',
]);

/**
 * Valid scenario categories
 */
const VALID_CATEGORIES = new Set([
  'FAILURE',
  'DRIVER',
  'LOCATION',
  'ORDER',
  'NOTIFICATION',
  'FUNCTION',
  'TELEMETRY',
]);

/**
 * Valid rule IDs (must match rule-definitions.ts)
 */
const VALID_RULE_IDS = new Set([
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

/**
 * Load all scenario YAML files
 */
function loadAllScenarios(): Array<{ filename: string; scenario: any }> {
  const files = fs.readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith('.yaml'));

  return files.map((filename) => {
    const filepath = path.join(SCENARIOS_DIR, filename);
    const content = fs.readFileSync(filepath, 'utf-8');
    const scenario = yaml.parse(content);

    return { filename, scenario };
  });
}

/**
 * Validate scenario schema
 */
function validateScenarioSchema(
  filename: string,
  scenario: any
): Array<string> {
  const errors: string[] = [];

  // Required fields
  if (!scenario.scenarioId) {
    errors.push(`${filename}: missing required field 'scenarioId'`);
  }

  if (!scenario.category) {
    errors.push(`${filename}: missing required field 'category'`);
  } else if (!VALID_CATEGORIES.has(scenario.category)) {
    errors.push(
      `${filename}: invalid category '${scenario.category}'. Must be one of: ${Array.from(VALID_CATEGORIES).join(', ')}`
    );
  }

  if (!scenario.title) {
    errors.push(`${filename}: missing required field 'title'`);
  }

  if (!scenario.description) {
    errors.push(`${filename}: missing required field 'description'`);
  }

  if (!scenario.inputs) {
    errors.push(`${filename}: missing required field 'inputs'`);
  } else {
    // Validate inputs
    for (const [inputName, inputDef] of Object.entries(scenario.inputs)) {
      const def = inputDef as any;

      if (!def.type) {
        errors.push(`${filename}: input '${inputName}' missing 'type' field`);
      } else if (!['string', 'number', 'boolean'].includes(def.type)) {
        errors.push(
          `${filename}: input '${inputName}' has invalid type '${def.type}'. Must be string, number, or boolean`
        );
      }

      if (def.required === undefined) {
        errors.push(`${filename}: input '${inputName}' missing 'required' field`);
      }
    }
  }

  if (!scenario.checks) {
    errors.push(`${filename}: missing required field 'checks'`);
  } else if (!Array.isArray(scenario.checks)) {
    errors.push(`${filename}: 'checks' must be an array`);
  } else if (scenario.checks.length === 0) {
    errors.push(`${filename}: 'checks' array is empty`);
  } else {
    // Validate checks
    scenario.checks.forEach((check: any, index: number) => {
      if (!check.atom) {
        errors.push(`${filename}: check[${index}] missing 'atom' field`);
      } else if (!VALID_ATOM_NAMES.has(check.atom)) {
        errors.push(
          `${filename}: check[${index}] uses unknown atom '${check.atom}'. Valid atoms: ${Array.from(VALID_ATOM_NAMES).join(', ')}`
        );
      }

      if (!check.params) {
        errors.push(`${filename}: check[${index}] missing 'params' field`);
      }
    });
  }

  if (!scenario.failureMappings) {
    errors.push(`${filename}: missing required field 'failureMappings'`);
  } else {
    // Validate failure mappings
    for (const [ruleId, failureId] of Object.entries(scenario.failureMappings)) {
      if (!VALID_RULE_IDS.has(ruleId)) {
        errors.push(
          `${filename}: failureMappings uses unknown rule ID '${ruleId}'`
        );
      }

      if (typeof failureId !== 'string' || !failureId.startsWith('FAIL-')) {
        errors.push(
          `${filename}: failureMappings['${ruleId}'] has invalid failure ID '${failureId}'. Must start with 'FAIL-'`
        );
      }
    }
  }

  return errors;
}

describe('Scenario YAML Validation', () => {
  const scenarios = loadAllScenarios();

  it('should load all scenario YAML files', () => {
    expect(scenarios.length).toBeGreaterThan(0);
    console.log(`Loaded ${scenarios.length} scenario files`);
  });

  it('should have valid scenario IDs matching filenames', () => {
    scenarios.forEach(({ filename, scenario }) => {
      const expectedId = filename.replace('.yaml', '');
      expect(scenario.scenarioId).toBe(expectedId);
    });
  });

  describe('Schema Validation', () => {
    scenarios.forEach(({ filename, scenario }) => {
      it(`${filename} should have valid schema`, () => {
        const errors = validateScenarioSchema(filename, scenario);

        if (errors.length > 0) {
          throw new Error(
            `Scenario ${filename} has validation errors:\n${errors.join('\n')}`
          );
        }
      });
    });
  });

  describe('Atom References', () => {
    it('should only reference registered atoms', () => {
      const invalidReferences: string[] = [];

      scenarios.forEach(({ filename, scenario }) => {
        if (scenario.checks && Array.isArray(scenario.checks)) {
          scenario.checks.forEach((check: any, index: number) => {
            if (check.atom && !VALID_ATOM_NAMES.has(check.atom)) {
              invalidReferences.push(
                `${filename}: check[${index}] references unknown atom '${check.atom}'`
              );
            }
          });
        }
      });

      if (invalidReferences.length > 0) {
        throw new Error(
          `Found invalid atom references:\n${invalidReferences.join('\n')}`
        );
      }
    });
  });

  describe('Rule ID References', () => {
    it('should only reference defined rule IDs', () => {
      const invalidReferences: string[] = [];

      scenarios.forEach(({ filename, scenario }) => {
        if (scenario.failureMappings) {
          for (const ruleId of Object.keys(scenario.failureMappings)) {
            if (!VALID_RULE_IDS.has(ruleId)) {
              invalidReferences.push(
                `${filename}: references undefined rule ID '${ruleId}'`
              );
            }
          }
        }
      });

      if (invalidReferences.length > 0) {
        throw new Error(
          `Found invalid rule ID references:\n${invalidReferences.join('\n')}\n\nValid rule IDs:\n${Array.from(VALID_RULE_IDS).sort().join('\n')}`
        );
      }
    });
  });

  describe('Parameter Interpolation', () => {
    it('should reference valid input parameters', () => {
      const invalidReferences: string[] = [];

      scenarios.forEach(({ filename, scenario }) => {
        if (scenario.checks && Array.isArray(scenario.checks)) {
          scenario.checks.forEach((check: any, index: number) => {
            if (check.params) {
              for (const [key, value] of Object.entries(check.params)) {
                if (typeof value === 'string' && value.startsWith('$inputs.')) {
                  const inputName = value.substring('$inputs.'.length);

                  if (!scenario.inputs || !(inputName in scenario.inputs)) {
                    invalidReferences.push(
                      `${filename}: check[${index}].params.${key} references undefined input '${inputName}'`
                    );
                  }
                }
              }
            }
          });
        }
      });

      if (invalidReferences.length > 0) {
        throw new Error(
          `Found invalid input references:\n${invalidReferences.join('\n')}`
        );
      }
    });
  });

  describe('Completeness', () => {
    it('should have success markers defined', () => {
      scenarios.forEach(({ filename, scenario }) => {
        if (!scenario.successMarkers || scenario.successMarkers.length === 0) {
          console.warn(`Warning: ${filename} has no success markers defined`);
        }
      });
    });

    it('should have failure mappings for common rules', () => {
      scenarios.forEach(({ filename, scenario }) => {
        const category = scenario.category;

        // Each category should map certain rules
        if (category === 'DRIVER') {
          if (!scenario.failureMappings['DRIVER_OFFLINE'] &&
              !scenario.failureMappings['DRIVER_NOT_FOUND']) {
            console.warn(
              `Warning: ${filename} (category DRIVER) has no mappings for DRIVER_OFFLINE or DRIVER_NOT_FOUND`
            );
          }
        }

        if (category === 'LOCATION') {
          if (!scenario.failureMappings['LOCATION_STALE'] &&
              !scenario.failureMappings['LOCATION_MISSING']) {
            console.warn(
              `Warning: ${filename} (category LOCATION) has no mappings for location rules`
            );
          }
        }
      });
    });
  });
});
