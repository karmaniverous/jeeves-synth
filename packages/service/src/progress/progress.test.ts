import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import {
  formatProgressEvent,
  type ProgressEvent,
  ProgressReporter,
} from './index.js';

function createLogger() {
  return {
    warn: vi.fn(),
  } as unknown as Logger;
}

describe('formatProgressEvent', () => {
  it('formats synthesis_start', () => {
    const e: ProgressEvent = { type: 'synthesis_start', metaPath: 'x' };
    expect(formatProgressEvent(e)).toBe('🔬 Started meta synthesis: x');
  });

  it('formats phase_start', () => {
    const e: ProgressEvent = {
      type: 'phase_start',
      metaPath: 'x',
      phase: 'architect',
    };
    expect(formatProgressEvent(e)).toBe('  ⚙️ Architect phase started');
  });

  it('formats phase_complete', () => {
    const e: ProgressEvent = {
      type: 'phase_complete',
      metaPath: 'x',
      phase: 'builder',
      tokens: 123,
      durationMs: 1500,
    };
    expect(formatProgressEvent(e)).toBe(
      '  ✅ Builder phase complete (123 tokens / 1.5s)',
    );
  });

  it('formats synthesis_complete', () => {
    const e: ProgressEvent = {
      type: 'synthesis_complete',
      metaPath: 'x',
      tokens: 10,
      durationMs: 2500,
    };
    expect(formatProgressEvent(e)).toBe('✅ Completed: x (10 tokens / 2.5s)');
  });

  it('formats error', () => {
    const e: ProgressEvent = {
      type: 'error',
      metaPath: 'x',
      phase: 'critic',
      error: 'boom',
    };
    expect(formatProgressEvent(e)).toBe(
      '❌ Synthesis failed at Critic phase: x\n   Error: boom',
    );
  });
});

describe('ProgressReporter', () => {
  it('is a no-op when reportChannel is not set', async () => {
    const logger = createLogger();
    const reporter = new ProgressReporter(
      { gatewayUrl: 'http://127.0.0.1:18789' },
      logger,
    );

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response('', { status: 200 })),
      );

    await reporter.report({ type: 'synthesis_start', metaPath: 'x' });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('posts to gateway /tools/invoke with message tool', async () => {
    const logger = createLogger();
    const reporter = new ProgressReporter(
      {
        gatewayUrl: 'http://127.0.0.1:18789',
        gatewayApiKey: 'k',
        reportChannel: 'C123',
      },
      logger,
    );

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((_input, init) => {
        const rawBody = init?.body;
        if (typeof rawBody !== 'string') {
          throw new Error('Expected request body to be a string');
        }
        const body = JSON.parse(rawBody) as {
          tool: string;
          args: { action: string; target: string; message: string };
        };

        expect(body.tool).toBe('message');
        expect(body.args.action).toBe('send');
        expect(body.args.target).toBe('C123');
        expect(body.args.message).toContain('Started meta synthesis');

        return Promise.resolve(new Response('', { status: 200 }));
      });

    await reporter.report({ type: 'synthesis_start', metaPath: 'x' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('logs warning on gateway error and does not throw', async () => {
    const logger = createLogger();
    const reporter = new ProgressReporter(
      { gatewayUrl: 'http://127.0.0.1:18789', reportChannel: 'C123' },
      logger,
    );

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response('nope', { status: 500 })),
      );

    await expect(
      reporter.report({ type: 'synthesis_start', metaPath: 'x' }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
