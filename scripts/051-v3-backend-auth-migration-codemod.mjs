#!/usr/bin/env node
/**
 * 051 v3 — backend auth migration codemod.
 *
 * Rewrites transition-only auth imports to their capability owners and replaces the deprecated
 * JwtOrApiKeyGuard with the host-owned AppspineAuthGuard while preserving the consumer's local
 * binding. A file is updated atomically: any unsupported construct leaves the whole file untouched
 * and is reported for manual review.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const SCRIPT_DIR = path.dirname(
  new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (p) => p.slice(1)),
);
const FIXTURE_DIR = path.resolve(SCRIPT_DIR, '../fixtures/051-v3-backend-auth-migration-codemod');

const SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const IGNORED_DIRECTORIES = new Set([
  '.coverage',
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);

export const AUTH_EXPORT_REPLACEMENTS = Object.freeze({
  AdminGuard: '@appspine/identity-core',
  ApiKeyUser: '@appspine/plugin-host-nest',
  AUTH_AUDIT_LOG: '@appspine/oidc-auth',
  AuthAuditLog: '@appspine/oidc-auth',
  AuthController: '@appspine/oidc-auth',
  buildUserContext: '@appspine/rbac',
  CreateUserDto: '@appspine/identity-core',
  createUserSchema: '@appspine/identity-core',
  CurrentDelegatedUser: '@appspine/oidc-auth',
  CurrentUser: '@appspine/plugin-host-nest',
  CurrentUserPayload: '@appspine/plugin-host-nest',
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
  JwtPayload: '@appspine/plugin-host-nest',
  JwtUser: '@appspine/plugin-host-nest',
  JwtVerifierService: '@appspine/oidc-auth',
  OidcStrategy: '@appspine/oidc-auth',
  resolveActingUserId: '@appspine/plugin-host-nest',
  RoleWithPermissions: '@appspine/rbac',
  SYSTEM_ADMIN_ROLE: '@appspine/identity-core',
  SYSTEM_USER_ROLE: '@appspine/identity-core',
  UpdateRolesDto: '@appspine/identity-core',
  UpdateUserDto: '@appspine/identity-core',
  updateRolesSchema: '@appspine/identity-core',
  updateUserSchema: '@appspine/identity-core',
  UserContext: '@appspine/rbac',
  UsersController: '@appspine/identity-core',
  UsersService: '@appspine/identity-core',
  VerifiedDelegatedClaims: '@appspine/oidc-auth',
});

export const FRONTEND_EXPORT_REPLACEMENTS = Object.freeze({
  ApiKeyRoleOption: '@appspine/m2m-api-key/frontend',
  ApiKeyRoleRef: '@appspine/m2m-api-key/frontend',
  ApiKeyRow: '@appspine/m2m-api-key/frontend',
  ApiKeyRowActions: '@appspine/m2m-api-key/frontend',
  ApiKeyRowActionsProps: '@appspine/m2m-api-key/frontend',
  ApiKeysTable: '@appspine/m2m-api-key/frontend',
  ApiKeysTableKey: '@appspine/m2m-api-key/frontend',
  ApiKeysTableProps: '@appspine/m2m-api-key/frontend',
  ApiKeyScopeOption: '@appspine/m2m-api-key/frontend',
  AuthErrorKey: '@appspine/oidc-auth/frontend',
  CreateApiKeyDialog: '@appspine/m2m-api-key/frontend',
  CreateApiKeyDialogProps: '@appspine/m2m-api-key/frontend',
  CreateApiKeyResponse: '@appspine/m2m-api-key/frontend',
  CreateApiKeyResult: '@appspine/m2m-api-key/frontend',
  CreatedApiKeyReveal: '@appspine/m2m-api-key/frontend',
  CreatedApiKeyRevealProps: '@appspine/m2m-api-key/frontend',
  CreateRoleDialog: '@appspine/rbac/frontend',
  CreateRoleDialogProps: '@appspine/rbac/frontend',
  CreateUserDialog: '@appspine/identity-core/frontend',
  CreateUserDialogProps: '@appspine/identity-core/frontend',
  createNotificationPollingController: '@appspine/notification/frontend',
  DomainEventCatalogTable: '@appspine/domain-events/frontend',
  DomainEventCatalogTableProps: '@appspine/domain-events/frontend',
  DomainEventCatalogView: '@appspine/domain-events/frontend',
  DomainEventDeliveriesPanel: '@appspine/domain-events/frontend',
  DomainEventDeliveriesPanelProps: '@appspine/domain-events/frontend',
  DomainEventDeliveryRow: '@appspine/domain-events/frontend',
  DomainEventDetailPanel: '@appspine/domain-events/frontend',
  DomainEventDetailPanelProps: '@appspine/domain-events/frontend',
  DomainEventRow: '@appspine/domain-events/frontend',
  DomainEventsTable: '@appspine/domain-events/frontend',
  DomainEventsTableProps: '@appspine/domain-events/frontend',
  EnumOption: '@appspine/rbac/frontend',
  isNextRedirectError: '@appspine/oidc-auth/frontend',
  LoginButton: '@appspine/oidc-auth/frontend',
  LoginButtonProps: '@appspine/oidc-auth/frontend',
  mapAuthErrorKey: '@appspine/oidc-auth/frontend',
  NotificationBell: '@appspine/notification/frontend',
  NotificationBellProps: '@appspine/notification/frontend',
  NotificationDataSource: '@appspine/notification/frontend',
  NotificationLabels: '@appspine/notification/frontend',
  NotificationListResult: '@appspine/notification/frontend',
  NotificationPollingOptions: '@appspine/notification/frontend',
  NotificationPollingState: '@appspine/notification/frontend',
  NotificationSeverity: '@appspine/notification/frontend',
  NotificationSummary: '@appspine/notification/frontend',
  RoleRow: '@appspine/rbac/frontend',
  RoleRowActions: '@appspine/rbac/frontend',
  RoleRowActionsProps: '@appspine/rbac/frontend',
  RolesTable: '@appspine/rbac/frontend',
  RolesTableKey: '@appspine/rbac/frontend',
  RolesTableProps: '@appspine/rbac/frontend',
  RoleSortField: '@appspine/rbac/frontend',
  ServiceAccountOption: '@appspine/m2m-api-key/frontend',
  UserRoleOption: '@appspine/identity-core/frontend',
  UserRow: '@appspine/identity-core/frontend',
  UserRowActions: '@appspine/identity-core/frontend',
  UserRowActionsProps: '@appspine/identity-core/frontend',
  UsersTable: '@appspine/identity-core/frontend',
  UsersTableKey: '@appspine/identity-core/frontend',
  UsersTableProps: '@appspine/identity-core/frontend',
  useNotificationPolling: '@appspine/notification/frontend',
});

const AUTH_MODULE_EXPORT = 'AuthModule';

function scriptKind(filePath) {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function lineAndColumn(sourceFile, position) {
  const value = sourceFile.getLineAndCharacterOfPosition(position);
  return `${value.line + 1}:${value.character + 1}`;
}

function quoteFor(node, sourceText) {
  const raw = sourceText.slice(node.moduleSpecifier.getStart(), node.moduleSpecifier.getEnd());
  return raw.startsWith('"') ? '"' : "'";
}

function renderSpecifier(importedName, localName, isTypeOnly) {
  const binding = importedName === localName ? importedName : `${importedName} as ${localName}`;
  return `${isTypeOnly ? 'type ' : ''}${binding}`;
}

function renderImport(source, specifiers, quote) {
  const allTypeOnly = specifiers.every((specifier) => specifier.isTypeOnly);
  const rendered = specifiers.map((specifier) => {
    const value = renderSpecifier(
      specifier.importedName,
      specifier.localName,
      !allTypeOnly && specifier.isTypeOnly,
    );
    return value;
  });
  const typeKeyword = allTypeOnly ? ' type' : '';
  return `import${typeKeyword} { ${rendered.join(', ')} } from ${quote}${source}${quote};`;
}

function originalSpecifier(element, clauseIsTypeOnly) {
  const importedName = (element.propertyName ?? element.name).text;
  return {
    importedName,
    isTypeOnly: clauseIsTypeOnly || element.isTypeOnly,
    localName: element.name.text,
  };
}

function addPartition(partitions, target, specifier) {
  if (!partitions.has(target)) partitions.set(target, []);
  partitions.get(target).push(specifier);
}

function importEditFor(node, sourceFile, sourceText, manual) {
  if (!ts.isStringLiteral(node.moduleSpecifier)) return null;
  const source = node.moduleSpecifier.text;
  const isFrontendShell =
    source === '@appspine/frontend-shell' || source === '@appspine/frontend-shell/notification';
  if (source !== '@appspine/auth' && source !== '@appspine/m2m-api-key' && !isFrontendShell) {
    return null;
  }

  const clause = node.importClause;
  if (!clause || clause.name || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
    if (source === '@appspine/auth') {
      manual.push({
        location: lineAndColumn(sourceFile, node.getStart(sourceFile)),
        reason: `${source} 的 default、namespace 或 side-effect import 無法安全自動拆分`,
      });
    }
    return null;
  }

  const remaining = [];
  const partitions = new Map();

  for (const element of clause.namedBindings.elements) {
    const specifier = originalSpecifier(element, clause.isTypeOnly);

    if (source === '@appspine/auth') {
      if (specifier.importedName === AUTH_MODULE_EXPORT) {
        manual.push({
          location: lineAndColumn(sourceFile, element.getStart(sourceFile)),
          reason:
            'AuthModule has global facade semantics; choose preset-standard plugin mode or direct modules after a Nest DI review',
        });
        continue;
      }

      const target = AUTH_EXPORT_REPLACEMENTS[specifier.importedName];
      if (!target) {
        manual.push({
          location: lineAndColumn(sourceFile, element.getStart(sourceFile)),
          reason: `@appspine/auth export ${specifier.importedName} 沒有已核准的 replacement`,
        });
        continue;
      }
      addPartition(partitions, target, specifier);
      continue;
    }

    if (isFrontendShell) {
      const target = FRONTEND_EXPORT_REPLACEMENTS[specifier.importedName];
      if (target) addPartition(partitions, target, specifier);
      else remaining.push(specifier);
      continue;
    }

    if (specifier.importedName !== 'JwtOrApiKeyGuard') {
      remaining.push(specifier);
      continue;
    }
    if (specifier.isTypeOnly) {
      manual.push({
        location: lineAndColumn(sourceFile, element.getStart(sourceFile)),
        reason: 'JwtOrApiKeyGuard 的 type-only import 需要人工判斷',
      });
      continue;
    }
    addPartition(partitions, '@appspine/plugin-host-nest', {
      importedName: 'AppspineAuthGuard',
      isTypeOnly: false,
      localName: specifier.localName,
    });
  }

  if (partitions.size === 0) return null;

  const lineEnding = sourceText.includes('\r\n') ? '\r\n' : '\n';
  const quote = quoteFor(node, sourceText);
  const replacementImports = [];
  if (remaining.length > 0) replacementImports.push(renderImport(source, remaining, quote));
  for (const [target, specifiers] of partitions) {
    replacementImports.push(renderImport(target, specifiers, quote));
  }

  return {
    edit: {
      after: replacementImports.join(lineEnding),
      before: sourceText.slice(node.getStart(sourceFile), node.getEnd()),
      end: node.getEnd(),
      reason:
        source === '@appspine/auth'
          ? '拆分 auth facade import'
          : isFrontendShell
            ? '遷移 capability frontend import'
            : '替換 deprecated guard',
      start: node.getStart(sourceFile),
    },
  };
}

function applyEdits(sourceText, edits) {
  let output = sourceText;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    output = `${output.slice(0, edit.start)}${edit.after}${output.slice(edit.end)}`;
  }
  return output;
}

export function transformSource(sourceText, filePath = 'fixture.ts') {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
  const manual = sourceFile.parseDiagnostics.map((diagnostic) => ({
    location: lineAndColumn(sourceFile, diagnostic.start ?? 0),
    reason: `語法解析失敗：${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
  }));
  const edits = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const result = importEditFor(statement, sourceFile, sourceText, manual);
    if (!result) continue;
    edits.push(result.edit);
  }

  if (manual.length > 0) {
    return { changed: false, edits: [], manual, output: sourceText };
  }
  const output = applyEdits(sourceText, edits);
  return { changed: output !== sourceText, edits, manual: [], output };
}

function sourceFiles(rootDir) {
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) walk(path.join(currentDir, entry.name));
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(path.join(currentDir, entry.name));
      }
    }
  }

  walk(rootDir);
  return files.sort((a, b) => a.localeCompare(b));
}

function printEdit(edit) {
  console.log(`  [${edit.reason}]`);
  for (const line of edit.before.split(/\r?\n/)) console.log(`  - ${line}`);
  for (const line of edit.after.replace(/\r?\n$/, '').split(/\r?\n/)) console.log(`  + ${line}`);
}

export function migrateRoot(rootDir, options = {}) {
  const absoluteRoot = path.resolve(rootDir);
  if (!fs.existsSync(absoluteRoot) || !fs.statSync(absoluteRoot).isDirectory()) {
    throw new Error(`Migration root is not a directory: ${absoluteRoot}`);
  }

  const changed = [];
  const manual = [];
  for (const filePath of sourceFiles(absoluteRoot)) {
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const result = transformSource(sourceText, filePath);
    const relativePath = path.relative(absoluteRoot, filePath).replace(/\\/g, '/');
    if (result.manual.length > 0) {
      manual.push({ file: relativePath, issues: result.manual });
      continue;
    }
    if (!result.changed) continue;
    changed.push({ file: relativePath, edits: result.edits });
    if (!options.dryRun) fs.writeFileSync(filePath, result.output, 'utf8');
  }

  if (options.log !== false) {
    for (const file of changed) {
      console.log(`${options.dryRun ? '[DRY-RUN]' : '[WRITE]'} ${file.file}`);
      if (options.dryRun) for (const edit of file.edits) printEdit(edit);
    }
    for (const file of manual) {
      console.error(`[MANUAL] ${file.file}`);
      for (const issue of file.issues) console.error(`  - ${issue.location} ${issue.reason}`);
    }
    console.log(
      `[SUMMARY] ${changed.length} file(s) ${options.dryRun ? 'would change' : 'changed'}, ${manual.length} file(s) require manual review.`,
    );
  }

  return { changed, manual };
}

function assertNoTranspileErrors(source, fileName) {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.equal(
    errors.length,
    0,
    errors
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '))
      .join('\n'),
  );
}

function mockModuleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

async function executeSemanticFixture(source, nonce) {
  const mockModules = {
    '@appspine/auth': `
      export const AuthModule = { capabilities: ['identity', 'oidc'] };
      export const CurrentUser = (value) => ({ id: value });
      export const resolveActingUserId = (principal) => principal.actingUserId ?? principal.sub;
      export const SYSTEM_ADMIN_ROLE = 'ADMIN';
    `,
    '@appspine/identity-core': `
      export const IdentityCoreModule = { capabilities: ['identity'] };
      export const SYSTEM_ADMIN_ROLE = 'ADMIN';
    `,
    '@appspine/m2m-api-key': `
      export class JwtOrApiKeyGuard { authenticate(value) { return 'auth:' + value; } }
    `,
    '@appspine/oidc-auth': `
      export const OidcAuthModule = { capabilities: ['oidc'] };
    `,
    '@appspine/plugin-host-nest': `
      export class AppspineAuthGuard { authenticate(value) { return 'auth:' + value; } }
      export const CurrentUser = (value) => ({ id: value });
      export const resolveActingUserId = (principal) => principal.actingUserId ?? principal.sub;
    `,
  };
  let executable = source;
  for (const [packageName, moduleSource] of Object.entries(mockModules)) {
    const url = mockModuleUrl(moduleSource);
    executable = executable.replaceAll(`'${packageName}'`, `'${url}'`);
    executable = executable.replaceAll(`"${packageName}"`, `"${url}"`);
  }
  const url = `${mockModuleUrl(executable)}#${nonce}`;
  const module = await import(url);
  return module.exercise();
}

export async function runSelfTest() {
  console.log('[SELF-TEST] Running v3 backend auth migration codemod self-test...');
  const typeFixture = JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, 'backend-auth.json'), 'utf8'),
  );
  const typeBefore = `${typeFixture.before.join('\n')}\n`;
  const typeExpected = `${typeFixture.expected.join('\n')}\n`;
  const typeResult = transformSource(typeBefore, 'backend-auth.before.ts');
  assert.equal(typeResult.manual.length, 0);
  assert.equal(typeResult.output, typeExpected);
  assertNoTranspileErrors(typeResult.output, 'backend-auth.expected.ts');
  assert.equal(transformSource(typeResult.output, 'backend-auth.expected.ts').changed, false);

  const runtimeFixture = JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, 'semantic.json'), 'utf8'),
  );
  const runtimeBefore = `${runtimeFixture.before.join('\n')}\n`;
  const runtimeExpected = `${runtimeFixture.expected.join('\n')}\n`;
  const runtimeResult = transformSource(runtimeBefore, 'semantic.before.mjs');
  assert.equal(runtimeResult.manual.length, 0);
  assert.equal(runtimeResult.output, runtimeExpected);
  assert.deepEqual(
    await executeSemanticFixture(runtimeResult.output, 'after'),
    await executeSemanticFixture(runtimeBefore, 'before'),
  );

  const manualResult = transformSource(
    "import { AuthModule, CurrentUser } from '@appspine/auth';\nexport { AuthModule, CurrentUser };\n",
    'manual.ts',
  );
  assert.equal(manualResult.changed, false);
  assert.match(manualResult.manual[0]?.reason ?? '', /global facade semantics/);

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'appspine-051-codemod-'));
  try {
    const fixturePath = path.join(temporaryRoot, 'fixture.ts');
    fs.writeFileSync(fixturePath, typeBefore, 'utf8');
    const dryRun = migrateRoot(temporaryRoot, { dryRun: true, log: false });
    assert.equal(dryRun.changed.length, 1);
    assert.equal(fs.readFileSync(fixturePath, 'utf8'), typeBefore);
    const write = migrateRoot(temporaryRoot, { dryRun: false, log: false });
    assert.equal(write.changed.length, 1);
    assert.equal(fs.readFileSync(fixturePath, 'utf8'), typeExpected);
    assert.equal(migrateRoot(temporaryRoot, { dryRun: false, log: false }).changed.length, 0);
  } finally {
    fs.rmSync(temporaryRoot, { force: true, recursive: true });
  }

  console.log(
    '[PASS] 8 assertions verified: fixtures, semantic parity, syntax, manual stop, dry-run, write, and idempotence.',
  );
}

function parseArguments(args) {
  const options = { dryRun: false, root: process.cwd(), selfTest: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--self-test') options.selfTest = true;
    else if (argument === '--root') {
      const value = args[index + 1];
      if (!value) throw new Error('--root requires a directory path');
      options.root = value;
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      console.log(
        'Usage: node scripts/051-v3-backend-auth-migration-codemod.mjs [--root <dir>] [--dry-run] [--self-test]',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

export async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.selfTest) {
    await runSelfTest();
    return;
  }
  const result = migrateRoot(options.root, options);
  if (result.manual.length > 0) process.exitCode = 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.stack : String(error)}`);
    process.exitCode = 1;
  });
}
