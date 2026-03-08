/**
 * Ensure meta.json exists in each .meta/ directory.
 *
 * If meta.json is missing, creates it with a generated UUID.
 *
 * @module discovery/ensureMetaJson
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { MetaJson } from '../schema/index.js';

/**
 * Ensure meta.json exists at the given .meta/ path.
 *
 * @param metaPath - Absolute path to a .meta/ directory.
 * @returns The meta.json content (existing or newly created).
 */
export function ensureMetaJson(metaPath: string): MetaJson {
  const filePath = join(metaPath, 'meta.json');

  if (existsSync(filePath)) {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as MetaJson;
  }

  // Create the archive subdirectory while we're at it
  const archivePath = join(metaPath, 'archive');
  if (!existsSync(archivePath)) {
    mkdirSync(archivePath, { recursive: true });
  }

  const meta: MetaJson = { _id: randomUUID() };
  writeFileSync(filePath, JSON.stringify(meta, null, 2) + '\n');
  return meta;
}
