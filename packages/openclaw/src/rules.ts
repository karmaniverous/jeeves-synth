/**
 * Virtual rule definitions and registration for jeeves-meta.
 *
 * Registers three inference rules with the watcher at plugin startup:
 * 1. synth-meta-live — indexes live .meta/meta.json files
 * 2. synth-meta-archive — indexes archived snapshots
 * 3. synth-config — indexes the meta config file
 *
 * @module rules
 */

import type { MetaConfig } from '@karmaniverous/jeeves-meta';
import { HttpWatcherClient } from '@karmaniverous/jeeves-meta';

const SOURCE = 'jeeves-meta';

/**
 * Convert a `Record<string, unknown>` config property into watcher
 * schema `set` directives: `{ key: { set: value } }` per entry.
 */
function toSchemaSetDirectives(
  props: Record<string, unknown>,
): Record<string, { set: unknown }> {
  return Object.fromEntries(
    Object.entries(props).map(([k, v]) => [k, { set: v }]),
  );
}

/**
 * Build virtual rule definitions using configured domain tags.
 *
 * @param config - Meta config with metaProperty/metaArchiveProperty.
 * @returns Array of inference rule specs.
 */
function buildMetaRules(config: MetaConfig) {
  return [
    {
      name: 'meta-current',
      description: 'Live jeeves-meta .meta/meta.json files',
      match: {
        properties: {
          file: {
            properties: {
              path: { type: 'string', glob: '**/.meta/meta.json' },
            },
          },
        },
      },
      schema: [
        'base',
        {
          properties: {
            ...toSchemaSetDirectives(config.metaProperty),
            meta_id: { type: 'string', set: '{{json._id}}' },
            meta_steer: { type: 'string', set: '{{json._steer}}' },
            meta_depth: { type: 'number', set: '{{json._depth}}' },
            meta_emphasis: { type: 'number', set: '{{json._emphasis}}' },
            meta_synthesis_count: {
              type: 'integer',
              set: '{{json._synthesisCount}}',
            },
            meta_structure_hash: {
              type: 'string',
              set: '{{json._structureHash}}',
            },
            meta_architect_tokens: {
              type: 'integer',
              set: '{{json._architectTokens}}',
            },
            meta_builder_tokens: {
              type: 'integer',
              set: '{{json._builderTokens}}',
            },
            meta_critic_tokens: {
              type: 'integer',
              set: '{{json._criticTokens}}',
            },
            meta_error_step: {
              type: 'string',
              set: '{{json._error.step}}',
            },
            generated_at_unix: {
              type: 'integer',
              set: '{{toUnix json._generatedAt}}',
              description:
                'Synthesis timestamp as Unix seconds for range queries',
            },
            has_error: {
              type: 'boolean',
              set: '{{#if json._error}}true{{else}}false{{/if}}',
            },
          },
        },
      ],
      render: {
        frontmatter: [
          'meta_id',
          'meta_steer',
          'generated_at_unix',
          'meta_depth',
          'meta_emphasis',
          'meta_architect_tokens',
          'meta_builder_tokens',
          'meta_critic_tokens',
        ],
        body: [
          {
            path: 'json._content',
            heading: 1,
            label: 'Synthesis',
          },
        ],
      },
      renderAs: 'md',
    },
    {
      name: 'meta-archive',
      description: 'Archived jeeves-meta .meta/archive snapshots',
      match: {
        properties: {
          file: {
            properties: {
              path: { type: 'string', glob: '**/.meta/archive/*.json' },
            },
          },
        },
      },
      schema: [
        'base',
        {
          properties: {
            ...toSchemaSetDirectives(config.metaArchiveProperty),
            meta_id: { type: 'string', set: '{{json._id}}' },
            archived: { type: 'boolean', set: 'true' },
            archived_at: { type: 'string', set: '{{json._archivedAt}}' },
          },
        },
      ],
      render: {
        frontmatter: ['meta_id', 'archived', 'archived_at'],
        body: [
          {
            path: 'json._content',
            heading: 1,
            label: 'Synthesis (archived)',
          },
        ],
      },
      renderAs: 'md',
    },
    {
      name: 'meta-config',
      description: 'jeeves-meta configuration file',
      match: {
        properties: {
          file: {
            properties: {
              path: { type: 'string', glob: '**/jeeves-meta.config.json' },
            },
          },
        },
      },
      schema: [
        'base',
        {
          properties: {
            domains: { set: ['meta-config'] },
          },
        },
      ],
      render: {
        frontmatter: [
          'watchPaths',
          'watcherUrl',
          'gatewayUrl',
          'architectEvery',
          'depthWeight',
          'maxArchive',
          'maxLines',
          'batchSize',
        ],
        body: [
          {
            path: 'json.defaultArchitect',
            heading: 2,
            label: 'Default Architect Prompt',
          },
          {
            path: 'json.defaultCritic',
            heading: 2,
            label: 'Default Critic Prompt',
          },
        ],
      },
      renderAs: 'md',
    },
  ];
}

/**
 * Register jeeves-meta virtual rules with the watcher.
 *
 * Called at plugin startup. Rules are additive — the watcher appends
 * them after config-file rules (last-match-wins).
 *
 * @param watcherUrl - Base URL for the watcher service.
 */
export async function registerMetaRules(
  watcherUrl: string,
  config: MetaConfig,
): Promise<void> {
  const client = new HttpWatcherClient({ baseUrl: watcherUrl });
  await client.registerRules(SOURCE, buildMetaRules(config));
}
