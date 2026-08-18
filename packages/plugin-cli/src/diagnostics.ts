/**
 * Machine-readable command results (PL2-01).
 *
 * Every command returns one of these, and the CLI renders it either as text for a human or as a
 * single JSON document for a script. Both renderings come from the same object on purpose: a
 * `--json` output that can drift from what the operator saw on screen is worse than no `--json`
 * at all.
 *
 * The diagnostic shape is `@appspine/plugin-api`'s, not a second one. A conflict found by the
 * resolver and a conflict found by the CLI should be indistinguishable to whatever consumes them.
 */

import type { PluginDiagnostic } from '@appspine/plugin-api';
import { type ExitCodeValue, exitCodeName } from './exit-codes';

export interface CommandResult {
  command: string;
  exitCode: ExitCodeValue;
  diagnostics: PluginDiagnostic[];
  /**
   * Command-specific payload — the inventory `list` rendered, the plan `add` would apply. Must be
   * JSON-serialisable and must never carry a config *value*: this document is routinely pasted
   * into a CI log.
   */
  data?: unknown;
}

export interface JsonEnvelope {
  /** Schema of this document, so a consumer can tell v1 output from a later shape. */
  schemaVersion: 'appspine.cli-result/v1';
  ok: boolean;
  command: string;
  exitCode: number;
  /** Symbolic name of `exitCode`; scripts should match on this rather than on the number. */
  exitCodeName: string;
  diagnostics: PluginDiagnostic[];
  data?: unknown;
}

export const CLI_RESULT_SCHEMA_VERSION = 'appspine.cli-result/v1' as const;

export function toJsonEnvelope(result: CommandResult): JsonEnvelope {
  const envelope: JsonEnvelope = {
    schemaVersion: CLI_RESULT_SCHEMA_VERSION,
    ok: result.exitCode === 0,
    command: result.command,
    exitCode: result.exitCode,
    exitCodeName: exitCodeName(result.exitCode),
    diagnostics: result.diagnostics,
  };
  if (result.data !== undefined) envelope.data = result.data;
  return envelope;
}

const SEVERITY_LABEL: Record<PluginDiagnostic['severity'], string> = {
  error: 'error',
  warning: 'warn',
  info: 'info',
};

/**
 * Human rendering. Deliberately plain — no colour, no box drawing, no spinner. This output ends up
 * in CI logs and issue reports far more often than in an interactive terminal, and escape codes
 * make both harder to read.
 */
export function renderText(result: CommandResult): string {
  const lines: string[] = [];
  for (const diagnostic of result.diagnostics) {
    const where = [diagnostic.pluginId, diagnostic.instanceId].filter(Boolean).join('#');
    const location = [where, diagnostic.path].filter(Boolean).join(' ');
    lines.push(
      `${SEVERITY_LABEL[diagnostic.severity]} [${diagnostic.code}]${
        location ? ` ${location}` : ''
      }: ${diagnostic.message}`,
    );
  }
  return lines.join('\n');
}

export function countBySeverity(
  diagnostics: readonly PluginDiagnostic[],
): Record<PluginDiagnostic['severity'], number> {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const diagnostic of diagnostics) counts[diagnostic.severity] += 1;
  return counts;
}
