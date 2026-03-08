/**
 * OpenClaw plugin for jeeves-synth.
 *
 * Registers synthesis tools (synth_status, synth_entities, synth_preview)
 * for interactive use within the OpenClaw agent.
 *
 * @packageDocumentation
 */

import type { PluginApi } from './helpers.js';
import { registerSynthTools } from './tools.js';

/** Register all jeeves-synth tools with the OpenClaw plugin API. */
export default function register(api: PluginApi): void {
  registerSynthTools(api);
}
