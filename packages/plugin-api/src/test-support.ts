/**
 * Shared spec helpers. Not exported from the package: `tsconfig.build.json` excludes `*.spec.ts`
 * but not this file, so it is deliberately kept out of `index.ts` and referenced only by specs.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The PL0-05 fixture corpus lives at the workspace root, not inside this package: it is a *frozen
 * contract* shared by the Phase 0 checker and this loader, and copying it here would let the two
 * drift. Vitest runs with the package directory as cwd.
 */
export const FIXTURES_ROOT = path.resolve(process.cwd(), '../../fixtures/051-manifest-v1');

export const KNOWLEDGE_SCHEMA_PATH = path.resolve(
  process.cwd(),
  '../../knowledge/contracts/051-manifest-v1.schema.json',
);

export interface FixtureIndex {
  positive: { file: string; covers: string[] }[];
  negative: { file: string; expectedFailure: string; field?: string }[];
  lifecycle: { file: string; covers: string[] }[];
}

export function readFixtureIndex(): FixtureIndex {
  return JSON.parse(readFileSync(path.join(FIXTURES_ROOT, 'index.json'), 'utf8')) as FixtureIndex;
}

export function readFixture(file: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES_ROOT, file), 'utf8'));
}

export function listFixtureFiles(kind: 'positive' | 'negative' | 'lifecycle'): string[] {
  return readdirSync(path.join(FIXTURES_ROOT, kind))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => `${kind}/${name}`);
}

export function readJsonFile(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}
