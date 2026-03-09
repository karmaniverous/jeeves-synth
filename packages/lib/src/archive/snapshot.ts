/**
 * Create archive snapshots of meta.json.
 *
 * Copies current meta.json to archive/\{ISO-timestamp\}.json with
 * _archived: true and _archivedAt added.
 *
 * @module archive/snapshot
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { MetaJson } from '../schema/index.js';

/**
 * Create an archive snapshot of the current meta.json.
 *
 * @param metaPath - Absolute path to the .meta directory.
 * @param meta - Current meta.json content.
 * @returns The archive file path.
 */
export function createSnapshot(metaPath: string, meta: MetaJson): string {
  const archiveDir = join(metaPath, 'archive');
  mkdirSync(archiveDir, { recursive: true });

  const now = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveFile = join(archiveDir, now + '.json');

  const archived: MetaJson = {
    ...meta,
    _archived: true,
    _archivedAt: new Date().toISOString(),
  };

  writeFileSync(archiveFile, JSON.stringify(archived, null, 2) + '\n');
  return archiveFile;
}
