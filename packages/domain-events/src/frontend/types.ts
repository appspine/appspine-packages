import type { SortableLinkComponent } from '@appspine/frontend-shell';

export type DomainEventEnumKind = 'DomainEventOperation' | 'DomainEventDeliveryStatus';

export interface DomainEventDeliveryRow {
  id: string;
  domainEventId: string;
  handlerKey: string;
  status: string;
  attempts: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DomainEventRow {
  id: string;
  seq: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  operation: string;
  changedFields: string[];
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: string;
  deliveries: DomainEventDeliveryRow[];
}

export interface DomainEventCatalogSubscriberStats {
  total: number;
  processed: number;
  deadLetter: number;
  lastStatus: string | null;
  lastAttemptAt: string | null;
}

export interface DomainEventCatalogSubscriber {
  key: string;
  eventTypes: string[];
  description: string;
  stats: DomainEventCatalogSubscriberStats;
}

export interface DomainEventDataDrivenDelivery {
  handlerKey: string;
  total: number;
  processed: number;
  deadLetter: number;
  lastStatus: string | null;
  lastAttemptAt: string | null;
}

export interface DomainEventUnresolvedDelivery {
  handlerKey: string;
  total: number;
  processed: number;
  deadLetter: number;
  lastStatus: string | null;
  lastAttemptAt: string | null;
}

export interface DomainEventCatalogView {
  statsWindowDays: number;
  hasHandlerKeyContributors: boolean;
  dataDrivenPrefixes: string[];
  subscribers: DomainEventCatalogSubscriber[];
  dataDrivenDeliveries: DomainEventDataDrivenDelivery[];
  unresolvedDeliveries: DomainEventUnresolvedDelivery[];
}

export type DomainEventsTableKey =
  | 'columns.aggregate'
  | 'columns.changedFields'
  | 'columns.createdAt'
  | 'columns.deliveries'
  | 'columns.event'
  | 'columns.seq'
  | 'empty';

export type DomainEventCatalogTableKey =
  | 'catalog.columns.deadLetter'
  | 'catalog.columns.description'
  | 'catalog.columns.eventTypes'
  | 'catalog.columns.handlerKey'
  | 'catalog.columns.key'
  | 'catalog.columns.lastAttemptAt'
  | 'catalog.columns.lastStatus'
  | 'catalog.columns.processed'
  | 'catalog.columns.total'
  | 'catalog.dataDrivenSubtitle'
  | 'catalog.dataDrivenTitle'
  | 'catalog.emptyDataDriven'
  | 'catalog.emptySubscribers'
  | 'catalog.emptyUnresolved'
  | 'catalog.neverFired'
  | 'catalog.subtitle'
  | 'catalog.title'
  | 'catalog.unresolvedSubtitle'
  | 'catalog.unresolvedTitle';

export type DomainEventDetailPanelKey =
  | 'columns.changedFields'
  | 'columns.createdAt'
  | 'columns.event'
  | 'columns.operation'
  | 'detail.after'
  | 'detail.before'
  | 'detail.metadata'
  | 'detail.title';

export interface DomainEventsTableProps {
  events: DomainEventRow[];
  t: (key: DomainEventsTableKey) => string;
  renderEnumLabel: (kind: DomainEventEnumKind, value: string) => string;
  LinkComponent: SortableLinkComponent;
  buildDetailHref: (id: string) => string;
  retryDeliveryAction: (id: string) => Promise<{ error?: string }>;
  ignoreDeliveryAction: (id: string) => Promise<{ error?: string }>;
}

export interface DomainEventCatalogTableProps {
  catalog: DomainEventCatalogView;
  t: (key: DomainEventCatalogTableKey) => string;
  renderEnumLabel: (kind: DomainEventEnumKind, value: string) => string;
}

export interface DomainEventDeliveriesPanelProps {
  deliveries: DomainEventDeliveryRow[];
  retryDeliveryAction: (id: string) => Promise<{ error?: string }>;
  ignoreDeliveryAction: (id: string) => Promise<{ error?: string }>;
  compact?: boolean;
}

export interface DomainEventDetailPanelProps {
  event: DomainEventRow;
  t: (key: DomainEventDetailPanelKey) => string;
  renderEnumLabel: (kind: DomainEventEnumKind, value: string) => string;
}
