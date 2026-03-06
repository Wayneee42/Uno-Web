export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLogLevel(): LogLevel {
  const rawLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (rawLevel === 'debug' || rawLevel === 'info' || rawLevel === 'warn' || rawLevel === 'error') {
    return rawLevel;
  }
  return 'info';
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[resolveLogLevel()];
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: typeof error === 'string' ? error : 'Unknown error',
    value: error,
  };
}

function write(level: LogLevel, event: string, context: Record<string, unknown> = {}): void {
  if (!shouldLog(level)) {
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  };

  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  debug: (event: string, context?: Record<string, unknown>) => write('debug', event, context),
  info: (event: string, context?: Record<string, unknown>) => write('info', event, context),
  warn: (event: string, context?: Record<string, unknown>) => write('warn', event, context),
  error: (event: string, context?: Record<string, unknown>) => write('error', event, context),
};

export function normalizeError(error: unknown) {
  return formatError(error);
}
