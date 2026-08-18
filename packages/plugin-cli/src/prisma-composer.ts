/**
 * Prisma owns/augments composer (PL2-06).
 *
 * PL0-06 froze the *rules* before any of this existed —
 * `fixtures/051-prisma-permission/prisma/` and `scripts/051-pl0-prisma-composer-check.mjs` — and
 * this module implements them against real manifests and real `.prisma` files. The frozen error
 * codes (`owner-collision`, `missing-augmentation-target`) and the canonical ordering are
 * reproduced exactly; `prisma-composer.spec.ts` drives the same fixtures through this code.
 *
 * The problem it solves is one Prisma has no syntax for. A model has exactly one owning package,
 * but a *relation* needs a field on both sides — so `rbac` needs `userRoles UserRole[]` to exist
 * inside `identity-core`'s `User`. Either identity-core declares a field for an optional plugin it
 * must not depend on, or somebody writes it in at composition time. This is that somebody.
 *
 * It never applies a migration, and never runs Prisma. 051 拆解 §2.3: installing or enabling a
 * plugin must not touch a database. The output is a schema file and a migration *plan input*; an
 * App owner decides what happens next.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { PluginDiagnostic } from '@appspine/plugin-api';
import { diagnostic } from '@appspine/plugin-api';
import type { GeneratedArtifact, GenerationInput } from './generate';
import { GENERATED_DIR, sourceDigest } from './generate';

export const SCHEMA_ARTIFACT = `${GENERATED_DIR}/schema.prisma`;

export interface PrismaAugmentation {
  targetModel: string;
  field: string;
  /** Plugin id that owns `targetModel`, as declared by the augmenting plugin. */
  owner: string;
  /** Prisma type written into the owner's model. Absent means the augmentation cannot be composed. */
  type?: string;
}

export interface PrismaContribution {
  plugin: string;
  packageName: string;
  owns: string[];
  ownsEnums: string[];
  augments: PrismaAugmentation[];
  /** Declared by the owner: who is allowed to extend its models. */
  augmentedBy: { plugin: string; field: string }[];
  /** Fragment text, or null when the plugin ships no `.prisma` file. */
  fragment: string | null;
  fragmentPath: string | null;
}

export function collectContributions(input: GenerationInput): PrismaContribution[] {
  const contributions: PrismaContribution[] = [];

  for (const instance of input.graph.instances) {
    const loaded = [...input.manifests.byRef.values()].find(
      (candidate) => candidate.packageName === instance.packageName,
    );
    if (!loaded) continue;
    // One contribution per *package*: two instances of one plugin share its models, which is the
    // whole point of instancing (PL0-03 §4).
    if (contributions.some((entry) => entry.packageName === loaded.packageName)) continue;

    const facet = loaded.manifest.facets.prisma as
      | {
          owns?: string[];
          ownsEnums?: string[];
          augments?: PrismaAugmentation[];
          augmentedBy?: { plugin: string; field: string }[];
          schemaFragment?: string;
        }
      | undefined;
    if (!facet) continue;

    const dir = input.manifests.packageDirs.get(loaded.packageName);
    const fragmentPath = facet.schemaFragment ?? null;
    const absolute = dir && fragmentPath ? path.join(dir, fragmentPath) : null;

    contributions.push({
      plugin: loaded.manifest.id,
      packageName: loaded.packageName,
      owns: [...(facet.owns ?? [])],
      ownsEnums: [...(facet.ownsEnums ?? [])],
      augments: [...(facet.augments ?? [])],
      augmentedBy: [...(facet.augmentedBy ?? [])],
      fragment: absolute && existsSync(absolute) ? readFileSync(absolute, 'utf8') : null,
      fragmentPath,
    });
  }

  return contributions.sort((a, b) => (a.plugin < b.plugin ? -1 : a.plugin > b.plugin ? 1 : 0));
}

export interface ComposeResult {
  diagnostics: PluginDiagnostic[];
  /** Null when composition failed. */
  schema: string | null;
  digest: string | null;
  /** What a migration planner needs, without running one. */
  plan: MigrationPlanInput | null;
}

export interface MigrationPlanInput {
  models: { model: string; owner: string; fragment: string | null }[];
  enums: { name: string; owner: string }[];
  augmentations: { targetModel: string; field: string; plugin: string; type: string }[];
  digest: string;
}

/**
 * Validation, in the order PL0-06 froze.
 *
 * Ownership first, because an augmentation cannot be checked before it is known who owns what;
 * then augmentation targets. Both loops run to completion — reporting one problem per invocation
 * turns fixing a schema into a guessing game (the same reason PL1-04 and the inventory parser do
 * it this way).
 */
export function validateContributions(
  contributions: readonly PrismaContribution[],
): PluginDiagnostic[] {
  const diagnostics: PluginDiagnostic[] = [];
  const ownerByModel = new Map<string, string>();

  for (const contribution of contributions) {
    for (const model of contribution.owns) {
      const existing = ownerByModel.get(model);
      if (existing && existing !== contribution.plugin) {
        diagnostics.push(
          diagnostic(
            'owner-collision',
            `model "${model}" is claimed by ${[existing, contribution.plugin].sort().join(' and ')}. A model has exactly one owner; the composer never picks`,
            { pluginId: contribution.plugin, path: `facets.prisma.owns.${model}` },
          ),
        );
      } else {
        ownerByModel.set(model, contribution.plugin);
      }
    }
  }

  const ownerByEnum = new Map<string, string>();
  for (const contribution of contributions) {
    for (const name of contribution.ownsEnums) {
      const existing = ownerByEnum.get(name);
      if (existing && existing !== contribution.plugin) {
        diagnostics.push(
          diagnostic(
            'enum-owner-collision',
            `enum "${name}" is claimed by ${[existing, contribution.plugin].sort().join(' and ')}`,
            { pluginId: contribution.plugin, path: `facets.prisma.ownsEnums.${name}` },
          ),
        );
      } else {
        ownerByEnum.set(name, contribution.plugin);
      }
    }
  }

  for (const contribution of contributions) {
    for (const augment of contribution.augments) {
      const owner = ownerByModel.get(augment.targetModel);
      if (!owner) {
        // Fail fast rather than dropping it. A silently ignored augmentation is a missing relation
        // field, which Prisma reports much later as something that looks unrelated.
        diagnostics.push(
          diagnostic(
            'missing-augmentation-target',
            `"${contribution.plugin}" augments model "${augment.targetModel}", which no installed plugin owns`,
            {
              pluginId: contribution.plugin,
              path: `facets.prisma.augments.${augment.targetModel}.${augment.field}`,
            },
          ),
        );
        continue;
      }
      if (augment.owner !== owner) {
        diagnostics.push(
          diagnostic(
            'augmentation-owner-mismatch',
            `"${contribution.plugin}" declares "${augment.targetModel}" as owned by "${augment.owner}", but "${owner}" owns it`,
            {
              pluginId: contribution.plugin,
              path: `facets.prisma.augments.${augment.targetModel}`,
            },
          ),
        );
      }
      if (!augment.type) {
        diagnostics.push(
          diagnostic(
            'augmentation-without-type',
            `"${contribution.plugin}" augments ${augment.targetModel}.${augment.field} without declaring a Prisma type, so the composer cannot write the field`,
            {
              pluginId: contribution.plugin,
              path: `facets.prisma.augments.${augment.targetModel}.${augment.field}`,
            },
          ),
        );
      }

      const declared = contributions
        .find((candidate) => candidate.plugin === owner)
        ?.augmentedBy.some(
          (entry) =>
            entry.field === augment.field &&
            (entry.plugin === contribution.plugin || entry.plugin === contribution.packageName),
        );
      if (declared === false) {
        // Warning, not an error: the owner listing its augmenters is documentation. But an
        // augmentation the owner never anticipated is worth surfacing before it lands in a schema.
        diagnostics.push(
          diagnostic(
            'undeclared-augmentation',
            `"${owner}" does not list ${augment.field} in facets.prisma.augmentedBy, but "${contribution.plugin}" adds it`,
            {
              severity: 'warning',
              pluginId: owner,
              path: `facets.prisma.augmentedBy.${augment.field}`,
            },
          ),
        );
      }
    }
  }

  // Deterministic order regardless of input order, exactly as PL0-06's checker sorts its errors,
  // so two runs on the same inputs produce identical reports.
  return diagnostics.sort((a, b) => {
    const key = (d: PluginDiagnostic) => [d.code, d.path ?? '', d.message].join(' ');
    return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
  });
}

/**
 * Writes an augmentation field into the model that owns it.
 *
 * Line-based, and deliberately so: a full Prisma parser is a large dependency for a job that needs
 * to find `model X {` and its closing brace. The insertion point is the last non-blank line before
 * the closing brace that is not a block attribute, so the field lands with the other fields rather
 * than after `@@map`.
 */
export function injectAugmentations(
  fragment: string,
  model: string,
  fields: readonly { field: string; type: string; plugin: string }[],
): { text: string; injected: boolean } {
  if (fields.length === 0) return { text: fragment, injected: false };

  const lines = fragment.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^\\s*model\\s+${model}\\s*\\{`).test(line));
  if (start === -1) return { text: fragment, injected: false };

  let end = -1;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\}\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  if (end === -1) return { text: fragment, injected: false };

  let insertAt = end;
  while (insertAt > start + 1) {
    const candidate = lines[insertAt - 1];
    if (candidate.trim() === '' || /^\s*@@/.test(candidate)) {
      insertAt -= 1;
      continue;
    }
    break;
  }

  const block = [
    '',
    ...fields.flatMap((entry) => [
      `  /// Contributed by @appspine/${entry.plugin} (PL2-06 augmentation).`,
      `  ${entry.field} ${entry.type}`,
    ]),
  ];

  return {
    text: [...lines.slice(0, insertAt), ...block, ...lines.slice(insertAt)].join('\n'),
    injected: true,
  };
}

export function compose(input: GenerationInput): ComposeResult {
  const contributions = collectContributions(input);
  const diagnostics = validateContributions(contributions);

  if (diagnostics.some((entry) => entry.severity === 'error')) {
    return { diagnostics, schema: null, digest: null, plan: null };
  }

  const ownerByModel = new Map<string, PrismaContribution>();
  for (const contribution of contributions) {
    for (const model of contribution.owns) ownerByModel.set(model, contribution);
  }

  // Sorted by (targetModel, field, plugin) — PL0-06's canonical tuple. Concatenating the pair into
  // one key would make `A`/`bc` and `Ab`/`c` collide, which is exactly what the frozen
  // `ambiguous-augmentation-sort-key` fixture exists to catch.
  const augmentations = contributions
    .flatMap((contribution) =>
      contribution.augments.map((augment) => ({
        targetModel: augment.targetModel,
        field: augment.field,
        plugin: contribution.plugin,
        type: augment.type as string,
      })),
    )
    .sort(
      (a, b) =>
        a.targetModel.localeCompare(b.targetModel) ||
        a.field.localeCompare(b.field) ||
        a.plugin.localeCompare(b.plugin) ||
        a.type.localeCompare(b.type),
    );

  const byTarget = new Map<string, typeof augmentations>();
  for (const augment of augmentations) {
    const list = byTarget.get(augment.targetModel) ?? [];
    list.push(augment);
    byTarget.set(augment.targetModel, list);
  }

  const sections: string[] = [];
  for (const contribution of contributions) {
    if (!contribution.fragment) continue;
    let text = contribution.fragment.replace(/\r\n/g, '\n').replace(/\s*$/, '\n');
    for (const model of [...contribution.owns].sort()) {
      const fields = byTarget.get(model);
      if (fields) text = injectAugmentations(text, model, fields).text;
    }
    sections.push(
      [
        `// ---- ${contribution.packageName} (${contribution.fragmentPath ?? 'inline'}) ----`,
        text.replace(/\n+$/, ''),
        '',
      ].join('\n'),
    );
  }

  const models = [...ownerByModel.entries()]
    .map(([model, contribution]) => ({
      model,
      owner: contribution.plugin,
      fragment: contribution.fragmentPath,
    }))
    .sort((a, b) => a.model.localeCompare(b.model));

  const enums = contributions
    .flatMap((contribution) =>
      contribution.ownsEnums.map((name) => ({ name, owner: contribution.plugin })),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const canonical = JSON.stringify({ models, enums, augmentations });
  const digest = `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;

  const header = [
    '// GENERATED BY @appspine/plugin-cli — DO NOT EDIT.',
    '//',
    '// Composed from each plugin package’s own .prisma fragment. Run `appspine build` to',
    '// regenerate. This file is a schema, not a migration: nothing here has been applied to any',
    '// database, and installing or enabling a plugin never will (051 拆解 §2.3).',
    '//',
    `// sourceDigest: ${sourceDigest(input)}`,
    `// schemaDigest: ${digest}`,
    '//',
    '// The datasource and generator blocks stay in the App’s own schema: they are deployment',
    '// configuration, not a plugin contribution.',
    '',
  ].join('\n');

  return {
    diagnostics,
    schema: `${header}${sections.join('\n')}`,
    digest,
    plan: { models, enums, augmentations, digest },
  };
}

/**
 * Unreachable when composition failed: `build` runs `compose()` as a preflight and refuses before
 * any generator runs. The fallback exists so a future caller that skips that step gets a file that
 * cannot be mistaken for a schema, rather than a plausible-looking partial one.
 */
export function generatePrismaSchema(input: GenerationInput): GeneratedArtifact {
  const result = compose(input);
  if (result.schema) return { path: SCHEMA_ARTIFACT, contents: result.schema };

  return {
    path: SCHEMA_ARTIFACT,
    contents: [
      'COMPOSITION FAILED - this is not a valid Prisma schema.',
      '',
      ...result.diagnostics.map((entry) => `${entry.code}: ${entry.message}`),
      '',
    ].join(String.fromCharCode(10)),
  };
}
