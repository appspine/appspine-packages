import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@appspine/frontend-shell';
import { DomainEventDeliveriesPanel } from './domain-event-deliveries-panel.js';
import type { DomainEventsTableProps } from './types.js';

export function DomainEventsTable({
  events,
  t,
  renderEnumLabel,
  LinkComponent,
  buildDetailHref,
  retryDeliveryAction,
  ignoreDeliveryAction,
}: DomainEventsTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.seq')}</TableHead>
            <TableHead>{t('columns.event')}</TableHead>
            <TableHead>{t('columns.aggregate')}</TableHead>
            <TableHead>{t('columns.changedFields')}</TableHead>
            <TableHead>{t('columns.deliveries')}</TableHead>
            <TableHead>{t('columns.createdAt')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {t('empty')}
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
