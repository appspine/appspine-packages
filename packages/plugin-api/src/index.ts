/**
 * `@appspine/plugin-api` — the contract every Appspine plugin and host agrees on.
 *
 * The root barrel is deliberately runtime-light: types, frozen name registries, `Symbol.for`
 * tokens and pure helpers, with no NestJS, Prisma, Next.js, React or filesystem access. Anything
 * that needs `node:fs` lives on the `./loader` and `./resolver` subpaths, and the JSON Schema
 * document lives on `./schema`.
 */

export * from './capabilities';
export * from './define-plugin';
export * from './diagnostics';
export * from './errors';
export * from './inventory';
export * from './lifecycle';
export * from './manifest';
export * from './ports';
export * from './principal';
export * from './tokens';
export * from './version';
