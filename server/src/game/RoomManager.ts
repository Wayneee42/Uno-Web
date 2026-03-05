import type {
  Player,
  RoomInfo,
} from '@uno-web/shared';

interface Room {
  id: string;
  players: Map<string, Player>;
  hostId: string;
  readyPlayers: Set<string>;
}

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 4;

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private playerRoomMap: Map<string, string> = new Map();

  generateRoomId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  createRoom(playerName: string, socketId: string): { room: RoomInfo; playerId: string } {
    const roomId = this.generateRoomId();
    const playerId = socketId;

    const player: Player = {
      id: playerId,
      name: playerName,
      hand: [],
      status: 'waiting',
      hasCalledUno: false,
      socketId,
    };

    const room: Room = {
      id: roomId,
      players: new Map([[playerId, player]]),
      hostId: playerId,
      readyPlayers: new Set(),
    };

    this.rooms.set(roomId, room);
    this.playerRoomMap.set(playerId, roomId);

    return {
      room: this.toRoomInfo(room),
      playerId,
    };
  }

  joinRoom(roomId: string, playerName: string, socketId: string): { success: boolean; room?: RoomInfo; error?: string; playerId?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (room.players.size >= MAX_PLAYERS) {
      return { success: false, error: 'Room is full' };
    }

    const playerId = socketId;
    const player: Player = {
      id: playerId,
      name: playerName,
      hand: [],
      status: 'waiting',
      hasCalledUno: false,
      socketId,
    };

    room.players.set(playerId, player);
    this.playerRoomMap.set(playerId, roomId);

    return {
      success: true,
      room: this.toRoomInfo(room),
      playerId,
    };
  }

  leaveRoom(playerId: string): string | null {
    const roomId = this.playerRoomMap.get(playerId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

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

    return true;
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

  resetReady(roomId: string): RoomInfo | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.readyPlayers.clear();
    return this.toRoomInfo(room);
  }

  private toRoomInfo(room: Room): RoomInfo {
    return {
      roomId: room.id,
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        isReady: room.readyPlayers.has(p.id),
        isHost: p.id === room.hostId,
      })),
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      canStart: room.players.size >= MIN_PLAYERS && room.readyPlayers.size === room.players.size,
    };
  }
}

export const roomManager = new RoomManager();
