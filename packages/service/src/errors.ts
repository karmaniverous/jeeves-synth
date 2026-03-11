/**
 * Shared error utilities.
 *
 * @module errors
 */

import type { MetaError } from './schema/index.js';

/**
 * Wrap an unknown caught value into a MetaError.
 *
 * @param step - Which synthesis step failed.
 * @param err - The caught error value.
 * @param code - Error classification code.
 * @returns A structured MetaError.
 */
export function toMetaError(
  step: MetaError['step'],
  err: unknown,
  code = 'FAILED',
): MetaError {
  return {
    step,
    code,
    message: err instanceof Error ? err.message : String(err),
  };
}
