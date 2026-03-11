/**
 * Re-exports for all schema modules.
 *
 * @module schema
 */

export {
  type MetaConfig,
  metaConfigSchema,
  type ServiceConfig,
  serviceConfigSchema,
} from './config.js';
export { type MetaError, metaErrorSchema } from './error.js';
export { type MetaJson, metaJsonSchema } from './meta.js';
