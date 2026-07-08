// Mirrors @appspine/auth's UsersService (packages/auth/src/users/users.service.ts)
// response shape. Defined locally — the frontend doesn't depend on backend packages.
export interface UserRoleRef {
  id: string;
  name: string;
  displayName: string;
  permissionPolicy: string;
}

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  isServiceAccount: boolean;
  createdAt: string;
  roles: UserRoleRef[];
}

// Mirrors @appspine/rbac's RolesService.mapRole() output.
export interface UserRoleOption {
  id: string;
  name: string;
  displayName: string;
  isSystem: boolean;
}

// A resolved enum value ready for display. Producing the label requires
// server-side i18n (`getTranslations`/`enumLabel`, which stay app-owned per
// dev_docs/021 §2.3) — passing a `value` + already-resolved `label` pair
// keeps this plain, serializable data instead of a function prop, which is
// illegal to pass from a Server Component into a Client Component.
export interface EnumOption {
  value: string;
  label: string;
}

// Mirrors @appspine/rbac's RolesService.mapRole() output
// (packages/rbac/src/roles/roles.service.ts). Defined locally because the frontend
// doesn't depend on backend packages.
export interface RoleRow {
  id: string;
  name: string;
  displayName: string;
  isSystem: boolean;
  permissionPolicy: string;
  permissions: string[];
  userCount: number;
  apiKeyCount: number;
}

// Mirrors @appspine/m2m-api-key's ApiKeysService.ApiKeyRecord shape
// (packages/m2m-api-key/src/api-keys.service.ts), with Date fields as ISO
// strings since they cross the wire as JSON. Defined locally — the frontend
// doesn't depend on backend packages.
export interface ApiKeyRoleRef {
  id: string;
  name: string;
  displayName: string;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  roleId: string;
  actingUserId: string | null;
  role: ApiKeyRoleRef;
  scopes: string[];
  rateLimit: number | null;
  isActive: boolean;
  expiresAt: string | null;
  createdBy: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// The one-time creation response — `key` is only ever present here, never on
// ApiKeyRow (list/detail responses only return the non-secret `prefix`).
export interface CreateApiKeyResponse {
  id: string;
  key: string;
  prefix: string;
  name: string;
  roleId: string;
  role: ApiKeyRoleRef;
  scopes: string[];
  createdAt: string;
}

export interface ApiKeyRoleOption {
  id: string;
  name: string;
  displayName: string;
}

export interface ServiceAccountOption {
  id: string;
  email: string;
  name: string | null;
}

// No scope catalog endpoint exists yet (the M2M scope format is
// resource:action, a different shape than the app-specific Permission enum —
// dev_docs/003 defers a real catalog to a future metadata-schema extension).
// Mirrors the resources implied by the current Permission enum in
// backend/prisma/schema/base.prisma. Keep in sync manually.
export const SCOPE_RESOURCES = ['users', 'api-keys'] as const;
export const SCOPE_ACTIONS = ['read', 'write'] as const;
