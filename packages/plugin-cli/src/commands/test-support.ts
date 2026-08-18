/**
 * A temp App on disk, for the command specs.
 *
 * Every installed package gets a real `package.json`, a real `appspine.plugin.json` — and a module
 * that throws the moment anything loads it. That last file is the point: it turns "the CLI does not
 * execute plugin code" from a claim into something the whole suite proves incidentally, on every
 * path it happens to walk.
 *
 * Named `test-support.ts` rather than `*.spec.ts` because two specs import it, and excluded from
 * `tsconfig.build.json` so it never reaches the published `dist`. Both checkers already recognise
 * that filename as test-only, so it is not held to the shipped-source dependency rules either.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PluginInventoryEntry, PluginManifestV1 } from '@appspine/plugin-api';
import { INVENTORY_FILENAME, serializeInventory } from '../inventory-file';

const BASE = {
  schemaVersion: 'appspine.plugin/v1',
  cardinality: 'singleton',
  distribution: 'official',
  engine: { appspinePluginApi: '^1.0.0', node: '>=22.0.0', frameworks: {} },
  facets: { backend: { modulePath: './dist/index.js', exportName: 'M' } },
} as unknown as PluginManifestV1;

export function manifest(overrides: Partial<PluginManifestV1> & { id: string }): PluginManifestV1 {
  return {
    ...BASE,
    displayName: overrides.id,
    provides: [],
    requires: [],
    ...overrides,
  } as PluginManifestV1;
}

export function entry(
  id: string,
  overrides: Partial<PluginInventoryEntry> = {},
): PluginInventoryEntry {
  return {
    plugin: `@appspine/${id}`,
    instanceId: 'default',
    enabled: true,
    required: true,
    ...overrides,
  };
}

export interface TestApp {
  root: string;
  addInstalled: (manifest: PluginManifestV1) => void;
}

export interface TestAppOptions {
  installed?: PluginManifestV1[];
  inventory?: PluginInventoryEntry[];
  packageJson?: Record<string, unknown>;
}

export function testApp(options: TestAppOptions = {}): TestApp {
  const root = mkdtempSync(path.join(tmpdir(), 'appspine-app-'));

  writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify(options.packageJson ?? { name: 'demo-app', dependencies: {} }, null, 2)}\n`,
    'utf8',
  );

  const addInstalled = (entryManifest: PluginManifestV1) => {
    const dir = path.join(root, 'node_modules', '@appspine', entryManifest.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'package.json'),
      `${JSON.stringify({ name: `@appspine/${entryManifest.id}`, version: '1.2.3' }, null, 2)}\n`,
      'utf8',
    );
    writeFileSync(
      path.join(dir, 'appspine.plugin.json'),
      `${JSON.stringify(entryManifest, null, 2)}\n`,
      'utf8',
    );
    writeFileSync(path.join(dir, 'index.js'), "throw new Error('plugin code executed');", 'utf8');
    const fragment = (entryManifest.facets.prisma as { schemaFragment?: string } | undefined)
      ?.schemaFragment;
    if (fragment) {
      mkdirSync(path.dirname(path.join(dir, fragment)), { recursive: true });
      writeFileSync(path.join(dir, fragment), 'model Placeholder { id String @id }\n', 'utf8');
    }
  };

  for (const entryManifest of options.installed ?? []) addInstalled(entryManifest);

  if (options.inventory) {
    writeFileSync(
      path.join(root, INVENTORY_FILENAME),
      serializeInventory({ schemaVersion: 'appspine.plugins/v1', plugins: options.inventory }),
      'utf8',
    );
  }

  return { root, addInstalled };
}
