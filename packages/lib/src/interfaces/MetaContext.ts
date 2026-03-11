/**
 * Per-cycle context package computed by the orchestrator.
 *
 * Shared inputs that multiple subprocesses need are computed once
 * and serialized into each subprocess's task prompt.
 *
 * @module interfaces/MetaContext
 */

/**
 * Context package for a single synthesis cycle.
 *
 * The orchestrator computes this once per cycle from the meta path,
 * ownership tree, watcher scan results, and filesystem reads.
 */
export interface MetaContext {
  /** Absolute path to the .meta directory. */
  path: string;

  /** All files in scope (absolute paths). */
  scopeFiles: string[];

  /** Files changed since _generatedAt (absolute paths). */
  deltaFiles: string[];

  /** Child _content outputs, keyed by relative path. */
  childMetas: Record<string, unknown>;

  /** _content from the last cycle, or null on first run. */
  previousContent: string | null;

  /** _feedback from the last cycle, or null on first run. */
  previousFeedback: string | null;

  /** Current _steer value, or null if unset. */
  steer: string | null;

  /** Archive snapshot file paths (for steer change detection, etc.). */
  archives: string[];
}
