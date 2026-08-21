/**
 * Phase 3 frontend facet exports for `@appspine/domain-events/frontend` (PL3-07).
 */
export interface DomainEventsFrontendContribution {
  readonly kind: 'appspine.domain-events.frontend';
}

// Named re-exports, not `export * from`: see frontend/index.ts for why -- a `for...in`-based
// re-export silently drops anything backed by an RSC client-reference proxy.
export {
  DomainEventCatalogTable,
  DomainEventDeliveriesPanel,
  DomainEventDetailPanel,
  DomainEventsTable,
} from './frontend/index.js';
export type {
  DomainEventCatalogSubscriber,
  DomainEventCatalogSubscriberStats,
  DomainEventCatalogTableKey,
  DomainEventCatalogTableProps,
  DomainEventCatalogView,
  DomainEventDataDrivenDelivery,
  DomainEventDeliveriesPanelProps,
  DomainEventDeliveryRow,
  DomainEventDetailPanelKey,
  DomainEventDetailPanelProps,
  DomainEventEnumKind,
  DomainEventRow,
  DomainEventsTableKey,
  DomainEventsTableProps,
  DomainEventUnresolvedDelivery,
} from './frontend/index.js';
