import { describe, expect, it } from 'vitest';

import { canonicalJson, sha256Digest } from './canonical';

describe('canonical JSON', () => {
  it('is independent of object insertion order', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(sha256Digest({ b: 2, a: 1 })).toBe(sha256Digest({ a: 1, b: 2 }));
  });

  it('rejects non-JSON values', () => {
    expect(() => canonicalJson({ value: undefined })).toThrow('Undefined');
    expect(() => canonicalJson({ value: 1n })).toThrow('BigInt');
    expect(() => canonicalJson(new Map([['token', 'secret']]))).toThrow('plain object');
    expect(() => canonicalJson(new Date('2026-08-07T00:00:00.000Z'))).toThrow('plain object');
  });
});
