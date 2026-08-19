/**
 * `.appspine/generated/frontend/*` generators (PL3-02).
 *
 * Emits static build-time artifacts for Next.js frontend integration:
 *   - navigation.ts: Aggregated and topologically ordered navigation items.
 *   - admin-routes.ts: Static admin routes with owner package imports.
 *   - slots.tsx: Slot contributions with dependency ordering and static component imports.
 *   - i18n.ts: Registered i18n namespaces and collisions validation.
 *
 * Deterministic, statically imported, and drift-checked via sourceDigest (051 plan §5.2).
 */

import type {
  FrontendFacetContribution,
  PluginAdminPageContribution,
  PluginNavigationContribution,
  PluginSlotContribution,
} from '@appspine/plugin-api';
import type { GeneratedArtifact, GenerationInput } from './generate';
import { GENERATED_DIR, sourceDigest } from './generate';

export const FRONTEND_DIR = `${GENERATED_DIR}/frontend`;
export const FRONTEND_NAVIGATION_ARTIFACT = `${FRONTEND_DIR}/navigation.ts`;
export const FRONTEND_ADMIN_ROUTES_ARTIFACT = `${FRONTEND_DIR}/admin-routes.ts`;
export const FRONTEND_SLOTS_ARTIFACT = `${FRONTEND_DIR}/slots.tsx`;
export const FRONTEND_I18N_ARTIFACT = `${FRONTEND_DIR}/i18n.ts`;

export interface SortableItem {
  id: string;
  order?: number;
  before?: string;
  after?: string;
}

/**
 * Topologically sorts items respecting `before` and `after` constraints, with secondary
 * sorting by `order` (ascending) and `id` (alphabetical). Throws on cyclic dependencies.
 */
export function sortWithDependencies<T extends SortableItem>(items: readonly T[]): T[] {
  if (items.length <= 1) return [...items];

  const itemMap = new Map<string, T>();
  for (const item of items) {
    itemMap.set(item.id, item);
  }

  // Directed edges: u must come before v -> graph: u -> [v]
  const adj = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  for (const item of items) {
    adj.set(item.id, new Set());
    inDegree.set(item.id, 0);
  }

  for (const item of items) {
    if (item.before && itemMap.has(item.before)) {
      // item must come before item.before: item -> item.before
      const targets = adj.get(item.id);
      if (targets && !targets.has(item.before)) {
        targets.add(item.before);
      }
    }
    if (item.after && itemMap.has(item.after)) {
      // item.after must come before item: item.after -> item
      const targets = adj.get(item.after);
      if (targets && !targets.has(item.id)) {
        targets.add(item.id);
      }
    }
  }

  // Compute in-degrees
  for (const targets of adj.values()) {
    for (const v of targets) {
      inDegree.set(v, (inDegree.get(v) ?? 0) + 1);
    }
  }

  // Kahn's algorithm with priority queue for deterministic ordering
  const ready: T[] = [];
  for (const item of items) {
    if (inDegree.get(item.id) === 0) {
      ready.push(item);
    }
  }

  const sortReady = (list: T[]) =>
    list.sort((a, b) => {
      const orderA = a.order ?? 0;
      const orderB = b.order ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.id.localeCompare(b.id);
    });

  sortReady(ready);

  const result: T[] = [];
  while (ready.length > 0) {
    const current = ready.shift();
    if (!current) break;
    result.push(current);

    const neighbors = adj.get(current.id) ?? new Set();
    for (const nextId of neighbors) {
      const nextDegree = (inDegree.get(nextId) ?? 1) - 1;
      inDegree.set(nextId, nextDegree);
      if (nextDegree === 0) {
        const nextItem = itemMap.get(nextId);
        if (nextItem) {
          ready.push(nextItem);
        }
      }
    }
    sortReady(ready);
  }

  if (result.length !== items.length) {
    throw new Error(
      `Cyclic dependency detected in ordering items: ${items.map((i) => i.id).join(', ')}`,
    );
  }

  return result;
}

interface ActiveFrontendPlugin {
  key: string;
  pluginId: string;
  packageName: string;
  packageVersion: string;
  facet: FrontendFacetContribution;
}

function getActiveFrontendPlugins(input: GenerationInput): ActiveFrontendPlugin[] {
  const { graph, manifests } = input;
  const result: ActiveFrontendPlugin[] = [];

  for (const key of graph.order) {
    const instance = graph.instances.find((candidate) => candidate.key === key);
    if (!instance) continue;
    const loaded = manifests.byRef.get(instance.packageName);
    if (!loaded?.manifest.facets.frontend) continue;

    result.push({
      key: instance.key,
      pluginId: instance.pluginId,
      packageName: instance.packageName,
      packageVersion: instance.packageVersion,
      facet: loaded.manifest.facets.frontend,
    });
  }

  return result;
}

export function generateFrontendNavigation(input: GenerationInput): GeneratedArtifact {
  const plugins = getActiveFrontendPlugins(input);
  const rawItems: (PluginNavigationContribution & { pluginId: string })[] = [];

  for (const plugin of plugins) {
    const items = plugin.facet.navigationItems ?? [];
    for (const item of items) {
      if (typeof item === 'string') {
        rawItems.push({
          id: item,
          title: item,
          href: `/dashboard/${item}`,
          order: 0,
          pluginId: plugin.pluginId,
        });
      } else {
        rawItems.push({
          ...item,
          title: item.title ?? item.id,
          href: item.href ?? `/dashboard/${item.id}`,
          order: item.order ?? 0,
          pluginId: plugin.pluginId,
        });
      }
    }
  }

  const sorted = sortWithDependencies(rawItems);

  const lines: string[] = [];
  lines.push('// GENERATED BY @appspine/plugin-cli — DO NOT EDIT.');
  lines.push('//');
  lines.push('// Run `appspine build` to regenerate, and `appspine build --check` to verify.');
  lines.push(`// sourceDigest: ${sourceDigest(input)}`);
  lines.push(`// resolutionDigest: ${input.graph.digest}`);
  lines.push('');
  lines.push('export interface GeneratedNavigationItem {');
  lines.push('  id: string;');
  lines.push('  title: string;');
  lines.push('  href: string;');
  lines.push('  icon?: string;');
  lines.push('  order: number;');
  lines.push('  section?: string;');
  lines.push('  requiredPermission?: string;');
  lines.push('  pluginId: string;');
  lines.push('}');
  lines.push('');
  lines.push('export const navigationItems: readonly GeneratedNavigationItem[] = Object.freeze([');
  for (const item of sorted) {
    const fields: string[] = [
      `id: ${JSON.stringify(item.id)}`,
      `title: ${JSON.stringify(item.title)}`,
      `href: ${JSON.stringify(item.href)}`,
      ...(item.icon ? [`icon: ${JSON.stringify(item.icon)}`] : []),
      `order: ${item.order ?? 0}`,
      ...(item.section ? [`section: ${JSON.stringify(item.section)}`] : []),
      ...(item.requiredPermission
        ? [`requiredPermission: ${JSON.stringify(item.requiredPermission)}`]
        : []),
      `pluginId: ${JSON.stringify(item.pluginId)}`,
    ];
    lines.push(`  { ${fields.join(', ')} },`);
  }
  lines.push(']);');
  lines.push('');

  return {
    path: FRONTEND_NAVIGATION_ARTIFACT,
    contents: lines.join('\n'),
  };
}

export function generateFrontendAdminRoutes(input: GenerationInput): GeneratedArtifact {
  const plugins = getActiveFrontendPlugins(input);
  const routes: (PluginAdminPageContribution & { pluginId: string; packageName: string })[] = [];
  const seenRoutePaths = new Map<string, string>();
  const seenIds = new Map<string, string>();

  for (const plugin of plugins) {
    const pages = plugin.facet.adminPages ?? [];
    for (const page of pages) {
      const parsed: PluginAdminPageContribution =
        typeof page === 'string'
          ? {
              id: page,
              routePath: `/dashboard/${page}`,
              title: page,
              componentExport: `${page.replace(/[-_.]+(.)/g, (_m, c: string) => c.toUpperCase())}AdminPage`,
              order: 0,
            }
          : {
              ...page,
              routePath: page.routePath ?? `/dashboard/${page.id}`,
              title: page.title ?? page.id,
              componentExport:
                page.componentExport ??
                `${page.id.replace(/[-_.]+(.)/g, (_m, c: string) => c.toUpperCase())}AdminPage`,
              order: page.order ?? 0,
            };

      const routePath = parsed.routePath ?? `/dashboard/${parsed.id}`;
      if (seenRoutePaths.has(routePath)) {
        throw new Error(
          `Duplicate admin route path "${routePath}" declared by plugins "${seenRoutePaths.get(routePath)}" and "${plugin.pluginId}"`,
        );
      }
      seenRoutePaths.set(routePath, plugin.pluginId);

      if (seenIds.has(parsed.id)) {
        throw new Error(
          `Duplicate admin page ID "${parsed.id}" declared by plugins "${seenIds.get(parsed.id)}" and "${plugin.pluginId}"`,
        );
      }
      seenIds.set(parsed.id, plugin.pluginId);

      routes.push({
        ...parsed,
        pluginId: plugin.pluginId,
        packageName: plugin.packageName,
      });
    }
  }

  // Sort routes deterministically by order, then routePath
  routes.sort((a, b) => {
    const orderA = a.order ?? 0;
    const orderB = b.order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return (a.routePath ?? '').localeCompare(b.routePath ?? '');
  });

  const lines: string[] = [];
  lines.push('// GENERATED BY @appspine/plugin-cli — DO NOT EDIT.');
  lines.push('//');
  lines.push('// Run `appspine build` to regenerate, and `appspine build --check` to verify.');
  lines.push(`// sourceDigest: ${sourceDigest(input)}`);
  lines.push(`// resolutionDigest: ${input.graph.digest}`);
  lines.push('');
  lines.push('export interface GeneratedAdminRoute {');
  lines.push('  id: string;');
  lines.push('  routePath: string;');
  lines.push('  title: string;');
  lines.push('  componentExport: string;');
  lines.push('  packageName: string;');
  lines.push('  requiredPermission?: string;');
  lines.push('  breadcrumb?: string;');
  lines.push('  order: number;');
  lines.push('  pluginId: string;');
  lines.push('}');
  lines.push('');
  lines.push('export const adminRoutes: readonly GeneratedAdminRoute[] = Object.freeze([');
  for (const route of routes) {
    const fields: string[] = [
      `id: ${JSON.stringify(route.id)}`,
      `routePath: ${JSON.stringify(route.routePath)}`,
      `title: ${JSON.stringify(route.title)}`,
      `componentExport: ${JSON.stringify(route.componentExport)}`,
      `packageName: ${JSON.stringify(route.packageName)}`,
      ...(route.requiredPermission
        ? [`requiredPermission: ${JSON.stringify(route.requiredPermission)}`]
        : []),
      ...(route.breadcrumb ? [`breadcrumb: ${JSON.stringify(route.breadcrumb)}`] : []),
      `order: ${route.order ?? 0}`,
      `pluginId: ${JSON.stringify(route.pluginId)}`,
    ];
    lines.push(`  { ${fields.join(', ')} },`);
  }
  lines.push(']);');
  lines.push('');

  return {
    path: FRONTEND_ADMIN_ROUTES_ARTIFACT,
    contents: lines.join('\n'),
  };
}

export function generateFrontendSlots(input: GenerationInput): GeneratedArtifact {
  const plugins = getActiveFrontendPlugins(input);
  const slotGroups = new Map<
    string,
    (PluginSlotContribution & { id: string; pluginId: string; packageName: string })[]
  >();

  for (const plugin of plugins) {
    const slots = plugin.facet.slots ?? [];
    for (let i = 0; i < slots.length; i++) {
      const slotContrib = slots[i];
      const slotName = slotContrib.slot;
      let list = slotGroups.get(slotName);
      if (!list) {
        list = [];
        slotGroups.set(slotName, list);
      }
      list.push({
        ...slotContrib,
        id: `${plugin.pluginId}.${slotContrib.componentExport}`,
        pluginId: plugin.pluginId,
        packageName: plugin.packageName,
      });
    }
  }

  // Sort within each slot group
  const sortedSlotGroups = new Map<
    string,
    (PluginSlotContribution & { id: string; pluginId: string; packageName: string })[]
  >();
  for (const [slotName, list] of [...slotGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    sortedSlotGroups.set(slotName, sortWithDependencies(list));
  }

  const lines: string[] = [];
  lines.push('// GENERATED BY @appspine/plugin-cli — DO NOT EDIT.');
  lines.push('//');
  lines.push('// Run `appspine build` to regenerate, and `appspine build --check` to verify.');
  lines.push(`// sourceDigest: ${sourceDigest(input)}`);
  lines.push(`// resolutionDigest: ${input.graph.digest}`);
  lines.push('');
  lines.push('export interface GeneratedSlotContribution {');
  lines.push('  slot: string;');
  lines.push('  componentExport: string;');
  lines.push('  packageName: string;');
  lines.push('  order: number;');
  lines.push('  requiredPermission?: string;');
  lines.push('  pluginId: string;');
  lines.push('}');
  lines.push('');
  lines.push(
    'export const slotRegistry: Readonly<Record<string, readonly GeneratedSlotContribution[]>> = Object.freeze({',
  );
  for (const [slotName, contributions] of sortedSlotGroups.entries()) {
    lines.push(`  ${JSON.stringify(slotName)}: Object.freeze([`);
    for (const item of contributions) {
      const fields: string[] = [
        `slot: ${JSON.stringify(item.slot)}`,
        `componentExport: ${JSON.stringify(item.componentExport)}`,
        `packageName: ${JSON.stringify(item.packageName)}`,
        `order: ${item.order ?? 0}`,
        ...(item.requiredPermission
          ? [`requiredPermission: ${JSON.stringify(item.requiredPermission)}`]
          : []),
        `pluginId: ${JSON.stringify(item.pluginId)}`,
      ];
      lines.push(`    { ${fields.join(', ')} },`);
    }
    lines.push('  ]),');
  }
  lines.push('});');
  lines.push('');

  return {
    path: FRONTEND_SLOTS_ARTIFACT,
    contents: lines.join('\n'),
  };
}

export function generateFrontendI18n(input: GenerationInput): GeneratedArtifact {
  const plugins = getActiveFrontendPlugins(input);
  const namespaces: { namespace: string; pluginId: string; locales?: string[] }[] = [];
  const seenNamespaces = new Map<string, string>();

  for (const plugin of plugins) {
    const ns = plugin.facet.i18nNamespace ?? plugin.facet.i18n?.namespace;
    if (!ns) continue;

    if (seenNamespaces.has(ns)) {
      throw new Error(
        `Duplicate i18n namespace "${ns}" declared by plugins "${seenNamespaces.get(ns)}" and "${plugin.pluginId}"`,
      );
    }
    seenNamespaces.set(ns, plugin.pluginId);

    namespaces.push({
      namespace: ns,
      pluginId: plugin.pluginId,
      locales: plugin.facet.i18n?.locales,
    });
  }

  namespaces.sort((a, b) => a.namespace.localeCompare(b.namespace));

  const lines: string[] = [];
  lines.push('// GENERATED BY @appspine/plugin-cli — DO NOT EDIT.');
  lines.push('//');
  lines.push('// Run `appspine build` to regenerate, and `appspine build --check` to verify.');
  lines.push(`// sourceDigest: ${sourceDigest(input)}`);
  lines.push(`// resolutionDigest: ${input.graph.digest}`);
  lines.push('');
  lines.push('export interface GeneratedI18nNamespace {');
  lines.push('  namespace: string;');
  lines.push('  pluginId: string;');
  lines.push('  locales?: readonly string[];');
  lines.push('}');
  lines.push('');
  lines.push('export const i18nNamespaces: readonly GeneratedI18nNamespace[] = Object.freeze([');
  for (const item of namespaces) {
    const fields: string[] = [
      `namespace: ${JSON.stringify(item.namespace)}`,
      `pluginId: ${JSON.stringify(item.pluginId)}`,
      ...(item.locales ? [`locales: Object.freeze(${JSON.stringify(item.locales)})`] : []),
    ];
    lines.push(`  { ${fields.join(', ')} },`);
  }
  lines.push(']);');
  lines.push('');

  return {
    path: FRONTEND_I18N_ARTIFACT,
    contents: lines.join('\n'),
  };
}
