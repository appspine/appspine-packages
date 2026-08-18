/**
 * Argument parsing and command dispatch (PL2-01).
 *
 * `runCli` is a pure function of `argv` plus an injected IO surface: it returns an exit code and
 * never calls `process.exit`. Only `bin.ts` does that. Every command is therefore testable
 * in-process, including the ones that are supposed to fail.
 *
 * The command table is deliberately empty here. PL2-01 owns the shell — parsing, the config and
 * secret boundary, exit codes, the JSON envelope — and PL2-02 / PL2-03 register `add`, `remove`,
 * `list`, `validate`, `build` and `doctor` against it. Shipping the shell first means those tasks
 * cannot each invent their own flag conventions or exit codes.
 */

import { type CommandResult, type JsonEnvelope, renderText, toJsonEnvelope } from './diagnostics';
import { CliError, ExitCode, type ExitCodeValue } from './exit-codes';

export interface CliIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  cwd: () => string;
}

export interface ParsedArgs {
  command: string | null;
  positionals: string[];
  flags: Map<string, string | boolean>;
}

export interface CommandContext {
  appRoot: string;
  args: ParsedArgs;
  io: CliIo;
}

export type CommandHandler = (context: CommandContext) => CommandResult | Promise<CommandResult>;

export interface CommandDefinition {
  name: string;
  summary: string;
  usage: string;
  handler: CommandHandler;
}

export const CLI_NAME = 'appspine';

/**
 * Flags every command understands. Kept in one place so `--json` cannot mean something slightly
 * different in `doctor` than it does in `validate`.
 */
const GLOBAL_FLAGS = new Set(['json', 'cwd', 'help', 'version']);

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();
  let command: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--') {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (token.startsWith('--')) {
      const body = token.slice(2);
      const equals = body.indexOf('=');
      if (equals !== -1) {
        flags.set(body.slice(0, equals), body.slice(equals + 1));
      } else if (body.startsWith('no-')) {
        flags.set(body.slice(3), false);
      } else {
        // `--cwd <path>` and `--json` are both valid, so a following non-flag token is only
        // consumed as a value when the flag is one that takes one.
        const next = argv[index + 1];
        if (FLAGS_WITH_VALUES.has(body) && next !== undefined && !next.startsWith('-')) {
          flags.set(body, next);
          index += 1;
        } else {
          flags.set(body, true);
        }
      }
      continue;
    }

    if (command === null) {
      command = token;
    } else {
      positionals.push(token);
    }
  }

  return { command, positionals, flags };
}

const FLAGS_WITH_VALUES = new Set(['cwd', 'instance-id', 'config-ref', 'preset']);

export interface RunCliOptions {
  io?: Partial<CliIo>;
  /** Commands to dispatch to. PL2-02 and PL2-03 supply these; PL2-01 ships none. */
  commands?: readonly CommandDefinition[];
  version?: string;
}

export async function runCli(
  argv: readonly string[],
  options: RunCliOptions = {},
): Promise<ExitCodeValue> {
  const io: CliIo = {
    stdout: options.io?.stdout ?? ((line) => process.stdout.write(`${line}\n`)),
    stderr: options.io?.stderr ?? ((line) => process.stderr.write(`${line}\n`)),
    cwd: options.io?.cwd ?? (() => process.cwd()),
  };
  const commands = options.commands ?? [];
  const args = parseArgs(argv);
  const asJson = args.flags.get('json') === true;

  if (args.flags.get('version') === true) {
    io.stdout(options.version ?? '0.0.0-unknown');
    return ExitCode.OK;
  }

  if (args.command === null || args.flags.get('help') === true) {
    io.stdout(usage(commands));
    // No command is not an error when the user asked for help; it is one when they asked for
    // nothing, because a script that reaches here has a bug.
    return args.flags.get('help') === true ? ExitCode.OK : ExitCode.USAGE;
  }

  const unknownFlags = [...args.flags.keys()].filter(
    (flag) => !GLOBAL_FLAGS.has(flag) && !FLAGS_WITH_VALUES.has(flag),
  );

  const definition = commands.find((entry) => entry.name === args.command);
  if (!definition) {
    return emit(
      io,
      asJson,
      {
        command: args.command,
        exitCode: ExitCode.USAGE,
        diagnostics: [
          {
            code: 'unknown-command',
            severity: 'error',
            message: `unknown command "${args.command}". Run \`${CLI_NAME} --help\` for the list`,
          },
        ],
      },
      usage(commands),
    );
  }

  if (unknownFlags.length > 0) {
    return emit(io, asJson, {
      command: definition.name,
      exitCode: ExitCode.USAGE,
      diagnostics: unknownFlags.map((flag) => ({
        code: 'unknown-flag',
        severity: 'error' as const,
        message: `unknown flag "--${flag}"`,
      })),
    });
  }

  const cwdFlag = args.flags.get('cwd');
  const appRoot = typeof cwdFlag === 'string' ? cwdFlag : io.cwd();

  try {
    const result = await definition.handler({ appRoot, args, io });
    return emit(io, asJson, result);
  } catch (error) {
    if (error instanceof CliError) {
      return emit(io, asJson, {
        command: definition.name,
        exitCode: error.exitCode,
        diagnostics: [{ code: 'command-failed', severity: 'error', message: error.message }],
      });
    }
    // An unexpected throw is a bug in the CLI, not a condition it detected. It gets its own code
    // so a caller can tell "your input is wrong" from "this tool is broken".
    return emit(io, asJson, {
      command: definition.name,
      exitCode: ExitCode.INTERNAL_ERROR,
      diagnostics: [
        {
          code: 'internal-error',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    });
  }
}

function emit(
  io: CliIo,
  asJson: boolean,
  result: CommandResult,
  extraText?: string,
): ExitCodeValue {
  if (asJson) {
    const envelope: JsonEnvelope = toJsonEnvelope(result);
    io.stdout(JSON.stringify(envelope, null, 2));
    return result.exitCode;
  }

  const text = renderText(result);
  if (text) {
    (result.exitCode === ExitCode.OK ? io.stdout : io.stderr)(text);
  }
  if (extraText) io.stderr(extraText);
  return result.exitCode;
}

export function usage(commands: readonly CommandDefinition[]): string {
  const lines = [
    `Usage: ${CLI_NAME} <command> [options]`,
    '',
    'Commands:',
    ...(commands.length > 0
      ? commands.map((entry) => `  ${entry.name.padEnd(10)} ${entry.summary}`)
      : ['  (none registered)']),
    '',
    'Global options:',
    '  --json          emit one machine-readable JSON document instead of text',
    '  --cwd <path>    App root holding appspine.plugins.json (default: process.cwd())',
    '  --help          show this message',
    '  --version       print the CLI version',
  ];
  return lines.join('\n');
}
