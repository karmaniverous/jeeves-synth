/**
 * Types for meta discovery and ownership tree.
 *
 * @module discovery/types
 */

/** A discovered meta node in the ownership tree. */
export interface MetaNode {
  /** Absolute path to the .meta directory. */
  metaPath: string;

  /** Absolute path to the parent directory that this meta owns. */
  ownerPath: string;

  /** Depth in the ownership tree (root = 0). */
  treeDepth: number;

  /** Child meta nodes (subtrees with their own .meta/). */
  children: MetaNode[];

  /** Parent meta node, or null for roots. */
  parent: MetaNode | null;
}

/** The full ownership tree discovered from watchPaths. */
export interface OwnershipTree {
  /** All discovered meta nodes, keyed by metaPath. */
  nodes: Map<string, MetaNode>;

  /** Root nodes (metas with no parent meta). */
  roots: MetaNode[];
}
