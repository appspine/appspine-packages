/**
 * Finding and reading plugin manifests (PL2-02).
 *
 * Everything here is `readFileSync` on JSON. 051 plan §7 step 1 — "讀取 manifest，但不執行未核准的
 * lifecycle code" — is satisfied structurally, not by discipline: this module has no way to load a
 * module, and `cli.spec.ts` asserts the whole package has no `import()`, `require()` or child
 * process anywhere in its shipped source.
 *
 * That is also why `plugin add` requires the package to already be installed. The CLI cannot
 * preflight a manifest it cannot read, and inventing an entry for a package nobody has seen would
 * put an unvalidated plugin into a file the host trusts.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { diagnostic, type PluginDiagnostic } from '@appspine/plugin-api';
import { type LoadedPluginManifest, loadPluginManifest } from '@appspine/plugin-api/loader';
import { pluginIdOf } from './inventory-file';

export const DEFAULT_OFFICIAL_SCOPE = '@appspine';

export interface ManifestLookupOptions {
  /**
   * Extra directories to search for an app-local plugin, relative to the App root. 051 plan §9
   * allows exactly two provenances in v1: the official scope, and plugins living in the App's own
   * repository.
   */
  localPluginDirs?: readonly string[];
  officialScope?: string;
}

export interface ManifestLocation {
  /** The reference as it appears in the inventory. */
  ref: string;
  /** Directory the manifest was found in, or `null` when nothing matched. */
  packageDir: string | null;
  /** Where the CLI looked, in order. Reported when nothing matched, so the failure is actionable. */
  searched: string[];
}

/**
 * Candidate directories for an inventory `plugin` reference, most specific first.
 *
 * A bare id is tried inside the official scope before the bare package name: `health-check` in an
 * Appspine App means `@appspine/health-check` far more often than a top-level `health-check`, and
 * resolving it the other way round would let an unrelated public package satisfy an official
 * reference.
 */
export function candidateDirs(
  appRoot: string,
  ref: string,
  options: ManifestLookupOptions = {},
): string[] {
  const scope = options.officialScope ?? DEFAULT_OFFICIAL_SCOPE;
  const modules = path.join(appRoot, 'node_modules');
  const candidates: string[] = [];

  if (ref.startsWith('@')) {
    candidates.push(path.join(modules, ref));
  } else {
    candidates.push(path.join(modules, scope, ref));
    candidates.push(path.join(modules, ref));
  }

  for (const dir of options.localPluginDirs ?? []) {
    candidates.push(path.join(appRoot, dir, pluginIdOf(ref)));
  }

  return candidates;
}

export function locateManifest(
  appRoot: string,
  ref: string,
  options: ManifestLookupOptions = {},
): ManifestLocation {
  const searched = candidateDirs(appRoot, ref, options);
  const packageDir =
    searched.find((dir) => existsSync(path.join(dir, 'appspine.plugin.json'))) ?? null;
  return { ref, packageDir, searched };
}

export interface ManifestReadOk {
  ok: true;
  loaded: LoadedPluginManifest;
  diagnostics: PluginDiagnostic[];
}

export interface ManifestReadError {
  ok: false;
  diagnostics: PluginDiagnostic[];
}

export type ManifestReadResult = ManifestReadOk | ManifestReadError;

export function readManifestFor(
  appRoot: string,
  ref: string,
  options: ManifestLookupOptions = {},
): ManifestReadResult {
  const location = locateManifest(appRoot, ref, options);

  if (!location.packageDir) {
    // The paths are listed because "not found" without them is unactionable: the operator cannot
    // tell a typo from a missing install from a plugin that ships no manifest at all.
    const relative = location.searched.map((dir) => path.relative(appRoot, dir) || dir);
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'plugin-package-not-found',
          `no appspine.plugin.json for "${ref}". Looked in: ${relative.join(', ')}. Install the package first`,
          { path: ref },
        ),
      ],
    };
  }

  const result = loadPluginManifest(location.packageDir);
  if (!result.ok) return { ok: false, diagnostics: result.diagnostics };
  return { ok: true, loaded: result.value, diagnostics: result.value.diagnostics };
}

export interface ManifestSet {
  /** Successfully loaded manifests, keyed by the inventory ref that asked for them. */
  byRef: Map<string, LoadedPluginManifest>;
  /** Same manifests keyed by plugin id, for the config-boundary check. */
  byPluginId: Map<string, LoadedPluginManifest['manifest']>;
  diagnostics: PluginDiagnostic[];
  /** Refs whose manifest could not be read. */
  missing: string[];
}

/**
 * Loads every manifest an inventory references.
 *
 * Disabled entries are read too. An entry that is disabled today is one an operator will enable
 * later, and finding out then that its manifest is malformed — during a deploy — is the outcome
 * this tool exists to prevent.
 */
export function readManifestsFor(
  appRoot: string,
  refs: readonly string[],
  options: ManifestLookupOptions = {},
): ManifestSet {
  const byRef = new Map<string, LoadedPluginManifest>();
  const byPluginId = new Map<string, LoadedPluginManifest['manifest']>();
  const diagnostics: PluginDiagnostic[] = [];
  const missing: string[] = [];

  for (const ref of [...new Set(refs)].sort()) {
    const result = readManifestFor(appRoot, ref, options);
    if (!result.ok) {
      diagnostics.push(...result.diagnostics);
      missing.push(ref);
      continue;
    }
    byRef.set(ref, result.loaded);
    byPluginId.set(result.loaded.manifest.id, result.loaded.manifest);
    diagnostics.push(...result.diagnostics);
  }

  return { byRef, byPluginId, diagnostics, missing };
}
