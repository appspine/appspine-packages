import { describe, expect, it } from 'vitest';

import { buildAuditMeta } from './audit-meta';

describe('buildAuditMeta', () => {
  it('marks JWT callers as non-api-key actors', () => {
    expect(buildAuditMeta({ sub: 'user-1', email: 'user@example.com' })).toEqual({
      actingApiKeyId: null,
    });
  });

  it('records the API key id for API key callers', () => {
    expect(buildAuditMeta({ sub: 'key-1', isApiKey: true })).toEqual({
      actingApiKeyId: 'key-1',
    });
  });
});
