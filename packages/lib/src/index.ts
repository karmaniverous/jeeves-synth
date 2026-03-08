/**
 * Knowledge synthesis engine for the Jeeves platform.
 *
 * @packageDocumentation
 */

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
