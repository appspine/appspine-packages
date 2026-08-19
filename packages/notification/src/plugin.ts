/**
 * `@appspine/notification/plugin` — manifest, plugin descriptor, and lifecycle (PL4-01).
 */

import { definePlugin, type PluginManifestV1 } from '@appspine/plugin-api';
import { NotificationModule } from './notification.module';

/** SHA-256 of `prisma/notification.prisma` with LF endings; `plugin.spec.ts` recomputes and compares. */
export const NOTIFICATION_SCHEMA_DIGEST =
  'sha256:4b54a9a0b53089bcc33a08afd99c3a7507a3119930e95072ccab83e0d5e0dedf';

/** Registry for tracking active notification workers, pollers, or timers for graceful shutdown. */
const activeCleanupHandlers = new Set<() => void | Promise<void>>();

/**
 * Register a cleanup callback (e.g. background worker or active poller) to be invoked
 * during the plugin's `shutdown` lifecycle hook.
 */
export function registerNotificationCleanup(handler: () => void | Promise<void>): () => void {
  activeCleanupHandlers.add(handler);
  return () => {
    activeCleanupHandlers.delete(handler);
  };
}

/**
 * Invokes all registered notification cleanup handlers and clears the registry.
 */
export async function cleanupNotificationResources(): Promise<void> {
  const handlers = Array.from(activeCleanupHandlers);
  activeCleanupHandlers.clear();
  for (const handler of handlers) {
    try {
      await handler();
    } catch {
      // Best-effort cleanup; errors during shutdown should not prevent remaining handlers from running.
    }
  }
}

/** Mirrors `appspine.plugin.json`; `plugin.spec.ts` fails if the two drift apart. */
export const notificationManifest: PluginManifestV1 = {
  schemaVersion: 'appspine.plugin/v1',
  id: 'notification',
  displayName: 'Notification Inbox',
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
  provides: ['appspine.notification-inbox'],
  requires: ['appspine.prisma', 'appspine.principal-context'],
  optionalRequires: ['appspine.audit-sink', 'appspine.rbac-policy'],
  facets: {
    backend: {
      modulePath: './dist/notification.module.js',
      exportName: 'NotificationModule',
      providerTokens: ['appspine.notification-inbox'],
    },
    frontend: {
      slots: [
        {
          slot: 'header.actions',
          componentExport: 'NotificationBell',
          order: 10,
        },
      ],
      i18nNamespace: 'notification',
      clientEntry: './dist/frontend.js',
    },
    prisma: {
      owns: ['Notification'],
      augments: [
        {
          targetModel: 'User',
          field: 'notifications',
          owner: 'identity-core',
          type: 'Notification[] @relation("NotificationRecipient")',
        },
      ],
      schemaFragment: 'prisma/notification.prisma',
      schemaDigest: NOTIFICATION_SCHEMA_DIGEST,
    },
    permissions: {
      definitions: ['notification:inbox:read', 'notification:inbox:update'],
    },
    operations: {
      healthIndicatorId: 'notification',
      metricsPrefix: 'notification',
      shutdownTimeoutMs: 5000,
    },
  },
};

export const notificationPlugin = definePlugin({
  manifest: notificationManifest,
  backend: () => NotificationModule,
  lifecycle: {
    validate(context) {
      if (!context.capabilities.has('appspine.prisma')) {
        throw new Error('notification plugin requires "appspine.prisma" capability');
      }
    },
    register(context) {
      context.logger.info('notification plugin registered');
    },
    ready(context) {
      context.logger.info('notification plugin ready');
    },
    async shutdown(context) {
      context.logger.info('notification plugin shutting down, cleaning up active resources');
      await cleanupNotificationResources();
    },
  },
});

export function notification() {
  return notificationPlugin;
}

export type {
  CreateNotificationInput,
  NotificationInboxPort,
  NotificationPage,
  NotificationQuery,
  NotificationRecord,
} from '@appspine/plugin-api';
export { NOTIFICATION_INBOX } from '@appspine/plugin-api';
export { NotificationModule } from './notification.module';
export { NotificationService } from './notification.service';
