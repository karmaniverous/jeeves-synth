import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpWatcherClient } from './HttpWatcherClient.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

const client = new HttpWatcherClient({
  baseUrl: 'http://localhost:1936',
  maxRetries: 2,
  backoffBaseMs: 10, // Fast for tests
  backoffFactor: 2,
});

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HttpWatcherClient.scan', () => {
  it('sends POST /scan with pathPrefix and returns files', async () => {
    const responseData = {
      files: [
        { file_path: '/test/a.md', modified_at: 1000, content_hash: 'abc' },
      ],
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(responseData));

    const result = await client.scan({ pathPrefix: '/test' });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:1936/scan');
    expect(JSON.parse(init.body as string)).toEqual({
      filter: {
        must: [{ key: 'file_path', match: { text: '/test' } }],
      },
    });
    expect(result.files).toHaveLength(1);
    expect(result.files[0].file_path).toBe('/test/a.md');
  });

  it('includes optional parameters when provided', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ files: [] }));

    await client.scan({
      pathPrefix: '/test',
      modifiedAfter: 500,
      fields: ['file_path'],
      limit: 10,
      cursor: 'abc',
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(body).toEqual({
      filter: {
        must: [
          { key: 'file_path', match: { text: '/test' } },
          { key: 'modified_at', range: { gt: 500 } },
        ],
      },
      fields: ['file_path'],
      limit: 10,
      cursor: 'abc',
    });
  });

  it('retries on 500 with exponential backoff', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ error: 'Internal' }, 500))
      .mockResolvedValueOnce(jsonResponse({ files: [] }));

    const result = await client.scan({ pathPrefix: '/test' });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.files).toHaveLength(0);
  });

  it('throws after exhausting retries', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'Internal' }, 500));

    await expect(client.scan({ pathPrefix: '/test' })).rejects.toThrow(
      'HTTP 500',
    );

    // Initial + 2 retries = 3
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws immediately on 400 (non-transient)', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: 'Bad Request' }, 400),
    );

    await expect(client.scan({ pathPrefix: '/test' })).rejects.toThrow(
      'HTTP 400',
    );
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('retries on 429 (rate limited)', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse({ files: [] }));

    const result = await client.scan({ pathPrefix: '/test' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.files).toHaveLength(0);
  });
});

describe('HttpWatcherClient.registerRules', () => {
  it('sends POST /rules/register', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await client.registerRules('jeeves-meta', [
      {
        name: 'test-rule',
        description: 'A test rule',
        match: { type: { value: 'test' } },
        schema: [],
      },
    ]);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:1936/rules/register');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.source).toBe('jeeves-meta');
  });
});

describe('HttpWatcherClient.unregisterRules', () => {
  it('sends POST /rules/unregister', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await client.unregisterRules('jeeves-meta');

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:1936/rules/unregister');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.source).toBe('jeeves-meta');
  });
});
