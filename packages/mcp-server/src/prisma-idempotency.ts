import type {
  McpIdempotencyBeginInput,
  McpIdempotencyCompleteInput,
  McpIdempotencyFailInput,
  McpIdempotencyRecord,
  McpIdempotencyScope,
  McpIdempotencyStatus,
  McpIdempotencyStore,
  McpTransactionRunner,
} from './idempotency';

export interface PrismaMcpIdempotencyDelegate {
  findUnique(args: {
    where: { mcp_idempotency_scope_operation_unique: PrismaMcpIdempotencyUniqueInput };
  }): Promise<PrismaMcpIdempotencyRow | null>;
  create(args: { data: PrismaMcpIdempotencyCreateInput }): Promise<PrismaMcpIdempotencyRow>;
  updateMany(args: {
    where: PrismaMcpIdempotencyUpdateWhereInput;
    data: PrismaMcpIdempotencyUpdateInput;
  }): Promise<{ count: number }>;
}

export interface PrismaMcpIdempotencyClient {
  mcpIdempotencyRecord: PrismaMcpIdempotencyDelegate;
}

export interface PrismaTransactionClient extends PrismaMcpIdempotencyClient {
  $transaction<T>(work: (tx: PrismaMcpIdempotencyClient) => Promise<T>): Promise<T>;
}

interface PrismaMcpIdempotencyUniqueInput {
  apiKeyId: string;
  toolName: string;
  operationId: string;
}

interface PrismaMcpIdempotencyRow extends PrismaMcpIdempotencyUniqueInput {
  requestHash: string;
  status: McpIdempotencyStatus;
  leaseExpiresAt: Date;
  resultJson: unknown | null;
  errorJson: unknown | null;
}

interface PrismaMcpIdempotencyCreateInput extends PrismaMcpIdempotencyUniqueInput {
  requestHash: string;
  status: McpIdempotencyStatus;
  leaseExpiresAt: Date;
}

interface PrismaMcpIdempotencyUpdateWhereInput extends PrismaMcpIdempotencyUniqueInput {
  requestHash: string;
  status: McpIdempotencyStatus;
}

interface PrismaMcpIdempotencyUpdateInput {
  status?: McpIdempotencyStatus;
  leaseExpiresAt?: Date;
  resultJson?: unknown;
  errorJson?: unknown;
  completedAt?: Date;
}

export class PrismaMcpIdempotencyStore implements McpIdempotencyStore<PrismaMcpIdempotencyClient> {
  async find(
    scope: McpIdempotencyScope,
    operationId: string,
    tx: PrismaMcpIdempotencyClient,
  ): Promise<McpIdempotencyRecord | null> {
    const row = await tx.mcpIdempotencyRecord.findUnique({
      where: { mcp_idempotency_scope_operation_unique: { ...scope, operationId } },
    });
    return row ? toRecord(row) : null;
  }

  async insertProcessing(
    input: McpIdempotencyBeginInput,
    tx: PrismaMcpIdempotencyClient,
  ): Promise<boolean> {
    try {
      await tx.mcpIdempotencyRecord.create({
        data: {
          ...input.scope,
          operationId: input.operationId,
          requestHash: input.requestHash,
          status: 'processing',
          leaseExpiresAt: input.leaseExpiresAt,
        },
      });
      return true;
    } catch (error) {
      if (isUniqueConstraintError(error)) return false;
      throw error;
    }
  }

  async claimStaleProcessing(
    input: McpIdempotencyBeginInput,
    tx: PrismaMcpIdempotencyClient,
  ): Promise<boolean> {
    const result = await tx.mcpIdempotencyRecord.updateMany({
      where: processingWhere(input.scope, input.operationId, input.requestHash),
      data: { leaseExpiresAt: input.leaseExpiresAt },
    });
    return result.count === 1;
  }

  async complete(
    input: McpIdempotencyCompleteInput,
    tx: PrismaMcpIdempotencyClient,
  ): Promise<void> {
    const result = await tx.mcpIdempotencyRecord.updateMany({
      where: processingWhere(input.scope, input.operationId, input.requestHash),
      data: { status: 'succeeded', resultJson: input.result, completedAt: new Date() },
    });
    if (result.count !== 1) throw new Error('failed to complete MCP idempotency record');
  }

  async fail(input: McpIdempotencyFailInput, tx: PrismaMcpIdempotencyClient): Promise<void> {
    const result = await tx.mcpIdempotencyRecord.updateMany({
      where: processingWhere(input.scope, input.operationId, input.requestHash),
      data: { status: 'failed', errorJson: input.error, completedAt: new Date() },
    });
    if (result.count !== 1) throw new Error('failed to fail MCP idempotency record');
  }
}

export class PrismaMcpTransactionRunner
  implements McpTransactionRunner<PrismaMcpIdempotencyClient>
{
  constructor(private readonly prisma: PrismaTransactionClient) {}

  transaction<T>(work: (tx: PrismaMcpIdempotencyClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }
}

export function createPrismaMcpIdempotencyStore(): PrismaMcpIdempotencyStore {
  return new PrismaMcpIdempotencyStore();
}

export function createPrismaMcpTransactionRunner(
  prisma: PrismaTransactionClient,
): PrismaMcpTransactionRunner {
  return new PrismaMcpTransactionRunner(prisma);
}

function processingWhere(
  scope: McpIdempotencyScope,
  operationId: string,
  requestHash: string,
): PrismaMcpIdempotencyUpdateWhereInput {
  return { ...scope, operationId, requestHash, status: 'processing' };
}

function toRecord(row: PrismaMcpIdempotencyRow): McpIdempotencyRecord {
  return {
    apiKeyId: row.apiKeyId,
    toolName: row.toolName,
    operationId: row.operationId,
    requestHash: row.requestHash,
    status: row.status,
    leaseExpiresAt: row.leaseExpiresAt,
    ...(row.resultJson !== null ? { result: row.resultJson } : {}),
    ...(row.errorJson !== null ? { error: toErrorRecord(row.errorJson) } : {}),
  };
}

function toErrorRecord(value: unknown): { name: string; message: string } {
  if (
    value &&
    typeof value === 'object' &&
    'name' in value &&
    'message' in value &&
    typeof value.name === 'string' &&
    typeof value.message === 'string'
  ) {
    return { name: value.name, message: value.message };
  }
  return { name: 'Error', message: 'stored operation failed' };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}
