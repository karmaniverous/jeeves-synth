/**
 * Knowledge synthesis engine for the Jeeves platform.
 *
 * @packageDocumentation
 */

export {
  buildOwnershipTree,
  ensureMetaJson,
  filterInScope,
  getScopeExclusions,
  getScopePrefix,
  globMetas,
  type MetaNode,
  type OwnershipTree,
} from './discovery/index.js';
export type {
  InferenceRuleSpec,
  ScanFile,
  ScanParams,
  ScanResponse,
  SynthContext,
  SynthExecutor,
  SynthSpawnOptions,
  WatcherClient,
} from './interfaces/index.js';
export {
  type MetaJson,
  metaJsonSchema,
  type SynthConfig,
  synthConfigSchema,
  type SynthError,
  synthErrorSchema,
} from './schema/index.js';
