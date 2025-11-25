/**
 * TypeScript interfaces matching WawApp Dart models
 * Must stay in sync with packages/core_shared/lib/src/
 */

export interface Order {
  id: string;
  ownerId: string;
  driverId?: string;
  assignedDriverId?: string;
  distanceKm: number;
  price: number;
  pickupAddress: string;
  dropoffAddress: string;
  pickup: LocationPoint;
  dropoff: LocationPoint;
  status: OrderStatus;
  createdAt: Date;
  updatedAt?: Date;
  completedAt?: Date;
  expiredAt?: Date;
  driverRating?: number;
  ratedAt?: Date;
}

export interface LocationPoint {
  lat: number;
  lng: number;
  label: string;
}

export type OrderStatus =
  | 'matching'
  | 'requested'
  | 'assigning'
  | 'accepted'
  | 'onRoute'
  | 'completed'
  | 'expired'
  | 'cancelled'
  | 'cancelledByClient'
  | 'cancelledByDriver';

export interface DriverProfile {
  id: string;
  name: string;
  phone: string;
  photoUrl?: string;
  vehicleType?: string;
  vehiclePlate?: string;
  vehicleColor?: string;
  city?: string;
  region?: string;
  isVerified: boolean;
  isOnline: boolean;
  rating: number;
  totalTrips: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientProfile {
  id: string;
  name: string;
  phone: string;
  photoUrl?: string;
  fcmToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp: Date;
}
