/**
 * `@appspine/plugin-testkit` — everything a plugin package needs to test itself against the
 * platform contract without booting a real App.
 *
 * Depends only on `@appspine/plugin-api` (a peer, so a consumer's single copy is shared) and on no
 * private workspace path, so the same helpers work from an installed tarball.
 */

export * from './assertions';
export * from './builders';
export * from './fakes';
export * from './harness';
export * from './recorder';
