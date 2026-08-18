import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRESET_FILENAME, presetEntries, standardPreset } from './index';

const packageRoot = process.cwd();
const document = JSON.parse(
  readFileSync(path.join(packageRoot, PRESET_FILENAME), 'utf8'),
) as typeof standardPreset;
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
  files: string[];
  exports: Record<string, unknown>;
};

describe('the JSON and the constant are one document', () => {
  it('are deep-equal', () => {
    // The CLI reads the JSON without executing this package; `definePlugin`-style enforced
    // duplication is what stops the two from drifting (same reasoning as PL1-01 §2).
    expect(document).toEqual(standardPreset);
  });

  it('is published, so a consumer can read it off disk', () => {
    expect(packageJson.files).toContain(PRESET_FILENAME);
    expect(packageJson.exports[`./${PRESET_FILENAME}`]).toBe(`./${PRESET_FILENAME}`);
  });
});

describe('the standard set', () => {
  it('names the four Phase 1 pilots, in dependency-friendly form', () => {
    expect(standardPreset.plugins.map((entry) => entry.plugin)).toEqual([
      '@appspine/health-check',
      '@appspine/audit-log',
      '@appspine/identity-core',
      '@appspine/oidc-auth',
    ]);
  });

  it('carries oidc-auth’s configRef, so expansion does not lose it', () => {
    expect(
      standardPreset.plugins.find((entry) => entry.plugin === '@appspine/oidc-auth')?.configRef,
    ).toBe('oidc');
  });

  it('declares no order of its own', () => {
    // Registration order is the resolver's, from the capability graph. A preset that also implied
    // an order would be a second, weaker answer to the same question.
    expect(Object.keys(standardPreset)).not.toContain('order');
  });

  it('expands into ordinary inventory entries', () => {
    const entries = presetEntries();
    expect(entries).toHaveLength(4);
    for (const entry of entries) {
      expect(entry.enabled).toBe(true);
      expect(Object.keys(entry).sort()).toEqual(
        entry.configRef
          ? ['configRef', 'enabled', 'instanceId', 'plugin', 'required']
          : ['enabled', 'instanceId', 'plugin', 'required'],
      );
    }
  });
});
