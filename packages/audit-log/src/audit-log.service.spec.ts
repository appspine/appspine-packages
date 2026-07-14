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

import {
  AuditLogService,
  AuditTraceValidationError,
  extractWorkflowId,
  normalizeAuditTrace,
  type RecordAuditLogDto,
} from './audit-log.service';

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

  it('writes bounded distributed trace fields when trace metadata is passed', async () => {
    const { service, create } = createServiceWithSpy();

    await service.record(
      baseDto({
        trace: {
          runId: 'run-1',
          deploymentId: 'deployment-1',
          workflowId: 'workflow-1',
          executionId: 'execution-1',
          operationId: '0123456789abcdef0123456789abcdef',
          sourceMessageId: 'message-1',
          sourceActorId: 'actor-1',
          sourceOrigin: 'USER_UI',
        },
      }),
    );

    expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
      runId: 'run-1',
      deploymentId: 'deployment-1',
      workflowId: 'workflow-1',
      executionId: 'execution-1',
      operationId: '0123456789abcdef0123456789abcdef',
      sourceMessageId: 'message-1',
      sourceActorId: 'actor-1',
      sourceOrigin: 'USER_UI',
    });
  });

  it('keeps verified principal fields separate from caller trace correlation', async () => {
    const { service, create } = createServiceWithSpy();

    await service.record(
      baseDto({
        actorId: 'verified-service-account',
        actingApiKeyId: 'verified-key',
        trace: {
          sourceActorId: 'caller-claimed-human',
          sourceOrigin: 'CHAT_BOT',
        },
      }),
    );

    expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
      actorId: 'verified-service-account',
      actingApiKeyId: 'verified-key',
      sourceActorId: 'caller-claimed-human',
      sourceOrigin: 'CHAT_BOT',
    });
  });

  it('writes trace nulls when the migrated caller explicitly opts into trace columns', async () => {
    const { service, create } = createServiceWithSpy();

    await service.record(baseDto({ trace: {} }));

    expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
      workflowId: null,
      runId: null,
      deploymentId: null,
      executionId: null,
      operationId: null,
      sourceMessageId: null,
      sourceActorId: null,
      sourceOrigin: null,
    });
  });

  it('does not serialize prompt, capability, or attachment URL shaped extra trace keys', async () => {
    const { service, create } = createServiceWithSpy();

    await service.record(
      baseDto({
        trace: {
          runId: 'run-1',
          prompt: 'do not store',
          capability: 'secret-capability',
          attachmentUrl: 'https://example.invalid/file',
        } as RecordAuditLogDto['trace'] & Record<string, unknown>,
      }),
    );

    const data = create.mock.calls[0]?.[0]?.data;
    expect(data).not.toHaveProperty('prompt');
    expect(data).not.toHaveProperty('capability');
    expect(data).not.toHaveProperty('attachmentUrl');
  });

  it('rejects malformed trace metadata before writing', async () => {
    const { service, create } = createServiceWithSpy();

    await expect(
      service.record(baseDto({ trace: { operationId: 'not-lowercase-hex' } })),
    ).rejects.toBeInstanceOf(AuditTraceValidationError);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('normalizeAuditTrace', () => {
  it('trims IDs and converts empty optional fields to null', () => {
    expect(normalizeAuditTrace({ runId: ' run-1 ', deploymentId: ' ' })).toMatchObject({
      runId: 'run-1',
      deploymentId: null,
    });
  });

  it('rejects control characters and overlong IDs', () => {
    expect(() => normalizeAuditTrace({ runId: 'run\n1' })).toThrow(AuditTraceValidationError);
    expect(() => normalizeAuditTrace({ runId: 'a'.repeat(129) })).toThrow(
      AuditTraceValidationError,
    );
  });

  it('rejects unsupported source origins', () => {
    const unsupportedOrigin = 'USER_SUPPLIED' as NonNullable<
      RecordAuditLogDto['trace']
    >['sourceOrigin'];

    expect(() => normalizeAuditTrace({ sourceOrigin: unsupportedOrigin })).toThrow(
      AuditTraceValidationError,
    );
  });
});
