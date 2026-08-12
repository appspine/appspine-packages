import { describe, expect, it } from 'vitest';

import { boundedRetryAfter, classifyHttpOutcome } from './delivery';

describe('HTTP delivery outcome mapping', () => {
  it('does not accept an already-processed response for another event', () => {
    expect(
      classifyHttpOutcome(
        409,
        {},
        { status: 'already_processed', eventId: 'different-event' },
        'expected-event',
      ),
    ).toMatchObject({ kind: 'terminal', status: 409 });
  });

  it('accepts a matching already-processed response', () => {
    expect(
      classifyHttpOutcome(
        409,
        {},
        { status: 'already_processed', eventId: 'expected-event' },
        'expected-event',
      ),
    ).toMatchObject({ kind: 'processed', reason: 'already_processed' });
  });

  it('bounds both delta-seconds and HTTP-date Retry-After values', () => {
    const now = Date.parse('2026-08-07T00:00:00.000Z');
    expect(boundedRetryAfter('2', 5000, now)).toBe(2000);
    expect(boundedRetryAfter('Wed, 07 Aug 2026 00:00:08 GMT', 5000, now)).toBe(5000);
  });
});
