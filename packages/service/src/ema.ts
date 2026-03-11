/**
 * Exponential moving average helper for token tracking.
 *
 * @module ema
 */

const DEFAULT_DECAY = 0.3;

/**
 * Compute exponential moving average.
 *
 * @param current - New observation.
 * @param previous - Previous EMA value, or undefined for first observation.
 * @param decay - Decay factor (0-1). Higher = more weight on new value. Default 0.3.
 * @returns Updated EMA.
 */
export function computeEma(
  current: number,
  previous: number | undefined,
  decay: number = DEFAULT_DECAY,
): number {
  if (previous === undefined) return current;
  return decay * current + (1 - decay) * previous;
}
