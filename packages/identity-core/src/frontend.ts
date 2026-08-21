/**
 * Phase 3 frontend facet exports for `@appspine/identity-core/frontend` (PL3-03).
 */
export interface IdentityCoreFrontendContribution {
  readonly kind: 'appspine.identity-core.frontend';
}

// Named re-exports, not `export * from`: see frontend/index.ts for why -- a `for...in`-based
// re-export silently drops anything backed by an RSC client-reference proxy.
export { CreateUserDialog, UserRowActions, UsersTable } from './frontend/index.js';
export type {
  CreateUserDialogProps,
  UserRoleAssignment,
  UserRoleOption,
  UserRow,
  UserRowActionsProps,
  UserSortField,
  UsersTableKey,
  UsersTableProps,
} from './frontend/index.js';
