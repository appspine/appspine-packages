/**
 * `definePlugin()` — the runtime half of the two-layer contract (051 plan section 4.1).
 *
 * A capability package exports the result from its `./plugin` subpath. The function does not
 * merely widen a type: it cross-checks the descriptor against the package's own manifest, so a
 * plugin that declares a backend facet but forgets to ship a module factory fails at import time
 * in its own unit tests rather than at App boot in a consumer.
 */

import { diagnostic, type PluginDiagnostic } from './diagnostics';
import { PluginContractError } from './errors';
import type { PluginLifecycleHooks, PluginRuntimeContext } from './lifecycle';
import { MANIFEST_SCHEMA_VERSION, type PluginCardinality, type PluginManifestV1 } from './manifest';

/**
 * Structural subset of a schema validator. A zod schema satisfies this as-is, which is what the
 * existing packages already use — no new validation library is imposed on plugin authors.
 */
export interface PluginConfigParser<TConfig> {
  parse(input: unknown): TConfig;
}

/**
 * Produces the plugin's backend contribution. Returns `unknown` here because this package must
 * not depend on NestJS; `@appspine/plugin-host-nest` narrows the return type to a Nest
 * `DynamicModule | Type<unknown>` at the point where that dependency is legitimate.
 */
export type PluginBackendFactory<TConfig = unknown, TModule = unknown> = (
  context: PluginRuntimeContext<TConfig>,
) => TModule | Promise<TModule>;

export interface PluginDefinition<TConfig = unknown, TModule = unknown> {
  /** The package's own `appspine.plugin.json`, imported as data. */
  manifest: PluginManifestV1;
  /** Required when the manifest declares `configSchema`; rejected when it does not. */
  configSchema?: PluginConfigParser<TConfig>;
  /** Default config applied before parsing, for instances that omit optional keys. */
  defaultConfig?: Partial<TConfig>;
  lifecycle?: PluginLifecycleHooks<TConfig>;
  /** Required when the manifest declares a `backend` facet. */
  backend?: PluginBackendFactory<TConfig, TModule>;
}

export interface DefinedPlugin<TConfig = unknown, TModule = unknown>
  extends PluginDefinition<TConfig, TModule> {
  readonly id: string;
  readonly displayName: string;
  readonly cardinality: PluginCardinality;
  readonly provides: readonly string[];
  readonly requires: readonly string[];
  readonly optionalRequires: readonly string[];
  /** Brand so a plain object literal cannot be passed where a validated descriptor is expected. */
  readonly __appspinePlugin: true;
}

function collectDefinitionDiagnostics<TConfig, TModule>(
  definition: PluginDefinition<TConfig, TModule>,
): PluginDiagnostic[] {
  const diagnostics: PluginDiagnostic[] = [];
  const manifest = definition.manifest;

  if (manifest?.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic(
        'unsupported-manifest-schema-version',
        `definePlugin() supports ${MANIFEST_SCHEMA_VERSION} only`,
        { path: 'manifest.schemaVersion' },
      ),
    );
    // Everything below reads manifest fields whose shape this version guarantees.
    return diagnostics;
  }

  const pluginId = manifest.id;

  if (manifest.facets.backend && !definition.backend) {
    diagnostics.push(
      diagnostic(
        'missing-backend-factory',
        'manifest declares a backend facet but the definition has no backend factory',
        { pluginId, path: 'backend' },
      ),
    );
  }

  if (!manifest.facets.backend && definition.backend) {
    diagnostics.push(
      diagnostic(
        'undeclared-backend-factory',
        'definition has a backend factory but the manifest declares no backend facet',
        { pluginId, path: 'manifest.facets.backend' },
      ),
    );
  }

  if (manifest.configSchema && !definition.configSchema) {
    diagnostics.push(
      diagnostic(
        'missing-config-parser',
        `manifest declares configSchema.configRef "${manifest.configSchema.configRef}" but the definition has no configSchema parser`,
        { pluginId, path: 'configSchema' },
      ),
    );
  }

  if (!manifest.configSchema && definition.configSchema) {
    diagnostics.push(
      diagnostic(
        'undeclared-config-parser',
        'definition has a configSchema parser but the manifest declares no configSchema',
        { pluginId, path: 'manifest.configSchema' },
      ),
    );
  }

  return diagnostics;
}

export function definePlugin<TConfig = unknown, TModule = unknown>(
  definition: PluginDefinition<TConfig, TModule>,
): DefinedPlugin<TConfig, TModule> {
  const diagnostics = collectDefinitionDiagnostics(definition);
  if (diagnostics.length > 0) {
    throw new PluginContractError(
      'invalid-plugin-definition',
      `Invalid plugin definition for "${definition.manifest?.id ?? '<unknown>'}"`,
      diagnostics,
    );
  }

  const manifest = definition.manifest;

  return Object.freeze({
    ...definition,
    id: manifest.id,
    displayName: manifest.displayName,
    cardinality: manifest.cardinality,
    provides: Object.freeze([...manifest.provides]),
    requires: Object.freeze([...manifest.requires]),
    optionalRequires: Object.freeze([...(manifest.optionalRequires ?? [])]),
    __appspinePlugin: true as const,
  });
}

/**
 * Upper bound for a heterogeneous list of plugins — what a host, preset or catalog holds.
 *
 * `unknown` will not do: `TConfig` appears both as a factory parameter (contravariant) and as a
 * parser return type (covariant), so no single concrete type is a supertype of every descriptor.
 */
// biome-ignore lint/suspicious/noExplicitAny: see above — the config type is genuinely unknowable here.
export type AnyDefinedPlugin = DefinedPlugin<any, unknown>;

export function isDefinedPlugin(value: unknown): value is DefinedPlugin {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __appspinePlugin?: unknown }).__appspinePlugin === true
  );
}
