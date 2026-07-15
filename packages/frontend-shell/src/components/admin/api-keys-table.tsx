import type * as React from 'react';
import { SortableColumnHeader, type SortOrder } from '../sortable-column-header.js';
import { Badge } from '../ui/badge.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.js';
import { ApiKeyRowActions } from './api-key-row-actions.js';
import type { ApiKeyRow, ServiceAccountOption } from './types.js';

type ApiKeySortField = 'name' | 'lastUsedAt';

export function ApiKeysTable({
  apiKeys,
  serviceAccounts,
  sortField,
  sortOrder,
  LinkComponent,
  buildSortHref,
  t,
  setApiKeyActiveAction,
  deleteApiKeyAction,
  updateApiKeyActingUserAction,
}: {
  apiKeys: ApiKeyRow[];
  serviceAccounts: ServiceAccountOption[];
  sortField: string | undefined;
  sortOrder: SortOrder | undefined;
  LinkComponent: React.ComponentType<{
    href: string;
    children: React.ReactNode;
    className?: string;
  }>;
  buildSortHref: (field: ApiKeySortField, order: SortOrder) => string;
  t: (key: string) => string;
  setApiKeyActiveAction: (id: string, isActive: boolean) => Promise<{ error?: string }>;
  deleteApiKeyAction: (id: string) => Promise<{ error?: string }>;
  updateApiKeyActingUserAction: (
    id: string,
    actingUserId: string | null,
  ) => Promise<{ error?: string }>;
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortableColumnHeader<ApiKeySortField>
                label={t('name')}
                field="name"
                currentSortField={sortField as ApiKeySortField}
                currentSortOrder={sortOrder}
                LinkComponent={LinkComponent}
                buildSortHref={(field, order) => buildSortHref(field, order)}
              />
            </TableHead>
            <TableHead>{t('key')}</TableHead>
            <TableHead>{t('role')}</TableHead>
            <TableHead>{t('actingUser')}</TableHead>
            <TableHead>{t('scopes')}</TableHead>
            <TableHead>{t('status')}</TableHead>
            <TableHead>
              <SortableColumnHeader<ApiKeySortField>
                label={t('lastUsed')}
                field="lastUsedAt"
                currentSortField={sortField as ApiKeySortField}
                currentSortOrder={sortOrder}
                LinkComponent={LinkComponent}
                buildSortHref={(field, order) => buildSortHref(field, order)}
              />
            </TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {apiKeys.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                {t('noApiKeys')}
              </TableCell>
            </TableRow>
          )}
          {apiKeys.map((apiKey) => (
            <TableRow key={apiKey.id}>
              <TableCell>{apiKey.name}</TableCell>
              <TableCell className="font-mono text-muted-foreground text-xs">
                {apiKey.prefix}
              </TableCell>
              <TableCell>{apiKey.role.displayName}</TableCell>
              <TableCell>
                {serviceAccounts.find((account) => account.id === apiKey.actingUserId)?.email ??
                  t('actingUserNone')}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {apiKey.scopes.map((scope) => (
                    <Badge key={scope} variant="secondary">
                      {scope}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={apiKey.isActive ? 'default' : 'outline'}>
                  {apiKey.isActive ? t('active') : t('inactive')}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleString() : t('never')}
              </TableCell>
              <TableCell>
                <ApiKeyRowActions
                  apiKey={apiKey}
                  serviceAccounts={serviceAccounts}
                  setApiKeyActiveAction={setApiKeyActiveAction}
                  deleteApiKeyAction={deleteApiKeyAction}
                  updateApiKeyActingUserAction={updateApiKeyActingUserAction}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
