/**
 * Compute the file scope owned by a meta node.
 *
 * A meta owns: parent dir + all descendants, minus child .meta/ subtrees.
 * For child subtrees, it consumes the child's .meta/meta.json as a rollup input.
 *
 * @module discovery/scope
 */

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
 * Get paths that should be excluded from the scope (child meta subtrees).
 *
 * @param node - The meta node to compute exclusions for.
 * @returns Array of path prefixes to exclude from scope queries.
 */
export function getScopeExclusions(node: MetaNode): string[] {
  return node.children.map((child) => child.ownerPath);
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
    const normalized = f.replace(/\\\\/g, '/');

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
