#!/usr/bin/env node
// NOTE: This code corresponds verbatim with lint-knowledge.js in appspine-app-template / forks / appspine-packages. Changes here must be synchronized across repositories.

const fs = require('node:fs');
const path = require('node:path');

const writeIndexes = process.argv.includes('--write-indexes');
const repoDir = process.cwd();
const repos = [{ name: path.basename(repoDir), dir: repoDir }];

const knowledgeSupportFiles = new Set(['index.md', 'log.md', 'Cited.md']);
const validStatuses = new Set([
  'active',
  'archived',
  'approved',
  'completed',
  'paused',
  'superseded',
]);
const retiredCapabilityPatterns = [
  {
    label: 'local credential authentication is retired; describe Auth as OIDC-only',
    pattern: /supports (?:both )?local credential(?:s| authentication)/i,
  },
  {
    label: 'local/OIDC AUTH_MODE switching is retired; describe Auth as OIDC-only',
    pattern: /auth:\s*local\b.*\band oidc\b.*\bauth_mode\b/i,
  },
];

let totalFilesChecked = 0;
let totalDocumentationFilesChecked = 0;
let indexesWritten = 0;
const errors = [];
const warnings = [];

function toPosix(value) {
  return value.replace(/\\/g, '/');
}

function lineNumberAt(content, offset) {
  return content.slice(0, offset).split('\n').length;
}

function stripCode(content) {
  return content
    .replace(/(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2(?=\n|$)/g, (match) =>
      match.replace(/[^\n]/g, ' '),
    )
    .replace(/`[^`\n]*`/g, (match) => ' '.repeat(match.length));
}

function markdownLinks(content) {
  const links = [];
  let cursor = 0;
  while (cursor < content.length) {
    const opening = content.indexOf('](', cursor);
    if (opening === -1) {
      break;
    }

    let depth = 1;
    let closing = opening + 2;
    for (; closing < content.length; closing++) {
      const character = content[closing];
      if (character === '\\') {
        closing++;
      } else if (character === '(') {
        depth++;
      } else if (character === ')') {
        depth--;
        if (depth === 0) {
          break;
        }
      }
    }

    if (depth !== 0) {
      cursor = opening + 2;
      continue;
    }

    const rawDestination = content.slice(opening + 2, closing).trim();
    const angleDestination = rawDestination.match(/^<([^>]+)>/);
    const plainDestination = rawDestination.match(/^(\S+?)(?:\s+["'][^"']*["'])?$/);
    const target = angleDestination?.[1] ?? plainDestination?.[1];
    if (target) {
      links.push({ index: opening, target: target.replace(/\\([()])/g, '$1') });
    }
    cursor = closing + 1;
  }
  return links;
}

function walkMarkdown(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMarkdown(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return null;
  }

  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z_]+):\s*(.*?)\s*$/);
    if (field) {
      values[field[1]] = field[2];
    }
  }
  return values;
}

function readKnowledgeDocuments(repo) {
  const knowledgeDir = path.join(repo.dir, 'knowledge');
  if (!fs.existsSync(knowledgeDir)) {
    return [];
  }

  return walkMarkdown(knowledgeDir)
    .filter((fullPath) => !knowledgeSupportFiles.has(path.basename(fullPath)))
    .map((fullPath) => {
      const content = fs.readFileSync(fullPath, 'utf8');
      const relativePath = toPosix(path.relative(knowledgeDir, fullPath));
      const repoRelativePath = toPosix(path.relative(repo.dir, fullPath));
      const frontmatter = parseFrontmatter(content);
      const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
      return { content, frontmatter, fullPath, relativePath, repoRelativePath, title };
    });
}

function checkFrontmatterAndTaskStatus(repo, document) {
  const { content, frontmatter, repoRelativePath } = document;
  if (!frontmatter) {
    warnings.push(`[NO FRONTMATTER] ${repo.name}: ${repoRelativePath} missing frontmatter header.`);
    return;
  }

  for (const field of ['type', 'scope', 'status']) {
    if (!frontmatter[field]) {
      warnings.push(`[MISSING ${field.toUpperCase()}] ${repo.name}: ${repoRelativePath}`);
    }
  }

  if (frontmatter.status && !validStatuses.has(frontmatter.status)) {
    errors.push(
      `[INVALID STATUS] ${repo.name}: ${repoRelativePath} has unsupported status "${frontmatter.status}".`,
    );
  }

  if (frontmatter.copy_status === 'pending') {
    errors.push(`[PENDING COPY] ${repo.name}: ${repoRelativePath} still has copy_status: pending!`);
  }

  if (!repoRelativePath.endsWith('task-breakdown.md')) {
    return;
  }

  const completedTasks = (content.match(/^- \[x\]/gim) ?? []).length;
  const openTasks = (content.match(/^- \[ \]/gm) ?? []).length;
  if (completedTasks + openTasks === 0) {
    return;
  }

  if (openTasks === 0 && frontmatter.status !== 'completed') {
    errors.push(
      `[TASK STATUS DRIFT] ${repo.name}: ${repoRelativePath} has ${completedTasks}/${completedTasks} checked tasks but frontmatter status is "${frontmatter.status}".`,
    );
  }
  if (openTasks > 0 && frontmatter.status === 'completed') {
    errors.push(
      `[TASK STATUS DRIFT] ${repo.name}: ${repoRelativePath} has ${openTasks} open task(s) but frontmatter status is completed.`,
    );
  }

  const openingSection = content.slice(0, 2500);
  if (
    openTasks === 0 &&
    /(?:狀態[^\n]*(?:待執行|全部尚未實作)|status[^\n]*(?:not implemented|pending execution))/i.test(
      openingSection,
    )
  ) {
    errors.push(
      `[TASK SUMMARY DRIFT] ${repo.name}: ${repoRelativePath} says work is pending even though every task is checked.`,
    );
  }
}

function checkUnarchivedDevDocsReferences(repo, document) {
  const matches = document.content.match(
    /dev_docs\/(framework|domain-events|app-template|auto-deploy|future_plans|app-[a-z-]+)\//g,
  );
  if (matches) {
    errors.push(
      `[UNARCHIVED DEV_DOCS REF] ${repo.name}: ${document.repoRelativePath} contains active dev_docs/ reference: ${matches.join(', ')}`,
    );
  }
}

function checkKnowledgeLinks(repo, documents) {
  const knowledgeDir = path.join(repo.dir, 'knowledge');
  const basenameTargets = new Map();
  for (const document of documents) {
    const key = path.basename(document.fullPath, '.md');
    const targets = basenameTargets.get(key) ?? [];
    targets.push(document.fullPath);
    basenameTargets.set(key, targets);
  }

  for (const document of documents) {
    const searchable = stripCode(document.content);
    for (const link of markdownLinks(searchable)) {
      let target = link.target;
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) {
        continue;
      }
      target = target.split('#', 1)[0].split('?', 1)[0];
      if (!target) {
        continue;
      }
      try {
        target = decodeURIComponent(target);
      } catch {
        errors.push(
          `[INVALID LINK] ${repo.name}: ${document.repoRelativePath}:${lineNumberAt(searchable, link.index)} has malformed URL encoding in "${link.target}".`,
        );
        continue;
      }
      const resolved = path.resolve(path.dirname(document.fullPath), target);
      if (!fs.existsSync(resolved)) {
        errors.push(
          `[BROKEN LINK] ${repo.name}: ${document.repoRelativePath}:${lineNumberAt(searchable, link.index)} -> ${link.target}`,
        );
      }
    }

    const wikiLinkPattern = /!?\[\[((?:(?!\\\|)[^\]|#])+)(?:#[^\]|]+)?(?:\\?\|[^\]]+)?\]\]/g;
    for (const match of searchable.matchAll(wikiLinkPattern)) {
      const rawTarget = match[1].trim();
      const targetWithoutExtension = rawTarget.replace(/\.md$/i, '');
      const directCandidates = [
        path.resolve(path.dirname(document.fullPath), `${targetWithoutExtension}.md`),
        path.resolve(knowledgeDir, `${targetWithoutExtension}.md`),
      ];
      const basenameCandidates = basenameTargets.get(path.basename(targetWithoutExtension)) ?? [];
      if (
        ![...directCandidates, ...basenameCandidates].some((candidate) => fs.existsSync(candidate))
      ) {
        errors.push(
          `[BROKEN WIKILINK] ${repo.name}: ${document.repoRelativePath}:${lineNumberAt(searchable, match.index)} -> [[${rawTarget}]]`,
        );
      }
    }
  }
}

function renderIndex(repo, documents, existingContent) {
  const heading = existingContent.match(/^# .+$/m)?.[0] ?? `# Knowledge Index - ${repo.name}`;
  const collator = new Intl.Collator('en');
  const rows = [...documents]
    .sort((left, right) => {
      const filenameOrder = collator.compare(
        path.basename(left.relativePath),
        path.basename(right.relativePath),
      );
      return filenameOrder || collator.compare(left.relativePath, right.relativePath);
    })
    .map((document) => {
      const label = path.basename(document.relativePath);
      const type = document.frontmatter?.type ?? '';
      const status = document.frontmatter?.status ?? '';
      const title = (document.title ?? '').replace(/\|/g, '\\|');
      return `| [${label}](${document.relativePath}) | ${type} | ${status} | ${title} |`;
    });

  return `${heading}\n\n| 文件編號 / 檔名 | 類型 | 狀態 | 標題與摘要 |\n| --- | --- | --- | --- |${
    rows.length > 0 ? `\n${rows.join('\n')}` : ''
  }\n`;
}

function checkOrWriteIndex(repo, documents) {
  const indexPath = path.join(repo.dir, 'knowledge', 'index.md');
  if (!fs.existsSync(indexPath)) {
    errors.push(`[MISSING INDEX] ${repo.name}: knowledge/index.md does not exist.`);
    return;
  }

  const current = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');
  const expected = renderIndex(repo, documents, current);
  if (writeIndexes && current !== expected) {
    fs.writeFileSync(indexPath, expected, 'utf8');
    indexesWritten++;
    return;
  }
  if (current !== expected) {
    errors.push(
      `[STALE INDEX] ${repo.name}: knowledge/index.md does not match document frontmatter/titles. Run "node scripts/lint-knowledge.js --write-indexes".`,
    );
  }
}

function documentationFiles(repo) {
  const files = [];
  for (const filename of ['README.md', 'AGENTS.md']) {
    const fullPath = path.join(repo.dir, filename);
    if (fs.existsSync(fullPath)) {
      files.push(fullPath);
    }
  }
  files.push(...walkMarkdown(path.join(repo.dir, 'docs')));
  return files;
}

function checkPublishedDocumentation(repo) {
  for (const fullPath of documentationFiles(repo)) {
    totalDocumentationFilesChecked++;
    const content = fs.readFileSync(fullPath, 'utf8');
    const relativePath = toPosix(path.relative(repo.dir, fullPath));
    for (const { label, pattern } of retiredCapabilityPatterns) {
      const match = content.match(pattern);
      if (match) {
        errors.push(
          `[RETIRED CAPABILITY] ${repo.name}: ${relativePath}:${lineNumberAt(content, match.index)} ${label}.`,
        );
      }
    }

    const searchable = stripCode(content);
    for (const link of markdownLinks(searchable)) {
      let target = link.target;
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) {
        continue;
      }
      target = target.split('#', 1)[0].split('?', 1)[0];
      if (!target) {
        continue;
      }
      try {
        target = decodeURIComponent(target);
      } catch {
        errors.push(
          `[INVALID LINK] ${repo.name}: ${relativePath}:${lineNumberAt(searchable, link.index)} has malformed URL encoding in "${link.target}".`,
        );
        continue;
      }
      if (!fs.existsSync(path.resolve(path.dirname(fullPath), target))) {
        errors.push(
          `[BROKEN LINK] ${repo.name}: ${relativePath}:${lineNumberAt(searchable, link.index)} -> ${link.target}`,
        );
      }
    }
  }
}

function checkKnowledgeDir(repo) {
  const knowledgeDir = path.join(repo.dir, 'knowledge');
  if (!fs.existsSync(knowledgeDir)) {
    return;
  }

  const documents = readKnowledgeDocuments(repo);
  totalFilesChecked += documents.length;
  for (const document of documents) {
    checkFrontmatterAndTaskStatus(repo, document);
    checkUnarchivedDevDocsReferences(repo, document);
  }
  checkKnowledgeLinks(repo, documents);
  checkOrWriteIndex(repo, documents);
}

console.log('=== Starting Knowledge Base Cross-Repo Lint ===');
for (const repo of repos) {
  checkKnowledgeDir(repo);
  checkPublishedDocumentation(repo);
}

console.log(
  `\nChecked ${totalFilesChecked} knowledge documents and ${totalDocumentationFilesChecked} entry-point documentation files across ${repos.length} repos.`,
);
if (writeIndexes) {
  console.log(`Regenerated ${indexesWritten} knowledge index(es).`);
}

if (warnings.length > 0) {
  console.log(`\n--- Warnings (${warnings.length}) ---`);
  for (const warning of warnings) {
    console.warn(warning);
  }
}

if (errors.length > 0) {
  console.error(`\n--- ERRORS (${errors.length}) ---`);
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log(
  '\nAll knowledge base lint checks PASSED: frontmatter, task status, indexes, local links, copy state, and retired capability descriptions are consistent.',
);
