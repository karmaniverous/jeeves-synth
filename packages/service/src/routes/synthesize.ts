/**
 * POST /synthesize route handler.
 *
 * Module: routes/synthesize
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { RouteDeps } from './index.js';

const synthesizeBodySchema = z.object({
  path: z.string().optional(),
});

/** Register the POST /synthesize route. */
export function registerSynthesizeRoute(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  app.post('/synthesize', (request, reply) => {
    const body = synthesizeBodySchema.parse(request.body);
    const path = body.path ?? 'stalest';

    const result = deps.queue.enqueue(path, body.path !== undefined);

    return reply.code(202).send({
      status: 'accepted',
      path,
      queuePosition: result.position,
      alreadyQueued: result.alreadyQueued,
    });
  });
}
