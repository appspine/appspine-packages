import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * JSON Schema is the only source of truth for these types (024 task-breakdown
 * T-10010) — src/generated/types.ts must never be hand-edited out of step
 * with src/schemas/*.schema.json. This re-runs the generator (which writes
 * back to the same committed path) and diffs the result byte-for-byte
 * against what was on disk beforehand; any drift — a hand-edit, or a schema
 * change without re-running `generate` — fails the test instead of silently
 * diverging. A failing run also leaves the regenerated file in place, so
 * re-running `git diff` shows exactly what needs to be committed.
 */
describe('generated types stay in sync with JSON Schema', () => {
  it('regenerating src/generated/types.ts produces byte-identical output', () => {
    const packageRoot = path.join(__dirname, '..');
    const generatedPath = path.join(packageRoot, 'src', 'generated', 'types.ts');
    const beforeRegeneration = readFileSync(generatedPath, 'utf8');

    execFileSync(process.execPath, [path.join(packageRoot, 'scripts', 'generate-types.mjs')], {
      cwd: packageRoot,
    });

    const afterRegeneration = readFileSync(generatedPath, 'utf8');
    expect(afterRegeneration).toBe(beforeRegeneration);
  });
});
