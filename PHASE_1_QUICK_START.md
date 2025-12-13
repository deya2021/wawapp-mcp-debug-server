# Phase 1 MVP - Quick Start Guide

**Version**: 2.0 (Phase 1)
**Date**: 2025-12-13

---

## Installation

```bash
# 1. Install dependencies (includes new 'yaml' package)
npm install

# 2. Build
npx tsc

# 3. Run (if using as MCP server)
npm start
```

---

## New Tools Available

### 1. `wawapp_scenario_run` (Orchestrator)

**Purpose**: Execute end-to-end scenarios from YAML registry

**Input**:
```json
{
  "scenarioId": "FAIL-REAL-001",
  "inputs": {
    "driverId": "driver_abc123",
    "orderId": "order_xyz789"
  },
  "mode": "diagnostic",
  "stopOnFirstFailure": false
}
```

**Modes**:
- `diagnostic` (default): Full report with blocking reasons, evidence, fixes
- `assert`: Pass/fail only (for CI/CD)
- `explain`: Verbose with all evidence included

**Available Scenarios** (Phase 1):
- `FAIL-REAL-001` - Real production incident (missing name + stale location)
- `DRV-001` - Driver go online validation
- `LOC-001` - Location tracking validation

---

### 2. `wawapp_order_visibility_v2` (Enhanced Wrapper)

**Purpose**: Diagnose why order is/isn't visible to driver (with rule IDs)

**Input**:
```json
{
  "orderId": "order_xyz789",
  "driverId": "driver_abc123",
  "radiusKm": 6.0
}
```

**Internally calls 5 atoms**:
1. `order_state_audit`
2. `driver_profile_audit`
3. `driver_location_freshness`
4. `driver_online_state`
5. `matching_rule_trace`

**Output**: Standardized result with rule IDs, evidence paths, suggested fixes

---

## Scenario YAMLs

### FAIL-REAL-001 (Real Incident)

**File**: `specs/scenarios/FAIL-REAL-001.yaml`

**Purpose**: Reproduce production incident where driver couldn't see order

**Root causes**:
- `PROFILE_MISSING:name` (driver profile missing name field)
- `LOCATION_STALE` (location not updated for ~406 hours)

**Inputs required**:
```json
{
  "driverId": "string (required)",
  "orderId": "string (required)"
}
```

**Expected failures**: When profile incomplete or location stale

---

### DRV-001 (Driver Onboarding)

**File**: `specs/scenarios/DRV-001.yaml`

**Purpose**: Validate driver can go online successfully

**Success criteria**:
- Profile complete (name, phone, city, region)
- Driver verified
- Driver online
- Location fresh (<5 minutes)

**Inputs required**:
```json
{
  "driverId": "string (required)"
}
```

**Expected success**: When driver fully onboarded and ready

---

### LOC-001 (Location Tracking)

**File**: `specs/scenarios/LOC-001.yaml`

**Purpose**: Validate location is being tracked while driver online

**Success criteria**:
- Driver online
- Location document exists
- Coordinates valid
- Location fresh (<5 minutes)

**Inputs required**:
```json
{
  "driverId": "string (required)",
  "maxAgeMinutes": "number (optional, default: 5)"
}
```

---

## Rule IDs (Phase 1)

### Driver Profile
- `PROFILE_MISSING:name`
- `PROFILE_MISSING:phone`
- `PROFILE_MISSING:city`
- `PROFILE_MISSING:region`
- `DRIVER_NOT_VERIFIED`
- `DRIVER_NOT_FOUND`

### Driver State
- `DRIVER_OFFLINE`

### Location
- `LOCATION_STALE`
- `LOCATION_MISSING`
- `LOCATION_INVALID_COORDS`

### Order
- `ORDER_NOT_FOUND`
- `ORDER_NOT_IN_MATCHING_POOL`
- `ORDER_STATUS_INVALID`

### Matching
- `ORDER_OUTSIDE_RADIUS`
- `DISTANCE_CALCULATION_FAILED`

---

## Usage Examples

### Example 1: Diagnose Real Incident

```typescript
// Via MCP client
const result = await mcpClient.call('wawapp_scenario_run', {
  scenarioId: 'FAIL-REAL-001',
  inputs: {
    driverId: 'KfXX1234abcd',
    orderId: 'ord_20231213_001'
  },
  mode: 'diagnostic'
});

console.log(result.status);              // "FAIL"
console.log(result.blockingReasons);     // Array of rule IDs
console.log(result.suggestedFixes);      // Actionable fixes
console.log(result.linkedFailures);      // FAIL-005, FAIL-008
```

**Expected output** (if profile missing name + location stale):
```json
{
  "status": "FAIL",
  "summary": "Scenario FAIL-REAL-001 FAILED: 2 of 5 checks failed",
  "blockingReasons": [
    {
      "ruleId": "PROFILE_MISSING:name",
      "severity": "CRITICAL",
      "message": "Driver profile missing required field: name",
      "evidencePath": "/drivers/KfXX1234abcd",
      "field": "name"
    },
    {
      "ruleId": "LOCATION_STALE",
      "severity": "CRITICAL",
      "message": "Location stale: 17 days ago (24360 minutes > 5 minutes threshold)",
      "evidencePath": "/driver_locations/KfXX1234abcd"
    }
  ],
  "suggestedFixes": [
    {
      "fixId": "FIX_PROFILE_MISSING_NAME",
      "description": "Driver must complete onboarding and set name field",
      "targetPath": "/drivers/KfXX1234abcd",
      "field": "name",
      "action": "SET"
    },
    {
      "fixId": "FIX_LOCATION_REFRESH",
      "description": "Driver should restart app or toggle airplane mode to refresh location",
      "action": "MANUAL"
    }
  ],
  "linkedFailures": [
    { "failureId": "FAIL-005", "title": "Profile incomplete: missing name", "likelihood": "HIGH" },
    { "failureId": "FAIL-008", "title": "Location data stale", "likelihood": "HIGH" }
  ]
}
```

---

### Example 2: Validate Driver Ready

```typescript
const result = await mcpClient.call('wawapp_scenario_run', {
  scenarioId: 'DRV-001',
  inputs: {
    driverId: 'KfXX1234abcd'
  },
  mode: 'assert'
});

if (result.overallPass) {
  console.log('Driver is ready to go online');
} else {
  console.log('Issues found:', result.blockingReasons);
}
```

---

### Example 3: Enhanced Order Visibility

```typescript
const result = await mcpClient.call('wawapp_order_visibility_v2', {
  orderId: 'ord_20231213_001',
  driverId: 'KfXX1234abcd'
});

console.log(result.status);              // PASS or FAIL
console.log(result.blockingReasons);     // Rule IDs for failures
console.log(result.evidence);            // Firestore paths + actual values
```

---

## Firestore Evidence Paths

All blocking reasons include Firestore document paths for easy verification:

```json
{
  "ruleId": "PROFILE_MISSING:name",
  "evidencePath": "/drivers/KfXX1234abcd"
}
```

You can verify directly in Firestore console:
1. Go to Firebase Console → Firestore
2. Navigate to `/drivers/KfXX1234abcd`
3. Check `name` field

---

## Suggested Fixes

Every failure includes actionable remediation:

```json
{
  "fixId": "FIX_PROFILE_MISSING_NAME",
  "description": "Driver must complete onboarding and set name field",
  "targetPath": "/drivers/KfXX1234abcd",
  "field": "name",
  "action": "SET"
}
```

**Actions**:
- `SET`: Update field in Firestore
- `DELETE`: Remove field
- `CREATE`: Create new document
- `MANUAL`: Manual intervention required (e.g., "restart app")

---

## Linked Failures

Each rule ID maps to FAIL-xxx scenario:

```json
{
  "failureId": "FAIL-005",
  "title": "Profile incomplete: missing name",
  "likelihood": "HIGH"
}
```

**Failure IDs** (Phase 1):
- `FAIL-003`: Driver not verified
- `FAIL-004`: Driver document missing
- `FAIL-005`: Profile incomplete (name)
- `FAIL-006`: Profile incomplete (phone)
- `FAIL-007`: Profile incomplete (city/region)
- `FAIL-008`: Location data stale
- `FAIL-009`: Location data missing
- `FAIL-010`: Order not found
- `FAIL-011`: Order status invalid
- `FAIL-012`: Driver offline
- `FAIL-016`: GPS coordinates invalid

---

## Debugging Tips

### 1. Check scenario definition
```bash
cat specs/scenarios/FAIL-REAL-001.yaml
```

### 2. Run with explain mode for full evidence
```json
{
  "scenarioId": "FAIL-REAL-001",
  "inputs": { "driverId": "...", "orderId": "..." },
  "mode": "explain"  // Includes all evidence
}
```

### 3. Stop on first failure for faster diagnosis
```json
{
  "scenarioId": "FAIL-REAL-001",
  "inputs": { "driverId": "...", "orderId": "..." },
  "stopOnFirstFailure": true
}
```

---

## What's NOT in Phase 1

**Not implemented** (Phase 2+):
- ❌ Payment scenarios (PAY-001, etc.)
- ❌ Notification scenarios (NOT-001, etc.)
- ❌ Full 65 E2E scenarios
- ❌ Full 30 FAIL scenarios
- ❌ Settlement audit atoms
- ❌ Wallet integrity atoms

**Use existing tools for these**:
- `wawapp_fcm_token_status` (notifications)
- `wawapp_function_execution_trace` (cloud functions)
- `wawapp_incident_report` (unified diagnostics)

---

## Backward Compatibility

**All 33 existing tools unchanged**:
- `wawapp_order_visibility` (old version still works)
- `wawapp_driver_eligibility` (still works)
- All kits 1-8 (unchanged)

**New tools add functionality**, don't replace anything.

---

## Support

**Documentation**:
- Full architecture: `SCENARIO_ORCHESTRATOR_ARCHITECTURE.md`
- Implementation details: `PHASE_1_IMPLEMENTATION_SUMMARY.md`
- This guide: `PHASE_1_QUICK_START.md`

**Issues**:
Report bugs or feature requests at: https://github.com/anthropics/claude-code/issues

---

**End of Quick Start Guide**
