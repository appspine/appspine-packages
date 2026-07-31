import { Badge } from '../ui/badge.js';
import type { DomainEventEnumKind, DomainEventRow } from './types.js';

/**
 * Generalized from `apps/approve`'s bespoke domain event detail page (dev_docs 028 §3.4) — the
 * event-fact half of the page (operation/aggregate/changedFields/before/after/metadata). The
 * deliveries table is `DomainEventDeliveriesPanel` (a separate component so the list page's
 * compact per-row view and this page's full view share one implementation), composed alongside
 * this panel by the app's own page.
 */
export function DomainEventDetailPanel<TKey extends string = string>({
  event,
  t,
  renderEnumLabel,
}: {
  event: DomainEventRow;
  t: (key: TKey) => string;
  renderEnumLabel: (kind: DomainEventEnumKind, value: string) => string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-bold text-2xl tracking-tight">
          {t('detail.title' as TKey).replace('{seq}', event.seq)}
        </h1>
        <p className="text-muted-foreground text-sm">
          {event.aggregateType} / <span className="font-mono">{event.aggregateId}</span>
        </p>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <Info label={t('columns.event' as TKey)} value={event.eventType} />
        <Info
          label={t('columns.operation' as TKey)}
          value={renderEnumLabel('DomainEventOperation', event.operation)}
        />
        <Info
          label={t('columns.createdAt' as TKey)}
          value={new Date(event.createdAt).toLocaleString()}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-base">{t('columns.changedFields' as TKey)}</h2>
        <div className="flex flex-wrap gap-1">
          {event.changedFields.map((field) => (
            <Badge key={field} variant="secondary">
              {field}
            </Badge>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <JsonPanel title={t('detail.before' as TKey)} value={event.before} />
        <JsonPanel title={t('detail.after' as TKey)} value={event.after} />
        <JsonPanel title={t('detail.metadata' as TKey)} value={event.metadata} />
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-medium text-sm">{value}</div>
    </div>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="flex min-h-40 flex-col gap-2">
      <h2 className="font-semibold text-base">{title}</h2>
      <pre className="max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
        {JSON.stringify(value ?? null, null, 2)}
      </pre>
    </section>
  );
}
