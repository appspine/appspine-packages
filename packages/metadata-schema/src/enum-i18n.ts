import type { SchemaMeta } from './meta.service';

export interface EnumTranslationGap {
  locale: string;
  key: string;
  kind: 'missing' | 'orphaned';
}

export function collectEnumTranslationGaps(
  meta: Pick<SchemaMeta, 'enums'>,
  dictionaries: Record<string, Record<string, unknown>>,
): EnumTranslationGap[] {
  const expectedKeys = new Set(
    meta.enums.flatMap((enumMeta) =>
      enumMeta.values.map((value) => `${enumMeta.name}.${value.name}`),
    ),
  );

  return Object.entries(dictionaries).flatMap(([locale, dictionary]) => {
    const actualKeys = new Set(
      Object.keys(dictionary).filter((key) => typeof dictionary[key] === 'string'),
    );
    const missing = [...expectedKeys]
      .filter((key) => !actualKeys.has(key))
      .map<EnumTranslationGap>((key) => ({ locale, key, kind: 'missing' }));
    const orphaned = [...actualKeys]
      .filter((key) => !expectedKeys.has(key))
      .map<EnumTranslationGap>((key) => ({ locale, key, kind: 'orphaned' }));

    return [...missing, ...orphaned];
  });
}
