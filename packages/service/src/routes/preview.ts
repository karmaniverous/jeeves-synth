/**
 * GET /preview — dry-run synthesis preview.
 *
 * Module: routes/preview
 */

import type { FastifyInstance } from 'fastify';

export function registerPreviewRoute(app: FastifyInstance): void {
  app.get('/preview', () => {
    return {
      path: null as string | null,
      message: 'Not implemented yet',
    };
  });
}
