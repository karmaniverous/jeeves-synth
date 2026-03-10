/**
 * Zod schema for jeeves-meta configuration.
 *
 * Consumers load config however they want (file, env, constructor).
 * The library validates via this schema.
 *
 * @module schema/config
 */

import { z } from 'zod';

/** Zod schema for jeeves-meta configuration. */
export const synthConfigSchema = z.object({
  /** Filesystem paths to watch for .meta/ directories. */

  /** Watcher service base URL. */
  watcherUrl: z.url(),

  /** OpenClaw gateway base URL for subprocess spawning. */
  gatewayUrl: z.url().default('http://127.0.0.1:3000'),

  /** Optional API key for gateway authentication. */
  gatewayApiKey: z.string().optional(),

  /** Run architect every N cycles (per meta). */
  architectEvery: z.number().int().min(1).default(10),

  /** Exponent for depth weighting in staleness formula. */
  depthWeight: z.number().min(0).default(0.5),

  /** Maximum archive snapshots to retain per meta. */
  maxArchive: z.number().int().min(1).default(20),

  /** Maximum lines of context to include in subprocess prompts. */
  maxLines: z.number().int().min(50).default(500),

  /** Architect subprocess timeout in seconds. */
  architectTimeout: z.number().int().min(30).default(120),

  /** Builder subprocess timeout in seconds. */
  builderTimeout: z.number().int().min(60).default(600),

  /** Critic subprocess timeout in seconds. */
  criticTimeout: z.number().int().min(30).default(300),

  /** Resolved architect system prompt text. */
  defaultArchitect: z.string(),

  /** Resolved critic system prompt text. */
  defaultCritic: z.string(),

  /**
   * When true, skip unchanged candidates and iterate to the next-stalest
   * until finding one with actual changes. Skipped candidates get their
   * _generatedAt bumped to prevent re-selection next cycle.
   */
  skipUnchanged: z.boolean().default(true),

  /** Number of metas to synthesize per invocation. */
  batchSize: z.number().int().min(1).default(1),

  /**
   * Watcher metadata properties for live .meta/meta.json files.
   * Virtual rules use these to tag live metas; scan queries derive
   * their filter from the first domain value.
   */
  metaProperty: z
    .object({ domains: z.array(z.string()).min(1) })
    .default({ domains: ['meta'] }),

  /**
   * Watcher metadata properties for .meta/archive/** snapshots.
   * Virtual rules use these to tag archive files.
   */
  metaArchiveProperty: z
    .object({ domains: z.array(z.string()).min(1) })
    .default({ domains: ['meta-archive'] }),
});

/** Inferred type for jeeves-meta configuration. */
export type SynthConfig = z.infer<typeof synthConfigSchema>;
