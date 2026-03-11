/**
 * OpenClaw plugin for jeeves-meta.
 *
 * Thin HTTP client — all operations delegate to the jeeves-meta service.
 * The plugin registers tools and starts the periodic TOOLS.md writer.
 *
 * @packageDocumentation
 */

import { getServiceUrl, type PluginApi } from './helpers.js';
import { MetaServiceClient } from './serviceClient.js';
import { registerMetaTools } from './tools.js';
import { startToolsWriter } from './toolsWriter.js';

/** Register all jeeves-meta tools with the OpenClaw plugin API. */
export default function register(api: PluginApi): void {
  const serviceUrl = getServiceUrl(api);
  const client = new MetaServiceClient({ serviceUrl });

  registerMetaTools(api, client);

  // Start periodic TOOLS.md writer (fire-and-forget)
  startToolsWriter(api, client);
}
