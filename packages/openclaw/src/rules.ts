/**
 * Virtual rule definitions and registration for jeeves-meta.
 *
 * Registers three inference rules with the watcher at plugin startup:
 * 1. synth-meta-live — indexes live .meta/meta.json files
 * 2. synth-meta-archive — indexes archived snapshots
 * 3. synth-config — indexes the synth config file
 *
 * @module rules
 */

import type { SynthConfig } from '@karmaniverous/jeeves-meta';
import { HttpWatcherClient } from '@karmaniverous/jeeves-meta';

const SOURCE = 'jeeves-meta';

/**
 * Build virtual rule definitions using configured domain tags.
 *
 * @param config - Synth config with metaProperty/metaArchiveProperty.
 * @returns Array of inference rule specs.
 */
function buildSynthRules(config: SynthConfig) {
  return [
    {
      name: 'synth-meta-live',
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
            domains: { set: config.metaProperty.domains },
            synth_id: { type: 'string', set: '{{json._id}}' },
            synth_steer: { type: 'string', set: '{{json._steer}}' },
            synth_depth: { type: 'number', set: '{{json._depth}}' },
            synth_emphasis: { type: 'number', set: '{{json._emphasis}}' },
            synth_synthesis_count: {
              type: 'integer',
              set: '{{json._synthesisCount}}',
            },
            synth_structure_hash: {
              type: 'string',
              set: '{{json._structureHash}}',
            },
            synth_architect_tokens: {
              type: 'integer',
              set: '{{json._architectTokens}}',
            },
            synth_builder_tokens: {
              type: 'integer',
              set: '{{json._builderTokens}}',
            },
            synth_critic_tokens: {
              type: 'integer',
              set: '{{json._criticTokens}}',
            },
            synth_error_step: {
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
          'synth_id',
          'synth_steer',
          'generated_at_unix',
          'synth_depth',
          'synth_emphasis',
          'synth_architect_tokens',
          'synth_builder_tokens',
          'synth_critic_tokens',
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
      name: 'synth-meta-archive',
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
            domains: { set: config.metaArchiveProperty.domains },
            synth_id: { type: 'string', set: '{{json._id}}' },
            archived: { type: 'boolean', set: 'true' },
            archived_at: { type: 'string', set: '{{json._archivedAt}}' },
          },
        },
      ],
      render: {
        frontmatter: ['synth_id', 'archived', 'archived_at'],
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
      name: 'synth-config',
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
            domains: { set: ['synth-config'] },
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
export async function registerSynthRules(
  watcherUrl: string,
  config: SynthConfig,
): Promise<void> {
  const client = new HttpWatcherClient({ baseUrl: watcherUrl });
  await client.registerRules(SOURCE, buildSynthRules(config));
}
