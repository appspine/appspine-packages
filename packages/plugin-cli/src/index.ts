/**
 * `@appspine/plugin-cli` — the App-facing tool for `appspine.plugins.json` (051 PL2-01).
 *
 * The programmatic surface is exported alongside the binary on purpose: PL2-09's template
 * migration and PL2-10's CI gate both need to run these checks from a script, and a tool that can
 * only be driven by parsing its own stdout is a tool those callers will end up reimplementing.
 *
 * What this package will never do (051 plan §7, §9):
 *   - modify anything but the declarative inventory;
 *   - rewrite arbitrary TypeScript (it emits reviewable stubs instead);
 *   - execute plugin runtime code, validated or not;
 *   - read, print, or write a credential.
 */

export {
  CLI_NAME,
  type CliIo,
  type CommandContext,
  type CommandDefinition,
  type CommandHandler,
  type ParsedArgs,
  parseArgs,
  type RunCliOptions,
  runCli,
  usage,
} from './cli';
export {
  addCommand,
  buildCommand,
  COMMANDS,
  configStubCommand,
  doctorCommand,
  listCommand,
  removeCommand,
  validateCommand,
} from './commands';
export {
  AMBIENT_CAPABILITIES,
  checkInventory,
  loadState,
  resolveInventory,
} from './commands/shared';
export {
  COMPOSITION_ARTIFACT,
  compositionPreflight,
  descriptorExportName,
  generateComposition,
} from './composition';
export {
  checkConfigBoundary,
  configStub,
  type EnvironmentRequirement,
  environmentRequirements,
  type SecretBoundaryOptions,
} from './config-boundary';
export {
  CLI_RESULT_SCHEMA_VERSION,
  type CommandResult,
  countBySeverity,
  type JsonEnvelope,
  renderText,
  toJsonEnvelope,
} from './diagnostics';
export {
  CliError,
  ExitCode,
  type ExitCodeName,
  type ExitCodeValue,
  exitCodeName,
} from './exit-codes';
export {
  CATALOG_ARTIFACT,
  type CatalogArtifactEntry,
  type DriftEntry,
  detectDrift,
  driftDiagnostic,
  GENERATED_DIR,
  type GeneratedArtifact,
  type GenerationInput,
  type Generator,
  generateCatalog,
  recordedSourceDigest,
  sourceDigest,
  writeArtifacts,
} from './generate';
export { GENERATORS, generateAll } from './generators';
export {
  DEFAULT_INSTANCE_ID,
  emptyInventory,
  INVENTORY_FILENAME,
  INVENTORY_SCHEMA_VERSION,
  INVENTORY_V1_SCHEMA_ID,
  type InventoryFile,
  inventoryPath,
  inventorySchema,
  type ParseInventoryError,
  type ParseInventoryOk,
  type ParseInventoryResult,
  parseInventory,
  pluginIdOf,
  type ReadInventoryOptions,
  readInventory,
  serializeInventory,
  toResolverInventory,
  writeInventory,
} from './inventory-file';
export {
  artifactDigest,
  buildLockfile,
  compareLockfile,
  LOCK_SCHEMA_VERSION,
  LOCKFILE_NAME,
  type LockedArtifact,
  type LockedInstance,
  type LockedPackage,
  lockfilePath,
  type PluginLockfile,
  readLockfile,
  serializeLockfile,
  writeLockfile,
} from './lockfile';
export {
  candidateDirs,
  DEFAULT_OFFICIAL_SCOPE,
  locateManifest,
  type ManifestLocation,
  type ManifestLookupOptions,
  type ManifestReadResult,
  type ManifestSet,
  readManifestFor,
  readManifestsFor,
} from './manifest-source';
export {
  type DesiredPermission,
  desiredPermissionsFrom,
  generatePermissionPlan,
  PERMISSION_ARTIFACT,
  PERMISSION_ID,
  type PermissionOp,
  type PermissionPlan,
  type PermissionRecord,
  type ReconcileResult,
  reconcilePermissions,
} from './permission-reconciler';
export {
  applyPlan,
  type ChangePlan,
  type FileChange,
  inventoryChange,
  packageJsonChange,
  renderDiff,
  renderPlan,
} from './plan';
export {
  type ComposeResult,
  collectContributions,
  compose,
  generatePrismaSchema,
  injectAugmentations,
  type MigrationPlanInput,
  type PrismaAugmentation,
  type PrismaContribution,
  SCHEMA_ARTIFACT,
  validateContributions,
} from './prisma-composer';
