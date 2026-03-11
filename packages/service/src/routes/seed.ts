/**
 * POST /seed — create a .meta/ directory with an empty meta.json.
 *
 * @module routes/seed
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { RouteDeps } from './index.js';

const seedBodySchema = z.object({
  path: z.string().min(1),
});

export function registerSeedRoute(app: FastifyInstance, deps: RouteDeps): void {
  app.post('/seed', (request, reply) => {
    const body = seedBodySchema.parse(request.body);
    const metaDir = join(body.path, '.meta');

    if (existsSync(metaDir)) {
      return reply.status(409).send({
        error: 'CONFLICT',
        message: `.meta directory already exists at ${body.path}`,
      });
    }

    deps.logger.info({ metaDir }, 'creating .meta directory');
    mkdirSync(metaDir, { recursive: true });

    const metaJson = { _id: randomUUID() };
    const metaJsonPath = join(metaDir, 'meta.json');
    deps.logger.info({ metaJsonPath }, 'writing meta.json');
    writeFileSync(metaJsonPath, JSON.stringify(metaJson, null, 2) + '\n');

    return reply.status(201).send({
      status: 'created',
      path: body.path,
      metaDir,
      _id: metaJson._id,
    });
  });
}
