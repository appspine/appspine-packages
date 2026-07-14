import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAjv, schemas } from '../src/validators';

const fixturesRoot = path.join(__dirname, '..', 'fixtures');

const schemaIdByDir: Record<string, string> = {
  'ingress-request': schemas.ingressRequest.$id,
  'ingress-acceptance': schemas.ingressAcceptance.$id,
  'claim-request': schemas.claimRequest.$id,
  'claim-response': schemas.claimResponse.$id,
  completion: schemas.completion.$id,
  'context-manifest': schemas.contextManifest.$id,
  'attachment-manifest': schemas.attachmentManifest.$id,
  'content-parts': schemas.contentParts.$id,
  'typed-action': schemas.typedAction.$id,
  'structured-error': schemas.structuredError.$id,
  'callback-challenge': schemas.callbackChallenge.$id,
};

function readJsonFiles(dir: string): Array<{ name: string; content: unknown }> {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ name: f, content: JSON.parse(readFileSync(path.join(dir, f), 'utf8')) }));
}

describe('golden fixtures', () => {
  const ajv = createAjv();
  const schemaDirs = readdirSync(fixturesRoot);

  it('covers every top-level schema with at least one fixture directory', () => {
    for (const dirName of Object.keys(schemaIdByDir)) {
      expect(schemaDirs).toContain(dirName);
    }
  });

  for (const [dirName, schemaId] of Object.entries(schemaIdByDir)) {
    describe(dirName, () => {
      const validate = ajv.getSchema(schemaId);
      if (!validate) throw new Error(`no compiled schema for ${schemaId}`);

      const validDir = path.join(fixturesRoot, dirName, 'valid');
      const invalidDir = path.join(fixturesRoot, dirName, 'invalid');

      for (const { name, content } of readJsonFiles(validDir)) {
        it(`valid/${name} passes`, () => {
          const ok = validate(content);
          expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
        });
      }

      for (const { name, content } of readJsonFiles(invalidDir)) {
        it(`invalid/${name} fails`, () => {
          const ok = validate(content);
          expect(ok).toBe(false);
        });
      }
    });
  }
});
