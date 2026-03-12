/**
 * MetaExecutor implementation using the OpenClaw gateway HTTP API.
 *
 * Lives in the library package so both plugin and runner can import it.
 * Spawns sub-agent sessions via the gateway's `/tools/invoke` endpoint,
 * polls for completion, and extracts output text.
 *
 * @module executor/GatewayExecutor
 */

import type {
  MetaExecutor,
  MetaSpawnOptions,
  MetaSpawnResult,
} from '../interfaces/index.js';
import { sleep } from '../sleep.js';

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes

/** Options for the GatewayExecutor. */
export interface GatewayExecutorOptions {
  /** OpenClaw gateway base URL. Default: http://127.0.0.1:18789 */
  gatewayUrl?: string;
  /** Bearer token for gateway authentication. */
  apiKey?: string;
  /** Polling interval in ms. Default: 5000. */
  pollIntervalMs?: number;
}

/** Response shape from /tools/invoke. */
interface InvokeResponse {
  ok?: boolean;
  result?: {
    details?: Record<string, unknown>;
    messages?: Array<{
      role: string;
      content?: string;
      stopReason?: string;
      usage?: { totalTokens?: number };
    }>;
    sessions?: Array<{
      key: string;
      totalTokens?: number;
      model?: string;
      transcriptPath?: string;
    }>;
  };
  error?: { message?: string };
}

/**
 * MetaExecutor that spawns OpenClaw sessions via the gateway's
 * `/tools/invoke` endpoint.
 *
 * Used by both the OpenClaw plugin (in-process tool calls) and the
 * runner/CLI (external invocation). Constructs from `gatewayUrl` and
 * optional `apiKey` — typically sourced from `MetaConfig`.
 */
export class GatewayExecutor implements MetaExecutor {
  private readonly gatewayUrl: string;
  private readonly apiKey: string | undefined;
  private readonly pollIntervalMs: number;

  constructor(options: GatewayExecutorOptions = {}) {
    this.gatewayUrl = (options.gatewayUrl ?? 'http://127.0.0.1:18789').replace(
      /\/+$/,
      '',
    );
    this.apiKey = options.apiKey;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  /** Invoke a gateway tool via the /tools/invoke HTTP endpoint. */
  private async invoke(
    tool: string,
    args: Record<string, unknown>,
  ): Promise<InvokeResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = 'Bearer ' + this.apiKey;
    }

    const res = await fetch(this.gatewayUrl + '/tools/invoke', {
      method: 'POST',
      headers,
      body: JSON.stringify({ tool, args }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Gateway ${tool} failed: HTTP ${res.status.toString()} - ${text}`,
      );
    }

    const data = (await res.json()) as InvokeResponse;
    if (data.ok === false || data.error) {
      throw new Error(
        `Gateway ${tool} error: ${data.error?.message ?? JSON.stringify(data)}`,
      );
    }

    return data;
  }

  /** Look up totalTokens for a session via sessions_list. */
  private async getSessionTokens(
    sessionKey: string,
  ): Promise<number | undefined> {
    try {
      const result = await this.invoke('sessions_list', {
        limit: 20,
        messageLimit: 0,
      });

      const sessions = (result.result?.details?.sessions ??
        result.result?.sessions ??
        []) as Array<{ key: string; totalTokens?: number }>;

      const match = sessions.find((s) => s.key === sessionKey);
      return match?.totalTokens ?? undefined;
    } catch {
      return undefined;
    }
  }

  async spawn(
    task: string,
    options?: MetaSpawnOptions,
  ): Promise<MetaSpawnResult> {
    const timeoutSeconds = options?.timeout ?? DEFAULT_TIMEOUT_MS / 1000;
    const timeoutMs = timeoutSeconds * 1000;
    const deadline = Date.now() + timeoutMs;

    // Step 1: Spawn the sub-agent session
    const spawnResult = await this.invoke('sessions_spawn', {
      task,
      label: options?.label ?? 'jeeves-meta-synthesis',
      runTimeoutSeconds: timeoutSeconds,
      ...(options?.thinking ? { thinking: options.thinking } : {}),
      ...(options?.model ? { model: options.model } : {}),
    });

    const details = (spawnResult.result?.details ?? spawnResult.result) as
      | Record<string, unknown>
      | undefined;
    const sessionKey = details?.childSessionKey ?? details?.sessionKey;

    if (typeof sessionKey !== 'string' || !sessionKey) {
      throw new Error(
        'Gateway sessions_spawn returned no sessionKey: ' +
          JSON.stringify(spawnResult),
      );
    }

    // Step 2: Poll for completion via sessions_history
    await sleep(3000);

    while (Date.now() < deadline) {
      try {
        const historyResult = await this.invoke('sessions_history', {
          sessionKey,
          limit: 5,
          includeTools: false,
        });

        const messages =
          historyResult.result?.details?.messages ??
          historyResult.result?.messages ??
          [];
        const msgArray = messages as Array<{
          role: string;
          content?: string | Array<{ type: string; text?: string }>;
          stopReason?: string;
          usage?: { totalTokens?: number };
        }>;

        if (msgArray.length > 0) {
          const lastMsg = msgArray[msgArray.length - 1];

          // Complete when last message is assistant with a terminal stop reason
          if (
            lastMsg.role === 'assistant' &&
            lastMsg.stopReason &&
            lastMsg.stopReason !== 'toolUse' &&
            lastMsg.stopReason !== 'error'
          ) {
            // Fetch token usage from session metadata
            const tokens = await this.getSessionTokens(sessionKey);

            // Find the last assistant message with content
            for (let i = msgArray.length - 1; i >= 0; i--) {
              const msg = msgArray[i];
              if (msg.role === 'assistant' && msg.content) {
                // Content may be a string or array of content blocks
                const text =
                  typeof msg.content === 'string'
                    ? msg.content
                    : Array.isArray(msg.content)
                      ? msg.content
                          .filter((b) => b.type === 'text' && b.text)
                          .map((b) => b.text!)
                          .join('\n')
                      : '';
                if (text) return { output: text, tokens };
              }
            }
            return { output: '', tokens };
          }
        }
      } catch {
        // Transient poll failure — keep trying
      }

      await sleep(this.pollIntervalMs);
    }

    throw new Error(
      'Synthesis subprocess timed out after ' + timeoutMs.toString() + 'ms',
    );
  }
}
