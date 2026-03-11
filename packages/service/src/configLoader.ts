/**
 * Load and resolve jeeves-meta service config.
 *
 * Supports \@file: indirection and environment-variable substitution (dollar-brace pattern).
 *
 * @module configLoader
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { type ServiceConfig, serviceConfigSchema } from './schema/config.js';

/**
 * Deep-walk a value, replacing `\${VAR\}` patterns with process.env values.
 *
 * @param value - Arbitrary JSON-compatible value.
 * @returns Value with env-var placeholders resolved.
 */
function substituteEnvVars(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{([^}]+)\}/g, (_match, name: string) => {
      const envVal = process.env[name];
      if (envVal === undefined) {
        throw new Error(`Environment variable ${name} is not set`);
      }
      return envVal;
    });
  }

  if (Array.isArray(value)) {
    return value.map(substituteEnvVars);
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = substituteEnvVars(val);
    }
    return result;
  }

  return value;
}

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
 * Resolve config path from --config flag or JEEVES_META_CONFIG env var.
 *
 * @param args - CLI arguments (process.argv.slice(2)).
 * @returns Resolved config path.
 * @throws If no config path found.
 */
export function resolveConfigPath(args: string[]): string {
  let configIdx = args.indexOf('--config');
  if (configIdx === -1) configIdx = args.indexOf('-c');
  if (configIdx !== -1 && args[configIdx + 1]) {
    return args[configIdx + 1];
  }

  const envPath = process.env['JEEVES_META_CONFIG'];
  if (envPath) return envPath;

  throw new Error(
    'Config path required. Use --config <path> or set JEEVES_META_CONFIG env var.',
  );
}

/**
 * Load service config from a JSON file.
 *
 * Resolves \@file: references for defaultArchitect and defaultCritic,
 * and substitutes environment-variable placeholders throughout.
 *
 * @param configPath - Path to config JSON file.
 * @returns Validated ServiceConfig.
 */
export function loadServiceConfig(configPath: string): ServiceConfig {
  const rawText = readFileSync(configPath, 'utf8');
  const raw = substituteEnvVars(JSON.parse(rawText)) as Record<string, unknown>;
  const baseDir = dirname(configPath);

  if (typeof raw['defaultArchitect'] === 'string') {
    raw['defaultArchitect'] = resolveFileRef(raw['defaultArchitect'], baseDir);
  }
  if (typeof raw['defaultCritic'] === 'string') {
    raw['defaultCritic'] = resolveFileRef(raw['defaultCritic'], baseDir);
  }

  return serviceConfigSchema.parse(raw);
}
