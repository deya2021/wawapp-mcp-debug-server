# WawApp System Architecture

**Last Updated**: 2025-01-23
**Purpose**: Reference architecture for MCP debugging tools

---

## System Overview

WawApp is a production ridesharing platform for Mauritania with:

- **Client App**: Flutter app for passengers to request rides
- **Driver App**: Flutter app for drivers to accept and complete rides
- **Backend**: Firebase serverless (Firestore + Cloud Functions)
- **Real-time**: Firestore streams + FCM push notifications

---

## Firestore Collections

### `/orders` - Order Lifecycle

- **Purpose**: Tracks ride requests from creation to completion
- **Key Fields**:
  - `status`: matching | accepted | onRoute | completed | expired | cancelled
  - `ownerId`: Client UID
  - `driverId`: Assigned driver UID (set when status → accepted)
  - `assignedDriverId`: Same as driverId (legacy field)
  - `pickup`: { lat, lng, label }
  - `dropoff`: { lat, lng, label }
  - `createdAt`: Order creation timestamp
  - `completedAt`: Completion timestamp
  - `expiredAt`: Expiration timestamp (if auto-expired)

### `/drivers` - Driver Profiles

- **Purpose**: Driver account information and verification
- **Key Fields**:
  - `isVerified`: Boolean (admin-controlled, required for matching)
  - `isOnline`: Boolean (updated by app)
  - `city`: Required for profile completeness
  - `region`: Required for profile completeness
  - `vehicleType`: Required for profile completeness
  - `vehiclePlate`: Required for profile completeness
  - `vehicleColor`: Required for profile completeness
  - `rating`: Average driver rating
  - `totalTrips`: Trip count

### `/users` - Client Profiles

- **Purpose**: Client account information
- **Key Fields**:
  - `name`, `phone`, `fcmToken`
  - `fcmToken`: Used for push notifications (can be null if permissions denied)

### `/driver_locations` - Real-time GPS

- **Purpose**: Driver location tracking
- **Document ID**: Matches driver UID
- **Key Fields**:
  - `lat`, `lng`, `accuracy`, `timestamp`
- **Staleness Threshold**: 5 minutes

---

## Order Matching Logic

For a driver to see an order in "Nearby Orders":

1. **Driver Requirements**:

   - `isVerified = true` (in `/drivers/{driverId}`)
   - Profile complete (city, region, vehicle fields not null/empty)
   - `isOnline = true`
   - Location in `/driver_locations` exists and not stale (<5min old)

2. **Order Requirements**:

   - `status = "matching"` or `"requested"`
   - `assignedDriverId = null`
   - Order pickup location within **6.0 km** radius (Haversine)

3. **Query Flow**:
   ```
   Firestore query: /orders where assignedDriverId=null, orderBy createdAt desc, limit 50
   → Filter in-memory: status in [matching, requested]
   → Calculate distance: Haversine(driverLat, driverLng, orderPickup.lat, orderPickup.lng)
   → Filter: distance <= 6.0 km
   → Sort by distance (closest first)
   ```

---

## Cloud Functions

### `expireStaleOrders` (Scheduled: every 2 minutes)

- **Purpose**: Auto-expire orders stuck in matching >10 minutes
- **Logic**:
  ```
  Query: status=matching AND assignedDriverId=null AND createdAt < (now - 10min)
  Update: status → expired, expiredAt → serverTimestamp
  ```
- **Logs**: `[ExpireOrders]` prefix in Cloud Logging

### `notifyOrderEvents` (Firestore trigger)

- **Purpose**: Send FCM notifications on status changes
- **Triggers**:
  - matching → accepted: "تم قبول طلبك"
  - accepted → onRoute: "السائق في الطريق"
  - onRoute → completed: "اكتملت الرحلة"
  - matching → expired: "انتهت مهلة الطلب"
- **Logs**: `[NotifyOrderEvents]` prefix

### `aggregateDriverRating` (Firestore trigger)

- **Purpose**: Update driver average rating after trip completion
- **Trigger**: When `driverRating` field is set on completed order

---

## Production Values

- Nearby radius: **6.0 km**
- Location staleness: **5 minutes**
- Order expiration: **10 minutes** in matching status
- Function execution: expireStaleOrders runs **every 2 minutes**

---

**For incident debugging, see**: `common-incidents.md`
