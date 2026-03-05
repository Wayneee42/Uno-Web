import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, GameState } from '@uno-web/shared';
import { roomManager } from '../game/RoomManager';
import { gameManager } from '../game/GameManager';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerSocketHandlers(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    const emitError = (code: string, message: string) => {
      socket.emit('error', { code, message });
    };

    const endGameAndReturnToLobby = (roomId: string, reason: string) => {
      if (gameManager.getGame(roomId)) {
        gameManager.removeGame(roomId);
      }
      const roomInfo = roomManager.resetReady(roomId);
      if (roomInfo) {
        io.to(roomId).emit('roomUpdate', roomInfo);
      }
      io.to(roomId).emit('gameEnd', { reason });
    };

    socket.on('createRoom', (payload, callback) => {
      console.log(`Create room request from ${socket.id}: ${payload.playerName}`);
      const result = roomManager.createRoom(payload.playerName, socket.id);
      socket.join(result.room.roomId);
      callback(result.room);
    });

    socket.on('joinRoom', (payload, callback) => {
      console.log(`Join room request from ${socket.id}: ${payload.roomId} - ${payload.playerName}`);
      const result = roomManager.joinRoom(payload.roomId, payload.playerName, socket.id);
      if (result.success && result.room) {
        socket.join(payload.roomId);
        io.to(payload.roomId).emit('roomUpdate', result.room);
        socket.to(payload.roomId).emit('playerJoined', { id: socket.id, name: payload.playerName });
      } else if (!result.success) {
        emitError('JOIN_ROOM_FAILED', result.error ?? 'Failed to join room');
      }
      callback(result);
    });

    socket.on('leaveRoom', (callback) => {
      console.log(`Leave room request from ${socket.id}`);
      const roomId = roomManager.getRoomIdByPlayerId(socket.id);
      if (!roomId) {
        callback();
        return;
      }

      roomManager.leaveRoom(socket.id);
      socket.leave(roomId);
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
      callback();
    });

    socket.on('ready', (payload) => {
      console.log(`Ready request from ${socket.id}: ${payload.ready}`);
      const roomId = roomManager.getRoomIdByPlayerId(socket.id);
      if (roomId) {
        const roomInfo = roomManager.setReady(socket.id, payload.ready);
        if (roomInfo) {
          io.to(roomId).emit('roomUpdate', roomInfo);
        }
      }
    });

    socket.on('startGame', (_payload, callback) => {
      console.log(`Start game request from ${socket.id}`);
      if (!roomManager.canStartGame(socket.id)) {
        emitError('START_GAME_FAILED', 'Cannot start game');
        callback({ success: false, error: 'Cannot start game' });
        return;
      }

      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room) {
        emitError('START_GAME_FAILED', 'Room not found');
        callback({ success: false, error: 'Room not found' });
        return;
      }

      const players = Array.from(room.players.values());
      const gameState = gameManager.createGame(room.id, players, room.hostId);

      io.to(room.id).emit('gameStart');

      for (const player of players) {
        const clientState = gameManager.toClientGameState(gameState, player.id);
        io.to(player.socketId).emit('gameStateUpdate', clientState);
      }

      callback({ success: true });
    });

    socket.on('returnToLobby', (_payload, callback) => {
      console.log(`Return to lobby request from ${socket.id}`);
      const roomId = roomManager.getRoomIdByPlayerId(socket.id);
      if (!roomId) {
        emitError('RETURN_TO_LOBBY_FAILED', 'Not in a room');
        callback({ success: false, error: 'Not in a room' });
        return;
      }

      const room = roomManager.getRoomById(roomId);
      if (!room) {
        emitError('RETURN_TO_LOBBY_FAILED', 'Room not found');
        callback({ success: false, error: 'Room not found' });
        return;
      }

      if (room.hostId !== socket.id) {
        emitError('RETURN_TO_LOBBY_FAILED', 'Only the host can return to lobby');
        callback({ success: false, error: 'Only the host can return to lobby' });
        return;
      }

      endGameAndReturnToLobby(roomId, 'host_return');
      callback({ success: true });
    });

    socket.on('chooseDirection', (payload, callback) => {
      console.log(`Choose direction request from ${socket.id}: ${payload.direction}`);
      const roomId = roomManager.getRoomIdByPlayerId(socket.id);
      if (!roomId) {
        emitError('CHOOSE_DIRECTION_FAILED', 'Not in a game');
        callback({ success: false, error: 'Not in a game' });
        return;
      }

      const gameState = gameManager.getGame(roomId);
      if (!gameState) {
        emitError('CHOOSE_DIRECTION_FAILED', 'Game not found');
        callback({ success: false, error: 'Game not found' });
        return;
      }

      const result = gameManager.chooseDirection(gameState, socket.id, payload.direction);
      if (!result.success) {
        emitError('CHOOSE_DIRECTION_FAILED', result.error ?? 'Choose direction failed');
        callback(result);
        return;
      }

      broadcastGameState(io, roomId, gameState);
      callback({ success: true });
    });

    socket.on('playCard', (payload, callback) => {
      console.log(`Play card request from ${socket.id}: ${payload.cardId}`);
      const roomId = roomManager.getRoomIdByPlayerId(socket.id);
      if (!roomId) {
        emitError('PLAY_CARD_FAILED', 'Not in a game');
        callback({ success: false, error: 'Not in a game' });
        return;
      }

      const gameState = gameManager.getGame(roomId);
      if (!gameState) {
        emitError('PLAY_CARD_FAILED', 'Game not found');
        callback({ success: false, error: 'Game not found' });
        return;
      }

      const result = gameManager.playCard(gameState, socket.id, payload.cardId, payload.chosenColor);
      if (!result.success) {
        emitError('PLAY_CARD_FAILED', result.error ?? 'Play card failed');
        callback(result);
        return;
      }

      broadcastGameState(io, roomId, gameState);
      callback({ success: true });
    });

    socket.on('drawCard', (_payload, callback) => {
      console.log(`Draw card request from ${socket.id}`);
      const roomId = roomManager.getRoomIdByPlayerId(socket.id);
      if (!roomId) {
        emitError('DRAW_CARD_FAILED', 'Not in a game');
        callback({ success: false, error: 'Not in a game' });
        return;
      }

      const gameState = gameManager.getGame(roomId);
      if (!gameState) {
        emitError('DRAW_CARD_FAILED', 'Game not found');
        callback({ success: false, error: 'Game not found' });
        return;
      }

      const result = gameManager.drawCard(gameState, socket.id);
      if (!result.success) {
        emitError('DRAW_CARD_FAILED', result.error ?? 'Draw card failed');
        callback({ success: result.success, error: result.error });
        return;
      }

      broadcastGameState(io, roomId, gameState);
      callback({ success: true });
    });

    socket.on('endTurn', (_payload, callback) => {
      console.log(`End turn request from ${socket.id}`);
      const roomId = roomManager.getRoomIdByPlayerId(socket.id);
      if (!roomId) {
        emitError('END_TURN_FAILED', 'Not in a game');
        callback({ success: false, error: 'Not in a game' });
        return;
      }

      const gameState = gameManager.getGame(roomId);
      if (!gameState) {
        emitError('END_TURN_FAILED', 'Game not found');
        callback({ success: false, error: 'Game not found' });
        return;
      }

      const result = gameManager.endTurn(gameState, socket.id);
      if (!result.success) {
        emitError('END_TURN_FAILED', result.error ?? 'End turn failed');
        callback(result);
        return;
      }

      broadcastGameState(io, roomId, gameState);
      callback({ success: true });
    });

    socket.on('callUno', (_payload) => {
      console.log(`Call UNO request from ${socket.id}`);
      const roomId = roomManager.getRoomIdByPlayerId(socket.id);
      if (!roomId) return;

      const gameState = gameManager.getGame(roomId);
      if (!gameState) return;

      gameManager.callUno(gameState, socket.id);
      broadcastGameState(io, roomId, gameState);
    });

    socket.on('challenge', (payload, callback) => {
      console.log(`Challenge request from ${socket.id}: ${payload.challenge}`);
      const roomId = roomManager.getRoomIdByPlayerId(socket.id);
      if (!roomId) {
        emitError('CHALLENGE_FAILED', 'Not in a game');
        callback({ success: false, error: 'Not in a game' });
        return;
      }

      const gameState = gameManager.getGame(roomId);
      if (!gameState) {
        emitError('CHALLENGE_FAILED', 'Game not found');
        callback({ success: false, error: 'Game not found' });
        return;
      }

      const result = gameManager.handleChallenge(gameState, socket.id, payload.challenge);
      if (!result.success) {
        emitError('CHALLENGE_FAILED', result.error ?? 'Challenge failed');
        callback(result);
        return;
      }

      broadcastGameState(io, roomId, gameState);
      callback({ success: true });
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      const roomId = roomManager.getRoomIdByPlayerId(socket.id);
      if (!roomId) return;

      roomManager.leaveRoom(socket.id);
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
      io.to(roomId).emit('playerLeft', socket.id);
    });
  });
}

function broadcastGameState(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomId: string,
  gameState: GameState
): void {
  for (const player of gameState.players) {
    const clientState = gameManager.toClientGameState(gameState, player.id);
    io.to(player.socketId).emit('gameStateUpdate', clientState);
  }
}
