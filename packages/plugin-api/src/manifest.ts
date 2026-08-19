/**
 * `appspine.plugin/v1` manifest types.
 *
 * These mirror `schema/appspine.plugin.v1.json` exactly — `src/manifest.spec.ts` fails the
 * build if the two drift apart. The JSON Schema is the artifact the CLI and any non-TypeScript
 * tool validate against; these types are the compile-time view of the same contract.
 *
 * A manifest is pure serializable data: parsing one never imports or executes plugin runtime
 * code (051 plan section 9). `modulePath`/`exportName` are strings the host and the Phase 2
 * generator resolve later, not import specifiers this package dereferences.
 */

export const MANIFEST_SCHEMA_VERSION = 'appspine.plugin/v1' as const;

export type ManifestSchemaVersion = typeof MANIFEST_SCHEMA_VERSION;

/** Plugin type cardinality. `multiple` plugins are installed under stable instance IDs. */
export type PluginCardinality = 'singleton' | 'multiple';

/**
 * Where the plugin came from. `replaces` requires `app-local`, but this field is a *claim*,
 * not proof: the loader still verifies provenance against the inventory (051 plan section 4.1).
 */
export type PluginDistribution = 'official' | 'app-local';

/** The five frozen facet IDs (PL0-03 section 2). No plugin may invent a sixth. */
export type PluginFacetId = 'backend' | 'frontend' | 'prisma' | 'permissions' | 'operations';

export interface PluginEngineRequirement {
  /** SemVer range against `@appspine/plugin-api`'s own version. */
  appspinePluginApi: string;
  /** SemVer range against the Node runtime the App boots on. */
  node: string;
  /** Host-owned singleton ranges, e.g. `{ "@nestjs/common": "^11.0.5", "react": "^19.0.0" }`. */
  frameworks?: Record<string, string>;
}

/**
 * A backend facet contribution. `modulePath` is package-relative and points at built CommonJS
 * output; the host never dynamic-imports an arbitrary package name in production (051 plan
 * section 6.4) — the Phase 2 generator turns this into a static import.
 */
export interface BackendFacetContribution {
  modulePath: string;
  exportName: string;
  factoryExportName?: string;
  /** Transition-only: the module is still declared `@Global()`. 051 decision 3 removes these. */
  global?: boolean;
  controllerRoutes?: string[];
  providerTokens?: string[];
  workers?: string[];
}

export interface PluginAdminPageContribution {
  id: string;
  routePath?: string;
  title?: string;
  componentExport?: string;
  requiredPermission?: string;
  breadcrumb?: string;
  order?: number;
}

export interface PluginNavigationContribution {
  id: string;
  title?: string;
  href?: string;
  icon?: string;
  order?: number;
  section?: string;
  requiredPermission?: string;
  before?: string;
  after?: string;
}

export interface PluginSlotContribution {
  slot: string;
  componentExport: string;
  order?: number;
  before?: string;
  after?: string;
  requiredPermission?: string;
}

export interface PluginI18nContribution {
  namespace: string;
  locales?: string[];
}

/** Frontend facet contribution owned by PL3-01 / PL3-02. */
export interface FrontendFacetContribution {
  adminPages?: (string | PluginAdminPageContribution)[];
  navigationItems?: (string | PluginNavigationContribution)[];
  slots?: PluginSlotContribution[];
  loginProviderUi?: boolean;
  i18nNamespace?: string;
  i18n?: PluginI18nContribution;
  clientEntry?: string;
  serverEntry?: string;
}

/** Owned by PL2-06. */
export type PrismaFacetContribution = Record<string, unknown>;

/** Owned by PL2-07. */
export type PermissionFacetContribution = Record<string, unknown>;

export interface OperationsFacetContribution {
  healthIndicatorId?: string;
  metricsPrefix?: string;
  shutdownTimeoutMs?: number;
}

export interface PluginFacets {
  backend?: BackendFacetContribution;
  frontend?: FrontendFacetContribution;
  prisma?: PrismaFacetContribution;
  permissions?: PermissionFacetContribution;
  operations?: OperationsFacetContribution;
}

/** Every field is mandatory: a replacement target must be exact (051 plan section 4.5). */
export interface ReplacementDeclaration {
  plugin: string;
  facet: string;
  contribution: string;
  reason: string;
}

export interface ConfigSchemaReference {
  /** Dotted path into the App's runtime config, e.g. `masterData.hr`. */
  configRef: string;
}

export interface EnvironmentContribution {
  key: string;
  required: boolean;
  /** `true` forces redaction everywhere the key's value could surface (catalog, diagnostics, logs). */
  secret: boolean;
  description?: string;
}

/**
 * Only an instance whose manifest declares this may be marked `optional` in an App inventory.
 * Without it there is no defined degraded behaviour, so the host must treat failure as fatal
 * rather than silently continuing (051 plan section 9).
 */
export interface OptionalFailurePolicy {
  isolationBoundary: 'instance';
  degradedBehavior: {
    readiness: 'degraded';
    catalog: 'degraded';
    alert: 'required';
  };
}

export interface PluginManifestV1 {
  schemaVersion: ManifestSchemaVersion;
  id: string;
  displayName: string;
  cardinality: PluginCardinality;
  distribution?: PluginDistribution;
  engine: PluginEngineRequirement;
  provides: string[];
  requires: string[];
  optionalRequires?: string[];
  /** Plugin IDs, never capability names (051 plan section 6.3). */
  conflicts?: string[];
  replaces?: ReplacementDeclaration[];
  configSchema?: ConfigSchemaReference;
  optionalFailurePolicy?: OptionalFailurePolicy;
  environment?: EnvironmentContribution[];
  facets: PluginFacets;
  integrationContracts?: Record<string, unknown>[];
}

/** Facet IDs in the order the host reports them. Stable so diagnostics stay diffable. */
export const PLUGIN_FACET_IDS: readonly PluginFacetId[] = Object.freeze([
  'backend',
  'frontend',
  'prisma',
  'permissions',
  'operations',
]);

export function listDeclaredFacets(manifest: PluginManifestV1): PluginFacetId[] {
  return PLUGIN_FACET_IDS.filter((facet) => manifest.facets[facet] !== undefined);
}
