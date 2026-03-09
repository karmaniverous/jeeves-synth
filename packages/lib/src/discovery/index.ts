/**
 * Discovery module — glob .meta/ directories and build ownership tree.
 *
 * @module discovery
 */

export { ensureMetaJson } from './ensureMetaJson.js';
export { globMetas } from './globMetas.js';
export { buildOwnershipTree, findNode } from './ownershipTree.js';
export { filterInScope, getScopeExclusions, getScopePrefix } from './scope.js';
export type { MetaNode, OwnershipTree } from './types.js';
