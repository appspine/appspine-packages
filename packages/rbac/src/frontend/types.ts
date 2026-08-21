import type { SortableLinkComponent, SortOrder } from '@appspine/frontend-shell' with {
  'resolution-mode': 'import',
};

export type RoleSortField = 'displayName' | 'userCount' | 'apiKeyCount';

export type RolesTableKey =
  | 'apiKeys'
  | 'name'
  | 'noRoles'
  | 'permissions'
  | 'policy'
  | 'systemBadge'
  | 'systemRoleDeleteWarning'
  | 'users';

export interface EnumOption {
  value: string;
  label: string;
}

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

export interface RolesTableProps {
  roles: RoleRow[];
  policyOptions: readonly string[];
  permissionOptions: readonly string[];
  sortField: string | undefined;
  sortOrder: SortOrder | undefined;
  LinkComponent: SortableLinkComponent;
  buildSortHref: (field: RoleSortField, order: SortOrder) => string;
  t: (key: RolesTableKey) => string;
  renderEnumLabel: (kind: 'PermissionPolicy' | 'Permission', value: string) => string;
  updateRoleAction: (id: string, formData: FormData) => Promise<{ error?: string }>;
  deleteRoleAction: (id: string) => Promise<{ error?: string }>;
}

export interface CreateRoleDialogProps {
  policyOptions: EnumOption[];
  permissionOptions: EnumOption[];
  createRoleAction: (formData: FormData) => Promise<{ error?: string }>;
}

export interface RoleRowActionsProps {
  role: RoleRow;
  policyOptions: EnumOption[];
  permissionOptions: EnumOption[];
  updateRoleAction: (id: string, formData: FormData) => Promise<{ error?: string }>;
  deleteRoleAction: (id: string) => Promise<{ error?: string }>;
}
