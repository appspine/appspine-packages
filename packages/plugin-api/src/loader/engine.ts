/**
 * Engine / framework range validation (PL1-04).
 *
 * Three separate questions, deliberately not collapsed into one:
 *   1. is the declared range even a valid SemVer range?
 *   2. does the host's *actual* version satisfy it?
 *   3. for host-owned singletons the host declares as a range rather than a pinned version, do the
 *      two ranges intersect at all? (051 plan section 6.2: "resolver 對 host-owned singleton peers
 *      取交集，無交集時在 install/build 階段失敗".)
 *
 * A range that is merely unsatisfied by the current host is a different failure from a range that
 * can never be satisfied by anything, and operators need to tell them apart.
 */

import semver from 'semver';
import { diagnostic, type PluginDiagnostic } from '../diagnostics';
import type { PluginEngineRequirement } from '../manifest';

export interface HostEngineDescriptor {
  /** The host's `@appspine/plugin-api` version, e.g. `1.0.0`. */
  appspinePluginApi: string;
  /** The Node runtime the App boots on. Defaults to the running process at load time. */
  node?: string;
  /**
   * Host-owned singleton versions or ranges, e.g. `{ "@nestjs/common": "11.1.0" }`.
   * A concrete version is checked with `satisfies`; a range is checked with `intersects`.
   */
  frameworks?: Record<string, string>;
}

/**
 * A host value is either a concrete version (`22.14.0`, `v22.14.0`) or a range (`^11.0.5`).
 * Deliberately *not* coerced: `semver.coerce('^10.0.0')` happily returns `10.0.0`, which would
 * turn a range check into a satisfies check and report the wrong failure.
 */
function concreteHostVersion(raw: string): string | null {
  return semver.valid(raw, { loose: true });
}

function checkRange(
  range: string,
  path: string,
  pluginId: string | undefined,
  diagnostics: PluginDiagnostic[],
): boolean {
  if (semver.validRange(range) === null) {
    diagnostics.push(
      diagnostic('invalid-engine-range', `"${range}" is not a valid SemVer range`, {
        pluginId,
        path,
      }),
    );
    return false;
  }
  return true;
}

function checkAgainstHost(
  range: string,
  hostValue: string,
  path: string,
  label: string,
  pluginId: string | undefined,
  diagnostics: PluginDiagnostic[],
): void {
  const concrete = concreteHostVersion(hostValue);
  if (concrete !== null) {
    if (!semver.satisfies(concrete, range, { includePrerelease: true })) {
      diagnostics.push(
        diagnostic(
          'engine-range-unsatisfied',
          `${label} ${concrete} does not satisfy the declared range "${range}"`,
          { pluginId, path },
        ),
      );
    }
    return;
  }

  if (semver.validRange(hostValue) === null) {
    diagnostics.push(
      diagnostic(
        'invalid-host-engine-range',
        `host declared "${hostValue}" for ${label}, which is neither a version nor a SemVer range`,
        { pluginId, path },
      ),
    );
    return;
  }

  if (!semver.intersects(range, hostValue, { includePrerelease: true })) {
    diagnostics.push(
      diagnostic(
        'engine-range-no-intersection',
        `declared range "${range}" has no overlap with the host range "${hostValue}" for ${label}`,
        { pluginId, path },
      ),
    );
  }
}

export function validateEngine(
  engine: PluginEngineRequirement,
  host: HostEngineDescriptor,
  pluginId?: string,
): PluginDiagnostic[] {
  const diagnostics: PluginDiagnostic[] = [];

  if (checkRange(engine.appspinePluginApi, 'engine.appspinePluginApi', pluginId, diagnostics)) {
    checkAgainstHost(
      engine.appspinePluginApi,
      host.appspinePluginApi,
      'engine.appspinePluginApi',
      '@appspine/plugin-api',
      pluginId,
      diagnostics,
    );
  }

  if (checkRange(engine.node, 'engine.node', pluginId, diagnostics)) {
    checkAgainstHost(
      engine.node,
      host.node ?? process.versions.node,
      'engine.node',
      'Node',
      pluginId,
      diagnostics,
    );
  }

  for (const [framework, range] of Object.entries(engine.frameworks ?? {}).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    const path = `engine.frameworks.${framework}`;
    if (!checkRange(range, path, pluginId, diagnostics)) continue;

    const hostVersion = host.frameworks?.[framework];
    if (hostVersion === undefined) {
      // Not an error: a backend-only App legitimately has no React. The host decides whether an
      // undeclared framework matters when it enables the facet that needs it (051 plan section 6.4).
      diagnostics.push(
        diagnostic(
          'framework-not-declared-by-host',
          `host declares no version for "${framework}"; the range "${range}" cannot be checked`,
          { pluginId, path, severity: 'warning' },
        ),
      );
      continue;
    }

    checkAgainstHost(range, hostVersion, path, framework, pluginId, diagnostics);
  }

  return diagnostics;
}
