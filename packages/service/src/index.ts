/**
 * Jeeves Meta Service — knowledge synthesis HTTP service for the Jeeves platform.
 *
 * @packageDocumentation
 */

// ── Archive ──
export {
  createSnapshot,
  listArchiveFiles,
  pruneArchive,
  readLatestArchive,
} from './archive/index.js';

// ── Config ──
export { loadServiceConfig, resolveConfigPath } from './configLoader.js';

// ── Discovery ──
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

// ── Utilities ──
export { computeEma } from './ema.js';
export { toMetaError } from './errors.js';
export { acquireLock, isLocked, releaseLock } from './lock.js';
export { normalizePath } from './normalizePath.js';
export { paginatedScan } from './paginatedScan.js';
export { computeStructureHash } from './structureHash.js';

// ── Executor ──
export {
  GatewayExecutor,
  type GatewayExecutorOptions,
} from './executor/index.js';

// ── Interfaces ──
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

// ── Logger ──
export type { LoggerConfig } from './logger/index.js';
export { createLogger } from './logger/index.js';

// ── Orchestrator ──
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

// ── Scheduling ──
export {
  actualStaleness,
  computeEffectiveStaleness,
  hasSteerChanged,
  isArchitectTriggered,
  isStale,
  selectCandidate,
  type StalenessCandidate,
} from './scheduling/index.js';

// ── Schema ──
export {
  type MetaConfig,
  metaConfigSchema,
  type MetaError,
  metaErrorSchema,
  type MetaJson,
  metaJsonSchema,
  type ServiceConfig,
  serviceConfigSchema,
} from './schema/index.js';

// ── Routes ──
export { registerRoutes, type RouteDeps } from './routes/index.js';

// ── Server ──
export type { ServerOptions } from './server.js';
export { createServer } from './server.js';

// ── Watcher Client ──
export {
  HttpWatcherClient,
  type HttpWatcherClientOptions,
} from './watcher-client/index.js';

// ── Service Bootstrap ──
import { createLogger } from './logger/index.js';
import { type ServiceConfig } from './schema/config.js';
import { createServer } from './server.js';

/**
 * Bootstrap the service: create logger, build server, start listening.
 *
 * @param config - Validated service configuration.
 */
export async function startService(config: ServiceConfig): Promise<void> {
  const logger = createLogger({
    level: config.logging.level,
    file: config.logging.file,
  });

  const server = createServer({ logger, config });

  try {
    await server.listen({ port: config.port, host: '0.0.0.0' });
    logger.info({ port: config.port }, 'Service listening');
  } catch (err) {
    logger.error(err, 'Failed to start service');
    process.exit(1);
  }
}
