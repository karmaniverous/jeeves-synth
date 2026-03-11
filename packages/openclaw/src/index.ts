/**
 * OpenClaw plugin for jeeves-meta.
 *
 * Registers synthesis tools, virtual inference rules, and starts
 * the periodic TOOLS.md writer at gateway startup.
 *
 * @packageDocumentation
 */

import { loadMetaConfig } from './configLoader.js';
import type { PluginApi } from './helpers.js';
import { getConfigPath } from './helpers.js';
import { registerMetaRules } from './rules.js';
import { registerMetaTools } from './tools.js';
import { startToolsWriter } from './toolsWriter.js';

/** Register all jeeves-meta tools and rules with the OpenClaw plugin API. */
export default function register(api: PluginApi): void {
  registerMetaTools(api);

  // Load config for rule registration and tools writer
  const config = loadMetaConfig(getConfigPath(api));

  // Register virtual rules with watcher (fire-and-forget at startup)
  registerMetaRules(config.watcherUrl, config).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[jeeves-meta] Failed to register virtual rules:', message);
  });

  // Start periodic TOOLS.md writer
  startToolsWriter(api, config);
}
