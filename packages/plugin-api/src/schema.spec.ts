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

  it('leaves frontend/prisma/permissions opaque, because Phase 1 does not own them', () => {
    const facets = ((shipped.properties as SchemaNode).facets as SchemaNode)
      .properties as SchemaNode;
    for (const facet of ['frontend', 'prisma', 'permissions']) {
      expect(facets[facet], `${facet} facet must stay opaque in v1`).toEqual({ type: 'object' });
    }
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
