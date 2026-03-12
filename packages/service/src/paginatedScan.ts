/**
 * Paginated scan helper for exhaustive scope enumeration.
 *
 * @module paginatedScan
 */

import type {
  ScanFile,
  ScanParams,
  WatcherClient,
} from './interfaces/index.js';
import type { MinimalLogger } from './logger/index.js';

/**
 * Perform a paginated scan that follows cursor tokens until exhausted.
 *
 * @param watcher - WatcherClient instance.
 * @param params - Base scan parameters (cursor is managed internally).
 * @returns All matching files across all pages.
 */
export async function paginatedScan(
  watcher: WatcherClient,
  params: Omit<ScanParams, 'cursor'>,
  logger?: MinimalLogger,
): Promise<ScanFile[]> {
  const allFiles: ScanFile[] = [];
  let cursor: string | undefined;
  let pageCount = 0;
  const start = Date.now();

  do {
    const pageStart = Date.now();
    const result = await watcher.scan({ ...params, cursor });
    allFiles.push(...result.files);
    pageCount++;
    logger?.debug(
      {
        page: pageCount,
        files: result.files.length,
        pageMs: Date.now() - pageStart,
        hasNext: Boolean(result.next),
      },
      'paginatedScan page',
    );
    cursor = result.next;
  } while (cursor);

  logger?.debug(
    {
      pages: pageCount,
      totalFiles: allFiles.length,
      totalMs: Date.now() - start,
    },
    'paginatedScan complete',
  );
  return allFiles;
}
