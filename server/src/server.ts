import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { ERROR_CODES } from '@uno-web/shared';
import { resolveSocketCorsOrigin } from './config/cors';
import { registerSocketHandlers } from './socket/handlers';
import { logger, normalizeError } from './utils/logger';

export function attachErrorMiddleware(app: Express) {
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    logger.error('http.unhandled_error', {
      method: req.method,
      path: req.path,
      error: normalizeError(err),
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: ERROR_CODES.INTERNAL_ERROR,
    });
  });
}

export function createApp() {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}

export function createHttpServer() {
  const app = createApp();
  attachErrorMiddleware(app);

  const httpServer = createServer(app);
  const clientOrigin = resolveSocketCorsOrigin(process.env.CLIENT_ORIGIN);
  const io = new Server(httpServer, {
    cors: {
      origin: clientOrigin,
      methods: ['GET', 'POST'],
    },
  });

  registerSocketHandlers(io);

  return { app, httpServer, io };
}
