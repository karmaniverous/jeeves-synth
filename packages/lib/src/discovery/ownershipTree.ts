/**
 * Build the ownership tree from discovered .meta/ paths.
 *
 * Each .meta/ directory owns its parent directory and all descendants,
 * except subtrees that contain their own .meta/. For those subtrees,
 * the parent meta consumes the child meta's synthesis output.
 *
 * @module discovery/ownershipTree
 */

import { dirname, relative, sep } from 'node:path';

import type { MetaNode, OwnershipTree } from './types.js';

/** Normalize path separators to forward slashes for consistent comparison. */
function normalizePath(p: string): string {
  return p.split(sep).join('/');
}

/**
 * Build an ownership tree from an array of .meta/ directory paths.
 *
 * @param metaPaths - Absolute paths to .meta/ directories.
 * @returns The ownership tree with parent/child relationships.
 */
export function buildOwnershipTree(metaPaths: string[]): OwnershipTree {
  const nodes = new Map<string, MetaNode>();

  // Create nodes, sorted by ownerPath length (shortest first = shallowest)
  const sorted = [...metaPaths]
    .map((mp) => ({
      metaPath: normalizePath(mp),
      ownerPath: normalizePath(dirname(mp)),
    }))
    .sort((a, b) => a.ownerPath.length - b.ownerPath.length);

  for (const { metaPath, ownerPath } of sorted) {
    nodes.set(metaPath, {
      metaPath,
      ownerPath,
      treeDepth: 0,
      children: [],
      parent: null,
    });
  }

  const roots: MetaNode[] = [];

  // For each node, find its closest ancestor meta
  for (const node of nodes.values()) {
    let bestParent: MetaNode | null = null;
    let bestParentLen = -1;

    for (const candidate of nodes.values()) {
      if (candidate === node) continue;

      // Check if node's ownerPath is under candidate's ownerPath
      const rel = relative(candidate.ownerPath, node.ownerPath);
      if (rel.startsWith('..') || rel === '') continue;

      // candidate.ownerPath is an ancestor of node.ownerPath
      if (candidate.ownerPath.length > bestParentLen) {
        bestParent = candidate;
        bestParentLen = candidate.ownerPath.length;
      }
    }

    if (bestParent) {
      node.parent = bestParent;
      node.treeDepth = bestParent.treeDepth + 1;
      bestParent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return { nodes, roots };
}

/**
 * Find a node in the ownership tree by meta path or owner path.
 *
 * @param tree - The ownership tree to search.
 * @param targetPath - Path to search for (meta path or owner path).
 * @returns The matching node, or undefined if not found.
 */
export function findNode(
  tree: OwnershipTree,
  targetPath: string,
): MetaNode | undefined {
  return Array.from(tree.nodes.values()).find(
    (n) => n.metaPath === targetPath || n.ownerPath === targetPath,
  );
}
