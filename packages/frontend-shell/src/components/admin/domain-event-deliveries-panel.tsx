'use client';

import { RotateCcw, ShieldOff } from 'lucide-react';
import { useState, useTransition } from 'react';

import { useTranslations } from '../../i18n/index.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { FieldError } from '../ui/field.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.js';
import type { DomainEventDeliveryRow } from './types.js';

/**
 * Shared retry/ignore delivery UI (dev_docs 028 §3.4), generalized from `apps/approve`'s
 * bespoke domain events pages. Two layouts share one component instead of duplicating the
 * retry/ignore interaction:
 * - `compact` (the default list page's inline per-row delivery summary): a stacked list of
 *   small badge + handler key + attempts + retry/ignore buttons.
 * - full (the detail page): a full delivery table with one row per column.
 *
 * Retry/ignore go through plain async action props invoked via `useTransition`, not a
 * `<form action>` binding — this matches the existing `RoleRowActions`/`ApiKeyRowActions`
 * client-component convention in this same directory (pending state + inline error display),
 * rather than approve's original raw server-action-bound-to-form pattern.
 *
 * Calls `useTranslations()` itself instead of taking `t`/`renderEnumLabel` as props — this is
 * a Client Component, and React Server Components reject plain functions (as opposed to
 * "use server" Server Actions) passed down from a Server Component parent. `RoleRowActions`
 * in this same directory hits the identical constraint and resolves it the same way.
 *
 * @deprecated Moved to `@appspine/domain-events/frontend` in Phase 3 (PL3-07).
 */
export function DomainEventDeliveriesPanel({
  deliveries,
  retryDeliveryAction,
  ignoreDeliveryAction,
  compact = false,
}: {
  deliveries: DomainEventDeliveryRow[];
  retryDeliveryAction: (id: string) => Promise<{ error?: string }>;
  ignoreDeliveryAction: (id: string) => Promise<{ error?: string }>;
  compact?: boolean;
}) {
  const t = useTranslations('domainEvents');
  const tEnums = useTranslations('enums');
  const renderStatus = (value: string) => tEnums(`DomainEventDeliveryStatus.${value}`);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRetry(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await retryDeliveryAction(id);
      if (result.error) setError(result.error);
    });
  }

  function handleIgnore(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await ignoreDeliveryAction(id);
      if (result.error) setError(result.error);
    });
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        {error && <FieldError>{error}</FieldError>}
        {deliveries.map((delivery) => (
          <div key={delivery.id} className="flex flex-wrap items-center gap-2">
            <Badge variant={delivery.status === 'DEAD_LETTER' ? 'destructive' : 'outline'}>
              {renderStatus(delivery.status)}
            </Badge>
            <span className="font-mono text-muted-foreground text-xs">{delivery.handlerKey}</span>
            <span className="text-muted-foreground text-xs">
              {t('attempts').replace('{count}', String(delivery.attempts))}
            </span>
            {delivery.status === 'DEAD_LETTER' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1"
                  disabled={isPending}
                  onClick={() => handleRetry(delivery.id)}
                >
                  <RotateCcw className="size-3" />
                  {t('actions.retry')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1"
                  disabled={isPending}
                  onClick={() => handleIgnore(delivery.id)}
                >
                  <ShieldOff className="size-3" />
                  {t('actions.ignore')}
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <FieldError>{error}</FieldError>}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.handler')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead>{t('columns.attempts')}</TableHead>
              <TableHead>{t('columns.nextAttemptAt')}</TableHead>
              <TableHead>{t('columns.lastError')}</TableHead>
              <TableHead>{t('columns.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((delivery) => (
              <TableRow key={delivery.id}>
                <TableCell className="font-mono text-xs">{delivery.handlerKey}</TableCell>
                <TableCell>
                  <Badge variant={delivery.status === 'DEAD_LETTER' ? 'destructive' : 'outline'}>
                    {renderStatus(delivery.status)}
                  </Badge>
                </TableCell>
                <TableCell>{delivery.attempts}</TableCell>
                <TableCell>
                  {delivery.nextAttemptAt ? new Date(delivery.nextAttemptAt).toLocaleString() : '-'}
                </TableCell>
                <TableCell className="max-w-md whitespace-pre-wrap text-xs">
                  {delivery.lastError ?? '-'}
                </TableCell>
                <TableCell>
                  {delivery.status === 'DEAD_LETTER' ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={isPending}
                        onClick={() => handleRetry(delivery.id)}
                      >
                        <RotateCcw className="size-3" />
                        {t('actions.retry')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1"
                        disabled={isPending}
                        onClick={() => handleIgnore(delivery.id)}
                      >
                        <ShieldOff className="size-3" />
                        {t('actions.ignore')}
                      </Button>
                    </div>
                  ) : (
                    '-'
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
