/**
 * Shared constants for the jeeves-meta service package.
 *
 * @module constants
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { packageDirectorySync } from 'package-directory';

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
    const root = packageDirectorySync({ cwd: dir });
    if (root) {
      const pkg = JSON.parse(
        readFileSync(resolve(root, 'package.json'), 'utf8'),
      ) as { version?: string };
      if (pkg.version) return pkg.version;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
})();
