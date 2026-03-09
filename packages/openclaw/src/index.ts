/**
 * OpenClaw plugin for jeeves-meta.
 *
 * Registers synthesis tools and virtual inference rules at gateway startup.
 *
 * @packageDocumentation
 */

import { loadSynthConfig } from './configLoader.js';
import type { PluginApi } from './helpers.js';
import { getConfigPath } from './helpers.js';
import { registerSynthRules } from './rules.js';
import { registerSynthTools } from './tools.js';

/** Register all jeeves-meta tools and rules with the OpenClaw plugin API. */
export default function register(api: PluginApi): void {
  registerSynthTools(api);

  // Register virtual rules with watcher (fire-and-forget at startup)
  const config = loadSynthConfig(getConfigPath(api));
  registerSynthRules(config.watcherUrl).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[jeeves-meta] Failed to register virtual rules:', message);
  });
}
