#!/usr/bin/env node
/**
 * 051 PL5-13 — Deprecation Telemetry & Legacy Usage Scanner
 *
 * Scans appspine-app-template and 8 consumer applications for deprecated API imports:
 * 1. `@appspine/auth` imports (facade package scheduled for removal)
 * 2. Capability UI components imported from `@appspine/frontend-shell` (moved in Phase 3)
 * 3. Deprecated guards/helpers like `JwtOrApiKeyGuard` from `@appspine/m2m-api-key`
 *
 * Provides:
 * - Deterministic, sorted output across runs
 * - Self-test suite (`--self-test`)
 * - Baseline check mode (`--check --baseline <path>`) to prevent NEW legacy imports
 * - JSON and Markdown report generation
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const APPSPINE_ROOT = path.resolve(REPO_ROOT, '..');

// Standard target applications
export const TARGET_APPS = [
  { name: 'template', dirName: 'appspine-app-template' },
  { name: 'wiki', dirName: 'wiki' },
  { name: 'calendar', dirName: 'calendar' },
  { name: 'chat', dirName: 'chat' },
  { name: 'drive', dirName: 'drive' },
  { name: 'projects', dirName: 'projects' },
  { name: 'approve', dirName: 'approve' },
  { name: 'master-data', dirName: 'master-data' },
  { name: 'mcp-gateway', dirName: 'mcp-gateway' },
];

// Migration maps & recommendations
export const AUTH_REPLACEMENTS = {
  // identity-core
  AdminGuard: '@appspine/identity-core',
  CreateUserDto: '@appspine/identity-core',
  createUserSchema: '@appspine/identity-core',
  SYSTEM_ADMIN_ROLE: '@appspine/identity-core',
  SYSTEM_USER_ROLE: '@appspine/identity-core',
  UpdateRolesDto: '@appspine/identity-core',
  UpdateUserDto: '@appspine/identity-core',
  UsersController: '@appspine/identity-core',
  UsersService: '@appspine/identity-core',
  updateRolesSchema: '@appspine/identity-core',
  updateUserSchema: '@appspine/identity-core',

  // oidc-auth
  AUTH_AUDIT_LOG: '@appspine/oidc-auth',
  AuthAuditLog: '@appspine/oidc-auth',
  AuthController: '@appspine/oidc-auth',
  CurrentDelegatedUser: '@appspine/oidc-auth',
  DELEGATED_AUTH_PROFILES: '@appspine/oidc-auth',
  DELEGATED_PROFILE_KEY: '@appspine/oidc-auth',
  DelegatedAuthGuard: '@appspine/oidc-auth',
  DelegatedAuthModule: '@appspine/oidc-auth',
  DelegatedAuthModuleOptions: '@appspine/oidc-auth',
  DelegatedIdentityMappingError: '@appspine/oidc-auth',
  DelegatedJwtVerifierService: '@appspine/oidc-auth',
  DelegatedOidcTrustProfile: '@appspine/oidc-auth',
  DelegatedPrincipalMapperService: '@appspine/oidc-auth',
  DelegatedProfile: '@appspine/oidc-auth',
  DelegatedTokenVerificationResult: '@appspine/oidc-auth',
  DelegationContext: '@appspine/oidc-auth',
  JwtAuthGuard: '@appspine/oidc-auth',
  JwtVerifierService: '@appspine/oidc-auth',
  OidcStrategy: '@appspine/oidc-auth',
  VerifiedDelegatedClaims: '@appspine/oidc-auth',

  // plugin-host-nest
  ApiKeyUser: '@appspine/plugin-host-nest',
  CurrentUser: '@appspine/plugin-host-nest',
  CurrentUserPayload: '@appspine/plugin-host-nest',
  JwtPayload: '@appspine/plugin-host-nest',
  JwtUser: '@appspine/plugin-host-nest',
  resolveActingUserId: '@appspine/plugin-host-nest',

  // rbac
  buildUserContext: '@appspine/rbac',
  RoleWithPermissions: '@appspine/rbac',
  UserContext: '@appspine/rbac',

  // module
  AuthModule:
    '@appspine/preset-standard (plugin mode) or @appspine/identity-core + @appspine/oidc-auth',
};

export const FRONTEND_SHELL_REPLACEMENTS = {
  // identity-core
  UsersTable: '@appspine/identity-core/frontend',
  CreateUserDialog: '@appspine/identity-core/frontend',
  UserRowActions: '@appspine/identity-core/frontend',
  UserRow: '@appspine/identity-core/frontend',
  UsersTableKey: '@appspine/identity-core/frontend',
  UsersTableProps: '@appspine/identity-core/frontend',
  CreateUserDialogProps: '@appspine/identity-core/frontend',
  UserRowActionsProps: '@appspine/identity-core/frontend',

  // oidc-auth
  LoginButton: '@appspine/oidc-auth/frontend',
  isNextRedirectError: '@appspine/oidc-auth/frontend',
  mapAuthErrorKey: '@appspine/oidc-auth/frontend',
  AuthErrorKey: '@appspine/oidc-auth/frontend',
  LoginButtonProps: '@appspine/oidc-auth/frontend',

  // rbac
  RolesTable: '@appspine/rbac/frontend',
  CreateRoleDialog: '@appspine/rbac/frontend',
  RoleRowActions: '@appspine/rbac/frontend',
  RoleRow: '@appspine/rbac/frontend',
  EnumOption: '@appspine/rbac/frontend',
  RoleSortField: '@appspine/rbac/frontend',
  RolesTableKey: '@appspine/rbac/frontend',
  RolesTableProps: '@appspine/rbac/frontend',
  CreateRoleDialogProps: '@appspine/rbac/frontend',
  RoleRowActionsProps: '@appspine/rbac/frontend',

  // m2m-api-key
  ApiKeysTable: '@appspine/m2m-api-key/frontend',
  CreateApiKeyDialog: '@appspine/m2m-api-key/frontend',
  CreatedApiKeyReveal: '@appspine/m2m-api-key/frontend',
  ApiKeyRowActions: '@appspine/m2m-api-key/frontend',
  ApiKeyRow: '@appspine/m2m-api-key/frontend',
  ApiKeyRoleRef: '@appspine/m2m-api-key/frontend',
  CreateApiKeyResponse: '@appspine/m2m-api-key/frontend',
  CreateApiKeyResult: '@appspine/m2m-api-key/frontend',
  ApiKeyRoleOption: '@appspine/m2m-api-key/frontend',
  ServiceAccountOption: '@appspine/m2m-api-key/frontend',
  ApiKeyScopeOption: '@appspine/m2m-api-key/frontend',
  ApiKeysTableProps: '@appspine/m2m-api-key/frontend',
  CreateApiKeyDialogProps: '@appspine/m2m-api-key/frontend',
  CreatedApiKeyRevealProps: '@appspine/m2m-api-key/frontend',
  ApiKeyRowActionsProps: '@appspine/m2m-api-key/frontend',

  // domain-events
  DomainEventsTable: '@appspine/domain-events/frontend',
  DomainEventCatalogTable: '@appspine/domain-events/frontend',
  DomainEventDeliveriesPanel: '@appspine/domain-events/frontend',
  DomainEventDetailPanel: '@appspine/domain-events/frontend',
  DomainEventRow: '@appspine/domain-events/frontend',
  DomainEventDeliveryRow: '@appspine/domain-events/frontend',
  DomainEventCatalogView: '@appspine/domain-events/frontend',
  DomainEventsTableProps: '@appspine/domain-events/frontend',
  DomainEventCatalogTableProps: '@appspine/domain-events/frontend',
  DomainEventDeliveriesPanelProps: '@appspine/domain-events/frontend',
  DomainEventDetailPanelProps: '@appspine/domain-events/frontend',

  // notification
  NotificationBell: '@appspine/notification/frontend',
  useNotificationPolling: '@appspine/notification/frontend',
  createNotificationPollingController: '@appspine/notification/frontend',
  NotificationSeverity: '@appspine/notification/frontend',
  NotificationSummary: '@appspine/notification/frontend',
  NotificationListResult: '@appspine/notification/frontend',
  NotificationDataSource: '@appspine/notification/frontend',
  NotificationLabels: '@appspine/notification/frontend',
  NotificationBellProps: '@appspine/notification/frontend',
  NotificationPollingState: '@appspine/notification/frontend',
  NotificationPollingOptions: '@appspine/notification/frontend',
};

export const M2M_REPLACEMENTS = {
  JwtOrApiKeyGuard: "@appspine/plugin-host-nest's AppspineAuthGuard",
};

/**
 * Parses file content and extracts all deprecated import usages.
 * Returns array of usage objects.
 */
export function scanSource(content, relativePath, appName) {
  const usages = [];
  const lines = content.split('\n');

  // Regexes for import matching
  // 1. Matches: import { a, b as c } from 'pkg';
  // 2. Matches: import Foo from 'pkg';
  // 3. Matches: import * as Foo from 'pkg';
  // 4. Matches: import 'pkg';
  const importRegex =
    /import\s+(?:(\*\s+as\s+[\w$]+|[\w$]+|\{[^}]*\})\s+from\s+)?['"]([^'"]+)['"]/g;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    // Skip empty lines or full line comments
    if (
      !line.trim() ||
      line.trim().startsWith('//') ||
      line.trim().startsWith('/*') ||
      line.trim().startsWith('*')
    ) {
      continue;
    }

    importRegex.lastIndex = 0;
    let match = importRegex.exec(line);
    while (match !== null) {
      const specifiersClause = match[1] ? match[1].trim() : '';
      const importPath = match[2].trim();

      // Case 1: @appspine/auth
      if (importPath === '@appspine/auth') {
        if (!specifiersClause) {
          usages.push({
            app: appName,
            file: relativePath,
            line: lineIndex + 1,
            category: 'AUTH_PACKAGE',
            importedFrom: importPath,
            specifier: '(side-effect)',
            replacement: 'Remove or import specific package',
          });
        } else if (specifiersClause.startsWith('{') && specifiersClause.endsWith('}')) {
          const rawSpecs = specifiersClause.slice(1, -1).split(',');
          for (const rawSpec of rawSpecs) {
            const spec = rawSpec.trim();
            if (!spec) continue;
            const cleanName = spec
              .replace(/^type\s+/, '')
              .split(/\s+as\s+/)[0]
              .trim();
            const replacement =
              AUTH_REPLACEMENTS[cleanName] || '@appspine/identity-core or @appspine/oidc-auth';
            usages.push({
              app: appName,
              file: relativePath,
              line: lineIndex + 1,
              category: 'AUTH_PACKAGE',
              importedFrom: importPath,
              specifier: cleanName,
              rawSpecifier: spec,
              replacement,
            });
          }
        } else {
          // Default or wildcard import
          const cleanName = specifiersClause.replace(/\*\s+as\s+/, '').trim();
          usages.push({
            app: appName,
            file: relativePath,
            line: lineIndex + 1,
            category: 'AUTH_PACKAGE',
            importedFrom: importPath,
            specifier: cleanName,
            replacement:
              'Split into @appspine/identity-core, @appspine/oidc-auth, @appspine/plugin-host-nest',
          });
        }
      }

      // Case 2: @appspine/frontend-shell (and subpaths) for capability UI
      if (
        importPath === '@appspine/frontend-shell' ||
        importPath === '@appspine/frontend-shell/notification'
      ) {
        if (specifiersClause?.startsWith('{') && specifiersClause.endsWith('}')) {
          const rawSpecs = specifiersClause.slice(1, -1).split(',');
          for (const rawSpec of rawSpecs) {
            const spec = rawSpec.trim();
            if (!spec) continue;
            const cleanName = spec
              .replace(/^type\s+/, '')
              .split(/\s+as\s+/)[0]
              .trim();
            if (FRONTEND_SHELL_REPLACEMENTS[cleanName]) {
              usages.push({
                app: appName,
                file: relativePath,
                line: lineIndex + 1,
                category: 'FRONTEND_SHELL_CAPABILITY_UI',
                importedFrom: importPath,
                specifier: cleanName,
                rawSpecifier: spec,
                replacement: FRONTEND_SHELL_REPLACEMENTS[cleanName],
              });
            }
          }
        }
      }

      // Case 3: @appspine/m2m-api-key deprecated guards
      if (importPath === '@appspine/m2m-api-key') {
        if (specifiersClause?.startsWith('{') && specifiersClause.endsWith('}')) {
          const rawSpecs = specifiersClause.slice(1, -1).split(',');
          for (const rawSpec of rawSpecs) {
            const spec = rawSpec.trim();
            if (!spec) continue;
            const cleanName = spec
              .replace(/^type\s+/, '')
              .split(/\s+as\s+/)[0]
              .trim();
            if (M2M_REPLACEMENTS[cleanName]) {
              usages.push({
                app: appName,
                file: relativePath,
                line: lineIndex + 1,
                category: 'M2M_DEPRECATED_EXPORT',
                importedFrom: importPath,
                specifier: cleanName,
                rawSpecifier: spec,
                replacement: M2M_REPLACEMENTS[cleanName],
              });
            }
          }
        }
      }

      match = importRegex.exec(line);
    }
  }

  return usages;
}

/**
 * Recursively scans a directory for source files.
 */
export function scanDirectory(appDir, appName) {
  const usages = [];
  const ignoreDirs = new Set([
    'node_modules',
    'dist',
    '.next',
    'build',
    '.turbo',
    '.git',
    '.coverage',
  ]);

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name)) {
          walk(path.join(currentDir, entry.name));
        }
      } else if (entry.isFile() && /\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name)) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(appDir, fullPath).replace(/\\/g, '/');
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const fileUsages = scanSource(content, relativePath, appName);
          usages.push(...fileUsages);
        } catch {
          // Ignore read errors
        }
      }
    }
  }

  walk(appDir);
  return usages;
}

/**
 * Scans all registered apps in APPSPINE_ROOT.
 */
export function scanFleet(apps = TARGET_APPS, rootDir = APPSPINE_ROOT) {
  const allUsages = [];

  for (const app of apps) {
    const appDir = path.join(rootDir, app.dirName);
    if (!fs.existsSync(appDir)) {
      console.warn(`[WARN] App directory not found: ${appDir}`);
      continue;
    }
    const appUsages = scanDirectory(appDir, app.name);
    allUsages.push(...appUsages);
  }

  // Deterministic sorting
  allUsages.sort((a, b) => {
    if (a.app !== b.app) return a.app.localeCompare(b.app);
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.line !== b.line) return a.line - b.line;
    return a.specifier.localeCompare(b.specifier);
  });

  return allUsages;
}

/**
 * Builds a deterministic canonical digest/key for a usage entry.
 */
export function canonicalUsageKey(usage) {
  return `${usage.app}::${usage.file}::${usage.line}::${usage.category}::${usage.importedFrom}::${usage.specifier}`;
}

/**
 * Generates markdown telemetry summary report.
 */
export function generateMarkdownReport(usages) {
  const lines = [];
  lines.push('---');
  lines.push('type: decision');
  lines.push('scope: cross-repo');
  lines.push('status: active');
  lines.push('supersedes: null');
  lines.push('superseded_by: null');
  lines.push('created: 2026-08-20');
  lines.push('updated: 2026-08-20');
  lines.push('---');
  lines.push('');
  lines.push('# 051 PL5-13 Deprecation Telemetry & Fleet Consumer Scan Report');
  lines.push('');
  lines.push(`> Generated at: ${new Date().toISOString()}`);
  lines.push(`> Total legacy usages found across fleet: **${usages.length}**`);
  lines.push('');

  // Group by App
  const byApp = new Map();
  for (const u of usages) {
    if (!byApp.has(u.app)) byApp.set(u.app, []);
    byApp.get(u.app).push(u);
  }

  lines.push('## 1. Fleet Summary by Application');
  lines.push('');
  lines.push(
    '| Application | Total Usages | @appspine/auth | frontend-shell UI | m2m-api-key legacy |',
  );
  lines.push('|---|---|---|---|---|');

  for (const app of TARGET_APPS) {
    const list = byApp.get(app.name) || [];
    const authCount = list.filter((x) => x.category === 'AUTH_PACKAGE').length;
    const uiCount = list.filter((x) => x.category === 'FRONTEND_SHELL_CAPABILITY_UI').length;
    const m2mCount = list.filter((x) => x.category === 'M2M_DEPRECATED_EXPORT').length;
    lines.push(`| **${app.name}** | ${list.length} | ${authCount} | ${uiCount} | ${m2mCount} |`);
  }
  lines.push('');

  // Group by Specifier / Export
  const bySpec = new Map();
  for (const u of usages) {
    const key = `${u.importedFrom} -> ${u.specifier}`;
    if (!bySpec.has(key))
      bySpec.set(key, {
        count: 0,
        replacement: u.replacement,
        category: u.category,
        apps: new Set(),
      });
    const stat = bySpec.get(key);
    stat.count++;
    stat.apps.add(u.app);
  }

  lines.push('## 2. Legacy Export Breakdown & Recommended Replacements');
  lines.push('');
  lines.push(
    '| Legacy Export | Category | Occurrences | Consumers (Apps) | Recommended Replacement |',
  );
  lines.push('|---|---|---|---|---|');

  const sortedSpecs = Array.from(bySpec.entries()).sort((a, b) => b[1].count - a[1].count);
  for (const [key, stat] of sortedSpecs) {
    const appsList = Array.from(stat.apps).sort().join(', ');
    lines.push(
      `| \`${key}\` | \`${stat.category}\` | ${stat.count} | ${appsList} | \`${stat.replacement}\` |`,
    );
  }
  lines.push('');

  // Detailed Table
  lines.push('## 3. Detailed Consumer Evidence Matrix');
  lines.push('');
  lines.push('| App | File | Line | Export | Replacement |');
  lines.push('|---|---|---|---|---|');
  for (const u of usages) {
    lines.push(
      `| ${u.app} | \`${u.file}\` | L${u.line} | \`${u.specifier}\` (\`${u.importedFrom}\`) | \`${u.replacement}\` |`,
    );
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Self test suite
 */
export function runSelfTest() {
  console.log('[SELF-TEST] Running deprecation scanner self-test...');

  const mockSource = `
import { CurrentUser, resolveActingUserId, type JwtUser, SYSTEM_ADMIN_ROLE } from '@appspine/auth';
import { AuthModule } from '@appspine/auth';
import { UsersTable, Button, RolesTable } from '@appspine/frontend-shell';
import { NotificationBell } from '@appspine/frontend-shell/notification';
import { ApiKeysService, JwtOrApiKeyGuard } from '@appspine/m2m-api-key';
import { OidcAuthModule } from '@appspine/oidc-auth';
`;

  const results = scanSource(mockSource, 'src/example.ts', 'test-app');

  // Verify expectations
  const expectedKeys = [
    'test-app::src/example.ts::2::AUTH_PACKAGE::@appspine/auth::CurrentUser',
    'test-app::src/example.ts::2::AUTH_PACKAGE::@appspine/auth::resolveActingUserId',
    'test-app::src/example.ts::2::AUTH_PACKAGE::@appspine/auth::JwtUser',
    'test-app::src/example.ts::2::AUTH_PACKAGE::@appspine/auth::SYSTEM_ADMIN_ROLE',
    'test-app::src/example.ts::3::AUTH_PACKAGE::@appspine/auth::AuthModule',
    'test-app::src/example.ts::4::FRONTEND_SHELL_CAPABILITY_UI::@appspine/frontend-shell::UsersTable',
    'test-app::src/example.ts::4::FRONTEND_SHELL_CAPABILITY_UI::@appspine/frontend-shell::RolesTable',
    'test-app::src/example.ts::5::FRONTEND_SHELL_CAPABILITY_UI::@appspine/frontend-shell/notification::NotificationBell',
    'test-app::src/example.ts::6::M2M_DEPRECATED_EXPORT::@appspine/m2m-api-key::JwtOrApiKeyGuard',
  ];

  const actualKeys = results.map(canonicalUsageKey);
  let passed = true;

  if (actualKeys.length !== expectedKeys.length) {
    console.error(`[FAIL] Expected ${expectedKeys.length} matches, got ${actualKeys.length}`);
    passed = false;
  }

  for (const exp of expectedKeys) {
    if (!actualKeys.includes(exp)) {
      console.error(`[FAIL] Missing expected match: ${exp}`);
      passed = false;
    }
  }

  if (!passed) {
    console.error('[FAIL] Self-test failed!');
    process.exit(1);
  }

  console.log(`[PASS] Self-test passed cleanly (${actualKeys.length} cases verified).`);
}

/**
 * Main CLI execution
 */
export function main() {
  const args = process.argv.slice(2);

  if (args.includes('--self-test')) {
    runSelfTest();
    return;
  }

  const checkIndex = args.indexOf('--check');
  const baselineIndex = args.indexOf('--baseline');
  const writeBaselineIndex = args.indexOf('--write-baseline');
  const markdownIndex = args.indexOf('--markdown');
  const jsonIndex = args.indexOf('--json');

  const baselinePath = baselineIndex !== -1 ? args[baselineIndex + 1] : null;
  const writeBaselinePath = writeBaselineIndex !== -1 ? args[writeBaselineIndex + 1] : null;
  const markdownPath = markdownIndex !== -1 ? args[markdownIndex + 1] : null;
  const jsonPath = jsonIndex !== -1 ? args[jsonIndex + 1] : null;

  console.log(`Scanning template + ${TARGET_APPS.length - 1} apps in: ${APPSPINE_ROOT}`);
  const usages = scanFleet();
  console.log(`Scan completed: ${usages.length} legacy usages identified across fleet.`);

  if (writeBaselinePath) {
    const resolvedPath = path.resolve(process.cwd(), writeBaselinePath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, `${JSON.stringify(usages, null, 2)}\n`, 'utf8');
    console.log(`[OK] Baseline written to: ${resolvedPath}`);
  }

  if (markdownPath) {
    const resolvedPath = path.resolve(process.cwd(), markdownPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    const md = generateMarkdownReport(usages);
    fs.writeFileSync(resolvedPath, md, 'utf8');
    console.log(`[OK] Markdown report written to: ${resolvedPath}`);
  }

  if (jsonPath) {
    const resolvedPath = path.resolve(process.cwd(), jsonPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, `${JSON.stringify(usages, null, 2)}\n`, 'utf8');
    console.log(`[OK] JSON output written to: ${resolvedPath}`);
  }

  if (checkIndex !== -1) {
    if (!baselinePath) {
      console.error('[ERROR] --check requires --baseline <path>');
      process.exit(1);
    }
    const resolvedBaseline = path.resolve(process.cwd(), baselinePath);
    if (!fs.existsSync(resolvedBaseline)) {
      console.error(`[ERROR] Baseline file not found: ${resolvedBaseline}`);
      process.exit(1);
    }

    const baselineData = JSON.parse(fs.readFileSync(resolvedBaseline, 'utf8'));
    const baselineKeys = new Set(baselineData.map(canonicalUsageKey));
    const currentKeys = new Set(usages.map(canonicalUsageKey));

    const newUsages = usages.filter((u) => !baselineKeys.has(canonicalUsageKey(u)));
    const fixedUsages = baselineData.filter((u) => !currentKeys.has(canonicalUsageKey(u)));

    console.log(`[CHECK] Baseline count: ${baselineData.length}, Current count: ${usages.length}`);
    if (fixedUsages.length > 0) {
      console.log(`[INFO] ${fixedUsages.length} legacy usages were migrated/removed!`);
    }

    if (newUsages.length > 0) {
      console.error(`\n[FAIL] Found ${newUsages.length} NEW legacy usage(s) not in baseline:`);
      for (const u of newUsages) {
        console.error(
          `  - [${u.app}] ${u.file}:L${u.line} uses deprecated "${u.specifier}" from "${u.importedFrom}" (Use ${u.replacement} instead)`,
        );
      }
      process.exit(1);
    }

    console.log('[PASS] Deprecation gate check PASSED: No new legacy usages detected.');
  }
}

if (
  process.argv[1] &&
  path.basename(process.argv[1]).includes('051-pl5-13-deprecation-telemetry')
) {
  main();
}
