import { describe, expect, it } from 'vitest';
import { cloneManifestV1Schema, manifestV1Schema } from './schema';
import { KNOWLEDGE_SCHEMA_PATH, readJsonFile } from './test-support';

type SchemaNode = Record<string, unknown>;

const frozen = readJsonFile(KNOWLEDGE_SCHEMA_PATH) as SchemaNode;
const shipped = manifestV1Schema as SchemaNode;

/**
 * PL0-05 froze the manifest contract with the five facet bodies left as opaque objects, and said
 * in the document itself that PL1-06/PL2-06/PL2-07/PL3-02 own their concrete shapes. So the
 * shipped schema is allowed to differ from the frozen one in exactly one place — `facets` — and
 * nowhere else. These tests are what stop "refinement" from quietly becoming "rewrite".
 */
describe('shipped manifest schema vs. the PL0-05 frozen contract', () => {
  it('keeps every non-facet property byte-identical', () => {
    const frozenProps = frozen.properties as Record<string, unknown>;
    const shippedProps = shipped.properties as Record<string, unknown>;

    for (const [key, value] of Object.entries(frozenProps)) {
      if (key === 'facets') continue;
      expect(shippedProps[key], `property "${key}" drifted from the frozen contract`).toEqual(
        value,
      );
    }
  });

  it('adds no top-level property the frozen contract does not have', () => {
    expect(Object.keys(shipped.properties as SchemaNode).sort()).toEqual(
      Object.keys(frozen.properties as SchemaNode).sort(),
    );
  });

  it('keeps the same required list and closed object policy', () => {
    expect(shipped.required).toEqual(frozen.required);
    expect(shipped.additionalProperties).toBe(false);
    expect(frozen.additionalProperties).toBe(false);
    expect(shipped.type).toEqual(frozen.type);
  });

  it('keeps the facets container rules and the frozen facet name set', () => {
    const frozenFacets = (frozen.properties as SchemaNode).facets as SchemaNode;
    const shippedFacets = (shipped.properties as SchemaNode).facets as SchemaNode;

    expect(shippedFacets.additionalProperties).toBe(false);
    expect(shippedFacets.minProperties).toBe(frozenFacets.minProperties);
    expect(Object.keys(shippedFacets.properties as SchemaNode).sort()).toEqual(
      Object.keys(frozenFacets.properties as SchemaNode).sort(),
    );
  });

  it('narrows frontend, which PL0-05 explicitly handed to PL3-01/PL3-02', () => {
    const facets = ((shipped.properties as SchemaNode).facets as SchemaNode)
      .properties as SchemaNode;
    const frontend = facets.frontend as SchemaNode;
    expect(frontend.additionalProperties).toBe(false);
    expect(Object.keys((frontend.properties as SchemaNode)).sort()).toEqual(
      ['adminPages', 'clientEntry', 'i18n', 'i18nNamespace', 'loginProviderUi', 'navigationItems', 'serverEntry', 'slots'].sort(),
    );
    const adminPages = (frontend.properties as SchemaNode).adminPages as SchemaNode;
    const adminPageItems = (adminPages.items as SchemaNode).oneOf as SchemaNode[];
    expect(adminPageItems[0].type).toBe('string');
    expect(adminPageItems[1].required).toEqual(['id']);

    const navItems = (frontend.properties as SchemaNode).navigationItems as SchemaNode;
    const navItemVariants = (navItems.items as SchemaNode).oneOf as SchemaNode[];
    expect(navItemVariants[0].type).toBe('string');
    expect(navItemVariants[1].required).toEqual(['id']);

    const slots = (frontend.properties as SchemaNode).slots as SchemaNode;
    expect((slots.items as SchemaNode).required).toEqual(['slot', 'componentExport']);
  });

  it('narrows permissions, which PL0-05 explicitly handed to PL2-07', () => {
    const facets = ((shipped.properties as SchemaNode).facets as SchemaNode)
      .properties as SchemaNode;
    const permissions = facets.permissions as SchemaNode;
    const definitions = (permissions.properties as SchemaNode).definitions as SchemaNode;
    const variants = (definitions.items as SchemaNode).oneOf as SchemaNode[];

    expect(permissions.additionalProperties).toBe(false);
    // PL0-05's frozen `rbac-full-facets` fixture declares permissions as bare ID strings. The
    // tightened schema has to keep accepting that, so an entry is either a string or the richer
    // object the reconciler needs for display names and aliases.
    expect(variants).toHaveLength(2);
    expect(variants[0].type).toBe('string');
    expect(variants[1].required).toEqual(['id']);
    // Namespaced by pattern in both shapes, so a plugin cannot collide with another's IDs by
    // accident — and the reconciler's own check catches the deliberate case.
    expect(variants[0].pattern).toContain(':');
    expect((variants[1].properties as SchemaNode).id).toMatchObject({
      pattern: expect.stringContaining(':'),
    });
  });

  it('narrows prisma, which PL0-05 explicitly handed to PL2-06', () => {
    const facets = ((shipped.properties as SchemaNode).facets as SchemaNode)
      .properties as SchemaNode;
    const prisma = facets.prisma as SchemaNode;

    expect(prisma.additionalProperties).toBe(false);
    expect(Object.keys(prisma.properties as SchemaNode).sort()).toEqual(
      ['augmentedBy', 'augments', 'ownsEnums', 'owns', 'schemaDigest', 'schemaFragment'].sort(),
    );
    // PL0-05's frozen `rbac-full-facets` fixture declares an augmentation as
    // {targetModel, field, owner} — no type. The tightened schema has to keep that fixture valid,
    // so `type` is optional here even though the composer cannot emit a field without one. The
    // composer reports that gap by name rather than the schema rejecting a frozen fixture.
    const augments = (prisma.properties as SchemaNode).augments as SchemaNode;
    expect((augments.items as SchemaNode).required).toEqual(['targetModel', 'field', 'owner']);
    expect(Object.keys((augments.items as SchemaNode).properties as SchemaNode).sort()).toEqual([
      'field',
      'owner',
      'targetModel',
      'type',
    ]);
  });

  it('narrows backend and operations, which PL0-05 explicitly handed to PL1-06', () => {
    const facets = ((shipped.properties as SchemaNode).facets as SchemaNode)
      .properties as SchemaNode;
    const backend = facets.backend as SchemaNode;
    expect(backend.required).toEqual(['modulePath', 'exportName']);
    expect(backend.additionalProperties).toBe(false);
    expect((facets.operations as SchemaNode).additionalProperties).toBe(false);
  });
});

describe('cloneManifestV1Schema', () => {
  it('returns a deep copy so a mutating validator cannot corrupt the shared document', () => {
    const clone = cloneManifestV1Schema();
    expect(clone).toEqual(manifestV1Schema);
    (clone.properties as SchemaNode).id = { type: 'number' };
    expect((manifestV1Schema.properties as SchemaNode).id).not.toEqual({ type: 'number' });
  });
});
