import { createHash } from 'node:crypto';

export type McpIdempotencyStatus = 'processing' | 'succeeded' | 'failed';

export interface McpIdempotencyRecord {
  apiKeyId: string;
  toolName: string;
  operationId: string;
  requestHash: string;
  status: McpIdempotencyStatus;
  leaseExpiresAt: Date;
  result?: unknown;
  error?: { name: string; message: string };
}

export interface McpIdempotencyScope {
  apiKeyId: string;
  toolName: string;
}

export interface McpIdempotencyBeginInput {
  scope: McpIdempotencyScope;
  operationId: string;
  requestHash: string;
  leaseExpiresAt: Date;
}

export interface McpIdempotencyCompleteInput {
  scope: McpIdempotencyScope;
  operationId: string;
  requestHash: string;
  result: unknown;
}

export interface McpIdempotencyFailInput {
  scope: McpIdempotencyScope;
  operationId: string;
  requestHash: string;
  error: { name: string; message: string };
}

export interface McpIdempotencyStore<Tx = unknown> {
  find(
    scope: McpIdempotencyScope,
    operationId: string,
    tx: Tx,
  ): Promise<McpIdempotencyRecord | null>;
  insertProcessing(input: McpIdempotencyBeginInput, tx: Tx): Promise<boolean>;
  claimStaleProcessing(input: McpIdempotencyBeginInput, tx: Tx): Promise<boolean>;
  complete(input: McpIdempotencyCompleteInput, tx: Tx): Promise<void>;
  fail(input: McpIdempotencyFailInput, tx: Tx): Promise<void>;
}

export interface McpTransactionRunner<Tx = unknown> {
  transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
}

export interface ExecuteIdempotentWriteInput<Tx, TResult> {
  operationId: string | null | undefined;
  toolName: string;
  apiKeyId: string;
  request: unknown;
  store: McpIdempotencyStore<Tx>;
  transactionRunner: McpTransactionRunner<Tx>;
  leaseMs?: number;
  now?: () => Date;
  handler: (tx: Tx, context: McpIdempotencyExecutionContext) => Promise<TResult>;
}

export interface McpIdempotencyExecutionContext {
  scope: McpIdempotencyScope;
  operationId: string;
  requestHash: string;
}

export class McpIdempotencyError extends Error {
  constructor(
    readonly code:
      | 'MCP_IDEMPOTENCY_MISSING_OPERATION_ID'
      | 'MCP_IDEMPOTENCY_CONFLICT'
      | 'MCP_IDEMPOTENCY_IN_PROGRESS'
      | 'MCP_IDEMPOTENCY_STORED_FAILURE',
    message: string,
  ) {
    super(message);
    this.name = 'McpIdempotencyError';
  }
}

type AcquireOutcome =
  | { kind: 'acquired' }
  | { kind: 'replay'; result: unknown }
  | { kind: 'stored-failure'; error: { name: string; message: string } };

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

export function createMcpRequestHash(input: { operationName: string; request: unknown }): string {
  return createHash('sha256').update(stableStringify(input), 'utf8').digest('hex');
}

export async function executeIdempotentWrite<Tx, TResult>({
  operationId,
  toolName,
  apiKeyId,
  request,
  store,
  transactionRunner,
  leaseMs = DEFAULT_LEASE_MS,
  now = () => new Date(),
  handler,
}: ExecuteIdempotentWriteInput<Tx, TResult>): Promise<TResult> {
  const normalizedOperationId = operationId?.trim();
  if (!normalizedOperationId) {
    throw new McpIdempotencyError(
      'MCP_IDEMPOTENCY_MISSING_OPERATION_ID',
      'write MCP tools require an operation id',
    );
  }

  const scope = normalizeScope({ apiKeyId, toolName });
  const requestHash = createMcpRequestHash({ operationName: scope.toolName, request });
  const context = { scope, operationId: normalizedOperationId, requestHash };
  const acquire = await transactionRunner.transaction((tx) =>
    acquireOperation(store, tx, context, addMs(now(), leaseMs), now()),
  );

  if (acquire.kind === 'replay') return acquire.result as TResult;
  if (acquire.kind === 'stored-failure') {
    throw new McpIdempotencyError(
      'MCP_IDEMPOTENCY_STORED_FAILURE',
      `operation ${normalizedOperationId} previously failed: ${acquire.error.message}`,
    );
  }

  try {
    return await transactionRunner.transaction(async (tx) => {
      const result = await handler(tx, context);
      await store.complete({ ...context, result }, tx);
      return result;
    });
  } catch (error) {
    const normalized = normalizeError(error);
    await transactionRunner.transaction((tx) => store.fail({ ...context, error: normalized }, tx));
    throw error;
  }
}

async function acquireOperation<Tx>(
  store: McpIdempotencyStore<Tx>,
  tx: Tx,
  context: McpIdempotencyExecutionContext,
  leaseExpiresAt: Date,
  now: Date,
): Promise<AcquireOutcome> {
  const existing = await store.find(context.scope, context.operationId, tx);
  if (!existing) {
    const inserted = await store.insertProcessing({ ...context, leaseExpiresAt }, tx);
    if (inserted) return { kind: 'acquired' };
    return acquireOperation(store, tx, context, leaseExpiresAt, now);
  }

  if (existing.requestHash !== context.requestHash) {
    throw new McpIdempotencyError(
      'MCP_IDEMPOTENCY_CONFLICT',
      `operation ${context.operationId} was already used with a different request hash`,
    );
  }

  if (existing.status === 'succeeded') {
    return { kind: 'replay', result: existing.result };
  }

  if (existing.status === 'failed') {
    return {
      kind: 'stored-failure',
      error: existing.error ?? { name: 'Error', message: 'stored operation failed' },
    };
  }

  if (existing.leaseExpiresAt > now) {
    throw new McpIdempotencyError(
      'MCP_IDEMPOTENCY_IN_PROGRESS',
      `operation ${context.operationId} is already processing`,
    );
  }

  const claimed = await store.claimStaleProcessing({ ...context, leaseExpiresAt }, tx);
  if (claimed) return { kind: 'acquired' };
  return acquireOperation(store, tx, context, leaseExpiresAt, now);
}

function normalizeScope(scope: McpIdempotencyScope): McpIdempotencyScope {
  const apiKeyId = scope.apiKeyId.trim();
  const toolName = scope.toolName.trim();
  if (!apiKeyId) {
    throw new McpIdempotencyError(
      'MCP_IDEMPOTENCY_MISSING_OPERATION_ID',
      'write MCP tools require an API key id for idempotency isolation',
    );
  }
  if (!toolName) {
    throw new McpIdempotencyError(
      'MCP_IDEMPOTENCY_MISSING_OPERATION_ID',
      'write MCP tools require a tool name for idempotency isolation',
    );
  }
  return { apiKeyId, toolName };
}

function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

function normalizeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: 'Error', message: String(error) };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForHash(value));
}

function normalizeForHash(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'bigint') throw new Error('BigInt is not supported in MCP request hashing');
  if (Array.isArray(value)) return value.map((item) => normalizeForHash(item));
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) output[key] = normalizeForHash(child);
    }
    return output;
  }
  return null;
}
