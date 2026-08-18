/**
 * Assertions expressed as plain functions that throw `AssertionError`-shaped errors.
 *
 * Framework-agnostic on purpose: the workspace uses Vitest, a clean-consumer fixture may use
 * `node:test`, and a testkit that only works under one runner is a testkit with a hidden
 * dependency. Every failure message names the actual value, because "expected true" tells a
 * plugin author nothing.
 */

import type { PluginDiagnostic, PluginInstanceStatus } from '@appspine/plugin-api';
import type { ResolutionResult } from '@appspine/plugin-api/resolver';
import type { HostCatalog } from '@appspine/plugin-api/runtime';

function fail(message: string): never {
  const error = new Error(message);
  error.name = 'AssertionError';
  throw error;
}

/** Asserts the exact status of the named instances; extra instances are ignored. */
export function expectCatalogStatus(
  catalog: HostCatalog,
  expected: Record<string, PluginInstanceStatus>,
): void {
  for (const [key, status] of Object.entries(expected)) {
    const entry = catalog.byKey[key];
    if (!entry) {
      fail(`Catalog has no entry "${key}". Present: ${Object.keys(catalog.byKey).join(', ')}`);
    }
    if (entry.status !== status) {
      fail(`Catalog entry "${key}" is "${entry.status}", expected "${status}"`);
    }
  }
}

export function expectBootOutcome(catalog: HostCatalog, expected: HostCatalog['outcome']): void {
  if (catalog.outcome !== expected) {
    fail(
      `Boot outcome is "${catalog.outcome}", expected "${expected}". Diagnostics: ${JSON.stringify(
        catalog.diagnostics,
      )}`,
    );
  }
}

/** Fails on any error-severity diagnostic; warnings and info are allowed through. */
export function expectNoErrorDiagnostics(diagnostics: readonly PluginDiagnostic[]): void {
  const errors = diagnostics.filter((entry) => entry.severity === 'error');
  if (errors.length > 0) {
    fail(`Expected no error diagnostics, got: ${JSON.stringify(errors)}`);
  }
}

export function expectDiagnostic(
  diagnostics: readonly PluginDiagnostic[],
  code: string,
): PluginDiagnostic {
  const found = diagnostics.find((entry) => entry.code === code);
  if (!found) {
    fail(`Expected a "${code}" diagnostic, got: ${JSON.stringify(diagnostics.map((d) => d.code))}`);
  }
  return found;
}

/** Asserts a resolution failed *for the stated reason*, not merely that it failed. */
export function expectResolutionError(result: ResolutionResult, code: string): PluginDiagnostic {
  if (result.ok) {
    fail(`Expected resolution to fail with "${code}", but it succeeded`);
  }
  return expectDiagnostic(result.diagnostics, code);
}

export function expectResolutionOk(result: ResolutionResult) {
  if (!result.ok) {
    fail(`Expected resolution to succeed, got: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.graph;
}

/** Asserts `before` is registered strictly before `after`. */
export function expectRegisteredBefore(
  order: readonly string[],
  before: string,
  after: string,
): void {
  const left = order.indexOf(before);
  const right = order.indexOf(after);
  if (left === -1) fail(`"${before}" is not in the registration order [${order.join(', ')}]`);
  if (right === -1) fail(`"${after}" is not in the registration order [${order.join(', ')}]`);
  if (left >= right) {
    fail(`"${before}" must be registered before "${after}"; order is [${order.join(', ')}]`);
  }
}

/** Asserts no secret value leaked into a catalog, diagnostic dump or log line. */
export function expectRedacted(value: unknown, ...secrets: string[]): void {
  const serialized = JSON.stringify(value) ?? '';
  for (const secret of secrets) {
    if (serialized.includes(secret)) {
      fail(`Secret value "${secret}" leaked into ${serialized}`);
    }
  }
}
