/**
 * POST /unlock — remove .lock from a .meta/ directory.
 *
 * @module routes/unlock
 */

import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { RouteDeps } from './index.js';

const unlockBodySchema = z.object({
  path: z.string().min(1),
});

export function registerUnlockRoute(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  app.post('/unlock', (request, reply) => {
    const body = unlockBodySchema.parse(request.body);
    const lockPath = join(body.path, '.meta', '.lock');

    if (!existsSync(lockPath)) {
      return reply.status(404).send({
        error: 'NOT_FOUND',
        message: `No lock file at ${body.path}`,
      });
    }

    deps.logger.info({ lockPath }, 'removing lock file');
    unlinkSync(lockPath);

    return reply.status(200).send({
      status: 'unlocked',
      path: body.path,
    });
  });
}
