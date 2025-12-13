/**
 * Standard Output Schema (Phase 1 MVP)
 *
 * Defines standardized diagnostic result format for all scenario atoms and orchestrator.
 * All diagnostic tools must return this schema for consistency.
 *
 * @author WawApp Development Team
 * @date 2025-12-13
 * @version 2.0 (Phase 1)
 */

export type DiagnosticStatus = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';

/**
 * Blocking reason - why a check failed
 */
export interface BlockingReason {
  ruleId: string;           // e.g., "PROFILE_MISSING:name"
  severity: Severity;
  message: string;          // Human-readable description
  evidencePath?: string;    // Firestore path, e.g., "/drivers/abc123"
  field?: string;           // Specific field, e.g., "name"
}

/**
 * Evidence - what was checked and what was found
 */
export interface Evidence {
  key: string;              // e.g., "driver.isVerified"
  expected: any;            // e.g., true
  actual: any;              // e.g., false
  sourcePath: string;       // Firestore path: "/drivers/abc123"
  field?: string;           // Field name in document
  timestamp?: string;       // When evidence was collected (ISO 8601)
}

/**
 * Suggested fix - actionable remediation
 */
export interface SuggestedFix {
  fixId: string;            // e.g., "FIX_PROFILE_001"
  description: string;      // e.g., "Set isVerified=true in /drivers/abc123"
  targetPath?: string;      // Firestore path to fix
  field?: string;           // Field to update
  value?: any;              // Suggested value
  action?: 'SET' | 'DELETE' | 'CREATE' | 'MANUAL';
}

/**
 * Linked failure scenario
 */
export interface LinkedFailure {
  failureId: string;        // e.g., "FAIL-005"
  title: string;            // e.g., "Driver profile incomplete"
  likelihood: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * Execution metadata
 */
export interface DiagnosticMeta {
  toolName: string;
  toolVersion: string;
  runId: string;            // UUID for this execution
  startedAt: string;        // ISO 8601
  completedAt: string;      // ISO 8601
  durationMs: number;
}

/**
 * Standard diagnostic result (used by all atoms and orchestrator)
 */
export interface StandardDiagnosticResult {
  status: DiagnosticStatus;
  summary: string;                   // Human-readable summary for AI/user
  blockingReasons: BlockingReason[];
  evidence: Evidence[];
  suggestedFixes: SuggestedFix[];
  linkedFailures: LinkedFailure[];
  meta?: DiagnosticMeta;

  // Optional: preserve legacy output for backward compatibility
  _legacy?: any;
}

/**
 * Scenario execution result (orchestrator output)
 */
export interface ScenarioResult extends StandardDiagnosticResult {
  scenarioId: string;
  scenarioTitle: string;
  inputs: Record<string, any>;
  mode: 'diagnostic' | 'assert' | 'explain';

  // Per-check results
  checks: Array<{
    atomName: string;
    atomResult: StandardDiagnosticResult;
    passed: boolean;
  }>;

  // Aggregated
  passedChecks: number;
  totalChecks: number;
  overallPass: boolean;
}
