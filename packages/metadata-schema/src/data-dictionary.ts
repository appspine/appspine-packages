import type { SchemaMeta } from './meta.service';

/** Normalise multi-line /// comments into a single clean string. */
function doc(s: string | undefined): string {
  return (s ?? '').replace(/\\n/g, ' ').replace(/\n/g, ' ').trim();
}

/**
 * Renders a SchemaMeta (from MetaService.buildMeta()) into the docs/data-dictionary.md
 * markdown format. Shared by both the build-time script and (indirectly, via the same
 * SchemaMeta shape) the GET /metadata/schema runtime endpoint — see dev_docs 001
 * "Metadata Schema API".
 */
export function renderDataDictionary(meta: SchemaMeta): string {
  const lines: string[] = [];
  const push = (...args: string[]) => lines.push(...args);

  push(
    '# Data Dictionary',
    '',
    `> Auto-generated from Prisma schema on ${meta.generatedAt.slice(0, 10)}.`,
    "> Do not edit manually — run your app's schema:docs script to regenerate.",
    '',
    '---',
    '',
  );

  push('## Enums', '');
  for (const e of meta.enums) {
    push(`### ${e.name}`, '');
    if (e.documentation) push(`> ${doc(e.documentation)}`, '');
    push('| Value | Description |', '|-------|-------------|');
    for (const v of e.values) {
      push(`| \`${v.name}\` | ${doc(v.documentation)} |`);
    }
    push('');
  }

  push('## Models', '');
  for (const m of meta.models) {
    push(`### ${m.name}`, '');
    if (m.documentation) push(`> ${doc(m.documentation)}`, '');
    push(
      `**DB table:** \`${m.dbTable}\``,
      '',
      '| Field | Type | Required | Unique | Description |',
      '|-------|------|----------|--------|-------------|',
    );

    for (const f of m.fields) {
      const required = f.isRequired ? '✓' : '';
      const unique = f.isUnique || f.isId ? '✓' : '';
      const type = f.isList ? `${f.type}[]` : f.type;
      push(`| \`${f.name}\` | ${type} | ${required} | ${unique} | ${doc(f.documentation)} |`);
    }
    push('');
  }

  return lines.join('\n');
}
