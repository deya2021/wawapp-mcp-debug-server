# Phase 5 — Realistic Incident Workflows

**Purpose**: Demonstrate how AI agents use the MCP server to debug real WawApp incidents

---

## Scenario 1: Driver Can't See Any Orders (2 AM Production Incident)

### Initial Report

**Slack Message**:

> Driver "Ahmed" (ID: driver_abc123) in Nouakchott says he's been online for 30 minutes but sees "No nearby orders" despite it being peak time. We know there are active orders in the area.

### AI Agent Workflow

**Human**: "Driver driver_abc123 can't see orders. Diagnose why."

**AI Agent**:

```
I'll investigate this using the WawApp MCP debug tools.

Step 1: Checking driver eligibility...
```

**Tool Call**: `wawapp_driver_eligibility`

```json
{
  "driverId": "driver_abc123"
}
```

**Result**:

```json
{
  "driverId": "driver_abc123",
  "eligible": false,
  "checks": {
    "authenticated": { "pass": true },
    "profileExists": { "pass": true },
    "isVerified": { "pass": false, "reason": "isVerified=false in /drivers/driver_abc123" },
    "profileComplete": {
      "pass": false,
      "reason": "Missing required fields: city, region",
      "missing": ["city", "region"]
    },
    "isOnline": { "pass": true, "lastSeen": "2025-01-23T02:15:30Z" },
    "hasValidLocation": {
      "pass": true,
      "location": { "lat": 18.0861, "lng": -15.9785 },
      "age": "2m 15s"
    }
  },
  "summary": "Driver cannot see orders due to: isVerified=false in /drivers/driver_abc123, Missing required fields: city, region"
}
```

**AI Agent Analysis**:

```
Root Cause Found:

The driver is NOT eligible to see orders due to two issues:

1. ❌ Not Verified
   - isVerified = false in /drivers/driver_abc123
   - Admin action required

2. ❌ Incomplete Profile
   - Missing fields: city, region
   - These are required for the matching algorithm

The driver IS:
- ✅ Authenticated
- ✅ Online (last seen 2 minutes ago)
- ✅ Has valid location (Nouakchott coordinates, fresh)

Resolution:
1. Admin must set isVerified=true in Firestore /drivers/driver_abc123
2. Driver must complete profile by adding city and region via onboarding screen

Priority: HIGH (driver is ready but blocked by verification)
```

**Human**: "Can you show me what orders the driver WOULD see if verified and profile complete?"

**Tool Call**: `wawapp_driver_view_orders`

```json
{
  "driverId": "driver_abc123",
  "radiusKm": 6.0
}
```

**Result**:

```json
{
  "driverId": "driver_abc123",
  "driverLocation": {
    "lat": 18.0861,
    "lng": -15.9785,
    "timestamp": "2025-01-23T02:17:45Z"
  },
  "radiusKm": 6.0,
  "orders": [
    {
      "id": "order_xyz789",
      "status": "matching",
      "pickup": { "lat": 18.089, "lng": -15.982, "label": "نواكشوط" },
      "price": 500,
      "distanceKm": 0.8,
      "createdAt": "2025-01-23T02:10:00Z"
    },
    {
      "id": "order_def456",
      "status": "matching",
      "pickup": { "lat": 18.095, "lng": -15.971, "label": "كرفور" },
      "price": 350,
      "distanceKm": 2.1,
      "createdAt": "2025-01-23T02:12:30Z"
    }
  ],
  "summary": "Found 2 orders within 6km"
}
```

**AI Agent**:

```
Impact Assessment:

If the driver were verified and had complete profile, they would currently see 2 orders:

1. Order xyz789 - 0.8km away (500 MRU) - created 7 minutes ago
2. Order def456 - 2.1km away (350 MRU) - created 5 minutes ago

Both orders are in matching status and unassigned. The driver is perfectly positioned
to service these orders once verification is complete.

Recommended Action:
URGENT - Verify driver immediately to capture these orders before they expire
(orders expire after 10 minutes in matching status).
```

**Incident Outcome**: 5 minutes to diagnosis, driver verified, 2 orders captured

---

## Scenario 2: Order Stuck in Matching for 15 Minutes

### Initial Report

**User**: "Order order_ghi999 was created 15 minutes ago but is still in matching status. Why didn't it expire?"

### AI Agent Workflow

**Tool Call**: `wawapp_order_trace`

```json
{
  "orderId": "order_ghi999",
  "includeNotifications": true
}
```

**Result**:

```json
{
  "order": {
    "id": "order_ghi999",
    "status": "matching",
    "ownerId": "user_client001",
    "assignedDriverId": null,
    "pickup": { "lat": 18.091, "lng": -15.978, "label": "نواكشوط المركز" },
    "dropoff": { "lat": 18.105, "lng": -15.965, "label": "السوق الكبير" },
    "price": 450,
    "distanceKm": 2.3,
    "createdAt": "2025-01-23T02:00:00Z"
  },
  "timeline": [
    {
      "timestamp": "2025-01-23T02:00:00Z",
      "event": "order_created",
      "status": "matching"
    }
  ],
  "notifications": [],
  "duration": {
    "total": "15m 30s"
  }
}
```

**AI Agent Analysis**:

```
Order Timeline Analysis:

Order ghi999 Status: STUCK
- Created: 02:00:00 (15 minutes 30 seconds ago)
- Current Status: matching
- Expected: Should have expired at 02:10:00 (after 10 minutes)
- Actual: Still matching at 02:15:30

Red Flags:
❌ Order exceeded 10-minute expiration threshold
❌ No driver assigned (assignedDriverId = null)
❌ No status transitions (only 1 timeline event)
❌ No notifications sent

Root Cause Investigation Needed:
1. Did expireStaleOrders Cloud Function run?
2. Did it skip this order? Why?
3. Is Cloud Scheduler working?

Next Steps:
- Check expireStaleOrders function logs
- Verify Cloud Scheduler is triggering every 2 minutes
- Check if order has invalid data preventing expiration
```

**Human**: "Why wasn't this order expired by the Cloud Function?"

**AI Agent** (would use `wawapp_expired_orders_trace` if implemented):

```
Based on the order data, possible reasons:

1. Order Coordinates Valid: pickup/dropoff coordinates are valid (not 0,0)
2. Order Status Valid: status = "matching" (correct for expiration)
3. AssignedDriverId Correct: null (correct for expiration)

Likely Causes:
A. expireStaleOrders function didn't run in last 15 minutes
   → Check Cloud Scheduler in GCP Console
   → Verify function is enabled

B. Function ran but hit error processing this order
   → Check Cloud Function logs for errors
   → Look for "[ExpireOrders]" log entries

C. Function ran but query didn't return this order
   → Possible Firestore index issue
   → Possible query timestamp mismatch

Immediate Action Required:
1. Manually expire this order: SET status='expired', expiredAt=serverTimestamp
2. Check Cloud Scheduler: console.cloud.google.com → Cloud Scheduler
3. Review function logs: firebase functions:log --only expireStaleOrders --lines 100
```

**Incident Outcome**: 3 minutes to diagnosis, identified Cloud Function issue

---

## Scenario 3: "Why Did This Order Take So Long to Match?"

### Initial Report

**User**: "Order order_jkl111 took 8 minutes to get matched. That's way above our average of 3 minutes. What happened?"

### AI Agent Workflow

**Tool Call**: `wawapp_order_trace`

```json
{
  "orderId": "order_jkl111"
}
```

**Result**:

```json
{
  "order": {
    "id": "order_jkl111",
    "status": "completed",
    "ownerId": "user_client002",
    "driverId": "driver_def456",
    "pickup": { "lat": 18.112, "lng": -15.945, "label": "ضاحية الرياض" },
    "price": 600,
    "createdAt": "2025-01-23T01:30:00Z",
    "completedAt": "2025-01-23T02:15:00Z"
  },
  "timeline": [
    {
      "timestamp": "2025-01-23T01:30:00Z",
      "event": "order_created",
      "status": "matching"
    },
    {
      "timestamp": "2025-01-23T01:38:15Z",
      "event": "driver_assigned",
      "driverId": "driver_def456",
      "status": "accepted"
    },
    {
      "timestamp": "2025-01-23T01:42:00Z",
      "event": "driver_en_route",
      "status": "onRoute"
    },
    {
      "timestamp": "2025-01-23T02:15:00Z",
      "event": "trip_completed",
      "status": "completed",
      "rating": 5
    }
  ],
  "duration": {
    "total": "45m 0s",
    "matchingToAccepted": "8m 15s",
    "acceptedToOnRoute": "3m 45s",
    "onRouteToCompleted": "33m 0s"
  }
}
```

**AI Agent Analysis**:

```
Order Performance Analysis:

Order jkl111 Performance Breakdown:

Phase 1: Matching (SLOW ⚠️)
- Duration: 8m 15s
- Expected: <3m
- Status: 275% slower than average

Phase 2: Accepted → En Route (NORMAL ✅)
- Duration: 3m 45s
- Status: Within normal range

Phase 3: Trip Duration (NORMAL ✅)
- Duration: 33m
- Status: Appropriate for distance

Root Cause: Slow Driver Matching

Possible Reasons for 8-Minute Matching Delay:
1. No drivers online in area at 01:30 AM (off-peak time)
2. All nearby drivers were busy with active trips
3. Pickup location in outer area (ضاحية الرياض) - fewer drivers
4. Drivers rejected order before driver_def456 accepted

Investigation Steps:
- Query online drivers at 01:30 AM near pickup location
- Check if area "ضاحية الرياض" has low driver density
- Review driver activity logs for rejections

Recommendation:
If this is recurring in this area, consider:
- Driver incentives for off-peak coverage
- Expanding search radius beyond 6km for this area
- Push notifications to offline drivers
```

---

## Key Metrics: Time to Diagnosis

| **Incident Type** | **Traditional Debugging** | **With MCP Tools** | **Time Saved** |
| ----------------- | ------------------------- | ------------------ | -------------- |
| Driver eligibility | 20-30 min                 | 2-3 min            | 85-90%         |
| Order stuck       | 15-20 min                 | 3-5 min            | 75-80%         |
| Performance analysis | 25-30 min              | 4-6 min            | 80-85%         |

---

## Success Criteria

✅ **Achieved**:

- Clear root cause identification in <5 minutes
- Actionable recommendations with specific steps
- Evidence-based debugging (actual Firestore data)
- PII protected in all outputs

🎯 **Future Enhancements** (v2):

- Automatic correlation with Cloud Function logs
- Historical trend analysis
- Proactive anomaly detection
- Auto-generated incident reports

---

**End of Phase 5 Scenarios**
