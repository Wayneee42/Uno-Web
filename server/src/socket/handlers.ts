import {
  ERROR_CODES,
  type ErrorCode,
  type ErrorPayload,
  type GameState,
  type ServerToClientEvents,
  type ClientToServerEvents,
} from '@uno-web/shared';
import type { Server, Socket } from 'socket.io';
import { gameManager } from '../game/GameManager.js';
import { roomManager } from '../game/RoomManager.js';
import { historyService } from '../history/index.js';
import { logger, normalizeError } from '../utils/logger.js';
import {
  parseBoolean,
  parseCardColor,
  parseCardId,
  parseCursor,
  parseDirection,
  parseHistoryLimit,
  parseMatchId,
  parsePlayerName,
  parseRoomId,
  parseSessionId,
} from './validation.js';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type Ack = ((response?: any) => void) | undefined;

type HandlerContext = {
  socketId: string;
  profileId?: string;
  playerId?: string;
  roomId?: string;
};

export function registerSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
): void {
  const revokeProfileBySocketId = new Map<string, () => void>();

  io.on('connection', (socket) => {
    logger.info('socket.connected', { socketId: socket.id });
    let profileId: string | null = null;
    const revokeProfile = () => {
      profileId = null;
      socket.data.profileId = null;
      socket.emit('profileCredentialsRevoked');
    };
    revokeProfileBySocketId.set(socket.id, revokeProfile);

    const getPlayerId = () => roomManager.getPlayerIdBySocketId(socket.id);
    const getRoomId = (playerId?: string) =>
      playerId ? roomManager.getRoomIdByPlayerId(playerId) : undefined;
    const getContext = (): HandlerContext => {
      const playerId = getPlayerId();
      return {
        socketId: socket.id,
        profileId: profileId ?? undefined,
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

    const safeOn = (eventName: string, handler: (...args: any[]) => void | Promise<void>) => {
      (socket.on as any)(eventName, (...args: any[]) => {
        const ack =
          typeof args[args.length - 1] === 'function'
            ? (args[args.length - 1] as Ack)
            : undefined;
        Promise.resolve()
          .then(() => handler(...args))
          .catch(error => {
            logger.error('socket.unhandled_handler_error', {
              ...getContext(),
              event: eventName,
              error: normalizeError(error),
            });
            emitInternalError(ack, eventName);
          });
      });
    };

    const emitRoomUpdate = (roomId: string) => {
      const roomInfo = roomManager.getRoomInfo(roomId);
      if (roomInfo) {
        logger.debug('socket.room_update', { roomId, playerCount: roomInfo.players.length });
        io.to(roomId).emit('roomUpdate', roomInfo);
      }
    };

    const endGameAndReturnToLobby = (
      roomId: string,
      reason: string,
      historyReason:
        | 'player_exit'
        | 'disconnect_timeout'
        | 'host_abort'
        | 'server_error' = 'server_error',
      voluntaryPlayerId?: string
    ) => {
      logger.info('game.return_to_lobby', { roomId, reason });
      const gameState = gameManager.getGame(roomId);
      if (gameState) {
        if (gameState.phase === 'finished') {
          historyService.observeGame(gameState);
        } else {
          historyService.interruptGame(gameState, historyReason, voluntaryPlayerId);
        }
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
        endGameAndReturnToLobby(room.id, 'server_error', 'server_error');
        return { success: false, error: 'Failed to synchronize game state' };
      }

      return { success: true };
    };

    safeOn('initializeProfile', async (payload, callback) => {
      if (getPlayerId()) {
        callback({
          success: false,
          historyAvailable: historyService.isHistoryAvailable(),
          error: 'Cannot switch player profile while in a room',
        });
        return;
      }

      const recoveryCode = typeof payload?.recoveryCode === 'string'
        ? payload.recoveryCode
        : undefined;
      const result = await historyService.initializeProfile(recoveryCode);
      profileId = result.success && result.profile ? result.profile.id : null;
      socket.data.profileId = profileId;
      callback(result);
    });

    safeOn('rotateRecoveryCode', async (_payload, callback) => {
      if (!profileId || getPlayerId()) {
        callback({ success: false, error: 'Recovery code can only be rotated from the lobby' });
        return;
      }
      const rotatingProfileId = profileId;
      const result = await historyService.rotateRecoveryCode(rotatingProfileId);
      if (result.success) {
        for (const [socketId, revoke] of revokeProfileBySocketId) {
          if (
            socketId !== socket.id &&
            io.sockets.sockets.get(socketId)?.data.profileId === rotatingProfileId
          ) {
            revoke();
          }
        }
      }
      callback(result);
    });

    safeOn('getMatchHistory', async (payload, callback) => {
      if (!profileId) {
        callback({
          success: false,
          historyAvailable: false,
          error: 'Persistent player profile is unavailable',
        });
        return;
      }
      const result = await historyService.listMatches(
        profileId,
        parseHistoryLimit(payload?.limit),
        parseCursor(payload?.cursor)
      );
      callback({ success: true, ...result });
    });

    safeOn('getMatchDetails', async (payload, callback) => {
      if (!profileId) {
        callback({
          success: false,
          historyAvailable: false,
          error: 'Persistent player profile is unavailable',
        });
        return;
      }
      const matchId = parseMatchId(payload?.matchId);
      if (!matchId) {
        callback({
          success: false,
          historyAvailable: historyService.isHistoryAvailable(),
          error: 'Invalid match ID',
        });
        return;
      }
      const result = await historyService.getMatch(profileId, matchId);
      callback({
        success: Boolean(result.match),
        match: result.match ?? undefined,
        historyAvailable: result.historyAvailable,
        error: result.match ? undefined : 'Match not found',
      });
    });

    safeOn('getProfileStats', async (_payload, callback) => {
      if (!profileId) {
        callback({
          success: false,
          historyAvailable: false,
          error: 'Persistent player profile is unavailable',
        });
        return;
      }
      const result = await historyService.getProfileStats(profileId);
      callback({ success: true, ...result });
    });

    safeOn('createRoom', (payload, callback) => {
      const playerName = parsePlayerName(payload?.playerName);
      if (!playerName) {
        emitError(
          ERROR_CODES.CREATE_ROOM_FAILED,
          'Player name must be between 1 and 20 characters',
        );
        callback({ success: false, error: 'Invalid player name' });
        return;
      }
      logger.info('socket.create_room', { socketId: socket.id, playerName });
      const result = roomManager.createRoom(playerName, socket.id, profileId);
      if (!result.success || !result.room) {
        emitError(ERROR_CODES.CREATE_ROOM_FAILED, result.error ?? 'Failed to create room');
        callback(result);
        return;
      }
      historyService.updateProfileDisplayName(profileId, playerName);
      socket.join(result.room.roomId);
      callback(result);
    });

    safeOn('joinRoom', (payload, callback) => {
      const playerName = parsePlayerName(payload?.playerName);
      const roomId = parseRoomId(payload?.roomId);
      if (!playerName || !roomId) {
        emitError(
          ERROR_CODES.JOIN_ROOM_FAILED,
          'Enter a valid player name and 6-character room ID',
        );
        callback({ success: false, error: 'Invalid room ID or player name' });
        return;
      }
      logger.info('socket.join_room', { socketId: socket.id, roomId, playerName });
      const result = roomManager.joinRoom(roomId, playerName, socket.id, profileId);
      if (result.success && result.room && result.playerId) {
        historyService.updateProfileDisplayName(profileId, playerName);
        socket.join(roomId);
        io.to(roomId).emit('roomUpdate', result.room);
        socket.to(roomId).emit('playerJoined', { playerId: result.playerId, name: playerName });
      } else if (!result.success) {
        emitError(ERROR_CODES.JOIN_ROOM_FAILED, result.error ?? 'Failed to join room', { roomId });
      }
      callback(result);
    });

    safeOn('resumeSession', (payload, callback) => {
      logger.info('socket.resume_session', { socketId: socket.id });
      const sessionId = parseSessionId(payload?.sessionId);
      if (!sessionId) {
        callback({ success: false, error: 'Invalid session' });
        return;
      }
      const result = roomManager.resumeSession(sessionId, socket.id, profileId);
      if (!result.success || !result.playerId || !result.roomId) {
        emitError(ERROR_CODES.RESUME_SESSION_FAILED, result.error ?? 'Failed to restore session');
        callback({ success: false, error: result.error ?? 'Failed to restore session' });
        return;
      }

      if (result.replacedSocketId) {
        io.to(result.replacedSocketId).emit('sessionReplaced');
        io.sockets.sockets.get(result.replacedSocketId)?.disconnect(true);
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
        gameState: gameState
          ? gameManager.toClientGameState(gameState, result.playerId)
          : undefined,
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
          endGameAndReturnToLobby(roomId, 'player_left', 'player_exit', playerId);
        } else {
          io.to(roomId).emit('roomUpdate', roomInfo);
        }
      } else if (gameManager.getGame(roomId)) {
        const gameState = gameManager.getGame(roomId);
        if (gameState) {
          historyService.interruptGame(gameState, 'player_exit', playerId);
        }
        gameManager.removeGame(roomId);
      }

      io.to(roomId).emit('playerLeft', playerId);
      callback();
    });

    safeOn('ready', (payload) => {
      const ready = parseBoolean(payload?.ready);
      if (ready === null) {
        emitError(ERROR_CODES.INVALID_PAYLOAD, 'Ready state must be a boolean');
        return;
      }
      logger.info('socket.ready', { ...getContext(), ready });
      const playerId = getPlayerId();
      if (!playerId) {
        return;
      }

      const roomId = roomManager.getRoomIdByPlayerId(playerId);
      if (roomId) {
        const roomInfo = roomManager.setReady(playerId, ready);
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
        emitError(
          ERROR_CODES.PLAY_AGAIN_FAILED,
          'Cannot start rematch while a player is disconnected',
        );
        callback({ success: false, error: 'Cannot start rematch while a player is disconnected' });
        return;
      }

      historyService.observeGame(existing);
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

      endGameAndReturnToLobby(roomId, 'host_return', 'host_abort', playerId);
      callback({ success: true });
    });

    safeOn('chooseDirection', (payload, callback) => {
      const direction = parseDirection(payload?.direction);
      if (direction === null) {
        emitError(ERROR_CODES.INVALID_PAYLOAD, 'Direction must be clockwise or counterclockwise');
        callback({ success: false, error: 'Invalid direction' });
        return;
      }
      logger.info('socket.choose_direction', { ...getContext(), direction });
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

      const result = gameManager.chooseDirection(gameState, playerId, direction);
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
      const cardId = parseCardId(payload?.cardId);
      const chosenColor = parseCardColor(payload?.chosenColor);
      if (!cardId || (payload?.chosenColor !== undefined && !chosenColor)) {
        emitError(ERROR_CODES.INVALID_PAYLOAD, 'Invalid card or chosen color');
        callback({ success: false, error: 'Invalid card payload' });
        return;
      }
      logger.info('socket.play_card', { ...getContext(), cardId, chosenColor });
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

      const result = gameManager.playCard(gameState, playerId, cardId, chosenColor);
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
      const challenge = parseBoolean(payload?.challenge);
      if (challenge === null) {
        emitError(ERROR_CODES.INVALID_PAYLOAD, 'Challenge decision must be a boolean');
        callback({ success: false, error: 'Invalid challenge decision' });
        return;
      }
      logger.info('socket.challenge', { ...getContext(), challenge });
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

      const result = gameManager.handleChallenge(gameState, playerId, challenge);
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
      revokeProfileBySocketId.delete(socket.id);
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
          const abandonedGame = gameManager.getGame(disconnected.roomId);
          if (abandonedGame) {
            historyService.interruptGame(abandonedGame, 'disconnect_timeout');
            gameManager.removeGame(disconnected.roomId);
          }
          return;
        }

        if (gameManager.getGame(roomId)) {
          endGameAndReturnToLobby(roomId, 'player_left', 'disconnect_timeout');
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
  historyService.observeGame(gameState);
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
