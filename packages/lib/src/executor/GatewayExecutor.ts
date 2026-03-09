/**
 * SynthExecutor implementation using the OpenClaw gateway HTTP API.
 *
 * Lives in the library package so both plugin and runner can import it.
 * Spawns sub-agent sessions via the gateway, polls for completion,
 * and extracts output text.
 *
 * @module executor/GatewayExecutor
 */

import type {
  SynthExecutor,
  SynthSpawnOptions,
  SynthSpawnResult,
} from '../interfaces/index.js';

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes

/** Options for the GatewayExecutor. */
export interface GatewayExecutorOptions {
  /** OpenClaw gateway base URL. Default: http://127.0.0.1:3000 */
  gatewayUrl?: string;
  /** API key for gateway authentication. */
  apiKey?: string;
  /** Polling interval in ms. Default: 5000. */
  pollIntervalMs?: number;
}

/** Sleep helper. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * SynthExecutor that spawns OpenClaw sessions via the gateway HTTP API.
 *
 * Used by both the OpenClaw plugin (in-process tool calls) and the
 * runner/CLI (external invocation). Constructs from `gatewayUrl` and
 * optional `apiKey` — typically sourced from `SynthConfig`.
 */
export class GatewayExecutor implements SynthExecutor {
  private readonly gatewayUrl: string;
  private readonly apiKey: string | undefined;
  private readonly pollIntervalMs: number;

  constructor(options: GatewayExecutorOptions = {}) {
    this.gatewayUrl = (options.gatewayUrl ?? 'http://127.0.0.1:3000').replace(
      /\/+$/,
      '',
    );
    this.apiKey = options.apiKey;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  async spawn(
    task: string,
    options?: SynthSpawnOptions,
  ): Promise<SynthSpawnResult> {
    const timeoutMs = (options?.timeout ?? DEFAULT_TIMEOUT_MS / 1000) * 1000;
    const deadline = Date.now() + timeoutMs;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = 'Bearer ' + this.apiKey;
    }

    const spawnRes = await fetch(this.gatewayUrl + '/api/sessions/spawn', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        task,
        mode: 'run',
        model: options?.model,
        runTimeoutSeconds: options?.timeout,
      }),
    });

    if (!spawnRes.ok) {
      const text = await spawnRes.text();
      throw new Error(
        'Gateway spawn failed: HTTP ' +
          spawnRes.status.toString() +
          ' - ' +
          text,
      );
    }

    const spawnData = (await spawnRes.json()) as {
      sessionKey?: string;
      error?: string;
    };
    if (!spawnData.sessionKey) {
      throw new Error(
        'Gateway spawn returned no sessionKey: ' + JSON.stringify(spawnData),
      );
    }

    const { sessionKey } = spawnData;

    // Poll for completion
    while (Date.now() < deadline) {
      await sleep(this.pollIntervalMs);

      const historyRes = await fetch(
        this.gatewayUrl +
          '/api/sessions/' +
          encodeURIComponent(sessionKey) +
          '/history?limit=50',
        { headers },
      );

      if (!historyRes.ok) continue;

      const history = (await historyRes.json()) as {
        messages?: Array<{
          role: string;
          content: string;
          usage?: { totalTokens?: number };
        }>;
        status?: string;
        usage?: { totalTokens?: number };
      };

      if (history.status === 'completed' || history.status === 'done') {
        // Extract token usage from session-level or message-level usage
        let tokens: number | undefined;
        if (history.usage?.totalTokens) {
          tokens = history.usage.totalTokens;
        } else {
          // Sum message-level usage as fallback
          let sum = 0;
          for (const msg of history.messages ?? []) {
            if (msg.usage?.totalTokens) sum += msg.usage.totalTokens;
          }
          if (sum > 0) tokens = sum;
        }

        // Extract the last assistant message as output
        const messages = history.messages ?? [];
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant' && messages[i].content) {
            return { output: messages[i].content, tokens };
          }
        }
        return { output: '', tokens };
      }
    }

    throw new Error(
      'Synthesis subprocess timed out after ' + timeoutMs.toString() + 'ms',
    );
  }
}
