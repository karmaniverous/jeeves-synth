/**
 * GET /preview — dry-run synthesis preview.
 *
 * @module routes/preview
 */

import type { FastifyInstance } from 'fastify';

export function registerPreviewRoute(app: FastifyInstance): void {
  void deps;
  app.get('/preview', () => {
    return {
      path: null as string | null,
      message: 'Not implemented yet',
    };
  });
}
