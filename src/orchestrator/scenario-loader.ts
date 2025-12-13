/**
 * Scenario Loader (Phase 1 MVP)
 *
 * Loads scenario definitions from YAML registry.
 * Parses and validates scenario structure.
 *
 * @author WawApp Development Team
 * @date 2025-12-13
 * @version 2.0 (Phase 1)
 */

import { readFile } from 'fs/promises';
import { parse as parseYAML } from 'yaml';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ScenarioDefinition {
  scenarioId: string;
  category: string;
  title: string;
  description?: string;
  inputs: Record<
    string,
    { type: string; required: boolean; description?: string }
  >;
  checks: Array<{
    atom: string;
    params: Record<string, any>;
    successCriteria?: string[];
  }>;
  successMarkers?: string[];
  failureMappings?: Record<string, string>;
}

/**
 * Load scenario from YAML file in specs/scenarios/ directory
 */
export async function loadScenario(
  scenarioId: string
): Promise<ScenarioDefinition> {
  // specs/scenarios/ is at project root, two levels up from dist/orchestrator/
  const SCENARIOS_DIR = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'specs',
    'scenarios'
  );

  const filename = `${scenarioId}.yaml`;
  const filepath = path.join(SCENARIOS_DIR, filename);

  try {
    const content = await readFile(filepath, 'utf-8');
    const scenario = parseYAML(content) as ScenarioDefinition;

    // Validate schema
    if (!scenario.scenarioId) {
      throw new Error('Missing required field: scenarioId');
    }
    if (!scenario.checks || scenario.checks.length === 0) {
      throw new Error('Missing or empty checks array');
    }

    return scenario;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `Scenario ${scenarioId} not found in registry (${filepath})`
      );
    }
    throw new Error(`Failed to load scenario ${scenarioId}: ${error.message}`);
  }
}
