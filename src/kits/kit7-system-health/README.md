# Kit 7: System Health Dashboard

Comprehensive system monitoring and health assessment for WawApp.

---

## Tools

### 1. `wawapp_system_health`

Provides a complete system health overview across all key metrics.

**Use cases:**
- Daily system health check (morning routine)
- Proactive issue detection
- Executive dashboard metrics
- Incident investigation starting point

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
  "metrics": {
    "orders": {
      "total": {
        "metric": "Total Orders",
        "value": 125,
        "status": "healthy"
      },
      "active": {
        "metric": "Active Orders (matching/accepted/onRoute)",
        "value": 8,
        "status": "healthy"
      },
      "staleMatching": {
        "metric": "Stale Matching Orders (>10 min)",
        "value": 3,
        "status": "critical",
        "threshold": ">0"
      }
    },
    "drivers": {
      "total": {
        "metric": "Total Drivers",
        "value": 45,
        "status": "healthy"
      },
      "online": {
        "metric": "Online Drivers",
        "value": 12,
        "status": "warning",
        "threshold": "<15"
      },
      "verified": {
        "metric": "Verified Drivers",
        "value": 38,
        "status": "healthy"
      }
    },
    "performance": {
      "completionRate": {
        "metric": "Completion Rate",
        "value": "85.2%",
        "status": "healthy"
      },
      "ratingRate": {
        "metric": "Rating Rate",
        "value": "78.5%",
        "status": "healthy"
      }
    }
  },
  "summary": {
    "healthy": 8,
    "warning": 1,
    "critical": 1,
    "unknown": 0
  },
  "overallHealth": "degraded",
  "criticalAlerts": [
    "⚠️ 3 order(s) stuck in matching >10 minutes",
    "⚠️ Only 12 driver(s) online (threshold: 15)"
  ],
  "recommendations": [
    "Check Cloud Scheduler for expireStaleOrders function",
    "Recruit more drivers or incentivize online time"
  ]
}
```

---

### 2. `wawapp_active_users`

Shows active users (drivers and clients) with engagement insights.

**Use cases:**
- Monitor current system load
- Understand peak usage times
- Track client-to-driver ratio
- Identify inactive periods

**Example:**
```json
{
  "timeRangeMinutes": 60,
  "userType": "all"
}
```

**Output:**
```json
{
  "timestamp": "2025-01-26T15:30:00Z",
  "timeRange": "Last 60 minutes",
  "summary": {
    "totalActiveDrivers": 12,
    "totalActiveClients": 34,
    "onlineDrivers": 12,
    "offlineDrivers": 0,
    "verifiedDrivers": 10,
    "unverifiedDrivers": 2
  },
  "drivers": [
    {
      "userId": "driver_abc123",
      "name": "Ahmed Ali",
      "phone": "05xxxxxxxx",
      "online": true,
      "verified": true,
      "location": "31.9454,35.9284",
      "lastActivity": "2025-01-26T15:28:00Z",
      "minutesAgo": 2
    }
  ],
  "clients": [
    {
      "userId": "user_xyz789",
      "name": "Sara Mohammed",
      "phone": "05xxxxxxxx",
      "lastActivity": "2025-01-26T15:25:00Z",
      "minutesAgo": 5,
      "recentOrders": 1
    }
  ],
  "insights": [
    "🚗 12 driver(s) currently online",
    "👥 Client-to-driver ratio: 2.8:1",
    "✅ 83.3% of active drivers are verified",
    "📊 Peak activity in last 60 minutes"
  ],
  "recommendations": [
    "System load is balanced",
    "Consider recruiting 3-5 more drivers for peak times"
  ]
}
```

---

## Health Status Thresholds

### Orders Metrics
- **Total Orders**: Healthy if >0 in time range
- **Active Orders**: Healthy if >0
- **Completed Orders**: Healthy if completion rate >80%
- **Stale Matching**: Critical if any order >10 min in matching

### Drivers Metrics
- **Total Drivers**: Healthy if >20
- **Online Drivers**: Warning if <15, Critical if <5
- **Verified Drivers**: Healthy if >80% of total

### Performance Metrics
- **Completion Rate**: Healthy if >80%, Warning if 60-80%, Critical if <60%
- **Rating Rate**: Healthy if >70%, Warning if 50-70%

---

## Common Scenarios

### Scenario 1: Daily Health Check

**Morning Routine:**

1. Check system health for last 24 hours:
   ```
   wawapp_system_health { timeRangeMinutes: 1440 }
   ```

2. Review active users:
   ```
   wawapp_active_users { timeRangeMinutes: 1440 }
   ```

3. If issues detected, drill down:
   - Stale orders → use Kit 6 function health check
   - Low drivers → recruitment campaign
   - Low completion rate → investigate order flow

**Time:** <2 minutes for complete overview

---

### Scenario 2: Incident Investigation

**Problem:** "System seems slow, orders not completing"

**Workflow:**

1. Get system overview:
   ```
   wawapp_system_health { timeRangeMinutes: 60 }
   ```

2. Result shows:
   ```
   overallHealth: "critical"
   criticalAlerts: ["3 orders stuck in matching"]
   ```

3. Check Cloud Functions:
   ```
   wawapp_function_health_check { timeRangeMinutes: 60 }
   ```

4. Check driver availability:
   ```
   wawapp_active_users { timeRangeMinutes: 60, userType: "drivers" }
   ```

5. Result shows:
   ```
   onlineDrivers: 2 (very low)
   clientToDriverRatio: 15:1 (high demand)
   ```

**Root Cause:** Not enough drivers online
**Solution:** Notify drivers, offer incentives

**Time:** <5 minutes from problem to solution

---

### Scenario 3: Executive Dashboard

**Weekly Metrics Report:**

1. System health overview (last 7 days):
   ```
   wawapp_system_health { timeRangeMinutes: 10080 }
   ```

2. Active user trends:
   ```
   wawapp_active_users { timeRangeMinutes: 10080 }
   ```

3. Key metrics to report:
   - Total orders created
   - Completion rate
   - Average online drivers
   - Client-to-driver ratio
   - System health status

**Time:** <3 minutes to gather all metrics

---

## Integration with Other Kits

### With Kit 1 (Order Lifecycle):
```plaintext
1. wawapp_system_health → Identify stale orders
2. wawapp_order_trace { orderId } → Investigate specific order
```

### With Kit 5 (Notifications):
```plaintext
1. wawapp_system_health → Check completion rate
2. wawapp_notification_delivery_check → Verify notifications working
```

### With Kit 6 (Cloud Functions):
```plaintext
1. wawapp_system_health → Detect critical issues
2. wawapp_function_health_check → Diagnose function problems
```

---

## Metrics Calculations

### Completion Rate
```
completionRate = (completedOrders / (completedOrders + expiredOrders)) * 100
```

### Rating Rate
```
ratingRate = (ordersWithRating / completedOrders) * 100
```

### Client-to-Driver Ratio
```
ratio = activeClients / onlineDrivers
```

### Stale Orders
```
staleOrders = orders where:
  - status == "matching"
  - assignedDriverId == null
  - createdAt < (now - 10 minutes)
```

---

## Real-World Examples

### Example 1: Healthy System

**Input:**
```json
{ "timeRangeMinutes": 60 }
```

**Result:**
```
Overall Health: healthy ✅
- 45 orders created, 38 completed (84% completion rate)
- 15 drivers online, 12 verified
- No stale orders
- Rating rate: 82%

Recommendations: System operating normally
```

---

### Example 2: Critical Issues

**Input:**
```json
{ "timeRangeMinutes": 60 }
```

**Result:**
```
Overall Health: critical 🔴
- 5 orders stuck in matching >10 minutes
- Only 3 drivers online (threshold: 15)
- Completion rate: 45% (very low)

Critical Alerts:
⚠️ 5 order(s) stuck in matching >10 minutes
⚠️ Only 3 driver(s) online (critical: <5)

Recommendations:
1. Check Cloud Scheduler (expireStaleOrders)
2. Urgent: Recruit/notify more drivers
3. Investigate order matching algorithm
```

---

### Example 3: Peak Usage

**Input:**
```json
{ "timeRangeMinutes": 60, "userType": "all" }
```

**Result:**
```
Active Users Summary:
- 25 drivers online (peak time)
- 62 active clients
- Client-to-driver ratio: 2.5:1 (balanced)

Insights:
🚗 25 driver(s) currently online
👥 Client-to-driver ratio: 2.5:1
📊 Peak activity detected

Recommendations:
System load is well-balanced
```

---

## Limitations (v1)

### What Cannot Be Done:

1. **Historical Trends:** Only snapshot data (no time-series analysis)
2. **Real-time Monitoring:** Snapshot queries only (not streaming)
3. **Predictive Analytics:** No forecasting or predictions
4. **Automatic Remediation:** Recommendations only (no auto-fix)

### Workarounds:

- Run regular health checks (every hour, daily)
- Export metrics to spreadsheet for manual trend analysis
- Use Cloud Console for real-time monitoring
- Manual intervention based on recommendations

---

## Future Enhancements (v2)

### Planned Features:

1. **Historical Trend Analysis:**
   - Time-series graphs
   - Week-over-week comparisons
   - Peak usage identification

2. **Real-time Monitoring:**
   - Streaming queries
   - Live dashboard
   - Alert system

3. **Predictive Analytics:**
   - Demand forecasting
   - Driver shortage predictions
   - Performance trend predictions

4. **Automatic Remediation:**
   - Auto-notify drivers when demand high
   - Auto-scale Cloud Functions
   - Smart recommendations based on ML

---

## Performance Tips

### Optimize Time Range:
- Use 60 minutes for recent issues
- Use 1440 minutes (24 hours) for daily check
- Use 10080 minutes (7 days) for weekly reports

### Filter by User Type:
```json
// Check only drivers
{ "timeRangeMinutes": 60, "userType": "drivers" }

// Check only clients
{ "timeRangeMinutes": 60, "userType": "clients" }

// Check both (default)
{ "timeRangeMinutes": 60, "userType": "all" }
```

---

## Security & Privacy

✅ **Read-Only:** All tools query only, no writes
✅ **PII Masking:** Phone numbers masked (05xxxxxxxx)
✅ **Rate Limiting:** 10 requests/min per tool
✅ **Audit Logging:** All executions logged

---

**Kit 7 Status:** ✅ Complete (v1)
**Tools:** 2/4 planned (50% complete)
**Next:** Historical trends + real-time monitoring
