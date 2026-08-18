/**
 * `@appspine/health-check/plugin` — the runtime half of the plugin contract (PL1-08).
 *
 * First pilot of the 051 migration: the smallest possible shape (one controller, one health
 * contribution, no Prisma models, no config). Its job is to prove the host can compose a plugin at
 * all, so it deliberately adds no behaviour — `HealthModule` stays exported from the package root
 * and the plugin mode returns that same module, which is what makes legacy/plugin response parity
 * testable rather than merely asserted.
 */

import { definePlugin, type PluginManifestV1 } from '@appspine/plugin-api';
import { HealthModule } from './health.module';

/**
 * Mirrors `appspine.plugin.json` at the package root.
 *
 * Two copies, one enforced truth: the JSON is what a CLI or the loader reads *without executing
 * package code* (051 plan section 9), and this constant is what `definePlugin()` type-checks
 * against. `plugin.spec.ts` fails the build if they ever differ, so the duplication cannot drift.
 */
export const healthCheckManifest: PluginManifestV1 = {
  schemaVersion: 'appspine.plugin/v1',
  id: 'health-check',
  displayName: 'Health Check',
  cardinality: 'singleton',
  distribution: 'official',
  engine: {
    appspinePluginApi: '^1.0.0',
    node: '>=22.0.0',
    frameworks: {
      '@nestjs/common': '^11.0.5',
      '@nestjs/core': '^11.0.5',
      '@prisma/client': '^6.2.0',
    },
  },
  provides: ['appspine.health-indicator'],
  requires: ['appspine.prisma'],
  facets: {
    backend: {
      modulePath: './dist/health.module.js',
      exportName: 'HealthModule',
      controllerRoutes: ['health'],
    },
    operations: {
      healthIndicatorId: 'health-check',
    },
  },
};

/**
 * The plugin descriptor. `healthCheckPlugin()` matches the `plugin()` naming 051 plan section 5.1
 * fixes for capability factories; the constant is exported too so a preset can list descriptors
 * without calling anything.
 */
export const healthCheckPlugin = definePlugin({
  manifest: healthCheckManifest,
  backend: () => HealthModule,
});

export function healthCheck() {
  return healthCheckPlugin;
}

export { HealthController } from './health.controller';
export { HealthModule } from './health.module';
