/**
 * Unified meta listing: scan, dedup, enrich.
 *
 * Single source of truth for all consumers that need a list of metas
 * with enriched metadata. Replaces duplicated scan+dedup logic in
 * plugin tools, CLI, and prompt injection.
 *
 * @module discovery/listMetas
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { WatcherClient } from '../interfaces/index.js';
import { isLocked } from '../lock.js';
import type { MinimalLogger } from '../logger/index.js';

/** Maximum staleness for never-synthesized metas (1 year in seconds). */
const MAX_STALENESS_SECONDS = 365 * 86_400;
import { normalizePath } from '../normalizePath.js';
import type { MetaConfig, MetaJson } from '../schema/index.js';
import { discoverMetas } from './discoverMetas.js';
import { buildOwnershipTree } from './ownershipTree.js';
import type { MetaNode, OwnershipTree } from './types.js';

/** Enriched meta entry returned by listMetas(). */
export interface MetaEntry {
  /** Normalized .meta/ directory path. */
  path: string;
  /** Tree depth (0 = leaf, higher = more abstract). */
  depth: number;
  /** Scheduling emphasis multiplier. */
  emphasis: number;
  /** Seconds since last synthesis, or Infinity if never synthesized. */
  stalenessSeconds: number;
  /** ISO timestamp of last synthesis, or null. */
  lastSynthesized: string | null;
  /** Whether the last synthesis had an error. */
  hasError: boolean;
  /** Whether this meta is currently locked. */
  locked: boolean;
  /** Cumulative architect tokens, or null if never run. */
  architectTokens: number | null;
  /** Cumulative builder tokens, or null if never run. */
  builderTokens: number | null;
  /** Cumulative critic tokens, or null if never run. */
  criticTokens: number | null;
  /** Number of direct children in the ownership tree. */
  children: number;
  /** The underlying MetaNode from the ownership tree. */
  node: MetaNode;
  /** The parsed meta.json content. */
  meta: MetaJson;
}

/** Summary statistics computed from the meta list. */
export interface MetaListSummary {
  total: number;
  stale: number;
  errors: number;
  locked: number;
  neverSynthesized: number;
  tokens: {
    architect: number;
    builder: number;
    critic: number;
  };
  stalestPath: string | null;
  lastSynthesizedPath: string | null;
  lastSynthesizedAt: string | null;
}

/** Full result from listMetas(). */
export interface MetaListResult {
  summary: MetaListSummary;
  entries: MetaEntry[];
  tree: OwnershipTree;
}

/**
 * Discover, deduplicate, and enrich all metas.
 *
 * This is the single consolidated function that replaces all duplicated
 * scan+dedup+enrich logic across the codebase. All enrichment comes from
 * reading meta.json on disk (the canonical source).
 *
 * @param config - Validated synthesis config.
 * @param watcher - Watcher HTTP client for discovery.
 * @returns Enriched meta list with summary statistics and ownership tree.
 */
export async function listMetas(
  config: MetaConfig,
  watcher: WatcherClient,
  logger?: MinimalLogger,
): Promise<MetaListResult> {
  // Step 1: Discover deduplicated meta paths via watcher scan
  const metaPaths = await discoverMetas(config, watcher, logger);

  // Step 2: Build ownership tree
  const tree = buildOwnershipTree(metaPaths);

  // Step 3: Read and enrich each meta from disk
  const entries: MetaEntry[] = [];
  let staleCount = 0;
  let errorCount = 0;
  let lockedCount = 0;
  let neverSynthesizedCount = 0;
  let totalArchTokens = 0;
  let totalBuilderTokens = 0;
  let totalCriticTokens = 0;
  let lastSynthPath: string | null = null;
  let lastSynthAt: string | null = null;
  let stalestPath: string | null = null;
  let stalestEffective = -1;

  for (const node of tree.nodes.values()) {
    let meta: MetaJson;
    try {
      meta = JSON.parse(
        readFileSync(join(node.metaPath, 'meta.json'), 'utf8'),
      ) as MetaJson;
    } catch {
      // Skip unreadable metas
      continue;
    }

    const depth = meta._depth ?? node.treeDepth;
    const emphasis = meta._emphasis ?? 1;
    const hasError = Boolean(meta._error);
    const locked = isLocked(normalizePath(node.metaPath));
    const neverSynth = !meta._generatedAt;

    // Compute staleness
    let stalenessSeconds: number;
    if (neverSynth) {
      stalenessSeconds = MAX_STALENESS_SECONDS;
    } else {
      const genAt = new Date(meta._generatedAt!).getTime();
      stalenessSeconds = Math.max(0, Math.floor((Date.now() - genAt) / 1000));
    }

    // Tokens
    const archTokens = meta._architectTokens ?? 0;
    const buildTokens = meta._builderTokens ?? 0;
    const critTokens = meta._criticTokens ?? 0;

    // Accumulate summary stats
    if (stalenessSeconds > 0) staleCount++;
    if (hasError) errorCount++;
    if (locked) lockedCount++;
    if (neverSynth) neverSynthesizedCount++;
    totalArchTokens += archTokens;
    totalBuilderTokens += buildTokens;
    totalCriticTokens += critTokens;

    // Track last synthesized
    if (meta._generatedAt) {
      if (!lastSynthAt || meta._generatedAt > lastSynthAt) {
        lastSynthAt = meta._generatedAt;
        lastSynthPath = node.metaPath;
      }
    }

    // Track stalest (effective staleness for scheduling)
    const depthFactor = Math.pow(1 + config.depthWeight, depth);
    const effectiveStaleness = stalenessSeconds * depthFactor * emphasis;
    if (effectiveStaleness > stalestEffective) {
      stalestEffective = effectiveStaleness;
      stalestPath = node.metaPath;
    }

    entries.push({
      path: node.metaPath,
      depth,
      emphasis,
      stalenessSeconds,
      lastSynthesized: meta._generatedAt ?? null,
      hasError,
      locked,
      architectTokens: archTokens > 0 ? archTokens : null,
      builderTokens: buildTokens > 0 ? buildTokens : null,
      criticTokens: critTokens > 0 ? critTokens : null,
      children: node.children.length,
      node,
      meta,
    });
  }

  return {
    summary: {
      total: entries.length,
      stale: staleCount,
      errors: errorCount,
      locked: lockedCount,
      neverSynthesized: neverSynthesizedCount,
      tokens: {
        architect: totalArchTokens,
        builder: totalBuilderTokens,
        critic: totalCriticTokens,
      },
      stalestPath,
      lastSynthesizedPath: lastSynthPath,
      lastSynthesizedAt: lastSynthAt,
    },
    entries,
    tree,
  };
}
