import { AddressInfo } from 'net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { io as createClient } from 'socket.io-client';
import type {
  ClientGameState,
  JoinRoomResponse,
  PlayerDisconnectedPayload,
  RoomInfo,
  SessionResponse,
} from '@uno-web/shared';
import { ERROR_CODES } from '@uno-web/shared';
import { gameManager } from '../game/GameManager';
import { createHttpServer } from '../server';

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

const emitAck = <T>(socket: ReturnType<typeof createClient>, event: string, payload: unknown = {}) =>
  new Promise<T>(resolve => {
    socket.emit(event, payload, resolve);
  });

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    server.io.close();
    await new Promise<void>(resolve => server.httpServer.close(() => resolve()));
  }, 20000);

  it('creates room, joins players, starts game, and returns to lobby', async () => {
    const host = createClient(url, { transports: ['websocket'] });
    const client2 = createClient(url, { transports: ['websocket'] });
    const client3 = createClient(url, { transports: ['websocket'] });

    try {
      await Promise.all([connectSocket(host), connectSocket(client2), connectSocket(client3)]);

      const created = await emitAck<SessionResponse>(host, 'createRoom', { playerName: 'Host' });
      const join2 = await emitAck<JoinRoomResponse>(client2, 'joinRoom', { roomId: created.room.roomId, playerName: 'Bob' });
      const join3 = await emitAck<JoinRoomResponse>(client3, 'joinRoom', { roomId: created.room.roomId, playerName: 'Cara' });

      expect(join2.success).toBe(true);
      expect(join3.success).toBe(true);

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

      const startSignals = [
        waitForEvent(host, 'gameStart'),
        waitForEvent(client2, 'gameStart'),
        waitForEvent(client3, 'gameStart'),
      ];
      const stateSignals = [
        waitForEvent<ClientGameState>(host, 'gameStateUpdate'),
        waitForEvent<ClientGameState>(client2, 'gameStateUpdate'),
        waitForEvent<ClientGameState>(client3, 'gameStateUpdate'),
      ];

      const startResult = await emitAck<{ success: boolean }>(host, 'startGame');
      expect(startResult.success).toBe(true);

      await Promise.all(startSignals);
      const [hostState] = await Promise.all(stateSignals);
      expect(hostState.eventLog.length).toBeGreaterThan(0);

      const gameEndPromise = waitForEvent(host, 'gameEnd');
      const roomUpdatePromise = waitForEvent<RoomInfo>(host, 'roomUpdate');
      const returnResult = await emitAck<{ success: boolean }>(host, 'returnToLobby');

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

  it('restores an in-progress game when a player reconnects with a saved session', async () => {
    const host = createClient(url, { transports: ['websocket'] });
    const client2 = createClient(url, { transports: ['websocket'] });
    const client3 = createClient(url, { transports: ['websocket'] });

    try {
      await Promise.all([connectSocket(host), connectSocket(client2), connectSocket(client3)]);

      const created = await emitAck<SessionResponse>(host, 'createRoom', { playerName: 'Host' });
      const join2 = await emitAck<JoinRoomResponse>(client2, 'joinRoom', { roomId: created.room.roomId, playerName: 'Bob' });
      const join3 = await emitAck<JoinRoomResponse>(client3, 'joinRoom', { roomId: created.room.roomId, playerName: 'Cara' });

      expect(join2.success).toBe(true);
      expect(join2.playerId).toBeTruthy();
      expect(join2.sessionId).toBeTruthy();
      expect(join3.success).toBe(true);

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

      const initialGameStartWaiters = [
        waitForEvent(host, 'gameStart'),
        waitForEvent(client2, 'gameStart'),
        waitForEvent(client3, 'gameStart'),
      ];
      const initialGameStateWaiters = [
        waitForEvent<ClientGameState>(host, 'gameStateUpdate'),
        waitForEvent<ClientGameState>(client2, 'gameStateUpdate'),
        waitForEvent<ClientGameState>(client3, 'gameStateUpdate'),
      ];

      const startResult = await emitAck<{ success: boolean }>(host, 'startGame');
      expect(startResult.success).toBe(true);
      await Promise.all(initialGameStartWaiters);
      await Promise.all(initialGameStateWaiters);

      const hostDisconnectNotice = waitForEvent<PlayerDisconnectedPayload>(host, 'playerDisconnected');
      const hostPausedState = waitForEvent<ClientGameState>(host, 'gameStateUpdate');
      client2.disconnect();

      const disconnectNotice = await hostDisconnectNotice;
      expect(disconnectNotice.playerId).toBe(join2.playerId);
      expect(disconnectNotice.graceMs).toBeGreaterThan(0);
      expect(disconnectNotice.expiresAt).toBeGreaterThan(Date.now());

      const pausedState = await hostPausedState;
      expect(pausedState.otherPlayers.find(player => player.id === join2.playerId)?.connected).toBe(false);

      const reconnectedClient = createClient(url, { transports: ['websocket'] });
      await connectSocket(reconnectedClient);

      const hostReconnectNotice = waitForEvent<{ playerId: string; name: string }>(host, 'playerReconnected');
      const restoredStatePromise = waitForEvent<ClientGameState>(reconnectedClient, 'gameStateUpdate');
      const hostResumedStatePromise = waitForEvent<ClientGameState>(host, 'gameStateUpdate');

      const resumeResult = await emitAck<{
        success: boolean;
        playerId?: string;
        sessionId?: string;
      }>(reconnectedClient, 'resumeSession', { sessionId: join2.sessionId! });

      expect(resumeResult.success).toBe(true);
      expect(resumeResult.playerId).toBe(join2.playerId);

      const reconnectNotice = await hostReconnectNotice;
      expect(reconnectNotice.playerId).toBe(join2.playerId);

      const restoredState = await restoredStatePromise;
      expect(restoredState.myPlayer.id).toBe(join2.playerId);
      expect(restoredState.myPlayer.connected).toBe(true);

      const hostResumedState = await hostResumedStatePromise;
      expect(hostResumedState.otherPlayers.find(player => player.id === join2.playerId)?.connected).toBe(true);

      reconnectedClient.disconnect();
    } finally {
      host.disconnect();
      client2.disconnect();
      client3.disconnect();
    }
  }, 20000);

  it('runs a multiplayer main flow and records event logs', async () => {
    const host = createClient(url, { transports: ['websocket'] });
    const client2 = createClient(url, { transports: ['websocket'] });
    const client3 = createClient(url, { transports: ['websocket'] });

    try {
      await Promise.all([connectSocket(host), connectSocket(client2), connectSocket(client3)]);

      const created = await emitAck<SessionResponse>(host, 'createRoom', { playerName: 'Host' });
      await emitAck<JoinRoomResponse>(client2, 'joinRoom', { roomId: created.room.roomId, playerName: 'Bob' });
      await emitAck<JoinRoomResponse>(client3, 'joinRoom', { roomId: created.room.roomId, playerName: 'Cara' });

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

      const startStatePromises = [
        waitForEvent<ClientGameState>(host, 'gameStateUpdate'),
        waitForEvent<ClientGameState>(client2, 'gameStateUpdate'),
        waitForEvent<ClientGameState>(client3, 'gameStateUpdate'),
      ];

      const startResult = await emitAck<{ success: boolean }>(host, 'startGame');
      expect(startResult.success).toBe(true);
      const startStates = await Promise.all(startStatePromises);

      const sockets = [host, client2, client3];
      const dealerSocketIndex = startStates.findIndex(state => state.myPlayerIndex === state.currentPlayerIndex);
      expect(dealerSocketIndex).toBeGreaterThanOrEqual(0);
      const dealerSocket = sockets[dealerSocketIndex];

      const directionStatePromises = [
        waitForEvent<ClientGameState>(host, 'gameStateUpdate'),
        waitForEvent<ClientGameState>(client2, 'gameStateUpdate'),
        waitForEvent<ClientGameState>(client3, 'gameStateUpdate'),
      ];

      const chooseDirectionResult = await emitAck<{ success: boolean; error?: string }>(dealerSocket, 'chooseDirection', { direction: 1 });
      expect(chooseDirectionResult.success).toBe(true);
      const statesAfterDirection = await Promise.all(directionStatePromises);

      const actingIndex = statesAfterDirection.findIndex(state => state.myPlayerIndex === state.currentPlayerIndex);
      expect(actingIndex).toBeGreaterThanOrEqual(0);
      const actingSocket = sockets[actingIndex];

      const drawStatePromise = waitForEvent<ClientGameState>(actingSocket, 'gameStateUpdate');
      const drawResult = await emitAck<{ success: boolean; error?: string }>(actingSocket, 'drawCard');
      expect(drawResult.success).toBe(true);

      const stateAfterDraw = await drawStatePromise;
      const hasDirectionLog = stateAfterDraw.eventLog.some(item => item.message.includes('direction'));
      const hasDrawLog = stateAfterDraw.eventLog.some(item => item.message.includes('drew'));
      expect(hasDirectionLog || hasDrawLog).toBe(true);
    } finally {
      host.disconnect();
      client2.disconnect();
      client3.disconnect();
    }
  }, 20000);

  it('starts a rematch from finished game state', async () => {
    const host = createClient(url, { transports: ['websocket'] });
    const client2 = createClient(url, { transports: ['websocket'] });
    const client3 = createClient(url, { transports: ['websocket'] });

    try {
      await Promise.all([connectSocket(host), connectSocket(client2), connectSocket(client3)]);

      const created = await emitAck<SessionResponse>(host, 'createRoom', { playerName: 'Host' });
      await emitAck<JoinRoomResponse>(client2, 'joinRoom', { roomId: created.room.roomId, playerName: 'Bob' });
      await emitAck<JoinRoomResponse>(client3, 'joinRoom', { roomId: created.room.roomId, playerName: 'Cara' });

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

      const initialStates = [
        waitForEvent<ClientGameState>(host, 'gameStateUpdate'),
        waitForEvent<ClientGameState>(client2, 'gameStateUpdate'),
        waitForEvent<ClientGameState>(client3, 'gameStateUpdate'),
      ];

      const startResult = await emitAck<{ success: boolean }>(host, 'startGame');
      expect(startResult.success).toBe(true);
      await Promise.all(initialStates);

      const state = gameManager.getGame(created.room.roomId);
      expect(state).toBeTruthy();
      if (!state) {
        throw new Error('Game state missing for rematch test.');
      }

      state.phase = 'finished';
      state.winnerId = state.players[0].id;
      state.isDraw = false;

      const rematchStartSignals = [
        waitForEvent(host, 'gameStart'),
        waitForEvent(client2, 'gameStart'),
        waitForEvent(client3, 'gameStart'),
      ];
      const rematchStateSignals = [
        waitForEvent<ClientGameState>(host, 'gameStateUpdate'),
        waitForEvent<ClientGameState>(client2, 'gameStateUpdate'),
        waitForEvent<ClientGameState>(client3, 'gameStateUpdate'),
      ];

      const playAgainResult = await emitAck<{ success: boolean; error?: string }>(host, 'playAgain');
      expect(playAgainResult.success).toBe(true);

      await Promise.all(rematchStartSignals);
      const [hostRematchState] = await Promise.all(rematchStateSignals);

      expect(hostRematchState.phase).toBe('playing');
      expect(hostRematchState.eventLog.some(item => item.message.includes('Game started'))).toBe(true);
    } finally {
      host.disconnect();
      client2.disconnect();
      client3.disconnect();
    }
  }, 20000);

  it('emits a normalized internal error when state broadcasting throws unexpectedly', async () => {
    const host = createClient(url, { transports: ['websocket'] });
    const client2 = createClient(url, { transports: ['websocket'] });
    const client3 = createClient(url, { transports: ['websocket'] });

    try {
      await Promise.all([connectSocket(host), connectSocket(client2), connectSocket(client3)]);

      const created = await emitAck<SessionResponse>(host, 'createRoom', { playerName: 'Host' });

      await emitAck<JoinRoomResponse>(client2, 'joinRoom', { roomId: created.room.roomId, playerName: 'Bob' });
      await emitAck<JoinRoomResponse>(client3, 'joinRoom', { roomId: created.room.roomId, playerName: 'Cara' });

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

      vi.spyOn(gameManager, 'toClientGameState').mockImplementationOnce(() => {
        throw new Error('broken state mapping');
      });

      const hostErrorPromise = waitForEvent<{ code: string; message: string }>(host, 'error');
      const startResult = await emitAck<{ success: boolean; error?: string }>(host, 'startGame');

      expect(startResult.success).toBe(false);
      expect(startResult.error).toBe('Failed to synchronize game state');

      const errorPayload = await hostErrorPromise;
      expect(errorPayload.code).toBe(ERROR_CODES.INTERNAL_ERROR);
      expect(errorPayload.message).toBe('Failed to synchronize game state.');
    } finally {
      host.disconnect();
      client2.disconnect();
      client3.disconnect();
    }
  }, 20000);
});
