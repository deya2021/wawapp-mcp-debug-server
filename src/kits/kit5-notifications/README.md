# Kit 5: Notification Delivery Tracker

Debug FCM notifications and identify delivery issues.

---

## Tools

### 1. `wawapp_fcm_token_status`

Check FCM token health for a user.

**Use cases:**
- User not receiving notifications
- Verify token after app reinstall
- Check token freshness

**Example:**
```json
{
  "userId": "user_abc123",
  "userType": "client"
}
```

**Output:**
```json
{
  "userId": "user_abc123",
  "userType": "client",
  "tokenExists": true,
  "token": "dXJhY2xlX3Rva2VuX2...(142 more chars)",
  "tokenAge": "3d 12h ago",
  "lastUpdated": "2025-01-23T10:30:00Z",
  "hasNotificationPermission": true,
  "issues": [],
  "recommendation": "Token is healthy and up-to-date."
}
```

---

### 2. `wawapp_notification_trace`

Trace all notifications for an order.

**Use cases:**
- User didn't receive order notification
- Verify notification timeline
- Debug notification logic

**Example:**
```json
{
  "orderId": "order_xyz789"
}
```

**Output:**
```json
{
  "orderId": "order_xyz789",
  "orderStatus": "completed",
  "ownerId": "user_client001",
  "driverId": "driver_abc123",
  "notifications": [
    {
      "timestamp": "2025-01-23T10:32:15Z",
      "type": "driver_accepted",
      "recipient": "client",
      "userId": "user_client001",
      "title": "تم قبول طلبك",
      "body": "قبل السائق طلبك وهو في الطريق إليك",
      "status": "unknown",
      "orderStatus": "accepted"
    }
  ],
  "summary": {
    "totalSent": 3,
    "totalDelivered": 0,
    "totalFailed": 0,
    "clientNotifications": 3,
    "driverNotifications": 0
  }
}
```

---

### 3. `wawapp_notification_delivery_check`

Comprehensive notification delivery diagnostics.

**Use cases:**
- User reports "not receiving any notifications"
- Proactive health check
- Debug setup after app install

**Example:**
```json
{
  "userId": "driver_abc123",
  "userType": "driver"
}
```

**Output:**
```json
{
  "userId": "driver_abc123",
  "userType": "driver",
  "canReceiveNotifications": true,
  "checks": {
    "fcmTokenExists": {
      "check": "FCM Token Exists",
      "status": "pass",
      "details": "Token: dXJhY2xlX3Rva2VuX... (165 chars)"
    },
    "fcmTokenFresh": {
      "check": "FCM Token is Fresh",
      "status": "pass",
      "details": "Token is 5 days old (updated 5d ago)"
    },
    "userProfileExists": {
      "check": "User Profile Exists",
      "status": "pass",
      "details": "Profile found in /drivers/driver_abc123"
    },
    "deviceConnectivity": {
      "check": "Device Recently Active",
      "status": "pass",
      "details": "User was active 15m ago"
    },
    "appVersion": {
      "check": "App Version Supports FCM",
      "status": "pass",
      "details": "User is on build 42"
    }
  },
  "summary": "✅ User can receive notifications - all checks passed",
  "recommendations": [
    "All checks passed - notifications should be delivered successfully"
  ]
}
```

---

## Common Scenarios

### Scenario 1: User Not Receiving Notifications

**Workflow:**

1. Check token status:
   ```
   wawapp_fcm_token_status { userId: "...", userType: "..." }
   ```

2. Run delivery check:
   ```
   wawapp_notification_delivery_check { userId: "...", userType: "..." }
   ```

3. If token missing:
   - User needs to grant notification permissions
   - Restart app to trigger FCM registration

4. If token stale:
   - User should logout and login to refresh token

---

### Scenario 2: Order Notification Not Delivered

**Workflow:**

1. Trace order notifications:
   ```
   wawapp_notification_trace { orderId: "order_xyz789" }
   ```

2. Check client FCM token:
   ```
   wawapp_fcm_token_status { userId: "<ownerId>", userType: "client" }
   ```

3. Manual verification:
   - Check Firebase Console > Cloud Messaging > Reports
   - Check Cloud Function logs: `firebase functions:log --only notifyOrderEvents`

---

## Limitations (v1)

⚠️ **Cannot verify delivery status automatically**

In v1, we can only:
- Check if FCM token exists
- Verify token is fresh
- Show expected notifications based on order transitions

We **cannot** verify:
- Whether FCM actually delivered the notification
- Whether user received it on their device
- Whether background handler processed it

**Manual verification required:**
- Firebase Console > Cloud Messaging > Reports
- Cloud Function logs
- Ask user directly

---

## Future Enhancements (v2)

Planned features:
- Integration with Cloud Logging to query FCM delivery logs
- Notification delivery status from Firebase reports API
- Background handler crash detection
- Notification click/open analytics

---

## Development Notes

**Dependencies:**
- `firestore-client.ts` - For querying users/drivers collections
- `pii-masker.ts` - For masking FCM tokens
- `time-helpers.ts` - For calculating token age

**Security:**
- FCM tokens are masked (first 20 chars only shown)
- Read-only - no writes to Firestore
- Rate limited (10 requests/min per tool)

---

## Testing

**Test with real data:**

```bash
# Build
npm run build

# Test token status
node -e "
const kit5 = require('./dist/kits/kit5-notifications/index.js');
kit5.fcmTokenStatus({ userId: 'test_user_123', userType: 'client' })
  .then(console.log)
  .catch(console.error);
"
```

**Expected output:**
- Token status with masked token
- Token age calculation
- Issues and recommendations

---

**Kit 5 Status:** ✅ Implemented (v1)
**Tools:** 3/4 planned (75% complete)
**Next:** Add notification click analytics tool
