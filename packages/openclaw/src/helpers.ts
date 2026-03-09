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

/** Resolve watcher URL from plugin config. */
export function getWatcherUrl(api: PluginApi): string {
  const url = getPluginConfig(api)?.watcherUrl;
  return typeof url === 'string' ? url : 'http://127.0.0.1:1936';
}

/** Resolve watch paths from plugin config. */
export function getWatchPaths(api: PluginApi): string[] {
  const paths = getPluginConfig(api)?.watchPaths;
  return Array.isArray(paths) ? (paths as string[]) : ['j:/domains'];
}

/**
 * Get the config file path from plugin settings.
 * Default: J:/config/jeeves-meta.config.json
 */
export function getConfigPath(api: PluginApi): string {
  const p = getPluginConfig(api)?.configPath;
  return typeof p === 'string' ? p : 'J:/config/jeeves-meta.config.json';
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
