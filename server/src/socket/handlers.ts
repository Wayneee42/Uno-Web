import {
  ERROR_CODES,
  type ErrorCode,
  type ErrorPayload,
  type GameState,
  type ServerToClientEvents,
  type ClientToServerEvents,
} from '@uno-web/shared';
import type { Server, Socket } from 'socket.io';
import { gameManager } from '../game/GameManager';
import { roomManager } from '../game/RoomManager';
import { logger, normalizeError } from '../utils/logger';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type Ack = ((response?: any) => void) | undefined;

type HandlerContext = {
  socketId: string;
  playerId?: string;
  roomId?: string;
};

export function registerSocketHandlers(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
  io.on('connection', (socket) => {
    logger.info('socket.connected', { socketId: socket.id });

    const getPlayerId = () => roomManager.getPlayerIdBySocketId(socket.id);
    const getRoomId = (playerId?: string) => (playerId ? roomManager.getRoomIdByPlayerId(playerId) : undefined);
    const getContext = (): HandlerContext => {
      const playerId = getPlayerId();
      return {
        socketId: socket.id,
        playerId,
        roomId: getRoomId(playerId),
      };
    };

    const emitError = (code: ErrorCode, message: string, context: Record<string, unknown> = {}) => {
      logger.warn('socket.business_error', {
        ...getContext(),
        code,
        message,
        ...context,
      });
      socket.emit('error', { code, message });
    };

    const emitInternalError = (ack?: Ack, event?: string) => {
      const message = 'Server encountered an unexpected error.';
      if (event) {
        logger.error('socket.internal_error_response', {
          ...getContext(),
          event,
          code: ERROR_CODES.INTERNAL_ERROR,
        });
      }
      socket.emit('error', { code: ERROR_CODES.INTERNAL_ERROR, message });
      ack?.({ success: false, error: message });
    };

    const safeOn = (eventName: string, handler: (...args: any[]) => void) => {
      (socket.on as any)(eventName, (...args: any[]) => {
        const ack = typeof args[args.length - 1] === 'function' ? (args[args.length - 1] as Ack) : undefined;
        try {
          handler(...args);
        } catch (error) {
          logger.error('socket.unhandled_handler_error', {
            ...getContext(),
            event: eventName,
            error: normalizeError(error),
          });
          emitInternalError(ack, eventName);
        }
      });
    };

    const emitRoomUpdate = (roomId: string) => {
      const roomInfo = roomManager.getRoomInfo(roomId);
      if (roomInfo) {
        logger.debug('socket.room_update', { roomId, playerCount: roomInfo.players.length });
        io.to(roomId).emit('roomUpdate', roomInfo);
      }
    };

    const endGameAndReturnToLobby = (roomId: string, reason: string) => {
      logger.info('game.return_to_lobby', { roomId, reason });
      if (gameManager.getGame(roomId)) {
        gameManager.removeGame(roomId);
      }
      const roomInfo = roomManager.resetReady(roomId);
      if (roomInfo) {
        io.to(roomId).emit('roomUpdate', roomInfo);
      }
      io.to(roomId).emit('gameEnd', { reason });
    };

    const startNewGame = (roomId: string, hostId: string): { success: boolean; error?: string } => {
      const room = roomManager.getRoomById(roomId);
      if (!room) {
        return { success: false, error: 'Room not found' };
      }

      const players = Array.from(room.players.values());
      const gameState = gameManager.createGame(room.id, players, hostId);

      io.to(room.id).emit('gameStart');
      if (!broadcastGameState(io, room.id, gameState)) {
        return { success: false, error: 'Failed to synchronize game state' };
      }

      return { success: true };
    };

    safeOn('createRoom', (payload, callback) => {
      logger.info('socket.create_room', { socketId: socket.id, playerName: payload.playerName });
      const result = roomManager.createRoom(payload.playerName, socket.id);
      socket.join(result.room.roomId);
      callback(result);
    });

    safeOn('joinRoom', (payload, callback) => {
      logger.info('socket.join_room', { socketId: socket.id, roomId: payload.roomId, playerName: payload.playerName });
      const result = roomManager.joinRoom(payload.roomId, payload.playerName, socket.id);
      if (result.success && result.room && result.playerId) {
        socket.join(payload.roomId);
        io.to(payload.roomId).emit('roomUpdate', result.room);
        socket.to(payload.roomId).emit('playerJoined', { playerId: result.playerId, name: payload.playerName });
      } else if (!result.success) {
        emitError(ERROR_CODES.JOIN_ROOM_FAILED, result.error ?? 'Failed to join room', { roomId: payload.roomId });
      }
      callback(result);
    });

    safeOn('resumeSession', (payload, callback) => {
      logger.info('socket.resume_session', { socketId: socket.id });
      const result = roomManager.resumeSession(payload.sessionId, socket.id);
      if (!result.success || !result.playerId || !result.roomId) {
        emitError(ERROR_CODES.RESUME_SESSION_FAILED, result.error ?? 'Failed to restore session');
        callback({ success: false, error: result.error ?? 'Failed to restore session' });
        return;
      }

      socket.join(result.roomId);
      const gameState = gameManager.getGame(result.roomId);
      if (gameState) {
        const player = gameState.players.find(item => item.id === result.playerId);
        if (player) {
          player.connected = true;
          player.socketId = socket.id;
        }
        if (!broadcastGameState(io, result.roomId, gameState)) {
          callback({ success: false, error: 'Failed to restore game state' });
          return;
        }
      } else if (result.room) {
        io.to(result.roomId).emit('roomUpdate', result.room);
      }

      socket.to(result.roomId).emit('playerReconnected', {
        playerId: result.playerId,
        name: result.playerName ?? 'Player',
      });

      callback({
        success: true,
        room: gameState ? undefined : result.room,
        gameState: gameState ? gameManager.toClientGameState(gameState, result.playerId) : undefined,
        playerId: result.playerId,
        sessionId: result.sessionId,
      });
    });

    safeOn('leaveRoom', (callback) => {
      logger.info('socket.leave_room', getContext());
      const playerId = getPlayerId();
      if (!playerId) {
        callback();
        return;
      }

      const roomId = roomManager.getRoomIdByPlayerId(playerId);
      if (!roomId) {
        callback();
        return;
      }

      roomManager.leaveRoom(playerId);
      const roomInfo = roomManager.getRoomInfo(roomId);
      if (roomInfo) {
        if (gameManager.getGame(roomId)) {
          endGameAndReturnToLobby(roomId, 'player_left');
        } else {
          io.to(roomId).emit('roomUpdate', roomInfo);
        }
      } else if (gameManager.getGame(roomId)) {
        gameManager.removeGame(roomId);
      }

      io.to(roomId).emit('playerLeft', playerId);
      callback();
    });

    safeOn('ready', (payload) => {
      logger.info('socket.ready', { ...getContext(), ready: payload.ready });
      const playerId = getPlayerId();
      if (!playerId) {
        return;
      }

      const roomId = roomManager.getRoomIdByPlayerId(playerId);
      if (roomId) {
        const roomInfo = roomManager.setReady(playerId, payload.ready);
        if (roomInfo) {
          io.to(roomId).emit('roomUpdate', roomInfo);
        }
      }
    });

    safeOn('startGame', (_payload, callback) => {
      logger.info('socket.start_game', getContext());
      const playerId = getPlayerId();
      if (!playerId || !roomManager.canStartGame(playerId)) {
        emitError(ERROR_CODES.START_GAME_FAILED, 'Cannot start game');
        callback({ success: false, error: 'Cannot start game' });
        return;
      }

      const room = roomManager.getRoomByPlayerId(playerId);
      if (!room) {
        emitError(ERROR_CODES.START_GAME_FAILED, 'Room not found');
        callback({ success: false, error: 'Room not found' });
        return;
      }

      const existing = gameManager.getGame(room.id);
      if (existing && existing.phase !== 'finished') {
        emitError(ERROR_CODES.START_GAME_FAILED, 'Game already in progress');
        callback({ success: false, error: 'Game already in progress' });
        return;
      }

      const result = startNewGame(room.id, room.hostId);
      if (!result.success) {
        callback({ success: false, error: result.error ?? 'Failed to start game' });
        return;
      }

      callback({ success: true });
    });

    safeOn('playAgain', (_payload, callback) => {
      logger.info('socket.play_again', getContext());
      const playerId = getPlayerId();
      if (!playerId) {
        emitError(ERROR_CODES.PLAY_AGAIN_FAILED, 'Not in a room');
        callback({ success: false, error: 'Not in a room' });
        return;
      }

      const roomId = roomManager.getRoomIdByPlayerId(playerId);
      if (!roomId) {
        emitError(ERROR_CODES.PLAY_AGAIN_FAILED, 'Not in a room');
        callback({ success: false, error: 'Not in a room' });
        return;
      }

      const room = roomManager.getRoomById(roomId);
      if (!room) {
        emitError(ERROR_CODES.PLAY_AGAIN_FAILED, 'Room not found');
        callback({ success: false, error: 'Room not found' });
        return;
      }

      if (room.hostId !== playerId) {
        emitError(ERROR_CODES.PLAY_AGAIN_FAILED, 'Only the host can start a rematch');
        callback({ success: false, error: 'Only the host can start a rematch' });
        return;
      }

      const existing = gameManager.getGame(roomId);
      if (!existing || existing.phase !== 'finished') {
        emitError(ERROR_CODES.PLAY_AGAIN_FAILED, 'Current game is not finished yet');
        callback({ success: false, error: 'Current game is not finished yet' });
        return;
      }

      if (Array.from(room.players.values()).some(player => !player.connected)) {
        emitError(ERROR_CODES.PLAY_AGAIN_FAILED, 'Cannot start rematch while a player is disconnected');
        callback({ success: false, error: 'Cannot start rematch while a player is disconnected' });
        return;
      }

      const result = startNewGame(roomId, room.hostId);
      if (!result.success) {
        callback({ success: false, error: result.error ?? 'Failed to start rematch' });
        return;
      }

      callback({ success: true });
    });

    safeOn('returnToLobby', (_payload, callback) => {
      logger.info('socket.return_to_lobby', getContext());
      const playerId = getPlayerId();
      if (!playerId) {
        emitError(ERROR_CODES.RETURN_TO_LOBBY_FAILED, 'Not in a room');
        callback({ success: false, error: 'Not in a room' });
        return;
      }

      const roomId = roomManager.getRoomIdByPlayerId(playerId);
      if (!roomId) {
        emitError(ERROR_CODES.RETURN_TO_LOBBY_FAILED, 'Not in a room');
        callback({ success: false, error: 'Not in a room' });
        return;
      }

      const room = roomManager.getRoomById(roomId);
      if (!room) {
        emitError(ERROR_CODES.RETURN_TO_LOBBY_FAILED, 'Room not found');
        callback({ success: false, error: 'Room not found' });
        return;
      }

      if (room.hostId !== playerId) {
        emitError(ERROR_CODES.RETURN_TO_LOBBY_FAILED, 'Only the host can return to lobby');
        callback({ success: false, error: 'Only the host can return to lobby' });
        return;
      }

      endGameAndReturnToLobby(roomId, 'host_return');
      callback({ success: true });
    });

    safeOn('chooseDirection', (payload, callback) => {
      logger.info('socket.choose_direction', { ...getContext(), direction: payload.direction });
      const playerId = getPlayerId();
      if (!playerId) {
        emitError(ERROR_CODES.CHOOSE_DIRECTION_FAILED, 'Not in a game');
        callback({ success: false, error: 'Not in a game' });
        return;
      }

      const roomId = roomManager.getRoomIdByPlayerId(playerId);
      if (!roomId) {
        emitError(ERROR_CODES.CHOOSE_DIRECTION_FAILED, 'Not in a game');
        callback({ success: false, error: 'Not in a game' });
        return;
      }

      const gameState = gameManager.getGame(roomId);
      if (!gameState) {
        emitError(ERROR_CODES.CHOOSE_DIRECTION_FAILED, 'Game not found');
        callback({ success: false, error: 'Game not found' });
        return;
      }

      const result = gameManager.chooseDirection(gameState, playerId, payload.direction);
      if (!result.success) {
        emitError(ERROR_CODES.CHOOSE_DIRECTION_FAILED, result.error ?? 'Choose direction failed');
        callback(result);
        return;
      }

      if (!broadcastGameState(io, roomId, gameState)) {
        callback({ success: false, error: 'Failed to synchronize game state' });
        return;
      }

      callback({ success: true });
    });

    safeOn('playCard', (payload, callback) => {
      logger.info('socket.play_card', { ...getContext(), cardId: payload.cardId, chosenColor: payload.chosenColor });
      const playerId = getPlayerId();
      if (!playerId) {
        emitError(ERROR_CODES.PLAY_CARD_FAILED, 'Not in a game');
        callback({ success: false, error: 'Not in a game' });
        return;
      }

      const roomId = roomManager.getRoomIdByPlayerId(playerId);
      if (!roomId) {
        emitError(ERROR_CODES.PLAY_CARD_FAILED, 'Not in a game');
        callback({ success: false, error: 'Not in a game' });
        return;
      }

      const gameState = gameManager.getGame(roomId);
      if (!gameState) {
        emitError(ERROR_CODES.PLAY_CARD_FAILED, 'Game not found');
        callback({ success: false, error: 'Game not found' });
        return;
      }

      const result = gameManager.playCard(gameState, playerId, payload.cardId, payload.chosenColor);
      if (!result.success) {
        emitError(ERROR_CODES.PLAY_CARD_FAILED, result.error ?? 'Play card failed');
        callback(result);
        return;
      }

      if (!broadcastGameState(io, roomId, gameState)) {
        callback({ success: false, error: 'Failed to synchronize game state' });
        return;
      }

      callback({ success: true });
    });

    safeOn('drawCard', (_payload, callback) => {
      logger.info('socket.draw_card', getContext());
      const playerId = getPlayerId();
      if (!playerId) {
        emitError(ERROR_CODES.DRAW_CARD_FAILED, 'Not in a game');
        callback({ success: false, error: 'Not in a game' });
        return;
      }

      const roomId = roomManager.getRoomIdByPlayerId(playerId);
      if (!roomId) {
        emitError(ERROR_CODES.DRAW_CARD_FAILED, 'Not in a game');
        callback({ success: false, error: 'Not in a game' });
        return;
      }

      const gameState = gameManager.getGame(roomId);
      if (!gameState) {
        emitError(ERROR_CODES.DRAW_CARD_FAILED, 'Game not found');
        callback({ success: false, error: 'Game not found' });
        return;
      }

      const result = gameManager.drawCard(gameState, playerId);
      if (!result.success) {
        emitError(ERROR_CODES.DRAW_CARD_FAILED, result.error ?? 'Draw card failed');
        callback({ success: false, error: result.error });
        return;
      }

      if (!broadcastGameState(io, roomId, gameState)) {
        callback({ success: false, error: 'Failed to synchronize game state' });
        return;
      }

      callback({ success: true });
    });

    safeOn('endTurn', (_payload, callback) => {
      logger.info('socket.end_turn', getContext());
      const playerId = getPlayerId();
      if (!playerId) {
        emitError(ERROR_CODES.END_TURN_FAILED, 'Not in a game');
        callback({ success: false, error: 'Not in a game' });
        return;
      }

      const roomId = roomManager.getRoomIdByPlayerId(playerId);
      if (!roomId) {
        emitError(ERROR_CODES.END_TURN_FAILED, 'Not in a game');
        callback({ success: false, error: 'Not in a game' });
        return;
      }

      const gameState = gameManager.getGame(roomId);
      if (!gameState) {
        emitError(ERROR_CODES.END_TURN_FAILED, 'Game not found');
        callback({ success: false, error: 'Game not found' });
        return;
      }

      const result = gameManager.endTurn(gameState, playerId);
      if (!result.success) {
        emitError(ERROR_CODES.END_TURN_FAILED, result.error ?? 'End turn failed');
        callback(result);
        return;
      }

      if (!broadcastGameState(io, roomId, gameState)) {
        callback({ success: false, error: 'Failed to synchronize game state' });
        return;
      }

      callback({ success: true });
    });

    safeOn('callUno', (_payload) => {
      logger.info('socket.call_uno', getContext());
      const playerId = getPlayerId();
      if (!playerId) {
        return;
      }

      const roomId = roomManager.getRoomIdByPlayerId(playerId);
      if (!roomId) {
        return;
      }

      const gameState = gameManager.getGame(roomId);
      if (!gameState) {
        return;
      }

      const result = gameManager.callUno(gameState, playerId);
      if (!result.success) {
        emitError(ERROR_CODES.CALL_UNO_FAILED, result.error ?? 'Call UNO failed');
        return;
      }

      broadcastGameState(io, roomId, gameState);
    });

    safeOn('challenge', (payload, callback) => {
      logger.info('socket.challenge', { ...getContext(), challenge: payload.challenge });
      const playerId = getPlayerId();
      if (!playerId) {
        emitError(ERROR_CODES.CHALLENGE_FAILED, 'Not in a game');
        callback({ success: false, error: 'Not in a game' });
        return;
      }

      const roomId = roomManager.getRoomIdByPlayerId(playerId);
      if (!roomId) {
        emitError(ERROR_CODES.CHALLENGE_FAILED, 'Not in a game');
        callback({ success: false, error: 'Not in a game' });
        return;
      }

      const gameState = gameManager.getGame(roomId);
      if (!gameState) {
        emitError(ERROR_CODES.CHALLENGE_FAILED, 'Game not found');
        callback({ success: false, error: 'Game not found' });
        return;
      }

      const result = gameManager.handleChallenge(gameState, playerId, payload.challenge);
      if (!result.success) {
        emitError(ERROR_CODES.CHALLENGE_FAILED, result.error ?? 'Challenge failed');
        callback(result);
        return;
      }

      if (!broadcastGameState(io, roomId, gameState)) {
        callback({ success: false, error: 'Failed to synchronize game state' });
        return;
      }

      callback({ success: true });
    });

    safeOn('disconnect', () => {
      logger.info('socket.disconnected', { socketId: socket.id });
      const disconnected = roomManager.markDisconnected(socket.id);
      if (!disconnected) {
        return;
      }

      const gameState = gameManager.getGame(disconnected.roomId);
      if (gameState) {
        const player = gameState.players.find(item => item.id === disconnected.playerId);
        if (player) {
          player.connected = false;
          player.socketId = '';
        }
        broadcastGameState(io, disconnected.roomId, gameState);
      } else {
        emitRoomUpdate(disconnected.roomId);
      }

      const graceMs = roomManager.getReconnectGraceMs();
      io.to(disconnected.roomId).emit('playerDisconnected', {
        playerId: disconnected.playerId,
        name: disconnected.playerName,
        graceMs,
        expiresAt: Date.now() + graceMs,
      });

      roomManager.startDisconnectTimer(disconnected.playerId, () => {
        logger.info('socket.disconnect_timeout', {
          playerId: disconnected.playerId,
          roomId: disconnected.roomId,
        });

        const roomId = roomManager.removePlayer(disconnected.playerId);
        if (!roomId) {
          if (gameManager.getGame(disconnected.roomId)) {
            gameManager.removeGame(disconnected.roomId);
          }
          return;
        }

        if (gameManager.getGame(roomId)) {
          endGameAndReturnToLobby(roomId, 'player_left');
        } else {
          emitRoomUpdate(roomId);
        }

        io.to(roomId).emit('playerLeft', disconnected.playerId);
      });
    });
  });
}

function broadcastGameState(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomId: string,
  gameState: GameState
): boolean {
  try {
    for (const player of gameState.players) {
      if (!player.connected || !player.socketId) {
        continue;
      }
      const clientState = gameManager.toClientGameState(gameState, player.id);
      io.to(player.socketId).emit('gameStateUpdate', clientState);
    }

    const roomInfo = roomManager.getRoomInfo(roomId);
    if (roomInfo) {
      io.to(roomId).emit('roomUpdate', roomInfo);
    }

    return true;
  } catch (error) {
    logger.error('socket.broadcast_failed', {
      roomId,
      error: normalizeError(error),
    });

    const payload: ErrorPayload = {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Failed to synchronize game state.',
    };
    io.to(roomId).emit('error', payload);
    return false;
  }
}
