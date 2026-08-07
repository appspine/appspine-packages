import { describe, expect, it } from 'vitest';

import { validateJsonSchema } from './schema';

describe('integration schema validation', () => {
  const schema = {
    type: 'object',
    required: ['id', 'status'],
    properties: {
      id: { type: 'string', minLength: 1, 'x-appspine-data-classification': 'INTERNAL' as const },
      status: {
        enum: ['PENDING', 'CONFIRMED'],
        'x-appspine-data-classification': 'INTERNAL' as const,
      },
      secret: { type: 'string', 'x-appspine-data-classification': 'SECRET' as const },
    },
    additionalProperties: false,
  };

  it('reports required, unknown, and secret fields', () => {
    const issues = validateJsonSchema({ status: 'INVALID', extra: true, secret: 'nope' }, schema);
    expect(issues.map((issue) => issue.keyword)).toEqual([
      'classification',
      'required',
      'enum',
      'additionalProperties',
    ]);
  });

  it('allows unknown fields for a tolerant reader', () => {
    const tolerantSchema = {
      ...schema,
      properties: { id: schema.properties.id, status: schema.properties.status },
    };
    expect(
      validateJsonSchema({ id: '1', status: 'PENDING', extra: true }, tolerantSchema, {
        mode: 'tolerant-reader',
      }),
    ).toEqual([]);
  });

  it('rejects unknown Appspine schema keywords', () => {
    expect(
      validateJsonSchema('value', {
        type: 'string',
        'x-appspine-data-classification': 'INTERNAL',
        'x-appspine-unknown': true,
      }),
    ).toEqual([expect.objectContaining({ keyword: 'x-appspine-unknown' })]);
  });

  it('rejects impossible calendar dates and offsets in date-time values', () => {
    const dateSchema = {
      type: 'string' as const,
      format: 'date-time',
      'x-appspine-data-classification': 'PUBLIC' as const,
    };
    expect(validateJsonSchema('2026-02-30T00:00:00Z', dateSchema)).toHaveLength(1);
    expect(validateJsonSchema('2026-01-01T24:00:00+24:00', dateSchema)).toHaveLength(1);
    expect(validateJsonSchema('2026-02-28T23:59:59+08:00', dateSchema)).toEqual([]);
  });
});
