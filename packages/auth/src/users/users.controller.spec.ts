import * as bcrypt from 'bcrypt';
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
}));

// vi.mock calls above are hoisted above this static import by vitest's transform, so
// UsersController's own imports of @appspine/common/@appspine/audit-log resolve to the
// mocks rather than triggering a real @prisma/client resolution.
import { UsersController } from './users.controller';

function createController(createMock: ReturnType<typeof vi.fn>) {
  const usersService = { create: createMock };
  const auditLogService = { record: vi.fn().mockResolvedValue(undefined) };
  const controller = new UsersController(usersService as never, auditLogService as never);
  return { controller, usersService };
}

const actor = { sub: 'admin-1', email: 'admin@example.com' };

describe('UsersController.create', () => {
  it('hashes the password with bcrypt before passing it to UsersService.create', async () => {
    const createMock = vi.fn().mockResolvedValue({ id: 'user-1' });
    const { controller } = createController(createMock);

    await controller.create({ email: 'new@example.com', password: 'super-secret' }, actor);

    expect(createMock).toHaveBeenCalledTimes(1);
    const passedData = createMock.mock.calls[0][0] as { password?: string };
    expect(passedData.password).toBeDefined();
    expect(passedData.password).not.toBe('super-secret');
    expect(await bcrypt.compare('super-secret', passedData.password as string)).toBe(true);
  });

  it('creates a user with no password field when none is given (the OIDC-only default)', async () => {
    const createMock = vi.fn().mockResolvedValue({ id: 'user-1' });
    const { controller } = createController(createMock);

    await controller.create({ email: 'new@example.com' }, actor);

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', password: undefined }),
    );
  });
});
