import { afterEach, describe, expect, it, vi } from 'vitest';

const datamodel = vi.hoisted(() => ({
  models: [] as unknown[],
  enums: [] as unknown[],
}));

vi.mock('@appspine/common', () => ({
  Prisma: {
    dmmf: {
      datamodel,
    },
  },
}));

import { MetaService } from './meta.service';

describe('MetaService', () => {
  afterEach(() => {
    datamodel.models = [];
    datamodel.enums = [];
  });

  it('builds model and enum metadata from Prisma DMMF', () => {
    datamodel.models = [
      {
        name: 'Page',
        dbName: 'wiki_pages',
        documentation: 'Wiki page',
        fields: [
          {
            name: 'id',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isUnique: false,
            isId: true,
            isList: false,
            hasDefaultValue: true,
            default: { name: 'cuid', args: [] },
            documentation: 'Primary key',
          },
          {
            name: 'children',
            type: 'Page',
            kind: 'object',
            isRequired: true,
            isUnique: false,
            isId: false,
            isList: true,
            hasDefaultValue: false,
            relationName: 'PageChildren',
          },
        ],
      },
    ];
    datamodel.enums = [
      {
        name: 'PageStatus',
        documentation: 'Workflow status',
        values: [{ name: 'DRAFT', documentation: 'Draft page' }, { name: 'PUBLISHED' }],
      },
    ];

    const meta = new MetaService().buildMeta();

    expect(meta.generatedAt).toEqual(expect.any(String));
    expect(meta.models).toEqual([
      {
        name: 'Page',
        dbTable: 'wiki_pages',
        documentation: 'Wiki page',
        fields: [
          {
            name: 'id',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isUnique: false,
            isId: true,
            isList: false,
            hasDefault: true,
            default: { name: 'cuid', args: [] },
            documentation: 'Primary key',
          },
        ],
      },
    ]);
    expect(meta.enums).toEqual([
      {
        name: 'PageStatus',
        documentation: 'Workflow status',
        values: [{ name: 'DRAFT', documentation: 'Draft page' }, { name: 'PUBLISHED' }],
      },
    ]);
    expect(meta.availableScopes).toEqual(['wiki_pages:read', 'wiki_pages:write', 'wiki_pages:*']);
  });

  it('derives scopes from db table names and excludes internal models', () => {
    datamodel.models = [
      { name: 'Page', dbName: 'wiki_pages', fields: [] },
      { name: 'AuditLog', documentation: '@internal framework table', fields: [] },
      { name: 'Comment', fields: [] },
    ];

    expect(new MetaService().getAvailableScopes()).toEqual([
      'wiki_pages:read',
      'wiki_pages:write',
      'wiki_pages:*',
      'comment:read',
      'comment:write',
      'comment:*',
    ]);
  });
});
