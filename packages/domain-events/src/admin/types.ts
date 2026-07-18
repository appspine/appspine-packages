import type { DomainEventDeliveryStatus, DomainEventSubscriberDescriptor } from '../types';

export type DomainEventDeliveryStats = {
  total: number;
  processed: number;
  deadLetter: number;
  lastStatus: DomainEventDeliveryStatus | null;
  lastError: string | null;
  lastAttemptAt: Date | null;
};

export type DomainEventCatalogSubscriberEntry = DomainEventSubscriberDescriptor & {
  stats: DomainEventDeliveryStats;
};

/** A handler key with deliveries but no `describe()` entry — data-driven routing (e.g. `webhook.post:<id>`). */
export type DomainEventCatalogDataDrivenEntry = DomainEventDeliveryStats & {
  handlerKey: string;
};

export type DomainEventCatalogResponse = {
  subscribers: DomainEventCatalogSubscriberEntry[];
  dataDrivenPrefixes: string[];
  hasHandlerKeyContributors: boolean;
  dataDrivenDeliveries: DomainEventCatalogDataDrivenEntry[];
  statsWindowDays: number;
};
