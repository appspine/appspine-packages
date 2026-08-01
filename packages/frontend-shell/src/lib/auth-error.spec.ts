import { describe, expect, it } from 'vitest';

import { mapAuthErrorKey } from './auth-error.js';

describe('mapAuthErrorKey', () => {
  it('returns undefined when there is no error', () => {
    expect(mapAuthErrorKey(undefined)).toBeUndefined();
  });

  it('maps a known next-auth error code to its own translation key', () => {
    expect(mapAuthErrorKey('AccessDenied')).toBe('errorAccessDenied');
    expect(mapAuthErrorKey('OAuthCallback')).toBe('errorOAuthCallback');
  });

  it('falls back to errorDefault for an unrecognized error code', () => {
    expect(mapAuthErrorKey('SomeUnknownCode')).toBe('errorDefault');
  });
});
