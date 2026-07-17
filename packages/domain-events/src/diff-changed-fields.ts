type ComparableRecord = Record<string, unknown> | null | undefined;

export function diffChangedFields(before: ComparableRecord, after: ComparableRecord): string[] {
  const beforeRecord = before ?? {};
  const afterRecord = after ?? {};
  const keys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);

  return [...keys].filter((key) => !valuesEqual(beforeRecord[key], afterRecord[key])).sort();
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return normalizeValue(left) === normalizeValue(right);
}

function normalizeValue(value: unknown): string {
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJson(nestedValue)]),
    );
  }

  return value;
}
