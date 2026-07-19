/**
 * Template for `backend/scripts/check-domain-events-subscribers.ts`; copy this file into each
 * app that uses `@appspine/domain-events`.
 *
 * Fails loudly if:
 * 1. Any file under `backend/src/` other than `domain-events.module.ts` calls `registry.on(...)`
 *    directly, bypassing the standard `registerDomainEventSubscribers()` registration path.
 * 2. Any `backend/src/**\/handlers/*.handler.ts` file has neither `@DomainEventSubscriber` nor a
 *    `// @domain-events-undecorated: <reason>` exemption marker.
 * 3. A decorated handler class is not referenced by `domain-events.module.ts`, or its conventional
 *    instance name is not present in the standard registration call.
 *
 * This is intentionally grep-level rather than a full AST analysis. It catches the common
 * "added the handler file but forgot the module wiring" regression without introducing parser
 * dependencies into every app.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC_ROOT = join(process.cwd(), 'src');
const MODULE_FILE_NAME = 'domain-events.module.ts';
const MODULE_PATH = join(SRC_ROOT, 'domain-events', MODULE_FILE_NAME);
const MODULE_CONTENT = readFileSync(MODULE_PATH, 'utf8');
const EXEMPTION_MARKER = '@domain-events-undecorated:';
const DECORATOR_MARKER = '@DomainEventSubscriber';
const DIRECT_REGISTER_CALL = /registry\s*\.\s*on\s*\(/;

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

const issues: string[] = [];

for (const file of listSourceFiles(SRC_ROOT)) {
  const relPath = relative(SRC_ROOT, file);
  const content = readFileSync(file, 'utf8');

  if (DIRECT_REGISTER_CALL.test(content) && !file.endsWith(MODULE_FILE_NAME)) {
    issues.push(
      `${relPath}: calls registry.on(...) directly outside ${MODULE_FILE_NAME}; use registerDomainEventSubscribers() instead`,
    );
  }

  const isHandlerFile = relPath.split(sep).includes('handlers') && relPath.endsWith('.handler.ts');
  if (isHandlerFile && !content.includes(DECORATOR_MARKER) && !content.includes(EXEMPTION_MARKER)) {
    issues.push(
      `${relPath}: missing ${DECORATOR_MARKER}(...) and no "// ${EXEMPTION_MARKER} <reason>" exemption marker`,
    );
  }
  if (isHandlerFile && content.includes(DECORATOR_MARKER)) {
    const className = readExportedClassName(content);
    if (!className) {
      issues.push(`${relPath}: has ${DECORATOR_MARKER}(...) but no exported handler class`);
      continue;
    }
    const variableName = handlerVariableName(className);
    if (!MODULE_CONTENT.includes(className)) {
      issues.push(`${relPath}: ${className} is not referenced by ${MODULE_FILE_NAME}`);
    }
    if (
      !MODULE_CONTENT.includes('registerDomainEventSubscribers') ||
      !MODULE_CONTENT.includes(variableName)
    ) {
      issues.push(
        `${relPath}: ${variableName} is not passed to registerDomainEventSubscribers() in ${MODULE_FILE_NAME}`,
      );
    }
  }
}

for (const issue of issues) {
  console.error(`[domain-events-subscribers] ${issue}`);
}

if (issues.length > 0) {
  process.exit(1);
}

function readExportedClassName(content: string): string | null {
  return content.match(/export\s+class\s+([A-Za-z0-9_]+)/)?.[1] ?? null;
}

function handlerVariableName(className: string): string {
  const base = className.replace(/DomainEventHandler$/, 'Handler');
  return base.charAt(0).toLowerCase() + base.slice(1);
}
