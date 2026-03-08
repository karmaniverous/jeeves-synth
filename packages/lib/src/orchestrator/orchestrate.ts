/**
 * Main orchestration function — the 13-step synthesis cycle.
 *
 * Wires together discovery, scheduling, archiving, executor calls,
 * and merge/write-back.
 *
 * @module orchestrator/orchestrate
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  createSnapshot,
  pruneArchive,
  readLatestArchive,
} from '../archive/index.js';
import {
  buildOwnershipTree,
  ensureMetaJson,
  globMetas,
} from '../discovery/index.js';
import { getScopePrefix } from '../discovery/scope.js';
import { toSynthError } from '../errors.js';
import type { SynthExecutor, WatcherClient } from '../interfaces/index.js';
import { acquireLock, releaseLock } from '../lock.js';
import {
  actualStaleness,
  computeEffectiveStaleness,
  selectCandidate,
} from '../scheduling/index.js';
import type { MetaJson, SynthConfig, SynthError } from '../schema/index.js';
import { computeStructureHash } from '../structureHash.js';
/** Normalize path separators to forward slashes. */
function normalizePath(p: string): string {
  return p.replaceAll('\\', '/');
}

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

/** Result of a single orchestration cycle. */
export interface OrchestrateResult {
  /** Whether a synthesis was performed. */
  synthesized: boolean;
  /** Path to the meta that was synthesized, if any. */
  metaPath?: string;
  /** Error if synthesis failed. */
  error?: SynthError;
}

/** Finalize a cycle: merge, snapshot, prune. */
function finalizeCycle(
  metaPath: string,
  current: MetaJson,
  config: SynthConfig,
  architect: string,
  builder: string,
  critic: string,
  builderOutput: BuilderOutput | null,
  feedback: string | null,
  structureHash: string,
  synthesisCount: number,
  error: SynthError | null,
): MetaJson {
  const updated = mergeAndWrite({
    metaPath,
    current,
    architect,
    builder,
    critic,
    builderOutput,
    feedback,
    structureHash,
    synthesisCount,
    error,
  });
  createSnapshot(metaPath, updated);
  pruneArchive(metaPath, config.maxArchive);
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
export async function orchestrate(
  config: SynthConfig,
  executor: SynthExecutor,
  watcher: WatcherClient,
): Promise<OrchestrateResult> {
  // Step 1: Discover
  const metaPaths = globMetas(config.watchPaths);
  if (metaPaths.length === 0) return { synthesized: false };

  // Ensure all meta.json files exist
  const metas = new Map<string, MetaJson>();
  for (const mp of metaPaths) {
    metas.set(normalizePath(mp), ensureMetaJson(mp));
  }

  const tree = buildOwnershipTree(metaPaths);

  // Steps 3-4: Staleness check + candidate selection
  const candidates = [];
  for (const node of tree.nodes.values()) {
    const meta = metas.get(node.metaPath)!;
    const staleness = actualStaleness(meta);
    if (staleness > 0) {
      candidates.push({ node, meta, actualStaleness: staleness });
    }
  }

  const weighted = computeEffectiveStaleness(candidates, config.depthWeight);
  const winner = selectCandidate(weighted);
  if (!winner) return { synthesized: false };

  const { node } = winner;

  // Step 2: Acquire lock
  if (!acquireLock(node.metaPath)) {
    return { synthesized: false };
  }

  try {
    // Re-read meta after lock (may have changed)
    const currentMeta = JSON.parse(
      readFileSync(join(node.metaPath, 'meta.json'), 'utf8'),
    ) as MetaJson;

    const architectPrompt = currentMeta._architect ?? config.defaultArchitect;
    const criticPrompt = currentMeta._critic ?? config.defaultCritic;

    // Step 5: Structure hash
    const scopePrefix = getScopePrefix(node);
    const scanResult = await watcher.scan({ pathPrefix: scopePrefix });
    const scopeFiles = scanResult.files.map((f) => f.file_path);
    const newStructureHash = computeStructureHash(scopeFiles);
    const structureChanged = newStructureHash !== currentMeta._structureHash;

    // Step 6: Steer change detection
    const latestArchive = readLatestArchive(node.metaPath);
    const steerChanged = latestArchive
      ? currentMeta._steer !== latestArchive._steer
      : Boolean(currentMeta._steer);

    // Step 7: Compute context
    const ctx = await buildContextPackage(node, currentMeta, watcher);

    // Step 8: Architect (conditional)
    const architectTriggered =
      !currentMeta._builder ||
      structureChanged ||
      steerChanged ||
      (currentMeta._synthesisCount ?? 0) >= config.architectEvery;

    let builderBrief = currentMeta._builder ?? '';
    let synthesisCount = currentMeta._synthesisCount ?? 0;
    let stepError: SynthError | null = null;

    if (architectTriggered) {
      try {
        const architectTask = buildArchitectTask(ctx, currentMeta, config);
        const architectOutput = await executor.spawn(architectTask, {
          timeout: config.architectTimeout,
        });
        builderBrief = parseArchitectOutput(architectOutput);
        synthesisCount = 0;
      } catch (err) {
        stepError = toSynthError('architect', err);

        if (!currentMeta._builder) {
          // No cached builder — cycle fails
          finalizeCycle(
            node.metaPath,
            currentMeta,
            config,
            architectPrompt,
            '',
            criticPrompt,
            null,
            null,
            newStructureHash,
            synthesisCount,
            stepError,
          );
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
      const builderTask = buildBuilderTask(ctx, metaForBuilder, config);
      const builderRaw = await executor.spawn(builderTask, {
        timeout: config.builderTimeout,
      });
      builderOutput = parseBuilderOutput(builderRaw);
      synthesisCount++;
    } catch (err) {
      stepError = toSynthError('builder', err);
      return { synthesized: true, metaPath: node.metaPath, error: stepError };
    }

    // Step 10: Critic
    const metaForCritic: MetaJson = {
      ...currentMeta,
      _content: builderOutput.content,
    };
    let feedback: string | null = null;
    try {
      const criticTask = buildCriticTask(ctx, metaForCritic, config);
      const criticRaw = await executor.spawn(criticTask, {
        timeout: config.criticTimeout,
      });
      feedback = parseCriticOutput(criticRaw);
      stepError = null; // Clear any architect error on full success
    } catch (err) {
      stepError = stepError ?? toSynthError('critic', err);
    }

    // Steps 11-12: Merge, archive, prune
    finalizeCycle(
      node.metaPath,
      currentMeta,
      config,
      architectPrompt,
      builderBrief,
      criticPrompt,
      builderOutput,
      feedback,
      newStructureHash,
      synthesisCount,
      stepError,
    );

    return {
      synthesized: true,
      metaPath: node.metaPath,
      error: stepError ?? undefined,
    };
  } finally {
    // Step 13: Release lock
    releaseLock(node.metaPath);
  }
}
