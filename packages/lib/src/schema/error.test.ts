import { describe, expect, it } from 'vitest';

import { synthErrorSchema } from './error.js';

describe('synthErrorSchema', () => {
  it('accepts valid error for each step', () => {
    for (const step of ['architect', 'builder', 'critic'] as const) {
      const result = synthErrorSchema.safeParse({
        step,
        code: 'TIMEOUT',
        message: `${step} timed out`,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid step value', () => {
    const result = synthErrorSchema.safeParse({
      step: 'parser',
      code: 'ERR',
      message: 'bad',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing code', () => {
    const result = synthErrorSchema.safeParse({
      step: 'builder',
      message: 'bad',
    });
    expect(result.success).toBe(false);
  });
});
