/**
 * Load and resolve jeeves-synth config with @file: indirection.
 *
 * @module configLoader
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  type SynthConfig,
  synthConfigSchema,
} from '@karmaniverous/jeeves-synth';

/**
 * Resolve @file: references in a config value.
 *
 * @param value - String value that may start with "@file:".
 * @param baseDir - Base directory for resolving relative paths.
 * @returns The resolved string (file contents or original value).
 */
function resolveFileRef(value: string, baseDir: string): string {
  if (!value.startsWith('@file:')) return value;
  const filePath = join(baseDir, value.slice(6));
  return readFileSync(filePath, 'utf8');
}

/**
 * Load synth config from a JSON file, resolving @file: references.
 *
 * @param configPath - Path to jeeves-synth.config.json.
 * @returns Validated SynthConfig with resolved prompt strings.
 */
export function loadSynthConfig(configPath: string): SynthConfig {
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

  return synthConfigSchema.parse(raw);
}
