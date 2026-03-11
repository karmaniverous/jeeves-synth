/**
 * Compute a structure hash from a sorted file listing.
 *
 * Used to detect when directory structure changes, triggering
 * an architect re-run.
 *
 * @module structureHash
 */

import { createHash } from 'node:crypto';

/**
 * Compute a SHA-256 hash of a sorted file listing.
 *
 * @param filePaths - Array of file paths in scope.
 * @returns Hex-encoded SHA-256 hash of the sorted, newline-joined paths.
 */
export function computeStructureHash(filePaths: string[]): string {
  const sorted = [...filePaths].sort();
  const content = sorted.join('\n');
  return createHash('sha256').update(content).digest('hex');
}
