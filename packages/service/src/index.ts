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
export {
  acquireLock,
  cleanupStaleLocks,
  isLocked,
  type LockState,
  readLockState,
  releaseLock,
  resolveMetaDir,
} from './lock.js';
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
  type ProgressCallback,
} from './orchestrator/index.js';

// ── Progress ──
export {
  formatProgressEvent,
  type ProgressEvent,
  type ProgressPhase,
  ProgressReporter,
  type ProgressReporterConfig,
} from './progress/index.js';

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

// ── Scheduler ──
export { Scheduler } from './scheduler/index.js';

// ── Queue ──
export {
  type EnqueueResult,
  type QueueItem,
  type QueueState,
  SynthesisQueue,
} from './queue/index.js';

// ── Routes ──
export {
  registerRoutes,
  type RouteDeps,
  type ServiceStats,
} from './routes/index.js';

// ── Rules ──
export { RuleRegistrar } from './rules/index.js';

// ── Sleep ──
export { sleep } from './sleep.js';

// ── Server ──
export type { ServerOptions } from './server.js';
export { createServer } from './server.js';

// ── Shutdown ──
export { registerShutdownHandlers } from './shutdown/index.js';

// ── Watcher Client ──
export {
  HttpWatcherClient,
  type HttpWatcherClientOptions,
} from './watcher-client/index.js';

// ── Service Bootstrap ──
import { watchFile } from 'node:fs';

import { loadServiceConfig } from './configLoader.js';
import { listMetas } from './discovery/index.js';
import { GatewayExecutor } from './executor/index.js';
import { cleanupStaleLocks } from './lock.js';
import { createLogger } from './logger/index.js';
import { orchestrate } from './orchestrator/index.js';
import { ProgressReporter } from './progress/index.js';
import { SynthesisQueue } from './queue/index.js';
import type { ServiceStats } from './routes/index.js';
import { RuleRegistrar } from './rules/index.js';
import { Scheduler } from './scheduler/index.js';
import { type ServiceConfig } from './schema/config.js';
import { createServer } from './server.js';
import { registerShutdownHandlers } from './shutdown/index.js';
import { HttpWatcherClient } from './watcher-client/index.js';

/**
 * Bootstrap the service: create logger, build server, start listening,
 * wire scheduler, queue processing, rule registration, config hot-reload,
 * startup lock cleanup, and shutdown.
 *
 * @param config - Validated service configuration.
 * @param configPath - Optional path to config file for hot-reload.
 */
export async function startService(
  config: ServiceConfig,
  configPath?: string,
): Promise<void> {
  const logger = createLogger({
    level: config.logging.level,
    file: config.logging.file,
  });

  // Wire synthesis executor + watcher
  const watcher = new HttpWatcherClient({ baseUrl: config.watcherUrl });
  const executor = new GatewayExecutor({
    gatewayUrl: config.gatewayUrl,
    apiKey: config.gatewayApiKey,
  });

  // Runtime stats (mutable, shared with routes)
  const stats: ServiceStats = {
    totalSyntheses: 0,
    totalTokens: 0,
    totalErrors: 0,
    lastCycleDurationMs: null,
    lastCycleAt: null,
  };

  const queue = new SynthesisQueue(logger);

  // Scheduler (needs watcher for discovery)
  const scheduler = new Scheduler(config, queue, logger, watcher);

  const routeDeps = {
    config,
    logger,
    queue,
    watcher,
    scheduler,
    stats,
  };

  const server = createServer({
    logger,
    config,
    queue,
    watcher,
    scheduler,
    stats,
  });

  // Start HTTP server
  try {
    await server.listen({ port: config.port, host: '0.0.0.0' });
    logger.info({ port: config.port }, 'Service listening');
  } catch (err) {
    logger.error(err, 'Failed to start service');
    process.exit(1);
  }

  // Progress reporter — uses shared config reference so hot-reload propagates
  const progress = new ProgressReporter(config, logger);

  // Wire queue processing — synthesize one meta per dequeue
  const synthesizeFn = async (path: string): Promise<void> => {
    const startMs = Date.now();
    let cycleTokens = 0;
    await progress.report({
      type: 'synthesis_start',
      metaPath: path,
    });

    try {
      const results = await orchestrate(
        config,
        executor,
        watcher,
        path,
        async (evt) => {
          // Track token stats from phase completions
          if (evt.type === 'phase_complete' && evt.tokens) {
            stats.totalTokens += evt.tokens;
            cycleTokens += evt.tokens;
          }
          await progress.report(evt);
        },
      );
      // orchestrate() always returns exactly one result
      const result = results[0];
      const durationMs = Date.now() - startMs;

      // Update stats
      stats.totalSyntheses++;
      stats.lastCycleDurationMs = durationMs;
      stats.lastCycleAt = new Date().toISOString();

      if (result.error) {
        stats.totalErrors++;
        await progress.report({
          type: 'error',
          metaPath: path,
          error: result.error.message,
        });
      } else {
        scheduler.resetBackoff();
        await progress.report({
          type: 'synthesis_complete',
          metaPath: path,
          tokens: cycleTokens,
          durationMs,
        });
      }
    } catch (err) {
      stats.totalErrors++;
      const message = err instanceof Error ? err.message : String(err);
      await progress.report({
        type: 'error',
        metaPath: path,
        error: message,
      });
      throw err;
    }
  };

  // Auto-process queue when new items arrive
  queue.onEnqueue(() => {
    void queue.processQueue(synthesizeFn);
  });

  // Startup: clean stale locks (gap #16)
  try {
    const metaResult = await listMetas(config, watcher);
    const metaPaths = metaResult.entries.map((e) => e.node.metaPath);
    cleanupStaleLocks(metaPaths, logger);
  } catch (err) {
    logger.warn({ err }, 'Could not clean stale locks (watcher may be down)');
  }

  // Start scheduler
  scheduler.start();

  // Rule registration (fire-and-forget with retries)
  const registrar = new RuleRegistrar(config, logger, watcher);
  scheduler.setRegistrar(registrar);
  void registrar.register();

  // Config hot-reload (gap #12)
  if (configPath) {
    watchFile(configPath, { interval: 5000 }, () => {
      try {
        const newConfig = loadServiceConfig(configPath);
        // Hot-reloadable fields: schedule, reportChannel, logging level
        if (newConfig.schedule !== config.schedule) {
          scheduler.updateSchedule(newConfig.schedule);
          logger.info(
            { schedule: newConfig.schedule },
            'Schedule hot-reloaded',
          );
        }
        if (newConfig.reportChannel !== config.reportChannel) {
          // Mutate shared config reference for progress reporter
          (config as { reportChannel?: string }).reportChannel =
            newConfig.reportChannel;
          logger.info(
            { reportChannel: newConfig.reportChannel },
            'reportChannel hot-reloaded',
          );
        }
        if (newConfig.logging.level !== config.logging.level) {
          logger.level = newConfig.logging.level;
          logger.info(
            { level: newConfig.logging.level },
            'Log level hot-reloaded',
          );
        }
      } catch (err) {
        logger.warn({ err }, 'Config hot-reload failed');
      }
    });
  }

  // Shutdown handlers
  registerShutdownHandlers({
    server,
    scheduler,
    queue,
    logger,
    routeDeps,
  });

  logger.info('Service fully initialized');
}
