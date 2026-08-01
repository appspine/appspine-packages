import { describe, expect, it } from 'vitest';

import { formatDateOnly, parseDateOnly } from './date-only.js';

describe('parseDateOnly', () => {
  it('returns undefined for an undefined value', () => {
    expect(parseDateOnly(undefined)).toBeUndefined();
  });

  it('parses a YYYY-MM-DD string into a local Date at noon', () => {
    const date = parseDateOnly('2026-03-05');
    expect(date).toBeDefined();
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2); // 0-indexed: March
    expect(date?.getDate()).toBe(5);
    expect(date?.getHours()).toBe(12);
  });

  it('only uses the date portion of a full ISO datetime string', () => {
    const date = parseDateOnly('2026-03-05T23:59:59.000Z');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2);
    expect(date?.getDate()).toBe(5);
  });

  it('returns undefined for a malformed value', () => {
    expect(parseDateOnly('not-a-date')).toBeUndefined();
    expect(parseDateOnly('')).toBeUndefined();
  });
});

describe('formatDateOnly', () => {
  it('formats a Date as YYYY-MM-DD, zero-padded', () => {
    expect(formatDateOnly(new Date(2026, 2, 5, 12))).toBe('2026-03-05');
  });

  it('round-trips with parseDateOnly', () => {
    const original = '2026-12-31';
    expect(formatDateOnly(parseDateOnly(original) as Date)).toBe(original);
  });
});
