/**
 * Stand-in for `@appspine/common` while testing the facade.
 *
 * The real package resolves `@prisma/client` through `createRequire(process.cwd())` at import time
 * (see `packages/common/src/prisma/prisma-client.ts`), which needs a *generated* client — something
 * that exists in a consuming App and deliberately does not exist in this workspace. Every module
 * the facade re-exports imports this package, so aliasing it here is what lets the facade's public
 * surface be asserted at all. Nothing under test reads any of these values.
 */

export class PrismaService {}

export const Prisma = {
  PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {},
};

export const PermissionPolicy = {
  DENY_ALL: 'DENY_ALL',
  READ_ALL: 'READ_ALL',
  ALLOW_ALL: 'ALLOW_ALL',
} as const;

export const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  RESTORE: 'RESTORE',
  MOVE: 'MOVE',
} as const;

export const paginate = () => ({ data: [], meta: { total: 0 } });
export const toPrismaOrderBy = () => undefined;
export const toPrismaPage = () => ({ skip: 0, take: 20 });
export const paginationQuerySchema = { parse: (value: unknown) => value };
export class ZodValidationPipe {}
export class LoggingModule {}
export class PrismaModule {}
export class AllExceptionsFilter {}
