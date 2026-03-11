/**
 * Generate the Meta menu content for TOOLS.md injection.
 *
 * Queries the jeeves-meta service for entity stats and produces
 * a Markdown section suitable for agent system prompt injection.
 *
 * @module promptInjection
 */

import type { MetaServiceClient } from './serviceClient.js';

interface StatusResponse {
  uptime: number;
  queue: { length: number; current: unknown };
}

interface MetasResponse {
  summary: {
    total: number;
    stale: number;
    errors: number;
    neverSynthesized: number;
    stalestPath: string | null;
    lastSynthesizedPath: string | null;
    lastSynthesizedAt: string | null;
    tokens: { architect: number; builder: number; critic: number };
  };
  metas: Array<{ stalenessSeconds: number | null }>;
}

/**
 * Generate the Meta menu Markdown for TOOLS.md.
 *
 * @param client - MetaServiceClient instance.
 * @returns Markdown string for the Meta section.
 */
export async function generateMetaMenu(
  client: MetaServiceClient,
): Promise<string> {
  let status: StatusResponse;
  let metas: MetasResponse;

  try {
    status = (await client.status()) as StatusResponse;
    metas = (await client.listMetas()) as MetasResponse;
  } catch {
    return [
      '> **ACTION REQUIRED: jeeves-meta service is unreachable.**',
      '> The service API is down or not configured.',
      '>',
      '> **Troubleshooting:**',
      '> - Check if the JeevesMeta service is running',
      '> - Verify the serviceUrl in plugins.entries.jeeves-meta-openclaw.config',
      '> - Try: `jeeves-meta service start`',
    ].join('\n');
  }

  if (metas.summary.total === 0) {
    return [
      '> **ACTION REQUIRED: No synthesis entities found.**',
      '> The service is running but no `.meta/` directories were discovered.',
      '>',
      "> **Read the `jeeves-meta` skill's Bootstrap section** for guidance",
      '> on creating `.meta/` directories.',
    ].join('\n');
  }

  const { summary } = metas;

  const formatAge = (seconds: number): string => {
    if (!isFinite(seconds)) return 'never synthesized';
    if (seconds < 3600) return Math.round(seconds / 60).toString() + 'm';
    if (seconds < 86400) return Math.round(seconds / 3600).toString() + 'h';
    return Math.round(seconds / 86400).toString() + 'd';
  };

  // Find stalest age
  let stalestAge = 0;
  for (const item of metas.metas) {
    const s = item.stalenessSeconds !== null ? item.stalenessSeconds : Infinity;
    if (s > stalestAge) stalestAge = s;
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

  void status; // used for future queue display

  return [
    'The jeeves-meta synthesis engine manages ' +
      summary.total.toString() +
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
  ].join('\n');
}
