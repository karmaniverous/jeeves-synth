import { describe, expect, it } from 'vitest';

import { computeEma } from './ema.js';

describe('computeEma', () => {
  it('returns current value when no previous exists', () => {
    expect(computeEma(100, undefined)).toBe(100);
  });

  it('applies decay weighting between current and previous', () => {
    // default decay = 0.3: 0.3 * 200 + 0.7 * 100 = 130
    expect(computeEma(200, 100)).toBe(130);
  });

  it('converges toward repeated values', () => {
    let avg: number | undefined;
    for (let i = 0; i < 20; i++) {
      avg = computeEma(500, avg);
    }
    // After 20 iterations of 500, should be very close to 500
    expect(avg).toBeGreaterThan(499);
    expect(avg).toBeLessThanOrEqual(500);
  });

  it('respects custom decay factor', () => {
    // decay=1.0 means only current value matters
    expect(computeEma(200, 100, 1.0)).toBe(200);
    // decay=0.0 means only previous value matters
    expect(computeEma(200, 100, 0.0)).toBe(100);
  });
});
