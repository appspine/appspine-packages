/**
 * Stable exit codes (PL2-01).
 *
 * Stable is the whole point: a CI job, a deploy script or an operator's `||` chain reacts to these
 * numbers, so they are part of the published contract exactly like a function signature. Adding a
 * code is a minor change; changing what an existing number means is a breaking one.
 *
 * The split between them is by *what the caller should do next*, not by which check happened to
 * fail. "Your inventory is invalid" and "your inventory is valid but cannot be resolved" call for
 * different responses, so they are different codes; two different resolution conflicts do not, so
 * they share one and are told apart by the diagnostic `code`.
 */
export const ExitCode = {
  /** Everything the command was asked to do succeeded. */
  OK: 0,

  /**
   * The CLI itself broke: an unexpected exception, an unreadable file it had already stat-ed, a
   * bug. Never used for a condition the CLI is supposed to detect — those all have codes below.
   */
  INTERNAL_ERROR: 1,

  /** Bad invocation: unknown command, missing argument, unknown flag. Nothing was read or written. */
  USAGE: 2,

  /**
   * Something the CLI validates is malformed: `appspine.plugins.json` against its schema, a
   * manifest against the manifest schema, a `configRef` that does not match its manifest, a secret
   * value found where only a reference belongs.
   */
  VALIDATION_FAILED: 3,

  /**
   * Every input was well-formed, but they cannot be composed: a missing required capability, a
   * conflict, a cardinality violation, a dependency cycle.
   */
  RESOLUTION_FAILED: 4,

  /**
   * Generated artefacts do not match what the current inputs would produce (PL2-03 `doctor`,
   * PL2-05 drift check). Separate from VALIDATION_FAILED because the fix is "re-run build", not
   * "correct your input".
   */
  DRIFT_DETECTED: 5,

  /** A named plugin, instance or preset does not exist. */
  NOT_FOUND: 6,

  /**
   * The requested change would break the inventory: adding an instance ID that already exists,
   * removing a plugin another one requires. The current state is fine; the *edit* is refused.
   */
  CONFLICT: 7,
} as const;

export type ExitCodeName = keyof typeof ExitCode;
export type ExitCodeValue = (typeof ExitCode)[ExitCodeName];

const NAME_BY_VALUE = new Map<number, ExitCodeName>(
  (Object.entries(ExitCode) as [ExitCodeName, ExitCodeValue][]).map(([name, value]) => [
    value,
    name,
  ]),
);

export function exitCodeName(value: number): ExitCodeName | 'UNKNOWN' {
  return NAME_BY_VALUE.get(value) ?? 'UNKNOWN';
}

/**
 * Thrown by command implementations to end with a specific code. Carrying the code on the error
 * keeps `process.exit` out of the command bodies, so every command stays callable in-process from
 * a test without taking the runner down with it.
 */
export class CliError extends Error {
  readonly exitCode: ExitCodeValue;

  constructor(exitCode: ExitCodeValue, message: string) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}
