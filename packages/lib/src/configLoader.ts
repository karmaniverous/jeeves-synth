/**
 * Load and resolve jeeves-meta config with \@file: indirection.
 *
 * @module configLoader
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { type MetaConfig, metaConfigSchema } from './schema/index.js';

/**
 * Resolve \@file: references in a config value.
 *
 * @param value - String value that may start with "\@file:".
 * @param baseDir - Base directory for resolving relative paths.
 * @returns The resolved string (file contents or original value).
 */
function resolveFileRef(value: string, baseDir: string): string {
  if (!value.startsWith('@file:')) return value;
  const filePath = join(baseDir, value.slice(6));
  return readFileSync(filePath, 'utf8');
}

/**
 * Load meta config from a JSON file, resolving \@file: references.
 *
 * @param configPath - Path to jeeves-meta.config.json.
 * @returns Validated MetaConfig with resolved prompt strings.
 */
export function loadMetaConfig(configPath: string): MetaConfig {
  const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Record<
    string,
    unknown
  >;
  const baseDir = dirname(configPath);

  if (typeof raw.defaultArchitect === 'string') {
    raw.defaultArchitect = resolveFileRef(raw.defaultArchitect, baseDir);
  }
  if (typeof raw.defaultCritic === 'string') {
    raw.defaultCritic = resolveFileRef(raw.defaultCritic, baseDir);
  }

  return metaConfigSchema.parse(raw);
}

/**
 * Resolve config path from --config flag or JEEVES_META_CONFIG env var.
 *
 * @param args - CLI arguments (process.argv.slice(2)).
 * @returns Resolved config path.
 * @throws If no config path found.
 */
export function resolveConfigPath(args: string[]): string {
  // Check --config flag
  const configIdx = args.indexOf('--config');
  if (configIdx !== -1 && args[configIdx + 1]) {
    return args[configIdx + 1];
  }

  // Check env var
  const envPath = process.env['JEEVES_META_CONFIG'];
  if (envPath) return envPath;

  throw new Error(
    'Config path required. Use --config <path> or set JEEVES_META_CONFIG env var.',
  );
}
