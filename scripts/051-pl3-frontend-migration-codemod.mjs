#!/usr/bin/env node
/**
 * PL3-09 — Frontend migration codemod for capability UI ownership.
 *
 * Rewrites legacy imports of capability-specific admin components and hooks from
 * `@appspine/frontend-shell` (and `@appspine/frontend-shell/notification`) to their
 * owning plugin frontend facets (`@appspine/<plugin>/frontend`).
 *
 * Usage:
 *   node scripts/051-pl3-frontend-migration-codemod.mjs <target-directory> [--apply]
 *   node scripts/051-pl3-frontend-migration-codemod.mjs --self-test
 */

import fs from 'node:fs';
import path from 'node:path';

export const MIGRATION_MAP = {
  // identity-core
  UsersTable: '@appspine/identity-core/frontend',
  CreateUserDialog: '@appspine/identity-core/frontend',
  UserRowActions: '@appspine/identity-core/frontend',
  UserRow: '@appspine/identity-core/frontend',
  UsersTableKey: '@appspine/identity-core/frontend',
  UsersTableProps: '@appspine/identity-core/frontend',
  CreateUserDialogProps: '@appspine/identity-core/frontend',
  UserRowActionsProps: '@appspine/identity-core/frontend',

  // oidc-auth
  LoginButton: '@appspine/oidc-auth/frontend',
  isNextRedirectError: '@appspine/oidc-auth/frontend',
  mapAuthErrorKey: '@appspine/oidc-auth/frontend',
  AuthErrorKey: '@appspine/oidc-auth/frontend',
  LoginButtonProps: '@appspine/oidc-auth/frontend',

  // rbac
  RolesTable: '@appspine/rbac/frontend',
  CreateRoleDialog: '@appspine/rbac/frontend',
  RoleRowActions: '@appspine/rbac/frontend',
  RoleRow: '@appspine/rbac/frontend',
  EnumOption: '@appspine/rbac/frontend',
  RoleSortField: '@appspine/rbac/frontend',
  RolesTableKey: '@appspine/rbac/frontend',
  RolesTableProps: '@appspine/rbac/frontend',
  CreateRoleDialogProps: '@appspine/rbac/frontend',
  RoleRowActionsProps: '@appspine/rbac/frontend',

  // m2m-api-key
  ApiKeysTable: '@appspine/m2m-api-key/frontend',
  CreateApiKeyDialog: '@appspine/m2m-api-key/frontend',
  CreatedApiKeyReveal: '@appspine/m2m-api-key/frontend',
  ApiKeyRowActions: '@appspine/m2m-api-key/frontend',
  ApiKeyRow: '@appspine/m2m-api-key/frontend',
  ApiKeyRoleRef: '@appspine/m2m-api-key/frontend',
  CreateApiKeyResponse: '@appspine/m2m-api-key/frontend',
  CreateApiKeyResult: '@appspine/m2m-api-key/frontend',
  ApiKeyRoleOption: '@appspine/m2m-api-key/frontend',
  ServiceAccountOption: '@appspine/m2m-api-key/frontend',
  ApiKeyScopeOption: '@appspine/m2m-api-key/frontend',
  ApiKeysTableProps: '@appspine/m2m-api-key/frontend',
  CreateApiKeyDialogProps: '@appspine/m2m-api-key/frontend',
  CreatedApiKeyRevealProps: '@appspine/m2m-api-key/frontend',
  ApiKeyRowActionsProps: '@appspine/m2m-api-key/frontend',

  // domain-events
  DomainEventsTable: '@appspine/domain-events/frontend',
  DomainEventCatalogTable: '@appspine/domain-events/frontend',
  DomainEventDeliveriesPanel: '@appspine/domain-events/frontend',
  DomainEventDetailPanel: '@appspine/domain-events/frontend',
  DomainEventRow: '@appspine/domain-events/frontend',
  DomainEventDeliveryRow: '@appspine/domain-events/frontend',
  DomainEventCatalogView: '@appspine/domain-events/frontend',
  DomainEventsTableProps: '@appspine/domain-events/frontend',
  DomainEventCatalogTableProps: '@appspine/domain-events/frontend',
  DomainEventDeliveriesPanelProps: '@appspine/domain-events/frontend',
  DomainEventDetailPanelProps: '@appspine/domain-events/frontend',

  // notification
  NotificationBell: '@appspine/notification/frontend',
  useNotificationPolling: '@appspine/notification/frontend',
  createNotificationPollingController: '@appspine/notification/frontend',
  NotificationSeverity: '@appspine/notification/frontend',
  NotificationSummary: '@appspine/notification/frontend',
  NotificationListResult: '@appspine/notification/frontend',
  NotificationDataSource: '@appspine/notification/frontend',
  NotificationLabels: '@appspine/notification/frontend',
  NotificationBellProps: '@appspine/notification/frontend',
  NotificationPollingState: '@appspine/notification/frontend',
  NotificationPollingOptions: '@appspine/notification/frontend',
};

export function transformSource(source) {
  let modified = source;

  // Pattern for import { ... } from '@appspine/frontend-shell' or '@appspine/frontend-shell/notification'
  const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"](@appspine\/frontend-shell(?:\/notification)?)['"];?/g;

  modified = modified.replace(importRegex, (fullMatch, specifiersStr, sourcePkg) => {
    const specifiers = specifiersStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const remainingSpecifiers = [];
    const newImports = new Map(); // targetPkg -> specifiers[]

    for (const spec of specifiers) {
      // Handle "type Foo", "Foo as Bar", "type Foo as Bar"
      const cleanName = spec
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
        .trim();

      const targetPkg = MIGRATION_MAP[cleanName];
      if (targetPkg) {
        if (!newImports.has(targetPkg)) {
          newImports.set(targetPkg, []);
        }
        newImports.get(targetPkg).push(spec);
      } else {
        remainingSpecifiers.push(spec);
      }
    }

    // If nothing changed, return original
    if (newImports.size === 0) {
      return fullMatch;
    }

    const lines = [];
    if (remainingSpecifiers.length > 0) {
      lines.push(`import { ${remainingSpecifiers.join(', ')} } from '${sourcePkg}';`);
    }

    for (const [targetPkg, specs] of newImports.entries()) {
      lines.push(`import { ${specs.join(', ')} } from '${targetPkg}';`);
    }

    return lines.join('\n');
  });

  return modified;
}

function runSelfTest() {
  const input = `import { Button, UsersTable, type UserRow } from '@appspine/frontend-shell';
import { NotificationBell, useNotificationPolling } from '@appspine/frontend-shell/notification';`;

  const output = transformSource(input);
  const expected = `import { Button } from '@appspine/frontend-shell';
import { UsersTable, type UserRow } from '@appspine/identity-core/frontend';
import { NotificationBell, useNotificationPolling } from '@appspine/notification/frontend';`;

  if (output.trim() !== expected.trim()) {
    console.error('Self test failed!\nExpected:\n', expected, '\nGot:\n', output);
    process.exit(1);
  }
  console.log('Self-test passed successfully.');
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    runSelfTest();
    return;
  }

  const targetDir = args[0] && !args[0].startsWith('--') ? args[0] : null;
  const apply = args.includes('--apply');

  if (!targetDir) {
    console.log('Usage: node scripts/051-pl3-frontend-migration-codemod.mjs <target-directory> [--apply]');
    return;
  }

  const absoluteTarget = path.resolve(process.cwd(), targetDir);
  if (!fs.existsSync(absoluteTarget)) {
    console.error(`Target directory does not exist: ${absoluteTarget}`);
    process.exit(1);
  }

  console.log(`Scanning ${absoluteTarget} (mode: ${apply ? 'APPLY' : 'DRY-RUN'})...`);

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.next') {
          walk(fullPath);
        }
      } else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const transformed = transformSource(content);
        if (transformed !== content) {
          console.log(`Migrated: ${path.relative(process.cwd(), fullPath)}`);
          if (apply) {
            fs.writeFileSync(fullPath, transformed, 'utf8');
          }
        }
      }
    }
  }

  walk(absoluteTarget);
  console.log('Done.');
}

if (process.argv[1] && path.basename(process.argv[1]).includes('051-pl3-frontend-migration-codemod')) {
  main();
}
