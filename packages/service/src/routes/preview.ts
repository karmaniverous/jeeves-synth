/**
 * GET /preview — dry-run synthesis preview.
 *
 * @module routes/preview
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';

import { readLatestArchive } from '../archive/index.js';
import { filterInScope, findNode, listMetas } from '../discovery/index.js';
import { normalizePath } from '../normalizePath.js';
import { paginatedScan } from '../paginatedScan.js';
import {
  computeEffectiveStaleness,
  hasSteerChanged,
  isArchitectTriggered,
  selectCandidate,
} from '../scheduling/index.js';
import type { MetaJson } from '../schema/index.js';
import { computeStructureHash } from '../structureHash.js';
import type { RouteDeps } from './index.js';

export function registerPreviewRoute(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  app.get('/preview', async (request) => {
    const { config, watcher } = deps;
    const query = request.query as { path?: string };

    const result = await listMetas(config, watcher);

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
      const candidates = result.entries
        .filter((e) => e.stalenessSeconds > 0)
        .map((e) => ({
          node: e.node,
          meta: e.meta,
          actualStaleness: e.stalenessSeconds,
        }));
      const weighted = computeEffectiveStaleness(
        candidates,
        config.depthWeight,
      );
      const winner = selectCandidate(weighted);
      if (!winner) {
        return { message: 'No stale metas found. Nothing to synthesize.' };
      }
      targetNode = winner.node;
    }

    const meta: MetaJson = JSON.parse(
      readFileSync(join(targetNode.metaPath, 'meta.json'), 'utf8'),
    ) as MetaJson;

    // Scope files
    const allScanFiles = await paginatedScan(watcher, {
      pathPrefix: targetNode.ownerPath,
    });
    const allFiles = allScanFiles.map((f) => f.file_path);
    const scopeFiles = filterInScope(targetNode, allFiles);

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
    let deltaFiles: string[] = [];
    if (meta._generatedAt) {
      const modifiedAfter = Math.floor(
        new Date(meta._generatedAt).getTime() / 1000,
      );
      const deltaScanFiles = await paginatedScan(watcher, {
        pathPrefix: targetNode.ownerPath,
        modifiedAfter,
      });
      deltaFiles = filterInScope(
        targetNode,
        deltaScanFiles.map((f) => f.file_path),
      );
    } else {
      deltaFiles = scopeFiles;
    }

    // EMA token estimates
    const estimatedTokens = {
      architect: meta._architectTokens ?? 0,
      builder: meta._builderTokens ?? 0,
      critic: meta._criticTokens ?? 0,
    };

    return {
      path: targetNode.metaPath,
      staleness: {
        seconds: meta._generatedAt
          ? Math.round(
              (Date.now() - new Date(meta._generatedAt).getTime()) / 1000,
            )
          : null,
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
        deltaFiles: deltaFiles.slice(0, 50).map((f) => ({ path: f })),
        deltaCount: deltaFiles.length,
      },
      estimatedTokens,
      children: targetNode.children.map((c) => c.metaPath),
    };
  });
}
