/**
 * Generated artefacts and drift detection (PL2-03).
 *
 * Three properties, in the order they matter:
 *
 *   1. **Deterministic.** The same inputs produce the same bytes. Without that, "drift" means
 *      "somebody re-ran the generator", which is noise, and CI learns to ignore it.
 *   2. **Self-describing.** Every artefact carries the digest of the inputs it came from, so
 *      `build --check` can say *why* it is stale rather than only that it is.
 *   3. **Regenerable, never hand-edited.** These files are outputs. The header says so, and the
 *      drift check is what makes that stick.
 *
 * PL2-03 owns the framework plus the catalog. PL2-05 registers the Nest composition, PL2-06 the
 * composed Prisma schema, PL2-07 the permission plan — each one a generator function, so the
 * determinism and drift rules are written once instead of three times.
 *
 * The registry itself lives in `generators.ts`. Each generator needs `sourceDigest` from here, so
 * holding the list here too would make every generator module a cycle with this one.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PluginDiagnostic } from '@appspine/plugin-api';
import { canonicalJsonString, type ResolutionGraph } from '@appspine/plugin-api/resolver';
import type { InventoryFile } from './inventory-file';
import type { ManifestSet } from './manifest-source';

export const GENERATED_DIR = '.appspine/generated';
export const CATALOG_ARTIFACT = `${GENERATED_DIR}/catalog.json`;

export interface GeneratedArtifact {
  /** App-root-relative, forward slashes, so artefacts compare across platforms. */
  path: string;
  contents: string;
}

export interface GenerationInput {
  /** Post-expansion. Generators never see a preset name where a plugin belongs (PL2-08). */
  inventory: InventoryFile;
  manifests: ManifestSet;
  graph: ResolutionGraph;
  /**
   * Which preset contributed each instance key, for provenance. Recorded *alongside* the resolved
   * plugins, never instead of them: a catalog whose only entry is "standard@1.0.0" hides what the
   * App runs behind a name whose meaning changes between releases.
   */
  presetProvenance?: ReadonlyMap<string, string>;
  presets?: { package: string; version: string; id: string; contributes: string[] }[];
  /** Tool identity recorded in every artefact, so a stale file names what wrote it. */
  generatedBy: { tool: string; version: string };
}

/**
 * Digest of everything a generator is allowed to read.
 *
 * Deliberately *not* the resolution digest alone: an artefact also depends on the manifests' own
 * digests and on the inventory as written, and a change to either must invalidate the output even
 * when the resolved order happens to come out the same.
 */
export function sourceDigest(input: GenerationInput): string {
  const canonical = canonicalJsonString({
    inventory: input.inventory.plugins,
    presets: (input.presets ?? []).map((preset) => ({
      package: preset.package,
      version: preset.version,
    })),
    resolution: input.graph.digest,
    manifests: [...input.manifests.byRef.values()]
      .map((loaded) => ({
        packageName: loaded.packageName,
        packageVersion: loaded.packageVersion,
        digest: loaded.digest,
      }))
      .sort((a, b) => (a.packageName < b.packageName ? -1 : 1)),
  });
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export interface CatalogArtifactEntry {
  key: string;
  pluginId: string;
  instanceId: string;
  packageName: string;
  packageVersion: string;
  digest: string;
  manifestDigest: string;
  status: 'enabled' | 'disabled';
  required: boolean;
  provides: string[];
  requires: string[];
  unresolvedOptional: string[];
  configRef: string | null;
  /** Preset package that contributed this entry, or null when the App wrote it itself. */
  fromPreset: string | null;
  /**
   * Env keys this instance needs, by NAME and flags only. 051 plan §7: build-time validation
   * requires the declaration to be complete, never the value — and this file is committed to a
   * repository and pasted into tickets.
   */
  environment: { key: string; required: boolean; secret: boolean }[];
  routes: string[];
  providerTokens: string[];
  prismaModels: string[];
  healthIndicatorId: string | null;
}

/**
 * The build-time half of the host's runtime catalog.
 *
 * The host's `HostCatalog` can only exist after boot, when a plugin may have failed. This one is
 * what is knowable from the manifests alone, and `doctor` compares the two vocabularies rather
 * than inventing a third: `enabled` / `disabled` here, `failed` / `degraded` only at runtime.
 */
export function generateCatalog(input: GenerationInput): GeneratedArtifact {
  const byKey = new Map(input.graph.instances.map((instance) => [instance.key, instance]));

  const entries: CatalogArtifactEntry[] = [];
  for (const entry of input.inventory.plugins) {
    const loaded = input.manifests.byRef.get(entry.plugin);
    if (!loaded) continue;
    const pluginId = loaded.manifest.id;
    const key = entry.instanceId === 'default' ? pluginId : `${pluginId}#${entry.instanceId}`;
    const resolved = byKey.get(key);
    const backend = loaded.manifest.facets.backend as
      | { controllerRoutes?: string[]; providerTokens?: string[] }
      | undefined;
    const prisma = loaded.manifest.facets.prisma as { owns?: string[] } | undefined;
    const operations = loaded.manifest.facets.operations as
      | { healthIndicatorId?: string }
      | undefined;

    entries.push({
      key,
      pluginId,
      instanceId: entry.instanceId,
      packageName: loaded.packageName,
      packageVersion: loaded.packageVersion,
      digest: loaded.digest,
      manifestDigest: loaded.manifestDigest,
      status: entry.enabled ? 'enabled' : 'disabled',
      required: entry.required,
      provides: resolved ? [...resolved.provides] : [...loaded.manifest.provides],
      requires: [...loaded.manifest.requires],
      unresolvedOptional: resolved ? [...resolved.unresolvedOptional] : [],
      configRef: entry.configRef ?? null,
      fromPreset: input.presetProvenance?.get(key) ?? null,
      environment: (loaded.manifest.environment ?? [])
        .map((env) => ({ key: env.key, required: env.required, secret: env.secret }))
        .sort((a, b) => (a.key < b.key ? -1 : 1)),
      routes: [...(backend?.controllerRoutes ?? [])].sort(),
      providerTokens: [...(backend?.providerTokens ?? [])].sort(),
      prismaModels: [...(prisma?.owns ?? [])].sort(),
      healthIndicatorId: operations?.healthIndicatorId ?? null,
    });
  }

  entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const document = {
    schemaVersion: 'appspine.catalog/v1',
    generatedBy: input.generatedBy,
    sourceDigest: sourceDigest(input),
    resolutionDigest: input.graph.digest,
    order: [...input.graph.order],
    presets: input.presets ?? [],
    entries,
    note: 'Generated by @appspine/plugin-cli. Do not edit; run `appspine build`.',
  };

  return { path: CATALOG_ARTIFACT, contents: `${JSON.stringify(document, null, 2)}\n` };
}

export type Generator = (input: GenerationInput) => GeneratedArtifact;

export interface DriftEntry {
  path: string;
  /** `missing` | `stale` — an existing file that differs, versus one that was never written. */
  reason: 'missing' | 'stale';
}

export function detectDrift(
  appRoot: string,
  artifacts: readonly GeneratedArtifact[],
): DriftEntry[] {
  const drift: DriftEntry[] = [];
  for (const artifact of artifacts) {
    const absolute = path.join(appRoot, artifact.path);
    if (!existsSync(absolute)) {
      drift.push({ path: artifact.path, reason: 'missing' });
      continue;
    }
    if (readFileSync(absolute, 'utf8') !== artifact.contents) {
      drift.push({ path: artifact.path, reason: 'stale' });
    }
  }
  return drift;
}

export function writeArtifacts(appRoot: string, artifacts: readonly GeneratedArtifact[]): string[] {
  const written: string[] = [];
  for (const artifact of artifacts) {
    const absolute = path.join(appRoot, artifact.path);
    mkdirSync(path.dirname(absolute), { recursive: true });
    if (existsSync(absolute) && readFileSync(absolute, 'utf8') === artifact.contents) continue;
    writeFileSync(absolute, artifact.contents, 'utf8');
    written.push(artifact.path);
  }
  return written;
}

/**
 * The digest an existing artefact says it came from, or `null` if it does not say.
 *
 * Used to tell "you changed the inventory" from "the generator itself changed": the first shows a
 * different recorded digest, the second shows the same one with different bytes.
 */
export function recordedSourceDigest(appRoot: string, artifactPath: string): string | null {
  const absolute = path.join(appRoot, artifactPath);
  if (!existsSync(absolute)) return null;
  try {
    const parsed = JSON.parse(readFileSync(absolute, 'utf8')) as { sourceDigest?: unknown };
    return typeof parsed.sourceDigest === 'string' ? parsed.sourceDigest : null;
  } catch {
    return null;
  }
}

export function driftDiagnostic(
  entry: DriftEntry,
  expected: string,
  recorded: string | null,
): PluginDiagnostic {
  const because =
    entry.reason === 'missing'
      ? 'it has never been generated'
      : recorded === null
        ? 'it does not record the inputs it came from'
        : recorded === expected
          ? 'the generator changed since it was written'
          : 'the inventory or a manifest changed since it was written';
  return {
    code: entry.reason === 'missing' ? 'artifact-missing' : 'artifact-stale',
    severity: 'error',
    message: `${entry.path} is out of date: ${because}. Run \`appspine build\``,
    path: entry.path,
  };
}
