/**
 * Main orchestration function — the 13-step synthesis cycle.
 *
 * Wires together discovery, scheduling, archiving, executor calls,
 * and merge/write-back.
 *
 * @module orchestrator/orchestrate
 */

import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import {
  createSnapshot,
  pruneArchive,
  readLatestArchive,
} from '../archive/index.js';
import { discoverMetas } from '../discovery/discoverMetas.js';
import { buildOwnershipTree } from '../discovery/index.js';
import { getScopePrefix } from '../discovery/scope.js';
import type { MetaNode } from '../discovery/types.js';
import { toMetaError } from '../errors.js';
import type { MetaExecutor, WatcherClient } from '../interfaces/index.js';
import { acquireLock, releaseLock } from '../lock.js';
import type { MinimalLogger } from '../logger/index.js';
import { normalizePath } from '../normalizePath.js';
import type { ProgressEvent } from '../progress/index.js';
import {
  actualStaleness,
  computeEffectiveStaleness,
  hasSteerChanged,
  isArchitectTriggered,
  isStale,
} from '../scheduling/index.js';
import type { MetaConfig, MetaError, MetaJson } from '../schema/index.js';
import { computeStructureHash } from '../structureHash.js';
import {
  buildArchitectTask,
  buildBuilderTask,
  buildCriticTask,
} from './buildTask.js';
import { buildContextPackage } from './contextPackage.js';
import { mergeAndWrite } from './merge.js';
import type { BuilderOutput } from './parseOutput.js';
import {
  parseArchitectOutput,
  parseBuilderOutput,
  parseCriticOutput,
} from './parseOutput.js';

/** Callback for synthesis progress events. */
export type ProgressCallback = (event: ProgressEvent) => void | Promise<void>;

/** Result of a single orchestration cycle. */
export interface OrchestrateResult {
  /** Whether a synthesis was performed. */
  synthesized: boolean;
  /** Path to the meta that was synthesized, if any. */
  metaPath?: string;
  /** Error if synthesis failed. */
  error?: MetaError;
}

/** Options for finalizeCycle. */
interface FinalizeCycleOptions {
  metaPath: string;
  current: MetaJson;
  config: MetaConfig;
  architect: string;
  builder: string;
  critic: string;
  builderOutput: BuilderOutput | null;
  feedback: string | null;
  structureHash: string;
  synthesisCount: number;
  error: MetaError | null;
  architectTokens?: number;
  builderTokens?: number;
  criticTokens?: number;
}

/** Finalize a cycle using lock staging: write to .lock → copy to meta.json + archive → delete .lock. */
function finalizeCycle(opts: FinalizeCycleOptions): MetaJson {
  const lockPath = join(opts.metaPath, '.lock');
  const metaJsonPath = join(opts.metaPath, 'meta.json');

  // Stage: write merged result to .lock
  const updated = mergeAndWrite({
    metaPath: opts.metaPath,
    current: opts.current,
    architect: opts.architect,
    builder: opts.builder,
    critic: opts.critic,
    builderOutput: opts.builderOutput,
    feedback: opts.feedback,
    structureHash: opts.structureHash,
    synthesisCount: opts.synthesisCount,
    error: opts.error,
    architectTokens: opts.architectTokens,
    builderTokens: opts.builderTokens,
    criticTokens: opts.criticTokens,
    outputPath: lockPath,
  });

  // Commit: copy .lock → meta.json
  copyFileSync(lockPath, metaJsonPath);

  // Archive + prune from the committed meta.json
  createSnapshot(opts.metaPath, updated);
  pruneArchive(opts.metaPath, opts.config.maxArchive);

  // .lock is cleaned up by the finally block (releaseLock)
  return updated;
}

/**
 * Run a single synthesis cycle.
 *
 * Discovers all metas, selects the stalest candidate, and runs the
 * three-step synthesis (architect, builder, critic).
 *
 * @param config - Validated synthesis config.
 * @param executor - Pluggable LLM executor.
 * @param watcher - Watcher HTTP client.
 * @returns Result indicating whether synthesis occurred.
 */

/**
 * Build a minimal MetaNode from the filesystem for a known meta path.
 * Discovers immediate child .meta/ dirs without a full watcher scan.
 */
function buildMinimalNode(metaPath: string): MetaNode {
  const normalized = normalizePath(metaPath);
  const ownerPath = normalizePath(dirname(metaPath));

  // Find child .meta/ directories by scanning the owner directory
  const children: MetaNode[] = [];
  function findChildMetas(dir: string, depth: number): void {
    if (depth > 10) return; // Safety limit
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const fullPath = normalizePath(join(dir, entry.name));
        if (entry.name === '.meta' && fullPath !== normalized) {
          // Found a child .meta — check it has meta.json
          if (existsSync(join(fullPath, 'meta.json'))) {
            children.push({
              metaPath: fullPath,
              ownerPath: normalizePath(dirname(fullPath)),
              treeDepth: 1, // Relative to target
              children: [],
              parent: null, // Set below
            });
          }
          // Don't recurse into .meta dirs
          return;
        }
        if (
          entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === 'archive'
        )
          continue;
        findChildMetas(fullPath, depth + 1);
      }
    } catch {
      // Permission errors, etc — skip
    }
  }

  findChildMetas(ownerPath, 0);

  const node: MetaNode = {
    metaPath: normalized,
    ownerPath,
    treeDepth: 0,
    children,
    parent: null,
  };

  // Wire parent references
  for (const child of children) {
    child.parent = node;
  }

  return node;
}

/** Run the architect/builder/critic pipeline on a single node. */
async function synthesizeNode(
  node: MetaNode,
  currentMeta: MetaJson,
  config: MetaConfig,
  executor: MetaExecutor,
  watcher: WatcherClient,
  onProgress?: ProgressCallback,
): Promise<OrchestrateResult> {
  // Step 5-6: Steer change detection
  const latestArchive = readLatestArchive(node.metaPath);
  const steerChanged = hasSteerChanged(
    currentMeta._steer,
    latestArchive?._steer,
    Boolean(latestArchive),
  );

  // Step 7: Compute context (includes scope files and delta files)
  const ctx = buildContextPackage(node, currentMeta);

  // Step 5 (deferred): Structure hash from context scope files
  const newStructureHash = computeStructureHash(ctx.scopeFiles);
  const structureChanged = newStructureHash !== currentMeta._structureHash;

  // Step 8: Architect (conditional)
  const architectTriggered = isArchitectTriggered(
    currentMeta,
    structureChanged,
    steerChanged,
    config.architectEvery,
  );

  let builderBrief = currentMeta._builder ?? '';
  let synthesisCount = currentMeta._synthesisCount ?? 0;
  let stepError: MetaError | null = null;
  let architectTokens: number | undefined;
  let builderTokens: number | undefined;
  let criticTokens: number | undefined;

  if (architectTriggered) {
    try {
      await onProgress?.({
        type: 'phase_start',
        path: node.ownerPath,
        phase: 'architect',
      });
      const phaseStart = Date.now();
      const architectTask = buildArchitectTask(ctx, currentMeta, config);
      const architectResult = await executor.spawn(architectTask, {
        thinking: config.thinking,
        timeout: config.architectTimeout,
      });
      builderBrief = parseArchitectOutput(architectResult.output);
      architectTokens = architectResult.tokens;
      synthesisCount = 0;
      await onProgress?.({
        type: 'phase_complete',
        path: node.ownerPath,
        phase: 'architect',
        tokens: architectTokens,
        durationMs: Date.now() - phaseStart,
      });
    } catch (err) {
      stepError = toMetaError('architect', err);

      if (!currentMeta._builder) {
        // No cached builder — cycle fails
        finalizeCycle({
          metaPath: node.metaPath,
          current: currentMeta,
          config,
          architect: currentMeta._architect ?? '',
          builder: '',
          critic: currentMeta._critic ?? '',
          builderOutput: null,
          feedback: null,
          structureHash: newStructureHash,
          synthesisCount,
          error: stepError,
          architectTokens,
        });
        return {
          synthesized: true,
          metaPath: node.metaPath,
          error: stepError,
        };
      }
      // Has cached builder — continue with existing
    }
  }

  // Step 9: Builder
  const metaForBuilder: MetaJson = { ...currentMeta, _builder: builderBrief };
  let builderOutput: BuilderOutput | null = null;
  try {
    await onProgress?.({
      type: 'phase_start',
      path: node.ownerPath,
      phase: 'builder',
    });
    const builderStart = Date.now();
    const builderTask = buildBuilderTask(ctx, metaForBuilder, config);
    const builderResult = await executor.spawn(builderTask, {
      thinking: config.thinking,
      timeout: config.builderTimeout,
    });
    builderOutput = parseBuilderOutput(builderResult.output);
    builderTokens = builderResult.tokens;
    synthesisCount++;
    await onProgress?.({
      type: 'phase_complete',
      path: node.ownerPath,
      phase: 'builder',
      tokens: builderTokens,
      durationMs: Date.now() - builderStart,
    });
  } catch (err) {
    stepError = toMetaError('builder', err);
    return { synthesized: true, metaPath: node.metaPath, error: stepError };
  }

  // Step 10: Critic
  const metaForCritic: MetaJson = {
    ...currentMeta,
    _content: builderOutput.content,
  };
  let feedback: string | null = null;
  try {
    await onProgress?.({
      type: 'phase_start',
      path: node.ownerPath,
      phase: 'critic',
    });
    const criticStart = Date.now();
    const criticTask = buildCriticTask(ctx, metaForCritic, config);
    const criticResult = await executor.spawn(criticTask, {
      thinking: config.thinking,
      timeout: config.criticTimeout,
    });
    feedback = parseCriticOutput(criticResult.output);
    criticTokens = criticResult.tokens;
    stepError = null; // Clear any architect error on full success
    await onProgress?.({
      type: 'phase_complete',
      path: node.ownerPath,
      phase: 'critic',
      tokens: criticTokens,
      durationMs: Date.now() - criticStart,
    });
  } catch (err) {
    stepError = stepError ?? toMetaError('critic', err);
  }

  // Steps 11-12: Merge, archive, prune
  finalizeCycle({
    metaPath: node.metaPath,
    current: currentMeta,
    config,
    architect: currentMeta._architect ?? '',
    builder: builderBrief,
    critic: currentMeta._critic ?? '',
    builderOutput,
    feedback,
    structureHash: newStructureHash,
    synthesisCount,
    error: stepError,
    architectTokens,
    builderTokens,
    criticTokens,
  });

  return {
    synthesized: true,
    metaPath: node.metaPath,
    error: stepError ?? undefined,
  };
}

async function orchestrateOnce(
  config: MetaConfig,
  executor: MetaExecutor,
  watcher: WatcherClient,
  targetPath?: string,
  onProgress?: ProgressCallback,
  logger?: MinimalLogger,
): Promise<OrchestrateResult> {
  // When targetPath is provided, skip the expensive full discovery scan.
  // Build a minimal node from the filesystem instead.
  if (targetPath) {
    const normalizedTarget = normalizePath(targetPath);
    const targetMetaJson = join(normalizedTarget, 'meta.json');
    if (!existsSync(targetMetaJson)) return { synthesized: false };

    const node = buildMinimalNode(normalizedTarget);
    if (!acquireLock(node.metaPath)) return { synthesized: false };

    try {
      const currentMeta = JSON.parse(
        readFileSync(targetMetaJson, 'utf8'),
      ) as MetaJson;

      return await synthesizeNode(
        node,
        currentMeta,
        config,
        executor,
        watcher,
        onProgress,
      );
    } finally {
      releaseLock(node.metaPath);
    }
  }

  // Full discovery path (scheduler-driven, no specific target)
  // Step 1: Discover via watcher scan
  const discoveryStart = Date.now();
  const metaPaths = await discoverMetas(config, watcher, logger);
  logger?.debug(
    { paths: metaPaths.length, durationMs: Date.now() - discoveryStart },
    'discovery complete',
  );
  if (metaPaths.length === 0) return { synthesized: false };

  // Read meta.json for each discovered meta
  const metas = new Map<string, MetaJson>();
  for (const mp of metaPaths) {
    const metaFilePath = join(mp, 'meta.json');
    try {
      metas.set(
        normalizePath(mp),
        JSON.parse(readFileSync(metaFilePath, 'utf8')) as MetaJson,
      );
    } catch {
      // Skip metas with unreadable meta.json
      continue;
    }
  }

  // Only build tree from paths with readable meta.json (excludes orphaned/deleted entries)
  const validPaths = metaPaths.filter((mp) => metas.has(normalizePath(mp)));
  if (validPaths.length === 0) return { synthesized: false };

  const tree = buildOwnershipTree(validPaths);

  // Steps 3-4: Staleness check + candidate selection
  const candidates = [];
  for (const treeNode of tree.nodes.values()) {
    const meta = metas.get(treeNode.metaPath);
    if (!meta) continue;
    const staleness = actualStaleness(meta);
    if (staleness > 0) {
      candidates.push({ node: treeNode, meta, actualStaleness: staleness });
    }
  }

  const weighted = computeEffectiveStaleness(candidates, config.depthWeight);

  // Sort by effective staleness descending
  const ranked = [...weighted].sort(
    (a, b) => b.effectiveStaleness - a.effectiveStaleness,
  );
  if (ranked.length === 0) return { synthesized: false };

  // Find the first candidate with actual changes (if skipUnchanged)
  let winner: (typeof ranked)[0] | null = null;
  for (const candidate of ranked) {
    if (!acquireLock(candidate.node.metaPath)) continue;

    const verifiedStale = isStale(
      getScopePrefix(candidate.node),
      candidate.meta,
    );

    if (!verifiedStale && candidate.meta._generatedAt) {
      // Bump _generatedAt so it doesn't win next cycle
      const metaFilePath = join(candidate.node.metaPath, 'meta.json');
      const freshMeta = JSON.parse(
        readFileSync(metaFilePath, 'utf8'),
      ) as MetaJson;
      freshMeta._generatedAt = new Date().toISOString();
      writeFileSync(metaFilePath, JSON.stringify(freshMeta, null, 2));
      releaseLock(candidate.node.metaPath);

      if (config.skipUnchanged) continue;
      return { synthesized: false };
    }

    winner = candidate;
    break;
  }

  if (!winner) return { synthesized: false };
  const node = winner.node;

  try {
    const currentMeta = JSON.parse(
      readFileSync(join(node.metaPath, 'meta.json'), 'utf8'),
    ) as MetaJson;

    return await synthesizeNode(
      node,
      currentMeta,
      config,
      executor,
      watcher,
      onProgress,
    );
  } finally {
    // Step 13: Release lock
    releaseLock(node.metaPath);
  }
}
/**
 * Run a single synthesis cycle.
 *
 * Selects the stalest candidate (or a specific target) and runs the
 * full architect/builder/critic pipeline.
 *
 * @param config - Validated synthesis config.
 * @param executor - Pluggable LLM executor.
 * @param watcher - Watcher HTTP client.
 * @param targetPath - Optional: specific meta/owner path to synthesize instead of stalest candidate.
 * @returns Array with a single result.
 */
export async function orchestrate(
  config: MetaConfig,
  executor: MetaExecutor,
  watcher: WatcherClient,
  targetPath?: string,
  onProgress?: ProgressCallback,
  logger?: MinimalLogger,
): Promise<OrchestrateResult[]> {
  const result = await orchestrateOnce(
    config,
    executor,
    watcher,
    targetPath,
    onProgress,
    logger,
  );
  return [result];
}
