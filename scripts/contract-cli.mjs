#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';

const root = resolve(process.env.APPSPINE_WORKSPACE_ROOT ?? process.cwd());
const contractsRoot = join(root, 'knowledge', 'contracts');
const META_SCHEMA = JSON.parse(readFileSync(join(contractsRoot, 'meta-schema.json'), 'utf8'));
const CLI_SCHEMA_KEYWORDS = new Set(['$schema', '$id', '$ref', '$defs', '$comment', 'title', 'description', 'type', 'required', 'properties', 'patternProperties', 'additionalProperties', 'items', 'enum', 'const', 'anyOf', 'oneOf', 'allOf', 'if', 'then', 'else', 'pattern', 'format', 'minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'uniqueItems', 'x-appspine-data-classification']);
const command = process.argv[2] ?? 'index';
const args = parseArgs(process.argv.slice(3));

try {
  if (command === 'index') await indexContracts(args.write === true, args.check === true);
  else if (command === 'validate') validateContracts(args.path ? resolve(root, args.path) : undefined);
  else if (command === 'init') initContract(args);
  else if (command === 'diff' || command === 'check-compatibility') compareContracts(args, command === 'diff');
  else if (command === 'sync-views') syncViews(args);
  else if (command === 'generate-runtime') generateRuntime(args);
  else throw new Error(`Unknown contract-cli command: ${command}`);
} catch (error) {
  console.error(`[contract-cli] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    result[key] = values[index + 1]?.startsWith('--') || values[index + 1] === undefined ? true : values[++index];
  }
  return result;
}

function discoverContracts() {
  const result = [];
  for (const kind of ['capabilities', 'bindings']) {
    const kindRoot = join(contractsRoot, kind);
    if (!existsSync(kindRoot)) continue;
    for (const contractId of readdirSync(kindRoot).sort()) {
      const idRoot = join(kindRoot, contractId, 'versions');
      if (!existsSync(idRoot)) continue;
      for (const version of readdirSync(idRoot).sort()) {
        const versionRoot = join(idRoot, version);
        const markdown = join(versionRoot, kind === 'capabilities' ? 'contract.md' : 'binding.md');
        if (!existsSync(markdown)) continue;
        const frontmatter = readFrontmatter(markdown);
        const artifacts = collectArtifacts(versionRoot, markdown);
        const manifest = makeManifest({
          contractId,
          version,
          kind: kind === 'capabilities' ? 'capability' : 'binding',
          canonicalSource: relative(root, markdown).split(sep).join('/'),
          artifacts,
        });
        result.push({ contractId, version, kind: manifest.kind, status: frontmatter.status ?? 'draft', interaction: frontmatter.interaction, source: manifest.canonicalSource, digest: manifest.digest, frontmatter, artifacts });
      }
    }
  }
  return result.sort((a, b) => `${a.contractId}@${a.version}`.localeCompare(`${b.contractId}@${b.version}`));
}

function collectArtifacts(versionRoot, markdown) {
  const files = [markdown];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (path !== markdown && extname(path).toLowerCase() !== '.tmp') files.push(path);
    }
  };
  walk(versionRoot);
  return Object.fromEntries(files.sort().map((path) => [relative(versionRoot, path).split(sep).join('/'), sha256(readFileSync(path))]));
}

function makeManifest(input) {
  const unsigned = { contractId: input.contractId, version: input.version, kind: input.kind, canonicalSource: input.canonicalSource, artifacts: Object.fromEntries(Object.entries(input.artifacts).sort()) };
  return { ...unsigned, digest: `sha256:${sha256(Buffer.from(canonicalJson(unsigned)))}` };
}

async function indexContracts(write, check) {
  const contracts = discoverContracts();
  const invalid = validateDiscovered(contracts);
  if (invalid.length) throw new Error(invalid.join('\n'));
  const usage = collectLocalUsage();
  const index = {
    schemaVersion: 2,
    contracts: contracts.map(({ frontmatter, artifacts, ...contract }) => ({
      ...contract,
      latestApprovedVersion: latestApprovedVersion(contracts, contract.contractId),
      supportedMajorVersions: supportedMajorVersions(contracts, contract.contractId),
      usedByApps: usage.get(contract.contractId) ?? [],
    })),
  };
  const json = `${JSON.stringify(index, null, 2)}\n`;
  const markdown = renderIndex(index);
  if (check) {
    const currentJson = existsSync(join(contractsRoot, 'index.json')) ? readFileSync(join(contractsRoot, 'index.json'), 'utf8') : '';
    const currentMarkdown = existsSync(join(contractsRoot, 'index.md')) ? readFileSync(join(contractsRoot, 'index.md'), 'utf8') : '';
    const rootOnly = args['root-only'] === true;
    if (rootOnly) {
      let currentIndex;
      try { currentIndex = JSON.parse(currentJson); } catch { currentIndex = undefined; }
      if (
        canonicalJson(withoutLocalUsage(currentIndex)) !== canonicalJson(withoutLocalUsage(index)) ||
        stripUsageColumn(currentMarkdown) !== stripUsageColumn(markdown)
      ) throw new Error('contract indexes are stale; run node scripts/contract-cli.mjs index --write');
    } else if (currentJson !== json || currentMarkdown !== markdown) {
      throw new Error('contract indexes are stale; run node scripts/contract-cli.mjs index --write');
    }
    console.log(`index is fresh for ${contracts.length} contracts`);
    return;
  }
  if (!write) {
    console.log(json);
    return;
  }
  mkdirSync(contractsRoot, { recursive: true });
  writeFileSync(join(contractsRoot, 'index.json'), json);
  writeFileSync(join(contractsRoot, 'index.md'), markdown);
  console.log(`indexed ${contracts.length} contracts`);
}

function collectLocalUsage() {
  const usage = new Map();
  const candidates = [
    ['appspine-app-template', resolve(root, '../appspine-app-template')],
    ['approve', resolve(root, '../approve')],
    ['wiki', resolve(root, '../wiki')],
  ];
  let missingAny = false;
  for (const [app, appRoot] of candidates) {
    if (!existsSync(appRoot)) {
      missingAny = true;
      continue;
    }
    for (const file of walkFiles(appRoot)) {
      if (!file.endsWith(join('_generated', 'contract-ref.json'))) continue;
      const ref = JSON.parse(readFileSync(file, 'utf8'));
      const apps = usage.get(ref.contract_id) ?? [];
      if (!apps.includes(app)) apps.push(app);
      usage.set(ref.contract_id, apps.sort());
    }
  }
  if (missingAny && usage.size === 0) {
    console.warn('[contract-cli] Warning: Local consumer app repositories not found; skipping local usage scan.');
  }
  return usage;
}

function withoutLocalUsage(value) {
  if (Array.isArray(value)) return value.map(withoutLocalUsage);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'usedByApps').map(([key, child]) => [key, withoutLocalUsage(child)]));
}

function stripUsageColumn(markdown) {
  return markdown.split('\n').map((line) => {
    if (!line.startsWith('|') || line.startsWith('| ---') || line.startsWith('| Contract')) return line;
    const columns = line.split('|');
    if (columns.length >= 10) columns[7] = '';
    return columns.join('|');
  }).join('\n');
}

function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') files.push(...walkFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function latestApprovedVersion(contracts, contractId) {
  return contracts
    .filter((contract) => contract.contractId === contractId && contract.status === 'approved')
    .sort((a, b) => compareVersions(b.version, a.version))[0]?.version ?? null;
}

function supportedMajorVersions(contracts, contractId) {
  return contracts
    .filter((contract) => contract.contractId === contractId && ['approved', 'deprecated'].includes(contract.status))
    .sort((a, b) => compareVersions(b.version, a.version))
    .map((contract) => ({
      major: Number(contract.version.split('.')[0]),
      version: contract.version,
      status: contract.status,
      deprecatedAt: contract.frontmatter.deprecated_at ?? null,
      supportUntil: contract.frontmatter.support_until ?? null,
    }));
}

function compareVersions(left, right) {
  return left.split('.').map(Number).reduce((result, value, index) => result || value - Number(right.split('.')[index]), 0);
}

function validateContracts(path) {
  const contracts = discoverContracts();
  const invalid = validateDiscovered(contracts);
  if (path) {
    const target = realpathSafe(path);
    if (!target.startsWith(`${contractsRoot}${sep}`) && target !== contractsRoot) throw new Error('Validation path must stay inside knowledge/contracts');
  }
  if (invalid.length) throw new Error(invalid.join('\n'));
  console.log(`validated ${contracts.length} contracts`);
}

function validateDiscovered(contracts) {
  const errors = [];
  const seen = new Set();
  for (const contract of contracts) {
    const key = `${contract.contractId}@${contract.version}`;
    if (seen.has(key)) errors.push(`duplicate contract ${key}`);
    seen.add(key);
    const fm = contract.frontmatter;
    errors.push(...validateContractFrontmatter(fm, key));
    if (fm.type !== 'integration-contract') errors.push(`${key}: type must be integration-contract`);
    if (!/^\d+\.\d+\.\d+$/u.test(contract.version)) errors.push(`${key}: invalid SemVer`);
    if (fm.contract_id !== contract.contractId || fm.version !== contract.version) errors.push(`${key}: directory and frontmatter identity differ`);
    if (!['command', 'query', 'event'].includes(fm.interaction)) errors.push(`${key}: interaction is required`);
    if (!['draft', 'review', 'approved', 'deprecated'].includes(fm.status)) errors.push(`${key}: invalid status`);
    for (const heading of ['Purpose', 'Participants and ownership', 'Trigger and business semantics', 'Authentication and authorization', 'Idempotency and retry', 'Errors and failure handling', 'Observability and audit', 'Compatibility and versioning', 'Acceptance scenarios']) {
      const content = readFileSync(join(root, contract.source), 'utf8');
      if (!new RegExp(`^## ${escapeRegex(heading)}$`, 'mu').test(content)) errors.push(`${key}: missing heading "${heading}"`);
    }
    if (contract.kind === 'capability') {
      if (['command', 'query'].includes(fm.interaction)) {
        if (typeof fm.provider !== 'string' || !fm.provider) errors.push(`${key}: ${fm.interaction} capability requires provider`);
        if (!Array.isArray(fm.callers) || fm.callers.length === 0) errors.push(`${key}: ${fm.interaction} capability requires callers`);
        if (fm.transport !== 'http') errors.push(`${key}: ${fm.interaction} capability must use HTTP transport`);
      } else {
        if (typeof fm.producer !== 'string' || !fm.producer) errors.push(`${key}: event capability requires producer`);
        if (!Array.isArray(fm.consumers) || fm.consumers.length === 0) errors.push(`${key}: event capability requires consumers`);
        if (!['webhook', 'message-broker'].includes(fm.transport)) errors.push(`${key}: event capability must use webhook or message-broker transport`);
      }
    }
    if (contract.kind === 'binding') {
      if (!fm.capability_ref || !fm.source_app || !fm.destination_app) errors.push(`${key}: capability_ref, source_app and destination_app are required`);
      if (fm.source_app === fm.destination_app) errors.push(`${key}: source_app and destination_app must differ`);
      if (typeof fm.destination_key !== 'string' || !fm.destination_key) errors.push(`${key}: destination_key is required`);
      if (!fm.authentication || typeof fm.authentication !== 'object' || Array.isArray(fm.authentication)) errors.push(`${key}: authentication policy is required`);
      if (!fm.retry || typeof fm.retry !== 'object' || Array.isArray(fm.retry)) errors.push(`${key}: retry policy is required`);
      else {
        if (!Number.isInteger(fm.retry.timeout_ms) || fm.retry.timeout_ms <= 0) errors.push(`${key}: retry.timeout_ms must be a positive integer`);
        if (!Number.isInteger(fm.retry.max_attempts) || fm.retry.max_attempts <= 0) errors.push(`${key}: retry.max_attempts must be a positive integer`);
      }
    }
    for (const artifact of Object.keys(contract.artifacts)) {
      const artifactPath = join(root, dirname(contract.source), artifact);
      if (artifact.endsWith('.json')) {
        try {
          const parsed = JSON.parse(readFileSync(artifactPath, 'utf8'));
          if (artifact.endsWith('.schema.json')) errors.push(...validateJsonSchemaDocument(parsed, `${key}:${artifact}`));
        } catch (error) { errors.push(`${key}: invalid JSON artifact ${artifact}: ${error instanceof Error ? error.message : String(error)}`); }
      }
      if (artifact.endsWith('.yaml') || artifact.endsWith('.yml')) errors.push(...validateOpenApiDocument(readFileSync(artifactPath, 'utf8'), `${key}:${artifact}`));
    }
  }
  const lockPath = join(contractsRoot, 'approved-digests.json');
  if (existsSync(lockPath)) {
    const locks = JSON.parse(readFileSync(lockPath, 'utf8'));
    for (const contract of contracts.filter((candidate) => candidate.status === 'approved')) {
      const expected = locks[`${contract.contractId}@${contract.version}`];
      if (!expected) errors.push(`${contract.contractId}@${contract.version}: approved digest lock is missing`);
      else if (expected !== contract.digest) errors.push(`${contract.contractId}@${contract.version}: approved contract is immutable and its digest changed`);
    }
  }
  const capabilities = new Map(contracts.filter((contract) => contract.kind === 'capability').map((contract) => [`${contract.contractId}@${contract.version}`, contract]));
  for (const binding of contracts.filter((contract) => contract.kind === 'binding')) {
    const ref = binding.frontmatter.capability_ref;
    const capability = ref && capabilities.get(`${ref.contract_id}@${ref.version}`);
    if (ref && !capability) errors.push(`${binding.contractId}@${binding.version}: capability_ref not found`);
    else if (ref && capability) {
      if (ref.digest !== capability.digest) errors.push(`${binding.contractId}@${binding.version}: capability_ref digest does not match canonical capability`);
      if (binding.interaction !== capability.interaction) errors.push(`${binding.contractId}@${binding.version}: interaction must match referenced capability`);
      if (['command', 'query'].includes(capability.interaction)) {
        if (!capability.frontmatter.callers?.includes(binding.frontmatter.source_app)) errors.push(`${binding.contractId}@${binding.version}: source_app must be a declared caller`);
        if (binding.frontmatter.destination_app !== capability.frontmatter.provider) errors.push(`${binding.contractId}@${binding.version}: destination_app must be the declared provider`);
      } else {
        if (binding.frontmatter.source_app !== capability.frontmatter.producer) errors.push(`${binding.contractId}@${binding.version}: source_app must be the declared producer`);
        if (!capability.frontmatter.consumers?.includes(binding.frontmatter.destination_app)) errors.push(`${binding.contractId}@${binding.version}: destination_app must be a declared consumer`);
      }
    }
  }
  return errors;
}

function validateContractFrontmatter(fm, key) {
  const errors = validateMetaSchemaValue(fm, META_SCHEMA, '$', META_SCHEMA).map((message) => `${key}: frontmatter ${message}`);
  const required = ['type', 'contract_kind', 'contract_id', 'version', 'status', 'interaction', 'transport', 'maintainer', 'required_reviewers'];
  for (const field of required) if (fm[field] === undefined || fm[field] === null || fm[field] === '') errors.push(`${key}: frontmatter ${field} is required`);
  if (fm.contract_kind === 'capability' && !fm.provider && !fm.producer) errors.push(`${key}: capability requires provider or producer`);
  if (fm.contract_kind === 'binding' && (!fm.capability_ref || !fm.source_app || !fm.destination_app)) errors.push(`${key}: binding requires capability_ref, source_app and destination_app`);
  if (fm.required_reviewers !== undefined && (!Array.isArray(fm.required_reviewers) || fm.required_reviewers.length === 0)) errors.push(`${key}: required_reviewers must be a non-empty array`);
  if (fm.status === 'approved' && fm.implementation_status === 'disabled') errors.push(`${key}: approved contract cannot be disabled`);
  return errors;
}

function validateMetaSchemaValue(value, schema, path, rootSchema) {
  if (!schema || typeof schema !== 'object') return [];
  if (schema.$ref) {
    const resolved = resolveLocalRef(schema.$ref, rootSchema);
    return resolved ? validateMetaSchemaValue(value, resolved, path, rootSchema) : [`${path}: unresolved $ref ${schema.$ref}`];
  }
  const errors = [];
  if (schema.const !== undefined && canonicalJson(value) !== canonicalJson(schema.const)) errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((candidate) => canonicalJson(candidate) === canonicalJson(value))) errors.push(`${path}: must be one of ${schema.enum.join(', ')}`);
  if (schema.type && !metaTypeMatches(value, schema.type)) errors.push(`${path}: must be ${Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type}`);
  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${path}: does not match ${schema.pattern}`);
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: must have at least ${schema.minLength} characters`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: must contain at least ${schema.minItems} items`);
    if (schema.items) value.forEach((item, index) => errors.push(...validateMetaSchemaValue(item, schema.items, `${path}[${index}]`, rootSchema)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value;
    for (const required of schema.required ?? []) if (!(required in record)) errors.push(`${path}.${required}: is required`);
    for (const [key, child] of Object.entries(schema.properties ?? {})) if (key in record) errors.push(...validateMetaSchemaValue(record[key], child, `${path}.${key}`, rootSchema));
    if (schema.additionalProperties === false) for (const key of Object.keys(record)) if (!(key in (schema.properties ?? {}))) errors.push(`${path}.${key}: is not allowed`);
  }
  if (schema.if && validateMetaSchemaValue(value, schema.if, path, rootSchema).length === 0) {
    if (schema.then) errors.push(...validateMetaSchemaValue(value, schema.then, path, rootSchema));
  } else if (schema.else) {
    errors.push(...validateMetaSchemaValue(value, schema.else, path, rootSchema));
  }
  for (const child of schema.allOf ?? []) errors.push(...validateMetaSchemaValue(value, child, path, rootSchema));
  if (schema.anyOf && !schema.anyOf.some((child) => validateMetaSchemaValue(value, child, path, rootSchema).length === 0)) errors.push(`${path}: does not match anyOf`);
  return errors;
}

function metaTypeMatches(value, type) {
  return (Array.isArray(type) ? type : [type]).some((candidate) => {
    if (candidate === 'null') return value === null;
    if (candidate === 'array') return Array.isArray(value);
    if (candidate === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
    return typeof value === candidate;
  });
}

function resolveLocalRef(ref, rootSchema) {
  if (!ref.startsWith('#/')) return undefined;
  let value = rootSchema;
  for (const part of ref.slice(2).split('/')) {
    if (!value || typeof value !== 'object') return undefined;
    value = value[part.replaceAll('~1', '/').replaceAll('~0', '~')];
  }
  return value;
}

function validateJsonSchemaDocument(schema, label, path = '$', seen = new Set()) {
  const errors = [];
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [`${label}:${path}: schema node must be an object`];
  if (seen.has(schema)) return errors;
  seen.add(schema);
  for (const keyword of Object.keys(schema)) {
    if (!CLI_SCHEMA_KEYWORDS.has(keyword)) errors.push(`${label}:${path}: unsupported schema keyword ${keyword}`);
    if (keyword.startsWith('x-appspine-') && keyword !== 'x-appspine-data-classification') errors.push(`${label}:${path}: unknown Appspine schema keyword ${keyword}`);
  }
  const classification = schema['x-appspine-data-classification'];
  if (classification === 'SECRET') errors.push(`${label}:${path}: SECRET classification is forbidden`);
  if (classification !== undefined && !['PUBLIC', 'INTERNAL', 'PERSONAL', 'SENSITIVE'].includes(classification)) errors.push(`${label}:${path}: invalid data classification`);
  const children = [];
  for (const [key, child] of Object.entries(schema.properties ?? {})) children.push([`${path}.${key}`, child]);
  for (const [key, child] of Object.entries(schema.patternProperties ?? {})) children.push([`${path}.{${key}}`, child]);
  for (const [key, child] of Object.entries(schema.$defs ?? {})) children.push([`${path}.$defs.${key}`, child]);
  for (const [index, child] of (schema.items ? [['items', schema.items]] : [])) children.push([`${path}.${index}`, child]);
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) for (const [index, child] of (schema[keyword] ?? []).entries()) children.push([`${path}.${keyword}[${index}]`, child]);
  for (const keyword of ['if', 'then', 'else']) if (schema[keyword]) children.push([`${path}.${keyword}`, schema[keyword]]);
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') children.push([`${path}.additionalProperties`, schema.additionalProperties]);
  if (children.length === 0 && !schema.$ref && schema.type !== 'object' && schema.type !== 'array' && classification === undefined) errors.push(`${label}:${path}: every schema leaf requires x-appspine-data-classification`);
  for (const [childPath, child] of children) errors.push(...validateJsonSchemaDocument(child, label, childPath, seen));
  return errors;
}

function validateOpenApiDocument(content, label) {
  const errors = [];
  if (!/^openapi:\s*3\.1\.\d+\s*$/mu.test(content)) errors.push(`${label}: OpenAPI document must declare 3.1.x`);
  if (!/^info:\s*$/mu.test(content) && !/^info:\s*\{/mu.test(content)) errors.push(`${label}: OpenAPI info is required`);
  if (!/^paths:\s*$/mu.test(content) && !/^paths:\s*\{/mu.test(content)) errors.push(`${label}: OpenAPI paths are required`);
  for (const match of content.matchAll(/\$ref:\s*(['"]?)([^'"},\s]+)/gu))
    if (!match[2].startsWith('#')) errors.push(`${label}: external OpenAPI references are not allowed`);
  for (const status of content.matchAll(/^\s{8,}'?(\d{3})'?\s*:/gmu)) if (!['200', '201', '202', '204', '400', '401', '403', '404', '409', '422', '425', '429', '500', '503'].includes(status[1])) errors.push(`${label}: unsupported HTTP response status ${status[1]}`);
  return errors;
}

function initContract(options) {
  const kind = options.kind;
  const contractId = options.id;
  const version = options.version ?? '1.0.0';
  if (!['capability', 'binding'].includes(kind) || !contractId || !/^\d+\.\d+\.\d+$/u.test(version)) throw new Error('init requires --kind capability|binding --id <id> --version <semver>');
  const directory = join(contractsRoot, kind === 'capability' ? 'capabilities' : 'bindings', contractId, 'versions', version);
  ensureInside(contractsRoot, directory);
  mkdirSync(join(directory, 'schemas'), { recursive: true });
  const file = join(directory, kind === 'capability' ? 'contract.md' : 'binding.md');
  if (existsSync(file)) {
    const existing = readFrontmatter(file);
    if (existing.status === 'approved' || existing.status === 'deprecated') throw new Error(`cannot overwrite immutable ${existing.status} contract: ${file}`);
    if (options.force !== true) throw new Error(`already exists: ${file}`);
  }
  writeFileSync(file, kind === 'capability' ? capabilitySkeleton(contractId, version) : bindingSkeleton(contractId, version));
  writeFileSync(join(directory, 'schemas', 'payload.schema.json'), `${JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', additionalProperties: false }, null, 2)}\n`);
  console.log(`created ${relative(root, directory)}`);
}

function compareContracts(options, printDiff) {
  const from = findContract(options.from);
  const to = findContract(options.to);
  if (!from || !to) throw new Error('diff requires --from <contract-id@version> and --to <contract-id@version>');
  const profile = options.profile ?? 'provider-compatible';
  if (!['strict', 'tolerant-reader', 'provider-compatible'].includes(profile)) throw new Error(`unsupported compatibility profile: ${profile}`);
  const findings = compareSchemas(from, to, profile);
  const result = { from: `${from.contractId}@${from.version}`, to: `${to.contractId}@${to.version}`, profile, compatible: findings.every((finding) => !finding.breaking), requiredVersionBump: findings.some((finding) => finding.breaking) ? 'major' : findings.length ? 'minor' : 'none', findings };
  console.log(JSON.stringify(printDiff ? result : result, null, 2));
  if (!result.compatible && options.strict === true) process.exitCode = 2;
}

function compareSchemas(from, to, profile) {
  const fromSchemas = readSchemas(from);
  const toSchemas = readSchemas(to);
  const artifactNames = [...new Set([...fromSchemas.keys(), ...toSchemas.keys()])].sort();
  const allFindings = [];
  for (const artifact of artifactNames) {
    const fromSchema = fromSchemas.get(artifact);
    const toSchema = toSchemas.get(artifact);
    if (!fromSchema || !toSchema) {
      allFindings.push({ path: artifact, breaking: Boolean(fromSchema), severity: fromSchema ? 'error' : 'info', rule: fromSchema ? 'schema artifact removed' : 'schema artifact added' });
      continue;
    }
    allFindings.push(...compareSchemaPair(fromSchema, toSchema, profile).map((finding) => ({ ...finding, path: `${artifact}:${finding.path}` })));
  }
  return allFindings;
}

function compareSchemaPair(fromSchema, toSchema, profile) {
  try {
    const shared = createRequire(new URL(import.meta.url))(resolve(root, 'packages/integration-contracts/dist/index.js'));
    if (shared.checkSchemaCompatibility) return shared.checkSchemaCompatibility(fromSchema ?? {}, toSchema ?? {}, profile);
  } catch (err) {
    console.warn(`[contract-cli] Warning: Failed to load @appspine/integration-contracts dist module (${err instanceof Error ? err.message : String(err)}). Falling back to basic compatibility checker.`);
  }
  const findings = [];
  if (JSON.stringify(fromSchema?.type) !== JSON.stringify(toSchema?.type)) findings.push({ path: '$', breaking: true, severity: 'error', rule: 'type changed' });
  for (const value of fromSchema?.enum ?? []) if (!(toSchema?.enum ?? []).some((candidate) => JSON.stringify(candidate) === JSON.stringify(value))) findings.push({ path: '$', breaking: true, severity: 'error', rule: 'enum value removed' });
  const fromRequired = new Set(fromSchema?.required ?? []);
  const toRequired = new Set(toSchema?.required ?? []);
  for (const field of fromRequired) if (!toRequired.has(field)) findings.push({ path: `$.${field}`, breaking: false, rule: 'required field relaxed' });
  for (const field of toRequired) if (!fromRequired.has(field)) findings.push({ path: `$.${field}`, breaking: true, rule: 'new required field' });
  const fromProperties = fromSchema?.properties ?? {};
  const toProperties = toSchema?.properties ?? {};
  for (const field of Object.keys(fromProperties)) if (!(field in toProperties)) findings.push({ path: `$.${field}`, breaking: profile !== 'tolerant-reader' || fromRequired.has(field), rule: 'property removed' });
  for (const field of Object.keys(toProperties)) if (!(field in fromProperties) && (profile !== 'tolerant-reader' || toRequired.has(field))) findings.push({ path: `$.${field}`, breaking: toRequired.has(field), rule: toRequired.has(field) ? 'new required field' : 'property added' });
  if (fromSchema?.additionalProperties === false && toSchema?.additionalProperties !== false) findings.push({ path: '$', breaking: false, severity: 'info', rule: 'additional properties relaxed' });
  if (fromSchema?.additionalProperties !== false && toSchema?.additionalProperties === false) findings.push({ path: '$', breaking: profile !== 'tolerant-reader', severity: profile === 'tolerant-reader' ? 'warning' : 'error', rule: 'additional properties restricted' });
  return findings;
}

function syncViews(options) {
  const contract = findContract(options.contract ?? options.id);
  if (!contract) throw new Error('sync-views requires --contract <contract-id@version>');
  const target = resolveTarget(options.target ?? options['target-repo'] ?? '.');
  const destination = join(target, 'knowledge', 'contracts', contract.contractId, '_generated');
  ensureInside(target, destination);
  const capability = contract.kind === 'binding' && contract.frontmatter.capability_ref
    ? discoverContracts().find((candidate) => candidate.kind === 'capability' && candidate.contractId === contract.frontmatter.capability_ref.contract_id && candidate.version === contract.frontmatter.capability_ref.version)
    : undefined;
  const ref = { contract_id: contract.contractId, version: contract.version, kind: contract.kind, digest: contract.digest, canonical_source: contract.source, capability_ref: contract.frontmatter.capability_ref, generated_by: 'scripts/contract-cli.mjs' };
  const implementationPath = join(destination, 'implementation.md');
  const files = [
    { path: join(destination, 'contract-ref.json'), content: `${JSON.stringify(ref, null, 2)}\n` },
    { path: implementationPath, content: existsSync(implementationPath) ? readFileSync(implementationPath) : implementationTemplate(contract, target) },
  ];
  const artifactSource = capability ?? contract;
  for (const artifact of Object.keys(artifactSource.artifacts)) if (artifact !== 'contract.md' && artifact !== 'binding.md') files.push({ path: join(destination, artifact), content: readFileSync(join(root, dirname(artifactSource.source), artifact)) });
  if (options.apply === true) for (const file of files) { mkdirSync(dirname(file.path), { recursive: true }); writeFileSync(file.path, file.content); }
  console.log(JSON.stringify({ mode: options.apply === true ? 'apply' : 'dry-run', target: relative(root, target), contract: ref, files: files.map((file) => relative(target, file.path).split(sep).join('/')) }, null, 2));
}

function generateRuntime(options) {
  const contract = findContract(options.contract ?? options.id);
  if (!contract) throw new Error('generate-runtime requires --contract <contract-id@version>');
  const target = resolveTarget(options.target ?? options['target-repo'] ?? '.');
  const safeId = contract.contractId.replace(/[^a-zA-Z0-9_-]/gu, '_');
  const directory = join(target, 'backend', 'src', 'generated', 'integration-contracts', safeId);
  ensureInside(target, directory);
  const schemaContract = contract.kind === 'binding' && contract.frontmatter.capability_ref
    ? findContract(`${contract.frontmatter.capability_ref.contract_id}@${contract.frontmatter.capability_ref.version}`) ?? contract
    : contract;
  const schema = readSchema(schemaContract) ?? {};
  const files = {
    'manifest.ts': `export const integrationContractManifest = ${JSON.stringify({ contractId: contract.contractId, version: contract.version, kind: contract.kind, digest: contract.digest, capabilityRef: contract.frontmatter.capability_ref }, null, 2)} as const;\n`,
    'types.ts': `export type IntegrationContractPayload = ${typescriptType(schema)};\n`,
    'validators.ts': `import { validateJsonSchema, type SchemaValidationIssue } from '@appspine/integration-contracts';\n\nconst integrationContractSchema = ${JSON.stringify(schema, null, 2)} as const;\n\nexport function validateIntegrationContractPayload(value: unknown): SchemaValidationIssue[] {\n  return validateJsonSchema(value, integrationContractSchema as never, { mode: 'strict' });\n}\n`,
  };
  if (options.check === true) {
    const stale = Object.entries(files).filter(([name, content]) => !existsSync(join(directory, name)) || readFileSync(join(directory, name), 'utf8') !== content).map(([name]) => name);
    if (stale.length > 0) throw new Error(`runtime artifacts are stale for ${contract.contractId}@${contract.version}: ${stale.join(', ')}`);
    console.log(JSON.stringify({ mode: 'check', directory: relative(root, directory), files: Object.keys(files) }, null, 2));
    return;
  }
  if (options.apply === true) for (const [name, content] of Object.entries(files)) { mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, name), content); }
  console.log(JSON.stringify({ mode: options.apply === true ? 'apply' : 'dry-run', directory: relative(root, directory), files: Object.keys(files) }, null, 2));
}

function implementationTemplate(contract, target) {
  const app = target.split(sep).filter(Boolean).at(-1) ?? 'app';
  return `---\ntype: generated-contract-view\nscope: app-local\nstatus: active\n---\n\n# ${contract.contractId} implementation\n\n` +
    `Canonical contract: \`${contract.contractId}@${contract.version}\`\n` +
    `Pinned digest: \`${contract.digest}\`\n\n` +
    `## ${app} wiring\n\n` +
    `- [ ] provider/caller or producer/consumer role confirmed\n` +
    `- [ ] authentication and destination key configured outside source control\n` +
    `- [ ] payload validation runs before transaction commit\n` +
    `- [ ] outbox, handler/receiver, retry, and receipt transaction are covered\n` +
    `- [ ] typecheck, schema drift, and compatibility checks pass\n`;
}

function findContract(value) {
  if (!value) return undefined;
  const [contractId, version] = String(value).split('@');
  return discoverContracts().find((contract) => contract.contractId === contractId && (!version || contract.version === version));
}

function readSchema(contract) {
  const schemas = readSchemas(contract);
  return schemas.get('payload.schema.json') ?? schemas.values().next().value;
}

function readSchemas(contract) {
  const result = new Map();
  for (const artifact of Object.keys(contract.artifacts).filter((name) => name.endsWith('.schema.json')).sort()) {
    result.set(artifact, JSON.parse(readFileSync(join(root, dirname(contract.source), artifact), 'utf8')));
  }
  return result;
}

function readFrontmatter(path) {
  const content = readFileSync(path, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/u);
  if (!match) return {};
  return parseYaml(match[1]);
}

function parseYaml(content) {
  const rootValue = {};
  const stack = [{ indent: -1, value: rootValue }];
  const lines = content.split(/\r?\n/u);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();
    while (stack.length > 1 && indent <= stack.at(-1).indent) stack.pop();
    const parent = stack.at(-1).value;
    if (line.startsWith('- ')) { if (Array.isArray(parent)) parent.push(parseScalar(line.slice(2))); continue; }
    const separator = line.indexOf(':');
    if (separator < 0 || !parent || typeof parent !== 'object') continue;
    const key = line.slice(0, separator).trim().replace(/^['"]|['"]$/gu, '');
    const rawValue = line.slice(separator + 1).trim();
    if (!rawValue) {
      const nextLine = lines.slice(lineIndex + 1).find((candidate) => candidate.trim() && !candidate.trim().startsWith('#')) ?? '';
      const next = nextLine.trim().startsWith('- ') ? [] : {};
      parent[key] = next;
      stack.push({ indent, value: next });
    } else if (rawValue === '[]') parent[key] = [];
    else parent[key] = parseScalar(rawValue);
  }
  return rootValue;
}

function parseScalar(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/u.test(value)) return Number(value);
  if (value.startsWith('[') && value.endsWith(']')) return value.slice(1, -1).split(',').map((item) => item.trim()).filter(Boolean).map(parseScalar);
  return value;
}

function ensureInside(parent, child) {
  const parentPath = realpathSafe(parent);
  const childPath = realpathWithMissingSegments(child);
  if (childPath !== parentPath && !childPath.startsWith(`${parentPath}${sep}`)) throw new Error(`Path escapes allowed root: ${child}`);
}

function resolveTarget(value) {
  const target = resolve(process.cwd(), value);
  return target;
}

function realpathSafe(path) { return existsSync(path) ? realpathSync(path) : resolve(path); }
function realpathWithMissingSegments(path) {
  let current = resolve(path);
  const missing = [];
  while (!existsSync(current)) {
    missing.push(current.slice(current.lastIndexOf(sep) + 1));
    const parent = dirname(current);
    if (parent === current) return resolve(path);
    current = parent;
  }
  return join(realpathSync(current), ...missing.reverse());
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function canonicalJson(value) { if (value === null || typeof value !== 'object') return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`; return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`; }
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'); }
function renderIndex(index) { return `# Integration Contract Index\n\n| Contract | Kind | Version | Status | Interaction | Latest approved | Used by | Digest |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${index.contracts.map((contract) => `| \`${contract.contractId}\` | ${contract.kind} | ${contract.version} | ${contract.status} | ${contract.interaction ?? ''} | ${contract.latestApprovedVersion ?? ''} | ${(contract.usedByApps ?? []).join(', ')} | \`${contract.digest}\` |`).join('\n')}\n`; }
function capabilitySkeleton(id, version) { return `---\ntype: integration-contract\ncontract_kind: capability\ncontract_id: ${id}\nversion: ${version}\nstatus: draft\ninteraction: command\ntransport: http\nprovider: provider-app\ncallers:\n  - caller-app\nmaintainer: provider-app\nrequired_reviewers:\n  - caller-app\n---\n\n# ${id}\n\n## Purpose\n\nDescribe the capability.\n\n## Participants and ownership\n\n## Trigger and business semantics\n\n## Request / response or event schema\n\n## Authentication and authorization\n\n## Idempotency and retry\n\n## Errors and failure handling\n\n## Observability and audit\n\n## Compatibility and versioning\n\n## Acceptance scenarios\n\n## Open decisions\n`; }
function bindingSkeleton(id, version) { return `---\ntype: integration-contract\ncontract_kind: binding\ncontract_id: ${id}\nversion: ${version}\nstatus: draft\ninteraction: command\ntransport: http\nsource_app: caller-app\ndestination_app: provider-app\ncapability_ref:\n  contract_id: provider.capability\n  version: 1.0.0\n  digest: sha256:replace-me\nmaintainer: provider-app\nrequired_reviewers:\n  - caller-app\n---\n\n# ${id}\n\n## Purpose\n\nDescribe the point-to-point binding.\n\n## Participants and ownership\n\n## Trigger and business semantics\n\n## Request / response or event schema\n\n## Authentication and authorization\n\n## Idempotency and retry\n\n## Errors and failure handling\n\n## Observability and audit\n\n## Compatibility and versioning\n\n## Acceptance scenarios\n\n## Open decisions\n`; }
function typescriptType(schema) {
  if (!schema || typeof schema !== 'object') return 'unknown';
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (Array.isArray(schema.type)) return schema.type.map((type) => typescriptType({ ...schema, type })).join(' | ');
  if (schema.type === 'object') {
    const properties = Object.entries(schema.properties ?? {}).map(([key, child]) => `${JSON.stringify(key)}${(schema.required ?? []).includes(key) ? '' : '?'}: ${typescriptType(child)};`);
    return `{ ${properties.join(' ')}${schema.additionalProperties === false ? '' : ' [key: string]: unknown;'} }`;
  }
  if (schema.type === 'array') return `Array<${typescriptType(schema.items ?? {})}>`;
  if (schema.type === 'integer' || schema.type === 'number') return 'number';
  if (schema.type === 'boolean' || schema.type === 'string' || schema.type === 'null') return schema.type;
  if (schema.anyOf || schema.oneOf) return (schema.anyOf ?? schema.oneOf).map(typescriptType).join(' | ');
  if (schema.allOf) return schema.allOf.map(typescriptType).join(' & ');
  return 'unknown';
}
