/**
 * Abstraction over the jeeves-watcher HTTP API.
 *
 * The orchestrator uses this for structured queries (POST /scan)
 * and virtual rule registration. Subprocesses use watcher_search
 * directly via tools.
 *
 * @module interfaces/WatcherClient
 */

/** A file returned from a scan query. */
export interface ScanFile {
  /** Absolute file path. */
  file_path: string;
  /** Last modified time as Unix seconds. */
  modified_at: number;
  /** SHA-256 hash of file content. */
  content_hash: string;
  /** Additional payload fields requested via `fields`. */
  [key: string]: unknown;
}

/** Parameters for a scan request. */
export interface ScanParams {
  /** File path prefix to match. Required unless filter is provided. */
  pathPrefix?: string;
  /** Qdrant filter object for structural queries. */
  filter?: Record<string, unknown>;
  /** Filter files modified after this Unix timestamp (seconds). */
  modifiedAfter?: number;
  /** Which payload fields to return (default: all). */
  fields?: string[];
  /** Maximum results per page. */
  limit?: number;
  /** Pagination cursor from previous response. */
  cursor?: string;
}

/** Response from a scan request. */
export interface ScanResponse {
  /** Deduplicated file results (one per file). */
  files: ScanFile[];
  /** Pagination cursor. Absent when no more results. */
  next?: string;
}

/** An inference rule to register with the watcher. */
export interface InferenceRuleSpec {
  /** Rule name. */
  name: string;
  /** Rule description. */
  description: string;
  /** JSON Schema match criteria. */
  match: Record<string, unknown>;
  /** Schema array with set keywords. */
  schema: unknown[];
  /** Declarative render config. */
  render?: Record<string, unknown>;
  /** Handlebars template name. */
  template?: string;
  /** Render output format. */
  renderAs?: string;
}

/**
 * Interface for watcher HTTP operations.
 *
 * Implementations handle retry with backoff internally.
 */
export interface WatcherClient {
  /**
   * Query indexed files by path prefix and optional filters.
   * Qdrant has no native prefix match; the watcher handles this internally.
   */
  scan(params: ScanParams): Promise<ScanResponse>;

  /**
   * Register virtual inference rules with the watcher.
   *
   * @param source - Source identifier (e.g. 'jeeves-meta').
   * @param rules - Array of inference rules to register.
   */
  registerRules(source: string, rules: InferenceRuleSpec[]): Promise<void>;

  /**
   * Unregister virtual inference rules by source.
   *
   * @param source - Source identifier to unregister.
   */
  unregisterRules(source: string): Promise<void>;
}
