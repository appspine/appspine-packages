// Second package entry point (`@appspine/domain-events/admin`) deliberately NOT re-exported
// from `./index.ts`. Importing this barrel pulls in the admin/auth guard chain; a consumer
// that only needs `record()`/the dispatcher must never eager-load that dependency chain just by
// requiring the package root.
export * from './admin/domain-events-admin.controller';
export * from './admin/domain-events-admin.module';
export * from './admin/domain-events-admin.service';
export * from './admin/dto/domain-event-admin.dto';
export * from './admin/types';
