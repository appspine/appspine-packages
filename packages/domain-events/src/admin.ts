// Second package entry point (`@appspine/domain-events/admin`) — deliberately NOT re-exported
// from `./index.ts`. Importing this barrel pulls in the m2m-api-key/rbac guard chain; a consumer
// that only needs `record()`/the dispatcher (e.g. appspine-app-template) must never eager-load
// that auth dependency chain just by requiring the package root (dev_docs 028 §3.3; the same
// failure class `packages/mcp-server/src/mcp.controller.ts` warns about at require-time).
export * from './admin/domain-events-admin.controller';
export * from './admin/domain-events-admin.module';
export * from './admin/domain-events-admin.service';
export * from './admin/dto/domain-event-admin.dto';
export * from './admin/types';
