/**
 * TypeScript types for all MCP tool inputs and outputs
 */

// Kit 2: Driver Matching Diagnostics

export interface DriverEligibilityInput {
  driverId: string;
}

export interface DriverEligibilityCheck {
  pass: boolean;
  reason?: string;
  missing?: string[];
  location?: { lat: number; lng: number };
  age?: string;
  lastSeen?: string;
}

export interface DriverEligibilityOutput {
  driverId: string;
  eligible: boolean;
  checks: {
    authenticated: DriverEligibilityCheck;
    profileExists: DriverEligibilityCheck;
    isVerified: DriverEligibilityCheck;
    profileComplete: DriverEligibilityCheck;
    isOnline: DriverEligibilityCheck;
    hasValidLocation: DriverEligibilityCheck;
  };
  summary: string;
}

// Kit 1: Order Lifecycle

export interface OrderTraceInput {
  orderId: string;
  includeNotifications?: boolean;
}

export interface OrderTimelineEvent {
  timestamp: string;
  event: string;
  status: string;
  driverId?: string;
  rating?: number;
}

export interface OrderTraceOutput {
  order: any;
  timeline: OrderTimelineEvent[];
  notifications: any[];
  duration: Record<string, string>;
}

// Kit 5: Notifications

export interface NotificationTraceInput {
  orderId: string;
}

export interface NotificationEvent {
  timestamp: string;
  type: string;
  recipient: string;
  fcmToken?: string;
  deliveryResult: string;
  fcmMessageId?: string;
  deepLink?: string;
  error?: string;
}

export interface NotificationTraceOutput {
  orderId: string;
  notifications: NotificationEvent[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}
