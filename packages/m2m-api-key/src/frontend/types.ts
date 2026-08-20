import type { SortableLinkComponent, SortOrder } from '@appspine/frontend-shell' with {
  'resolution-mode': 'import',
};

export type ApiKeySortField = 'name' | 'lastUsedAt';

export type ApiKeysTableKey =
  | 'actingUser'
  | 'actingUserNone'
  | 'active'
  | 'inactive'
  | 'key'
  | 'lastUsed'
  | 'name'
  | 'never'
  | 'noApiKeys'
  | 'role'
  | 'scopes'
  | 'status';

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

export interface CreateApiKeyResult {
  error?: string;
  created?: CreateApiKeyResponse;
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

export interface ApiKeyScopeOption {
  value: string;
  label: string;
}

export const SCOPE_RESOURCES = ['users', 'api-keys'] as const;
export const SCOPE_ACTIONS = ['read', 'write'] as const;

export interface ApiKeysTableProps {
  apiKeys: ApiKeyRow[];
  serviceAccounts: ServiceAccountOption[];
  sortField: string | undefined;
  sortOrder: SortOrder | undefined;
  LinkComponent: SortableLinkComponent;
  buildSortHref: (field: ApiKeySortField, order: SortOrder) => string;
  t: (key: ApiKeysTableKey) => string;
  setApiKeyActiveAction: (id: string, isActive: boolean) => Promise<{ error?: string }>;
  deleteApiKeyAction: (id: string) => Promise<{ error?: string }>;
  updateApiKeyActingUserAction: (
    id: string,
    actingUserId: string | null,
  ) => Promise<{ error?: string }>;
}

export interface CreateApiKeyDialogProps {
  roles: ApiKeyRoleOption[];
  serviceAccounts: ServiceAccountOption[];
  scopeOptions?: ApiKeyScopeOption[];
  createApiKeyAction: (formData: FormData) => Promise<CreateApiKeyResult>;
}

export interface CreatedApiKeyRevealProps {
  created: CreateApiKeyResponse;
  onDone: () => void;
}

export interface ApiKeyRowActionsProps {
  apiKey: ApiKeyRow;
  serviceAccounts: ServiceAccountOption[];
  setApiKeyActiveAction: (id: string, isActive: boolean) => Promise<{ error?: string }>;
  deleteApiKeyAction: (id: string) => Promise<{ error?: string }>;
  updateApiKeyActingUserAction: (
    id: string,
    actingUserId: string | null,
  ) => Promise<{ error?: string }>;
}
