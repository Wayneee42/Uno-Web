import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { registerSocketHandlers } from './socket/handlers';

export function createApp() {
  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  return app;
}

export function createHttpServer() {
  const app = createApp();
  const httpServer = createServer(app);
  const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
  const io = new Server(httpServer, {
    cors: {
      origin: clientOrigin,
      methods: ['GET', 'POST'],
    },
  });

  registerSocketHandlers(io);

  return { app, httpServer, io };
}
