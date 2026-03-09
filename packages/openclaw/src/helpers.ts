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

/** Get plugin config. */
function getPluginConfig(api: PluginApi): Record<string, unknown> | undefined {
  return api.config?.plugins?.entries?.[PLUGIN_NAME]?.config;
}

/**
 * Resolve the config file path.
 *
 * Resolution order:
 * 1. Plugin config `configPath` setting
 * 2. `JEEVES_META_CONFIG` environment variable
 * 3. Error — no default path
 */
export function getConfigPath(api: PluginApi): string {
  const fromPlugin = getPluginConfig(api)?.configPath;
  if (typeof fromPlugin === 'string') return fromPlugin;

  const fromEnv = process.env['JEEVES_META_CONFIG'];
  if (fromEnv) return fromEnv;

  throw new Error(
    'jeeves-meta config path not found. Set configPath in plugin config or JEEVES_META_CONFIG env var.',
  );
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
