/**
 * Glob watchPaths for .meta/ directories.
 *
 * Walks each watchPath recursively, collecting directories named '.meta'
 * that contain (or will contain) a meta.json file.
 *
 * @module discovery/globMetas
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Recursively find all .meta/ directories under the given paths.
 *
 * for indexed .meta/meta.json points rather than walking the filesystem.
 * Retained for backward compatibility and testing.
 *
 * @param watchPaths - Root directories to search.
 * @returns Array of absolute paths to .meta/ directories.
 */
export function globMetas(watchPaths: string[]): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // Skip unreadable directories
    }

    for (const entry of entries) {
      const full = join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }

      if (!stat.isDirectory()) continue;

      if (entry === '.meta') {
        results.push(full);
      } else {
        walk(full);
      }
    }
  }

  for (const wp of watchPaths) {
    walk(wp);
  }

  return results;
}
