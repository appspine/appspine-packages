import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './cli';
import { COMMANDS } from './commands';
import { entry, manifest, type TestApp, testApp } from './commands/test-support';
import { ExitCode } from './exit-codes';
import {
  type DesiredPermission,
  PERMISSION_ARTIFACT,
  type PermissionRecord,
  reconcilePermissions,
} from './permission-reconciler';

const apps: TestApp[] = [];
afterEach(() => {
  while (apps.length > 0) rmSync(apps.pop()?.root as string, { recursive: true, force: true });
});

const FIXTURE_DIR = path.resolve(process.cwd(), '../../fixtures/051-prisma-permission/permission');

interface Fixture {
  targetGeneration: number;
  currentState: PermissionRecord[];
  desiredState: DesiredPermission[];
  expectedPlanOpCodes?: string[];
  expectedOpsNeverIncluding?: string[];
  expectedFailure?: string;
}

function fixture(file: string): Fixture {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, file), 'utf8'));
}

function run(file: string) {
  const data = fixture(file);
  return {
    data,
    result: reconcilePermissions(data.currentState, data.desiredState, data.targetGeneration),
  };
}

describe('PL0-06 frozen permission rules', () => {
  it('produces exactly the five op codes the upgrade scenario expects', () => {
    const { data, result } = run('scenarios/add-rename-retire.json');

    expect(result.plan).not.toBeNull();
    const codes = [...new Set(result.plan?.ops.map((op) => op.op))].sort();
    expect(codes).toEqual([...(data.expectedPlanOpCodes as string[])].sort());
  });

  it('never emits a delete, whatever left the desired state', () => {
    // A permission that disappears is retired, not deleted: every historical grant and audit row
    // has to stay interpretable (051 decision 13 says the same about Prisma data).
    const { data, result } = run('scenarios/add-rename-retire.json');
    for (const forbidden of data.expectedOpsNeverIncluding ?? []) {
      expect(result.plan?.ops.map((op) => op.op)).not.toContain(forbidden);
    }
    expect(result.plan?.ops).toContainEqual({
      op: 'retire',
      id: 'notification:digest:send',
      reason: 'not-in-desired-state',
    });
  });

  it('renames through an alias, leaving the old ID in place', () => {
    const { result } = run('scenarios/add-rename-retire.json');
    expect(result.plan?.ops).toContainEqual({
      op: 'alias',
      id: 'rbac:role:delete',
      aliasOf: 'rbac:role:legacy-delete',
      displayName: 'Delete Role',
    });
    // The aliased-away ID is not retired: it still resolves for everything that references it.
    expect(result.plan?.ops.filter((op) => op.op === 'retire').map((op) => op.id)).not.toContain(
      'rbac:role:legacy-delete',
    );
  });

  it.each([
    ['negative/alias-target-not-found.json', 'alias-target-not-found'],
    ['negative/downgrade-blocked.json', 'downgrade-blocked'],
    ['negative/duplicate-permission-id.json', 'duplicate-permission-id'],
  ])('%s fails with %s and produces no plan', (file, code) => {
    const { result } = run(file);
    expect(result.diagnostics.map((entry) => entry.code)).toContain(code);
    // No half-built plan: an operator seeing a list that looks complete would apply it.
    expect(result.plan).toBeNull();
  });
});

describe('reconciler behaviour beyond the fixtures', () => {
  const current: PermissionRecord[] = [
    { id: 'rbac:role:create', displayName: 'Create Role', status: 'active', schemaGeneration: 1 },
  ];

  it('changes a display name without touching the ID', () => {
    const result = reconcilePermissions(
      current,
      [{ id: 'rbac:role:create', displayName: 'Create a Role' }],
      2,
    );
    expect(result.plan?.ops).toEqual([
      { op: 'update-display', id: 'rbac:role:create', from: 'Create Role', to: 'Create a Role' },
    ]);
  });

  it('rejects an ID that is not namespaced', () => {
    const result = reconcilePermissions([], [{ id: 'createRole', displayName: 'x' }], 1);
    expect(result.diagnostics.map((d) => d.code)).toContain('invalid-permission-id');
  });

  it('rejects a self-alias', () => {
    const result = reconcilePermissions(
      current,
      [{ id: 'rbac:role:create', displayName: 'x', aliasOf: 'rbac:role:create' }],
      1,
    );
    expect(result.diagnostics.map((d) => d.code)).toContain('self-alias');
  });

  it('leaves an already-retired permission alone', () => {
    const result = reconcilePermissions(
      [{ id: 'rbac:role:old', displayName: 'Old', status: 'retired', schemaGeneration: 1 }],
      [],
      2,
    );
    expect(result.plan?.ops).toEqual([]);
  });

  it('is order-independent: the same inputs give the same digest', () => {
    const desired: DesiredPermission[] = [
      { id: 'rbac:role:create', displayName: 'Create Role' },
      { id: 'audit-log:entry:read', displayName: 'Read Audit Entries' },
    ];
    const forward = reconcilePermissions(current, desired, 2);
    const reversed = reconcilePermissions(current, [...desired].reverse(), 2);
    expect(reversed.plan?.digest).toBe(forward.plan?.digest);
  });
});

describe('generated permissions.json', () => {
  const RBAC = manifest({
    id: 'rbac',
    provides: ['appspine.rbac-policy'],
    requires: [],
    facets: {
      backend: { modulePath: './dist/index.js', exportName: 'M' },
      permissions: {
        definitions: [
          { id: 'rbac:role:create', displayName: 'Create Role' },
          { id: 'rbac:role:read', displayName: 'Read Roles', frontendOnly: true },
        ],
      },
    },
  });

  const TRESPASSER = manifest({
    id: 'audit-log',
    provides: ['appspine.audit-sink'],
    requires: [],
    facets: {
      backend: { modulePath: './dist/index.js', exportName: 'M' },
      permissions: { definitions: [{ id: 'rbac:role:delete', displayName: 'Delete Role' }] },
    },
  });

  function make(options: Parameters<typeof testApp>[0]) {
    const created = testApp(options);
    apps.push(created);
    return created;
  }

  async function cli(argv: string[], root: string) {
    const out: string[] = [];
    const code = await runCli([...argv, '--json', '--cwd', root], {
      commands: COMMANDS,
      version: '9.9.9',
      io: { stdout: (l) => out.push(l), stderr: () => {}, cwd: () => root },
    });
    const text = out.join('\n');
    return { code, envelope: JSON.parse(text.slice(text.lastIndexOf('{\n  "schemaVersion"'))) };
  }

  it('collects what the installed plugins declare', async () => {
    const { root } = make({ installed: [RBAC], inventory: [entry('rbac')] });

    const { code } = await cli(['build'], root);

    expect(code).toBe(ExitCode.OK);
    const document = JSON.parse(readFileSync(path.join(root, PERMISSION_ARTIFACT), 'utf8'));
    expect(document.desired.map((entry: { id: string }) => entry.id)).toEqual([
      'rbac:role:create',
      'rbac:role:read',
    ]);
    expect(document.freshInstallPlan.every((op: { op: string }) => op.op === 'add')).toBe(true);
  });

  it('keeps a frontend-only permission as a visibility hint, not an authorization decision', async () => {
    const { root } = make({ installed: [RBAC], inventory: [entry('rbac')] });
    await cli(['build'], root);

    const document = JSON.parse(readFileSync(path.join(root, PERMISSION_ARTIFACT), 'utf8'));
    const read = document.desired.find((e: { id: string }) => e.id === 'rbac:role:read');
    expect(read.frontendOnly).toBe(true);
    // It is still a real permission in the plan; `frontendOnly` says where it is *shown*, not
    // whether it is enforced.
    expect(document.freshInstallPlan.map((op: { id: string }) => op.id)).toContain(
      'rbac:role:read',
    );
  });

  it('refuses a permission declared outside the plugin namespace', async () => {
    const { root } = make({ installed: [TRESPASSER], inventory: [entry('audit-log')] });

    await cli(['build'], root);

    const document = JSON.parse(readFileSync(path.join(root, PERMISSION_ARTIFACT), 'utf8'));
    expect(document.desired).toEqual([]);
    expect(document.diagnostics.map((d: { code: string }) => d.code)).toContain(
      'permission-outside-namespace',
    );
  });

  it('says plainly that it never reads or writes the App database', async () => {
    const { root } = make({ installed: [RBAC], inventory: [entry('rbac')] });
    await cli(['build'], root);
    const raw = readFileSync(path.join(root, PERMISSION_ARTIFACT), 'utf8');
    expect(raw).toContain('never reads or writes');
  });
});
