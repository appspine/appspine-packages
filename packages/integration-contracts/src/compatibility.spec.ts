import { describe, expect, it } from 'vitest';

import { checkSchemaCompatibility } from './compatibility';

describe('directional schema compatibility', () => {
  it('accepts an optional field addition and rejects a required field addition', () => {
    const previous = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] };
    expect(
      checkSchemaCompatibility(previous, {
        ...previous,
        properties: { ...previous.properties, label: { type: 'string' } },
      }),
    ).toEqual([expect.objectContaining({ path: '$.label', breaking: false })]);
    expect(
      checkSchemaCompatibility(previous, {
        ...previous,
        properties: { ...previous.properties, label: { type: 'string' } },
        required: ['id', 'label'],
      }),
    ).toEqual([expect.objectContaining({ path: '$.label', breaking: true })]);
  });

  it('uses tolerant-reader semantics for an unknown optional provider field', () => {
    expect(
      checkSchemaCompatibility(
        { type: 'object', additionalProperties: false },
        { type: 'object', properties: { future: { type: 'string' } }, additionalProperties: false },
        'tolerant-reader',
      ),
    ).toEqual([]);
  });
});
