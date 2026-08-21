// Named re-exports, not `export * from`: TypeScript's CJS `export *` compiles to a `for...in`
// enumeration over the re-exported module (see `__exportStar`'s helper in the compiled output).
// Next.js's RSC client-reference proxy (what a 'use client' module becomes when required from a
// Server Component) only implements property-access (`get`), not enumeration -- so `for...in`
// silently copies zero properties from it, and anything re-exported that way from this barrel
// resolves to `undefined` in a Server Component. A named export compiles to direct property
// access on the proxy instead, which works.
export { DomainEventCatalogTable } from './domain-event-catalog-table.js';
export { DomainEventDeliveriesPanel } from './domain-event-deliveries-panel.js';
export { DomainEventDetailPanel } from './domain-event-detail-panel.js';
export { DomainEventsTable } from './domain-events-table.js';
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
} from './types.js';
