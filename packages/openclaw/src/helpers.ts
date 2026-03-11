/**
 * Shared types and utilities for the OpenClaw plugin.
 *
 * @module helpers
 */

/** Minimal OpenClaw plugin API surface. */
export interface PluginApi {
  config?: {
    plugins?: {
      entries?: Record<string, { config?: Record<string, unknown> }>;
    };
  };
  registerTool(
    tool: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
      execute: (
        id: string,
        params: Record<string, unknown>,
      ) => Promise<ToolResult>;
    },
    options?: { optional?: boolean },
  ): void;
}

/** Tool result shape. */
export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

const PLUGIN_NAME = 'jeeves-meta-openclaw';
const DEFAULT_SERVICE_URL = 'http://127.0.0.1:1938';

/** Get plugin config. */
function getPluginConfig(api: PluginApi): Record<string, unknown> | undefined {
  return api.config?.plugins?.entries?.[PLUGIN_NAME]?.config;
}

/**
 * Resolve the service URL.
 *
 * Resolution order:
 * 1. Plugin config `serviceUrl` setting
 * 2. `JEEVES_META_URL` environment variable
 * 3. Default: http://127.0.0.1:1938
 */
export function getServiceUrl(api: PluginApi): string {
  const fromPlugin = getPluginConfig(api)?.serviceUrl;
  if (typeof fromPlugin === 'string') return fromPlugin;

  const fromEnv = process.env['JEEVES_META_URL'];
  if (fromEnv) return fromEnv;

  return DEFAULT_SERVICE_URL;
}

/** Format a successful tool result. */
export function ok(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/** Format an error tool result. */
export function fail(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text', text: 'Error: ' + message }],
    isError: true,
  };
}
