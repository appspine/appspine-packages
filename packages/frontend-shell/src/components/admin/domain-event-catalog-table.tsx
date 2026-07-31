import { Badge } from '../ui/badge.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.js';
import type { DomainEventCatalogView, DomainEventEnumKind } from './types.js';

/**
 * New in dev_docs 028 (no approve precedent to generalize from — the catalog endpoint didn't
 * exist before T-11210). This is the "human oversight" screen: `registry.describe()`'s
 * code-registered subscribers LEFT JOINed with delivery stats (subscribers with zero deliveries
 * still show, per plan §3.3), plus a separate data-driven-deliveries section for handler keys
 * with no `describe()` entry (e.g. `webhook.post:<id>`) — those must not be invisible here just
 * because they're operations-time routing rather than a code-registered subscription.
 */
export function DomainEventCatalogTable<TKey extends string = string>({
  catalog,
  t,
  renderEnumLabel,
}: {
  catalog: DomainEventCatalogView;
  t: (key: TKey) => string;
  renderEnumLabel: (kind: DomainEventEnumKind, value: string) => string;
}) {
  const unresolvedDeliveries = catalog.unresolvedDeliveries ?? [];
  const showDataDrivenSection =
    catalog.dataDrivenPrefixes.length > 0 ||
    catalog.hasHandlerKeyContributors ||
    catalog.dataDrivenDeliveries.length > 0;
  const showUnresolvedSection = unresolvedDeliveries.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-bold text-2xl tracking-tight">{t('catalog.title' as TKey)}</h1>
        <p className="text-muted-foreground text-sm">
          {t('catalog.subtitle' as TKey).replace('{days}', String(catalog.statsWindowDays))}
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('catalog.columns.key' as TKey)}</TableHead>
                <TableHead>{t('catalog.columns.eventTypes' as TKey)}</TableHead>
                <TableHead>{t('catalog.columns.description' as TKey)}</TableHead>
                <TableHead>{t('catalog.columns.total' as TKey)}</TableHead>
                <TableHead>{t('catalog.columns.processed' as TKey)}</TableHead>
                <TableHead>{t('catalog.columns.deadLetter' as TKey)}</TableHead>
                <TableHead>{t('catalog.columns.lastStatus' as TKey)}</TableHead>
                <TableHead>{t('catalog.columns.lastAttemptAt' as TKey)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {catalog.subscribers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    {t('catalog.emptySubscribers' as TKey)}
                  </TableCell>
                </TableRow>
              )}
              {catalog.subscribers.map((subscriber) => (
                <TableRow key={subscriber.key}>
                  <TableCell className="font-mono text-xs">{subscriber.key}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {subscriber.eventTypes.map((eventType) => (
                        <Badge key={eventType} variant="secondary">
                          {eventType}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-md text-sm">{subscriber.description}</TableCell>
                  <TableCell>{subscriber.stats.total}</TableCell>
                  <TableCell>{subscriber.stats.processed}</TableCell>
                  <TableCell>
                    {subscriber.stats.deadLetter > 0 ? (
                      <Badge variant="destructive">{subscriber.stats.deadLetter}</Badge>
                    ) : (
                      subscriber.stats.deadLetter
                    )}
                  </TableCell>
                  <TableCell>
                    {subscriber.stats.lastStatus ? (
                      <Badge
                        variant={
                          subscriber.stats.lastStatus === 'DEAD_LETTER' ? 'destructive' : 'outline'
                        }
                      >
                        {renderEnumLabel('DomainEventDeliveryStatus', subscriber.stats.lastStatus)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {t('catalog.neverFired' as TKey)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {subscriber.stats.lastAttemptAt
                      ? new Date(subscriber.stats.lastAttemptAt).toLocaleString()
                      : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {showDataDrivenSection && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-base">{t('catalog.dataDrivenTitle' as TKey)}</h2>
          <p className="text-muted-foreground text-sm">{t('catalog.dataDrivenSubtitle' as TKey)}</p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('catalog.columns.handlerKey' as TKey)}</TableHead>
                  <TableHead>{t('catalog.columns.total' as TKey)}</TableHead>
                  <TableHead>{t('catalog.columns.processed' as TKey)}</TableHead>
                  <TableHead>{t('catalog.columns.deadLetter' as TKey)}</TableHead>
                  <TableHead>{t('catalog.columns.lastStatus' as TKey)}</TableHead>
                  <TableHead>{t('catalog.columns.lastAttemptAt' as TKey)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalog.dataDrivenDeliveries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {t('catalog.emptyDataDriven' as TKey)}
                    </TableCell>
                  </TableRow>
                )}
                {catalog.dataDrivenDeliveries.map((entry) => (
                  <TableRow key={entry.handlerKey}>
                    <TableCell className="font-mono text-xs">{entry.handlerKey}</TableCell>
                    <TableCell>{entry.total}</TableCell>
                    <TableCell>{entry.processed}</TableCell>
                    <TableCell>
                      {entry.deadLetter > 0 ? (
                        <Badge variant="destructive">{entry.deadLetter}</Badge>
                      ) : (
                        entry.deadLetter
                      )}
                    </TableCell>
                    <TableCell>
                      {entry.lastStatus ? (
                        <Badge
                          variant={entry.lastStatus === 'DEAD_LETTER' ? 'destructive' : 'outline'}
                        >
                          {renderEnumLabel('DomainEventDeliveryStatus', entry.lastStatus)}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {entry.lastAttemptAt ? new Date(entry.lastAttemptAt).toLocaleString() : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {showUnresolvedSection && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-base">{t('catalog.unresolvedTitle' as TKey)}</h2>
          <p className="text-muted-foreground text-sm">{t('catalog.unresolvedSubtitle' as TKey)}</p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('catalog.columns.handlerKey' as TKey)}</TableHead>
                  <TableHead>{t('catalog.columns.total' as TKey)}</TableHead>
                  <TableHead>{t('catalog.columns.processed' as TKey)}</TableHead>
                  <TableHead>{t('catalog.columns.deadLetter' as TKey)}</TableHead>
                  <TableHead>{t('catalog.columns.lastStatus' as TKey)}</TableHead>
                  <TableHead>{t('catalog.columns.lastAttemptAt' as TKey)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unresolvedDeliveries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {t('catalog.emptyUnresolved' as TKey)}
                    </TableCell>
                  </TableRow>
                )}
                {unresolvedDeliveries.map((entry) => (
                  <TableRow key={entry.handlerKey}>
                    <TableCell className="font-mono text-xs">{entry.handlerKey}</TableCell>
                    <TableCell>{entry.total}</TableCell>
                    <TableCell>{entry.processed}</TableCell>
                    <TableCell>
                      {entry.deadLetter > 0 ? (
                        <Badge variant="destructive">{entry.deadLetter}</Badge>
                      ) : (
                        entry.deadLetter
                      )}
                    </TableCell>
                    <TableCell>
                      {entry.lastStatus ? (
                        <Badge
                          variant={entry.lastStatus === 'DEAD_LETTER' ? 'destructive' : 'outline'}
                        >
                          {renderEnumLabel('DomainEventDeliveryStatus', entry.lastStatus)}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {entry.lastAttemptAt ? new Date(entry.lastAttemptAt).toLocaleString() : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
