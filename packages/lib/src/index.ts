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
export { loadSynthConfig, resolveConfigPath } from './configLoader.js';
export {
  buildOwnershipTree,
  ensureMetaJson,
  filterInScope,
  findNode,
  getScopeExclusions,
  getScopePrefix,
  globMetas,
  type MetaNode,
  type OwnershipTree,
} from './discovery/index.js';
export { computeEma } from './ema.js';
export { createSynthEngine, type SynthEngine } from './engine.js';
export { toSynthError } from './errors.js';
export {
  GatewayExecutor,
  type GatewayExecutorOptions,
} from './executor/index.js';
export type {
  InferenceRuleSpec,
  ScanFile,
  ScanParams,
  ScanResponse,
  SynthContext,
  SynthExecutor,
  SynthSpawnOptions,
  SynthSpawnResult,
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
  type MetaJson,
  metaJsonSchema,
  type SynthConfig,
  synthConfigSchema,
  type SynthError,
  synthErrorSchema,
} from './schema/index.js';
export { computeStructureHash } from './structureHash.js';
export {
  HttpWatcherClient,
  type HttpWatcherClientOptions,
} from './watcher-client/index.js';
