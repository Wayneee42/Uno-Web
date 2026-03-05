import { AddressInfo } from 'net';
import { io as createClient } from 'socket.io-client';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createHttpServer } from '../server';
import type { RoomInfo } from '@uno-web/shared';

const waitForEvent = <T>(socket: ReturnType<typeof createClient>, event: string, timeoutMs = 5000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const connectSocket = (socket: ReturnType<typeof createClient>) =>
  new Promise<void>(resolve => socket.once('connect', () => resolve()));

describe('socket handlers', () => {
  const server = createHttpServer();
  let url = '';

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.httpServer.once('error', reject);
      server.httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.httpServer.address() as AddressInfo;
    url = `http://localhost:${address.port}`;
  }, 20000);

  afterAll(async () => {
    server.io.close();
    await new Promise<void>(resolve => server.httpServer.close(() => resolve()));
  }, 20000);

  it('creates room, joins players, and starts game', async () => {
    const host = createClient(url, { transports: ['websocket'] });
    const client2 = createClient(url, { transports: ['websocket'] });
    const client3 = createClient(url, { transports: ['websocket'] });

    try {
      await Promise.all([connectSocket(host), connectSocket(client2), connectSocket(client3)]);

      const room = await new Promise<RoomInfo>(resolve => {
        host.emit('createRoom', { playerName: 'Host' }, resolve);
      });

      await new Promise<void>(resolve => {
        client2.emit('joinRoom', { roomId: room.roomId, playerName: 'Bob' }, () => resolve());
      });

      await new Promise<void>(resolve => {
        client3.emit('joinRoom', { roomId: room.roomId, playerName: 'Cara' }, () => resolve());
      });

      host.emit('ready', { ready: true });
      client2.emit('ready', { ready: true });
      client3.emit('ready', { ready: true });

      await new Promise<void>(resolve => {
        const handler = (updated: RoomInfo) => {
          if (updated.canStart) {
            host.off('roomUpdate', handler);
            resolve();
          }
        };
        host.on('roomUpdate', handler);
      });

      const gameStartWaiters = [
        waitForEvent(host, 'gameStart'),
        waitForEvent(client2, 'gameStart'),
        waitForEvent(client3, 'gameStart'),
      ];

      const gameStateWaiters = [
        waitForEvent(host, 'gameStateUpdate'),
        waitForEvent(client2, 'gameStateUpdate'),
        waitForEvent(client3, 'gameStateUpdate'),
      ];

      const startResult = await new Promise<{ success: boolean }>(resolve => {
        host.emit('startGame', {}, resolve);
      });

      expect(startResult.success).toBe(true);

      await Promise.all(gameStartWaiters);
      await Promise.all(gameStateWaiters);

      const gameEndPromise = waitForEvent(host, 'gameEnd');
      const roomUpdatePromise = waitForEvent<RoomInfo>(host, 'roomUpdate');
      const returnResult = await new Promise<{ success: boolean }>(resolve => {
        host.emit('returnToLobby', {}, resolve);
      });

      expect(returnResult.success).toBe(true);
      await gameEndPromise;
      const updatedRoom = await roomUpdatePromise;
      expect(updatedRoom.canStart).toBe(false);
    } finally {
      host.disconnect();
      client2.disconnect();
      client3.disconnect();
    }
  }, 20000);
});
