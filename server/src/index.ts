import 'dotenv/config';
import { createHttpServer } from './server';
import { logger, normalizeError } from './utils/logger';

const { httpServer } = createHttpServer();

const PORT = Number(process.env.PORT ?? 3001);

process.on('unhandledRejection', (reason) => {
  logger.error('process.unhandled_rejection', {
    error: normalizeError(reason),
  });
});

process.on('uncaughtException', (error) => {
  logger.error('process.uncaught_exception', {
    error: normalizeError(error),
  });

  httpServer.close(() => {
    process.exit(1);
  });

  setTimeout(() => {
    process.exit(1);
  }, 1000).unref();
});

httpServer.listen(PORT, '0.0.0.0', () => {
  logger.info('server.started', { port: PORT });
});
