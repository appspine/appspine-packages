/**
 * The config / secret boundary (PL2-01).
 *
 * 051 plan §7 splits four owners, and this module enforces the two edges the CLI can actually see:
 *
 *   - `appspine.plugins.json` holds a *reference* (`configRef`), never a value, and never a
 *     credential. It is committed, reviewed and pasted into tickets.
 *   - build-time validation only requires that the secret env keys a manifest declares are
 *     *declared*. It never requires the production value, and must never read one — a CLI that
 *     needs `OIDC_CLIENT_SECRET` to tell you your inventory is valid is a CLI nobody can run in CI.
 *
 * The third edge — the actual config values in `appspine.config.ts` — is deliberately out of
 * scope: that file is TypeScript, and evaluating an App's code to inspect it would trade a real
 * guarantee for a convenience. The host validates those values at boot, where the schemas are.
 */

import {
  diagnostic,
  type EnvironmentContribution,
  isSecretLookingKey,
  type PluginDiagnostic,
  type PluginManifestV1,
} from '@appspine/plugin-api';
import type { InventoryFile } from './inventory-file';

/**
 * Values that look like a credential rather than a reference.
 *
 * A `configRef` is a dotted path into the App's config tree — `masterData.hr`. Anything with
 * whitespace, a URL scheme, a long opaque run of base64-ish characters or a private key header is
 * not a path, and the most likely explanation is that somebody pasted a value where a name goes.
 */
const CREDENTIAL_SHAPED =
  /\s|:\/\/|-----BEGIN |^[A-Za-z0-9+/]{32,}={0,2}$|^[A-Fa-f0-9]{32,}$|^(sk|pk|ghp|gho|xox[abpr])[-_]/;

export interface SecretBoundaryOptions {
  /** Manifests for the plugins in the inventory, keyed by plugin id. Optional: shape checks run either way. */
  manifests?: ReadonlyMap<string, PluginManifestV1>;
}

/**
 * Every rule that can be checked without reading a config value or executing anything.
 *
 * Returns diagnostics rather than throwing, because `plugin validate` wants all of them at once
 * and a caller that only wants a yes/no can look at the severities.
 */
export function checkConfigBoundary(
  inventory: InventoryFile,
  options: SecretBoundaryOptions = {},
): PluginDiagnostic[] {
  const diagnostics: PluginDiagnostic[] = [];

  inventory.plugins.forEach((entry, index) => {
    if (entry.configRef === undefined) return;

    if (CREDENTIAL_SHAPED.test(entry.configRef)) {
      // The offending text is never echoed back. If this fired because somebody pasted a real
      // secret, repeating it in the diagnostic would put it straight into the CI log this tool
      // was supposed to keep it out of.
      diagnostics.push(
        diagnostic(
          'secret-value-in-inventory',
          'configRef looks like a value, not a dotted path into the App config. The inventory is committed and must never contain a credential; put the value in the environment and reference it from appspine.config.ts',
          { instanceId: entry.instanceId, path: `plugins[${index}].configRef` },
        ),
      );
      return;
    }

    const segments = entry.configRef.split('.');
    if (segments.some((segment) => isSecretLookingKey(segment))) {
      diagnostics.push(
        diagnostic(
          'secret-looking-config-ref',
          `configRef segment names a secret ("${entry.configRef}"). A configRef points at a config branch; credentials belong in the environment, declared as manifest environment keys`,
          { instanceId: entry.instanceId, path: `plugins[${index}].configRef` },
        ),
      );
    }

    const manifest = options.manifests?.get(pluginIdOfRef(entry.plugin));
    if (!manifest) return;

    const declared = manifest.configSchema?.configRef;
    if (declared === undefined) {
      diagnostics.push(
        diagnostic(
          'config-ref-not-declared',
          `"${manifest.id}" declares no configSchema, so it takes no configRef`,
          {
            pluginId: manifest.id,
            instanceId: entry.instanceId,
            path: `plugins[${index}].configRef`,
          },
        ),
      );
    } else if (declared !== entry.configRef) {
      diagnostics.push(
        diagnostic(
          'config-ref-mismatch',
          `inventory configRef "${entry.configRef}" does not match the manifest's "${declared}"`,
          {
            pluginId: manifest.id,
            instanceId: entry.instanceId,
            path: `plugins[${index}].configRef`,
          },
        ),
      );
    }
  });

  return diagnostics;
}

function pluginIdOfRef(pluginRef: string): string {
  const slash = pluginRef.lastIndexOf('/');
  return slash === -1 ? pluginRef : pluginRef.slice(slash + 1);
}

export interface EnvironmentRequirement {
  pluginId: string;
  key: string;
  required: boolean;
  secret: boolean;
  description?: string;
}

/**
 * The env keys an inventory's plugins declare — names and flags only.
 *
 * `plugin doctor` (PL2-03) reports which of these are *missing*; it can do that from
 * `process.env` key presence without ever reading a value, and this function never touches the
 * environment at all.
 */
export function environmentRequirements(
  manifests: readonly PluginManifestV1[],
): EnvironmentRequirement[] {
  const out: EnvironmentRequirement[] = [];
  for (const manifest of manifests) {
    for (const entry of manifest.environment ?? []) {
      out.push({
        pluginId: manifest.id,
        key: entry.key,
        required: entry.required,
        secret: entry.secret,
        ...(entry.description ? { description: entry.description } : {}),
      });
    }
  }
  return out.sort((a, b) => {
    const left = [a.pluginId, a.key].join(' ');
    const right = [b.pluginId, b.key].join(' ');
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

/**
 * A typed stub for `appspine.config.ts`, as text.
 *
 * 051 plan §7: the CLI must not rewrite arbitrary TypeScript. So it emits a block for a developer
 * to paste and review, with a TODO for every value it cannot know, rather than reaching into their
 * config file with a regular expression. Emitting text nobody applies automatically is the point,
 * not a limitation.
 */
export function configStub(manifest: PluginManifestV1): string {
  const configRef = manifest.configSchema?.configRef;
  const lines: string[] = [];

  lines.push(`// ${manifest.displayName ?? manifest.id} (${manifest.id})`);

  if (configRef) {
    lines.push(`// Add under \`runtime\` in appspine.config.ts:`);
    lines.push(...configRefStub(configRef));
  } else {
    lines.push('// No configSchema: this plugin takes no App config.');
  }

  const environment = manifest.environment ?? [];
  if (environment.length > 0) {
    lines.push('//');
    lines.push('// Environment keys (set by the operator, never in this file):');
    for (const entry of sortedEnvironment(environment)) {
      const flags = [entry.required ? 'required' : 'optional', entry.secret ? 'secret' : 'public'];
      lines.push(`//   ${entry.key} — ${flags.join(', ')}${describe(entry)}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function configRefStub(configRef: string): string[] {
  const segments = configRef.split('.');
  const lines: string[] = [];
  segments.forEach((segment, depth) => {
    lines.push(`${'  '.repeat(depth)}${segment}: {`);
  });
  lines.push(`${'  '.repeat(segments.length)}// TODO: values for this plugin's config schema.`);
  for (let depth = segments.length - 1; depth >= 0; depth -= 1) {
    lines.push(`${'  '.repeat(depth)}},`);
  }
  return lines;
}

function sortedEnvironment(
  environment: readonly EnvironmentContribution[],
): EnvironmentContribution[] {
  return [...environment].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

function describe(entry: EnvironmentContribution): string {
  return entry.description ? ` — ${entry.description}` : '';
}
