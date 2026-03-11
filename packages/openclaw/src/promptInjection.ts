/**
 * Generate the Meta menu content for TOOLS.md injection.
 *
 * Queries the watcher API for synthesis entity stats and produces
 * a Markdown section suitable for agent system prompt injection.
 *
 * @module promptInjection
 */

import {
  HttpWatcherClient,
  listMetas,
  type MetaConfig,
} from '@karmaniverous/jeeves-meta';

/**
 * Generate the Meta menu Markdown for TOOLS.md.
 *
 * Three output modes:
 * 1. Watcher unreachable - ACTION REQUIRED with diagnostic
 * 2. No entities found - ACTION REQUIRED with setup guidance
 * 3. Healthy - entity stats + tool listing + skill reference
 *
 * @param config - Full meta config (for listMetas and watcherUrl).
 * @returns Markdown string for the Meta section.
 */
export async function generateMetaMenu(config: MetaConfig): Promise<string> {
  let result;

  try {
    const watcher = new HttpWatcherClient({ baseUrl: config.watcherUrl });
    result = await listMetas(config, watcher);
  } catch {
    return [
      '> **ACTION REQUIRED: jeeves-watcher is unreachable.**',
      '> The jeeves-meta synthesis engine requires a running jeeves-watcher service.',
      '> The watcher API at ' +
        config.watcherUrl +
        ' is down or not configured.',
      '>',
      "> **Read the `jeeves-meta` skill's Bootstrap section immediately**",
      '> for setup instructions. Do not attempt synthesis until watcher is available.',
    ].join('\n');
  }

  if (result.entries.length === 0) {
    return [
      '> **ACTION REQUIRED: No synthesis entities found.**',
      '> The watcher is running but no `.meta/` directories were discovered',
      '> in the configured watch paths.',
      '>',
      "> **Read the `jeeves-meta` skill's Bootstrap section** for guidance",
      '> on creating `.meta/` directories and configuring watch paths.',
    ].join('\n');
  }

  const { summary, entries } = result;

  const formatAge = (seconds: number): string => {
    if (!isFinite(seconds)) return 'never synthesized';
    if (seconds < 3600) return Math.round(seconds / 60).toString() + 'm';
    if (seconds < 86400) return Math.round(seconds / 3600).toString() + 'h';
    return Math.round(seconds / 86400).toString() + 'd';
  };

  // Find stalest age for display
  let stalestAge = 0;
  for (const e of entries) {
    if (e.stalenessSeconds > stalestAge) stalestAge = e.stalenessSeconds;
  }

  const stalestDisplay = summary.stalestPath
    ? summary.stalestPath + ' (' + formatAge(stalestAge) + ')'
    : 'n/a';
  const lastSynthDisplay = summary.lastSynthesizedAt
    ? (summary.lastSynthesizedPath ?? '') +
      ' (' +
      summary.lastSynthesizedAt +
      ')'
    : 'n/a';

  const lines: string[] = [
    'The jeeves-meta synthesis engine manages ' +
      entries.length.toString() +
      ' meta entities.',
    '',
    '### Entity Summary',
    '| Metric | Value |',
    '|--------|-------|',
    '| Total | ' + summary.total.toString() + ' |',
    '| Stale | ' + summary.stale.toString() + ' |',
    '| Errors | ' + summary.errors.toString() + ' |',
    '| Never synthesized | ' + summary.neverSynthesized.toString() + ' |',
    '| Stalest | ' + stalestDisplay + ' |',
    '| Last synthesized | ' + lastSynthDisplay + ' |',
    '',
    '### Token Usage (cumulative)',
    '| Step | Tokens |',
    '|------|--------|',
    '| Architect | ' + summary.tokens.architect.toLocaleString() + ' |',
    '| Builder | ' + summary.tokens.builder.toLocaleString() + ' |',
    '| Critic | ' + summary.tokens.critic.toLocaleString() + ' |',
    '',
    '### Tools',
    '| Tool | Description |',
    '|------|-------------|',
    '| `meta_list` | List metas with summary stats and per-meta projection |',
    '| `meta_detail` | Full detail for a single meta with optional archive history |',
    '| `meta_trigger` | Manually trigger synthesis for a specific meta or next-stalest |',
    '| `meta_preview` | Dry-run: show what inputs would be gathered without running LLM |',
    '',
    'Read the `jeeves-meta` skill for usage guidance, configuration, and troubleshooting.',
  ];

  return lines.join('\n');
}
