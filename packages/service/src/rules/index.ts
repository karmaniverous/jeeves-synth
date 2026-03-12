/**
 * Virtual rule registration with jeeves-watcher.
 *
 * Service registers inference rules at startup (with retry) and
 * re-registers opportunistically when watcher restart is detected.
 *
 * @module rules
 */

import type { Logger } from 'pino';

import type { WatcherClient } from '../interfaces/index.js';
import type { MetaConfig } from '../schema/config.js';

const SOURCE = 'jeeves-meta';
const MAX_RETRIES = 10;
const RETRY_BASE_MS = 2000;

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

/** Build the three virtual rule definitions. */
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
            generated_at: {
              type: 'string',
              set: '{{json._generatedAt}}',
            },
            generated_at_unix: {
              type: 'integer',
              set: '{{toUnix json._generatedAt}}',
            },
            has_error: {
              type: 'boolean',
              set: '{{#if json._error}}true{{else}}false{{/if}}',
            },
          },
        },
      ],
      render: {
        frontmatter: ['meta_id', 'generated_at', '*', '!_*', '!json', '!file', '!has_error'],
        body: [{ path: 'json._content', heading: 1, label: 'Synthesis' }],
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
      schema: ['base', { properties: { domains: { set: ['meta-config'] } } }],
      render: {
        frontmatter: [
          'watcherUrl',
          'gatewayUrl',
          'architectEvery',
          'depthWeight',
          'maxArchive',
          'maxLines',
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
 * Manages virtual rule registration with watcher.
 *
 * - Registers at startup with exponential retry
 * - Tracks watcher uptime for restart detection
 * - Re-registers opportunistically when uptime decreases
 */
export class RuleRegistrar {
  private readonly config: MetaConfig;
  private readonly logger: Logger;
  private readonly watcherClient: WatcherClient;
  private lastWatcherUptime: number | null = null;
  private registered = false;

  public constructor(
    config: MetaConfig,
    logger: Logger,
    watcher: WatcherClient,
  ) {
    this.config = config;
    this.logger = logger;
    this.watcherClient = watcher;
  }

  /** Whether rules have been successfully registered. */
  public get isRegistered(): boolean {
    return this.registered;
  }

  /**
   * Register rules with watcher. Retries with exponential backoff.
   * Non-blocking — logs errors but never throws.
   */
  public async register(): Promise<void> {
    const rules = buildMetaRules(this.config);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await this.watcherClient.registerRules(SOURCE, rules);
        this.registered = true;
        this.logger.info('Virtual rules registered with watcher');
        return;
      } catch (err) {
        const delayMs = RETRY_BASE_MS * Math.pow(2, attempt);
        this.logger.warn(
          { attempt: attempt + 1, delayMs, err },
          'Rule registration failed, retrying',
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    this.logger.error(
      'Rule registration failed after max retries — service degraded',
    );
  }

  /**
   * Check watcher uptime and re-register if it decreased (restart detected).
   *
   * @param currentUptime - Current watcher uptime in seconds.
   */
  public async checkAndReregister(currentUptime: number): Promise<void> {
    if (
      this.lastWatcherUptime !== null &&
      currentUptime < this.lastWatcherUptime
    ) {
      this.logger.info(
        { previous: this.lastWatcherUptime, current: currentUptime },
        'Watcher restart detected — re-registering rules',
      );
      this.registered = false;
      await this.register();
    }
    this.lastWatcherUptime = currentUptime;
  }
}
