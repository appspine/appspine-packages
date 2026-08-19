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

import { renderDataDictionary } from './data-dictionary';
import { MetaService } from './meta.service';

describe('Schema Drift and DMMF Dynamic Adaptability', () => {
  afterEach(() => {
    datamodel.models = [];
    datamodel.enums = [];
  });

  it('dynamically adapts when new models and enums are added to Prisma DMMF', () => {
    const metaService = new MetaService();

    // Baseline: single model
    datamodel.models = [
      {
        name: 'Article',
        dbName: 'articles',
        fields: [
          {
            name: 'id',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isId: true,
            isList: false,
          },
        ],
      },
    ];
    datamodel.enums = [];

    const baselineMeta = metaService.buildMeta();
    expect(baselineMeta.models).toHaveLength(1);
    expect(baselineMeta.models[0].name).toBe('Article');
    expect(baselineMeta.availableScopes).toEqual(['articles:read', 'articles:write', 'articles:*']);

    // Schema Drift: new model 'Category' and enum 'ArticleStatus' added
    datamodel.models = [
      ...datamodel.models,
      {
        name: 'Category',
        dbName: 'categories',
        fields: [
          {
            name: 'id',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isId: true,
            isList: false,
          },
          {
            name: 'name',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isUnique: true,
            isList: false,
          },
        ],
      },
    ];
    datamodel.enums = [
      {
        name: 'ArticleStatus',
        documentation: 'Publication lifecycle state',
        values: [
          { name: 'DRAFT', documentation: 'Work in progress' },
          { name: 'PUBLISHED', documentation: 'Live on site' },
          { name: 'ARCHIVED', documentation: 'No longer public' },
        ],
      },
    ];

    const driftedMeta = metaService.buildMeta();
    expect(driftedMeta.models).toHaveLength(2);
    expect(driftedMeta.enums).toHaveLength(1);
    expect(driftedMeta.availableScopes).toEqual([
      'articles:read',
      'articles:write',
      'articles:*',
      'categories:read',
      'categories:write',
      'categories:*',
    ]);

    // Data dictionary rendering also reflects the drifted schema
    const renderedDocs = renderDataDictionary(driftedMeta);
    expect(renderedDocs).toContain('## Enums');
    expect(renderedDocs).toContain('### ArticleStatus');
    expect(renderedDocs).toContain('`PUBLISHED`');
    expect(renderedDocs).toContain('## Models');
    expect(renderedDocs).toContain('### Category');
    expect(renderedDocs).toContain('**DB table:** `categories`');
  });

  it('filters out relation (kind: object) fields and retains all scalar/enum attributes', () => {
    datamodel.models = [
      {
        name: 'Post',
        dbName: 'posts',
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
          },
          {
            name: 'tags',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isUnique: false,
            isId: false,
            isList: true,
          },
          {
            name: 'author',
            type: 'User',
            kind: 'object',
            isRequired: true,
            isUnique: false,
            isId: false,
            isList: false,
            relationName: 'PostAuthor',
          },
        ],
      },
    ];

    const meta = new MetaService().buildMeta();
    expect(meta.models[0].fields).toEqual([
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
        documentation: undefined,
      },
      {
        name: 'tags',
        type: 'String',
        kind: 'scalar',
        isRequired: true,
        isUnique: false,
        isId: false,
        isList: true,
        hasDefault: false,
        default: undefined,
        documentation: undefined,
      },
    ]);
  });

  it('strictly excludes @internal models from scope derivation while retaining their metadata', () => {
    datamodel.models = [
      {
        name: 'PublicResource',
        dbName: 'public_resources',
        documentation: 'Public domain model',
        fields: [],
      },
      {
        name: 'InternalAuditSnapshot',
        dbName: 'internal_audit_snapshots',
        documentation: '@internal private platform table',
        fields: [],
      },
      {
        name: 'InternalMigrationLock',
        dbName: 'internal_migration_locks',
        documentation: 'System lock @internal do not expose',
        fields: [],
      },
    ];

    const meta = new MetaService().buildMeta();
    expect(meta.models).toHaveLength(3);
    expect(meta.availableScopes).toEqual([
      'public_resources:read',
      'public_resources:write',
      'public_resources:*',
    ]);
  });

  it('handles edge cases gracefully (empty models, undefined dbNames, multi-line comments)', () => {
    datamodel.models = [
      {
        name: 'PlainModel',
        documentation: 'Line 1\nLine 2\\nLine 3',
        fields: [],
      },
    ];
    datamodel.enums = [
      {
        name: 'EmptyEnum',
        values: [],
      },
    ];

    const meta = new MetaService().buildMeta();
    expect(meta.models[0].dbTable).toBe('plainmodel');
    expect(meta.availableScopes).toEqual(['plainmodel:read', 'plainmodel:write', 'plainmodel:*']);

    const rendered = renderDataDictionary(meta);
    expect(rendered).toContain('Line 1 Line 2 Line 3');
  });
});
