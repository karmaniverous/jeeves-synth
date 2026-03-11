import { describe, expect, it } from 'vitest';

import { metaErrorSchema } from './error.js';

describe('metaErrorSchema', () => {
  it('accepts valid error for each step', () => {
    for (const step of ['architect', 'builder', 'critic'] as const) {
      const result = metaErrorSchema.safeParse({
        step,
        code: 'TIMEOUT',
        message: `${step} timed out`,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid step value', () => {
    const result = metaErrorSchema.safeParse({
      step: 'parser',
      code: 'ERR',
      message: 'bad',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing code', () => {
    const result = metaErrorSchema.safeParse({
      step: 'builder',
      message: 'bad',
    });
    expect(result.success).toBe(false);
  });
});
