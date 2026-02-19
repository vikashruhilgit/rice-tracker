import { describe, it, expect } from 'vitest';
import {
  nowUtc,
  toDisplayTime,
  toShortDisplayTime,
  toISOUtc,
  fromISOUtc,
  isValidTimezone,
  getSystemTimezone,
} from '../../src/services/time-service.js';

describe('time-service', () => {
  // A fixed date for deterministic tests: 2024-07-15T12:00:00.000Z (noon UTC)
  const fixedDate = new Date('2024-07-15T12:00:00.000Z');

  describe('nowUtc', () => {
    it('returns a Date instance', () => {
      const result = nowUtc();
      expect(result).toBeInstanceOf(Date);
    });

    it('returns a date close to the current time', () => {
      const before = Date.now();
      const result = nowUtc();
      const after = Date.now();
      expect(result.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('toDisplayTime', () => {
    it('formats correctly for America/New_York', () => {
      const result = toDisplayTime(fixedDate, 'America/New_York');
      // July is EDT (UTC-4), so 12:00 UTC = 08:00 EDT
      expect(result).toMatch(/^2024-07-15 08:00:00/);
      expect(result).toContain('EDT');
    });

    it('formats correctly for Asia/Tokyo', () => {
      const result = toDisplayTime(fixedDate, 'Asia/Tokyo');
      // JST is UTC+9, so 12:00 UTC = 21:00 JST
      expect(result).toMatch(/^2024-07-15 21:00:00/);
      // The zzz token may render as "JST" or "GMT+9" depending on the environment
      expect(result).toMatch(/JST|GMT\+9/);
    });

    it('formats correctly for UTC', () => {
      const result = toDisplayTime(fixedDate, 'UTC');
      expect(result).toMatch(/^2024-07-15 12:00:00/);
      expect(result).toContain('UTC');
    });
  });

  describe('toShortDisplayTime', () => {
    it('formats as yyyy-MM-dd HH:mm for a given timezone', () => {
      const result = toShortDisplayTime(fixedDate, 'America/New_York');
      expect(result).toBe('2024-07-15 08:00');
    });

    it('formats correctly for Asia/Tokyo', () => {
      const result = toShortDisplayTime(fixedDate, 'Asia/Tokyo');
      expect(result).toBe('2024-07-15 21:00');
    });
  });

  describe('same UTC date displays differently in different timezones', () => {
    it('produces different display strings for different timezones', () => {
      const nyResult = toDisplayTime(fixedDate, 'America/New_York');
      const tokyoResult = toDisplayTime(fixedDate, 'Asia/Tokyo');
      expect(nyResult).not.toBe(tokyoResult);
    });
  });

  describe('toISOUtc', () => {
    it('returns a valid ISO 8601 string', () => {
      const result = toISOUtc(fixedDate);
      expect(result).toBe('2024-07-15T12:00:00.000Z');
    });

    it('always ends with Z (UTC)', () => {
      const result = toISOUtc(new Date());
      expect(result).toMatch(/Z$/);
    });
  });

  describe('fromISOUtc', () => {
    it('parses an ISO string back into a Date', () => {
      const result = fromISOUtc('2024-07-15T12:00:00.000Z');
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(fixedDate.getTime());
    });

    it('round-trips correctly with toISOUtc', () => {
      const original = new Date('2024-01-01T00:00:00.000Z');
      const isoString = toISOUtc(original);
      const roundTripped = fromISOUtc(isoString);
      expect(roundTripped.getTime()).toBe(original.getTime());
    });

    it('round-trips correctly for arbitrary dates', () => {
      const original = new Date('2023-06-15T18:30:45.123Z');
      const roundTripped = fromISOUtc(toISOUtc(original));
      expect(roundTripped.getTime()).toBe(original.getTime());
    });
  });

  describe('isValidTimezone', () => {
    it('returns true for valid IANA timezones', () => {
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('Asia/Tokyo')).toBe(true);
      expect(isValidTimezone('Europe/London')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
    });

    it('returns false for invalid timezone strings', () => {
      expect(isValidTimezone('Not/A/Timezone')).toBe(false);
      expect(isValidTimezone('foobar')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
    });
  });

  describe('getSystemTimezone', () => {
    it('returns a non-empty string', () => {
      const result = getSystemTimezone();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns a valid IANA timezone', () => {
      const result = getSystemTimezone();
      expect(isValidTimezone(result)).toBe(true);
    });
  });
});
