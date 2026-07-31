import { describe, expect, it } from 'vitest';

import { diffChangedFields } from './diff-changed-fields';

describe('diffChangedFields', () => {
  it('treats every key as changed when before is null', () => {
    expect(diffChangedFields(null, { id: 'a', status: 'IN_PROGRESS' })).toEqual(['id', 'status']);
  });

  it('treats a Date and its ISO string as equal', () => {
    expect(
      diffChangedFields(
        { id: 'a', status: 'IN_PROGRESS', updatedAt: new Date('2026-07-17T00:00:00.000Z') },
        { id: 'a', status: 'APPROVED', updatedAt: '2026-07-17T00:00:00.000Z' },
      ),
    ).toEqual(['status']);
  });

  it('ignores JSON object key order and array element order differences that are equal', () => {
    expect(
      diffChangedFields(
        { metadata: { b: 2, a: 1 }, tags: ['urgent', 'finance'] },
        { metadata: { a: 1, b: 2 }, tags: ['urgent', 'hr'] },
      ),
    ).toEqual(['tags']);
  });

  it('reports a field removed in after as changed', () => {
    expect(diffChangedFields({ id: 'a', optional: 'x' }, { id: 'a' })).toEqual(['optional']);
  });

  it('does not throw on a bigint field (e.g. a Prisma seq column) and compares it by value', () => {
    expect(diffChangedFields({ id: 'a', seq: 1n }, { id: 'a', seq: 1n })).toEqual([]);
    expect(diffChangedFields({ id: 'a', seq: 1n }, { id: 'a', seq: 2n })).toEqual(['seq']);
  });
});
