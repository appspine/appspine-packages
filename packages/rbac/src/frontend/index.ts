// Named re-exports, not `export * from`: TypeScript's CJS `export *` compiles to a `for...in`
// enumeration over the re-exported module (see `__exportStar`'s helper in the compiled output).
// Next.js's RSC client-reference proxy (what a 'use client' module becomes when required from a
// Server Component) only implements property-access (`get`), not enumeration -- so `for...in`
// silently copies zero properties from it, and anything re-exported that way from this barrel
// resolves to `undefined` in a Server Component. A named export compiles to direct property
// access on the proxy instead, which works.
export { CreateRoleDialog } from './create-role-dialog.js';
export { RoleRowActions } from './role-row-actions.js';
export { RolesTable } from './roles-table.js';
export type {
  CreateRoleDialogProps,
  EnumOption,
  RoleRow,
  RoleRowActionsProps,
  RoleSortField,
  RolesTableKey,
  RolesTableProps,
} from './types.js';
