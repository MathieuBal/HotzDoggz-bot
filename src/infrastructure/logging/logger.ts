import { pino } from 'pino';
import { loadEnv } from '../../config/env.js';

const env = loadEnv();

/**
 * Logs JSON structures et correlables (CDC §8.1 / §10.5).
 * En developpement, sortie lisible via pino-pretty.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'hotzdogz-bot' },
  redact: {
    paths: ['DISCORD_TOKEN', '*.token', 'token', 'authorization'],
    censor: '[redige]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
});

export type Logger = typeof logger;

/** Cree un logger enfant lie a un identifiant de correlation (§10.3). */
export function withCorrelation(correlationId: string): Logger {
  return logger.child({ correlationId });
}
