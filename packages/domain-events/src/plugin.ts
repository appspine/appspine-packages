/**
 * `@appspine/domain-events/plugin` — manifest and plugin descriptor (PL4-05).
 */

import { definePlugin, type PluginManifestV1 } from '@appspine/plugin-api';
import { DomainEventsModule } from './domain-events.module';

export const DOMAIN_EVENTS_SCHEMA_DIGEST =
  'sha256:9c007fb569beb870e2b6d1e41e0a4e187e8ed6bb7c05e0599c748ce7b83fa351';

/** Mirrors `appspine.plugin.json`. */
export const domainEventsManifest: PluginManifestV1 = {
  schemaVersion: 'appspine.plugin/v1',
  id: 'domain-events',
  displayName: 'Domain Events',
  cardinality: 'singleton',
  distribution: 'official',
  engine: {
    appspinePluginApi: '^1.0.0',
    node: '>=22.0.0',
    frameworks: {
      '@nestjs/common': '^11.0.5',
      '@nestjs/core': '^11.0.5',
      '@prisma/client': '^6.2.0',
      'lucide-react': '^1.22.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
    },
  },
  provides: ['appspine.domain-events'],
  requires: ['appspine.prisma', 'appspine.principal-context'],
  optionalRequires: [
    'appspine.audit-sink',
    'appspine.machine-auth-provider',
    'appspine.rbac-policy',
    'appspine.scope-matcher',
  ],
  facets: {
    backend: {
      modulePath: './dist/domain-events.module.js',
      exportName: 'DomainEventsModule',
      controllerRoutes: ['domain-events'],
      providerTokens: ['appspine.domain-events'],
    },
    frontend: {
      adminPages: [
        {
          id: 'domain-events',
          routePath: '/dashboard/domain-events',
          title: 'domainEvents',
          componentExport: 'DomainEventsTable',
          requiredPermission: 'domain-events:event:read',
          order: 40,
        },
      ],
      navigationItems: [
        {
          id: 'domain-events',
          title: 'domainEvents',
          href: '/dashboard/domain-events',
          icon: 'Activity',
          order: 40,
          section: 'admin',
          requiredPermission: 'domain-events:event:read',
          after: 'api-keys',
        },
      ],
      i18nNamespace: 'domainEvents',
      clientEntry: './dist/frontend.js',
    },
    prisma: {
      owns: ['DomainEvent', 'DomainEventDelivery', 'IntegrationEventReceipt'],
      ownsEnums: ['DomainEventOperation', 'DomainEventDeliveryStatus'],
      schemaFragment: 'prisma/domain-events.prisma',
      schemaDigest: DOMAIN_EVENTS_SCHEMA_DIGEST,
    },
    permissions: {
      definitions: [
        'domain-events:event:read',
        'domain-events:event:retry',
        'domain-events:event:ignore',
      ],
    },
    operations: {
      healthIndicatorId: 'domain-events',
      metricsPrefix: 'domain_events',
      shutdownTimeoutMs: 5000,
    },
  },
};

export const domainEventsPlugin = definePlugin({
  manifest: domainEventsManifest,
  backend: () => DomainEventsModule,
});

export function domainEvents() {
  return domainEventsPlugin;
}
