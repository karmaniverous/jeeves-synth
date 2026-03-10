/**
 * Periodic TOOLS.md disk writer for the Meta section.
 *
 * Upserts a `## Meta` section under the shared `# Jeeves Platform Tools`
 * header. The gateway reads TOOLS.md fresh from disk on each new session.
 *
 * @module toolsWriter
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildMetaFilter, type SynthConfig } from '@karmaniverous/jeeves-meta';

import type { PluginApi } from './helpers.js';
import { generateMetaMenu } from './promptInjection.js';

const REFRESH_INTERVAL_MS = 60_000;
const INITIAL_DELAY_MS = 5_000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let lastWrittenMenu = '';

/**
 * Resolve the workspace TOOLS.md path.
 * Uses api.resolvePath if available, otherwise falls back to CWD.
 */
function resolveToolsPath(api: PluginApi): string {
  const resolvePath = (api as unknown as Record<string, unknown>)
    .resolvePath as ((input: string) => string) | undefined;
  if (typeof resolvePath === 'function') {
    return resolvePath('TOOLS.md');
  }
  return resolve(process.cwd(), 'TOOLS.md');
}

/**
 * Upsert the Meta section in TOOLS.md content.
 *
 * Ordering convention: Watcher, Server, Meta.
 * - If `## Meta` exists, replace in place.
 * - Otherwise insert after `## Server` if present, after `## Watcher` if
 *   Server is absent, or after the H1.
 */
export function upsertMetaSection(existing: string, metaMenu: string): string {
  const section = '## Meta\n\n' + metaMenu;

  // Replace existing Meta section (match from ## Meta to next ## or # or EOF)
  const re = /^## Meta\n[\s\S]*?(?=\n## |\n# |$(?![\s\S]))/m;
  if (re.test(existing)) {
    return existing.replace(re, section);
  }

  // No existing section. Insert in correct order.
  const platformH1 = '# Jeeves Platform Tools';

  // After ## Server if present
  const serverRe = /^## Server\n[\s\S]*?(?=\n## |\n# |$(?![\s\S]))/m;
  const serverMatch = serverRe.exec(existing);
  if (serverMatch) {
    const insertAt = serverMatch.index + serverMatch[0].length;
    return (
      existing.slice(0, insertAt) + '\n\n' + section + existing.slice(insertAt)
    );
  }

  // After ## Watcher if present
  const watcherRe = /^## Watcher\n[\s\S]*?(?=\n## |\n# |$(?![\s\S]))/m;
  const watcherMatch = watcherRe.exec(existing);
  if (watcherMatch) {
    const insertAt = watcherMatch.index + watcherMatch[0].length;
    return (
      existing.slice(0, insertAt) + '\n\n' + section + existing.slice(insertAt)
    );
  }

  // After H1 if present
  if (existing.includes(platformH1)) {
    const idx = existing.indexOf(platformH1) + platformH1.length;
    return (
      existing.slice(0, idx) + '\n\n' + section + '\n' + existing.slice(idx)
    );
  }

  // Prepend platform header + meta section
  const trimmed = existing.trim();
  if (trimmed.length === 0) {
    return platformH1 + '\n\n' + section + '\n';
  }
  return platformH1 + '\n\n' + section + '\n\n' + trimmed + '\n';
}

/**
 * Fetch the current meta menu and write it to TOOLS.md if changed.
 *
 * @param api - Plugin API.
 * @param watcherUrl - Watcher API base URL.
 * @returns True if the file was updated.
 */
async function refreshToolsMd(
  api: PluginApi,
  config: SynthConfig,
): Promise<boolean> {
  const menu = await generateMetaMenu(
    config.watcherUrl,
    buildMetaFilter(config),
  );

  if (menu === lastWrittenMenu) {
    return false;
  }

  const toolsPath = resolveToolsPath(api);

  let current = '';
  try {
    current = await readFile(toolsPath, 'utf8');
  } catch {
    // File doesn't exist yet
  }

  const updated = upsertMetaSection(current, menu);

  if (updated !== current) {
    await writeFile(toolsPath, updated, 'utf8');
    lastWrittenMenu = menu;
    return true;
  }

  lastWrittenMenu = menu;
  return false;
}

/**
 * Start the periodic TOOLS.md writer.
 * Defers first write by 5s, then refreshes every 60s.
 *
 * @param api - Plugin API.
 * @param watcherUrl - Watcher API base URL.
 */
export function startToolsWriter(api: PluginApi, config: SynthConfig): void {
  // Deferred initial write
  setTimeout(() => {
    refreshToolsMd(api, config).catch((err: unknown) => {
      console.error('[jeeves-meta] Failed to write TOOLS.md:', err);
    });
  }, INITIAL_DELAY_MS);

  // Periodic refresh
  if (intervalHandle) {
    clearInterval(intervalHandle);
  }
  intervalHandle = setInterval(() => {
    refreshToolsMd(api, config).catch((err: unknown) => {
      console.error('[jeeves-meta] Failed to refresh TOOLS.md:', err);
    });
  }, REFRESH_INTERVAL_MS);

  if (typeof intervalHandle === 'object' && 'unref' in intervalHandle) {
    intervalHandle.unref();
  }
}
