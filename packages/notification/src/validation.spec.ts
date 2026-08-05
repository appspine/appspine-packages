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

  // These are the exact open-redirect vectors the contract names (§4.3 targetPath validation);
  // a future refactor of targetPathSchema must not silently drop any of these refinements.
  it.each([
    '//evil.com',
    '///evil.com',
    'http://evil.com',
    'https://evil.com',
    'HTTP://evil.com',
    'javascript:alert(1)',
    'data:text/html,evil',
  ])('rejects open-redirect vector %j', (path) => {
    expect(() => targetPathSchema.parse(path)).toThrow();
  });
});
