# WawApp MCP Debug Server

Read-only debugging server for WawApp Firebase/Flutter ecosystem using Model Context Protocol (MCP).

**33 production-ready debugging tools** across 8 specialized kits for comprehensive system observability.

## Quick Start

### Prerequisites

- Node.js 20+
- Firebase service account with `datastore.viewer` and `logging.viewer` roles
- Firebase project (dev/staging/prod)

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set ENVIRONMENT=dev

# 3. Add Firebase service account
# Download service account JSON from Firebase Console → Project Settings → Service Accounts
# Save as config/dev-service-account.json

# 4. Build
npm run build

# 5. Run
npm start
```

---

## Configuration

### Multi-Environment Setup

Edit `config/environments.json`:

```json
{
  "dev": {
    "projectId": "wawapp-dev",
    "serviceAccountPath": "./config/dev-service-account.json",
    "maxTimeRangeDays": 7,
    "rateLimit": { "perTool": 10, "global": 100 }
  }
}
```

Set active environment in `.env`:

```bash
ENVIRONMENT=dev
```

---

## AI Client Setup (Claude Desktop)

Add to your Claude Desktop MCP configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "wawapp-debug": {
      "command": "node",
      "args": [
        "C:\\Users\\hp\\Music\\wawapp-mcp-debug-server\\dist\\index.js"
      ],
      "env": {
        "ENVIRONMENT": "dev"
      }
    }
  }
}
```

**Restart Claude Desktop after adding this configuration.**

---

## Available Tools (33 Total)

### Kit 1: Order Lifecycle Inspector (4 tools)

**`wawapp_order_trace`** - Full order timeline
Trace complete lifecycle of an order including status transitions, driver assignments, and timeline.

```json
{
  "orderId": "order_abc123",
  "includeNotifications": true
}
```

**`wawapp_order_search`** - Search and filter orders
Search orders by multiple criteria: status, driver/client, price range, city/region, time range with pagination.

```json
{
  "status": "matching",
  "city": "Khartoum",
  "timeRangeMinutes": 1440,
  "limit": 50
}
```

**`wawapp_order_anomalies`** - Detect stuck/problematic orders
Proactively detect orders with issues: stuck in matching >10min, invalid coordinates, missing timestamps, data inconsistencies.

```json
{
  "timeRangeMinutes": 1440,
  "includeExpired": false,
  "limit": 200
}
```

**`wawapp_order_stats`** - Aggregate order statistics
Comprehensive order analytics: financial metrics, completion rates, timing analysis, engagement metrics.

```json
{
  "timeRangeMinutes": 1440,
  "groupBy": "status"
}
```

---

### Kit 2: Driver Matching Diagnostics (5 tools) ⭐ CRITICAL

**`wawapp_driver_eligibility`** - Check driver requirements
Comprehensive check of driver eligibility for order matching: verification status, profile completeness, online status, location validity.

```json
{
  "driverId": "driver_xyz"
}
```

**`wawapp_driver_view_orders`** - Simulate driver's view
Simulate the exact orders a driver should see based on their current location and matching logic.

```json
{
  "driverId": "driver_xyz",
  "radiusKm": 6.0
}
```

**`wawapp_order_visibility`** - Debug why order not visible to driver
Detailed diagnostics on why a specific order isn't visible to a specific driver with pass/fail checks.

```json
{
  "orderId": "order_abc123",
  "driverId": "driver_xyz"
}
```

**`wawapp_nearby_drivers`** - Find drivers near a location
Find all drivers within a radius of a location, with distance and eligibility analysis.

```json
{
  "lat": 15.5007,
  "lng": 32.5599,
  "radiusKm": 10.0,
  "onlineOnly": true,
  "verifiedOnly": true
}
```

**`wawapp_matching_performance`** - Matching algorithm performance
Analyze matching performance metrics: success rates, response times, P95 metrics, driver statistics.

```json
{
  "timeRangeMinutes": 1440,
  "groupBy": "region"
}
```

---

### Kit 3: Data Quality & Diagnostics (3 tools)

**`wawapp_data_audit`** - Data consistency verification
Verify data integrity across collections: orphaned records, missing references, invalid data.

```json
{
  "collection": "orders",
  "checkType": "all",
  "limit": 500
}
```

**`wawapp_backend_simulator`** - Simulate backend operations
Simulate backend operations for testing: order creation, driver matching, notifications.

```json
{
  "operation": "matchOrder",
  "params": {
    "orderId": "order_abc123"
  }
}
```

**`wawapp_log_analyzer`** - Log analysis and pattern detection
Analyze Cloud Logging for patterns, errors, and anomalies with severity breakdown.

```json
{
  "timeRangeMinutes": 60,
  "severity": "ERROR",
  "resource": "cloud_function",
  "limit": 100
}
```

---

### Kit 4: Real-time Location Intelligence (3 tools)

**`wawapp_driver_location_status`** - Driver location health check
Comprehensive location health check: exists, valid coordinates, fresh (<5min), accurate (<50m).

```json
{
  "driverId": "driver_xyz"
}
```

**`wawapp_location_density_heatmap`** - Geographic distribution analysis
Analyze driver and order density by region with supply/demand ratio calculation.

```json
{
  "region": "Khartoum",
  "radiusKm": 20.0,
  "includeOrders": true,
  "includeDrivers": true
}
```

**`wawapp_trip_route_analyzer`** - Analyze completed trip routes
Analyze trip routes for anomalies: distance comparison, duration analysis, detour detection.

```json
{
  "orderId": "order_abc123"
}
```

---

### Kit 5: Notification Delivery Tracker (4 tools)

**`wawapp_fcm_token_status`** - FCM token health check
Check FCM token validity and health status for a user.

```json
{
  "userId": "user_xyz",
  "userType": "driver"
}
```

**`wawapp_notification_trace`** - Order notification timeline
Trace all notifications sent for an order with delivery status and timing.

```json
{
  "orderId": "order_abc123"
}
```

**`wawapp_notification_delivery_check`** - Comprehensive delivery diagnostics
Full notification delivery check: token validity, permissions, device status, recent deliveries.

```json
{
  "userId": "user_xyz",
  "userType": "driver"
}
```

**`wawapp_notification_batch_check`** - Bulk notification health check
Scan multiple users for notification health with aggregated statistics.

```json
{
  "userType": "drivers",
  "limit": 100,
  "onlineOnly": true
}
```

---

### Kit 6: Cloud Function Execution Observer (3 tools)

**`wawapp_function_execution_trace`** - Function execution analysis
Trace Cloud Function executions with timing, errors, and performance metrics.

```json
{
  "functionName": "expireStaleOrders",
  "timeRangeMinutes": 60,
  "includeErrors": true
}
```

**`wawapp_function_health_check`** - System-wide function health
Health check for all Cloud Functions with execution rates and error rates.

```json
{
  "timeRangeMinutes": 60
}
```

**`wawapp_scheduler_status`** - Cloud Scheduler jobs status
Check status of scheduled jobs with inferred health from system behavior.

```json
{
  "jobName": "expireStaleOrders"
}
```

---

### Kit 7: System Health Dashboard (5 tools)

**`wawapp_system_health`** - Comprehensive system overview
System-wide health check: orders, drivers, clients, performance metrics with health status.

```json
{
  "timeRangeMinutes": 60
}
```

**`wawapp_active_users`** - Active user tracking
Track active users (drivers and clients) with engagement metrics.

```json
{
  "timeRangeMinutes": 60,
  "userType": "all"
}
```

**`wawapp_performance_trends`** - Historical performance analysis
Analyze performance trends over time with period comparison and trend detection.

```json
{
  "timeRangeMinutes": 1440,
  "compareWithPrevious": true
}
```

**`wawapp_error_rate_monitor`** - System-wide error detection
Monitor system-wide errors with severity categorization and health status.

```json
{
  "timeRangeMinutes": 60,
  "limit": 200
}
```

**`wawapp_incident_report`** - Unified incident diagnostics
Comprehensive cross-system diagnostic that aggregates signals from auth, app flow, location, matching, notifications to provide prioritized root cause analysis.

```json
{
  "uid": "driver_abc123",
  "orderId": "order_xyz789",
  "timeRangeMinutes": 1440,
  "includeDeepDiagnostics": true
}
```

---

### Kit 8: Auth & App Flow Diagnostics (6 tools)

**`wawapp_auth_session_check`** - Auth session health check
Check auth session consistency across Firebase Auth, custom claims, and Firestore documents.

```json
{
  "uid": "driver_abc123",
  "includeDetails": true
}
```

**`wawapp_auth_flow_audit`** - Auth flow timeline audit
Build timeline of auth flow events: OTP, PIN, profile creation, onboarding completion.

```json
{
  "uid": "driver_abc123",
  "timeRangeMinutes": 1440,
  "limit": 200
}
```

**`wawapp_auth_loop_detector`** - Detect auth-related infinite loops
Detect AuthGate rebuild loops, PIN loops, and other auth-related infinite loops from logs.

```json
{
  "timeRangeMinutes": 60,
  "uid": "driver_abc123",
  "minRepetitions": 100
}
```

**`wawapp_route_loop_diagnoser`** - Navigation/route loop detection
Detect navigation loops like nearby → onboarding → nearby from navigation logs.

```json
{
  "uid": "driver_abc123",
  "timeRangeMinutes": 120,
  "maxSequenceLength": 50
}
```

**`wawapp_pin_flow_checker`** - PIN flow state validation
Audit PIN flow state: check hasPin, pinHash, pinSalt consistency and recent attempts.

```json
{
  "uid": "driver_abc123",
  "includeAttempts": true
}
```

**`wawapp_multi_device_session_audit`** - Multi-device session conflicts
Check for multi-device session issues and conflicting states across devices.

```json
{
  "uid": "driver_abc123",
  "timeRangeMinutes": 1440
}
```

---

## Example Usage

### Example 1: "Why can't driver see orders?"

**User prompt to AI**:

```
Driver with ID "driver_abc123" complains they can't see any nearby orders.
Can you diagnose why?
```

**AI will use**:

1. `wawapp_driver_eligibility` → Check all requirements
2. `wawapp_driver_view_orders` → Show what driver should see
3. `wawapp_driver_location_status` → Check location health

**Expected output**:

```
The driver cannot see orders because:
- isVerified: false (driver not verified by admin)
- Profile incomplete: missing "city" and "region"
- Location: stale (last updated 15 minutes ago)

Action required:
1. Admin must set isVerified=true in /drivers/driver_abc123
2. Driver must complete onboarding (add city and region)
3. Driver should restart app to refresh location
```

---

### Example 2: "Trace order lifecycle"

**User prompt to AI**:

```
Show me the complete timeline for order abc123
```

**AI will use**:

1. `wawapp_order_trace` → Get full timeline

**Expected output**:

```
Order abc123 Timeline:
1. [10:30:00] Order created (status: matching)
2. [10:32:15] Driver assigned (driver_yyy, status: accepted)
3. [10:35:00] Driver en route (status: onRoute)
4. [11:15:00] Trip completed (status: completed, rating: 5)

Duration:
- Total: 45m 0s
- matchingToAccepted: 2m 15s
- acceptedToCompleted: 42m 45s
```

---

### Example 3: "Why isn't a specific order visible to a driver?"

**User prompt to AI**:

```
Order xyz789 is in matching status but driver abc123 can't see it. Why?
```

**AI will use**:

1. `wawapp_order_visibility` → Detailed diagnostics

**Expected output**:

```
Order xyz789 visibility check for driver abc123:

✓ Order exists and status is "matching"
✓ Driver is verified
✓ Driver profile is complete
✗ Driver is OFFLINE (last seen 2 hours ago)
✗ Distance: 12.3 km (exceeds 6 km radius)

Root cause: Driver is offline and too far from pickup location.

Recommendations:
1. Driver must go online
2. Driver should move closer to Khartoum central area
```

---

### Example 4: "Find stuck orders"

**User prompt to AI**:

```
Find all orders that might be stuck or have problems
```

**AI will use**:

1. `wawapp_order_anomalies` → Detect problematic orders

**Expected output**:

```
Found 5 anomalies in last 24 hours:

CRITICAL (3):
- Order abc123: Stuck in matching for 25 minutes
- Order def456: Invalid pickup coordinates (0, 0)
- Order ghi789: Missing createdAt timestamp

WARNING (2):
- Order jkl012: Completed but missing completedAt
- Order mno345: Invalid price (0 SDG)

Recommendations:
- Check expireStaleOrders Cloud Function
- Add validation in order creation flow
```

---

### Example 5: "System health check"

**User prompt to AI**:

```
Give me a comprehensive system health report
```

**AI will use**:

1. `wawapp_system_health` → Overall health metrics
2. `wawapp_error_rate_monitor` → Error detection
3. `wawapp_performance_trends` → Performance analysis

**Expected output**:

```
System Health Report (Last 1 hour):

Overall Status: HEALTHY

Orders:
- Total: 247 (↑ 12% vs previous hour)
- Active: 18
- Completed: 215 (87% completion rate)
- Expired: 14

Drivers:
- Total: 156
- Online: 45 (29%)
- Verified: 142 (91%)

Performance:
- Avg matching time: 3.2 minutes (↓ 8% - improving)
- Avg trip duration: 22 minutes
- Rating rate: 78%

Error Rate: 2.4% (5 critical errors detected)

Top Issue: 3 orders stuck in matching >10min
Recommendation: Check expireStaleOrders scheduler
```

---

### Kit 10: Advanced Diagnostics (2 tools)

**`wawapp_notification_analytics`** - Deep notification delivery analytics
Comprehensive FCM notification analytics: delivery rates, platform breakdown, failure reasons, multi-device detection, hourly timeline, and problematic users.

```json
{
  "timeRangeMinutes": 1440,
  "userType": "driver",
  "notificationType": "new_order"
}
```

**`wawapp_race_condition_detector`** - Detect race conditions
Detect concurrent writes, duplicate driver assignments, conflicting status transitions, Firestore transaction failures, and simultaneous cancel/accept races.

```json
{
  "timeRangeMinutes": 60,
  "sensitivityMs": 2000,
  "orderId": "order_abc123"
}
```

---

## Security & Limitations

### Read-Only Guarantee

All tools are **strictly read-only**. No writes, updates, or deletes.

### Rate Limits

- 10 requests/minute per tool
- 100 requests/minute globally
- Configurable per environment

### Time Range Limits

- Default lookback: 24 hours
- Maximum range: 7 days (configurable)

### PII Masking

- Phone numbers: Masked as "+222 3\*\*\* \*\*\*\*"
- Names: First name + masked last ("Ahmed M\*\*\*")
- GPS: Rounded to 4 decimals (~11m precision)

---

## Troubleshooting

### Error: "Permission denied (Firestore)"

- Check service account has `roles/datastore.viewer`
- Verify service account path in `environments.json`

### Error: "Rate limit exceeded"

- Wait for rate limit window to reset
- Increase limits in `environments.json` (not recommended for prod)

### No tools showing in Claude Desktop

- Check MCP config path is absolute (not relative)
- Verify `npm run build` completed successfully
- Restart Claude Desktop

---

## Development

```bash
# Watch mode (auto-rebuild on changes)
npm run dev

# Build
npm run build

# Lint
npm run lint
```

---

## Project Structure

```
wawapp-mcp-debug-server/
├── src/
│   ├── config/              # Environment & collection mappings
│   ├── security/            # Rate limiting, PII masking, audit logs
│   ├── data-access/         # Firestore & Cloud Logging clients
│   ├── server/              # MCP server core
│   ├── kits/                # Tool implementations by kit
│   ├── utils/               # Haversine, time helpers, error handlers
│   └── types/               # TypeScript interfaces
├── context/                 # Context files for AI agents
├── config/                  # Environment configs & service accounts
└── logs/                    # Audit logs
```

---

## License

MIT License

---

## Tool Selection Guide

Choose tools based on your debugging scenario:

| Symptom | Recommended Tools |
|---------|------------------|
| "Driver can't see orders" | `wawapp_driver_eligibility`, `wawapp_driver_view_orders`, `wawapp_driver_location_status` |
| "Order stuck in matching" | `wawapp_order_trace`, `wawapp_order_anomalies`, `wawapp_nearby_drivers` |
| "Specific order not showing" | `wawapp_order_visibility`, `wawapp_order_trace` |
| "Notifications not received" | `wawapp_fcm_token_status`, `wawapp_notification_delivery_check`, `wawapp_notification_trace` |
| "System performance issues" | `wawapp_system_health`, `wawapp_performance_trends`, `wawapp_error_rate_monitor` |
| "Find problematic orders" | `wawapp_order_anomalies`, `wawapp_order_search` |
| "Trip took too long" | `wawapp_trip_route_analyzer`, `wawapp_order_trace` |
| "No drivers in area" | `wawapp_nearby_drivers`, `wawapp_location_density_heatmap` |
| "Cloud Functions not running" | `wawapp_function_health_check`, `wawapp_scheduler_status`, `wawapp_function_execution_trace` |
| "Data quality issues" | `wawapp_data_audit`, `wawapp_order_anomalies`, `wawapp_error_rate_monitor` |
| **"User stuck on Auth screen"** | `wawapp_auth_session_check`, `wawapp_auth_flow_audit` |
| **"App looping infinitely"** | `wawapp_auth_loop_detector`, `wawapp_route_loop_diagnoser` |
| **"User bouncing between screens"** | `wawapp_route_loop_diagnoser`, `wawapp_auth_flow_audit` |
| **"PIN not working"** | `wawapp_pin_flow_checker`, `wawapp_auth_session_check` |
| **"Auth issues with multiple devices"** | `wawapp_multi_device_session_audit`, `wawapp_auth_session_check` |
| **"User stuck in onboarding"** | `wawapp_auth_flow_audit`, `wawapp_auth_session_check` |
| **"AuthGate rebuild loop"** | `wawapp_auth_loop_detector`, `wawapp_auth_flow_audit` |
| **"Need full diagnostic report"** | `wawapp_incident_report` (comprehensive first-line diagnostic) |
| **"Unknown user issue"** | `wawapp_incident_report` (aggregates all subsystems) |
| **"Notifications not reaching users"** | `wawapp_notification_analytics` |
| **"Duplicate orders/assignments"** | `wawapp_race_condition_detector` |
| **"Concurrent update bugs"** | `wawapp_race_condition_detector` |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Client (Claude)                       │
└──────────────────────┬──────────────────────────────────────┘
                       │ MCP Protocol
┌──────────────────────▼──────────────────────────────────────┐
│                  MCP Debug Server                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Security Layer (Rate Limiting, PII Masking, Audit)  │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         35 Tools across 10 Kits                      │   │
│  │  - Order Lifecycle (4)    - Location Intelligence (3) │   │
│  │  - Driver Matching (5)    - Notifications (4)        │   │
│  │  - Data Quality (3)       - Cloud Functions (3)      │   │
│  │  - System Health (5)      - Auth & App Flow (6)     │   │
│  │  - Scenario Atoms (int)   - Advanced Diagnostics (2) │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ Firebase Admin SDK
┌──────────────────────▼──────────────────────────────────────┐
│              Firebase/Firestore (Read-Only)                  │
│  - orders          - driver_locations                        │
│  - drivers         - notifications                           │
│  - users           - Cloud Logging                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Deployment Status

**Current Version**: 1.3.0
**Status**: Production Ready
**Tools**: 35/35 (100% Complete)
**Kits**: 10
**Build Status**: Passing

All 35 debugging tools are implemented, tested, and ready for production use.

**New in v1.3.0**: Kit 10 adds 2 advanced diagnostics tools — `wawapp_notification_analytics` (deep FCM delivery analytics) and `wawapp_race_condition_detector` (concurrent write/race condition detection).

**New in v1.2.0**: Added `wawapp_incident_report` - a unified meta-tool that aggregates signals from all subsystems for comprehensive first-line diagnostics.

**v1.1.0**: Kit 8 adds 6 tools for auth & app flow diagnostics (infinite loop detection, auth session consistency, PIN flow validation, multi-device conflicts).

For detailed tool specifications, see `COMPLETE_TOOLSET_PLAN.md`.
