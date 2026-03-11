/**
 * Merge synthesis results into meta.json.
 *
 * Preserves human-set fields (_id, _steer, _depth).
 * Writes engine fields (_generatedAt, _structureHash, etc.).
 * Validates against schema before writing.
 *
 * @module orchestrator/merge
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { computeEma } from '../ema.js';
import type { MetaError } from '../schema/index.js';
import { type MetaJson, metaJsonSchema } from '../schema/index.js';
import type { BuilderOutput } from './parseOutput.js';

/** Options for merging synthesis results. */
export interface MergeOptions {
  /** Path to .meta directory. */
  metaPath: string;
  /** Current meta.json content. */
  current: MetaJson;
  /** Architect prompt used (or existing). */
  architect: string;
  /** Builder task brief (new or cached). */
  builder: string;
  /** Critic prompt used (or existing). */
  critic: string;
  /** Builder output (content + structured fields), or null if builder failed. */
  builderOutput: BuilderOutput | null;
  /** Critic feedback, or null if critic failed. */
  feedback: string | null;
  /** New structure hash. */
  structureHash: string;
  /** New synthesis count. */
  synthesisCount: number;
  /** Error from any step, or null on full success. */
  error: MetaError | null;
  /** Token count from architect step. */
  architectTokens?: number;
  /** Token count from builder step. */
  builderTokens?: number;
  /** Token count from critic step. */
  criticTokens?: number;
}

/**
 * Merge results into meta.json and write atomically.
 *
 * @param options - Merge options.
 * @returns The updated MetaJson.
 * @throws If validation fails (malformed output).
 */
export function mergeAndWrite(options: MergeOptions): MetaJson {
  const merged: MetaJson = {
    // Preserve human-set fields
    _id: options.current._id,
    _steer: options.current._steer,
    _depth: options.current._depth,
    _emphasis: options.current._emphasis,

    // Engine fields
    _architect: options.architect,
    _builder: options.builder,
    _critic: options.critic,
    _generatedAt: new Date().toISOString(),
    _structureHash: options.structureHash,
    _synthesisCount: options.synthesisCount,

    // Token tracking
    _architectTokens: options.architectTokens,
    _builderTokens: options.builderTokens,
    _criticTokens: options.criticTokens,
    _architectTokensAvg:
      options.architectTokens !== undefined
        ? computeEma(
            options.architectTokens,
            options.current._architectTokensAvg,
          )
        : options.current._architectTokensAvg,
    _builderTokensAvg:
      options.builderTokens !== undefined
        ? computeEma(options.builderTokens, options.current._builderTokensAvg)
        : options.current._builderTokensAvg,
    _criticTokensAvg:
      options.criticTokens !== undefined
        ? computeEma(options.criticTokens, options.current._criticTokensAvg)
        : options.current._criticTokensAvg,

    // Content from builder
    _content: options.builderOutput?.content ?? options.current._content,

    // Feedback from critic
    _feedback: options.feedback ?? options.current._feedback,

    // Error handling
    _error: options.error ?? undefined,

    // Spread structured fields from builder
    ...options.builderOutput?.fields,
  };

  // Clean up undefined optional fields
  if (merged._steer === undefined) delete merged._steer;
  if (merged._depth === undefined) delete merged._depth;
  if (merged._emphasis === undefined) delete merged._emphasis;
  if (merged._architectTokens === undefined) delete merged._architectTokens;
  if (merged._builderTokens === undefined) delete merged._builderTokens;
  if (merged._criticTokens === undefined) delete merged._criticTokens;
  if (merged._architectTokensAvg === undefined)
    delete merged._architectTokensAvg;
  if (merged._builderTokensAvg === undefined) delete merged._builderTokensAvg;
  if (merged._criticTokensAvg === undefined) delete merged._criticTokensAvg;
  if (merged._error === undefined) delete merged._error;
  if (merged._content === undefined) delete merged._content;
  if (merged._feedback === undefined) delete merged._feedback;

  // Validate
  const result = metaJsonSchema.safeParse(merged);
  if (!result.success) {
    throw new Error(`Meta validation failed: ${result.error.message}`);
  }

  // Write atomically
  const filePath = join(options.metaPath, 'meta.json');
  writeFileSync(filePath, JSON.stringify(result.data, null, 2) + '\n');

  return result.data;
}
