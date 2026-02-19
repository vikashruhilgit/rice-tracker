import { formatInTimeZone } from 'date-fns-tz';
import { getTimezone } from '../utils/config.js';

// All dates stored as UTC Date objects. This service handles display conversion.

export function nowUtc(): Date {
  return new Date(); // JS Date is always UTC internally
}

export function toDisplayTime(date: Date, timezone?: string): string {
  const tz = timezone ?? getTimezone();
  return formatInTimeZone(date, tz, 'yyyy-MM-dd HH:mm:ss zzz');
}

export function toShortDisplayTime(date: Date, timezone?: string): string {
  const tz = timezone ?? getTimezone();
  return formatInTimeZone(date, tz, 'yyyy-MM-dd HH:mm');
}

export function toISOUtc(date: Date): string {
  return date.toISOString();
}

export function fromISOUtc(isoString: string): Date {
  return new Date(isoString);
}

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function getSystemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
