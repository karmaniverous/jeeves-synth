/**
 * Shared constants for the jeeves-meta service package.
 *
 * @module constants
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Default HTTP port for the jeeves-meta service. */
export const DEFAULT_PORT = 1938;

/** Default port as a string (for Commander CLI defaults). */
export const DEFAULT_PORT_STR = String(DEFAULT_PORT);

/** Service name identifier. */
export const SERVICE_NAME = 'jeeves-meta';

/** Service version, read from package.json at startup. */
export const SERVICE_VERSION: string = (() => {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    // Walk up to find package.json (works from src/, dist/, or dist/cli/jeeves-meta/)
    let current = dir;
    const candidates: string[] = [];
    for (let i = 0; i < 5; i++) {
      candidates.push(resolve(current, 'package.json'));
      current = resolve(current, '..');
    }
    for (const candidate of candidates) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as {
          version?: string;
        };
        if (pkg.version) return pkg.version;
      } catch {
        // try next candidate
      }
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
})();
