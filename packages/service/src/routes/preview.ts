/**
 * GET /preview — dry-run synthesis preview.
 *
 * @module routes/preview
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';

import { readLatestArchive } from '../archive/index.js';
import {
  findNode,
  getDeltaFiles,
  getScopeFiles,
  listMetas,
} from '../discovery/index.js';
import { normalizePath } from '../normalizePath.js';
import {
  computeStalenessScore,
  discoverStalestPath,
  hasSteerChanged,
  isArchitectTriggered,
} from '../scheduling/index.js';
import type { MetaJson } from '../schema/index.js';
import { computeStructureHash } from '../structureHash.js';
import type { RouteDeps } from './index.js';

export function registerPreviewRoute(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  app.get('/preview', async (request, reply) => {
    const { config, watcher } = deps;
    const query = request.query as { path?: string };

    let result;
    try {
      result = await listMetas(config, watcher);
    } catch {
      return reply.status(503).send({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Watcher unreachable — cannot compute preview',
      });
    }

    let targetNode;
    if (query.path) {
      const normalized = normalizePath(query.path);
      targetNode = findNode(result.tree, normalized);
      if (!targetNode) {
        return {
          error: 'NOT_FOUND',
          message: 'Meta path not found: ' + query.path,
        };
      }
    } else {
      // Select stalest candidate
      const stale = result.entries
        .filter((e) => e.stalenessSeconds > 0)
        .map((e) => ({
          node: e.node,
          meta: e.meta,
          actualStaleness: e.stalenessSeconds,
        }));
      const stalestPath = discoverStalestPath(stale, config.depthWeight);
      if (!stalestPath) {
        return { message: 'No stale metas found. Nothing to synthesize.' };
      }
      targetNode = findNode(result.tree, stalestPath)!;
    }

    const meta: MetaJson = JSON.parse(
      readFileSync(join(targetNode.metaPath, 'meta.json'), 'utf8'),
    ) as MetaJson;

    // Scope files
    const { scopeFiles } = await getScopeFiles(targetNode, watcher);

    const structureHash = computeStructureHash(scopeFiles);
    const structureChanged = structureHash !== meta._structureHash;

    const latestArchive = readLatestArchive(targetNode.metaPath);
    const steerChanged = hasSteerChanged(
      meta._steer,
      latestArchive?._steer,
      Boolean(latestArchive),
    );

    const architectTriggered = isArchitectTriggered(
      meta,
      structureChanged,
      steerChanged,
      config.architectEvery,
    );

    // Delta files
    const deltaFiles = await getDeltaFiles(
      targetNode,
      watcher,
      meta._generatedAt,
      scopeFiles,
    );

    // EMA token estimates
    const estimatedTokens = {
      architect: meta._architectTokensAvg ?? meta._architectTokens ?? 0,
      builder: meta._builderTokensAvg ?? meta._builderTokens ?? 0,
      critic: meta._criticTokensAvg ?? meta._criticTokens ?? 0,
    };

    // Compute staleness
    const stalenessSeconds = meta._generatedAt
      ? Math.round((Date.now() - new Date(meta._generatedAt).getTime()) / 1000)
      : null;
    const stalenessScore = computeStalenessScore(
      stalenessSeconds,
      meta._depth ?? 0,
      meta._emphasis ?? 1,
      config.depthWeight,
    );

    return {
      path: targetNode.metaPath,
      staleness: {
        seconds: stalenessSeconds,
        score: Math.round(stalenessScore * 100) / 100,
      },
      architectWillRun: architectTriggered,
      architectReason:
        [
          ...(!meta._builder ? ['no cached builder (first run)'] : []),
          ...(structureChanged ? ['structure changed'] : []),
          ...(steerChanged ? ['steer changed'] : []),
          ...((meta._synthesisCount ?? 0) >= config.architectEvery
            ? ['periodic refresh']
            : []),
        ].join(', ') || 'not triggered',
      scope: {
        ownedFiles: scopeFiles.length,
        childMetas: targetNode.children.length,
        deltaFiles: deltaFiles
          .slice(0, 50)
          .map((f) => ({ path: f, action: 'modified' as const })),
        deltaCount: deltaFiles.length,
      },
      estimatedTokens,
    };
  });
}
