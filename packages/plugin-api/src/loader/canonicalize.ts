/**
 * Canonical JSON for digesting.
 *
 * Two manifests that differ only in key order or whitespace must produce the same digest —
 * otherwise a formatter run would look like a contract change in the plugin lockfile. Object keys
 * are sorted; array order is preserved because it is semantic (`replaces`, `permissions`).
 *
 * This is a deliberately small subset of RFC 8785: JSON that came from `JSON.parse` cannot contain
 * `undefined`, functions or symbols, and the manifest schema forbids non-integer numbers anywhere
 * it matters — so the exotic parts of the spec have nothing to act on here. Anything that would
 * serialize ambiguously is rejected instead of silently normalized.
 */

import { PluginContractError } from '../errors';

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

function assertCanonicalizable(value: unknown, path: string): asserts value is CanonicalJsonValue {
  if (value === null) return;
  const type = typeof value;
  if (type === 'boolean' || type === 'string') return;
  if (type === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new PluginContractError(
        'non-canonical-json',
        `Cannot canonicalize a non-finite number at "${path}"`,
      );
    }
    return;
  }
  if (type === 'object') return;
  throw new PluginContractError(
    'non-canonical-json',
    `Cannot canonicalize a value of type "${type}" at "${path}"`,
  );
}

function canonicalizeValue(value: unknown, path: string): CanonicalJsonValue {
  assertCanonicalizable(value, path);

  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalizeValue(item, `${path}[${index}]`));
  }

  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, CanonicalJsonValue> = {};
    for (const key of Object.keys(source).sort()) {
      const child = source[key];
      // JSON.parse never yields undefined, but a hand-built object can; dropping it silently
      // would make two different objects digest identically.
      if (child === undefined) {
        throw new PluginContractError(
          'non-canonical-json',
          `Cannot canonicalize undefined at "${path ? `${path}.` : ''}${key}"`,
        );
      }
      out[key] = canonicalizeValue(child, path ? `${path}.${key}` : key);
    }
    return out;
  }

  return value as CanonicalJsonValue;
}

/** Key-sorted deep copy. */
export function canonicalize(value: unknown): CanonicalJsonValue {
  return canonicalizeValue(value, '');
}

/** Key-sorted, whitespace-free serialization — the exact bytes that get hashed. */
export function canonicalJsonString(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
