/**
 * Read the latest archive snapshot for steer change detection.
 *
 * @module archive/readLatest
 */

import { readFileSync } from 'node:fs';

import type { MetaJson } from '../schema/index.js';
import { listArchiveFiles } from './listArchive.js';

/**
 * Read the most recent archive snapshot.
 *
 * @param metaPath - Absolute path to the .meta directory.
 * @returns The latest archived meta, or null if no archives exist.
 */
export function readLatestArchive(metaPath: string): MetaJson | null {
  const files = listArchiveFiles(metaPath);
  if (files.length === 0) return null;

  const raw = readFileSync(files[files.length - 1], 'utf8');
  return JSON.parse(raw) as MetaJson;
}
