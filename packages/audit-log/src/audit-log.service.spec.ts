import { describe, expect, it, vi } from 'vitest';

// @appspine/common's PrismaService resolves @prisma/client from the consuming app's cwd at
// import time (see prisma-client.ts) — this package has no generated client of its own (it's
// a shared fragment, not a full schema), so importing the real module would fail under test.
// Mock it the same way mcp.controller.spec.ts mocks @appspine/m2m-api-key for the same reason.
// vi.mock calls are hoisted above imports by vitest, so this runs before the import below.
vi.mock('@appspine/common', () => ({
  AuditAction: {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    RESTORE: 'RESTORE',
    MOVE: 'MOVE',
  },
}));

import { AuditLogService, extractWorkflowId, type RecordAuditLogDto } from './audit-log.service';

function baseDto(overrides: Partial<RecordAuditLogDto> = {}): RecordAuditLogDto {
  return {
    entityType: 'Page',
    entityId: 'page-1',
    action: 'CREATE' as RecordAuditLogDto['action'],
    actorId: 'user-1',
    actorEmail: 'user@example.com',
    appName: 'wiki',
    ...overrides,
  };
}

describe('extractWorkflowId', () => {
  it('returns the header value when present', () => {
    expect(extractWorkflowId({ 'x-appspine-workflow-id': 'wf-123' })).toBe('wf-123');
  });

  it('returns null when the header is absent', () => {
    expect(extractWorkflowId({})).toBeNull();
  });

  it('returns null for a non-string or empty header value', () => {
    expect(extractWorkflowId({ 'x-appspine-workflow-id': '' })).toBeNull();
    expect(extractWorkflowId({ 'x-appspine-workflow-id': ['a', 'b'] })).toBeNull();
  });
});

describe('AuditLogService.record', () => {
  function createServiceWithSpy() {
    const create = vi.fn().mockResolvedValue({ id: 'log-1' });
    const prisma = { auditLog: { create } } as unknown as ConstructorParameters<
      typeof AuditLogService
    >[0];
    return { service: new AuditLogService(prisma), create };
  }

  it('omits workflowId from the write entirely when not passed (unmigrated-app safe default)', async () => {
    const { service, create } = createServiceWithSpy();

    await service.record(baseDto());

    const data = create.mock.calls[0]?.[0]?.data;
    expect(data).not.toHaveProperty('workflowId');
  });

  it('writes workflowId when the caller passes a string', async () => {
    const { service, create } = createServiceWithSpy();

    await service.record(baseDto({ workflowId: 'wf-123' }));

    expect(create.mock.calls[0]?.[0]?.data.workflowId).toBe('wf-123');
  });

  it('writes workflowId: null when the caller explicitly passes null (not just omits it)', async () => {
    const { service, create } = createServiceWithSpy();

    await service.record(baseDto({ workflowId: null }));

    const data = create.mock.calls[0]?.[0]?.data;
    expect(data).toHaveProperty('workflowId', null);
  });
});
