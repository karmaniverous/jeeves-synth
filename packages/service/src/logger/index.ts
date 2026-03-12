/**
 * Pino logger factory.
 *
 * @module logger
 */

import pino from 'pino';

/** Minimal logger interface accepted by library functions. */
export interface MinimalLogger {
  debug: (obj: Record<string, unknown>, msg: string) => void;
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

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
