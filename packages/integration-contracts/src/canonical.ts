import { createHash } from 'node:crypto';

import type { JsonValue } from './types';

export function canonicalJson(value: unknown): string {
  return canonicalize(value, '$');
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256Digest(value: unknown): string {
  return `sha256:${sha256Hex(canonicalJson(value))}`;
}

export function canonicalJsonValue(value: unknown): JsonValue {
  return JSON.parse(canonicalJson(value)) as JsonValue;
}

function canonicalize(value: unknown, path: string): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Non-finite number at ${path}`);
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value === 'bigint') throw new TypeError(`BigInt is not JSON data at ${path}`);
  if (typeof value === 'undefined') throw new TypeError(`Undefined is not JSON data at ${path}`);
  if (typeof value !== 'object') throw new TypeError(`Unsupported JSON value at ${path}`);

  if (Array.isArray(value)) {
    return `[${value.map((item, index) => canonicalize(item, `${path}[${index}]`)).join(',')}]`;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`Non-plain object is not JSON data at ${path}`);

  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item, `${path}.${key}`)}`)
    .join(',')}}`;
}
