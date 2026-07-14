import { describe, expect, it } from 'vitest';
import { createAjv, schemas } from '../src/validators';

describe('strict Ajv compile', () => {
  it('registers and strict-compiles every schema without throwing', () => {
    expect(() => createAjv()).not.toThrow();
  });

  it('compiles every non-common top-level schema as a standalone validator', () => {
    const ajv = createAjv();
    for (const [name, schema] of Object.entries(schemas)) {
      if (name === 'common') continue;
      const id = (schema as { $id: string }).$id;
      const validate = ajv.getSchema(id);
      expect(validate, `expected a compiled validator for ${name} (${id})`).toBeTruthy();
    }
  });
});
