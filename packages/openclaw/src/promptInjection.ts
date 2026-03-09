/**
 * Generate the Meta menu content for TOOLS.md injection.
 *
 * Queries the watcher API for synthesis entity stats and produces
 * a Markdown section suitable for agent system prompt injection.
 *
 * @module promptInjection
 */

/** Watcher scan response shape. */
interface ScanResponse {
  files: Array<{
    file_path: string;
    modified_at: number;
    [key: string]: unknown;
  }>;
  next?: string;
}

/**
 * Fetch JSON from a URL with timeout.
 *
 * @param url - URL to fetch.
 * @param options - Fetch options.
 * @returns Parsed JSON response.
 */
async function fetchJson(url: string, options?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error('HTTP ' + res.status.toString() + ' from ' + url);
  }
  return res.json();
}

/**
 * Generate the Meta menu Markdown for TOOLS.md.
 *
 * Three output modes:
 * 1. Watcher unreachable - ACTION REQUIRED with diagnostic
 * 2. No entities found - ACTION REQUIRED with setup guidance
 * 3. Healthy - entity stats + tool listing + skill reference
 *
 * @param watcherUrl - Watcher API base URL.
 * @returns Markdown string for the Meta section.
 */
export async function generateMetaMenu(watcherUrl: string): Promise<string> {
  let entities: ScanResponse['files'] = [];

  try {
    const scanResult = (await fetchJson(watcherUrl + '/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [
            {
              key: 'domains',
              match: { value: 'synth-meta' },
            },
          ],
        },
        fields: [
          'synth_depth',
          'synth_emphasis',
          'synth_synthesis_count',
          'synth_architect_tokens',
          'synth_builder_tokens',
          'synth_critic_tokens',
          'synth_error_step',
          'generated_at_unix',
          'has_error',
        ],
        limit: 1000,
      }),
    })) as ScanResponse;
    entities = scanResult.files;
  } catch {
    return [
      '> **ACTION REQUIRED: jeeves-watcher is unreachable.**',
      '> The jeeves-meta synthesis engine requires a running jeeves-watcher service.',
      `> The watcher API at ${watcherUrl} is down or not configured.`,
      '>',
      "> **Read the `jeeves-meta` skill's Bootstrap section immediately**",
      '> for setup instructions. Do not attempt synthesis until watcher is available.',
    ].join('\n');
  }

  if (entities.length === 0) {
    return [
      '> **ACTION REQUIRED: No synthesis entities found.**',
      '> The watcher is running but no `.meta/` directories were discovered',
      '> in the configured watch paths.',
      '>',
      "> **Read the `jeeves-meta` skill's Bootstrap section** for guidance",
      '> on creating `.meta/` directories and configuring watch paths.',
    ].join('\n');
  }

  // Compute stats
  const now = Math.floor(Date.now() / 1000);
  let staleCount = 0;
  let errorCount = 0;
  let neverSynthesized = 0;
  let totalArchTokens = 0;
  let totalBuilderTokens = 0;
  let totalCriticTokens = 0;
  let stalestPath = '';
  let stalestAge = 0;
  let lastSynthPath = '';
  let lastSynthUnix = 0;

  for (const e of entities) {
    const generatedAt = e['generated_at_unix'] as number | undefined;
    const hasError = e['has_error'] as boolean | undefined;
    const archTokens = e['synth_architect_tokens'] as number | undefined;
    const builderTokens = e['synth_builder_tokens'] as number | undefined;
    const criticTokens = e['synth_critic_tokens'] as number | undefined;

    if (!generatedAt) {
      neverSynthesized++;
      staleCount++;
      if (!isFinite(stalestAge)) {
        // Already have an infinitely stale entity
      } else {
        stalestAge = Infinity;
        stalestPath = e.file_path;
      }
    } else {
      const age = now - generatedAt;
      if (age > 0) staleCount++;
      if (age > stalestAge && isFinite(age)) {
        stalestAge = age;
        stalestPath = e.file_path;
      }
      if (generatedAt > lastSynthUnix) {
        lastSynthUnix = generatedAt;
        lastSynthPath = e.file_path;
      }
    }

    if (hasError) errorCount++;
    if (archTokens) totalArchTokens += archTokens;
    if (builderTokens) totalBuilderTokens += builderTokens;
    if (criticTokens) totalCriticTokens += criticTokens;
  }

  const formatAge = (seconds: number): string => {
    if (!isFinite(seconds)) return 'never synthesized';
    if (seconds < 3600) return Math.round(seconds / 60).toString() + 'm';
    if (seconds < 86400) return Math.round(seconds / 3600).toString() + 'h';
    return Math.round(seconds / 86400).toString() + 'd';
  };

  const lines: string[] = [
    `The jeeves-meta synthesis engine manages ${entities.length.toString()} meta entities.`,
    '',
    '### Entity Summary',
    '| Metric | Value |',
    '|--------|-------|',
    `| Total | ${entities.length.toString()} |`,
    `| Stale | ${staleCount.toString()} |`,
    `| Errors | ${errorCount.toString()} |`,
    `| Never synthesized | ${neverSynthesized.toString()} |`,
    `| Stalest | ${stalestPath ? stalestPath + ' (' + formatAge(stalestAge) + ')' : 'n/a'} |`,
    `| Last synthesized | ${lastSynthPath ? lastSynthPath + ' (' + new Date(lastSynthUnix * 1000).toISOString() + ')' : 'n/a'} |`,
    '',
    '### Token Usage (cumulative)',
    '| Step | Tokens |',
    '|------|--------|',
    `| Architect | ${totalArchTokens.toLocaleString()} |`,
    `| Builder | ${totalBuilderTokens.toLocaleString()} |`,
    `| Critic | ${totalCriticTokens.toLocaleString()} |`,
    '',
    '### Tools',
    '| Tool | Description |',
    '|------|-------------|',
    '| `synth_list` | List metas with summary stats and per-meta projection |',
    '| `synth_detail` | Full detail for a single meta with optional archive history |',
    '| `synth_trigger` | Manually trigger synthesis for a specific meta or next-stalest |',
    '| `synth_preview` | Dry-run: show what inputs would be gathered without running LLM |',
    '',
    'Read the `jeeves-meta` skill for usage guidance, configuration, and troubleshooting.',
  ];

  return lines.join('\n');
}
