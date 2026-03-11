/**
 * Orchestrator module — the main synthesis cycle.
 *
 * Module: orchestrator
 */

export {
  buildArchitectTask,
  buildBuilderTask,
  buildCriticTask,
} from './buildTask.js';
export { buildContextPackage } from './contextPackage.js';
export { mergeAndWrite, type MergeOptions } from './merge.js';
export { orchestrate, type OrchestrateResult } from './orchestrate.js';
export {
  type BuilderOutput,
  parseArchitectOutput,
  parseBuilderOutput,
  parseCriticOutput,
} from './parseOutput.js';
