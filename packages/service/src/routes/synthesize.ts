/**
 * POST /synthesize — trigger synthesis for a specific path or stalest candidate.
 *
 * @module routes/synthesize
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const synthesizeBodySchema = z.object({
  path: z.string().optional(),
});

export function registerSynthesizeRoute(app: FastifyInstance): void {
  void deps;
  app.post('/synthesize', (request, reply) => {
    const body = synthesizeBodySchema.parse(request.body);

    return reply.status(202).send({
      status: 'accepted',
      path: body.path ?? 'stalest',
      queuePosition: 0,
    });
  });
}
