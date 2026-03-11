/**
 * Structured error from a synthesis step failure.
 *
 * @module schema/error
 */

import { z } from 'zod';

/** Zod schema for synthesis step errors. */
export const metaErrorSchema = z.object({
  /** Which step failed: 'architect', 'builder', or 'critic'. */
  step: z.enum(['architect', 'builder', 'critic']),
  /** Error classification code. */
  code: z.string(),
  /** Human-readable error message. */
  message: z.string(),
});

/** Inferred type for synthesis step errors. */
export type MetaError = z.infer<typeof metaErrorSchema>;
