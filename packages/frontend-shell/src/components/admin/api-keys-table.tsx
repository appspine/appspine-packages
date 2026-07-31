import {
  SortableColumnHeader,
  type SortableLinkComponent,
  type SortOrder,
} from '../sortable-column-header.js';
import { Badge } from '../ui/badge.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.js';
import { ApiKeyRowActions } from './api-key-row-actions.js';
import type { ApiKeyRow, ServiceAccountOption } from './types.js';

type ApiKeySortField = 'name' | 'lastUsedAt';

export function ApiKeysTable<TKey extends string = string>({
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
  LinkComponent: SortableLinkComponent;
  buildSortHref: (field: ApiKeySortField, order: SortOrder) => string;
  t: (key: TKey) => string;
  setApiKeyActiveAction: (id: string, isActive: boolean) => Promise<{ error?: string }>;
  deleteApiKeyAction: (id: string) => Promise<{ error?: string }>;
  updateApiKeyActingUserAction: (
    id: string,
    actingUserId: string | null,
  ) => Promise<{ error?: string }>;
}) {
  const serviceAccountEmailById = new Map(
    serviceAccounts.map((account) => [account.id, account.email]),
  );

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortableColumnHeader<ApiKeySortField>
                label={t('name' as TKey)}
                field="name"
                currentSortField={sortField}
                currentSortOrder={sortOrder}
                LinkComponent={LinkComponent}
                buildSortHref={buildSortHref}
              />
            </TableHead>
            <TableHead>{t('key' as TKey)}</TableHead>
            <TableHead>{t('role' as TKey)}</TableHead>
            <TableHead>{t('actingUser' as TKey)}</TableHead>
            <TableHead>{t('scopes' as TKey)}</TableHead>
            <TableHead>{t('status' as TKey)}</TableHead>
            <TableHead>
              <SortableColumnHeader<ApiKeySortField>
                label={t('lastUsed' as TKey)}
                field="lastUsedAt"
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
          {apiKeys.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                {t('noApiKeys' as TKey)}
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
                {(apiKey.actingUserId
                  ? serviceAccountEmailById.get(apiKey.actingUserId)
                  : undefined) ?? t('actingUserNone' as TKey)}
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
                  {apiKey.isActive ? t('active' as TKey) : t('inactive' as TKey)}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {apiKey.lastUsedAt
                  ? new Date(apiKey.lastUsedAt).toLocaleString()
                  : t('never' as TKey)}
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
