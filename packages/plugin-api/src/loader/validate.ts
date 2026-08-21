/**
 * Manifest structural + semantic validation (PL1-04).
 *
 * Structural checks come from Ajv against the shipped JSON Schema — Gate G0 explicitly handed
 * PL1-04 the job of replacing Phase 0's hand-rolled schema interpreter with a real library.
 * Semantic checks are the cross-field rules a schema cannot express; their codes are the same
 * vocabulary the PL0-05 fixture index declares, so the frozen fixtures keep meaning the same thing
 * after the implementation swap.
 *
 * Nothing here imports or executes plugin code: a manifest is data, and `modulePath` stays a
 * string all the way through (051 plan section 9).
 */

import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import {
  CAPABILITY,
  HOST_PROVIDED_CAPABILITIES,
  INTERACTIVE_AUTH_CAPABILITY,
  REGISTERED_CAPABILITIES,
} from '../capabilities';
import { diagnostic, type PluginDiagnostic } from '../diagnostics';
import type { PluginManifestV1 } from '../manifest';
import { manifestV1Schema } from '../schema';

let compiled: ValidateFunction | null = null;

function validator(): ValidateFunction {
  if (compiled) return compiled;
  // strict:false — the schema carries `description` annotations Ajv's strict mode flags as
  // unknown keywords on some subschemas; they are documentation, not validation.
  const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
  compiled = ajv.compile(manifestV1Schema);
  return compiled;
}

/** Ajv instance path (`/engine/appspinePluginApi`) -> manifest dotted path. */
function dottedPath(instancePath: string, extra?: string): string {
  const base = instancePath.replace(/^\//, '').replace(/\//g, '.');
  if (!extra) return base || '(root)';
  return base ? `${base}.${extra}` : extra;
}

const ENGINE_RANGE_PATHS = new Set(['engine.appspinePluginApi', 'engine.node']);

function mapAjvError(error: ErrorObject): PluginDiagnostic {
  switch (error.keyword) {
    case 'required': {
      const missing = (error.params as { missingProperty: string }).missingProperty;
      const path = dottedPath(error.instancePath, missing);
      return diagnostic('required-field-missing', `"${path}" is required`, { path });
    }
    case 'additionalProperties': {
      const extraKey = (error.params as { additionalProperty: string }).additionalProperty;
      const path = dottedPath(error.instancePath, extraKey);
      return diagnostic('unknown-field', `"${path}" is not part of appspine.plugin/v1`, { path });
    }
    case 'const': {
      const path = dottedPath(error.instancePath);
      return diagnostic(
        path === 'schemaVersion' ? 'invalid-schema-version' : 'invalid-constant-value',
        `"${path}" must be ${JSON.stringify((error.params as { allowedValue: unknown }).allowedValue)}`,
        { path },
      );
    }
    case 'enum': {
      const path = dottedPath(error.instancePath);
      const allowed = (error.params as { allowedValues: unknown[] }).allowedValues;
      return diagnostic('invalid-enum-value', `"${path}" must be one of ${allowed.join(', ')}`, {
        path,
      });
    }
    case 'minProperties': {
      const path = dottedPath(error.instancePath);
      return diagnostic(
        path === 'facets' ? 'empty-facets' : 'too-few-properties',
        `"${path}" must declare at least ${(error.params as { limit: number }).limit} entr${
          (error.params as { limit: number }).limit === 1 ? 'y' : 'ies'
        }`,
        { path },
      );
    }
    case 'pattern': {
      const path = dottedPath(error.instancePath);
      return diagnostic(
        ENGINE_RANGE_PATHS.has(path) ? 'invalid-engine-range' : 'invalid-format',
        `"${path}" does not match the required format`,
        { path },
      );
    }
    case 'uniqueItems': {
      const path = dottedPath(error.instancePath);
      return diagnostic('duplicate-array-item', `"${path}" contains duplicate entries`, { path });
    }
    case 'minLength': {
      const path = dottedPath(error.instancePath);
      return diagnostic('empty-value', `"${path}" must not be empty`, { path });
    }
    case 'type': {
      const path = dottedPath(error.instancePath);
      return diagnostic(
        'invalid-type',
        `"${path}" must be of type ${(error.params as { type: string }).type}`,
        { path },
      );
    }
    case 'minimum':
    case 'maximum': {
      const path = dottedPath(error.instancePath);
      return diagnostic('out-of-range', `"${path}" ${error.message ?? 'is out of range'}`, {
        path,
      });
    }
    default: {
      const path = dottedPath(error.instancePath);
      return diagnostic('schema-violation', `"${path}" ${error.message ?? 'is invalid'}`, { path });
    }
  }
}

export function validateManifestStructure(candidate: unknown): PluginDiagnostic[] {
  const validate = validator();
  if (validate(candidate)) return [];
  return (validate.errors ?? []).map(mapAjvError);
}

/** Same heuristic the PL0-05 checker froze, kept identical so fixture expectations still hold. */
const SECRET_LOOKING_ENV_KEY = /SECRET|PASSWORD|TOKEN|API_KEY|CREDENTIAL/;

export interface SemanticValidationOptions {
  /**
   * Treat a capability outside the PL0-03 registry as an error rather than a warning. The
   * workspace architecture checker (PL1-07) turns this on; an App validating a third-party or
   * app-local plugin leaves it off, since those legitimately introduce their own names.
   */
  strictCapabilityRegistry?: boolean;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Runs the cross-field rules. Takes `unknown` and reads defensively on purpose: it is also called
 * on manifests that already failed structural validation, so that a single run reports *both* the
 * schema violation and the business-rule violation. Reporting only the first one turns fixing a
 * broken manifest into a guessing game — and the PL0-05 negative fixtures deliberately combine the
 * two (e.g. `official-plugin-replaces.json` has an empty backend facet *and* an illegal replaces).
 */
export function validateManifestSemantics(
  candidate: unknown,
  options: SemanticValidationOptions = {},
): PluginDiagnostic[] {
  const diagnostics: PluginDiagnostic[] = [];
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return diagnostics;
  }

  const manifest = candidate as Partial<PluginManifestV1> & Record<string, unknown>;
  const pluginId = typeof manifest.id === 'string' ? manifest.id : '';
  const provides = isStringArray(manifest.provides) ? manifest.provides : [];
  const requires = isStringArray(manifest.requires) ? manifest.requires : [];
  const optionalRequires = isStringArray(manifest.optionalRequires)
    ? manifest.optionalRequires
    : [];
  const conflicts = isStringArray(manifest.conflicts) ? manifest.conflicts : [];

  if (provides.includes(INTERACTIVE_AUTH_CAPABILITY) && conflicts.length === 0) {
    diagnostics.push(
      diagnostic(
        'interactive-provider-without-conflicts',
        `a plugin providing ${INTERACTIVE_AUTH_CAPABILITY} must declare the interactive providers it excludes (051 decision 8)`,
        { pluginId, path: 'conflicts' },
      ),
    );
  }

  if (conflicts.includes(pluginId)) {
    diagnostics.push(
      diagnostic('self-conflict', 'a plugin cannot declare a conflict with itself', {
        pluginId,
        path: 'conflicts',
      }),
    );
  }

  const replaces = Array.isArray(manifest.replaces) ? manifest.replaces : [];
  const environment = Array.isArray(manifest.environment) ? manifest.environment : [];
  const facets =
    typeof manifest.facets === 'object' &&
    manifest.facets !== null &&
    !Array.isArray(manifest.facets)
      ? manifest.facets
      : {};

  if (replaces.length > 0 && manifest.distribution !== 'app-local') {
    diagnostics.push(
      diagnostic(
        'replacement-not-app-local',
        "only an app-local plugin may replace another plugin's contribution (051 plan section 4.5)",
        { pluginId, path: 'distribution' },
      ),
    );
  }

  for (const [index, replacement] of replaces.entries()) {
    if (replacement?.plugin === pluginId) {
      diagnostics.push(
        diagnostic('replaces-self', 'a plugin cannot replace its own contribution', {
          pluginId,
          path: `replaces[${index}].plugin`,
        }),
      );
    }
  }

  for (const [index, entry] of environment.entries()) {
    if (
      typeof entry?.key === 'string' &&
      SECRET_LOOKING_ENV_KEY.test(entry.key) &&
      entry.secret !== true
    ) {
      diagnostics.push(
        diagnostic(
          'secret-field-not-marked-secret',
          `environment key "${entry.key}" looks like a credential but is not marked secret`,
          { pluginId, path: `environment[${index}].secret` },
        ),
      );
    }
  }

  for (const capability of provides) {
    if (HOST_PROVIDED_CAPABILITIES.includes(capability)) {
      diagnostics.push(
        diagnostic(
          'host-owned-capability-provided',
          `"${capability}" is host-owned; a plugin may require it but never provide it`,
          { pluginId, path: 'provides' },
        ),
      );
    }
  }

  const providedSet = new Set(provides);
  for (const capability of [...requires, ...optionalRequires]) {
    if (providedSet.has(capability)) {
      diagnostics.push(
        diagnostic(
          'requires-own-capability',
          `"${capability}" is both provided and required by this plugin`,
          { pluginId, path: 'requires' },
        ),
      );
    }
  }

  for (const capability of [...provides, ...requires, ...optionalRequires]) {
    if (!REGISTERED_CAPABILITIES.includes(capability)) {
      diagnostics.push(
        diagnostic(
          'unregistered-capability',
          `"${capability}" is not in the PL0-03 capability registry`,
          {
            pluginId,
            path: 'provides/requires',
            severity: options.strictCapabilityRegistry ? 'error' : 'warning',
          },
        ),
      );
    }
  }

  const backend = facets.backend;
  for (const worker of backend?.workers ?? []) {
    if (!worker.startsWith(`appspine.${pluginId}.`)) {
      diagnostics.push(
        diagnostic(
          'worker-namespace-mismatch',
          `worker "${worker}" must be namespaced as appspine.${pluginId}.<worker-name> (PL0-03 section 4)`,
          { pluginId, path: 'facets.backend.workers' },
        ),
      );
    }
  }

  const operations = facets.operations;
  if (
    operations?.healthIndicatorId !== undefined &&
    operations.healthIndicatorId !== pluginId &&
    !operations.healthIndicatorId.startsWith(`${pluginId}-`)
  ) {
    diagnostics.push(
      diagnostic(
        'health-indicator-namespace-mismatch',
        `healthIndicatorId "${operations.healthIndicatorId}" must be "${pluginId}" or start with "${pluginId}-"`,
        { pluginId, path: 'facets.operations.healthIndicatorId' },
      ),
    );
  }

  const expectedMetricsPrefix = pluginId.replace(/-/g, '_');
  if (
    operations?.metricsPrefix !== undefined &&
    operations.metricsPrefix !== expectedMetricsPrefix
  ) {
    diagnostics.push(
      diagnostic(
        'metrics-prefix-mismatch',
        `metricsPrefix "${operations.metricsPrefix}" must be "${expectedMetricsPrefix}" (PL0-03 section 4)`,
        { pluginId, path: 'facets.operations.metricsPrefix' },
      ),
    );
  }

  if (manifest.cardinality === 'multiple' && !manifest.configSchema) {
    // Two instances that cannot be configured differently are two copies of the same thing;
    // the multi-instance machinery then only buys token collisions (051 plan section 4.4).
    diagnostics.push(
      diagnostic(
        'multi-instance-without-config',
        'a cardinality:multiple plugin should declare configSchema so instances can differ',
        { pluginId, path: 'configSchema', severity: 'warning' },
      ),
    );
  }

  if (provides.includes(CAPABILITY.prisma)) {
    diagnostics.push(
      diagnostic(
        'prisma-capability-provided-by-plugin',
        `"${CAPABILITY.prisma}" is provided by the App's Prisma module, not by a capability plugin`,
        { pluginId, path: 'provides' },
      ),
    );
  }

  return diagnostics;
}
