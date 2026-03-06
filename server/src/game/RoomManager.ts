import type { Player, RoomInfo } from '@uno-web/shared';

interface Room {
  id: string;
  players: Map<string, Player>;
  hostId: string;
  readyPlayers: Set<string>;
}

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
export const RECONNECT_GRACE_MS = 30_000;

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  getReconnectGraceMs(): number {
    return RECONNECT_GRACE_MS;
  }
  private playerRoomMap: Map<string, string> = new Map();
  private sessionPlayerMap: Map<string, string> = new Map();
  private socketPlayerMap: Map<string, string> = new Map();
  private disconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  generateRoomId(): string {
    return this.generateId(6, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
  }

  private generatePlayerId(): string {
    return `player_${this.generateId(12)}`;
  }

  private generateSessionId(): string {
    return `session_${this.generateId(24)}`;
  }

  private generateId(length: number, alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'): string {
    let result = '';
    for (let i = 0; i < length; i += 1) {
      result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return result;
  }

  createRoom(playerName: string, socketId: string): { room: RoomInfo; playerId: string; sessionId: string } {
    const roomId = this.generateRoomId();
    const playerId = this.generatePlayerId();
    const sessionId = this.generateSessionId();

    const player: Player = {
      id: playerId,
      sessionId,
      name: playerName,
      hand: [],
      status: 'waiting',
      hasCalledUno: false,
      socketId,
      connected: true,
    };

    const room: Room = {
      id: roomId,
      players: new Map([[playerId, player]]),
      hostId: playerId,
      readyPlayers: new Set(),
    };

    this.rooms.set(roomId, room);
    this.playerRoomMap.set(playerId, roomId);
    this.sessionPlayerMap.set(sessionId, playerId);
    this.socketPlayerMap.set(socketId, playerId);

    return {
      room: this.toRoomInfo(room),
      playerId,
      sessionId,
    };
  }

  joinRoom(roomId: string, playerName: string, socketId: string): { success: boolean; room?: RoomInfo; error?: string; playerId?: string; sessionId?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (room.players.size >= MAX_PLAYERS) {
      return { success: false, error: 'Room is full' };
    }

    const playerId = this.generatePlayerId();
    const sessionId = this.generateSessionId();
    const player: Player = {
      id: playerId,
      sessionId,
      name: playerName,
      hand: [],
      status: 'waiting',
      hasCalledUno: false,
      socketId,
      connected: true,
    };

    room.players.set(playerId, player);
    this.playerRoomMap.set(playerId, roomId);
    this.sessionPlayerMap.set(sessionId, playerId);
    this.socketPlayerMap.set(socketId, playerId);

    return {
      success: true,
      room: this.toRoomInfo(room),
      playerId,
      sessionId,
    };
  }

  getPlayerIdBySocketId(socketId: string): string | undefined {
    return this.socketPlayerMap.get(socketId);
  }

  getPlayerIdBySessionId(sessionId: string): string | undefined {
    return this.sessionPlayerMap.get(sessionId);
  }

  getPlayerById(playerId: string): Player | undefined {
    const roomId = this.playerRoomMap.get(playerId);
    if (!roomId) {
      return undefined;
    }
    return this.rooms.get(roomId)?.players.get(playerId);
  }

  getRoomByPlayerId(playerId: string): Room | undefined {
    const roomId = this.playerRoomMap.get(playerId);
    if (!roomId) return undefined;
    return this.rooms.get(roomId);
  }

  getRoomById(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRoomInfo(roomId: string): RoomInfo | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return this.toRoomInfo(room);
  }

  getRoomIdByPlayerId(playerId: string): string | undefined {
    return this.playerRoomMap.get(playerId);
  }

  setReady(playerId: string, ready: boolean): RoomInfo | null {
    const roomId = this.playerRoomMap.get(playerId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    if (ready) {
      room.readyPlayers.add(playerId);
    } else {
      room.readyPlayers.delete(playerId);
    }

    return this.toRoomInfo(room);
  }

  canStartGame(playerId: string): boolean {
    const roomId = this.playerRoomMap.get(playerId);
    if (!roomId) return false;

    const room = this.rooms.get(roomId);
    if (!room) return false;

    if (room.hostId !== playerId) return false;
    if (room.players.size < MIN_PLAYERS) return false;
    if (room.readyPlayers.size !== room.players.size) return false;
    if (Array.from(room.players.values()).some(player => !player.connected)) return false;

    return true;
  }

  markDisconnected(socketId: string): { roomId: string; playerId: string; playerName: string } | null {
    const playerId = this.socketPlayerMap.get(socketId);
    if (!playerId) {
      return null;
    }

    const roomId = this.playerRoomMap.get(playerId);
    if (!roomId) {
      this.socketPlayerMap.delete(socketId);
      return null;
    }

    const room = this.rooms.get(roomId);
    const player = room?.players.get(playerId);
    if (!room || !player) {
      this.socketPlayerMap.delete(socketId);
      return null;
    }

    player.connected = false;
    player.socketId = '';
    this.socketPlayerMap.delete(socketId);

    return { roomId, playerId, playerName: player.name };
  }

  resumeSession(sessionId: string, socketId: string): { success: boolean; room?: RoomInfo; roomId?: string; playerId?: string; playerName?: string; sessionId?: string; error?: string } {
    const playerId = this.sessionPlayerMap.get(sessionId);
    if (!playerId) {
      return { success: false, error: 'Session expired' };
    }

    const roomId = this.playerRoomMap.get(playerId);
    if (!roomId) {
      this.sessionPlayerMap.delete(sessionId);
      return { success: false, error: 'Room not found' };
    }

    const room = this.rooms.get(roomId);
    const player = room?.players.get(playerId);
    if (!room || !player) {
      this.sessionPlayerMap.delete(sessionId);
      return { success: false, error: 'Player not found' };
    }

    this.clearDisconnectTimer(playerId);
    player.connected = true;
    player.socketId = socketId;
    this.socketPlayerMap.set(socketId, playerId);

    return {
      success: true,
      room: this.toRoomInfo(room),
      roomId,
      playerId,
      playerName: player.name,
      sessionId: player.sessionId,
    };
  }

  startDisconnectTimer(playerId: string, onExpire: () => void): void {
    this.clearDisconnectTimer(playerId);
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(playerId);
      onExpire();
    }, RECONNECT_GRACE_MS);
    this.disconnectTimers.set(playerId, timer);
  }

  clearDisconnectTimer(playerId: string): void {
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }
  }

  leaveRoom(playerId: string): string | null {
    return this.removePlayer(playerId);
  }

  removePlayer(playerId: string): string | null {
    const roomId = this.playerRoomMap.get(playerId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    const player = room.players.get(playerId);
    if (player) {
      this.sessionPlayerMap.delete(player.sessionId);
      if (player.socketId) {
        this.socketPlayerMap.delete(player.socketId);
      }
    }

    this.clearDisconnectTimer(playerId);
    room.players.delete(playerId);
    room.readyPlayers.delete(playerId);
    this.playerRoomMap.delete(playerId);

    if (room.players.size === 0) {
      this.rooms.delete(roomId);
      return null;
    }

    if (room.hostId === playerId) {
      const newHost = room.players.keys().next().value;
      if (newHost) {
        room.hostId = newHost;
      }
    }

    return roomId;
  }

  resetReady(roomId: string): RoomInfo | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.readyPlayers.clear();
    return this.toRoomInfo(room);
  }

  private toRoomInfo(room: Room): RoomInfo {
    return {
      roomId: room.id,
      players: Array.from(room.players.values()).map(player => ({
        id: player.id,
        name: player.name,
        isReady: room.readyPlayers.has(player.id),
        isHost: player.id === room.hostId,
        connected: player.connected,
      })),
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      canStart:
        room.players.size >= MIN_PLAYERS &&
        room.readyPlayers.size === room.players.size &&
        Array.from(room.players.values()).every(player => player.connected),
    };
  }
}

export const roomManager = new RoomManager();

