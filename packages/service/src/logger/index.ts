/**
 * Pino logger factory.
 *
 * @module logger
 */

import pino from 'pino';

/** Logger configuration options. */
export interface LoggerConfig {
  /** Log level (default: 'info'). */
  level?: string;
  /** Optional file path to write logs to. */
  file?: string;
}

/**
 * Create a pino logger instance.
 *
 * @param config - Optional logger configuration.
 * @returns Configured pino logger.
 */
export function createLogger(config?: LoggerConfig): pino.Logger {
  const level = config?.level ?? 'info';

  if (config?.file) {
    const transport = pino.transport({
      target: 'pino/file',
      options: { destination: config.file, mkdir: true },
    });
    return pino({ level }, transport);
  }

  return pino({ level });
}
