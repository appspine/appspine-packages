import type * as React from 'react';
import { SortableColumnHeader, type SortOrder } from '../sortable-column-header.js';
import { Badge } from '../ui/badge.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.js';
import { RoleRowActions } from './role-row-actions.js';
import type { RoleRow } from './types.js';

type RoleSortField = 'displayName' | 'userCount' | 'apiKeyCount';

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
}: {
  roles: RoleRow[];
  policyOptions: readonly string[];
  permissionOptions: readonly string[];
  sortField: string | undefined;
  sortOrder: SortOrder | undefined;
  LinkComponent: React.ComponentType<any>;
  buildSortHref: (field: RoleSortField, order: SortOrder) => string;
  t: (key: string) => string;
  renderEnumLabel: (kind: 'PermissionPolicy' | 'Permission', value: string) => string;
  updateRoleAction: (id: string, formData: FormData) => Promise<{ error?: string }>;
  deleteRoleAction: (id: string) => Promise<{ error?: string }>;
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortableColumnHeader<RoleSortField>
                label={t('name')}
                field="displayName"
                currentSortField={sortField as RoleSortField}
                currentSortOrder={sortOrder}
                LinkComponent={LinkComponent}
                buildSortHref={(field, order) => buildSortHref(field, order)}
              />
            </TableHead>
            <TableHead>{t('policy')}</TableHead>
            <TableHead>{t('permissions')}</TableHead>
            <TableHead>
              <SortableColumnHeader<RoleSortField>
                label={t('users')}
                field="userCount"
                currentSortField={sortField as RoleSortField}
                currentSortOrder={sortOrder}
                LinkComponent={LinkComponent}
                buildSortHref={(field, order) => buildSortHref(field, order)}
              />
            </TableHead>
            <TableHead>
              <SortableColumnHeader<RoleSortField>
                label={t('apiKeys')}
                field="apiKeyCount"
                currentSortField={sortField as RoleSortField}
                currentSortOrder={sortOrder}
                LinkComponent={LinkComponent}
                buildSortHref={(field, order) => buildSortHref(field, order)}
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
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {role.displayName}
                  {role.isSystem && (
                    <Badge variant="outline" title={t('systemRoleDeleteWarning')}>
                      {t('systemBadge')}
                    </Badge>
                  )}
                </div>
                <div className="text-muted-foreground text-xs">{role.name}</div>
              </TableCell>
              <TableCell>{renderEnumLabel('PermissionPolicy', role.permissionPolicy)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {role.permissions.map((permission) => (
                    <Badge key={permission} variant="secondary">
                      {renderEnumLabel('Permission', permission)}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>{role.userCount}</TableCell>
              <TableCell>{role.apiKeyCount}</TableCell>
              <TableCell>
                <RoleRowActions
                  role={role}
                  policyOptions={policyOptions}
                  permissionOptions={permissionOptions}
                  updateRoleAction={updateRoleAction}
                  deleteRoleAction={deleteRoleAction}
                  renderEnumLabel={renderEnumLabel}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
