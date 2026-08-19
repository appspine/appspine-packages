// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  PluginCatalogTable,
  type PluginCatalogSummary,
} from './plugin-catalog-table.js';

describe('PluginCatalogTable', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    container = undefined;
    root = undefined;
  });

  function renderTable(catalog: PluginCatalogSummary) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(createElement(PluginCatalogTable, { catalog }));
    });
    return container;
  }

  it('renders healthy plugins list with status badges and metrics', () => {
    const catalog: PluginCatalogSummary = {
      outcome: 'ready',
      order: ['identity-core', 'rbac'],
      plugins: [
        {
          key: 'identity-core',
          pluginId: 'identity-core',
          instanceId: 'default',
          package: '@appspine/identity-core@1.0.0',
          digest: 'sha256:abc1234',
          status: 'ready',
          required: true,
          provides: ['appspine.identity-store'],
          requires: ['appspine.prisma', 'appspine.principal-context'],
          unresolvedOptional: [],
          startupMs: 12,
        },
        {
          key: 'rbac',
          pluginId: 'rbac',
          instanceId: 'default',
          package: '@appspine/rbac@4.0.8',
          digest: 'sha256:def5678',
          status: 'ready',
          required: true,
          provides: ['appspine.rbac-policy'],
          requires: ['appspine.identity-store', 'appspine.prisma'],
          unresolvedOptional: [],
          startupMs: 18,
        },
      ],
    };

    const dom = renderTable(catalog);
    expect(dom.textContent).toContain('Plugin Catalog & Health');
    expect(dom.textContent).toContain('System Ready');
    expect(dom.textContent).toContain('identity-core');
    expect(dom.textContent).toContain('@appspine/identity-core@1.0.0');
    expect(dom.textContent).toContain('appspine.identity-store');
    expect(dom.textContent).toContain('rbac');
    expect(dom.textContent).toContain('appspine.rbac-policy');
  });

  it('renders degraded state and error information for failed plugins', () => {
    const catalog: PluginCatalogSummary = {
      outcome: 'degraded-ready',
      order: ['identity-core', 'custom-audit'],
      plugins: [
        {
          key: 'identity-core',
          pluginId: 'identity-core',
          instanceId: 'default',
          package: '@appspine/identity-core@1.0.0',
          digest: 'sha256:abc1234',
          status: 'ready',
          required: true,
          provides: ['appspine.identity-store'],
          requires: ['appspine.prisma'],
          unresolvedOptional: ['appspine.audit-sink'],
          startupMs: 10,
        },
        {
          key: 'custom-audit',
          pluginId: 'custom-audit',
          instanceId: 'default',
          package: '@app/custom-audit@0.1.0',
          digest: 'sha256:err9999',
          status: 'degraded',
          required: false,
          provides: ['appspine.audit-sink'],
          requires: ['appspine.prisma'],
          unresolvedOptional: [],
          startupMs: 45,
          error: { stage: 'configure', message: 'Audit sink unreachable' },
        },
      ],
    };

    const dom = renderTable(catalog);
    expect(dom.textContent).toContain('System Degraded');
    expect(dom.textContent).toContain('Degraded');
    expect(dom.textContent).toContain('custom-audit');
  });
});
