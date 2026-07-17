import './config/env.js';
import { createHttpServer } from './server.js';
import { runMigrations } from './db/migrationRunner.js';
import { createPostgresPool } from './db/pool.js';
import { gameManager } from './game/GameManager.js';
import { historyService } from './history/index.js';
import { logger, normalizeError } from './utils/logger.js';

const { httpServer, io } = createHttpServer();

const PORT = Number(process.env.PORT ?? 3001);

process.on('unhandledRejection', (reason) => {
  logger.error('process.unhandled_rejection', {
    error: normalizeError(reason),
  });
});

let isShuttingDown = false;

async function shutdown(
  trigger: string,
  exitCode: number,
  historyReason: 'server_shutdown' | 'server_error'
): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info('server.shutting_down', { trigger, exitCode });

  io.emit('serverRestarting');
  io.disconnectSockets(true);
  await historyService.shutdown(gameManager.getGames(), historyReason);

  await new Promise<void>(resolve => {
    if (!httpServer.listening) {
      resolve();
      return;
    }
    httpServer.close(() => resolve());
  });
  process.exit(exitCode);
}

process.on('uncaughtException', error => {
  logger.error('process.uncaught_exception', {
    error: normalizeError(error),
  });

  void shutdown('uncaughtException', 1, 'server_error');

  setTimeout(() => {
    process.exit(1);
  }, 10_000).unref();
});

process.on('SIGTERM', () => void shutdown('SIGTERM', 0, 'server_shutdown'));
process.on('SIGINT', () => void shutdown('SIGINT', 0, 'server_shutdown'));

async function prepareHistory(): Promise<void> {
  const migrationPool = createPostgresPool();
  if (migrationPool) {
    try {
      const appliedFiles = await runMigrations(migrationPool);
      logger.info('database.migrations_ready', { appliedFiles });
    } catch (error) {
      logger.error('database.migrations_failed', {
        error: normalizeError(error),
        mode: 'history_degraded',
      });
    } finally {
      await migrationPool.end();
    }
  }
  if (!isShuttingDown) {
    await historyService.start();
  }
}

void prepareHistory();

httpServer.listen(PORT, '0.0.0.0', () => {
  logger.info('server.started', { port: PORT });
});
