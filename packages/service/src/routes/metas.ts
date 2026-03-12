/**
 * GET /metas — list metas with optional filters.
 * GET /metas/:path — single meta detail.
 *
 * @module routes/metas
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { listArchiveFiles } from '../archive/index.js';
import { getScopeFiles } from '../discovery/index.js';
import { findNode, listMetas } from '../discovery/index.js';
import { normalizePath } from '../normalizePath.js';
import { computeStalenessScore } from '../scheduling/index.js';
import type { RouteDeps } from './index.js';

const metasQuerySchema = z.object({
  pathPrefix: z.string().optional(),
  hasError: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  staleHours: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .optional(),
  neverSynthesized: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  locked: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  fields: z.string().optional(),
});

const metaDetailQuerySchema = z.object({
  fields: z.string().optional(),
  includeArchive: z
    .union([
      z.enum(['true', 'false']).transform((v) => v === 'true'),
      z.string().transform(Number).pipe(z.number().int().nonnegative()),
    ])
    .optional(),
});

/** Compute summary stats from a filtered set of MetaEntries. */
function computeFilteredSummary(
  entries: Array<{
    path: string;
    stalenessSeconds: number;
    hasError: boolean;
    lastSynthesized: string | null;
    architectTokens: number | null;
    builderTokens: number | null;
    criticTokens: number | null;
  }>,
) {
  let staleCount = 0;
  let errorCount = 0;
  let neverSynthCount = 0;
  let stalestPath: string | null = null;
  let stalestSeconds = -1;
  let lastSynthesizedPath: string | null = null;
  let lastSynthesizedAt: string | null = null;
  let totalArchitectTokens = 0;
  let totalBuilderTokens = 0;
  let totalCriticTokens = 0;

  for (const e of entries) {
    if (e.stalenessSeconds > 0) staleCount++;
    if (e.hasError) errorCount++;
    if (e.stalenessSeconds === Infinity) neverSynthCount++;
    if (e.stalenessSeconds > stalestSeconds) {
      stalestSeconds = e.stalenessSeconds;
      stalestPath = e.path;
    }
    if (
      e.lastSynthesized &&
      (!lastSynthesizedAt || e.lastSynthesized > lastSynthesizedAt)
    ) {
      lastSynthesizedAt = e.lastSynthesized;
      lastSynthesizedPath = e.path;
    }
    totalArchitectTokens += e.architectTokens ?? 0;
    totalBuilderTokens += e.builderTokens ?? 0;
    totalCriticTokens += e.criticTokens ?? 0;
  }

  return {
    total: entries.length,
    stale: staleCount,
    errors: errorCount,
    neverSynthesized: neverSynthCount,
    stalestPath,
    lastSynthesizedPath,
    lastSynthesizedAt,
    tokens: {
      architect: totalArchitectTokens,
      builder: totalBuilderTokens,
      critic: totalCriticTokens,
    },
  };
}

export function registerMetasRoutes(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  app.get('/metas', async (request) => {
    const query = metasQuerySchema.parse(request.query);
    const { config, watcher } = deps;

    const result = await listMetas(config, watcher, request.log);
    let entries = result.entries;

    // Apply filters
    if (query.pathPrefix) {
      entries = entries.filter((e) => e.path.includes(query.pathPrefix!));
    }
    if (query.hasError !== undefined) {
      entries = entries.filter((e) => e.hasError === query.hasError);
    }
    if (query.neverSynthesized !== undefined) {
      entries = entries.filter(
        (e) => (e.stalenessSeconds === Infinity) === query.neverSynthesized,
      );
    }
    if (query.locked !== undefined) {
      entries = entries.filter((e) => e.locked === query.locked);
    }
    if (typeof query.staleHours === 'number') {
      entries = entries.filter(
        (e) => e.stalenessSeconds >= query.staleHours! * 3600,
      );
    }

    // Summary (computed from filtered entries)
    const summary = computeFilteredSummary(entries);

    // Field projection
    const fieldList = query.fields?.split(',');
    const defaultFields = [
      'path',
      'depth',
      'emphasis',
      'stalenessSeconds',
      'lastSynthesized',
      'hasError',
      'locked',
      'architectTokens',
      'builderTokens',
      'criticTokens',
    ];
    const projectedFields = fieldList ?? defaultFields;

    const metas = entries.map((e) => {
      const full: Record<string, unknown> = {
        path: e.path,
        depth: e.depth,
        emphasis: e.emphasis,
        stalenessSeconds:
          e.stalenessSeconds === Infinity
            ? null
            : Math.round(e.stalenessSeconds),
        lastSynthesized: e.lastSynthesized,
        hasError: e.hasError,
        locked: e.locked,
        architectTokens: e.architectTokens,
        builderTokens: e.builderTokens,
        criticTokens: e.criticTokens,
      };
      const projected: Record<string, unknown> = {};
      for (const f of projectedFields) {
        if (f in full) projected[f] = full[f];
      }
      return projected;
    });

    return { summary, metas };
  });

  app.get<{ Params: { path: string } }>(
    '/metas/:path',
    async (request, reply) => {
      const query = metaDetailQuerySchema.parse(request.query);
      const { config, watcher } = deps;

      const targetPath = normalizePath(decodeURIComponent(request.params.path));
      const result = await listMetas(config, watcher, request.log);
      const targetNode = findNode(result.tree, targetPath);

      if (!targetNode) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'Meta path not found: ' + targetPath,
        });
      }

      const meta = JSON.parse(
        readFileSync(join(targetNode.metaPath, 'meta.json'), 'utf8'),
      ) as Record<string, unknown>;

      // Field projection
      const defaultExclude = new Set([
        '_architect',
        '_builder',
        '_critic',
        '_content',
        '_feedback',
      ]);
      const fieldList = query.fields?.split(',');

      const projectMeta = (
        m: Record<string, unknown>,
      ): Record<string, unknown> => {
        if (fieldList) {
          const r: Record<string, unknown> = {};
          for (const f of fieldList) r[f] = m[f];
          return r;
        }
        const r: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(m)) {
          if (!defaultExclude.has(k)) r[k] = v;
        }
        return r;
      };

      // Compute scope
      const { scopeFiles, allFiles } = getScopeFiles(targetNode);

      // Compute staleness
      const metaTyped = meta as Record<string, unknown> & {
        _generatedAt?: string;
        _depth?: number;
        _emphasis?: number;
      };
      const staleSeconds = metaTyped._generatedAt
        ? Math.round(
            (Date.now() - new Date(metaTyped._generatedAt).getTime()) / 1000,
          )
        : null;
      const score = computeStalenessScore(
        staleSeconds,
        metaTyped._depth ?? 0,
        metaTyped._emphasis ?? 1,
        config.depthWeight,
      );

      const response: Record<string, unknown> = {
        path: targetNode.metaPath,
        meta: projectMeta(meta),
        scope: {
          ownedFiles: scopeFiles.length,
          childMetas: targetNode.children.length,
          totalFiles: allFiles.length,
        },
        staleness: {
          seconds: staleSeconds,
          score: Math.round(score * 100) / 100,
        },
      };

      // Archive
      if (query.includeArchive) {
        const archiveFiles = listArchiveFiles(targetNode.metaPath);
        const limit =
          typeof query.includeArchive === 'number'
            ? query.includeArchive
            : archiveFiles.length;
        const selected = archiveFiles.slice(-limit).reverse();
        response.archive = selected.map((af) => {
          const raw = readFileSync(af, 'utf8');
          return projectMeta(JSON.parse(raw) as Record<string, unknown>);
        });
      }

      return response;
    },
  );
}
