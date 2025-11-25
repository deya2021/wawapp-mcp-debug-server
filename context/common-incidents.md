# Common WawApp Incidents & Debugging Playbook

---

## Incident 1: Driver Can't See Orders

### Symptoms

- Driver app shows "لا توجد طلبات قريبة" (No nearby orders)
- Driver complains despite active orders visible in Firestore console

### Diagnostic Steps

1. **Check Driver Eligibility**

   ```
   Tool: wawapp_driver_eligibility
   Input: { driverId: "driver_xxx" }
   ```

   - Look for failed checks: `isVerified`, `profileComplete`, `isOnline`, `hasValidLocation`

2. **Simulate Driver's View**
   ```
   Tool: wawapp_driver_view_orders
   Input: { driverId: "driver_xxx" }
   ```
   - Shows exactly which orders driver should see
   - Empty result = no orders within 6km OR driver not eligible

### Common Root Causes

| **Cause**                            | **Fix**                                                | **Authority** |
| ------------------------------------ | ------------------------------------------------------ | ------------- |
| `isVerified=false`                   | Admin sets `isVerified=true` in Firestore              | Admin         |
| Profile incomplete (missing city/region) | Driver completes onboarding                        | Driver        |
| `isOnline=false`                     | Driver opens app and toggles online                    | Driver        |
| Stale location (>5min old)           | Driver restarts app / grants location permission       | Driver        |
| Orders outside 6km radius            | No fix (system working correctly)                      | N/A           |
| Firestore index missing              | Deploy index via `firebase deploy --only firestore:indexes` | DevOps   |

---

## Incident 2: Order Stuck in Matching

### Symptoms

- Order created >10 minutes ago
- Still has `status=matching`
- Should have been auto-expired

### Diagnostic Steps

1. **Trace Order Lifecycle**
   ```
   Tool: wawapp_order_trace
   Input: { orderId: "order_abc" }
   ```
   - Check timeline: when was order created?
   - Check status: is it truly still "matching"?

### Common Root Causes

| **Cause**                     | **Fix**                                      |
| ----------------------------- | -------------------------------------------- |
| No drivers online in area     | Wait for drivers to come online              |
| expireStaleOrders function failed | Check Cloud Function logs, redeploy if needed |
| Cloud Scheduler not triggering | Check Cloud Scheduler in GCP console        |
| Order has invalid coordinates (0,0) | Data integrity issue, mark as expired manually |

---

## Quick Reference: Tool Selection by Symptom

| **Symptom**              | **First Tool to Run**        |
| ------------------------ | ---------------------------- |
| Driver can't see orders  | `wawapp_driver_eligibility`  |
| Order stuck in matching  | `wawapp_order_trace`         |
| System-wide issue        | Coming in v2                 |

---

**For tool usage guide, see**: `debugging-workflow.md`
