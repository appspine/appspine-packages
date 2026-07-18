/**
 * Template for `backend/scripts/check-domain-events-subscribers.ts` — copy this file into each
 * app that uses `@appspine/domain-events` (dev_docs 028 §3.5). Grep-level, not AST: the goal is
 * catching "forgot to follow convention", not a complete static analysis.
 *
 * Fails loudly if:
 * 1. Any file under `backend/src/` other than `domain-events.module.ts` calls `registry.on(`
 *    directly — that bypasses the standard `registerDomainEventSubscribers()` registration path.
 * 2. Any `backend/src/**\/handlers/*.handler.ts` file has neither `@DomainEventSubscriber` nor a
 *    `// @domain-events-undecorated: <reason>` exemption marker. The marker exists for
 *    prefix-resolved handlers (e.g. a `webhook.post` handler wired through `registerPrefix()`,
 *    which decision 1 explicitly keeps undecorated) — exemption is by in-file marker, never by
 *    filename: apps can have same-named handler files with opposite decoration requirements
 *    (e.g. one app's `webhook-post.handler.ts` is exact-registered and must be decorated, while
 *    another app's same-named file is prefix-resolved and must carry the exemption marker).
 *
 * Run: `pnpm -C backend check:domain-events-subscribers`
 * Wire into `backend/package.json` scripts and `.husky/pre-commit`, same as
 * `check:domain-events-schema-drift`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC_ROOT = join(process.cwd(), "src");
const MODULE_FILE_NAME = "domain-events.module.ts";
const EXEMPTION_MARKER = "@domain-events-undecorated:";
const DECORATOR_MARKER = "@DomainEventSubscriber";
const DIRECT_REGISTER_CALL = "registry.on(";

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts")) {
      files.push(full);
    }
  }
  return files;
}

const issues: string[] = [];

for (const file of listSourceFiles(SRC_ROOT)) {
  const relPath = relative(SRC_ROOT, file);
  const content = readFileSync(file, "utf8");

  if (content.includes(DIRECT_REGISTER_CALL) && !file.endsWith(MODULE_FILE_NAME)) {
    issues.push(
      `${relPath}: calls registry.on(...) directly outside ${MODULE_FILE_NAME} — use registerDomainEventSubscribers() instead`,
    );
  }

  const isHandlerFile =
    relPath.split(sep).includes("handlers") && relPath.endsWith(".handler.ts");
  if (isHandlerFile && !content.includes(DECORATOR_MARKER) && !content.includes(EXEMPTION_MARKER)) {
    issues.push(
      `${relPath}: missing ${DECORATOR_MARKER}(...) and no "// ${EXEMPTION_MARKER} <reason>" exemption marker`,
    );
  }
}

for (const issue of issues) {
  console.error(`[domain-events-subscribers] ${issue}`);
}

if (issues.length > 0) {
  process.exit(1);
}
