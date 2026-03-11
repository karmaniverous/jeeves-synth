/**
 * Progress reporting via OpenClaw gateway `/tools/invoke` → `message` tool.
 *
 * @module progress
 */

import type { Logger } from 'pino';

export type ProgressPhase = 'architect' | 'builder' | 'critic';

export type ProgressEvent = {
  type:
    | 'synthesis_start'
    | 'phase_start'
    | 'phase_complete'
    | 'synthesis_complete'
    | 'error';
  metaPath: string;
  phase?: ProgressPhase;
  tokens?: number;
  durationMs?: number;
  error?: string;
};

export type ProgressReporterConfig = {
  gatewayUrl: string;
  gatewayApiKey?: string;
  /** Gateway channel target (platform-agnostic). If unset, reporting is disabled. */
  reportChannel?: string;
};

function formatSeconds(durationMs: number): string {
  const seconds = durationMs / 1000;
  return seconds.toFixed(1) + 's';
}

function titleCasePhase(phase: ProgressPhase): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

export function formatProgressEvent(event: ProgressEvent): string {
  switch (event.type) {
    case 'synthesis_start':
      return `🔬 Started meta synthesis: ${event.metaPath}`;

    case 'phase_start': {
      if (!event.phase) {
        return `  ⚙️ Phase started: ${event.metaPath}`;
      }
      return `  ⚙️ ${titleCasePhase(event.phase)} phase started`;
    }

    case 'phase_complete': {
      const phase = event.phase ? titleCasePhase(event.phase) : 'Phase';
      const tokens = event.tokens ?? 0;
      const duration =
        event.durationMs !== undefined
          ? formatSeconds(event.durationMs)
          : '0.0s';
      return `  ✅ ${phase} phase complete (${String(tokens)} tokens / ${duration})`;
    }

    case 'synthesis_complete': {
      const tokens = event.tokens ?? 0;
      const duration =
        event.durationMs !== undefined
          ? formatSeconds(event.durationMs)
          : '0.0s';
      return `✅ Completed: ${event.metaPath} (${String(tokens)} tokens / ${duration})`;
    }

    case 'error': {
      const phase = event.phase ? `${titleCasePhase(event.phase)} ` : '';
      const error = event.error ?? 'Unknown error';
      return `❌ Synthesis failed at ${phase}phase: ${event.metaPath}\n   Error: ${error}`;
    }

    default: {
      return 'Unknown progress event';
    }
  }
}

type GatewayInvokeRequest = {
  tool: 'message';
  args: {
    action: 'send';
    target: string;
    message: string;
  };
};

export class ProgressReporter {
  private readonly config: ProgressReporterConfig;
  private readonly logger: Logger;

  public constructor(config: ProgressReporterConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  public async report(event: ProgressEvent): Promise<void> {
    const target = this.config.reportChannel;
    if (!target) return;

    const message = formatProgressEvent(event);
    const url = new URL('/tools/invoke', this.config.gatewayUrl);

    const payload: GatewayInvokeRequest = {
      tool: 'message',
      args: {
        action: 'send',
        target,
        message,
      },
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.gatewayApiKey
            ? { authorization: `Bearer ${this.config.gatewayApiKey}` }
            : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(
          { status: res.status, statusText: res.statusText, body: text },
          'Progress reporting failed',
        );
      }
    } catch (err) {
      this.logger.warn({ err }, 'Progress reporting threw');
    }
  }
}
