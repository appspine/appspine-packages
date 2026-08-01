import { describe, expect, it } from 'vitest';

import { getInitials } from './utils.js';

describe('getInitials', () => {
  it('returns "?" for an empty or whitespace-only value', () => {
    expect(getInitials('')).toBe('?');
    expect(getInitials('   ')).toBe('?');
  });

  it('takes the first letter of each of the first two words, uppercased', () => {
    expect(getInitials('Ada Lovelace')).toBe('AL');
  });

  it('collapses repeated whitespace between words', () => {
    expect(getInitials('Ada   Lovelace')).toBe('AL');
  });

  it('returns a single initial for a single-word value', () => {
    expect(getInitials('Ada')).toBe('A');
  });

  it('truncates to the first two words for a three-or-more-word value', () => {
    expect(getInitials('Ada Marie Lovelace')).toBe('AM');
  });
});
