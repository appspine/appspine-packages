#!/usr/bin/env node
// Copies the JSON Schema source files into dist/ so consumers that only
// need language-neutral schemas (e.g. a non-TS n8n tool) can read them
// without pulling in the TypeScript build.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '..', 'src', 'schemas');
const outDir = path.join(here, '..', 'dist', 'schemas');

mkdirSync(outDir, { recursive: true });
for (const file of readdirSync(srcDir)) {
  if (file.endsWith('.schema.json')) {
    copyFileSync(path.join(srcDir, file), path.join(outDir, file));
  }
}
console.log(`copied schemas to ${path.relative(process.cwd(), outDir)}`);
