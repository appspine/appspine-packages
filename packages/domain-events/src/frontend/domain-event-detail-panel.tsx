import { Badge } from '@appspine/frontend-shell';
import type { DomainEventDetailPanelProps } from './types.js';

export function DomainEventDetailPanel({ event, t, renderEnumLabel }: DomainEventDetailPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-bold text-2xl tracking-tight">
          {t('detail.title').replace('{seq}', event.seq)}
        </h1>
        <p className="text-muted-foreground text-sm">
          {event.aggregateType} / <span className="font-mono">{event.aggregateId}</span>
        </p>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <Info label={t('columns.event')} value={event.eventType} />
        <Info
          label={t('columns.operation')}
          value={renderEnumLabel('DomainEventOperation', event.operation)}
        />
        <Info label={t('columns.createdAt')} value={new Date(event.createdAt).toLocaleString()} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-base">{t('columns.changedFields')}</h2>
        <div className="flex flex-wrap gap-1">
          {event.changedFields.map((field) => (
            <Badge key={field} variant="secondary">
              {field}
            </Badge>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <JsonPanel title={t('detail.before')} value={event.before} />
        <JsonPanel title={t('detail.after')} value={event.after} />
        <JsonPanel title={t('detail.metadata')} value={event.metadata} />
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
