import { MAX_TIME_RANGE_DAYS } from '../config/constants.js';

export function validateTimeRange(
  startTime: Date,
  endTime: Date,
  maxDays: number = MAX_TIME_RANGE_DAYS
): void {
  const now = new Date();

  if (endTime > now) {
    throw new Error('End time cannot be in the future');
  }

  if (startTime >= endTime) {
    throw new Error('Start time must be before end time');
  }

  const rangeDays =
    (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24);

  if (rangeDays > maxDays) {
    throw new Error(
      `Time range (${rangeDays.toFixed(1)} days) exceeds maximum of ${maxDays} days`
    );
  }
}
