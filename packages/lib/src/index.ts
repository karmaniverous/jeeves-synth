/**
 * Knowledge synthesis engine for the Jeeves platform.
 *
 * @packageDocumentation
 */

export {
  createSnapshot,
  listArchiveFiles,
  pruneArchive,
  readLatestArchive,
} from './archive/index.js';
export { loadMetaConfig, resolveConfigPath } from './configLoader.js';
export {
  buildMetaFilter,
  buildOwnershipTree,
  discoverMetas,
  filterInScope,
  findNode,
  getScopePrefix,
  listMetas,
  type MetaEntry,
  type MetaListResult,
  type MetaListSummary,
  type MetaNode,
  type OwnershipTree,
} from './discovery/index.js';
export { computeEma } from './ema.js';
export { toMetaError } from './errors.js';
export {
  GatewayExecutor,
  type GatewayExecutorOptions,
} from './executor/index.js';
export type {
  InferenceRuleSpec,
  MetaContext,
  MetaExecutor,
  MetaSpawnOptions,
  MetaSpawnResult,
  ScanFile,
  ScanParams,
  ScanResponse,
  WatcherClient,
} from './interfaces/index.js';
export { acquireLock, isLocked, releaseLock } from './lock.js';
export { normalizePath } from './normalizePath.js';
export {
  buildArchitectTask,
  buildBuilderTask,
  buildContextPackage,
  buildCriticTask,
  type BuilderOutput,
  mergeAndWrite,
  type MergeOptions,
  orchestrate,
  type OrchestrateResult,
  parseArchitectOutput,
  parseBuilderOutput,
  parseCriticOutput,
} from './orchestrator/index.js';
export { paginatedScan } from './paginatedScan.js';
export {
  actualStaleness,
  computeEffectiveStaleness,
  hasSteerChanged,
  isArchitectTriggered,
  isStale,
  selectCandidate,
  type StalenessCandidate,
} from './scheduling/index.js';
export {
  type MetaConfig,
  metaConfigSchema,
  type MetaError,
  metaErrorSchema,
  type MetaJson,
  metaJsonSchema,
} from './schema/index.js';
export { computeStructureHash } from './structureHash.js';
export {
  HttpWatcherClient,
  type HttpWatcherClientOptions,
} from './watcher-client/index.js';
