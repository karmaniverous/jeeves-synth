/**
 * GET /metas — list metas with optional filters.
 * GET /metas/:path — single meta detail.
 *
 * @module routes/metas
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

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

export function registerMetasRoutes(app: FastifyInstance): void {
  void deps;
  app.get('/metas', (request) => {
    metasQuerySchema.parse(request.query);

    return {
      summary: {
        total: 0,
        stale: 0,
        errors: 0,
        neverSynthesized: 0,
      },
      metas: [] as unknown[],
    };
  });

  app.get<{ Params: { path: string } }>('/metas/:path', (request, reply) => {
    metaDetailQuerySchema.parse(request.query);
    void request.params;

    return reply.status(404).send({
      error: 'NOT_FOUND',
      message: 'Not implemented yet',
    });
  });
}
