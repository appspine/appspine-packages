import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (pkg: string, entry = 'src/index.ts') =>
  fileURLToPath(new URL(`../${pkg}/${entry}`, import.meta.url));

/**
 * This package is a pure re-export facade, so its only meaningful test imports the packages it
 * re-exports. Two things get in the way, and both are resolved here rather than in the spec:
 *
 *  1. `@appspine/common` resolves `@prisma/client` through `createRequire(process.cwd())` at import
 *     time. That client is generated per consuming App and does not exist in this workspace, so the
 *     import throws before any assertion runs. The alias below swaps in a stub.
 *  2. A `vi.mock()` cannot achieve (1) on its own: the workspace packages resolve to their built
 *     CommonJS output, whose `require('@appspine/common')` happens outside Vitest's module
 *     registry. Pointing each `@appspine/*` specifier at its TypeScript source puts the whole graph
 *     under Vite's resolver, at which point the stub alias actually applies.
 *
 * No other package needs this — they all test their own source rather than a re-export surface.
 */
export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@appspine/common',
        replacement: fileURLToPath(new URL('./test/appspine-common-stub.ts', import.meta.url)),
      },
      {
        find: /^@appspine\/plugin-api\/loader$/,
        replacement: src('plugin-api', 'src/loader/index.ts'),
      },
      {
        find: /^@appspine\/plugin-api\/resolver$/,
        replacement: src('plugin-api', 'src/resolver/index.ts'),
      },
      {
        find: /^@appspine\/plugin-api\/runtime$/,
        replacement: src('plugin-api', 'src/runtime/index.ts'),
      },
      { find: /^@appspine\/plugin-api$/, replacement: src('plugin-api') },
      { find: /^@appspine\/plugin-host-nest$/, replacement: src('plugin-host-nest') },
      { find: /^@appspine\/identity-core$/, replacement: src('identity-core') },
      { find: /^@appspine\/oidc-auth$/, replacement: src('oidc-auth') },
      { find: /^@appspine\/rbac$/, replacement: src('rbac') },
      { find: /^@appspine\/audit-log$/, replacement: src('audit-log') },
    ],
  },
});
