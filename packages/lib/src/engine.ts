/**
 * Factory for creating a bound synthesis engine.
 *
 * @module engine
 */

import type { SynthExecutor, WatcherClient } from './interfaces/index.js';
import { orchestrate, type OrchestrateResult } from './orchestrator/index.js';
import type { SynthConfig } from './schema/index.js';

/** A bound synthesis engine instance. */
export interface SynthEngine {
  /** Run a single synthesis cycle (next-stalest candidate). */
  synthesize(): Promise<OrchestrateResult>;
  /** Run synthesis targeting a specific path. */
  synthesizePath(ownerPath: string): Promise<OrchestrateResult>;
  /** The bound config. */
  readonly config: SynthConfig;
}

/**
 * Create a synthesis engine with bound config, executor, and watcher client.
 *
 * @param config - Validated synthesis config.
 * @param executor - Pluggable LLM executor.
 * @param watcher - Watcher HTTP client.
 * @returns A bound engine instance.
 */
export function createSynthEngine(
  config: SynthConfig,
  executor: SynthExecutor,
  watcher: WatcherClient,
): SynthEngine {
  return {
    config,
    synthesize(): Promise<OrchestrateResult> {
      return orchestrate(config, executor, watcher);
    },
    synthesizePath(ownerPath: string): Promise<OrchestrateResult> {
      const scopedConfig = { ...config, watchPaths: [ownerPath] };
      return orchestrate(scopedConfig, executor, watcher);
    },
  };
}
