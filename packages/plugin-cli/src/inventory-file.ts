/**
 * `appspine.plugins.json` — read, validate, write (PL2-01).
 *
 * 051 decision 10 makes this file the CLI's single responsibility: it is the *only* thing
 * `plugin add` / `plugin remove` are allowed to modify. Package versions live in `pnpm-lock.yaml`,
 * programmatic wiring lives in `appspine.config.ts`, credentials live in the operator's
 * environment, and the resolved graph lives in `appspine.plugin-lock.json`. Anything this module
 * writes is meant to be read as a diff by a human before it merges.
 *
 * Nothing here executes plugin code, or any code: the file is JSON, validated against a shipped
 * JSON Schema.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_INSTANCE_ID,
  diagnostic,
  INVENTORY_SCHEMA_VERSION,
  instanceKey,
  type PluginDiagnostic,
  type PluginInventory,
  type PluginInventoryEntry,
} from '@appspine/plugin-api';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020';
import inventorySchemaDocument from './schema/appspine.plugins.v1.json';

export const INVENTORY_FILENAME = 'appspine.plugins.json';
export const INVENTORY_V1_SCHEMA_ID = 'https://appspine.dev/schema/appspine.plugins.v1.json';

/** Intentionally loose: this package validates *with* a schema, it does not model JSON Schema. */
export const inventorySchema = inventorySchemaDocument as unknown as Record<string, unknown>;

/**
 * The on-disk shape, which is a superset of the resolver's `PluginInventory`: it may also name
 * presets. Expansion is PL2-08's job, so `toResolverInventory` refuses rather than dropping them.
 */
export interface InventoryFile {
  schemaVersion: typeof INVENTORY_SCHEMA_VERSION;
  presets?: string[];
  plugins: PluginInventoryEntry[];
}

export interface ParseInventoryOk {
  ok: true;
  inventory: InventoryFile;
  diagnostics: PluginDiagnostic[];
}

export interface ParseInventoryError {
  ok: false;
  diagnostics: PluginDiagnostic[];
}

export type ParseInventoryResult = ParseInventoryOk | ParseInventoryError;

let compiled: ValidateFunction | null = null;

function validator(): ValidateFunction {
  if (!compiled) {
    compiled = new Ajv2020({ allErrors: true, strict: false }).compile(inventorySchema);
  }
  return compiled;
}

/**
 * Structural validation against the shipped schema, then the rules a schema cannot express.
 *
 * Both run even when the first fails, for the reason PL1-04 already learned the hard way: telling
 * an operator about one problem per run turns fixing a file into a guessing game with a slow
 * feedback loop.
 */
export function parseInventory(value: unknown): ParseInventoryResult {
  const diagnostics: PluginDiagnostic[] = [];
  const validate = validator();

  if (!validate(value)) {
    for (const error of validate.errors ?? []) {
      diagnostics.push(
        diagnostic('inventory-schema-violation', `${error.message ?? 'is invalid'}`, {
          path: `plugins${error.instancePath}`.replace(/\/(\d+)/g, '[$1]').replace(/\//g, '.'),
        }),
      );
    }
  }

  const candidate = (typeof value === 'object' && value !== null ? value : {}) as InventoryFile;
  diagnostics.push(...semanticDiagnostics(candidate));

  if (diagnostics.some((entry) => entry.severity === 'error')) {
    return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
  }
  return {
    ok: true,
    inventory: {
      schemaVersion: INVENTORY_SCHEMA_VERSION,
      ...(candidate.presets && candidate.presets.length > 0
        ? { presets: [...candidate.presets] }
        : {}),
      plugins: [...(candidate.plugins ?? [])],
    },
    diagnostics: sortDiagnostics(diagnostics),
  };
}

function semanticDiagnostics(candidate: InventoryFile): PluginDiagnostic[] {
  const diagnostics: PluginDiagnostic[] = [];
  const entries = Array.isArray(candidate.plugins) ? candidate.plugins : [];
  const seen = new Map<string, number>();

  entries.forEach((entry, index) => {
    if (typeof entry?.plugin !== 'string' || typeof entry?.instanceId !== 'string') return;

    // Two entries can differ textually and still be the same instance: `health-check` and
    // `@appspine/health-check` collapse to one key. The resolver rejects that too, but an operator
    // editing this file should not have to run a resolve to find out.
    const key = instanceKey(pluginIdOf(entry.plugin), entry.instanceId);
    const first = seen.get(key);
    if (first !== undefined) {
      diagnostics.push(
        diagnostic(
          'duplicate-instance',
          `entries ${first} and ${index} both resolve to instance "${key}"`,
          { instanceId: entry.instanceId, path: `plugins[${index}].instanceId` },
        ),
      );
    } else {
      seen.set(key, index);
    }

    if (entry.required === false && entry.enabled === false) {
      // Not an error — just meaningless, and usually a leftover. Say so rather than silently
      // carrying a line nobody can act on.
      diagnostics.push(
        diagnostic(
          'disabled-optional-entry',
          `"${key}" is disabled, so "required: false" has no effect`,
          { severity: 'info', instanceId: entry.instanceId, path: `plugins[${index}].required` },
        ),
      );
    }
  });

  return diagnostics;
}

function sortDiagnostics(diagnostics: PluginDiagnostic[]): PluginDiagnostic[] {
  const rank = { error: 0, warning: 1, info: 2 };
  return [...diagnostics].sort((a, b) => {
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    const key = (d: PluginDiagnostic) => [d.path ?? '', d.code, d.message].join(' ');
    return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
  });
}

/** Strips the `@scope/` prefix so `@appspine/health-check` and `health-check` compare equal. */
export function pluginIdOf(pluginRef: string): string {
  const slash = pluginRef.lastIndexOf('/');
  return slash === -1 ? pluginRef : pluginRef.slice(slash + 1);
}

export function inventoryPath(appRoot: string): string {
  return path.join(appRoot, INVENTORY_FILENAME);
}

export interface ReadInventoryOptions {
  /** Return an empty inventory instead of failing when the file does not exist. */
  createIfMissing?: boolean;
}

export function emptyInventory(): InventoryFile {
  return { schemaVersion: INVENTORY_SCHEMA_VERSION, plugins: [] };
}

export function readInventory(
  appRoot: string,
  options: ReadInventoryOptions = {},
): ParseInventoryResult {
  const file = inventoryPath(appRoot);
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      if (options.createIfMissing) {
        return { ok: true, inventory: emptyInventory(), diagnostics: [] };
      }
      return {
        ok: false,
        diagnostics: [
          diagnostic('inventory-not-found', `${INVENTORY_FILENAME} not found in ${appRoot}`, {
            path: INVENTORY_FILENAME,
          }),
        ],
      };
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // The message only, never the file contents: a malformed inventory is still a file an operator
    // may have pasted a value into, and this string reaches logs (PL1-04 applies the same rule).
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'inventory-malformed-json',
          `${INVENTORY_FILENAME} is not valid JSON: ${(error as Error).message}`,
          { path: INVENTORY_FILENAME },
        ),
      ],
    };
  }

  return parseInventory(parsed);
}

/**
 * Canonical serialisation: sorted entries, fixed key order, two-space indent, LF, trailing newline.
 *
 * The point is a reviewable diff. `plugin add` run twice by two developers must produce the same
 * bytes, and adding one plugin must show as one added block rather than as a reshuffle of the
 * whole file.
 */
export function serializeInventory(inventory: InventoryFile): string {
  const entries = [...inventory.plugins].sort((a, b) => {
    const left = [pluginIdOf(a.plugin), a.instanceId].join(' ');
    const right = [pluginIdOf(b.plugin), b.instanceId].join(' ');
    return left < right ? -1 : left > right ? 1 : 0;
  });

  const document: Record<string, unknown> = { schemaVersion: INVENTORY_SCHEMA_VERSION };
  if (inventory.presets && inventory.presets.length > 0) {
    document.presets = [...inventory.presets].sort();
  }
  document.plugins = entries.map((entry) => {
    const out: Record<string, unknown> = {
      plugin: entry.plugin,
      instanceId: entry.instanceId,
      enabled: entry.enabled,
      required: entry.required,
    };
    if (entry.configRef !== undefined) out.configRef = entry.configRef;
    return out;
  });

  return `${JSON.stringify(document, null, 2)}\n`;
}

export function writeInventory(appRoot: string, inventory: InventoryFile): string {
  const serialized = serializeInventory(inventory);
  writeFileSync(inventoryPath(appRoot), serialized, 'utf8');
  return serialized;
}

/**
 * Narrow the file to what the resolver accepts.
 *
 * `plugins` only: a caller that has presets must expand them first (`expandPresets`) and pass the
 * result. Silently dropping them here would make `plugin validate` pass on an inventory that does
 * not describe what the App actually runs, which is the single worst thing this tool could do.
 */
export function toResolverInventory(inventory: InventoryFile): PluginInventory {
  if (inventory.presets && inventory.presets.length > 0) {
    throw new Error(
      'inventory declares presets; expand them with expandPresets() before resolving',
    );
  }
  return { schemaVersion: INVENTORY_SCHEMA_VERSION, plugins: inventory.plugins };
}

export { DEFAULT_INSTANCE_ID, INVENTORY_SCHEMA_VERSION };
