import type { JsonSchema } from './types';

export type CompatibilityProfile = 'strict' | 'tolerant-reader' | 'provider-compatible';

export type CompatibilityFinding = {
  path: string;
  rule: string;
  breaking: boolean;
  severity: 'info' | 'warning' | 'error';
};

export function checkSchemaCompatibility(
  previous: JsonSchema,
  next: JsonSchema,
  profile: CompatibilityProfile = 'provider-compatible',
): CompatibilityFinding[] {
  const findings: CompatibilityFinding[] = [];
  compareSchema(previous, next, '$', profile, findings, new Set());
  return findings;
}

function compareSchema(
  previous: JsonSchema,
  next: JsonSchema,
  path: string,
  profile: CompatibilityProfile,
  findings: CompatibilityFinding[],
  seen: Set<string>,
): void {
  const pair = `${JSON.stringify(previous)}\n${JSON.stringify(next)}\n${path}`;
  if (seen.has(pair)) return;
  seen.add(pair);
  if (previous.type && next.type && JSON.stringify(previous.type) !== JSON.stringify(next.type)) {
    findings.push({ path, rule: 'type changed', breaking: true, severity: 'error' });
    return;
  }
  if (previous.enum && next.enum) {
    for (const value of previous.enum)
      if (!next.enum.some((candidate) => sameJson(candidate, value)))
        findings.push({ path, rule: 'enum value removed', breaking: true, severity: 'error' });
    if (next.enum.some((value) => !previous.enum?.some((candidate) => sameJson(candidate, value))))
      findings.push({ path, rule: 'enum value added', breaking: profile === 'strict', severity: profile === 'strict' ? 'error' : 'warning' });
  }
  if (previous.pattern !== next.pattern && previous.pattern !== undefined && next.pattern !== undefined)
    findings.push({ path, rule: 'pattern changed', breaking: true, severity: 'error' });
  if (previous.format !== next.format && previous.format !== undefined && next.format !== undefined)
    findings.push({ path, rule: 'format changed', breaking: true, severity: 'error' });
  compareUpperBound(previous.minLength, next.minLength, path, 'minLength increased', findings);
  compareLowerBound(previous.maxLength, next.maxLength, path, 'maxLength decreased', findings);
  compareUpperBound(previous.minimum, next.minimum, path, 'minimum increased', findings);
  compareLowerBound(previous.maximum, next.maximum, path, 'maximum decreased', findings);
  compareUpperBound(previous.minItems, next.minItems, path, 'minItems increased', findings);
  compareLowerBound(previous.maxItems, next.maxItems, path, 'maxItems decreased', findings);
  if (previous.uniqueItems === false && next.uniqueItems === true)
    findings.push({ path, rule: 'uniqueItems became stricter', breaking: true, severity: 'error' });

  const previousProperties = previous.properties ?? {};
  const nextProperties = next.properties ?? {};
  const previousRequired = new Set(previous.required ?? []);
  const nextRequired = new Set(next.required ?? []);
  for (const key of Object.keys(previousProperties)) {
    if (!(key in nextProperties)) {
      const breaking = profile !== 'tolerant-reader' || previousRequired.has(key);
      findings.push({ path: `${path}.${key}`, rule: 'property removed', breaking, severity: breaking ? 'error' : 'warning' });
      continue;
    }
    compareSchema(previousProperties[key], nextProperties[key], `${path}.${key}`, profile, findings, seen);
  }
  for (const key of Object.keys(nextProperties)) {
    if (key in previousProperties) continue;
    if (!nextRequired.has(key) && profile === 'tolerant-reader') continue;
    const required = nextRequired.has(key);
    const breaking = required || profile === 'strict';
    findings.push({ path: `${path}.${key}`, rule: required ? 'required property added' : 'optional property added', breaking, severity: breaking ? 'error' : 'info' });
  }
  for (const key of previousRequired)
    if (!nextRequired.has(key)) findings.push({ path: `${path}.${key}`, rule: 'requiredness relaxed', breaking: false, severity: 'info' });
  for (const key of nextRequired)
    if (!previousRequired.has(key) && key in previousProperties) findings.push({ path: `${path}.${key}`, rule: 'requiredness tightened', breaking: true, severity: 'error' });
  if (previous.additionalProperties === false && next.additionalProperties !== false)
    findings.push({ path, rule: 'additional properties relaxed', breaking: false, severity: 'info' });
  if (previous.additionalProperties !== false && next.additionalProperties === false)
    findings.push({ path, rule: 'additional properties restricted', breaking: profile !== 'tolerant-reader', severity: profile === 'tolerant-reader' ? 'warning' : 'error' });
  if (previous.items && next.items) compareSchema(previous.items, next.items, `${path}[]`, profile, findings, seen);
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    const oldChildren = previous[keyword] as JsonSchema[] | undefined;
    const newChildren = next[keyword] as JsonSchema[] | undefined;
    if (oldChildren && newChildren && oldChildren.length === newChildren.length)
      oldChildren.forEach((child, index) => compareSchema(child, newChildren[index], `${path}.${keyword}[${index}]`, profile, findings, seen));
    else if (oldChildren && newChildren && JSON.stringify(oldChildren) !== JSON.stringify(newChildren))
      findings.push({ path, rule: `${keyword} composition changed`, breaking: true, severity: 'error' });
  }
}

function compareUpperBound(previous: number | undefined, next: number | undefined, path: string, rule: string, findings: CompatibilityFinding[]): void {
  if (next !== undefined && (previous === undefined || next > previous)) findings.push({ path, rule, breaking: true, severity: 'error' });
}

function compareLowerBound(previous: number | undefined, next: number | undefined, path: string, rule: string, findings: CompatibilityFinding[]): void {
  if (next !== undefined && (previous === undefined || next < previous)) findings.push({ path, rule, breaking: true, severity: 'error' });
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left, Object.keys((left as object) ?? {}).sort()) === JSON.stringify(right, Object.keys((right as object) ?? {}).sort());
}
