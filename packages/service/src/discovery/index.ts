/**
 * Discovery module — glob .meta/ directories and build ownership tree.
 *
 * Module: discovery
 */

export { buildMetaFilter, discoverMetas } from './discoverMetas.js';
export {
  listMetas,
  type MetaEntry,
  type MetaListResult,
  type MetaListSummary,
} from './listMetas.js';
export { buildOwnershipTree, findNode } from './ownershipTree.js';
export { filterInScope, getScopePrefix } from './scope.js';
export type { MetaNode, OwnershipTree } from './types.js';
