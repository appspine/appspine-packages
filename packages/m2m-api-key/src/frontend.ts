/**
 * Phase 3 frontend facet exports for `@appspine/m2m-api-key/frontend` (PL3-06).
 */
export interface M2mApiKeyFrontendContribution {
  readonly kind: 'appspine.m2m-api-key.frontend';
}

// Named re-exports, not `export * from`: see frontend/index.ts for why -- a `for...in`-based
// re-export silently drops anything backed by an RSC client-reference proxy.
export {
  ApiKeyRowActions,
  ApiKeysTable,
  CreateApiKeyDialog,
  CreatedApiKeyReveal,
  SCOPE_ACTIONS,
  SCOPE_RESOURCES,
} from './frontend/index.js';
export type {
  ApiKeyRoleOption,
  ApiKeyRoleRef,
  ApiKeyRow,
  ApiKeyRowActionsProps,
  ApiKeyScopeOption,
  ApiKeySortField,
  ApiKeysTableKey,
  ApiKeysTableProps,
  CreateApiKeyDialogProps,
  CreateApiKeyResponse,
  CreateApiKeyResult,
  CreatedApiKeyRevealProps,
  ServiceAccountOption,
} from './frontend/index.js';
