import type { SortableLinkComponent, SortOrder } from '@appspine/frontend-shell' with {
  'resolution-mode': 'import',
};

export type UserSortField = 'email' | 'name';

export type UsersTableKey =
  | 'active'
  | 'email'
  | 'inactive'
  | 'name'
  | 'noUsers'
  | 'roles'
  | 'serviceAccount'
  | 'status';

export interface UserRoleAssignment {
  id: string;
  name: string;
  displayName: string;
}

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  isServiceAccount: boolean;
  roles: UserRoleAssignment[];
}

export interface UserRoleOption {
  id: string;
  name: string;
  displayName: string;
}

export interface UsersTableProps {
  users: UserRow[];
  roles: UserRoleOption[];
  currentUserId: string | undefined;
  sortField: string | undefined;
  sortOrder: SortOrder | undefined;
  LinkComponent: SortableLinkComponent;
  buildSortHref: (field: UserSortField, order: SortOrder) => string;
  t: (key: UsersTableKey) => string;
  setUserActiveAction: (id: string, isActive: boolean) => Promise<{ error?: string }>;
  setUserServiceAccountAction: (
    id: string,
    isServiceAccount: boolean,
  ) => Promise<{ error?: string }>;
  updateUserRolesAction: (id: string, formData: FormData) => Promise<{ error?: string }>;
  deleteUserAction: (id: string) => Promise<{ error?: string }>;
}

export interface CreateUserDialogProps {
  roles: UserRoleOption[];
  createUserAction: (formData: FormData) => Promise<{ error?: string }>;
}

export interface UserRowActionsProps {
  user: UserRow;
  roles: UserRoleOption[];
  isSelf: boolean;
  setUserActiveAction: (id: string, isActive: boolean) => Promise<{ error?: string }>;
  setUserServiceAccountAction: (
    id: string,
    isServiceAccount: boolean,
  ) => Promise<{ error?: string }>;
  updateUserRolesAction: (id: string, formData: FormData) => Promise<{ error?: string }>;
  deleteUserAction: (id: string) => Promise<{ error?: string }>;
}
