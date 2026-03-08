/**
 * Pluggable executor interface for LLM subprocess invocation.
 *
 * Consumers provide the executor implementation:
 * - Runner script: HTTP calls to OpenClaw gateway API
 * - OpenClaw plugin: sessions_spawn + sessions_history polling
 * - Tests: mock executor returning canned responses
 *
 * @module interfaces/SynthExecutor
 */

/** Options for spawning a synthesis subprocess. */
export interface SynthSpawnOptions {
  /** Model override for this subprocess. */
  model?: string;
  /** Timeout in seconds. */
  timeout?: number;
}

/**
 * Interface for spawning synthesis subprocesses.
 *
 * The executor abstracts the LLM invocation mechanism. The orchestrator
 * calls spawn() sequentially for architect, builder, and critic steps.
 * Each call blocks until the subprocess completes and returns its output.
 */
export interface SynthExecutor {
  /**
   * Spawn a subprocess with the given task prompt.
   *
   * @param task - Full task prompt for the subprocess.
   * @param options - Optional model and timeout overrides.
   * @returns The subprocess output as a string.
   */
  spawn(task: string, options?: SynthSpawnOptions): Promise<string>;
}
