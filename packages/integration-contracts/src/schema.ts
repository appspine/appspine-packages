import { canonicalJson } from './canonical';
import type { DataClassification, JsonSchema, JsonValue, SchemaValidationIssue } from './types';

export type SchemaValidationMode = 'strict' | 'tolerant-reader' | 'provider-compatible';

export type ValidateJsonSchemaOptions = {
  mode?: SchemaValidationMode;
  rootSchema?: JsonSchema;
  enforceClassification?: boolean;
};

const SUPPORTED_KEYWORDS = new Set([
  '$schema',
  '$id',
  '$ref',
  '$defs',
  '$comment',
  'title',
  'description',
  'type',
  'required',
  'properties',
  'patternProperties',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'anyOf',
  'oneOf',
  'allOf',
  'if',
  'then',
  'else',
  'pattern',
  'format',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'uniqueItems',
  'x-appspine-data-classification',
]);

const CLASSIFICATIONS = new Set<DataClassification>([
  'PUBLIC',
  'INTERNAL',
  'PERSONAL',
  'SENSITIVE',
  'SECRET',
]);

export function validateJsonSchema(
  value: unknown,
  schema: JsonSchema,
  options: ValidateJsonSchemaOptions = {},
): SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = [];
  const resolvedOptions = { ...options, rootSchema: options.rootSchema ?? schema };
  validateSchemaDefinition(schema, '$', issues, new Set(), options.enforceClassification !== false);
  validate(value, schema, '$', resolvedOptions, issues, new Set());
  return issues;
}

export function assertJsonSchema(
  value: unknown,
  schema: JsonSchema,
  options: ValidateJsonSchemaOptions = {},
): asserts value is JsonValue {
  const issues = validateJsonSchema(value, schema, options);
  if (issues.length > 0) {
    throw new Error(
      `Schema validation failed: ${issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`,
    );
  }
}

export function extractClassifiedPaths(
  schema: JsonSchema,
  classification: DataClassification,
): string[] {
  const paths: string[] = [];
  walkSchema(schema, '$', classification, paths, new Set());
  return paths;
}

function validateSchemaDefinition(
  schema: JsonSchema,
  path: string,
  issues: SchemaValidationIssue[],
  seen: Set<JsonSchema>,
  enforceClassification: boolean,
): void {
  if (!schema || typeof schema !== 'object' || seen.has(schema)) return;
  seen.add(schema);
  for (const keyword of Object.keys(schema)) {
    if (keyword.startsWith('x-appspine-') && keyword !== 'x-appspine-data-classification') {
      issues.push({ path, message: `unknown Appspine schema keyword ${keyword}`, keyword });
    } else if (!SUPPORTED_KEYWORDS.has(keyword)) {
      issues.push({ path, message: `unsupported schema keyword ${keyword}`, keyword });
    }
  }
  const classification = schema['x-appspine-data-classification'];
  if (classification !== undefined && !CLASSIFICATIONS.has(classification)) {
    issues.push({
      path,
      message: `invalid data classification ${String(classification)}`,
      keyword: 'classification',
    });
  }
  if (classification === 'SECRET') {
    issues.push({
      path,
      message: 'SECRET data is not allowed in an integration contract',
      keyword: 'classification',
    });
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    for (const type of types)
      if (!['null', 'boolean', 'object', 'array', 'number', 'integer', 'string'].includes(type))
        issues.push({ path, message: `unsupported schema type ${type}`, keyword: 'type' });
  }
  if (
    schema.required !== undefined &&
    (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== 'string'))
  ) {
    issues.push({ path, message: 'required must be an array of strings', keyword: 'required' });
  }
  if (
    schema.minLength !== undefined &&
    schema.maxLength !== undefined &&
    schema.minLength > schema.maxLength
  )
    issues.push({ path, message: 'minLength must not exceed maxLength', keyword: 'length' });
  if (
    schema.minItems !== undefined &&
    schema.maxItems !== undefined &&
    schema.minItems > schema.maxItems
  )
    issues.push({ path, message: 'minItems must not exceed maxItems', keyword: 'items' });
  for (const [key, child] of Object.entries(schema.properties ?? {}))
    validateSchemaDefinition(child, `${path}.${key}`, issues, seen, enforceClassification);
  for (const [key, child] of Object.entries(schema.patternProperties ?? {}))
    validateSchemaDefinition(child, `${path}.{${key}}`, issues, seen, enforceClassification);
  for (const [key, child] of Object.entries(schema.$defs ?? {}))
    validateSchemaDefinition(child, `${path}.$defs.${key}`, issues, seen, enforceClassification);
  for (const [keyword, children] of [
    ['allOf', schema.allOf],
    ['anyOf', schema.anyOf],
    ['oneOf', schema.oneOf],
  ] as const)
    for (const [index, child] of (children ?? []).entries())
      validateSchemaDefinition(
        child,
        `${path}.${keyword}[${index}]`,
        issues,
        seen,
        enforceClassification,
      );
  for (const [keyword, child] of [
    ['items', schema.items],
    ['if', schema.if],
    ['then', schema.then],
    ['else', schema.else],
  ] as const)
    if (child)
      validateSchemaDefinition(child, `${path}.${keyword}`, issues, seen, enforceClassification);
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
    validateSchemaDefinition(
      schema.additionalProperties,
      `${path}.additionalProperties`,
      issues,
      seen,
      enforceClassification,
    );
  if (
    enforceClassification &&
    !schema.$ref &&
    !schema.properties &&
    !schema.items &&
    !schema.allOf &&
    !schema.anyOf &&
    !schema.oneOf &&
    !schema.$defs &&
    schema.type !== 'object' &&
    schema.type !== 'array' &&
    classification === undefined
  )
    issues.push({
      path,
      message: 'schema leaf must declare x-appspine-data-classification',
      keyword: 'classification',
    });
}

function validate(
  value: unknown,
  schema: JsonSchema,
  path: string,
  options: ValidateJsonSchemaOptions,
  issues: SchemaValidationIssue[],
  refStack: Set<string>,
): void {
  if (schema.$ref) {
    if (refStack.has(schema.$ref)) {
      issues.push({
        path,
        message: `recursive $ref is not resolvable: ${schema.$ref}`,
        keyword: '$ref',
      });
      return;
    }
    const resolved = resolveRef(schema.$ref, options.rootSchema ?? schema);
    if (!resolved) {
      issues.push({ path, message: `unresolved $ref ${schema.$ref}`, keyword: '$ref' });
      return;
    }
    validate(value, resolved, path, options, issues, new Set(refStack).add(schema.$ref));
    return;
  }

  if (schema.if) {
    if (validateWithoutIssues(value, schema.if, options)) {
      if (schema.then) validate(value, schema.then, path, options, issues, refStack);
    } else if (schema.else) validate(value, schema.else, path, options, issues, refStack);
  }
  if (schema.allOf)
    for (const child of schema.allOf) validate(value, child, path, options, issues, refStack);
  if (schema.anyOf && !schema.anyOf.some((child) => validateWithoutIssues(value, child, options)))
    issues.push({ path, message: 'does not match anyOf', keyword: 'anyOf' });
  if (
    schema.oneOf &&
    schema.oneOf.filter((child) => validateWithoutIssues(value, child, options)).length !== 1
  )
    issues.push({ path, message: 'does not match exactly one oneOf schema', keyword: 'oneOf' });
  if (schema.const !== undefined && !sameJson(value, schema.const))
    issues.push({ path, message: 'does not match const', keyword: 'const' });
  if (schema.enum && !schema.enum.some((item) => sameJson(value, item)))
    issues.push({ path, message: 'is not an allowed enum value', keyword: 'enum' });
  if (schema.type && !matchesType(value, schema.type)) {
    issues.push({
      path,
      message: `must be ${Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type}`,
      keyword: 'type',
    });
    return;
  }
  if (typeof value === 'string') validateString(value, schema, path, issues);
  if (typeof value === 'number') validateNumber(value, schema, path, issues);
  if (Array.isArray(value)) validateArray(value, schema, path, options, issues, refStack);
  if (value && typeof value === 'object' && !Array.isArray(value))
    validateObject(value, schema, path, options, issues, refStack);
}

function validateString(
  value: string,
  schema: JsonSchema,
  path: string,
  issues: SchemaValidationIssue[],
): void {
  if (schema.minLength !== undefined && [...value].length < schema.minLength)
    issues.push({
      path,
      message: `must have at least ${schema.minLength} characters`,
      keyword: 'minLength',
    });
  if (schema.maxLength !== undefined && [...value].length > schema.maxLength)
    issues.push({
      path,
      message: `must have at most ${schema.maxLength} characters`,
      keyword: 'maxLength',
    });
  if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value))
    issues.push({ path, message: 'does not match pattern', keyword: 'pattern' });
  if (schema.format === 'date-time' && !isRfc3339DateTime(value))
    issues.push({ path, message: 'must be an RFC 3339 date-time', keyword: 'format' });
  if (schema.format === 'uri') {
    try {
      new URL(value);
    } catch {
      issues.push({ path, message: 'must be a valid URI', keyword: 'format' });
    }
  }
}

function isRfc3339DateTime(value: string): boolean {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/u,
  );
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] ? Number(match[8]) : 0;
  const offsetMinute = match[9] ? Number(match[9]) : 0;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month))
    return false;
  if (hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return false;
  return true;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function validateNumber(
  value: number,
  schema: JsonSchema,
  path: string,
  issues: SchemaValidationIssue[],
): void {
  if (schema.minimum !== undefined && value < schema.minimum)
    issues.push({ path, message: `must be >= ${schema.minimum}`, keyword: 'minimum' });
  if (schema.maximum !== undefined && value > schema.maximum)
    issues.push({ path, message: `must be <= ${schema.maximum}`, keyword: 'maximum' });
}

function validateArray(
  value: unknown[],
  schema: JsonSchema,
  path: string,
  options: ValidateJsonSchemaOptions,
  issues: SchemaValidationIssue[],
  refs: Set<string>,
): void {
  if (schema.minItems !== undefined && value.length < schema.minItems)
    issues.push({
      path,
      message: `must contain at least ${schema.minItems} items`,
      keyword: 'minItems',
    });
  if (schema.maxItems !== undefined && value.length > schema.maxItems)
    issues.push({
      path,
      message: `must contain at most ${schema.maxItems} items`,
      keyword: 'maxItems',
    });
  if (schema.uniqueItems) {
    const serialized = value.map((item) => canonicalJson(item));
    if (new Set(serialized).size !== serialized.length)
      issues.push({ path, message: 'must contain unique items', keyword: 'uniqueItems' });
  }
  if (schema.items) {
    value.forEach((item, index) => {
      validate(item, schema.items as JsonSchema, `${path}[${index}]`, options, issues, refs);
    });
  }
}

function validateObject(
  value: object,
  schema: JsonSchema,
  path: string,
  options: ValidateJsonSchemaOptions,
  issues: SchemaValidationIssue[],
  refs: Set<string>,
): void {
  const record = value as Record<string, unknown>;
  for (const required of schema.required ?? [])
    if (!(required in record))
      issues.push({ path: `${path}.${required}`, message: 'is required', keyword: 'required' });
  const properties = schema.properties ?? {};
  for (const [key, child] of Object.entries(properties))
    if (key in record) validate(record[key], child, `${path}.${key}`, options, issues, refs);
  for (const [key, child] of Object.entries(schema.patternProperties ?? {})) {
    const regex = new RegExp(key, 'u');
    for (const [actualKey, actualValue] of Object.entries(record))
      if (regex.test(actualKey))
        validate(actualValue, child, `${path}.${actualKey}`, options, issues, refs);
  }
  for (const [key, actualValue] of Object.entries(record)) {
    if (
      key in properties ||
      Object.keys(schema.patternProperties ?? {}).some((pattern) =>
        new RegExp(pattern, 'u').test(key),
      )
    )
      continue;
    if (schema.additionalProperties === false && options.mode !== 'tolerant-reader')
      issues.push({
        path: `${path}.${key}`,
        message: 'is not allowed',
        keyword: 'additionalProperties',
      });
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
      validate(actualValue, schema.additionalProperties, `${path}.${key}`, options, issues, refs);
  }
}

function validateWithoutIssues(
  value: unknown,
  schema: JsonSchema,
  options: ValidateJsonSchemaOptions,
): boolean {
  return validateJsonSchema(value, schema, options).length === 0;
}

function matchesType(value: unknown, type: string | string[]): boolean {
  const types = Array.isArray(type) ? type : [type];
  return types.some((candidate) => {
    if (candidate === 'null') return value === null;
    if (candidate === 'array') return Array.isArray(value);
    if (candidate === 'object')
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    if (candidate === 'integer') return typeof value === 'number' && Number.isInteger(value);
    return typeof value === candidate;
  });
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

function resolveRef(ref: string, root: JsonSchema): JsonSchema | undefined {
  if (!ref.startsWith('#/')) return undefined;
  let value: unknown = root;
  for (const part of ref.slice(2).split('/')) {
    if (!value || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[part.replaceAll('~1', '/').replaceAll('~0', '~')];
  }
  return value as JsonSchema | undefined;
}

function walkSchema(
  schema: JsonSchema,
  path: string,
  classification: DataClassification,
  paths: string[],
  seen: Set<JsonSchema>,
): void {
  if (seen.has(schema)) return;
  seen.add(schema);
  if (schema['x-appspine-data-classification'] === classification) paths.push(path);
  for (const [key, child] of Object.entries(schema.properties ?? {}))
    walkSchema(child, `${path}.${key}`, classification, paths, seen);
  if (schema.items) walkSchema(schema.items, `${path}[]`, classification, paths, seen);
  for (const child of Object.values(schema.$defs ?? {}))
    walkSchema(child, path, classification, paths, seen);
}
