export const APPSPINE_MCP_METADATA_NAMESPACE = 'appspine';

export interface McpOperationMetadata {
  namespace: typeof APPSPINE_MCP_METADATA_NAMESPACE;
  operationId: string;
  runId: string;
  deploymentId: string;
  workflowId: string;
  executionId: string;
  nodeName: string;
  itemIndex: number;
  sourceMessageId?: string;
  sourceActorId?: string;
}

export type McpOperationMetadataParseResult =
  | { ok: true; metadata: McpOperationMetadata | null }
  | { ok: false; reason: string };

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const OPERATION_ID_PATTERN = /^[a-f0-9]{32}$/;
const MAX_NODE_NAME_LENGTH = 128;
const MAX_ITEM_INDEX = 1_000_000;

export function parseMcpOperationMetadata(value: unknown): McpOperationMetadataParseResult {
  if (value === undefined || value === null) return { ok: true, metadata: null };
  if (!isRecord(value)) return { ok: false, reason: '_meta must be an object' };

  if (value.namespace !== APPSPINE_MCP_METADATA_NAMESPACE) {
    return { ok: false, reason: '_meta.namespace is invalid' };
  }

  const operationId = parseString(value.operationId, 'operationId', OPERATION_ID_PATTERN);
  if (!operationId.ok) return operationId;
  const runId = parseString(value.runId, 'runId', ID_PATTERN);
  if (!runId.ok) return runId;
  const deploymentId = parseString(value.deploymentId, 'deploymentId', ID_PATTERN);
  if (!deploymentId.ok) return deploymentId;
  const workflowId = parseString(value.workflowId, 'workflowId', ID_PATTERN);
  if (!workflowId.ok) return workflowId;
  const executionId = parseString(value.executionId, 'executionId', ID_PATTERN);
  if (!executionId.ok) return executionId;
  const nodeName = parseNodeName(value.nodeName);
  if (!nodeName.ok) return nodeName;
  const itemIndex = parseItemIndex(value.itemIndex);
  if (!itemIndex.ok) return itemIndex;

  const sourceMessageId = parseOptionalString(value.sourceMessageId, 'sourceMessageId', ID_PATTERN);
  if (!sourceMessageId.ok) return sourceMessageId;
  const sourceActorId = parseOptionalString(value.sourceActorId, 'sourceActorId', ID_PATTERN);
  if (!sourceActorId.ok) return sourceActorId;

  return {
    ok: true,
    metadata: {
      namespace: APPSPINE_MCP_METADATA_NAMESPACE,
      operationId: operationId.value,
      runId: runId.value,
      deploymentId: deploymentId.value,
      workflowId: workflowId.value,
      executionId: executionId.value,
      nodeName: nodeName.value,
      itemIndex: itemIndex.value,
      ...(sourceMessageId.value ? { sourceMessageId: sourceMessageId.value } : {}),
      ...(sourceActorId.value ? { sourceActorId: sourceActorId.value } : {}),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseString(
  value: unknown,
  field: string,
  pattern: RegExp,
): { ok: true; value: string } | { ok: false; reason: string } {
  if (typeof value !== 'string' || !pattern.test(value)) {
    return { ok: false, reason: `_meta.${field} is invalid` };
  }
  return { ok: true, value };
}

function parseOptionalString(
  value: unknown,
  field: string,
  pattern: RegExp,
): { ok: true; value?: string } | { ok: false; reason: string } {
  if (value === undefined) return { ok: true };
  return parseString(value, field, pattern);
}

function parseNodeName(
  value: unknown,
): { ok: true; value: string } | { ok: false; reason: string } {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_NODE_NAME_LENGTH ||
    hasControlCharacter(value)
  ) {
    return { ok: false, reason: '_meta.nodeName is invalid' };
  }
  return { ok: true, value };
}

function parseItemIndex(
  value: unknown,
): { ok: true; value: number } | { ok: false; reason: string } {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_ITEM_INDEX
  ) {
    return { ok: false, reason: '_meta.itemIndex is invalid' };
  }
  return { ok: true, value };
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    if (character.charCodeAt(0) < 32) return true;
  }
  return false;
}
