/**
 * Compute the file scope owned by a meta node.
 *
 * A meta owns: parent dir + all descendants, minus child .meta/ subtrees.
 * For child subtrees, it consumes the child's .meta/meta.json as a rollup input.
 *
 * @module discovery/scope
 */

import type { WatcherClient } from '../interfaces/index.js';
import { paginatedScan } from '../paginatedScan.js';
import type { MetaNode } from './types.js';

/**
 * Get the scope path prefix for a meta node.
 *
 * This is the ownerPath — all files under this path are in scope,
 * except subtrees owned by child metas.
 *
 * @param node - The meta node to compute scope for.
 * @returns The scope path prefix.
 */
export function getScopePrefix(node: MetaNode): string {
  return node.ownerPath;
}

/**
 * Filter a list of file paths to only those in scope for a meta node.
 *
 * Includes files under ownerPath, excludes files under child meta ownerPaths,
 * but includes child .meta/meta.json files as rollup inputs.
 *
 * @param node - The meta node.
 * @param files - Array of file paths to filter.
 * @returns Filtered array of in-scope file paths.
 */
export function filterInScope(node: MetaNode, files: string[]): string[] {
  const prefix = node.ownerPath + '/';
  const exclusions = node.children.map((c) => c.ownerPath + '/');
  const childMetaJsons = new Set(
    node.children.map((c) => c.metaPath + '/meta.json'),
  );

  return files.filter((f) => {
    const normalized = f.split('\\').join('/');

    // Must be under ownerPath
    if (!normalized.startsWith(prefix) && normalized !== node.ownerPath)
      return false;

    // Check if under a child meta's subtree
    for (const excl of exclusions) {
      if (normalized.startsWith(excl)) {
        // Exception: child meta.json files are included as rollup inputs
        return childMetaJsons.has(normalized);
      }
    }

    return true;
  });
}

/** Result of getScopeFiles, including both filtered and unfiltered file lists. */
export interface ScopeFilesResult {
  /** Files directly owned by this meta (excluding child subtrees). */
  scopeFiles: string[];
  /** All files under the owner path (including child subtrees). */
  allFiles: string[];
}

/**
 * Get all files in scope for a meta node via watcher scan.
 *
 * Scans the owner path prefix and filters out child meta subtrees,
 * keeping only files directly owned by this meta.
 *
 * @param node - The meta node.
 * @param watcher - WatcherClient for scan queries.
 * @returns Array of in-scope file paths.
 */
export async function getScopeFiles(
  node: MetaNode,
  watcher: WatcherClient,
): Promise<ScopeFilesResult> {
  const allScanFiles = await paginatedScan(watcher, {
    pathPrefix: node.ownerPath,
  });
  const allFiles = allScanFiles.map((f) => f.file_path);
  return {
    scopeFiles: filterInScope(node, allFiles),
    allFiles,
  };
}

/**
 * Get files modified since a given timestamp within a meta node's scope.
 *
 * If no generatedAt is provided (first run), returns all scope files.
 *
 * @param node - The meta node.
 * @param watcher - WatcherClient for scan queries.
 * @param generatedAt - ISO timestamp of last synthesis, or null/undefined for first run.
 * @param scopeFiles - Pre-computed scope files (used as fallback for first run).
 * @returns Array of modified in-scope file paths.
 */
export async function getDeltaFiles(
  node: MetaNode,
  watcher: WatcherClient,
  generatedAt: string | undefined,
  scopeFiles: string[],
): Promise<string[]> {
  if (!generatedAt) return scopeFiles;

  const modifiedAfter = Math.floor(new Date(generatedAt).getTime() / 1000);
  const deltaScanFiles = await paginatedScan(watcher, {
    pathPrefix: node.ownerPath,
    modifiedAfter,
  });
  return filterInScope(
    node,
    deltaScanFiles.map((f) => f.file_path),
  );
}
