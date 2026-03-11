/**
 * Orchestrator module — the main synthesis cycle.
 *
 * @module orchestrator
 */

export {
  buildArchitectTask,
  buildBuilderTask,
  buildCriticTask,
} from './buildTask.js';
export { buildContextPackage } from './contextPackage.js';
export { mergeAndWrite, type MergeOptions } from './merge.js';
export {
  orchestrate,
  type OrchestrateResult,
  type ProgressCallback,
} from './orchestrate.js';
export {
  type BuilderOutput,
  parseArchitectOutput,
  parseBuilderOutput,
  parseCriticOutput,
} from './parseOutput.js';
