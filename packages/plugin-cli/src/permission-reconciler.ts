/**
 * Permission reconciler (PL2-07).
 *
 * PL0-06 froze these rules — `fixtures/051-prisma-permission/permission/` and
 * `scripts/051-pl0-permission-reconciler-check.mjs` — and this implements them against manifests.
 * `permission-reconciler.spec.ts` drives the same fixtures.
 *
 * Two properties matter more than everything else here:
 *
 *   1. **A permission ID is immutable.** Roles, audit records and customer-written policies all
 *      reference it. Renaming one is not an edit, it is a new ID plus an alias from the old one.
 *   2. **Nothing is ever deleted.** A permission that leaves the desired state is *retired*, which
 *      keeps every historical grant and audit row interpretable. 051 decision 13 says the same
 *      thing about Prisma data: removing a plugin never removes what it recorded.
 *
 * The reconciler produces a **plan**. Applying it is somebody else's job, behind an adapter — this
 * module never touches a database, and 051 拆解 §2.3 forbids bootstrap from making unreviewed bulk
 * changes.
 */

import { createHash } from 'node:crypto';
import type { PluginDiagnostic } from '@appspine/plugin-api';
import { diagnostic } from '@appspine/plugin-api';
import type { GeneratedArtifact, GenerationInput } from './generate';
import { GENERATED_DIR, sourceDigest } from './generate';

export const PERMISSION_ARTIFACT = `${GENERATED_DIR}/permissions.json`;

/** `<plugin>:<resource>:<action>` — namespaced so two plugins cannot collide by accident. */
export const PERMISSION_ID = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/;

export interface PermissionRecord {
  id: string;
  displayName: string;
  status: 'active' | 'retired';
  schemaGeneration?: number;
}

export interface DesiredPermission {
  id: string;
  displayName: string;
  status?: 'active' | 'retired';
  /** The ID this one replaces. The old ID keeps working; it does not disappear. */
  aliasOf?: string;
  /** Frontend-only permissions are a visibility hint, never an authorization decision. */
  frontendOnly?: boolean;
}

export type PermissionOp =
  | { op: 'no-op'; id: string }
  | { op: 'add'; id: string; displayName: string }
  | { op: 'update-display'; id: string; from: string; to: string }
  | { op: 'alias'; id: string; aliasOf: string; displayName: string }
  | { op: 'retire'; id: string; reason: 'not-in-desired-state' };

export interface PermissionPlan {
  targetGeneration: number;
  ops: PermissionOp[];
  digest: string;
}

export interface ReconcileResult {
  diagnostics: PluginDiagnostic[];
  plan: PermissionPlan | null;
}

/**
 * Everything is checked before any op is produced.
 *
 * A half-built plan is worse than no plan: an operator sees a list of changes that looks complete
 * and applies it. So the validation pass runs to completion and, on any error, returns no plan at
 * all rather than the ops it managed to work out.
 */
export function reconcilePermissions(
  currentState: readonly PermissionRecord[],
  desiredState: readonly DesiredPermission[],
  targetGeneration: number,
): ReconcileResult {
  const diagnostics: PluginDiagnostic[] = [];

  const newestGeneration = currentState.reduce(
    (highest, entry) => Math.max(highest, entry.schemaGeneration ?? 0),
    0,
  );
  if (newestGeneration > targetGeneration) {
    // An older plan applied on top of newer data would silently undo whatever the newer one did.
    diagnostics.push(
      diagnostic(
        'downgrade-blocked',
        `current state is at generation ${newestGeneration} but this plan targets ${targetGeneration}. Applying an older plan over newer state would undo it`,
        { path: 'permissions.schemaGeneration' },
      ),
    );
  }

  const seen = new Set<string>();
  for (const entry of desiredState) {
    if (!PERMISSION_ID.test(entry.id)) {
      diagnostics.push(
        diagnostic(
          'invalid-permission-id',
          `"${entry.id}" is not a namespaced permission ID (<plugin>:<resource>:<action>)`,
          { path: `permissions.${entry.id}` },
        ),
      );
    }
    if (seen.has(entry.id)) {
      diagnostics.push(
        diagnostic(
          'duplicate-permission-id',
          `"${entry.id}" is declared twice. The reconciler never picks one`,
          { path: `permissions.${entry.id}` },
        ),
      );
    }
    seen.add(entry.id);
  }

  const currentById = new Map(currentState.map((entry) => [entry.id, entry]));

  for (const entry of desiredState) {
    if (entry.aliasOf === undefined) continue;
    if (!currentById.has(entry.aliasOf)) {
      // A plausible-looking alias to nothing is the worst outcome: it applies cleanly and every
      // existing grant on the old ID quietly stops resolving.
      diagnostics.push(
        diagnostic(
          'alias-target-not-found',
          `"${entry.id}" aliases "${entry.aliasOf}", which does not exist in the current state`,
          { path: `permissions.${entry.id}.aliasOf` },
        ),
      );
    }
    if (entry.aliasOf === entry.id) {
      diagnostics.push(
        diagnostic('self-alias', `"${entry.id}" cannot alias itself`, {
          path: `permissions.${entry.id}.aliasOf`,
        }),
      );
    }
  }

  if (diagnostics.some((entry) => entry.severity === 'error')) {
    return { diagnostics: sortDiagnostics(diagnostics), plan: null };
  }

  const ops: PermissionOp[] = [];
  const aliasedAway = new Set(
    desiredState.map((entry) => entry.aliasOf).filter((value): value is string => Boolean(value)),
  );

  for (const entry of desiredState) {
    const current = currentById.get(entry.id);
    if (entry.aliasOf !== undefined) {
      ops.push({
        op: 'alias',
        id: entry.id,
        aliasOf: entry.aliasOf,
        displayName: entry.displayName,
      });
      continue;
    }
    if (!current) {
      ops.push({ op: 'add', id: entry.id, displayName: entry.displayName });
      continue;
    }
    if (current.displayName !== entry.displayName) {
      // The ID never changes; only the label a human reads does.
      ops.push({
        op: 'update-display',
        id: entry.id,
        from: current.displayName,
        to: entry.displayName,
      });
      continue;
    }
    ops.push({ op: 'no-op', id: entry.id });
  }

  for (const entry of currentState) {
    if (seen.has(entry.id)) continue;
    if (aliasedAway.has(entry.id)) continue;
    if (entry.status === 'retired') continue;
    ops.push({ op: 'retire', id: entry.id, reason: 'not-in-desired-state' });
  }

  // Deterministic by (op, id) so the same inputs produce the same plan and the same digest, in any
  // order the manifests happened to be read.
  ops.sort((a, b) => (a.op + a.id < b.op + b.id ? -1 : a.op + a.id > b.op + b.id ? 1 : 0));

  const digest = `sha256:${createHash('sha256')
    .update(JSON.stringify({ targetGeneration, ops }), 'utf8')
    .digest('hex')}`;

  return {
    diagnostics: sortDiagnostics(diagnostics),
    plan: { targetGeneration, ops, digest },
  };
}

function sortDiagnostics(diagnostics: PluginDiagnostic[]): PluginDiagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const key = (d: PluginDiagnostic) => [d.code, d.path ?? '', d.message].join(' ');
    return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
  });
}

/** Desired state assembled from the installed plugins' permission facets. */
export function desiredPermissionsFrom(input: GenerationInput): {
  desired: DesiredPermission[];
  diagnostics: PluginDiagnostic[];
} {
  const desired: DesiredPermission[] = [];
  const diagnostics: PluginDiagnostic[] = [];
  const seenPackages = new Set<string>();

  for (const instance of input.graph.instances) {
    const loaded = [...input.manifests.byRef.values()].find(
      (candidate) => candidate.packageName === instance.packageName,
    );
    if (!loaded || seenPackages.has(loaded.packageName)) continue;
    seenPackages.add(loaded.packageName);

    const facet = loaded.manifest.facets.permissions as
      | { definitions?: (string | DesiredPermission)[] }
      | undefined;
    // A bare string is PL0-05's frozen shape; the display name then defaults to the ID rather than
    // the plugin inventing one, so the difference stays visible to whoever reviews the plan.
    const declared = (facet?.definitions ?? []).map((value) =>
      typeof value === 'string' ? { id: value, displayName: value } : value,
    );
    for (const entry of declared) {
      if (!entry.id.startsWith(`${loaded.manifest.id}:`)) {
        // A plugin declaring a permission in another plugin's namespace is how an accidental
        // collision — or a deliberate one — gets in.
        diagnostics.push(
          diagnostic(
            'permission-outside-namespace',
            `"${loaded.manifest.id}" declares "${entry.id}", which is not in its own namespace`,
            { pluginId: loaded.manifest.id, path: `facets.permissions.${entry.id}` },
          ),
        );
        continue;
      }
      desired.push(entry);
    }
  }

  return {
    desired: desired.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    diagnostics,
  };
}

/**
 * The generated artefact: the desired state and the plan against an *empty* current state.
 *
 * Empty on purpose. The real current state lives in the App's database, and reading it would make
 * a build-time generator depend on a running deployment. What ships is what the plugins declare
 * plus the plan a fresh install would need; the apply adapter reconciles against reality at a
 * moment when reality is available.
 */
export function generatePermissionPlan(input: GenerationInput): GeneratedArtifact {
  const { desired, diagnostics } = desiredPermissionsFrom(input);
  const result = reconcilePermissions([], desired, 1);

  const document = {
    schemaVersion: 'appspine.permissions/v1',
    generatedBy: input.generatedBy,
    sourceDigest: sourceDigest(input),
    planDigest: result.plan?.digest ?? null,
    desired,
    freshInstallPlan: result.plan?.ops ?? [],
    diagnostics: [...diagnostics, ...result.diagnostics].map((entry) => ({
      code: entry.code,
      severity: entry.severity,
      message: entry.message,
    })),
    note: 'Generated by @appspine/plugin-cli. The plan here is for a fresh install; an apply adapter reconciles it against the App database, which this tool never reads or writes.',
  };

  return { path: PERMISSION_ARTIFACT, contents: `${JSON.stringify(document, null, 2)}\n` };
}
