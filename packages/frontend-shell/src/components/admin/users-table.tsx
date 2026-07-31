import {
  SortableColumnHeader,
  type SortableLinkComponent,
  type SortOrder,
} from '../sortable-column-header.js';
import { Badge } from '../ui/badge.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.js';
import type { UserRoleOption, UserRow } from './types.js';
import { UserRowActions } from './user-row-actions.js';

type UserSortField = 'email' | 'name';

type UsersTableKey =
  | 'active'
  | 'email'
  | 'inactive'
  | 'name'
  | 'noUsers'
  | 'roles'
  | 'serviceAccount'
  | 'status';

export function UsersTable({
  users,
  roles,
  currentUserId,
  sortField,
  sortOrder,
  LinkComponent,
  buildSortHref,
  t,
  setUserActiveAction,
  setUserServiceAccountAction,
  updateUserRolesAction,
  deleteUserAction,
}: {
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
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortableColumnHeader<UserSortField>
                label={t('email')}
                field="email"
                currentSortField={sortField}
                currentSortOrder={sortOrder}
                LinkComponent={LinkComponent}
                buildSortHref={buildSortHref}
              />
            </TableHead>
            <TableHead>
              <SortableColumnHeader<UserSortField>
                label={t('name')}
                field="name"
                currentSortField={sortField}
                currentSortOrder={sortOrder}
                LinkComponent={LinkComponent}
                buildSortHref={buildSortHref}
              />
            </TableHead>
            <TableHead>{t('roles')}</TableHead>
            <TableHead>{t('status')}</TableHead>
            <TableHead>{t('serviceAccount')}</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {t('noUsers')}
              </TableCell>
            </TableRow>
          )}
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.email}</TableCell>
              <TableCell>{user.name ?? '-'}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role) => (
                    <Badge key={role.id} variant="secondary">
                      {role.displayName}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={user.isActive ? 'default' : 'outline'}>
                  {user.isActive ? t('active') : t('inactive')}
                </Badge>
              </TableCell>
              <TableCell>
                {user.isServiceAccount && <Badge variant="secondary">{t('serviceAccount')}</Badge>}
              </TableCell>
              <TableCell>
                <UserRowActions
                  user={user}
                  roles={roles}
                  isSelf={user.id === currentUserId}
                  setUserActiveAction={setUserActiveAction}
                  setUserServiceAccountAction={setUserServiceAccountAction}
                  updateUserRolesAction={updateUserRolesAction}
                  deleteUserAction={deleteUserAction}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
