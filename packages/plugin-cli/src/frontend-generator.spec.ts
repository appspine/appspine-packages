import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './cli';
import { COMMANDS } from './commands';
import { entry, manifest, type TestApp, testApp } from './commands/test-support';
import {
  FRONTEND_ADMIN_ROUTES_ARTIFACT,
  FRONTEND_I18N_ARTIFACT,
  FRONTEND_NAVIGATION_ARTIFACT,
  FRONTEND_SLOTS_ARTIFACT,
  sortWithDependencies,
} from './frontend-generator';

const apps: TestApp[] = [];
afterEach(() => {
  while (apps.length > 0) rmSync(apps.pop()?.root as string, { recursive: true, force: true });
});

const USERS_PLUGIN = manifest({
  id: 'identity-core',
  provides: ['appspine.identity-store'],
  requires: ['appspine.prisma'],
  facets: {
    backend: { modulePath: './dist/index.js', exportName: 'IdentityCoreModule' },
    frontend: {
      adminPages: [
        {
          id: 'users',
          routePath: '/dashboard/users',
          title: 'users',
          componentExport: 'UsersTable',
          requiredPermission: 'identity:user:read',
          order: 10,
        },
      ],
      navigationItems: [
        {
          id: 'users',
          title: 'users',
          href: '/dashboard/users',
          icon: 'Users',
          order: 10,
          section: 'admin',
          requiredPermission: 'identity:user:read',
        },
      ],
      i18nNamespace: 'users',
    },
  },
});

const ROLES_PLUGIN = manifest({
  id: 'rbac',
  provides: ['appspine.rbac-policy'],
  requires: ['appspine.identity-store'],
  facets: {
    backend: { modulePath: './dist/index.js', exportName: 'RbacModule' },
    frontend: {
      adminPages: [
        {
          id: 'roles',
          routePath: '/dashboard/roles',
          title: 'roles',
          componentExport: 'RolesTable',
          requiredPermission: 'rbac:role:read',
          order: 20,
        },
      ],
      navigationItems: [
        {
          id: 'roles',
          title: 'roles',
          href: '/dashboard/roles',
          icon: 'ShieldCheck',
          order: 20,
          section: 'admin',
          requiredPermission: 'rbac:role:read',
          after: 'users',
        },
      ],
      i18nNamespace: 'rbac',
    },
  },
});

const NOTIF_PLUGIN = manifest({
  id: 'notification',
  provides: ['appspine.notification-inbox'],
  requires: [],
  facets: {
    backend: { modulePath: './dist/index.js', exportName: 'NotificationModule' },
    frontend: {
      slots: [
        {
          slot: 'header.actions',
          componentExport: 'NotificationBell',
          order: 1,
        },
      ],
      i18nNamespace: 'notification',
    },
  },
});

function make(options: Parameters<typeof testApp>[0]) {
  const created = testApp(options);
  apps.push(created);
  return created;
}

async function run(argv: string[], root: string) {
  const out: string[] = [];
  const code = await runCli([...argv, '--json', '--cwd', root], {
    commands: COMMANDS,
    version: '9.9.9',
    io: { stdout: (l) => out.push(l), stderr: () => {}, cwd: () => root },
  });
  const text = out.join('\n');
  return { code, envelope: JSON.parse(text.slice(text.lastIndexOf('{\n  "schemaVersion"'))) };
}

describe('sortWithDependencies', () => {
  it('respects after dependency', () => {
    const items = [
      { id: 'b', after: 'a', order: 1 },
      { id: 'a', order: 2 },
    ];
    const sorted = sortWithDependencies(items);
    expect(sorted.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('respects before dependency', () => {
    const items = [
      { id: 'b', order: 1 },
      { id: 'a', before: 'b', order: 2 },
    ];
    const sorted = sortWithDependencies(items);
    expect(sorted.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('breaks ties deterministically with order and id', () => {
    const items = [
      { id: 'z', order: 10 },
      { id: 'a', order: 10 },
      { id: 'm', order: 5 },
    ];
    const sorted = sortWithDependencies(items);
    expect(sorted.map((i) => i.id)).toEqual(['m', 'a', 'z']);
  });

  it('throws on circular dependencies', () => {
    const items = [
      { id: 'a', before: 'b' },
      { id: 'b', before: 'a' },
    ];
    expect(() => sortWithDependencies(items)).toThrow(/Cyclic dependency detected/);
  });
});

describe('Next.js build-time frontend generator', () => {
  it('generates navigation, admin-routes, slots, and i18n artifacts on build', async () => {
    const { root } = make({
      installed: [USERS_PLUGIN, ROLES_PLUGIN, NOTIF_PLUGIN],
      inventory: [entry('identity-core'), entry('rbac'), entry('notification')],
    });

    const { code } = await run(['build'], root);
    expect(code).toBe(0);

    const navContent = readFileSync(path.join(root, FRONTEND_NAVIGATION_ARTIFACT), 'utf8');
    expect(navContent).toContain('export const navigationItems');
    expect(navContent).toContain('id: "users"');
    expect(navContent).toContain('id: "roles"');

    const adminRoutesContent = readFileSync(
      path.join(root, FRONTEND_ADMIN_ROUTES_ARTIFACT),
      'utf8',
    );
    expect(adminRoutesContent).toContain('export const adminRoutes');
    expect(adminRoutesContent).toContain('routePath: "/dashboard/users"');
    expect(adminRoutesContent).toContain('routePath: "/dashboard/roles"');

    const slotsContent = readFileSync(path.join(root, FRONTEND_SLOTS_ARTIFACT), 'utf8');
    expect(slotsContent).toContain('export const slotRegistry');
    expect(slotsContent).toContain('"header.actions"');
    expect(slotsContent).toContain('componentExport: "NotificationBell"');

    const i18nContent = readFileSync(path.join(root, FRONTEND_I18N_ARTIFACT), 'utf8');
    expect(i18nContent).toContain('export const i18nNamespaces');
    expect(i18nContent).toContain('namespace: "users"');
    expect(i18nContent).toContain('namespace: "rbac"');
    expect(i18nContent).toContain('namespace: "notification"');
  });

  it('throws on duplicate admin route path across plugins', async () => {
    const DUPLICATE_ROUTE_PLUGIN = manifest({
      id: 'custom-admin',
      provides: ['appspine.custom-admin'],
      requires: [],
      facets: {
        frontend: {
          adminPages: [
            {
              id: 'custom-users',
              routePath: '/dashboard/users', // Collides with USERS_PLUGIN
            },
          ],
        },
      },
    });

    const { root } = make({
      installed: [USERS_PLUGIN, DUPLICATE_ROUTE_PLUGIN],
      inventory: [entry('identity-core'), entry('custom-admin')],
    });

    const { code, envelope } = await run(['build'], root);
    expect(code).not.toBe(0);
  });

  it('throws on duplicate i18n namespace across plugins', async () => {
    const DUPLICATE_I18N_PLUGIN = manifest({
      id: 'other-identity',
      provides: ['appspine.other-identity'],
      requires: [],
      facets: {
        frontend: {
          i18nNamespace: 'users', // Collides with USERS_PLUGIN
        },
      },
    });

    const { root } = make({
      installed: [USERS_PLUGIN, DUPLICATE_I18N_PLUGIN],
      inventory: [entry('identity-core'), entry('other-identity')],
    });

    const { code } = await run(['build'], root);
    expect(code).not.toBe(0);
  });
});
