/**
 * Discover .meta/ directories via watcher scan.
 *
 * Replaces filesystem-based globMetas() with a watcher query
 * that returns indexed .meta/meta.json points, filtered by domain.
 *
 * @module discovery/discoverMetas
 */

import type { WatcherClient } from '../interfaces/index.js';
import { normalizePath } from '../normalizePath.js';
import { paginatedScan } from '../paginatedScan.js';
import type { MetaConfig } from '../schema/index.js';

/**
 * Build a single Qdrant filter clause from a key-value pair.
 *
 * Arrays use `match.value` on the first element (Qdrant array membership).
 * Scalars (string, number, boolean) use `match.value` directly.
 * Objects and other non-filterable types are skipped with a warning.
 */
function buildMatchClause(
  key: string,
  value: unknown,
): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return { key, match: { value: value[0] as string | number | boolean } };
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return { key, match: { value } };
  }
  // Non-filterable value (object, null, etc.) — valid for tagging but
  // cannot be expressed as a Qdrant match clause.
  return null;
}

/**
 * Build a Qdrant filter from config metaProperty.
 *
 * Iterates all key-value pairs in `metaProperty` (a generic record)
 * to construct `must` clauses. Always appends `file_path: meta.json`
 * for deduplication.
 *
 * @param config - Meta config with metaProperty.
 * @returns Qdrant filter object for scanning live metas.
 */
export function buildMetaFilter(config: MetaConfig): Record<string, unknown> {
  const must: Record<string, unknown>[] = [];

  for (const [key, value] of Object.entries(config.metaProperty)) {
    const clause = buildMatchClause(key, value);
    if (clause) must.push(clause);
  }

  must.push({
    key: 'file_path',
    match: { text: '.meta/meta.json' },
  });

  return { must };
}

/**
 * Discover all .meta/ directories via watcher scan.
 *
 * Queries the watcher for indexed .meta/meta.json points using the
 * configured domain filter. Returns deduplicated meta directory paths.
 *
 * @param config - Meta config (for domain filter).
 * @param watcher - WatcherClient for scan queries.
 * @returns Array of normalized .meta/ directory paths.
 */
export async function discoverMetas(
  config: MetaConfig,
  watcher: WatcherClient,
): Promise<string[]> {
  const filter = buildMetaFilter(config);

  const scanFiles = await paginatedScan(watcher, {
    filter,
    fields: ['file_path'],
  });

  // Deduplicate by .meta/ directory path (handles multi-chunk files)
  const seen = new Set<string>();
  const metaPaths: string[] = [];

  for (const sf of scanFiles) {
    const fp = normalizePath(sf.file_path);
    // Derive .meta/ directory from file_path (strip /meta.json)
    const metaPath = fp.replace(/\/meta\.json$/, '');
    if (seen.has(metaPath)) continue;
    seen.add(metaPath);
    metaPaths.push(metaPath);
  }

  return metaPaths;
}
