import type { SortableLinkComponent } from '../sortable-column-header.js';
import { Badge } from '../ui/badge.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.js';
import { DomainEventDeliveriesPanel } from './domain-event-deliveries-panel.js';
import type { DomainEventEnumKind, DomainEventRow } from './types.js';

/**
 * Generalized from `apps/approve`'s bespoke domain events list page (dev_docs 028 §3.4). Always
 * ordered by `seq desc` server-side (matches `DomainEventsAdminService.findAll()`) — no sortable
 * columns needed here, unlike UsersTable/RolesTable.
 */
export function DomainEventsTable<TKey extends string = string>({
  events,
  t,
  renderEnumLabel,
  LinkComponent,
  buildDetailHref,
  retryDeliveryAction,
  ignoreDeliveryAction,
}: {
  events: DomainEventRow[];
  t: (key: TKey) => string;
  renderEnumLabel: (kind: DomainEventEnumKind, value: string) => string;
  LinkComponent: SortableLinkComponent;
  buildDetailHref: (id: string) => string;
  retryDeliveryAction: (id: string) => Promise<{ error?: string }>;
  ignoreDeliveryAction: (id: string) => Promise<{ error?: string }>;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.seq' as TKey)}</TableHead>
            <TableHead>{t('columns.event' as TKey)}</TableHead>
            <TableHead>{t('columns.aggregate' as TKey)}</TableHead>
            <TableHead>{t('columns.changedFields' as TKey)}</TableHead>
            <TableHead>{t('columns.deliveries' as TKey)}</TableHead>
            <TableHead>{t('columns.createdAt' as TKey)}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {t('empty' as TKey)}
              </TableCell>
            </TableRow>
          )}
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell className="font-mono text-xs">
                <LinkComponent
                  className="underline-offset-4 hover:underline"
                  href={buildDetailHref(event.id)}
                >
                  {event.seq}
                </LinkComponent>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{event.eventType}</span>
                  <span className="text-muted-foreground text-xs">
                    {renderEnumLabel('DomainEventOperation', event.operation)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-sm">
                <div>{event.aggregateType}</div>
                <div className="font-mono text-muted-foreground text-xs">{event.aggregateId}</div>
              </TableCell>
              <TableCell>
                <div className="flex max-w-72 flex-wrap gap-1">
                  {event.changedFields.map((field) => (
                    <Badge key={field} variant="secondary">
                      {field}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <DomainEventDeliveriesPanel
                  compact
                  deliveries={event.deliveries}
                  retryDeliveryAction={retryDeliveryAction}
                  ignoreDeliveryAction={ignoreDeliveryAction}
                />
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">
                {new Date(event.createdAt).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
