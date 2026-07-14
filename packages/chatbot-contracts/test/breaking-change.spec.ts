import { describe, expect, it } from 'vitest';
import { schemas } from '../src/validators';

/**
 * Golden snapshot of every schema's full JSON shape. A snapshot diff is the
 * breaking-change signal: removing a property, tightening a format, adding a
 * new required field, or changing additionalProperties policy all show up
 * as a diff here. An intentional breaking change bumps schemaVersion's major
 * component (see common.schema.json#/$defs/contractVersion) and updates the
 * snapshot in the same commit as a reviewable, explicit decision — an
 * accidental one fails CI.
 */
describe('schema snapshots (breaking-change detection)', () => {
  for (const [name, schema] of Object.entries(schemas)) {
    it(`${name} matches its committed snapshot`, () => {
      expect(schema).toMatchSnapshot();
    });
  }
});
