import { describe, expect, it } from 'vitest';

import { targetPathSchema } from './validation';

describe('targetPathSchema', () => {
  it('accepts app-local paths', () => {
    expect(targetPathSchema.parse('/dashboard/notifications?filter=unread')).toBe(
      '/dashboard/notifications?filter=unread',
    );
  });

  it.each([
    '/\\\\evil.example',
    '/\\evil.example',
    '\\evil.example',
    '/\u0000dashboard',
  ])('rejects unsafe path %j', (path) => {
    expect(() => targetPathSchema.parse(path)).toThrow();
  });
});
