/**
 * `@appspine/plugin-host-nest` — composes an App's plugins into a NestJS module, runs their
 * lifecycle, and owns the two host capabilities every plugin can rely on:
 * `appspine.authentication-strategy-registry` and `appspine.principal-context`.
 */

export * from './auth/admin.guard';
export * from './auth/auth-infrastructure.module';
export * from './auth/guards';
export * from './auth/principal';
export * from './auth/principal-context';
export * from './auth/strategy-registry';
export * from './config/composition';
export * from './config/host-config';
export * from './host/appspine-host';
export * from './host/host.module';
