/**
 * POST /synthesize route handler.
 *
 * @module routes/synthesize
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { listMetas } from '../discovery/index.js';
import {
  computeEffectiveStaleness,
  selectCandidate,
} from '../scheduling/index.js';
import type { RouteDeps } from './index.js';

const synthesizeBodySchema = z.object({
  path: z.string().optional(),
});

/** Register the POST /synthesize route. */
export function registerSynthesizeRoute(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  app.post('/synthesize', async (request, reply) => {
    const body = synthesizeBodySchema.parse(request.body);
    const { config, watcher, queue } = deps;

    let targetPath: string;
    if (body.path) {
      targetPath = body.path;
    } else {
      // Discover stalest candidate
      const result = await listMetas(config, watcher);
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
        return reply.code(200).send({
          status: 'skipped',
          message: 'No stale metas found. Nothing to synthesize.',
        });
      }
      targetPath = winner.node.metaPath;
    }

    const result = queue.enqueue(targetPath, body.path !== undefined);

    return reply.code(202).send({
      status: 'accepted',
      path: targetPath,
      queuePosition: result.position,
      alreadyQueued: result.alreadyQueued,
    });
  });
}
