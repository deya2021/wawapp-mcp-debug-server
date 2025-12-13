# WawApp MCP Server — Scenario Orchestrator Architecture
**Evolution Plan for Comprehensive E2E Scenario Testing & Diagnostics**

**Date**: 2025-12-13
**Version**: 2.0
**Status**: Architecture Design & Implementation Plan

---

## Table of Contents

1. [Repo Inspection Summary](#1-repo-inspection-summary)
2. [Architecture Evolution Plan](#2-architecture-evolution-plan)
3. [Standard Output Schema](#3-standard-output-schema)
4. [Scenario Registry + Orchestrator](#4-scenario-registry--orchestrator)
5. [Atom Tools Design](#5-atom-tools-design)
6. [Rule ID Taxonomy](#6-rule-id-taxonomy)
7. [Updated Order Visibility Tool](#7-updated-order-visibility-tool)
8. [Coverage Mapping](#8-coverage-mapping)
9. [Implementation Plan](#9-implementation-plan)

---

## 1. Repo Inspection Summary

### Current Structure

```
wawapp-mcp-debug-server/
├── src/
│   ├── config/                 # Environment & collection mappings
│   │   ├── collection-mapping.ts
│   │   ├── constants.ts        # Production-matching constants
│   │   └── environment.ts
│   ├── data-access/            # Firebase/Firestore/CloudLogging clients
│   │   ├── firebase-admin.ts
│   │   ├── firestore-client.ts # Singleton client with query helpers
│   │   └── cloud-logging-client.ts
│   ├── security/               # Rate limiting, PII masking, audit
│   ├── kits/                   # 8 kits with 33 tools
│   │   ├── kit1-order-lifecycle/     (4 tools)
│   │   ├── kit2-driver-matching/     (5 tools) ⭐ CRITICAL
│   │   ├── kit3-data-quality/        (3 tools)
│   │   ├── kit4-location-intelligence/ (3 tools)
│   │   ├── kit5-notifications/       (4 tools)
│   │   ├── kit6-cloud-functions/     (3 tools)
│   │   ├── kit7-system-health/       (5 tools incl. incident-report)
│   │   └── kit8-auth-app-flow/       (6 tools)
│   ├── utils/                  # Haversine, time helpers, error handlers
│   └── index.ts                # Entry point
├── config/                     # Service accounts, environments.json
├── context/                    # AI agent context files
└── logs/                       # Audit logs
```

**Total**: 63 TypeScript files, 33 production-ready tools, 8 kits

### Existing Tools - Mapping to New Requirements

| **Existing Tool** | **Maps To Atom** | **Keep/Refactor** |
|-------------------|------------------|-------------------|
| `wawapp_driver_eligibility` | `driver_eligibility()` | ✅ Keep - already returns structured checks |
| `wawapp_driver_location_status` | `driver_location_freshness()` | ✅ Keep - rename/adapter |
| `wawapp_order_visibility` | Use as blueprint | 🔄 Refactor to use atoms + rule IDs |
| `wawapp_order_trace` | `order_state_audit()` | ✅ Keep - add rule ID evidence |
| `wawapp_nearby_drivers` | `nearby_orders_query_simulator()` | ✅ Keep - bidirectional query |
| `wawapp_fcm_token_status` | `fcm_token_health()` | ✅ Keep as-is |
| `wawapp_function_execution_trace` | `functions_invocation_trace()` | ✅ Keep - add correlation ID filtering |
| `wawapp_incident_report` | Meta-orchestrator blueprint | ✅ Keep - shows aggregation pattern |
| `wawapp_data_audit` | Reuse for consistency checks | ✅ Keep - enhance with rule IDs |

### Key Conventions to Preserve

1. **Tool Naming**: `wawapp_<noun>_<verb>` (e.g., `wawapp_driver_eligibility`)
2. **Input Schema**: Zod schemas with `.parse()` validation
3. **Output Pattern**:
   ```typescript
   {
     summary: string,        // Human-readable for AI
     data: {...},            // Structured machine-readable
     recommendations: string[],
     debug?: {...}           // Optional deep diagnostics
   }
   ```
4. **Firestore Client**: `FirestoreClient.getInstance()` singleton
5. **PII Masking**: Automatic via `maskDocument()` from security layer
6. **Constants**: Defined in `config/constants.ts` matching production Flutter/Dart values

### What Already Works Well

✅ **Firestore abstraction**: `getDocument()`, `queryDocuments()` with filters/ordering
✅ **Timestamp handling**: `timestampToDate()` utility
✅ **Haversine distance**: `calculateDistance()` for geo queries
✅ **Time helpers**: `getAge()` for human-readable freshness
✅ **Error propagation**: Tools throw errors with `[tool-name]` prefix
✅ **Collection mapping**: Logical names → actual collection paths
✅ **Security layer**: Rate limiting + PII masking already enforced

---

## 2. Architecture Evolution Plan

### 2.1 What to KEEP (No Changes)

1. **All 33 existing tools** - they become building blocks for scenarios
2. **Firestore/Firebase clients** - battle-tested, working perfectly
3. **Security layer** - rate limiting, PII masking, audit logs
4. **Tool naming convention** - `wawapp_*`
5. **Zod input validation** - clean, type-safe
6. **Kit structure** - organized by domain
7. **Constants file** - single source of truth matching production

### 2.2 What to REFACTOR (Incremental Changes)

#### A. Output Schema Standardization
**Why**: Current tools return ad-hoc schemas. Need consistency for orchestrator.

**How**:
- Create `src/types/standard-output.ts` with base types
- Wrap existing tool outputs with adapter functions
- Preserve backward compatibility (tools still work standalone)

#### B. Add Evidence Tracking
**Why**: Need Firestore document paths for debugging

**How**:
- Add `evidencePath` fields to existing check objects
- Example: `{ pass: false, reason: "...", evidencePath: "/drivers/abc123" }`
- Non-breaking: optional field

#### C. Rule ID System
**Why**: Need stable identifiers for failures, not free-form text

**How**:
- Create `src/rules/rule-definitions.ts` with taxonomy
- Retrofit existing tools to emit rule IDs alongside reasons
- Example: `{ ruleId: "LOCATION_STALE", severity: "CRITICAL", ... }`

### 2.3 What to ADD (New Components)

#### A. Scenario Registry (`specs/scenarios/`)
```
specs/
├── scenarios/
│   ├── _schema.yaml              # JSON schema for scenario definitions
│   ├── DRV-001-go-online.yaml
│   ├── ORD-001-happy-path.yaml
│   ├── PAY-001-settlement.yaml
│   ├── LOC-001-location-updates.yaml
│   └── FAIL-001-to-FAIL-030.yaml files
└── README.md
```

**Format** (YAML):
```yaml
scenarioId: DRV-001
category: DRIVER
title: "Driver goes online and receives first order"
inputs:
  driverId: string (required)
  orderId: string (optional, for validation)
checks:
  - atom: driver_profile_audit
    params: { driverId: "$inputs.driverId" }
    successCriteria:
      - ruleId: PROFILE_COMPLETE
      - ruleId: DRIVER_VERIFIED
  - atom: driver_location_freshness
    params: { driverId: "$inputs.driverId", maxAgeMinutes: 5 }
    successCriteria:
      - ruleId: LOCATION_FRESH
  - atom: driver_online_state
    params: { driverId: "$inputs.driverId" }
    successCriteria:
      - ruleId: DRIVER_ONLINE
successMarkers:
  - "All checks passed"
  - "Driver can receive nearby orders"
failureMappings:
  PROFILE_MISSING:name: FAIL-005
  LOCATION_STALE: FAIL-008
  DRIVER_OFFLINE: FAIL-012
```

#### B. Orchestrator Tool (`src/orchestrator/`)
```
src/orchestrator/
├── scenario-loader.ts         # Load YAML scenarios
├── scenario-executor.ts       # Execute atom sequence
├── verdict-builder.ts         # Merge atom results → standard verdict
├── index.ts                   # wawapp_scenario_run tool
└── types.ts                   # Orchestrator-specific types
```

#### C. Atom Tools (New Kit 9)
```
src/kits/kit9-scenario-atoms/
├── driver-atoms.ts            # driver_profile_audit, driver_location_freshness, etc.
├── order-atoms.ts             # order_state_audit, matching_rule_trace, etc.
├── payment-atoms.ts           # settlement_audit, wallet_integrity_audit
├── notification-atoms.ts      # fcm_token_health (wrapper)
├── reliability-atoms.ts       # functions_invocation_trace (enhanced)
├── index.ts                   # Exports + schemas
└── README.md
```

**Note**: Many atoms are thin wrappers around existing tools, adding rule ID emission.

#### D. Rule Definitions (`src/rules/`)
```
src/rules/
├── rule-definitions.ts        # Taxonomy of all rule IDs
├── severity-mapping.ts        # Rule ID → severity
├── fix-suggestions.ts         # Rule ID → suggested fix templates
└── index.ts
```

### 2.4 What to DEPRECATE/DELETE

**None**. We keep everything for backward compatibility. Old tools continue working.

**Migration Path**:
1. Existing tools stay in kits 1-8
2. New atoms in kit 9 may wrap or delegate to kit 1-8 tools
3. Orchestrator composes atoms
4. Users can still call old tools directly OR use orchestrator

---

## 3. Standard Output Schema

### 3.1 TypeScript Types (`src/types/standard-output.ts`)

```typescript
/**
 * Standard output schema for all diagnostic tools (atoms and orchestrators)
 */

export type DiagnosticStatus = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface BlockingReason {
  ruleId: string;           // e.g., "PROFILE_MISSING:name"
  severity: Severity;
  message: string;          // Human-readable description
  evidencePath?: string;    // Firestore path, e.g., "/drivers/abc123"
  field?: string;           // Specific field, e.g., "name"
}

export interface Evidence {
  key: string;              // e.g., "driver.isVerified"
  expected: any;            // e.g., true
  actual: any;              // e.g., false
  sourcePath: string;       // Firestore path: "/drivers/abc123"
  field?: string;           // Field name in document
  timestamp?: string;       // When evidence was collected (ISO 8601)
}

export interface SuggestedFix {
  fixId: string;            // e.g., "FIX_PROFILE_001"
  description: string;      // e.g., "Set isVerified=true in /drivers/abc123"
  targetPath?: string;      // Firestore path to fix
  field?: string;           // Field to update
  value?: any;              // Suggested value
  action?: 'SET' | 'DELETE' | 'CREATE' | 'MANUAL';
}

export interface LinkedFailure {
  failureId: string;        // e.g., "FAIL-005"
  title: string;            // e.g., "Driver profile incomplete"
  likelihood: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface DiagnosticMeta {
  toolName: string;
  toolVersion: string;
  runId: string;            // UUID for this execution
  startedAt: string;        // ISO 8601
  completedAt: string;      // ISO 8601
  durationMs: number;
}

/**
 * Standard diagnostic result
 */
export interface StandardDiagnosticResult {
  status: DiagnosticStatus;
  summary: string;                   // Human-readable summary for AI/user
  blockingReasons: BlockingReason[];
  evidence: Evidence[];
  suggestedFixes: SuggestedFix[];
  linkedFailures: LinkedFailure[];
  meta?: DiagnosticMeta;

  // Optional: legacy compatibility
  _legacy?: any;                     // Preserve old tool output for backward compat
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
```

### 3.2 Builder Utility

```typescript
// src/utils/result-builder.ts

export class DiagnosticResultBuilder {
  private result: Partial<StandardDiagnosticResult> = {
    blockingReasons: [],
    evidence: [],
    suggestedFixes: [],
    linkedFailures: [],
  };

  constructor(private toolName: string, private toolVersion: string = '2.0') {}

  setStatus(status: DiagnosticStatus): this {
    this.result.status = status;
    return this;
  }

  setSummary(summary: string): this {
    this.result.summary = summary;
    return this;
  }

  addBlockingReason(reason: BlockingReason): this {
    this.result.blockingReasons!.push(reason);
    return this;
  }

  addEvidence(evidence: Evidence): this {
    this.result.evidence!.push(evidence);
    return this;
  }

  addSuggestedFix(fix: SuggestedFix): this {
    this.result.suggestedFixes!.push(fix);
    return this;
  }

  linkFailure(failureId: string, title: string, likelihood: 'LOW' | 'MEDIUM' | 'HIGH'): this {
    this.result.linkedFailures!.push({ failureId, title, likelihood });
    return this;
  }

  build(startTime: Date): StandardDiagnosticResult {
    const endTime = new Date();
    const runId = `${this.toolName}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    return {
      status: this.result.status || 'INCONCLUSIVE',
      summary: this.result.summary || 'No summary provided',
      blockingReasons: this.result.blockingReasons || [],
      evidence: this.result.evidence || [],
      suggestedFixes: this.result.suggestedFixes || [],
      linkedFailures: this.result.linkedFailures || [],
      meta: {
        toolName: this.toolName,
        toolVersion: this.toolVersion,
        runId,
        startedAt: startTime.toISOString(),
        completedAt: endTime.toISOString(),
        durationMs: endTime.getTime() - startTime.getTime(),
      },
    };
  }
}
```

---

## 4. Scenario Registry + Orchestrator

### 4.1 Scenario Registry Format

**File**: `specs/scenarios/_schema.yaml`

```yaml
# JSON Schema for scenario definitions
$schema: "http://json-schema.org/draft-07/schema#"
type: object
required: [scenarioId, category, title, checks]
properties:
  scenarioId:
    type: string
    pattern: "^(DRV|ORD|LOC|PAY|NOT|SUP|SAF|EDG|ADM|FAIL)-[0-9]{3}$"
  category:
    type: string
    enum: [AUTH, DRIVER, ORDER, LOCATION, PAYMENT, NOTIFICATION, SUPPORT, SAFETY, EDGE, ADMIN, FAILURE]
  title:
    type: string
  description:
    type: string
  inputs:
    type: object
    additionalProperties:
      type: object
      properties:
        type: { type: string }
        required: { type: boolean }
        description: { type: string }
  checks:
    type: array
    items:
      type: object
      required: [atom, params]
      properties:
        atom: { type: string }
        params: { type: object }
        successCriteria:
          type: array
          items:
            anyOf:
              - type: object
                properties:
                  ruleId: { type: string }
              - type: string  # Simple ruleId string
  successMarkers:
    type: array
    items: { type: string }
  failureMappings:
    type: object
    additionalProperties: { type: string, pattern: "^FAIL-[0-9]{3}$" }
```

### 4.2 Example Scenario: DRV-001

**File**: `specs/scenarios/DRV-001-go-online.yaml`

```yaml
scenarioId: DRV-001
category: DRIVER
title: "Driver goes online and receives first order"
description: |
  Validates that a driver can successfully go online and is eligible to receive
  nearby orders. Checks profile completeness, verification status, online state,
  and location freshness.

inputs:
  driverId:
    type: string
    required: true
    description: "Driver UID from Firebase Auth"
  validateOrderId:
    type: string
    required: false
    description: "Optional order ID to validate visibility"

checks:
  - atom: driver_profile_audit
    params:
      driverId: "$inputs.driverId"
    successCriteria:
      - ruleId: PROFILE_COMPLETE
      - ruleId: DRIVER_VERIFIED

  - atom: driver_location_freshness
    params:
      driverId: "$inputs.driverId"
      maxAgeMinutes: 5
    successCriteria:
      - LOCATION_FRESH

  - atom: driver_online_state
    params:
      driverId: "$inputs.driverId"
    successCriteria:
      - DRIVER_ONLINE

  - atom: driver_eligibility
    params:
      driverId: "$inputs.driverId"
    successCriteria:
      - DRIVER_ELIGIBLE

successMarkers:
  - "All checks passed"
  - "Driver is eligible to receive nearby orders"

failureMappings:
  PROFILE_MISSING:name: FAIL-005
  PROFILE_MISSING:phone: FAIL-006
  LOCATION_STALE: FAIL-008
  LOCATION_MISSING: FAIL-009
  DRIVER_OFFLINE: FAIL-012
  DRIVER_NOT_VERIFIED: FAIL-003
```

### 4.3 Example Scenario: ORD-001

**File**: `specs/scenarios/ORD-001-happy-path.yaml`

```yaml
scenarioId: ORD-001
category: ORDER
title: "Order happy path - creation to completion"
description: |
  Validates complete order lifecycle: created → matching → accepted → onRoute → completed
  with proper timing and no anomalies.

inputs:
  orderId:
    type: string
    required: true
    description: "Order ID to validate"

checks:
  - atom: order_state_audit
    params:
      orderId: "$inputs.orderId"
    successCriteria:
      - ORDER_EXISTS
      - ORDER_STATUS_VALID

  - atom: order_timing_validation
    params:
      orderId: "$inputs.orderId"
      maxMatchingMinutes: 10
      maxTripMinutes: 120
    successCriteria:
      - TIMING_WITHIN_BOUNDS

  - atom: order_driver_assignment_valid
    params:
      orderId: "$inputs.orderId"
    successCriteria:
      - DRIVER_ASSIGNED
      - DRIVER_PROFILE_EXISTS

successMarkers:
  - "Order completed successfully"
  - "All timing thresholds met"

failureMappings:
  ORDER_NOT_FOUND: FAIL-010
  ORDER_STATUS_INVALID: FAIL-011
  ORDER_STUCK_MATCHING: FAIL-013
  DRIVER_ASSIGNMENT_MISSING: FAIL-014
```

### 4.4 Example Failure Scenario: FAIL-001

**File**: `specs/scenarios/FAIL-001-missing-index.yaml`

```yaml
scenarioId: FAIL-001
category: FAILURE
title: "Firestore index missing for query"
description: |
  Simulates and detects Firestore index missing errors that cause queries to fail.
  This is a reliability failure scenario.

inputs:
  collection:
    type: string
    required: true
  queryFields:
    type: array
    required: true

checks:
  - atom: firestore_index_validator
    params:
      collection: "$inputs.collection"
      fields: "$inputs.queryFields"
    successCriteria:
      - INDEX_EXISTS

  - atom: functions_invocation_trace
    params:
      timeRangeMinutes: 60
      errorPattern: "index"
    successCriteria:
      - NO_INDEX_ERRORS

successMarkers:
  - "All required indexes exist"
  - "No index-related function failures"

failureMappings:
  FIRESTORE_INDEX_MISSING: FAIL-001
  QUERY_UNBOUNDED:NO_LIMIT: FAIL-002
```

### 4.5 Orchestrator Implementation

**File**: `src/orchestrator/index.ts`

```typescript
import { z } from 'zod';
import { loadScenario } from './scenario-loader.js';
import { executeScenario } from './scenario-executor.js';
import { buildVerdict } from './verdict-builder.js';
import type { ScenarioResult } from '../types/standard-output.js';

const InputSchema = z.object({
  scenarioId: z.string().regex(/^(DRV|ORD|LOC|PAY|NOT|SUP|SAF|EDG|ADM|FAIL)-[0-9]{3}$/),
  inputs: z.record(z.any()),
  mode: z.enum(['diagnostic', 'assert', 'explain']).default('diagnostic'),
  stopOnFirstFailure: z.boolean().default(false),
});

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

function validateInputs(scenario: any, inputs: Record<string, any>): void {
  for (const [key, def] of Object.entries(scenario.inputs || {})) {
    const inputDef = def as any;
    if (inputDef.required && !inputs[key]) {
      throw new Error(`Required input "${key}" not provided for scenario ${scenario.scenarioId}`);
    }
  }
}

export const scenarioRunSchema = {
  name: 'wawapp_scenario_run',
  description:
    'Execute an end-to-end scenario by running a sequence of atom diagnostics and producing a unified verdict. ' +
    'Modes: "diagnostic" (default, full report), "assert" (pass/fail only), "explain" (verbose with evidence). ' +
    'Scenarios are defined in specs/scenarios/ registry and validate complex workflows across AUTH, DRIVER, ORDER, LOCATION, PAYMENT, NOTIFICATION, and FAILURE categories.',
  inputSchema: {
    type: 'object',
    properties: {
      scenarioId: {
        type: 'string',
        description: 'Scenario ID (e.g., DRV-001, ORD-001, FAIL-005)',
        pattern: '^(DRV|ORD|LOC|PAY|NOT|SUP|SAF|EDG|ADM|FAIL)-[0-9]{3}$',
      },
      inputs: {
        type: 'object',
        description: 'Inputs required by the scenario (e.g., { driverId: "abc123", orderId: "xyz" })',
      },
      mode: {
        type: 'string',
        enum: ['diagnostic', 'assert', 'explain'],
        default: 'diagnostic',
        description: 'Execution mode: diagnostic (full report), assert (pass/fail), explain (verbose)',
      },
      stopOnFirstFailure: {
        type: 'boolean',
        default: false,
        description: 'Stop execution on first failed check (default: false, run all checks)',
      },
    },
    required: ['scenarioId', 'inputs'],
  },
};
```

---

## 5. Atom Tools Design

### 5.1 Minimal Set of Atoms (12 Core Atoms)

We'll create 12 new atom tools in **Kit 9: Scenario Atoms**. Many wrap existing tools.

| **Atom** | **Domain** | **Implementation** | **Existing Tool** |
|----------|------------|--------------------|--------------------|
| `driver_profile_audit` | Driver | New (enhanced) | Wraps `wawapp_driver_eligibility` + adds rule IDs |
| `driver_location_freshness` | Driver | Adapter | Wraps `wawapp_driver_location_status` |
| `driver_online_state` | Driver | Adapter | Extracts from Firestore `/drivers/{id}` |
| `driver_eligibility` | Driver | Adapter | Wraps `wawapp_driver_eligibility` |
| `order_state_audit` | Order | Enhanced | Wraps `wawapp_order_trace` + adds validations |
| `order_driver_distance` | Order | New | Calculate distance between order and driver |
| `nearby_orders_query_simulator` | Order | Adapter | Inverse of `wawapp_driver_view_orders` |
| `matching_rule_trace` | Order | New | Why order IS/ISN'T visible to driver (w/ rule IDs) |
| `settlement_audit` | Payment | New | Validate 80/20 split + wallet updates |
| `wallet_integrity_audit` | Payment | New | Check wallet balance consistency |
| `fcm_token_health` | Notification | Adapter | Wraps `wawapp_fcm_token_status` |
| `functions_invocation_trace` | Reliability | Enhanced | Wraps `wawapp_function_execution_trace` + correlation |

### 5.2 Atom Implementation Examples

#### A. `driver_profile_audit` (New)

**File**: `src/kits/kit9-scenario-atoms/driver-atoms.ts`

```typescript
import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { DiagnosticResultBuilder } from '../../utils/result-builder.js';
import { RULE_DEFINITIONS } from '../../rules/rule-definitions.js';
import type { StandardDiagnosticResult } from '../../types/standard-output.js';

const InputSchema = z.object({
  driverId: z.string().min(1),
});

export async function driverProfileAudit(params: unknown): Promise<StandardDiagnosticResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const builder = new DiagnosticResultBuilder('driver_profile_audit');
  const startTime = new Date();

  const driverDoc = await firestore.getDocument('drivers', input.driverId);
  const driverPath = `/drivers/${input.driverId}`;

  if (!driverDoc) {
    builder
      .setStatus('FAIL')
      .setSummary(`Driver profile not found: ${input.driverId}`)
      .addBlockingReason({
        ruleId: 'DRIVER_NOT_FOUND',
        severity: 'CRITICAL',
        message: `Driver document does not exist`,
        evidencePath: driverPath,
      })
      .linkFailure('FAIL-004', 'Driver document missing', 'HIGH');

    return builder.build(startTime);
  }

  // Check required fields
  const requiredFields = ['name', 'phone', 'city', 'region'];
  const missingFields = requiredFields.filter(f => !driverDoc[f] || driverDoc[f] === '');

  for (const field of missingFields) {
    builder
      .addBlockingReason({
        ruleId: `PROFILE_MISSING:${field}`,
        severity: 'CRITICAL',
        message: `Driver profile missing required field: ${field}`,
        evidencePath: driverPath,
        field,
      })
      .addEvidence({
        key: `driver.${field}`,
        expected: '<non-empty string>',
        actual: driverDoc[field] || null,
        sourcePath: driverPath,
        field,
      })
      .addSuggestedFix({
        fixId: `FIX_PROFILE_MISSING_${field.toUpperCase()}`,
        description: `Set ${field} in driver profile via onboarding`,
        targetPath: driverPath,
        field,
        action: 'SET',
      })
      .linkFailure('FAIL-005', `Profile incomplete: missing ${field}`, 'HIGH');
  }

  // Check verification
  if (!driverDoc.isVerified) {
    builder
      .addBlockingReason({
        ruleId: 'DRIVER_NOT_VERIFIED',
        severity: 'CRITICAL',
        message: 'Driver is not verified by admin',
        evidencePath: driverPath,
        field: 'isVerified',
      })
      .addEvidence({
        key: 'driver.isVerified',
        expected: true,
        actual: driverDoc.isVerified || false,
        sourcePath: driverPath,
        field: 'isVerified',
      })
      .addSuggestedFix({
        fixId: 'FIX_DRIVER_VERIFY',
        description: 'Admin must set isVerified=true after verification process',
        targetPath: driverPath,
        field: 'isVerified',
        value: true,
        action: 'SET',
      })
      .linkFailure('FAIL-003', 'Driver not verified', 'HIGH');
  }

  const status = builder.result.blockingReasons!.length === 0 ? 'PASS' : 'FAIL';
  const summary = status === 'PASS'
    ? `Driver profile complete and verified`
    : `Driver profile has ${builder.result.blockingReasons!.length} issue(s)`;

  return builder.setStatus(status).setSummary(summary).build(startTime);
}

export const driverProfileAuditSchema = {
  name: 'wawapp_driver_profile_audit',
  description: 'Audit driver profile for completeness and verification. Returns rule IDs for missing fields and verification status.',
  inputSchema: {
    type: 'object',
    properties: {
      driverId: { type: 'string', description: 'Driver UID' },
    },
    required: ['driverId'],
  },
};
```

#### B. `settlement_audit` (New)

**File**: `src/kits/kit9-scenario-atoms/payment-atoms.ts`

```typescript
import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { DiagnosticResultBuilder } from '../../utils/result-builder.js';
import type { StandardDiagnosticResult } from '../../types/standard-output.js';

const InputSchema = z.object({
  orderId: z.string().min(1),
});

export async function settlementAudit(params: unknown): Promise<StandardDiagnosticResult> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const builder = new DiagnosticResultBuilder('settlement_audit');
  const startTime = new Date();

  const orderDoc = await firestore.getDocument('orders', input.orderId);
  const orderPath = `/orders/${input.orderId}`;

  if (!orderDoc) {
    builder
      .setStatus('FAIL')
      .setSummary(`Order not found: ${input.orderId}`)
      .addBlockingReason({
        ruleId: 'ORDER_NOT_FOUND',
        severity: 'CRITICAL',
        message: 'Order does not exist',
        evidencePath: orderPath,
      });
    return builder.build(startTime);
  }

  // Check if order is completed (required for settlement)
  if (orderDoc.status !== 'completed') {
    builder
      .setStatus('INCONCLUSIVE')
      .setSummary(`Order not completed yet (status: ${orderDoc.status})`)
      .addBlockingReason({
        ruleId: 'ORDER_NOT_COMPLETED',
        severity: 'WARNING',
        message: `Cannot audit settlement for order in status: ${orderDoc.status}`,
        evidencePath: orderPath,
      });
    return builder.build(startTime);
  }

  // Validate 80/20 split
  const price = orderDoc.price || 0;
  const expectedDriverShare = Math.round(price * 0.8);
  const expectedPlatformShare = price - expectedDriverShare;

  const actualDriverShare = orderDoc.driverShare || 0;
  const actualPlatformShare = orderDoc.platformShare || 0;

  if (actualDriverShare !== expectedDriverShare) {
    builder
      .addBlockingReason({
        ruleId: 'SETTLEMENT_INCORRECT_DRIVER_SHARE',
        severity: 'CRITICAL',
        message: `Driver share mismatch: expected ${expectedDriverShare}, actual ${actualDriverShare}`,
        evidencePath: orderPath,
        field: 'driverShare',
      })
      .addEvidence({
        key: 'order.driverShare',
        expected: expectedDriverShare,
        actual: actualDriverShare,
        sourcePath: orderPath,
        field: 'driverShare',
      })
      .linkFailure('FAIL-025', 'Settlement calculation error', 'HIGH');
  }

  if (actualPlatformShare !== expectedPlatformShare) {
    builder
      .addBlockingReason({
        ruleId: 'SETTLEMENT_INCORRECT_PLATFORM_SHARE',
        severity: 'CRITICAL',
        message: `Platform share mismatch: expected ${expectedPlatformShare}, actual ${actualPlatformShare}`,
        evidencePath: orderPath,
        field: 'platformShare',
      })
      .addEvidence({
        key: 'order.platformShare',
        expected: expectedPlatformShare,
        actual: actualPlatformShare,
        sourcePath: orderPath,
        field: 'platformShare',
      });
  }

  // Check wallet transaction exists
  const driverId = orderDoc.driverId;
  if (driverId) {
    const walletPath = `/driver_wallets/${driverId}`;
    const walletDoc = await firestore.getDocument('driver_wallets', driverId);

    if (!walletDoc) {
      builder
        .addBlockingReason({
          ruleId: 'WALLET_NOT_FOUND',
          severity: 'CRITICAL',
          message: 'Driver wallet document missing',
          evidencePath: walletPath,
        })
        .linkFailure('FAIL-026', 'Wallet missing for driver', 'HIGH');
    } else {
      // Check if transaction ledger entry exists
      const ledgerPath = `/driver_wallets/${driverId}/transactions`;
      const ledgerQuery = await firestore.queryDocuments(
        'driver_wallet_transactions',
        [
          { field: 'driverId', operator: '==', value: driverId },
          { field: 'orderId', operator: '==', value: input.orderId },
        ],
        { limit: 1 }
      );

      if (ledgerQuery.length === 0) {
        builder
          .addBlockingReason({
            ruleId: 'SETTLEMENT_TRANSACTION_MISSING',
            severity: 'CRITICAL',
            message: 'Wallet transaction not recorded for this order',
            evidencePath: ledgerPath,
          })
          .addSuggestedFix({
            fixId: 'FIX_CREATE_WALLET_TRANSACTION',
            description: `Create wallet transaction entry for order ${input.orderId}`,
            targetPath: ledgerPath,
            action: 'CREATE',
          })
          .linkFailure('FAIL-027', 'Wallet transaction missing', 'HIGH');
      }
    }
  }

  const status = builder.result.blockingReasons!.length === 0 ? 'PASS' : 'FAIL';
  const summary = status === 'PASS'
    ? `Settlement audit passed for order ${input.orderId} (80/20 split correct, wallet updated)`
    : `Settlement audit failed with ${builder.result.blockingReasons!.length} issue(s)`;

  return builder.setStatus(status).setSummary(summary).build(startTime);
}

export const settlementAuditSchema = {
  name: 'wawapp_settlement_audit',
  description: 'Audit settlement for completed order: validate 80/20 split, check wallet transaction exists.',
  inputSchema: {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: 'Order ID' },
    },
    required: ['orderId'],
  },
};
```

---

## 6. Rule ID Taxonomy

**File**: `src/rules/rule-definitions.ts`

```typescript
export interface RuleDefinition {
  ruleId: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  category: string;
  title: string;
  description: string;
}

export const RULE_DEFINITIONS: Record<string, RuleDefinition> = {
  // DRIVER PROFILE
  'PROFILE_MISSING:name': {
    ruleId: 'PROFILE_MISSING:name',
    severity: 'CRITICAL',
    category: 'DRIVER',
    title: 'Driver name missing',
    description: 'Driver profile does not have a name field. Required for order matching.',
  },
  'PROFILE_MISSING:phone': {
    ruleId: 'PROFILE_MISSING:phone',
    severity: 'CRITICAL',
    category: 'DRIVER',
    title: 'Driver phone missing',
    description: 'Driver profile does not have a phone number.',
  },
  'PROFILE_MISSING:city': {
    ruleId: 'PROFILE_MISSING:city',
    severity: 'CRITICAL',
    category: 'DRIVER',
    title: 'Driver city missing',
    description: 'Driver profile does not have a city field.',
  },
  'PROFILE_MISSING:region': {
    ruleId: 'PROFILE_MISSING:region',
    severity: 'CRITICAL',
    category: 'DRIVER',
    title: 'Driver region missing',
    description: 'Driver profile does not have a region field.',
  },

  // LOCATION
  'LOCATION_STALE': {
    ruleId: 'LOCATION_STALE',
    severity: 'CRITICAL',
    category: 'LOCATION',
    title: 'Location data stale',
    description: 'Driver location has not been updated recently (exceeds threshold).',
  },
  'LOCATION_MISSING': {
    ruleId: 'LOCATION_MISSING',
    severity: 'CRITICAL',
    category: 'LOCATION',
    title: 'Location data missing',
    description: 'Driver location document does not exist.',
  },
  'LOCATION_INVALID_COORDS': {
    ruleId: 'LOCATION_INVALID_COORDS',
    severity: 'CRITICAL',
    category: 'LOCATION',
    title: 'Invalid GPS coordinates',
    description: 'Location coordinates are invalid (0,0 or out of range).',
  },

  // DRIVER STATE
  'DRIVER_OFFLINE': {
    ruleId: 'DRIVER_OFFLINE',
    severity: 'CRITICAL',
    category: 'DRIVER',
    title: 'Driver offline',
    description: 'Driver isOnline=false. Cannot receive orders.',
  },
  'DRIVER_BUSY': {
    ruleId: 'DRIVER_BUSY',
    severity: 'WARNING',
    category: 'DRIVER',
    title: 'Driver busy',
    description: 'Driver currently has an active trip.',
  },
  'DRIVER_NOT_VERIFIED': {
    ruleId: 'DRIVER_NOT_VERIFIED',
    severity: 'CRITICAL',
    category: 'DRIVER',
    title: 'Driver not verified',
    description: 'Driver isVerified=false. Admin verification required.',
  },
  'DRIVER_NOT_FOUND': {
    ruleId: 'DRIVER_NOT_FOUND',
    severity: 'CRITICAL',
    category: 'DRIVER',
    title: 'Driver document not found',
    description: 'Driver does not exist in /drivers collection.',
  },

  // ORDER
  'ORDER_NOT_IN_MATCHING_POOL': {
    ruleId: 'ORDER_NOT_IN_MATCHING_POOL',
    severity: 'WARNING',
    category: 'ORDER',
    title: 'Order not in matching status',
    description: 'Order status is not "matching", so not visible to drivers.',
  },
  'ORDER_EXPIRED': {
    ruleId: 'ORDER_EXPIRED',
    severity: 'INFO',
    category: 'ORDER',
    title: 'Order expired',
    description: 'Order has been marked as expired.',
  },
  'ORDER_NOT_FOUND': {
    ruleId: 'ORDER_NOT_FOUND',
    severity: 'CRITICAL',
    category: 'ORDER',
    title: 'Order not found',
    description: 'Order does not exist in /orders collection.',
  },
  'ORDER_STATUS_INVALID': {
    ruleId: 'ORDER_STATUS_INVALID',
    severity: 'CRITICAL',
    category: 'ORDER',
    title: 'Order has invalid status',
    description: 'Order status field contains an unrecognized value.',
  },
  'ORDER_STUCK_MATCHING': {
    ruleId: 'ORDER_STUCK_MATCHING',
    severity: 'CRITICAL',
    category: 'ORDER',
    title: 'Order stuck in matching',
    description: 'Order has been in matching status for longer than threshold.',
  },

  // FIRESTORE RELIABILITY
  'FIRESTORE_INDEX_MISSING': {
    ruleId: 'FIRESTORE_INDEX_MISSING',
    severity: 'CRITICAL',
    category: 'RELIABILITY',
    title: 'Firestore index missing',
    description: 'Required Firestore composite index does not exist.',
  },
  'QUERY_UNBOUNDED:NO_LIMIT': {
    ruleId: 'QUERY_UNBOUNDED:NO_LIMIT',
    severity: 'WARNING',
    category: 'RELIABILITY',
    title: 'Unbounded query (no limit)',
    description: 'Firestore query executed without a limit, may cause performance issues.',
  },
  'PERMISSION_DENIED': {
    ruleId: 'PERMISSION_DENIED',
    severity: 'CRITICAL',
    category: 'RELIABILITY',
    title: 'Permission denied',
    description: 'Firestore security rules denied access to path.',
  },

  // FCM / NOTIFICATIONS
  'FCM_TOKEN_INVALID': {
    ruleId: 'FCM_TOKEN_INVALID',
    severity: 'CRITICAL',
    category: 'NOTIFICATION',
    title: 'FCM token invalid',
    description: 'Driver FCM token is missing or invalid.',
  },
  'FCM_SEND_FAILED': {
    ruleId: 'FCM_SEND_FAILED',
    severity: 'CRITICAL',
    category: 'NOTIFICATION',
    title: 'FCM send failed',
    description: 'Failed to send FCM notification to driver.',
  },

  // SETTLEMENT / WALLET
  'SETTLEMENT_FAILED': {
    ruleId: 'SETTLEMENT_FAILED',
    severity: 'CRITICAL',
    category: 'PAYMENT',
    title: 'Settlement calculation failed',
    description: 'Order settlement (80/20 split) calculation error.',
  },
  'WALLET_DISCREPANCY': {
    ruleId: 'WALLET_DISCREPANCY',
    severity: 'CRITICAL',
    category: 'PAYMENT',
    title: 'Wallet balance discrepancy',
    description: 'Wallet balance does not match sum of transactions.',
  },
  'WALLET_NOT_FOUND': {
    ruleId: 'WALLET_NOT_FOUND',
    severity: 'CRITICAL',
    category: 'PAYMENT',
    title: 'Driver wallet missing',
    description: 'Driver wallet document does not exist.',
  },
  'SETTLEMENT_TRANSACTION_MISSING': {
    ruleId: 'SETTLEMENT_TRANSACTION_MISSING',
    severity: 'CRITICAL',
    category: 'PAYMENT',
    title: 'Wallet transaction not recorded',
    description: 'No wallet transaction entry found for completed order.',
  },

  // CLOUD FUNCTIONS
  'FUNCTION_TIMEOUT': {
    ruleId: 'FUNCTION_TIMEOUT',
    severity: 'CRITICAL',
    category: 'RELIABILITY',
    title: 'Cloud Function timeout',
    description: 'Cloud Function execution exceeded time limit.',
  },
  'FUNCTION_ERROR': {
    ruleId: 'FUNCTION_ERROR',
    severity: 'CRITICAL',
    category: 'RELIABILITY',
    title: 'Cloud Function error',
    description: 'Cloud Function threw an unhandled error.',
  },

  // AUTH
  'AUTH_TOKEN_EXPIRED': {
    ruleId: 'AUTH_TOKEN_EXPIRED',
    severity: 'WARNING',
    category: 'AUTH',
    title: 'Auth token expired',
    description: 'Firebase Auth token has expired.',
  },
  'AUTH_USER_NOT_FOUND': {
    ruleId: 'AUTH_USER_NOT_FOUND',
    severity: 'CRITICAL',
    category: 'AUTH',
    title: 'Auth user not found',
    description: 'User does not exist in Firebase Auth.',
  },
};
```

---

## 7. Updated Order Visibility Tool

**Current**: `wawapp_order_visibility` returns ad-hoc `VisibilityCheck` objects with `pass/fail/reason`.

**Updated**: Will call atoms internally and return standard schema with rule IDs.

**File**: `src/kits/kit2-driver-matching/order-visibility-v2.ts`

```typescript
import { z } from 'zod';
import { driverProfileAudit } from '../kit9-scenario-atoms/driver-atoms.js';
import { driverLocationFreshness } from '../kit9-scenario-atoms/driver-atoms.js';
import { driverOnlineState } from '../kit9-scenario-atoms/driver-atoms.js';
import { orderStateAudit } from '../kit9-scenario-atoms/order-atoms.js';
import { orderDriverDistance } from '../kit9-scenario-atoms/order-atoms.js';
import { DiagnosticResultBuilder } from '../../utils/result-builder.js';
import type { StandardDiagnosticResult } from '../../types/standard-output.js';

const InputSchema = z.object({
  orderId: z.string().min(1),
  driverId: z.string().min(1),
  radiusKm: z.number().positive().default(6.0),
});

export async function orderVisibilityV2(params: unknown): Promise<StandardDiagnosticResult> {
  const input = InputSchema.parse(params);
  const builder = new DiagnosticResultBuilder('order_visibility_v2');
  const startTime = new Date();

  // Run atom checks
  const [
    orderResult,
    profileResult,
    locationResult,
    onlineResult,
    distanceResult,
  ] = await Promise.all([
    orderStateAudit({ orderId: input.orderId }),
    driverProfileAudit({ driverId: input.driverId }),
    driverLocationFreshness({ driverId: input.driverId, maxAgeMinutes: 5 }),
    driverOnlineState({ driverId: input.driverId }),
    orderDriverDistance({ orderId: input.orderId, driverId: input.driverId }),
  ]);

  // Aggregate blocking reasons
  const allResults = [orderResult, profileResult, locationResult, onlineResult, distanceResult];
  for (const result of allResults) {
    builder.result.blockingReasons!.push(...result.blockingReasons);
    builder.result.evidence!.push(...result.evidence);
    builder.result.suggestedFixes!.push(...result.suggestedFixes);
    builder.result.linkedFailures!.push(...result.linkedFailures);
  }

  // Check distance
  if (distanceResult.status === 'PASS') {
    const distanceKm = (distanceResult as any).distanceKm;
    if (distanceKm > input.radiusKm) {
      builder.addBlockingReason({
        ruleId: 'ORDER_OUTSIDE_RADIUS',
        severity: 'WARNING',
        message: `Order is ${distanceKm.toFixed(2)}km away, outside ${input.radiusKm}km radius`,
      });
    }
  }

  const visible = builder.result.blockingReasons!.length === 0;
  const summary = visible
    ? `Order ${input.orderId} IS visible to driver ${input.driverId}`
    : `Order ${input.orderId} is NOT visible to driver ${input.driverId}. ${builder.result.blockingReasons!.length} blocking reason(s).`;

  return builder
    .setStatus(visible ? 'PASS' : 'FAIL')
    .setSummary(summary)
    .build(startTime);
}

export const orderVisibilityV2Schema = {
  name: 'wawapp_order_visibility_v2',
  description:
    'Debug why order is/isn\'t visible to driver. Returns standardized rule IDs, evidence, and suggested fixes. ' +
    'Aggregates results from: order_state_audit, driver_profile_audit, driver_location_freshness, driver_online_state, order_driver_distance.',
  inputSchema: {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: 'Order ID' },
      driverId: { type: 'string', description: 'Driver ID' },
      radiusKm: { type: 'number', description: 'Search radius in km (default: 6.0)', default: 6.0 },
    },
    required: ['orderId', 'driverId'],
  },
};
```

**Migration**:
- Keep old `wawapp_order_visibility` for backward compatibility
- Register new `wawapp_order_visibility_v2` as separate tool
- Document migration path in README

---

## 8. Coverage Mapping

### 8.1 E2E Scenarios Coverage (65 Scenarios)

| **Category** | **Scenario Range** | **Orchestrator Support** | **Atoms Used** |
|--------------|-------------------|--------------------------|----------------|
| AUTH | AUTH-001 to AUTH-010 | ✅ Supported | driver_profile_audit, fcm_token_health |
| DRV (Driver) | DRV-001 to DRV-015 | ✅ Supported | driver_profile_audit, driver_location_freshness, driver_online_state, driver_eligibility |
| ORD (Order) | ORD-001 to ORD-015 | ✅ Supported | order_state_audit, order_driver_distance, matching_rule_trace |
| LOC (Location) | LOC-001 to LOC-010 | ✅ Supported | driver_location_freshness, order_driver_distance |
| PAY (Payment) | PAY-001 to PAY-008 | ✅ Supported | settlement_audit, wallet_integrity_audit |
| NOT (Notification) | NOT-001 to NOT-007 | ✅ Supported | fcm_token_health, notification_delivery_check (existing) |
| SUP (Support) | SUP-001 to SUP-005 | ⚠️ Partial | Wraps existing tools |
| SAF (Safety) | SAF-001 to SAF-003 | ⚠️ Partial | New atoms needed (out of scope for v1) |
| EDG (Edge Cases) | EDG-001 to EDG-005 | ✅ Supported | Combination of existing atoms |
| ADM (Admin) | ADM-001 to ADM-002 | ✅ Supported | Data audit tools |

**Total**: ~65 scenarios mapped to 12 core atoms + orchestrator

### 8.2 Failure Scenarios Coverage (FAIL-001 to FAIL-030)

| **Failure ID** | **Title** | **Atom(s)** | **Rule ID(s)** |
|----------------|-----------|-------------|----------------|
| FAIL-001 | Firestore index missing | firestore_index_validator | FIRESTORE_INDEX_MISSING |
| FAIL-002 | Query unbounded (no limit) | query_analyzer | QUERY_UNBOUNDED:NO_LIMIT |
| FAIL-003 | Driver not verified | driver_profile_audit | DRIVER_NOT_VERIFIED |
| FAIL-004 | Driver document missing | driver_profile_audit | DRIVER_NOT_FOUND |
| FAIL-005 | Profile incomplete (name) | driver_profile_audit | PROFILE_MISSING:name |
| FAIL-006 | Profile incomplete (phone) | driver_profile_audit | PROFILE_MISSING:phone |
| FAIL-007 | Profile incomplete (city) | driver_profile_audit | PROFILE_MISSING:city |
| FAIL-008 | Location stale | driver_location_freshness | LOCATION_STALE |
| FAIL-009 | Location missing | driver_location_freshness | LOCATION_MISSING |
| FAIL-010 | Order not found | order_state_audit | ORDER_NOT_FOUND |
| FAIL-011 | Order status invalid | order_state_audit | ORDER_STATUS_INVALID |
| FAIL-012 | Driver offline | driver_online_state | DRIVER_OFFLINE |
| FAIL-013 | Order stuck in matching | order_state_audit | ORDER_STUCK_MATCHING |
| FAIL-014 | Driver assignment missing | order_state_audit | DRIVER_ASSIGNMENT_MISSING |
| FAIL-015 | Permission denied (Firestore) | security_rule_checker | PERMISSION_DENIED |
| FAIL-016 | GPS coordinates invalid | driver_location_freshness | LOCATION_INVALID_COORDS |
| FAIL-017 | Background location disabled | (requires client telemetry) | - |
| FAIL-018 | Network switch mid-trip | (requires client telemetry) | - |
| FAIL-019 | Auth token expired | auth_session_check (existing) | AUTH_TOKEN_EXPIRED |
| FAIL-020 | Function timeout | functions_invocation_trace | FUNCTION_TIMEOUT |
| FAIL-021 | Function error (unhandled) | functions_invocation_trace | FUNCTION_ERROR |
| FAIL-022 | FCM token invalid | fcm_token_health | FCM_TOKEN_INVALID |
| FAIL-023 | FCM send failed | fcm_token_health | FCM_SEND_FAILED |
| FAIL-024 | Listener error (client-side) | (requires client telemetry) | - |
| FAIL-025 | Settlement calculation error | settlement_audit | SETTLEMENT_FAILED |
| FAIL-026 | Wallet missing | settlement_audit | WALLET_NOT_FOUND |
| FAIL-027 | Wallet transaction missing | settlement_audit | SETTLEMENT_TRANSACTION_MISSING |
| FAIL-028 | Wallet balance discrepancy | wallet_integrity_audit | WALLET_DISCREPANCY |
| FAIL-029 | Order expired (not by function) | order_state_audit | ORDER_EXPIRED |
| FAIL-030 | Matching pool query failed | matching_rule_trace | QUERY_ERROR |

**Coverage**: 27/30 scenarios fully supported by atoms (3 require client telemetry)

### 8.3 Real Incident Encoding

**Incident**: Order in "matching" did not appear to driver because:
1. Driver profile missing `name` field
2. Driver location stale (last update ~406 hours ago)

**Scenario**: `FAIL-REAL-001-order-visibility.yaml`

```yaml
scenarioId: FAIL-REAL-001
category: FAILURE
title: "Real incident: Driver can't see order due to profile + location issues"
description: |
  Reproduces actual production incident where order was in matching status
  but invisible to driver due to missing profile field AND stale location.

inputs:
  driverId: { type: string, required: true }
  orderId: { type: string, required: true }

checks:
  - atom: driver_profile_audit
    params: { driverId: "$inputs.driverId" }
    successCriteria:
      - PROFILE_COMPLETE
    # Expected to fail: PROFILE_MISSING:name

  - atom: driver_location_freshness
    params: { driverId: "$inputs.driverId", maxAgeMinutes: 5 }
    successCriteria:
      - LOCATION_FRESH
    # Expected to fail: LOCATION_STALE (406 hours > 5 minutes)

  - atom: matching_rule_trace
    params: { orderId: "$inputs.orderId", driverId: "$inputs.driverId" }
    successCriteria:
      - ORDER_VISIBLE
    # Expected to fail due to above issues

failureMappings:
  PROFILE_MISSING:name: FAIL-005
  LOCATION_STALE: FAIL-008
  ORDER_NOT_VISIBLE: FAIL-030
```

**Expected Output**:
```json
{
  "scenarioId": "FAIL-REAL-001",
  "status": "FAIL",
  "summary": "Driver cannot see order due to 2 critical issues",
  "blockingReasons": [
    {
      "ruleId": "PROFILE_MISSING:name",
      "severity": "CRITICAL",
      "message": "Driver profile missing required field: name",
      "evidencePath": "/drivers/{driverId}",
      "field": "name"
    },
    {
      "ruleId": "LOCATION_STALE",
      "severity": "CRITICAL",
      "message": "Driver location stale (24360 minutes old, threshold: 5 minutes)",
      "evidencePath": "/driver_locations/{driverId}"
    }
  ],
  "suggestedFixes": [
    {
      "fixId": "FIX_PROFILE_MISSING_NAME",
      "description": "Set name in driver profile via onboarding",
      "targetPath": "/drivers/{driverId}",
      "field": "name",
      "action": "SET"
    },
    {
      "fixId": "FIX_LOCATION_REFRESH",
      "description": "Driver must open app to refresh location",
      "action": "MANUAL"
    }
  ],
  "linkedFailures": [
    { "failureId": "FAIL-005", "title": "Profile incomplete: missing name", "likelihood": "HIGH" },
    { "failureId": "FAIL-008", "title": "Location stale", "likelihood": "HIGH" }
  ]
}
```

### 8.4 Gaps & Additional Atoms Needed (v2)

| **Gap** | **Atom Needed** | **Priority** |
|---------|-----------------|--------------|
| Firestore index validation | `firestore_index_validator` | High |
| Security rule testing | `security_rule_checker` | Medium |
| Query performance analysis | `query_analyzer` | Medium |
| Listener error detection | (requires client SDK changes) | Low |
| Background location monitoring | (requires client telemetry) | Low |
| Network switch detection | (requires client telemetry) | Low |
| Pin flow state validation | (already exists in kit8) | - |
| Multi-device conflicts | (already exists in kit8) | - |
| Auth flow audit | (already exists in kit8) | - |
| Route loop detection | (already exists in kit8) | - |

**Total gaps**: 6 atoms (3 high/medium priority, 3 require client changes)

---

## 9. Implementation Plan

### 9.1 File-Level Changes

#### **CREATE** (New Files)

```
specs/
  scenarios/
    _schema.yaml
    DRV-001-go-online.yaml
    ORD-001-happy-path.yaml
    PAY-001-settlement.yaml
    LOC-001-location-updates.yaml
    FAIL-001-to-FAIL-030/ (30 files)
    FAIL-REAL-001-order-visibility.yaml
    README.md

src/
  types/
    standard-output.ts              # StandardDiagnosticResult, ScenarioResult

  rules/
    rule-definitions.ts             # RULE_DEFINITIONS taxonomy
    severity-mapping.ts             # Rule → Severity
    fix-suggestions.ts              # Rule → Fix templates
    index.ts

  utils/
    result-builder.ts               # DiagnosticResultBuilder class

  orchestrator/
    scenario-loader.ts              # Load YAML scenarios
    scenario-executor.ts            # Execute atom sequence
    verdict-builder.ts              # Merge results → verdict
    types.ts                        # Orchestrator types
    index.ts                        # wawapp_scenario_run tool

  kits/
    kit9-scenario-atoms/
      driver-atoms.ts               # 4 driver atoms
      order-atoms.ts                # 4 order atoms
      payment-atoms.ts              # 2 payment atoms
      notification-atoms.ts         # 1 notification atom (wrapper)
      reliability-atoms.ts          # 1 reliability atom (wrapper)
      index.ts
      README.md
```

#### **MODIFY** (Update Existing Files)

```
src/
  kits/
    kit2-driver-matching/
      order-visibility-v2.ts        # New version using atoms
      index.ts                      # Export v2 tool

  index.ts                          # Register orchestrator + kit9 tools

package.json                        # Add yaml parser dependency
README.md                           # Document new tools + migration guide
```

#### **KEEP UNCHANGED** (Backward Compatibility)

All existing 33 tools in kits 1-8 remain unchanged. No breaking changes.

### 9.2 Dependencies

```json
{
  "dependencies": {
    "yaml": "^2.3.4"  // For YAML scenario parsing
  }
}
```

### 9.3 Code Snippets

#### A. Scenario Loader (`src/orchestrator/scenario-loader.ts`)

```typescript
import { readFile } from 'fs/promises';
import { parse as parseYAML } from 'yaml';
import path from 'path';

export interface ScenarioDefinition {
  scenarioId: string;
  category: string;
  title: string;
  description?: string;
  inputs: Record<string, { type: string; required: boolean; description?: string }>;
  checks: Array<{
    atom: string;
    params: Record<string, any>;
    successCriteria?: string[];
  }>;
  successMarkers?: string[];
  failureMappings?: Record<string, string>;
}

const SCENARIOS_DIR = path.join(process.cwd(), 'specs', 'scenarios');

export async function loadScenario(scenarioId: string): Promise<ScenarioDefinition> {
  const filename = `${scenarioId}.yaml`;
  const filepath = path.join(SCENARIOS_DIR, filename);

  try {
    const content = await readFile(filepath, 'utf-8');
    const scenario = parseYAML(content) as ScenarioDefinition;

    // Validate schema
    if (!scenario.scenarioId || !scenario.checks || scenario.checks.length === 0) {
      throw new Error(`Invalid scenario format in ${filename}`);
    }

    return scenario;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`Scenario ${scenarioId} not found in registry (${filepath})`);
    }
    throw new Error(`Failed to load scenario ${scenarioId}: ${error.message}`);
  }
}
```

#### B. Scenario Executor (`src/orchestrator/scenario-executor.ts`)

```typescript
import type { ScenarioDefinition } from './scenario-loader.js';
import type { StandardDiagnosticResult } from '../types/standard-output.js';
import * as driverAtoms from '../kits/kit9-scenario-atoms/driver-atoms.js';
import * as orderAtoms from '../kits/kit9-scenario-atoms/order-atoms.js';
import * as paymentAtoms from '../kits/kit9-scenario-atoms/payment-atoms.js';

const ATOM_REGISTRY: Record<string, Function> = {
  driver_profile_audit: driverAtoms.driverProfileAudit,
  driver_location_freshness: driverAtoms.driverLocationFreshness,
  driver_online_state: driverAtoms.driverOnlineState,
  driver_eligibility: driverAtoms.driverEligibility,
  order_state_audit: orderAtoms.orderStateAudit,
  order_driver_distance: orderAtoms.orderDriverDistance,
  settlement_audit: paymentAtoms.settlementAudit,
  wallet_integrity_audit: paymentAtoms.walletIntegrityAudit,
  // ... more atoms
};

export interface CheckResult {
  atomName: string;
  atomResult: StandardDiagnosticResult;
  passed: boolean;
}

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
      throw new Error(`Atom "${check.atom}" not found in registry`);
    }

    // Interpolate params (replace $inputs.* with actual values)
    const params = interpolateParams(check.params, inputs);

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
  }

  return results;
}

function interpolateParams(params: Record<string, any>, inputs: Record<string, any>): Record<string, any> {
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
```

#### C. Verdict Builder (`src/orchestrator/verdict-builder.ts`)

```typescript
import type { ScenarioDefinition } from './scenario-loader.js';
import type { CheckResult } from './scenario-executor.js';
import type { ScenarioResult } from '../types/standard-output.js';

export function buildVerdict(
  scenario: ScenarioDefinition,
  checkResults: CheckResult[],
  inputs: Record<string, any>,
  mode: 'diagnostic' | 'assert' | 'explain',
  startTime: Date
): ScenarioResult {
  const passedChecks = checkResults.filter(r => r.passed).length;
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

  // Deduplicate linked failures
  const uniqueFailures = Array.from(
    new Map(linkedFailures.map(f => [f.failureId, f])).values()
  );

  const summary = overallPass
    ? `Scenario ${scenario.scenarioId} PASSED: All ${totalChecks} checks successful`
    : `Scenario ${scenario.scenarioId} FAILED: ${totalChecks - passedChecks} of ${totalChecks} checks failed`;

  const endTime = new Date();

  return {
    scenarioId: scenario.scenarioId,
    scenarioTitle: scenario.title,
    inputs,
    mode,
    status: overallPass ? 'PASS' : 'FAIL',
    summary,
    blockingReasons,
    evidence: mode === 'explain' ? evidence : [],  // Only include in explain mode
    suggestedFixes,
    linkedFailures: uniqueFailures,
    checks: checkResults,
    passedChecks,
    totalChecks,
    overallPass,
    meta: {
      toolName: 'wawapp_scenario_run',
      toolVersion: '2.0',
      runId: `scenario-${scenario.scenarioId}-${Date.now()}`,
      startedAt: startTime.toISOString(),
      completedAt: endTime.toISOString(),
      durationMs: endTime.getTime() - startTime.getTime(),
    },
  };
}
```

### 9.4 Testing Strategy

#### Unit Tests
```typescript
// tests/orchestrator/scenario-loader.test.ts
describe('ScenarioLoader', () => {
  it('should load valid YAML scenario', async () => {
    const scenario = await loadScenario('DRV-001');
    expect(scenario.scenarioId).toBe('DRV-001');
    expect(scenario.checks.length).toBeGreaterThan(0);
  });

  it('should throw error for missing scenario', async () => {
    await expect(loadScenario('INVALID')).rejects.toThrow('not found in registry');
  });
});
```

#### Integration Tests
```typescript
// tests/orchestrator/scenario-run.test.ts
describe('ScenarioRun', () => {
  it('should execute DRV-001 scenario successfully', async () => {
    const result = await scenarioRun({
      scenarioId: 'DRV-001',
      inputs: { driverId: 'test_driver_123' },
      mode: 'diagnostic',
    });

    expect(result.scenarioId).toBe('DRV-001');
    expect(result.totalChecks).toBeGreaterThan(0);
    expect(result).toHaveProperty('status');
  });
});
```

### 9.5 Migration Path

#### Phase 1: Infrastructure (Week 1)
- [ ] Create `src/types/standard-output.ts`
- [ ] Create `src/rules/rule-definitions.ts`
- [ ] Create `src/utils/result-builder.ts`
- [ ] Add `yaml` dependency
- [ ] Create `specs/scenarios/` directory structure

#### Phase 2: Atoms (Week 2-3)
- [ ] Implement Kit 9 atoms (12 atoms)
- [ ] Write unit tests for each atom
- [ ] Register atoms in atom registry
- [ ] Document atom I/O in README

#### Phase 3: Orchestrator (Week 3-4)
- [ ] Implement scenario loader
- [ ] Implement scenario executor
- [ ] Implement verdict builder
- [ ] Register `wawapp_scenario_run` tool
- [ ] Write integration tests

#### Phase 4: Scenario Registry (Week 4-5)
- [ ] Create 4 example scenarios (DRV-001, ORD-001, PAY-001, LOC-001)
- [ ] Create FAIL-001 to FAIL-010 (priority failures)
- [ ] Create FAIL-REAL-001 (real incident)
- [ ] Document scenario format in `specs/scenarios/README.md`

#### Phase 5: Migration & Docs (Week 5-6)
- [ ] Create `order-visibility-v2.ts`
- [ ] Update main README with migration guide
- [ ] Create scenario cookbook (examples)
- [ ] Performance testing
- [ ] Production deployment

### 9.6 Rollout Plan

1. **No Breaking Changes**: All existing tools continue working
2. **Gradual Adoption**: Users can try new tools alongside old ones
3. **Deprecation Timeline**: v2.0 (new tools), v2.5 (deprecate old), v3.0 (remove old)
4. **Feature Flag**: Add `ENABLE_SCENARIO_ORCHESTRATOR` env var for gradual rollout

---

## Summary

This architecture evolution plan provides:

✅ **Minimal changes** to existing codebase (33 tools untouched)
✅ **Incremental additions** (Kit 9 atoms + orchestrator)
✅ **Standard output schema** for consistency
✅ **Scenario registry** for 65 E2E + 30 failure scenarios
✅ **Rule ID taxonomy** for stable failure identification
✅ **Evidence tracking** with Firestore paths
✅ **Backward compatibility** preserved
✅ **Real incident encoding** (FAIL-REAL-001)
✅ **Coverage mapping** showing 27/30 failures supported

**Next Steps**: Begin Phase 1 implementation (infrastructure setup).

---

**End of Architecture Document**
