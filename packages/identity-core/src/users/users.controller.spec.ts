import { describe, expect, it, vi } from 'vitest';

vi.mock('@appspine/common', () => ({
  AuditAction: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  paginationQuerySchema: {},
  ZodValidationPipe: class {
    transform(value: unknown) {
      return value;
    }
  },
}));
vi.mock('@appspine/audit-log', () => ({
  AuditLogService: class {},
  recordAuditSafely: vi.fn(),
}));

// vi.mock calls above are hoisted above this static import by vitest's transform, so
// UsersController's own imports resolve to the mocks rather than triggering Prisma resolution.
import { createUserSchema } from './dto/user.dto';
import { UsersController } from './users.controller';

function createController(createMock: ReturnType<typeof vi.fn>) {
  const usersService = { create: createMock };
  const auditLogService = { record: vi.fn().mockResolvedValue(undefined) };
  const controller = new UsersController(usersService as never, auditLogService as never);
  return { controller, usersService };
}

const actor = { sub: 'admin-1', email: 'admin@example.com' };

describe('UsersController.create', () => {
  it('passes only provider-neutral identity fields to UsersService.create', async () => {
    const createMock = vi.fn().mockResolvedValue({ id: 'user-1' });
    const { controller } = createController(createMock);

    await controller.create({ email: 'new@example.com', name: 'New User' }, actor);

    expect(createMock).toHaveBeenCalledWith({ email: 'new@example.com', name: 'New User' });
  });
});

describe('createUserSchema', () => {
  it('accepts the fields identity-core actually owns', () => {
    const parsed = createUserSchema.parse({
      email: 'new@example.com',
      name: 'New',
      roleIds: ['role-1'],
    });
    expect(parsed.email).toBe('new@example.com');
  });

  it('rejects a password instead of silently discarding it', () => {
    // Gate G1 review S4: the pre-split endpoint hashed this field, and Phase 1 removed it by
    // dropping the key. zod strips unknown keys, so the caller would have been told the account
    // was created *with* a password. 051 decision 7 leaves credentials to an authentication
    // plugin — that decision has to be visible at the boundary, not inferred from a missing key.
    const result = createUserSchema.safeParse({ email: 'new@example.com', password: 'hunter2xy' });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('051 decision 7');
    // The rejected value must never appear in the error the caller gets back.
    expect(JSON.stringify(result.error?.issues)).not.toContain('hunter2xy');
  });
});
