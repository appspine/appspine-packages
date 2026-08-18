/**
 * `appspine.plugin-lock.json` (PL2-04).
 *
 * The lockfile is **derived and committed**, which is the pair of properties that decides
 * everything else about it. Derived, so it is regenerated rather than edited and a drift check can
 * assert it is current. Committed, so a human reads it as a diff — which is why it is sorted,
 * canonically formatted, and says as little as it can get away with.
 *
 * What it does NOT record, from 051 plan §7:
 *
 *   - **tarball resolution and integrity.** `pnpm-lock.yaml` owns those. Duplicating them would
 *     create a second source of truth that goes stale silently, and the two would eventually
 *     disagree about which bytes are installed — with nothing to say which one is right.
 *   - **any secret, or any environment value.** Environment keys appear by *name* only. This file
 *     is committed and quoted in tickets.
 *   - **anything the resolver can re-derive on its own.** It records the *result*, so CI can
 *     compare a fresh resolution against the reviewed one.
 *
 * The two lockfiles have to be compared *together*, which is the whole point of `packages`:
 * upgrading `@appspine/audit-log` through pnpm without re-running `appspine build` leaves a
 * plugin lock describing the previous version's capability graph, and the App would boot on a
 * graph nobody reviewed.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PluginDiagnostic } from '@appspine/plugin-api';
import { diagnostic } from '@appspine/plugin-api';
import type { GeneratedArtifact, GenerationInput } from './generate';

export const LOCKFILE_NAME = 'appspine.plugin-lock.json';
export const LOCK_SCHEMA_VERSION = 'appspine.plugin-lock/v1';

export interface LockedPackage {
  /** Package name only. The version is what was installed when the lock was written. */
  name: string;
  version: string;
  /** Digest of the manifest merged with this name and version — PL1-04's `digest`. */
  digest: string;
  /** Digest of the manifest alone, so a manifest edit is visible even at the same version. */
  manifestDigest: string;
  /** sha256 of the Prisma fragment this package ships, or null when it ships none. */
  schemaDigest: string | null;
  /** Permission-facet digest. Null until PL2-07 owns that facet. */
  permissionDigest: string | null;
}

export interface LockedInstance {
  key: string;
  pluginId: string;
  instanceId: string;
  package: string;
  enabled: boolean;
  required: boolean;
  configRef: string | null;
  /** Preset package that contributed this entry, or null when the App wrote it itself. */
  fromPreset: string | null;
  /** Capabilities this instance provides, instance-qualified for `cardinality: multiple`. */
  provides: string[];
  requires: string[];
  optionalRequires: string[];
  unresolvedOptional: string[];
  /** Instance keys this one registers after. */
  dependsOn: string[];
  /** Env keys by NAME and flag. Never a value. */
  environment: { key: string; required: boolean; secret: boolean }[];
}

export interface LockedArtifact {
  path: string;
  digest: string;
}

export interface PluginLockfile {
  schemaVersion: typeof LOCK_SCHEMA_VERSION;
  /**
   * Presets that contributed entries, with the instance keys each one supplied. Recorded next to
   * the resolved instances, never instead of them (PL2-08).
   */
  presets: { package: string; version: string; id: string; contributes: string[] }[];
  /** Digest of the resolution this lock describes. */
  resolutionDigest: string;
  /** Registration order. Shutdown is the reverse. */
  order: string[];
  /** Capability name -> instance keys that provide it. */
  capabilities: Record<string, string[]>;
  /** Capabilities the App or host supplies with no plugin. */
  hostCapabilities: string[];
  packages: LockedPackage[];
  instances: LockedInstance[];
  /** Digests of everything `appspine build` generated from the same inputs. */
  artifacts: LockedArtifact[];
  note: string;
}

export function artifactDigest(contents: string): string {
  return `sha256:${createHash('sha256').update(contents, 'utf8').digest('hex')}`;
}

function fragmentDigest(packageDir: string, fragment: string | undefined): string | null {
  if (!fragment) return null;
  const absolute = path.join(packageDir, fragment);
  if (!existsSync(absolute)) return null;
  // LF-normalised, matching how each package computes the digest it puts in its own manifest.
  const contents = readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n');
  return `sha256:${createHash('sha256').update(contents, 'utf8').digest('hex')}`;
}

export function buildLockfile(
  input: GenerationInput,
  artifacts: readonly GeneratedArtifact[],
  packageDirs: ReadonlyMap<string, string>,
): PluginLockfile {
  const { inventory, manifests, graph } = input;

  const packages: LockedPackage[] = [...manifests.byRef.values()]
    .map((loaded) => {
      const prisma = loaded.manifest.facets.prisma as { schemaFragment?: string } | undefined;
      const dir = packageDirs.get(loaded.packageName);
      return {
        name: loaded.packageName,
        version: loaded.packageVersion,
        digest: loaded.digest,
        manifestDigest: loaded.manifestDigest,
        schemaDigest: dir ? fragmentDigest(dir, prisma?.schemaFragment) : null,
        // PL2-07 owns the permission facet. Recorded as null rather than omitted so adding it
        // later is a visible change in every lock rather than a new key nobody notices.
        permissionDigest: null,
      };
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const byKey = new Map(graph.instances.map((instance) => [instance.key, instance]));
  const instances: LockedInstance[] = [];

  for (const entry of inventory.plugins) {
    const loaded = manifests.byRef.get(entry.plugin);
    if (!loaded) continue;
    const pluginId = loaded.manifest.id;
    const key = entry.instanceId === 'default' ? pluginId : `${pluginId}#${entry.instanceId}`;
    const resolved = byKey.get(key);

    instances.push({
      key,
      pluginId,
      instanceId: entry.instanceId,
      package: loaded.packageName,
      enabled: entry.enabled,
      required: entry.required,
      configRef: entry.configRef ?? null,
      fromPreset: input.presetProvenance?.get(key) ?? null,
      provides: resolved ? [...resolved.provides] : [],
      requires: resolved ? [...resolved.requires] : [...loaded.manifest.requires],
      optionalRequires: resolved
        ? [...resolved.optionalRequires]
        : [...(loaded.manifest.optionalRequires ?? [])],
      unresolvedOptional: resolved ? [...resolved.unresolvedOptional] : [],
      dependsOn: resolved ? [...resolved.dependsOn] : [],
      environment: (loaded.manifest.environment ?? [])
        .map((env) => ({ key: env.key, required: env.required, secret: env.secret }))
        .sort((a, b) => (a.key < b.key ? -1 : 1)),
    });
  }

  instances.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return {
    schemaVersion: LOCK_SCHEMA_VERSION,
    presets: input.presets ?? [],
    resolutionDigest: graph.digest,
    order: [...graph.order],
    capabilities: Object.fromEntries(
      Object.entries(graph.providers)
        .map(([capability, keys]) => [capability, [...keys].sort()] as const)
        .sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
    hostCapabilities: [...graph.hostCapabilities].sort(),
    packages,
    instances,
    artifacts: [...artifacts]
      .map((artifact) => ({ path: artifact.path, digest: artifactDigest(artifact.contents) }))
      .sort((a, b) => (a.path < b.path ? -1 : 1)),
    note: 'Generated by @appspine/plugin-cli. Review this file as a diff; run `appspine build` to update it. Package resolution and integrity live in pnpm-lock.yaml, not here.',
  };
}

export function serializeLockfile(lock: PluginLockfile): string {
  return `${JSON.stringify(lock, null, 2)}\n`;
}

export function lockfilePath(appRoot: string): string {
  return path.join(appRoot, LOCKFILE_NAME);
}

export function readLockfile(appRoot: string): PluginLockfile | null {
  const file = lockfilePath(appRoot);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as PluginLockfile;
    return parsed.schemaVersion === LOCK_SCHEMA_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLockfile(appRoot: string, lock: PluginLockfile): boolean {
  const file = lockfilePath(appRoot);
  const contents = serializeLockfile(lock);
  if (existsSync(file) && readFileSync(file, 'utf8') === contents) return false;
  writeFileSync(file, contents, 'utf8');
  return true;
}

/**
 * Compares the lock on disk against a freshly computed one.
 *
 * The diagnostics are deliberately specific about *which* half moved, because the fix differs:
 * a changed package version means somebody ran the package manager without rebuilding; a changed
 * manifest digest at the same version means the installed package was modified in place, which is
 * the tamper case; a changed resolution means the inventory changed.
 */
export function compareLockfile(
  onDisk: PluginLockfile | null,
  fresh: PluginLockfile,
): PluginDiagnostic[] {
  if (onDisk === null) {
    return [
      diagnostic(
        'plugin-lock-missing',
        `${LOCKFILE_NAME} is missing or unreadable. Run \`appspine build\` and commit the result`,
        { path: LOCKFILE_NAME },
      ),
    ];
  }

  const diagnostics: PluginDiagnostic[] = [];
  const before = new Map(onDisk.packages.map((entry) => [entry.name, entry]));

  for (const entry of fresh.packages) {
    const previous = before.get(entry.name);
    if (!previous) {
      diagnostics.push(
        diagnostic('plugin-lock-package-added', `${entry.name} is installed but not in the lock`, {
          path: `${LOCKFILE_NAME}#packages`,
        }),
      );
      continue;
    }
    if (previous.version !== entry.version) {
      diagnostics.push(
        diagnostic(
          'plugin-lock-version-drift',
          `${entry.name} is installed at ${entry.version} but the lock records ${previous.version}. The package manager ran without \`appspine build\`, so the reviewed capability graph describes the previous version`,
          { path: `${LOCKFILE_NAME}#packages` },
        ),
      );
      continue;
    }
    if (previous.manifestDigest !== entry.manifestDigest) {
      // Same version, different manifest: the installed package was modified in place.
      diagnostics.push(
        diagnostic(
          'plugin-lock-manifest-tampered',
          `${entry.name}@${entry.version} has a different manifest than the lock recorded for the same version. The installed package was modified after it was locked`,
          { path: `${LOCKFILE_NAME}#packages` },
        ),
      );
    }
    if (previous.schemaDigest !== entry.schemaDigest) {
      diagnostics.push(
        diagnostic(
          'plugin-lock-schema-drift',
          `${entry.name}@${entry.version} ships a different Prisma fragment than the lock recorded`,
          { path: `${LOCKFILE_NAME}#packages` },
        ),
      );
    }
  }

  for (const entry of onDisk.packages) {
    if (!fresh.packages.some((candidate) => candidate.name === entry.name)) {
      diagnostics.push(
        diagnostic(
          'plugin-lock-package-removed',
          `${entry.name} is in the lock but no longer referenced by the inventory`,
          { path: `${LOCKFILE_NAME}#packages` },
        ),
      );
    }
  }

  if (onDisk.resolutionDigest !== fresh.resolutionDigest) {
    diagnostics.push(
      diagnostic(
        'plugin-lock-resolution-drift',
        'the resolved capability graph differs from the one in the lock. Run `appspine build` and review the diff',
        { path: `${LOCKFILE_NAME}#resolutionDigest` },
      ),
    );
  }

  for (const artifact of fresh.artifacts) {
    const previous = onDisk.artifacts.find((candidate) => candidate.path === artifact.path);
    if (!previous || previous.digest !== artifact.digest) {
      diagnostics.push(
        diagnostic(
          'plugin-lock-artifact-drift',
          `${artifact.path} does not match the digest recorded in the lock`,
          { path: `${LOCKFILE_NAME}#artifacts` },
        ),
      );
    }
  }

  return diagnostics;
}
