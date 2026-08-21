#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const writeIndexes = process.argv.includes('--write-indexes');
const newDecisionIndex = process.argv.indexOf('--new-decision');
const titleIndex = process.argv.indexOf('--title');

const repoDir = process.cwd();
const repoName = path.basename(repoDir);
const specsDir = path.join(repoDir, 'specs');

// 1. 建立新決策
if (newDecisionIndex !== -1) {
  const slug = process.argv[newDecisionIndex + 1];
  let title = titleIndex !== -1 ? process.argv[titleIndex + 1] : '';
  if (!slug) {
    console.error('Error: --new-decision requires a slug argument.');
    process.exit(1);
  }
  if (!title) {
    title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  createNewDecision(slug, title);
  process.exit(0);
}

// 2. Linter 靜態檢查配置
const specsSupportFiles = new Set(['index.md', 'log.md', 'Cited.md']);
const validStatuses = new Set([
  'active',
  'archived',
  'approved',
  'completed',
  'paused',
  'superseded',
  'draft',
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
      if (entry.name === '_archive') {
        continue;
      }
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

function readSpecsDocuments() {
  if (!fs.existsSync(specsDir)) {
    return [];
  }

  return walkMarkdown(specsDir)
    .filter((fullPath) => !specsSupportFiles.has(path.basename(fullPath)))
    .map((fullPath) => {
      const content = fs.readFileSync(fullPath, 'utf8');
      const relativePath = toPosix(path.relative(specsDir, fullPath));
      const repoRelativePath = toPosix(path.relative(repoDir, fullPath));
      const frontmatter = parseFrontmatter(content);
      const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
      return { content, frontmatter, fullPath, relativePath, repoRelativePath, title };
    });
}

function checkNamingAndStructure(document) {
  const { relativePath, repoRelativePath } = document;
  const parts = relativePath.split('/');
  const section = parts[0]; // topics, decisions, contracts

  if (section === 'topics') {
    const fileName = path.basename(relativePath);
    if (/^\d+-/u.test(fileName)) {
      errors.push(
        `[NAMING CONVICTION ERROR] ${repoName}: Topic filename "${fileName}" in "${repoRelativePath}" must be a pure semantic slug and cannot start with numeric prefixes.`,
      );
    }
  } else if (section === 'decisions') {
    const fileName = path.basename(relativePath);
    // YYYYMM-[4碼hash]-[slug].md
    if (!/^\d{6}-[0-9a-f]{4}-.+\.md$/i.test(fileName)) {
      errors.push(
        `[NAMING CONVICTION ERROR] ${repoName}: Decision filename "${fileName}" in "${repoRelativePath}" must follow the pattern YYYYMM-[4-char-hash]-[slug].md.`,
      );
    }
  }
}

function checkFrontmatterAndTaskStatus(document) {
  const { content, frontmatter, repoRelativePath, relativePath } = document;
  const parts = relativePath.split('/');
  const section = parts[0];

  // contracts 不需要強制包含 frontmatter
  if (section === 'contracts') {
    return;
  }

  if (!frontmatter) {
    warnings.push(`[NO FRONTMATTER] ${repoName}: ${repoRelativePath} missing frontmatter header.`);
    return;
  }

  const requiredFields = section === 'decisions' ? ['type', 'status'] : ['type', 'scope', 'status'];
  for (const field of requiredFields) {
    if (!frontmatter[field]) {
      warnings.push(`[MISSING ${field.toUpperCase()}] ${repoName}: ${repoRelativePath}`);
    }
  }

  if (frontmatter.status && !validStatuses.has(frontmatter.status)) {
    errors.push(
      `[INVALID STATUS] ${repoName}: ${repoRelativePath} has unsupported status "${frontmatter.status}".`,
    );
  }

  if (frontmatter.copy_status === 'pending') {
    errors.push(`[PENDING COPY] ${repoName}: ${repoRelativePath} still has copy_status: pending!`);
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
      `[TASK STATUS DRIFT] ${repoName}: ${repoRelativePath} has ${completedTasks}/${completedTasks} checked tasks but frontmatter status is "${frontmatter.status}".`,
    );
  }
  if (openTasks > 0 && frontmatter.status === 'completed') {
    errors.push(
      `[TASK STATUS DRIFT] ${repoName}: ${repoRelativePath} has ${openTasks} open task(s) but frontmatter status is completed.`,
    );
  }
}

function checkSpecsLinks(documents) {
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
          `[INVALID LINK] ${repoName}: ${document.repoRelativePath}:${lineNumberAt(searchable, link.index)} has malformed URL encoding in "${link.target}".`,
        );
        continue;
      }
      const resolved = path.resolve(path.dirname(document.fullPath), target);
      if (!fs.existsSync(resolved)) {
        errors.push(
          `[BROKEN LINK] ${repoName}: ${document.repoRelativePath}:${lineNumberAt(searchable, link.index)} -> ${link.target}`,
        );
      }
    }

    const wikiLinkPattern = /!?\[\[((?:(?!\\\|)[^\]|#])+)(?:#[^\]|]+)?(?:\\?\|[^\]]+)?\]\]/g;
    for (const match of searchable.matchAll(wikiLinkPattern)) {
      const rawTarget = match[1].trim();
      const targetWithoutExtension = rawTarget.replace(/\.md$/i, '');
      const directCandidates = [
        path.resolve(path.dirname(document.fullPath), `${targetWithoutExtension}.md`),
        path.resolve(specsDir, `${targetWithoutExtension}.md`),
      ];
      const basenameCandidates = basenameTargets.get(path.basename(targetWithoutExtension)) ?? [];
      if (
        ![...directCandidates, ...basenameCandidates].some((candidate) => fs.existsSync(candidate))
      ) {
        errors.push(
          `[BROKEN WIKILINK] ${repoName}: ${document.repoRelativePath}:${lineNumberAt(searchable, match.index)} -> [[${rawTarget}]]`,
        );
      }
    }
  }
}

function renderIndex(documents, existingHeading) {
  const heading = existingHeading || `# Specs Index - ${repoName}`;

  const topics = documents.filter(d => d.relativePath.startsWith('topics/'));
  const decisions = documents.filter(d => d.relativePath.startsWith('decisions/'));
  const contracts = documents.filter(d => d.relativePath.startsWith('contracts/'));

  const collator = new Intl.Collator('en');

  // Topics 字典序
  const topicsRows = [...topics]
    .sort((a, b) => collator.compare(path.basename(a.relativePath), path.basename(b.relativePath)))
    .map(d => {
      const label = path.basename(d.relativePath);
      const scope = d.frontmatter?.scope ?? 'N/A';
      const status = d.frontmatter?.status ?? 'N/A';
      const title = (d.title ?? '').replace(/\|/g, '\\|');
      return `| [${label}](${d.relativePath}) | ${scope} | ${status} | ${title} |`;
    });

  // Decisions 依日期倒序 (Decisions 檔名為 YYYYMM-[hash]-[slug].md)
  const decisionsRows = [...decisions]
    .sort((a, b) => {
      const aName = path.basename(a.relativePath);
      const bName = path.basename(b.relativePath);
      return bName.localeCompare(aName); // 倒序
    })
    .map(d => {
      const label = path.basename(d.relativePath);
      const status = d.frontmatter?.status ?? 'N/A';
      const title = (d.title ?? '').replace(/\|/g, '\\|');
      return `| [${label}](${d.relativePath}) | ${status} | ${title} |`;
    });

  // Contracts 字典序
  const contractsRows = [...contracts]
    .sort((a, b) => collator.compare(path.basename(a.relativePath), path.basename(b.relativePath)))
    .map(d => {
      const label = path.basename(d.relativePath);
      const type = d.frontmatter?.type ?? 'contract';
      const status = d.frontmatter?.status ?? 'active';
      const title = (d.title ?? '').replace(/\|/g, '\\|');
      return `| [${label}](${d.relativePath}) | ${type} | ${status} | ${title} |`;
    });

  let content = `${heading}\n\n`;

  content += `## Living Specifications (SSoT Topics)\n\n`;
  content += `| 規格檔名 | 範疇 (Scope) | 狀態 | 標題與摘要 |\n`;
  content += `| --- | --- | --- | --- |\n`;
  if (topicsRows.length > 0) {
    content += topicsRows.join('\n') + '\n';
  }
  content += `\n`;

  content += `## Architectural Decisions (ADR)\n\n`;
  content += `| 決策檔案 | 狀態 | 標題與摘要 |\n`;
  content += `| --- | --- | --- |\n`;
  if (decisionsRows.length > 0) {
    content += decisionsRows.join('\n') + '\n';
  }
  content += `\n`;

  content += `## Integration Contracts\n\n`;
  content += `| 契約檔案 | 類型 | 狀態 | 標題與摘要 |\n`;
  content += `| --- | --- | --- | --- |\n`;
  if (contractsRows.length > 0) {
    content += contractsRows.join('\n') + '\n';
  }

  return content;
}

function checkOrWriteIndex(documents) {
  const indexPath = path.join(specsDir, 'index.md');
  const current = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n') : '';
  const heading = current.match(/^# .+$/m)?.[0] ?? `# Specs Index - ${repoName}`;

  const expected = renderIndex(documents, heading);
  if (writeIndexes && current !== expected) {
    fs.writeFileSync(indexPath, expected, 'utf8');
    indexesWritten++;
    return;
  }
  if (current !== expected) {
    errors.push(
      `[STALE INDEX] ${repoName}: specs/index.md does not match document frontmatter/titles. Run "node scripts/lint-specs.mjs --write-indexes".`,
    );
  }
}

function documentationFiles() {
  const files = [];
  for (const filename of ['README.md', 'AGENTS.md']) {
    const fullPath = path.join(repoDir, filename);
    if (fs.existsSync(fullPath)) {
      files.push(fullPath);
    }
  }
  files.push(...walkMarkdown(path.join(repoDir, 'docs')));
  return files;
}

function checkPublishedDocumentation() {
  for (const fullPath of documentationFiles()) {
    totalDocumentationFilesChecked++;
    const content = fs.readFileSync(fullPath, 'utf8');
    const relativePath = toPosix(path.relative(repoDir, fullPath));
    for (const { label, pattern } of retiredCapabilityPatterns) {
      const match = content.match(pattern);
      if (match) {
        errors.push(
          `[RETIRED CAPABILITY] ${repoName}: ${relativePath}:${lineNumberAt(content, match.index)} ${label}.`,
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
          `[INVALID LINK] ${repoName}: ${relativePath}:${lineNumberAt(searchable, link.index)} has malformed URL encoding in "${link.target}".`,
        );
        continue;
      }
      if (!fs.existsSync(path.resolve(path.dirname(fullPath), target))) {
        errors.push(
          `[BROKEN LINK] ${repoName}: ${relativePath}:${lineNumberAt(searchable, link.index)} -> ${link.target}`,
        );
      }
    }
  }
}

function createNewDecision(slug, title) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const dateStr = `${year}${month}`;
  const hash = crypto.randomBytes(2).toString('hex');
  const filename = `${dateStr}-${hash}-${slug}.md`;
  const decisionsDir = path.join(specsDir, 'decisions');

  if (!fs.existsSync(decisionsDir)) {
    fs.mkdirSync(decisionsDir, { recursive: true });
  }

  const targetPath = path.join(decisionsDir, filename);
  const template = `---
type: decision
status: draft
title: ${title}
---

# ${title}

## Context

Describe the context and the problem we are trying to solve.

## Decision

Describe the proposed decision and how it solves the problem.

## Consequences

Describe the consequences, trade-offs, and impacts of this decision.
`;

  fs.writeFileSync(targetPath, template, 'utf8');
  console.log(`Created new decision spec: ${toPosix(path.relative(repoDir, targetPath))}`);
}

// 主執行流程
console.log('=== Starting Specs Cross-Repo Lint ===');
if (!fs.existsSync(specsDir)) {
  console.log(`No specs directory found in ${repoName}. Skipping.`);
  process.exit(0);
}

const documents = readSpecsDocuments();
totalFilesChecked += documents.length;

for (const document of documents) {
  checkNamingAndStructure(document);
  checkFrontmatterAndTaskStatus(document);
}

checkSpecsLinks(documents);
checkOrWriteIndex(documents);
checkPublishedDocumentation();

console.log(
  `\nChecked ${totalFilesChecked} specs documents and ${totalDocumentationFilesChecked} entry-point documentation files in ${repoName}.`,
);
if (writeIndexes) {
  console.log(`Regenerated ${indexesWritten} specs index(es).`);
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
  '\nAll specs base lint checks PASSED: frontmatter, naming, indexes, local links, and retired capability descriptions are consistent.',
);
