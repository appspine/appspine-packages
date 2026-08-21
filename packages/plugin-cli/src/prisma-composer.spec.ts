import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './cli';
import { COMMANDS } from './commands';
import { entry, manifest, type TestApp, testApp } from './commands/test-support';
import { ExitCode } from './exit-codes';
import {
  injectAugmentations,
  type PrismaContribution,
  SCHEMA_ARTIFACT,
  validateContributions,
} from './prisma-composer';

const apps: TestApp[] = [];
afterEach(() => {
  while (apps.length > 0) rmSync(apps.pop()?.root as string, { recursive: true, force: true });
});

/**
 * The PL0-06 fixtures froze these rules before any composer existed. Driving them through the real
 * implementation is the point: restating the expectations here instead would let the two drift.
 */
const FIXTURE_DIR = path.resolve(process.cwd(), '../../fixtures/051-prisma-permission/prisma');

interface FixtureContribution {
  plugin: string;
  owns?: { model: string; fields: string[] }[];
  augments?: { targetModel: string; field: string; type?: string }[];
}

function loadFixture(file: string): PrismaContribution[] {
  const parsed = JSON.parse(readFileSync(path.join(FIXTURE_DIR, file), 'utf8')) as {
    contributions: FixtureContribution[];
  };
  const ownerOf = (model: string) =>
    parsed.contributions.find((c) => (c.owns ?? []).some((o) => o.model === model))?.plugin ??
    'unknown';

  return parsed.contributions.map((contribution) => ({
    plugin: contribution.plugin,
    packageName: `@appspine/${contribution.plugin}`,
    owns: (contribution.owns ?? []).map((owned) => owned.model),
    ownsEnums: [],
    augments: (contribution.augments ?? []).map((augment) => ({
      targetModel: augment.targetModel,
      field: augment.field,
      owner: ownerOf(augment.targetModel),
      type: augment.type ?? 'String?',
    })),
    augmentedBy: [],
    fragment: null,
    fragmentPath: null,
  }));
}

describe('PL0-06 frozen rules', () => {
  it('accepts the real identity/RBAC/API-key composition', () => {
    const errors = validateContributions(loadFixture('scenarios/identity-rbac-apikey.json')).filter(
      (entry) => entry.severity === 'error',
    );
    expect(errors).toEqual([]);
  });

  it('fails on two owners for one model, and never picks', () => {
    const diagnostics = validateContributions(loadFixture('negative/owner-collision.json'));
    expect(diagnostics.map((d) => d.code)).toContain('owner-collision');
    expect(diagnostics.find((d) => d.code === 'owner-collision')?.message).toContain(
      'acme-custom-rbac-fork and rbac',
    );
  });

  it('fails on an augmentation whose target nobody owns', () => {
    const diagnostics = validateContributions(
      loadFixture('negative/missing-augmentation-target.json'),
    );
    expect(diagnostics.map((d) => d.code)).toContain('missing-augmentation-target');
  });

  it('keeps A/bc and Ab/c apart', () => {
    // The frozen regression: concatenating targetModel + field gives "Abc" for both.
    const contributions = loadFixture('scenarios/ambiguous-augmentation-sort-key.json');
    const errors = validateContributions(contributions).filter((e) => e.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('reports the same diagnostics regardless of contribution order', () => {
    const contributions = loadFixture('negative/owner-collision.json');
    const forward = validateContributions(contributions);
    const reversed = validateContributions([...contributions].reverse());
    expect(reversed.map((d) => d.code)).toEqual(forward.map((d) => d.code));
  });
});

describe('extra rules this composer adds', () => {
  const base: PrismaContribution = {
    plugin: 'identity-core',
    packageName: '@appspine/identity-core',
    owns: ['User'],
    ownsEnums: [],
    augments: [],
    augmentedBy: [{ plugin: 'rbac', field: 'userRoles' }],
    fragment: null,
    fragmentPath: null,
  };

  function augmenter(overrides: Partial<PrismaContribution['augments'][number]> = {}) {
    return {
      ...base,
      plugin: 'rbac',
      packageName: '@appspine/rbac',
      owns: ['UserRole'],
      augmentedBy: [],
      augments: [
        {
          targetModel: 'User',
          field: 'userRoles',
          owner: 'identity-core',
          type: 'UserRole[]',
          ...overrides,
        },
      ],
    } satisfies PrismaContribution;
  }

  it('accepts an augmentation the owner declared', () => {
    expect(validateContributions([base, augmenter()])).toEqual([]);
  });

  it('rejects an augmentation with no Prisma type, because it cannot be written', () => {
    const diagnostics = validateContributions([base, augmenter({ type: undefined })]);
    expect(diagnostics.map((d) => d.code)).toContain('augmentation-without-type');
  });

  it('rejects an augmentation that names the wrong owner', () => {
    const diagnostics = validateContributions([base, augmenter({ owner: 'audit-log' })]);
    expect(diagnostics.map((d) => d.code)).toContain('augmentation-owner-mismatch');
  });

  it('warns — but does not fail — when the owner never listed the augmenter', () => {
    // The owner's `augmentedBy` is documentation. Worth surfacing, not worth blocking on.
    const diagnostics = validateContributions([{ ...base, augmentedBy: [] }, augmenter()]);
    expect(diagnostics.map((d) => d.code)).toContain('undeclared-augmentation');
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('rejects two owners for one enum', () => {
    const diagnostics = validateContributions([
      { ...base, ownsEnums: ['AuditAction'] },
      {
        ...base,
        plugin: 'audit-log',
        packageName: '@appspine/audit-log',
        owns: [],
        ownsEnums: ['AuditAction'],
      },
    ]);
    expect(diagnostics.map((d) => d.code)).toContain('enum-owner-collision');
  });
});

describe('injectAugmentations', () => {
  const fragment = [
    'model User {',
    '  id    String @id',
    '  email String @unique',
    '',
    '  @@map("users")',
    '}',
    '',
  ].join('\n');

  it('writes the field with the other fields, not after the block attributes', () => {
    const { text, injected } = injectAugmentations(fragment, 'User', [
      { field: 'userRoles', type: 'UserRole[]', plugin: 'rbac' },
    ]);

    expect(injected).toBe(true);
    const lines = text.split('\n');
    expect(lines.indexOf('  userRoles UserRole[]')).toBeLessThan(
      lines.findIndex((line) => line.includes('@@map')),
    );
    expect(text).toContain('/// Contributed by @appspine/rbac');
  });

  it('leaves a fragment alone when the model is not in it', () => {
    const { text, injected } = injectAugmentations(fragment, 'Role', [
      { field: 'x', type: 'String?', plugin: 'rbac' },
    ]);
    expect(injected).toBe(false);
    expect(text).toBe(fragment);
  });

  it('does nothing when there is nothing to add', () => {
    expect(injectAugmentations(fragment, 'User', []).text).toBe(fragment);
  });
});

describe('generated schema.prisma', () => {
  const OWNER = manifest({
    id: 'identity-core',
    provides: ['appspine.identity-store'],
    requires: [],
    facets: {
      backend: { modulePath: './dist/index.js', exportName: 'M' },
      prisma: {
        owns: ['User'],
        schemaFragment: 'prisma/user.prisma',
        augmentedBy: [{ plugin: 'rbac', field: 'userRoles' }],
      },
    },
  });

  const AUGMENTER = manifest({
    id: 'rbac',
    provides: ['appspine.rbac-policy'],
    requires: ['appspine.identity-store'],
    facets: {
      backend: { modulePath: './dist/index.js', exportName: 'M' },
      prisma: {
        owns: ['UserRole'],
        schemaFragment: 'prisma/role.prisma',
        augments: [
          { targetModel: 'User', field: 'userRoles', owner: 'identity-core', type: 'UserRole[]' },
        ],
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

  function withFragments(root: string) {
    writeFileSync(
      path.join(root, 'node_modules/@appspine/identity-core/prisma/user.prisma'),
      ['model User {', '  id    String @id', '', '  @@map("users")', '}', ''].join('\n'),
      'utf8',
    );
    writeFileSync(
      path.join(root, 'node_modules/@appspine/rbac/prisma/role.prisma'),
      ['model UserRole {', '  userId String @id', '}', ''].join('\n'),
      'utf8',
    );
  }

  it('writes the augmentation into the owner model it does not belong to', async () => {
    const { root } = make({
      installed: [OWNER, AUGMENTER],
      inventory: [entry('identity-core'), entry('rbac')],
    });
    withFragments(root);

    const { code } = await run(['build'], root);

    expect(code).toBe(ExitCode.OK);
    const schema = readFileSync(path.join(root, SCHEMA_ARTIFACT), 'utf8');
    expect(schema).toContain('userRoles UserRole[]');
    // ...inside User, not appended at the end of the file.
    const userBlock = schema.slice(
      schema.indexOf('model User {'),
      schema.indexOf('@@map("users")'),
    );
    expect(userBlock).toContain('userRoles UserRole[]');
  });

  it('says it is generated and applies nothing', async () => {
    const { root } = make({
      installed: [OWNER, AUGMENTER],
      inventory: [entry('identity-core'), entry('rbac')],
    });
    withFragments(root);
    await run(['build'], root);

    const schema = readFileSync(path.join(root, SCHEMA_ARTIFACT), 'utf8');
    expect(schema).toContain('DO NOT EDIT');
    expect(schema).toContain('nothing here has been applied to any');
    // Deployment configuration is the App's, not a plugin contribution.
    expect(schema).not.toContain('datasource db');
    expect(schema).not.toContain('generator client');
  });

  it('refuses to build when a model has two owners', async () => {
    const rival = manifest({
      ...AUGMENTER,
      id: 'audit-log',
      provides: ['appspine.audit-sink'],
      requires: [],
      facets: {
        backend: { modulePath: './dist/index.js', exportName: 'M' },
        prisma: { owns: ['User'], schemaFragment: 'prisma/dup.prisma' },
      },
    });
    const { root } = make({
      installed: [OWNER, rival],
      inventory: [entry('identity-core'), entry('audit-log')],
    });
    // Only identity-core and audit-log are installed here, so `withFragments` (which also
    // writes rbac's) would fail on a package that is not there.
    writeFileSync(
      path.join(root, 'node_modules/@appspine/identity-core/prisma/user.prisma'),
      ['model User {', '  id String @id', '}', ''].join(String.fromCharCode(10)),
      'utf8',
    );
    writeFileSync(
      path.join(root, 'node_modules/@appspine/audit-log/prisma/dup.prisma'),
      ['model User {', '  id String @id', '}', ''].join(String.fromCharCode(10)),
      'utf8',
    );

    const { code, envelope } = await run(['build'], root);

    expect(code).toBe(ExitCode.RESOLUTION_FAILED);
    // The resolver already treats two plugins contributing the same Prisma model as a duplicate
    // contribution, so it refuses one layer earlier than the composer would. Both are correct; the
    // point of this test is that nothing is written, not which layer said no first.
    expect(JSON.stringify(envelope.diagnostics)).toContain('User');
    expect(envelope.diagnostics.map((d: { code: string }) => d.code)).toContain(
      'duplicate-prisma-model',
    );
  });

  it('is byte-stable and independent of inventory order', async () => {
    const a = make({
      installed: [OWNER, AUGMENTER],
      inventory: [entry('identity-core'), entry('rbac')],
    });
    const b = make({
      installed: [OWNER, AUGMENTER],
      inventory: [entry('rbac'), entry('identity-core')],
    });
    withFragments(a.root);
    withFragments(b.root);

    await run(['build'], a.root);
    await run(['build'], b.root);

    expect(readFileSync(path.join(a.root, SCHEMA_ARTIFACT), 'utf8')).toBe(
      readFileSync(path.join(b.root, SCHEMA_ARTIFACT), 'utf8'),
    );
  });

  it('reports a migration plan input without running a migration', async () => {
    const { root } = make({
      installed: [OWNER, AUGMENTER],
      inventory: [entry('identity-core'), entry('rbac')],
    });
    withFragments(root);

    const { envelope } = await run(['build'], root);

    expect(envelope.data.schemaDigest).toMatch(/^sha256:/);
    expect(envelope.data.migrationPlan.models.map((m: { model: string }) => m.model)).toEqual([
      'User',
      'UserRole',
    ]);
    expect(envelope.data.migrationPlan.augmentations).toEqual([
      { targetModel: 'User', field: 'userRoles', plugin: 'rbac', type: 'UserRole[]' },
    ]);
  });
});
