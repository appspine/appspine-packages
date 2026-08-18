/**
 * `@appspine/plugin-api/loader` — reads and validates `appspine.plugin.json` (PL1-04).
 *
 * Split from the root barrel because this half touches `node:fs`: a frontend facet or a browser
 * bundle can import the types without dragging filesystem access in. `@appspine/plugin-cli`
 * (PL2-01) reuses this same entry, which is why it lives here and not in the Nest host.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { diagnostic, hasErrors, type PluginDiagnostic, sortDiagnostics } from '../diagnostics';
import { PluginContractError } from '../errors';
import type { PluginManifestV1 } from '../manifest';
import { PLUGIN_API_VERSION, PLUGIN_MANIFEST_FILENAME } from '../version';
import { digestsMatch, manifestDigest, resolvedManifestDigest } from './digest';
import { type HostEngineDescriptor, validateEngine } from './engine';
import {
  type SemanticValidationOptions,
  validateManifestSemantics,
  validateManifestStructure,
} from './validate';

export { PLUGIN_API_VERSION, PLUGIN_MANIFEST_FILENAME } from '../version';
export type { CanonicalJsonValue } from './canonicalize';
export { canonicalize, canonicalJsonString } from './canonicalize';
export { DIGEST_ALGORITHM, digestsMatch, manifestDigest, resolvedManifestDigest } from './digest';
export { type HostEngineDescriptor, validateEngine } from './engine';
export {
  type SemanticValidationOptions,
  validateManifestSemantics,
  validateManifestStructure,
} from './validate';

export interface LoadedPluginManifest {
  manifest: PluginManifestV1;
  packageName: string;
  packageVersion: string;
  /** Absolute path the manifest was read from, or `<in-memory>` for `parsePluginManifest`. */
  source: string;
  /** Digest of the manifest alone. */
  manifestDigest: string;
  /** Digest including package name + version — the value the plugin lockfile records. */
  digest: string;
  /** Non-fatal findings (warnings/info). Errors are never returned alongside a value. */
  diagnostics: PluginDiagnostic[];
}

export type ManifestParseResult =
  | { ok: true; value: LoadedPluginManifest }
  | { ok: false; diagnostics: PluginDiagnostic[] };

export interface ParseManifestOptions extends SemanticValidationOptions {
  packageName: string;
  packageVersion: string;
  /** Omit to skip engine checks — useful for a CLI that only wants structural validation. */
  host?: HostEngineDescriptor;
  /** When given, the computed resolved digest must match or loading fails. */
  expectedDigest?: string;
  source?: string;
}

export function defaultHostEngine(
  overrides: Partial<HostEngineDescriptor> = {},
): HostEngineDescriptor {
  return {
    appspinePluginApi: PLUGIN_API_VERSION,
    node: process.versions.node,
    ...overrides,
  };
}

/**
 * Validates an already-parsed manifest object. Never touches the filesystem and never resolves
 * `facets.backend.modulePath` — the whole point of the serializable layer is that a CLI can audit
 * a plugin without running any of its code (051 plan section 9).
 */
export function parsePluginManifest(
  candidate: unknown,
  options: ParseManifestOptions,
): ManifestParseResult {
  const source = options.source ?? '<in-memory>';
  const structural = validateManifestStructure(candidate);
  // Semantics run even on a structurally invalid manifest: the two rule sets look at different
  // things, and a caller fixing a manifest deserves the whole list, not one round-trip per rule.
  const semantic = validateManifestSemantics(candidate, options);
  if (structural.length > 0) {
    return { ok: false, diagnostics: sortDiagnostics([...structural, ...semantic]) };
  }

  const manifest = candidate as PluginManifestV1;
  const diagnostics: PluginDiagnostic[] = [
    ...semantic,
    ...(options.host ? validateEngine(manifest.engine, options.host, manifest.id) : []),
  ];

  const computedManifestDigest = manifestDigest(manifest);
  const computedDigest = resolvedManifestDigest({
    manifest,
    packageName: options.packageName,
    packageVersion: options.packageVersion,
  });

  if (
    options.expectedDigest !== undefined &&
    !digestsMatch(options.expectedDigest, computedDigest)
  ) {
    diagnostics.push(
      diagnostic(
        'manifest-digest-mismatch',
        `manifest digest ${computedDigest} does not match the expected ${options.expectedDigest}`,
        { pluginId: manifest.id, path: 'digest' },
      ),
    );
  }

  if (hasErrors(diagnostics)) {
    return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
  }

  return {
    ok: true,
    value: {
      manifest,
      packageName: options.packageName,
      packageVersion: options.packageVersion,
      source,
      manifestDigest: computedManifestDigest,
      digest: computedDigest,
      diagnostics: sortDiagnostics(diagnostics),
    },
  };
}

function readJson(
  file: string,
  what: string,
): { ok: true; value: unknown } | { ok: false; diagnostics: PluginDiagnostic[] } {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'manifest-not-readable',
          `cannot read ${what} at "${file}": ${errorCode(error)}`,
          {
            path: file,
          },
        ),
      ],
    };
  }

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    // Deliberately not echoing the file contents: a malformed config file is exactly the kind of
    // thing that ends up holding a half-pasted secret.
    return {
      ok: false,
      diagnostics: [
        diagnostic('manifest-not-json', `${what} at "${file}" is not valid JSON`, { path: file }),
      ],
    };
  }
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' ? code : 'unknown error';
}

export interface LoadManifestOptions extends SemanticValidationOptions {
  host?: HostEngineDescriptor;
  expectedDigest?: string;
  /** Override the manifest filename. Only tests and app-local layouts should need this. */
  manifestFilename?: string;
}

/**
 * Reads `<packageDir>/appspine.plugin.json` plus `<packageDir>/package.json` and merges the
 * package's name and version in. The manifest never restates its own version — 051 plan section
 * 4.1: "package version 由 package.json 取得，不在兩個檔案手工維護兩份".
 */
export function loadPluginManifest(
  packageDir: string,
  options: LoadManifestOptions = {},
): ManifestParseResult {
  const manifestPath = path.join(packageDir, options.manifestFilename ?? PLUGIN_MANIFEST_FILENAME);
  const packageJsonPath = path.join(packageDir, 'package.json');

  const packageJson = readJson(packageJsonPath, 'package.json');
  if (!packageJson.ok) return packageJson;

  const { name, version } = (packageJson.value ?? {}) as { name?: unknown; version?: unknown };
  if (typeof name !== 'string' || typeof version !== 'string') {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'package-metadata-missing',
          `package.json at "${packageJsonPath}" must declare a string name and version`,
          { path: packageJsonPath },
        ),
      ],
    };
  }

  const manifestJson = readJson(manifestPath, PLUGIN_MANIFEST_FILENAME);
  if (!manifestJson.ok) return manifestJson;

  return parsePluginManifest(manifestJson.value, {
    packageName: name,
    packageVersion: version,
    host: options.host,
    expectedDigest: options.expectedDigest,
    strictCapabilityRegistry: options.strictCapabilityRegistry,
    source: manifestPath,
  });
}

/** Throws a `PluginContractError` carrying the diagnostics, for callers that want fail-fast. */
export function unwrapManifest(result: ManifestParseResult): LoadedPluginManifest {
  if (result.ok) return result.value;
  throw new PluginContractError(
    'invalid-plugin-manifest',
    'Plugin manifest validation failed',
    result.diagnostics,
  );
}
