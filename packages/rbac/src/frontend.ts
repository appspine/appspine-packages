/**
 * Phase 3 frontend facet exports for `@appspine/rbac/frontend` (PL3-05).
 */
export interface RbacFrontendContribution {
  readonly kind: 'appspine.rbac.frontend';
}

// Named re-exports, not `export * from`: see frontend/index.ts for why -- a `for...in`-based
// re-export silently drops anything backed by an RSC client-reference proxy.
export {
  CreateRoleDialog,
  RoleRowActions,
  RolesTable,
} from './frontend/index.js';
export type {
  CreateRoleDialogProps,
  EnumOption,
  RoleRow,
  RoleRowActionsProps,
  RoleSortField,
  RolesTableKey,
  RolesTableProps,
} from './frontend/index.js';
