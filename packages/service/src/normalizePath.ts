/**
 * Normalize file paths to forward slashes for consistency with watcher-indexed paths.
 *
 * Watcher indexes paths with forward slashes (`j:/domains/...`). This utility
 * ensures all paths in the library use the same convention, regardless of
 * the platform's native separator.
 *
 * @module normalizePath
 */

/**
 * Normalize a file path to forward slashes.
 *
 * @param p - File path (may contain backslashes).
 * @returns Path with all backslashes replaced by forward slashes.
 */
export function normalizePath(p: string): string {
  return p.replaceAll('\\', '/');
}
