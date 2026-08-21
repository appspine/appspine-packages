/**
 * Change plans and their diffs (PL2-02).
 *
 * Every mutating command computes a plan first and applies it second, and `--dry-run` simply stops
 * between the two. That ordering is what makes "what would this do" and "what did this do" the
 * same code path rather than two descriptions that can disagree.
 *
 * The diff is line-based over the canonical serialisation, not a structural summary. An operator
 * reviewing `plugin add` in a pull request will see this exact text as the file diff, so showing
 * them anything else at the terminal would be showing them a different thing.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PluginDiagnostic } from '@appspine/plugin-api';
import { type InventoryFile, serializeInventory } from './inventory-file';

export interface FileChange {
  /** App-root-relative path, always with forward slashes so plans are comparable across platforms. */
  file: string;
  before: string | null;
  after: string;
}

export interface ChangePlan {
  /** What the command intends to do, for the JSON envelope. */
  summary: string;
  changes: FileChange[];
  diagnostics: PluginDiagnostic[];
}

export function inventoryChange(
  appRoot: string,
  before: InventoryFile | null,
  after: InventoryFile,
): FileChange {
  const file = 'appspine.plugins.json';
  const absolute = path.join(appRoot, file);
  let current: string | null = null;
  try {
    current = readFileSync(absolute, 'utf8');
  } catch {
    current = before ? serializeInventory(before) : null;
  }
  return { file, before: current, after: serializeInventory(after) };
}

/**
 * A dependency entry in the App's `package.json`.
 *
 * The CLI edits this file because installing a plugin *is* depending on its package (051 plan §7
 * step 3). It writes JSON and stops there — it never runs the package manager. Installing is an
 * external action with side effects outside this repository, and a tool that silently reaches the
 * network during a `--dry-run`-shaped command is a tool nobody can trust in CI.
 */
export function packageJsonChange(
  appRoot: string,
  packageName: string,
  range: string,
): FileChange | null {
  const file = 'package.json';
  const absolute = path.join(appRoot, file);
  const before = readFileSync(absolute, 'utf8');
  const parsed = JSON.parse(before) as {
    dependencies?: Record<string, string>;
    [key: string]: unknown;
  };

  if (parsed.dependencies?.[packageName] !== undefined) return null;

  const dependencies = { ...(parsed.dependencies ?? {}), [packageName]: range };
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(dependencies).sort()) sorted[key] = dependencies[key];

  // Two-space JSON with a trailing newline: what npm, pnpm and every formatter in this repo
  // already produce, so adding one dependency shows as one added line.
  const after = `${JSON.stringify({ ...parsed, dependencies: sorted }, null, 2)}\n`;
  return { file, before, after };
}

export function applyPlan(appRoot: string, plan: ChangePlan): string[] {
  const written: string[] = [];
  for (const change of plan.changes) {
    if (change.before === change.after) continue;
    writeFileSync(path.join(appRoot, change.file), change.after, 'utf8');
    written.push(change.file);
  }
  return written;
}

/**
 * Unified-style diff, computed with a plain longest-common-subsequence walk.
 *
 * These files are tens of lines, so an O(n·m) table costs nothing and avoids a dependency whose
 * only job would be to print text. Context is fixed at three lines, as `git diff` uses.
 */
export function renderDiff(change: FileChange, context = 3): string {
  const before = change.before === null ? [] : change.before.split('\n');
  const after = change.after.split('\n');
  const ops = diffLines(before, after);

  const interesting = ops
    .map((op, index) => (op.kind === 'same' ? -1 : index))
    .filter((index) => index !== -1);
  if (interesting.length === 0) return '';

  const keep = new Set<number>();
  for (const index of interesting) {
    for (let offset = -context; offset <= context; offset += 1) {
      const at = index + offset;
      if (at >= 0 && at < ops.length) keep.add(at);
    }
  }

  const lines: string[] = [`--- a/${change.file}`, `+++ b/${change.file}`];
  let previous = -1;
  for (let index = 0; index < ops.length; index += 1) {
    if (!keep.has(index)) continue;
    if (previous !== -1 && index > previous + 1) lines.push('@@');
    const op = ops[index];
    lines.push(`${op.kind === 'same' ? ' ' : op.kind === 'add' ? '+' : '-'}${op.line}`);
    previous = index;
  }
  return lines.join('\n');
}

type DiffOp = { kind: 'same' | 'add' | 'remove'; line: string };

function diffLines(before: readonly string[], after: readonly string[]): DiffOp[] {
  const rows = before.length;
  const columns = after.length;
  const lcs: number[][] = Array.from({ length: rows + 1 }, () => new Array(columns + 1).fill(0));

  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      lcs[row][column] =
        before[row] === after[column]
          ? lcs[row + 1][column + 1] + 1
          : Math.max(lcs[row + 1][column], lcs[row][column + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let row = 0;
  let column = 0;
  while (row < rows && column < columns) {
    if (before[row] === after[column]) {
      ops.push({ kind: 'same', line: before[row] });
      row += 1;
      column += 1;
    } else if (lcs[row + 1][column] >= lcs[row][column + 1]) {
      ops.push({ kind: 'remove', line: before[row] });
      row += 1;
    } else {
      ops.push({ kind: 'add', line: after[column] });
      column += 1;
    }
  }
  while (row < rows) {
    ops.push({ kind: 'remove', line: before[row] });
    row += 1;
  }
  while (column < columns) {
    ops.push({ kind: 'add', line: after[column] });
    column += 1;
  }
  return ops;
}

export function renderPlan(plan: ChangePlan): string {
  const sections = plan.changes
    .filter((change) => change.before !== change.after)
    .map((change) => renderDiff(change))
    .filter(Boolean);
  return sections.length > 0 ? sections.join('\n') : 'no changes';
}
