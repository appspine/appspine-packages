import { describe, expect, it } from 'vitest';
import { APPSPINE_MCP_METADATA_NAMESPACE, parseMcpOperationMetadata } from './metadata';

const validMetadata = {
  namespace: APPSPINE_MCP_METADATA_NAMESPACE,
  operationId: '0123456789abcdef0123456789abcdef',
  runId: 'run-1',
  deploymentId: 'deployment-1',
  workflowId: 'workflow-1',
  executionId: 'execution-1',
  nodeName: 'Appspine MCP Tool',
  itemIndex: 0,
  sourceMessageId: 'message-1',
  sourceActorId: 'actor-1',
};

describe('parseMcpOperationMetadata', () => {
  it('returns null metadata when _meta is absent', () => {
    expect(parseMcpOperationMetadata(undefined)).toEqual({ ok: true, metadata: null });
  });

  it('parses appspine operation metadata', () => {
    expect(parseMcpOperationMetadata(validMetadata)).toEqual({
      ok: true,
      metadata: validMetadata,
    });
  });

  it('rejects metadata from a different namespace', () => {
    expect(parseMcpOperationMetadata({ ...validMetadata, namespace: 'other' })).toEqual({
      ok: false,
      reason: '_meta.namespace is invalid',
    });
  });

  it('rejects missing operation id', () => {
    const { operationId: _operationId, ...metadata } = validMetadata;

    expect(parseMcpOperationMetadata(metadata)).toEqual({
      ok: false,
      reason: '_meta.operationId is invalid',
    });
  });

  it('rejects malformed operation id', () => {
    expect(parseMcpOperationMetadata({ ...validMetadata, operationId: 'not-hex' })).toEqual({
      ok: false,
      reason: '_meta.operationId is invalid',
    });
  });

  it('rejects control characters in nodeName', () => {
    expect(parseMcpOperationMetadata({ ...validMetadata, nodeName: 'bad\nnode' })).toEqual({
      ok: false,
      reason: '_meta.nodeName is invalid',
    });
  });

  it('rejects out-of-range itemIndex', () => {
    expect(parseMcpOperationMetadata({ ...validMetadata, itemIndex: -1 })).toEqual({
      ok: false,
      reason: '_meta.itemIndex is invalid',
    });
  });
});
