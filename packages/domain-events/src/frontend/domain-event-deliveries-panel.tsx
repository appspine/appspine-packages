'use client';

import {
  Badge,
  Button,
  FieldError,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useTranslations,
} from '@appspine/frontend-shell';
import { RotateCcw, ShieldOff } from 'lucide-react';
import { useState, useTransition } from 'react';
import type { DomainEventDeliveriesPanelProps } from './types.js';

export function DomainEventDeliveriesPanel({
  deliveries,
  retryDeliveryAction,
  ignoreDeliveryAction,
  compact = false,
}: DomainEventDeliveriesPanelProps) {
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
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.deliveries')}</TableHead>
            <TableHead>{t('columns.status')}</TableHead>
            <TableHead>{t('columns.attempts')}</TableHead>
            <TableHead>{t('columns.lastAttemptAt')}</TableHead>
            <TableHead>{t('columns.lastError')}</TableHead>
            <TableHead className="w-24" />
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
              <TableCell className="whitespace-nowrap text-sm">
                {delivery.lastAttemptAt ? new Date(delivery.lastAttemptAt).toLocaleString() : '-'}
              </TableCell>
              <TableCell className="max-w-md font-mono text-xs">
                {delivery.lastError ?? '-'}
              </TableCell>
              <TableCell>
                {delivery.status === 'DEAD_LETTER' && (
                  <div className="flex items-center gap-1">
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
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
