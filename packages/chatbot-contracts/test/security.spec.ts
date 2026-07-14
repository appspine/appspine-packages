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

function allFixtureFiles(): string[] {
  const files: string[] = [];
  for (const schemaDir of readdirSync(fixturesRoot)) {
    for (const group of ['valid', 'invalid']) {
      const dir = path.join(fixturesRoot, schemaDir, group);
      for (const f of readdirSync(dir)) files.push(path.join(dir, f));
    }
  }
  return files;
}

describe('security: no localhost in fixtures', () => {
  it('uses the reserved test domain instead of localhost anywhere in fixture data', () => {
    for (const file of allFixtureFiles()) {
      const content = readFileSync(file, 'utf8');
      expect(content, `${file} must not reference localhost`).not.toMatch(/localhost/i);
      expect(content, `${file} must not reference 127.0.0.1`).not.toMatch(/127\.0\.0\.1/);
    }
  });
});

describe('security: unknown additional properties are rejected everywhere', () => {
  const ajv = createAjv();

  for (const [dirName, schemaId] of Object.entries(schemaIdByDir)) {
    it(`${dirName}: adding an undeclared top-level property invalidates an otherwise-valid fixture`, () => {
      const validDir = path.join(fixturesRoot, dirName, 'valid');
      const validate = ajv.getSchema(schemaId);
      if (!validate) throw new Error(`no compiled schema for ${schemaId}`);

      const files = readdirSync(validDir);
      expect(files.length, `${dirName} needs at least one valid fixture`).toBeGreaterThan(0);

      for (const file of files) {
        const original = JSON.parse(readFileSync(path.join(validDir, file), 'utf8'));
        expect(validate(original), `${dirName}/${file} must itself be valid`).toBe(true);

        const tampered = { ...original, __unexpected_extra_field__: 'should not be allowed' };
        expect(
          validate(tampered),
          `${dirName}/${file} + an undeclared property should have been rejected`,
        ).toBe(false);
      }
    });
  }
});

describe('security: ingress trigger origin is fixed to USER_UI', () => {
  it('the schema fixes source.origin to a const, not just an enum containing USER_UI', () => {
    const raw = schemas.ingressRequest as {
      properties: { source: { properties: { origin: { const?: unknown } } } };
    };
    expect(raw.properties.source.properties.origin.const).toBe('USER_UI');
  });

  const machineOrigins = ['CHAT_BOT', 'INCOMING_WEBHOOK', 'MCP', 'SYSTEM'];
  for (const origin of machineOrigins) {
    it(`rejects a forged ingress request with origin=${origin}`, () => {
      const ajv = createAjv();
      const validate = ajv.getSchema(schemas.ingressRequest.$id);
      if (!validate) throw new Error('ingress-request schema not compiled');

      const basic = JSON.parse(
        readFileSync(path.join(fixturesRoot, 'ingress-request', 'valid', 'basic.json'), 'utf8'),
      );
      const forged = { ...basic, source: { ...basic.source, origin } };
      expect(validate(forged)).toBe(false);
    });
  }
});

describe('security: hash and capability format bounds', () => {
  it('sha256Hex is exactly 64 lowercase hex characters, both ends enforced', () => {
    const def = (
      schemas.common as {
        $defs: { sha256Hex: { pattern: string; minLength: number; maxLength: number } };
      }
    ).$defs.sha256Hex;
    expect(def.pattern).toBe('^[0-9a-f]{64}$');
    expect(def.minLength).toBe(64);
    expect(def.maxLength).toBe(64);
  });

  it('opaqueCapabilityToken has a bounded, non-trivial minimum length', () => {
    const def = (
      schemas.common as {
        $defs: { opaqueCapabilityToken: { minLength: number; maxLength: number } };
      }
    ).$defs.opaqueCapabilityToken;
    expect(def.minLength).toBeGreaterThanOrEqual(16);
    expect(def.maxLength).toBeLessThanOrEqual(2048);
  });
});
