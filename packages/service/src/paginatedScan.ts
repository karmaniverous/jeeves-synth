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
): Promise<ScanFile[]> {
  const allFiles: ScanFile[] = [];
  let cursor: string | undefined;

  do {
    const result = await watcher.scan({ ...params, cursor });
    allFiles.push(...result.files);
    cursor = result.next;
  } while (cursor);

  return allFiles;
}
