import { DEFAULT_LOOKBACK_HOURS } from '../config/constants.js';

export function parseISO8601(str: string): Date {
  const date = new Date(str);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ISO 8601 date: ${str}`);
  }
  return date;
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function getDefaultTimeRange(
  hoursBack: number = DEFAULT_LOOKBACK_HOURS
): {
  start: Date;
  end: Date;
} {
  const end = new Date();
  const start = new Date(end.getTime() - hoursBack * 60 * 60 * 1000);
  return { start, end };
}

export function getAge(timestamp: Date): string {
  const ageMs = Date.now() - timestamp.getTime();
  return formatDuration(ageMs);
}
