// `Permission` (the granular permission catalog, e.g. USERS_READ) is intentionally
// NOT defined here — it grows per app as CRUD modules are added (see dev_docs
// 002 "新增 CRUD 模組標準流程"), so it lives only in each app's own
// `prisma/schema.prisma`, not in this shared package.

export const PermissionPolicy = {
  DENY_ALL: 'DENY_ALL',
  READ_ALL: 'READ_ALL',
  ALLOW_ALL: 'ALLOW_ALL',
} as const;
export type PermissionPolicy = (typeof PermissionPolicy)[keyof typeof PermissionPolicy];

export const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  RESTORE: 'RESTORE',
  MOVE: 'MOVE',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
