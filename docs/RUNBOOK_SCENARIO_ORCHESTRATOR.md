# Scenario Orchestrator Runbook

**For Operators: Amazon Q, Claude, and Human DevOps**

**Last Updated**: 2025-12-13
**Version**: 3.0 (Phase 1+2+3)

---

## Quick Reference

**Tool Name**: `wawapp_scenario_run`

**Purpose**: Execute predefined diagnostic scenarios to troubleshoot WawApp production incidents.

**Phases Coverage**:
- **Phase 1**: Order visibility, driver profile, location tracking
- **Phase 2**: Firestore reliability (indexes, queries, permissions)
- **Phase 3**: Notifications, Cloud Functions, Listener health

---

## How to Run

### Basic Syntax

```json
{
  "scenarioId": "SCENARIO-ID",
  "inputs": {
    "inputParam1": "value1",
    "inputParam2": "value2"
  },
  "mode": "diagnostic",
  "stopOnFirstFailure": false
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scenarioId` | string | Yes | Scenario ID (e.g., `FAIL-REAL-001`, `DRV-001`) |
| `inputs` | object | Yes | Scenario-specific inputs (varies by scenario) |
| `mode` | string | No | `diagnostic` (default) or `validation` |
| `stopOnFirstFailure` | boolean | No | Stop after first check failure (default: `false`) |

---

## How to Interpret Outputs

### Status Values

| Status | Meaning | Action |
|--------|---------|--------|
| **PASS** | All checks passed successfully | ✅ No action needed |
| **FAIL** | One or more checks failed | ⚠️ Review `blockingReasons` and `suggestedFixes` |
| **INCONCLUSIVE** | Cannot determine (missing infrastructure) | ℹ️ Review `suggestedFixes` for infrastructure setup |

### Output Structure

```json
{
  "scenarioId": "FAIL-REAL-001",
  "status": "FAIL",
  "summary": "Human-readable summary",
  "blockingReasons": [
    {
      "ruleId": "PROFILE_MISSING:name",
      "severity": "CRITICAL",
      "message": "Driver profile is missing required field: name",
      "evidencePath": "/drivers/driver_abc123",
      "field": "name"
    }
  ],
  "evidence": [
    {
      "key": "profile.name",
      "expected": "non-empty string",
      "actual": null,
      "sourcePath": "/drivers/driver_abc123"
    }
  ],
  "suggestedFixes": [
    {
      "fixId": "FIX_ADD_REQUIRED_FIELD",
      "description": "Add missing field 'name' to driver profile...",
      "targetPath": "/drivers/driver_abc123",
      "action": "SET"
    }
  ],
  "linkedFailures": [
    {
      "failureId": "FAIL-005",
      "title": "Driver profile incomplete",
      "likelihood": "HIGH"
    }
  ],
  "checks": [...],
  "passedChecks": 1,
  "totalChecks": 3,
  "overallPass": false
}
```

### Key Fields

- **blockingReasons**: List of failures with `ruleId`, `severity`, and `evidencePath`
- **evidence**: Detailed comparison (expected vs actual values)
- **suggestedFixes**: Actionable remediation steps
- **linkedFailures**: Related known failure scenarios
- **evidencePath**: Firestore document path to investigate

---

## Understanding INCONCLUSIVE Status

### What It Means

`INCONCLUSIVE` status occurs when a diagnostic check **cannot definitively determine** the result due to missing logging/telemetry infrastructure.

### Phase 3 Atoms That May Return INCONCLUSIVE

1. **notification_delivery_audit**
   - **Reason**: No `notification_logs` collection
   - **Impact**: Cannot verify if notifications were sent
   - **Fix**: Add logging to `notifyOrderEvents` Cloud Function

2. **functions_invocation_trace**
   - **Reason**: No `function_logs` collection
   - **Impact**: Cannot trace function execution
   - **Fix**: Add entry/exit logging to Cloud Functions

3. **firestore_listener_health**
   - **Reason**: No `listener_telemetry` collection
   - **Impact**: Cannot monitor listener state
   - **Fix**: Add state machine markers in Flutter app

### How to Reduce INCONCLUSIVE Results

**Step 1: Review `suggestedFixes`**

INCONCLUSIVE results always include a `suggestedFixes` array with code samples for adding logging.

Example:
```json
{
  "status": "INCONCLUSIVE",
  "suggestedFixes": [
    {
      "fixId": "FIX_ADD_FUNCTION_LOGGING",
      "description": "Add minimal function execution logging to notifyOrderEvents:\n\n1. At function entry:\n   const startTime = Date.now();\n   const correlationId = context.eventId || uuid();\n\n2. At function exit (success):\n   await firestore.collection('function_logs').add({\n     functionName: 'notifyOrderEvents',\n     orderId: orderId,\n     correlationId: correlationId,\n     status: 'success',\n     durationMs: Date.now() - startTime,\n     timestamp: admin.firestore.FieldValue.serverTimestamp()\n   });\n...",
      "action": "MANUAL"
    }
  ]
}
```

**Step 2: Implement Logging (One-Time Setup)**

Add logging collections in Firestore (optional but recommended):

| Collection | Purpose | Required For |
|------------|---------|--------------|
| `notification_logs` | Track FCM send attempts | `notification_delivery_audit` |
| `function_logs` | Track Cloud Function executions | `functions_invocation_trace` |
| `listener_telemetry` | Track Firestore listener health | `firestore_listener_health` |

**Step 3: Re-run Scenario**

After adding logging, re-run the scenario to get definitive `PASS`/`FAIL` results.

---

## Common Incidents & Recipes

### 1. Order Not Visible to Driver

**Symptoms**:
- Driver reports: "I don't see any orders"
- Order stuck in "matching" status
- No drivers accepting order

**Diagnosis Scenario**: `FAIL-REAL-001` or `wawapp_order_visibility_v2`

**Inputs**:
```json
{
  "scenarioId": "FAIL-REAL-001",
  "inputs": {
    "driverId": "driver_abc123",
    "orderId": "order_xyz789"
  }
}
```

**Common Root Causes** (from `blockingReasons`):

| Rule ID | Severity | Root Cause | Fix |
|---------|----------|------------|-----|
| `PROFILE_MISSING:name` | CRITICAL | Driver profile incomplete | Add missing field to `/drivers/{driverId}` |
| `LOCATION_STALE` | CRITICAL | Location not updating | Ask driver to check GPS permissions, restart app |
| `DRIVER_OFFLINE` | CRITICAL | Driver set to offline | Ask driver to toggle online status |
| `ORDER_OUTSIDE_RADIUS` | WARNING | Order too far from driver | Verify pickup coordinates, check radius config |

**Investigation Steps**:

1. **Check `evidencePath`** in blocking reasons → Navigate to Firestore document
2. **Review `suggestedFixes`** → Follow remediation steps
3. **Check `linkedFailures`** → Review related scenarios (FAIL-005, FAIL-008, FAIL-009)

**Example Output (FAIL)**:
```json
{
  "status": "FAIL",
  "summary": "2 of 3 checks failed",
  "blockingReasons": [
    {
      "ruleId": "PROFILE_MISSING:name",
      "evidencePath": "/drivers/driver_abc123"
    },
    {
      "ruleId": "LOCATION_STALE",
      "evidencePath": "/driver_locations/driver_abc123"
    }
  ],
  "suggestedFixes": [
    {
      "fixId": "FIX_ADD_REQUIRED_FIELD",
      "description": "Add missing field 'name' to driver profile at /drivers/driver_abc123",
      "targetPath": "/drivers/driver_abc123",
      "action": "SET"
    },
    {
      "fixId": "FIX_RESTART_LOCATION_TRACKING",
      "description": "Driver location is stale. Ask driver to: 1) Check location permissions, 2) Restart app, 3) Verify GPS is enabled",
      "action": "MANUAL"
    }
  ]
}
```

**Resolution**:
1. Add missing `name` field to driver profile
2. Ask driver to restart app to refresh location
3. Re-run scenario to verify: `DRV-001` should now PASS

---

### 2. Missing Composite Index / Unbounded Query

**Symptoms**:
- Firestore queries failing in production
- Error: "The query requires an index"
- Slow query performance or timeouts

**Diagnosis Scenarios**: `FAIL-001` (index) or `FAIL-002` (unbounded query)

**Inputs for FAIL-001**:
```json
{
  "scenarioId": "FAIL-001",
  "inputs": {
    "driverId": "driver_abc123",
    "limit": 50
  }
}
```

**Inputs for FAIL-002**:
```json
{
  "scenarioId": "FAIL-002",
  "inputs": {
    "driverId": "driver_abc123"
  }
}
```

**Common Root Causes**:

| Rule ID | Severity | Root Cause | Fix |
|---------|----------|------------|-----|
| `FIRESTORE_INDEX_MISSING` | CRITICAL | Composite index not created | Create index in Firebase Console |
| `QUERY_UNBOUNDED:NO_LIMIT` | WARNING | Query without limit | Add `limit` parameter (50-100) |

**Example Output (Index Missing)**:
```json
{
  "status": "FAIL",
  "blockingReasons": [
    {
      "ruleId": "FIRESTORE_INDEX_MISSING",
      "severity": "CRITICAL",
      "message": "Firestore composite index missing for query on /orders with fields: status, createdAt (ordered)",
      "evidencePath": "/orders"
    }
  ],
  "suggestedFixes": [
    {
      "fixId": "FIX_CREATE_COMPOSITE_INDEX",
      "description": "Create composite index in Firestore: Collection: orders, Fields: status (Ascending), createdAt (Descending)",
      "targetPath": "/orders",
      "action": "CREATE"
    }
  ]
}
```

**Resolution**:
1. Go to Firebase Console > Firestore > Indexes
2. Create composite index:
   - **Collection**: `orders`
   - **Fields**: `status` (Ascending), `createdAt` (Descending)
3. Wait for index to build (~5-10 minutes)
4. Re-run scenario: should now PASS

---

### 3. Driver Not Receiving Notifications

**Symptoms**:
- Driver reports: "I didn't get notification when order was accepted"
- Client reports: "Driver didn't respond to my order"
- Notifications working in some cases but not others

**Diagnosis Scenario**: `NOT-001` (E2E notification delivery)

**Inputs**:
```json
{
  "scenarioId": "NOT-001",
  "inputs": {
    "driverId": "driver_abc123",
    "orderId": "order_xyz789"
  }
}
```

**Common Root Causes**:

| Rule ID | Severity | Root Cause | Fix |
|---------|----------|------------|-----|
| `FCM_TOKEN_MISSING` | CRITICAL | No FCM token stored | Ask driver to grant notification permissions, restart app |
| `FCM_TOKEN_STALE` | WARNING | Token > 60 days old | Ask driver to logout/login to refresh token |
| `FCM_TOKEN_INVALID_FORMAT` | WARNING | Token corrupted | Ask driver to reinstall app |
| `FUNCTION_TIMEOUT:notifyOrderEvents` | CRITICAL | Function timed out | Increase function timeout, optimize code |
| `FUNCTION_ERROR:notifyOrderEvents` | WARNING | Function failed | Check Cloud Function logs for errors |
| `NOTIFICATION_SEND_NO_EVIDENCE` | WARNING | No send attempt logged | Verify function triggers correctly |

**Investigation Steps**:

**Step 1: Check FCM Token** (`FAIL-005`)
```json
{
  "scenarioId": "FAIL-005",
  "inputs": {
    "userId": "driver_abc123",
    "userType": "driver"
  }
}
```

**Step 2: Check Function Execution** (`FAIL-006`)
```json
{
  "scenarioId": "FAIL-006",
  "inputs": {
    "functionName": "notifyOrderEvents",
    "orderId": "order_xyz789",
    "lookbackMinutes": 30
  }
}
```

**Example Output (FCM Token Stale)**:
```json
{
  "status": "FAIL",
  "blockingReasons": [
    {
      "ruleId": "FCM_TOKEN_STALE",
      "severity": "WARNING",
      "message": "FCM token is 104 days old (threshold: 60 days)",
      "evidencePath": "/drivers/driver_abc123",
      "field": "fcmTokenUpdatedAt"
    }
  ],
  "suggestedFixes": [
    {
      "fixId": "FIX_REFRESH_STALE_TOKEN",
      "description": "Ask user to logout and login to refresh stale FCM token (last updated 104 days ago)",
      "action": "MANUAL"
    }
  ]
}
```

**Example Output (Function Timeout)**:
```json
{
  "status": "FAIL",
  "blockingReasons": [
    {
      "ruleId": "FUNCTION_TIMEOUT:notifyOrderEvents",
      "severity": "CRITICAL",
      "message": "Function notifyOrderEvents timed out 2 time(s) in last 60 minutes",
      "evidencePath": "/function_logs"
    }
  ],
  "suggestedFixes": [
    {
      "fixId": "FIX_INCREASE_FUNCTION_TIMEOUT",
      "description": "Increase timeout for notifyOrderEvents:\n1. In functions/index.ts, set: { timeoutSeconds: 540, memory: '1GB' }\n2. Review function logic for long-running operations\n3. Consider breaking into smaller functions\n4. Add progress logging to identify bottlenecks",
      "action": "MANUAL"
    }
  ]
}
```

**Example Output (INCONCLUSIVE - No Logging)**:
```json
{
  "status": "INCONCLUSIVE",
  "summary": "Cannot verify notification delivery: no logging infrastructure detected",
  "suggestedFixes": [
    {
      "fixId": "FIX_ADD_NOTIFICATION_LOGGING",
      "description": "Add minimal notification logging to Cloud Function:\n\n1. In notifyOrderEvents function, add:\n   await firestore.collection('notification_logs').add({\n     orderId: orderId,\n     recipientId: recipientId,\n     recipientType: 'client',\n     notificationType: 'order_status_changed',\n     status: 'sent' | 'failed',\n     fcmResponse: response,\n     error: error?.message,\n     timestamp: admin.firestore.FieldValue.serverTimestamp()\n   });\n\n2. Query this collection for delivery audit",
      "action": "MANUAL"
    }
  ]
}
```

**Resolution (FCM Token)**:
1. Ask driver to logout and login (refreshes token)
2. Verify new `fcmTokenUpdatedAt` timestamp in `/drivers/{driverId}`
3. Re-run `FAIL-005`: should now PASS

**Resolution (Function Timeout)**:
1. Open `functions/index.ts`
2. Update function config:
   ```typescript
   export const notifyOrderEvents = functions
     .runWith({ timeoutSeconds: 540, memory: '1GB' }) // Increase timeout
     .firestore
     .document('orders/{orderId}')
     .onUpdate(async (change, context) => { ... });
   ```
3. Deploy functions: `firebase deploy --only functions:notifyOrderEvents`
4. Re-run `FAIL-006`: should now PASS

**Resolution (No Logging)**:
1. Add logging as suggested in `suggestedFixes`
2. Deploy changes
3. Re-run `NOT-001`: should now return definitive `PASS`/`FAIL`

---

## All Available Scenarios

### Phase 1 Scenarios

| Scenario ID | Category | Purpose | Key Inputs |
|-------------|----------|---------|------------|
| **DRV-001** | DRIVER | Driver readiness check | `driverId` |
| **LOC-001** | LOCATION | Location tracking validation | `driverId` |
| **FAIL-REAL-001** | FAILURE | Order not visible (real incident) | `driverId`, `orderId` |

### Phase 2 Scenarios

| Scenario ID | Category | Purpose | Key Inputs |
|-------------|----------|---------|------------|
| **FAIL-001** | FAILURE | Missing composite index | `driverId`, `limit` |
| **FAIL-002** | FAILURE | Unbounded query | `driverId` |
| **FAIL-015** | FAILURE | Permission denied | `principalId`, `targetPath` |

### Phase 3 Scenarios

| Scenario ID | Category | Purpose | Key Inputs |
|-------------|----------|---------|------------|
| **NOT-001** | NOTIFICATION | E2E notification delivery | `driverId`, `orderId` |
| **FAIL-005** | FAILURE | FCM token invalid | `userId`, `userType` |
| **FAIL-006** | FAILURE | Function timeout/error | `functionName`, `orderId` |

---

## Advanced Usage

### Stopping on First Failure

For fast fail-fast diagnostics:

```json
{
  "scenarioId": "FAIL-REAL-001",
  "inputs": { "driverId": "...", "orderId": "..." },
  "stopOnFirstFailure": true
}
```

Scenario will stop after first check fails, returning partial results.

### Validation Mode vs Diagnostic Mode

- **diagnostic** (default): Full diagnostics with evidence and suggestions
- **validation**: Lightweight checks, returns PASS/FAIL only

```json
{
  "scenarioId": "DRV-001",
  "inputs": { "driverId": "..." },
  "mode": "validation"
}
```

---

## Troubleshooting the Orchestrator Itself

### Scenario Not Found

**Error**: `Scenario SCENARIO-ID not found`

**Cause**: Invalid `scenarioId` or YAML file missing

**Fix**: Check `specs/scenarios/` directory for available scenarios

### Invalid Input Parameters

**Error**: `Validation error: input 'driverId' is required`

**Cause**: Missing required input parameter

**Fix**: Review scenario YAML for required inputs

### Atom Not Registered

**Error**: `Unknown atom: atom_name`

**Cause**: Atom not registered in `ATOM_REGISTRY`

**Fix**: Verify atom exists in `src/kits/kit9-scenario-atoms/` and is exported

---

## CI/CD Integration

### Local Verification

```bash
# Full verification (build + all tests)
npm run verify

# Quick verification (compile + YAML validation only)
npm run verify:quick

# Individual test suites
npm run test:yaml           # Validate scenario YAMLs
npm run test:unit           # Run unit tests
npm run test:golden         # Run golden snapshot tests
```

### GitHub Actions (if applicable)

```yaml
name: Verify Scenario Orchestrator

on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm run verify
```

---

## Support & Escalation

### For Operators (Amazon Q / Claude)

1. **Start with scenario**: Use predefined scenarios (FAIL-REAL-001, NOT-001, etc.)
2. **Review `suggestedFixes`**: Follow remediation steps
3. **Check `evidencePath`**: Navigate to Firestore document for manual investigation
4. **Escalate if**: Multiple scenarios fail or root cause unclear

### For Human DevOps

1. **Review scenario outputs**: Check `blockingReasons` and `evidence`
2. **Follow `suggestedFixes`**: Most fixes are straightforward (add field, restart app, etc.)
3. **Add logging if INCONCLUSIVE**: Implement logging collections for Phase 3 atoms
4. **Escalate to dev team if**: Code changes required (function optimization, schema migration, etc.)

---

**End of Runbook**
