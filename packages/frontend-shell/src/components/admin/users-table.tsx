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

export function UsersTable<TKey extends string = string>({
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
  t: (key: TKey) => string;
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
                label={t('email' as TKey)}
                field="email"
                currentSortField={sortField}
                currentSortOrder={sortOrder}
                LinkComponent={LinkComponent}
                buildSortHref={buildSortHref}
              />
            </TableHead>
            <TableHead>
              <SortableColumnHeader<UserSortField>
                label={t('name' as TKey)}
                field="name"
                currentSortField={sortField}
                currentSortOrder={sortOrder}
                LinkComponent={LinkComponent}
                buildSortHref={buildSortHref}
              />
            </TableHead>
            <TableHead>{t('roles' as TKey)}</TableHead>
            <TableHead>{t('status' as TKey)}</TableHead>
            <TableHead>{t('serviceAccount' as TKey)}</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {t('noUsers' as TKey)}
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
                  {user.isActive ? t('active' as TKey) : t('inactive' as TKey)}
                </Badge>
              </TableCell>
              <TableCell>
                {user.isServiceAccount && (
                  <Badge variant="secondary">{t('serviceAccount' as TKey)}</Badge>
                )}
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
