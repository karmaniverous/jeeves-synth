import { describe, expect, it } from 'vitest';

import { synthConfigSchema } from './config.js';

const validConfig = {
  watchPaths: ['j:/domains'],
  watcherUrl: 'http://localhost:3456',
  defaultArchitect: 'You are the architect...',
  defaultCritic: 'You are the critic...',
};

describe('synthConfigSchema', () => {
  it('accepts valid config with defaults applied', () => {
    const result = synthConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      architectEvery: 10,
      depthWeight: 1,
      maxArchive: 20,
      maxLines: 500,
      architectTimeout: 120,
      builderTimeout: 600,
      criticTimeout: 300,
    });
  });

  it('accepts config with all fields explicit', () => {
    const result = synthConfigSchema.safeParse({
      ...validConfig,
      architectEvery: 5,
      depthWeight: 0.5,
      maxArchive: 50,
      maxLines: 1000,
      architectTimeout: 60,
      builderTimeout: 300,
      criticTimeout: 120,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty watchPaths', () => {
    const result = synthConfigSchema.safeParse({
      ...validConfig,
      watchPaths: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid watcherUrl', () => {
    const result = synthConfigSchema.safeParse({
      ...validConfig,
      watcherUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing defaultArchitect', () => {
    const partial = {
      watchPaths: validConfig.watchPaths,
      watcherUrl: validConfig.watcherUrl,
      defaultCritic: validConfig.defaultCritic,
    };
    const result = synthConfigSchema.safeParse(partial);
    expect(result.success).toBe(false);
  });

  it('rejects architectTimeout below minimum (30)', () => {
    const result = synthConfigSchema.safeParse({
      ...validConfig,
      architectTimeout: 10,
    });
    expect(result.success).toBe(false);
  });

  it('rejects builderTimeout below minimum (60)', () => {
    const result = synthConfigSchema.safeParse({
      ...validConfig,
      builderTimeout: 30,
    });
    expect(result.success).toBe(false);
  });
});
