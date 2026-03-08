/**
 * Zod schema for jeeves-synth configuration.
 *
 * Consumers load config however they want (file, env, constructor).
 * The library validates via this schema.
 *
 * @module schema/config
 */

import { z } from 'zod';

/** Zod schema for jeeves-synth configuration. */
export const synthConfigSchema = z.object({
  /** Filesystem paths to watch for .meta/ directories. */
  watchPaths: z.array(z.string()).min(1),

  /** Watcher service base URL. */
  watcherUrl: z.url(),

  /** Run architect every N cycles (per meta). */
  architectEvery: z.number().int().min(1).default(10),

  /** Exponent for depth weighting in staleness formula. */
  depthWeight: z.number().min(0).default(1),

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
});

/** Inferred type for jeeves-synth configuration. */
export type SynthConfig = z.infer<typeof synthConfigSchema>;
