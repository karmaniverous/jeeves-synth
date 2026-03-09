/**
 * HTTP implementation of the WatcherClient interface.
 *
 * Talks to jeeves-watcher's POST /scan and POST /rules endpoints
 * with retry and exponential backoff.
 *
 * @module watcher-client/HttpWatcherClient
 */

import type {
  InferenceRuleSpec,
  ScanParams,
  ScanResponse,
  WatcherClient,
} from '../interfaces/index.js';

/** Default retry configuration. */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_BASE_MS = 1000;
const DEFAULT_BACKOFF_FACTOR = 4;

/** Options for creating an HttpWatcherClient. */
export interface HttpWatcherClientOptions {
  /** Base URL for the watcher service (e.g. "http://localhost:1936"). */
  baseUrl: string;
  /** Maximum retry attempts for transient failures. Default: 3. */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Default: 1000. */
  backoffBaseMs?: number;
  /** Multiplier for backoff. Default: 4 (1s, 4s, 16s). */
  backoffFactor?: number;
}

/** Sleep for a given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Check if an error is transient (worth retrying). */
function isTransient(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

/**
 * HTTP-based WatcherClient implementation with retry.
 */
export class HttpWatcherClient implements WatcherClient {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly backoffFactor: number;

  constructor(options: HttpWatcherClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.backoffFactor = options.backoffFactor ?? DEFAULT_BACKOFF_FACTOR;
  }

  /** POST JSON with retry. */
  private async post(endpoint: string, body: unknown): Promise<unknown> {
    const url = this.baseUrl + endpoint;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        return res.json();
      }

      if (!isTransient(res.status) || attempt === this.maxRetries) {
        const text = await res.text();
        throw new Error(
          `Watcher ${endpoint} failed: HTTP ${res.status.toString()} - ${text}`,
        );
      }

      // Exponential backoff
      const delayMs =
        this.backoffBaseMs * Math.pow(this.backoffFactor, attempt);
      await sleep(delayMs);
    }

    // Unreachable, but TypeScript needs it
    throw new Error('Retry exhausted');
  }

  async scan(params: ScanParams): Promise<ScanResponse> {
    const body: Record<string, unknown> = {};
    if (params.pathPrefix !== undefined) {
      body.pathPrefix = params.pathPrefix;
    }
    if (params.filter !== undefined) {
      body.filter = params.filter;
    }
    if (params.modifiedAfter !== undefined) {
      body.modifiedAfter = params.modifiedAfter;
    }
    if (params.fields !== undefined) {
      body.fields = params.fields;
    }
    if (params.limit !== undefined) {
      body.limit = params.limit;
    }
    if (params.cursor !== undefined) {
      body.cursor = params.cursor;
    }

    const result = await this.post('/scan', body);
    return result as ScanResponse;
  }

  async registerRules(
    source: string,
    rules: InferenceRuleSpec[],
  ): Promise<void> {
    await this.post('/rules/register', { source, rules });
  }

  async unregisterRules(source: string): Promise<void> {
    await this.post('/rules/unregister', { source });
  }
}
