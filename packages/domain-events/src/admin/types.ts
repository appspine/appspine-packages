import type {
  DomainEventDeliveryRecord,
  DomainEventDeliveryStatus,
  DomainEventSubscriberDescriptor,
} from '../types';

export type DomainEventsAdminActor = {
  sub: string;
  email?: string;
  isApiKey?: boolean;
  actingUserId?: string | null;
};

export type DomainEventsAdminAuditAction = 'RETRY_DELIVERY' | 'IGNORE_DELIVERY';

export type DomainEventsAdminAuditHookInput = {
  action: DomainEventsAdminAuditAction;
  actor: DomainEventsAdminActor;
  deliveryBefore: DomainEventDeliveryRecord;
  deliveryAfter: DomainEventDeliveryRecord;
};

export type DomainEventsAdminAuditHook = {
  record(input: DomainEventsAdminAuditHookInput): Promise<void>;
};

export const DOMAIN_EVENTS_ADMIN_AUDIT_HOOK = 'DOMAIN_EVENTS_ADMIN_AUDIT_HOOK';

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

/**
 * A handler key with deliveries but no `describe()` entry. Two distinct causes share this same
 * shape: data-driven routing (e.g. `webhook.post:<id>`, expected — see `dataDrivenPrefixes`) and
 * a genuinely unresolved handler key (unexpected — no registered subscriber or prefix claims it).
 */
export type DomainEventCatalogHandlerKeyEntry = DomainEventDeliveryStats & {
  handlerKey: string;
};

export type DomainEventCatalogDataDrivenEntry = DomainEventCatalogHandlerKeyEntry;
export type DomainEventCatalogUnresolvedEntry = DomainEventCatalogHandlerKeyEntry;

export type DomainEventCatalogResponse = {
  subscribers: DomainEventCatalogSubscriberEntry[];
  dataDrivenPrefixes: string[];
  hasHandlerKeyContributors: boolean;
  dataDrivenDeliveries: DomainEventCatalogDataDrivenEntry[];
  unresolvedDeliveries: DomainEventCatalogUnresolvedEntry[];
  statsWindowDays: number;
};
