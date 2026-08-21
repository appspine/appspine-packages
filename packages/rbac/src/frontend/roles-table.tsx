import {
  Badge,
  SortableColumnHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@appspine/frontend-shell';
import { RoleRowActions } from './role-row-actions.js';
import type { RoleSortField, RolesTableProps } from './types.js';

export function RolesTable({
  roles,
  policyOptions,
  permissionOptions,
  sortField,
  sortOrder,
  LinkComponent,
  buildSortHref,
  t,
  renderEnumLabel,
  updateRoleAction,
  deleteRoleAction,
}: RolesTableProps) {
  // RolesTable itself has no 'use client' directive, so it renders as a Server
  // Component — calling `renderEnumLabel` (a plain function passed down from
  // another Server Component) here is fine, no serialization boundary is
  // crossed. It must NOT be forwarded as-is into RoleRowActions below, which
  // IS a Client Component — React RSC rejects passing plain functions across
  // that boundary. Resolve to plain {value,label} data here instead.
  const policyOptionsWithLabels = policyOptions.map((value) => ({
    value,
    label: renderEnumLabel('PermissionPolicy', value),
  }));
  const permissionOptionsWithLabels = permissionOptions.map((value) => ({
    value,
    label: renderEnumLabel('Permission', value),
  }));

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortableColumnHeader<RoleSortField>
                label={t('name')}
                field="displayName"
                currentSortField={sortField}
                currentSortOrder={sortOrder}
                LinkComponent={LinkComponent}
                buildSortHref={buildSortHref}
              />
            </TableHead>
            <TableHead>{t('policy')}</TableHead>
            <TableHead>{t('permissions')}</TableHead>
            <TableHead>
              <SortableColumnHeader<RoleSortField>
                label={t('users')}
                field="userCount"
                currentSortField={sortField}
                currentSortOrder={sortOrder}
                LinkComponent={LinkComponent}
                buildSortHref={buildSortHref}
              />
            </TableHead>
            <TableHead>
              <SortableColumnHeader<RoleSortField>
                label={t('apiKeys')}
                field="apiKeyCount"
                currentSortField={sortField}
                currentSortOrder={sortOrder}
                LinkComponent={LinkComponent}
                buildSortHref={buildSortHref}
              />
            </TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {t('noRoles')}
              </TableCell>
            </TableRow>
          )}
          {roles.map((role) => {
            const isAdmin = role.name === 'ADMIN';
            return (
              <TableRow key={role.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{role.displayName}</span>
                    {role.isSystem && <Badge variant="secondary">{t('systemBadge')}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{role.name}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {renderEnumLabel('PermissionPolicy', role.permissionPolicy)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {isAdmin ? (
                    <span className="text-xs text-muted-foreground">
                      {renderEnumLabel('PermissionPolicy', 'ALLOW_ALL')}
                    </span>
                  ) : role.permissions.length === 0 ? (
                    <span className="text-xs text-muted-foreground">-</span>
                  ) : (
                    <div className="flex max-w-md flex-wrap gap-1">
                      {role.permissions.map((p) => (
                        <Badge key={p} variant="outline" className="text-xs font-mono">
                          {renderEnumLabel('Permission', p)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell>{role.userCount}</TableCell>
                <TableCell>{role.apiKeyCount}</TableCell>
                <TableCell>
                  <RoleRowActions
                    role={role}
                    policyOptions={policyOptionsWithLabels}
                    permissionOptions={permissionOptionsWithLabels}
                    updateRoleAction={updateRoleAction}
                    deleteRoleAction={deleteRoleAction}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
