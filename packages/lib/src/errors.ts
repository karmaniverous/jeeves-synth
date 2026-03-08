/**
 * Shared error utilities.
 *
 * @module errors
 */

import type { SynthError } from './schema/index.js';

/**
 * Wrap an unknown caught value into a SynthError.
 *
 * @param step - Which synthesis step failed.
 * @param err - The caught error value.
 * @param code - Error classification code.
 * @returns A structured SynthError.
 */
export function toSynthError(
  step: SynthError['step'],
  err: unknown,
  code = 'FAILED',
): SynthError {
  return {
    step,
    code,
    message: err instanceof Error ? err.message : String(err),
  };
}
