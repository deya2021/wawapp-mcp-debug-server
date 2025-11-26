import {
  GPS_PRECISION_DECIMALS,
  MASK_PHONE_NUMBERS,
  MASK_NAMES,
  ROUND_GPS_COORDINATES,
} from '../config/constants.js';

export function maskPhone(phone: string): string {
  if (!phone || !MASK_PHONE_NUMBERS) return phone;

  // "+222 36123456" → "+222 3*** ****"
  // Handles various formats
  const match = phone.match(/(\+\d{3}\s?)(\d{1,2})(\d+)/);
  if (match) {
    return `${match[1]}${match[2]}*** ****`;
  }

  // Fallback: mask middle portion
  if (phone.length > 6) {
    return phone.substring(0, 3) + '***' + phone.substring(phone.length - 3);
  }

  return '***';
}

export function maskName(name: string): string {
  if (!name || !MASK_NAMES) return name;

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];

  // "Ahmed Mohamed" → "Ahmed M***"
  return `${parts[0]} ${parts[1][0]}***`;
}

export function roundCoordinates(
  lat: number,
  lng: number,
  decimals: number = GPS_PRECISION_DECIMALS
): { lat: number; lng: number } {
  if (!ROUND_GPS_COORDINATES) {
    return { lat, lng };
  }

  const factor = Math.pow(10, decimals);
  return {
    lat: Math.round(lat * factor) / factor,
    lng: Math.round(lng * factor) / factor,
  };
}

export interface MaskRules {
  maskPhone?: boolean;
  maskName?: boolean;
  roundGPS?: boolean;
}

export function maskDocument(doc: any, rules: MaskRules = {}): any {
  if (!doc) return doc;

  // Deep clone
  const masked = JSON.parse(JSON.stringify(doc));

  // Apply phone masking
  if (rules.maskPhone !== false && masked.phone) {
    masked.phone = maskPhone(masked.phone);
  }

  // Apply name masking
  if (rules.maskName !== false && masked.name) {
    masked.name = maskName(masked.name);
  }

  // Apply GPS rounding
  if (rules.roundGPS !== false) {
    if (masked.pickup && typeof masked.pickup === 'object') {
      const rounded = roundCoordinates(masked.pickup.lat, masked.pickup.lng);
      masked.pickup.lat = rounded.lat;
      masked.pickup.lng = rounded.lng;
    }
    if (masked.dropoff && typeof masked.dropoff === 'object') {
      const rounded = roundCoordinates(masked.dropoff.lat, masked.dropoff.lng);
      masked.dropoff.lat = rounded.lat;
      masked.dropoff.lng = rounded.lng;
    }
    if (masked.lat !== undefined && masked.lng !== undefined) {
      const rounded = roundCoordinates(masked.lat, masked.lng);
      masked.lat = rounded.lat;
      masked.lng = rounded.lng;
    }
  }

  return masked;
}
