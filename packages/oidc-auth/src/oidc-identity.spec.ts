import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@appspine/common', () => ({ PrismaService: class PrismaService {} }));

import { OidcIdentityService, type VerifiedOidcIdentity } from './oidc-identity.service';

/**
 * PL0-04 §5 froze the identity-key contract in
 * `fixtures/051-identity-boundary/cases.json` *before* any of this code existed, and named these
 * cases "PL1-12 正式 persistence/strategy tests 的最低相容門檻". This file is that gate: the
 * fixtures drive the assertions rather than being restated in them.
 */
const fixtures = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), '../../fixtures/051-identity-boundary/cases.json'),
    'utf8',
  ),
) as {
  identityKeyCases: {
    name: string;
    left: { issuer: string; subject: string; email: string };
    right: { issuer: string; subject: string; email: string };
    expected: 'same' | 'different';
  }[];
  invalidIdentityCases: {
    name: string;
    identity: { issuer: string; subject: string };
    expectedFailure: string;
  }[];
};

interface StoredMapping {
  issuer: string;
  subject: string;
  userId: string;
}

/** In-memory stand-in for the `OidcIdentity` table, including its (issuer, subject) uniqueness. */
function createBackend(seedUsers: { id: string; email: string; isActive?: boolean }[] = []) {
  const mappings: StoredMapping[] = [];
  const users = seedUsers.map((user) => ({ isActive: true, ...user }));
  /** Emails claimed by an in-flight transaction — the fake's stand-in for `User.email @unique`. */
  const reservedEmails = new Set<string>();
  const audit: unknown[] = [];
  let nextId = users.length + 1;

  const prisma: {
    oidcIdentity: {
      findUnique: (input: {
        where: { issuer_subject: { issuer: string; subject: string } };
      }) => Promise<StoredMapping | null>;
      create: (input: { data: StoredMapping }) => Promise<StoredMapping>;
      delete: (input: {
        where: { issuer_subject: { issuer: string; subject: string } };
      }) => Promise<StoredMapping>;
    };
    $transaction: <T>(callback: (transaction: unknown) => Promise<T>) => Promise<T>;
  } = {
    oidcIdentity: {
      findUnique: async ({
        where,
      }: {
        where: { issuer_subject: { issuer: string; subject: string } };
      }) =>
        mappings.find(
          (entry) =>
            entry.issuer === where.issuer_subject.issuer &&
            entry.subject === where.issuer_subject.subject,
        ) ?? null,
      create: async ({ data }: { data: StoredMapping }) => {
        if (
          mappings.some((entry) => entry.issuer === data.issuer && entry.subject === data.subject)
        ) {
          throw new Error('Unique constraint failed on (issuer, subject)');
        }
        mappings.push({ issuer: data.issuer, subject: data.subject, userId: data.userId });
        return data;
      },
      delete: async ({
        where,
      }: {
        where: { issuer_subject: { issuer: string; subject: string } };
      }) => {
        const index = mappings.findIndex(
          (entry) =>
            entry.issuer === where.issuer_subject.issuer &&
            entry.subject === where.issuer_subject.subject,
        );
        if (index === -1) throw new Error('Record to delete does not exist');
        return mappings.splice(index, 1)[0];
      },
    },
    async $transaction<T>(callback: (transaction: unknown) => Promise<T>) {
      // Models a real transaction's isolation: writes land in a private buffer and become visible
      // to everyone else only once the callback resolves.
      //
      // The first version snapshotted the shared arrays and restored them on failure. Under
      // `Promise.all` that is not a rollback — the loser's restore erased rows the winner had
      // already committed, and the concurrency test below could only pass because the production
      // code happened not to write inside a transaction. Gate G1 review S6 moved that write into
      // one, and this fake had to become honest before it could tell the difference.
      const pendingMappings: StoredMapping[] = [];
      const pendingAudit: unknown[] = [];
      const pendingUsers: { id: string; email: string; isActive: boolean }[] = [];
      const transaction = {
        oidcIdentity: {
          findUnique: prisma.oidcIdentity.findUnique,
          create: async ({ data }: { data: StoredMapping }) => {
            if (
              [...mappings, ...pendingMappings].some(
                (entry) => entry.issuer === data.issuer && entry.subject === data.subject,
              )
            ) {
              throw new Error('Unique constraint failed on (issuer, subject)');
            }
            pendingMappings.push({
              issuer: data.issuer,
              subject: data.subject,
              userId: data.userId,
            });
            return data;
          },
        },
        pendingAudit,
        pendingUsers,
      };
      try {
        const result = await callback(transaction);
        mappings.push(...pendingMappings);
        audit.push(...pendingAudit);
        users.push(...pendingUsers);
        return result;
      } finally {
        // `User.email @unique` is not deferred, so the reservation is what makes a concurrent
        // insert of the same email fail immediately rather than at commit. Releasing it here is
        // the rollback half of that.
        for (const user of pendingUsers) reservedEmails.delete(user.email);
      }
    },
  };

  const identityStore = {
    async findById(id: string) {
      return users.find((user) => user.id === id) ?? null;
    },
    async findByEmail(email: string) {
      return users.find((user) => user.email === email) ?? null;
    },
    async create(input: { email: string; name?: string | null }, transaction?: unknown) {
      // Mirrors `User.email @unique`: without it the concurrency test below would pass by
      // accident, since nothing would stop two racing logins from each creating an account.
      const pendingUsers = (
        transaction as { pendingUsers?: { id: string; email: string; isActive: boolean }[] }
      )?.pendingUsers;
      if (users.some((user) => user.email === input.email) || reservedEmails.has(input.email)) {
        throw new Error('Email already registered');
      }
      const created = { id: `user-${nextId++}`, email: input.email, isActive: true };
      if (pendingUsers) {
        reservedEmails.add(input.email);
        pendingUsers.push(created);
      } else {
        users.push(created);
      }
      return created;
    },
  };

  const auditTransactions: unknown[] = [];
  const auditSink = {
    record: async (entry: unknown, transaction?: unknown) => {
      // Write through the transaction when one is given — that is the `AuditSinkPort` contract,
      // and a fake that ignores it cannot show a rolled-back audit record disappearing.
      const buffer = (transaction as { pendingAudit?: unknown[] } | undefined)?.pendingAudit;
      (buffer ?? audit).push(entry);
      auditTransactions.push(transaction);
    },
  };

  const service = new OidcIdentityService(
    prisma as never,
    identityStore as never,
    auditSink as never,
  );

  return { service, mappings, users, audit, auditTransactions, auditSink, prisma };
}

function identity(overrides: Partial<VerifiedOidcIdentity>): VerifiedOidcIdentity {
  return {
    issuer: 'https://id.example.com/realms/staff',
    subject: '00u-123',
    email: 'user@example.com',
    emailVerified: true,
    ...overrides,
  };
}

describe('frozen identity-key cases (fixtures/051-identity-boundary)', () => {
  it.each(
    fixtures.identityKeyCases.map((testCase) => [testCase.name, testCase] as const),
  )('%s', async (_name, testCase) => {
    const { service, mappings } = createBackend();

    const left = await service.resolve(identity({ ...testCase.left, emailVerified: true }));
    const right = await service.resolve(identity({ ...testCase.right, emailVerified: true }));

    if (testCase.expected === 'same') {
      // One external identity: one mapping row, and the second login must not re-provision.
      expect(mappings).toHaveLength(1);
      expect(right.userId).toBe(left.userId);
      expect(right.provisioned).toBe(false);
    } else {
      // Two external identities: two mapping rows. They may still resolve onto the *same* local
      // account — that is what the email-linking transition does when the addresses match — but
      // the identities themselves stay distinct, which is what PL0-04 §5 freezes.
      expect(mappings).toHaveLength(2);
      expect(new Set(mappings.map((entry) => `${entry.issuer}|${entry.subject}`)).size).toBe(2);
    }
  });

  it.each(
    fixtures.invalidIdentityCases.map((testCase) => [testCase.name, testCase] as const),
  )('rejects: %s', async (_name, testCase) => {
    const { service } = createBackend();
    await expect(
      service.resolve(identity({ ...testCase.identity, email: 'x@example.com' })),
    ).rejects.toThrow(testCase.expectedFailure.startsWith('issuer') ? /issuer/ : /subject/);
  });
});

describe('legacy email linking (PL0-04 §4.1 transition)', () => {
  it('links exactly one active pre-existing account and records why', async () => {
    const { service, mappings, audit, auditTransactions } = createBackend([
      { id: 'legacy-1', email: 'legacy@example.com' },
    ]);

    const resolved = await service.resolve(identity({ email: 'legacy@example.com' }));

    expect(resolved).toEqual({
      userId: 'legacy-1',
      linkedFromLegacyEmail: true,
      provisioned: false,
    });
    expect(mappings).toEqual([
      { issuer: 'https://id.example.com/realms/staff', subject: '00u-123', userId: 'legacy-1' },
    ]);
    expect(audit).toHaveLength(1);
    // The audit record went through the same transaction client that wrote the mapping, which is
    // what makes the rollback in the next test possible at all.
    expect(auditTransactions).toHaveLength(1);
    expect(auditTransactions[0]).toMatchObject({ oidcIdentity: expect.any(Object) });
  });

  it('rolls back the mapping when its required audit write fails', async () => {
    const { service, mappings, auditSink } = createBackend([
      { id: 'legacy-1', email: 'legacy@example.com' },
    ]);
    auditSink.record = async () => {
      throw new Error('audit database unavailable');
    };

    await expect(service.resolve(identity({ email: 'legacy@example.com' }))).rejects.toThrow(
      /audit database unavailable/,
    );
    expect(mappings).toEqual([]);
  });

  it('refuses to link an inactive account rather than reviving it', async () => {
    const { service } = createBackend([
      { id: 'legacy-1', email: 'legacy@example.com', isActive: false },
    ]);

    await expect(service.resolve(identity({ email: 'legacy@example.com' }))).rejects.toThrow(
      /No active local account/,
    );
  });

  it('JIT-provisions when there is no account to link, preserving pre-split behaviour', async () => {
    const { service, users, audit } = createBackend();

    const resolved = await service.resolve(identity({ email: 'newcomer@example.com' }));

    expect(resolved.provisioned).toBe(true);
    expect(resolved.linkedFromLegacyEmail).toBe(false);
    expect(users.map((user) => user.email)).toEqual(['newcomer@example.com']);
    expect(audit).toHaveLength(1);
  });

  it('never uses an unverified email to reach an existing account', async () => {
    const { service } = createBackend([{ id: 'legacy-1', email: 'legacy@example.com' }]);

    await expect(
      service.resolve(identity({ email: 'legacy@example.com', emailVerified: false })),
    ).rejects.toThrow(/not verified/);
  });

  it('stops using email at all once a mapping exists, even if the email changed', async () => {
    const { service } = createBackend([{ id: 'legacy-1', email: 'before@example.com' }]);

    const first = await service.resolve(identity({ email: 'before@example.com' }));
    // Same (issuer, subject), different email, and no account with the new address exists.
    const second = await service.resolve(identity({ email: 'after@example.com' }));

    expect(second.userId).toBe(first.userId);
    expect(second.provisioned).toBe(false);
    expect(second.linkedFromLegacyEmail).toBe(false);
  });
});

describe('dangling mappings (Gate G1 review S7)', () => {
  it('does not lock an external identity out after its account is deleted', async () => {
    const { service, users, mappings } = createBackend([
      { id: 'legacy-1', email: 'gone@example.com' },
    ]);

    const first = await service.resolve(identity({ email: 'gone@example.com' }));
    expect(first.userId).toBe('legacy-1');

    // The account is deleted through the Users API. `OidcIdentity` has no FK, so the mapping stays.
    users.splice(0, users.length);

    const second = await service.resolve(identity({ email: 'gone@example.com' }));

    // The stale mapping was dropped and the login provisioned again, rather than resolving forever
    // to an account that no longer exists.
    expect(second.provisioned).toBe(true);
    expect(users).toHaveLength(1);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].userId).toBe(second.userId);
  });
});

describe('provisioning atomicity (Gate G1 review S6)', () => {
  it('leaves no half-provisioned account behind when the audit write fails', async () => {
    const { service, users, mappings, auditSink } = createBackend();
    const working = auditSink.record;
    auditSink.record = async () => {
      throw new Error('audit sink down');
    };

    await expect(service.resolve(identity({ email: 'newcomer@example.com' }))).rejects.toThrow(
      /audit sink down/,
    );
    // The account creation was inside the same transaction as the mapping and the audit record,
    // so nothing survives the failure.
    expect(users).toHaveLength(0);
    expect(mappings).toHaveLength(0);

    auditSink.record = working;
    const retry = await service.resolve(identity({ email: 'newcomer@example.com' }));

    // The retry is a *provision*, not a legacy-email link. Before this was one transaction, the
    // orphaned account made the retry take the legacy branch, permanently flagging a brand-new
    // account as `linkedFromLegacyEmail` — the very number operators use to decide when the email
    // fallback can be switched off.
    expect(retry.provisioned).toBe(true);
    expect(retry.linkedFromLegacyEmail).toBe(false);
    expect(users).toHaveLength(1);
  });
});

describe('concurrency', () => {
  it('resolves both racing logins to one account instead of failing the loser', async () => {
    const { service, users, mappings } = createBackend();

    const [first, second] = await Promise.all([
      service.resolve(identity({ subject: '00u-a', email: 'race@example.com' })),
      service.resolve(identity({ subject: '00u-b', email: 'race@example.com' })),
    ]);

    // Two distinct external identities, one local account: both logins saw "no such user", both
    // tried to create it, and the loser recovered onto the winner's row rather than 500-ing.
    expect(first.userId).toBe(second.userId);
    expect(users).toHaveLength(1);
    expect(mappings).toHaveLength(2);
  });

  it('refuses to move an existing mapping to a different account', async () => {
    const { service, mappings } = createBackend([
      { id: 'legacy-1', email: 'a@example.com' },
      { id: 'legacy-2', email: 'b@example.com' },
    ]);

    await service.resolve(identity({ email: 'a@example.com' }));
    mappings[0].userId = 'legacy-2';

    // The mapping now points elsewhere; resolving again must return what is stored, not re-link.
    const again = await service.resolve(identity({ email: 'a@example.com' }));
    expect(again.userId).toBe('legacy-2');
  });
});
