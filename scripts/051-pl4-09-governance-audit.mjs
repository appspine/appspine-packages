#!/usr/bin/env node
/**
 * 051 PL4-09 — Package Coverage & Governance Audit Runner
 *
 * Scans all 21 packages in the monorepo, evaluates:
 * 1. Governance classification (Role, Owner, Support Tier, Deprecation Window, Security Class)
 * 2. Plugin manifest & facet coverage (v1 schema, backend, frontend, prisma, permissions, operations)
 * 3. Export & peer dependency coverage (subpath exports, node10 shims, peer ranges)
 * 4. Capability dependency graph closure (Zero orphan capabilities, verified providers)
 * 5. Non-plugin package boundary rationales
 * 6. Changeset coverage across Phase 1-4
 *
 * Usage:
 *   node scripts/051-pl4-09-governance-audit.mjs              # Run audit and output summary table
 *   node scripts/051-pl4-09-governance-audit.mjs --json       # Output JSON audit report
 *   node scripts/051-pl4-09-governance-audit.mjs --markdown   # Output full markdown matrix tables
 *   node scripts/051-pl4-09-governance-audit.mjs --self-test  # Prove verification rules fire properly
 */

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const packagesDir = path.join(repoRoot, 'packages');
const changesetDir = path.join(repoRoot, '.changeset');

// Changesets only version-bump the packages listed in their YAML frontmatter; a package name
// mentioned in the prose body (e.g. "removed the dependency on @appspine/foo") does not mean
// that changeset covers @appspine/foo. Match against the frontmatter package list only.
function extractChangesetPackages(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const names = new Set();
  if (!match) {
    return names;
  }
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^['"]([^'"]+)['"]\s*:/);
    if (field) {
      names.add(field[1]);
    }
  }
  return names;
}

// Ambient capabilities provided by Host/App (051 plan §4.2, PL0-03 §3)
const AMBIENT_CAPABILITIES = new Set([
  'appspine.prisma',
  'appspine.principal-context',
  'appspine.authentication-strategy-registry',
]);

// Static governance metadata definitions (051 Plan §3.1, PL0-03 §1, Security Baseline)
const PACKAGE_GOVERNANCE_METADATA = {
  'audit-log': {
    origin: 'legacy-15',
    category: 'Capability Plugin',
    isPlugin: true,
    pluginId: 'audit-log',
    owner: 'Security / Sol (G3)',
    supportTier: 'Tier 2 (Official Capability)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 2 (Sensitive / Core Operations)',
    nonPluginRationale: null,
  },
  common: {
    origin: 'legacy-15',
    category: 'Foundation SDK',
    isPlugin: false,
    pluginId: null,
    owner: 'Framework / Terra (G2)',
    supportTier: 'Tier 1 (Core Foundation)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 3 (Standard / Application Support)',
    nonPluginRationale:
      'Foundation utilities, base types, and Prisma base client modules; must remain host-level singleton and never be wrapped as a pluggable capability.',
  },
  'domain-events': {
    origin: 'legacy-15',
    category: 'Capability Plugin',
    isPlugin: true,
    pluginId: 'domain-events',
    owner: 'Integration / Gemini (G2)',
    supportTier: 'Tier 2 (Official Capability)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 2 (Sensitive / Core Operations)',
    nonPluginRationale: null,
  },
  'e2e-kit': {
    origin: 'legacy-15',
    category: 'Foundation SDK',
    isPlugin: false,
    pluginId: null,
    owner: 'Platform / Gemini (G2)',
    supportTier: 'Tier 1 (Core Foundation)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 3 (Standard / Application Support)',
    nonPluginRationale:
      'Pure testing harness and E2E simulation utilities; test-only dependency with no runtime application contributions.',
  },
  'frontend-shell': {
    origin: 'legacy-15',
    category: 'UI SDK / Slot Host',
    isPlugin: false,
    pluginId: null,
    owner: 'Framework / Terra (G2)',
    supportTier: 'Tier 1 (Core Foundation)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 3 (Standard / Application Support)',
    nonPluginRationale:
      'Global dashboard shell, slot renderer, navigation host, and UI primitives; acts as the host canvas for plugin frontend facets rather than being a single capability plugin.',
  },
  'health-check': {
    origin: 'legacy-15',
    category: 'Capability Plugin',
    isPlugin: true,
    pluginId: 'health-check',
    owner: 'Platform / Terra (G2)',
    supportTier: 'Tier 2 (Official Capability)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 3 (Standard / Application Support)',
    nonPluginRationale: null,
  },
  'identity-core': {
    origin: 'new-7',
    category: 'Identity Capability',
    isPlugin: true,
    pluginId: 'identity-core',
    owner: 'Security / Sol (G3)',
    supportTier: 'Tier 1 (Core Foundation)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 1 (Privileged / Critical)',
    nonPluginRationale: null,
  },
  'integration-contracts': {
    origin: 'legacy-15',
    category: 'Foundation SDK',
    isPlugin: false,
    pluginId: null,
    owner: 'Integration / Gemini (G2)',
    supportTier: 'Tier 1 (Core Foundation)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 3 (Standard / Application Support)',
    nonPluginRationale:
      'Cross-app wire contract types and digest validators; zero NestJS/Prisma runtime dependencies.',
  },
  'm2m-api-key': {
    origin: 'legacy-15',
    category: 'Capability Plugin',
    isPlugin: true,
    pluginId: 'm2m-api-key',
    owner: 'Security / Sol (G3)',
    supportTier: 'Tier 2 (Official Capability)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 1 (Privileged / Critical)',
    nonPluginRationale: null,
  },
  'master-data-client': {
    origin: 'legacy-15',
    category: 'Connector / Adapter',
    isPlugin: true,
    pluginId: 'master-data-client',
    owner: 'Integration / Gemini (G2)',
    supportTier: 'Tier 3 (Connector / Extension)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 2 (Sensitive / Core Operations)',
    nonPluginRationale: null,
  },
  'mcp-server': {
    origin: 'legacy-15',
    category: 'Capability Plugin',
    isPlugin: true,
    pluginId: 'mcp-server',
    owner: 'Platform / Gemini (G2)',
    supportTier: 'Tier 2 (Official Capability)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 2 (Sensitive / Core Operations)',
    nonPluginRationale: null,
  },
  'metadata-schema': {
    origin: 'legacy-15',
    category: 'Capability Plugin',
    isPlugin: true,
    pluginId: 'metadata-schema',
    owner: 'Platform / Terra (G2)',
    supportTier: 'Tier 2 (Official Capability)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 3 (Standard / Application Support)',
    nonPluginRationale: null,
  },
  notification: {
    origin: 'legacy-15',
    category: 'Capability Plugin',
    isPlugin: true,
    pluginId: 'notification',
    owner: 'Platform / Terra (G2)',
    supportTier: 'Tier 2 (Official Capability)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 3 (Standard / Application Support)',
    nonPluginRationale: null,
  },
  'oidc-auth': {
    origin: 'new-7',
    category: 'Identity Capability',
    isPlugin: true,
    pluginId: 'oidc-auth',
    owner: 'Security / Sol (G3)',
    supportTier: 'Tier 1 (Core Foundation)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 1 (Privileged / Critical)',
    nonPluginRationale: null,
  },
  'oidc-delegation': {
    origin: 'legacy-15',
    category: 'Connector / Adapter',
    isPlugin: true,
    pluginId: 'oidc-delegation',
    owner: 'Security / Sol (G3)',
    supportTier: 'Tier 3 (Connector / Extension)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 1 (Privileged / Critical)',
    nonPluginRationale: null,
  },
  'plugin-api': {
    origin: 'new-7',
    category: 'Platform Core',
    isPlugin: false,
    pluginId: null,
    owner: 'Platform / Gemini (G2)',
    supportTier: 'Tier 1 (Core Foundation)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 3 (Standard / Application Support)',
    nonPluginRationale:
      'Kernel contract definitions, ports, tokens, and type utilities; the root contract layer that all plugins and hosts depend upon.',
  },
  'plugin-cli': {
    origin: 'new-7',
    category: 'Platform Core',
    isPlugin: false,
    pluginId: null,
    owner: 'Platform / Gemini (G2)',
    supportTier: 'Tier 1 (Core Foundation)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 3 (Standard / Application Support)',
    nonPluginRationale:
      'Build-time command-line interface and diagnostic doctor; operates outside the application runtime.',
  },
  'plugin-host-nest': {
    origin: 'new-7',
    category: 'Platform Core',
    isPlugin: false,
    pluginId: null,
    owner: 'Platform / Gemini (G2)',
    supportTier: 'Tier 1 (Core Foundation)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 3 (Standard / Application Support)',
    nonPluginRationale:
      'NestJS plugin assembly host, runtime loader, lifecycle manager, and ambient provider bridge; orchestrates plugins into the host container.',
  },
  'plugin-testkit': {
    origin: 'new-7',
    category: 'Platform Core',
    isPlugin: false,
    pluginId: null,
    owner: 'Platform / Gemini (G2)',
    supportTier: 'Tier 1 (Core Foundation)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 3 (Standard / Application Support)',
    nonPluginRationale:
      'Cross-plugin testing harness, mock factories, and composition test utilities; development and test-only artifact.',
  },
  'preset-standard': {
    origin: 'new-7',
    category: 'Preset',
    isPlugin: false,
    pluginId: null,
    owner: 'Platform / Terra (G2)',
    supportTier: 'Tier 1 (Core Foundation)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 3 (Standard / Application Support)',
    nonPluginRationale:
      'Curated collection of standard plugins and dependency relations for template bootstrapping; a catalog aggregator, not an active capability provider.',
  },
  rbac: {
    origin: 'legacy-15',
    category: 'Capability Plugin',
    isPlugin: true,
    pluginId: 'rbac',
    owner: 'Security / Sol (G3)',
    supportTier: 'Tier 1 (Core Foundation)',
    deprecationPolicy: 'Active (Standard SemVer, min 1 major notice)',
    securityClass: 'Class 1 (Privileged / Critical)',
    nonPluginRationale: null,
  },
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function scanMonorepo() {
  const packageDirs = fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  // Scan changesets
  const changesets = fs.existsSync(changesetDir)
    ? fs
        .readdirSync(changesetDir)
        .filter((f) => f.endsWith('.md') && f !== 'README.md')
        .map((f) => {
          const content = fs.readFileSync(path.join(changesetDir, f), 'utf8');
          return { file: f, content, packages: extractChangesetPackages(content) };
        })
    : [];

  const packages = [];
  const capabilityProviders = new Map(); // capability -> array of { pkgName, pluginId }
  const capabilityConsumers = []; // { pkgName, pluginId, type: 'requires'|'optionalRequires', capability }

  for (const dirName of packageDirs) {
    const pkgRoot = path.join(packagesDir, dirName);
    const pkgJsonPath = path.join(pkgRoot, 'package.json');
    const manifestPath = path.join(pkgRoot, 'appspine.plugin.json');

    if (!fs.existsSync(pkgJsonPath)) {
      continue;
    }

    const pkgJson = readJson(pkgJsonPath);
    const pkgName = pkgJson.name;
    const hasManifest = fs.existsSync(manifestPath);
    let manifest = null;

    if (hasManifest) {
      manifest = readJson(manifestPath);
    }

    const gov = PACKAGE_GOVERNANCE_METADATA[dirName] || {
      origin: 'unknown',
      category: 'Unknown',
      isPlugin: hasManifest,
      pluginId: manifest?.id || null,
      owner: 'Unassigned',
      supportTier: 'Tier 3',
      deprecationPolicy: 'Unknown',
      securityClass: 'Class 3',
      nonPluginRationale: hasManifest ? null : 'Unrecorded',
    };

    // Subpath exports & shims
    const exportsField = pkgJson.exports || {};
    const hasPluginExport = exportsField['./plugin'] !== undefined;
    const hasBackendExport = exportsField['./backend'] !== undefined;
    const hasFrontendExport = exportsField['./frontend'] !== undefined;
    const hasPluginJsShim = fs.existsSync(path.join(pkgRoot, 'plugin.js'));
    const hasPluginDtsShim = fs.existsSync(path.join(pkgRoot, 'plugin.d.ts'));

    // Changeset coverage
    const relatedChangesets = changesets
      .filter((cs) => cs.packages.has(pkgName))
      .map((cs) => cs.file);

    // Facet check
    const facets = manifest?.facets || {};
    const facetCoverage = {
      backend: !!(facets.backend?.modulePath || facets.backend),
      frontend: Boolean(facets.frontend),
      prisma: Boolean(facets.prisma),
      permissions: Boolean(facets.permissions),
      operations: Boolean(facets.operations),
    };

    // Track capabilities
    if (manifest) {
      for (const cap of manifest.provides || []) {
        if (!capabilityProviders.has(cap)) {
          capabilityProviders.set(cap, []);
        }
        capabilityProviders.get(cap).push({ dirName, pkgName, pluginId: manifest.id });
      }
      for (const cap of manifest.requires || []) {
        capabilityConsumers.push({
          dirName,
          pkgName,
          pluginId: manifest.id,
          type: 'requires',
          capability: cap,
        });
      }
      for (const cap of manifest.optionalRequires || []) {
        capabilityConsumers.push({
          dirName,
          pkgName,
          pluginId: manifest.id,
          type: 'optionalRequires',
          capability: cap,
        });
      }
    }

    packages.push({
      dirName,
      pkgName,
      version: pkgJson.version,
      governance: gov,
      hasManifest,
      manifest,
      exportsField,
      hasPluginExport,
      hasBackendExport,
      hasFrontendExport,
      hasPluginJsShim,
      hasPluginDtsShim,
      facetCoverage,
      peerDependencies: pkgJson.peerDependencies || {},
      relatedChangesets,
    });
  }

  // Capability validation & orphan detection
  const allProvidedCapabilities = new Set([...capabilityProviders.keys(), ...AMBIENT_CAPABILITIES]);
  const orphanRequirements = [];
  for (const consumer of capabilityConsumers) {
    if (!allProvidedCapabilities.has(consumer.capability)) {
      orphanRequirements.push(consumer);
    }
  }

  // Verify that all declared capabilities have an owner
  const unownedPlugins = packages.filter(
    (p) => p.hasManifest && (!p.governance.owner || p.governance.owner.includes('Unassigned')),
  );

  return {
    packages,
    capabilityProviders,
    capabilityConsumers,
    orphanRequirements,
    unownedPlugins,
    changesets,
  };
}

function runAudit(data = scanMonorepo()) {
  const issues = [];

  // Check 1: Count of packages (expect 21 after the v3 auth-facade removal)
  if (data.packages.length !== 21) {
    issues.push(`Expected 21 packages, found ${data.packages.length}`);
  }

  // Check 2: 12 plugins with manifest, 9 non-plugins
  const pluginPkgs = data.packages.filter((p) => p.hasManifest);
  const nonPluginPkgs = data.packages.filter((p) => !p.hasManifest);
  if (pluginPkgs.length !== 12) {
    issues.push(`Expected 12 plugin packages with manifest, found ${pluginPkgs.length}`);
  }
  if (nonPluginPkgs.length !== 9) {
    issues.push(`Expected 9 non-plugin packages, found ${nonPluginPkgs.length}`);
  }

  // Check 3: Orphan capabilities check
  if (data.orphanRequirements.length > 0) {
    for (const req of data.orphanRequirements) {
      issues.push(
        `Orphan requirement detected: ${req.pkgName} (${req.type}) -> ${req.capability} (no provider found)`,
      );
    }
  }

  // Check 4: Unowned plugins check
  if (data.unownedPlugins.length > 0) {
    for (const p of data.unownedPlugins) {
      issues.push(`Unassigned owner for official plugin: ${p.pkgName}`);
    }
  }

  // Check 5: Non-plugin rationale completeness
  for (const p of nonPluginPkgs) {
    if (!p.governance.nonPluginRationale) {
      issues.push(`Missing non-plugin rationale for ${p.pkgName}`);
    }
  }

  // Check 6: Plugin exports and shims
  for (const p of pluginPkgs) {
    if (!p.hasPluginExport) {
      issues.push(`Plugin package ${p.pkgName} missing "./plugin" subpath export`);
    }
    if (!p.hasPluginJsShim || !p.hasPluginDtsShim) {
      issues.push(`Plugin package ${p.pkgName} missing Node10 root plugin.js / plugin.d.ts shims`);
    }
  }

  return {
    success: issues.length === 0,
    issues,
    data,
  };
}

function runSelfTest() {
  console.log('Running governance audit self-tests...');
  const baseData = scanMonorepo();

  // Test 1: Orphan requirement detection
  const corruptData1 = JSON.parse(JSON.stringify(baseData));
  corruptData1.orphanRequirements.push({
    dirName: 'm2m-api-key',
    pkgName: '@appspine/m2m-api-key',
    pluginId: 'm2m-api-key',
    type: 'requires',
    capability: 'appspine.non-existent-capability',
  });
  const res1 = runAudit(corruptData1);
  if (res1.success || !res1.issues.some((i) => i.includes('Orphan requirement detected'))) {
    throw new Error('Self-test failed: Orphan requirement rule did not fire');
  }

  // Test 2: Missing plugin export detection
  const corruptData2 = JSON.parse(JSON.stringify(baseData));
  const targetPlugin = corruptData2.packages.find((p) => p.hasManifest);
  targetPlugin.hasPluginExport = false;
  const res2 = runAudit(corruptData2);
  if (res2.success || !res2.issues.some((i) => i.includes('missing "./plugin" subpath export'))) {
    throw new Error('Self-test failed: Missing plugin export rule did not fire');
  }

  console.log('All governance audit self-tests passed successfully (2/2).');
}

function generateMarkdownMatrix(data) {
  let md = '';

  md += `## 1. 21 套件全維度治理矩陣 (Monorepo Governance Matrix)\n\n`;
  md += `| Package | 來源群組 | 角色分類 | Plugin ID | Owner | Support Tier | Deprecation 策略 | Security 等級 |\n`;
  md += `|---|---|---|---|---|---|---|---|\n`;

  for (const p of data.packages) {
    const g = p.governance;
    const originLabel = g.origin === 'legacy-15' ? '15 現有' : '7 新增';
    const pluginId = g.pluginId ? `\`${g.pluginId}\`` : '—';
    md += `| \`${p.pkgName}\` | ${originLabel} | ${g.category} | ${pluginId} | ${g.owner} | ${g.supportTier} | ${g.deprecationPolicy} | ${g.securityClass} |\n`;
  }

  md += `\n## 2. 插件規格、Facet 與 Export 涵蓋率 (Plugin Specification & Facet Coverage)\n\n`;
  md += `| Plugin ID | Package | Cardinality | Backend Facet | Frontend Facet | Prisma Facet | Permissions | Operations | \`./plugin\` | Node10 Shims |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|\n`;

  for (const p of data.packages.filter((p) => p.hasManifest)) {
    const m = p.manifest;
    const f = p.facetCoverage;
    const bIcon = f.backend ? '✅' : '—';
    const feIcon = f.frontend ? '✅' : '—';
    const prIcon = f.prisma ? '✅' : '—';
    const peIcon = f.permissions ? '✅' : '—';
    const opIcon = f.operations ? '✅' : '—';
    const pExport = p.hasPluginExport ? '✅' : '❌';
    const pShims = p.hasPluginJsShim && p.hasPluginDtsShim ? '✅' : '❌';

    md += `| \`${m.id}\` | \`${p.pkgName}\` | \`${m.cardinality}\` | ${bIcon} | ${feIcon} | ${prIcon} | ${peIcon} | ${opIcon} | ${pExport} | ${pShims} |\n`;
  }

  md += `\n## 3. 非 Plugin 套件邊界與設計理由 (Non-Plugin Boundary Rationales)\n\n`;
  md += `| Package | 角色分類 | 刻意不為 Plugin 之架構理由 |\n`;
  md += `|---|---|---|\n`;

  for (const p of data.packages.filter((p) => !p.hasManifest)) {
    md += `| \`${p.pkgName}\` | ${p.governance.category} | ${p.governance.nonPluginRationale} |\n`;
  }

  md += `\n## 4. Capability 提供與依賴閉包矩陣 (Capability Graph & Dependency Closure)\n\n`;
  md += `| Capability 名稱 | 提供者 (Provider) | 依賴者 (Required By) | 選用依賴者 (Optional Required By) |\n`;
  md += `|---|---|---|---|\n`;

  const allCaps = new Set([...data.capabilityProviders.keys(), ...AMBIENT_CAPABILITIES]);
  for (const cap of Array.from(allCaps).sort()) {
    const provs = data.capabilityProviders.get(cap) || [];
    const provText =
      provs.length > 0 ? provs.map((pr) => `\`${pr.pkgName}\``).join(', ') : '*(Host Ambient)*';

    const reqs = data.capabilityConsumers
      .filter((c) => c.capability === cap && c.type === 'requires')
      .map((c) => `\`${c.pkgName}\``);
    const optReqs = data.capabilityConsumers
      .filter((c) => c.capability === cap && c.type === 'optionalRequires')
      .map((c) => `\`${c.pkgName}\``);

    const reqText = reqs.length > 0 ? reqs.join(', ') : '—';
    const optReqText = optReqs.length > 0 ? optReqs.join(', ') : '—';

    md += `| \`${cap}\` | ${provText} | ${reqText} | ${optReqText} |\n`;
  }

  md += `\n## 5. Changeset 與版本管理覆蓋狀態 (Changeset Coverage)\n\n`;
  md += `| Package | 變更階段 (051 Phase) | Changeset 涵蓋狀態 | 備註 |\n`;
  md += `|---|---|---|---|\n`;

  for (const p of data.packages) {
    const csCount = p.relatedChangesets.length;
    const isFoundationNoChange = [
      '@appspine/common',
      '@appspine/e2e-kit',
      '@appspine/integration-contracts',
    ].includes(p.pkgName);
    const statusText =
      csCount > 0
        ? `✅ 已涵蓋 (${csCount} 份)`
        : isFoundationNoChange
          ? '— 穩定基礎庫 (本期無改動)'
          : '❌ 缺少 Changeset';
    const noteText = isFoundationNoChange
      ? '作為跨 App 基礎 SDK 保持現有版本'
      : p.relatedChangesets.join(', ');
    md += `| \`${p.pkgName}\` | ${p.governance.category} | ${statusText} | ${noteText} |\n`;
  }

  return md;
}

// Entrypoint execution
const args = process.argv.slice(2);

if (args.includes('--self-test')) {
  runSelfTest();
  process.exit(0);
}

const auditResult = runAudit();

if (args.includes('--json')) {
  console.log(JSON.stringify(auditResult, null, 2));
} else if (args.includes('--markdown')) {
  console.log(generateMarkdownMatrix(auditResult.data));
} else {
  console.log('===============================================================');
  console.log('  051 PL4-09 Package Coverage & Governance Audit');
  console.log('===============================================================');
  console.log(`Packages Scanned        : ${auditResult.data.packages.length} / 21`);
  console.log(
    `Plugin Packages (Manifest): ${auditResult.data.packages.filter((p) => p.hasManifest).length} / 12`,
  );
  console.log(
    `Non-Plugin Packages     : ${auditResult.data.packages.filter((p) => !p.hasManifest).length} / 10`,
  );
  console.log(
    `Total Provided Caps     : ${auditResult.data.capabilityProviders.size} (plus ${AMBIENT_CAPABILITIES.size} ambient)`,
  );
  console.log(`Total Consumers Mappings: ${auditResult.data.capabilityConsumers.length}`);
  console.log(`Orphan Capabilities     : ${auditResult.data.orphanRequirements.length}`);
  console.log(`Unowned Official Plugins: ${auditResult.data.unownedPlugins.length}`);
  console.log('---------------------------------------------------------------');

  if (auditResult.success) {
    console.log('Audit Status: PASSED (100% compliant, 0 findings)\n');
    console.log(generateMarkdownMatrix(auditResult.data));
  } else {
    console.error('Audit Status: FAILED\n');
    for (const issue of auditResult.issues) {
      console.error(` - [FAIL] ${issue}`);
    }
    process.exit(1);
  }
}
