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
import { ApiKeyRowActions } from './api-key-row-actions.js';
import type { ApiKeySortField, ApiKeysTableProps } from './types.js';

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
}: ApiKeysTableProps) {
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
                label={t('name')}
                field="name"
                currentSortField={sortField}
                currentSortOrder={sortOrder}
                LinkComponent={LinkComponent}
                buildSortHref={buildSortHref}
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
                {t('noApiKeys')}
              </TableCell>
            </TableRow>
          )}
          {apiKeys.map((apiKey) => (
            <TableRow key={apiKey.id}>
              <TableCell>{apiKey.name}</TableCell>
              <TableCell>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                  {apiKey.prefix}…
                </code>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{apiKey.role.displayName}</Badge>
              </TableCell>
              <TableCell>
                {apiKey.actingUserId ? (
                  <span className="text-sm">
                    {serviceAccountEmailById.get(apiKey.actingUserId) ?? apiKey.actingUserId}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">{t('actingUserNone')}</span>
                )}
              </TableCell>
              <TableCell>
                {apiKey.scopes.length === 0 ? (
                  <span className="text-xs text-muted-foreground">-</span>
                ) : (
                  <div className="flex max-w-xs flex-wrap gap-1">
                    {apiKey.scopes.map((s) => (
                      <Badge key={s} variant="outline" className="text-xs font-mono">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={apiKey.isActive ? 'default' : 'outline'}>
                  {apiKey.isActive ? t('active') : t('inactive')}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleDateString() : t('never')}
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
