import { describe, expect, it } from 'vitest';

import { metaJsonSchema } from './meta.js';

describe('metaJsonSchema', () => {
  it('accepts minimal meta with only _id', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('accepts full meta with all reserved fields', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _steer: 'Focus on API changes',
      _architect: 'You are the architect...',
      _builder: 'Analyze the following...',
      _critic: 'You are the critic...',
      _generatedAt: '2026-03-08T07:00:00Z',
      _content: '# Synthesis\n\nContent here.',
      _structureHash: 'abc123',
      _synthesisCount: 5,
      _feedback: 'Good coverage but missing edge cases.',
      _depth: 2,
    });
    expect(result.success).toBe(true);
  });

  it('accepts custom (non-underscore) fields via passthrough', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'My synthesis',
      tags: ['email', 'summary'],
      stats: { fileCount: 42 },
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('title', 'My synthesis');
  });

  it('accepts meta with _error field', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _error: {
        step: 'builder',
        code: 'TIMEOUT',
        message: 'Builder timed out after 600s',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts archive snapshot fields', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _archived: true,
      _archivedAt: '2026-03-08T07:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid _id (not UUID)', () => {
    const result = metaJsonSchema.safeParse({ _id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid _error step', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _error: { step: 'invalid', code: 'ERR', message: 'bad' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative _synthesisCount', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _synthesisCount: -1,
    });
    expect(result.success).toBe(false);
  });
});
