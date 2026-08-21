/**
 * This package's own version, as the host reports it when checking `engine.appspinePluginApi`.
 *
 * Duplicated from `package.json` on purpose: importing the manifest would drag a file outside
 * `rootDir` into the build and put a giant literal type in the emitted `.d.ts`. `version.spec.ts`
 * fails if the two ever disagree, so the duplication cannot rot.
 */
export const PLUGIN_API_VERSION = '1.1.0';

/** The manifest format this package implements. Bumped only on a breaking format change. */
export const PLUGIN_MANIFEST_FILENAME = 'appspine.plugin.json';
