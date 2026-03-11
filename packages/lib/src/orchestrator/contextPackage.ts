/**
 * Build the MetaContext for a synthesis cycle.
 *
 * Computes shared inputs once: scope files, delta files, child meta outputs,
 * previous content/feedback, steer, and archive paths.
 *
 * @module orchestrator/contextPackage
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { listArchiveFiles } from '../archive/index.js';
import { filterInScope, type MetaNode } from '../discovery/index.js';
import type { MetaContext, WatcherClient } from '../interfaces/index.js';
import { paginatedScan } from '../paginatedScan.js';
import type { MetaJson } from '../schema/index.js';

/**
 * Condense a file list into glob-like summaries.
 * Groups by directory + extension pattern.
 *
 * @param files - Array of file paths.
 * @param maxIndividual - Show individual files up to this count.
 * @returns Condensed summary string.
 */
export function condenseScopeFiles(
  files: string[],
  maxIndividual: number = 30,
): string {
  if (files.length <= maxIndividual) return files.join('\n');

  // Group by dir + extension
  const groups = new Map<string, number>();
  for (const f of files) {
    const dir = f.substring(0, f.lastIndexOf('/') + 1) || './';
    const ext = f.includes('.') ? f.substring(f.lastIndexOf('.')) : '(no ext)';
    const key = dir + '*' + ext;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }

  // Sort by count descending
  const sorted = [...groups.entries()].sort((a, b) => b[1] - a[1]);
  return sorted
    .map(([pattern, count]) => pattern + ' (' + count.toString() + ' files)')
    .join('\n');
}

/**
 * Build the context package for a synthesis cycle.
 *
 * @param node - The meta node being synthesized.
 * @param meta - Current meta.json content.
 * @param watcher - WatcherClient for scope enumeration.
 * @returns The computed context package.
 */
export async function buildContextPackage(
  node: MetaNode,
  meta: MetaJson,
  watcher: WatcherClient,
): Promise<MetaContext> {
  // Scope files via watcher scan, excluding child subtrees
  const allScanFiles = await paginatedScan(watcher, {
    pathPrefix: node.ownerPath,
  });
  const scopeFiles = filterInScope(
    node,
    allScanFiles.map((f) => f.file_path),
  );

  // Delta files: modified since _generatedAt
  let deltaFiles: string[];
  if (meta._generatedAt) {
    const modifiedAfter = Math.floor(
      new Date(meta._generatedAt).getTime() / 1000,
    );
    const deltaScanFiles = await paginatedScan(watcher, {
      pathPrefix: node.ownerPath,
      modifiedAfter,
    });
    deltaFiles = filterInScope(
      node,
      deltaScanFiles.map((f) => f.file_path),
    );
  } else {
    deltaFiles = scopeFiles; // First run: all files are delta
  }

  // Child meta outputs
  const childMetas: Record<string, unknown> = {};
  for (const child of node.children) {
    const childMetaFile = join(child.metaPath, 'meta.json');
    try {
      const raw = readFileSync(childMetaFile, 'utf8');
      const childMeta = JSON.parse(raw) as MetaJson;
      childMetas[child.ownerPath] = childMeta._content ?? null;
    } catch {
      childMetas[child.ownerPath] = null;
    }
  }

  // Archive paths
  const archives = listArchiveFiles(node.metaPath);

  return {
    path: node.metaPath,
    scopeFiles,
    deltaFiles,
    childMetas,
    previousContent: meta._content ?? null,
    previousFeedback: meta._feedback ?? null,
    steer: meta._steer ?? null,
    archives,
  };
}
