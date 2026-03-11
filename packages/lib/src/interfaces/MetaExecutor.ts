/**
 * Pluggable executor interface for LLM subprocess invocation.
 *
 * @module interfaces/MetaExecutor
 */

/** Options for spawning a synthesis subprocess. */
export interface MetaSpawnOptions {
  /** Model override for this subprocess. */
  model?: string;
  /** Timeout in seconds. */
  timeout?: number;
  /** Label for the spawned session. */
  label?: string;
  /** Thinking level (e.g. "low", "medium", "high"). */
  thinking?: string;
}

/** Result of a spawn call, including optional token usage. */
export interface MetaSpawnResult {
  /** Subprocess output text. */
  output: string;
  /** Token count for this call, if available from the executor. */
  tokens?: number;
}

/**
 * Interface for spawning synthesis subprocesses.
 *
 * The executor abstracts the LLM invocation mechanism. The orchestrator
 * calls spawn() sequentially for architect, builder, and critic steps.
 * Each call blocks until the subprocess completes and returns its result.
 */
export interface MetaExecutor {
  /**
   * Spawn a subprocess with the given task prompt.
   *
   * @param task - Full task prompt for the subprocess.
   * @param options - Optional model and timeout overrides.
   * @returns The subprocess result with output and optional token count.
   */
  spawn(task: string, options?: MetaSpawnOptions): Promise<MetaSpawnResult>;
}
