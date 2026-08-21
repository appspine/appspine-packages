// tsc's CommonJS emit always prepends `"use strict";` before any existing
// directive prologue entries. For files starting with `'use client';`, this
// pushes it to the second line, and Next.js's client-component detection
// only recognizes the directive when it is the file's first line. Swapping
// the two lines is safe: per the ECMAScript directive-prologue rules, order
// among leading string-literal statements doesn't affect strict-mode
// activation, so "use strict" still applies either way.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const target = join(import.meta.dirname, '..', 'dist', 'frontend');

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
    } else if (entry.endsWith('.js')) {
      fixFile(path);
    }
  }
}

function fixFile(path) {
  const original = readFileSync(path, 'utf8');
  const fixed = original.replace(/^"use strict";\r?\n'use client';\r?\n/, "'use client';\n\"use strict\";\n");
  if (fixed !== original) {
    writeFileSync(path, fixed);
    console.log(`fixed 'use client' directive order: ${path}`);
  }
}

walk(target);
