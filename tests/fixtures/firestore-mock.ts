/**
 * Firestore Mock for Deterministic Testing
 *
 * Provides mock data for golden output generation.
 * All timestamps are fixed for deterministic snapshots.
 */

export const MOCK_TIMESTAMP = new Date('2025-12-13T10:00:00.000Z');
export const MOCK_TIMESTAMP_STALE = new Date('2025-09-01T10:00:00.000Z'); // ~104 days old

export const MOCK_DRIVERS = {
  // Complete driver with all fields
  'driver_complete': {
    id: 'driver_complete',
    name: 'Ahmed Hassan',
    phone: '+966501234567',
    city: 'Riyadh',
    region: 'Central',
    isOnline: true,
    isVerified: true,
    fcmToken: 'fcm_token_valid_123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890',
    fcmTokenUpdatedAt: MOCK_TIMESTAMP,
  },

  // Driver missing name (FAIL-REAL-001)
  'driver_missing_name': {
    id: 'driver_missing_name',
    phone: '+966501234567',
    city: 'Riyadh',
    region: 'Central',
    isOnline: true,
    isVerified: true,
  },

  // Driver offline
  'driver_offline': {
    id: 'driver_offline',
    name: 'Khalid Ali',
    phone: '+966501234567',
    city: 'Jeddah',
    region: 'Western',
    isOnline: false,
    isVerified: true,
  },

  // Driver with stale FCM token
  'driver_stale_token': {
    id: 'driver_stale_token',
    name: 'Mohammed Saleh',
    phone: '+966501234567',
    city: 'Riyadh',
    region: 'Central',
    isOnline: true,
    isVerified: true,
    fcmToken: 'fcm_token_stale_123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890',
    fcmTokenUpdatedAt: MOCK_TIMESTAMP_STALE,
  },

  // Driver with missing FCM token
  'driver_no_token': {
    id: 'driver_no_token',
    name: 'Faisal Abdullah',
    phone: '+966501234567',
    city: 'Riyadh',
    region: 'Central',
    isOnline: true,
    isVerified: true,
  },
};

export const MOCK_DRIVER_LOCATIONS = {
  'driver_complete': {
    id: 'driver_complete',
    latitude: 24.7136,
    longitude: 46.6753,
    lastUpdated: MOCK_TIMESTAMP,
  },

  'driver_missing_name': {
    id: 'driver_missing_name',
    latitude: 24.7136,
    longitude: 46.6753,
    lastUpdated: new Date('2025-12-13T03:00:00.000Z'), // 7 hours old - STALE
  },

  'driver_offline': {
    id: 'driver_offline',
    latitude: 21.4225,
    longitude: 39.8262,
    lastUpdated: MOCK_TIMESTAMP,
  },
};

export const MOCK_ORDERS = {
  'order_matching': {
    id: 'order_matching',
    status: 'matching',
    ownerId: 'client_123',
    pickupLat: 24.7136,
    pickupLng: 46.6753,
    createdAt: MOCK_TIMESTAMP,
    updatedAt: MOCK_TIMESTAMP,
  },

  'order_accepted': {
    id: 'order_accepted',
    status: 'accepted',
    ownerId: 'client_123',
    driverId: 'driver_complete',
    pickupLat: 24.7136,
    pickupLng: 46.6753,
    createdAt: MOCK_TIMESTAMP,
    updatedAt: MOCK_TIMESTAMP,
  },
};

/**
 * Mock Firestore client for tests
 */
export class MockFirestoreClient {
  async getDocument(collection: string, docId: string): Promise<any | null> {
    if (collection === 'drivers') {
      return (MOCK_DRIVERS as any)[docId] || null;
    }

    if (collection === 'driver_locations') {
      return (MOCK_DRIVER_LOCATIONS as any)[docId] || null;
    }

    if (collection === 'orders') {
      return (MOCK_ORDERS as any)[docId] || null;
    }

    // Collections that don't exist (for INCONCLUSIVE tests)
    if (collection === 'notification_logs' ||
        collection === 'function_logs' ||
        collection === 'listener_telemetry') {
      throw new Error('Collection not found');
    }

    return null;
  }

  async queryDocuments(
    collection: string,
    filters: any[] = [],
    options: any = {}
  ): Promise<any[]> {
    // For INCONCLUSIVE tests - logging collections don't exist
    if (collection === 'notification_logs' ||
        collection === 'function_logs' ||
        collection === 'listener_telemetry') {
      throw new Error('Collection not found');
    }

    return [];
  }

  timestampToDate(timestamp: any): Date | null {
    if (!timestamp) return null;
    if (timestamp instanceof Date) return timestamp;
    if (timestamp._seconds !== undefined) {
      return new Date(timestamp._seconds * 1000);
    }
    return null;
  }
}
