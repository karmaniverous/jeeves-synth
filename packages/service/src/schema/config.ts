/**
 * Zod schema for jeeves-meta service configuration.
 *
 * The service config is a strict superset of the core (library-compatible) meta config.
 *
 * @module schema/config
 */

import { z } from 'zod';

/** Zod schema for the core (library-compatible) meta configuration. */
export const metaConfigSchema = z.object({
  /** Watcher service base URL. */
  watcherUrl: z.url(),

  /** OpenClaw gateway base URL for subprocess spawning. */
  gatewayUrl: z.url().default('http://127.0.0.1:18789'),

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

  /** Thinking level for spawned synthesis sessions. */
  thinking: z.string().default('low'),

  /** Resolved architect system prompt text. */
  defaultArchitect: z.string(),

  /** Resolved critic system prompt text. */
  defaultCritic: z.string(),

  /** Skip unchanged candidates, bump _generatedAt. */
  skipUnchanged: z.boolean().default(true),

  /** Watcher metadata properties applied to live .meta/meta.json files. */
  metaProperty: z.record(z.string(), z.unknown()).default({ _meta: 'current' }),

  /** Watcher metadata properties applied to archive snapshots. */
  metaArchiveProperty: z
    .record(z.string(), z.unknown())
    .default({ _meta: 'archive' }),
});

/** Inferred type for core meta configuration. */
export type MetaConfig = z.infer<typeof metaConfigSchema>;

/** Zod schema for logging configuration. */
const loggingSchema = z.object({
  /** Log level. */
  level: z.string().default('info'),

  /** Optional file path for log output. */
  file: z.string().optional(),
});

/** Zod schema for jeeves-meta service configuration (superset of MetaConfig). */
export const serviceConfigSchema = metaConfigSchema.extend({
  /** HTTP port for the service (default: 1938). */
  port: z.number().int().min(1).max(65535).default(1938),

  /** Cron schedule for synthesis cycles (default: every 30 min). */
  schedule: z.string().default('*/30 * * * *'),

  /** Optional channel identifier for reporting. */
  reportChannel: z.string().optional(),

  /** Logging configuration. */
  logging: loggingSchema.default(() => loggingSchema.parse({})),
});

/** Inferred type for service configuration. */
export type ServiceConfig = z.infer<typeof serviceConfigSchema>;
