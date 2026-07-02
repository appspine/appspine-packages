import { describe, expect, it } from 'vitest';

import { collectEnumTranslationGaps } from './enum-i18n';

describe('collectEnumTranslationGaps', () => {
  it('reports missing and orphaned enum translation keys per locale', () => {
    const gaps = collectEnumTranslationGaps(
      {
        enums: [
          {
            name: 'PermissionPolicy',
            values: [{ name: 'DENY_ALL' }, { name: 'ALLOW_ALL' }],
          },
          {
            name: 'AuditAction',
            values: [{ name: 'CREATE' }],
          },
        ],
      },
      {
        en: {
          'PermissionPolicy.DENY_ALL': 'Deny all',
          'PermissionPolicy.LEGACY': 'Legacy',
        },
        'zh-TW': {
          'PermissionPolicy.DENY_ALL': '全部拒絕',
          'PermissionPolicy.ALLOW_ALL': '全部允許',
          'AuditAction.CREATE': '建立',
        },
      },
    );

    expect(gaps).toEqual([
      { locale: 'en', key: 'PermissionPolicy.ALLOW_ALL', kind: 'missing' },
      { locale: 'en', key: 'AuditAction.CREATE', kind: 'missing' },
      { locale: 'en', key: 'PermissionPolicy.LEGACY', kind: 'orphaned' },
    ]);
  });
});
