import { describe, expect, it, vi } from 'vitest';

vi.mock('@appspine/common', () => ({
  AuditAction: {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
  },
}));

import { AuditAction } from '@appspine/common';
import { recordAuditSafely } from './record-audit';

describe('recordAuditSafely', () => {
  it('records an audit log entry without awaiting the write', async () => {
    const record = vi.fn().mockResolvedValue({ id: 'log-1' });

    recordAuditSafely({
      auditLogService: { record } as never,
      entityType: 'Role',
      entityId: 'role-1',
      action: AuditAction.UPDATE,
      actor: { sub: 'user-1', email: 'user@example.com' },
      appName: 'project',
    });

    expect(record).toHaveBeenCalledWith({
      entityType: 'Role',
      entityId: 'role-1',
      action: AuditAction.UPDATE,
      actorId: 'user-1',
      actorEmail: 'user@example.com',
      appName: 'project',
      actingApiKeyId: null,
    });
  });

  it('falls back to api-key actor email and logs async failures as warnings', async () => {
    const record = vi.fn().mockRejectedValue(new Error('audit unavailable'));
    const logger = { warn: vi.fn() };

    recordAuditSafely({
      auditLogService: { record } as never,
      entityType: 'ApiKey',
      entityId: 'key-1',
      action: AuditAction.DELETE,
      actor: { sub: 'caller-key-1', isApiKey: true },
      appName: 'wiki',
      logger,
    });
    await Promise.resolve();

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorEmail: 'api-key:caller-key-1',
        actingApiKeyId: 'caller-key-1',
      }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to record audit log: Error: audit unavailable',
    );
  });
});
