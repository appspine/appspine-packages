import { type PluginDiagnostic, sortDiagnostics } from './diagnostics';

/**
 * The single error type this package throws. It carries diagnostics rather than a formatted
 * string so a caller can re-render them (CLI table, catalog entry, CI annotation) without
 * parsing prose — and so nothing accidentally interpolates a config value into a message.
 */
export class PluginContractError extends Error {
  readonly code: string;
  readonly diagnostics: readonly PluginDiagnostic[];

  constructor(code: string, message: string, diagnostics: readonly PluginDiagnostic[] = []) {
    const sorted = sortDiagnostics(diagnostics);
    const detail = sorted.map((entry) => `  - [${entry.code}] ${entry.message}`).join('\n');
    super(detail.length > 0 ? `${message}\n${detail}` : message);
    this.name = 'PluginContractError';
    this.code = code;
    this.diagnostics = sorted;
  }
}

export function isPluginContractError(error: unknown): error is PluginContractError {
  return error instanceof PluginContractError;
}
