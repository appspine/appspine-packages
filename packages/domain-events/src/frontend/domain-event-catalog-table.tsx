import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@appspine/frontend-shell';
import type { DomainEventCatalogTableProps } from './types.js';

export function DomainEventCatalogTable({
  catalog,
  t,
  renderEnumLabel,
}: DomainEventCatalogTableProps) {
  const unresolvedDeliveries = catalog.unresolvedDeliveries ?? [];
  const showDataDrivenSection =
    catalog.dataDrivenPrefixes.length > 0 ||
    catalog.hasHandlerKeyContributors ||
    catalog.dataDrivenDeliveries.length > 0;
  const showUnresolvedSection = unresolvedDeliveries.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-bold text-2xl tracking-tight">{t('catalog.title')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('catalog.subtitle').replace('{days}', String(catalog.statsWindowDays))}
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('catalog.columns.key')}</TableHead>
                <TableHead>{t('catalog.columns.eventTypes')}</TableHead>
                <TableHead>{t('catalog.columns.description')}</TableHead>
                <TableHead>{t('catalog.columns.total')}</TableHead>
                <TableHead>{t('catalog.columns.processed')}</TableHead>
                <TableHead>{t('catalog.columns.deadLetter')}</TableHead>
                <TableHead>{t('catalog.columns.lastStatus')}</TableHead>
                <TableHead>{t('catalog.columns.lastAttemptAt')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {catalog.subscribers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    {t('catalog.emptySubscribers')}
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
                      <Badge variant="outline">0</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {subscriber.stats.lastStatus ? (
                      <Badge
                        variant={
                          subscriber.stats.lastStatus === 'DEAD_LETTER'
                            ? 'destructive'
                            : 'outline'
                        }
                      >
                        {renderEnumLabel(
                          'DomainEventDeliveryStatus',
                          subscriber.stats.lastStatus,
                        )}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {t('catalog.neverFired')}
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
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold text-lg">{t('catalog.dataDrivenTitle')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('catalog.dataDrivenSubtitle')}
            </p>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('catalog.columns.handlerKey')}</TableHead>
                  <TableHead>{t('catalog.columns.total')}</TableHead>
                  <TableHead>{t('catalog.columns.processed')}</TableHead>
                  <TableHead>{t('catalog.columns.deadLetter')}</TableHead>
                  <TableHead>{t('catalog.columns.lastStatus')}</TableHead>
                  <TableHead>{t('catalog.columns.lastAttemptAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalog.dataDrivenDeliveries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {t('catalog.emptyDataDriven')}
                    </TableCell>
                  </TableRow>
                )}
                {catalog.dataDrivenDeliveries.map((delivery) => (
                  <TableRow key={delivery.handlerKey}>
                    <TableCell className="font-mono text-xs">
                      {delivery.handlerKey}
                    </TableCell>
                    <TableCell>{delivery.total}</TableCell>
                    <TableCell>{delivery.processed}</TableCell>
                    <TableCell>
                      {delivery.deadLetter > 0 ? (
                        <Badge variant="destructive">{delivery.deadLetter}</Badge>
                      ) : (
                        <Badge variant="outline">0</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {delivery.lastStatus ? (
                        <Badge
                          variant={
                            delivery.lastStatus === 'DEAD_LETTER'
                              ? 'destructive'
                              : 'outline'
                          }
                        >
                          {renderEnumLabel(
                            'DomainEventDeliveryStatus',
                            delivery.lastStatus,
                          )}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {t('catalog.neverFired')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {delivery.lastAttemptAt
                        ? new Date(delivery.lastAttemptAt).toLocaleString()
                        : '-'}
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
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold text-lg">{t('catalog.unresolvedTitle')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('catalog.unresolvedSubtitle')}
            </p>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('catalog.columns.handlerKey')}</TableHead>
                  <TableHead>{t('catalog.columns.total')}</TableHead>
                  <TableHead>{t('catalog.columns.processed')}</TableHead>
                  <TableHead>{t('catalog.columns.deadLetter')}</TableHead>
                  <TableHead>{t('catalog.columns.lastStatus')}</TableHead>
                  <TableHead>{t('catalog.columns.lastAttemptAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unresolvedDeliveries.map((delivery) => (
                  <TableRow key={delivery.handlerKey}>
                    <TableCell className="font-mono text-xs">
                      {delivery.handlerKey}
                    </TableCell>
                    <TableCell>{delivery.total}</TableCell>
                    <TableCell>{delivery.processed}</TableCell>
                    <TableCell>
                      {delivery.deadLetter > 0 ? (
                        <Badge variant="destructive">{delivery.deadLetter}</Badge>
                      ) : (
                        <Badge variant="outline">0</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {delivery.lastStatus ? (
                        <Badge
                          variant={
                            delivery.lastStatus === 'DEAD_LETTER'
                              ? 'destructive'
                              : 'outline'
                          }
                        >
                          {renderEnumLabel(
                            'DomainEventDeliveryStatus',
                            delivery.lastStatus,
                          )}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {t('catalog.neverFired')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {delivery.lastAttemptAt
                        ? new Date(delivery.lastAttemptAt).toLocaleString()
                        : '-'}
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
