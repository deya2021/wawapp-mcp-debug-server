# Kit 6: Cloud Function Execution Observer

Monitor and debug Cloud Functions for WawApp.

---

## Tools

### 1. `wawapp_function_execution_trace`

Trace which Cloud Functions should have executed for an order.

**Use cases:**
- Order stuck in matching (check expireStaleOrders)
- Client didn't receive notification (check notifyOrderEvents)
- Driver rating not updated (check aggregateDriverRating)

**Example:**
```json
{
  "orderId": "order_xyz789",
  "functionName": "all"
}
```

**Output:**
```json
{
  "orderId": "order_xyz789",
  "orderStatus": "matching",
  "executions": [
    {
      "function": "notifyOrderEvents",
      "expectedTrigger": "No status transition yet",
      "status": "not_applicable",
      "reasoning": "Order still in initial matching status"
    },
    {
      "function": "expireStaleOrders",
      "expectedTrigger": "Scheduled (every 2 minutes)",
      "status": "should_have_executed",
      "reasoning": "Order is 15 minutes old and still in matching",
      "manualVerification": "Check Cloud Scheduler and function logs"
    }
  ],
  "summary": {
    "totalExpected": 3,
    "likelyExecuted": 0,
    "shouldHaveExecuted": 1,
    "notApplicable": 2
  }
}
```

---

### 2. `wawapp_function_health_check`

System-wide health check for Cloud Functions.

**Use cases:**
- Proactive monitoring
- Diagnose system-wide issues
- Verify Cloud Functions are running

**Example:**
```json
{
  "timeRangeMinutes": 60
}
```

**Output:**
```json
{
  "timestamp": "2025-01-26T15:30:00Z",
  "timeRange": "Last 60 minutes",
  "checks": {
    "staleOrdersPresence": {
      "check": "No Stale Orders (>10 min in matching)",
      "status": "unhealthy",
      "details": "Found 3 order(s) >10 minutes old still in matching",
      "recommendation": "expireStaleOrders may not be running"
    },
    "recentOrdersActivity": {
      "check": "Recent Orders Activity",
      "status": "healthy",
      "details": "5 order(s) created in last 60 minutes"
    }
  },
  "summary": {
    "healthy": 2,
    "warnings": 0,
    "unhealthy": 1,
    "unknown": 1
  },
  "overallHealth": "unhealthy"
}
```

---

## Cloud Functions in WawApp

### 1. `notifyOrderEvents`

**Trigger:** Firestore onCreate/onUpdate (`orders/{orderId}`)

**What it does:**
- Sends FCM notifications on order status changes
- matching → accepted: "Driver accepted your order"
- accepted → onRoute: "Driver is on the way"
- onRoute → completed: "Trip completed"
- matching → expired: "Order expired"

**Logs format:**
```
[FCM] Sending notification: order_abc123, type: driver_accepted
[FCM] Notification sent successfully to: user_xyz
```

---

### 2. `expireStaleOrders`

**Trigger:** Cloud Scheduler (every 2 minutes)

**What it does:**
- Queries orders where:
  - status == 'matching'
  - assignedDriverId == null
  - createdAt < (now - 10 minutes)
- Updates status to 'expired'

**Logs format:**
```
[ExpireOrders] Function triggered at: 2025-01-26T15:30:00Z
[ExpireOrders] Found 3 stale orders to expire
[ExpireOrders] Expiring order: order_abc123, age: 12 minutes
```

---

### 3. `aggregateDriverRating`

**Trigger:** Firestore onUpdate (`orders/{orderId}`) when rating added

**What it does:**
- Calculates new average rating for driver
- Updates `/drivers/{driverId}/averageRating`
- Updates `/drivers/{driverId}/totalRatings`

**Logs format:**
```
[Rating] Order order_abc123 rated: 5 stars
[Rating] Driver driver_xyz new average: 4.8 (from 20 ratings)
```

---

## Common Scenarios

### Scenario 1: Order Stuck in Matching for 15 Minutes

**Workflow:**

1. Trace function executions:
   ```
   wawapp_function_execution_trace { orderId: "order_xyz" }
   ```

2. Result shows:
   ```
   expireStaleOrders:
     status: "should_have_executed"
     reasoning: "Order is 15 minutes old"
   ```

3. Check Cloud Scheduler:
   ```bash
   gcloud scheduler jobs list
   ```

4. Check function logs:
   ```bash
   firebase functions:log --only expireStaleOrders --lines 50
   ```

**Common causes:**
- Cloud Scheduler paused
- Function deployment failed
- Firestore indexes missing
- Function timeout or error

---

### Scenario 2: System-Wide Check

**Workflow:**

1. Run health check:
   ```
   wawapp_function_health_check { timeRangeMinutes: 60 }
   ```

2. Result shows:
   ```
   overallHealth: "unhealthy"
   staleOrdersPresence: "unhealthy" (3 orders)
   ```

3. Manual verification:
   - Check Cloud Scheduler: https://console.cloud.google.com/cloudscheduler
   - Check function status: `firebase functions:list`
   - View logs: `firebase functions:log --lines 100`

---

## Manual Verification Commands

### View all function logs
```bash
firebase functions:log --lines 100
```

### View specific function logs
```bash
firebase functions:log --only notifyOrderEvents --lines 50
firebase functions:log --only expireStaleOrders --lines 50
firebase functions:log --only aggregateDriverRating --lines 50
```

### Filter logs by order ID
```bash
firebase functions:log --lines 100 | grep order_xyz789
```

### Check Cloud Scheduler status
```bash
gcloud scheduler jobs list
gcloud scheduler jobs describe expireStaleOrders
```

### List deployed functions
```bash
firebase functions:list
```

---

## Limitations (v1)

⚠️ **Cannot query Cloud Logging automatically**

Kit 6 tools analyze Firestore data to infer function execution, but cannot:
- Verify actual function execution from logs
- Get exact execution timestamps
- See function errors directly
- Check function performance metrics

**Workarounds:**
- Manual log checking via Firebase CLI
- Cloud Console monitoring
- Firestore-based inference (what Kit 6 does)

---

## Future Enhancements (v2)

Planned features:
- Cloud Logging API integration
- Automatic log parsing
- Function error detection
- Performance metrics
- Execution timeline visualization

---

**Kit 6 Status:** ✅ Implemented (v1)
**Tools:** 2/3 planned (67% complete)
**Next:** Add Cloud Logging integration
